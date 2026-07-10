# Meta Information Feature

The meta feature provides detailed cache information for any cached query, giving you visibility into cache behavior and control over individual cache entries.

## Enabling Meta Information

Pass `meta: true` to any cached query to receive detailed cache information:

```typescript
const { result, meta } = await prisma.user.findUnique({
  where: { id: 1 },
  cache: { key: 'user:1', ttl: 60, stale: 30 },
  meta: true,
});
```

## Meta Object Properties

| Property | Type | Description |
|----------|------|-------------|
| `source` | `'cache' \| 'stale-cache' \| 'db'` | Where the data was retrieved from |
| `isCached` | `boolean` | Whether data came from cache (fresh or stale) |
| `key` | `string` | The cache key used |
| `cachedAt` | `number \| undefined` | Unix timestamp (seconds) when data was cached |
| `expiresAt` | `number \| undefined` | Unix timestamp (seconds) when cache expires |
| `staleUntil` | `number \| undefined` | Unix timestamp (seconds) when stale period ends |
| `recache` | `() => Promise<T>` | Function to force refresh the cache |
| `uncache` | `() => Promise<{ deleted: number }>` | Function to delete from cache |

> **Non-cached queries**: when a query runs without caching (no `cache`/auto config matched) but `meta: true` is set, `source` is `'db'` with zeroed timestamps. Its `recache()` re-executes the query against the database, and `uncache()` is a no-op returning `{ deleted: 0 }` because nothing was written to the cache.
| `errors` | `unknown \| undefined` | Any errors that occurred during cache operations |

## Understanding Source Values

### `'cache'`
Data was retrieved from cache and is fresh (within TTL period).

```typescript
const { meta } = await prisma.user.findUnique({
  where: { id: 1 },
  cache: { key: 'user:1', ttl: 60 },
  meta: true,
});

if (meta.source === 'cache') {
  console.log('Fresh cache hit!');
}
```

### `'stale-cache'`
Data was retrieved from cache but is stale (past TTL but within stale period). A background refresh is triggered automatically.

```typescript
if (meta.source === 'stale-cache') {
  console.log('Served stale data, refreshing in background...');
}
```

### `'db'`
Data was fetched fresh from the database (cache miss or cache disabled).

```typescript
if (meta.source === 'db') {
  console.log('Cache miss - fetched from database');
}
```

## Using Meta Actions

### Force Refresh Cache

Use `meta.recache()` to force a cache refresh, bypassing the existing cached data:

```typescript
const { result, meta } = await prisma.user.findUnique({
  where: { id: 1 },
  cache: { key: 'user:1', ttl: 60 },
  meta: true,
});

// Force refresh the cache (returns the same {result, meta} shape)
const {result: freshData, meta: freshMeta} = await meta.recache();
console.log('Cache refreshed with:', freshData, 'at', freshMeta.cachedAt);
```

### Delete from Cache

Use `meta.uncache()` to remove the entry from cache:

```typescript
const { result, meta } = await prisma.user.findUnique({
  where: { id: 1 },
  cache: { key: 'user:1', ttl: 60 },
  meta: true,
});

// Remove from cache
const { deleted } = await meta.uncache();
console.log(`Deleted ${deleted} cache entries`);
```

## Practical Examples

### Conditional Cache Refresh

```typescript
async function getUserWithFreshness(id: number, maxAge: number) {
  const { result, meta } = await prisma.user.findUnique({
    where: { id },
    cache: { key: `user:${id}`, ttl: 300 },
    meta: true,
  });

  // Check if data is too old
  if (meta.cachedAt) {
    const age = Math.floor(Date.now() / 1000) - meta.cachedAt;
    if (age > maxAge) {
      return meta.recache();
    }
  }

  return result;
}
```

### Cache Debugging

```typescript
async function debugCacheState(userId: number) {
  const { result, meta } = await prisma.user.findUnique({
    where: { id: userId },
    cache: { key: `user:${userId}`, ttl: 60, stale: 30 },
    meta: true,
  });

  console.log({
    source: meta.source,
    isCached: meta.isCached,
    key: meta.key,
    cachedAt: meta.cachedAt ? new Date(meta.cachedAt * 1000) : null,
    expiresAt: meta.expiresAt ? new Date(meta.expiresAt * 1000) : null,
    staleUntil: meta.staleUntil ? new Date(meta.staleUntil * 1000) : null,
  });

  return result;
}
```

### Cache Invalidation on Update

```typescript
async function updateUserWithInvalidation(id: number, data: any) {
  // Get current cache state
  const { meta } = await prisma.user.findUnique({
    where: { id },
    cache: { key: `user:${id}`, ttl: 60 },
    meta: true,
  });

  // Perform update
  const updated = await prisma.user.update({
    where: { id },
    data,
  });

  // Invalidate cached entry
  if (meta.isCached) {
    await meta.uncache();
  }

  return updated;
}
```

## Error Handling

The `meta.errors` property captures any non-fatal errors during cache operations:

```typescript
const { result, meta } = await prisma.user.findUnique({
  where: { id: 1 },
  cache: { key: 'user:1', ttl: 60 },
  meta: true,
});

if (meta.errors) {
  console.error('Cache operation had errors:', meta.errors);
  // Data was still returned (from DB or stale cache)
}
```

## Best Practices

1. **Use meta sparingly in production** - The meta feature adds slight overhead. Use it for debugging, monitoring, or when you need cache control.

2. **Handle all source types** - Your code should work correctly whether data comes from cache, stale-cache, or db.

3. **Use recache for critical updates** - After important data changes, use `recache()` to ensure cache consistency.

4. **Monitor stale-cache frequency** - Frequent stale-cache hits may indicate your TTL is too short.

5. **Log meta information** - In development, logging meta can help understand cache behavior.
