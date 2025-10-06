import type {JsArgs, Operation} from '@prisma/client/runtime/library';
import {coalesceAsync} from 'promise-coalesce';
import type {getAutoKeyGen} from './cacheKey';
import {
  type ActionCheckParams,
  type ActionParams,
  AUTO_OPERATIONS,
  type autoOperations,
  CACHE_OPERATIONS,
  type CacheContext,
  type CacheOptions,
  type DeletePatterns,
  type GetDataParams,
  type RedisCacheCommands,
  UNCACHE_OPERATIONS,
  type UncacheOptions,
} from './types';

export const filterOperations =
  <T extends Operation[]>(...ops: T) =>
  (excluded?: Operation[]): T =>
    excluded ? (ops.filter(op => !excluded.includes(op)) as T) : ops;

export const unlinkPatterns = ({
  patterns,
  redis,
  chunkSize = 1000,
  maxConcurrentBatches = 5,
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

export const getCache = async ({
  ttl,
  stale,
  config,
  key,
  redis,
  args: xArgs,
  query,
}: GetDataParams): Promise<unknown> => {
  const {onError, onHit, onMiss, transformer, type} = config;

  if (!commands[type])
    throw new Error(
      'Incorrect CacheType provided! Supported values: JSON | STRING',
    );

  const command = commands[type];

  const [[error, cached]] = (await command.get(redis, key)) ?? [];

  if (onError && error) onError(error);

  const timestamp = Date.now() / 1000;

  const args = {
    ...xArgs,
    cache: undefined,
    meta: undefined,
  };

  if (cached) {
    if (onHit) onHit(key);
    const cacheContext: CacheContext = (transformer?.deserialize || JSON.parse)(
      cached as string,
    );

    const {
      isCached,
      result,
      stale: cacheStale,
      timestamp: cacheTime,
      ttl: cacheTtl,
    } = cacheContext;

    if (timestamp < cacheTime + cacheTtl)
      return {
        result,
        meta: {
          cachedAt: cacheTime,
          expiresAt: cacheTime + cacheTtl,
          isCached,
          key,
          recache: () =>
            getCache({
              ttl,
              stale,
              config,
              key,
              redis,
              args,
              query,
            }) as unknown as Promise<
              ReturnType<typeof promiseCoalesceGetCache>
            >,
          source: 'cache',
          staleUntil: cacheTime + cacheStale,
          uncache: () => redis.del(key).then(deleted => ({deleted})),
        },
      } as unknown as ReturnType<typeof promiseCoalesceGetCache>;

    if (timestamp <= cacheTime + cacheStale)
      query(args).then(result => {
        const cacheContext = {
          isCached: true,
          key,
          result,
          stale,
          timestamp,
          ttl,
        };
        command.set(
          redis,
          key,
          (transformer?.serialize || JSON.stringify)(cacheContext),
          ttl + stale,
        );
      });

    return {
      result,
      meta: {
        isCached,
        key,
        source: 'stale-cache',
        expiresAt: cacheTime + cacheTtl,
        staleUntil: cacheTime + cacheStale,
        cachedAt: cacheTime,
        recache: async () =>
          (await getCache({
            ttl,
            stale,
            config,
            key,
            redis,
            args,
            query,
          })) as unknown as ReturnType<typeof promiseCoalesceGetCache>,
        uncache: async () => {
          const deleted = await redis.del(key);
          return {deleted};
        },
      },
    } as unknown as ReturnType<typeof promiseCoalesceGetCache>;
  }

  if (!cached && onMiss) onMiss(key);

  const result = await query(args);

  const cacheContext = {isCached: true, key, result, stale, timestamp, ttl};
  command.set(
    redis,
    key,
    (transformer?.serialize || JSON.stringify)(cacheContext),
    ttl + stale,
  );

  return {
    result,
    meta: {
      isCached: false,
      key,
      source: 'db',
      expiresAt: timestamp + ttl,
      staleUntil: timestamp + stale,
      cachedAt: timestamp,
      recache: async () =>
        (await getCache({
          ttl,
          stale,
          config,
          key,
          redis,
          args,
          query,
        })) as unknown as ReturnType<typeof promiseCoalesceGetCache>,
      uncache: async () => {
        const deleted = await redis.del(key);
        return {deleted};
      },
    },
  } as unknown as ReturnType<typeof promiseCoalesceGetCache>;
};

export const promiseCoalesceGetCache = ({
  key,
  ...rest
}: GetDataParams): Promise<unknown> =>
  coalesceAsync(key, async () => getCache({key, ...rest}));

export const autoCacheAction = async (
  {redis, options, config}: ActionParams,
  getAutoKey: ReturnType<typeof getAutoKeyGen>,
) => {
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
  return effectiveMeta ? wrapped : (wrapped as {result: unknown}).result;
};

export const customCacheAction = async ({
  redis,
  options: {args, query},
  config,
}: ActionParams) => {
  const {
    key,
    ttl: customTtl,
    stale: customStale,
  } = args.cache as unknown as CacheOptions;

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
  return effectiveMeta ? wrapped : (wrapped as {result: unknown}).result;
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
