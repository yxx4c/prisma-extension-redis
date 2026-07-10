import type {CacheConfig, CacheOptions} from './types';

/**
 * Custom error class for validation failures.
 * Provides clear error messages for configuration issues.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates the cache configuration at extension initialization.
 *
 * @param config - The cache configuration to validate
 * @throws {ValidationError} If configuration is invalid
 *
 * @example
 * ```typescript
 * validateConfig({
 *   ttl: 60,
 *   stale: 30,
 *   type: 'JSON',
 *   auto: true,
 * }); // OK
 *
 * validateConfig({
 *   ttl: -1, // throws ValidationError
 *   ...
 * });
 * ```
 */
export const validateConfig = (config: CacheConfig): void => {
  if (config.ttl !== undefined && config.ttl < 0) {
    throw new ValidationError('ttl must be a non-negative number');
  }

  if (config.stale !== undefined && config.stale < 0) {
    throw new ValidationError('stale must be a non-negative number');
  }

  if (config.ttl === 0 && config.stale === 0) {
    throw new ValidationError(
      'ttl and stale cannot both be zero; the entry would never be servable',
    );
  }

  if (config.type && !['JSON', 'STRING'].includes(config.type)) {
    throw new ValidationError('type must be "JSON" or "STRING"');
  }

  if (config.chunkSize !== undefined && config.chunkSize < 1) {
    throw new ValidationError('chunkSize must be at least 1');
  }

  if (
    config.maxConcurrentBatches !== undefined &&
    config.maxConcurrentBatches < 1
  ) {
    throw new ValidationError('maxConcurrentBatches must be at least 1');
  }

  // Validate auto-cache config if it's an object
  if (typeof config.auto === 'object' && config.auto !== null) {
    if (config.auto.includedModels && config.auto.excludedModels) {
      throw new ValidationError(
        'auto.includedModels and auto.excludedModels are mutually exclusive',
      );
    }

    if (config.auto.includedModels && config.auto.models) {
      for (const modelConfig of config.auto.models) {
        if (!config.auto.includedModels.includes(modelConfig.model)) {
          throw new ValidationError(
            `auto.models[${modelConfig.model}] is not listed in auto.includedModels`,
          );
        }
      }
    }

    if (config.auto.ttl !== undefined && config.auto.ttl < 0) {
      throw new ValidationError('auto.ttl must be a non-negative number');
    }

    if (config.auto.stale !== undefined && config.auto.stale < 0) {
      throw new ValidationError('auto.stale must be a non-negative number');
    }

    // Validate model-specific configs
    if (config.auto.models) {
      for (const modelConfig of config.auto.models) {
        if (modelConfig.ttl !== undefined && modelConfig.ttl < 0) {
          throw new ValidationError(
            `auto.models[${modelConfig.model}].ttl must be a non-negative number`,
          );
        }

        if (modelConfig.stale !== undefined && modelConfig.stale < 0) {
          throw new ValidationError(
            `auto.models[${modelConfig.model}].stale must be a non-negative number`,
          );
        }
      }
    }
  }
};

/**
 * Validates cache options for individual requests.
 *
 * @param options - The cache options to validate
 * @throws {ValidationError} If options are invalid
 *
 * @example
 * ```typescript
 * validateCacheOptions({
 *   key: 'user:1',
 *   ttl: 60,
 * }); // OK
 *
 * validateCacheOptions({
 *   key: '', // throws ValidationError - empty key
 * });
 * ```
 */
export const validateCacheOptions = (options: CacheOptions): void => {
  if (!options.key || options.key.trim() === '') {
    throw new ValidationError('Cache key cannot be empty');
  }

  if (options.ttl !== undefined && options.ttl < 0) {
    throw new ValidationError('ttl must be a non-negative number');
  }

  // Check if stale is set without ttl (stale requires ttl)
  if ('stale' in options && options.stale !== undefined) {
    if (!('ttl' in options) || options.ttl === undefined) {
      throw new ValidationError('stale cannot be set without ttl');
    }

    if (options.stale < 0) {
      throw new ValidationError('stale must be a non-negative number');
    }

    if (options.ttl === 0 && options.stale === 0) {
      throw new ValidationError(
        'ttl and stale cannot both be zero; the entry would never be servable',
      );
    }
  }
};
