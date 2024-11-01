import type {Operation} from '@prisma/client/runtime/library';
import micromatch from 'micromatch';
import type Redis from 'ioredis';

import {
  AUTO_OPERATIONS,
  type ActionCheckParams,
  type ActionParams,
  CACHE_OPERATIONS,
  type CacheConfig,
  type CacheDefinitionOptions,
  type CacheOptions,
  type CacheType,
  type DeletePatterns,
  UNCACHE_OPERATIONS,
  type UncacheOptions,
  type autoOperations,
} from './types';

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

export const autoCacheAction = async ({
  cache,
  options: {args: xArgs, model, query},
  stale,
  ttl,
}: ActionParams) => {
  const args = {
    ...xArgs,
  };

  args.cache = undefined;

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  if (!(cache as any)[model])
    cache?.define(
      model,
      {
        ttl,
        stale,
      },
      ({a, q}: CacheDefinitionOptions) => q(a),
    );

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  return (cache as any)[model]({a: args, q: query});
};

export const getCache = async (
  type: CacheType | undefined,
  key: string,
  redis: Redis,
) => {
  if (!type) return await redis.multi().call('JSON.GET', key).exec();

  switch (type) {
    case 'JSON':
      return await redis.multi().call('JSON.GET', key).exec();

    case 'STRING':
      return await redis.multi().call('GET', key).exec();

    default:
      throw new Error(
        'Incorrect CacheType provided! Use known type value such as JSON | STRING. Default: JSON',
      );
  }
};

export const setCache = async (
  type: CacheType | undefined,
  key: string,
  value: string,
  ttl: number | undefined,
  redis: Redis,
) => {
  if (!type) {
    if (ttl && ttl !== Number.POSITIVE_INFINITY)
      return redis
        .multi()
        .call('JSON.SET', key, '$', value)
        .call('EXPIRE', key, ttl)
        .exec();
    return redis.multi().call('JSON.SET', key, '$', value).exec();
  }

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
        'Incorrect CacheType provided! Use known type value such as JSON | STRING. Default: JSON',
      );
  }
};

export const customCacheAction = async ({
  redis,
  options: {args: xArgs, query},
  config,
}: ActionParams & {config: CacheConfig | undefined}) => {
  const args = {
    ...xArgs,
  };

  args.cache = undefined;

  const {key, ttl} = xArgs.cache as unknown as CacheOptions;

  const [[_, cached]] = (await getCache(config?.type, key, redis)) ?? [];

  if (cached) {
    if (config?.onHit) config.onHit(key);
    return (config?.transformer?.deserialize || JSON.parse)(cached as string);
  }
  if (config?.onMiss) config.onMiss(key);

  const result = await query(args);
  const value = (config?.transformer?.serialize || JSON.stringify)(result);

  setCache(config?.type, key, value, ttl, redis);

  return result;
};

export const customUncacheAction = async ({
  redis,
  options: {args: xArgs, query},
}: ActionParams) => {
  const args = {
    ...xArgs,
  };

  args.uncache = undefined;

  const {uncacheKeys, hasPattern} = xArgs.uncache as unknown as UncacheOptions;

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

  return query(args);
};

export const isAutoCacheEnabled = ({
  auto,
  options: {args: xArgs, model, operation},
}: ActionCheckParams) => {
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
