import {expect, test} from 'bun:test';
import {ValidationError} from '../../src';
import {createPrismaWithInvalidCacheType} from '../client';

test('Invalid Cache Type: should throw ValidationError at initialization', () => {
  expect(() => createPrismaWithInvalidCacheType()).toThrow(ValidationError);
});

test('Invalid Cache Type: should have correct error message', () => {
  expect(() => createPrismaWithInvalidCacheType()).toThrow(
    'type must be "JSON" or "STRING"',
  );
});
