
# Prisma Extension Redis

[![test](https://github.com/yxx4c/prisma-extension-redis/actions/workflows/test.yml/badge.svg)](https://github.com/yxx4c/prisma-extension-redis/actions/workflows/test.yml)
[![codecov](https://codecov.io/github/yxx4c/prisma-extension-redis/graph/badge.svg?token=G7O92H6I7T)](https://codecov.io/github/yxx4c/prisma-extension-redis)
![NPM License](https://img.shields.io/npm/l/prisma-extension-redis)
![NPM Version (latest)](https://img.shields.io/npm/v/prisma-extension-redis/latest)
![NPM Version (next)](https://img.shields.io/npm/v/prisma-extension-redis/next)
![NPM Downloads](https://img.shields.io/npm/dw/prisma-extension-redis)

`prisma-extension-redis` provides seamless integration with Prisma and Redis/Dragonfly databases, offering efficient caching mechanisms to improve data access times and overall application performance.

🚀 If `prisma-extension-redis` proves helpful, consider giving it a star! [⭐ Star Me!](https://github.com/yxx4c/prisma-extension-redis)

---

## Installation

You can install `prisma-extension-redis` using your preferred package manager:

**Using npm:**

```bash
npm install prisma-extension-redis
```

**Using yarn:**

```bash
yarn add prisma-extension-redis
```

**Using pnpm:**

```bash
pnpm add prisma-extension-redis
```

**Using bun:**

```bash
bun add prisma-extension-redis
```

**Note**: `@prisma/client` (v7.2 or higher) is a peer dependency — your project provides its own Prisma client, which this extension attaches to.

---

## Setup and Configuration

### Step 1: Initialize Required Clients

Before setting up caching, initialize your Prisma client and Redis client config:

```javascript
import { PrismaPg } from '@prisma/adapter-pg'; // Driver adapter for your database
import {
  PrismaExtensionRedis,
  type AutoCacheConfig,
  type CacheConfig,
} from 'prisma-extension-redis';
import { PrismaClient } from './generated/prisma/client'; // Prisma 7 generated client

// Prisma 7 uses driver adapters for database access
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Redis client config
const client = {
  host: process.env.REDIS_HOST_NAME,    // Redis host
  port: Number(process.env.REDIS_PORT), // Redis port
};
```

### Step 2: Configure Auto-Cache Settings

`auto` settings enable automated caching for read operations with flexible customization.

#### Example Auto-Cache Configuration

```javascript
const auto: AutoCacheConfig = {
  excludedModels: ['Post'], // Models excluded from auto-caching
  excludedOperations: ['findFirst', 'count', 'findMany'], // Operations excluded from auto-caching
  models: [
    {
      model: 'User', // Model-specific auto-cache settings
      excludedOperations: ['count'], // Operations to exclude
      ttl: 10,  // Fresh for 10 seconds
      stale: 5, // Then serve stale data for up to 5 more seconds while refreshing in background
    },
  ],
  ttl: 30, // Default TTL for cache in seconds
};
```

**Note**:

 1. Excluded operations and models will not benefit from auto-caching.
 2. Use `ttl` and `stale` values to define caching duration: an entry is fresh for `ttl` seconds, then served stale for up to `stale` more seconds (while a background refresh runs), so it lives in Redis for `ttl + stale` seconds in total.

### Step 3: Configure Cache Client

The cache client configuration is necessary to enable caching, either automatically or manually.

#### Example Cache Configuration

```javascript
const config: CacheConfig = {
  ttl: 60, // Default time-to-live in seconds: data is fresh until cachedAt + ttl
  stale: 30, // Extra stale window after ttl: stale data is served for up to 30 more seconds while a background refresh runs
  auto, // Auto-caching options (configured above)
  // Optional: Custom serialization (requires 'superjson' package)
  // import SuperJSON from 'superjson';
  // transformer: {
  //   deserialize: data => SuperJSON.parse(data),
  //   serialize: data => SuperJSON.stringify(data),
  // },
  type: 'JSON', // Redis cache type, whether you prefer the data to be stored as JSON or STRING in Redis
  cacheKey: { // Inbuilt cache key configuration
    // caseTransformer?: Function to transform cache key (default: snake_case)
    delimiter: '/', // Delimiter for keys (default value: ':'). Avoid Redis glob characters (* ? [ ]) — they break pattern-based invalidation
    prefix: 'awesomeness', // Cache key prefix (default value: 'prisma')
  },
};
```

**Note**: Cache case conversion strips all non alpha numeric characters

### Step 4: Extend Prisma Client

Now, extend your Prisma client with caching capabilities using `prisma-extension-redis`:

```javascript
const extendedPrisma = prisma.$extends(
  PrismaExtensionRedis({ config, client })
);
```

---

## Bring Your Own Redis Client

The `client` option is Redis-package agnostic. It accepts any of the following:

**1. Connection options or a URI string** — an [iovalkey](https://github.com/valkey-io/iovalkey) client is constructed for you (the classic behavior):

```typescript
PrismaExtensionRedis({ config, client: { host: 'localhost', port: 6379 } });
PrismaExtensionRedis({ config, client: 'redis://localhost:6379' });
```

**2. An existing ioredis-compatible instance** (`iovalkey`, `ioredis`, valkey clients) — you own the connection lifecycle:

```typescript
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
PrismaExtensionRedis({ config, client: redis });
```

**3. An Upstash-style REST client** (`@upstash/redis`) — detected and wrapped automatically; works with `automaticDeserialization` on or off:

```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
PrismaExtensionRedis({ config, client: redis });
```

**4. Any custom `RedisApi` implementation** — implement one small interface and any store works (see [docs/ADAPTERS.md](docs/ADAPTERS.md) for the full contract):

```typescript
import { PrismaExtensionRedis, type RedisApi } from 'prisma-extension-redis';

const myClient: RedisApi = {
  get: async (key) => /* ... */,
  set: async (key, value, ttlSeconds) => /* ... */,
  jsonGet: async (key) => /* ... */,
  jsonSet: async (key, value, ttlSeconds) => /* ... */,
  del: async (keys) => /* ... */,
  unlink: async (keys) => /* ... */,
  scan: async (cursor, match, count) => /* ... */,
  time: async () => /* server Unix seconds (optional) */,
  ping: async () => 'PONG',
};

PrismaExtensionRedis({ config, client: myClient });
```

**Timestamp consistency**: the extension keeps cache timestamps aligned with the Redis server clock by syncing a time offset (via `TIME`) at most every 5 seconds — reads stay a single `GET`. Clients without `TIME` support fall back to the local clock; sync failures are reported through `onError` and debug logging.

---

## Usage Guide

### Automatic Caching

With auto-caching, read operations (e.g., `findUnique`, `findMany`) are cached automatically based on the defined configuration.

**Basic Example:**

```javascript
// Cached automatically based on auto-cache settings
extendedPrisma.user.findUnique({
  where: { id: userId },
});

// Manually enable cache for a query
extendedPrisma.user.findUnique({
  where: { id: userId },
  cache: true, // Toggle caching on
});

// Disable cache for specific query
extendedPrisma.user.findFirst({
  where: { id: userId },
  cache: false, // Toggle caching off
});
```

**Note**:

1. If `auto-cache` is set to `false` and `cache` is set to `true` for the query, the default values from the cache configuration will be applied.
2. If `cache` is set to `false` and `auto-cache` is set to `true`, the query will not be cached.

### Custom Caching with `getKey`

For greater control over caching, generate custom cache keys and TTL settings.

**Example with Custom Cache Key:**

```javascript
const customKey = extendedPrisma.getKey({ params: [{ prisma: 'User' }, { id: userId }] });

extendedPrisma.user.findUnique({
  where: { id: userId },
  cache: { ttl: 5, key: customKey }, // Custom TTL and cache key
});
```

### Cache Invalidation

Cache invalidation ensures data consistency by removing or updating cached data when changes occur in the database.

**Example of Cache Invalidation:**

```javascript
// Invalidate cache when updating a user's information
extendedPrisma.user.update({
  where: { id: userId },
  data: { username: newUsername },
  uncache: {
    uncacheKeys: [
      extendedPrisma.getKey({ params: [{ prisma: 'User' }, { id: userId }] }), // Specific key to invalidate
      extendedPrisma.getKeyPattern({ params: [{ prisma: '*' }, { id: userId }]}), // Pattern for wildcard invalidation
      extendedPrisma.getKeyPattern({ params: [{ prisma: 'Post' }, { id: userId }, { glob: '*' }]}), // Use glob for more complex patterns
    ],
    hasPattern: true, // Use pattern matching for invalidation
  },
});
```

**Explanation of Cache Invalidation:**

- **`uncacheKeys`**: Specifies the keys or patterns to be invalidated.
- **`hasPattern`**: Indicates if wildcard patterns are used for key matching.

### Direct Cache Invalidation

Cache entries can also be deleted directly with the `uncache` client method, without performing a database operation:

```javascript
const { deleted } = await extendedPrisma.uncache({
  uncacheKeys: [
    extendedPrisma.getKey({ params: [{ prisma: 'User' }, { id: userId }] }),
    extendedPrisma.getKeyPattern({ params: [{ prisma: 'Post' }, { glob: '*' }] }),
  ],
  hasPattern: true,
});
```

Exact keys are removed immediately with `UNLINK`; keys containing glob characters (`*` or `?`) are expanded with `SCAN` when `hasPattern` is true. The same function is available as a standalone import for use outside the extension: `import { uncache } from 'prisma-extension-redis'`.

---

## Key Concepts Explained

### 1. **Time-to-Live (TTL)**

- Specifies how long (in seconds) a cached entry is considered fresh: from `cachedAt` until `cachedAt + ttl`.
- **Default TTL**: Used when no specific TTL is provided for a query.

### 2. **Stale Time**

- An **extra window after the TTL expires** during which the expired entry is still served while fresh data is fetched in the background: from `cachedAt + ttl` until `cachedAt + ttl + stale` (reported as `staleUntil` in meta).
- A cached entry therefore lives in Redis for `ttl + stale` seconds in total.
- This ensures that users experience minimal latency even when data is being updated. Queries served from this window report `source: 'stale-cache'` in their meta.

### 3. **Cache Key Management**

- **`getKey`**: Generates a unique key for caching queries from provided key context parameters.
- **`getAutoKey`**: Generates a unique key for auto-caching queries, based on query parameters.
- **`getKeyPattern`**: Creates patterns for more complex invalidation scenarios, using wildcards.

---

## Key Features

- **Auto-Caching**: Automatically cache read operations, reducing redundant queries and improving performance.
- **Selective Caching**: Customize which queries to cache, how long to cache them, and whether to cache them at all.
- **Efficient Invalidation**: Keep cached data up-to-date by selectively invalidating caches when updates or deletions occur.
- **Granular Control**: Easily toggle caching on or off for individual queries as needed.
- **Metrics & Monitoring**: Built-in metrics collection and event callbacks for observability.
- **Health Checks**: Monitor Redis connection health with latency tracking.
- **Cache Maintenance**: Utilities for cache statistics, model flushing, and orphaned key cleanup.

---

## Meta Information

Get detailed cache information by passing `meta: true` to any cached query:

```typescript
const { result, meta } = await prisma.user.findUnique({
  where: { id: 1 },
  cache: { key: 'user:1', ttl: 60, stale: 30 },
  meta: true,
});

console.log(meta);
// {
//   source: 'cache',        // 'cache' | 'stale-cache' | 'db'
//   isCached: true,
//   key: 'user:1',
//   cachedAt: 1703847600,   // Unix timestamp (seconds)
//   expiresAt: 1703847660,  // cachedAt + ttl
//   staleUntil: 1703847690, // cachedAt + ttl + stale
//   recache: [Function],    // Force refresh the cache
//   uncache: [Function],    // Delete from cache
//   errors: undefined,      // Any cache operation errors
// }

// Force refresh the cache
const refreshed = await meta.recache();

// Delete from cache
const { deleted } = await meta.uncache();
```

---

## Monitoring & Observability

### Event Callbacks

Monitor cache operations with event callbacks:

```typescript
const prisma = new PrismaClient().$extends(
  PrismaExtensionRedis({
    config: {
      ttl: 300,
      stale: 60,
      auto: true,
      type: 'JSON',
      onHit: (key) => {
        console.log('Cache hit:', key);
      },
      onMiss: (key) => {
        console.log('Cache miss:', key);
      },
      onError: (error) => {
        console.error('Cache error:', error);
      },
    },
    client: redisOptions,
  })
);
```

### Metrics Collection

Track cache performance with the built-in metrics collector:

```typescript
import { createMetricsCollector, PrismaExtensionRedis } from 'prisma-extension-redis';

const metrics = createMetricsCollector();

const prisma = new PrismaClient().$extends(
  PrismaExtensionRedis({
    config: {
      ttl: 60,
      stale: 30,
      auto: true,
      type: 'JSON',
      metricsCollector: metrics,
    },
    client: redisOptions,
  })
);

// Get metrics anytime
const stats = metrics.getMetrics();
console.log(`Hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
console.log(`Cache hits: ${stats.hits}, Misses: ${stats.misses}`);
console.log(`Avg cache latency: ${stats.avgCacheLatencyMs.toFixed(2)}ms`);
console.log(`Avg DB latency: ${stats.avgDbLatencyMs.toFixed(2)}ms`);

// Reset metrics
metrics.reset();
```

### Health Check

Monitor Redis connection health:

```typescript
const health = await prisma.healthCheck();

console.log(health);
// {
//   status: 'healthy',      // 'healthy' | 'degraded' | 'unhealthy'
//   latencyMs: 2,
//   connected: true,
//   timestamp: Date,
//   serverInfo: { version: '7.0.0', mode: 'standalone' }
// }

if (health.status === 'unhealthy') {
  console.error('Redis unavailable:', health.error);
}
```

---

## Cache Maintenance

### Cache Statistics

Get statistics about cached data:

```typescript
const stats = await prisma.getCacheStats();

console.log(`Total keys: ${stats.totalKeys}`);
console.log('Keys by model:', stats.keysByModel);
// { user: 150, post: 320, comment: 45 }
console.log(`Estimated size: ${stats.estimatedSizeBytes} bytes`);
```

### Flush Model Cache

Invalidate all cache entries for a specific model:

```typescript
// After bulk updates to users
const result = await prisma.flushModelCache('User');
console.log(`Deleted ${result.deletedCount} cache entries in ${result.durationMs}ms`);
```

### Cleanup Orphaned Keys

Remove cache keys for models that no longer exist in your schema:

```typescript
// Get valid models from your Prisma schema
const validModels = ['User', 'Post', 'Comment'];

// Dry run first to preview what would be deleted
const preview = await prisma.cleanupOrphanedKeys(validModels, { dryRun: true });
console.log(`Found ${preview.orphanedKeys.length} orphaned keys`);

// Actually delete orphaned keys
const result = await prisma.cleanupOrphanedKeys(validModels, { dryRun: false });
console.log(`Deleted ${result.deletedCount} orphaned keys`);
```

---

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | Required | Freshness window in seconds (fresh until `cachedAt + ttl`) |
| `stale` | `number` | `0` | Extra stale window after TTL; entries live for `ttl + stale` seconds in total |
| `type` | `'JSON' \| 'STRING'` | Required | Redis storage format |
| `auto` | `boolean \| AutoCacheConfig` | Required | Enable auto-caching (`false` disables it) |
| `transformer` | `{ serialize, deserialize }` | JSON methods | Custom serialization |
| `onHit` | `(key: string) => void` | - | Cache hit callback |
| `onMiss` | `(key: string) => void` | - | Cache miss callback |
| `onError` | `(error: unknown) => void` | - | Error callback |
| `metricsCollector` | `MetricsCollector` | - | Metrics tracking instance |
| `debug` | `'off' \| 'error' \| 'warn' \| 'info' \| 'debug'` | `'off'` | Debug logging level |
| `chunkSize` | `number` | `1000` | Batch size for pattern deletion |
| `maxConcurrentBatches` | `number` | `5` | Concurrent deletion batches |
| `cacheKey.prefix` | `string` | `'prisma'` | Cache key prefix |
| `cacheKey.delimiter` | `string` | `':'` | Cache key delimiter |
| `cacheKey.caseTransformer` | `(s: string) => string` | `snakeCase` | Key transformation function |

### AutoCacheConfig Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `excludedModels` | `string[]` | `[]` | Models to exclude from auto-caching |
| `excludedOperations` | `Operation[]` | `[]` | Operations to exclude globally |
| `models` | `ModelConfig[]` | `[]` | Model-specific configurations |
| `ttl` | `number` | Config TTL | Default TTL for auto-cached queries |
| `stale` | `number` | Config stale | Default extra stale window for auto-cached queries |

---

## Prerequisites

- **Prisma 7 or higher** is required. This package uses the Prisma 7 driver adapter pattern.
- Ensure you have a running Redis or Dragonfly instance. If using Redis, `Redis.JSON` must be enabled to use JSON type cache (by default, it is enabled in Dragonfly).

## Dependencies

- `iovalkey` is the only runtime dependency, used to construct a client when you pass connection options. Bring your own client (ioredis, @upstash/redis, or a custom `RedisApi`) and it is the only connection layer used.
- Auto-cache key hashing and concurrent-read coalescing are implemented inline (no external hashing or coalescing libraries).

---

## Final Thoughts

`prisma-extension-redis` offers an efficient and powerful way to manage caching in Prisma-based applications. By leveraging both automatic and custom caching, you can optimize your application's performance while maintaining data consistency.

Upgrade to `prisma-extension-redis` for an optimized caching strategy and contribute to its growth by starring the repository if you find it useful!
