/**
 * Load and soak harness. Not part of the unit suite - run on demand:
 *
 *   REDIS_SERVICE_URI=redis://... bun test/stress/load.ts [bursts] [concurrency] [keys]
 *
 * Asserts, under sustained concurrent load against a real Redis:
 * - coalescing efficacy: database executions stay at ~1 per distinct
 *   key per lifecycle, not 1 per request
 * - stability: heap growth stays bounded across bursts
 * - correctness: every request resolves with the expected value
 */

import Redis from 'iovalkey';
import {promiseCoalesceGetCache, uncache} from '../../src';
import {resolveRedisApi} from '../../src/redisApi';

const uri = process.env.REDIS_SERVICE_URI;
if (!uri) {
  console.error('REDIS_SERVICE_URI is required');
  process.exit(1);
}

const bursts = Number(process.argv[2] ?? 20);
const concurrency = Number(process.argv[3] ?? 2000);
const keyCount = Number(process.argv[4] ?? 100);

const {api} = resolveRedisApi(new Redis(uri));
const config = {ttl: 2, stale: 1, type: 'JSON'} as const;
const prefix = `stress:${Date.now()}`;

let dbCalls = 0;
const query = async () => {
  dbCalls++;
  await new Promise(resolve => setTimeout(resolve, 2));
  return {payload: 'x'.repeat(256)};
};

const heapMb = () => Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

const latencies = new Float64Array(bursts * concurrency);
let latencyCount = 0;

const percentile = (sorted: Float64Array, p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const run = async () => {
  console.log(
    `load: ${bursts} bursts x ${concurrency} requests over ${keyCount} keys`,
  );
  const heapStart = heapMb();
  const wallStart = performance.now();
  let failures = 0;

  for (let burst = 0; burst < bursts; burst++) {
    const requests = Array.from({length: concurrency}, (_, i) => {
      const started = performance.now();
      return promiseCoalesceGetCache({
        ttl: config.ttl,
        stale: config.stale,
        config,
        key: `${prefix}:${i % keyCount}`,
        redis: api,
        args: {},
        query,
      }).then(
        r => {
          latencies[latencyCount++] = performance.now() - started;
          if ((r.result as {payload: string}).payload.length !== 256)
            failures++;
        },
        () => {
          latencies[latencyCount++] = performance.now() - started;
          failures++;
        },
      );
    });
    await Promise.all(requests);

    if (burst % 5 === 4) {
      Bun.gc(true);
      console.log(
        `burst ${burst + 1}/${bursts}: dbCalls=${dbCalls} heap=${heapMb()}MB failures=${failures}`,
      );
    }
    // Let ttl/stale windows roll over across the soak
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  const wallSeconds = (performance.now() - wallStart) / 1000;
  Bun.gc(true);
  const heapEnd = heapMb();
  const totalRequests = bursts * concurrency;
  // Worst case one refresh per key per burst plus initial fills
  const dbCallCeiling = keyCount * (bursts + 1);

  const sorted = latencies.slice(0, latencyCount).sort();
  console.log(
    `done: requests=${totalRequests} dbCalls=${dbCalls} (ceiling ${dbCallCeiling}) heap ${heapStart}->${heapEnd}MB failures=${failures}`,
  );
  console.log(
    `throughput=${Math.round(totalRequests / wallSeconds)} req/s over ${wallSeconds.toFixed(1)}s ` +
      `latency ms: p50=${percentile(sorted, 50).toFixed(2)} p95=${percentile(sorted, 95).toFixed(2)} ` +
      `p99=${percentile(sorted, 99).toFixed(2)} max=${sorted[sorted.length - 1].toFixed(1)}`,
  );

  await uncache({redis: api, uncacheKeys: [`${prefix}:*`], hasPattern: true});

  const ok =
    failures === 0 && dbCalls <= dbCallCeiling && heapEnd - heapStart < 64;
  if (!ok) {
    console.error('LOAD HARNESS FAILED');
    process.exit(1);
  }
  console.log('LOAD HARNESS PASSED');
  process.exit(0);
};

void run();
