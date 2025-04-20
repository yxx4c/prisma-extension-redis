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
  INVALIDATE_OPERATIONS,
  type InvalidateOptions,
  type AutoOperations,
} from './types';
import type {getAutoKeyGen} from './key';
import type {CacheProvider} from './providers/interface';

export const filterOperations =
  <T extends Operation[]>(...ops: T) =>
  (excluded?: Operation[]): T =>
    excluded ? (ops.filter(op => !excluded.includes(op)) as T) : ops;

export const unlinkPatterns = ({
  patterns,
  provider: cacheProvider,
}: DeletePatterns) =>
  patterns.map(pattern => cacheProvider.deletePattern(pattern));

export const getCache = async ({
  ttl,
  stale,
  config,
  key,
  provider,
  args: xArgs,
  query,
}: GetDataParams) => {
  const {onError, onHit, onMiss, transformer, type} = config;

  try {
    let cached: string | null | CacheContext['result'] = null;
    if (type === 'JSON') {
      cached = await provider.getJson<CacheContext['result']>(key);
    } else {
      cached = await provider.get(key);
    }

    const currentTimestamp = Date.now() / 1000;
    const args = {...xArgs, cache: undefined};

    if (cached !== null) {
      let context: CacheContext;

      if (type === 'JSON') {
        if (
          typeof cached === 'object' &&
          cached !== null &&
          'isCached' in cached
        ) {
          context = cached as CacheContext;
        } else {
          console.warn(
            "Cache provider's getJson did not return full context. Reconstructing partially.",
          );
          try {
            const raw = await provider.get(key);
            if (!raw)
              throw new Error(
                'Cache miss on raw get after JSON get returned partial data.',
              );
            const rawString =
              typeof raw === 'string' ? raw : raw.toString('utf-8');
            context = (transformer?.deserialize || JSON.parse)(rawString);
          } catch (parseError) {
            if (onError) onError(parseError);
            else
              console.error(
                'Failed to parse fallback raw string for JSON cache:',
                parseError,
              );
            const result = await query(args);
            return {result, isCached: false};
          }
        }
      } else {
        const cachedString =
          typeof cached === 'string' ? cached : cached.toString('utf-8');
        context = (transformer?.deserialize || JSON.parse)(cachedString);
      }

      if (onHit) onHit(key);

      const {isCached, result, stale, timestamp, ttl} = context;
      if (currentTimestamp < timestamp + ttl) {
        return {result, isCached};
      }

      if (currentTimestamp <= timestamp + stale) {
        query(args)
          .then(newResult => {
            const newTimestamp = Date.now() / 1000;
            const newContext: CacheContext = {
              isCached: true,
              key,
              result: newResult,
              stale,
              timestamp: newTimestamp,
              ttl,
            };
            const valueToSet = transformer?.serialize || JSON.stringify;

            if (type === 'JSON') {
              provider.setJson(key, newContext, ttl + stale);
            } else {
              provider.set(key, valueToSet(newContext), ttl + stale);
            }
          })
          .catch(err => {
            if (onError) onError(err);
            else console.error('Error revalidating cache in background:', err);
          });
        return {result, isCached};
      }
    }

    if (onMiss) onMiss(key);
    const result = await query(args);

    const newTimestamp = Date.now() / 1000;
    const context: CacheContext = {
      isCached: true,
      key,
      result,
      stale,
      timestamp: newTimestamp,
      ttl,
    };
    const valueToSet = transformer?.serialize || JSON.stringify;

    if (type === 'JSON') {
      await provider.setJson(key, context, ttl + stale);
    } else {
      await provider.set(key, valueToSet(context), ttl + stale);
    }

    return {result, isCached: false};
  } catch (error) {
    if (onError) onError(error);
    else console.error('Error during cache get/set operation:', error);

    const args = {...xArgs, cache: undefined};
    const result = await query(args);
    return {result, isCached: false};
  }
};

export const promiseCoalesceGetCache = ({key, ...rest}: GetDataParams) =>
  coalesceAsync(key, async () => getCache({key, ...rest}));

export const autoCacheAction = async (
  {provider, options, config}: ActionParams,
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
    provider,
    args,
    query,
  });
};

export const customCacheAction = async ({
  provider,
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
    provider,
    args,
    query,
  });
};

export const customInvalidateAction = async ({
  provider,
  options: {args, query},
  config,
}: ActionParams) => {
  const {invalidateKeys, hasPattern} =
    args.invalidate as unknown as InvalidateOptions;

  if (hasPattern) {
    const patterns = micromatch(invalidateKeys, ['*\\**', '*\\?*']);
    const plains = micromatch(invalidateKeys, ['*', '!*\\**', '!*\\?*']);

    const unlinkPromises = [
      ...unlinkPatterns({
        provider,
        patterns,
      }),
      ...(plains.length ? [provider.delete(plains)] : []),
    ];

    await Promise.all(unlinkPromises);
  } else await provider.delete(invalidateKeys);

  return {result: await query({...args, invalidate: undefined})};
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
        operation as AutoOperations,
      ) &&
      !auto.excludedModels?.includes(model) &&
      !auto.models
        ?.find(m => m.model === model)
        ?.excludedOperations?.includes(operation as AutoOperations)
    );

  if (auto) return AUTO_OPERATIONS.includes(operation as AutoOperations);

  return false;
};

export const isCustomCacheEnabled = ({
  options: {args: xArgs, operation},
}: ActionCheckParams) =>
  !!xArgs.cache &&
  typeof xArgs.cache === 'object' &&
  CACHE_OPERATIONS.includes(operation as (typeof CACHE_OPERATIONS)[number]);

export const isCustomInvalidateEnabled = ({
  options: {args: xArgs, operation},
}: ActionCheckParams) =>
  !!xArgs.invalidate &&
  typeof xArgs.invalidate === 'object' &&
  INVALIDATE_OPERATIONS.includes(
    operation as (typeof INVALIDATE_OPERATIONS)[number],
  );
