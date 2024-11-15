
# Prisma Extension Redis

![NPM License](https://img.shields.io/npm/l/prisma-extension-redis)
![NPM Version](https://img.shields.io/npm/v/prisma-extension-redis)
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

---

## Setup and Configuration

### Step 1: Initialize Required Clients

Before setting up caching, initialize your Prisma client, Redis client config, and logger:

```javascript
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'iovalkey';
import {SuperJSON} from 'superjson';

import {
  CacheCase,
  PrismaExtensionRedis,
  type AutoCacheConfig,
  type CacheConfig,
} from 'prisma-extension-redis';


// Prisma Client
const prisma = new PrismaClient();

// Redis client config
const client = {
  host: process.env.REDIS_HOST_NAME, // Redis host
  port: process.env.REDIS_PORT,      // Redis port
};

// Create a logger using pino (optional)
const logger = pino();
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
      ttl: 10,  // Time-to-live (TTL) for cache in seconds
      stale: 5, // Stale time in seconds
    },
  ],
  ttl: 30, // Default TTL for cache in seconds
};
```

**Note**:

 1. Excluded operations and models will not benefit from auto-caching.
 2. Use `ttl` and `stale` values to define caching duration.

### Step 3: Configure Cache Client

The cache client configuration is necessary to enable caching, either automatically or manually.

#### Example Cache Configuration

```javascript
const config: CacheConfig = {
 ttl: 60, // Default Time-to-live for caching in seconds
  stale: 30, // Default Stale time after ttl in seconds
  auto, // Auto-caching options (configured above)
  logger, // Logger for cache events (configured above)
  transformer: {
    // Custom serialize and deserialize function for additional functionality if required
    deserialize: data => SuperJSON.parse(data),
    serialize: data => SuperJSON.stringify(data),
  },
  type: 'JSON', // Redis cache type, whether you prefer the data to be stored as JSON or STRING in Redis
  cacheKey: { // Inbuilt cache key configuration
    case: CacheCase.SNAKE_CASE, // Select a cache case conversion option for generated keys from CacheCase
    delimiter: '*', // Delimiter for keys (default value: ':')
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
      getKeyPattern({ params: [{ prisma: '*' }, { id: userId }]}), // Pattern for wildcard invalidation
      getKeyPattern({ params: [{ prisma: 'Post' }, { id: userId }, { glob: '*' }]}), // Use glob for more complex patterns
    ],
    hasPattern: true, // Use pattern matching for invalidation
  },
});
```

**Explanation of Cache Invalidation:**

- **`uncacheKeys`**: Specifies the keys or patterns to be invalidated.
- **`hasPattern`**: Indicates if wildcard patterns are used for key matching.

---

## Key Concepts Explained

### 1. **Time-to-Live (TTL)**

- Specifies how long (in seconds) a cached entry should remain before expiring.
- **Default TTL**: Used when no specific TTL is provided for a query.

### 2. **Stale Time**

- After the TTL expires, stale time defines how long expired data can still be used while refreshing data in the background.
- This ensures that users experience minimal latency even when data is being updated.

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
- **Logger Support**: Integrate logging to monitor cache hits, misses, and invalidations for easier debugging and optimization.

---

## Prerequisites

- Ensure you have a running Redis or Dragonfly instance. If using Redis, `Redis.JSON` must be enabled to use JSON type cache (by default, it is enabled in Dragonfly).

## Dependencies

- `iovalkey` package is used for Redis connectivity.
- `micromatch` is used for patter matching for keys.
- `object-code` is used for generating unique hash in auto-caching keys.
- `lodash-es` is used for CacheCase logic in key management.

---

## Final Thoughts

`prisma-extension-redis` offers an efficient and powerful way to manage caching in Prisma-based applications. By leveraging both automatic and custom caching, you can optimize your application's performance while maintaining data consistency.

Upgrade to `prisma-extension-redis` for an optimized caching strategy and contribute to its growth by starring the repository if you find it useful!
