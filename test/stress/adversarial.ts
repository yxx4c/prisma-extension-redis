/**
 * Adversarial edges, run on demand against a JSON-capable server:
 *
 *   REDIS_SERVICE_URI=redis://... bun test/stress/adversarial.ts
 *
 * 1. 1MB payloads round-trip intact through both cache types
 * 2. a 10k-key pattern-invalidation storm completes with exact counts
 * 3. cache timestamps follow the server clock under heavy skew
 * 4. concurrent readers, writers, and invalidation storms on the same
 *    keyspace never deadlock and never corrupt a result
 */

import Redis from 'iovalkey';
import {
  cache,
  getCache,
  promiseCoalesceGetCache,
  type RedisApi,
  uncache,
} from '../../src';
import {createServerClock, resolveRedisApi} from '../../src/redisApi';

const uri = process.env.REDIS_SERVICE_URI;
if (!uri) {
  console.error('REDIS_SERVICE_URI is required');
  process.exit(1);
}

const client = new Redis(uri);
const {api} = resolveRedisApi(client);
const prefix = `adv:${Date.now()}`;

let failed = false;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(
    `${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` (${detail})` : ''}`,
  );
  if (!ok) failed = true;
};

const bigPayloads = async () => {
  const megabyte = 'm'.repeat(1024 * 1024);
  for (const type of ['JSON', 'STRING'] as const) {
    const config = {ttl: 60, stale: 30, type} as const;
    const key = `${prefix}:big:${type}`;
    await cache({redis: api, config, key, value: {megabyte, type}});
    const read = await getCache({
      ttl: 60,
      stale: 30,
      config,
      key,
      redis: api,
      args: {},
      query: async () => {
        throw new Error('must be served from cache');
      },
    });
    const result = read.result as {megabyte: string; type: string};
    check(
      `1MB payload round-trips via ${type}`,
      read.meta.source === 'cache' &&
        result.megabyte.length === megabyte.length &&
        result.type === type,
    );
  }
};

const invalidationStorm = async () => {
  const config = {ttl: 300, stale: 60, type: 'STRING'} as const;
  const writes = Array.from({length: 10_000}, (_, i) =>
    cache({
      redis: api,
      config,
      key: `${prefix}:storm:${i}`,
      value: i,
    }),
  );
  await Promise.all(writes);

  const started = performance.now();
  const {deleted} = await uncache({
    redis: api,
    uncacheKeys: [`${prefix}:storm:*`],
    hasPattern: true,
  });
  const ms = performance.now() - started;
  check(
    '10k-key pattern invalidation storm deletes exactly 10000',
    deleted === 10_000,
    `${ms.toFixed(0)}ms`,
  );
};

const clockSkew = async () => {
  const SKEW_SECONDS = 3600;
  const skewed: RedisApi = {
    ...api,
    time: async () => Math.floor(Date.now() / 1000) + SKEW_SECONDS,
  };
  const clock = createServerClock(skewed);
  await clock.prime();

  const config = {ttl: 60, stale: 30, type: 'JSON'} as const;
  const key = `${prefix}:skew`;
  const written = await cache({redis: skewed, config, key, value: 1, clock});
  const drift =
    written.cachedAt - (Math.floor(Date.now() / 1000) + SKEW_SECONDS);
  check(
    'cache timestamps follow the server clock under 1h skew',
    Math.abs(drift) <= 2,
    `drift ${drift}s`,
  );

  const read = await getCache({
    ttl: 60,
    stale: 30,
    config,
    key,
    redis: skewed,
    args: {},
    clock,
    query: async () => {
      throw new Error('must be fresh on the skewed clock');
    },
  });
  check(
    'reads on the same skewed clock see the entry as fresh',
    read.meta.source === 'cache',
  );
};

const concurrentMixedTraffic = async () => {
  const config = {ttl: 2, stale: 1, type: 'JSON'} as const;
  const keys = 50;
  let failures = 0;
  let resolved = 0;

  const readers = Array.from({length: 500}, (_, i) =>
    (async () => {
      for (let round = 0; round < 20; round++) {
        try {
          const read = await promiseCoalesceGetCache({
            ttl: config.ttl,
            stale: config.stale,
            config,
            key: `${prefix}:mixed:${(i + round) % keys}`,
            redis: api,
            args: {},
            query: async () => ({ok: true}),
          });
          if ((read.result as {ok: boolean}).ok !== true) failures++;
          resolved++;
        } catch {
          failures++;
        }
      }
    })(),
  );

  const writers = Array.from({length: 5}, (_, w) =>
    (async () => {
      for (let round = 0; round < 20; round++) {
        try {
          await cache({
            redis: api,
            config,
            key: `${prefix}:mixed:${(w * 7 + round) % keys}`,
            value: {ok: true},
          });
          await uncache({
            redis: api,
            uncacheKeys: [`${prefix}:mixed:${(w + round) % 10}*`],
            hasPattern: true,
          });
        } catch {
          failures++;
        }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    })(),
  );

  await Promise.all([...readers, ...writers]);
  check(
    'concurrent readers, writers, and storms: all resolve, none corrupt',
    failures === 0 && resolved === 10_000,
    `resolved=${resolved} failures=${failures}`,
  );
};

const run = async () => {
  await bigPayloads();
  await invalidationStorm();
  await clockSkew();
  await concurrentMixedTraffic();

  await uncache({redis: api, uncacheKeys: [`${prefix}:*`], hasPattern: true});
  client.disconnect();

  console.log(failed ? 'ADVERSARIAL LEG FAILED' : 'ADVERSARIAL LEG PASSED');
  process.exit(failed ? 1 : 0);
};

void run();
