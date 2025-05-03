import {expect, test, beforeEach} from 'bun:test';
import {
  createUser,
  createManyUser,
  updateUserDetails,
  autoFindUserByWhereUniqueInput,
  customFindUserByWhereUniqueInput,
  deleteAllUsersAndGetCountOfUsersWithoutCaching,
  deleteUserById,
  cleanupDbAndCache,
} from '../functions';

import {users} from '../data';
import {extendedPrismaWithStringAndCustomAutoCache as extendedPrisma} from '../client';

beforeEach(async () => {
  await cleanupDbAndCache(extendedPrisma);
});

test('User Creation: should create a new user', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  expect(await createUser(extendedPrisma, userOne)).toEqual({
    result: userOne,
    isCached: false,
  });
});

test('User Creation: should create multiple new users', async () => {
  const newUsers = users.filter(user => ![1, 2, 3].includes(user.id));
  expect(await createManyUser(extendedPrisma, newUsers)).toEqual({
    result: newUsers,
    isCached: false,
  });
});

test("User Update: should update a user's details", async () => {
  const userOne = users.find(user => user.id === 1);
  const userTwo = users.find(user => user.id === 2);
  if (!userOne || !userTwo) throw new Error('Invalid user information!');

  await createUser(extendedPrisma, userOne);

  const updatedUser = {...userTwo, id: userOne.id};
  expect(await updateUserDetails(extendedPrisma, updatedUser)).toEqual({
    result: updatedUser,
    isCached: false,
  });
});

test('User Retrieval: should find a user by email from the database and then cache', async () => {
  const userTen = users.find(user => user.id === 10);
  if (!userTen) throw new Error('Invalid user information!');

  await createUser(extendedPrisma, userTen);

  expect(
    autoFindUserByWhereUniqueInput(extendedPrisma, {email: userTen.email}),
  ).resolves.toEqual({
    result: userTen,
    isCached: false,
  });

  expect(
    autoFindUserByWhereUniqueInput(extendedPrisma, {email: userTen.email}),
  ).resolves.toEqual({
    result: userTen,
    isCached: true,
  });
});

test('Custom User Retrieval: should find a user by email from the database and then cache', async () => {
  const userThirteen = users.find(user => user.id === 13);
  if (!userThirteen) throw new Error('Invalid user information!');

  await createUser(extendedPrisma, userThirteen);

  const key = extendedPrisma.getKey({
    params: [{prisma: 'User'}, {email: userThirteen.email}],
  });

  expect(
    customFindUserByWhereUniqueInput(
      extendedPrisma,
      {email: userThirteen.email},
      key,
      true,
    ),
  ).resolves.toEqual({
    result: userThirteen,
    isCached: false,
  });

  expect(
    customFindUserByWhereUniqueInput(
      extendedPrisma,
      {email: userThirteen.email},
      key,
    ),
  ).resolves.toEqual({
    result: userThirteen,
    isCached: true,
  });
});

test('User Retrieval: should find a user with auto cache and then through custom cache', async () => {
  const userFour = users.find(user => user.id === 4);
  if (!userFour) throw new Error('Invalid user information!');

  await createUser(extendedPrisma, userFour);

  const args = {
    where: {email: userFour.email},
    select: {id: true, name: true, email: true},
  };

  const autoResult = await autoFindUserByWhereUniqueInput(
    extendedPrisma,
    args.where,
  );
  expect(autoResult).toEqual({result: userFour, isCached: false});

  const key = extendedPrisma.getAutoKey({
    args,
    model: 'user',
    operation: 'findUnique',
  });
  const customResult = await customFindUserByWhereUniqueInput(
    extendedPrisma,
    args.where,
    key,
  );
  expect(customResult).toEqual({result: userFour, isCached: true});
});

