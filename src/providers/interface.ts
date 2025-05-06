/**
 * Defines the contract for a cache provider.
 * Implement this interface to support different caching backends (e.g., iovalkey, ioredis).
 */
export interface CacheProvider {
  /**
   * Retrieves a value from the cache.
   * @param key The cache key.
   * @returns A promise resolving to the cached value (string or buffer) or null if not found.
   */
  get(key: string): Promise<string | Buffer | null>;

  /**
   * Retrieves a JSON value from the cache.
   * Assumes the provider handles deserialization.
   * @param key The cache key.
   * @returns A promise resolving to the parsed JSON value or null if not found or parsing fails.
   */
  // biome-ignore lint/suspicious/noExplicitAny: <Can return any JSON>
  getJson<T = any>(key: string): Promise<T | null>;

  /**
   * Stores a value in the cache.
   * @param key The cache key.
   * @param value The value to store (will be serialized).
   * @param ttl Time-to-live in seconds. If 0 or undefined, uses default or infinite TTL.
   * @returns A promise resolving when the set operation is complete.
   */
  set(key: string, value: string | Buffer, ttl?: number): Promise<void>;

  /**
   * Stores a JSON value in the cache.
   * Assumes the provider handles serialization.
   * @param key The cache key.
   * @param value The JSON value to store.
   * @param ttl Time-to-live in seconds. If 0 or undefined, uses default or infinite TTL.
   * @returns A promise resolving when the set operation is complete.
   */
  // biome-ignore lint/suspicious/noExplicitAny: <Can set any JSON>
  setJson<T = any>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Checks if a key exists in the cache.
   * @param key The cache key.
   * @returns A promise resolving to true if the key exists, false if it does not.
   */
  exists(key: string): Promise<boolean>;

  /**
   * Deletes one or more keys from the cache.
   * @param keys An array of keys to delete.
   * @returns A promise resolving when the deletion is complete.
   */
  delete(keys: string[]): Promise<void>;

  /**
   * Deletes keys matching a pattern.
   * Note: This can be inefficient on large datasets depending on the provider implementation (e.g., using SCAN).
   * @param pattern The pattern to match keys against (e.g., 'user:*').
   * @returns A promise resolving when the pattern deletion is complete.
   */
  deletePattern(pattern: string): Promise<void>;

  /**
   * Flushes the entire cache.
   * @returns A promise resolving when the flush is complete.
   */
  flushdb(): Promise<void>;

  /**
   * Disconnects the cache client.
   * @returns A promise resolving when disconnected.
   */
  disconnect(): Promise<void>;

  /**
   * Returns the underlying cache client instance (e.g., iovalkey or ioredis instance).
   * Type casting might be necessary depending on the provider.
   */
  // biome-ignore lint/suspicious/noExplicitAny: <Client can be any type>
  client(): any;
}
