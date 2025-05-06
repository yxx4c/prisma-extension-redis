import micromatch from 'micromatch';
import {coalesceAsync} from 'promise-coalesce';

import type {
  Operation as PrismaOperation,
} from '@prisma/client/runtime/library';

import {
  type ActionCheckParams,
  type ActionParams,
  CACHE_OPERATIONS,
  type CacheContext,
  type CacheOptions,
  type CacheProvider,
  type DeletePatterns,
  type GetDataParams,
  INVALIDATE_OPERATIONS,
  type InvalidateOptions,
} from './types';
import { getKey } from './key';

export const filterOperations =
  <T extends PrismaOperation[]>(...ops: T) =>
  (excluded?: PrismaOperation[]): T =>
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
}: GetDataParams): Promise<{ result: CacheContext['result'], isCached: boolean }> => {
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
            `Cache provider's getJson for key ${key} did not return full context. Attempting raw fetch.`,
          );
          try {
            const raw = await provider.get(key);
            if (!raw) throw new Error(`Cache miss on raw get for key ${key} after JSON get failed.`);
            const rawString = typeof raw === 'string' ? raw : raw.toString('utf-8');
            context = (transformer?.deserialize || JSON.parse)(rawString);
            if (!context || typeof context.timestamp !== 'number' || typeof context.ttl !== 'number' || typeof context.stale !== 'number') {
                throw new Error(`Parsed raw context for key ${key} is invalid.`);
            }
          } catch (parseError) {
            if (onError) onError({ message: `Failed to parse fallback raw string for JSON cache (key: ${key})`, error: parseError });
            else console.error(`Failed to parse fallback raw string for JSON cache (key: ${key}):`, parseError);
            const result = await query(args);
            return {result, isCached: false};
          }
        }
      } else {
        const cachedString =
          typeof cached === 'string' ? cached : cached.toString('utf-8');
        try {
            context = (transformer?.deserialize || JSON.parse)(cachedString);
            if (!context || typeof context.timestamp !== 'number' || typeof context.ttl !== 'number' || typeof context.stale !== 'number') {
                throw new Error(`Parsed string context for key ${key} is invalid.`);
            }
        } catch (parseError) {
            if (onError) onError({ message: `Failed to parse cache string for key ${key}`, error: parseError });
            else console.error(`Failed to parse cache string for key ${key}:`, parseError);
            const result = await query(args);
            return {result, isCached: false};
        }
      }

      if (onHit) onHit(key);

      const { result: cachedResult, stale: cacheStale, timestamp, ttl: cacheTtl } = context;

      if (currentTimestamp < timestamp + cacheTtl) {
        return {result: cachedResult, isCached: true};
      }

      if (currentTimestamp <= timestamp + cacheStale + cacheTtl) {
         const staleReturn = { result: cachedResult, isCached: true };

         query(args)
           .then(newResult => {
             const newTimestamp = Date.now() / 1000;
             const newContext: CacheContext = {
               isCached: true,
               key,
               result: newResult,
               stale: cacheStale,
               timestamp: newTimestamp,
               ttl: cacheTtl,
             };
             const valueToSet = transformer?.serialize || JSON.stringify;
             const expirySeconds = cacheTtl + cacheStale;

             if (type === 'JSON') {
                provider.setJson(key, newContext, expirySeconds);
             } else {
                provider.set(key, valueToSet(newContext), expirySeconds);
             }
           })
           .catch(err => {
             const errorMsg = `Error revalidating cache in background for key ${key}:`;
             if (onError) onError({ message: errorMsg, error: err, key });
             else console.error(errorMsg, err);
           });

         return staleReturn;
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
    const expirySeconds = ttl + stale;

    try {
        if (type === 'JSON') {
            await provider.setJson(key, context, expirySeconds);
        } else {
            await provider.set(key, valueToSet(context), expirySeconds);
        }
    } catch (setErr) {
        const errorMsg = `Error setting cache for key ${key}:`;
        if (onError) onError({ message: errorMsg, error: setErr, key });
        else console.error(errorMsg, setErr);
    }

    return {result, isCached: false};
  } catch (error) {
    const errorMsg = `Error during cache get/set operation for key ${key}:`;
    if (onError) onError({ message: errorMsg, error: error, key });
    else console.error(errorMsg, error);

    const args = {...xArgs, cache: undefined};
    const result = await query(args);
    return {result, isCached: false};
  }
};

