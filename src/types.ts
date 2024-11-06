import type {Prisma} from '@prisma/client/extension';
import type {
  JsArgs,
  ModelQueryOptionsCbArgs,
  Operation,
} from '@prisma/client/runtime/library';
import type {Redis, RedisOptions} from 'iovalkey';

import type {CacheCase} from './cacheKey';

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

type AutoRequiredArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaAutoArgs>,
) => Promise<Prisma.Result<T, A, O>>;

type AutoOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaAutoArgs>,
) => Promise<Prisma.Result<T, A, O>>;

type CacheRequiredArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs>,
) => Promise<Prisma.Result<T, A, O>>;

type CacheOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs>,
) => Promise<Prisma.Result<T, A, O>>;

type UncacheRequiredArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaUncacheArgs>,
) => Promise<Prisma.Result<T, A, O>>;

type UncacheOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaUncacheArgs>,
) => Promise<Prisma.Result<T, A, O>>;

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

export interface CacheDefinitionOptions {
  a: JsArgs;
  q: (args: JsArgs) => Promise<unknown>;
}

export type CacheType = 'JSON' | 'STRING';
export type CacheKeyType = 'INBUILT' | 'CUSTOM';

export type CacheKey = {
  /**
   * Cache key delimiter (default value: ':')
   */
  delimiter: string;

  /**
   * Use CacheCase to set how the generated INBUILT type keys are formatted (default value: CacheCase.CAMEL_CASE)
   */
  case: CacheCase;

  /**
   * AutoCache key prefix (default value: 'prisma')
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
  type: CacheType;
  cacheKey: CacheKey;
  /**
   * Default time-to-live (ttl) value
   */
  ttl: number;
  /**
   * Default stale time after ttl
   */
  stale: number;
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
