import {describe, expect, mock, test} from 'bun:test';
import {getCache, PrismaExtensionRedis, unlinkPatterns} from '../../src';
import {
  fromIoValkeyLike,
  fromUpstashLike,
  resolveRedisApi,
  type UpstashLike,
} from '../../src/redisApi';
import {createFakeRedisApi} from '../fakeRedisApi';
import {delay} from '../functions';

/**
 * An in-memory client with the exact shape and behaviors of
 * @upstash/redis: auto-deserializing get/json.get (objects come back
 * parsed), json.set taking a value at a path, set with {ex}, scan
 * returning [cursor, keys], and no generic call/multi.
 */
const createUpstashFake = (
  options: {withUnlink?: boolean; withTime?: boolean} = {},
) => {
  const {withUnlink = true, withTime = true} = options;
  const store = new Map<string, string>();
  const calls: string[] = [];

  const parse = (value: string): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  const base = {
    store,
    calls,
    get: async (key: string) => {
      calls.push('get');
      const value = store.get(key);
      // Upstash auto-deserializes JSON payloads by default
      return value === undefined ? null : parse(value);
    },
    set: async (key: string, value: string, opts?: {ex?: number}) => {
      calls.push(opts?.ex ? 'set:ex' : 'set');
      store.set(key, value);
      return 'OK';
    },
    json: {
      get: async (key: string) => {
        calls.push('json.get');
        const value = store.get(key);
        return value === undefined ? null : parse(value);
      },
      set: async (key: string, _path: string, value: unknown) => {
        calls.push('json.set');
        store.set(key, JSON.stringify(value));
        return 'OK';
      },
    },
    expire: async (key: string, _seconds: number) => {
      calls.push('expire');
      return store.has(key) ? 1 : 0;
    },
    del: async (...keys: string[]) => {
      calls.push('del');
      let removed = 0;
      for (const key of keys) if (store.delete(key)) removed++;
      return removed;
    },
    scan: async (_cursor: string | number, opts: {match?: string}) => {
      calls.push('scan');
      const regex = new RegExp(
        `^${(opts.match ?? '*')
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')}$`,
      );
      // Upstash returns the cursor as a number
      return [0, [...store.keys()].filter(key => regex.test(key))] as [
        number,
        string[],
      ];
    },
    ping: async () => 'PONG' as const,
  };

  return {
    ...base,
    ...(withUnlink
      ? {
          unlink: async (...keys: string[]) => {
            calls.push('unlink');
            let removed = 0;
            for (const key of keys) if (store.delete(key)) removed++;
            return removed;
          },
        }
      : {}),
    ...(withTime
      ? {
          time: async () => {
            calls.push('time');
            return [String(Math.floor(Date.now() / 1000)), '0'];
          },
        }
      : {}),
  };
};

