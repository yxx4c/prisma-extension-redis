import {beforeAll, describe, expect, test} from 'bun:test';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaExtensionRedis} from '../../src';
import {users} from '../data';
import {createFakeRedisApi} from '../fakeRedisApi';
import {PrismaClient} from '../prisma/generated/prisma/client';

/**
 * Proves the extension is Redis-client agnostic: the entire cache,
 * uncache, meta, maintenance, and health surface runs against a custom
 * RedisApi implementation (an in-memory fake here) instead of iovalkey.
 * Any client that can satisfy RedisApi — @upstash/redis, ioredis,
 * node-redis wrappers — takes the same path.
 */
const fakeRedis = createFakeRedisApi();

const adapter = new PrismaPg({
  connectionString: process.env.POSTGRES_SERVICE_URI,
});

const prisma = new PrismaClient({adapter}).$extends(
  PrismaExtensionRedis({
    config: {
      ttl: 60,
      stale: 30,
      auto: true,
      type: 'JSON',
      cacheKey: {prefix: 'adapter_e2e'},
    },
    client: fakeRedis,
  }),
);

const userOne = users.find(user => user.id === 1);
if (!userOne) throw new Error('Invalid user information!');

describe('Custom RedisApi adapter (client-agnostic end-to-end)', () => {
  beforeAll(async () => {
    fakeRedis.store.clear();
    await prisma.user.deleteMany({});
    await prisma.user.create({
      data: {id: userOne.id, name: userOne.name, email: userOne.email},
    });
  });

  test('auto-cache: miss then hit through the custom client', async () => {
    const first = await prisma.user.findUnique({
      where: {email: userOne.email},
      meta: true,
    });
    expect(first.result?.email).toBe(userOne.email);
    expect(first.meta.isCached).toBe(false);
    expect(first.meta.source).toBe('db');

    const second = await prisma.user.findUnique({
      where: {email: userOne.email},
      meta: true,
    });
    expect(second.result?.email).toBe(userOne.email);
    expect(second.meta.isCached).toBe(true);
    expect(second.meta.source).toBe('cache');

    // The entry physically lives in the custom client's store
    expect(
      [...fakeRedis.store.keys()].some(key => key.startsWith('adapter_e2e')),
    ).toBe(true);
  });

  test('custom cache keys and recache round-trip', async () => {
    const key = prisma.getKey({
      params: [{prisma: 'User'}, {email: userOne.email}],
    });

    const cached = await prisma.user.findUnique({
      where: {email: userOne.email},
      cache: {key, ttl: 60, stale: 30},
      meta: true,
    });
    expect(cached.meta.key).toBe(key);

    const refreshed = await cached.meta.recache();
    expect(refreshed.meta.source).toBe('db');
  });

  test('uncache deletes from the custom client', async () => {
    const key = prisma.getKey({
      params: [{prisma: 'User'}, {uncacheme: '1'}],
    });

    await prisma.user.findUnique({
      where: {email: userOne.email},
      cache: {key, ttl: 60},
      meta: true,
    });
    expect(fakeRedis.store.has(key)).toBe(true);

    await prisma.user.update({
      where: {email: userOne.email},
      data: {name: userOne.name},
      uncache: {uncacheKeys: [key]},
    });
    expect(fakeRedis.store.has(key)).toBe(false);
  });

  test('pattern-based uncache scans the custom client', async () => {
    await prisma.user.findUnique({where: {email: userOne.email}});

    await prisma.user.update({
      where: {email: userOne.email},
      data: {name: userOne.name},
      uncache: {uncacheKeys: ['adapter_e2e*'], hasPattern: true},
    });

    expect(
      [...fakeRedis.store.keys()].filter(key => key.startsWith('adapter_e2e')),
    ).toHaveLength(0);
  });

  test('prisma.uncache removes entries directly without a database operation', async () => {
    const exactKey = prisma.getKey({
      params: [{prisma: 'User'}, {direct: '1'}],
    });
    await prisma.user.findUnique({
      where: {email: userOne.email},
      cache: {key: exactKey, ttl: 60},
    });
    await prisma.user.findUnique({where: {email: userOne.email}});
    expect(fakeRedis.store.has(exactKey)).toBe(true);

    const {deleted} = await prisma.uncache({
      uncacheKeys: [exactKey, 'adapter_e2e:user*'],
      hasPattern: true,
    });

    expect(deleted).toBeGreaterThanOrEqual(2);
    expect(fakeRedis.store.has(exactKey)).toBe(false);
    expect(
      [...fakeRedis.store.keys()].filter(key => key.startsWith('adapter_e2e')),
    ).toHaveLength(0);
  });

  test('prisma.cache plants values served without a database round trip', async () => {
    const key = prisma.getKey({params: [{prisma: 'User'}, {planted: '1'}]});
    const planted = {id: 999, name: 'from-cache-only', email: 'planted@x.y'};

    const stamped = await prisma.cache({key, value: planted});
    expect(stamped.staleUntil).toBe(stamped.cachedAt + 60 + 30);

    const read = await prisma.user.findUnique({
      where: {email: userOne.email},
      cache: {key},
      meta: true,
    });

    expect(read.meta.source).toBe('cache');
    expect(read.result).toEqual(planted);
  });

  test('maintenance utilities run against the custom client', async () => {
    await prisma.user.findUnique({where: {email: userOne.email}});

    const stats = await prisma.getCacheStats();
    expect(stats.totalKeys).toBeGreaterThan(0);

    const flushed = await prisma.flushModelCache('User');
    expect(flushed.deletedCount).toBeGreaterThan(0);

    const cleanup = await prisma.cleanupOrphanedKeys(['User'], {dryRun: true});
    expect(cleanup.deletedCount).toBe(0);
  });

  test('health check works without INFO support', async () => {
    const health = await prisma.healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.connected).toBe(true);
    // The fake exposes no info(); serverInfo degrades gracefully
    expect(health.serverInfo).toBeUndefined();
  });
});
