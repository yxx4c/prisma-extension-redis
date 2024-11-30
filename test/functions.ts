import type {Prisma} from '@prisma/client';

interface User {
  id: number;
  name: string;
  email: string;
}

// biome-ignore lint/suspicious/noExplicitAny: <To use different type of client config>
type PrismaClient = any;

export const createUser = async (extendedPrisma: PrismaClient, user: User) =>
  await extendedPrisma.user.create({
    data: user,
    uncache: {
      uncacheKeys: ['*'],
      hasPattern: true,
    },
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
  uncache?: {uncacheKeys: string[]; hasPattern?: boolean},
) =>
  await extendedPrisma.user.update({
    where: {id: user.id},
    data: user,
    select: {
      id: true,
      name: true,
      email: true,
    },
    uncache,
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
  infinite = false,
) =>
  await extendedPrisma.user.findUnique({
    where,
    cache: {
      key,
      ...(infinite ? {ttl: Number.POSITIVE_INFINITY} : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

export const deleteUserById = async (
  extendedPrisma: PrismaClient,
  id: number,
  uncacheKeys: string[],
  hasPattern = false,
) =>
  await extendedPrisma.user.delete({
    where: {
      id,
    },
    uncache: {
      uncacheKeys,
      hasPattern,
    },
  });

export const deleteAllUsers = async (extendedPrisma: PrismaClient) =>
  await extendedPrisma.user.deleteMany({
    uncache: {
      uncacheKeys: [extendedPrisma.getKeyPattern({params: [{prisma: '*'}]})],
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
