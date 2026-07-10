# Redis Client Adapters

`prisma-extension-redis` is Redis-package agnostic and has **zero runtime dependencies** — you construct the client, the extension detects and wraps it. Everything the extension does — cache reads/writes, pattern invalidation, maintenance scans, health checks, server-time sync — goes through one small interface, `RedisApi`. The `client` option accepts:

| You pass | What happens |
|---|---|
| An ioredis-compatible instance (`iovalkey`, `ioredis`, valkey clients) | Wrapped automatically via `fromIoValkeyLike` |
| An Upstash-style REST client (`@upstash/redis`) | Wrapped automatically via `fromUpstashLike` |
| A `RedisApi` implementation | Used directly |

Connection options and `redis://` URLs are rejected with a `TypeError` naming the remedy — the extension never opens connections on your behalf (construct the client yourself: `npm i iovalkey`, then `client: new Redis(...)`). A mis-shaped client object is likewise rejected at initialization instead of failing at first use.

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
- **Connection lifecycle is entirely yours.** The extension never constructs clients and never calls `quit`/`disconnect`. The client you supplied is exposed back as `prisma.redis`, typed as exactly what you passed, for direct access anywhere in your app.

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

## Edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy)

The published build imports nothing except the `@prisma/client` peer — no Node built-ins, no bundled Redis client — so it bundles cleanly for edge targets. The practical pairing is `@upstash/redis`: it speaks REST over `fetch`, which every edge runtime provides, and the extension detects it automatically (see the example above). TCP clients (`iovalkey`, `ioredis`) are Node-only and won't run on edge platforms.

Notes for edge deployments:

- Use Prisma's edge-compatible driver adapters for the database side, following [Prisma's own edge guidance](https://www.prisma.io/docs/orm/prisma-client/deployment/edge).
- `@upstash/redis` exposes `time()`, so server-synced timestamps work; if you use a custom REST client without `time`, the extension quietly falls back to the local clock.
- Upstash applies JSON TTLs non-atomically (see note above) — the same caveat applies on edge.

## Example: custom in-memory adapter (tests)

The repository's test suite runs the full extension against an in-memory `RedisApi` fake (`test/fakeRedisApi.ts`, exercised by `test/unit/custom-adapter.test.ts`) — a useful starting point for your own adapter or for hermetic tests of code that uses the extension.

## Manual wrapping

`fromIoValkeyLike` and `fromUpstashLike` are exported if you prefer explicit wrapping over auto-detection:

```typescript
import { fromUpstashLike, PrismaExtensionRedis } from 'prisma-extension-redis';

PrismaExtensionRedis({ config, client: fromUpstashLike(upstashClient) });
```
