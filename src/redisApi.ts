import Redis, {type RedisOptions} from 'iovalkey';

/**
 * The minimal, client-agnostic Redis surface this extension needs.
 *
 * Any object implementing this interface can back the extension — pass it
 * as the `client` option. Two adapters ship built in: ioredis-compatible
 * clients (iovalkey, ioredis, valkey clients) are wrapped by
 * fromIoValkeyLike, and Upstash-style REST clients by fromUpstashLike;
 * both are applied automatically by resolveRedisApi.
 *
 * Contract notes:
 * - get/jsonGet resolve with the SERIALIZED string value (or null).
 * - set/jsonSet receive the serialized string; when ttlSeconds is given
 *   the key must expire after ttlSeconds.
 * - scan performs one SCAN iteration; cursor '0' starts and ends a scan.
 * - del/unlink resolve with the number of keys actually removed.
 * - time (optional) resolves with the server's Unix time in seconds;
 *   when absent the extension uses the local clock.
 * - info (optional) powers healthCheck's serverInfo; omit if unsupported.
 */
export interface RedisApi {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<unknown>;
  jsonGet(key: string): Promise<string | null>;
  jsonSet(key: string, value: string, ttlSeconds?: number): Promise<unknown>;
  del(keys: string[]): Promise<number>;
  unlink(keys: string[]): Promise<number>;
  scan(
    cursor: string,
    match: string,
    count: number,
  ): Promise<{cursor: string; keys: string[]}>;
  time?(): Promise<number>;
  ping(): Promise<string>;
  info?(section?: string): Promise<string>;
}

/**
 * The shape shared by ioredis-compatible clients (iovalkey, ioredis,
 * valkey). `call` is the discriminator — Upstash-style REST clients
 * don't have it.
 */
export interface IoValkeyLike {
  call(command: string, ...args: (string | number)[]): Promise<unknown>;
  multi(): {
    call(command: string, ...args: (string | number)[]): IoValkeyMulti;
    set(key: string, value: string): IoValkeyMulti;
    expire(key: string, seconds: number): IoValkeyMulti;
    exec(): Promise<[error: Error | null, result: unknown][] | null>;
  };
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  unlink(...keys: string[]): Promise<number>;
  scan(
    cursor: string,
    matchToken: 'MATCH',
    match: string,
    countToken: 'COUNT',
    count: number,
  ): Promise<[cursor: string, keys: string[]]>;
  ping(): Promise<string>;
  info(section?: string): Promise<string>;
}

type IoValkeyMulti = ReturnType<IoValkeyLike['multi']>;

/**
 * The shape of Upstash-style REST clients (@upstash/redis). `json` with
 * no generic `call` is the discriminator.
 */
export interface UpstashLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, opts?: {ex?: number}): Promise<unknown>;
  json: {
    get(key: string): Promise<unknown>;
    set(key: string, path: string, value: unknown): Promise<unknown>;
  };
  expire(key: string, seconds: number): Promise<unknown>;
  persist?(key: string): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  unlink?(...keys: string[]): Promise<number>;
  scan(
    cursor: string | number,
    opts: {match?: string; count?: number},
  ): Promise<[cursor: string | number, keys: string[]]>;
  time?(): Promise<unknown>;
  ping(): Promise<string>;
}

/**
 * Loose structural stand-in for typed ioredis-family instances: their
 * heavily overloaded method signatures don't match IoValkeyLike
 * structurally, so acceptance keys on the discriminating verbs only.
 * Detection and wrapping remain runtime duck-typing.
 */
export type IoValkeyCompatible = {
  call(...args: never[]): unknown;
  multi(...args: never[]): unknown;
  scan(...args: never[]): unknown;
};

/** Everything accepted as the extension's `client` option. */
export type RedisClientInput =
  | RedisOptions
  | string
  | IoValkeyLike
  | IoValkeyCompatible
  | UpstashLike
  | RedisApi;

const isFunction = (value: unknown): value is (...a: never[]) => unknown =>
  typeof value === 'function';

const hasTtl = (ttl?: number): ttl is number =>
  ttl !== undefined && ttl !== Number.POSITIVE_INFINITY && ttl > 0;

/** Redis TIME replies [seconds, microseconds]; normalize to seconds. */
const parseTimeReply = (reply: unknown): number => {
  const seconds = Array.isArray(reply)
    ? Number.parseInt(String(reply[0]), 10)
    : Number.parseInt(String(reply), 10);
  if (Number.isNaN(seconds)) {
    throw new Error(`Unexpected TIME reply: ${JSON.stringify(reply)}`);
  }
  return seconds;
};

