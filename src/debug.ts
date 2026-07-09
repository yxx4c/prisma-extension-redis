/**
 * Debug logging utilities for prisma-extension-redis.
 * Provides configurable logging levels for troubleshooting cache operations.
 */

import {DEBUG_LEVELS, type DebugLevelType} from './constants';

/**
 * Debug logging levels ordered by verbosity.
 * - 'off': No logging
 * - 'error': Only errors
 * - 'warn': Errors and warnings
 * - 'info': Errors, warnings, and info messages
 * - 'debug': All messages including debug details
 */
export type DebugLevel = DebugLevelType;

/**
 * Debug logger interface providing level-based logging methods.
 */
export interface DebugLogger {
  /** Log error messages */
  error: (message: string, ...args: unknown[]) => void;
  /** Log warning messages */
  warn: (message: string, ...args: unknown[]) => void;
  /** Log informational messages */
  info: (message: string, ...args: unknown[]) => void;
  /** Log debug messages */
  debug: (message: string, ...args: unknown[]) => void;
}

/** Numeric values for log level comparison */
const levelValues: Record<DebugLevel, number> = {
  [DEBUG_LEVELS.OFF]: 0,
  [DEBUG_LEVELS.ERROR]: 1,
  [DEBUG_LEVELS.WARN]: 2,
  [DEBUG_LEVELS.INFO]: 3,
  [DEBUG_LEVELS.DEBUG]: 4,
};

/** Log prefix for all messages */
const LOG_PREFIX = '[prisma-extension-redis]';

/**
 * Creates a debug logger with the specified level.
 * Messages below the specified level will be suppressed.
 *
 * @param level - The minimum logging level (default: 'off')
 * @returns A DebugLogger instance
 *
 * @example
 * ```typescript
 * // Create a logger that shows warnings and errors
 * const logger = createDebugLogger('warn');
 *
 * logger.error('Cache connection failed'); // Logged
 * logger.warn('Cache hit rate low');       // Logged
 * logger.info('Cache initialized');        // Not logged
 * logger.debug('Key lookup: user:1');      // Not logged
 * ```
 *
 * @example
 * ```typescript
 * // Use in configuration
 * PrismaExtensionRedis({
 *   config: {
 *     ttl: 60,
 *     debug: process.env.NODE_ENV === 'development' ? 'debug' : 'error',
 *   },
 *   client: redisOptions,
 * });
 * ```
 */
const loggerCache = new Map<DebugLevel, DebugLogger>();

export const createDebugLogger = (
  level: DebugLevel = DEBUG_LEVELS.OFF,
): DebugLogger => {
  // Loggers are pure per level, so cache them: getCache runs on every
  // cached read and must not allocate a logger per call
  if (level === DEBUG_LEVELS.OFF) return noopLogger;
  const cached = loggerCache.get(level);
  if (cached) return cached;

  const shouldLog = (msgLevel: DebugLevel): boolean =>
    levelValues[msgLevel] <= levelValues[level];

  const timestamp = () => new Date().toISOString();

  const logger: DebugLogger = {
    error: (message, ...args) => {
      if (shouldLog(DEBUG_LEVELS.ERROR)) {
        console.error(`${timestamp()} ${LOG_PREFIX} ERROR:`, message, ...args);
      }
    },
    warn: (message, ...args) => {
      if (shouldLog(DEBUG_LEVELS.WARN)) {
        console.warn(`${timestamp()} ${LOG_PREFIX} WARN:`, message, ...args);
      }
    },
    info: (message, ...args) => {
      if (shouldLog(DEBUG_LEVELS.INFO)) {
        console.info(`${timestamp()} ${LOG_PREFIX} INFO:`, message, ...args);
      }
    },
    debug: (message, ...args) => {
      if (shouldLog(DEBUG_LEVELS.DEBUG)) {
        console.debug(`${timestamp()} ${LOG_PREFIX} DEBUG:`, message, ...args);
      }
    },
  };

  loggerCache.set(level, logger);
  return logger;
};

/**
 * No-op logger that discards all messages.
 * Used when debug logging is disabled.
 */
export const noopLogger: DebugLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};
