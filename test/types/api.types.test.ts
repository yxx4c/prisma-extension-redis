import {expect, test} from 'bun:test';
import {
  type CacheKeyParams,
  type CacheParams,
  cache,
  PrismaExtensionRedis,
  type RedisApi,
  type UncacheParams,
  uncache,
} from '../../src';
import {PrismaClient} from '../prisma/generated/prisma/client';

/**
 * Compile-time API surface tests, enforced by `bun run check:types`.
 * The function below is never executed; it exists so tsc verifies the
 * public types accept what they should and reject what they should
 * not (via @ts-expect-error negatives).
 */
const typeOnly = async () => {
  const api = {} as RedisApi;
  const prisma = new PrismaClient({adapter: {} as never}).$extends(
    PrismaExtensionRedis({
      config: {ttl: 60, stale: 30, auto: true, type: 'JSON'},
      client: api,
    }),
  );

  // Typed ioredis-family instances are accepted as the client option,
  // and prisma.redis carries the exact client type that was passed
  const {default: Redis} = await import('iovalkey');
  const ownClient = new Redis({lazyConnect: true});
  const withIovalkey = new PrismaClient({adapter: {} as never}).$extends(
    PrismaExtensionRedis({
      config: {ttl: 60, stale: 30, auto: true, type: 'JSON'},
      client: ownClient,
    }),
  );
  const exactClient: typeof ownClient = withIovalkey.redis;

  // Connection options and URLs are not accepted — bring a client
  PrismaExtensionRedis({
    config: {ttl: 60, stale: 30, auto: true, type: 'JSON'},
    // @ts-expect-error v5 takes client instances, not connection options
    client: {host: 'localhost', port: 6379},
  });
  PrismaExtensionRedis({
    config: {ttl: 60, stale: 30, auto: true, type: 'JSON'},
    // @ts-expect-error v5 takes client instances, not connection URLs
    client: 'redis://localhost:6379',
  });

  // The interactive transaction client keeps model methods and their
  // inference through the extension (issue #1's recipe must not
  // resolve to unknown)
  type ExtendedTransactionClient = Parameters<
    Parameters<(typeof prisma)['$transaction']>[0]
  >[0];
  const assertTransactionClientTyped = async (
    tx: ExtendedTransactionClient,
  ) => {
    const found = await tx.user.findFirst({where: {id: 1}});
    const txEmail: string | undefined = found?.email;
    return txEmail;
  };
  await prisma.$transaction(async tx => {
    await tx.user.findFirst({where: {id: 1}});
  });

  // includedModels is typed and mutually understood with models
  PrismaExtensionRedis({
    config: {
      ttl: 60,
      stale: 30,
      type: 'JSON',
      auto: {includedModels: ['User'], models: [{model: 'User', ttl: 5}]},
    },
    client: api,
  });

  // meta: true yields {result, meta}; plain calls yield the model type
  const withMeta = await prisma.user.findUnique({
    where: {id: 1},
    cache: {key: 'k', ttl: 60, stale: 30},
    meta: true,
  });
  const cachedAt: number = withMeta.meta.cachedAt;
  const plain = await prisma.user.findUnique({where: {id: 1}});
  const email: string | undefined = plain?.email;

  // updateManyAndReturn accepts uncache (regression: operation lists)
  await prisma.user.updateManyAndReturn({
    where: {id: 1},
    data: {name: 'n'},
    uncache: {uncacheKeys: ['k'], hasPattern: true},
  });

  // Client methods
  await prisma.cache({key: 'k', value: 1, ttl: 5, stale: 5});
  await prisma.uncache({
    uncacheKeys: ['k*'],
    hasPattern: true,
    chunkSize: 10,
    maxConcurrentBatches: 2,
  });

  // Standalone functions accept configs without auto
  await cache({
    redis: api,
    config: {ttl: 60, stale: 30, type: 'JSON'},
    key: 'k',
    value: 1,
  });
  await uncache({redis: api, uncacheKeys: ['k']});

  // Named param types are importable and usable
  const keyParams: CacheKeyParams = {params: [{id: '1'}], model: 'User'};
  const uncacheParams: UncacheParams = {redis: api, uncacheKeys: ['k']};
  const cacheParams: CacheParams = {
    redis: api,
    key: 'k',
    value: 1,
    config: {ttl: 1, stale: 0, type: 'STRING'},
  };

  // Negatives
  await prisma.user.findUnique({
    where: {id: 1},
    // @ts-expect-error cache options require a key
    cache: {ttl: 60},
  });
  await prisma.user.findUnique({
    where: {id: 1},
    // @ts-expect-error stale cannot be set without ttl
    cache: {key: 'k', stale: 30},
  });
  PrismaExtensionRedis({
    // @ts-expect-error auto is required on CacheConfig
    config: {ttl: 60, stale: 30, type: 'JSON'},
    client: api,
  });

  return {
    cachedAt,
    email,
    exactClient,
    assertTransactionClientTyped,
    keyParams,
    uncacheParams,
    cacheParams,
  };
};

test('public API type surface compiles', () => {
  expect(typeof typeOnly).toBe('function');
});
