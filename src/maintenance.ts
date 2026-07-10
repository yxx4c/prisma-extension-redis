import {snakeCase} from './cacheKey';
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_DELIMITER,
  DEFAULT_PREFIX,
  DEFAULT_SCAN_COUNT,
  ESTIMATED_VALUE_SIZE_BYTES,
} from './constants';
import {type RedisClientInput, resolveRedisApi} from './redisApi';
import type {caseTransformer} from './types';

/**
 * Options for the orphaned key cleanup operation.
 */
export interface CleanupOptions {
  /** Redis client, instance, or RedisApi implementation */
  redis: RedisClientInput;
  /** Cache key prefix (default: 'prisma') */
  prefix?: string;
  /** List of valid model names currently in the schema */
  validModels: string[];
  /** Key delimiter (default: ':') */
  delimiter?: string;
  /** If true, only report keys without deleting (default: false) */
  dryRun?: boolean;
  /** Batch size for SCAN operations (default: 1000) */
  batchSize?: number;
  /** Progress callback */
  onProgress?: (scanned: number, orphaned: number) => void;
  /**
   * Case transformer the keys were written with (default: snakeCase,
   * matching getKeyGen). Must match the extension's cacheKey config
   */
  caseTransformer?: caseTransformer;
}

/**
 * Result of the cleanup operation.
 */
