import type {Redis} from 'iovalkey';
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_DELIMITER,
  DEFAULT_PREFIX,
  DEFAULT_SCAN_COUNT,
  ESTIMATED_VALUE_SIZE_BYTES,
} from './constants';

/**
 * Options for the orphaned key cleanup operation.
 */
export interface CleanupOptions {
  /** Redis client instance */
  redis: Redis;
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
}: CleanupOptions): Promise<CleanupResult> => {
  const startTime = Date.now();
  const pattern = `${prefix}${delimiter}*`;
  const orphanedKeys: string[] = [];
  let scannedKeys = 0;

  // Normalize model names to lowercase for case-insensitive comparison
  const validModelPatterns = new Set(
    validModels.map(model => `${prefix}${delimiter}${model.toLowerCase()}`),
  );

  return new Promise((resolve, reject) => {
    const stream = redis.scanStream({match: pattern, count: batchSize});
    const deleteBuffer: string[] = [];
    const deletePromises: Promise<number>[] = [];

    stream.on('data', (keys: string[]) => {
      scannedKeys += keys.length;

      for (const key of keys) {
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
      if (!dryRun && deleteBuffer.length >= batchSize) {
        const toDelete = deleteBuffer.splice(0, batchSize);
        deletePromises.push(redis.unlink(...toDelete));
      }

      if (onProgress) {
        onProgress(scannedKeys, orphanedKeys.length);
      }
    });

    stream.on('error', error => {
      reject(error);
    });

    stream.on('end', async () => {
      try {
        // Delete remaining keys in buffer
        if (!dryRun && deleteBuffer.length > 0) {
          deletePromises.push(redis.unlink(...deleteBuffer));
        }

        // Wait for all deletes to complete
        await Promise.all(deletePromises);

        resolve({
          scannedKeys,
          orphanedKeys,
          deletedCount: dryRun ? 0 : orphanedKeys.length,
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
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
  redis: Redis,
  prefix = DEFAULT_PREFIX,
  delimiter = DEFAULT_DELIMITER,
): Promise<CacheStats> => {
  const pattern = `${prefix}${delimiter}*`;
  const keysByModel: Record<string, number> = {};
  let totalKeys = 0;
  let estimatedSizeBytes = 0;

  return new Promise((resolve, reject) => {
    const stream = redis.scanStream({
      match: pattern,
      count: DEFAULT_SCAN_COUNT,
    });

    stream.on('data', (keys: string[]) => {
      totalKeys += keys.length;

      for (const key of keys) {
        const parts = key.split(delimiter);
        const model = parts[1] || 'unknown';
        keysByModel[model] = (keysByModel[model] || 0) + 1;

        // Rough estimate: key length + average value size
        estimatedSizeBytes += key.length + ESTIMATED_VALUE_SIZE_BYTES;
      }
    });

    stream.on('error', reject);

    stream.on('end', () => {
      resolve({totalKeys, keysByModel, estimatedSizeBytes});
    });
  });
};

/**
 * Options for flushing cache by model.
 */
export interface FlushModelOptions {
  /** Redis client instance */
  redis: Redis;
  /** Model name to flush */
  model: string;
  /** Cache key prefix (default: 'prisma') */
  prefix?: string;
  /** Key delimiter (default: ':') */
  delimiter?: string;
  /** Batch size for delete operations (default: 1000) */
  batchSize?: number;
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
}: FlushModelOptions): Promise<{deletedCount: number; durationMs: number}> => {
  // Validate model name to prevent injection of Redis wildcards
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(model)) {
    throw new Error(
      `Invalid model name: "${model}". Model names must start with a letter or underscore and contain only alphanumeric characters and underscores.`,
    );
  }

  const startTime = Date.now();
  const pattern = `${prefix}${delimiter}${model.toLowerCase()}${delimiter}*`;
  let deletedCount = 0;

  return new Promise((resolve, reject) => {
    const stream = redis.scanStream({match: pattern, count: batchSize});
    const buffer: string[] = [];
    const deletePromises: Promise<number>[] = [];

    stream.on('data', (keys: string[]) => {
      buffer.push(...keys);

      while (buffer.length >= batchSize) {
        const toDelete = buffer.splice(0, batchSize);
        deletedCount += toDelete.length;
        deletePromises.push(redis.unlink(...toDelete));
      }
    });

    stream.on('error', reject);

    stream.on('end', async () => {
      try {
        if (buffer.length > 0) {
          deletedCount += buffer.length;
          deletePromises.push(redis.unlink(...buffer));
        }

        await Promise.all(deletePromises);

        resolve({
          deletedCount,
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
};
