import type {Redis} from 'iovalkey';
import {
  DEGRADED_LATENCY_THRESHOLD_MS,
  HEALTH_CHECK_TIMEOUT_MS,
} from './constants';

/**
 * Health check status
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Health check result
 */
export interface HealthResult {
  /** Overall health status */
  status: HealthStatus;
  /** Redis ping latency in milliseconds */
  latencyMs: number;
  /** Whether Redis connection is active */
  connected: boolean;
  /** Error message if unhealthy */
  error?: string;
  /** Timestamp of health check */
  timestamp: Date;
  /** Redis server info (if available) */
  serverInfo?: {
    version?: string;
    mode?: string;
  };
}

/**
 * Performs a health check on the Redis connection.
 *
 * @param redis - The Redis client instance
 * @returns Health check result with status, latency, and connection info
 *
 * @example
 * ```typescript
 * const health = await checkHealth(redis);
 *
 * if (health.status === 'unhealthy') {
 *   console.error('Redis unavailable:', health.error);
 * } else if (health.status === 'degraded') {
 *   console.warn('Redis slow:', health.latencyMs, 'ms');
 * }
 * ```
 */
export const checkHealth = async (redis: Redis): Promise<HealthResult> => {
  const timestamp = new Date();
  const startTime = Date.now();

  try {
    // Race between ping and timeout
    const result = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Health check timeout')),
          HEALTH_CHECK_TIMEOUT_MS,
        ),
      ),
    ]);

    const latencyMs = Date.now() - startTime;
    const connected = result === 'PONG';

    // Try to get server info
    let serverInfo: HealthResult['serverInfo'];
    try {
      const info = await redis.info('server');
      const lines = info.split('\r\n');
      serverInfo = {
        version: lines.find(l => l.startsWith('redis_version:'))?.split(':')[1],
        mode: lines.find(l => l.startsWith('redis_mode:'))?.split(':')[1],
      };
    } catch {
      // Server info is optional
    }

    return {
      status:
        latencyMs > DEGRADED_LATENCY_THRESHOLD_MS ? 'degraded' : 'healthy',
      latencyMs,
      connected,
      timestamp,
      serverInfo,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startTime,
      connected: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp,
    };
  }
};
