export type {Redis} from 'iovalkey';

import type {Prisma} from '@prisma/client/extension';
import type {
  JsArgs,
  ModelQueryOptionsCbArgs,
  Operation,
} from '@prisma/client/runtime/client';
import type {DebugLevelType} from './constants';
import type {MetricsCollector} from './metrics';
import type {RedisClientInput, ServerClock} from './redisApi';

export const ALL_OPERATIONS = [
  '$executeRaw',
  '$executeRawUnsafe',
  '$queryRaw',
  '$queryRawUnsafe',
  '$runCommandRaw',
  'aggregate',
  'aggregateRaw',
  'count',
  'create',
  'createMany',
  'createManyAndReturn',
  'delete',
  'deleteMany',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findRaw',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
] as const satisfies ReadonlyArray<Operation>;

export const DISABLED_OPERATIONS = [
  '$executeRaw',
  '$executeRawUnsafe',
  '$queryRaw',
  '$queryRawUnsafe',
  '$runCommandRaw',
  'aggregate',
  'aggregateRaw',
  'findRaw',
] as const satisfies ReadonlyArray<Operation>;

export type DisabledOperation = (typeof DISABLED_OPERATIONS)[number];

export const AUTO_REQUIRED_ARG_OPERATIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
] as const satisfies ReadonlyArray<Operation>;

export const AUTO_OPTIONAL_ARG_OPERATIONS = [
  'count',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
] as const satisfies ReadonlyArray<Operation>;

export const AUTO_OPERATIONS = [
  ...AUTO_REQUIRED_ARG_OPERATIONS,
  ...AUTO_OPTIONAL_ARG_OPERATIONS,
] as const;
export type autoOperations = (typeof AUTO_OPERATIONS)[number];

export const CACHE_REQUIRED_ARG_OPERATIONS = [
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
] as const satisfies ReadonlyArray<Operation>;

export const CACHE_OPTIONAL_ARG_OPERATIONS = [
  'count',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
] as const satisfies ReadonlyArray<Operation>;

export const CACHE_OPERATIONS = [
  ...CACHE_REQUIRED_ARG_OPERATIONS,
  ...CACHE_OPTIONAL_ARG_OPERATIONS,
] as const;

export const UNCACHE_REQUIRED_ARG_OPERATIONS = [
  'create',
  'delete',
  'update',
  'upsert',
] as const satisfies ReadonlyArray<Operation>;

export const UNCACHE_OPTIONAL_ARG_OPERATIONS = [
  'createMany',
  'createManyAndReturn',
  'deleteMany',
  'updateMany',
  'updateManyAndReturn',
] as const satisfies ReadonlyArray<Operation>;

export const UNCACHE_OPERATIONS = [
  ...UNCACHE_REQUIRED_ARG_OPERATIONS,
  ...UNCACHE_OPTIONAL_ARG_OPERATIONS,
] as const;

export interface CacheOptionsWithoutStale {
  /**
   * Key for caching
   */
  key: string;

  /**
   * Time-to-live in seconds: data is fresh until cachedAt + ttl.
   * If undefined, the key stays cached until explicitly uncached
   */
  ttl?: number;

  /**
   * stale cannot be set without ttl
   */
  stale?: never;
}

export interface CacheOptionsWithStale {
  /**
   * Key for caching
   */
  key: string;

  /**
   * Time-to-live in seconds: data is fresh until cachedAt + ttl
   */
  ttl: number;

  /**
   * Extra stale window in seconds after ttl expires, during which stale
   * data is still served while a background refresh runs. The key lives
   * in Redis for ttl + stale seconds in total.
   * If undefined, stale is zero
   */
  stale?: number;
}

export type CacheOptions = CacheOptionsWithoutStale | CacheOptionsWithStale;

export interface UncacheOptions {
  /**
   * Uncache keys
   */
  uncacheKeys: string[];

  /**
   * Pattern in keys?
   */
  hasPattern?: boolean;
}

type PrismaAutoArgs = {
  cache?: boolean;
};

type PrismaCacheArgs = {
  cache?: CacheOptions;
};

type PrismaUncacheArgs = {
  uncache?: UncacheOptions;
};

type UnCacheResultPromise<T, A, O extends Operation> = Promise<
  Prisma.Result<T, A, O>
>;

type PrismaMetaArg = {
  meta?: boolean;
};

export type CacheSource = 'cache' | 'stale-cache' | 'db';

/**
 * Error information captured during cache operations.
 * Errors are tracked but don't prevent operation - cache gracefully
 * degrades to database queries on failure.
 */
export type CacheErrors = {
  /** Error during cache read operation */
  cacheRead?: Error;
  /** Error during cache write operation */
  cacheWrite?: Error;
  /** Error during background refresh (stale-while-revalidate) */
  backgroundRefresh?: Error;
};

