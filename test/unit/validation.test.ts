import {describe, expect, test} from 'bun:test';
import {ValidationError} from '../../src';
import {validateCacheOptions, validateConfig} from '../../src/validation';

describe('validateConfig', () => {
  test('should throw ValidationError when ttl and stale are both zero', () => {
    expect(() =>
      validateConfig({ttl: 0, stale: 0, type: 'JSON', auto: true}),
    ).toThrow(ValidationError);
  });

  test('should accept ttl zero with a positive stale window', () => {
    expect(() =>
      validateConfig({ttl: 0, stale: 30, type: 'JSON', auto: true}),
    ).not.toThrow();
  });

  test('should pass with valid configuration', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: true,
      }),
    ).not.toThrow();
  });

  test('should throw ValidationError for negative ttl', () => {
    expect(() =>
      validateConfig({
        ttl: -1,
        stale: 30,
        type: 'JSON',
        auto: true,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateConfig({
        ttl: -1,
        stale: 30,
        type: 'JSON',
        auto: true,
      }),
    ).toThrow('ttl must be a non-negative number');
  });

  test('should throw ValidationError for negative stale', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: -1,
        type: 'JSON',
        auto: true,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: -1,
        type: 'JSON',
        auto: true,
      }),
    ).toThrow('stale must be a non-negative number');
  });

  test('should throw ValidationError for invalid cache type', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        // @ts-expect-error: Testing invalid type
        type: 'INVALID',
        auto: true,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        // @ts-expect-error: Testing invalid type
        type: 'INVALID',
        auto: true,
      }),
    ).toThrow('type must be "JSON" or "STRING"');
  });

  test('should throw ValidationError for chunkSize less than 1', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: true,
        chunkSize: 0,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: true,
        chunkSize: 0,
      }),
    ).toThrow('chunkSize must be at least 1');
  });

  test('should throw ValidationError for maxConcurrentBatches less than 1', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: true,
        maxConcurrentBatches: 0,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: true,
        maxConcurrentBatches: 0,
      }),
    ).toThrow('maxConcurrentBatches must be at least 1');
  });

  test('should throw ValidationError for negative auto.ttl', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: {
          ttl: -1,
        },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: {
          ttl: -1,
        },
      }),
    ).toThrow('auto.ttl must be a non-negative number');
  });

  test('should throw ValidationError for negative auto.stale', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: {
          stale: -1,
        },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: {
          stale: -1,
        },
      }),
    ).toThrow('auto.stale must be a non-negative number');
  });

  test('should throw ValidationError for negative model-specific ttl', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: {
          models: [{model: 'User', ttl: -1}],
        },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: {
          models: [{model: 'User', ttl: -1}],
        },
      }),
    ).toThrow('auto.models[User].ttl must be a non-negative number');
  });

  test('should throw ValidationError for negative model-specific stale', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: {
          models: [{model: 'User', stale: -1}],
        },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: {
          models: [{model: 'User', stale: -1}],
        },
      }),
    ).toThrow('auto.models[User].stale must be a non-negative number');
  });

  test('should allow zero for either ttl or stale when the other is positive', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 0,
        type: 'JSON',
        auto: true,
      }),
    ).not.toThrow();
  });

  test('should allow STRING cache type', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'STRING',
        auto: true,
      }),
    ).not.toThrow();
  });
});

describe('validateCacheOptions', () => {
  test('should throw ValidationError when ttl and stale are both zero', () => {
    expect(() => validateCacheOptions({key: 'k', ttl: 0, stale: 0})).toThrow(
      ValidationError,
    );
  });

  test('should pass with valid cache options', () => {
    expect(() =>
      validateCacheOptions({
        key: 'user:1',
        ttl: 60,
      }),
    ).not.toThrow();
  });

  test('should throw ValidationError for empty key', () => {
    expect(() =>
      validateCacheOptions({
        key: '',
        ttl: 60,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCacheOptions({
        key: '',
        ttl: 60,
      }),
    ).toThrow('Cache key cannot be empty');
  });

  test('should throw ValidationError for whitespace-only key', () => {
    expect(() =>
      validateCacheOptions({
        key: '   ',
        ttl: 60,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCacheOptions({
        key: '   ',
        ttl: 60,
      }),
    ).toThrow('Cache key cannot be empty');
  });

  test('should throw ValidationError for negative ttl', () => {
    expect(() =>
      validateCacheOptions({
        key: 'user:1',
        ttl: -1,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCacheOptions({
        key: 'user:1',
        ttl: -1,
      }),
    ).toThrow('ttl must be a non-negative number');
  });

  test('should throw ValidationError for stale without ttl', () => {
    expect(() =>
      validateCacheOptions({
        key: 'user:1',
        stale: 30,
      } as never),
    ).toThrow(ValidationError);
    expect(() =>
      validateCacheOptions({
        key: 'user:1',
        stale: 30,
      } as never),
    ).toThrow('stale cannot be set without ttl');
  });

  test('should throw ValidationError for negative stale', () => {
    expect(() =>
      validateCacheOptions({
        key: 'user:1',
        ttl: 60,
        stale: -1,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      validateCacheOptions({
        key: 'user:1',
        ttl: 60,
        stale: -1,
      }),
    ).toThrow('stale must be a non-negative number');
  });

  test('should allow stale with ttl', () => {
    expect(() =>
      validateCacheOptions({
        key: 'user:1',
        ttl: 60,
        stale: 30,
      }),
    ).not.toThrow();
  });

  test('should allow key without ttl', () => {
    expect(() =>
      validateCacheOptions({
        key: 'user:1',
      }),
    ).not.toThrow();
  });
});
