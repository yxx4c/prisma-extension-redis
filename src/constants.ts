/**
 * Named constants for prisma-extension-redis.
 * Centralizes magic numbers and default values for better maintainability.
 */

// ============================================
// DEFAULT VALUES
// ============================================

/** Default batch size for SCAN operations */
export const DEFAULT_CHUNK_SIZE = 1000;

/** Default maximum concurrent batch operations */
export const DEFAULT_MAX_CONCURRENT_BATCHES = 5;

/** Default cache key delimiter */
export const DEFAULT_DELIMITER = ':';

/** Default cache key prefix */
export const DEFAULT_PREFIX = 'prisma';

/** Default stale time (seconds) */
export const DEFAULT_STALE = 0;

// ============================================
// TIMEOUTS
// ============================================

/** Health check timeout in milliseconds */
export const HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Latency threshold for degraded health status (milliseconds) */
export const DEGRADED_LATENCY_THRESHOLD_MS = 1000;

// ============================================
// CACHE SOURCES
// ============================================

/** Cache data sources */
export const CACHE_SOURCE = {
  /** Data served from fresh cache (within TTL) */
  CACHE: 'cache',
  /** Data served from stale cache (past TTL, within stale window) */
  STALE_CACHE: 'stale-cache',
  /** Data fetched fresh from database */
  DATABASE: 'db',
} as const;

export type CacheSourceType = (typeof CACHE_SOURCE)[keyof typeof CACHE_SOURCE];

// ============================================
// REDIS COMMANDS
// ============================================

/** Supported cache storage types */
export const CACHE_TYPES = ['JSON', 'STRING'] as const;

export type CacheTypeValue = (typeof CACHE_TYPES)[number];

// ============================================
// SCAN OPERATIONS
// ============================================

/** Default count for Redis SCAN operations */
export const DEFAULT_SCAN_COUNT = 1000;

/** Average estimated value size in bytes (for memory estimation) */
export const ESTIMATED_VALUE_SIZE_BYTES = 500;

// ============================================
// DEBUG LEVELS
// ============================================

/** Debug logging levels */
export const DEBUG_LEVELS = {
  OFF: 'off',
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

export type DebugLevelType = (typeof DEBUG_LEVELS)[keyof typeof DEBUG_LEVELS];

// ============================================
// CACHE WARMING
// ============================================

/** Default concurrency for cache warming operations */
export const DEFAULT_WARM_CONCURRENCY = 5;