/**
 * Metadata returned with cached query results.
 * Contains information about cache state, timing, and control functions.
 */
export type Meta<T, A, O extends Operation> = {
  cachedAt: number;
  expiresAt: number;
  isCached: boolean;
  key: string;
  recache: () => Promise<ResultWithMeta<T, A, O>>;
  source: CacheSource;
  staleUntil: number;
  uncache: () => Promise<{deleted: number}>;
  /** Errors encountered during cache operations (if any) */
  errors?: CacheErrors;
};

/**
 * Result type when meta: true is passed to a cached query.
 */
export type ResultWithMeta<T, A, O extends Operation> = {
  result: Prisma.Result<T, A, O>;
  meta: Meta<T, A, O>;
};

type ResultPlain<T, A, O extends Operation> = Prisma.Result<T, A, O>;

/**
 * Internal cache result structure returned by getCache.
 * This type is used internally and should not be exported to users.
 */
export type InternalCacheResult = {
  result: unknown;
  meta: {
    cachedAt: number;
    expiresAt: number;
    isCached: boolean;
    key: string;
    recache: () => Promise<InternalCacheResult>;
    source: CacheSource;
    staleUntil: number;
    uncache: () => Promise<{deleted: number}>;
    /** Errors encountered during cache operations (if any) */
    errors?: CacheErrors;
  };
};

/**
 * Non-cached result structure when meta: true is passed but caching is disabled.
 */
/**
 * Meta result for queries that ran without caching (no cache/auto config
 * matched) but were called with meta: true. recache() re-executes the
 * query against the database; uncache() is a no-op returning {deleted: 0}
 * because nothing was written to the cache on this path.
 */
export type NonCachedMetaResult = {
  result: unknown;
  meta: {
    cachedAt: 0;
    expiresAt: 0;
    isCached: false;
    key: '';
    recache: () => Promise<NonCachedMetaResult>;
    source: 'db';
    staleUntil: 0;
    uncache: () => Promise<{deleted: 0}>;
  };
};

interface AutoRequiredArgsFunction<O extends Operation> {
  <T, A>(
    this: T,
    args: Prisma.Exact<
      A,
      Prisma.Args<T, O> & PrismaAutoArgs & PrismaMetaArg & {meta: true}
    >,
  ): Promise<ResultWithMeta<T, A, O>>;
  <T, A>(
    this: T,
    args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaAutoArgs & PrismaMetaArg>,
  ): Promise<ResultPlain<T, A, O>>;
}

interface AutoOptionalArgsFunction<O extends Operation> {
  <T, A>(
    this: T,
    args: Prisma.Exact<
      A,
      Prisma.Args<T, O> & PrismaAutoArgs & PrismaMetaArg & {meta: true}
    >,
  ): Promise<ResultWithMeta<T, A, O>>;
  <T, A>(
    this: T,
    args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaAutoArgs & PrismaMetaArg>,
  ): Promise<ResultPlain<T, A, O>>;
}

interface CacheRequiredArgsFunction<O extends Operation> {
  <T, A>(
    this: T,
    args: Prisma.Exact<
      A,
      Prisma.Args<T, O> & PrismaCacheArgs & PrismaMetaArg & {meta: true}
    >,
  ): Promise<ResultWithMeta<T, A, O>>;
  <T, A>(
    this: T,
    args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs & PrismaMetaArg>,
  ): Promise<ResultPlain<T, A, O>>;
}

interface CacheOptionalArgsFunction<O extends Operation> {
  <T, A>(
    this: T,
    args: Prisma.Exact<
      A,
      Prisma.Args<T, O> & PrismaCacheArgs & PrismaMetaArg & {meta: true}
    >,
  ): Promise<ResultWithMeta<T, A, O>>;
  <T, A>(
    this: T,
    args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs & PrismaMetaArg>,
  ): Promise<ResultPlain<T, A, O>>;
}

type UncacheRequiredArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaUncacheArgs>,
) => UnCacheResultPromise<T, A, O>;

type UncacheOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaUncacheArgs>,
) => UnCacheResultPromise<T, A, O>;

type OperationsConfig<
  RequiredArg extends Operation[],
  OptionalArg extends Operation[],
> = {
  requiredArg: RequiredArg;
  optionalArg: OptionalArg;
};

type ModelExtension<
  Config extends OperationsConfig<Operation[], Operation[]>,
  M extends 'auto' | 'cache' | 'uncache',
