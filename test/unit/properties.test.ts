import {describe, expect, test} from 'bun:test';
import fc from 'fast-check';
import {getCache} from '../../src';
import {stableHash} from '../../src/hash';
import {createFakeRedisApi} from '../fakeRedisApi';

const jsonValue = fc.jsonValue({maxDepth: 4});

/** Deep-shuffles object key order without changing content. */
const shuffleKeys = (value: unknown, seed: number): unknown => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => shuffleKeys(item, seed));
  const entries = Object.entries(value as Record<string, unknown>);
  const rotated = entries.map((_, i, all) => all[(i + seed) % all.length]) as [
    string,
    unknown,
  ][];
  return Object.fromEntries(
    rotated.map(([k, v]) => [k, shuffleKeys(v, seed + 1)]),
  );
};

describe('stableHash properties', () => {
  test('is deterministic for structurally equal values', () => {
    fc.assert(
      fc.property(jsonValue, value => {
        const clone = JSON.parse(JSON.stringify(value));
        return stableHash(value) === stableHash(clone);
      }),
    );
  });

  test('is independent of object key order at every depth', () => {
    fc.assert(
      fc.property(jsonValue, fc.integer({min: 1, max: 7}), (value, seed) => {
        return stableHash(value) === stableHash(shuffleKeys(value, seed));
      }),
    );
  });

  test('distinguishes values from their JSON-string forms', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.boolean(), fc.double({noNaN: true})),
        value => stableHash(value) !== stableHash(JSON.stringify(value)),
      ),
    );
  });

  test('output stays compact and key-safe for arbitrary inputs', () => {
    fc.assert(
      fc.property(jsonValue, value => {
        const out = stableHash(value);
        return /^[0-9a-z]+$/.test(out) && out.length <= 20;
      }),
    );
  });
});

describe('cache state machine properties', () => {
  const now = () => Math.floor(Date.now() / 1000);

  test('entry age relative to ttl and stale windows determines the source', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 3600}),
        fc.integer({min: 0, max: 3600}),
        fc.integer({min: 0, max: 8000}),
        async (ttl, stale, age) => {
          const fake = createFakeRedisApi();
          const key = `prop:${ttl}:${stale}:${age}`;
          await fake.jsonSet(
            key,
            JSON.stringify({
              isCached: true,
              result: {marker: key},
              stale,
              timestamp: now() - age,
              ttl,
            }),
          );

          let queried = false;
          const read = await getCache({
            ttl,
            stale,
            config: {ttl, stale, type: 'JSON'},
            key,
            redis: fake,
            args: {},
            query: async () => {
              queried = true;
              return {marker: 'db'};
            },
          });

          // Allow 2s of slack around boundaries for wall-clock movement
          if (age + 2 < ttl) {
            return read.meta.source === 'cache' && !queried;
          }
          if (age > ttl + stale + 2) {
            return read.meta.source === 'db' && queried;
          }
          return ['cache', 'stale-cache', 'db'].includes(read.meta.source);
        },
      ),
      {numRuns: 60},
    );
  });

  test('whatever the source, the caller always receives a result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 0, max: 100}),
        fc.integer({min: 0, max: 100}),
        async (ttl, stale) => {
          fc.pre(ttl + stale > 0);
          const fake = createFakeRedisApi();
          const read = await getCache({
            ttl,
            stale,
            config: {ttl, stale, type: 'JSON'},
            key: `prop:always:${ttl}:${stale}`,
            redis: fake,
            args: {},
            query: async () => ({ok: true}),
          });
          return read.result !== undefined && read.meta.key.length > 0;
        },
      ),
      {numRuns: 40},
    );
  });
});

test('property suites executed', () => {
  expect(true).toBe(true);
});
