import {expect, test} from 'bun:test';
import {
  createUser,
  createManyUser,
  updateUserDetails,
  autoFindUserByWhereUniqueInput,
  customFindUserByWhereUniqueInput,
  deleteAllUsersAndGetCountOfUsersWithoutCaching,
  deleteUserById,
} from '../functions';

import {users} from '../data';
import {extendedPrisma} from '../client';

test('User Creation: should create a new user', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  expect(createUser(userOne)).resolves.toEqual({result: userOne});
});

test('User Creation: should create multiple new users', async () => {
  const newUsers = users.filter(user => ![1, 2, 3].includes(user.id));
  expect(createManyUser(newUsers)).resolves.toEqual({result: newUsers});
});

test("User Update: should update a user's details", async () => {
  const userOne = users.find(user => user.id === 1);
  const userTwo = users.find(user => user.id === 2);
  if (!userOne || !userTwo) throw new Error('Invalid user information!');

  const updatedUser = {...userTwo, id: userOne.id};
  expect(updateUserDetails(updatedUser)).resolves.toEqual({
    result: updatedUser,
  });
});

test('User Retrieval: should find a user by email from the database', async () => {
  const userTen = users.find(user => user.id === 10);
  if (!userTen) throw new Error('Invalid user information!');

  expect(
    autoFindUserByWhereUniqueInput({email: userTen.email}),
  ).resolves.toEqual({
    result: userTen,
    isCached: false,
  });
});

test('User Retrieval: should find a user by email from cache', async () => {
  const userTen = users.find(user => user.id === 10);
  if (!userTen) throw new Error('Invalid user information!');

  expect(
    autoFindUserByWhereUniqueInput({email: userTen.email}),
  ).resolves.toEqual({
    result: userTen,
    isCached: true,
  });
});

test('Custom User Retrieval: should find a user by email from the database', async () => {
  const userTwenty = users.find(user => user.id === 20);
  if (!userTwenty) throw new Error('Invalid user information!');

  expect(
    customFindUserByWhereUniqueInput(
      {email: userTwenty.email},
      extendedPrisma.getKey({
        params: [{prisma: 'User'}, {email: userTwenty.email}],
      }),
    ),
  ).resolves.toEqual({
    result: userTwenty,
    isCached: false,
  });
});

test('Custom User Retrieval: should find a user by email from cache', async () => {
  const userTwenty = users.find(user => user.id === 20);
  if (!userTwenty) throw new Error('Invalid user information!');

  expect(
    customFindUserByWhereUniqueInput(
      {email: userTwenty.email},
      extendedPrisma.getKey({
        params: [{prisma: 'User'}, {email: userTwenty.email}],
      }),
    ),
  ).resolves.toEqual({
    result: userTwenty,
    isCached: true,
  });
});

test('User Retrieval: should find a user with auto cache and then through custom cache', async () => {
  const userFour = users.find(user => user.id === 4);
  if (!userFour) throw new Error('Invalid user information!');

  const args = {
    where: {email: userFour.email},
    select: {id: true, name: true, email: true},
  };

  const autoResult = await autoFindUserByWhereUniqueInput(args.where);
  expect(autoResult).toEqual({result: userFour, isCached: false});

  const key = extendedPrisma.getAutoKey({
    args,
    model: 'user',
    operation: 'findUnique',
  });
  const customResult = await customFindUserByWhereUniqueInput(args.where, key);
  expect(customResult).toEqual({result: userFour, isCached: true});
});

test('Cache Management: should update user and invalidate cache', async () => {
  const userFour = users.find(user => user.id === 4);
  const userThree = users.find(user => user.id === 3);
  if (!userFour || !userThree) throw new Error('Invalid user information!');

  const updatedUser = {...userThree, id: userFour.id};
  const key = extendedPrisma.getKey({
    params: [{prisma: 'User'}, {id: userFour.id.toString()}],
  });

  const userBeforeUpdate = await customFindUserByWhereUniqueInput(
    {id: userFour.id},
    key,
  );
  const keyExistsBeforeUpdate = await extendedPrisma.redis.exists(key);

  expect(keyExistsBeforeUpdate).toEqual(1);
  expect(userBeforeUpdate).toEqual({result: userFour, isCached: false});

  await updateUserDetails(updatedUser, {uncacheKeys: [key]});

  const keyExistsAfterUpdate = await extendedPrisma.redis.exists(key);
  const userAfterUpdate = await customFindUserByWhereUniqueInput(
    {id: userFour.id},
    key,
  );

  expect(keyExistsAfterUpdate).toEqual(0);
  expect(userAfterUpdate).toEqual({result: updatedUser, isCached: false});

  const userCachedAfterUpdate = await customFindUserByWhereUniqueInput(
    {id: userFour.id},
    key,
  );
  expect(userCachedAfterUpdate).toEqual({
    result: updatedUser,
    isCached: true,
  });
});

test('Cache Management: should delete user from database and invalidate cache', async () => {
  const userTwenty = users.find(user => user.id === 20);
  if (!userTwenty) throw new Error('Invalid user information!');

  const key = extendedPrisma.getKey({
    params: [{prisma: 'User'}, {email: userTwenty.email}],
  });

  const keyExistsBeforeDelete = await extendedPrisma.redis.exists(key);
  const {result: userBeforeDelete} = await customFindUserByWhereUniqueInput(
    {id: userTwenty.id},
    key,
  );

  expect(keyExistsBeforeDelete).toEqual(1);
  expect(userBeforeDelete).toEqual(userTwenty);

  await deleteUserById(userTwenty.id, [key]);

  const keyExistsAfterDelete = await extendedPrisma.redis.exists(key);
  const {result: userAfterDelete} = await customFindUserByWhereUniqueInput(
    {id: userTwenty.id},
    key,
  );

  expect(keyExistsAfterDelete).toEqual(0);
  expect(userAfterDelete).toEqual(null);
});

test('Database Cleanup: should delete all users and clear cache', async () => {
  const {result: dbUserCount} =
    await deleteAllUsersAndGetCountOfUsersWithoutCaching();
  const cacheKeyCount = await extendedPrisma.redis.dbsize();

  expect(dbUserCount).toEqual(0);
  expect(cacheKeyCount).toEqual(0);
});