describe('Upstash-style client support', () => {
  test('resolveRedisApi detects the Upstash shape', () => {
    const fake = createUpstashFake();
    const {api, raw} = resolveRedisApi(fake as UpstashLike);

    expect(raw).toBe(fake);
    // Re-resolving returns the memoized wrapper
    expect(resolveRedisApi(fake as UpstashLike).api).toBe(api);
  });

  test('get normalizes auto-deserialized objects back to strings', async () => {
    const fake = createUpstashFake();
    const api = fromUpstashLike(fake as UpstashLike);

    fake.store.set('obj', JSON.stringify({a: 1}));
    fake.store.set('plain', 'just-a-string');

    expect(await api.get('obj')).toBe(JSON.stringify({a: 1}));
    expect(await api.get('plain')).toBe('just-a-string');
    expect(await api.get('missing')).toBeNull();
    expect(await api.jsonGet('obj')).toBe(JSON.stringify({a: 1}));
  });

  test('set applies TTLs via the {ex} option', async () => {
    const fake = createUpstashFake();
    const api = fromUpstashLike(fake as UpstashLike);

    await api.set('with-ttl', 'v', 60);
    await api.set('no-ttl', 'v');

    expect(fake.calls).toContain('set:ex');
    expect(fake.calls).toContain('set');
  });

  test('jsonSet writes through json.set and expires separately', async () => {
    const fake = createUpstashFake();
    const api = fromUpstashLike(fake as UpstashLike);

    await api.jsonSet('key', JSON.stringify({a: 1}), 60);
    expect(fake.calls).toEqual(expect.arrayContaining(['json.set', 'expire']));
    expect(fake.store.get('key')).toBe(JSON.stringify({a: 1}));

    fake.calls.length = 0;
    await api.jsonSet('key2', JSON.stringify({b: 2}));
    expect(fake.calls).toContain('json.set');
    expect(fake.calls).not.toContain('expire');
  });

  test('unlink falls back to del when the client lacks it', async () => {
    const withUnlink = createUpstashFake({withUnlink: true});
    const withoutUnlink = createUpstashFake({withUnlink: false});

    withUnlink.store.set('a', '1');
    withoutUnlink.store.set('a', '1');

    expect(await fromUpstashLike(withUnlink as UpstashLike).unlink(['a'])).toBe(
      1,
    );
    expect(withUnlink.calls).toContain('unlink');

    expect(
      await fromUpstashLike(withoutUnlink as UpstashLike).unlink(['a']),
    ).toBe(1);
    expect(withoutUnlink.calls).toContain('del');
  });

  test('del and unlink short-circuit on empty key lists', async () => {
    const fake = createUpstashFake();
    const api = fromUpstashLike(fake as UpstashLike);

    expect(await api.del([])).toBe(0);
    expect(await api.unlink([])).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });

  test('scan normalizes numeric cursors to strings', async () => {
    const fake = createUpstashFake();
    const api = fromUpstashLike(fake as UpstashLike);

    fake.store.set('p:1', 'v');
    const page = await api.scan('0', 'p:*', 100);

    expect(page.cursor).toBe('0');
    expect(page.keys).toEqual(['p:1']);
  });

  test('time parses [seconds, microseconds] replies and rejects garbage', async () => {
    const fake = createUpstashFake();
    const api = fromUpstashLike(fake as UpstashLike);
    const seconds = await api.time?.();
    expect(Math.abs((seconds ?? 0) - Date.now() / 1000)).toBeLessThanOrEqual(2);

    const garbage = createUpstashFake();
    garbage.time = async () => ({nope: true}) as unknown as string[];
    const garbageApi = fromUpstashLike(garbage as UpstashLike);
    expect(garbageApi.time?.()).rejects.toThrow('Unexpected TIME reply');

    const timeless = createUpstashFake({withTime: false});
    expect(fromUpstashLike(timeless as UpstashLike).time).toBeUndefined();
  });

  test('getCache round-trips JSON cache entries through the Upstash shape', async () => {
    const fake = createUpstashFake();
    const key = 'upstash:json:roundtrip';
    const params = {
      ttl: 60,
      stale: 30,
      config: {ttl: 60, stale: 30, type: 'JSON'} as const,
      key,
      redis: fake as UpstashLike,
      args: {},
      query: async () => ({id: 1, name: 'from-db'}),
    };

    const miss = await getCache({...params});
    expect(miss.meta.source).toBe('db');
    expect(miss.result).toEqual({id: 1, name: 'from-db'});

    // Second read survives Upstash's parse/stringify round trip
    const hit = await getCache({...params});
    expect(hit.meta.source).toBe('cache');
    expect(hit.result).toEqual({id: 1, name: 'from-db'});
  });

  test('getCache round-trips STRING cache entries through the Upstash shape', async () => {
    const fake = createUpstashFake();
    const key = 'upstash:string:roundtrip';
    const params = {
      ttl: 60,
      stale: 30,
      config: {ttl: 60, stale: 30, type: 'STRING'} as const,
      key,
      redis: fake as UpstashLike,
      args: {},
      query: async () => ({id: 2}),
    };

    expect((await getCache({...params})).meta.source).toBe('db');
    const hit = await getCache({...params});
    expect(hit.meta.source).toBe('cache');
    expect(hit.result).toEqual({id: 2});
  });

  test('extension init reports TIME sync failures through onError', async () => {
    const fake = createUpstashFake();
    fake.time = async () => {
      throw new Error('TIME blocked');
    };

    const onError = mock(() => {});
    PrismaExtensionRedis({
      config: {ttl: 60, stale: 30, auto: true, type: 'JSON', onError},
      client: fake as UpstashLike,
    });

    await delay(20);
    expect(onError).toHaveBeenCalled();
  });

  test('getCache reports TIME sync failures when no clock is supplied', async () => {
    const fake = createUpstashFake();
    fake.time = async () => {
      throw new Error('TIME blocked');
    };

    const onError = mock(() => {});
    const result = await getCache({
      ttl: 60,
      stale: 30,
      config: {ttl: 60, stale: 30, type: 'JSON', onError},
      key: 'upstash:clock:failure',
      redis: fake as UpstashLike,
      args: {},
      query: async () => ({ok: true}),
    });

    await delay(20);
    expect(result.result).toEqual({ok: true});
    expect(onError).toHaveBeenCalled();
  });
});

