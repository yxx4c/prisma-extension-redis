import {camelCase, kebabCase, snakeCase, startCase} from 'lodash-es';

import type {
  CacheAutoKeyParams,
  CacheKeyParams,
  CacheKeyPatternParams,
} from './types';
import {hash} from 'object-code';

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

export const getKeyGen =
  (
    delimiter = ':',
    cacheCase: CacheCase = CacheCase.CAMEL_CASE,
    prefix = 'prisma',
  ) =>
  ({params, model, operation: op}: CacheKeyParams) =>
    [...(model ? [{[prefix]: model}] : []), ...(op ? [{op}] : []), ...params]
      .map(obj =>
        Object.entries(obj)
          .map(
            ([key, value]) =>
              `${caseMap[cacheCase](key)}${delimiter}${caseMap[cacheCase](value)}`,
          )
          .join(delimiter),
      )
      .join(delimiter);

export const getAutoKeyGen =
  (getKey: (input: CacheKeyParams) => string) =>
  ({args, model, operation}: CacheAutoKeyParams) =>
    getKey({
      params: [{key: hash({...args, cache: undefined}).toString()}],
      model,
      operation,
    });

export const getKeyPatternGen =
  (
    delimiter = ':',
    cacheCase: CacheCase = CacheCase.CAMEL_CASE,
    prefix = 'prisma',
  ) =>
  ({params, model, operation: op}: CacheKeyPatternParams) =>
    [
      ...(model && prefix ? [{[prefix]: model}] : []),
      ...(op ? [{op}] : []),
      ...params,
    ]
      .map(obj =>
        Object.entries(obj)
          .map(([key, value]) => {
            if (key.toLowerCase() === 'glob') return value;

            const formattedKey = globCheck(key) ? key : caseMap[cacheCase](key);

            const formattedValue = globCheck(value)
              ? value
              : caseMap[cacheCase](value);

            return `${formattedKey}${delimiter}${formattedValue}`;
          })
          .join(delimiter),
      )
      .join(delimiter);
