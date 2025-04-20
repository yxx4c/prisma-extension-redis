import {Prisma} from '@prisma/client/extension';

import {
  autoCacheAction,
  customCacheAction,
  customInvalidateAction,
  isAutoCacheEnabled,
  isCustomCacheEnabled,
  isCustomInvalidateEnabled,
} from './invalidate';
import {getAutoKeyGen, getKeyGen, getKeyPatternGen} from './key';

import type {ExtendedModel, PrismaExtensionRedisOptions} from './types';
import type {CacheProvider} from './providers/interface';
import {IovalkeyCacheProvider} from './providers/iovalkey';
import {IoredisCacheProvider} from './providers/ioredis';
import {hash} from 'object-code';

import {
  INVALIDATE_OPERATIONS,
  CACHE_OPERATIONS,
  type CacheContext,
} from './types';

export const PrismaExtensionRedis = (options: PrismaExtensionRedisOptions) => {
  const {config, provider} = options;
  const {auto, cacheKey, autoInvalidate = true, defaultCache = true} = config;

  const {delimiter, case: cacheCase, prefix} = cacheKey ?? {};

  const getKey = getKeyGen(delimiter, cacheCase, prefix);
  const getAutoKey = getAutoKeyGen(getKey);
  const getKeyPattern = getKeyPatternGen(delimiter, cacheCase, prefix);

  return Prisma.defineExtension({
    name: 'prisma-extension-redis',
    client: {
      provider,
      getKey,
      getKeyPattern,
      getAutoKey,
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
          if (!context.$name) {
            console.error(
              'Could not determine model name for .cache() method.',
            );
            return null;
          }
          const key = getAutoKey({
            args,
            model: context.$name,
            operation: 'findUnique',
          });

          try {
            const cached = await provider.get(key);
            if (cached !== null) {
              const cachedString =
                typeof cached === 'string' ? cached : cached.toString('utf-8');
              const context: CacheContext = (
                config.transformer?.deserialize || JSON.parse
              )(cachedString);

              const timestamp = Date.now() / 1000;
              if (timestamp < context.timestamp + context.ttl) {
                return context.result as Prisma.Result<T, A, 'findUnique'>;
              }
            }
          } catch (err) {
            if (config.onError) config.onError(err);
            else console.error('Error fetching from cache via .cache():', err);
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
          if (!context.$name) {
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
          } else if (typeof args === 'object' && args !== null) {
            if ('pattern' in args && typeof args.pattern === 'string') {
              pattern = args.pattern;
              usePattern = true;
            } else {
              console.error(
                'Invalid argument for .invalidate(). Expected string, string[], or { pattern: string }.',
              );
              return;
            }
          }

          try {
            if (usePattern && pattern) {
              await provider.deletePattern(pattern);
              if (config.logger) {
                config.logger.debug({
                  msg: 'Manually invalidated pattern',
                  pattern,
                  model: context.$name,
                });
              }
            } else if (keys.length > 0) {
              await provider.delete(keys);
              if (config.logger) {
                config.logger.debug({
                  msg: 'Manually invalidated keys',
                  keys,
                  model: context.$name,
                });
              }
            }
          } catch (err) {
            if (config.onError) config.onError(err);
            else console.error('Error during manual invalidation:', err);
          }
        },
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      } as Record<string, any>,
    },
    query: {
      $allModels: {
        async $allOperations(options) {
          const {model, operation, args, query} = options;

          if (isCustomInvalidateEnabled({options})) {
            const result = await query({...args, invalidate: undefined});
            await customInvalidateAction({
              provider,
              options,
              config,
            });
            return {result};
          }

          const isReadOperation = !INVALIDATE_OPERATIONS.includes(
            // biome-ignore lint/suspicious/noExplicitAny: <explanation>
            operation as any,
          );
          const autoCacheEnabled = isAutoCacheEnabled({auto, options});
          const customCacheEnabled = isCustomCacheEnabled({options});
          const shouldCache =
            defaultCache || autoCacheEnabled || customCacheEnabled;

          if (isReadOperation && shouldCache && args.cache !== false) {
            if (
              autoCacheEnabled ||
              (defaultCache && args.cache === undefined)
            ) {
              return autoCacheAction(
                {
                  provider,
                  options,
                  config,
                },
                getAutoKey,
              );
            }
            if (customCacheEnabled) {
              return customCacheAction({
                provider,
                options,
                config,
              });
            }
          }

          const cleanArgs = {...args};
          cleanArgs.cache = undefined;
          cleanArgs.invalidate = undefined;

          const result = await query(cleanArgs);

          if (
            autoInvalidate &&
            // biome-ignore lint/suspicious/noExplicitAny: <explanation>
            INVALIDATE_OPERATIONS.includes(operation as any)
          ) {
            const pattern = getKeyPattern({
              params: [{prisma: model}, {glob: '*'}],
            });
            try {
              await provider.deletePattern(pattern);
              if (config.logger) {
                config.logger.debug({
                  msg: 'Auto-invalidated pattern',
                  pattern,
                  model,
                  operation,
                });
              }
            } catch (err) {
              if (config.onError) config.onError(err);
              else
                console.error(
                  `Auto-invalidation failed for pattern ${pattern}:`,
                  err,
                );
            }
          }

          return {
            result,
            isCached: false,
          };
        },
      },
    },
  });
};
