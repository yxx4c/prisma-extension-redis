import {PrismaClient} from '@prisma/client';
import pino from 'pino';
import {
  CacheCase,
  type CacheConfig,
  PrismaExtensionRedis,
} from 'prisma-extension-redis';
import {SuperJSON} from 'superjson';

import {users} from './data';
import env from './env';
import {getRandomValue} from './utils';

// Create a Redis client
const client = {
  host: env.REDIS_HOST_NAME, // Specify Redis host name
  port: env.REDIS_PORT, // Specify Redis port
};

// Create a pino logger instance for logging
const logger = pino();

const config: CacheConfig = {
  ttl: 60, // Default Time-to-live for caching in seconds
  stale: 30, // Default Stale time after ttl in seconds
  auto: {
    excludedModels: ['Post'], // Models to exclude from auto-caching default behavior
    excludedOperations: ['findFirst', 'count', 'findMany'], // Operations to exclude from auto-caching default behavior
    models: [
      {
        model: 'User',
        excludedOperations: [],
        ttl: 120, // Time-to-live for caching in seconds
        stale: 30, // Stale time for caching in seconds
      },
    ], // main auto-cache configuration for specific models
    ttl: 30, // Default time-to-live for auto-caching
  },
  logger, // Logger for cache events
  transformer: {
    // Use, main serialize and deserialize function for additional functionality if required
    deserialize: data => SuperJSON.parse(data), // default value of deserialize function
    serialize: data => SuperJSON.stringify(data), // default value of serialize function
  },
  onHit: (key: string) => console.log(`FOUND CACHE: ${key}`),
  onMiss: (key: string) => console.log(`NOT FOUND CACHE: ${key}`),
  type: 'JSON',
  cacheKey: {
    case: CacheCase.SNAKE_CASE,
    delimiter: '*',
    prefix: 'awesomeness',
  },
};

const prisma = new PrismaClient();
const extendedPrisma = prisma.$extends(PrismaExtensionRedis({config, client}));

const main = async () => {
  await Promise.all(
    users.map(user =>
      extendedPrisma.user.upsert({
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
          uncacheKeys: ['*'], // USING WILDCARD '*' - DANGEROUS OPERATION - DELETES EVERYTHING FROM CACHE
          hasPattern: true,
        },
      }),
    ),
  );

  const usedUsers: number[] = [];

  const userOne = getRandomValue(users);
  usedUsers.push(userOne.id);

  await extendedPrisma.user
    .findUnique({
      where: {email: userOne.email},
    })
    .then(user => logger.info({type: 'AUTO: DATABASE: Find userOne', user}));

  await extendedPrisma.user
    .findUnique({
      where: {email: userOne.email},
      cache: {
        key: extendedPrisma.getKey({
          params: [{prisma: 'User'}, {email: userOne.email}],
        }),
      },
    })
    .then(user => logger.info({type: 'DATABASE: Find userOne', user}));

  await extendedPrisma.user
    .findUnique({
      where: {email: userOne.email},
      cache: {
        key: extendedPrisma.getKey({
          params: [{prisma: 'User'}, {email: userOne.email}],
        }),
      },
    })
    .then(user =>
      logger.info({
        type: 'CACHE: Find userOne',
        // transforming date type value retrieved from cache to confirm that the date is parsed correctly
        user: {...user, createdAt: user?.createdAt.toLocaleDateString()},
      }),
    );

  await extendedPrisma.user
    .delete({
      where: {id: userOne.id},
      uncache: {
        uncacheKeys: [
          extendedPrisma.getKey({
            params: [{prisma: 'User'}, {email: userOne.email}],
          }),
        ],
      },
    })
    .then(deleted => logger.info({type: 'DATABASE: Deleted userOne', deleted}));

  const userTwo = getRandomValue(users.filter(u => !usedUsers.includes(u.id)));
  usedUsers.push(userTwo.id);

  await extendedPrisma.user
    .update({
      where: {email: userTwo.email},
      data: {name: userOne.name},
      uncache: {
        uncacheKeys: [
          extendedPrisma.getKey({
            params: [{prisma: 'User'}, {email: userOne.email}],
          }),
        ],
      },
    })
    .then(updated => logger.info({type: 'DATABASE: Update userTwo', updated}));

  await extendedPrisma.user
    .findUnique({
      where: {email: userTwo.email},
      cache: {
        key: extendedPrisma.getKey({
          params: [{prisma: 'User'}, {email: userOne.email}],
        }),
        ttl: 60,
      },
    })
    .then(user => logger.info({type: 'DATABASE: Find userTwo', user}));

  await extendedPrisma.user
    .findUnique({
      where: {email: userTwo.email},
      cache: {
        key: extendedPrisma.getKey({
          params: [{prisma: 'User'}, {email: userOne.email}],
        }),
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

  setTimeout(async () => {
    await extendedPrisma.user
      .findUnique({
        where: {email: userOne.email},
      })
      .then(user => logger.info({type: 'AUTO: CACHE: Find userOne', user}));

    const args = {where: {email: userOne.email}};

    await extendedPrisma.user
      .findUnique({
        ...args,
        cache: {
          key: extendedPrisma.getAutoKey({
            args,
            model: 'user',
            operation: 'count',
          }),
        },
      })
      .then(user =>
        logger.info({type: 'AUTO: CACHE: WITH KEY: Find userOne', user}),
      );
  }, 5000);
};

main()
  .catch(e => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
