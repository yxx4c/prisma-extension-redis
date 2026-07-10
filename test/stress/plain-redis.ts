/**
 * Plain-Redis leg: behavior against a server WITHOUT the RedisJSON
 * module. Run on demand against e.g. redis:alpine:
 *
 *   REDIS_SERVICE_URI=redis://... bun test/stress/plain-redis.ts
 *
 * Proves:
 * 1. type 'JSON' misconfiguration is announced (probe + enriched
 *    runtime error), while every query still resolves from the
 *    database — degraded, never broken
 * 2. type 'STRING' caches fully on the same server
 */

import Redis from 'iovalkey';
import {getCache, probeJsonSupport, uncache} from '../../src';
import {resolveRedisApi} from '../../src/redisApi';

const uri = process.env.REDIS_SERVICE_URI;
if (!uri) {
  console.error('REDIS_SERVICE_URI is required');
  process.exit(1);
}

const client = new Redis(uri);
const {api} = resolveRedisApi(client);
const prefix = `plain:${Date.now()}`;

let failed = false;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
};

const run = async () => {
  const probe = await probeJsonSupport(api);
  check('probe reports the missing JSON module', probe.supported === false);
  check(
    // Direct calls reject with unknown-command; the MULTI write path
    // surfaces EXECABORT — both prove the module is absent
    'probe error is the JSON-less rejection',
    /unknown command|EXECABORT/i.test(probe.error?.message ?? ''),
  );

  // JSON type on a JSON-less server: served from DB, hint delivered once
  const errors: string[] = [];
  let dbCalls = 0;
  const jsonConfig = {
    ttl: 30,
    stale: 10,
    type: 'JSON',
    onError: (error: unknown) => {
      errors.push((error as Error).message);
    },
  } as const;

  for (let i = 0; i < 50; i++) {
    const read = await getCache({
      ttl: 30,
      stale: 10,
      config: jsonConfig,
      key: `${prefix}:json:${i % 10}`,
      redis: api,
      args: {},
      query: async () => {
        dbCalls++;
        return {i};
      },
    });
    if (read.meta.source !== 'db') failed = true;
  }
  check('all 50 JSON-type reads served from the database', dbCalls === 50);
  check(
    'runtime errors carry the STRING remedy exactly once',
    errors.filter(m => m.includes("'STRING'")).length === 1,
  );
  check('errors were reported for the failed operations', errors.length >= 50);

  // STRING type on the same server: full caching
  const stringConfig = {ttl: 30, stale: 10, type: 'STRING'} as const;
  let stringDbCalls = 0;
  for (let i = 0; i < 50; i++) {
    await getCache({
      ttl: 30,
      stale: 10,
      config: stringConfig,
      key: `${prefix}:string:fixed`,
      redis: api,
      args: {},
      query: async () => {
        stringDbCalls++;
        return {cached: true};
      },
    });
  }
  check(
    'STRING type caches on the same server (1 DB call for 50 reads)',
    stringDbCalls === 1,
  );

  const {deleted} = await uncache({
    redis: api,
    uncacheKeys: [`${prefix}:*`],
    hasPattern: true,
  });
  check('pattern invalidation works without RedisJSON', deleted >= 1);

  client.disconnect();
  console.log(failed ? 'PLAIN-REDIS LEG FAILED' : 'PLAIN-REDIS LEG PASSED');
  process.exit(failed ? 1 : 0);
};

void run();
