# Cache Maintenance Utilities

## Direct Cache Control

Beyond the utilities below, entries can be written and deleted directly, without a database operation:

- `prisma.cache({key, value, ttl?, stale?})` — plant a value in the exact envelope cached reads consume; returns the `{cachedAt, expiresAt, staleUntil}` window.
- `prisma.uncache({uncacheKeys, hasPattern?, chunkSize?, maxConcurrentBatches?})` — delete keys and/or glob patterns; exact keys skip SCAN entirely; returns `{deleted}`.

Both are also available as standalone imports (`import { cache, uncache } from 'prisma-extension-redis'`). See the [README](../README.md#direct-cache-invalidation) for examples.

This document covers cache maintenance operations including statistics, model flushing, and orphaned key cleanup.

## Cache Statistics

Get insights into your cached data with `getCacheStats()`.

### Basic Usage

```typescript
const stats = await prisma.getCacheStats();

console.log(stats);
// {
//   totalKeys: 1523,
//   keysByModel: { user: 450, post: 820, comment: 253 },
//   estimatedSizeBytes: 2457600
// }
```

### Response Properties

| Property | Type | Description |
|----------|------|-------------|
| `totalKeys` | `number` | Total number of cache keys |
| `keysByModel` | `Record<string, number>` | Key count grouped by model |
| `estimatedSizeBytes` | `number` | Estimated memory usage in bytes |

### Use Cases

#### Monitoring Dashboard

```typescript
app.get('/admin/cache-stats', async (req, res) => {
  const stats = await prisma.getCacheStats();

  res.json({
    totalKeys: stats.totalKeys,
    byModel: stats.keysByModel,
    estimatedSizeMB: (stats.estimatedSizeBytes / 1024 / 1024).toFixed(2),
  });
});
```

#### Capacity Planning

```typescript
async function checkCacheCapacity() {
  const stats = await prisma.getCacheStats();
  const maxKeys = 100000;
  const maxSizeBytes = 500 * 1024 * 1024; // 500MB

  if (stats.totalKeys > maxKeys * 0.8) {
    console.warn(`Cache key count at ${(stats.totalKeys / maxKeys * 100).toFixed(1)}% capacity`);
  }

  if (stats.estimatedSizeBytes > maxSizeBytes * 0.8) {
    console.warn(`Cache size at ${(stats.estimatedSizeBytes / maxSizeBytes * 100).toFixed(1)}% capacity`);
  }
}
```

#### Model Analysis

```typescript
async function analyzeModelCaching() {
  const stats = await prisma.getCacheStats();

  const sorted = Object.entries(stats.keysByModel)
    .sort(([, a], [, b]) => b - a);

  console.log('Cache distribution by model:');
  for (const [model, count] of sorted) {
    const percentage = (count / stats.totalKeys * 100).toFixed(1);
    console.log(`  ${model}: ${count} keys (${percentage}%)`);
  }
}
```

## Flush Model Cache

Remove all cached entries for a specific model with `flushModelCache()`.

### Basic Usage

```typescript
const result = await prisma.flushModelCache('User');

console.log(result);
// {
//   deletedCount: 450,
//   durationMs: 125
// }
```

### Response Properties

| Property | Type | Description |
|----------|------|-------------|
| `deletedCount` | `number` | Number of keys deleted |
| `durationMs` | `number` | Operation duration in milliseconds |

### Use Cases

#### After Bulk Updates

```typescript
async function bulkUpdateUsers(updates: UserUpdate[]) {
  // Perform bulk update
  await prisma.user.updateMany({
    where: { status: 'pending' },
    data: { status: 'active' },
  });

  // Invalidate all user cache entries
  const result = await prisma.flushModelCache('User');
  console.log(`Flushed ${result.deletedCount} user cache entries`);
}
```

#### Schema Migration

```typescript
async function afterMigration(modelName: string) {
  console.log(`Flushing cache for ${modelName} after migration...`);

  const result = await prisma.flushModelCache(modelName);

  console.log(`Deleted ${result.deletedCount} keys in ${result.durationMs}ms`);
}
```

#### Admin Endpoint

```typescript
app.post('/admin/cache/flush/:model', async (req, res) => {
  const { model } = req.params;

  try {
    const result = await prisma.flushModelCache(model);
    res.json({
      success: true,
      model,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
```

#### Scheduled Cleanup

```typescript
import cron from 'node-cron';

// Flush session cache every hour
cron.schedule('0 * * * *', async () => {
  const result = await prisma.flushModelCache('Session');
  console.log(`Hourly session cache flush: ${result.deletedCount} keys`);
});
```

### Case Sensitivity

Model names are case-insensitive:

```typescript
// These all work the same
await prisma.flushModelCache('User');
await prisma.flushModelCache('user');
await prisma.flushModelCache('USER');
```

## Cleanup Orphaned Keys

Remove cache keys for models that no longer exist in your schema with `cleanupOrphanedKeys()`.

### Why Orphaned Keys Occur

- Model renamed or removed from schema
- Migration left behind old cache entries
- Manual cache key creation with typos
- Testing artifacts

### Basic Usage

```typescript
// Get valid models from your schema
const validModels = ['User', 'Post', 'Comment', 'Category'];

// Dry run first
const preview = await prisma.cleanupOrphanedKeys(validModels, { dryRun: true });

console.log(`Found ${preview.orphanedKeys.length} orphaned keys`);
console.log('Orphaned keys:', preview.orphanedKeys);

// Actually delete if needed
if (preview.orphanedKeys.length > 0) {
  const result = await prisma.cleanupOrphanedKeys(validModels, { dryRun: false });
  console.log(`Deleted ${result.deletedCount} orphaned keys`);
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `validModels` | `string[]` | List of model names in your current schema |
| `options.dryRun` | `boolean` | If true, only report orphaned keys without deleting |
| `options.onProgress` | `(scanned: number) => void` | Progress callback |

### Response Properties

| Property | Type | Description |
|----------|------|-------------|
| `orphanedKeys` | `string[]` | List of orphaned cache keys |
| `deletedCount` | `number` | Number of keys deleted (0 if dryRun) |
| `durationMs` | `number` | Operation duration in milliseconds |

### Use Cases

#### Post-Migration Cleanup

```typescript
async function cleanupAfterMigration() {
  // Get current models from Prisma
  const validModels = Object.keys(prisma)
    .filter(key => !key.startsWith('$') && !key.startsWith('_'));

  console.log('Valid models:', validModels);

  // Preview orphaned keys
  const preview = await prisma.cleanupOrphanedKeys(validModels, {
    dryRun: true,
    onProgress: (scanned) => {
      console.log(`Scanned ${scanned} keys...`);
    },
  });

  if (preview.orphanedKeys.length === 0) {
    console.log('No orphaned keys found');
    return;
  }

  console.log(`Found ${preview.orphanedKeys.length} orphaned keys:`);
  preview.orphanedKeys.slice(0, 10).forEach(key => console.log(`  - ${key}`));

  // Delete orphaned keys
  const result = await prisma.cleanupOrphanedKeys(validModels, { dryRun: false });
  console.log(`Deleted ${result.deletedCount} orphaned keys in ${result.durationMs}ms`);
}
```

#### Scheduled Maintenance

```typescript
import cron from 'node-cron';

// Run weekly cleanup on Sunday at 3 AM
cron.schedule('0 3 * * 0', async () => {
  const validModels = ['User', 'Post', 'Comment', 'Category', 'Tag'];

  const result = await prisma.cleanupOrphanedKeys(validModels, { dryRun: false });

  console.log(`Weekly orphan cleanup: ${result.deletedCount} keys removed`);

  // Alert if many orphaned keys found
  if (result.deletedCount > 100) {
    alerting.send('High orphaned key count detected', {
      count: result.deletedCount,
    });
  }
});
```

#### Admin Dashboard

```typescript
app.post('/admin/cache/cleanup', async (req, res) => {
  const { validModels, dryRun = true } = req.body;

  try {
    const result = await prisma.cleanupOrphanedKeys(validModels, {
      dryRun,
      onProgress: (scanned) => {
        // Could emit via WebSocket for real-time updates
      },
    });

    res.json({
      success: true,
      dryRun,
      orphanedKeys: result.orphanedKeys,
      deletedCount: result.deletedCount,
      durationMs: result.durationMs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
```

### Progress Tracking

For large caches, use the progress callback:

```typescript
const result = await prisma.cleanupOrphanedKeys(validModels, {
  dryRun: false,
  onProgress: (scanned) => {
    process.stdout.write(`\rScanned ${scanned} keys...`);
  },
});

console.log(`\nCompleted: ${result.deletedCount} keys deleted`);
```

## Direct Redis Access

For advanced operations, access the Redis client directly:

```typescript
// Get the Redis client
const redis = prisma.redis;

// Manual operations
await redis.flushdb();  // Clear all keys (use carefully!)
await redis.keys('prisma:*');  // List all cache keys
await redis.get('prisma:user:...');  // Get specific key
await redis.del('prisma:user:...');  // Delete specific key
```

## Complete Maintenance Script

```typescript
async function runCacheMaintenance() {
  console.log('=== Cache Maintenance ===\n');

  // 1. Get statistics
  console.log('1. Cache Statistics');
  const stats = await prisma.getCacheStats();
  console.log(`   Total keys: ${stats.totalKeys}`);
  console.log(`   Size: ${(stats.estimatedSizeBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log('   By model:');
  for (const [model, count] of Object.entries(stats.keysByModel)) {
    console.log(`     - ${model}: ${count}`);
  }

  // 2. Check health
  console.log('\n2. Health Check');
  const health = await prisma.healthCheck();
  console.log(`   Status: ${health.status}`);
  console.log(`   Latency: ${health.latencyMs}ms`);

  // 3. Cleanup orphaned keys
  console.log('\n3. Orphaned Key Cleanup');
  const validModels = ['User', 'Post', 'Comment'];

  const preview = await prisma.cleanupOrphanedKeys(validModels, { dryRun: true });
  console.log(`   Found ${preview.orphanedKeys.length} orphaned keys`);

  if (preview.orphanedKeys.length > 0) {
    const cleanup = await prisma.cleanupOrphanedKeys(validModels, { dryRun: false });
    console.log(`   Deleted ${cleanup.deletedCount} keys`);
  }

  // 4. Optional: Flush specific model
  // const flushResult = await prisma.flushModelCache('Session');
  // console.log(`\n4. Flushed Session cache: ${flushResult.deletedCount} keys`);

  console.log('\n=== Maintenance Complete ===');
}

// Run as script or schedule
runCacheMaintenance().catch(console.error);
```

## Best Practices

1. **Always dry run first** - Use `dryRun: true` before deleting orphaned keys to review what will be removed.

2. **Keep model list updated** - Maintain an accurate list of valid models, especially after schema changes.

3. **Schedule regular cleanups** - Run orphaned key cleanup weekly or after deployments.

4. **Monitor cache size** - Set up alerts when cache size approaches your Redis memory limit.

5. **Log maintenance operations** - Keep records of cleanup operations for debugging.

6. **Flush after bulk operations** - After significant data changes, flush affected model caches.

7. **Use progress callbacks** - For large caches, use progress tracking to monitor long-running operations.
