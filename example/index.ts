import {PrismaClient} from '@prisma/client';
import pino from 'pino';
import {
  type AutoCacheConfig,
  CacheCase,
  type CacheConfig,
  PrismaExtensionRedis,
  IovalkeyCacheProvider,
} from 'prisma-extension-redis';
import {SuperJSON} from 'superjson';
import {Redis} from 'iovalkey';

import {users} from './data';
import env from './env';
import {getRandomValue} from './utils';

// Create a Redis client instance for the provider
const redis = new Redis({
  host: env.REDIS_HOST_NAME, // Specify Redis host name
  port: env.REDIS_PORT, // Specify Redis port
  // Add other iovalkey options if needed
});

// Instantiate the Cache Provider
const provider = new IovalkeyCacheProvider(redis);

// Create a pino logger instance for logging
const logger = pino();

const auto: AutoCacheConfig = {
  excludedModels: ['Post'], // Models to exclude from auto-caching default behavior
  excludedOperations: ['findFirst', 'findMany'], // Operations to exclude from auto-caching default behavior
  models: [
    {
      model: 'User',
      excludedOperations: [],
      ttl: 120, // Time-to-live for caching in seconds
      stale: 30, // Stale time for caching in seconds
    },
  ], // main auto-cache configuration for specific models
  ttl: 30, // Default time-to-live for auto-caching
};

const config: CacheConfig = {
  ttl: 60, // Default Time-to-live for caching in seconds
  stale: 30, // Default Stale time after ttl in seconds
  auto,
  logger, // Logger for cache events
  defaultCache: true, // Explicitly set default caching behavior
  autoInvalidate: true, // Explicitly set auto-invalidation behavior
  transformer: {
    // Use SuperJSON for serialization/deserialization
    deserialize: data => SuperJSON.parse(data),
    serialize: data => SuperJSON.stringify(data),
  },
  type: 'JSON', // the redis instance must support JSON module if you chose to use JSON type cache
  cacheKey: {
    // Example cache key customization
    case: CacheCase.SNAKE_CASE,
    delimiter: ':',
    prefix: 'example',
  },
};

const prisma = new PrismaClient();
const extendedPrisma = prisma.$extends(PrismaExtensionRedis({config, provider}));

const resultSourceString = (isCached: boolean) =>
  isCached ? 'CACHE' : 'DATABASE';

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
        // Use 'invalidate' instead of 'uncache'
        // Use 'invalidateKeys' instead of 'uncacheKeys'
        invalidate: {
          invalidateKeys: ['*'], // USING WILDCARD '*' - DANGEROUS OPERATION - DELETES EVERYTHING FROM CACHE
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
    .then(({result: user, isCached}) =>
      console.info(`AUTO: ${resultSourceString(isCached)}: Find userOne`, {
        user,
        isCached,
      }),
    );

  await extendedPrisma.user
    .findUnique({
      where: {email: userOne.email},
    })
    .then(({result: user, isCached}) =>
      console.info(`AUTO: ${resultSourceString(isCached)}: Find userOne`, {
        user,
        isCached,
      }),
    );

  await extendedPrisma.user
    .findUnique({
      where: {email: userOne.email},
      cache: {
        key: extendedPrisma.getKey({
          params: [{prisma: 'User'}, {email: userOne.email}],
        }),
      },
    })
    .then(({result: user, isCached}) =>
      console.info(`CUSTOM: ${resultSourceString(isCached)}: Find userOne`, {
        user,
        isCached,
      }),
    );

  await extendedPrisma.user
    .findUnique({
      where: {email: userOne.email},
      cache: {
        key: extendedPrisma.getKey({
          params: [{prisma: 'User'}, {email: userOne.email}],
        }),
      },
    })
    .then(({result: user, isCached}) =>
      console.info(`CUSTOM: ${resultSourceString(isCached)}: Find userOne`, {
        // transforming date type value retrieved from cache to confirm that the date is parsed correctly
        // user: {
        //   ...user,
        //   createdAt: user?.createdAt.toLocaleDateString(),
        // },
        user,
        isCached,
      }),
    );

  await extendedPrisma.user
    .delete({
      where: {id: userOne.id},
      // Use 'invalidate' instead of 'uncache'
      // Use 'invalidateKeys' instead of 'uncacheKeys'
      invalidate: {
        invalidateKeys: [
          extendedPrisma.getKey({
            // Ensure cacheKey prefix/delimiter match config if used here
            params: [{prisma: 'User'}, {email: userOne.email}],
          }),
        ],
      },
    })
    .then(({result: deleted}) =>
      console.info({type: 'UNCACHE: DATABASE: Deleted userOne', deleted}),
    );

  const userTwo = getRandomValue(users.filter(u => !usedUsers.includes(u.id)));
  usedUsers.push(userTwo.id);

  await extendedPrisma.user
    .update({
      where: {email: userTwo.email},
      data: {name: userOne.name},
      // Use 'invalidate' instead of 'uncache'
      // Use 'invalidateKeys' instead of 'uncacheKeys'
      invalidate: {
        invalidateKeys: [
          extendedPrisma.getKey({
            // Ensure cacheKey prefix/delimiter match config if used here
            params: [{prisma: 'User'}, {email: userOne.email}],
          }),
        ],
      },
    })
    .then(({result: updated}) =>
      console.info({type: 'UNCACHE: DATABASE: Update userTwo', updated}),
    );

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
    .then(({result: user, isCached}) =>
      console.info(`CUSTOM: ${resultSourceString(isCached)}: Find userTwo`, {
        user,
        isCached,
      }),
    );

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
    .then(({result: user, isCached}) =>
      console.info(`CUSTOM: ${resultSourceString(isCached)}: Find userTwo`, {
        // transforming date type value retrieved from cache to confirm that the date is parsed correctly
        // user: {
        //   ...user,
        //   createdAt: user?.createdAt.toLocaleDateString(),
        // },
        user,
        isCached,
      }),
    );

  setTimeout(async () => {
    await extendedPrisma.user
      .findUnique({
        where: {email: userOne.email},
      })
      .then(({result: user, isCached}) =>
        console.info(`AUTO: ${resultSourceString(isCached)}: Find userOne`, {
          user,
          isCached,
        }),
      );

    const args = {where: {email: userOne.email}};

    // below example uses auto cache key generation function to fetch the results of the auto cache query (above)
    // similarly, this can be used to uncache an auto cached query during any mutation (this does not support patterns)
    await extendedPrisma.user
      .findUnique({
        ...args,
        cache: {
          // make sure to use the correct args, model and operation here as it is not being validated
          key: extendedPrisma.getAutoKey({
            args,
            model: 'user',
            operation: 'findUnique',
          }),
        },
      })
      .then(({result: user, isCached}) =>
        console.info(
          `CUSTOM: ${resultSourceString(isCached)}: WITH AUTO KEY: Find userOne`,
          {
            user,
            isCached,
          },
        ),
      );
  }, 100000);
};

main()
  .catch(e => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
