import {expect, test} from 'bun:test';
import {
  createUser,
  autoFindUserByWhereUniqueInput,
  customFindUserByWhereUniqueInput,
  deleteAllUsersAndGetCountOfUsersWithoutCaching,
} from '../functions';

import {users} from '../data';
import {extendedPrismaWithInvalidCacheType} from '../client';

test('User Creation: should create a new user', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  expect(
    createUser(extendedPrismaWithInvalidCacheType, userOne),
  ).resolves.toEqual({
    result: userOne,
  });
});

test('User Retrieval: should fail when finding a user by email from the database', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  expect(
    autoFindUserByWhereUniqueInput(extendedPrismaWithInvalidCacheType, {
      email: userOne.email,
    }),
  ).rejects.toThrow(
    'Incorrect CacheType provided! Supported values: JSON | STRING',
  );
});

test('User Retrieval: should fail when finding a user by email from staled cache', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  expect(
    autoFindUserByWhereUniqueInput(extendedPrismaWithInvalidCacheType, {
      email: userOne.email,
    }),
  ).rejects.toThrow(
    'Incorrect CacheType provided! Supported values: JSON | STRING',
  );
});

test('Custom User Retrieval: should fail when finding a user by email from the database', async () => {
  const userThirteen = users.find(user => user.id === 13);
  if (!userThirteen) throw new Error('Invalid user information!');

  expect(
    customFindUserByWhereUniqueInput(
      extendedPrismaWithInvalidCacheType,
      {email: userThirteen.email},
      extendedPrismaWithInvalidCacheType.getKey({
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
      extendedPrismaWithInvalidCacheType,
    );
  const cacheKeyCount = await extendedPrismaWithInvalidCacheType.redis.dbsize();

  expect(dbUserCount).toEqual(0);
  expect(cacheKeyCount).toEqual(0);
});
