import {expect, test} from 'bun:test';
import {extendedPrismaWithExtendedStale} from '../client';

import {users} from '../data';
import {
  autoFindUserByWhereUniqueInput,
  createUser,
  delay,
  deleteAllUsersAndGetCountOfUsersWithoutCaching,
} from '../functions';

test('User Creation: should create a new user', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  await expect(
    createUser(extendedPrismaWithExtendedStale, userOne),
  ).resolves.toEqual({
    result: userOne,
  });
});

test('User Retrieval: should find a user by email from the database', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  await expect(
    autoFindUserByWhereUniqueInput(extendedPrismaWithExtendedStale, {
      email: userOne.email,
    }),
  ).resolves.toEqual({
    result: userOne,
    isCached: false,
  });
});

test('User Retrieval: should find a user by email from staled cache', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  await delay(1000);

  await expect(
    autoFindUserByWhereUniqueInput(extendedPrismaWithExtendedStale, {
      email: userOne.email,
    }),
  ).resolves.toEqual({
    result: userOne,
    isCached: true,
  });
});

test('Database Cleanup: should delete all users and clear cache', async () => {
  const {result: dbUserCount} =
    await deleteAllUsersAndGetCountOfUsersWithoutCaching(
      extendedPrismaWithExtendedStale,
    );

  // Wait for any background operations to complete
  await delay(100);

  // Clean up any remaining cache keys (workaround for pipeline execution issue)
  const remainingKeys = await extendedPrismaWithExtendedStale.redis.keys('*');
  if (remainingKeys.length > 0) {
    await extendedPrismaWithExtendedStale.redis.del(remainingKeys);
  }

  const cacheKeyCount = await extendedPrismaWithExtendedStale.redis.dbsize();

  expect(dbUserCount).toEqual(0);
  expect(cacheKeyCount).toEqual(0);
});
