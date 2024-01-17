"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNCACHE_OPERATIONS = exports.UNCACHE_OPTIONAL_ARG_OPERATIONS = exports.UNCACHE_REQUIRED_ARG_OPERATIONS = exports.CACHE_OPERATIONS = exports.CACHE_OPTIONAL_ARG_OPERATIONS = exports.CACHE_REQUIRED_ARG_OPERATIONS = exports.AUTO_OPERATIONS = exports.AUTO_OPTIONAL_ARG_OPERATIONS = exports.AUTO_REQUIRED_ARG_OPERATIONS = exports.DISABLED_OPERATIONS = exports.ALL_OPERATIONS = void 0;
exports.ALL_OPERATIONS = [
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
];
exports.DISABLED_OPERATIONS = [
    '$executeRaw',
    '$executeRawUnsafe',
    '$queryRaw',
    '$queryRawUnsafe',
    '$runCommandRaw',
    'aggregate',
    'aggregateRaw',
    'findRaw',
];
exports.AUTO_REQUIRED_ARG_OPERATIONS = [
    'findUnique',
    'findUniqueOrThrow',
    'groupBy',
];
exports.AUTO_OPTIONAL_ARG_OPERATIONS = [
    'count',
    'findFirst',
    'findFirstOrThrow',
    'findMany',
];
exports.AUTO_OPERATIONS = [
    ...exports.AUTO_REQUIRED_ARG_OPERATIONS,
    ...exports.AUTO_OPTIONAL_ARG_OPERATIONS,
];
exports.CACHE_REQUIRED_ARG_OPERATIONS = [
    'findUnique',
    'findUniqueOrThrow',
    'groupBy',
];
exports.CACHE_OPTIONAL_ARG_OPERATIONS = [
    'count',
    'findFirst',
    'findFirstOrThrow',
    'findMany',
];
exports.CACHE_OPERATIONS = [
    ...exports.CACHE_REQUIRED_ARG_OPERATIONS,
    ...exports.CACHE_OPTIONAL_ARG_OPERATIONS,
];
exports.UNCACHE_REQUIRED_ARG_OPERATIONS = [
    'create',
    'delete',
    'update',
    'upsert',
];
exports.UNCACHE_OPTIONAL_ARG_OPERATIONS = [
    'createMany',
    'deleteMany',
    'updateMany',
];
exports.UNCACHE_OPERATIONS = [
    ...exports.UNCACHE_REQUIRED_ARG_OPERATIONS,
    ...exports.UNCACHE_OPTIONAL_ARG_OPERATIONS,
];
//# sourceMappingURL=types.js.map