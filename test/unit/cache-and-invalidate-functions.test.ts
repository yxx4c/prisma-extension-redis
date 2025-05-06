import {expect, test, describe, beforeAll, afterEach, beforeEach} from 'bun:test';
import {
  createUser,
  updateUserDetails,
  autoFindUserByWhereUniqueInput,
  customFindUserByWhereUniqueInput,
  deleteUserById,
  delay,
  cleanupDbAndCache,
} from '../functions';

import type { CacheConfig } from '../../src/types';
import {users} from '../data';
import {
  prisma,
  config,
  extendedPrismaWithJson,
  extendedPrismaWithDefaultCacheFalse,
  extendedPrismaWithAutoInvalidateFalse,
} from '../client';
import {PrismaExtensionRedis} from '../../src';

beforeEach(async () => {
  const client = extendedPrismaWithJson;
  await cleanupDbAndCache(client);
});

const provider = extendedPrismaWithJson.provider;

describe('Default Caching Feature', () => {
  test('should cache reads by default when defaultCache is true', async () => {
    const client = extendedPrismaWithJson;
    const user = users[0];
    await createUser(client, user);

    const res1 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res1.isCached).toBe(false);

    const res2 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res2.isCached).toBe(true);
  });

  test('should NOT cache reads when defaultCache is false and cache option not set', async () => {
    const client = extendedPrismaWithDefaultCacheFalse;
    const user = users[1];
    await createUser(client, user);

    const res1 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res1.isCached).toBe(false);

    const res2 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res2.isCached).toBe(false); // Should still be false as defaultCache is false
  });

  test('should cache reads when defaultCache is false BUT cache:{key} specified', async () => {
    const client = extendedPrismaWithDefaultCacheFalse;
    const user = users[2];
    await createUser(client, user);

    // Use customFindUserByWhereUniqueInput to explicitly cache with a key
    const customKey = `custom-user-${user.id}`;
    const res1 = await customFindUserByWhereUniqueInput(
      client,
      {id: user.id},
      customKey,
    );
    expect(res1.isCached).toBe(false); // First call
    expect(await provider.exists(customKey)).toBe(true); // Should be cached now

    // Check subsequent read uses cache
    const res2 = await customFindUserByWhereUniqueInput(
      client,
      {id: user.id},
      customKey,
    );
    expect(res2.isCached).toBe(true); // Should now be cached
  });

  test('should NOT cache reads when defaultCache is true BUT cache:false specified', async () => {
    const client = extendedPrismaWithJson;
    const user = users[3];
    await createUser(client, user);

    const res1 = await client.user.findUnique({
      where: {id: user.id},
      cache: false,
    });
    expect(res1.isCached).toBe(false); // Check the wrapper
    expect(res1.result.id).toBe(user.id); // Check the actual data

    // Check cache directly - need the key that *would* have been used.
    const key = client.getCacheKey({
      args: {where: {id: user.id}},
      model: 'User',
      operation: 'findUnique',
    });
    expect(await provider.exists(key)).toBe(false);

    // Verify a subsequent read is also not cached
    const res2 = await autoFindUserByWhereUniqueInput(client, { id: user.id });
    expect(res2.isCached).toBe(false);
  });
});

describe('Auto Invalidation Feature', () => {
  test('should auto-invalidate cache on update when autoInvalidate is true', async () => {
    const client = extendedPrismaWithJson;
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
    const key = client.getCacheKey({
      args: {where: {id: user.id}, select: { id: true, name: true, email: true } }, // Match args from autoFindUser...
      model: 'User',
      operation: 'findUnique',
    });
    expect(await provider.exists(key)).toBe(false); // Should be invalidated

    // Third read, should be from DB
    const res3 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res3.isCached).toBe(false);
    expect(res3.result.name).toBe('Updated Name');
  });

  test('should NOT auto-invalidate cache on update when autoInvalidate is false', async () => {
    const client = extendedPrismaWithAutoInvalidateFalse;
    const user = users[5];
    await createUser(client, user);

    const res1 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res1.isCached).toBe(false);
    const res2 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res2.isCached).toBe(true);

    const updatedUser = {...user, name: 'Still Cached Name'};
    await updateUserDetails(client, updatedUser);

    const key = client.getCacheKey({
      args: {where: {id: user.id}, select: { id: true, name: true, email: true } }, // Match args
      model: 'User',
      operation: 'findUnique',
    });
    expect(await provider.exists(key)).toBe(true); // Should still be cached

    const res3 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res3.isCached).toBe(true); // Should still hit cache
    expect(res3.result.name).toBe(user.name); // Should be old name from cache
  });
});

