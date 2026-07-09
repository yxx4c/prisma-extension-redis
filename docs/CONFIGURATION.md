# Configuration Reference

This document provides detailed information about all configuration options for prisma-extension-redis.

## Quick Start Configuration

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaExtensionRedis } from 'prisma-extension-redis';

const prisma = new PrismaClient().$extends(
  PrismaExtensionRedis({
    config: {
      ttl: 60,
      stale: 30,
      type: 'JSON',
      auto: true,
    },
    client: {
      host: 'localhost',
      port: 6379,
    },
  })
);
```

## Main Configuration Options

### `config` Object

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `ttl` | `number` | Yes | - | Time-to-live in seconds for cached entries |
| `stale` | `number` | No | `0` | Additional stale window after TTL expires |
| `type` | `'JSON' \| 'STRING'` | Yes | - | Redis storage format |
| `auto` | `boolean \| AutoCacheConfig` | Yes | - | Enable automatic caching (`false` disables it) |
| `transformer` | `TransformerConfig` | No | JSON methods | Custom serialization |
| `cacheKey` | `CacheKeyConfig` | No | See below | Cache key configuration |
| `onHit` | `(key: string) => void` | No | - | Cache hit callback |
| `onMiss` | `(key: string) => void` | No | - | Cache miss callback |
| `onError` | `(error: unknown) => void` | No | - | Error callback |
| `metricsCollector` | `MetricsCollector` | No | - | Metrics tracking instance |
| `chunkSize` | `number` | No | `1000` | Batch size for pattern deletion |
| `maxConcurrentBatches` | `number` | No | `5` | Concurrent deletion batches |

### `client` Object

The client configuration accepts either a connection string or Redis options:

```typescript
// Connection string
client: 'redis://localhost:6379'

// Or Redis options object
client: {
  host: 'localhost',
  port: 6379,
  password: 'secret',
  db: 0,
  tls: {},
}
```

## TTL and Stale Configuration

### Time-to-Live (TTL)

The `ttl` option specifies how long cached data remains fresh:

```typescript
config: {
  ttl: 300, // 5 minutes
  // ...
}
```

### Stale-While-Revalidate

The `stale` option enables serving stale data while refreshing in the background:

```typescript
config: {
  ttl: 60,    // Fresh for 60 seconds
  stale: 30,  // Serve stale for additional 30 seconds while refreshing
  // ...
}
```

**Timeline Example:**
- 0-60s: Fresh cache (source: `'cache'`)
- 60-90s: Stale cache served, background refresh (source: `'stale-cache'`)
- After 90s: Cache expired, fetch from DB (source: `'db'`)

## Storage Type

### JSON Type

Stores data as JSON in Redis. Requires Redis with RedisJSON module or Dragonfly:

```typescript
config: {
  type: 'JSON',
  // ...
}
```

**Advantages:**
- Preserves data types (dates, nested objects)
- Supports partial updates (future feature)
- Better for complex data structures

### STRING Type

Stores data as serialized strings:

```typescript
config: {
  type: 'STRING',
  // ...
}
```

**Advantages:**
- Works with any Redis installation
- Simpler storage format
- Slightly faster for simple data

## Auto-Cache Configuration

### Simple Auto-Cache

Enable auto-caching for all read operations:

```typescript
config: {
  auto: true,
  // ...
}
```

### Advanced Auto-Cache

Fine-tune auto-caching behavior:

```typescript
config: {
  auto: {
    ttl: 60,                                    // Default TTL for auto-cached queries
    stale: 30,                                  // Default stale time
    excludedModels: ['Session', 'Token'],       // Models to exclude
    excludedOperations: ['count', 'aggregate'], // Operations to exclude
    models: [
      {
        model: 'User',
        ttl: 300,                               // Custom TTL for User model
        stale: 60,
        excludedOperations: ['findMany'],       // Exclude findMany for User
      },
      {
        model: 'Product',
        ttl: 3600,                              // Products cached for 1 hour
      },
    ],
  },
  // ...
}
```

### AutoCacheConfig Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | Config TTL | Default TTL for auto-cached queries |
| `stale` | `number` | Config stale | Default stale time |
| `excludedModels` | `string[]` | `[]` | Models to exclude from auto-caching |
| `excludedOperations` | `Operation[]` | `[]` | Operations to exclude globally |
| `models` | `ModelConfig[]` | `[]` | Model-specific configurations |

### Cacheable Operations

Auto-caching applies to these read operations:
- `findUnique`
- `findUniqueOrThrow`
- `findFirst`
- `findFirstOrThrow`
- `findMany`
- `count`
- `aggregate`
- `groupBy`

## Cache Key Configuration

Customize how cache keys are generated:

```typescript
config: {
  cacheKey: {
    prefix: 'myapp',              // Default: 'prisma'
    delimiter: '/',               // Default: ':'
    caseTransformer: (s) => s,    // Default: snake_case
  },
  // ...
}
```

### Default Key Format

```
prisma:user:op:find_unique:hash:abc123
```

### Custom Key Format Example

```typescript
cacheKey: {
  prefix: 'app',
  delimiter: '.',
  caseTransformer: (s) => s.toLowerCase(),
}
// Result: app.user.op.findunique.hash.abc123
```

## Custom Transformer

Customize serialization/deserialization:

```typescript
import SuperJSON from 'superjson';

