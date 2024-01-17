"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCacheKey = void 0;
const lodash_1 = require("lodash");
const getCacheKey = (params) => params
    .map(obj => Object.entries(obj).map(([key, value]) => `${(0, lodash_1.camelCase)(key)}:${(0, lodash_1.camelCase)(value)}`))
    .join(':');
exports.getCacheKey = getCacheKey;
//# sourceMappingURL=getCacheKey.js.map