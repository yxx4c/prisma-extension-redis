
# Prisma Extension Redis

[![test](https://github.com/yxx4c/prisma-extension-redis/actions/workflows/test.yml/badge.svg)](https://github.com/yxx4c/prisma-extension-redis/actions/workflows/test.yml)
[![codecov](https://codecov.io/github/yxx4c/prisma-extension-redis/graph/badge.svg?token=G7O92H6I7T)](https://codecov.io/github/yxx4c/prisma-extension-redis)
![NPM License](https://img.shields.io/npm/l/prisma-extension-redis)
![NPM Version (latest)](https://img.shields.io/npm/v/prisma-extension-redis/latest)
![NPM Version (next)](https://img.shields.io/npm/v/prisma-extension-redis/next)
![NPM Downloads](https://img.shields.io/npm/dw/prisma-extension-redis)

Caching for Prisma, done right: auto-caching, write invalidation, and stale-while-revalidate on Redis, Dragonfly, or Upstash — with **zero runtime dependencies** and a Redis client you bring and own.

**📚 Full documentation: [yxx4c.github.io/prisma-extension-redis](https://yxx4c.github.io/prisma-extension-redis/)**

🚀 If `prisma-extension-redis` proves helpful, consider giving it a star! [⭐ Star Me!](https://github.com/yxx4c/prisma-extension-redis)

---

## What's New in v5

- **Zero runtime dependencies — bring your own Redis client**: pass an ioredis-family instance, an `@upstash/redis` client, or any custom `RedisApi`; the extension never opens connections on your behalf, and `prisma.redis` is typed as exactly the client you passed
- **Write invalidation**: `auto.invalidateOnWrite` purges a model's auto-cache after successful writes
- **Edge-ready**: the published build imports nothing but the Prisma peer — pair it with `@upstash/redis` in Cloudflare Workers or Vercel Edge
- **Fail-fast diagnostics**: a JSON-configured extension probes RedisJSON support at startup and says exactly how to fix a mismatch; `healthCheck()` reports `jsonSupport`
- Everything from the v4 line: Prisma 7 driver adapters with `@prisma/client` as a peer dependency, direct `prisma.cache(...)`/`prisma.uncache(...)`, `includedModels`, plain results with opt-in `meta: true`, server-synced timestamps

Upgrading from v2, v3, or v4? See the [migration guide](https://yxx4c.github.io/prisma-extension-redis/MIGRATION).

---

## Battle-Tested

The v5 release was validated end to end — full numbers and methodology in the [assurance report](https://yxx4c.github.io/prisma-extension-redis/ASSURANCE):

- **303 tests, 100% line coverage**, run against real servers: Dragonfly, Redis Stack 7.4, and Redis 8 (native JSON) — plus the Prisma peer floor in CI
- **250k concurrent requests**: 100:1 request coalescing (2,500 DB calls), ~31k req/s, p50 2.8ms / p95 6.7ms, zero failures
- **1-hour soak** under mixed read/write/invalidation traffic: tens of millions of requests, heap bounded, zero failures
- **Chaos**: Redis killed mid-traffic — 100% of requests still served (from the database), automatic recovery on restart
- **Eviction pressure**: 1,600+ entries LRU-evicted underneath the extension — every read still correct
- **Live client matrix**: iovalkey, ioredis, and @upstash/redis (real REST endpoint) pass the same conformance suite
- **The published artifact itself** is verified: installed from npm into a fresh consumer, zero dependencies on the wire, ESM + CJS, provenance-attested

---

## Quick Start

```bash
npm install prisma-extension-redis iovalkey   # or ioredis, or @upstash/redis
```

`@prisma/client` (v7.2+) is a peer dependency your project already provides.

```typescript
import { PrismaPg } from '@prisma/adapter-pg'; // your database's driver adapter
import Redis from 'iovalkey';                  // your Redis client — you own it
import { PrismaExtensionRedis } from 'prisma-extension-redis';
import { PrismaClient } from './generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter }).$extends(
  PrismaExtensionRedis({
    config: {
      ttl: 60,      // fresh for 60s
      stale: 30,    // then served stale for up to 30s while refreshing in background
      type: 'JSON', // or 'STRING' for servers without RedisJSON (Redis ≤ 7 without the module)
      auto: {
        invalidateOnWrite: true, // writes purge the model's auto-cached reads
        ttl: 60,
        stale: 30,
      },
    },
    client: new Redis(process.env.REDIS_URL),
  }),
);
```

```typescript
// Auto-cached — nothing to change at the call site
const user = await prisma.user.findUnique({ where: { id: 1 } });

// This write purges User's auto-cache (invalidateOnWrite)
await prisma.user.update({ where: { id: 1 }, data: { name: 'Ada' } });

// Custom key + explicit invalidation, when you want control
const key = prisma.getKey({ params: [{ prisma: 'User' }, { id: 1 }] });
await prisma.user.findUnique({ where: { id: 1 }, cache: { ttl: 300, key } });
await prisma.uncache({ uncacheKeys: [key] });

// Opt into cache metadata per query
const { result, meta } = await prisma.user.findUnique({
  where: { id: 1 },
  meta: true,
});
console.log(meta.source); // 'cache' | 'stale-cache' | 'db'
```

---

## Documentation

| Topic | |
|---|---|
| [Getting Started](https://yxx4c.github.io/prisma-extension-redis/GETTING_STARTED) | Install, wire up, first cached query |
| [Configuration Reference](https://yxx4c.github.io/prisma-extension-redis/CONFIGURATION) | Every option: auto-caching, `invalidateOnWrite`, keys, TTL semantics, transformers |
| [Bring Your Own Client](https://yxx4c.github.io/prisma-extension-redis/ADAPTERS) | ioredis-family, Upstash, edge runtimes, custom `RedisApi` adapters |
| [Meta Information](https://yxx4c.github.io/prisma-extension-redis/META_FEATURE) | Per-query cache source, timestamps, `recache`/`uncache` actions |
| [Monitoring](https://yxx4c.github.io/prisma-extension-redis/MONITORING) | Health checks, metrics, debug logging, event hooks |
| [Cache Maintenance](https://yxx4c.github.io/prisma-extension-redis/MAINTENANCE) | Stats, model flushes, orphaned-key cleanup, cache warming |
| [Migration Guide](https://yxx4c.github.io/prisma-extension-redis/MIGRATION) | v2/v3/v4 → v5 |
| [Assurance Report](https://yxx4c.github.io/prisma-extension-redis/ASSURANCE) | The validation campaign, with numbers |
| [Testing](https://yxx4c.github.io/prisma-extension-redis/TESTING) | Run the suite and the stress harnesses yourself |

The same pages live in [`docs/`](docs/) if you prefer reading in the repository.

---

## Prerequisites

- **Prisma 7 or higher**, using the driver-adapter pattern.
- **A Redis client of your choice** (`iovalkey`, `ioredis`, `@upstash/redis`, or a custom `RedisApi`) — the extension never constructs connections itself.
- A running Redis-compatible server. `type: 'JSON'` needs RedisJSON — built into Redis 8, Redis Stack, and Dragonfly; with `type: 'JSON'` the extension probes at startup and tells you exactly what to change if it's missing. `type: 'STRING'` works everywhere.

## Dependencies

**None.** The Redis client is yours, `@prisma/client` is a peer, and hashing/coalescing are implemented inline.

---

## Final Thoughts

Cache invalidation is one of the hard problems — this extension gives you layered tools for it: automatic write invalidation for the common case, key- and pattern-based invalidation for precise control, and TTL + stale-while-revalidate as the always-on safety net. Choose the layer that fits each query.

**Note**: When caching, be mindful of sensitive data in cached results. The cache stores query results as written — apply the same access controls to your Redis instance as to your database.
