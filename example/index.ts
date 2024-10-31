import {PrismaClient} from '@prisma/client';
import {Redis} from 'ioredis';
import pino from 'pino';
import {
  type AutoCacheConfig,
  type CacheConfig,
  PrismaExtensionRedis,
  getCacheKey,
  getCacheKeyPattern,
} from 'prisma-extension-redis';
import {SuperJSON} from 'superjson';

import {users} from './data';
import env from './env';
import {getRandomValue} from './utils';

// Create a Redis client
const redis = new Redis({
  host: env.REDIS_HOST_NAME, // Specify Redis host name
  port: env.REDIS_PORT, // Specify Redis port
});

// Create a pino logger instance for logging
const logger = pino();

const auto: AutoCacheConfig = {
  excludedModels: ['Post'], // Models to exclude from auto-caching default behavior
  excludedOperations: ['findFirst', 'count', 'findMany'], // Operations to exclude from auto-caching default behavior
  models: [
    {
      model: 'User',
      excludedOperations: [],
      ttl: 600, // Time-to-live for caching in seconds
      stale: 600, // Stale time for caching in seconds
    },
  ], // Custom auto-cache configuration for specific models
  ttl: 1, // Default time-to-live for caching
};

const cache: CacheConfig = {
  ttl: 1, // Time-to-live for caching in seconds
  stale: 1, // Stale time for caching in seconds
  storage: {
    type: 'redis',
    options: {
      client: redis,
      // Invalidation settings
      // referencesTTL is in seconds
      // The min value of referencesTTL must be more than max value of all TTLs used
      invalidation: {referencesTTL: 60},
      log: logger, // Logger for cache events
    },
  }, // Storage configuration for async-cache-dedupe
  transformer: {
    // Use, custom serialize and deserialize function for additional functionality if required
    deserialize: data => SuperJSON.parse(data), // default value of deserialize function
    serialize: data => SuperJSON.stringify(data), // default value of serialize function
  },
};

const client = new PrismaClient();
const prisma = client.$extends(PrismaExtensionRedis({cache, redis}));

const main = async () => {
  await Promise.all(
    users.map(user =>
      prisma.user.upsert({
        where: {
          email: user.email,
        },
        create: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        update: {},
        // at the moment you cannot cache during upsert, uncache works normal, as below!
        uncache: {
          uncacheKeys: ['*'], // DANGEROUS OPERATION - DELETES EVERYTHING FROM CACHE
          hasPattern: true,
        },
      }),
    ),
  );

  const userOne = getRandomValue(users);

  await prisma.user
    .findUnique({
      where: {email: userOne.email},
      cache: {
        key: getCacheKey([{prisma: 'User'}, {email: userOne.email}]),
      },
    })
    .then(user => logger.info({type: 'DATABASE: Find userOne', user}));

  await prisma.user
    .findUnique({
      where: {email: userOne.email},
      cache: {
        key: getCacheKey([{prisma: 'User'}, {email: userOne.email}]),
      },
    })
    .then(user =>
      logger.info({
        type: 'CACHE: Find userOne',
        // transforming date type value retrieved from cache to confirm that the date is parsed correctly
        user: {...user, createdAt: user?.createdAt.toLocaleDateString()},
      }),
    );

  await prisma.user
    .delete({
      where: {id: userOne.id},
      uncache: {
        uncacheKeys: [getCacheKey([{prisma: 'User'}, {email: userOne.email}])],
      },
    })
    .then(deleted => logger.info({type: 'DATABASE: Deleted userOne', deleted}));

  const userTwo = getRandomValue(users.filter(u => u.id !== userOne.id));

  await prisma.user
    .update({
      where: {email: userTwo.email},
      data: {name: userOne.name},
      uncache: {
        uncacheKeys: [
          getCacheKeyPattern([{prisma: 'User'}, {email: userTwo.email}]),
        ],
        hasPattern: true,
      },
    })
    .then(updated => logger.info({type: 'DATABASE: Update userTwo', updated}));

  await prisma.user
    .findUnique({
      where: {email: userTwo.email},
      cache: {
        key: getCacheKey([{prisma: 'User'}, {email: userTwo.email}]),
        ttl: 60,
      },
    })
    .then(user => logger.info({type: 'DATABASE: Find userTwo', user}));

  await prisma.user
    .findUnique({
      where: {email: userTwo.email},
      cache: {
        key: getCacheKey([{prisma: 'User'}, {email: userTwo.email}]),
        ttl: 60,
      },
    })
    .then(user =>
      logger.info({
        type: 'CACHE: Find userTwo',
        // transforming date type value retrieved from cache to confirm that the date is parsed correctly
        user: {...user, createdAt: user?.createdAt.toLocaleDateString()},
      }),
    );
};

main()
  .catch(e => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