export interface CleanupResult {
  /** Total keys scanned */
  scannedKeys: number;
  /** Keys identified as orphaned */
  orphanedKeys: string[];
  /** Number of keys deleted (0 if dryRun) */
  deletedCount: number;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Scans and removes cache keys for models that no longer exist in the schema.
 * Use this after removing models from your Prisma schema to clean up stale cache keys.
 *
 * @example
 * ```typescript
 * // Get valid models from your Prisma schema
 * const validModels = ['User', 'Post', 'Comment'];
 *
 * // Dry run first to see what would be deleted
 * const preview = await cleanupOrphanedKeys({
 *   redis,
 *   validModels,
 *   dryRun: true,
 * });
 * console.log(`Found ${preview.orphanedKeys.length} orphaned keys`);
 *
 * // Actually delete
 * const result = await cleanupOrphanedKeys({
 *   redis,
 *   validModels,
 *   dryRun: false,
 * });
 * console.log(`Deleted ${result.deletedCount} keys`);
 * ```
 */
export const cleanupOrphanedKeys = async ({
  redis,
  prefix = DEFAULT_PREFIX,
  validModels,
  delimiter = DEFAULT_DELIMITER,
  dryRun = false,
  batchSize = DEFAULT_CHUNK_SIZE,
  onProgress,
  caseTransformer: transform = snakeCase,
}: CleanupOptions): Promise<CleanupResult> => {
  const {api} = resolveRedisApi(redis);
  const startTime = Date.now();
  // getKeyGen case-transforms the prefix and model segments, so patterns
  // must be built with the same transformer to match stored keys
  const pattern = `${transform(prefix)}${delimiter}*`;
  const orphanedKeys: string[] = [];
  let scannedKeys = 0;

  // Normalize to lowercase on both sides for case-insensitive comparison
  const validModelPatterns = new Set(
    validModels.map(model =>
      `${transform(prefix)}${delimiter}${transform(model)}`.toLowerCase(),
    ),
  );

  const deleteBuffer: string[] = [];
  const deletePromises: Promise<number>[] = [];

  let cursor = '0';
  do {
    const page = await api.scan(cursor, pattern, batchSize);
    cursor = page.cursor;
    scannedKeys += page.keys.length;

    for (const key of page.keys) {
      // Extract model part: "prisma:user:findUnique:..." -> "prisma:user"
      const parts = key.split(delimiter);
      const modelPart = parts.slice(0, 2).join(delimiter).toLowerCase();

      if (!validModelPatterns.has(modelPart)) {
        orphanedKeys.push(key);
        if (!dryRun) {
          deleteBuffer.push(key);
        }
      }
    }

    // Batch delete when buffer is full
    while (!dryRun && deleteBuffer.length >= batchSize) {
      deletePromises.push(api.unlink(deleteBuffer.splice(0, batchSize)));
    }

    if (onProgress) {
      onProgress(scannedKeys, orphanedKeys.length);
    }
  } while (cursor !== '0');

  // Delete remaining keys in buffer
  if (!dryRun && deleteBuffer.length > 0) {
    deletePromises.push(api.unlink(deleteBuffer));
  }

  // UNLINK reports how many keys it actually removed, which can be
  // fewer than staged if keys expired or were deleted concurrently
  const deleteCounts = await Promise.all(deletePromises);

  return {
    scannedKeys,
    orphanedKeys,
    deletedCount: deleteCounts.reduce((sum, count) => sum + count, 0),
    durationMs: Date.now() - startTime,
  };
};

/**
 * Cache statistics for monitoring.
 */
export interface CacheStats {
  /** Total number of cache keys */
  totalKeys: number;
  /** Number of keys grouped by model */
  keysByModel: Record<string, number>;
  /** Estimated memory usage in bytes (rough estimate based on key length) */
  estimatedSizeBytes: number;
}

/**
 * Gets statistics about cached keys.
 * Useful for monitoring cache usage and identifying which models have the most cached data.
 *
 * @example
 * ```typescript
 * const stats = await getCacheStats(redis);
 * console.log(`Total keys: ${stats.totalKeys}`);
 * console.log('Keys by model:', stats.keysByModel);
 * // { user: 150, post: 320, comment: 45 }
 * ```
 */
export const getCacheStats = async (
  redis: RedisClientInput,
  prefix = DEFAULT_PREFIX,
  delimiter = DEFAULT_DELIMITER,
  transform: caseTransformer = snakeCase,
): Promise<CacheStats> => {
  const {api} = resolveRedisApi(redis);
  const pattern = `${transform(prefix)}${delimiter}*`;
  const keysByModel: Record<string, number> = {};
  let totalKeys = 0;
  let estimatedSizeBytes = 0;

  let cursor = '0';
  do {
    const page = await api.scan(cursor, pattern, DEFAULT_SCAN_COUNT);
    cursor = page.cursor;
    totalKeys += page.keys.length;

    for (const key of page.keys) {
      const parts = key.split(delimiter);
      const model = parts[1] || 'unknown';
      keysByModel[model] = (keysByModel[model] || 0) + 1;

      // Rough estimate: key length + average value size
      estimatedSizeBytes += key.length + ESTIMATED_VALUE_SIZE_BYTES;
    }
  } while (cursor !== '0');

  return {totalKeys, keysByModel, estimatedSizeBytes};
};

/**
 * Options for flushing cache by model.
 */
export interface FlushModelOptions {
  /** Redis client, instance, or RedisApi implementation */
  redis: RedisClientInput;
  /** Model name to flush */
  model: string;
  /** Cache key prefix (default: 'prisma') */
  prefix?: string;
  /** Key delimiter (default: ':') */
  delimiter?: string;
  /** Batch size for delete operations (default: 1000) */
  batchSize?: number;
  /**
   * Case transformer the keys were written with (default: snakeCase,
   * matching getKeyGen). Must match the extension's cacheKey config
   */
  caseTransformer?: caseTransformer;
}

/**
 * Flushes all cache entries for a specific model.
 * Useful when you need to invalidate all cached data for a model after bulk updates.
 *
 * @example
 * ```typescript
 * // After a bulk update to all users
 * const result = await flushModelCache({
 *   redis,
 *   model: 'User',
 * });
 * console.log(`Deleted ${result.deletedCount} User cache entries`);
 * ```
 */
export const flushModelCache = async ({
  redis,
  model,
  prefix = DEFAULT_PREFIX,
  delimiter = DEFAULT_DELIMITER,
  batchSize = DEFAULT_CHUNK_SIZE,
  caseTransformer: transform = snakeCase,
}: FlushModelOptions): Promise<{deletedCount: number; durationMs: number}> => {
  // Validate model name to prevent injection of Redis wildcards
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(model)) {
    throw new Error(
      `Invalid model name: "${model}". Model names must start with a letter or underscore and contain only alphanumeric characters and underscores.`,
    );
  }

  const {api} = resolveRedisApi(redis);
  const startTime = Date.now();
  // Same transformer the key generator applied when writing
  const pattern = `${transform(prefix)}${delimiter}${transform(model)}${delimiter}*`;

  const buffer: string[] = [];
  const deletePromises: Promise<number>[] = [];

  let cursor = '0';
  do {
    const page = await api.scan(cursor, pattern, batchSize);
    cursor = page.cursor;
    buffer.push(...page.keys);

    while (buffer.length >= batchSize) {
      deletePromises.push(api.unlink(buffer.splice(0, batchSize)));
    }
  } while (cursor !== '0');

  if (buffer.length > 0) {
    deletePromises.push(api.unlink(buffer));
  }

  // UNLINK reports how many keys it actually removed, which can be
  // fewer than staged if keys expired or were deleted concurrently
  const deleteCounts = await Promise.all(deletePromises);

  return {
    deletedCount: deleteCounts.reduce((sum, count) => sum + count, 0),
    durationMs: Date.now() - startTime,
  };
};
