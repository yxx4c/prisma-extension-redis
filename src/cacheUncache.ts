import type {JsArgs, Operation} from '@prisma/client/runtime/client';
import type {getAutoKeyGen} from './cacheKey';
import {coalesce} from './coalesce';
import {DEFAULT_CHUNK_SIZE, DEFAULT_MAX_CONCURRENT_BATCHES} from './constants';
import {createDebugLogger, noopLogger} from './debug';
import {getServerClock, type RedisApi, resolveRedisApi} from './redisApi';
import {
  type ActionCheckParams,
  type ActionParams,
  AUTO_OPERATIONS,
  type autoOperations,
  CACHE_OPERATIONS,
  type CacheContext,
  type CacheErrors,
  type CacheOptions,
  type CacheSource,
  type CacheType,
  type DeletePatterns,
  type GetDataParams,
  type InternalCacheResult,
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
}: DeletePatterns) => {
  const {api} = resolveRedisApi(redis);

  return patterns.map(async pattern => {
    const buffer: string[] = [];
    const activeBatches: Promise<number>[] = [];

    const execBatch = (keys: string[]): Promise<unknown> => {
      activeBatches.push(api.unlink(keys));
      return activeBatches.length >= maxConcurrentBatches
        ? (activeBatches.shift() as Promise<number>)
        : Promise.resolve();
    };

    let cursor = '0';
    do {
      const page = await api.scan(cursor, pattern, chunkSize);
      cursor = page.cursor;
      buffer.push(...page.keys);
      while (buffer.length >= chunkSize) {
        await execBatch(buffer.splice(0, chunkSize));
      }
    } while (cursor !== '0');

    if (buffer.length) await execBatch(buffer.splice(0, buffer.length));
    await Promise.all(activeBatches);
    return true;
  });
};

type CacheCommandSet = {
  get: (api: RedisApi, key: string) => Promise<string | null>;
  set: (
    api: RedisApi,
    key: string,
    value: string,
    ttlSeconds: number,
  ) => Promise<unknown>;
};

const commands: Record<CacheType, CacheCommandSet> = {
  JSON: {
    get: (api, key) => api.jsonGet(key),
    set: (api, key, value, ttl) => api.jsonSet(key, value, ttl),
  },
  STRING: {
    get: (api, key) => api.get(key),
    set: (api, key, value, ttl) => api.set(key, value, ttl),
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
 * Timestamps come from a per-client ServerClock that periodically syncs
 * with the Redis server's TIME, so reads cost a single GET while staying
 * consistent across distributed nodes.
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
  clock,
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
  const {api} = resolveRedisApi(redis);
  const serverClock =
    clock ??
    getServerClock(api, error => {
      logger.warn(`Redis TIME sync failed; timestamps use the local clock`, {
        error: error.message,
      });
      if (onError) onError(error);
    });

  // Track errors during cache operations
  const errors: CacheErrors = {};

  const reportError = (
    field: keyof CacheErrors,
    error: unknown,
    message: string,
  ): void => {
    errors[field] = toError(error);
    logger.error(message, {key, error});
    if (metricsCollector) metricsCollector.recordError();
    if (onError) onError(error);
  };

  let cached: string | null = null;
  try {
    cached = await command.get(api, key);
  } catch (readError) {
    reportError('cacheRead', readError, `Cache read error`);
  }

  const timestamp = serverClock.nowSeconds();

  const args = {
    ...xArgs,
    cache: undefined,
    meta: undefined,
  };

  // recache must bypass the cached entry (a plain getCache would return
  // the still-fresh entry): query the database and overwrite the cache
  const createRecache = (): (() => Promise<InternalCacheResult>) => {
    return () => queryAndCache();
  };

  const createUncache = (): (() => Promise<{deleted: number}>) => {
    return async () => ({deleted: await api.del([key])});
  };

  const getErrorsMeta = (): CacheErrors | undefined =>
    Object.keys(errors).length > 0 ? errors : undefined;

  const buildMeta = (
    source: CacheSource,
    isCached: boolean,
    cachedAt: number,
    entryTtl: number,
    entryStale: number,
  ) => ({
    isCached,
    key,
    source,
    cachedAt,
    expiresAt: cachedAt + entryTtl,
    staleUntil: cachedAt + entryTtl + entryStale,
    recache: createRecache(),
    uncache: createUncache(),
    errors: getErrorsMeta(),
  });

  /**
   * Serializes and writes a result to the cache, stamping it with the
   * server time at write time. Returns the stamped timestamp.
   */
  const writeCache = async (result: unknown): Promise<number> => {
    const cachedAt = serverClock.nowSeconds();
    const newCacheContext: CacheContext = {
      isCached: true,
      result,
      stale,
      timestamp: cachedAt,
      ttl,
    };
    try {
      await command.set(
        api,
        key,
        (transformer?.serialize || JSON.stringify)(newCacheContext),
        ttl + stale,
      );
    } catch (writeError) {
      reportError('cacheWrite', writeError, `Cache write error`);
    }
    return cachedAt;
  };

  const queryAndCache = async (): Promise<InternalCacheResult> => {
    const result = await query(args);
    const cachedAt = await writeCache(result);
    logger.debug(`Cache populated`, {key, ttl, stale});
    if (metricsCollector) metricsCollector.recordMiss(Date.now() - startTime);
    return {
      result,
      meta: buildMeta('db', false, cachedAt, ttl, stale),
    };
  };

  if (cached) {
    // Attempt to deserialize cached data
    let cacheContext: CacheContext;
    try {
      cacheContext = (transformer?.deserialize || JSON.parse)(cached);
    } catch (parseError) {
      // Deserialization failed - treat as cache miss
      reportError(
        'cacheRead',
        parseError,
        `Cache deserialization failed, treating as miss`,
      );
      if (onMiss) onMiss(key);
      return queryAndCache();
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
        meta: buildMeta('cache', isCached, cacheTime, cacheTtl, cacheStale),
      };
    }

    // Stale cache - return stale data and trigger background refresh
    if (timestamp <= cacheTime + cacheTtl + cacheStale) {
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
            await writeCache(refreshResult);
          })
          .catch(refreshError => {
            // Track background refresh error (note: this won't be in current response
            // since it's async, but it will be reported via onError)
            reportError(
              'backgroundRefresh',
              refreshError,
              `Background refresh failed`,
            );
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
        meta: buildMeta(
          'stale-cache',
          isCached,
          cacheTime,
          cacheTtl,
          cacheStale,
        ),
      };
    }
  }

  // Cache miss - query database and cache result
  logger.debug(`Cache miss, querying database`, {key});
  if (onMiss) onMiss(key);
  return queryAndCache();
};

/**
 * Wraps getCache with promise coalescing to prevent duplicate database
 * queries when multiple identical requests arrive simultaneously.
 */
export const promiseCoalesceGetCache = ({
  key,
  ...rest
}: GetDataParams): Promise<InternalCacheResult> =>
  coalesce(key, () => getCache({key, ...rest}));

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
  const {api} = resolveRedisApi(redis);

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
    } else await api.del(uncacheKeys);
  } else await api.del(uncacheKeys);

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
