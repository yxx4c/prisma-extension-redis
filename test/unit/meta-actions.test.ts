import {expect, test} from 'bun:test';
import {
  extendedPrismaWithJsonAndAutoCacheTrue as extendedPrisma,
  extendedPrismaWithJsonAndCustomAutoCache as extendedPrismaCustom,
  extendedPrismaWithExtendedStale,
} from '../client';
import {users} from '../data';
import {
  createUser,
  delay,
  deleteAllUsersAndGetCountOfUsersWithoutCaching,
} from '../functions';

test('Meta actions on DB miss: recache and uncache functions', async () => {
  const userOne = users.find(u => u.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  await expect(createUser(extendedPrisma, userOne)).resolves.toEqual({
    result: userOne,
  });

  const miss = (await extendedPrisma.user.findUnique({
    where: {email: userOne.email},
    select: {id: true, name: true, email: true},
    meta: true,
  })) as {
    result: typeof userOne;
    meta: {
      recache: () => Promise<unknown>;
      uncache: () => Promise<{deleted: number}>;
    };
  };

  // recache should resolve successfully
  await expect(miss.meta.recache()).resolves.toBeTruthy();

  // uncache should return number of deleted keys
  const {deleted} = await miss.meta.uncache();
  expect(typeof deleted).toBe('number');
});

test('Meta actions on non-cached query: default meta object', async () => {
  // Test a query that doesn't go through cache (findFirst is excluded from auto-cache in custom config)
  const result = await extendedPrismaCustom.user.findFirst({
    meta: true, // This should trigger the default meta path
  });

  // Verify the default meta object structure
  expect(result).toHaveProperty('result');
  expect(result).toHaveProperty('meta');
  expect(result.meta).toEqual({
    cachedAt: 0,
    expiresAt: 0,
    isCached: false,
    key: '',
    recache: expect.any(Function),
    source: 'db',
    staleUntil: 0,
    uncache: expect.any(Function),
  });

  // Test the no-op functions
  const recacheResult = await result.meta.recache();
  expect(recacheResult).toHaveProperty('meta');
  expect(recacheResult.meta.isCached).toBe(false);

  const uncacheResult = await result.meta.uncache();
  expect(uncacheResult).toEqual({deleted: 0});
});

test('Meta actions on cache hit: recache and uncache functions coverage', async () => {
  const userTwo = users.find(u => u.id === 2);
  if (!userTwo) throw new Error('Invalid user information!');

  await expect(createUser(extendedPrisma, userTwo)).resolves.toEqual({
    result: userTwo,
  });

  // First fetch warms cache
  await extendedPrisma.user.findUnique({
    where: {email: userTwo.email},
    select: {id: true, name: true, email: true},
    meta: true,
  });

  // Immediate fetch -> cache hit
  const hit = (await extendedPrisma.user.findUnique({
    where: {email: userTwo.email},
    select: {id: true, name: true, email: true},
    meta: true,
  })) as {
    meta: {
      recache: () => Promise<unknown>;
      uncache: () => Promise<{deleted: number}>;
    };
  };

  // Test recache from cache hit path
  const recacheResult = await hit.meta.recache();
  expect(recacheResult).toHaveProperty('result');
  expect(recacheResult).toHaveProperty('meta');

  // Test uncache from cache hit path
  const uncacheResult = await hit.meta.uncache();
  expect(typeof uncacheResult.deleted).toBe('number');
  expect(uncacheResult.deleted).toBeGreaterThanOrEqual(0);

  // Cleanup
  const {result: dbUserCount} =
    await deleteAllUsersAndGetCountOfUsersWithoutCaching(extendedPrisma);
  expect(dbUserCount).toEqual(0);
});

test('Meta actions on stale-cache: recache and uncache functions coverage', async () => {
  const userThree = users.find(u => u.id === 3);
  if (!userThree) throw new Error('Invalid user information!');

  await expect(
    createUser(extendedPrismaWithExtendedStale, userThree),
  ).resolves.toEqual({
    result: userThree,
  });

  // First fetch warms cache (DB miss -> cache write)
  await extendedPrismaWithExtendedStale.user.findUnique({
    where: {email: userThree.email},
    select: {id: true, name: true, email: true},
    meta: true,
  });

  // Wait past ttl but within stale window (ttl=1s, stale=300s)
  await delay(1100);

  const stale = (await extendedPrismaWithExtendedStale.user.findUnique({
    where: {email: userThree.email},
    select: {id: true, name: true, email: true},
    meta: true,
  })) as {
    meta: {
      recache: () => Promise<unknown>;
      uncache: () => Promise<{deleted: number}>;
    };
  };

  // Test the specific recache function from stale-cache path (lines 186-194)
  const recacheResult = await stale.meta.recache();
  expect(recacheResult).toHaveProperty('result');
  expect(recacheResult).toHaveProperty('meta');

  // Test the specific uncache function from stale-cache path (lines 196-197)
  const uncacheResult = await stale.meta.uncache();
  expect(typeof uncacheResult.deleted).toBe('number');
  expect(uncacheResult.deleted).toBeGreaterThanOrEqual(0);

  // Cleanup
  const {result: dbUserCount} =
    await deleteAllUsersAndGetCountOfUsersWithoutCaching(
      extendedPrismaWithExtendedStale,
    );
  expect(dbUserCount).toEqual(0);
});
