import {describe, expect, spyOn, test} from 'bun:test';
import {createDebugLogger, noopLogger} from '../../src';
import {DEBUG_LEVELS} from '../../src/constants';

describe('Debug Logger', () => {
  describe('createDebugLogger', () => {
    test('should create logger with default level (off)', () => {
      const logger = createDebugLogger();

      // Mock console methods
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      const infoSpy = spyOn(console, 'info').mockImplementation(() => {});
      const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});

      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');
      logger.debug('test debug');

      // All should be suppressed when level is 'off'
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
      debugSpy.mockRestore();
    });

    test('should log errors when level is error', () => {
      const logger = createDebugLogger('error');

      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      logger.error('test error');
      logger.warn('test warn');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    test('should log errors and warnings when level is warn', () => {
      const logger = createDebugLogger('warn');

      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      const infoSpy = spyOn(console, 'info').mockImplementation(() => {});

      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    });

    test('should log errors, warnings, and info when level is info', () => {
      const logger = createDebugLogger('info');

      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      const infoSpy = spyOn(console, 'info').mockImplementation(() => {});
      const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});

      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');
      logger.debug('test debug');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
      debugSpy.mockRestore();
    });

    test('should log all messages when level is debug', () => {
      const logger = createDebugLogger('debug');

      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      const infoSpy = spyOn(console, 'info').mockImplementation(() => {});
      const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});

      logger.error('test error');
      logger.warn('test warn');
      logger.info('test info');
      logger.debug('test debug');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenCalledTimes(1);

      errorSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
      debugSpy.mockRestore();
    });

    test('should include timestamp and prefix in log messages', () => {
      const logger = createDebugLogger('error');
      let loggedMessage = '';

      const errorSpy = spyOn(console, 'error').mockImplementation(
        (...args: unknown[]) => {
          loggedMessage = String(args[0]);
        },
      );

      logger.error('test message');

      expect(loggedMessage).toContain('[prisma-extension-redis]');
      expect(loggedMessage).toContain('ERROR:');
      // Check for ISO timestamp format
      expect(loggedMessage).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      errorSpy.mockRestore();
    });

    test('should pass additional arguments to console methods', () => {
      const logger = createDebugLogger('debug');
      let capturedArgs: unknown[] = [];

      const debugSpy = spyOn(console, 'debug').mockImplementation(
        (...args: unknown[]) => {
          capturedArgs = args;
        },
      );

      const extraData = {key: 'value', count: 42};
      logger.debug('test message', extraData);

      expect(capturedArgs).toHaveLength(3); // timestamp+prefix, message, extraData
      expect(capturedArgs[1]).toBe('test message');
      expect(capturedArgs[2]).toEqual(extraData);

      debugSpy.mockRestore();
    });
  });

  describe('noopLogger', () => {
    test('should have all logger methods', () => {
      expect(typeof noopLogger.error).toBe('function');
      expect(typeof noopLogger.warn).toBe('function');
      expect(typeof noopLogger.info).toBe('function');
      expect(typeof noopLogger.debug).toBe('function');
    });

    test('should not call any console methods', () => {
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      const infoSpy = spyOn(console, 'info').mockImplementation(() => {});
      const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});

      noopLogger.error('test');
      noopLogger.warn('test');
      noopLogger.info('test');
      noopLogger.debug('test');

      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
      debugSpy.mockRestore();
    });
  });

  describe('DEBUG_LEVELS constant', () => {
    test('should have all expected levels', () => {
      expect(DEBUG_LEVELS.OFF).toBe('off');
      expect(DEBUG_LEVELS.ERROR).toBe('error');
      expect(DEBUG_LEVELS.WARN).toBe('warn');
      expect(DEBUG_LEVELS.INFO).toBe('info');
      expect(DEBUG_LEVELS.DEBUG).toBe('debug');
    });
  });
});
