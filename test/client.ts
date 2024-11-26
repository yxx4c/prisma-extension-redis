import {PrismaClient} from '@prisma/client';
import {
  type AutoCacheConfig,
  type CacheConfig,
  PrismaExtensionRedis,
  type RedisOptions,
} from '../src';

const client = process.env.REDIS_SERVICE_URI as RedisOptions;

const auto: AutoCacheConfig = {
  excludedModels: ['Post'],
  excludedOperations: ['findFirst'],
  models: [
    {
      model: 'User',
      excludedOperations: [],
      ttl: 120,
      stale: 30,
    },
  ],
  ttl: 30,
};

const config: CacheConfig = {
  ttl: 60,
  stale: 30,
  auto,
  type: 'STRING',
};

export const prisma = new PrismaClient();

export const extendedPrismaWithJsonAndCustomAutoCache = prisma.$extends(
  PrismaExtensionRedis({config, client}),
);

export const extendedPrisma = extendedPrismaWithJsonAndCustomAutoCache;

export const extendedPrismaWithJsonAndAutoCacheTrue = prisma.$extends(
  PrismaExtensionRedis({
    config: {
      ...config,
      auto: true,
    },
    client,
  }),
);

export const extendedPrismaWithStringAndCustomAutoCache = prisma.$extends(
  PrismaExtensionRedis({
    config: {
      ...config,
      type: 'STRING',
    },
    client,
  }),
);

export const extendedPrismaWithStringAndAutoCacheTrue = prisma.$extends(
  PrismaExtensionRedis({
    config: {
      ...config,
      type: 'STRING',
      auto: true,
    },
    client,
  }),
);

export const extendedPrismaWithInvalidCacheType = prisma.$extends(
  PrismaExtensionRedis({
    config: {
      ...config,
      // @ts-ignore: Intnetionally using invalid type for testing
      type: 'INVALID',
    },
    client,
  }),
);
