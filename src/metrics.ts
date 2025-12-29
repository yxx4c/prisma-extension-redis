/**
 * Cache operation metrics
 */
export interface CacheMetrics {
  /** Number of cache hits (fresh data served) */
  hits: number;
  /** Number of cache misses (DB query required) */
  misses: number;
  /** Number of stale cache hits (stale data served) */
  staleHits: number;
  /** Number of errors during cache operations */
  errors: number;
  /** Number of background refresh operations started */
  backgroundRefreshes: number;
  /** Average latency for cache hits (ms) */
  avgCacheLatencyMs: number;
  /** Average latency for cache misses (ms) */
  avgDbLatencyMs: number;
  /** Cache hit ratio (0-1) */
  hitRatio: number;
  /** When metrics were last reset */
  lastResetAt: Date;
}

/**
 * Interface for metrics collection
 */
export interface MetricsCollector {
  /** Record a cache hit with latency */
  recordHit(latencyMs: number): void;
  /** Record a cache miss with latency */
  recordMiss(latencyMs: number): void;
  /** Record a stale cache hit with latency */
  recordStaleHit(latencyMs: number): void;
  /** Record an error */
  recordError(): void;
  /** Record a background refresh start */
  recordBackgroundRefresh(): void;
  /** Get current metrics snapshot */
  getMetrics(): CacheMetrics;
  /** Reset all metrics */
  reset(): void;
}

/**
 * Creates a metrics collector instance for tracking cache performance.
 *
 * @example
 * ```typescript
 * import { createMetricsCollector, PrismaExtensionRedis } from 'prisma-extension-redis';
 *
 * const metrics = createMetricsCollector();
 *
 * const prisma = new PrismaClient().$extends(
 *   PrismaExtensionRedis({
 *     config: { ttl: 60, metricsCollector: metrics },
 *     client: redisOptions,
 *   })
 * );
 *
 * // Get metrics anytime
 * setInterval(() => {
 *   const stats = metrics.getMetrics();
 *   console.log(`Hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);
 *   console.log(`Avg cache latency: ${stats.avgCacheLatencyMs.toFixed(2)}ms`);
 * }, 60000);
 * ```
 */
export const createMetricsCollector = (): MetricsCollector => {
  let hits = 0;
  let misses = 0;
  let staleHits = 0;
  let errors = 0;
  let backgroundRefreshes = 0;
  let totalCacheLatency = 0;
  let totalDbLatency = 0;
  let lastResetAt = new Date();

  return {
    recordHit(latencyMs: number) {
      hits++;
      totalCacheLatency += latencyMs;
    },

    recordMiss(latencyMs: number) {
      misses++;
      totalDbLatency += latencyMs;
    },

    recordStaleHit(latencyMs: number) {
      staleHits++;
      totalCacheLatency += latencyMs;
    },

    recordError() {
      errors++;
    },

    recordBackgroundRefresh() {
      backgroundRefreshes++;
    },

    getMetrics(): CacheMetrics {
      const totalRequests = hits + misses + staleHits;
      const cacheRequests = hits + staleHits;

      return {
        hits,
        misses,
        staleHits,
        errors,
        backgroundRefreshes,
        avgCacheLatencyMs:
          cacheRequests > 0 ? totalCacheLatency / cacheRequests : 0,
        avgDbLatencyMs: misses > 0 ? totalDbLatency / misses : 0,
        hitRatio: totalRequests > 0 ? cacheRequests / totalRequests : 0,
        lastResetAt,
      };
    },

    reset() {
      hits = 0;
      misses = 0;
      staleHits = 0;
      errors = 0;
      backgroundRefreshes = 0;
      totalCacheLatency = 0;
      totalDbLatency = 0;
      lastResetAt = new Date();
    },
  };
};
