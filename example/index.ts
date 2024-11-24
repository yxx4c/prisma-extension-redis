import {PrismaClient} from '@prisma/client';
import pino from 'pino';
import {
  type AutoCacheConfig,
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
  // transformer: {
  //   // Use, main serialize and deserialize function for additional functionality if required
  //   deserialize: data => SuperJSON.parse(data), // default value of deserialize function
  //   serialize: data => SuperJSON.stringify(data), // default value of serialize function
  // },
  // onHit: (key: string) => console.log(`FOUND CACHE: ${key}`),
  // onMiss: (key: string) => console.log(`NOT FOUND CACHE: ${key}`),
  type: 'JSON', // the redis instance must support JSON module if you chose to use JSON type cache
  // cacheKey: {
    // case: CacheCase.CAMEL_CASE,
    // delimiter: '*',
    // prefix: 'awesomeness',
  // },
};

const prisma = new PrismaClient();
const extendedPrisma = prisma.$extends(PrismaExtensionRedis({config, client}));

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
      uncache: {
        uncacheKeys: [
          extendedPrisma.getKey({
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
      uncache: {
        uncacheKeys: [
          extendedPrisma.getKey({
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
