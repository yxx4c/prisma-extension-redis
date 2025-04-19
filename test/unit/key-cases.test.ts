import {expect, test} from 'bun:test';
import {camelCase, kebabCase, snakeCase, startCase} from '../../src/keyCases';

// Tests for camelCase
test('camelCase: should handle regular space-separated words', () => {
  expect(camelCase('Foo Bar')).toBe('fooBar');
});

test('camelCase: should handle hyphenated words', () => {
  expect(camelCase('--foo-bar--')).toBe('fooBar');
});

test('camelCase: should handle underscore separated words', () => {
  expect(camelCase('__FOO_BAR__')).toBe('fooBar');
});

test('camelCase: should handle empty string', () => {
  expect(camelCase('')).toBe('');
});

test('camelCase: should handle undefined', () => {
  expect(camelCase(undefined)).toBe('');
});

test('camelCase: should handle mixed delimiters', () => {
  expect(camelCase('foo_bar-baz')).toBe('fooBarBaz');
});

// Tests for kebabCase
test('kebabCase: should handle regular space-separated words', () => {
  expect(kebabCase('Foo Bar')).toBe('foo-bar');
});

test('kebabCase: should handle camelCase words', () => {
  expect(kebabCase('fooBar')).toBe('foo-bar');
});

test('kebabCase: should handle PascalCase words', () => {
  expect(kebabCase('FooBar')).toBe('foo-bar');
});

test('kebabCase: should handle special characters', () => {
  expect(kebabCase('__FOO_BAR__')).toBe('foo-bar');
});

test('kebabCase: should handle empty string', () => {
  expect(kebabCase('')).toBe('');
});

test('kebabCase: should handle undefined', () => {
  expect(kebabCase(undefined)).toBe('');
});

test('kebabCase: should handle mixed delimiters', () => {
  expect(kebabCase('foo_bar-baz')).toBe('foo-bar-baz');
});

test('kebabCase: should handle already kebab cased strings', () => {
  expect(kebabCase('foo-bar')).toBe('foo-bar');
});

// Tests for snakeCase
test('snakeCase: should handle regular space-separated words', () => {
  expect(snakeCase('Foo Bar')).toBe('foo_bar');
});

test('snakeCase: should handle camelCase words', () => {
  expect(snakeCase('fooBar')).toBe('foo_bar');
});

test('snakeCase: should handle PascalCase words', () => {
  expect(snakeCase('FooBar')).toBe('foo_bar');
});

test('snakeCase: should handle hyphenated words', () => {
  expect(snakeCase('--FOO-BAR--')).toBe('foo_bar');
});

test('snakeCase: should handle empty string', () => {
  expect(snakeCase('')).toBe('');
});

test('snakeCase: should handle undefined', () => {
  expect(snakeCase(undefined)).toBe('');
});

test('snakeCase: should handle mixed delimiters', () => {
  expect(snakeCase('foo-bar_baz')).toBe('foo_bar_baz');
});

test('snakeCase: should handle already snake cased strings', () => {
  expect(snakeCase('foo_bar')).toBe('foo_bar');
});

// Tests for startCase
test('startCase: should handle regular space-separated words', () => {
  expect(startCase('foo bar')).toBe('Foo Bar');
});

test('startCase: should handle camelCase words', () => {
  expect(startCase('fooBar')).toBe('Foo Bar');
});

test('startCase: should handle PascalCase words', () => {
  expect(startCase('FooBar')).toBe('Foo Bar');
});

test('startCase: should handle hyphenated words', () => {
  expect(startCase('--foo-bar--')).toBe('Foo Bar');
});

test('startCase: should handle underscore words', () => {
  expect(startCase('__FOO_BAR__')).toBe('FOO BAR');
});

test('startCase: should handle empty string', () => {
  expect(startCase('')).toBe('');
});

test('startCase: should handle undefined', () => {
  expect(startCase(undefined)).toBe('');
});

test('startCase: should handle mixed delimiters', () => {
  expect(startCase('foo-bar_baz')).toBe('Foo Bar Baz');
});