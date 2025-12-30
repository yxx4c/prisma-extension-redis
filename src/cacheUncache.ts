import type {JsArgs, Operation} from '@prisma/client/runtime/client';
import {coalesceAsync} from 'promise-coalesce';
import type {getAutoKeyGen} from './cacheKey';
import {DEFAULT_CHUNK_SIZE, DEFAULT_MAX_CONCURRENT_BATCHES} from './constants';
import {createDebugLogger, noopLogger} from './debug';
import {
  type ActionCheckParams,
  type ActionParams,
  AUTO_OPERATIONS,
  type autoOperations,
  CACHE_OPERATIONS,
  type CacheContext,
  type CacheErrors,
  type CacheOptions,
  type DeletePatterns,
  type GetDataParams,
  type InternalCacheResult,
  type RedisCacheCommands,
  UNCACHE_OPERATIONS,
  type UncacheOptions,
} from './types';
import {validateCacheOptions} from './validation';

/**
 * Tracks in-flight background refresh operations to prevent duplicate
 * database queries when multiple concurrent requests hit stale cache.
 */
const backgroundRefreshes = new Map<string, Promise<void>>();

export const filterOperations =
  <T extends Operation[]>(...ops: T) =>
  (excluded?: Operation[]): T =>
    excluded ? (ops.filter(op => !excluded.includes(op)) as T) : ops;

/**
 * Deletes Redis keys matching the given patterns using SCAN and UNLINK.
 * Uses batching to handle large numbers of keys efficiently.
 *
 * @param params - The deletion parameters
 * @returns Array of promises that resolve when deletion is complete
 */
export const unlinkPatterns = ({
  patterns,
  redis,
  chunkSize = DEFAULT_CHUNK_SIZE,
  maxConcurrentBatches = DEFAULT_MAX_CONCURRENT_BATCHES,
}: DeletePatterns) =>
  patterns.map(
    pattern =>
      new Promise<boolean>(resolve => {
        const stream = redis.scanStream({match: pattern});
        const buffer: string[] = [];
        const activeBatches: Promise<
          [error: Error | null, result: unknown][] | null
        >[] = [];

        const execBatch = (keys: string[]) => {
          activeBatches.push(
            redis
              .pipeline()
              .unlink(...keys)
              .exec(),
          );
          return activeBatches.length >= maxConcurrentBatches
            ? activeBatches.shift()
            : Promise.resolve();
        };

        stream.on('data', (keys: string[]) => {
          buffer.push(...keys);
          while (buffer.length >= chunkSize)
            execBatch(buffer.splice(0, chunkSize));
        });

        stream.on('end', () => {
          if (buffer.length) execBatch(buffer.splice(0, buffer.length));
          Promise.all(activeBatches).then(() => resolve(true));
        });
      }),
  );

const commands: RedisCacheCommands = {
  JSON: {
    get: (redis, key) => redis.multi().call('JSON.GET', key).exec(),

    set: (redis, key, value, ttl) => {
      const multi = redis.multi().call('JSON.SET', key, '$', value);
      if (ttl && ttl !== Number.POSITIVE_INFINITY)
        multi.call('EXPIRE', key, ttl);

      return multi.exec();
    },
  },
  STRING: {
    get: (redis, key) => redis.multi().call('GET', key).exec(),

    set: (redis, key, value, ttl) => {
      const multi = redis.multi().call('SET', key, value);
      if (ttl && ttl !== Number.POSITIVE_INFINITY)
        multi.call('EXPIRE', key, ttl);

      return multi.exec();
    },
  },
};

/**
 * Converts an unknown error to an Error instance.
 */
const toError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(String(err));

/**
 * Retrieves data from cache or database with stale-while-revalidate support.
 *
 * @param params - The cache retrieval parameters
 * @returns Promise resolving to cached or fresh data with metadata
 */
