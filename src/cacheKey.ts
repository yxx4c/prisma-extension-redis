import {camelCase, kebabCase, snakeCase, startCase} from 'lodash-es';

import type {CacheKeyParams, CacheKeyPatternParams} from './types';

const globCheckRegex = /[*?]/;

const globCheck = (s: string) => globCheckRegex.test(s);

export enum CacheCase {
  CAMEL_CASE = 'camelCase',
  KEBAB_CASE = 'kebabCase',
  SNAKE_CASE = 'snakeCase',
  START_CASE = 'startCase',
}

export const caseMap = {
  [CacheCase.CAMEL_CASE]: camelCase,
  [CacheCase.KEBAB_CASE]: kebabCase,
  [CacheCase.SNAKE_CASE]: snakeCase,
  [CacheCase.START_CASE]: startCase,
};

export const getCacheKey = (
  params: CacheKeyParams,
  delimiter = ':',
  cacheCase: CacheCase = CacheCase.CAMEL_CASE,
) =>
  params
    .map(obj =>
      Object.entries(obj)
        .map(
          ([key, value]) =>
            `${caseMap[cacheCase](key)}:${caseMap[cacheCase](value)}`,
        )
        .join(delimiter),
    )
    .join(delimiter);

export const getCacheKeyPattern = (
  params: CacheKeyPatternParams,
  delimiter = ':',
  cacheCase: CacheCase = CacheCase.CAMEL_CASE,
) =>
  params
    .map(obj =>
      Object.entries(obj)
        .map(([key, value]) => {
          if (key.toLowerCase() === 'glob') return value;

          const formattedKey = globCheck(key) ? key : caseMap[cacheCase](key);

          const formattedValue = globCheck(value)
            ? value
            : caseMap[cacheCase](value);

          return `${formattedKey}:${formattedValue}`;
        })
        .join(delimiter),
    )
    .join(delimiter);
