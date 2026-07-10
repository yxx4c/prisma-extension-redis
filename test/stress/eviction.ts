/**
 * Eviction-pressure leg: the cache store is capped well below the
 * working set (e.g. redis-stack with --maxmemory 64mb and
 * allkeys-lru), so the server evicts entries underneath the extension.
 * Run on demand:
 *
 *   REDIS_SERVICE_URI=redis://... bun test/stress/eviction.ts
 *
 * Proves: every read still resolves with the correct value — evicted
 * entries degrade to database misses and re-cache; nothing throws.
 */

import Redis from 'iovalkey';
import {cache, getCache, uncache} from '../../src';
import {resolveRedisApi} from '../../src/redisApi';

const uri = process.env.REDIS_SERVICE_URI;
if (!uri) {
  console.error('REDIS_SERVICE_URI is required');
  process.exit(1);
}

const client = new Redis(uri);
const {api} = resolveRedisApi(client);
const prefix = `evict:${Date.now()}`;
// STRING type: RedisJSON document memory is invisible to maxmemory
// accounting (observed on Stack 7.4 and Redis 8), so LRU eviction can
// only be exercised against core-accounted string values
const config = {ttl: 300, stale: 60, type: 'STRING'} as const;

const KEYS = 2400;
const VALUE = 'v'.repeat(64 * 1024); // ~64KB -> ~150MB working set vs 64MB cap

const run = async () => {
  console.log(`eviction: writing ${KEYS} entries of 64KB into a 64MB LRU cap`);
  let writeErrors = 0;
  for (let i = 0; i < KEYS; i++) {
    try {
      await cache({
        redis: api,
        config,
        key: `${prefix}:${i}`,
        value: {payload: VALUE, i},
      });
    } catch {
      writeErrors++;
    }
  }

  const evicted = Number(
    (await client.info('stats')).match(/evicted_keys:(\d+)/)?.[1] ?? 0,
  );
  console.log(`server evicted_keys=${evicted} writeErrors=${writeErrors}`);

  let fromCache = 0;
  let fromDb = 0;
  let failures = 0;
  for (let i = 0; i < KEYS; i++) {
    try {
      const read = await getCache({
        ttl: config.ttl,
        stale: config.stale,
        config,
        key: `${prefix}:${i}`,
        redis: api,
        args: {},
        query: async () => ({payload: VALUE, i}),
      });
      const result = read.result as {payload: string; i: number};
      if (result.i !== i || result.payload.length !== VALUE.length) {
        failures++;
      } else if (read.meta.source === 'db') {
        fromDb++;
      } else {
        fromCache++;
      }
    } catch {
      failures++;
    }
  }

  console.log(
    `reads: fromCache=${fromCache} fromDb=${fromDb} failures=${failures}`,
  );

  await uncache({redis: api, uncacheKeys: [`${prefix}:*`], hasPattern: true});
  client.disconnect();

  const ok = failures === 0 && evicted > 0 && fromDb > 0 && fromCache > 0;
  if (!ok) {
    console.error('EVICTION LEG FAILED');
    process.exit(1);
  }
  console.log('EVICTION LEG PASSED');
  process.exit(0);
};

void run();