export const getCache = async ({
  ttl,
  stale,
  config,
  key,
  redis,
  args: xArgs,
  query,
}: GetDataParams): Promise<InternalCacheResult> => {
  const {debug, metricsCollector, onError, onHit, onMiss, transformer, type} =
    config;
  const logger = debug ? createDebugLogger(debug) : noopLogger;
  const startTime = Date.now();

  logger.debug(`Cache lookup started`, {key, ttl, stale});

  if (!commands[type])
    throw new Error(
      'Incorrect CacheType provided! Supported values: JSON | STRING',
    );

  const command = commands[type];

  // Track errors during cache operations
  const errors: CacheErrors = {};

  const [[error, cached]] = (await command.get(redis, key)) ?? [];

  // Track cache read errors
  if (error) {
    errors.cacheRead = toError(error);
    logger.error(`Cache read error`, {key, error});
    if (metricsCollector) metricsCollector.recordError();
    if (onError) onError(error);
  }

  const timestamp = Date.now() / 1000;

  const args = {
    ...xArgs,
    cache: undefined,
    meta: undefined,
  };

  // Helper to create recache function with proper typing
  const createRecache = (): (() => Promise<InternalCacheResult>) => {
    return () => getCache({ttl, stale, config, key, redis, args, query});
  };

  // Helper to create uncache function
  const createUncache = (): (() => Promise<{deleted: number}>) => {
    return async () => {
      const deleted = await redis.del(key);
      return {deleted};
    };
  };

  // Helper to include errors in meta only if there are any
  const getErrorsMeta = (): CacheErrors | undefined =>
    Object.keys(errors).length > 0 ? errors : undefined;

  if (cached) {
    // Attempt to deserialize cached data
    let cacheContext: CacheContext;
    try {
      cacheContext = (transformer?.deserialize || JSON.parse)(cached as string);
    } catch (parseError) {
      // Deserialization failed - treat as cache miss
      errors.cacheRead = toError(parseError);
      logger.error(`Cache deserialization failed, treating as miss`, {
        key,
        error: parseError,
      });
      if (metricsCollector) metricsCollector.recordError();
      if (onError) onError(parseError);
      // Fall through to cache miss logic below by setting cached to null equivalent
      // We need to continue to the cache miss section
      if (onMiss) onMiss(key);

      const result = await query(args);

      const newCacheContext: CacheContext = {
        isCached: true,
        result,
        stale,
        timestamp,
        ttl,
      };

      try {
        await command.set(
          redis,
          key,
          (transformer?.serialize || JSON.stringify)(newCacheContext),
          ttl + stale,
        );
      } catch (writeError) {
        errors.cacheWrite = toError(writeError);
        if (metricsCollector) metricsCollector.recordError();
        if (onError) onError(writeError);
      }

      if (metricsCollector) metricsCollector.recordMiss(Date.now() - startTime);
      return {
        result,
        meta: {
          isCached: false,
          key,
          source: 'db',
          expiresAt: timestamp + ttl,
          staleUntil: timestamp + stale,
          cachedAt: timestamp,
          recache: createRecache(),
          uncache: createUncache(),
          errors: getErrorsMeta(),
        },
      };
    }

    if (onHit) onHit(key);

    const {
      isCached,
      result,
      stale: cacheStale,
      timestamp: cacheTime,
      ttl: cacheTtl,
    } = cacheContext;

    // Fresh cache - return immediately
    if (timestamp < cacheTime + cacheTtl) {
      logger.debug(`Cache hit (fresh)`, {
        key,
        age: Math.round(timestamp - cacheTime),
        ttl: cacheTtl,
      });
      if (metricsCollector) metricsCollector.recordHit(Date.now() - startTime);
      return {
        result,
        meta: {
          cachedAt: cacheTime,
          expiresAt: cacheTime + cacheTtl,
          isCached,
          key,
          recache: createRecache(),
          source: 'cache',
          staleUntil: cacheTime + cacheStale,
          uncache: createUncache(),
          errors: getErrorsMeta(),
        },
      };
    }

    // Stale cache - return stale data and trigger background refresh
    if (timestamp <= cacheTime + cacheStale) {
      logger.debug(`Cache hit (stale), triggering background refresh`, {
        key,
        age: Math.round(timestamp - cacheTime),
        ttl: cacheTtl,
        staleWindow: cacheStale,
      });
      // Use a unique key to track this specific background refresh
      const refreshKey = `refresh:${key}`;

      // Only start a background refresh if one isn't already in flight
      // This prevents duplicate DB queries when multiple concurrent requests
      // hit stale cache simultaneously
      if (!backgroundRefreshes.has(refreshKey)) {
        if (metricsCollector) metricsCollector.recordBackgroundRefresh();
        const refreshPromise = query(args)
          .then(async refreshResult => {
            const newCacheContext: CacheContext = {
              isCached: true,
              result: refreshResult,
              stale,
              timestamp,
              ttl,
            };
            await command.set(
              redis,
              key,
              (transformer?.serialize || JSON.stringify)(newCacheContext),
              ttl + stale,
            );
          })
          .catch(refreshError => {
            // Track background refresh error (note: this won't be in current response
            // since it's async, but it will be reported via onError)
            errors.backgroundRefresh = toError(refreshError);
            logger.error(`Background refresh failed`, {
              key,
              error: refreshError,
            });
            if (metricsCollector) metricsCollector.recordError();
            if (onError) onError(refreshError);
          })
          .finally(() => {
            // Clean up tracking once refresh completes (success or failure)
            backgroundRefreshes.delete(refreshKey);
          });

        backgroundRefreshes.set(refreshKey, refreshPromise);
      }

      if (metricsCollector)
        metricsCollector.recordStaleHit(Date.now() - startTime);
      return {
        result,
        meta: {
          isCached,
          key,
          source: 'stale-cache',
          expiresAt: cacheTime + cacheTtl,
          staleUntil: cacheTime + cacheStale,
          cachedAt: cacheTime,
          recache: createRecache(),
          uncache: createUncache(),
          errors: getErrorsMeta(),
        },
      };
    }
  }

  // Cache miss - query database and cache result
  logger.debug(`Cache miss, querying database`, {key});
  if (onMiss) onMiss(key);

  const result = await query(args);

  const newCacheContext: CacheContext = {
    isCached: true,
    result,
    stale,
    timestamp,
    ttl,
  };

  // Track cache write errors
  try {
    await command.set(
      redis,
      key,
      (transformer?.serialize || JSON.stringify)(newCacheContext),
      ttl + stale,
    );
  } catch (writeError) {
    errors.cacheWrite = toError(writeError);
    logger.error(`Cache write error`, {key, error: writeError});
    if (metricsCollector) metricsCollector.recordError();
    if (onError) onError(writeError);
  }

  logger.debug(`Cache populated`, {key, ttl, stale});
  if (metricsCollector) metricsCollector.recordMiss(Date.now() - startTime);
  return {
    result,
    meta: {
      isCached: false,
      key,
      source: 'db',
      expiresAt: timestamp + ttl,
      staleUntil: timestamp + stale,
      cachedAt: timestamp,
      recache: createRecache(),
      uncache: createUncache(),
      errors: getErrorsMeta(),
    },
  };
};