export const promiseCoalesceGetCache = ({key, ...rest}: GetDataParams) =>
  coalesceAsync(key, async () => getCache({key, ...rest}));

export const cacheAction = async ({
  provider,
  options: { model, operation, args, query },
  config,
}: ActionParams): Promise<{ result: CacheContext['result'], isCached: boolean }> => {
  const { key: keyConfig, ttl, stale, onError } = config;
  const { prefix, delimiter } = keyConfig ?? {};

  if (!model) {
      const errorMsg = "Cannot generate cache key: model name is missing.";
      if (onError) onError({ message: errorMsg, operation, args });
      else console.error(errorMsg);
      const result = await query({...args, cache: undefined});
      return { result, isCached: false };
  }
  const key = getKey({ model, operation: operation as PrismaOperation, args, prefix, delimiter });

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
  options: { args, query },
  config,
}: ActionParams): Promise<{ result: CacheContext['result'], isCached: boolean }> => {
  const cacheOptions = args.cache as { key: string; ttl: number; stale?: number };
  const { key, ttl } = cacheOptions;
  const stale = cacheOptions.stale ?? config.stale;

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

export const invalidateAction = async (
  provider: CacheProvider,
  keys: string[],
  hasPattern?: boolean
): Promise<void> => {
  if (hasPattern) {
    const patterns = micromatch(keys, ['*\**', '*\?*']);
    const plains = micromatch(keys, ['*', '!*\**', '!*\?*']);

    const unlinkPromises: Promise<unknown>[] = [];

    if (patterns.length > 0) {
      unlinkPromises.push(...patterns.map(pattern => provider.deletePattern(pattern)));
    }

    if (plains.length > 0) {
      unlinkPromises.push(provider.delete(plains));
    }

    if (unlinkPromises.length > 0) {
      await Promise.all(unlinkPromises);
    }
  } else if (keys.length > 0) {
    await provider.delete(keys);
  }
};

export const customInvalidateAction = async ({
  provider,
  options: { model, operation, args, query },
  config,
}: ActionParams): Promise<{ result: CacheContext['result'], isCached: boolean }> => {
  const invalidateOptions = args.invalidate as unknown as InvalidateOptions;
  const { invalidateKeys, hasPattern } = invalidateOptions;
  const { logger, onError } = config;

  try {
      await invalidateAction(provider, invalidateKeys, hasPattern);

      if (logger) {
        logger.debug({
          msg: hasPattern ? 'Custom invalidated pattern(s)' : 'Custom invalidated key(s)',
          keys: invalidateKeys,
          model: model,
          operation: operation,
        });
      }
  } catch (err) {
      const errorMsg = `Error during custom invalidation:`;
      if (onError) onError({ message: errorMsg, error: err, keys: invalidateKeys, hasPattern, model, operation });
      else console.error(errorMsg, err);
  }

  const cleanArgs = { ...args };
  delete cleanArgs.invalidate;
  const result = await query(cleanArgs);
  return { result, isCached: false };
};

export const isCustomCacheEnabled = ({
  options: { args: xArgs, operation },
}: ActionCheckParams): boolean =>
  typeof xArgs.cache === 'object' &&
  xArgs.cache !== null &&
  typeof (xArgs.cache as any).key === 'string' &&
  typeof (xArgs.cache as any).ttl === 'number' &&
  CACHE_OPERATIONS.includes(operation as (typeof CACHE_OPERATIONS)[number]);

export const isCustomInvalidateEnabled = ({
  options: { args: xArgs, operation },
}: ActionCheckParams): boolean =>
  typeof xArgs.invalidate === 'object' &&
  xArgs.invalidate !== null &&
  'invalidateKeys' in xArgs.invalidate &&
  Array.isArray(xArgs.invalidate.invalidateKeys) &&
  INVALIDATE_OPERATIONS.includes(
    operation as (typeof INVALIDATE_OPERATIONS)[number],
  );
