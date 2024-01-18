# prisma-redis-extension

The `prisma-redis-extension` library is a comprehensive package that consolidates the functionalities of the packages: [prisma-redis-cache](https://github.com/yxx4c/prisma-redis-cache), [prisma-redis-uncache](https://github.com/yxx4c/prisma-redis-uncache), and [cache-utils](https://github.com/yxx4c/cache-utils). This consolidation provides a unified solution for optimizing database access times, enhancing cache management, and offering versatile functions for efficient Redis/Dragonfly database maintenance.

🚀 If `prisma-redis-extension` proves helpful, consider giving it a star! [⭐ Star Me!](https://github.com/yxx4c/prisma-redis-extension)

### **Installation**

##### **Using npm:**

```bash
npm install @yxx4c/prisma-redis-extension
```

##### **Using yarn:**

```bash
yarn add @yxx4c/prisma-redis-extension
```

##### **Using pnpm:**

```bash
pnpm add @yxx4c/prisma-redis-extension
```

##### **Using bun:**

```bash
bun add @yxx4c/prisma-redis-extension
```

### Example

```javascript
import {PrismaClient} from '@prisma/client';
import {Redis} from 'ioredis';
import pino from 'pino';
import {
  getCacheKey,
  getCacheKeyPattern,
  PrismaRedisExtension,
} from '@yxx4c/prisma-redis-extension';

// Create a Redis client
const redis = new Redis({
  host: env.REDIS_HOST_NAME, // Specify Redis host name
  port: env.REDIS_PORT, // Specify Redis port
});

// Create a pino logger instance for logging
const logger = pino();

// Auto cache config
const autoCacheConfig = {
  excludedModels: ['Post'], // Models to exclude from auto-caching
  excludedOperations: ['findFirst', 'count', 'findMany'], // Operations to exclude from auto-caching
  models: [
    {
      model: 'User',
      excludedOperations: [],
      ttl: 10, // Time-to-live for caching
      stale: 5, // Stale time for caching
    },
  ], // Models-specific cache configurations
  ttl: 1, // Default time-to-live for caching
};

// async-cache-dedupe config
const cacheConfig = {
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
};

// Create a Prisma client instance
const prisma = new PrismaClient();

// Extend Prisma with prisma-redis-extension
const extendedPrisma = prisma.$extends(
  PrismaRedisExtension({auto: autoCacheConfig, cache: cacheConfig, redis})
);

// Example: Query a user and cache the result - with async-cache-dedupe
extendedPrisma.user.findUnique({
  where: {id},
  cache: true, // Enable caching with default configuration
});

// Example: Query a user and cache the result - with custom configuration
extendedPrisma.user.findUnique({
  where: {id},
  cache: {ttl: 5, key: getCacheKey([{prisma: 'User'}, {userId: id}])},
});

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

### Dependencies

- `ioredis`

### Key Features

- **Automatic Query Result Caching:** Easily cache Prisma query results in Redis with minimal configuration.
- **Selective Cache Invalidation:** Invalidate specific Prisma queries to ensure accurate and up-to-date data retrieval.
- **Fine-grained Control:** Configure caching and invalidation settings on a per-query basis for granular control over caching behavior.
- **Cache Invalidation Strategies:** Implement cache invalidation strategies to ensure that cached data remains up-to-date.
- **Versatile Functions:** Utilize general-purpose functions for efficient Redis/Dragonfly database maintenance.

### Deprecated Packages

The following packages are planned for deprecation. We recommend considering `prisma-redis-extension` for combined functionality:

#### prisma-redis-cache

The `prisma-redis-cache` package is planned for deprecation. Please consider using `prisma-redis-extension` for a consolidated feature set.

[⚠️ Deprecated Package](https://github.com/yxx4c/prisma-redis-cache)

---

#### prisma-redis-uncache

The `prisma-redis-uncache` package is planned for deprecation. Please consider using `prisma-redis-extension` for a consolidated feature set.

[⚠️ Deprecated Package](https://github.com/yxx4c/prisma-redis-uncache)

---

#### cache-utils

The `cache-utils` package is planned for deprecation. Please consider using `prisma-redis-extension` for a consolidated feature set.

[⚠️ Deprecated Package](https://github.com/yxx4c/cache-utils)

---

**Why use prisma-redis-extension?**

- **Simplified Dependencies:** Instead of managing multiple packages, you now only need `prisma-redis-extension` for all the features.
- **Enhanced Maintenance:** Centralized updates and improvements for all functionalities, leading to easier maintenance.
- **Streamlined Codebase:** Consolidate your codebase by eliminating redundant dependencies and optimizing performance.
- **Community Focus:** Join the community around `prisma-redis-extension` for collective support and collaborative development.

Upgrade to `prisma-redis-extension` today to experience a more streamlined and efficient Redis caching solution.
