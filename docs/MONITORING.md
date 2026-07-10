# Monitoring and Observability

This document covers all monitoring features in prisma-extension-redis, including event hooks, metrics collection, and health checks.

## Event Hooks

> **Note on cache keys in logs and callbacks**: keys frequently embed identifiers from query arguments (emails, user IDs). Anything that receives keys — `onHit`/`onMiss` callbacks, `debug` logging, telemetry sinks — should be treated as handling potentially sensitive data.

Event hooks provide real-time notifications for cache operations.

### Available Hooks

| Hook | Parameters | Description |
|------|------------|-------------|
| `onHit` | `(key: string) => void` | Called when data is served from cache |
| `onMiss` | `(key: string) => void` | Called when cache miss occurs |
| `onError` | `(error: unknown) => void` | Called when cache operation fails |

### Basic Setup

```typescript
const prisma = new PrismaClient().$extends(
  PrismaExtensionRedis({
    config: {
      ttl: 60,
      stale: 30,
      type: 'JSON',
      auto: true,
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

### Integration Examples

#### With StatsD/DataDog

```typescript
import StatsD from 'hot-shots';

const statsd = new StatsD();

const config = {
  onHit: (key) => {
    statsd.increment('cache.hit');
    statsd.increment(`cache.hit.${extractModel(key)}`);
  },
  onMiss: (key) => {
    statsd.increment('cache.miss');
    statsd.increment(`cache.miss.${extractModel(key)}`);
  },
  onError: (error) => {
    statsd.increment('cache.error');
  },
};

function extractModel(key: string): string {
  const parts = key.split(':');
  return parts[1] || 'unknown';
}
```

#### With Prometheus

```typescript
import { Counter } from 'prom-client';

const cacheHits = new Counter({
  name: 'prisma_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['model'],
});

const cacheMisses = new Counter({
  name: 'prisma_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['model'],
});

const config = {
  onHit: (key) => {
    cacheHits.inc({ model: extractModel(key) });
  },
  onMiss: (key) => {
    cacheMisses.inc({ model: extractModel(key) });
  },
};
```

#### With Winston Logger

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  transports: [new winston.transports.Console()],
});

const config = {
  onHit: (key) => {
    logger.debug('Cache hit', { key, timestamp: new Date() });
  },
  onMiss: (key) => {
    logger.info('Cache miss', { key, timestamp: new Date() });
  },
  onError: (error) => {
    logger.error('Cache error', { error, timestamp: new Date() });
  },
};
```

## Metrics Collection

The built-in metrics collector provides comprehensive cache performance tracking.

### Setup

```typescript
import { createMetricsCollector, PrismaExtensionRedis } from 'prisma-extension-redis';

const metrics = createMetricsCollector();

const prisma = new PrismaClient().$extends(
  PrismaExtensionRedis({
    config: {
      ttl: 60,
      stale: 30,
      type: 'JSON',
      auto: true,
      metricsCollector: metrics,
    },
    client: redisOptions,
  })
);
```

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `hits` | `number` | Total cache hits (fresh cache) |
| `misses` | `number` | Total cache misses |
| `staleHits` | `number` | Stale cache served while refreshing |
| `errors` | `number` | Cache operation errors |
| `backgroundRefreshes` | `number` | Background refresh operations |
| `hitRatio` | `number` | Ratio of hits to total requests (0-1) |
| `avgCacheLatencyMs` | `number` | Average latency for cache reads |
| `avgDbLatencyMs` | `number` | Average latency for DB reads |

### Accessing Metrics

```typescript
const stats = metrics.getMetrics();

console.log({
  'Hit Ratio': `${(stats.hitRatio * 100).toFixed(1)}%`,
  'Total Hits': stats.hits,
  'Total Misses': stats.misses,
  'Stale Hits': stats.staleHits,
  'Errors': stats.errors,
  'Background Refreshes': stats.backgroundRefreshes,
  'Avg Cache Latency': `${stats.avgCacheLatencyMs.toFixed(2)}ms`,
  'Avg DB Latency': `${stats.avgDbLatencyMs.toFixed(2)}ms`,
});
```

### Resetting Metrics

```typescript
// Reset all metrics to zero
metrics.reset();
```

### Periodic Reporting

```typescript
// Report metrics every minute
setInterval(() => {
  const stats = metrics.getMetrics();

  console.log(`[Cache Metrics] Hit Ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
  console.log(`[Cache Metrics] Hits: ${stats.hits}, Misses: ${stats.misses}`);
  console.log(`[Cache Metrics] Avg Latency - Cache: ${stats.avgCacheLatencyMs.toFixed(2)}ms, DB: ${stats.avgDbLatencyMs.toFixed(2)}ms`);

  // Optionally reset after reporting
  // metrics.reset();
}, 60000);
```

### Custom Metrics Integration

```typescript
// Create adapter for your metrics system
class MetricsAdapter implements MetricsCollector {
  recordHit(latencyMs: number) {
    prometheus.cacheHits.inc();
    prometheus.cacheLatency.observe(latencyMs);
  }

  recordMiss(latencyMs: number) {
    prometheus.cacheMisses.inc();
    prometheus.dbLatency.observe(latencyMs);
  }

  recordStaleHit(latencyMs: number) {
    prometheus.cacheStaleHits.inc();
    prometheus.cacheLatency.observe(latencyMs);
  }

