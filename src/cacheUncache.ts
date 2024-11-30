import micromatch from 'micromatch';
import {coalesceAsync} from 'promise-coalesce';

import type {Operation} from '@prisma/client/runtime/library';

import {
  AUTO_OPERATIONS,
  type ActionCheckParams,
  type ActionParams,
  CACHE_OPERATIONS,
  type CacheContext,
  type CacheOptions,
  type DeletePatterns,
  type GetDataParams,
  type RedisCacheCommands,
  UNCACHE_OPERATIONS,
  type UncacheOptions,
  type autoOperations,
} from './types';
import type {getAutoKeyGen} from './cacheKey';

export const filterOperations =
  <T extends Operation[]>(...ops: T) =>
  (excluded?: Operation[]): T =>
    excluded ? (ops.filter(op => !excluded.includes(op)) as T) : ops;

export const unlinkPatterns = ({patterns, redis}: DeletePatterns) =>
  patterns.map(
    pattern =>
      new Promise<boolean>(resolve => {
        const stream = redis.scanStream({
          match: pattern,
        });
        stream.on('data', (keys: string[]) => {
          if (keys.length) {
            const pipeline = redis.pipeline();
            pipeline.unlink(keys);
            pipeline.exec();
          }
        });
        stream.on('end', () => resolve(true));
      }),
  );

const commands: RedisCacheCommands = {
  JSON: {
    get: (redis, key) => redis.multi().call('JSON.GET', key).exec(),

    set: (redis, key, value, ttl) => {
      const multi = redis.multi().call('JSON.SET', key, '$', value);
      if (ttl && ttl !== Number.POSITIVE_INFINITY) {
        multi.call('EXPIRE', key, ttl);
      }
      return multi.exec();
    },
  },
  STRING: {
    get: (redis, key) => redis.multi().call('GET', key).exec(),

    set: (redis, key, value, ttl) => {
      const multi = redis.multi().call('SET', key, value);
      if (ttl && ttl !== Number.POSITIVE_INFINITY) {
        multi.call('EXPIRE', key, ttl);
      }
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
}: GetDataParams) => {
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
  };

  args.cache = undefined;

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

    if (timestamp < cacheTime + cacheTtl) return {result, isCached};

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

    return {result, isCached};
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

  return {result, isCached: false};
};

export const promiseCoalesceGetCache = ({key, ...rest}: GetDataParams) =>
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

  return await promiseCoalesceGetCache({
    ttl,
    stale,
    config,
    key,
    redis,
    args,
    query,
  });
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

  return await promiseCoalesceGetCache({
    ttl,
    stale,
    config,
    key,
    redis,
    args,
    query,
  });
};

export const customUncacheAction = async ({
  redis,
  options: {args, query},
  config,
}: ActionParams) => {
  const {uncacheKeys, hasPattern} = args.uncache as unknown as UncacheOptions;

  if (hasPattern) {
    const patternKeys = micromatch(uncacheKeys, ['*\\**', '*\\?*']);
    const plainKeys = micromatch(uncacheKeys, ['*', '!*\\**', '!*\\?*']);

    const unlinkPromises = [
      ...unlinkPatterns({
        redis,
        patterns: patternKeys,
      }),
      ...(plainKeys.length ? [redis.unlink(plainKeys)] : []),
    ];

    await Promise.all(unlinkPromises);
  } else await redis.unlink(uncacheKeys);

  return {result: await query({...args, uncache: undefined})};
};

export const isAutoCacheEnabled = ({
  auto,
  options: {args: xArgs, model, operation},
}: ActionCheckParams) => {
  if (typeof xArgs.cache === 'object') return false;

  if (xArgs.cache !== undefined && typeof xArgs.cache === 'boolean')
    return xArgs.cache;
  if (auto) {
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
    return AUTO_OPERATIONS.includes(operation as autoOperations);
  }
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
