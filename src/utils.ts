import {Operation} from '@prisma/client/runtime/library';
import micromatch = require('micromatch');

import {
  ActionCheckParams,
  ActionParams,
  AUTO_OPERATIONS,
  autoOperations,
  CACHE_OPERATIONS,
  CacheDefinitionOptions,
  CacheOptions,
  DeletePatterns,
  UNCACHE_OPERATIONS,
  UncacheOptions,
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
      })
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

  delete args['cache'];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(cache as any)[model])
    cache!.define(
      model,
      {
        ttl,
        stale,
      },
      ({a, q}: CacheDefinitionOptions) => q(a)
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (cache as any)[model]({a: args, q: query});
};

export const customCacheAction = async ({
  redis,
  options: {args: xArgs, query},
}: ActionParams) => {
  const args = {
    ...xArgs,
  };

  delete args['cache'];

  const {key, ttl} = xArgs['cache'] as unknown as CacheOptions;

  const [[_, cached]] =
    (await redis.multi().call('JSON.GET', key).exec()) ?? [];

  if (cached) return JSON.parse(cached as string);

  const result = await query(args);
  const value = JSON.stringify(result);

  if (ttl && ttl !== Infinity)
    redis
      .multi()
      .call('JSON.SET', key, '$', value)
      .call('EXPIRE', key, ttl)
      .exec();
  else redis.multi().call('JSON.SET', key, '$', value).exec();

  return result;
};

export const customUncacheAction = async ({
  redis,
  options: {args: xArgs, query},
}: ActionParams) => {
  const args = {
    ...xArgs,
  };

  delete args['uncache'];

  const {uncacheKeys, hasPattern} = xArgs[
    'uncache'
  ] as unknown as UncacheOptions;

  if (hasPattern)
    await Promise.all([
      ...unlinkPatterns({
        redis,
        patterns: micromatch(uncacheKeys, ['*\\**', '*\\?*']),
      }),
      redis.unlink(micromatch(uncacheKeys, ['*', '!*\\**', '!*\\?*'])),
    ]);
  else await redis.unlink(uncacheKeys);

  return query(args);
};

export const isAutoCacheEnabled = ({
  auto,
  options: {args: xArgs, model, operation},
}: ActionCheckParams) => {
  if (xArgs['cache'] !== undefined && typeof xArgs['cache'] === 'boolean')
    return xArgs['cache'];
  if (auto)
    if (typeof auto === 'object')
      return (
        filterOperations(...AUTO_OPERATIONS)(auto.excludedOperations).includes(
          operation as autoOperations
        ) &&
        !auto.excludedModels?.includes(model) &&
        !auto.models
          ?.find(m => m.model === model)
          ?.excludedOperations?.includes(operation as autoOperations)
      );
    else return true;
  return false;
};

export const isCustomCacheEnabled = ({
  options: {args: xArgs, operation},
}: ActionCheckParams) =>
  !!xArgs['cache'] &&
  typeof xArgs['cache'] === 'object' &&
  CACHE_OPERATIONS.includes(operation as (typeof CACHE_OPERATIONS)[number]);

export const isCustomUncacheEnabled = ({
  options: {args: xArgs, operation},
}: ActionCheckParams) =>
  !!xArgs['uncache'] &&
  typeof xArgs['uncache'] === 'object' &&
  UNCACHE_OPERATIONS.includes(operation as (typeof UNCACHE_OPERATIONS)[number]);
