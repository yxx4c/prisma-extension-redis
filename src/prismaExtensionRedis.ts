import {Prisma} from '@prisma/client/extension';
import {createCache} from 'async-cache-dedupe';
import type {ExtendedModel, PrismaExtensionRedisConfig} from './types';
import {
  autoCacheAction,
  customCacheAction,
  customUncacheAction,
  isAutoCacheEnabled,
  isCustomCacheEnabled,
  isCustomUncacheEnabled,
} from './utils';

export const PrismaExtensionRedis = (config: PrismaExtensionRedisConfig) => {
  const {redis} = config;

  const auto = 'auto' in config && 'cache' in config ? config.auto : undefined;
  const cacheConfig = 'cache' in config ? config.cache : undefined;
  const cache = cacheConfig ? createCache(cacheConfig) : undefined;

  return Prisma.defineExtension({
    name: 'prisma-extension-redis',
    client: {
      redis,
      cache,
    },
    model: {
      $allModels: {} as ExtendedModel,
    },
    query: {
      $allModels: {
        async $allOperations(options) {
          const {args, query} = options;

          if (isAutoCacheEnabled({auto, options})) {
            let stale = undefined;
            let ttl = undefined;
            if (typeof auto === 'object') {
              const model = auto.models?.find(m => m.model === options.model);
              ttl = model?.ttl ?? auto.ttl;
              stale = model?.stale ?? auto.stale;
            }

            return autoCacheAction({cache, redis, options, stale, ttl});
          }

          if (isCustomCacheEnabled({options}))
            return customCacheAction({
              redis,
              options,
              config: cacheConfig,
            });

          if (isCustomUncacheEnabled({options}))
            return customUncacheAction({redis, options});

          return query(args);
        },
      },
    },
  });
};
