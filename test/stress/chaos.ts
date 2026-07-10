/**
 * Chaos harness: verifies graceful degradation when Redis dies
 * mid-traffic and recovery once it returns. Not part of the unit
 * suite - run on demand:
 *
 *   REDIS_SERVICE_URI=redis://... CHAOS_CONTAINER=<docker-name> bun test/stress/chaos.ts
 *
 * Phases:
 * 1. healthy traffic - reads served, errors zero
 * 2. Redis stopped   - every read still resolves from the database
 *    (cache errors reported via onError, never thrown to callers)
 * 3. Redis restarted - caching resumes, health returns to healthy
 */
import {checkHealth, getCache} from '../../src';
import {resolveRedisApi} from '../../src/redisApi';

const uri = process.env.REDIS_SERVICE_URI;
const container = process.env.CHAOS_CONTAINER;
if (!uri || !container) {
  console.error('REDIS_SERVICE_URI and CHAOS_CONTAINER are required');
  process.exit(1);
}

const {api} = resolveRedisApi(uri);
const prefix = `chaos:${Date.now()}`;
let cacheErrors = 0;
const config = {
  ttl: 30,
  stale: 10,
  type: 'JSON',
  onError: () => {
    cacheErrors++;
  },
} as const;

const docker = async (...args: string[]) => {
  const proc = Bun.spawn(['docker', ...args], {
    stdout: 'ignore',
    stderr: 'ignore',
  });
  await proc.exited;
};

const trafficRound = async (round: string, requests: number) => {
  let resolved = 0;
  await Promise.all(
    Array.from({length: requests}, (_, i) =>
      getCache({
        ttl: config.ttl,
        stale: config.stale,
        config,
        key: `${prefix}:${i % 10}`,
        redis: api,
        args: {},
        query: async () => ({round, i}),
      }).then(r => {
        if (r.result) resolved++;
      }),
    ),
  );
  return resolved;
};

const run = async () => {
  const healthy = await trafficRound('healthy', 100);
  const healthBefore = (await checkHealth(api)).status;
  console.log(
    `phase 1 healthy: resolved=${healthy}/100 health=${healthBefore} cacheErrors=${cacheErrors}`,
  );
  if (healthy !== 100) process.exit(1);

  console.log(`stopping ${container}...`);
  await docker('stop', container);
  const errorsBeforeOutage = cacheErrors;

  const duringOutage = await trafficRound('outage', 100);
  const healthDuring = (await checkHealth(api)).status;
  console.log(
    `phase 2 outage: resolved=${duringOutage}/100 health=${healthDuring} newCacheErrors=${cacheErrors - errorsBeforeOutage}`,
  );

  console.log(`restarting ${container}...`);
  await docker('start', container);
  await new Promise(resolve => setTimeout(resolve, 3000));

  const afterRecovery = await trafficRound('recovered', 100);
  const healthAfter = (await checkHealth(api)).status;
  console.log(
    `phase 3 recovered: resolved=${afterRecovery}/100 health=${healthAfter}`,
  );

  const ok =
    healthy === 100 &&
    duringOutage === 100 &&
    afterRecovery === 100 &&
    healthDuring === 'unhealthy' &&
    healthAfter === 'healthy' &&
    cacheErrors - errorsBeforeOutage > 0;

  console.log(ok ? 'CHAOS HARNESS PASSED' : 'CHAOS HARNESS FAILED');
  process.exit(ok ? 0 : 1);
};

void run();
