import {afterAll, beforeAll, describe, expect, mock, test} from 'bun:test';
import {PrismaPg} from '@prisma/adapter-pg';
import Redis from 'iovalkey';
import {
  checkHealth,
  cleanupOrphanedKeys,
  createMetricsCollector,
  filterOperations,
  flushModelCache,
  getCache,
  PrismaExtensionRedis,
  type RedisOptions,
  unlinkPatterns,
} from '../../src';
import {createServerClock} from '../../src/redisApi';
import {users} from '../data';
import {createFakeRedisApi} from '../fakeRedisApi';
import {PrismaClient} from '../prisma/generated/prisma/client';

describe('Error Scenarios', () => {
  const client = process.env.REDIS_SERVICE_URI as RedisOptions;
  const redis = new Redis(client);
  const adapter = new PrismaPg({
    connectionString: process.env.POSTGRES_SERVICE_URI,
  });
  const basePrisma = new PrismaClient({adapter});

  // Extended prisma client for test setup (flushing db, etc)
  const _prisma = basePrisma.$extends(
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
    await redis.flushdb();
    // Create test user
    await basePrisma.user.upsert({
      where: {id: 1},
      update: users[0],
      create: users[0],
    });
  });

  afterAll(async () => {
    await redis.flushdb();
    await basePrisma.user.deleteMany({where: {id: 1}});
    await basePrisma.$disconnect();
    await redis.quit();
  });

  describe('Deserialization Errors', () => {
    test('should handle corrupted JSON in cache gracefully', async () => {
      const key = 'test:corrupted:json';

      // Store a valid JSON that is NOT a valid CacheContext structure
      // This will cause JSON.parse to succeed but the structure will be invalid
      await redis.call(
        'JSON.SET',
        key,
        '$',
        '"just a string, not cache context"',
      );

      const metricsCollector = createMetricsCollector();
      const onError = mock(() => {});
      const onMiss = mock(() => {});

      const result = await getCache({
        ttl: 60,
        stale: 30,
        config: {
          ttl: 60,
          stale: 30,
          type: 'JSON',
          metricsCollector,
          onError,
          onMiss,
          // Use a transformer that throws on invalid data
          transformer: {
            deserialize: (data: string) => {
              const parsed = JSON.parse(data);
              if (typeof parsed !== 'object' || !parsed.isCached) {
                throw new Error('Invalid cache context structure');
              }
              return parsed;
            },
            serialize: JSON.stringify,
          },
        },
        key,
        redis,
        args: {},
        query: async () => ({id: 1, name: 'Test'}),
      });

      // Should fall back to database query
      expect(result.result).toEqual({id: 1, name: 'Test'});
      expect(result.meta.source).toBe('db');
      expect(result.meta.isCached).toBe(false);

      // Should have recorded error
      expect(onError).toHaveBeenCalled();
      expect(onMiss).toHaveBeenCalled();

      const metrics = metricsCollector.getMetrics();
      expect(metrics.errors).toBeGreaterThan(0);

      await redis.del(key);
    });

    test('should handle corrupted STRING cache gracefully', async () => {
      const key = 'test:corrupted:string';

      // Store corrupted JSON as string
      await redis.set(key, 'not valid json {{{');

      const onError = mock(() => {});

      const result = await getCache({
        ttl: 60,
        stale: 30,
        config: {
          ttl: 60,
          stale: 30,
          type: 'STRING',
          onError,
        },
        key,
        redis,
        args: {},
        query: async () => ({id: 2, name: 'Fallback'}),
      });

      expect(result.result).toEqual({id: 2, name: 'Fallback'});
      expect(result.meta.source).toBe('db');
      expect(onError).toHaveBeenCalled();

      await redis.del(key);
    });

    test('should track errors in meta when deserialization fails', async () => {
      const key = 'test:corrupted:with:errors';

      // Store invalid JSON as STRING type
      await redis.set(key, '{broken json not valid');

      const result = await getCache({
        ttl: 60,
        stale: 30,
        config: {
          ttl: 60,
          stale: 30,
          type: 'STRING',
        },
        key,
        redis,
        args: {},
        query: async () => ({recovered: true}),
      });

      expect(result.meta.errors).toBeDefined();
      expect(result.meta.errors?.cacheRead).toBeInstanceOf(Error);

      await redis.del(key);
    });
  });

  describe('Cache Write Errors', () => {
    test('should handle write errors with custom transformer that throws', async () => {
      const key = 'test:write:error';

      const onError = mock(() => {});
      const metricsCollector = createMetricsCollector();

      // First call will succeed and cache
      await getCache({
        ttl: 60,
        stale: 30,
        config: {
          ttl: 60,
          stale: 30,
          type: 'JSON',
          onError,
          metricsCollector,
          transformer: {
            serialize: () => {
              throw new Error('Serialization failed');
            },
            deserialize: JSON.parse,
          },
        },
        key,
        redis,
        args: {},
        query: async () => ({id: 1}),
      });

      expect(onError).toHaveBeenCalled();
      const metrics = metricsCollector.getMetrics();
      expect(metrics.errors).toBeGreaterThan(0);

      await redis.del(key);
    });
  });

  describe('Background Refresh Errors', () => {
    test('should handle background refresh errors gracefully', async () => {
      const key = 'test:background:refresh:error';

      // Store valid cache data that is stale
      const staleTimestamp = Date.now() / 1000 - 120; // 2 minutes ago
      const cacheData = {
        isCached: true,
        result: {id: 1, name: 'Stale Data'},
        stale: 300, // 5 minutes stale window
        timestamp: staleTimestamp,
        ttl: 60, // 1 minute TTL (expired)
      };

      await redis.call('JSON.SET', key, '$', JSON.stringify(cacheData));

      const onError = mock(() => {});
      const metricsCollector = createMetricsCollector();

      const result = await getCache({
        ttl: 60,
        stale: 300,
        config: {
          ttl: 60,
          stale: 300,
          type: 'JSON',
          onError,
          metricsCollector,
        },
        key,
        redis,
        args: {},
        query: async () => {
          // Background refresh will fail
          throw new Error('Database connection failed');
        },
      });

      // Should return stale data immediately
      expect(result.result).toEqual({id: 1, name: 'Stale Data'});
      expect(result.meta.source).toBe('stale-cache');

      // Wait for background refresh to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Error should have been reported
      expect(onError).toHaveBeenCalled();

      await redis.del(key);
    });
  });

  describe('toError Helper', () => {
    test('should convert string error to Error instance', async () => {
      const key = 'test:toError:string';

      // Reject with a string (not an Error instance) to trigger toError conversion
      const mockRedis = createFakeRedisApi({
        jsonGet: () => Promise.reject('Redis string error'),
      });

      const onError = mock(() => {});

      const result = await getCache({
        ttl: 60,
        stale: 30,
        config: {
          ttl: 60,
          stale: 30,
          type: 'JSON',
          onError,
        },
        key,
        redis: mockRedis,
        args: {},
        query: async () => ({id: 1}),
      });

      expect(onError).toHaveBeenCalled();
      // The string error should be converted to Error and tracked
      expect(result.meta.errors?.cacheRead).toBeInstanceOf(Error);
      expect(result.meta.errors?.cacheRead?.message).toBe('Redis string error');
    });

    test('should convert number error to Error instance', async () => {
      const key = 'test:toError:number';

      // Reject with a number to trigger toError conversion
      const mockRedis = createFakeRedisApi({
        jsonGet: () => Promise.reject(42),
      });

      const result = await getCache({
        ttl: 60,
        stale: 30,
        config: {
          ttl: 60,
          stale: 30,
          type: 'JSON',
        },
        key,
        redis: mockRedis,
        args: {},
        query: async () => ({id: 1}),
      });

      expect(result.meta.errors?.cacheRead).toBeInstanceOf(Error);
      expect(result.meta.errors?.cacheRead?.message).toBe('42');
    });

    test('should convert object error to Error instance', async () => {
      const key = 'test:toError:object';

      // Reject with a plain object (not Error instance) to trigger toError conversion
      const mockRedis = createFakeRedisApi({
        jsonGet: () => Promise.reject({code: 'ERR', msg: 'failed'}),
      });

      const result = await getCache({
        ttl: 60,
        stale: 30,
        config: {
          ttl: 60,
          stale: 30,
          type: 'JSON',
        },
        key,
        redis: mockRedis,
        args: {},
        query: async () => ({id: 1}),
      });

      expect(result.meta.errors?.cacheRead).toBeInstanceOf(Error);
      // Object.toString() gives [object Object]
      expect(result.meta.errors?.cacheRead?.message).toBe('[object Object]');
    });
  });
});

