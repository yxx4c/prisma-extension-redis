import {expect, test, describe, beforeAll, afterEach} from 'bun:test';
import {
  createUser,
  updateUserDetails,
  autoFindUserByWhereUniqueInput,
  customFindUserByWhereUniqueInput,
  deleteUserById,
  delay,
} from '../functions';

import {users} from '../data';
import {
  extendedPrismaWithJsonAndAutoCacheTrue,
  extendedPrismaDefaultCacheFalse,
  extendedPrismaAutoInvalidateFalse,
  getProvider,
  prisma,
} from '../client';
import {PrismaExtensionRedis} from '../../src';

const client = extendedPrismaWithJsonAndAutoCacheTrue;
const provider = getProvider(client);

const checkCache = async (key: string): Promise<boolean> => {
  const val = await provider.get(key);
  return val !== null;
};

afterEach(async () => {
  try {
    await provider.client().flushdb();
  } catch (e) {
    console.error('Failed to flush DB', e);
    const userPattern = client.getKeyPattern({
      params: [{prisma: 'User'}, {glob: '*'}],
    });
    const postPattern = client.getKeyPattern({
      params: [{prisma: 'Post'}, {glob: '*'}],
    });
    try {
      await provider.deletePattern(userPattern);
      await provider.deletePattern(postPattern);
    } catch (patternErr) {
      console.error('Failed to delete patterns', patternErr);
    }
  }
});

describe('Default Caching Feature', () => {
  test('should cache reads by default when defaultCache is true', async () => {
    const client = extendedPrismaWithJsonAndAutoCacheTrue; // defaultCache=true implicitly
    const provider = getProvider(client);
    const user = users[0];
    await createUser(client, user);

    const res1 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res1.isCached).toBe(false);

    const key = client.getAutoKey({
      args: {where: {id: user.id}, select: res1.result},
      model: 'User',
      operation: 'findUnique',
    });
    expect(await checkCache(key)).toBe(true);

    const res2 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res2.isCached).toBe(true);
  });

  test('should NOT cache reads when defaultCache is false and cache option not set', async () => {
    const client = extendedPrismaDefaultCacheFalse; // defaultCache=false
    const provider = getProvider(client);
    const user = users[1];
    await createUser(client, user);

    const res1 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res1.isCached).toBe(false);

    const key = client.getAutoKey({
      args: {where: {id: user.id}, select: res1.result},
      model: 'User',
      operation: 'findUnique',
    });
    expect(await checkCache(key)).toBe(false);

    const res2 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res2.isCached).toBe(false);
  });

  test('should cache reads when defaultCache is false BUT cache:true specified', async () => {
    const client = extendedPrismaDefaultCacheFalse; // defaultCache=false
    const provider = getProvider(client);
    const user = users[2];
    await createUser(client, user);

    // Need a function that allows setting cache: true explicitly
    const res1 = await client.user.findUnique({
      where: {id: user.id},
      cache: true,
    });
    // The return type might not include isCached here as it bypasses some helpers
    // Check cache directly
    const key = client.getAutoKey({
      args: {where: {id: user.id}, cache: true},
      model: 'User',
      operation: 'findUnique',
    });
    expect(await checkCache(key)).toBe(true);

    // Check subsequent read uses cache if possible (depends on auto-cache settings too)
    const res2 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res2.isCached).toBe(true); // Should now be cached
  });

  test('should NOT cache reads when defaultCache is true BUT cache:false specified', async () => {
    const client = extendedPrismaWithJsonAndAutoCacheTrue; // defaultCache=true
    const provider = getProvider(client);
    const user = users[3];
    await createUser(client, user);

    const res1 = await client.user.findUnique({
      where: {id: user.id},
      cache: false,
    });
    // Check cache directly
    const key = client.getAutoKey({
      args: {where: {id: user.id}, cache: false},
      model: 'User',
      operation: 'findUnique',
    });
    expect(await checkCache(key)).toBe(false);
  });
});

describe('Auto Invalidation Feature', () => {
  test('should auto-invalidate cache on update when autoInvalidate is true', async () => {
    const client = extendedPrismaWithJsonAndAutoCacheTrue; // autoInvalidate=true implicitly
    const provider = getProvider(client);
    const user = users[4];
    await createUser(client, user);

    const res1 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res1.isCached).toBe(false); // First read
    const res2 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res2.isCached).toBe(true); // Second read (cached)

    // Update user
    const updatedUser = {...user, name: 'Updated Name'};
    await updateUserDetails(client, updatedUser);

    // Check cache directly (optional, but good sanity check)
    const key = client.getAutoKey({
      args: {where: {id: user.id}, select: res1.result},
      model: 'User',
      operation: 'findUnique',
    });
    expect(await checkCache(key)).toBe(false); // Should be invalidated

    // Third read, should be from DB
    const res3 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res3.isCached).toBe(false);
    expect(res3.result.name).toBe('Updated Name');
  });

  test('should NOT auto-invalidate cache on update when autoInvalidate is false', async () => {
    const client = extendedPrismaAutoInvalidateFalse; // autoInvalidate=false
    const provider = getProvider(client);
    const user = users[5];
    await createUser(client, user);

    const res1 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res1.isCached).toBe(false);
    const res2 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res2.isCached).toBe(true);

    const updatedUser = {...user, name: 'Still Cached Name'};
    await updateUserDetails(client, updatedUser);

    const key = client.getAutoKey({
      args: {where: {id: user.id}, select: res1.result},
      model: 'User',
      operation: 'findUnique',
    });
    expect(await checkCache(key)).toBe(true); // Should still be cached

    const res3 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res3.isCached).toBe(true); // Should still hit cache
    expect(res3.result.name).toBe(user.name); // Should be old name from cache
  });

  // Add similar tests for create and delete if needed, checking relevant keys/patterns
});

