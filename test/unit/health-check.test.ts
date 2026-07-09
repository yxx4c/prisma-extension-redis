import {describe, expect, test} from 'bun:test';
import {checkHealth} from '../../src';
import {extendedPrismaWithJsonAndAutoCacheTrue} from '../client';

describe('Health Check', () => {
  test('should return healthy status for working Redis connection', async () => {
    const result = await checkHealth(
      extendedPrismaWithJsonAndAutoCacheTrue.redis,
    );

    expect(result.status).toBe('healthy');
    expect(result.connected).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.error).toBeUndefined();
  });

  test('should include server info when available', async () => {
    const result = await checkHealth(
      extendedPrismaWithJsonAndAutoCacheTrue.redis,
    );

    // Server info may or may not be available depending on Redis configuration
    if (result.serverInfo) {
      expect(typeof result.serverInfo.version).toBe('string');
    }
  });

  test('should have reasonable latency', async () => {
    const result = await checkHealth(
      extendedPrismaWithJsonAndAutoCacheTrue.redis,
    );

    // Health check should typically complete in under 100ms for local Redis
    expect(result.latencyMs).toBeLessThan(1000);
  });

  test('should return consistent results on multiple calls', async () => {
    const results = await Promise.all([
      checkHealth(extendedPrismaWithJsonAndAutoCacheTrue.redis),
      checkHealth(extendedPrismaWithJsonAndAutoCacheTrue.redis),
      checkHealth(extendedPrismaWithJsonAndAutoCacheTrue.redis),
    ]);

    for (const result of results) {
      expect(result.status).toBe('healthy');
      expect(result.connected).toBe(true);
    }
  });
});

describe('Health Check via Extension Client', () => {
  test('should expose healthCheck method on extension client', async () => {
    expect(typeof extendedPrismaWithJsonAndAutoCacheTrue.healthCheck).toBe(
      'function',
    );
  });

  test('should return health result via extension client', async () => {
    const result = await extendedPrismaWithJsonAndAutoCacheTrue.healthCheck();

    expect(result.status).toBe('healthy');
    expect(result.connected).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
