import type {Prisma} from '@prisma/client';
import {extendedPrisma} from './client';

interface User {
  id: number;
  name: string;
  email: string;
}

export const createUser = async (user: User) =>
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

export const createManyUser = async (users: User[]) =>
  await extendedPrisma.user.createManyAndReturn({
    data: users,
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

export const updateUserDetails = async (
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
  where: Prisma.UserWhereUniqueInput,
  key: string,
) =>
  await extendedPrisma.user.findUnique({
    where,
    cache: {
      key,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

export const deleteUserById = async (
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

export const deleteAllUsers = async () =>
  await extendedPrisma.user.deleteMany({
    uncache: {
      uncacheKeys: [extendedPrisma.getKeyPattern({params: [{prisma: '*'}]})],
      hasPattern: true,
    },
  });

export const getCountOfUsersWithoutCaching = async () =>
  await extendedPrisma.user.count({
    cache: false,
  });

export const deleteAllUsersAndGetCountOfUsersWithoutCaching = () =>
  deleteAllUsers().then(() => getCountOfUsersWithoutCaching());
