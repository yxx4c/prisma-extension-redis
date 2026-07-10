# Migrating to v4

## Requirements

- **Prisma 7 or newer**, using the driver-adapter pattern and the `prisma-client` generator.
- **`@prisma/client` is now a peer dependency** — your project installs it alongside `prisma-extension-redis`, and the extension attaches to *your* client instance (no more nested duplicate copies, which also fixes the long-standing TS2742 "type cannot be named" errors in monorepos and NestJS).
- Node `^20.19 || ^22.12 || >=24` (matching `@prisma/client` 7).

## Setup changes

Before (v3, Prisma 6):

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient().$extends(
  PrismaExtensionRedis({ config, client: { host, port } }),
);
```

After (v4, Prisma 7):

```typescript
import { PrismaPg } from '@prisma/adapter-pg'; // your database's driver adapter
import { PrismaClient } from './generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter }).$extends(
  PrismaExtensionRedis({ config, client: { host, port } }),
);
```

`@prisma/adapter-pg` is no longer installed transitively — depend on the driver adapter your database needs.

## Behavior changes

- **Query results are plain by default.** The v3.0 behavior of wrapping every result in `{ result, isCached }` is gone; you get the model type directly. Opt in per query with `meta: true` to receive `{ result, meta }` with cache source, timestamps, and `recache`/`uncache` actions ([docs](META_FEATURE.md)).
- **Auto-cache keys changed format** (a faster structural hash replaces `object-code`). Entries cached by v3 are not re-used after upgrading; they expire via their TTLs on their own. Custom keys are unaffected.
- **`ttl: 0` with `stale: 0` is rejected at initialization** (`ValidationError`) — that combination produced entries that could never be served. `ttl: 0` with a positive `stale` remains valid (permanent stale-while-revalidate).
- **`unlinkPatterns` resolves with deletion counts** per pattern instead of booleans, matching the maintenance utilities.
- Dependency slim-down: `lodash`/`object-code`/`promise-coalesce` are gone; `iovalkey` is the only runtime dependency.

## New in v4 (no migration required)

- **Bring your own Redis client** — pass an existing ioredis-family instance, an `@upstash/redis` client, or any custom `RedisApi` implementation ([docs](ADAPTERS.md)).
- **Direct cache population and invalidation** — `prisma.cache({key, value})` and `prisma.uncache({uncacheKeys, hasPattern})` without a database operation; mixed key lists delete exact keys directly and only SCAN real patterns.
- **`includedModels`** — whitelist mode for auto-caching, so new models are never cached by accident ([docs](CONFIGURATION.md)).
- Server-synced cache timestamps (single `GET` per read), health checks, metrics, cache warming, and maintenance utilities ([monitoring](MONITORING.md), [maintenance](MAINTENANCE.md)).
