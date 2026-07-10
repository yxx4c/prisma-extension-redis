import {describe, expect, test} from 'bun:test';
import {uncache} from '../../src';
import type {RedisApi} from '../../src/redisApi';
import {createFakeRedisApi} from '../fakeRedisApi';

const createInstrumentedFake = () => {
  const scanned: string[] = [];
  const unlinked: string[][] = [];
  const fake = createFakeRedisApi();

  const baseScan = fake.scan.bind(fake);
  const baseUnlink = fake.unlink.bind(fake);

  fake.scan = (cursor, match, count) => {
    scanned.push(match);
    return baseScan(cursor, match, count);
  };
  fake.unlink = keys => {
    unlinked.push([...keys]);
    return baseUnlink(keys);
  };

  return {fake: fake as RedisApi & typeof fake, scanned, unlinked};
};

describe('uncache', () => {
  test('deletes exact keys and reports the count', async () => {
    const {fake} = createInstrumentedFake();
    await fake.set('user:1', 'a');
    await fake.set('user:2', 'b');
    await fake.set('user:3', 'c');

    const {deleted} = await uncache({
      redis: fake,
      uncacheKeys: ['user:1', 'user:2', 'missing'],
    });

    expect(deleted).toBe(2);
    expect(fake.store.has('user:1')).toBe(false);
    expect(fake.store.has('user:2')).toBe(false);
    expect(fake.store.has('user:3')).toBe(true);
  });

  test('treats glob characters literally when hasPattern is not set', async () => {
    const {fake, scanned} = createInstrumentedFake();
    await fake.set('user:*', 'literal');
    await fake.set('user:1', 'a');

    const {deleted} = await uncache({redis: fake, uncacheKeys: ['user:*']});

    expect(deleted).toBe(1);
    expect(scanned).toHaveLength(0);
    expect(fake.store.has('user:1')).toBe(true);
    expect(fake.store.has('user:*')).toBe(false);
  });

  test('splits mixed keys: exact keys skip SCAN, patterns expand', async () => {
    const {fake, scanned, unlinked} = createInstrumentedFake();
    await fake.set('user:1', 'a');
    await fake.set('post:1', 'p1');
    await fake.set('post:2', 'p2');

    const {deleted} = await uncache({
      redis: fake,
      uncacheKeys: ['user:1', 'post:*'],
      hasPattern: true,
    });

    expect(deleted).toBe(3);
    expect(scanned).toEqual(['post:*']);
    expect(unlinked).toContainEqual(['user:1']);
    expect(fake.store.size).toBe(0);
  });

  test('skips SCAN entirely when hasPattern is set but no key has globs', async () => {
    const {fake, scanned} = createInstrumentedFake();
    await fake.set('user:1', 'a');

    const {deleted} = await uncache({
      redis: fake,
      uncacheKeys: ['user:1'],
      hasPattern: true,
    });

    expect(deleted).toBe(1);
    expect(scanned).toHaveLength(0);
  });

  test('resolves {deleted: 0} for an empty key list without client calls', async () => {
    const {fake, scanned, unlinked} = createInstrumentedFake();

    const {deleted} = await uncache({redis: fake, uncacheKeys: []});

    expect(deleted).toBe(0);
    expect(scanned).toHaveLength(0);
    expect(unlinked).toHaveLength(0);
  });

  test('question-mark globs are detected as patterns', async () => {
    const {fake, scanned} = createInstrumentedFake();
    await fake.set('user:1', 'a');
    await fake.set('user:2', 'b');

    const {deleted} = await uncache({
      redis: fake,
      uncacheKeys: ['user:?'],
      hasPattern: true,
    });

    expect(deleted).toBe(2);
    expect(scanned).toEqual(['user:?']);
  });
});
