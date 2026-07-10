import {beforeEach, describe, expect, test} from 'bun:test';
import {PrismaExtensionRedis} from '../../src';
import {isAutoInvalidateEnabled} from '../../src/cacheUncache';
import {prisma, redisClient} from '../client';

const client = redisClient;

const base = {ttl: 60, stale: 30, type: 'JSON'} as const;

const writeInvalidating = prisma.$extends(
  PrismaExtensionRedis({
    config: {...base, auto: {invalidateOnWrite: true, ttl: 60, stale: 30}},
    client,
  }),
);

const perModelOnly = prisma.$extends(
  PrismaExtensionRedis({
    config: {
      ...base,
      auto: {
        ttl: 60,
        stale: 30,
        models: [{model: 'User', invalidateOnWrite: true}],
      },
    },
    client,
  }),
);

const perModelOptOut = prisma.$extends(
  PrismaExtensionRedis({
    config: {
      ...base,
      auto: {
        invalidateOnWrite: true,
        ttl: 60,
        stale: 30,
        models: [{model: 'User', invalidateOnWrite: false}],
      },
    },
    client,
  }),
);

let seq = 1;
const nextUser = () => {
  seq += 1;
  return {
    id: 900000 + seq,
    name: `wiu-${seq}`,
    email: `wiu-${seq}@example.com`,
  };
};

const userAutoKeys = () => writeInvalidating.redis.keys('prisma:user:op:*');

describe('auto.invalidateOnWrite', () => {
  beforeEach(async () => {
    await writeInvalidating.redis.flushdb();
    await prisma.user.deleteMany({where: {id: {gte: 900000}}});
  });

  test('a write purges the model auto-cache and nothing else', async () => {
    const data = nextUser();
    const created = await writeInvalidating.user.create({data});

    await writeInvalidating.user.findMany({where: {id: created.id}});
    expect((await userAutoKeys()).length).toBeGreaterThan(0);

    await writeInvalidating.redis.set('prisma:post:op:find_many:key:x', 'live');
    await writeInvalidating.cache({
      key: 'prisma:user:custom:pinned',
      value: {pinned: true},
    });

    const updated = await writeInvalidating.user.update({
      where: {id: created.id},
      data: {name: 'renamed'},
    });

    expect(updated.name).toBe('renamed');
    expect(await userAutoKeys()).toEqual([]);
    expect(
      await writeInvalidating.redis.get('prisma:post:op:find_many:key:x'),
    ).toBe('live');
    expect(
      await writeInvalidating.redis.exists('prisma:user:custom:pinned'),
    ).toBe(1);
  });

  test('delete and deleteMany purge as well', async () => {
    const data = nextUser();
    await writeInvalidating.user.create({data});
    await writeInvalidating.user.findMany({where: {id: data.id}});
    expect((await userAutoKeys()).length).toBeGreaterThan(0);

    await writeInvalidating.user.deleteMany({where: {id: data.id}});

    expect(await userAutoKeys()).toEqual([]);
  });

  test('per-model opt-in works without the global flag', async () => {
    const data = nextUser();
    const created = await perModelOnly.user.create({data});

    await perModelOnly.user.findMany({where: {id: created.id}});
    expect((await userAutoKeys()).length).toBeGreaterThan(0);

    await perModelOnly.user.update({
      where: {id: created.id},
      data: {name: 'renamed'},
    });

    expect(await userAutoKeys()).toEqual([]);
  });

  test('per-model opt-out beats the global flag', async () => {
    const data = nextUser();
    const created = await perModelOptOut.user.create({data});

    await perModelOptOut.user.findMany({where: {id: created.id}});
    const cachedBefore = await userAutoKeys();
    expect(cachedBefore.length).toBeGreaterThan(0);

    await perModelOptOut.user.update({
      where: {id: created.id},
      data: {name: 'renamed'},
    });

    expect((await userAutoKeys()).sort()).toEqual(cachedBefore.sort());
  });

  test('explicit uncache keys and auto-invalidation compose', async () => {
    const data = nextUser();
    const created = await writeInvalidating.user.create({data});

    await writeInvalidating.user.findMany({where: {id: created.id}});
    await writeInvalidating.redis.set('app:manual:key', 'stale');
    expect((await userAutoKeys()).length).toBeGreaterThan(0);

    await writeInvalidating.user.update({
      where: {id: created.id},
      data: {name: 'renamed'},
      uncache: {uncacheKeys: ['app:manual:key']},
    });

    expect(await userAutoKeys()).toEqual([]);
    expect(await writeInvalidating.redis.exists('app:manual:key')).toBe(0);
  });
});

describe('isAutoInvalidateEnabled gate', () => {
  const options = (operation: string, model = 'User', args: object = {}) =>
    ({args, model, operation}) as never;

  test('requires the object form of auto', () => {
    expect(
      isAutoInvalidateEnabled({auto: true, options: options('update')}),
    ).toBe(false);
    expect(
      isAutoInvalidateEnabled({auto: undefined, options: options('update')}),
    ).toBe(false);
  });

  test('only write operations qualify', () => {
    const auto = {invalidateOnWrite: true};
    expect(isAutoInvalidateEnabled({auto, options: options('update')})).toBe(
      true,
    );
    expect(isAutoInvalidateEnabled({auto, options: options('upsert')})).toBe(
      true,
    );
    expect(
      isAutoInvalidateEnabled({auto, options: options('createMany')}),
    ).toBe(true);
    expect(isAutoInvalidateEnabled({auto, options: options('findMany')})).toBe(
      false,
    );
    expect(isAutoInvalidateEnabled({auto, options: options('count')})).toBe(
      false,
    );
  });

  test('model include and exclude lists are honored', () => {
    expect(
      isAutoInvalidateEnabled({
        auto: {invalidateOnWrite: true, excludedModels: ['User']},
        options: options('update'),
      }),
    ).toBe(false);
    expect(
      isAutoInvalidateEnabled({
        auto: {invalidateOnWrite: true, includedModels: ['Post']},
        options: options('update'),
      }),
    ).toBe(false);
    expect(
      isAutoInvalidateEnabled({
        auto: {invalidateOnWrite: true, includedModels: ['User']},
        options: options('update'),
      }),
    ).toBe(true);
  });
});
