import {PrismaClient} from './prisma/generated';
import {
  type CacheConfig,
  PrismaExtensionRedis,
  IovalkeyCacheProvider,
} from '../src';
import type {RedisOptions} from 'iovalkey';

const options = process.env.REDIS_SERVICE_URI as RedisOptions;

export const config: CacheConfig = {
  ttl: 60,
  stale: 30,
  type: 'JSON',
};

export const provider = new IovalkeyCacheProvider(options);

export const prisma = new PrismaClient();

export const extendedPrismaWithJson = prisma.$extends(
  PrismaExtensionRedis({
    config: {...config, type: 'JSON'},
    provider,
  }),
);

export const extendedPrismaWithString = prisma.$extends(
  PrismaExtensionRedis({
    config: {...config, type: 'STRING'},
    provider,
  }),
);

export const extendedPrismaWithDefaultCacheFalse = prisma.$extends(
  PrismaExtensionRedis({
    config: {...config, defaultCache: false},
    provider,
  }),
);

export const extendedPrismaWithAutoInvalidateFalse = prisma.$extends(
  PrismaExtensionRedis({
    config: {...config, autoInvalidate: false},
    provider,
  }),
);

export const extendedPrismaWithExtendedStale = prisma.$extends(
  PrismaExtensionRedis({
    config: {
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
      // @ts-ignore: Intentionally using invalid type for testing
      type: 'INVALID',
    },
    provider,
  }),
);