config: {
  transformer: {
    serialize: (data) => SuperJSON.stringify(data),
    deserialize: (data) => SuperJSON.parse(data),
  },
  // ...
}
```

**Use Cases:**
- Preserve Date objects
- Handle BigInt values
- Custom class instances
- Circular references

## Event Callbacks

Monitor cache operations with callbacks:

```typescript
config: {
  onHit: (key) => {
    console.log(`Cache HIT: ${key}`);
    metrics.increment('cache.hit');
  },
  onMiss: (key) => {
    console.log(`Cache MISS: ${key}`);
    metrics.increment('cache.miss');
  },
  onError: (error) => {
    console.error('Cache error:', error);
    errorTracker.capture(error);
  },
  // ...
}
```

## Metrics Collector

Integrate with the built-in metrics collector:

```typescript
import { createMetricsCollector, PrismaExtensionRedis } from 'prisma-extension-redis';

const metrics = createMetricsCollector();

const prisma = new PrismaClient().$extends(
  PrismaExtensionRedis({
    config: {
      metricsCollector: metrics,
      // ...
    },
    client,
  })
);

// Access metrics
const stats = metrics.getMetrics();
console.log(`Hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
```

See [MONITORING.md](./MONITORING.md) for detailed metrics documentation.

## Batch Operations Configuration

Configure how bulk operations are handled:

```typescript
config: {
  chunkSize: 500,           // Keys per batch for deletion
  maxConcurrentBatches: 3,  // Parallel batch operations
  // ...
}
```

## Complete Configuration Example

```typescript
import { PrismaClient } from '@prisma/client';
import {
  PrismaExtensionRedis,
  createMetricsCollector,
} from 'prisma-extension-redis';
import SuperJSON from 'superjson';

const metrics = createMetricsCollector();

const prisma = new PrismaClient().$extends(
  PrismaExtensionRedis({
    config: {
      // Core settings
      ttl: 300,
      stale: 60,
      type: 'JSON',

      // Auto-cache configuration
      auto: {
        ttl: 120,
        stale: 30,
        excludedModels: ['Session', 'AuditLog'],
        excludedOperations: ['aggregate'],
        models: [
          { model: 'User', ttl: 600, stale: 120 },
          { model: 'Product', ttl: 3600 },
        ],
      },

      // Key configuration
      cacheKey: {
        prefix: 'myapp',
        delimiter: ':',
      },

      // Custom serialization
      transformer: {
        serialize: (data) => SuperJSON.stringify(data),
        deserialize: (data) => SuperJSON.parse(data),
      },

      // Event callbacks
      onHit: (key) => console.log('Hit:', key),
      onMiss: (key) => console.log('Miss:', key),
      onError: (error) => console.error('Error:', error),

      // Metrics
      metricsCollector: metrics,

      // Batch operations
      chunkSize: 1000,
      maxConcurrentBatches: 5,
    },
    client: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    },
  })
);
```

## Environment-Specific Configuration

### Development

```typescript
const devConfig = {
  ttl: 30,
  stale: 10,
  auto: true,
  onHit: (key) => console.log('DEV Cache Hit:', key),
  onMiss: (key) => console.log('DEV Cache Miss:', key),
};
```

### Production

```typescript
const prodConfig = {
  ttl: 300,
  stale: 60,
  auto: {
    excludedModels: ['AuditLog', 'Session'],
    models: [
      { model: 'User', ttl: 600 },
      { model: 'Product', ttl: 3600 },
    ],
  },
  metricsCollector: metrics,
  onError: (error) => errorTracker.capture(error),
};
```