describe('.cache() Method', () => {
  test('should return cached data if available and valid', async () => {
    const client = extendedPrismaWithJson;
    const user = users[6];
    await createUser(client, user);

    // Cache the data using a standard operation first
    const res1 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res1.isCached).toBe(false);

    // Verify it's now cached using a second standard call
    const res2 = await autoFindUserByWhereUniqueInput(client, {id: user.id});
    expect(res2.isCached).toBe(true);

    // Use .cache() with the same where clause.
    // .cache() generates the key internally using getKey
    const cachedResult = await client.user.cache({where: {id: user.id}});

    // .cache() should return the raw data if found
    expect(cachedResult).not.toBeNull();
    expect(cachedResult).toEqual(expect.objectContaining({ // Match core fields
        id: user.id,
        name: user.name,
        email: user.email,
    }));
  });

  test('should return null if data not in cache', async () => {
    const client = extendedPrismaWithJson;
    const user = users[7];

    const cachedResult = await client.user.cache({where: {id: user.id}});
    expect(cachedResult).toBeNull();
  });

  test('should return null if cached data TTL has expired', async () => {
    // Need a client with short TTL. Config expects ttl/stale at top level.
    const shortTTLConfig: CacheConfig = {
      ttl: 1,      // Short TTL
      stale: 0,    // No stale period for simplicity
      type: 'JSON', // Match other clients
    };
    const client = prisma.$extends(
      PrismaExtensionRedis({
        config: shortTTLConfig,
        provider,
      }),
    );
    const user = users[8];
    await createUser(client, user);

    // Cache the data using standard operation
    await autoFindUserByWhereUniqueInput(client, {id: user.id});

    // Wait for TTL to expire
    await delay(1100); // Wait 1.1 seconds

    const cachedResult = await client.user.cache({where: {id: user.id}});
    expect(cachedResult).toBeNull();
  });

  // TODO: Investigate extension source - Pattern invalidation doesn't seem to remove keys
  test.skip('should invalidate keys matching a pattern', async () => {
    const client = extendedPrismaWithJson;
    const user12 = users[11];
    const user13 = users[12];
    // Define the keys used for custom caching
    const key12 = `pattern-test-user:${user12.id}`;
    const key13 = `pattern-test-user:${user13.id}`;
    await createUser(client, user12);
    await createUser(client, user13);

    // Explicitly cache both users with known keys (now uses TTL)
    await customFindUserByWhereUniqueInput(client, {id: user12.id}, key12);
    await customFindUserByWhereUniqueInput(client, {id: user13.id}, key13);

    // Verify they are cached
    expect(await provider.exists(key12)).toBe(true);
    expect(await provider.exists(key13)).toBe(true);

    // Invalidate using pattern - Ensure pattern matches the custom keys
    // getKeyPattern might not be the right tool if keys don't follow standard format.
    // Let's use a direct pattern string that matches.
    const pattern = `${config.key?.prefix ?? 'prisma'}${config.key?.delimiter ?? ':'}pattern-test-user:*`; // Construct pattern manually
    await client.user.invalidate({pattern});

    // Check both keys are gone
    expect(await provider.exists(key12)).toBe(false);
    expect(await provider.exists(key13)).toBe(false);
  });
});

describe('.invalidate() Method', () => {
  test('should invalidate a specific key', async () => {
    const client = extendedPrismaWithJson;
    const user = users[9];
    const customKey = `custom-user-key:${user.id}`;
    await createUser(client, user);

    // Use the custom cache function which now adds TTL
    await customFindUserByWhereUniqueInput(client, { id: user.id }, customKey);
    expect(await provider.exists(customKey)).toBe(true);

    await client.user.invalidate(customKey);
    expect(await provider.exists(customKey)).toBe(false);
  });

  test('should invalidate an array of keys', async () => {
    const client = extendedPrismaWithJson;
    const user10 = users[9];
    const user11 = users[10];
    const key1 = `custom-user-key:${user10.id}`;
    const key2 = `custom-user-key:${user11.id}`;
    await createUser(client, user10);
    await createUser(client, user11);

    // Cache both using custom function
    await customFindUserByWhereUniqueInput(client, { id: user10.id }, key1);
    await customFindUserByWhereUniqueInput(client, { id: user11.id }, key2);
    expect(await provider.exists(key1)).toBe(true);
    expect(await provider.exists(key2)).toBe(true);

    // Invalidate array
    await client.user.invalidate([key1, key2]);
    expect(await provider.exists(key1)).toBe(false);
    expect(await provider.exists(key2)).toBe(false);
  });

  test('should invalidate keys matching a pattern', async () => {
    const client = extendedPrismaWithJson;
    const user12 = users[11];
    const user13 = users[12];
    const key12 = `pattern-test-user:${user12.id}`;
    const key13 = `pattern-test-user:${user13.id}`;
    await createUser(client, user12);
    await createUser(client, user13);

    // Explicitly cache both users with known keys using custom function
    await customFindUserByWhereUniqueInput(client, {id: user12.id}, key12);
    await customFindUserByWhereUniqueInput(client, {id: user13.id}, key13);

    // Verify they are cached
    expect(await provider.exists(key12)).toBe(true);
    expect(await provider.exists(key13)).toBe(true);

    // Invalidate using pattern - Construct pattern manually based on keys
    // Assuming default prefix 'prisma' and delimiter ':'
    const pattern = `prisma:pattern-test-user:*`;
    await client.user.invalidate({pattern});

    // Check both keys are gone
    expect(await provider.exists(key12)).toBe(false);
    expect(await provider.exists(key13)).toBe(false);
  });
});
