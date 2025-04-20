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
import {
  extendedPrismaWithStringAndAutoCacheTrue as extendedPrisma,
  getProvider,
} from '../client';

const provider = getProvider(extendedPrisma);

const checkCache = async (key: string): Promise<boolean> => {
  const val = await provider.get(key);
  return val !== null;
};

test('User Creation: should create a new user', async () => {
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');

  expect(createUser(extendedPrisma, userOne)).resolves.toEqual({
    result: userOne,
  });
});

test('User Creation: should create multiple new users', async () => {
  const newUsers = users.filter(user => ![1, 2, 3].includes(user.id));
  expect(createManyUser(extendedPrisma, newUsers)).resolves.toEqual({
    result: newUsers,
  });
});

test("User Update: should update a user's details", async () => {
  const userOne = users.find(user => user.id === 1);
  const userTwo = users.find(user => user.id === 2);
  if (!userOne || !userTwo) throw new Error('Invalid user information!');

  const updatedUser = {...userTwo, id: userOne.id};
  expect(updateUserDetails(extendedPrisma, updatedUser)).resolves.toEqual({
    result: updatedUser,
  });
});

test('User Retrieval: should find a user by email from the database', async () => {
  const userTen = users.find(user => user.id === 10);
  if (!userTen) throw new Error('Invalid user information!');

  expect(
    autoFindUserByWhereUniqueInput(extendedPrisma, {email: userTen.email}),
  ).resolves.toEqual({
    result: userTen,
    isCached: false,
  });
});

test('User Retrieval: should find a user by email from cache', async () => {
  const userTen = users.find(user => user.id === 10);
  if (!userTen) throw new Error('Invalid user information!');

  expect(
    autoFindUserByWhereUniqueInput(extendedPrisma, {email: userTen.email}),
  ).resolves.toEqual({
    result: userTen,
    isCached: true,
  });
});

test('Custom User Retrieval: should find a user by email from the database', async () => {
  const userThirteen = users.find(user => user.id === 13);
  if (!userThirteen) throw new Error('Invalid user information!');

  expect(
    customFindUserByWhereUniqueInput(
      extendedPrisma,
      {email: userThirteen.email},
      extendedPrisma.getKey({
        params: [{prisma: 'User'}, {email: userThirteen.email}],
      }),
      true,
    ),
  ).resolves.toEqual({
    result: userThirteen,
    isCached: false,
  });
});

test('Custom User Retrieval: should find a user by email from cache', async () => {
  const userThirteen = users.find(user => user.id === 13);
  if (!userThirteen) throw new Error('Invalid user information!');

  expect(
    customFindUserByWhereUniqueInput(
      extendedPrisma,
      {email: userThirteen.email},
      extendedPrisma.getKey({
        params: [{prisma: 'User'}, {email: userThirteen.email}],
      }),
    ),
  ).resolves.toEqual({
    result: userThirteen,
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

test('Cache Management: should update user and manually invalidate cache', async () => {
  const userFour = users.find(user => user.id === 4);
  const userThree = users.find(user => user.id === 3);
  if (!userFour || !userThree) throw new Error('Invalid user information!');

  const updatedUser = {...userThree, id: userFour.id};
  const key = extendedPrisma.getKey({
    params: [{prisma: 'User'}, {id: userFour.id.toString()}],
  });

  // Ensure the key exists before update (custom cache)
  await customFindUserByWhereUniqueInput(
    extendedPrisma,
    {id: userFour.id},
    key,
  );
  expect(await checkCache(key)).toBe(true);

  // Update with manual invalidation
  await updateUserDetails(extendedPrisma, updatedUser, {invalidateKeys: [key]});

  // Check cache is invalidated
  expect(await checkCache(key)).toBe(false);

  // Fetch again, should come from DB
  const userAfterUpdate = await customFindUserByWhereUniqueInput(
    extendedPrisma,
    {id: userFour.id},
    key,
  );
  expect(userAfterUpdate).toEqual({result: updatedUser, isCached: false});

  // Fetch again, should come from cache
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

test('Cache Management: should delete user from database and manually invalidate cache', async () => {
  const userThirteen = users.find(user => user.id === 13);
  if (!userThirteen) throw new Error('Invalid user information!');

  const key = extendedPrisma.getKey({
    params: [{prisma: 'User'}, {email: userThirteen.email}],
  });

  // Ensure key exists before delete (custom cache)
  await customFindUserByWhereUniqueInput(
    extendedPrisma,
    {id: userThirteen.id},
    key,
  );
  expect(await checkCache(key)).toBe(true);

  // Delete with manual invalidation
  await deleteUserById(extendedPrisma, userThirteen.id, [key]);

  // Check cache is invalidated
  expect(await checkCache(key)).toBe(false);

  // Check DB
  const {result: userAfterDelete} = await customFindUserByWhereUniqueInput(
    extendedPrisma,
    {id: userThirteen.id},
    key,
  );
  expect(userAfterDelete).toEqual(null);
});

test('Database Cleanup: should delete all users and clear cache via pattern', async () => {
  // Ensure some data exists before delete all
  const userOne = users.find(user => user.id === 1);
  if (!userOne) throw new Error('Invalid user information!');
  await createUser(extendedPrisma, userOne); // Creates user
  await autoFindUserByWhereUniqueInput(extendedPrisma, {id: 1}); // Caches user 1

  // Delete all with pattern invalidation
  await deleteAllUsersAndGetCountOfUsersWithoutCaching(extendedPrisma);

  // Check count is 0
  const {result: dbUserCount} =
    await deleteAllUsersAndGetCountOfUsersWithoutCaching(extendedPrisma);
  expect(dbUserCount).toEqual(0);

  // Check cache is empty (might not be exactly 0 if other keys exist, check specific keys)
  // Let's check if the user 1 key is gone
  const userOneKey = extendedPrisma.getAutoKey({
    args: {where: {id: 1}},
    model: 'User',
    operation: 'findUnique',
  });
  expect(await checkCache(userOneKey)).toBe(false);
});
