import {describe, expect, test} from 'bun:test';
import {createMetricsCollector} from '../../src';

describe('MetricsCollector', () => {
  test('should initialize with zero values', () => {
    const metrics = createMetricsCollector();
    const stats = metrics.getMetrics();

    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.staleHits).toBe(0);
    expect(stats.errors).toBe(0);
    expect(stats.backgroundRefreshes).toBe(0);
    expect(stats.avgCacheLatencyMs).toBe(0);
    expect(stats.avgDbLatencyMs).toBe(0);
    expect(stats.hitRatio).toBe(0);
    expect(stats.lastResetAt).toBeInstanceOf(Date);
  });

  test('should record cache hits correctly', () => {
    const metrics = createMetricsCollector();

    metrics.recordHit(10);
    metrics.recordHit(20);
    metrics.recordHit(30);

    const stats = metrics.getMetrics();
    expect(stats.hits).toBe(3);
    expect(stats.avgCacheLatencyMs).toBe(20); // (10 + 20 + 30) / 3
  });

  test('should record cache misses correctly', () => {
    const metrics = createMetricsCollector();

    metrics.recordMiss(100);
    metrics.recordMiss(200);

    const stats = metrics.getMetrics();
    expect(stats.misses).toBe(2);
    expect(stats.avgDbLatencyMs).toBe(150); // (100 + 200) / 2
  });

  test('should record stale hits correctly', () => {
    const metrics = createMetricsCollector();

    metrics.recordStaleHit(15);
    metrics.recordStaleHit(25);

    const stats = metrics.getMetrics();
    expect(stats.staleHits).toBe(2);
    // Stale hits contribute to cache latency
    expect(stats.avgCacheLatencyMs).toBe(20); // (15 + 25) / 2
  });

  test('should record errors correctly', () => {
    const metrics = createMetricsCollector();

    metrics.recordError();
    metrics.recordError();
    metrics.recordError();

    const stats = metrics.getMetrics();
    expect(stats.errors).toBe(3);
  });

  test('should record background refreshes correctly', () => {
    const metrics = createMetricsCollector();

    metrics.recordBackgroundRefresh();
    metrics.recordBackgroundRefresh();

    const stats = metrics.getMetrics();
    expect(stats.backgroundRefreshes).toBe(2);
  });

  test('should calculate hit ratio correctly', () => {
    const metrics = createMetricsCollector();

    // 3 hits + 2 stale hits = 5 cache hits
    // 5 misses
    // Total = 10 requests
    // Hit ratio = 5/10 = 0.5
    metrics.recordHit(10);
    metrics.recordHit(10);
    metrics.recordHit(10);
    metrics.recordStaleHit(10);
    metrics.recordStaleHit(10);
    metrics.recordMiss(100);
    metrics.recordMiss(100);
    metrics.recordMiss(100);
    metrics.recordMiss(100);
    metrics.recordMiss(100);

    const stats = metrics.getMetrics();
    expect(stats.hitRatio).toBe(0.5);
  });

  test('should calculate average latencies correctly with mixed operations', () => {
    const metrics = createMetricsCollector();

    // Cache operations (hits + stale hits)
    metrics.recordHit(10);
    metrics.recordHit(20);
    metrics.recordStaleHit(30);
    metrics.recordStaleHit(40);
    // Total cache latency: 100, count: 4, avg: 25

    // DB operations (misses)
    metrics.recordMiss(100);
    metrics.recordMiss(200);
    // Total DB latency: 300, count: 2, avg: 150

    const stats = metrics.getMetrics();
    expect(stats.avgCacheLatencyMs).toBe(25);
    expect(stats.avgDbLatencyMs).toBe(150);
  });

  test('should reset all metrics', () => {
    const metrics = createMetricsCollector();

    // Record some data
    metrics.recordHit(10);
    metrics.recordMiss(100);
    metrics.recordStaleHit(20);
    metrics.recordError();
    metrics.recordBackgroundRefresh();

    // Verify data was recorded
    let stats = metrics.getMetrics();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);

    // Reset
    metrics.reset();

    // Verify all reset to zero
    stats = metrics.getMetrics();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.staleHits).toBe(0);
    expect(stats.errors).toBe(0);
    expect(stats.backgroundRefreshes).toBe(0);
    expect(stats.avgCacheLatencyMs).toBe(0);
    expect(stats.avgDbLatencyMs).toBe(0);
    expect(stats.hitRatio).toBe(0);
  });

  test('should update lastResetAt on reset', async () => {
    const metrics = createMetricsCollector();
    const initialResetAt = metrics.getMetrics().lastResetAt;

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 10));

    metrics.reset();
    const newResetAt = metrics.getMetrics().lastResetAt;

    expect(newResetAt.getTime()).toBeGreaterThan(initialResetAt.getTime());
  });

  test('should handle 100% hit ratio', () => {
    const metrics = createMetricsCollector();

    metrics.recordHit(10);
    metrics.recordHit(10);
    metrics.recordHit(10);

    const stats = metrics.getMetrics();
    expect(stats.hitRatio).toBe(1);
  });

  test('should handle 0% hit ratio', () => {
    const metrics = createMetricsCollector();

    metrics.recordMiss(100);
    metrics.recordMiss(100);
    metrics.recordMiss(100);

    const stats = metrics.getMetrics();
    expect(stats.hitRatio).toBe(0);
  });
});
