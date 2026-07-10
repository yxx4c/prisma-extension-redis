import {describe, expect, test} from 'bun:test';
import {promiseCoalesceGetCache} from '../../src';
import type {RedisClientInput} from '../../src/redisApi';
import {createFakeRedisApi} from '../fakeRedisApi';
import {delay} from '../functions';

const params = (
  redis: RedisClientInput,
  type: 'JSON' | 'STRING',
  onQuery: () => void,
) => ({
  ttl: 60,
  stale: 30,
  config: {ttl: 60, stale: 30, type} as const,
  key: 'shared:key',
  redis,
  args: {},
  query: async () => {
    await delay(20);
    onQuery();
    return {ok: true};
  },
});

describe('per-instance scoping', () => {
  test('concurrent identical keys on different clients execute independently', async () => {
    const clientA = createFakeRedisApi();
    const clientB = createFakeRedisApi();
    let aQueries = 0;
    let bQueries = 0;

    await Promise.all([
      promiseCoalesceGetCache(params(clientA, 'JSON', () => aQueries++)),
      promiseCoalesceGetCache(params(clientB, 'JSON', () => bQueries++)),
    ]);

    expect(aQueries).toBe(1);
    expect(bQueries).toBe(1);
    expect(clientA.store.size).toBe(1);
    expect(clientB.store.size).toBe(1);
  });

  test('concurrent identical keys with different cache types execute independently', async () => {
    const client = createFakeRedisApi();
    let jsonQueries = 0;
    let stringQueries = 0;

    await Promise.all([
      promiseCoalesceGetCache(params(client, 'JSON', () => jsonQueries++)),
      promiseCoalesceGetCache(params(client, 'STRING', () => stringQueries++)),
    ]);

    expect(jsonQueries).toBe(1);
    expect(stringQueries).toBe(1);
  });

  test('same client, type, and key still coalesce to one execution', async () => {
    const client = createFakeRedisApi();
    let queries = 0;

    await Promise.all([
      promiseCoalesceGetCache(params(client, 'JSON', () => queries++)),
      promiseCoalesceGetCache(params(client, 'JSON', () => queries++)),
    ]);

    expect(queries).toBe(1);
  });

  test('background refreshes for the same key run per client', async () => {
    const clientA = createFakeRedisApi();
    const clientB = createFakeRedisApi();
    const staleContext = (marker: string) => ({
      isCached: true,
      result: {from: marker},
      stale: 3600,
      timestamp: Math.floor(Date.now() / 1000) - 100,
      ttl: 1,
    });
    await clientA.jsonSet('shared:key', JSON.stringify(staleContext('a')));
    await clientB.jsonSet('shared:key', JSON.stringify(staleContext('b')));

    let aRefreshes = 0;
    let bRefreshes = 0;

    await Promise.all([
      promiseCoalesceGetCache(params(clientA, 'JSON', () => aRefreshes++)),
      promiseCoalesceGetCache(params(clientB, 'JSON', () => bRefreshes++)),
    ]);
    await delay(50);

    expect(aRefreshes).toBe(1);
    expect(bRefreshes).toBe(1);
  });
});