/** ioredis multi().exec() reports per-command errors without rejecting. */
const execOrThrow = async (multi: IoValkeyMulti): Promise<unknown> => {
  const results = await multi.exec();
  if (!results) throw new Error('Redis transaction aborted');
  for (const [error] of results) {
    if (error) throw error;
  }
  return results;
};

/**
 * Wraps an ioredis-compatible client (iovalkey, ioredis, valkey) as a
 * RedisApi.
 */
export const fromIoValkeyLike = (client: IoValkeyLike): RedisApi => ({
  get: key => client.get(key),
  set: (key, value, ttl) =>
    hasTtl(ttl)
      ? execOrThrow(client.multi().set(key, value).expire(key, ttl))
      : client.set(key, value),
  jsonGet: key => client.call('JSON.GET', key) as Promise<string | null>,
  jsonSet: (key, value, ttl) => {
    const multi = client.multi().call('JSON.SET', key, '$', value);
    // SET without TTL clears a previous expiry; JSON.SET preserves it,
    // so PERSIST keeps both write paths on the same contract
    if (hasTtl(ttl)) multi.call('EXPIRE', key, ttl);
    else multi.call('PERSIST', key);
    return execOrThrow(multi);
  },
  del: keys => (keys.length ? client.del(...keys) : Promise.resolve(0)),
  unlink: keys => (keys.length ? client.unlink(...keys) : Promise.resolve(0)),
  scan: async (cursor, match, count) => {
    const [next, keys] = await client.scan(
      cursor,
      'MATCH',
      match,
      'COUNT',
      count,
    );
    return {cursor: next, keys};
  },
  time: async () => parseTimeReply(await client.call('TIME')),
  ping: () => client.ping(),
  info: section => client.info(section),
});

/**
 * Normalizes values from clients that auto-deserialize (Upstash does by
 * default) back to the serialized string the extension works with.
 */
const asSerialized = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
};

/**
 * Wraps an Upstash-style REST client (@upstash/redis) as a RedisApi.
 *
 * Works with automaticDeserialization enabled (the default) or disabled;
 * INFO is not exposed over the Upstash REST API, so healthCheck reports
 * no serverInfo for these clients.
 */
export const fromUpstashLike = (client: UpstashLike): RedisApi => ({
  get: async key => asSerialized(await client.get(key)),
  set: (key, value, ttl) =>
    hasTtl(ttl) ? client.set(key, value, {ex: ttl}) : client.set(key, value),
  jsonGet: async key => asSerialized(await client.json.get(key)),
  jsonSet: async (key, value, ttl) => {
    await client.json.set(key, '$', JSON.parse(value));
    if (hasTtl(ttl)) await client.expire(key, ttl);
    else if (client.persist) await client.persist(key);
  },
  del: keys => (keys.length ? client.del(...keys) : Promise.resolve(0)),
  unlink: keys =>
    keys.length
      ? client.unlink
        ? client.unlink(...keys)
        : client.del(...keys)
      : Promise.resolve(0),
  scan: async (cursor, match, count) => {
    const [next, keys] = await client.scan(cursor, {match, count});
    return {cursor: String(next), keys};
  },
  ...(isFunction(client.time)
    ? {
        time: async () =>
          parseTimeReply(await (client.time as () => Promise<unknown>)()),
      }
    : {}),
  ping: () => client.ping(),
});

const isRedisApi = (client: unknown): client is RedisApi => {
  const c = client as Partial<RedisApi>;
  return (
    isFunction(c?.get) &&
    isFunction(c?.set) &&
    isFunction(c?.jsonGet) &&
    isFunction(c?.jsonSet) &&
    isFunction(c?.scan) &&
    isFunction(c?.del) &&
    isFunction(c?.unlink) &&
    isFunction(c?.ping)
  );
};

const isIoValkeyLike = (client: unknown): client is IoValkeyLike => {
  const c = client as Partial<IoValkeyLike>;
  return (
    isFunction(c?.call) &&
    isFunction(c?.multi) &&
    isFunction(c?.get) &&
    isFunction(c?.scan)
  );
};

const isUpstashLike = (client: unknown): client is UpstashLike => {
  const c = client as Partial<UpstashLike>;
  return (
    !isFunction((c as {call?: unknown})?.call) &&
    isFunction(c?.get) &&
    isFunction(c?.scan) &&
    typeof c?.json === 'object' &&
    c?.json !== null &&
    isFunction(c?.json?.get)
  );
};

