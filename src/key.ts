import { kebabCase } from 'lodash-es';
import {Prisma} from '@prisma/client/extension';
import type {
  Operation as PrismaOperation,
} from '@prisma/client/runtime/library';

import {
  isPrimitive,
  type CacheKeyPatternParams,
} from './types';
import {hash} from 'object-code';

const GLOB_REGEX = /[*?]/;

/**
 * Extracts the ID part from a where clause for key generation.
 * Handles simple IDs and compound unique keys.
 */
const extractId = (
  where: Prisma.Args<any, any>['where'],
  delimiter = '_',
): string | null => {
  if (!where || typeof where !== 'object') {
    return null;
  }

  const keys = Object.keys(where);

  if (keys.length === 1) {
    const key = keys[0];
    const value = where[key];

    if (typeof value === 'object' && value !== null) {
      // Compound unique index accessed directly, e.g., { user_email_key: { userId: 1, email: 'a@b' } }
      const inner = Object.keys(value).sort();
      return inner.map(key => value[key]).join(delimiter);
    } else if (isPrimitive(value)) {
      // Simple ID, e.g., { id: 123 } or { email: 'a@b' }
      return String(value);
    } else {
      // Unsupported type or structure for simple ID
      return null;
    }
  } else if (keys.length > 1) {
    // Compound key defined at top level, e.g., { userId: 1, email: 'a@b' }
    // This usually happens with @@unique, less common for findUnique directly
    // We'll sort keys for consistency
    const sorted = keys.sort();
    return sorted.map(key => where[key]).join(delimiter);
  } else {
    // Empty where clause
    return null;
  }
};

/**
 * Hashes the relevant parts of the query arguments, excluding cache/invalidate args and ID fields.
 */
const hashQueryArgs = (args: Prisma.Args<any, any>, idFields: string[]): string => {
  const argsToHash = structuredClone(args);
  delete argsToHash.cache;
  delete argsToHash.invalidate;

  if (argsToHash.where && typeof argsToHash.where === 'object') {
    for (const field of idFields) {
      // Remove ID fields from the where clause before hashing
      // This handles both simple { id: 1 } and compound { user_email_key: { ... } }
      delete argsToHash.where[field];
    }
    // If where becomes empty after removing ID fields, remove it entirely
    if (Object.keys(argsToHash.where).length === 0) {
      delete argsToHash.where;
    }
  }

  return hash(argsToHash).toString();
};

const hashSelectInclude = (select: any, include: any): string | null => {
  const toHash: { select?: any; include?: any } = {};
  if (select && Object.keys(select).length > 0) {
    toHash.select = select;
  }
  if (include && Object.keys(include).length > 0) {
    toHash.include = include;
  }
  if (Object.keys(toHash).length > 0) {
    return hash(toHash).toString();
  }
  return null;
};

export const getKey = <T, O extends PrismaOperation>({
  model,
  operation,
  args,
  prefix = 'prisma',
  delimiter = ':',
}: {
  model: string;
  operation: O;
  args: Prisma.Args<T, O>;
  prefix?: string;
  delimiter?: string;
}): string => {
  // Handle operations targeting a single identifiable record for specific key format
  if (
    (operation === 'findUnique' ||
      operation === 'findFirst' ||
      operation === 'findUniqueOrThrow' ||
      operation === 'findFirstOrThrow') &&
    args.where
  ) {
    const idPart = extractId(args.where); // Uses default '_' delimiter for internal compound ID joining
    if (idPart !== null) {
      const keySegments = [prefix, model, idPart].filter(
        part => part !== undefined && part !== null && part !== '',
      );

      const selectIncludeHash = hashSelectInclude(args.select, args.include);
      if (selectIncludeHash) {
        keySegments.push(selectIncludeHash);
      }
      // If no select/include, the key is prefix:model:id
      return keySegments.join(delimiter);
    }
  }

  // Fallback for other operations (e.g., findMany, count, aggregate)
  // or if ID extraction failed for single ops.
  const commonParts = [prefix, model].filter(
    part => part !== undefined && part !== null && part !== '',
  );
  // hashQueryArgs hashes all args except cache/invalidate and specified idFields (here, none for fallback).
  const fallbackHash = hashQueryArgs(args, []);
  return [...commonParts, fallbackHash].join(delimiter);
};

export const getPatternGenerator = (
  delimiter = ':',
  prefix = 'prisma',
) =>
  ({params, model, operation: op}: CacheKeyPatternParams) => {
    // Keep the original pattern logic for manual invalidation
    const prefixPart = model && prefix ? {[prefix]: model} : null;
    const opPart = op ? {op} : null;
    const allParams = [prefixPart, opPart, ...params].filter(
      // Filter null/undefined before mapping
      (p): p is Record<string, string> | {op: PrismaOperation} => p !== null,
    );

    return allParams
      .map(obj =>
        Object.entries(obj)
          .map(([key, value]) => {
            if (key.toLowerCase() === 'glob') return value;

            // Apply case conversion cautiously, might interfere with hashes or IDs
            const formattedKey = GLOB_REGEX.test(key) ? key : kebabCase(key);
            const formattedValue = GLOB_REGEX.test(value)
              ? value
              : kebabCase(value);

            return `${formattedKey}${delimiter}${formattedValue}`;
          })
          .join(delimiter),
      )
      .join(delimiter);
  };

export { extractId };
