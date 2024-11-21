import micromatch from 'micromatch';

import type {Operation} from '@prisma/client/runtime/library';
import type Redis from 'iovalkey';

import {
  AUTO_OPERATIONS,
  type ActionCheckParams,
  type ActionParams,
  CACHE_OPERATIONS,
  type CacheOptions,
  type CacheType,
  type DeletePatterns,
  type GetDataParams,
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

export const setCache = async (
  type: CacheType,
  key: string,
  value: string,
  ttl: number | undefined,
  redis: Redis,
) => {
  switch (type) {
    case 'JSON': {
      if (ttl && ttl !== Number.POSITIVE_INFINITY)
        return redis
          .multi()
          .call('JSON.SET', key, '$', value)
          .call('EXPIRE', key, ttl)
          .exec();
      return redis.multi().call('JSON.SET', key, '$', value).exec();
    }

    case 'STRING': {
      if (ttl && ttl !== Number.POSITIVE_INFINITY)
        return redis
          .multi()
          .call('SET', key, value)
          .call('EXPIRE', key, ttl)
          .exec();
      return await redis.multi().call('SET', key, value).exec();
    }

    default:
      throw new Error(
        'Incorrect CacheType provided! Supported values: JSON | STRING',
      );
  }
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

  try {
    let cache: [error: Error | null, result: unknown][] | null = null;

    switch (type) {
      case 'JSON': {
        cache = await redis.multi().call('JSON.GET', key).exec();
        break;
      }

      case 'STRING': {
        cache = await redis.multi().call('GET', key).exec();
        break;
      }

      default:
        throw new Error(
          'Incorrect CacheType provided! Supported values: JSON | STRING',
        );
    }

    const [[error, cached]] = cache ?? [];

    if (onError && error) onError(error);

    const timestamp = Date.now();

    const args = {
      ...xArgs,
    };

    args.cache = undefined;

    if (cached) {
      if (onHit) onHit(key);
      const {
        result,
        ttl: cacheTtl,
        stale: cacheStale,
      } = (transformer?.deserialize || JSON.parse)(cached as string);

      if (timestamp < cacheTtl) return result;
      if (timestamp <= cacheStale) {
        query(args).then(result => {
          const cacheContext = {
            result,
            ttl: ttl * 1000 + timestamp,
            stale: (ttl + stale) * 1000 + timestamp,
          };

          const value = (transformer?.serialize || JSON.stringify)(
            cacheContext,
          );

          setCache(type, key, value, ttl + stale, redis);
        });
        return result;
      }
    } else if (onMiss) onMiss(key);

    const result = (await query(args)) as {isCached?: never};

    if (result.isCached)
      throw new Error(
        'Query result must not contain keyword `isCached` as a key!',
      );

    const cacheContext = {
      result: {
        ...result,
        isCached: true,
      },
      ttl: ttl * 1000 + timestamp,
      stale: (ttl + stale) * 1000 + timestamp,
    };

    const value = (transformer?.serialize || JSON.stringify)(cacheContext);

    setCache(type, key, value, ttl + stale, redis);

    return result;
  } catch (error) {
    if (onError) onError(error);
    else throw error;
  }
};

export const autoCacheAction = async (
  {redis, options, config}: ActionParams,
  getAutoKey: ReturnType<typeof getAutoKeyGen>,
) => {
  const {auto} = config;

  const {query, args, model, operation} = options;

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

  return await getCache({ttl, stale, config, key, redis, args, query});
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

  const stale = customStale ?? config.stale ?? 0;
  const ttl = customTtl ?? config.ttl ?? Number.POSITIVE_INFINITY;

  return await getCache({ttl, stale, config, key, redis, args, query});
};

export const customUncacheAction = async ({
  redis,
  options: {args, query},
  config,
}: ActionParams) => {
  const {onError} = config;

  try {
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
    } else {
      await redis.unlink(uncacheKeys);
    }
  } catch (error) {
    if (onError) onError(error);
  }

  return query({...args, uncache: undefined});
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
    return true;
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
