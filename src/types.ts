export type {Redis} from 'iovalkey';

import type {Prisma} from '@prisma/client/extension';
import type {
  JsArgs,
  ModelQueryOptionsCbArgs,
  Operation,
} from '@prisma/client/runtime/library';
import type {Redis, RedisOptions} from 'iovalkey';
import type {MetricsCollector} from './metrics';

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
] as const satisfies ReadonlyArray<Operation>;

export const UNCACHE_OPERATIONS = [
  ...UNCACHE_REQUIRED_ARG_OPERATIONS,
  ...UNCACHE_OPTIONAL_ARG_OPERATIONS,
] as const;

export interface CacheOptionsWithStale {
  /**
   * Key for caching
   */
  key: string;

  /**
   * Custom time-to-live (ttl) value.
   * If undefined, key stays in cache till uncached
   */
  ttl?: number;

  /**
   * Custom stale value.
   * Stale cannot be set without ttl
   */
  stale?: never;
}

export interface CacheOptionsWithoutStale {
  /**
   * Key for caching
   */
  key: string;

  /**
   * Custom time-to-live (ttl) value.
   * If undefined, key stays in cache till uncached
   */
  ttl: number;

  /**
   * Custom stale value.
   * If undefined, stale is zero
   */
  stale?: number;
}

export type CacheOptions = CacheOptionsWithStale | CacheOptionsWithoutStale;

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
   * Default time-to-live (ttl) value
   */
  ttl: number;

  /**
   * Default stale time after ttl
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
   * Auto - stale time after ttl
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
       * Default excluded models
       */
      excludedModels?: string[];

      /**
       * Default excluded cache operations
       */
      excludedOperations?: autoOperations[];

      /**
       * Default model configuration
       */
      models?: ModelConfig[];

      /**
       * Auto stale time after ttl
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
   * Redis client config (iovalkey)
   */
  client: RedisOptions;
}

export type DeletePatterns = {
  /**
   * Redis client
   */
  redis: Redis;

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

export type ActionParams = {
  /**
   * Model query options
   */
  options: ModelQueryOptionsCbArgs;

  /**
   * Redis client
   */
  redis: Redis;

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
  config: CacheConfig;
  key: string;
  redis: Redis;
  args: JsArgs;
  query: (args: JsArgs) => Promise<unknown>;
};

export type CacheContext = {
  isCached: boolean;
  // result can be any Prisma query result type
  result: unknown;
  stale: number;
  timestamp: number;
  ttl: number;
};

export type RedisCacheResultOrError =
  | [error: Error | null, result: unknown][]
  | null;

export type RedisCacheCommands = Record<
  string,
  {
    get: (redis: Redis, key: string) => Promise<RedisCacheResultOrError>;
    set: (
      redis: Redis,
      key: string,
      value: string,
      ttl: number,
    ) => Promise<RedisCacheResultOrError>;
  }
>;

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
