"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCustomUncacheEnabled = exports.isCustomCacheEnabled = exports.isAutoCacheEnabled = exports.customUncacheAction = exports.customCacheAction = exports.autoCacheAction = exports.unlinkPatterns = exports.filterOperations = void 0;
const types_1 = require("./types");
const filterOperations = (...ops) => (excluded) => excluded ? ops.filter(op => !excluded.includes(op)) : ops;
exports.filterOperations = filterOperations;
const unlinkPatterns = ({ patterns, redis }) => patterns.map(pattern => new Promise(resolve => {
    const stream = redis.scanStream({
        match: pattern,
    });
    stream.on('data', (keys) => {
        if (keys.length) {
            const pipeline = redis.pipeline();
            pipeline.unlink(keys);
            pipeline.exec();
        }
    });
    stream.on('end', () => resolve(true));
}));
exports.unlinkPatterns = unlinkPatterns;
const autoCacheAction = async ({ cache, options: { args: xArgs, model, query }, stale, ttl, }) => {
    const args = {
        ...xArgs,
    };
    delete args['cache'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!cache[model])
        cache.define(model, {
            ttl,
            stale,
        }, ({ a, q }) => q(a));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return cache[model]({ a: args, q: query });
};
exports.autoCacheAction = autoCacheAction;
const customCacheAction = async ({ redis, options: { args: xArgs, query }, }) => {
    const args = {
        ...xArgs,
    };
    delete args['cache'];
    const { key, ttl } = xArgs['cache'];
    const cached = await redis.get(key);
    if (cached)
        if (typeof cached === 'string')
            return JSON.parse(cached);
        else
            return cached;
    const result = await query(args);
    const value = JSON.stringify(result);
    if (ttl && ttl !== Infinity)
        redis.setex(key, ttl, value);
    else
        redis.set(key, value);
    return result;
};
exports.customCacheAction = customCacheAction;
const customUncacheAction = async ({ redis, options: { args: xArgs, query }, }) => {
    const args = {
        ...xArgs,
    };
    delete args['uncache'];
    const { uncacheKeys, hasPattern } = xArgs['uncache'];
    if (hasPattern)
        await Promise.all((0, exports.unlinkPatterns)({ redis, patterns: uncacheKeys }));
    else
        redis.unlink(uncacheKeys);
    return query(args);
};
exports.customUncacheAction = customUncacheAction;
const isAutoCacheEnabled = ({ auto, options: { args: xArgs, model, operation }, }) => {
    var _a, _b, _c, _d;
    if (xArgs['cache'] !== undefined && typeof xArgs['cache'] === 'boolean')
        return xArgs['cache'];
    if (auto)
        if (typeof auto === 'object')
            return ((0, exports.filterOperations)(...types_1.AUTO_OPERATIONS)(auto.excludedOperations).includes(operation) &&
                !((_a = auto.excludedModels) === null || _a === void 0 ? void 0 : _a.includes(model)) &&
                !((_d = (_c = (_b = auto.models) === null || _b === void 0 ? void 0 : _b.find(m => m.model === model)) === null || _c === void 0 ? void 0 : _c.excludedOperations) === null || _d === void 0 ? void 0 : _d.includes(operation)));
        else
            return true;
    return false;
};
exports.isAutoCacheEnabled = isAutoCacheEnabled;
const isCustomCacheEnabled = ({ options: { args: xArgs, operation }, }) => !!xArgs['cache'] &&
    typeof xArgs['cache'] === 'object' &&
    types_1.CACHE_OPERATIONS.includes(operation);
exports.isCustomCacheEnabled = isCustomCacheEnabled;
const isCustomUncacheEnabled = ({ options: { args: xArgs, operation }, }) => !!xArgs['uncache'] &&
    typeof xArgs['uncache'] === 'object' &&
    types_1.UNCACHE_OPERATIONS.includes(operation);
exports.isCustomUncacheEnabled = isCustomUncacheEnabled;
//# sourceMappingURL=utils.js.map