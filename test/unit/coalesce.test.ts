import {describe, expect, test} from 'bun:test';
import {coalesce} from '../../src/coalesce';
import {delay} from '../functions';

describe('coalesce', () => {
  test('concurrent callers for the same key share one execution', async () => {
    let calls = 0;
    const work = async () => {
      calls++;
      await delay(20);
      return calls;
    };

    const results = await Promise.all([
      coalesce('shared-key', work),
      coalesce('shared-key', work),
      coalesce('shared-key', work),
    ]);

    expect(calls).toBe(1);
    expect(results).toEqual([1, 1, 1]);
  });

  test('different keys execute independently', async () => {
    let calls = 0;
    const work = async () => {
      calls++;
      await delay(10);
      return calls;
    };

    await Promise.all([coalesce('key-a', work), coalesce('key-b', work)]);
    expect(calls).toBe(2);
  });

  test('re-executes after the shared promise settles', async () => {
    let calls = 0;
    const work = async () => {
      calls++;
      return calls;
    };

    await coalesce('settle-key', work);
    await coalesce('settle-key', work);
    expect(calls).toBe(2);
  });

  test('rejection propagates to all waiters and releases the key', async () => {
    let rejections = 0;
    const boom = async () => {
      await delay(5);
      throw new Error('boom');
    };

    await Promise.all([
      coalesce('reject-key', boom).catch(() => rejections++),
      coalesce('reject-key', boom).catch(() => rejections++),
    ]);
    expect(rejections).toBe(2);

    const recovered = await coalesce('reject-key', async () => 'recovered');
    expect(recovered).toBe('recovered');
  });

  test('synchronous throw from fn is delivered as a rejection', async () => {
    const syncBoom = () => {
      throw new Error('sync boom');
    };

    await expect(
      coalesce('sync-key', syncBoom as unknown as () => Promise<never>),
    ).rejects.toThrow('sync boom');

    const ok = await coalesce('sync-key', async () => 'ok');
    expect(ok).toBe('ok');
  });
});
