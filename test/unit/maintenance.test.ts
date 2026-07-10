import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {cleanupOrphanedKeys, flushModelCache, getKeyGen} from '../../src';
import {extendedPrismaWithJsonAndAutoCacheTrue} from '../client';

describe('Cache Maintenance Utilities', () => {
  const redis = extendedPrismaWithJsonAndAutoCacheTrue.redis;

  beforeEach(async () => {
    // Clear any existing test keys
    await redis.flushdb();
  });

  afterEach(async () => {
    // Clean up after tests
    await redis.flushdb();
  });

  describe('getCacheStats', () => {
    test('should return zero stats when cache is empty', async () => {
      const stats =
        await extendedPrismaWithJsonAndAutoCacheTrue.getCacheStats();

      expect(stats.totalKeys).toBe(0);
      expect(Object.keys(stats.keysByModel).length).toBe(0);
      expect(stats.estimatedSizeBytes).toBe(0);
    });

    test('should count keys correctly', async () => {
      // Add some test keys
      await redis.set('prisma:user:findunique:1', 'test1');
      await redis.set('prisma:user:findunique:2', 'test2');
      await redis.set('prisma:post:findunique:1', 'test3');

      const stats =
        await extendedPrismaWithJsonAndAutoCacheTrue.getCacheStats();

      expect(stats.totalKeys).toBe(3);
      expect(stats.keysByModel.user).toBe(2);
      expect(stats.keysByModel.post).toBe(1);
    });

    test('should estimate memory usage', async () => {
      await redis.set('prisma:user:findunique:1', 'test');

      const stats =
        await extendedPrismaWithJsonAndAutoCacheTrue.getCacheStats();

      expect(stats.estimatedSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('flushModelCache', () => {
    test('should delete all keys for a specific model', async () => {
      // Add keys for multiple models
      await redis.set('prisma:user:findunique:1', 'test1');
      await redis.set('prisma:user:findunique:2', 'test2');
      await redis.set('prisma:post:findunique:1', 'test3');

      const result =
        await extendedPrismaWithJsonAndAutoCacheTrue.flushModelCache('User');

      expect(result.deletedCount).toBe(2);

      // Verify user keys are deleted
      const userKey1 = await redis.get('prisma:user:findunique:1');
      const userKey2 = await redis.get('prisma:user:findunique:2');
      expect(userKey1).toBeNull();
      expect(userKey2).toBeNull();

      // Verify post key is preserved
      const postKey = await redis.get('prisma:post:findunique:1');
      expect(postKey).toBe('test3');
    });

    test('should return duration in milliseconds', async () => {
      await redis.set('prisma:user:findunique:1', 'test');

      const result =
        await extendedPrismaWithJsonAndAutoCacheTrue.flushModelCache('User');

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('should handle empty model cache', async () => {
      const result =
        await extendedPrismaWithJsonAndAutoCacheTrue.flushModelCache(
          'NonExistent',
        );

      expect(result.deletedCount).toBe(0);
    });

    test('should be case-insensitive for model names', async () => {
      await redis.set('prisma:user:findunique:1', 'test');

      // Flush with different case
      const result =
        await extendedPrismaWithJsonAndAutoCacheTrue.flushModelCache('USER');

      expect(result.deletedCount).toBe(1);
    });
  });

  describe('cleanupOrphanedKeys', () => {
    test('should identify orphaned keys', async () => {
      // Add keys for existing and deleted models
      await redis.set('prisma:user:findunique:1', 'test1');
      await redis.set('prisma:deletedmodel:findunique:1', 'test2');

      const result =
        await extendedPrismaWithJsonAndAutoCacheTrue.cleanupOrphanedKeys(
          ['User'],
          {dryRun: true},
        );

      expect(result.orphanedKeys.length).toBe(1);
      expect(result.orphanedKeys[0]).toContain('deletedmodel');
      expect(result.deletedCount).toBe(0); // Dry run doesn't delete
    });

    test('should delete orphaned keys when not in dry run', async () => {
      await redis.set('prisma:user:findunique:1', 'test1');
      await redis.set('prisma:deletedmodel:findunique:1', 'test2');

      const result =
        await extendedPrismaWithJsonAndAutoCacheTrue.cleanupOrphanedKeys(
          ['User'],
          {dryRun: false},
        );

      expect(result.deletedCount).toBe(1);

      // Verify orphaned key is deleted
      const orphanedKey = await redis.get('prisma:deletedmodel:findunique:1');
      expect(orphanedKey).toBeNull();

      // Verify valid key is preserved
      const validKey = await redis.get('prisma:user:findunique:1');
      expect(validKey).toBe('test1');
    });

    test('should report scan progress', async () => {
      await redis.set('prisma:user:findunique:1', 'test1');
      await redis.set('prisma:user:findunique:2', 'test2');

      let progressCalls = 0;
      await extendedPrismaWithJsonAndAutoCacheTrue.cleanupOrphanedKeys(
        ['User'],
        {
          dryRun: true,
          onProgress: () => {
            progressCalls++;
          },
        },
      );

      expect(progressCalls).toBeGreaterThanOrEqual(1);
    });

    test('should return duration in milliseconds', async () => {
      const result =
        await extendedPrismaWithJsonAndAutoCacheTrue.cleanupOrphanedKeys(
          ['User'],
          {dryRun: true},
        );

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('should be case-insensitive for model comparison', async () => {
      await redis.set('prisma:user:findunique:1', 'test1');

      // Pass model name in different case
      const result =
        await extendedPrismaWithJsonAndAutoCacheTrue.cleanupOrphanedKeys(
          ['USER'],
          {dryRun: true},
        );

      // Should not identify as orphaned since User matches user
      expect(result.orphanedKeys.length).toBe(0);
    });
  });

  describe('casing consistency with the key generator', () => {
    test('flushModelCache deletes keys of multi-word models', async () => {
      const key = extendedPrismaWithJsonAndAutoCacheTrue.getAutoKey({
        model: 'GroupOnUsers',
        operation: 'findMany',
        args: {where: {userId: 1}},
      });
      await redis.set(key, 'live');

      const result =
        await extendedPrismaWithJsonAndAutoCacheTrue.flushModelCache(
          'GroupOnUsers',
        );

      expect(result.deletedCount).toBe(1);
      expect(await redis.get(key)).toBeNull();
    });

    test('cleanupOrphanedKeys keeps live keys of multi-word models', async () => {
      const key = extendedPrismaWithJsonAndAutoCacheTrue.getAutoKey({
        model: 'GroupOnUsers',
        operation: 'findMany',
        args: {where: {userId: 1}},
      });
      await redis.set(key, 'live');

      const result =
        await extendedPrismaWithJsonAndAutoCacheTrue.cleanupOrphanedKeys(
          ['GroupOnUsers'],
          {dryRun: false},
        );

      expect(result.orphanedKeys).toEqual([]);
      expect(await redis.get(key)).toBe('live');
    });

    test('standalone flushModelCache honors a custom prefix the way keys are written', async () => {
      const getKey = getKeyGen(undefined, undefined, 'MyApp');
      const key = getKey({
        params: [{id: '7'}],
        model: 'User',
        operation: 'findUnique',
      });
      await redis.set(key, 'live');

      const result = await flushModelCache({
        redis,
        model: 'User',
        prefix: 'MyApp',
      });

      expect(result.deletedCount).toBe(1);
      expect(await redis.get(key)).toBeNull();
    });

    test('standalone cleanupOrphanedKeys scans a custom prefix the way keys are written', async () => {
      const getKey = getKeyGen(undefined, undefined, 'MyApp');
      const key = getKey({
        params: [{id: '7'}],
        model: 'User',
        operation: 'findUnique',
      });
      await redis.set(key, 'live');

      const result = await cleanupOrphanedKeys({
        redis,
        validModels: ['User'],
        prefix: 'MyApp',
        dryRun: true,
      });

      expect(result.scannedKeys).toBe(1);
      expect(result.orphanedKeys).toEqual([]);
    });

    test('a custom caseTransformer is honored end to end', async () => {
      const upper = (s: string) => s.toUpperCase();
      const getKey = getKeyGen(undefined, upper, 'prisma');
      const key = getKey({
        params: [{id: '7'}],
        model: 'GroupOnUsers',
        operation: 'findUnique',
      });
      await redis.set(key, 'live');

      const result = await flushModelCache({
        redis,
        model: 'GroupOnUsers',
        prefix: 'prisma',
        caseTransformer: upper,
      });

      expect(result.deletedCount).toBe(1);
      expect(await redis.get(key)).toBeNull();
    });
  });
});
