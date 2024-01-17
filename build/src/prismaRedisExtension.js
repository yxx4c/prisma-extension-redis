"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaRedisExtension = void 0;
const extension_1 = require("@prisma/client/extension");
const async_cache_dedupe_1 = require("async-cache-dedupe");
const utils_1 = require("./utils");
const PrismaRedisExtension = (config) => {
    const { auto, cache: _cache, redis } = config;
    const cache = _cache instanceof async_cache_dedupe_1.Cache ? _cache : (0, async_cache_dedupe_1.createCache)(_cache);
    return extension_1.Prisma.defineExtension({
        name: 'prisma-redis-cache',
        client: {
            redis,
            cache,
        },
        model: {
            $allModels: {},
        },
        query: {
            $allModels: {
                async $allOperations(options) {
                    var _a, _b, _c;
                    const { args, query } = options;
                    if ((0, utils_1.isAutoCacheEnabled)({ auto, options })) {
                        let stale;
                        let ttl;
                        if (typeof auto === 'object') {
                            const model = (_a = auto.models) === null || _a === void 0 ? void 0 : _a.find(m => m.model === options.model);
                            ttl = (_b = model === null || model === void 0 ? void 0 : model.ttl) !== null && _b !== void 0 ? _b : auto.ttl;
                            stale = (_c = model === null || model === void 0 ? void 0 : model.stale) !== null && _c !== void 0 ? _c : auto.stale;
                        }
                        return (0, utils_1.autoCacheAction)({ cache, redis, options, stale, ttl });
                    }
                    if ((0, utils_1.isCustomCacheEnabled)({ options }))
                        return (0, utils_1.customCacheAction)({ cache, redis, options });
                    if ((0, utils_1.isCustomUncacheEnabled)({ options }))
                        return (0, utils_1.customUncacheAction)({ cache, redis, options });
                    return query(args);
                },
            },
        },
    });
};
exports.PrismaRedisExtension = PrismaRedisExtension;
//# sourceMappingURL=prismaRedisExtension.js.map