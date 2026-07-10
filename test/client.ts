import {PrismaPg} from '@prisma/adapter-pg';
import Redis from 'iovalkey';
import {
  type AutoCacheConfig,
  type CacheConfig,
  PrismaExtensionRedis,
} from '../src';
import {PrismaClient} from './prisma/generated/prisma/client';

// One caller-owned client shared by every extended client below — the
// v5 contract: the extension never constructs connections itself
export const redisClient = new Redis(process.env.REDIS_SERVICE_URI as string);

const client = redisClient;

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
  type: 'JSON',
};

// Create PrismaPg adapter for Prisma 7
const adapter = new PrismaPg({
  connectionString: process.env.POSTGRES_SERVICE_URI,
});

export const prisma = new PrismaClient({adapter});

export const extendedPrismaWithJsonAndCustomAutoCache = prisma.$extends(
  PrismaExtensionRedis({config, client}),
);

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

export const extendedPrismaWithExtendedStale = prisma.$extends(
  PrismaExtensionRedis({
    config: {
      auto: true,
      stale: 300,
      ttl: 1,
      type: 'JSON',
    },
    client,
  }),
);

/**
 * Factory function to create a Prisma client with an invalid cache type.
 * This is a function (not a constant) because the validation now throws
 * at initialization time, so we need to defer creation to test time.
 */
export const createPrismaWithInvalidCacheType = () =>
  prisma.$extends(
    PrismaExtensionRedis({
      config: {
        ...config,
        // @ts-expect-error: Intentionally using invalid type for testing
        type: 'INVALID',
      },
      client,
    }),
  );
