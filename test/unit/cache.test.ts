import {describe, expect, test} from 'bun:test';
import {cache, getCache, ValidationError} from '../../src';
import {createFakeRedisApi} from '../fakeRedisApi';

const jsonConfig = {ttl: 60, stale: 30, type: 'JSON'} as const;

describe('cache', () => {
  test('plants an entry that getCache serves as a fresh hit', async () => {
    const fake = createFakeRedisApi();
    const key = 'direct:json:plant';
    const value = {id: 7, name: 'planted'};

    await cache({redis: fake, config: jsonConfig, key, value});

    const read = await getCache({
      ttl: 60,
      stale: 30,
      config: jsonConfig,
      key,
      redis: fake,
      args: {},
      query: async () => {
        throw new Error('database must not be queried');
      },
    });

    expect(read.meta.source).toBe('cache');
    expect(read.meta.isCached).toBe(true);
    expect(read.result).toEqual(value);
  });

  test('round-trips through the STRING cache type', async () => {
    const fake = createFakeRedisApi();
    const config = {ttl: 60, stale: 30, type: 'STRING'} as const;
    const key = 'direct:string:plant';

    await cache({redis: fake, config, key, value: {id: 1}});

    const read = await getCache({
      ttl: 60,
      stale: 30,
      config,
      key,
      redis: fake,
      args: {},
      query: async () => {
        throw new Error('database must not be queried');
      },
    });

    expect(read.meta.source).toBe('cache');
    expect(read.result).toEqual({id: 1});
  });

  test('uses the custom transformer for serialization', async () => {
    const fake = createFakeRedisApi();
    let serialized = 0;
    const config = {
      ...jsonConfig,
      transformer: {
        serialize: (data: unknown) => {
          serialized++;
          return JSON.stringify(data);
        },
        deserialize: (data: unknown) => JSON.parse(data as string),
      },
    };

    await cache({redis: fake, config, key: 'direct:transformed', value: 1});

    expect(serialized).toBe(1);
  });

  test('expires entries after ttl + stale seconds', async () => {
    const fake = createFakeRedisApi();

    await cache({
      redis: fake,
      config: jsonConfig,
      key: 'direct:expiry',
      value: 1,
      ttl: 10,
      stale: 5,
    });

    const entry = fake.store.get('direct:expiry');
    expect(entry?.expiresAt).toBeDefined();
    const lifetimeMs = (entry?.expiresAt ?? 0) - Date.now();
    expect(lifetimeMs).toBeGreaterThan(13_000);
    expect(lifetimeMs).toBeLessThanOrEqual(15_000);
  });

  test('defaults ttl and stale from config, overrides win', async () => {
    const fake = createFakeRedisApi();

    const fromDefaults = await cache({
      redis: fake,
      config: jsonConfig,
      key: 'direct:defaults',
      value: 1,
    });
    expect(fromDefaults.expiresAt).toBe(fromDefaults.cachedAt + 60);
    expect(fromDefaults.staleUntil).toBe(fromDefaults.cachedAt + 60 + 30);

    const overridden = await cache({
      redis: fake,
      config: jsonConfig,
      key: 'direct:overridden',
      value: 1,
      ttl: 120,
      stale: 0,
    });
    expect(overridden.expiresAt).toBe(overridden.cachedAt + 120);
    expect(overridden.staleUntil).toBe(overridden.cachedAt + 120);
  });

  test('rejects an empty key', async () => {
    const fake = createFakeRedisApi();

    expect(
      cache({redis: fake, config: jsonConfig, key: '', value: 1}),
    ).rejects.toThrow(ValidationError);
  });

  test('rejects an invalid cache type', async () => {
    const fake = createFakeRedisApi();
    // @ts-expect-error: Intentionally using invalid type for testing
    const config = {ttl: 60, stale: 30, type: 'INVALID'} as const;

    expect(
      cache({redis: fake, config, key: 'direct:invalid', value: 1}),
    ).rejects.toThrow('Incorrect CacheType provided');
  });
});