  recordError() {
    prometheus.cacheErrors.inc();
  }

  recordBackgroundRefresh() {
    prometheus.backgroundRefreshes.inc();
  }

  getMetrics() {
    // Return current metrics state
    return { /* ... */ };
  }

  reset() {
    // Reset if needed
  }
}

const prisma = new PrismaClient().$extends(
  PrismaExtensionRedis({
    config: {
      metricsCollector: new MetricsAdapter(),
      // ...
    },
    client: redisOptions,
  })
);
```

## Health Checks

Monitor Redis connection health with built-in health checks.

### Basic Health Check

```typescript
const health = await prisma.healthCheck();

console.log(health);
// {
//   status: 'healthy',
//   connected: true,
//   latencyMs: 2,
//   timestamp: Date,
//   serverInfo: { version: '7.0.0', mode: 'standalone' }
// }
```

### Health Status Values

| Status | Description |
|--------|-------------|
| `'healthy'` | Redis is connected and responding quickly |
| `'degraded'` | Redis is connected but response is slow (>1000ms) |
| `'unhealthy'` | Redis is not connected or not responding |

### Using the Health Check Function Directly

```typescript
import { checkHealth } from 'prisma-extension-redis';

const health = await checkHealth(prisma.redis);
```

### Health Check Response

```typescript
interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  connected: boolean;
  latencyMs: number;
  timestamp: Date;
  serverInfo?: {
    version: string;
    mode?: string;
  };
  error?: unknown;
}
```

### Integration with Health Endpoints

#### Express Health Endpoint

```typescript
app.get('/health', async (req, res) => {
  const redisHealth = await prisma.healthCheck();

  const status = redisHealth.status === 'healthy' ? 200 : 503;

  res.status(status).json({
    service: 'my-app',
    redis: redisHealth,
    timestamp: new Date(),
  });
});
```

#### Kubernetes Liveness Probe

```typescript
app.get('/healthz', async (req, res) => {
  const health = await prisma.healthCheck();

  if (health.status === 'unhealthy') {
    return res.status(503).json({ status: 'unhealthy' });
  }

  res.json({ status: 'ok' });
});
```

#### Kubernetes Readiness Probe

```typescript
app.get('/ready', async (req, res) => {
  const health = await prisma.healthCheck();

  if (health.status !== 'healthy') {
    return res.status(503).json({
      ready: false,
      reason: `Redis ${health.status}`,
    });
  }

  res.json({ ready: true });
});
```

### Periodic Health Monitoring

```typescript
async function monitorHealth() {
  const health = await prisma.healthCheck();

  if (health.status !== 'healthy') {
    console.warn(`Redis health: ${health.status}`, {
      latencyMs: health.latencyMs,
      error: health.error,
    });

    // Alert if unhealthy
    if (health.status === 'unhealthy') {
      alerting.send('Redis connection unhealthy', health);
    }
  }
}

// Check every 30 seconds
setInterval(monitorHealth, 30000);
```

## Complete Monitoring Setup

```typescript
import {
  PrismaClient,
} from '@prisma/client';
import {
  PrismaExtensionRedis,
  createMetricsCollector,
} from 'prisma-extension-redis';

// Create metrics collector
const metrics = createMetricsCollector();

// Configure with full monitoring
const prisma = new PrismaClient().$extends(
  PrismaExtensionRedis({
    config: {
      ttl: 60,
      stale: 30,
      type: 'JSON',
      auto: true,

      // Metrics
      metricsCollector: metrics,

      // Event hooks
      onHit: (key) => {
        statsd.increment('cache.hit');
      },
      onMiss: (key) => {
        statsd.increment('cache.miss');
      },
      onError: (error) => {
        statsd.increment('cache.error');
        logger.error('Cache error', { error });
      },
    },
    client: redisOptions,
  })
);

// Expose metrics endpoint
app.get('/metrics', (req, res) => {
  const stats = metrics.getMetrics();
  res.json(stats);
});

// Expose health endpoint
app.get('/health', async (req, res) => {
  const health = await prisma.healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// Periodic reporting
setInterval(async () => {
  const stats = metrics.getMetrics();
  const health = await prisma.healthCheck();

  logger.info('Cache status', {
    hitRatio: stats.hitRatio,
    health: health.status,
    latency: health.latencyMs,
  });
}, 60000);
```

## Alerting Recommendations

### Key Metrics to Alert On

1. **Hit Ratio < 50%** - Cache may not be effective
2. **Error Rate > 1%** - Redis connection issues
3. **Health Status = unhealthy** - Immediate attention needed
4. **Avg Cache Latency > 10ms** - Network or Redis performance issue
5. **Stale Hit Ratio > 20%** - TTL may be too short

### Example Alert Configuration

```typescript
function checkAlerts() {
  const stats = metrics.getMetrics();
  const totalRequests = stats.hits + stats.misses + stats.staleHits;

  if (totalRequests > 100) {
    if (stats.hitRatio < 0.5) {
      alert('Low cache hit ratio', { hitRatio: stats.hitRatio });
    }

    const errorRate = stats.errors / totalRequests;
    if (errorRate > 0.01) {
      alert('High cache error rate', { errorRate });
    }

    if (stats.avgCacheLatencyMs > 10) {
      alert('High cache latency', { latencyMs: stats.avgCacheLatencyMs });
    }
  }
}
```
