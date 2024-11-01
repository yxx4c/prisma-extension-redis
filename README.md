# prisma-extension-redis

The `prisma-extension-redis` library is a comprehensive package that provides a unified solution for optimizing database access times, enhancing cache management, and offering versatile functions for efficient Redis/Dragonfly database maintenance.

🚀 If `prisma-extension-redis` proves helpful, consider giving it a star! [⭐ Star Me!](https://github.com/yxx4c/prisma-extension-redis)

## **Installation**

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

## Initialization of setup

```javascript
import {PrismaClient} from '@prisma/client';
import {Redis} from 'ioredis';
import pino from 'pino';
import {
  getCacheKey,
  getCacheKeyPattern,
  PrismaExtensionRedis,
} from 'prisma-extension-redis';

// Create a Redis client
const redis = new Redis({
  host: env.REDIS_HOST_NAME, // Specify Redis host name
  port: env.REDIS_PORT, // Specify Redis port
});

// Create a pino logger instance for logging
const logger = pino();
```

### Auto cache config

Auto-caching can be enabled for all read operations by default. Set `auto` to customize behavior or exclude specific models or operations.

```javascript
const auto = {
  excludedModels: ['Post'], // Models to exclude from auto-caching default behavior
  excludedOperations: ['findFirst', 'count', 'findMany'], // Operations to exclude from auto-caching default behavior
  models: [
    {
      model: 'User',
      excludedOperations: [],
      ttl: 10, // Time-to-live for caching
      stale: 5, // Stale time for caching
    },
  ], // Custom auto-cache configuration for specific models
  ttl: 1, // Default time-to-live for caching
};
```

_Cache Client Config is **required** to enable auto-cache._

### Cache Client Config

This configuration is required for enabling auto-cache and handling caching using `cache: true` or `cache: false` per Prisma query (refer use cases).

```javascript
const cache = {
  ttl: 1, // Time-to-live for caching
  stale: 1, // Stale time for caching
  storage: {
    type: 'redis',
    options: {
      client: redis,
      invalidation: {referencesTTL: 60}, // Invalidation settings
      log: logger, // Logger for cache events
    },
  }, // Storage configuration for async-cache-dedupe
  type: 'STRING' // Type of Redis.* cache to use(Default: JSON, supported: JSON | STRING)
};
```

### Create Prisma Extended Client

```javascript
// Create a Prisma client instance
const prisma = new PrismaClient();

// Extend Prisma with prisma-extension-redis
const extendedPrisma = prisma.$extends(
  PrismaExtensionRedis({auto, cache, redis})
);
```

### Use case 1: Default Auto-Caching Configuration

```javascript
// Example: Query a user and cache the result when auto caching is enabled
extendedPrisma.user.findUnique({
  where: {id},
});

// Example: Query a user and cache the result by setting `cache: true` to toggle auto cache
extendedPrisma.user.findUnique({
  where: {id},
  cache: true, // Enable caching with default configuration
});

// Example: Exclude automatic caching for a specific operation
extendedPrisma.user.findFirst({
  where: {userId: id},
  cache: false, // Disable caching for this operation
});
```

### Use case 2: Selective Caching with Custom Configuration

```javascript
// Example: Query a user and cache the result - with custom configuration
extendedPrisma.user.findUnique({
  where: {id},
  cache: {ttl: 5, key: getCacheKey([{prisma: 'User'}, {userId: id}])},
});
```

### Use case 3: Invalidation of Cached Data

```javascript
// Example: Update a user and invalidate related cache keys
extendedPrisma.user.update({
  where: {id},
  data: {username},
  uncache: {
    uncacheKeys: [
      getCacheKey([{prisma: 'User'}, {userId: id}]),
      getCacheKeyPattern([{prisma: '*'}, {userId: id}]), // Pattern matching under a specific key, eg: prisma:*:userId:1234
      getCacheKeyPattern([{prisma: 'Post'}, {userId: id}, {glob: '*'}]), // Utilizing the key 'glob' to create a wildcard region, eg: prisma:post:userId:1234:*
    ], // Keys to be invalidated
    hasPattern: true, // Use wildcard pattern for key matching
  },
});
```

_Custom cache invalidation is designed for custom caching (not auto-caching)._

## Additional Information

- All durations must be specified in seconds (Time-to-Live, Stale Time, ReferenceTTL).
- Any configuration for auto-cache exclusion will result in the query being omitted from auto-cache during execution.

## Prerequisites

- `Redis.JSON` must be enabled in your Redis instance (this is enabled by default in Dragonfly).

## Dependencies

- `ioredis`

## Key Features

- **Automatic Query Result Caching:** Easily cache Prisma query results in Redis with minimal configuration.
- **Selective Cache Invalidation:** Invalidate specific Prisma queries to ensure accurate and up-to-date data retrieval.
- **Fine-grained Control:** Configure caching and invalidation settings on a per-query basis for granular control over caching behavior.
- **Cache Invalidation Strategies:** Implement cache invalidation strategies to ensure that cached data remains up-to-date.
- **Versatile Functions:** Utilize general-purpose functions for efficient Redis/Dragonfly database maintenance.

---

**Why use prisma-extension-redis?**

- **Simplified Dependencies:** Instead of managing multiple packages, you now only need `prisma-extension-redis` for all the features.
- **Enhanced Maintenance:** Centralized updates and improvements for all functionalities, leading to easier maintenance.
- **Streamlined Codebase:** Consolidate your codebase by eliminating redundant dependencies and optimizing performance.
- **Community Focus:** Join the community around `prisma-extension-redis` for collective support and collaborative development.

Upgrade to `prisma-extension-redis` today to experience a more streamlined and efficient Redis caching solution.
