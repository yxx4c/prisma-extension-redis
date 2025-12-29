import {afterAll, beforeAll, describe, expect, mock, test} from 'bun:test';
import {PrismaClient} from '@prisma/client';
import {
  PrismaExtensionRedis,
  type RedisOptions,
  type WarmQuery,
} from '../../src';
import {users} from '../data';

describe('Cache Warmer', () => {
  const client = process.env.REDIS_SERVICE_URI as RedisOptions;
  const basePrisma = new PrismaClient();

  const prisma = basePrisma.$extends(
    PrismaExtensionRedis({
      config: {
        ttl: 60,
        stale: 30,
        auto: true,
        type: 'JSON',
      },
      client,
    }),
  );

  beforeAll(async () => {
    await prisma.redis.flushdb();
    // Create test users
    const testUsers = users.slice(0, 5);
    for (const user of testUsers) {
      await basePrisma.user.upsert({
        where: {id: user.id},
        update: user,
        create: user,
      });
    }
  });

  afterAll(async () => {
    await prisma.redis.flushdb();
    await basePrisma.user.deleteMany({where: {id: {in: [1, 2, 3, 4, 5]}}});
    await basePrisma.$disconnect();
  });

  describe('createCacheWarmer', () => {
    test('should warm cache with single query', async () => {
      await prisma.redis.flushdb();

      const queries: WarmQuery[] = [
        {
          model: 'User',
          operation: 'findUnique',
          args: {where: {id: 1}},
        },
      ];

      const warmer = prisma.createCacheWarmer(prisma);
      const result = await warmer(queries);

      expect(result.total).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('should warm cache with multiple queries', async () => {
      await prisma.redis.flushdb();

      const queries: WarmQuery[] = [
        {model: 'User', operation: 'findUnique', args: {where: {id: 1}}},
        {model: 'User', operation: 'findUnique', args: {where: {id: 2}}},
        {model: 'User', operation: 'findUnique', args: {where: {id: 3}}},
      ];

      const warmer = prisma.createCacheWarmer(prisma);
      const result = await warmer(queries);

      expect(result.total).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
    });

    test('should respect concurrency limit', async () => {
      await prisma.redis.flushdb();

      const queries: WarmQuery[] = [
        {model: 'User', operation: 'findUnique', args: {where: {id: 1}}},
        {model: 'User', operation: 'findUnique', args: {where: {id: 2}}},
        {model: 'User', operation: 'findUnique', args: {where: {id: 3}}},
        {model: 'User', operation: 'findUnique', args: {where: {id: 4}}},
        {model: 'User', operation: 'findUnique', args: {where: {id: 5}}},
      ];

      const warmer = prisma.createCacheWarmer(prisma);
      const result = await warmer(queries, {concurrency: 2});

      expect(result.total).toBe(5);
      expect(result.successful).toBe(5);
    });

    test('should call onProgress callback', async () => {
      await prisma.redis.flushdb();

      const queries: WarmQuery[] = [
        {model: 'User', operation: 'findUnique', args: {where: {id: 1}}},
        {model: 'User', operation: 'findUnique', args: {where: {id: 2}}},
      ];

      const onProgress = mock(() => {});
      const warmer = prisma.createCacheWarmer(prisma);
      await warmer(queries, {onProgress, concurrency: 1});

      expect(onProgress).toHaveBeenCalled();
      // Should be called twice with concurrency 1 (once per chunk)
      expect(onProgress).toHaveBeenCalledWith(1, 2);
      expect(onProgress).toHaveBeenCalledWith(2, 2);
    });

    test('should handle query errors gracefully', async () => {
      await prisma.redis.flushdb();

      const queries: WarmQuery[] = [
        {model: 'User', operation: 'findUnique', args: {where: {id: 1}}},
        // Invalid model name will cause error
        {
          model: 'InvalidModel',
          operation: 'findUnique',
          args: {where: {id: 1}},
        },
        {model: 'User', operation: 'findUnique', args: {where: {id: 2}}},
      ];

      const onQueryError = mock(() => {});
      const warmer = prisma.createCacheWarmer(prisma);
      const result = await warmer(queries, {
        onQueryError,
        continueOnError: true,
      });

      expect(result.total).toBe(3);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(onQueryError).toHaveBeenCalledTimes(1);
    });

    test('should stop on error when continueOnError is false', async () => {
      await prisma.redis.flushdb();

      const queries: WarmQuery[] = [
        {
          model: 'InvalidModel',
          operation: 'findUnique',
          args: {where: {id: 1}},
        },
        {model: 'User', operation: 'findUnique', args: {where: {id: 1}}},
      ];

      const warmer = prisma.createCacheWarmer(prisma);

      await expect(warmer(queries, {continueOnError: false})).rejects.toThrow();
    });

    test('should use custom TTL and stale values', async () => {
      await prisma.redis.flushdb();

      const queries: WarmQuery[] = [
        {
          model: 'User',
          operation: 'findUnique',
          args: {where: {id: 1}},
          ttl: 120,
          stale: 60,
        },
      ];

      const warmer = prisma.createCacheWarmer(prisma);
      const result = await warmer(queries);

      expect(result.successful).toBe(1);
    });

    test('should handle invalid operation gracefully', async () => {
      await prisma.redis.flushdb();

      const queries: WarmQuery[] = [
        {
          model: 'User',
          operation: 'invalidOperation' as 'findUnique',
          args: {where: {id: 1}},
        },
      ];

      const warmer = prisma.createCacheWarmer(prisma);
      const result = await warmer(queries, {continueOnError: true});

      expect(result.failed).toBe(1);
      expect(result.errors[0].error.message).toContain('not found');
    });
  });

  describe('warmCache method', () => {
    test('should warm cache using warmCache method', async () => {
      await prisma.redis.flushdb();

      const queries: WarmQuery[] = [
        {model: 'User', operation: 'findUnique', args: {where: {id: 1}}},
        {model: 'User', operation: 'findUnique', args: {where: {id: 2}}},
      ];

      const result = await prisma.warmCache(queries);

      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
    });

    test('should accept options in warmCache', async () => {
      await prisma.redis.flushdb();

      const queries: WarmQuery[] = [
        {model: 'User', operation: 'findUnique', args: {where: {id: 1}}},
      ];

      const onProgress = mock(() => {});
      const result = await prisma.warmCache(queries, {
        concurrency: 1,
        onProgress,
      });

      expect(result.successful).toBe(1);
      expect(onProgress).toHaveBeenCalled();
    });
  });

  describe('findMany warming', () => {
    test('should warm cache with findMany query', async () => {
      await prisma.redis.flushdb();

      const queries: WarmQuery[] = [
        {
          model: 'User',
          operation: 'findMany',
          args: {take: 5},
        },
      ];

      const warmer = prisma.createCacheWarmer(prisma);
      const result = await warmer(queries);

      expect(result.successful).toBe(1);
    });
  });
});