describe('Health Check Error Scenarios', () => {
  test('should return unhealthy status when Redis throws', async () => {
    // A client that throws on ping
    const mockRedis = createFakeRedisApi({
      ping: async () => {
        throw new Error('Connection refused');
      },
    });

    const result = await checkHealth(mockRedis);

    expect(result.status).toBe('unhealthy');
    expect(result.connected).toBe(false);
    expect(result.error).toContain('Connection refused');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('should return unhealthy with string error', async () => {
    const mockRedis = createFakeRedisApi({
      ping: async () => {
        throw 'String error message';
      },
    });

    const result = await checkHealth(mockRedis);

    expect(result.status).toBe('unhealthy');
    expect(result.connected).toBe(false);
    expect(result.error).toBe('String error message');
  });
});

describe('Maintenance Batch Operations', () => {
  const client = process.env.REDIS_SERVICE_URI as RedisOptions;
  const redis = new Redis(client);

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  describe('cleanupOrphanedKeys with batch deletion', () => {
    test('should batch delete when buffer exceeds batchSize', async () => {
      await redis.flushdb();

      // Create many orphaned keys (more than batchSize)
      const keysToCreate = 15;
      for (let i = 0; i < keysToCreate; i++) {
        await redis.set(`prisma:OrphanedModel:key${i}`, 'value');
      }

      const onProgress = mock(() => {});

      const result = await cleanupOrphanedKeys({
        redis,
        validModels: ['User', 'Post'], // OrphanedModel is not valid
        prefix: 'prisma',
        delimiter: ':',
        batchSize: 5, // Small batch size to trigger batching
        onProgress,
      });

      expect(result.deletedCount).toBe(keysToCreate);
      expect(onProgress).toHaveBeenCalled();
    });

    test('should handle dryRun mode without deleting', async () => {
      await redis.flushdb();

      // Create orphaned keys
      for (let i = 0; i < 5; i++) {
        await redis.set(`prisma:OldModel:key${i}`, 'value');
      }

      const result = await cleanupOrphanedKeys({
        redis,
        validModels: ['User'],
        prefix: 'prisma',
        delimiter: ':',
        dryRun: true,
      });

      expect(result.deletedCount).toBe(0);
      expect(result.orphanedKeys.length).toBe(5);

      // Keys should still exist
      const remainingKeys = await redis.keys('prisma:OldModel:*');
      expect(remainingKeys.length).toBe(5);

      await redis.flushdb();
    });
  });

  describe('flushModelCache with batch deletion', () => {
    test('should batch delete when many keys exist', async () => {
      await redis.flushdb();

      // Create many keys for a model (more than batchSize)
      // Note: flushModelCache uses lowercase model name in pattern
      const keysToCreate = 20;
      for (let i = 0; i < keysToCreate; i++) {
        await redis.set(`prisma:testmodel:operation:${i}`, 'value');
      }

      // Verify keys were created
      const createdKeys = await redis.keys('prisma:testmodel:*');
      expect(createdKeys.length).toBe(keysToCreate);

      const result = await flushModelCache({
        redis,
        model: 'TestModel', // Will be lowercased to 'testmodel'
        prefix: 'prisma',
        delimiter: ':',
        batchSize: 5, // Small batch to trigger batching
      });

      expect(result.deletedCount).toBe(keysToCreate);

      // Verify all keys are deleted
      const remainingKeys = await redis.keys('prisma:testmodel:*');
      expect(remainingKeys.length).toBe(0);
    });

    test('should handle partial batch at end', async () => {
      await redis.flushdb();

      // Create 7 keys with proper model pattern (will be 1 full batch of 5 + partial batch of 2)
      // Note: flushModelCache uses lowercase model name in pattern
      for (let i = 0; i < 7; i++) {
        await redis.set(`prisma:partialmodel:findUnique:${i}`, 'value');
      }

      // Verify keys were created
      const createdKeys = await redis.keys('prisma:partialmodel:*');
      expect(createdKeys.length).toBe(7);

      const result = await flushModelCache({
        redis,
        model: 'PartialModel', // Will be lowercased to 'partialmodel'
        prefix: 'prisma',
        delimiter: ':',
        batchSize: 5,
      });

      expect(result.deletedCount).toBe(7);
    });
  });

  describe('Stream error handling', () => {
    test('cleanupOrphanedKeys should reject on scan error', async () => {
      const mockRedis = createFakeRedisApi({
        scan: () => Promise.reject(new Error('Stream error')),
      });

      await expect(
        cleanupOrphanedKeys({
          redis: mockRedis,
          validModels: ['User'],
          prefix: 'prisma',
          delimiter: ':',
        }),
      ).rejects.toThrow('Stream error');
    });
  });
});

describe('Expired Beyond Stale Window', () => {
  test('cached entry past ttl + stale falls through to a database query', async () => {
    const fake = createFakeRedisApi();
    const key = 'test:expired:beyond:stale';

    // Plant an entry whose logical timestamps are long past ttl + stale
    // while it still physically exists (Redis eviction is not instant)
    const staleContext = {
      isCached: true,
      result: {id: 'stale-old'},
      stale: 30,
      timestamp: Math.floor(Date.now() / 1000) - 1000,
      ttl: 60,
    };
    await fake.jsonSet(key, JSON.stringify(staleContext));

    const onHit = mock(() => {});
    const onMiss = mock(() => {});

    const result = await getCache({
      ttl: 60,
      stale: 30,
      config: {ttl: 60, stale: 30, type: 'JSON', onHit, onMiss},
      key,
      redis: fake,
      args: {},
      query: async () => ({id: 'fresh-from-db'}),
    });

    // The stale entry is ignored and the database result is returned
    expect(result.result).toEqual({id: 'fresh-from-db'});
    expect(result.meta.source).toBe('db');
    expect(result.meta.isCached).toBe(false);
    // The entry was found (hit callback) but unusable (miss outcome)
    expect(onHit).toHaveBeenCalled();
    expect(onMiss).toHaveBeenCalled();
  });
});

describe('Cache Read Error Scenarios', () => {
  const client = process.env.REDIS_SERVICE_URI as RedisOptions;
  const redis = new Redis(client);

  afterAll(async () => {
    await redis.quit();
  });

  test('should handle Redis exec returning error', async () => {
    const key = 'test:redis:error';

    // A client whose read rejects
    const mockRedis = createFakeRedisApi({
      jsonGet: () => Promise.reject(new Error('Redis internal error')),
    });

    const onError = mock(() => {});
    const metricsCollector = createMetricsCollector();

    const result = await getCache({
      ttl: 60,
      stale: 30,
      config: {
        ttl: 60,
        stale: 30,
        type: 'JSON',
        onError,
        metricsCollector,
      },
      key,
      redis: mockRedis,
      args: {},
      query: async () => ({id: 1, name: 'From DB'}),
    });

    // Should fall back to DB
    expect(result.result).toEqual({id: 1, name: 'From DB'});
    expect(onError).toHaveBeenCalled();
    expect(metricsCollector.getMetrics().errors).toBeGreaterThan(0);
  });

  test('should track cacheRead error in meta', async () => {
    const key = 'test:redis:error:meta';

    const mockRedis = createFakeRedisApi({
      jsonGet: () => Promise.reject(new Error('Read failed')),
    });

    const result = await getCache({
      ttl: 60,
      stale: 30,
      config: {
        ttl: 60,
        stale: 30,
        type: 'JSON',
      },
      key,
      redis: mockRedis,
      args: {},
      query: async () => ({recovered: true}),
    });

    expect(result.meta.errors?.cacheRead).toBeInstanceOf(Error);
  });
});

describe('Write Error After Deserialization Failure', () => {
  test('should handle write error after deserialization failure', async () => {
    const key = 'test:deser:then:write:error';

    // Corrupted data on read, then a failing write
    const mockRedis = createFakeRedisApi({
      jsonGet: async () => '{not valid json}}}',
      jsonSet: () => Promise.reject(new Error('Write failed')),
    });

    const onError = mock(() => {});
    const metricsCollector = createMetricsCollector();

    const result = await getCache({
      ttl: 60,
      stale: 30,
      config: {
        ttl: 60,
        stale: 30,
        type: 'JSON',
        onError,
        metricsCollector,
      },
      key,
      redis: mockRedis,
      args: {},
      query: async () => ({id: 1}),
    });

    // Should still return the query result
    expect(result.result).toEqual({id: 1});
    // Errors should be tracked (deserialization + write)
    expect(metricsCollector.getMetrics().errors).toBeGreaterThan(0);
    expect(onError).toHaveBeenCalled();
  });

  test('should handle serialization error after deserialization failure', async () => {
    const key = 'test:deser:then:serialize:error';

    // Corrupted data on read triggers the deserialization failure
    const mockRedis = createFakeRedisApi({
      jsonGet: async () => 'not json at all',
    });

    const onError = mock(() => {});
    const metricsCollector = createMetricsCollector();

    const result = await getCache({
      ttl: 60,
      stale: 30,
      config: {
        ttl: 60,
        stale: 30,
        type: 'JSON',
        onError,
        metricsCollector,
        // Transformer that fails on serialize (after deserialization failure)
        transformer: {
          deserialize: JSON.parse, // Will fail on corrupted data
          serialize: () => {
            throw new Error('Serialization failed');
          },
        },
      },
      key,
      redis: mockRedis,
      args: {},
      query: async () => ({id: 1}),
    });

    // Should still return the query result
    expect(result.result).toEqual({id: 1});
    // Should have recorded errors (deserialization + serialization)
    expect(metricsCollector.getMetrics().errors).toBeGreaterThanOrEqual(2);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});

describe('filterOperations Edge Cases', () => {
  test('should return all operations when excluded is undefined', () => {
    const ops = ['findUnique', 'findFirst', 'findMany'] as const;
    const filter = filterOperations(...ops);

    // Call with undefined to trigger the falsy branch
    const result = filter(undefined);

    expect(result).toEqual(ops);
  });

  test('should filter operations when excluded is provided', () => {
    const ops = ['findUnique', 'findFirst', 'findMany'] as const;
    const filter = filterOperations(...ops);

    const result = filter(['findFirst']);

    expect(result).toEqual(['findUnique', 'findMany']);
  });
});

describe('Invalid Cache Type in getCache', () => {
  test('should throw error for invalid cache type', async () => {
    const key = 'test:invalid:type';
    const mockRedis = {
      multi: () => ({
        call: () => mockRedis.multi(),
        exec: async () => [[null, null]],
      }),
      del: async () => 1,
    };

    await expect(
      getCache({
        ttl: 60,
        stale: 30,
        config: {
          ttl: 60,
          stale: 30,
          // @ts-expect-error: Testing invalid type
          type: 'INVALID',
        },
        key,
        redis: mockRedis as unknown as Redis,
        args: {},
        query: async () => ({id: 1}),
      }),
    ).rejects.toThrow('Incorrect CacheType provided');
  });
});

describe('unlinkPatterns Scan Error', () => {
  test('should reject when scan fails', async () => {
    const mockRedis = createFakeRedisApi({
      scan: () => Promise.reject(new Error('Scan stream error')),
    });

    const promises = unlinkPatterns({
      redis: mockRedis,
      patterns: ['test:*'],
    });

    await expect(Promise.all(promises)).rejects.toThrow('Scan stream error');
  });
});

describe('ServerClock', () => {
  test('uses the Redis server time once synced', async () => {
    // Server clock fixed 100 seconds ahead of local time
    const serverSeconds = Math.floor(Date.now() / 1000) + 100;
    const api = createFakeRedisApi({time: async () => serverSeconds});

    const clock = createServerClock(api);
    await clock.prime();

    expect(Math.abs(clock.nowSeconds() - serverSeconds)).toBeLessThanOrEqual(2);
  });

  test('server-adjusted timestamps flow into cache meta', async () => {
    const serverSeconds = Math.floor(Date.now() / 1000) + 100;
    const api = createFakeRedisApi({time: async () => serverSeconds});
    const clock = createServerClock(api);
    await clock.prime();

    const result = await getCache({
      ttl: 60,
      stale: 30,
      config: {ttl: 60, stale: 30, type: 'JSON'},
      key: 'test:redis:time:valid',
      redis: api,
      args: {},
      query: async () => ({id: 1}),
      clock,
    });

    expect(Math.abs(result.meta.cachedAt - serverSeconds)).toBeLessThanOrEqual(
      2,
    );
    expect(result.meta.expiresAt).toBe(result.meta.cachedAt + 60);
    expect(result.meta.staleUntil).toBe(result.meta.cachedAt + 60 + 30);
  });

  test('reports sync failures and falls back to the local clock', async () => {
    const onSyncError = mock(() => {});
    const api = createFakeRedisApi({
      time: () => Promise.reject(new Error('TIME unavailable')),
    });

    const clock = createServerClock(api, onSyncError);
    await clock.prime();

    expect(onSyncError).toHaveBeenCalledTimes(1);
    expect(
      Math.abs(clock.nowSeconds() - Date.now() / 1000),
    ).toBeLessThanOrEqual(2);
  });

  test('runs on the local clock when the client has no TIME support', async () => {
    const api = createFakeRedisApi();
    api.time = undefined;

    const clock = createServerClock(api);
    await clock.prime();

    expect(
      Math.abs(clock.nowSeconds() - Date.now() / 1000),
    ).toBeLessThanOrEqual(2);
  });
});

describe('cleanupOrphanedKeys Delete Promise Rejection', () => {
  test('should reject when unlink fails', async () => {
    const mockRedis = createFakeRedisApi({
      scan: async () => ({
        cursor: '0',
        keys: ['prisma:orphaned:key1', 'prisma:orphaned:key2'],
      }),
      unlink: () => Promise.reject(new Error('Unlink failed')),
    });

    await expect(
      cleanupOrphanedKeys({
        redis: mockRedis,
        validModels: ['User'],
        prefix: 'prisma',
        delimiter: ':',
        dryRun: false,
      }),
    ).rejects.toThrow('Unlink failed');
  });
});

describe('flushModelCache Invalid Model Name', () => {
  test('should throw error for model name with wildcard', async () => {
    const mockRedis = {} as Redis;

    await expect(
      flushModelCache({
        redis: mockRedis,
        model: 'User*',
        prefix: 'prisma',
        delimiter: ':',
      }),
    ).rejects.toThrow('Invalid model name');
  });

  test('should throw error for model name with hyphen', async () => {
    const mockRedis = {} as Redis;

    await expect(
      flushModelCache({
        redis: mockRedis,
        model: 'my-model',
        prefix: 'prisma',
        delimiter: ':',
      }),
    ).rejects.toThrow('Invalid model name');
  });

  test('should throw error for model name starting with number', async () => {
    const mockRedis = {} as Redis;

    await expect(
      flushModelCache({
        redis: mockRedis,
        model: '123Model',
        prefix: 'prisma',
        delimiter: ':',
      }),
    ).rejects.toThrow('Invalid model name');
  });
});
