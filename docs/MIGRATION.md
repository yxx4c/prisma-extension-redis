# Migration Guide

> **Which version are you coming from?** v3 was only ever published to the npm `next` tag — `latest` stayed on v2.1.1 until the v4 line. If you installed normally (`npm install prisma-extension-redis`), you're migrating from **v2**; notes that only apply to `next`-tag users are marked below. The v4 → v5 step is a single change, covered first.

## v4 → v5: bring your own Redis client

v5 has **zero runtime dependencies**. The extension no longer bundles `iovalkey` or constructs clients from connection options/URLs — you pass a client instance you own, mirroring Prisma 7's own driver-adapter pattern:

```typescript
// v4
PrismaExtensionRedis({ config, client: { host, port } });
PrismaExtensionRedis({ config, client: 'redis://localhost:6379' });

// v5 — construct the client yourself (npm i iovalkey, or ioredis)
import Redis from 'iovalkey';
PrismaExtensionRedis({ config, client: new Redis({ host, port }) });
PrismaExtensionRedis({ config, client: new Redis('redis://localhost:6379') });
```

That is the only breaking change. If you already passed an instance (ioredis-family, `@upstash/redis`, or a custom `RedisApi`) — most v4 setups — nothing changes. What you gain:

- `prisma.redis` is now typed as **exactly the client you passed** (previously typed as iovalkey).
- The published build imports nothing but the Prisma peer, so it bundles cleanly for edge runtimes (pair with `@upstash/redis`).
- You control the client's version, options, reconnection behavior, and lifecycle — the extension never opens or closes connections.

New in v5, no migration required: `auto.invalidateOnWrite` ([configuration guide](CONFIGURATION.md#write-invalidation-invalidateonwrite)), a RedisJSON startup probe with actionable errors, and `healthCheck().jsonSupport`.

## v2/v3 → v5

### Requirements

- **Prisma 7 or newer**, using the driver-adapter pattern and the `prisma-client` generator.
- **`@prisma/client` is now a peer dependency** — your project installs it alongside `prisma-extension-redis`, and the extension attaches to *your* client instance (no more nested duplicate copies, which also fixes the long-standing TS2742 "type cannot be named" errors in monorepos and NestJS).
- **A Redis client of your choice** — `npm i iovalkey` (or `ioredis`, or `@upstash/redis`); the extension no longer ships one.
- Node `^20.19 || ^22.12 || >=24` (matching `@prisma/client` 7).

### Setup changes

Before (v2/v3, Prisma 5/6):

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient().$extends(
  PrismaExtensionRedis({ config, client: { host, port } }),
);
```

After (v5, Prisma 7):

```typescript
import { PrismaPg } from '@prisma/adapter-pg'; // your database's driver adapter
import Redis from 'iovalkey'; // your Redis client (or ioredis, @upstash/redis)
import { PrismaClient } from './generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter }).$extends(
  PrismaExtensionRedis({ config, client: new Redis({ host, port }) }),
);
```

`@prisma/adapter-pg` is no longer installed transitively — depend on the driver adapter your database needs, and on the Redis client your infrastructure needs.

### Behavior changes

- **Query results are plain by default.** v3's wrapping of every result in `{ result, isCached }` is gone; you get the model type directly. (That wrapper only ever shipped on the `next` tag — coming from v2, results were already plain and nothing changes here.) Opt in per query with `meta: true` to receive `{ result, meta }` with cache source, timestamps, and `recache`/`uncache` actions ([docs](META_FEATURE.md)).
- **Auto-cache keys changed format** (a faster structural hash replaces `object-code`). Entries cached by v2/v3 are not re-used after upgrading; they expire via their TTLs on their own. Custom keys are unaffected.
- **`ttl: 0` with `stale: 0` is rejected at initialization** (`ValidationError`) — that combination produced entries that could never be served. `ttl: 0` with a positive `stale` remains valid (permanent stale-while-revalidate).
- **`unlinkPatterns` resolves with deletion counts** per pattern instead of booleans, matching the maintenance utilities.
- Dependency slim-down: `lodash`/`object-code`/`promise-coalesce`/`iovalkey` are all gone; the package has zero runtime dependencies.

### New since v4 (no migration required)

- **Bring your own Redis client** — pass an existing ioredis-family instance, an `@upstash/redis` client, or any custom `RedisApi` implementation ([docs](ADAPTERS.md)); works in edge runtimes with `@upstash/redis`.
- **Direct cache population and invalidation** — `prisma.cache({key, value})` and `prisma.uncache({uncacheKeys, hasPattern})` without a database operation; mixed key lists delete exact keys directly and only SCAN real patterns.
- **Write invalidation** — `auto.invalidateOnWrite` purges a model's auto-cache after successful writes ([docs](CONFIGURATION.md#write-invalidation-invalidateonwrite)).
- **`includedModels`** — whitelist mode for auto-caching, so new models are never cached by accident ([docs](CONFIGURATION.md)).
- **RedisJSON fail-fast** — a `type: 'JSON'` config probes the server at startup and reports a missing JSON module with the remedy; `healthCheck()` includes `jsonSupport`.
- Server-synced cache timestamps (single `GET` per read), health checks, metrics, cache warming, and maintenance utilities ([monitoring](MONITORING.md), [maintenance](MAINTENANCE.md)).
