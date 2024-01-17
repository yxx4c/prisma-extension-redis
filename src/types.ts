import {
  JsArgs,
  ModelQueryOptionsCbArgs,
  Operation,
} from '@prisma/client/runtime/library';
import {Prisma} from '@prisma/client/extension';
import type {Redis} from 'ioredis';
import {Cache, createCache} from 'async-cache-dedupe';

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

export interface CacheOptions {
  /**
   * Key for caching
   */
  key: string;

  /**
   * Custom time-to-live (ttl) value.
   * If undefined, key stays in cache till uncached
   */
  ttl?: number;
}

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
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaAutoArgs>
) => Promise<Prisma.Result<T, A, O>>;

type AutoOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaAutoArgs>
) => Promise<Prisma.Result<T, A, O>>;

type CacheRequiredArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs>
) => Promise<Prisma.Result<T, A, O>>;

type CacheOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaCacheArgs>
) => Promise<Prisma.Result<T, A, O>>;

type UncacheRequiredArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args: Prisma.Exact<A, Prisma.Args<T, O> & PrismaUncacheArgs>
) => Promise<Prisma.Result<T, A, O>>;

type UncacheOptionalArgsFunction<O extends Operation> = <T, A>(
  this: T,
  args?: Prisma.Exact<A, Prisma.Args<T, O> & PrismaUncacheArgs>
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

export type CacheConfig = Parameters<typeof createCache>[0];

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
  stale?: number | ((result: unknown) => number);

  /**
   * Model specific time-to-live (ttl) value
   */
  ttl?: number | ((result: unknown) => number);
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
      stale?: number | ((result: unknown) => number);

      /**
       * Auto time-to-live (ttl) value
       */
      ttl?: number | ((result: unknown) => number);
    }
  | boolean;

export interface PrismaRedisExtensionConfig {
  /**
   * Auto cache config
   */
  auto?: AutoCacheConfig;

  /**
   * async-cache-dedupe config
   */
  cache: CacheConfig;

  /**
   * Redis client
   */
  redis: Redis;
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
   * async-cache-dedupe client
   */
  cache: Cache;

  /**
   * Model query options
   */
  options: ModelQueryOptionsCbArgs;

  /**
   * Redis client
   */
  redis: Redis;

  /**
   * Auto stale time after ttl
   */
  stale?: number | ((result: unknown) => number);

  /**
   * Auto time-to-live (ttl) value
   */
  ttl?: number | ((result: unknown) => number);
};

export type ActionCheckParams = {
  /**
   * Auto cache config
   */
  auto?: boolean | AutoCacheConfig;

  /**
   * Model query options
   */
  options: ModelQueryOptionsCbArgs;
};
