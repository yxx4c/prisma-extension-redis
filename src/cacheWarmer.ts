import type {JsArgs, Operation} from '@prisma/client/runtime/client';
import {DEFAULT_WARM_CONCURRENCY} from './constants';
import type {CacheAutoKeyParams} from './types';

/**
 * Query definition for cache warming
 */
export interface WarmQuery {
  /** Prisma model name */
  model: string;
  /** Operation to execute */
  operation: Operation;
  /** Query arguments */
  args: JsArgs;
  /** Optional TTL override */
  ttl?: number;
  /** Optional stale time override */
  stale?: number;
}

/**
 * Options for cache warming operation
 */
export interface WarmOptions {
  /** Maximum concurrent queries (default: 5) */
  concurrency?: number;
  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
  /** Error callback for individual query failures */
  onQueryError?: (query: WarmQuery, error: Error) => void;
  /**
   * Whether to continue on errors (default: true).
   * When false, no further batches are started after the first failure;
   * queries already in flight complete and are counted. Queries never
   * attempted are reflected as total - successful - failed.
   */
  continueOnError?: boolean;
}

/**
 * Result of cache warming operation
 */
export interface WarmResult {
  /** Total queries attempted */
  total: number;
  /** Successfully cached queries */
  successful: number;
  /** Failed queries */
  failed: number;
  /** Individual query errors */
  errors: Array<{query: WarmQuery; error: Error}>;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Creates a cache warmer function bound to the extended Prisma client.
 *
 * @param prisma - The extended Prisma client instance
 * @param config - Configuration with ttl and stale values
 * @param getAutoKey - Function to generate auto cache keys
 * @returns A function that warms the cache with the given queries
 *
 * @example
 * ```typescript
 * const warmCache = createCacheWarmer(prisma, { ttl: 60, stale: 30 }, getAutoKey);
 *
 * await warmCache([
 *   { model: 'User', operation: 'findMany', args: { take: 100 } },
 *   { model: 'Post', operation: 'findMany', args: { where: { published: true } } },
 * ], {
 *   concurrency: 10,
 *   onProgress: (done, total) => console.log(`${done}/${total}`),
 * });
 * ```
 */
export const createCacheWarmer = (
  prisma: unknown,
  config: {ttl: number; stale?: number},
  getAutoKey: (params: CacheAutoKeyParams) => string,
) => {
  return async (
    queries: WarmQuery[],
    options: WarmOptions = {},
  ): Promise<WarmResult> => {
    const {
      concurrency = DEFAULT_WARM_CONCURRENCY,
      onProgress,
      onQueryError,
      continueOnError = true,
    } = options;

    const startTime = Date.now();
    const result: WarmResult = {
      total: queries.length,
      successful: 0,
      failed: 0,
      errors: [],
      durationMs: 0,
    };

    const executeQuery = async (query: WarmQuery): Promise<void> => {
      try {
        const modelName =
          query.model.charAt(0).toLowerCase() + query.model.slice(1);
        const model = (prisma as Record<string, unknown>)[modelName];

        if (!model || typeof model !== 'object') {
          throw new Error(`Model "${query.model}" not found on Prisma client`);
        }

        const operation = (model as Record<string, unknown>)[query.operation];

        if (typeof operation !== 'function') {
          throw new Error(
            `Operation "${query.operation}" not found on model "${query.model}"`,
          );
        }

        // Execute query with cache options
        await (operation as (...args: unknown[]) => Promise<unknown>).call(
          model,
          {
            ...query.args,
            cache: {
              key: getAutoKey({
                args: query.args,
                model: query.model,
                operation: query.operation,
              }),
              ttl: query.ttl ?? config.ttl,
              stale: query.stale ?? config.stale,
            },
          },
        );

        result.successful++;
      } catch (error) {
        result.failed++;
        const err = error instanceof Error ? error : new Error(String(error));
        result.errors.push({query, error: err});

        if (onQueryError) {
          onQueryError(query, err);
        }

        if (!continueOnError) {
          aborted = true;
        }
      }
    };

    // Execute with concurrency limit using chunking
    let completed = 0;
    let aborted = false;

    for (let i = 0; i < queries.length; i += concurrency) {
      if (aborted) break;

      const chunk = queries.slice(i, i + concurrency);
      await Promise.all(chunk.map(executeQuery));

      completed += chunk.length;
      if (onProgress) {
        onProgress(completed, queries.length);
      }
    }

    result.durationMs = Date.now() - startTime;
    return result;
  };
};