test('Cache Management: should update user and invalidate cache', async () => {
  const userFour = users.find(user => user.id === 4);
  const userThree = users.find(user => user.id === 3);
  if (!userFour || !userThree) throw new Error('Invalid user information!');

  await createUser(extendedPrisma, userFour);

  const updatedUser = {...userThree, id: userFour.id};
  const key = extendedPrisma.getKey({
    params: [{prisma: 'User'}, {id: userFour.id.toString()}],
  });

  const userBeforeUpdate = await customFindUserByWhereUniqueInput(
    extendedPrisma,
    {id: userFour.id},
    key,
  );
  const keyExistsBeforeUpdate = await extendedPrisma.provider.exists(key);

  expect(keyExistsBeforeUpdate).toBe(true);
  expect(userBeforeUpdate).toEqual({result: userFour, isCached: false});

  await updateUserDetails(extendedPrisma, updatedUser, {invalidateKeys: [key]});

  const keyExistsAfterUpdate = await extendedPrisma.provider.exists(key);
  const userAfterUpdate = await customFindUserByWhereUniqueInput(
    extendedPrisma,
    {id: userFour.id},
    key,
  );

  expect(keyExistsAfterUpdate).toBe(false);
  expect(userAfterUpdate).toEqual({result: updatedUser, isCached: false});

  const userCachedAfterUpdate = await customFindUserByWhereUniqueInput(
    extendedPrisma,
    {id: userFour.id},
    key,
  );
  expect(userCachedAfterUpdate).toEqual({
    result: updatedUser,
    isCached: true,
  });
});

test('Cache Management: should delete user from database and invalidate cache', async () => {
  const userThirteen = users.find(user => user.id === 13);
  if (!userThirteen) throw new Error('Invalid user information!');

  await createUser(extendedPrisma, userThirteen);

  const key = extendedPrisma.getKey({
    params: [{prisma: 'User'}, {id: userThirteen.id.toString()}],
  });

  await customFindUserByWhereUniqueInput(
    extendedPrisma,
    {id: userThirteen.id},
    key,
  );
  const keyExistsBeforeDelete = await extendedPrisma.provider.exists(key);
  const {result: userBeforeDelete} = await customFindUserByWhereUniqueInput(
    extendedPrisma,
    {id: userThirteen.id},
    key,
  );

  expect(keyExistsBeforeDelete).toBe(true);
  expect(userBeforeDelete).toEqual(userThirteen);

  await deleteUserById(extendedPrisma, userThirteen.id, [key]);

  const keyExistsAfterDelete = await extendedPrisma.provider.exists(key);
  const {result: userAfterDelete} = await customFindUserByWhereUniqueInput(
    extendedPrisma,
    {id: userThirteen.id},
    key,
  );

  expect(keyExistsAfterDelete).toBe(false);
  expect(userAfterDelete).toEqual(null);
});

test('Database Cleanup: should delete all users and clear cache', async () => {
  const userOne = users[0];
  await createUser(extendedPrisma, userOne);
  const findArgs = {where: {id: userOne.id}};
  await autoFindUserByWhereUniqueInput(extendedPrisma, findArgs.where);

  // Check cache *immediately* after findUnique call
  const immediateKeyCheck = extendedPrisma.getAutoKey({
    args: findArgs,
    model: 'User',
    operation: 'findUnique',
  });
  // This assertion might still fail if auto-caching isn't working as expected
  expect(await extendedPrisma.provider.exists(immediateKeyCheck), 'Cache should exist immediately after findUnique').toBe(true);

  const userOneKeyBefore = extendedPrisma.getAutoKey({
    args: findArgs,
    model: 'User',
    operation: 'findUnique',
  });
  expect(await extendedPrisma.provider.exists(userOneKeyBefore)).toBe(true);

  await deleteAllUsersAndGetCountOfUsersWithoutCaching(extendedPrisma);

  // Check the same key after deletion
  const userOneKey = extendedPrisma.getAutoKey({
    args: findArgs,
    model: 'User',
    operation: 'findUnique',
  });
  expect(await extendedPrisma.provider.exists(userOneKey)).toBe(false);
});
