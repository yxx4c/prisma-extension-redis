
# Prisma Extension Redis

[![test](https://github.com/yxx4c/prisma-extension-redis/actions/workflows/test.yml/badge.svg)](https://github.com/yxx4c/prisma-extension-redis/actions/workflows/test.yml)
[![codecov](https://codecov.io/github/yxx4c/prisma-extension-redis/graph/badge.svg?token=G7O92H6I7T)](https://codecov.io/github/yxx4c/prisma-extension-redis)
![NPM License](https://img.shields.io/npm/l/prisma-extension-redis)
![NPM Version (latest)](https://img.shields.io/npm/v/prisma-extension-redis/latest)
![NPM Version (next)](https://img.shields.io/npm/v/prisma-extension-redis/next)
![NPM Downloads](https://img.shields.io/npm/dw/prisma-extension-redis)

`prisma-extension-redis` provides seamless integration with Prisma and Redis/Dragonfly databases, offering efficient caching mechanisms to improve data access times and overall application performance. Features include automatic caching, automatic invalidation, and direct cache access methods.

🚀 If `prisma-extension-redis` proves helpful, consider giving it a star! [⭐ Star Me!](https://github.com/yxx4c/prisma-extension-redis)

---

## Installation

You can install `prisma-extension-redis` using your preferred package manager:

**Using npm:**

```bash
npm install prisma-extension-redis iovalkey # or ioredis, or any redis provider
```

**Using yarn:**

```bash
yarn add prisma-extension-redis iovalkey # or ioredis, or any redis provider
```

**Using pnpm:**

```bash
pnpm add prisma-extension-redis iovalkey # or ioredis, or any redis provider
```

**Using bun:**

```bash
bun add prisma-extension-redis iovalkey # or ioredis, or any redis provider
```

**Note:** You also need to install the Redis client library you intend to use (`iovalkey` or `ioredis`, or any other redis provider).

---

## Setup and Configuration

### Step 1: Initialize Prisma Client and Cache Provider

Initialize your Prisma client and choose a cache provider (`IovalkeyCacheProvider` or `IoredisCacheProvider`, or implement easily a new provider yourself). Instantiate the provider with its specific options.

```javascript
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'iovalkey'; // Or import Redis from 'ioredis'
import {SuperJSON} from 'superjson';

import {
  PrismaExtensionRedis,
  IovalkeyCacheProvider, // Or IoredisCacheProvider
  type AutoCacheConfig,
  type CacheConfig,
  CacheCase,
} from 'prisma-extension-redis';

// Prisma Client
const prisma = new PrismaClient();

// Logger (optional)
const logger = pino();

// Instantiate your chosen Cache Provider
// Example using iovalkey
const provider = new IovalkeyCacheProvider({
  host: process.env.REDIS_HOST_NAME, // Redis host
  port: process.env.REDIS_PORT,      // Redis port
  // other iovalkey options...
});

// Example using ioredis
// import { Redis as IoredisClient } from 'ioredis';
// const ioredisInstance = new IoredisClient({ ... });
// const provider = new IoredisCacheProvider(ioredisInstance);

```

### Step 2: Configure Auto-Cache Settings (Optional)

`auto` settings enable automated caching for read operations with flexible customization.

#### Example Auto-Cache Configuration

```javascript
const auto: AutoCacheConfig = {
  excludedModels: ['Post'], // Models excluded from auto-caching
  excludedOperations: ['findFirst', 'count', 'findMany'], // Operations excluded from auto-caching
  models: [
    {
      model: 'User', // Model-specific auto-cache settings
      excludedOperations: ['count'], // Operations to exclude for this model
      ttl: 10,  // Time-to-live (TTL) for cache in seconds
      stale: 5, // Stale time in seconds
    },
  ],
  ttl: 30, // Default TTL for cache in seconds for auto-cached items
};
```

**Note**:

 1. Excluded operations and models will not benefit from auto-caching.
 2. Use `ttl` and `stale` values to define caching duration.

### Step 3: Configure Cache Client Options

Define caching behavior, including defaults for TTL, stale time, automatic invalidation, and default caching.

```javascript
const config: CacheConfig = {
  ttl: 60,      // Default Time-to-live for caching in seconds
  stale: 30,    // Default Stale time after ttl in seconds
  auto,         // Auto-caching options (configured above, or set to `true`/`false`)
  logger,       // Logger instance (optional)
  defaultCache: true, // Cache read operations by default? (Default: true)
  autoInvalidate: true, // Automatically invalidate cache on mutations? (Default: true)
  transformer: {
    // Custom serialize and deserialize function
    deserialize: data => SuperJSON.parse(data),
    serialize: data => SuperJSON.stringify(data),
  },
  type: 'JSON',   // Cache type: 'JSON' (requires RedisJSON enabled) or 'STRING'. Default handled by provider typically.
  cacheKey: {     // Cache key generation options
    case: CacheCase.SNAKE_CASE,
    delimiter: '*',
    prefix: 'awesomeness',
  },
};
```

**Note**:
*   `defaultCache: true` means read operations like `findUnique`, `findMany` are cached automatically using default TTL/stale unless `cache: false` is specified in the query.
*   `autoInvalidate: true` means mutations (`create`, `update`, `delete`, etc.) will attempt to invalidate relevant cache entries automatically.

### Step 4: Extend Prisma Client

Extend your Prisma client, passing the `config` and the instantiated cache `provider`.

```javascript
const extendedPrisma = prisma.$extends(
  PrismaExtensionRedis({ config, provider }) // Pass the redis provider instance
);
```

---

## Usage Guide

### Automatic Caching & Default Caching

With `defaultCache: true` (the default), read operations are cached automatically. You can explicitly disable caching for a query using `cache: false`.

```javascript
// Cached automatically using default TTL/stale from config
extendedPrisma.user.findUnique({
  where: { id: userId },
});

// Still cached automatically if defaultCache is true
extendedPrisma.user.findMany({
  where: { active: true },
});

// Explicitly disable cache for this query
extendedPrisma.user.findFirst({
  where: { email: userEmail },
  cache: false, // Toggle caching off for this specific query
});

// If defaultCache: false, this would NOT be cached unless auto-cache rules apply or cache: true is set
```

### Custom Caching

Manually control caching per query using the `cache` option.

```javascript
// Manually enable cache for a query with custom TTL and key
const customKey = extendedPrisma.getKey({ params: [{ prisma: 'User' }, { id: userId }] });
extendedPrisma.user.findUnique({
  where: { id: userId },
  cache: { ttl: 5, key: customKey }, // Custom TTL and cache key
});
```

### Cache Invalidation

#### Automatic Invalidation
With `autoInvalidate: true` (the default), the extension automatically attempts to invalidate cache entries when mutations occur. It typically invalidates patterns related to the modified model (e.g., `prefix:User:*`).

```javascript
// This update automatically invalidates User-related cache entries
// (e.g., potentially clearing caches for findUnique user:1, findMany users)
await extendedPrisma.user.update({
  where: { id: userId },
  data: { username: newUsername },
});
```

#### Manual Invalidation (During Mutation)
You can manually specify keys or patterns to invalidate during a mutation using the `invalidate` option. This overrides automatic invalidation for that operation if provided.

```javascript
// Update user and manually invalidate specific keys/patterns
await extendedPrisma.user.update({
  where: { id: userId },
  data: { username: newUsername },
  invalidate: { // Replaces 'uncache'
    invalidateKeys: [ // Replaces 'uncacheKeys'
      extendedPrisma.getKey({ params: [{ prisma: 'User' }, { id: userId }] }), // Specific key
      extendedPrisma.getKeyPattern({ params: [{ prisma: 'Post' }, { userId: userId }, { glob: '*' }]}), // Pattern
    ],
    hasPattern: true, // Indicate if patterns are used
  },
});
```

#### Manual Invalidation (Standalone)
Use the `prisma.model.invalidate()` method to manually invalidate cache entries outside of a mutation.

```javascript
const userKey = extendedPrisma.getKey({ params: [{ prisma: 'User' }, { id: userId }] });
const userPattern = extendedPrisma.getKeyPattern({ params: [{ prisma: 'User' }, { glob: '*' }] });

// Invalidate a single key
await extendedPrisma.user.invalidate(userKey);

// Invalidate multiple keys
await extendedPrisma.user.invalidate([userKey, 'anotherKey']);

// Invalidate using a pattern
await extendedPrisma.user.invalidate({ pattern: userPattern });
```

### Direct Cache Access (`.cache()`)

Use the `prisma.model.cache()` method to directly retrieve data from the cache without hitting the database. It respects TTL but ignores stale time. Returns `null` if not found or expired.

```javascript
// Try to get user directly from cache
const cachedUser = await extendedPrisma.user.cache({
  where: { id: userId },
  // You might need to include select/include if the original query did,
  // as the key generation depends on the full arguments.
  // select: { id: true, name: true, email: true }
});

if (cachedUser) {
  console.log("User found in cache:", cachedUser);
} else {
  console.log("User not in cache or expired.");
  // Fetch from DB if needed
  const dbUser = await extendedPrisma.user.findUnique({ where: { id: userId } });
}
```
**Note:** The arguments passed to `.cache()` (especially `where`, `select`, `include`) should match the arguments of the original query that populated the cache for the key generation to match correctly.

---

## Key Concepts Explained

### 1. **Time-to-Live (TTL)**
   - How long (seconds) a cache entry is considered fresh.

### 2. **Stale Time**
   - How long (seconds) *after* TTL expires the stale data can still be served while fresh data is fetched in the background. `.cache()` ignores this.

### 3. **Default Caching (`defaultCache`)**
   - If `true`, read operations are cached by default using `ttl` and `stale` from the main config.

### 4. **Automatic Invalidation (`autoInvalidate`)**
   - If `true`, mutations automatically attempt to clear related cache entries (model-level pattern).

### 5. **Cache Key Management**
   - `getKey`: Generate keys manually.
   - `getAutoKey`: Generate keys for automatic caching (based on model, operation, args hash).
   - `getKeyPattern`: Create patterns for invalidation.

---

## Key Features

- **Default & Auto-Caching**: Cache reads automatically with minimal setup.
- **Auto-Invalidation**: Keeps cache reasonably fresh after mutations automatically.
- **Selective Caching/Invalidation**: Fine-tune caching and invalidation per query.
- **Direct Cache Access**: Retrieve cached data directly using `.cache()`.
- **Manual Invalidation**: Clear specific cache entries or patterns using `.invalidate()`.
- **Provider Abstraction**: Use `iovalkey` or `ioredis` (or bring your own).
- **Logger Support**: Monitor cache events.

---

## Prerequisites

- A running Redis or Dragonfly instance. RedisJSON module needed if using `type: 'JSON'`.

## Dependencies

- Requires `iovalkey` or `ioredis` installed separately, or any other Redis provider
- Uses `micromatch` for pattern matching.
- Uses `object-code` for hashing in auto-key generation.
- Uses `lodash-es` for case conversion in key management.

---

## Final Thoughts

`prisma-extension-redis` offers a powerful and flexible caching layer for Prisma. Leverage default behaviors for ease of use or customize granularly for optimal performance and data consistency.

Remember to star the repository if you find it helpful!
