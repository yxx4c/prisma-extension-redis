import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';
import {PrismaClient} from '@prisma/client';
import {PrismaExtensionRedis, type RedisOptions} from '../../src';
import {users} from '../data';

describe('Event Hooks', () => {
  const client = process.env.REDIS_SERVICE_URI as RedisOptions;
  const basePrisma = new PrismaClient();

  // Create mock functions
  const onHit = mock(() => {});
  const onMiss = mock(() => {});
  const onError = mock(() => {});

  const prisma = basePrisma.$extends(
    PrismaExtensionRedis({
      config: {
        ttl: 60,
        stale: 30,
        auto: true,
        type: 'JSON',
        onHit,
        onMiss,
        onError,
      },
      client,
    }),
  );

  beforeAll(async () => {
    // Set up test data
    await prisma.redis.flushdb();
    const userOne = users.find(user => user.id === 1);
    if (userOne) {
      await basePrisma.user.upsert({
        where: {id: userOne.id},
        update: userOne,
        create: userOne,
      });
    }
  });

  afterEach(() => {
    // Reset mocks between tests
    onHit.mockClear();
    onMiss.mockClear();
    onError.mockClear();
  });

  afterAll(async () => {
    await prisma.redis.flushdb();
    // Clean up database users to avoid conflicts with other tests
    await basePrisma.user.deleteMany({where: {id: 1}});
    await basePrisma.$disconnect();
  });

  describe('onMiss callback', () => {
    test('should be called on cache miss', async () => {
      // Clear cache to ensure miss
      await prisma.redis.flushdb();

      await prisma.user.findUnique({where: {id: 1}});

      expect(onMiss).toHaveBeenCalledTimes(1);
    });

    test('should receive the cache key as argument', async () => {
      await prisma.redis.flushdb();

      await prisma.user.findUnique({where: {id: 1}});

      expect(onMiss).toHaveBeenCalledWith(expect.stringContaining('prisma'));
      expect(onMiss).toHaveBeenCalledWith(expect.stringContaining('user'));
    });
  });

  describe('onHit callback', () => {
    test('should be called on cache hit', async () => {
      // Ensure data is cached first
      await prisma.redis.flushdb();
      await prisma.user.findUnique({where: {id: 1}});
      onMiss.mockClear();
      onHit.mockClear();

      // Second call should hit cache
      await prisma.user.findUnique({where: {id: 1}});

      expect(onHit).toHaveBeenCalledTimes(1);
      expect(onMiss).not.toHaveBeenCalled();
    });

    test('should receive the cache key as argument', async () => {
      // Ensure data is cached
      await prisma.redis.flushdb();
      await prisma.user.findUnique({where: {id: 1}});
      onHit.mockClear();

      await prisma.user.findUnique({where: {id: 1}});

      expect(onHit).toHaveBeenCalledWith(expect.stringContaining('prisma'));
      expect(onHit).toHaveBeenCalledWith(expect.stringContaining('user'));
    });
  });

  describe('callback isolation', () => {
    test('should not call onHit on cache miss', async () => {
      await prisma.redis.flushdb();

      await prisma.user.findUnique({where: {id: 1}});

      expect(onMiss).toHaveBeenCalled();
      expect(onHit).not.toHaveBeenCalled();
    });

    test('should not call onMiss on cache hit', async () => {
      // Ensure cache is populated
      await prisma.redis.flushdb();
      await prisma.user.findUnique({where: {id: 1}});
      onMiss.mockClear();
      onHit.mockClear();

      await prisma.user.findUnique({where: {id: 1}});

      expect(onHit).toHaveBeenCalled();
      expect(onMiss).not.toHaveBeenCalled();
    });
  });

  describe('multiple requests', () => {
    test('should call appropriate callbacks for each request', async () => {
      await prisma.redis.flushdb();

      // First request - miss
      await prisma.user.findUnique({where: {id: 1}});
      expect(onMiss).toHaveBeenCalledTimes(1);

      // Second request - hit
      await prisma.user.findUnique({where: {id: 1}});
      expect(onHit).toHaveBeenCalledTimes(1);

      // Third request - hit
      await prisma.user.findUnique({where: {id: 1}});
      expect(onHit).toHaveBeenCalledTimes(2);
    });
  });
});

describe('Event Hooks - Custom Cache', () => {
  const client = process.env.REDIS_SERVICE_URI as RedisOptions;
  const basePrisma = new PrismaClient();

  const onHit = mock(() => {});
  const onMiss = mock(() => {});

  const prisma = basePrisma.$extends(
    PrismaExtensionRedis({
      config: {
        ttl: 60,
        stale: 30,
        auto: false,
        type: 'JSON',
        onHit,
        onMiss,
      },
      client,
    }),
  );

  beforeAll(async () => {
    await prisma.redis.flushdb();
    const userOne = users.find(user => user.id === 1);
    if (userOne) {
      await basePrisma.user.upsert({
        where: {id: userOne.id},
        update: userOne,
        create: userOne,
      });
    }
  });

  afterEach(() => {
    onHit.mockClear();
    onMiss.mockClear();
  });

  afterAll(async () => {
    await prisma.redis.flushdb();
    // Clean up database users to avoid conflicts with other tests
    await basePrisma.user.deleteMany({where: {id: 1}});
    await basePrisma.$disconnect();
  });

  test('should call onMiss for custom cache miss', async () => {
    await prisma.redis.flushdb();

    await prisma.user.findUnique({
      where: {id: 1},
      cache: {key: 'custom:user:1', ttl: 60},
    });

    expect(onMiss).toHaveBeenCalledTimes(1);
    expect(onMiss).toHaveBeenCalledWith('custom:user:1');
  });

  test('should call onHit for custom cache hit', async () => {
    await prisma.redis.flushdb();

    // First request - miss
    await prisma.user.findUnique({
      where: {id: 1},
      cache: {key: 'custom:user:1', ttl: 60},
    });
    onMiss.mockClear();

    // Second request - hit
    await prisma.user.findUnique({
      where: {id: 1},
      cache: {key: 'custom:user:1', ttl: 60},
    });

    expect(onHit).toHaveBeenCalledTimes(1);
    expect(onHit).toHaveBeenCalledWith('custom:user:1');
  });
});
