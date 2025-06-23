import {Prisma} from '@prisma/client/extension';
import Redis from 'iovalkey';

import {
  autoCacheAction,
  customCacheAction,
  customUncacheAction,
  isAutoCacheEnabled,
  isCustomCacheEnabled,
  isCustomUncacheEnabled,
	uncacheAction
} from './cacheUncache';
import {getAutoKeyGen, getKeyGen, getKeyPatternGen} from './cacheKey';

import type {ExtendedModel, PrismaExtensionRedisOptions, UncacheOptions} from './types';

export const PrismaExtensionRedis = (options: PrismaExtensionRedisOptions) => {
  const {
    config,
    config: {auto, cacheKey},
    client: redisOptions,
  } = options;

  const {delimiter, case: cacheCase, prefix} = cacheKey ?? {};

  const redis = new Redis(redisOptions);

  const getKey = getKeyGen(delimiter, cacheCase, prefix);
  const getAutoKey = getAutoKeyGen(getKey);
  const getKeyPattern = getKeyPatternGen(delimiter, cacheCase, prefix);
  const uncache = (args: UncacheOptions) => uncacheAction(redis, args)

  return Prisma.defineExtension({
    name: 'prisma-extension-redis',
    client: {
      redis,
      getKey,
      getKeyPattern,
      getAutoKey,
	  uncache
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

          return await query({...args, cache: undefined})
        },
      },
    },
  });
};
