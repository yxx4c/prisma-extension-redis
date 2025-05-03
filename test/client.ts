import {PrismaClient} from './prisma/generated';
import {
  type AutoCacheConfig,
  type CacheConfig,
  PrismaExtensionRedis,
  IovalkeyCacheProvider,
  type CacheProvider,
} from '../src';
import type {RedisOptions} from 'iovalkey';

const options = process.env.REDIS_SERVICE_URI as RedisOptions;

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

export const config: CacheConfig = {
  ttl: 60,
  stale: 30,
  auto,
  type: 'JSON',
};

export const provider = new IovalkeyCacheProvider(options);

export const prisma = new PrismaClient();

export const extendedPrismaWithJsonAndCustomAutoCache = prisma.$extends(
  PrismaExtensionRedis({
    config: {...config, auto},
    provider,
  }),
);

export const extendedPrismaWithJsonAndAutoCacheTrue = prisma.$extends(
  PrismaExtensionRedis({
    config: {...config, auto: true},
    provider,
  }),
);

export const extendedPrismaWithStringAndCustomAutoCache = prisma.$extends(
  PrismaExtensionRedis({
    config: {...config, auto: auto, type: 'STRING'},
    provider,
  }),
);

export const extendedPrismaWithStringAndAutoCacheTrue = prisma.$extends(
  PrismaExtensionRedis({
    config: {...config, auto: true, type: 'STRING'},
    provider,
  }),
);

export const extendedPrismaDefaultCacheFalse = prisma.$extends(
  PrismaExtensionRedis({
    config: {...config, auto: true, defaultCache: false},
    provider,
  }),
);

export const extendedPrismaAutoInvalidateFalse = prisma.$extends(
  PrismaExtensionRedis({
    config: {...config, auto: true, autoInvalidate: false},
    provider,
  }),
);

export const extendedPrismaWithExtendedStale = prisma.$extends(
  PrismaExtensionRedis({
    config: {
      auto: true,
      stale: 300,
      ttl: 1,
      type: 'JSON',
    },
    provider,
  }),
);

export const extendedPrismaWithInvalidCacheType = prisma.$extends(
  PrismaExtensionRedis({
    config: {
      ...config,
      auto: true,
      // @ts-ignore: Intentionally using invalid type for testing
      type: 'INVALID',
    },
    provider,
  }),
);
