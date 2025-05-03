import type Redis from 'ioredis';
import type {CacheProvider} from './interface';

/**
 * Cache Provider implementation using the ioredis library.
 */
export class IoredisCacheProvider implements CacheProvider {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | Buffer | null> {
    return this.redis.get(key);
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    try {
      const result = await this.redis.call('JSON.GET', key, '.');
      if (result === null) return null;
      return JSON.parse(result as string) as T;
    } catch (error: unknown) {
      console.error(`ioredis: Error getting JSON for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: string | Buffer, ttl?: number): Promise<void> {
    if (ttl && ttl > 0 && ttl !== Number.POSITIVE_INFINITY) {
      await this.redis.set(key, value, 'EX', ttl);
      return;
    }

    await this.redis.set(key, value);
  }

  async setJson<T = unknown>(
    key: string,
    value: T,
    ttl?: number,
  ): Promise<void> {
    try {
      const stringValue = JSON.stringify(value);
      const commandArgs = [key, '.', stringValue];

      const pipeline = this.redis.pipeline();
      pipeline.call('JSON.SET', ...commandArgs);
      if (ttl && ttl > 0 && ttl !== Number.POSITIVE_INFINITY) {
        pipeline.expire(key, ttl);
      }
      await pipeline.exec();
    } catch (error: unknown) {
      console.error(`ioredis: Error setting JSON for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  async delete(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.redis.unlink(keys);
  }

  async deletePattern(pattern: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const stream = this.redis.scanStream({
        match: pattern,
        count: 100,
      });

      const accumulatedKeys: string[] = [];
      stream.on('data', (keysChunk: string[]) => {
        accumulatedKeys.push(...keysChunk);
        if (accumulatedKeys.length >= 1000) {
          // Process batch and clear
          const batchToProcess = [...accumulatedKeys];
          accumulatedKeys.length = 0; // Clear the array

          const pipeline = this.redis.pipeline();
          pipeline.unlink(batchToProcess);
          pipeline.exec().catch(err => {
            console.error(
              'Error during periodic pattern delete (pipeline):',
              err,
            );
            // Decide if we should reject or just log
            reject(err); // Rejecting for now
          });
        }
      });

      stream.on('error', err => {
        console.error('Error scanning keys for pattern deletion:', err);
        reject(err);
      });

      stream.on('end', async () => {
        try {
          if (accumulatedKeys.length > 0) {
            await this.delete(accumulatedKeys);
          }
          resolve();
        } catch (err: unknown) {
          console.error('Error during final pattern delete:', err);
          reject(err);
        }
      });
    });
  }

  async flushdb(): Promise<void> {
    await this.redis.flushdb();
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  client(): Redis {
    return this.redis;
  }
}
