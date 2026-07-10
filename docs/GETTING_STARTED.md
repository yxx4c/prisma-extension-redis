# Getting Started

## Install

The extension has **zero runtime dependencies** — you bring the Redis client, exactly like Prisma 7's driver adapters bring the database driver:

```bash
npm install prisma-extension-redis iovalkey   # or ioredis, or @upstash/redis
```

`@prisma/client` (v7.2+) is a peer dependency your project already provides.

## Wire it up

```typescript
import { PrismaPg } from '@prisma/adapter-pg'; // your database's driver adapter
import Redis from 'iovalkey';                  // your Redis client
import { PrismaExtensionRedis } from 'prisma-extension-redis';
import { PrismaClient } from './generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter }).$extends(
  PrismaExtensionRedis({
    config: {
      ttl: 60,     // fresh for 60s
      stale: 30,   // then served stale for up to 30s while refreshing in background
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

## Use it

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

## Where next

- Every option, explained: [Configuration Reference](CONFIGURATION.md)
- ioredis, Upstash, edge runtimes, custom stores: [Bring Your Own Client](ADAPTERS.md)
- Cache metadata and actions: [Meta Information](META_FEATURE.md)
- Health, metrics, debugging: [Monitoring](MONITORING.md)
- Coming from v2/v3/v4: [Migration Guide](MIGRATION.md)
- How all of this is verified: [Assurance Report](ASSURANCE.md)