const apiCache = new WeakMap<object, RedisApi>();

/**
 * Resolves anything accepted as the `client` option to a RedisApi:
 * - a RedisApi implementation is used as-is
 * - ioredis-compatible instances and Upstash-style clients are wrapped
 * - a connection string or RedisOptions object constructs an iovalkey
 *   client (the historical behavior)
 *
 * Wrappers are memoized per client instance, so utilities can resolve on
 * every call without allocating.
 */
export const resolveRedisApi = (
  client: RedisClientInput,
): {api: RedisApi; raw: unknown} => {
  if (typeof client === 'object' && client !== null) {
    const cached = apiCache.get(client);
    if (cached) return {api: cached, raw: client};

    if (isRedisApi(client)) {
      apiCache.set(client, client);
      return {api: client, raw: client};
    }
    if (isIoValkeyLike(client)) {
      const api = fromIoValkeyLike(client);
      apiCache.set(client, api);
      return {api, raw: client};
    }
    if (isUpstashLike(client)) {
      const api = fromUpstashLike(client);
      apiCache.set(client, api);
      return {api, raw: client};
    }

    // An object exposing client verbs is a (mis-shaped) client, not
    // connection options - fail loudly instead of trying to connect.
    // Plain options legitimately carry function fields (retryStrategy,
    // reconnectOnError), so only Redis-verb functions count
    const verbs = [
      'get',
      'set',
      'del',
      'unlink',
      'scan',
      'ping',
      'call',
      'multi',
      'jsonGet',
      'jsonSet',
    ] as const;
    const record = client as Record<string, unknown>;
    if (verbs.some(verb => isFunction(record[verb]))) {
      throw new TypeError(
        'Unrecognized Redis client: implement the RedisApi interface, or pass an ioredis-compatible instance, an Upstash-style client, or iovalkey connection options.',
      );
    }
  }

  // Connection string or RedisOptions: construct an iovalkey client
  const instance = new Redis(client as RedisOptions);
  const api = fromIoValkeyLike(instance as unknown as IoValkeyLike);
  apiCache.set(instance, api);
  return {api, raw: instance};
};

/**
 * A clock that tracks the Redis server's time so cache timestamps stay
 * consistent across distributed nodes without paying a TIME round trip
 * on every read.
 */
export type ServerClock = {
  /** Current Unix time in whole seconds, server-adjusted when possible. */
  nowSeconds(): number;
  /** Forces an immediate sync; resolves once the attempt settles. */
  prime(): Promise<void>;
};

const CLOCK_SYNC_INTERVAL_MS = 5_000;

/**
 * Creates a ServerClock for the given api. The server offset is synced
 * at most every 5 seconds off the hot path; sync failures invoke
 * onSyncError (observability for the local-clock fallback) and reads
 * continue on the local clock until a sync succeeds.
 */
export const createServerClock = (
  api: RedisApi,
  onSyncError?: (error: Error) => void,
): ServerClock => {
  let offsetMs = 0;
  let lastSyncAt = 0;
  let syncing: Promise<void> | null = null;

  const sync = (): Promise<void> => {
    if (!api.time) return Promise.resolve();
    syncing ??= api
      .time()
      .then(serverSeconds => {
        // Center within the server's current second: TIME truncates, so
        // +500ms halves the worst-case offset error
        offsetMs = serverSeconds * 1000 + 500 - Date.now();
      })
      .catch(error => {
        if (onSyncError) {
          onSyncError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      })
      .finally(() => {
        lastSyncAt = Date.now();
        syncing = null;
      });
    return syncing;
  };

  return {
    nowSeconds() {
      if (Date.now() - lastSyncAt > CLOCK_SYNC_INTERVAL_MS) void sync();
      return Math.floor((Date.now() + offsetMs) / 1000);
    },
    prime: sync,
  };
};

const clockCache = new WeakMap<RedisApi, ServerClock>();

/**
 * Returns the shared ServerClock for an api, creating it on first use.
 * Used by utilities called without an explicit clock.
 */
export const getServerClock = (
  api: RedisApi,
  onSyncError?: (error: Error) => void,
): ServerClock => {
  let clock = clockCache.get(api);
  if (!clock) {
    clock = createServerClock(api, onSyncError);
    clockCache.set(api, clock);
  }
  return clock;
};
