import Redis from 'iovalkey';
import {resolveRedisApi} from '../../src/redisApi';
import {createFakeRedisApi} from '../fakeRedisApi';
import {runRedisApiConformance} from '../redisApiConformance';

runRedisApiConformance('in-memory fake', async () => ({
  api: createFakeRedisApi(),
  prefix: 'conf-fake',
}));

if (process.env.REDIS_SERVICE_URI) {
  runRedisApiConformance('iovalkey (live)', async () => {
    const {api} = resolveRedisApi(
      new Redis(process.env.REDIS_SERVICE_URI as string),
    );
    return {api, prefix: `conf-live-${Math.trunc(performance.now())}`};
  });
}
