import {describe, expect, test} from 'bun:test';
import type {RedisApi} from '../src/redisApi';
import {delay} from './functions';

export type ConformanceTarget = {
  api: RedisApi;
  /** Key prefix guaranteed writable and cleaned by the suite */
  prefix: string;
};

/**
 * Contract tests for RedisApi implementations. Every adapter the
 * extension ships (and any custom implementation) should pass this
 * suite; run it against your own adapter to validate conformance.
 */
export const runRedisApiConformance = (
  name: string,
  factory: () => Promise<ConformanceTarget>,
): void => {
  describe(`RedisApi conformance: ${name}`, () => {
    const key = (target: ConformanceTarget, suffix: string) =>
      `${target.prefix}:${suffix}`;

    test('get returns null for missing keys and round-trips strings', async () => {
      const target = await factory();
      const k = key(target, 'roundtrip');

      expect(await target.api.get(k)).toBeNull();
      await target.api.set(k, 'value-1');
      expect(await target.api.get(k)).toBe('value-1');
      await target.api.del([k]);
    });

    test('jsonGet round-trips serialized JSON payloads', async () => {
      const target = await factory();
      const k = key(target, 'json');
      const payload = JSON.stringify({nested: {a: [1, 2]}, ok: true});

      await target.api.jsonSet(k, payload);
      const stored = await target.api.jsonGet(k);
      expect(JSON.parse(stored ?? 'null')).toEqual(JSON.parse(payload));
      await target.api.del([k]);
    });

    test('ttl expires entries', async () => {
      const target = await factory();
      const k = key(target, 'expiry');

      await target.api.set(k, 'v', 1);
      expect(await target.api.get(k)).toBe('v');
      await delay(1300);
      expect(await target.api.get(k)).toBeNull();
    });

    test('del and unlink report actual removal counts', async () => {
      const target = await factory();
      const a = key(target, 'del-a');
      const b = key(target, 'del-b');

      await target.api.set(a, '1');
      await target.api.set(b, '1');
      expect(await target.api.del([a, 'missing-key-xyz'])).toBe(1);
      expect(await target.api.unlink([b])).toBe(1);
      expect(await target.api.del([])).toBe(0);
      expect(await target.api.unlink([])).toBe(0);
    });

    test('scan iterates to completion and honors glob patterns', async () => {
      const target = await factory();
      const keys = Array.from({length: 5}, (_, i) => key(target, `scan:${i}`));
      for (const k of keys) await target.api.set(k, 'v');

      const found: string[] = [];
      let cursor = '0';
      do {
        const page = await target.api.scan(
          cursor,
          `${target.prefix}:scan:*`,
          2,
        );
        cursor = page.cursor;
        found.push(...page.keys);
      } while (cursor !== '0');

      expect(new Set(found)).toEqual(new Set(keys));
      await target.api.unlink(keys);
    });

    test('ping answers PONG and time (when present) returns Unix seconds', async () => {
      const target = await factory();

      expect(await target.api.ping()).toBe('PONG');
      if (target.api.time) {
        const seconds = await target.api.time();
        expect(Number.isInteger(seconds)).toBe(true);
        expect(Math.abs(seconds - Date.now() / 1000)).toBeLessThan(120);
      }
    });
  });
};
