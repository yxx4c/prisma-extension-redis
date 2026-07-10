import {DEFAULT_DELIMITER, DEFAULT_PREFIX} from './constants';
import {stableHash} from './hash';
import type {
  CacheAutoKeyParams,
  CacheKeyParams,
  CacheKeyPatternParams,
} from './types';

const globCheckRegex = /[*?]/;

export const globCheck = (s: string) => globCheckRegex.test(s);

/**
 * Creates a function that generates cache keys from query parameters.
 *
 * Keys are built by joining the prefix, model name, operation, and
 * parameter values with the delimiter. All parts are transformed
 * using the caseTransformer function.
 *
 * @param delimiter - Character(s) to join key parts (default: ':')
 * @param caseTransformer - Function to transform key parts (default: snakeCase)
 * @param prefix - Prefix for all cache keys (default: 'prisma')
 * @returns A function that generates keys from CacheKeyParams
 *
 * @example
 * ```typescript
 * const getKey = getKeyGen(':', snakeCase, 'myapp');
 *
 * const key = getKey({
 *   model: 'User',
 *   operation: 'findUnique',
 *   params: [{ id: '123' }],
 * });
 * // Returns: 'myapp:user:op:find_unique:id:123'
 * ```
 */
export const getKeyGen =
  (
    delimiter = DEFAULT_DELIMITER,
    caseTransformer = snakeCase,
    prefix = DEFAULT_PREFIX,
  ) =>
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

/**
 * Creates a function that generates automatic cache keys from query arguments.
 * Keys are stable regardless of object property ordering.
 *
 * The generated key includes a hash of the query arguments, ensuring
 * that identical queries produce the same cache key.
 *
 * @param getKey - The base key generation function from getKeyGen
 * @returns A function that generates auto-cache keys
 *
 * @example
 * ```typescript
 * const getKey = getKeyGen();
 * const getAutoKey = getAutoKeyGen(getKey);
 *
 * const key = getAutoKey({
 *   model: 'User',
 *   operation: 'findUnique',
 *   args: { where: { id: 1 } },
 * });
 * // Returns: 'prisma:user:op:find_unique:key:abc123'
 * ```
 */
export const getAutoKeyGen =
  (getKey: (input: CacheKeyParams) => string) =>
  ({args, model, operation}: CacheAutoKeyParams) => {
    // stableHash is key-order independent, so no normalization pass needed
    return getKey({
      params: [{key: stableHash({...args, cache: undefined})}],
      model,
      operation,
    });
  };

/**
 * Creates a function that generates cache key patterns for pattern-based invalidation.
 * Supports glob characters (* and ?) for wildcard matching.
 *
 * @param delimiter - Character(s) to join key parts (default: ':')
 * @param caseTransformer - Function to transform key parts (default: snakeCase)
 * @param prefix - Prefix for all cache keys (default: 'prisma')
 * @returns A function that generates key patterns
 *
 * @example
 * ```typescript
 * const getKeyPattern = getKeyPatternGen();
 *
 * // Match all User cache entries
 * const pattern = getKeyPattern({
 *   model: 'User',
 *   params: [{ glob: '*' }],
 * });
 * // Returns: 'prisma:user:*'
 * ```
 */
export const getKeyPatternGen =
  (
    delimiter = DEFAULT_DELIMITER,
    caseTransformer = snakeCase,
    prefix = DEFAULT_PREFIX,
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

            const formattedKey = globCheck(key) ? key : caseTransformer(key);

            const formattedValue = globCheck(value)
              ? value
              : caseTransformer(value);

            return `${formattedKey}${delimiter}${formattedValue}`;
          })
          .join(delimiter),
      )
      .join(delimiter);

export const snakeCase = (str: string): string =>
  str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/[^\w_]/g, '')
    .toLowerCase();
