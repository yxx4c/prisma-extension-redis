import {Prisma} from '@prisma/client/extension';
import Redis from 'iovalkey';
import {getAutoKeyGen, getKeyGen, getKeyPatternGen} from './cacheKey';
import {
  autoCacheAction,
  customCacheAction,
  customUncacheAction,
  isAutoCacheEnabled,
  isCustomCacheEnabled,
  isCustomUncacheEnabled,
} from './cacheUncache';

import type {
  ExtendedModel,
  NonCachedMetaResult,
  PrismaExtensionRedisOptions,
} from './types';

export const PrismaExtensionRedis = (options: PrismaExtensionRedisOptions) => {
  const {
    config,
    config: {auto, cacheKey},
    client: redisOptions,
  } = options;

  const {delimiter, caseTransformer, prefix} = cacheKey ?? {};

  const redis = new Redis(redisOptions);

  const getKey = getKeyGen(delimiter, caseTransformer, prefix);
  const getAutoKey = getAutoKeyGen(getKey);
  const getKeyPattern = getKeyPatternGen(delimiter, caseTransformer, prefix);

  return Prisma.defineExtension({
    name: 'prisma-extension-redis',
    client: {
      redis,
      getKey,
      getKeyPattern,
      getAutoKey,
    },
    model: {
      $allModels: {} as ExtendedModel,
    },
    query: {
      $allModels: {
        async $allOperations(options) {
          const {args, query} = options;

          if (isAutoCacheEnabled({auto, options}))
            return autoCacheAction(
              {
                redis,
                options,
                config,
              },
              getAutoKey,
            );

          if (isCustomCacheEnabled({options}))
            return customCacheAction({
              redis,
              options,
              config,
            });

          if (isCustomUncacheEnabled({options}))
            return customUncacheAction({
              redis,
              options,
              config,
            });

          const result = await query({
            ...args,
            cache: undefined,
            meta: undefined,
          });

          // If meta is not requested, return plain result
          if (!args.meta) return result;

          // Return non-cached result with meta structure
          const nonCachedResult: NonCachedMetaResult = {
            result,
            meta: {
              cachedAt: 0,
              expiresAt: 0,
              isCached: false,
              key: '',
              recache: async () => nonCachedResult,
              source: 'db',
              staleUntil: 0,
              uncache: async () => ({deleted: 0}),
            },
          };
          return nonCachedResult;
        },
      },
    },
  });
};
