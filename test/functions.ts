import { extendedPrismaWithJson } from './client';
import { Prisma } from './prisma/generated';

export interface User {
  id: number;
  name: string;
  email: string;
}

export type PrismaClient = typeof extendedPrismaWithJson;

export const createUser = async (extendedPrisma: PrismaClient, user: User) =>
  await extendedPrisma.user.create({
    data: user,
    // Auto-invalidation should handle this, manual invalidation might not be needed here
    // Keeping it commented out for now, review if needed for specific tests
    // invalidate: {
    //   invalidateKeys: ['*'],
    //   hasPattern: true,
    // },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

export const createManyUser = async (
  extendedPrisma: PrismaClient,
  users: User[],
) =>
  await extendedPrisma.user.createManyAndReturn({
    data: users,
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

export const updateUserDetails = async (
  extendedPrisma: PrismaClient,
  user: User,
  invalidate?: {invalidateKeys: string[]; hasPattern?: boolean},
) =>
  await extendedPrisma.user.update({
    where: {id: user.id},
    data: user,
    select: {
      id: true,
      name: true,
      email: true,
    },
    invalidate,
  });

export const autoFindUserByWhereUniqueInput = async (
  extendedPrisma: PrismaClient,
  where: Prisma.UserWhereUniqueInput,
) =>
  await extendedPrisma.user.findUnique({
    where,
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

export const customFindUserByWhereUniqueInput = async (
  extendedPrisma: PrismaClient,
  where: Prisma.UserWhereUniqueInput,
  key: string,
  ttl?: number,
) => {
  const ttlValue = ttl ?? 60;
  return await extendedPrisma.user.findUnique({
    where,
    cache: {
      key,
      ttl: ttlValue,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });
};

export const deleteUserById = async (
  extendedPrisma: PrismaClient,
  id: number,
) =>
  await extendedPrisma.user.delete({
    where: {
      id,
    },
  });

export const deleteUserByIdWithInvalidate = async (
  extendedPrisma: PrismaClient,
  id: number,
  invalidateKeys: string[],
  hasPattern = false,
) => {
  await extendedPrisma.user.delete({
    where: {
      id,
    },
    invalidate: {
      invalidateKeys,
      hasPattern,
    },
  });
};


export const deleteAllUsers = async (extendedPrisma: PrismaClient) =>
  await extendedPrisma.user.deleteMany({
    invalidate: {
      invalidateKeys: [extendedPrisma.getKeyPattern({params: [{prisma: '*'}]})],
      hasPattern: true,
    },
  });

export const getCountOfUsersWithoutCaching = async (
  extendedPrisma: PrismaClient,
) =>
  await extendedPrisma.user.count({
    cache: false,
  });

export const deleteAllUsersAndGetCountOfUsersWithoutCaching = (
  extendedPrisma: PrismaClient,
) =>
  deleteAllUsers(extendedPrisma).then(() =>
    getCountOfUsersWithoutCaching(extendedPrisma),
  );

export const delay = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

export const cleanupDbAndCache = async (extendedPrisma: PrismaClient) => {
  try {
    // 1. Delete all users from the database
    await extendedPrisma.user.deleteMany({});

    // 2. Clear the cache
    await extendedPrisma.provider.flushdb();

  } catch (error) {
    console.error('Error during DB cleanup (deleteMany):', error);
  }
};
