import {Prisma} from '@prisma/client/extension';
import Redis from 'iovalkey';
import {getAutoKeyGen, getKeyGen, getKeyPatternGen} from './cacheKey';
import {
  autoCacheAction,
  customCacheAction,
  customUncacheAction,
  isAutoCacheEnabled,
  isCustomCacheEnabled,
  isCustomUncacheEnabled,
} from './cacheUncache';
import type {WarmOptions, WarmQuery} from './cacheWarmer';
import {createCacheWarmer} from './cacheWarmer';
import {DEFAULT_DELIMITER, DEFAULT_PREFIX} from './constants';
import {checkHealth} from './healthCheck';
import type {CleanupOptions, FlushModelOptions} from './maintenance';
import {
  cleanupOrphanedKeys,
  flushModelCache,
  getCacheStats,
} from './maintenance';
import type {
  ExtendedModel,
  NonCachedMetaResult,
  PrismaExtensionRedisOptions,
} from './types';
import {validateConfig} from './validation';

/**
 * Creates a Prisma extension that adds Redis caching capabilities.
 *
 * @param options - Configuration options for the extension
 * @param options.config - Cache configuration (ttl, stale, auto, type, etc.)
 * @param options.client - Redis connection options (host, port, etc.)
 * @returns A Prisma extension with caching methods and automatic query caching
 *
 * @example
 * ```typescript
 * import { PrismaClient } from '@prisma/client';
 * import { PrismaExtensionRedis } from 'prisma-extension-redis';
 *
 * const prisma = new PrismaClient().$extends(
 *   PrismaExtensionRedis({
 *     config: { ttl: 60, stale: 30, auto: true, type: 'JSON' },
 *     client: { host: 'localhost', port: 6379 },
 *   })
 * );
 * ```
 */
export const PrismaExtensionRedis = (options: PrismaExtensionRedisOptions) => {
  const {
    config,
    config: {auto, cacheKey},
    client: redisOptions,
  } = options;

  // Validate configuration at initialization
  validateConfig(config);

  const {delimiter, caseTransformer, prefix} = cacheKey ?? {};

  const redis = new Redis(redisOptions);

  const getKey = getKeyGen(delimiter, caseTransformer, prefix);
  const getAutoKey = getAutoKeyGen(getKey);
  const getKeyPattern = getKeyPatternGen(delimiter, caseTransformer, prefix);

  // Bind maintenance utilities with configured prefix/delimiter
  const configuredPrefix = prefix ?? DEFAULT_PREFIX;
  const configuredDelimiter = delimiter ?? DEFAULT_DELIMITER;

  return Prisma.defineExtension({
    name: 'prisma-extension-redis',
    client: {
      /** The Redis client instance for direct access if needed */
      redis,

      /**
       * Generates a cache key from the provided parameters.
       * @param options - Key generation options
       * @param options.params - Array of key-value pairs to include in the key
       * @returns A formatted cache key string
       * @example
       * ```typescript
       * const key = prisma.getKey({ params: [{ prisma: 'User' }, { id: 1 }] });
       * // Returns: 'prisma:user:id:1'
       * ```
       */
      getKey,

      /**
       * Generates a cache key pattern for wildcard invalidation.
       * @param options - Pattern generation options
       * @param options.params - Array of key-value pairs, use '*' or 'glob' for wildcards
       * @returns A pattern string for Redis SCAN matching
       * @example
       * ```typescript
       * const pattern = prisma.getKeyPattern({ params: [{ prisma: 'User' }, { glob: '*' }] });
       * // Returns: 'prisma:user:*'
       * ```
       */
      getKeyPattern,

      /**
       * Generates an auto-cache key based on model, operation, and arguments.
       * Used internally for automatic cache key generation.
       * @param options - Auto-key generation options
       * @param options.model - The Prisma model name
       * @param options.operation - The Prisma operation (findUnique, findMany, etc.)
       * @param options.args - The query arguments
       * @returns A unique cache key for the query
       */
      getAutoKey,

      /**
       * Get cache statistics for monitoring.
       * @returns Cache statistics including total keys, keys by model, and estimated size
       */
      getCacheStats: () =>
        getCacheStats(redis, configuredPrefix, configuredDelimiter),

      /**
       * Clean up cache keys for models that no longer exist in the schema.
       */
      cleanupOrphanedKeys: (
        validModels: string[],
        opts?: Partial<Omit<CleanupOptions, 'redis' | 'validModels'>>,
      ) =>
        cleanupOrphanedKeys({
          redis,
          validModels,
          prefix: configuredPrefix,
          delimiter: configuredDelimiter,
          ...opts,
        }),

      /**
       * Flush all cache entries for a specific model.
       */
      flushModelCache: (
        model: string,
        opts?: Partial<Omit<FlushModelOptions, 'redis' | 'model'>>,
      ) =>
        flushModelCache({
          redis,
          model,
          prefix: configuredPrefix,
          delimiter: configuredDelimiter,
          ...opts,
        }),

      /**
       * Check Redis connection health.
       */
      healthCheck: () => checkHealth(redis),

      /**
       * Warm the cache with predefined queries.
       * Note: This returns a function that must be called with the extended prisma client.
       */
      createCacheWarmer: (prisma: unknown) =>
        createCacheWarmer(
          prisma,
          {ttl: config.ttl, stale: config.stale},
          getAutoKey,
        ),

      /**
       * Warm the cache with predefined queries using this client.
       * @param queries - Array of queries to warm
       * @param options - Warming options (concurrency, callbacks)
       */
      warmCache: function (
        this: unknown,
        queries: WarmQuery[],
        opts?: WarmOptions,
      ) {
        const warmer = createCacheWarmer(
          this,
          {ttl: config.ttl, stale: config.stale},
          getAutoKey,
        );
        return warmer(queries, opts);
      },
    },
    model: {
      $allModels: {} as ExtendedModel,
    },
    query: {
      $allModels: {
        async $allOperations(options) {
          const {args, query} = options;

          if (isAutoCacheEnabled({auto, options}))
            return autoCacheAction(
              {
                redis,
                options,
                config,
              },
              getAutoKey,
            );

          if (isCustomCacheEnabled({options}))
            return customCacheAction({
              redis,
              options,
              config,
            });

          if (isCustomUncacheEnabled({options}))
            return customUncacheAction({
              redis,
              options,
              config,
            });

          const executeNonCached = () =>
            query({
              ...args,
              cache: undefined,
              meta: undefined,
            });

          // recache re-runs the query; uncache is a no-op because nothing
          // was written to the cache on this path
          const buildNonCached = (result: unknown): NonCachedMetaResult => ({
            result,
            meta: {
              cachedAt: 0,
              expiresAt: 0,
              isCached: false,
              key: '',
              recache: async () => buildNonCached(await executeNonCached()),
              source: 'db',
              staleUntil: 0,
              uncache: async () => ({deleted: 0}),
            },
          });

          const result = await executeNonCached();

          // If meta is not requested, return plain result
          if (!args.meta) return result;

          return buildNonCached(result);
        },
      },
    },
  });
};
