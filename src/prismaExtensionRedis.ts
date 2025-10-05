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

import type {ExtendedModel, PrismaExtensionRedisOptions} from './types';

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

          if (!args.meta) return result;
          return {
            result,
            meta: {
              cachedAt: 0,
              expiresAt: 0,
              isCached: false,
              key: '',
              recache: async () =>
                ({result, meta: {isCached: false}}) as unknown as {
                  result: unknown;
                  meta: {isCached: boolean};
                },
              source: 'db',
              staleUntil: 0,
              uncache: async () => ({deleted: 0}),
            },
          } as unknown as {
            result: unknown;
            meta: {isCached: boolean};
          };
        },
      },
    },
  });
};