describe('.cache() Method', () => {
  test('should return cached data if available and valid', async () => {
    const client = extendedPrismaWithJsonAndAutoCacheTrue;
    const user = users[6];
    await createUser(client, user);

    // Cache the data
    await autoFindUserByWhereUniqueInput(client, {id: user.id});

    // Use .cache()
    const cachedResult = await client.user.cache({where: {id: user.id}});
    expect(cachedResult).toEqual(user);
  });

  test('should return null if data not in cache', async () => {
    const client = extendedPrismaWithJsonAndAutoCacheTrue;
    const user = users[7];
    // Do not cache data

    const cachedResult = await client.user.cache({where: {id: user.id}});
    expect(cachedResult).toBeNull();
  });

  test('should return null if cached data TTL has expired', async () => {
    // Need a client with short TTL for this test
    const shortTTLConfig = {
      ...extendedPrismaWithJsonAndAutoCacheTrue.config,
      ttl: 1,
      stale: 0,
    };
    const client = prisma.$extends(
      PrismaExtensionRedis({
        config: shortTTLConfig,
        provider: getProvider(extendedPrismaWithJsonAndAutoCacheTrue), // Reuse provider
      }),
    );
    const user = users[8];
    await createUser(client, user);

    // Cache the data
    await autoFindUserByWhereUniqueInput(client, {id: user.id});

    // Wait for TTL to expire
    await delay(1100); // Wait 1.1 seconds

    const cachedResult = await client.user.cache({where: {id: user.id}});
    expect(cachedResult).toBeNull();
  });
});

describe('.invalidate() Method', () => {
  test('should invalidate a specific key', async () => {
    const client = extendedPrismaWithJsonAndAutoCacheTrue;
    const provider = getProvider(client);
    const user = users[9];
    const customKey = `custom-user-key:${user.id}`;
    await createUser(client, user);

    // Cache with custom key
    await client.user.findUnique({
      where: {id: user.id},
      cache: {key: customKey},
    });
    expect(await checkCache(customKey)).toBe(true);

    // Invalidate the key
    await client.user.invalidate(customKey);
    expect(await checkCache(customKey)).toBe(false);
  });

  test('should invalidate an array of keys', async () => {
    const client = extendedPrismaWithJsonAndAutoCacheTrue;
    const provider = getProvider(client);
    const user10 = users[9]; // Reuse user id 9
    const user11 = users[10];
    const key1 = `custom-user-key:${user10.id}`;
    const key2 = `custom-user-key:${user11.id}`;
    await createUser(client, user10);
    await createUser(client, user11);

    // Cache both
    await client.user.findUnique({where: {id: user10.id}, cache: {key: key1}});
    await client.user.findUnique({where: {id: user11.id}, cache: {key: key2}});
    expect(await checkCache(key1)).toBe(true);
    expect(await checkCache(key2)).toBe(true);

    // Invalidate array
    await client.user.invalidate([key1, key2]);
    expect(await checkCache(key1)).toBe(false);
    expect(await checkCache(key2)).toBe(false);
  });

  test('should invalidate keys matching a pattern', async () => {
    const client = extendedPrismaWithJsonAndAutoCacheTrue;
    const provider = getProvider(client);
    const user12 = users[11];
    const user13 = users[12];
    await createUser(client, user12);
    await createUser(client, user13);

    // Auto-cache both users
    const res12 = await autoFindUserByWhereUniqueInput(client, {id: user12.id});
    const res13 = await autoFindUserByWhereUniqueInput(client, {id: user13.id});
    const key12 = client.getAutoKey({
      args: {where: {id: user12.id}, select: res12.result},
      model: 'User',
      operation: 'findUnique',
    });
    const key13 = client.getAutoKey({
      args: {where: {id: user13.id}, select: res13.result},
      model: 'User',
      operation: 'findUnique',
    });
    expect(await checkCache(key12)).toBe(true);
    expect(await checkCache(key13)).toBe(true);

    // Invalidate using pattern
    const pattern = client.getKeyPattern({
      params: [{prisma: 'User'}, {glob: '*'}],
    });
    await client.user.invalidate({pattern});

    // Check both keys are gone
    expect(await checkCache(key12)).toBe(false);
    expect(await checkCache(key13)).toBe(false);
  });
});
