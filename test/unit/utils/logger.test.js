/**
 * Comprehensive unit tests for logger utility
 * Tests the actual exported logger singleton with complete coverage
 */

import { test, expect, describe, beforeEach, afterEach, spyOn } from 'bun:test';
import { logger } from '../../../src/utils/logger.js';

// Log levels for reference (matches src/utils/logger.js)
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

describe('Logger Utility', () => {
  let originalLevel;
  let consoleSpies;

  beforeEach(() => {
    // Save original logger level for restoration
    originalLevel = logger.level;
    
    // Set up console spies
    consoleSpies = {
      log: spyOn(console, 'log').mockImplementation(() => {}),
      debug: spyOn(console, 'debug').mockImplementation(() => {}),
      warn: spyOn(console, 'warn').mockImplementation(() => {}),
      error: spyOn(console, 'error').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    // Restore original logger level
    logger.setLevel(originalLevel);
    
    // Restore console methods
    Object.values(consoleSpies).forEach(spy => spy.mockRestore());
  });

  describe('Logger Instance', () => {
    test('should have exported logger instance available', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.level).toBe('number');
      expect(typeof logger.setLevel).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.success).toBe('function');
    });

    test('should have valid initial log level', () => {
      expect(logger.level).toBeGreaterThanOrEqual(0);
      expect(logger.level).toBeLessThanOrEqual(3);
      expect(Object.values(LOG_LEVELS)).toContain(logger.level);
    });
  });

  describe('setLevel Method', () => {
    test('should set level using string values', () => {
      logger.setLevel('DEBUG');
      expect(logger.level).toBe(LOG_LEVELS.DEBUG);
      
      logger.setLevel('INFO');
      expect(logger.level).toBe(LOG_LEVELS.INFO);
      
      logger.setLevel('WARN');
      expect(logger.level).toBe(LOG_LEVELS.WARN);
      
      logger.setLevel('ERROR');
      expect(logger.level).toBe(LOG_LEVELS.ERROR);
    });

    test('should handle case insensitive string values', () => {
      logger.setLevel('debug');
      expect(logger.level).toBe(LOG_LEVELS.DEBUG);
      
      logger.setLevel('Info');
      expect(logger.level).toBe(LOG_LEVELS.INFO);
      
      logger.setLevel('WARN');
      expect(logger.level).toBe(LOG_LEVELS.WARN);
    });

    test('should set level using numeric values', () => {
      logger.setLevel(0);
      expect(logger.level).toBe(0);
      
      logger.setLevel(1);
      expect(logger.level).toBe(1);
      
      logger.setLevel(2);
      expect(logger.level).toBe(2);
      
      logger.setLevel(3);
      expect(logger.level).toBe(3);
    });

    test('should fallback to INFO for invalid string values', () => {
      logger.setLevel('INVALID');
      expect(logger.level).toBe(LOG_LEVELS.INFO);
      
      logger.setLevel('trace');
      expect(logger.level).toBe(LOG_LEVELS.INFO);
      
      logger.setLevel('');
      expect(logger.level).toBe(LOG_LEVELS.INFO);
    });

    test('should handle invalid types gracefully', () => {
      const originalLevel = logger.level;
      
      logger.setLevel(null);
      expect(logger.level).toBe(originalLevel); // Should not change
      
      logger.setLevel(undefined);
      expect(logger.level).toBe(originalLevel); // Should not change
      
      logger.setLevel({});
      expect(logger.level).toBe(originalLevel); // Should not change
      
      logger.setLevel([]);
      expect(logger.level).toBe(originalLevel); // Should not change
    });
  });

  describe('Debug Method', () => {
    test('should log debug messages when level is DEBUG', () => {
      logger.setLevel('DEBUG');
      logger.debug('test message');
      
      expect(consoleSpies.debug).toHaveBeenCalledWith('[DEBUG]', 'test message');
      expect(consoleSpies.debug).toHaveBeenCalledTimes(1);
    });

    test('should not log debug messages when level is higher than DEBUG', () => {
      const levels = ['INFO', 'WARN', 'ERROR'];
      
      levels.forEach(level => {
        consoleSpies.debug.mockClear();
        logger.setLevel(level);
        logger.debug('test message');
        
        expect(consoleSpies.debug).not.toHaveBeenCalled();
      });
    });

    test('should handle multiple arguments', () => {
      logger.setLevel('DEBUG');
      logger.debug('message', 'arg1', 42, { key: 'value' });
      
      expect(consoleSpies.debug).toHaveBeenCalledWith('[DEBUG]', 'message', 'arg1', 42, { key: 'value' });
    });

    test('should handle no arguments', () => {
      logger.setLevel('DEBUG');
      logger.debug();
      
      expect(consoleSpies.debug).toHaveBeenCalledWith('[DEBUG]');
    });
  });

  describe('Info Method', () => {
    test('should log info messages when level is DEBUG or INFO', () => {
      const allowedLevels = ['DEBUG', 'INFO'];
      
      allowedLevels.forEach(level => {
        consoleSpies.log.mockClear();
        logger.setLevel(level);
        logger.info('test message');
        
        expect(consoleSpies.log).toHaveBeenCalledWith('[INFO]', 'test message');
        expect(consoleSpies.log).toHaveBeenCalledTimes(1);
      });
    });

    test('should not log info messages when level is higher than INFO', () => {
      const blockedLevels = ['WARN', 'ERROR'];
      
      blockedLevels.forEach(level => {
        consoleSpies.log.mockClear();
        logger.setLevel(level);
        logger.info('test message');
        
        expect(consoleSpies.log).not.toHaveBeenCalled();
      });
    });

    test('should handle multiple arguments', () => {
      logger.setLevel('INFO');
      logger.info('info message', { data: 'test' }, [1, 2, 3]);
      
      expect(consoleSpies.log).toHaveBeenCalledWith('[INFO]', 'info message', { data: 'test' }, [1, 2, 3]);
    });
  });

  describe('Warn Method', () => {
    test('should log warn messages when level allows', () => {
      const allowedLevels = ['DEBUG', 'INFO', 'WARN'];
      
      allowedLevels.forEach(level => {
        consoleSpies.warn.mockClear();
        logger.setLevel(level);
        logger.warn('warning message');
        
        expect(consoleSpies.warn).toHaveBeenCalledWith('[WARN]', 'warning message');
        expect(consoleSpies.warn).toHaveBeenCalledTimes(1);
      });
    });

    test('should not log warn messages when level is ERROR', () => {
      logger.setLevel('ERROR');
      logger.warn('warning message');
      
      expect(consoleSpies.warn).not.toHaveBeenCalled();
    });

    test('should handle complex objects', () => {
      logger.setLevel('WARN');
      const complexObj = { nested: { deep: { value: 'test' } }, array: [1, 2, 3] };
      logger.warn('complex warning', complexObj);
      
      expect(consoleSpies.warn).toHaveBeenCalledWith('[WARN]', 'complex warning', complexObj);
    });
  });

  describe('Error Method', () => {
    test('should log error messages at all levels', () => {
      const allLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      
      allLevels.forEach(level => {
        consoleSpies.error.mockClear();
        logger.setLevel(level);
        logger.error('error message');
        
        expect(consoleSpies.error).toHaveBeenCalledWith('[ERROR]', 'error message');
        expect(consoleSpies.error).toHaveBeenCalledTimes(1);
      });
    });

    test('should handle Error objects', () => {
      logger.setLevel('ERROR');
      const error = new Error('Test error');
      logger.error('Exception occurred', error);
      
      expect(consoleSpies.error).toHaveBeenCalledWith('[ERROR]', 'Exception occurred', error);
    });

    test('should handle stack traces', () => {
      logger.setLevel('ERROR');
      try {
        throw new Error('Test error');
      } catch (err) {
        logger.error('Caught exception:', err.message, err.stack);
        expect(consoleSpies.error).toHaveBeenCalledWith('[ERROR]', 'Caught exception:', err.message, err.stack);
      }
    });
  });

  describe('Success Method', () => {
    test('should log success messages when level allows (DEBUG/INFO)', () => {
      const allowedLevels = ['DEBUG', 'INFO'];
      
      allowedLevels.forEach(level => {
        consoleSpies.log.mockClear();
        logger.setLevel(level);
        logger.success('success message');
        
        expect(consoleSpies.log).toHaveBeenCalledWith('[SUCCESS]', 'success message');
        expect(consoleSpies.log).toHaveBeenCalledTimes(1);
      });
    });

    test('should not log success messages when level is WARN or ERROR', () => {
      const blockedLevels = ['WARN', 'ERROR'];
      
      blockedLevels.forEach(level => {
        consoleSpies.log.mockClear();
        logger.setLevel(level);
        logger.success('success message');
        
        expect(consoleSpies.log).not.toHaveBeenCalled();
      });
    });

    test('should handle operation results', () => {
      logger.setLevel('INFO');
      const result = { status: 'complete', files: 42, duration: '1.2s' };
      logger.success('Build completed', result);
      
      expect(consoleSpies.log).toHaveBeenCalledWith('[SUCCESS]', 'Build completed', result);
    });
  });

  describe('Level Filtering Behavior', () => {
    test('should respect level hierarchy for all methods', () => {
      // Test DEBUG level - all methods should work
      logger.setLevel('DEBUG');
      logger.debug('debug'); logger.info('info'); logger.warn('warn'); logger.error('error'); logger.success('success');
      
      expect(consoleSpies.debug).toHaveBeenCalled();
      expect(consoleSpies.log).toHaveBeenCalledTimes(2); // info + success
      expect(consoleSpies.warn).toHaveBeenCalled();
      expect(consoleSpies.error).toHaveBeenCalled();
      
      // Reset spies
      Object.values(consoleSpies).forEach(spy => spy.mockClear());
      
      // Test INFO level - debug should be blocked
      logger.setLevel('INFO');
      logger.debug('debug'); logger.info('info'); logger.warn('warn'); logger.error('error'); logger.success('success');
      
      expect(consoleSpies.debug).not.toHaveBeenCalled();
      expect(consoleSpies.log).toHaveBeenCalledTimes(2); // info + success
      expect(consoleSpies.warn).toHaveBeenCalled();
      expect(consoleSpies.error).toHaveBeenCalled();
    });

    test('should handle boundary conditions correctly', () => {
      // Test with numeric levels
      logger.setLevel(2); // WARN level
      logger.debug('debug'); logger.info('info'); logger.warn('warn'); logger.error('error');
      
      expect(consoleSpies.debug).not.toHaveBeenCalled();
      expect(consoleSpies.log).not.toHaveBeenCalled(); // info blocked
      expect(consoleSpies.warn).toHaveBeenCalled();
      expect(consoleSpies.error).toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null and undefined arguments', () => {
      logger.setLevel('DEBUG');
      
      logger.debug(null);
      expect(consoleSpies.debug).toHaveBeenCalledWith('[DEBUG]', null);
      
      logger.info(undefined);
      expect(consoleSpies.log).toHaveBeenCalledWith('[INFO]', undefined);
    });

    test('should handle circular reference objects', () => {
      logger.setLevel('DEBUG');
      const circular = { name: 'test' };
      circular.self = circular;
      
      // Should not throw error
      expect(() => {
        logger.debug('circular object', circular);
      }).not.toThrow();
      
      expect(consoleSpies.debug).toHaveBeenCalledWith('[DEBUG]', 'circular object', circular);
    });

    test('should handle very long strings', () => {
      logger.setLevel('INFO');
      const longString = 'x'.repeat(10000);
      
      logger.info('long string', longString);
      expect(consoleSpies.log).toHaveBeenCalledWith('[INFO]', 'long string', longString);
    });

    test('should handle mixed argument types', () => {
      logger.setLevel('DEBUG');
      const mixedArgs = ['string', 42, true, null, undefined, { obj: 'value' }, [1, 2, 3]];
      
      logger.debug('mixed types', ...mixedArgs);
      expect(consoleSpies.debug).toHaveBeenCalledWith('[DEBUG]', 'mixed types', ...mixedArgs);
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle high volume logging efficiently', () => {
      logger.setLevel('DEBUG');
      const startTime = performance.now();
      
      // Log 1000 messages
      for (let i = 0; i < 1000; i++) {
        logger.debug(`Message ${i}`);
      }
      
      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
      expect(consoleSpies.debug).toHaveBeenCalledTimes(1000);
    });

    test('should handle concurrent logging calls', async () => {
      logger.setLevel('INFO');
      
      const promises = Array.from({ length: 100 }, (_, i) => 
        Promise.resolve().then(() => logger.info(`Concurrent message ${i}`))
      );
      
      await Promise.all(promises);
      expect(consoleSpies.log).toHaveBeenCalledTimes(100);
    });

    test('should maintain state during level changes', () => {
      // Test rapid level changes
      for (let i = 0; i < 10; i++) {
        logger.setLevel(i % 4);
        logger.info(`Level change ${i}`);
      }
      
      expect(logger.level).toBe(1); // Final level should be 1 (INFO)
      expect(consoleSpies.log).toHaveBeenCalled();
    });

    test('should handle logging when console methods are undefined', () => {
      // Temporarily remove console method
      const originalDebug = console.debug;
      delete console.debug;
      
      logger.setLevel('DEBUG');
      
      // Should throw error when console method is missing - this is correct behavior
      expect(() => {
        logger.debug('test message');
      }).toThrow('console.debug is not a function');
      
      // Restore console.debug
      console.debug = originalDebug;
    });
  });

  describe('Integration Scenarios', () => {
    test('should work correctly in build process simulation', () => {
      logger.setLevel('INFO');
      
      logger.info('Build started');
      logger.debug('Processing file 1'); // Should be filtered
      logger.warn('Deprecated API usage');
      logger.success('Build completed');
      
      expect(consoleSpies.log).toHaveBeenCalledWith('[INFO]', 'Build started');
      expect(consoleSpies.debug).not.toHaveBeenCalled();
      expect(consoleSpies.warn).toHaveBeenCalledWith('[WARN]', 'Deprecated API usage');
      expect(consoleSpies.log).toHaveBeenCalledWith('[SUCCESS]', 'Build completed');
    });

    test('should handle error reporting scenario', () => {
      logger.setLevel('ERROR');
      
      const error = new Error('File not found');
      logger.debug('Debug info'); // Filtered
      logger.info('Processing'); // Filtered
      logger.warn('Warning'); // Filtered
      logger.error('Critical error occurred', error);
      
      expect(consoleSpies.debug).not.toHaveBeenCalled();
      expect(consoleSpies.log).not.toHaveBeenCalled();
      expect(consoleSpies.warn).not.toHaveBeenCalled();
      expect(consoleSpies.error).toHaveBeenCalledWith('[ERROR]', 'Critical error occurred', error);
    });
  });
});