> = {
  [RO in Config['requiredArg'][number]]: M extends 'auto'
    ? AutoRequiredArgsFunction<RO>
    : M extends 'cache'
      ? CacheRequiredArgsFunction<RO>
      : UncacheRequiredArgsFunction<RO>;
} & {
  [OO in Config['optionalArg'][number]]: M extends 'auto'
    ? AutoOptionalArgsFunction<OO>
    : M extends 'cache'
      ? CacheOptionalArgsFunction<OO>
      : UncacheOptionalArgsFunction<OO>;
};

type autoConfig = {
  requiredArg: (typeof AUTO_REQUIRED_ARG_OPERATIONS)[number][];
  optionalArg: (typeof AUTO_OPTIONAL_ARG_OPERATIONS)[number][];
};

type cacheConfig = {
  requiredArg: (typeof CACHE_REQUIRED_ARG_OPERATIONS)[number][];
  optionalArg: (typeof CACHE_OPTIONAL_ARG_OPERATIONS)[number][];
};

type uncacheConfig = {
  requiredArg: (typeof UNCACHE_REQUIRED_ARG_OPERATIONS)[number][];
  optionalArg: (typeof UNCACHE_OPTIONAL_ARG_OPERATIONS)[number][];
};

export type ExtendedModel = ModelExtension<autoConfig, 'auto'> &
  ModelExtension<cacheConfig, 'cache'> &
  ModelExtension<uncacheConfig, 'uncache'>;

export type CacheType = 'JSON' | 'STRING';

export type caseTransformer = (str: string) => string;

export type CacheKey = {
  /**
   * Cache key delimiter
   * Default value: ':'
   */
  delimiter?: string;

  /**
   * Function to transform the case of cache key.
   * If not provided, snake_case is used by default.
   * Supply a custom function to use a different case style.
   */
  caseTransformer?: caseTransformer;

  /**
   * AutoCache key prefix
   * Default value: 'prisma'
   */
  prefix?: string;
};

export type CacheConfig = {
  auto: AutoCacheConfig;

  /**
   * Redis Cache Type (Redis instance must support JSON module to use JSON)
   */
  type: CacheType;

  /**
   * Inbuilt cache key generation config
   */
  cacheKey?: CacheKey;

  /**
   * Default time-to-live in seconds: data is fresh until cachedAt + ttl
   */
  ttl: number;

  /**
   * Default extra stale window in seconds after ttl expires, during
   * which stale data is still served while a background refresh runs.
   * Keys live in Redis for ttl + stale seconds in total
   */
  stale: number;

  /**
   * Chunk size for batch operations (e.g., pattern-based key deletion)
   * Default value: 1000
   */
  chunkSize?: number;

  /**
   * Maximum number of concurrent batches
   * Default value: 5
   */
  maxConcurrentBatches?: number;

  /**
   * Custom transformer for serializing and deserializing data
   */
  transformer?: {
    serialize: (data: unknown) => string;
    deserialize: (data: unknown) => unknown;
  };
  onError?: (error: unknown) => void;
  onHit?: (key: string) => void;
  onMiss?: (key: string) => void;

  /**
   * Metrics collector for tracking cache performance.
   * Use createMetricsCollector() to create one.
   */
  metricsCollector?: MetricsCollector;

  /**
   * Debug logging level for troubleshooting cache operations.
   * - 'off': No logging (default)
   * - 'error': Only errors
   * - 'warn': Errors and warnings
   * - 'info': Errors, warnings, and info messages
   * - 'debug': All messages including debug details
   */
  debug?: DebugLevelType;
};

export interface ModelConfig {
  /**
   * Model
   */
  model: string;

  /**
   * Excluded cache operations
   */
  excludedOperations?: autoOperations[];

  /**
   * Model-specific override of auto.invalidateOnWrite: writes to this
   * model purge (true) or keep (false) its auto-cached entries
   */
  invalidateOnWrite?: boolean;

  /**
   * Model-specific extra stale window in seconds after ttl expires
   */
  stale?: number;

  /**
   * Model specific time-to-live (ttl) value
   */
  ttl?: number;
}

export type AutoCacheConfig =
  | {
      /**
       * Only auto-cache these models; every model not listed is left
       * uncached (per-query cache flags still override). Mutually
       * exclusive with excludedModels
       */
      includedModels?: string[];

      /**
       * Default excluded models. Mutually exclusive with includedModels
       */
      excludedModels?: string[];

      /**
       * Default excluded cache operations
       */
      excludedOperations?: autoOperations[];

      /**
       * Purge a model's auto-cached entries whenever a write operation
       * (create/update/delete/upsert and their Many variants) on that
       * model succeeds. Only auto-cache keys are removed — custom keys
       * are untouched, and cached results of other models that embed
       * this model via include/select are not detected. Overridable per
       * model via models[].invalidateOnWrite
       */
      invalidateOnWrite?: boolean;

      /**
       * Default model configuration
       */
      models?: ModelConfig[];

      /**
       * Default extra stale window in seconds after ttl expires for
       * auto-cached queries
       */
      stale?: number;

      /**
       * Auto time-to-live (ttl) value
       */
      ttl?: number;
    }
  | boolean;

