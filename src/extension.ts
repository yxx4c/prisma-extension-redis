import {Prisma} from '@prisma/client/extension';
import type {
  Operation as PrismaOperation,
} from '@prisma/client/runtime/library';

import {
  cacheAction,
  customCacheAction,
  customInvalidateAction,
  invalidateAction,
  isCustomCacheEnabled,
  isCustomInvalidateEnabled,
} from './invalidate';
import {
  getKey,
  getPatternGenerator,
  extractId,
} from './key';

import type {
  PrismaExtensionRedisOptions,
  ActionParams,
} from './types';

import {
  INVALIDATE_OPERATIONS,
  CACHE_OPERATIONS,
  type CacheContext,
} from './types';

export const PrismaExtensionRedis = (options: PrismaExtensionRedisOptions) => {
  const {config, provider} = options;
  const {key, autoInvalidate = true, defaultCache = true, logger, onError, transformer} = config;

  const {delimiter = ':', prefix = 'prisma'} = key ?? {};

  const getKeyPattern = getPatternGenerator(delimiter, prefix);

  return Prisma.defineExtension({
    name: 'prisma-extension-redis',
    client: {
      provider,
      getKeyPattern,
      getCacheKey: <T, O extends PrismaOperation>(params: {
        model: string;
        operation: O;
        args: Prisma.Args<T, O>;
      }) => getKey({...params, operation: params.operation as PrismaOperation, prefix, delimiter}),
    },
    model: {
      $allModels: {
        /**
         * Directly access the cached value for a query.
         * Constructs a cache key based on model and where clause.
         * Returns the deserialized cached data or null if not found/expired.
         */
        async cache<T, A>(
          this: T,
          args: Prisma.Args<T, 'findUnique'> | Prisma.Args<T, 'findFirst'>,
        ): Promise<Prisma.Result<T, A, 'findUnique'> | null> {
          const context = Prisma.getExtensionContext(this);
          if (!context || !context.$name) {
            console.error(
              'Could not determine model name for .cache() method.',
            );
            return null;
          }
          const key = getKey({
            model: context.$name,
            operation: 'findUnique',
            args,
            prefix,
            delimiter,
          });

          try {
            const cached = await provider.get(key);
            if (cached !== null) {
              const cachedString =
                typeof cached === 'string' ? cached : cached.toString('utf-8');
              const cacheContext: CacheContext = (
                transformer?.deserialize || JSON.parse
              )(cachedString);

              if (cacheContext && typeof cacheContext.timestamp === 'number' && typeof cacheContext.ttl === 'number') {
                const timestamp = Date.now() / 1000;
                if (timestamp < cacheContext.timestamp + cacheContext.ttl) {
                  return cacheContext.result as Prisma.Result<T, A, 'findUnique'>;
                }
              } else {
                if (logger) logger.warn({msg: `Invalid cache context structure for key ${key}. Missing timestamp or ttl.`, key});
                else console.warn(`Invalid cache context structure for key ${key}. Missing timestamp or ttl.`);
              }
            }
          } catch (err) {
            const errorMsg = `Error fetching from cache via .cache() for key ${key}:`;
            if (onError) onError({message: errorMsg, error: err, key, model: context.$name});
            else console.error(errorMsg, err);
          }
          return null;
        },

        /**
         * Manually invalidates cache entries.
         * Can accept a single key, an array of keys, or an object to generate a pattern.
         * Example: prisma.user.invalidate('user-id-123')
         * Example: prisma.user.invalidate(['key1', 'key2'])
         * Example: prisma.user.invalidate({ where: { email: 'a@b.com' } }) // Invalidates pattern based on where
         * Example: prisma.user.invalidate({ pattern: 'prefix:user:*:' })
         */
        async invalidate<T>(
          this: T,
          args: string | string[] | {pattern: string},
        ) {
          const context = Prisma.getExtensionContext(this);
          if (!context || !context.$name) {
            console.error(
              'Could not determine model name for .invalidate() method.',
            );
            return;
          }
          let usePattern = false;
          let keys: string[] = [];
          let pattern: string | null = null;

          if (typeof args === 'string') {
            keys = [args];
          } else if (Array.isArray(args)) {
            keys = args;
          } else if (typeof args === 'object' && args !== null && 'pattern' in args && typeof args.pattern === 'string') {
            pattern = args.pattern;
            usePattern = true;
          } else {
            console.error(
              'Invalid argument for .invalidate(). Expected string, string[], or { pattern: string }.',
            );
            return;
          }

          try {
            if (usePattern && pattern) {
              await provider.deletePattern(pattern);
              if (logger) {
                logger.debug({
                  msg: 'Manually invalidated pattern',
                  pattern,
                  model: context.$name,
                });
              }
            } else if (keys.length > 0) {
              await provider.delete(keys);
              if (logger) {
                logger.debug({
                  msg: 'Manually invalidated keys',
                  keys,
                  model: context.$name,
                });
              }
            }
          } catch (err) {
            const errorMsg = `Error during manual invalidation:`;
            if (onError) onError({message: errorMsg, error: err, keys: usePattern ? pattern : keys, model: context.$name});
            else console.error(errorMsg, err);
          }
        },
      } as Record<string, any>,
    },
    query: {
      $allModels: {
        async $allOperations({model, operation, args, query}): Promise<{ result: any, isCached: boolean }> {
          const actionParams: ActionParams = {options: {model, operation, args, query}, provider, config};
          const currentOperation = operation as PrismaOperation;
          const { defaultCache, autoInvalidate, logger, onError } = config;

          // 1. Handle Custom Invalidation
          if (isCustomInvalidateEnabled(actionParams)) {
            const result = await customInvalidateAction(actionParams);
            return result;
          }

          // 2. Handle Explicit Cache Disable (`cache: false`)
          if (args.cache === false) {
            const cleanArgs = {...args};
            delete cleanArgs.cache;
            const result = await query(cleanArgs);
            return { result, isCached: false };
          }

          const isReadOperation = CACHE_OPERATIONS.includes(currentOperation as (typeof CACHE_OPERATIONS)[number]);

          // 3. Handle Custom Cache Request (`cache: { key, ttl }`)
          const isCustomCache = isCustomCacheEnabled(actionParams);
          if (isReadOperation && isCustomCache) {
            // customCacheAction now returns { result, isCached }
            return await customCacheAction(actionParams);
          }

          // 4. Handle Default Cache Logic
          if (isReadOperation && defaultCache) {
            // cacheAction now returns { result, isCached }
            return await cacheAction(actionParams);
          }

          // 5. Default Behavior: Execute query directly
          const cleanArgs = {...args};
          delete cleanArgs.cache;
          delete cleanArgs.invalidate;
          const result = await query(cleanArgs);

          // 6. Handle Auto Invalidation (After the query)
          if (
            autoInvalidate && model &&
            INVALIDATE_OPERATIONS.includes(currentOperation as (typeof INVALIDATE_OPERATIONS)[number])
          ) {
            let keysOrPatternsToInvalidate: string[] = [];
            let isPattern = false;
            let specificInvalidation = false;
            const operationName = currentOperation;
            const globalPrefix = config.key?.prefix ?? 'prisma';
            const keyDelimiter = config.key?.delimiter ?? ':';

            if (
              (operationName === 'update' || operationName === 'delete' || operationName === 'upsert') &&
              args.where && typeof args.where === 'object'
            ) {
              const idPart = extractId(args.where); // Uses default '_' for internal compound ID joining
              if (idPart !== null) {
                keysOrPatternsToInvalidate = [
                  [globalPrefix, model, idPart, '*_*'].join(keyDelimiter),
                  [globalPrefix, model, '*_*'].join(keyDelimiter), // Also invalidate broader model pattern
                ];
                isPattern = true;
                specificInvalidation = true;
              }
            }

            if (keysOrPatternsToInvalidate.length === 0) {
              // e.g. for updateMany, deleteMany, or if idPart was null for some reason
              keysOrPatternsToInvalidate = [[globalPrefix, model, '*_*'].join(keyDelimiter)];
              isPattern = true;
            }
            keysOrPatternsToInvalidate = [...new Set(keysOrPatternsToInvalidate)];

            try {
              await invalidateAction(provider, keysOrPatternsToInvalidate, isPattern);

              if (logger) {
                logger.debug({
                  msg: specificInvalidation ? 'Auto-invalidated specific & model pattern' : 'Auto-invalidated model pattern',
                  pattern: keysOrPatternsToInvalidate.join(', '),
                  model,
                  operation: operationName,
                });
              }
            } catch (err) {
              const errorMsg = `Auto-invalidation failed for pattern(s) ${keysOrPatternsToInvalidate.join(', ')}:`;
              if (onError) onError({message: errorMsg, error: err, pattern: keysOrPatternsToInvalidate, model, operation: operationName});
              else console.error(errorMsg, err);
            }
          }

          // Return the result from step 5, wrapped with isCached: false
          return { result, isCached: false };
        },
      },
    },
  });
};
