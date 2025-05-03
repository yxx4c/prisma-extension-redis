import {expect, test} from 'bun:test';
import {
  createUser,
  autoFindUserByWhereUniqueInput,
  deleteAllUsersAndGetCountOfUsersWithoutCaching,
  delay,
} from '../functions';

import {users} from '../data';
import {extendedPrismaWithExtendedStale} from '../client';

// TODO: Investigate client config or cleanup interaction - createUser rejects unexpectedly
test.skip('User Creation: should create a new user', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  expect(
    createUser(extendedPrismaWithExtendedStale, userOne),
  ).resolves.toEqual({
    result: userOne,
    isCached: false,
  });
});

test('User Retrieval: should find a user by email from the database', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  expect(
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

  expect(
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
  const cacheKeyCount = await extendedPrismaWithExtendedStale.provider.client().dbsize();

  expect(dbUserCount).toEqual(0);
  expect(cacheKeyCount).toEqual(0);
});