/**
 * Wraps getCache with promise coalescing to prevent duplicate database
 * queries when multiple identical requests arrive simultaneously.
 */
export const promiseCoalesceGetCache = ({
  key,
  ...rest
}: GetDataParams): Promise<InternalCacheResult> =>
  coalesceAsync(key, async () => getCache({key, ...rest}));

/**
 * Handles auto-caching for Prisma operations based on configuration.
 */
export const autoCacheAction = async (
  {redis, options, config}: ActionParams,
  getAutoKey: ReturnType<typeof getAutoKeyGen>,
): Promise<unknown | InternalCacheResult> => {
  const {auto} = config;

  const {args, model, operation, query} = options;

  const isAutoObject = typeof auto === 'object';

  const modelConfig = isAutoObject
    ? auto.models?.find(m => m.model === model)
    : null;

  const ttl = isAutoObject
    ? (modelConfig?.ttl ?? auto.ttl ?? config.ttl)
    : config.ttl;

  const stale = isAutoObject
    ? (modelConfig?.stale ?? auto.stale ?? config.stale)
    : config.stale;

  const key = getAutoKey({args, model, operation: operation as Operation});

  const wrapped = await promiseCoalesceGetCache({
    ttl,
    stale,
    config,
    key,
    redis,
    args,
    query,
  });

  const argsWithMeta = args as JsArgs & {meta?: boolean};
  const effectiveMeta = argsWithMeta.meta ?? false;
  return effectiveMeta ? wrapped : wrapped.result;
};

