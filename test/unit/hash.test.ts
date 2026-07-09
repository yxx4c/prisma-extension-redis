import {describe, expect, test} from 'bun:test';
import {stableHash} from '../../src/hash';

describe('stableHash', () => {
  test('is deterministic for equal values', () => {
    const args = {
      where: {email: 'user@example.com', status: {in: ['ACTIVE']}},
      take: 10,
    };
    expect(stableHash(args)).toBe(stableHash(JSON.parse(JSON.stringify(args))));
  });

  test('is independent of object key order at every depth', () => {
    const a = {x: 1, y: {b: 2, a: 3}, z: [{k: 1, j: 2}]};
    const b = {z: [{j: 2, k: 1}], y: {a: 3, b: 2}, x: 1};
    expect(stableHash(a)).toBe(stableHash(b));
  });

  test('changes when any value changes', () => {
    const base = {where: {id: 1}, take: 10};
    expect(stableHash(base)).not.toBe(stableHash({where: {id: 2}, take: 10}));
    expect(stableHash(base)).not.toBe(stableHash({where: {id: 1}, take: 11}));
    expect(stableHash(base)).not.toBe(stableHash({where: {id: 1}}));
  });

  test('distinguishes types with equal string forms', () => {
    expect(stableHash('1')).not.toBe(stableHash(1));
    expect(stableHash(null)).not.toBe(stableHash(undefined));
    expect(stableHash([])).not.toBe(stableHash({}));
    expect(stableHash(true)).not.toBe(stableHash('true'));
    expect(stableHash(10n)).not.toBe(stableHash(10));
  });

  test('distinguishes array element grouping', () => {
    expect(stableHash([['a'], ['b']])).not.toBe(stableHash([['a', 'b']]));
    expect(stableHash([1, [2]])).not.toBe(stableHash([[1], 2]));
  });

  test('distinguishes key/value boundaries in objects', () => {
    expect(stableHash({ab: 'c'})).not.toBe(stableHash({a: 'bc'}));
  });

  test('handles Prisma arg value types: Date, bigint, bytes', () => {
    const when = new Date('2026-01-01T00:00:00Z');
    expect(stableHash({when})).toBe(stableHash({when: new Date(when)}));
    expect(stableHash({when})).not.toBe(
      stableHash({when: new Date('2026-01-02T00:00:00Z')}),
    );

    expect(stableHash({id: 9007199254740993n})).toBe(
      stableHash({id: 9007199254740993n}),
    );

    const bytes = new Uint8Array([1, 2, 3]);
    expect(stableHash({data: bytes})).toBe(
      stableHash({data: new Uint8Array([1, 2, 3])}),
    );
    expect(stableHash({data: bytes})).not.toBe(
      stableHash({data: new Uint8Array([1, 2, 4])}),
    );
  });

  test('hashes functions and symbols by their string form', () => {
    const fn = () => 1;
    expect(stableHash({cb: fn})).toBe(stableHash({cb: fn}));
    expect(stableHash({cb: fn})).not.toBe(stableHash({cb: String(fn)}));
    expect(stableHash(Symbol('a'))).toBe(stableHash(Symbol('a')));
  });

  test('produces compact key-safe output', () => {
    const out = stableHash({where: {id: 1}});
    expect(out).toMatch(/^[0-9a-z]+$/);
    expect(out.length).toBeLessThanOrEqual(20);
  });

  test('has no collisions across many similar inputs', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      seen.add(stableHash({where: {id: i, name: `user${i}`}, take: i % 50}));
    }
    expect(seen.size).toBe(10_000);
  });
});
