import type {RedisApi} from '../src/redisApi';

/**
 * In-memory RedisApi implementation for tests: honors TTLs, glob SCAN
 * patterns, and deletion counts. Pass overrides to inject failures or
 * fixed clocks. Also used to prove the extension runs end-to-end on a
 * custom (non-ioredis) client.
 */
export const createFakeRedisApi = (
  overrides: Partial<RedisApi> = {},
): RedisApi & {store: Map<string, {value: string; expiresAt?: number}>} => {
  const store = new Map<string, {value: string; expiresAt?: number}>();

  const alive = (key: string): boolean => {
    const entry = store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return false;
    }
    return true;
  };

  const read = (key: string): string | null =>
    alive(key) ? (store.get(key)?.value ?? null) : null;

  const write = (key: string, value: string, ttlSeconds?: number): void => {
    store.set(key, {
      value,
      expiresAt:
        ttlSeconds !== undefined && ttlSeconds !== Number.POSITIVE_INFINITY
          ? Date.now() + ttlSeconds * 1000
          : undefined,
    });
  };

  const remove = (keys: string[]): number => {
    let removed = 0;
    for (const key of keys) {
      if (alive(key) && store.delete(key)) removed++;
    }
    return removed;
  };

  const globToRegExp = (pattern: string): RegExp =>
    new RegExp(
      `^${pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')}$`,
    );

  return {
    store,
    get: async key => read(key),
    set: async (key, value, ttl) => write(key, value, ttl),
    jsonGet: async key => read(key),
    jsonSet: async (key, value, ttl) => write(key, value, ttl),
    del: async keys => remove(keys),
    unlink: async keys => remove(keys),
    scan: async (_cursor, match, _count) => {
      const regex = globToRegExp(match);
      const keys = [...store.keys()].filter(
        key => alive(key) && regex.test(key),
      );
      return {cursor: '0', keys};
    },
    time: async () => Math.floor(Date.now() / 1000),
    ping: async () => 'PONG',
    ...overrides,
  };
};
