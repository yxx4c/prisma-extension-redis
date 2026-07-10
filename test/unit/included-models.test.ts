import {describe, expect, test} from 'bun:test';
import type {AutoCacheConfig} from '../../src';
import {isAutoCacheEnabled} from '../../src/cacheUncache';
import {ValidationError, validateConfig} from '../../src/validation';

const check = (
  auto: AutoCacheConfig,
  model: string,
  operation = 'findUnique',
  args: Record<string, unknown> = {},
) =>
  isAutoCacheEnabled({
    auto,
    options: {args, model, operation} as never,
  });

describe('includedModels auto-cache selection', () => {
  test('caches only whitelisted models when includedModels is set', () => {
    const auto: AutoCacheConfig = {includedModels: ['User']};

    expect(check(auto, 'User')).toBe(true);
    expect(check(auto, 'Post')).toBe(false);
    expect(check(auto, 'Comment')).toBe(false);
  });

  test('caches all models when includedModels is absent', () => {
    expect(check({}, 'User')).toBe(true);
    expect(check({}, 'Post')).toBe(true);
  });

  test('an empty whitelist disables auto-caching for every model', () => {
    const auto: AutoCacheConfig = {includedModels: []};

    expect(check(auto, 'User')).toBe(false);
  });

  test('per-query cache flags override the whitelist in both directions', () => {
    const auto: AutoCacheConfig = {includedModels: ['User']};

    expect(check(auto, 'Post', 'findUnique', {cache: true})).toBe(true);
    expect(check(auto, 'User', 'findUnique', {cache: false})).toBe(false);
  });

  test('excludedOperations still applies to whitelisted models', () => {
    const auto: AutoCacheConfig = {
      includedModels: ['User'],
      excludedOperations: ['findUnique'],
    };

    expect(check(auto, 'User', 'findUnique')).toBe(false);
    expect(check(auto, 'User', 'findMany')).toBe(true);
  });

  test('model-specific excludedOperations still applies to whitelisted models', () => {
    const auto: AutoCacheConfig = {
      includedModels: ['User'],
      models: [{model: 'User', excludedOperations: ['findMany']}],
    };

    expect(check(auto, 'User', 'findMany')).toBe(false);
    expect(check(auto, 'User', 'findUnique')).toBe(true);
  });
});

describe('includedModels validation', () => {
  test('rejects includedModels combined with excludedModels', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: {includedModels: ['User'], excludedModels: ['Post']},
      }),
    ).toThrow(ValidationError);
  });

  test('rejects models[] entries missing from the whitelist', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: {includedModels: ['User'], models: [{model: 'Users', ttl: 10}]},
      }),
    ).toThrow(ValidationError);
  });

  test('accepts a whitelist with matching model customizations', () => {
    expect(() =>
      validateConfig({
        ttl: 60,
        stale: 30,
        type: 'JSON',
        auto: {includedModels: ['User'], models: [{model: 'User', ttl: 10}]},
      }),
    ).not.toThrow();
  });
});
