import {Prisma} from '@prisma/client/extension';
import {Cache, createCache} from 'async-cache-dedupe';
import {ExtendedModel, PrismaRedisExtensionConfig} from './types';
import {
  autoCacheAction,
  customCacheAction,
  customUncacheAction,
  isAutoCacheEnabled,
  isCustomCacheEnabled,
  isCustomUncacheEnabled,
} from './utils';

export const PrismaRedisExtension = (config: PrismaRedisExtensionConfig) => {
  const {auto, cache: _cache, redis} = config;

  const cache = _cache instanceof Cache ? _cache : createCache(_cache);

  return Prisma.defineExtension({
    name: 'prisma-redis-cache',
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
            let stale;
            let ttl;
            if (typeof auto === 'object') {
              const model = auto.models?.find(m => m.model === options.model);
              ttl = model?.ttl ?? auto.ttl;
              stale = model?.stale ?? auto.stale;
            }

            return autoCacheAction({cache, redis, options, stale, ttl});
          }

          if (isCustomCacheEnabled({options}))
            return customCacheAction({cache, redis, options});

          if (isCustomUncacheEnabled({options}))
            return customUncacheAction({cache, redis, options});

          return query(args);
        },
      },
    },
  });
};