/**
 * Handles custom caching with user-specified cache key and options.
 */
export const customCacheAction = async ({
  redis,
  options: {args, query},
  config,
}: ActionParams): Promise<unknown | InternalCacheResult> => {
  const cacheOptions = args.cache as unknown as CacheOptions;

  // Validate cache options before proceeding
  validateCacheOptions(cacheOptions);

  const {key, ttl: customTtl, stale: customStale} = cacheOptions;

  const ttl = customTtl ?? config.ttl;
  const stale = customStale ?? config.stale;

  const wrapped = await promiseCoalesceGetCache({
    ttl,
    stale,
    config,
    key,
    redis,
    args,
    query,
  });

  const argsWithMeta = args as JsArgs & {meta?: boolean};
  const effectiveMeta = argsWithMeta.meta ?? false;
  return effectiveMeta ? wrapped : wrapped.result;
};

export const customUncacheAction = async ({
  redis,
  options: {args, query},
  config,
}: ActionParams) => {
  const {uncacheKeys, hasPattern} = args.uncache as unknown as UncacheOptions;

  if (hasPattern) {
    // Check if any key contains wildcard characters (* or ?)
    const hasWildcards = uncacheKeys.some(
      key => key.includes('*') || key.includes('?'),
    );

    if (hasWildcards) {
      // Use Redis SCAN with MATCH for pattern-based deletion
      const unlinkPromises = unlinkPatterns({
        redis,
        patterns: uncacheKeys,
        chunkSize: config.chunkSize,
      });
      await Promise.all(unlinkPromises);
    } else await redis.del(uncacheKeys);
  } else await redis.del(uncacheKeys);

  // Uncache operations should always return the plain Prisma result
  return await query({...args, uncache: undefined, meta: undefined});
};

export const isAutoCacheEnabled = ({
  auto,
  options: {args: xArgs, model, operation},
}: ActionCheckParams) => {
  if (typeof xArgs.cache === 'object') return false;

  if (xArgs.cache !== undefined && typeof xArgs.cache === 'boolean')
    return xArgs.cache;

  if (typeof auto === 'object')
    return (
      filterOperations(...AUTO_OPERATIONS)(auto.excludedOperations).includes(
        operation as autoOperations,
      ) &&
      !auto.excludedModels?.includes(model) &&
      !auto.models
        ?.find(m => m.model === model)
        ?.excludedOperations?.includes(operation as autoOperations)
    );

  if (auto) return AUTO_OPERATIONS.includes(operation as autoOperations);

  return false;
};

export const isCustomCacheEnabled = ({
  options: {args: xArgs, operation},
}: ActionCheckParams) =>
  !!xArgs.cache &&
  typeof xArgs.cache === 'object' &&
  CACHE_OPERATIONS.includes(operation as (typeof CACHE_OPERATIONS)[number]);

export const isCustomUncacheEnabled = ({
  options: {args: xArgs, operation},
}: ActionCheckParams) =>
  !!xArgs.uncache &&
  typeof xArgs.uncache === 'object' &&
  UNCACHE_OPERATIONS.includes(operation as (typeof UNCACHE_OPERATIONS)[number]);