describe('resolveRedisApi rejection', () => {
  test('throws a TypeError for objects exposing client verbs with the wrong shape', () => {
    const misShaped = {
      get: async () => null,
      set: async () => {},
    };

    expect(() => resolveRedisApi(misShaped as never)).toThrow(TypeError);
    expect(() => resolveRedisApi(misShaped as never)).toThrow(
      'Unrecognized Redis client',
    );
  });

  test('connection options and URLs are rejected with the BYO remedy', () => {
    const optionsObject = {
      host: '127.0.0.1',
      port: 6399,
      retryStrategy: () => null,
    };

    expect(() => resolveRedisApi(optionsObject as never)).toThrow(TypeError);
    expect(() => resolveRedisApi(optionsObject as never)).toThrow(
      /bring your own client/,
    );
    expect(() => resolveRedisApi('redis://localhost:6379' as never)).toThrow(
      /bring your own client/,
    );
    expect(() => resolveRedisApi(undefined as never)).toThrow(
      /bring your own client/,
    );
  });
});

describe('adapter no-TTL write semantics', () => {
  test('iovalkey-like set and jsonSet both clear a previous expiry when no TTL is given', async () => {
    const commands: string[][] = [];
    const multiCalls: string[][] = [];
    const makeMulti = () => {
      const chain = {
        call: (...args: (string | number)[]) => {
          multiCalls.push(args.map(String));
          return chain;
        },
        set: (..._a: string[]) => chain,
        expire: (..._a: (string | number)[]) => chain,
        exec: async () => [[null, 'OK']] as [Error | null, unknown][],
      };
      return chain;
    };
    const stub = {
      call: async (...args: (string | number)[]) => {
        commands.push(args.map(String));
        return 'OK';
      },
      multi: makeMulti,
      get: async () => null,
      set: async (..._a: string[]) => 'OK',
      del: async () => 0,
      unlink: async () => 0,
      scan: async () => ['0', []] as [string, string[]],
      ping: async () => 'PONG',
      info: async () => '',
    };

    const api = fromIoValkeyLike(stub as never);
    await api.set('k', 'v');
    await api.jsonSet('k', '"v"');

    const flat = [...commands, ...multiCalls].map(c => c.join(' '));
    expect(flat.some(c => c.startsWith('PERSIST k'))).toBe(true);
  });

  test('upstash-like jsonSet clears a previous expiry when no TTL is given', async () => {
    const persisted: string[] = [];
    const fake = createUpstashFake();
    const withPersist = Object.assign(fake, {
      persist: async (key: string) => {
        persisted.push(key);
        return 1;
      },
    });

    const api = fromUpstashLike(withPersist as UpstashLike);
    await api.jsonSet('k', JSON.stringify({a: 1}));

    expect(persisted).toEqual(['k']);
  });
});

describe('unlinkPatterns failure draining', () => {
  test('no unhandled rejections when multiple batches fail', async () => {
    const events: unknown[] = [];
    const onUnhandled = (reason: unknown) => events.push(reason);
    process.on('unhandledRejection', onUnhandled);

    try {
      let calls = 0;
      const fake = createFakeRedisApi({
        scan: async () => ({cursor: '0', keys: ['p:1', 'p:2']}),
        unlink: () => {
          calls++;
          const wait = calls === 1 ? 5 : 25;
          return new Promise((_, reject) =>
            setTimeout(() => reject(new Error('unlink boom')), wait),
          );
        },
      });

      const [pattern] = unlinkPatterns({
        redis: fake,
        patterns: ['p:*'],
        chunkSize: 1,
        maxConcurrentBatches: 2,
      });

      expect(pattern).rejects.toThrow('unlink boom');
      await pattern.catch(() => {});
      await delay(50);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(events).toHaveLength(0);
  });
});

describe('unlinkPatterns batching', () => {
  test('applies backpressure once maxConcurrentBatches is reached', async () => {
    const fake = createUpstashFake();
    for (let i = 0; i < 10; i++) fake.store.set(`batch:${i}`, 'v');

    const [done] = unlinkPatterns({
      redis: fake as UpstashLike,
      patterns: ['batch:*'],
      chunkSize: 2,
      maxConcurrentBatches: 1,
    });

    expect(await done).toBe(10);
    expect(fake.store.size).toBe(0);
  });
});
