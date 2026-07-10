/**
 * Soak harness: sustained mixed traffic over a long window, verifying
 * memory stays bounded and nothing degrades over time. Run on demand:
 *
 *   REDIS_SERVICE_URI=redis://... bun test/stress/soak.ts [minutes] [readers] [keys]
 *
 * Traffic mix, chosen to exercise every long-lived structure:
 * - readers on short ttl/stale windows (constant fresh->stale->refresh
 *   churn through the coalesce and background-refresh maps)
 * - direct cache writes overwriting hot keys
 * - periodic pattern-invalidation storms (SCAN + batched UNLINK)
 *
 * Verdict requires: zero failures, zero unexpected errors, and final
 * heap within 64MB of the post-warmup baseline after GC.
 */

import Redis from 'iovalkey';
import {cache, promiseCoalesceGetCache, uncache} from '../../src';
import {resolveRedisApi} from '../../src/redisApi';

const uri = process.env.REDIS_SERVICE_URI;
if (!uri) {
  console.error('REDIS_SERVICE_URI is required');
  process.exit(1);
}

const minutes = Number(process.argv[2] ?? 60);
const readers = Number(process.argv[3] ?? 200);
const keyCount = Number(process.argv[4] ?? 300);

const client = new Redis(uri);
const {api} = resolveRedisApi(client);
const config = {ttl: 2, stale: 1, type: 'JSON'} as const;
const prefix = `soak:${Date.now()}`;

let dbCalls = 0;
let requests = 0;
let failures = 0;
let writes = 0;
let storms = 0;
let stormDeleted = 0;

const query = async () => {
  dbCalls++;
  await new Promise(resolve => setTimeout(resolve, 2));
  return {payload: 'x'.repeat(512)};
};

const heapMb = () => Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
const rssMb = () => Math.round(process.memoryUsage().rss / 1024 / 1024);

const deadline = Date.now() + minutes * 60_000;
let stopped = false;

const reader = async (id: number) => {
  while (!stopped) {
    requests++;
    try {
      const read = await promiseCoalesceGetCache({
        ttl: config.ttl,
        stale: config.stale,
        config,
        key: `${prefix}:${(id * 7 + requests) % keyCount}`,
        redis: api,
        args: {},
        query,
      });
      if ((read.result as {payload: string}).payload.length !== 512) {
        failures++;
      }
    } catch {
      failures++;
    }
    await new Promise(resolve => setTimeout(resolve, 5 + (id % 20)));
  }
};

const writer = async () => {
  while (!stopped) {
    writes++;
    try {
      await cache({
        redis: api,
        config,
        key: `${prefix}:${writes % keyCount}`,
        value: {payload: 'x'.repeat(512)},
      });
    } catch {
      failures++;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
};

const stormer = async () => {
  while (!stopped) {
    await new Promise(resolve => setTimeout(resolve, 15_000));
    if (stopped) break;
    storms++;
    try {
      // Invalidate a rotating tenth of the keyspace by pattern, the way
      // invalidateOnWrite does after a write
      const slice = storms % 10;
      const {deleted} = await uncache({
        redis: api,
        uncacheKeys: [`${prefix}:${slice}*`],
        hasPattern: true,
      });
      stormDeleted += deleted;
    } catch {
      failures++;
    }
  }
};

const run = async () => {
  console.log(
    `soak: ${minutes} minutes, ${readers} readers over ${keyCount} keys, writer + pattern storms`,
  );

  const workers = [
    ...Array.from({length: readers}, (_, i) => reader(i)),
    writer(),
    stormer(),
  ];

  // Post-warmup baseline: let maps and connection buffers settle first
  await new Promise(resolve => setTimeout(resolve, 60_000));
  Bun.gc(true);
  const heapBaseline = heapMb();
  console.log(
    `baseline after warmup: heap=${heapBaseline}MB rss=${rssMb()}MB requests=${requests}`,
  );

  let minute = 1;
  while (Date.now() < deadline) {
    await new Promise(resolve =>
      setTimeout(resolve, Math.min(60_000, deadline - Date.now())),
    );
    minute++;
    Bun.gc(true);
    console.log(
      `minute ${minute}/${minutes}: heap=${heapMb()}MB rss=${rssMb()}MB requests=${requests} dbCalls=${dbCalls} writes=${writes} storms=${storms} (deleted ${stormDeleted}) failures=${failures}`,
    );
  }

  stopped = true;
  await Promise.all(workers);
  Bun.gc(true);
  const heapEnd = heapMb();

  await uncache({redis: api, uncacheKeys: [`${prefix}:*`], hasPattern: true});
  client.disconnect();

  const heapGrowth = heapEnd - heapBaseline;
  console.log(
    `done: requests=${requests} dbCalls=${dbCalls} writes=${writes} storms=${storms} failures=${failures} heap ${heapBaseline}->${heapEnd}MB (growth ${heapGrowth}MB)`,
  );

  const ok = failures === 0 && heapGrowth < 64;
  if (!ok) {
    console.error('SOAK HARNESS FAILED');
    process.exit(1);
  }
  console.log('SOAK HARNESS PASSED');
  process.exit(0);
};

void run();