export interface PrismaExtensionRedisOptions {
  /**
   * Cache config
   */
  config: CacheConfig;

  /**
   * Redis connection. Accepts iovalkey RedisOptions or a connection
   * string (a client is constructed for you), an existing
   * ioredis-compatible instance (iovalkey, ioredis, valkey), an
   * Upstash-style REST client (@upstash/redis), or any custom RedisApi
   * implementation.
   */
  client: RedisClientInput;
}

export type DeletePatterns = {
  /**
   * Redis client, instance or RedisApi (see PrismaExtensionRedisOptions.client)
   */
  redis: RedisClientInput;

  /**
   * Patterns for key deletion
   */
  patterns: string[];

  /**
   * Chunk size for batch operations
   */
  chunkSize?: number;

  /**
   * Maximum number of concurrent batches
   */
  maxConcurrentBatches?: number;
};

export type CacheParams = {
  /**
   * Redis client, instance or RedisApi (see PrismaExtensionRedisOptions.client)
   */
  redis: RedisClientInput;

  /**
   * Key to cache the value under
   */
  key: string;

  /**
   * Value to cache; stored in the same envelope cached reads consume
   */
  value: unknown;

  /**
   * Cache config providing the storage type, serializer, and default
   * ttl/stale values (auto is irrelevant for direct writes)
   */
  config: Omit<CacheConfig, 'auto'> & {auto?: CacheConfig['auto']};

  /**
   * Freshness window in seconds; defaults to config.ttl
   */
  ttl?: number;

  /**
   * Extra stale window in seconds after ttl; defaults to config.stale
   */
  stale?: number;

  /**
   * Server-synced clock for timestamps. When omitted, the shared clock
   * for the resolved client is used
   */
  clock?: ServerClock;
};

export type UncacheParams = {
  /**
   * Redis client, instance or RedisApi (see PrismaExtensionRedisOptions.client)
   */
  redis: RedisClientInput;

  /**
   * Keys to delete; entries containing glob characters (* or ?) are
   * treated as SCAN patterns when hasPattern is true
   */
  uncacheKeys: string[];

  /**
   * Enable glob expansion for keys containing wildcard characters.
   * Exact keys in the list are still deleted directly without a SCAN
   */
  hasPattern?: boolean;

  /**
   * Chunk size for batch operations
   */
  chunkSize?: number;

  /**
   * Maximum number of concurrent batches
   */
  maxConcurrentBatches?: number;
};

export type ActionParams = {
  /**
   * Model query options
   */
  options: ModelQueryOptionsCbArgs;

  /**
   * Redis client, instance or RedisApi
   */
  redis: RedisClientInput;

  /**
   * CacheConfig
   */
  config: CacheConfig;

  /**
   * Auto stale time after ttl
   */
  stale?: number;

  /**
   * Auto time-to-live (ttl) value
   */
  ttl?: number;
};

export type ActionCheckParams = {
  /**
   * Auto cache config
   */
  auto?: AutoCacheConfig;

  /**
   * Model query options
   */
  options: ModelQueryOptionsCbArgs;
};

export type GetDataParams = {
  ttl: number;
  stale: number;
  config: Omit<CacheConfig, 'auto'> & {auto?: CacheConfig['auto']};
  key: string;
  redis: RedisClientInput;
  args: JsArgs;
  query: (args: JsArgs) => Promise<unknown>;
  /**
   * Server-synced clock for timestamps. When omitted, the shared clock
   * for the resolved client is used.
   */
  clock?: ServerClock;
};

export type CacheContext = {
  isCached: boolean;
  // result can be any Prisma query result type
  result: unknown;
  stale: number;
  timestamp: number;
  ttl: number;
};

export type CacheKeyParams = {
  /**
   * Key params to generate key
   */
  params: Record<string, string>[];

  /**
   * Model name
   */
  model?: string;

  /**
   * Operation name
   */
  operation?: Operation;
};

export type CacheAutoKeyParams = {
  /**
   * Query args
   */
  args: JsArgs;

  /**
   * Model name
   */
  model: string;

  /**
   * Operation name
   */
  operation: Operation;
};

export type CacheKeyPatternParams = {
  /**
   * Key params to generate key
   */
  params: Record<string, string>[];

  /**
   * Model name
   */
  model?: string;

  /**
   * Operation name
   */
  operation?: Operation;
};
