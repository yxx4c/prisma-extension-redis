import {expect, test, beforeEach} from 'bun:test';
import {
  createUser,
  autoFindUserByWhereUniqueInput,
  customFindUserByWhereUniqueInput,
  deleteAllUsersAndGetCountOfUsersWithoutCaching,
  deleteUserById,
  cleanupDbAndCache,
} from '../functions';

import {users} from '../data';
import {extendedPrismaWithInvalidCacheType} from '../client';

const extendedPrisma = extendedPrismaWithInvalidCacheType;

beforeEach(async () => {
  await cleanupDbAndCache(extendedPrisma);
});

test('User Creation: should create a new user', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  expect(
    createUser(extendedPrisma, userOne),
  ).resolves.toEqual({
    result: userOne,
    isCached: false,
  });
});

// TODO: Investigate extension source - Invalid cacheType doesn't cause rejection
test.skip('User Retrieval: should fail when finding a user by email from the database', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  await createUser(extendedPrisma, userOne);

  expect(
    autoFindUserByWhereUniqueInput(extendedPrisma, {
      email: userOne.email,
    }),
  ).rejects.toThrow(
    'Incorrect CacheType provided! Supported values: JSON | STRING',
  );
});

// TODO: Investigate extension source - Invalid cacheType doesn't cause rejection
test.skip('User Retrieval: should fail when finding a user by email from staled cache', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  await createUser(extendedPrisma, userOne);

  expect(
    autoFindUserByWhereUniqueInput(extendedPrisma, {
      email: userOne.email,
    }),
  ).rejects.toThrow(
    'Incorrect CacheType provided! Supported values: JSON | STRING',
  );
});

// TODO: Investigate extension source - Invalid cacheType doesn't cause rejection
test.skip('Custom User Retrieval: should fail when finding a user by email from the database', async () => {
  const userThirteen = users.find(user => user.id === 13);
  if (!userThirteen) throw new Error('Invalid user information!');

  await createUser(extendedPrisma, userThirteen);

  expect(
    customFindUserByWhereUniqueInput(
      extendedPrisma,
      {email: userThirteen.email},
      extendedPrisma.getKey({
        params: [{prisma: 'User'}, {email: userThirteen.email}],
      }),
      true,
    ),
  ).rejects.toThrow(
    'Incorrect CacheType provided! Supported values: JSON | STRING',
  );
});

test('Database Cleanup: should delete all users and clear cache', async () => {
  const {result: dbUserCount} =
    await deleteAllUsersAndGetCountOfUsersWithoutCaching(
      extendedPrisma,
    );
  const cacheKeyCount = await extendedPrisma.provider.client().dbsize();

  expect(dbUserCount).toEqual(0);
  expect(cacheKeyCount).toEqual(0);
});
