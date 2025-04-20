import type {Prisma} from '@prisma/client/extension';
import type {
  JsArgs,
  ModelQueryOptionsCbArgs,
  Operation,
} from '@prisma/client/runtime/library';
import type {CacheProvider} from './providers/interface';

import type {CacheCase} from './key';

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
export type AutoOperations = (typeof AUTO_OPERATIONS)[number];

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

export const INVALIDATE_REQUIRED_ARG_OPERATIONS = [
  'create',
  'delete',
  'update',
  'upsert',
] as const satisfies ReadonlyArray<Operation>;

export const INVALIDATE_OPTIONAL_ARG_OPERATIONS = [
  'createMany',
  'createManyAndReturn',
  'deleteMany',
  'updateMany',
] as const satisfies ReadonlyArray<Operation>;

export const INVALIDATE_OPERATIONS = [
  ...INVALIDATE_REQUIRED_ARG_OPERATIONS,
  ...INVALIDATE_OPTIONAL_ARG_OPERATIONS,
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

export interface InvalidateOptions {
  /**
   * Invalidate keys
   */
  invalidateKeys: string[];

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

type PrismaInvalidateArgs = {
  invalidate?: InvalidateOptions;
};

type CacheResultPromise<T, A, O extends Operation> = Promise<{
  result: Prisma.Result<T, A, O>;
  isCached: boolean;
}>;

type InvalidateResultPromise<T, A, O extends Operation> = Promise<{
  result: Prisma.Result<T, A, O>;
}>;

type AutoRequiredArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaAutoArgs>,
) => CacheResultPromise<T, A, O>;

type AutoOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaAutoArgs>,
) => CacheResultPromise<T, A, O>;

type CacheRequiredArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs>,
) => CacheResultPromise<T, A, O>;

type CacheOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs>,
) => CacheResultPromise<T, A, O>;

type InvalidateRequiredArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaInvalidateArgs>,
) => InvalidateResultPromise<T, A, O>;

type InvalidateOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaInvalidateArgs>,
) => InvalidateResultPromise<T, A, O>;

type OperationsConfig<
  RequiredArg extends Operation[],
  OptionalArg extends Operation[],
> = {
  requiredArg: RequiredArg;
  optionalArg: OptionalArg;
};

type ModelExtension<
  Config extends OperationsConfig<Operation[], Operation[]>,
  M extends 'auto' | 'cache' | 'invalidate',
> = {
  [RO in Config['requiredArg'][number]]: M extends 'auto'
    ? AutoRequiredArgsFunction<RO>
    : M extends 'cache'
      ? CacheRequiredArgsFunction<RO>
      : InvalidateRequiredArgsFunction<RO>;
} & {
  [OO in Config['optionalArg'][number]]: M extends 'auto'
    ? AutoOptionalArgsFunction<OO>
    : M extends 'cache'
      ? CacheOptionalArgsFunction<OO>
      : InvalidateOptionalArgsFunction<OO>;
};

type InternalAutoConfig = {
  requiredArg: (typeof AUTO_REQUIRED_ARG_OPERATIONS)[number][];
  optionalArg: (typeof AUTO_OPTIONAL_ARG_OPERATIONS)[number][];
};

type InternalCacheConfig = {
  requiredArg: (typeof CACHE_REQUIRED_ARG_OPERATIONS)[number][];
  optionalArg: (typeof CACHE_OPTIONAL_ARG_OPERATIONS)[number][];
};

type InternalInvalidateConfig = {
  requiredArg: (typeof INVALIDATE_REQUIRED_ARG_OPERATIONS)[number][];
  optionalArg: (typeof INVALIDATE_OPTIONAL_ARG_OPERATIONS)[number][];
};

export type ExtendedModel = ModelExtension<InternalAutoConfig, 'auto'> &
  ModelExtension<InternalCacheConfig, 'cache'> &
  ModelExtension<InternalInvalidateConfig, 'invalidate'>;

export type CacheType = 'JSON' | 'STRING';

export type CacheKey = {
  /**
   * Cache key delimiter
   * Default value: ':'
   */
  delimiter?: string;

  /**
   * Use CacheCase to set how the generated INBUILT type keys are formatted
   * Formatting strips non alpha-numeric characters
   * Default value: CacheCase.SNAKE_CASE
   */
  case?: CacheCase;

  /**
   * AutoCache key prefix
   * Default value: 'prisma'
   */
  prefix?: string;
};

interface LoggerInput {
  msg: string;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  [key: string]: any;
}
interface Logger {
  debug: (input: LoggerInput) => void;
  warn: (input: LoggerInput) => void;
  error: (input: LoggerInput) => void;
}

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
   * Custom transfomrer for serializing and deserializing data
   */
  transformer?: {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    serialize: (data: any) => any;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    deserialize: (data: any) => any;
  };
  logger?: Logger;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  onError?: (error: any) => void;
  onHit?: (key: string) => void;
  onMiss?: (key: string) => void;

  /** Enable caching by default for all read operations. Default: true */
  defaultCache?: boolean;
  /** Enable automatic cache invalidation on mutations. Default: true */
  autoInvalidate?: boolean;
};

export interface ModelConfig {
  /**
   * Model
   */
  model: string;

  /**
   * Excluded cache operations
   */
  excludedOperations?: AutoOperations[];

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
      excludedOperations?: AutoOperations[];

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
   * Cache provider instance.
   * Use 'iovalkey' or 'ioredis' with their respective options,
   * or provide a custom instance implementing the CacheProvider interface.
   */
  provider: CacheProvider;
}

export type DeletePatterns = {
  /**
   * Cache Provider instance
   */
  provider: CacheProvider;

  /**
   * Patterns for key deletion
   */
  patterns: string[];
};

export type ActionParams = {
  /**
   * Model query options
   */
  options: ModelQueryOptionsCbArgs;

  /**
   * Cache Provider instance
   */
  provider: CacheProvider;

  /**
   * Cache config
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
  provider: CacheProvider;
  args: JsArgs;
  query: (args: JsArgs) => Promise<unknown>;
};

export type CacheContext = {
  isCached: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: <Any Result>
  result: any;
  stale: number;
  timestamp: number;
  ttl: number;
  key: string;
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
