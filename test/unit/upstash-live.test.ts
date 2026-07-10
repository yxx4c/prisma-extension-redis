import {describe, expect, test} from 'bun:test';
import {Redis} from '@upstash/redis';
import {cache, getCache, uncache} from '../../src';
import {resolveRedisApi} from '../../src/redisApi';
import {runRedisApiConformance} from '../redisApiConformance';

/**
 * Live verification against a real Upstash REST endpoint. Skips
 * entirely unless UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * are set (CI provides them from secrets when configured).
 */
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const live = Boolean(url && token);

const client = live
  ? new Redis({url: url as string, token: token as string})
  : null;
const runPrefix = `pxr-live-${Date.now().toString(36)}`;

describe.skipIf(!live)('Upstash live', () => {
  test('the real client is detected and wrapped', async () => {
    const {api, raw} = resolveRedisApi(client as never);

    expect(raw).toBe(client);
    expect(await api.ping()).toBe('PONG');
  });

  test('JSON cache entries round-trip through the live endpoint', async () => {
    const config = {ttl: 60, stale: 30, type: 'JSON'} as const;
    const key = `${runPrefix}:json`;
    const value = {id: 1, nested: {tags: ['a', 'b']}, when: '2026-01-01'};

    await cache({redis: client as never, config, key, value});
    const read = await getCache({
      ttl: 60,
      stale: 30,
      config,
      key,
      redis: client as never,
      args: {},
      query: async () => {
        throw new Error('database must not be queried');
      },
    });

    expect(read.meta.source).toBe('cache');
    expect(read.result).toEqual(value);

    const {deleted} = await uncache({
      redis: client as never,
      uncacheKeys: [key],
    });
    expect(deleted).toBe(1);
  });

  test('STRING cache entries round-trip through the live endpoint', async () => {
    const config = {ttl: 60, stale: 30, type: 'STRING'} as const;
    const key = `${runPrefix}:string`;

    await cache({redis: client as never, config, key, value: {plain: true}});
    const read = await getCache({
      ttl: 60,
      stale: 30,
      config,
      key,
      redis: client as never,
      args: {},
      query: async () => {
        throw new Error('database must not be queried');
      },
    });

    expect(read.meta.source).toBe('cache');
    expect(read.result).toEqual({plain: true});

    await uncache({redis: client as never, uncacheKeys: [key]});
  });

  test('pattern invalidation scans the live endpoint', async () => {
    const config = {ttl: 60, stale: 30, type: 'STRING'} as const;
    for (const suffix of ['p1', 'p2', 'p3']) {
      await cache({
        redis: client as never,
        config,
        key: `${runPrefix}:pat:${suffix}`,
        value: suffix,
      });
    }

    const {deleted} = await uncache({
      redis: client as never,
      uncacheKeys: [`${runPrefix}:pat:*`],
      hasPattern: true,
    });

    expect(deleted).toBe(3);
  });
});

if (live) {
  runRedisApiConformance('@upstash/redis (live)', async () => ({
    api: resolveRedisApi(client as never).api,
    prefix: `${runPrefix}:conf`,
  }));
}
