import {hash} from 'object-code';
import type {
  CacheAutoKeyParams,
  CacheKeyParams,
  CacheKeyPatternParams,
} from './types';

const globCheckRegex = /[*?]/;

const globCheck = (s: string) => globCheckRegex.test(s);

export const getKeyGen =
  (delimiter = ':', caseTransformer = snakeCase, prefix = 'prisma') =>
  ({params, model, operation: op}: CacheKeyParams) =>
    [...(model ? [{[prefix]: model}] : []), ...(op ? [{op}] : []), ...params]
      .map(obj =>
        Object.entries(obj)
          .map(
            ([key, value]) =>
              `${caseTransformer(key)}${delimiter}${caseTransformer(value)}`,
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
  (delimiter = ':', caseTransformer = snakeCase, prefix = 'prisma') =>
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

            const formattedKey = globCheck(key) ? key : caseTransformer(key);

            const formattedValue = globCheck(value)
              ? value
              : caseTransformer(value);

            return `${formattedKey}${delimiter}${formattedValue}`;
          })
          .join(delimiter),
      )
      .join(delimiter);

const snakeCase = (str: string): string =>
  str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/[^\w_]/g, '')
    .toLowerCase();
