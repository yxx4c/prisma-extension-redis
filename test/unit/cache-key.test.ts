import {describe, expect, test} from 'bun:test';
import {getKeyGen, getKeyPatternGen} from '../../src';
import {getAutoKeyGen} from '../../src/cacheKey';

describe('Cache Key Generation', () => {
  describe('getKeyGen', () => {
    test('should generate key with default settings', () => {
      const getKey = getKeyGen();
      const key = getKey({
        model: 'User',
        operation: 'findUnique',
        params: [{id: '1'}],
      });

      expect(key).toBe('prisma:user:op:find_unique:id:1');
    });

    test('should use custom delimiter', () => {
      const getKey = getKeyGen('/');
      const key = getKey({
        model: 'User',
        operation: 'findUnique',
        params: [{id: '1'}],
      });

      expect(key).toBe('prisma/user/op/find_unique/id/1');
    });

    test('should use custom prefix', () => {
      const getKey = getKeyGen(':', undefined, 'myapp');
      const key = getKey({
        model: 'User',
        operation: 'findUnique',
        params: [{id: '1'}],
      });

      expect(key).toBe('myapp:user:op:find_unique:id:1');
    });

    test('should use custom case transformer', () => {
      const getKey = getKeyGen(':', s => s.toUpperCase(), 'prisma');
      const key = getKey({
        model: 'User',
        operation: 'findUnique',
        params: [{id: '1'}],
      });

      expect(key).toBe('PRISMA:USER:OP:FINDUNIQUE:ID:1');
    });

    test('should handle multiple params', () => {
      const getKey = getKeyGen();
      const key = getKey({
        model: 'User',
        operation: 'findMany',
        params: [{where: 'active'}, {orderBy: 'name'}],
      });

      expect(key).toBe('prisma:user:op:find_many:where:active:order_by:name');
    });

    test('should handle empty params', () => {
      const getKey = getKeyGen();
      const key = getKey({
        model: 'User',
        operation: 'findMany',
        params: [],
      });

      expect(key).toBe('prisma:user:op:find_many');
    });
  });

  describe('getAutoKeyGen - Key Stability', () => {
    test('should produce same key regardless of object property order', () => {
      const getKey = getKeyGen();
      const getAutoKey = getAutoKeyGen(getKey);

      // Same args with different property order
      const key1 = getAutoKey({
        model: 'User',
        operation: 'findUnique',
        args: {where: {id: 1}, select: {name: true}},
      });

      const key2 = getAutoKey({
        model: 'User',
        operation: 'findUnique',
        args: {select: {name: true}, where: {id: 1}},
      });

      expect(key1).toBe(key2);
    });

    test('should produce same key for nested objects with different order', () => {
      const getKey = getKeyGen();
      const getAutoKey = getAutoKeyGen(getKey);

      const key1 = getAutoKey({
        model: 'User',
        operation: 'findMany',
        args: {
          where: {AND: [{active: true}, {role: 'admin'}]},
          orderBy: {name: 'asc'},
        },
      });

      const key2 = getAutoKey({
        model: 'User',
        operation: 'findMany',
        args: {
          orderBy: {name: 'asc'},
          where: {AND: [{active: true}, {role: 'admin'}]},
        },
      });

      expect(key1).toBe(key2);
    });

    test('should produce different keys for different args', () => {
      const getKey = getKeyGen();
      const getAutoKey = getAutoKeyGen(getKey);

      const key1 = getAutoKey({
        model: 'User',
        operation: 'findUnique',
        args: {where: {id: 1}},
      });

      const key2 = getAutoKey({
        model: 'User',
        operation: 'findUnique',
        args: {where: {id: 2}},
      });

      expect(key1).not.toBe(key2);
    });

    test('should produce different keys for different models', () => {
      const getKey = getKeyGen();
      const getAutoKey = getAutoKeyGen(getKey);

      const key1 = getAutoKey({
        model: 'User',
        operation: 'findUnique',
        args: {where: {id: 1}},
      });

      const key2 = getAutoKey({
        model: 'Post',
        operation: 'findUnique',
        args: {where: {id: 1}},
      });

      expect(key1).not.toBe(key2);
    });

    test('should produce different keys for different operations', () => {
      const getKey = getKeyGen();
      const getAutoKey = getAutoKeyGen(getKey);

      const key1 = getAutoKey({
        model: 'User',
        operation: 'findUnique',
        args: {where: {id: 1}},
      });

      const key2 = getAutoKey({
        model: 'User',
        operation: 'findFirst',
        args: {where: {id: 1}},
      });

      expect(key1).not.toBe(key2);
    });

    test('should exclude cache property from key generation', () => {
      const getKey = getKeyGen();
      const getAutoKey = getAutoKeyGen(getKey);

      const key1 = getAutoKey({
        model: 'User',
        operation: 'findUnique',
        args: {where: {id: 1}},
      });

      const key2 = getAutoKey({
        model: 'User',
        operation: 'findUnique',
        args: {where: {id: 1}, cache: {key: 'custom', ttl: 60}},
      });

      expect(key1).toBe(key2);
    });

    test('should handle arrays correctly (preserve order)', () => {
      const getKey = getKeyGen();
      const getAutoKey = getAutoKeyGen(getKey);

      const key1 = getAutoKey({
        model: 'User',
        operation: 'findMany',
        args: {where: {id: {in: [1, 2, 3]}}},
      });

      const key2 = getAutoKey({
        model: 'User',
        operation: 'findMany',
        args: {where: {id: {in: [3, 2, 1]}}},
      });

      // Arrays should preserve order, so keys should be different
      expect(key1).not.toBe(key2);
    });

    test('should handle null values', () => {
      const getKey = getKeyGen();
      const getAutoKey = getAutoKeyGen(getKey);

      const key = getAutoKey({
        model: 'User',
        operation: 'findFirst',
        args: {where: {deletedAt: null}},
      });

      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
    });

    test('should handle undefined values', () => {
      const getKey = getKeyGen();
      const getAutoKey = getAutoKeyGen(getKey);

      const key = getAutoKey({
        model: 'User',
        operation: 'findMany',
        args: {where: undefined},
      });

      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
    });
  });

  describe('getKeyPatternGen', () => {
    test('should generate pattern with wildcard', () => {
      const getKeyPattern = getKeyPatternGen();
      const pattern = getKeyPattern({
        model: 'User',
        params: [{glob: '*'}],
      });

      expect(pattern).toBe('prisma:user:*');
    });

    test('should preserve glob characters in pattern', () => {
      const getKeyPattern = getKeyPatternGen();
      const pattern = getKeyPattern({
        model: 'User',
        operation: 'findUnique',
        params: [{glob: '*'}],
      });

      expect(pattern).toContain('*');
    });

    test('should handle question mark wildcard', () => {
      const getKeyPattern = getKeyPatternGen();
      const pattern = getKeyPattern({
        model: 'User',
        params: [{id: '?'}],
      });

      expect(pattern).toContain('?');
    });
  });
});
