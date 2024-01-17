"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCacheKeyPattern = void 0;
const lodash_1 = require("lodash");
const getCacheKeyPattern = (params) => params
    .map(obj => Object.entries(obj).map(([key, value]) => key.toLocaleLowerCase() === 'glob'
    ? value
    : `${(0, lodash_1.camelCase)(key)}:${(0, lodash_1.camelCase)(value)}`))
    .join(':');
exports.getCacheKeyPattern = getCacheKeyPattern;
//# sourceMappingURL=getCacheKeyPattern.js.map