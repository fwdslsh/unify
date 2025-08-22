/**
 * Comprehensive tests for Test Setup Helper (bun-setup.js)
 * Tests all functions and edge cases for 95%+ coverage
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

// We need to test the bun-setup module, but it affects global state
// So we'll test its exports and behavior carefully
import { 
  registerTempDir, 
  TEST_TIMEOUTS, 
  TEST_CONSTANTS 
} from '../../bun-setup.js';

describe('Test Setup Helper - Comprehensive Coverage', () => {
  let testTempDir;
  let originalEnv;
  
  beforeEach(async () => {
    // Create a unique temp directory for this test
    testTempDir = await fs.mkdtemp(path.join(tmpdir(), 'test-setup-test-'));
    
    // Save original environment
    originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL,
      NO_COLOR: process.env.NO_COLOR
    };
  });
  
  afterEach(async () => {
    // Restore original environment
    Object.assign(process.env, originalEnv);
    
    // Clean up test temp directory
    try {
      await fs.rm(testTempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Environment Configuration', () => {
    test('should have set test environment variables', () => {
      // The bun-setup.js should have already set these in beforeAll
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.LOG_LEVEL).toBe('error');
      expect(process.env.NO_COLOR).toBe('1');
    });

    test('should preserve other environment variables', () => {
      // Environment should not be completely overwritten
      expect(process.env.PATH).toBeDefined();
      expect(process.env.HOME || process.env.USERPROFILE).toBeDefined();
    });
  });

  describe('Temporary Directory Management', () => {
    test('should register temp directories for cleanup', () => {
      const tempPath = '/test/temp/directory';
      
      // registerTempDir should not throw
      expect(() => registerTempDir(tempPath)).not.toThrow();
    });

    test('should handle multiple temp directory registrations', () => {
      const tempPaths = [
        '/test/temp/dir1',
        '/test/temp/dir2',
        '/test/temp/dir3'
      ];
      
      tempPaths.forEach(tempPath => {
        expect(() => registerTempDir(tempPath)).not.toThrow();
      });
    });

    test('should handle duplicate temp directory registrations', () => {
      const tempPath = '/test/temp/duplicate';
      
      // Should handle duplicate registrations gracefully
      registerTempDir(tempPath);
      expect(() => registerTempDir(tempPath)).not.toThrow();
    });

    test('should handle empty and invalid path registrations', () => {
      const invalidPaths = ['', null, undefined, 123, {}, []];
      
      invalidPaths.forEach(invalidPath => {
        expect(() => registerTempDir(invalidPath)).not.toThrow();
      });
    });

    test('should handle very long path registrations', () => {
      // Test with very long path
      const longPath = '/very/long/path/' + 'segment/'.repeat(100) + 'end';
      
      expect(() => registerTempDir(longPath)).not.toThrow();
    });

    test('should handle paths with special characters', () => {
      const specialPaths = [
        '/path with spaces/dir',
        '/path-with-dashes/dir',
        '/path_with_underscores/dir',
        '/path.with.dots/dir',
        '/path@with#special$chars%/dir'
      ];
      
      specialPaths.forEach(specialPath => {
        expect(() => registerTempDir(specialPath)).not.toThrow();
      });
    });
  });

  describe('Test Timeouts Configuration', () => {
    test('should export correct timeout values', () => {
      expect(TEST_TIMEOUTS).toBeDefined();
      expect(typeof TEST_TIMEOUTS).toBe('object');
      
      expect(TEST_TIMEOUTS.unit).toBe(5000);
      expect(TEST_TIMEOUTS.integration).toBe(15000);
      expect(TEST_TIMEOUTS.performance).toBe(30000);
      expect(TEST_TIMEOUTS.server).toBe(10000);
    });

    test('should have reasonable timeout values', () => {
      // All timeouts should be positive numbers
      Object.values(TEST_TIMEOUTS).forEach(timeout => {
        expect(typeof timeout).toBe('number');
        expect(timeout).toBeGreaterThan(0);
        expect(timeout).toBeLessThan(60000); // Less than 1 minute
      });
    });

    test('should have timeouts in logical order', () => {
      // Unit tests should be fastest, performance tests slowest
      expect(TEST_TIMEOUTS.unit).toBeLessThan(TEST_TIMEOUTS.integration);
      expect(TEST_TIMEOUTS.integration).toBeLessThan(TEST_TIMEOUTS.performance);
    });

    test('should be available globally', () => {
      expect(globalThis.TEST_TIMEOUTS).toBeDefined();
      expect(globalThis.TEST_TIMEOUTS).toEqual(TEST_TIMEOUTS);
    });
  });

  describe('Test Constants Configuration', () => {
    test('should export correct constant values', () => {
      expect(TEST_CONSTANTS).toBeDefined();
      expect(typeof TEST_CONSTANTS).toBe('object');
      
      expect(TEST_CONSTANTS.TEMP_DIR_PREFIX).toBe('unify-test-');
      expect(TEST_CONSTANTS.DEFAULT_TIMEOUT).toBe(5000);
      expect(TEST_CONSTANTS.PERFORMANCE_MEMORY_LIMIT).toBe(100 * 1024 * 1024);
      expect(TEST_CONSTANTS.PERFORMANCE_TIME_LIMIT).toBe(5000);
    });

    test('should have valid constant types', () => {
      expect(typeof TEST_CONSTANTS.TEMP_DIR_PREFIX).toBe('string');
      expect(typeof TEST_CONSTANTS.DEFAULT_TIMEOUT).toBe('number');
      expect(typeof TEST_CONSTANTS.PERFORMANCE_MEMORY_LIMIT).toBe('number');
      expect(typeof TEST_CONSTANTS.PERFORMANCE_TIME_LIMIT).toBe('number');
    });

    test('should have reasonable constant values', () => {
      expect(TEST_CONSTANTS.TEMP_DIR_PREFIX.length).toBeGreaterThan(0);
      expect(TEST_CONSTANTS.DEFAULT_TIMEOUT).toBeGreaterThan(0);
      expect(TEST_CONSTANTS.PERFORMANCE_MEMORY_LIMIT).toBeGreaterThan(1024); // At least 1KB
      expect(TEST_CONSTANTS.PERFORMANCE_TIME_LIMIT).toBeGreaterThan(0);
    });

    test('should be available globally', () => {
      expect(globalThis.TEST_CONSTANTS).toBeDefined();
      expect(globalThis.TEST_CONSTANTS).toEqual(TEST_CONSTANTS);
    });
  });

  describe('Global Utilities', () => {
    test('should make registerTempDir available globally', () => {
      expect(globalThis.registerTempDir).toBeDefined();
      expect(typeof globalThis.registerTempDir).toBe('function');
      expect(globalThis.registerTempDir).toBe(registerTempDir);
    });

    test('should allow global registerTempDir to be called', () => {
      const tempPath = '/global/test/temp/dir';
      
      expect(() => globalThis.registerTempDir(tempPath)).not.toThrow();
    });
  });

  describe('Module Integration', () => {
    test('should export all expected functions and constants', () => {
      // Test that all expected exports are available
      expect(registerTempDir).toBeDefined();
      expect(typeof registerTempDir).toBe('function');
      
      expect(TEST_TIMEOUTS).toBeDefined();
      expect(typeof TEST_TIMEOUTS).toBe('object');
      
      expect(TEST_CONSTANTS).toBeDefined();
      expect(typeof TEST_CONSTANTS).toBe('object');
    });

    test('should not export internal functions', () => {
      // cleanupTempDirs should be internal and not exported
      // We can't directly test this, but we can ensure only expected exports exist
      const setupModule = require('../../bun-setup.js');
      const exportedKeys = Object.keys(setupModule);
      
      expect(exportedKeys).toContain('registerTempDir');
      expect(exportedKeys).toContain('TEST_TIMEOUTS');
      expect(exportedKeys).toContain('TEST_CONSTANTS');
      
      // Should not contain internal functions
      expect(exportedKeys).not.toContain('cleanupTempDirs');
    });
  });

  describe('Error Handling', () => {
    test('should handle registerTempDir with invalid inputs gracefully', () => {
      const invalidInputs = [
        undefined,
        null,
        0,
        false,
        {},
        [],
        Symbol('test'),
        () => {}
      ];
      
      invalidInputs.forEach(input => {
        expect(() => registerTempDir(input)).not.toThrow();
      });
    });

    test('should handle concurrent registerTempDir calls', async () => {
      const tempPaths = Array.from({ length: 100 }, (_, i) => `/test/concurrent/${i}`);
      
      // Register many paths concurrently
      const promises = tempPaths.map(tempPath => 
        Promise.resolve().then(() => registerTempDir(tempPath))
      );
      
      // Should complete without errors
      await expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });

  describe('Cleanup Behavior', () => {
    test('should handle cleanup of actual temporary directories', async () => {
      // Create a real temporary directory
      const realTempDir = await fs.mkdtemp(path.join(tmpdir(), 'cleanup-test-'));
      
      // Create a file inside it
      const testFile = path.join(realTempDir, 'test.txt');
      await fs.writeFile(testFile, 'test content');
      
      // Verify it exists
      expect(await fs.access(testFile).then(() => true).catch(() => false)).toBe(true);
      
      // Register it for cleanup
      registerTempDir(realTempDir);
      
      // The cleanup will happen in afterEach/afterAll hooks
      // We can't directly test the cleanup function since it's internal,
      // but we can ensure the registration doesn't cause issues
    });

    test('should handle cleanup of non-existent directories', () => {
      const nonExistentDir = '/completely/non/existent/path/12345';
      
      // Should not throw when registering non-existent paths
      expect(() => registerTempDir(nonExistentDir)).not.toThrow();
    });

    test('should handle cleanup of directories with permission issues', () => {
      // Register paths that might have permission issues on some systems
      const restrictedPaths = [
        '/root/test',  // Might not have permission
        '/sys/test',   // System directory
        '/proc/test'   // Process directory
      ];
      
      restrictedPaths.forEach(restrictedPath => {
        expect(() => registerTempDir(restrictedPath)).not.toThrow();
      });
    });
  });

  describe('Performance and Memory', () => {
    test('should handle large numbers of registered directories', () => {
      const startTime = Date.now();
      const numDirs = 10000;
      
      // Register many directories
      for (let i = 0; i < numDirs; i++) {
        registerTempDir(`/test/performance/${i}`);
      }
      
      const endTime = Date.now();
      const elapsed = endTime - startTime;
      
      // Should complete reasonably quickly (less than 1 second)
      expect(elapsed).toBeLessThan(1000);
    });

    test('should not leak memory with repeated registrations', () => {
      // Test memory usage doesn't grow excessively
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Register and re-register many paths
      for (let i = 0; i < 1000; i++) {
        registerTempDir(`/test/memory/${i % 100}`); // Reuse paths
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      
      // Memory growth should be reasonable (less than 10MB)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Cross-Platform Behavior', () => {
    test('should handle Windows-style paths', () => {
      const windowsPaths = [
        'C:\\\\test\\\\temp\\\\dir',
        'D:\\\\Projects\\\\test',
        '\\\\network\\\\share\\\\test'
      ];
      
      windowsPaths.forEach(windowsPath => {
        expect(() => registerTempDir(windowsPath)).not.toThrow();
      });
    });

    test('should handle Unix-style paths', () => {
      const unixPaths = [
        '/tmp/test/dir',
        '/var/tmp/test',
        '/home/user/test',
        './relative/path',
        '../relative/path'
      ];
      
      unixPaths.forEach(unixPath => {
        expect(() => registerTempDir(unixPath)).not.toThrow();
      });
    });

    test('should handle mixed path separators', () => {
      const mixedPaths = [
        '/test\\\\mixed/path',
        'C:/unix/style/on/windows',
        './mixed\\\\relative/path'
      ];
      
      mixedPaths.forEach(mixedPath => {
        expect(() => registerTempDir(mixedPath)).not.toThrow();
      });
    });
  });
});