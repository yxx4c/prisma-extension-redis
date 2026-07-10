import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const esm = await import('../../dist/index.mjs');
const require = createRequire(import.meta.url);
const cjs = require('../../dist/index.js');

const createMemoryAdapter = () => {
  const store = new Map();
  const alive = key => {
    const entry = store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return false;
    }
    return true;
  };
  const write = (key, value, ttl) => {
    store.set(key, {
      value,
      expiresAt:
        ttl !== undefined && ttl > 0 ? Date.now() + ttl * 1000 : undefined,
    });
  };
  const remove = keys => {
    let n = 0;
    for (const key of keys) if (alive(key) && store.delete(key)) n++;
    return n;
  };
  return {
    store,
    get: async key => (alive(key) ? store.get(key).value : null),
    set: async (key, value, ttl) => write(key, value, ttl),
    jsonGet: async key => (alive(key) ? store.get(key).value : null),
    jsonSet: async (key, value, ttl) => write(key, value, ttl),
    del: async keys => remove(keys),
    unlink: async keys => remove(keys),
    scan: async (_cursor, match) => {
      const regex = new RegExp(
        `^${match
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')}$`,
      );
      return {
        cursor: '0',
        keys: [...store.keys()].filter(k => alive(k) && regex.test(k)),
      };
    },
    time: async () => Math.floor(Date.now() / 1000),
    ping: async () => 'PONG',
  };
};

test('CJS and ESM entry points expose the same API', () => {
  for (const mod of [esm, cjs]) {
    assert.equal(typeof mod.PrismaExtensionRedis, 'function');
    assert.equal(typeof mod.cache, 'function');
    assert.equal(typeof mod.uncache, 'function');
    assert.equal(typeof mod.stableHash, 'function');
    assert.equal(typeof mod.coalesce, 'function');
  }
});

test('stableHash and coalesce behave under Node', async () => {
  assert.equal(esm.stableHash({a: 1, b: 2}), esm.stableHash({b: 2, a: 1}));
  assert.notEqual(esm.stableHash('1'), esm.stableHash(1));

  let calls = 0;
  const work = async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return calls;
  };
  const results = await Promise.all([
    esm.coalesce('node-smoke', work),
    esm.coalesce('node-smoke', work),
  ]);
  assert.deepEqual(results, [1, 1]);
  assert.equal(calls, 1);
});

test('cache/getCache/uncache round-trip on a custom adapter under Node', async () => {
  const adapter = createMemoryAdapter();
  const config = {ttl: 60, stale: 30, type: 'JSON'};

  await esm.cache({redis: adapter, config, key: 'node:k', value: {id: 7}});
  const read = await esm.getCache({
    ttl: 60,
    stale: 30,
    config,
    key: 'node:k',
    redis: adapter,
    args: {},
    query: async () => {
      throw new Error('database must not be queried');
    },
  });
  assert.equal(read.meta.source, 'cache');
  assert.deepEqual(read.result, {id: 7});

  const {deleted} = await esm.uncache({
    redis: adapter,
    uncacheKeys: ['node:k'],
  });
  assert.equal(deleted, 1);
  assert.equal(adapter.store.size, 0);
});

test('extension constructs with a custom adapter under Node', () => {
  const extension = esm.PrismaExtensionRedis({
    config: {ttl: 5, stale: 2, auto: true, type: 'JSON'},
    client: createMemoryAdapter(),
  });
  assert.equal(typeof extension, 'function');
});

test('live Redis round-trip when REDIS_SERVICE_URI is provided', {
  skip: !process.env.REDIS_SERVICE_URI,
}, async () => {
  const {api} = esm.resolveRedisApi(process.env.REDIS_SERVICE_URI);
  assert.equal(await api.ping(), 'PONG');

  const key = `node-smoke:${Date.now()}`;
  await esm.cache({
    redis: api,
    config: {ttl: 30, stale: 10, type: 'JSON'},
    key,
    value: {node: true},
  });
  const read = await esm.getCache({
    ttl: 30,
    stale: 10,
    config: {ttl: 30, stale: 10, type: 'JSON'},
    key,
    redis: api,
    args: {},
    query: async () => {
      throw new Error('database must not be queried');
    },
  });
  assert.equal(read.meta.source, 'cache');
  const {deleted} = await esm.uncache({redis: api, uncacheKeys: [key]});
  assert.equal(deleted, 1);
});
