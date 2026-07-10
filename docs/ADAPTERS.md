# Redis Client Adapters

`prisma-extension-redis` is Redis-package agnostic. Everything the extension does — cache reads/writes, pattern invalidation, maintenance scans, health checks, server-time sync — goes through one small interface, `RedisApi`. The `client` option accepts:

| You pass | What happens |
|---|---|
| `RedisOptions` or a `redis://` URI string | An [iovalkey](https://github.com/valkey-io/iovalkey) client is constructed and managed for you |
| An ioredis-compatible instance (`iovalkey`, `ioredis`, valkey clients) | Wrapped automatically via `fromIoValkeyLike` |
| An Upstash-style REST client (`@upstash/redis`) | Wrapped automatically via `fromUpstashLike` |
| A `RedisApi` implementation | Used directly |

Anything else that exposes functions is rejected at initialization with a `TypeError` — a mis-shaped client never silently becomes connection options.

## The RedisApi contract

```typescript
import type { RedisApi } from 'prisma-extension-redis';

interface RedisApi {
  /** Resolve the SERIALIZED string value, or null when absent. */
  get(key: string): Promise<string | null>;
  /** Store the serialized string; expire after ttlSeconds when given. */
  set(key: string, value: string, ttlSeconds?: number): Promise<unknown>;
  /** Same contract as get/set for the JSON storage type (RedisJSON). */
  jsonGet(key: string): Promise<string | null>;
  jsonSet(key: string, value: string, ttlSeconds?: number): Promise<unknown>;
  /** Resolve with the number of keys actually removed. */
  del(keys: string[]): Promise<number>;
  unlink(keys: string[]): Promise<number>;
  /** One SCAN iteration; cursor '0' starts and ends a full scan. */
  scan(cursor: string, match: string, count: number):
    Promise<{ cursor: string; keys: string[] }>;
  /** Optional: server Unix time in seconds (enables distributed-consistent timestamps). */
  time?(): Promise<number>;
  ping(): Promise<string>;
  /** Optional: INFO output for healthCheck's serverInfo. */
  info?(section?: string): Promise<string>;
}
```

Notes:

- **`get`/`jsonGet` must return the serialized string.** If your client auto-parses JSON (Upstash does by default), re-serialize before returning — see `fromUpstashLike` for the pattern, or disable auto-deserialization.
- **`type: 'JSON'` requires RedisJSON** on the server, exactly as with the built-in client. If your store has no JSON module, use `type: 'STRING'` and implement `jsonGet`/`jsonSet` as aliases of `get`/`set` (they will not be called).
- **`time` is optional but recommended.** With it, the extension syncs a server-time offset at most every 5 seconds and stamps all cache entries with server-consistent timestamps while reads stay a single `GET`. Without it, the local clock is used. Sync failures are surfaced through `config.onError` and debug logging.
- **`info` is optional.** When absent (e.g. Upstash REST), `healthCheck()` still works; `serverInfo` is simply `undefined`.
- **Writes without a TTL persist the key**: when `set`/`jsonSet` receive no `ttlSeconds`, any previous expiry on the key is removed (the built-in adapters issue `PERSIST` for the JSON path; Upstash clients use `persist` when available).
- **Upstash TTLs are applied non-atomically** for the JSON type (`json.set` then `expire` over REST); a failure between the two can leave a value without its expiry.
- **Redis Cluster is not currently supported** for the SCAN-based utilities (pattern invalidation, maintenance) or multi-key `UNLINK`/`DEL`: scans run against a single connection (one node of a cluster) and multi-key commands can fail with `CROSSSLOT`. Use standalone, replicated, or Dragonfly deployments, or scope an adapter per shard.
- **Connection lifecycle is yours** when you pass an instance or adapter. The extension never calls `quit`/`disconnect`, and when you pass connection options instead, the constructed iovalkey client connects at initialization and lives for the process. The client you supplied is exposed as `prisma.redis` for direct access.

## Example: @upstash/redis

```typescript
import { Redis } from '@upstash/redis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaExtensionRedis } from 'prisma-extension-redis';
import { PrismaClient } from './generated/prisma/client';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter }).$extends(
  PrismaExtensionRedis({
    config: { ttl: 60, stale: 30, auto: true, type: 'JSON' },
    client: redis, // detected and wrapped automatically
  }),
);
```

## Example: ioredis

```typescript
import { Redis } from 'ioredis';
import { PrismaExtensionRedis } from 'prisma-extension-redis';

const redis = new Redis(process.env.REDIS_URL); // your instance, your lifecycle

const prisma = basePrisma.$extends(
  PrismaExtensionRedis({
    config: { ttl: 60, stale: 30, auto: true, type: 'JSON' },
    client: redis,
  }),
);
```

## Example: custom in-memory adapter (tests)

The repository's test suite runs the full extension against an in-memory `RedisApi` fake (`test/fakeRedisApi.ts`, exercised by `test/unit/custom-adapter.test.ts`) — a useful starting point for your own adapter or for hermetic tests of code that uses the extension.

## Manual wrapping

`fromIoValkeyLike` and `fromUpstashLike` are exported if you prefer explicit wrapping over auto-detection:

```typescript
import { fromUpstashLike, PrismaExtensionRedis } from 'prisma-extension-redis';

PrismaExtensionRedis({ config, client: fromUpstashLike(upstashClient) });
```
