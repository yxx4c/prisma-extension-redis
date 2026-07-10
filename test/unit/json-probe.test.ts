import {afterEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {checkHealth, getCache, PrismaExtensionRedis} from '../../src';
import {probeJsonSupport} from '../../src/redisApi';
import {createFakeRedisApi} from '../fakeRedisApi';

const unknownCommand = (command: string) => async () => {
  throw new Error(
    `ERR unknown command '${command}', with args beginning with: 'k'`,
  );
};

/** A server without the RedisJSON module: JSON.* commands are unknown. */
const createJsonlessApi = () =>
  createFakeRedisApi({
    jsonGet: unknownCommand('JSON.GET'),
    jsonSet: unknownCommand('JSON.SET'),
  });

const tick = () => new Promise(resolve => setTimeout(resolve, 20));

describe('RedisJSON support probe', () => {
  test('reports supported on a JSON-capable server and cleans up', async () => {
    const fake = createFakeRedisApi();

    const result = await probeJsonSupport(fake);

    expect(result.supported).toBe(true);
    expect(fake.store.size).toBe(0);
  });

  test('reports unsupported with the underlying error otherwise', async () => {
    const result = await probeJsonSupport(createJsonlessApi());

    expect(result.supported).toBe(false);
    expect(result.error?.message).toContain('unknown command');
  });
});

describe('extension init fail-fast', () => {
  let warnSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    warnSpy?.mockRestore();
    warnSpy = undefined;
  });

  test('a JSON config on a JSON-less server warns loudly with the remedy', async () => {
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const onError = mock((_error: unknown) => {});

    PrismaExtensionRedis({
      config: {ttl: 60, stale: 30, auto: true, type: 'JSON', onError},
      client: createJsonlessApi(),
    });
    await tick();

    expect(onError).toHaveBeenCalledTimes(1);
    const reported = onError.mock.calls[0]?.[0] as Error;
    expect(reported.message).toContain("'STRING'");
    expect(reported.message).toContain('RedisJSON');
    expect(warnSpy).toHaveBeenCalled();
  });

  test('a STRING config never probes JSON commands', async () => {
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const onError = mock(() => {});

    PrismaExtensionRedis({
      config: {ttl: 60, stale: 30, auto: true, type: 'STRING', onError},
      client: createJsonlessApi(),
    });
    await tick();

    expect(onError).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('a JSON config on a capable server stays silent', async () => {
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    const onError = mock(() => {});

    PrismaExtensionRedis({
      config: {ttl: 60, stale: 30, auto: true, type: 'JSON', onError},
      client: createFakeRedisApi(),
    });
    await tick();

    expect(onError).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('healthCheck jsonSupport', () => {
  test('probes when asked and reports the capability', async () => {
    const healthy = await checkHealth(createFakeRedisApi(), {checkJson: true});
    const jsonless = await checkHealth(createJsonlessApi(), {checkJson: true});

    expect(healthy.jsonSupport).toBe(true);
    expect(jsonless.jsonSupport).toBe(false);
  });

  test('is absent when not requested', async () => {
    const health = await checkHealth(createFakeRedisApi());

    expect(health.jsonSupport).toBeUndefined();
  });
});

describe('runtime error enrichment', () => {
  test('the first unknown-command JSON error carries the remedy once', async () => {
    const api = createJsonlessApi();
    const seen: string[] = [];

    const run = () =>
      getCache({
        ttl: 60,
        stale: 30,
        config: {
          ttl: 60,
          stale: 30,
          type: 'JSON',
          onError: error => {
            seen.push((error as Error).message);
          },
        },
        key: 'probe:runtime',
        redis: api,
        args: {},
        query: async () => ({ok: true}),
      });

    const first = await run();
    await run();

    expect(first.result).toEqual({ok: true});
    const withHint = seen.filter(message => message.includes("'STRING'"));
    expect(withHint.length).toBe(1);
    expect(seen.length).toBeGreaterThan(1);
  });
});
