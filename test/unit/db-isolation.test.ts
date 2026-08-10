import {afterAll, expect, test} from 'bun:test';
import {prisma} from '../client';
import {users} from '../data';

const userOne = users.find(user => user.id === 1);
if (!userOne) throw new Error('Invalid user information!');

// Test files run in whatever order bun resolves them, so a file that leaves
// rows behind must not be able to break the next one.
const ORDER_DEPENDENT_SUITES = [
  'test/unit/meta-actions.test.ts',
  'test/unit/staled-cache.test.ts',
  'test/unit/json-with-auto-cache-true.test.ts',
  'test/unit/json-with-custom-auto-cache.test.ts',
  'test/unit/string-with-auto-cache-true.test.ts',
  'test/unit/string-with-custom-auto-cache.test.ts',
];

afterAll(async () => {
  await prisma.user.deleteMany({});
});

test.each(
  ORDER_DEPENDENT_SUITES,
)('%s passes when an earlier suite left rows in the User table', async suite => {
  await prisma.user.deleteMany({});
  await prisma.user.create({
    data: {id: userOne.id, name: 'leftover', email: 'leftover@example.com'},
  });

  const run = Bun.spawnSync({
    cmd: ['bun', 'test', suite],
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  expect(run.stderr.toString()).not.toContain('(fail)');
  expect(run.exitCode).toBe(0);
});
