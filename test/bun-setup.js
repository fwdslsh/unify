/**
 * Bun test setup and configuration
 * Global test environment setup, mocks, and utilities
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';

// Track temporary directories created during tests for cleanup
const tempDirs = new Set();

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
  
  // Disable colors in output for consistent test assertions
  process.env.NO_COLOR = '1';
});

// Global test cleanup
afterAll(async () => {
  // Final cleanup of any remaining temp directories
  await cleanupTempDirs();
});

// Per-test setup
beforeEach(() => {
  // Reset any global state if needed
});

// Per-test cleanup
afterEach(async () => {
  // Clean up temp directories created during this test
  await cleanupTempDirs();
});

/**
 * Register a temporary directory for cleanup
 * @param {string} path - Path to temporary directory
 */
export function registerTempDir(path) {
  // Only register valid string paths
  if (typeof path === 'string' && path.length > 0) {
    tempDirs.add(path);
  }
}

/**
 * Cleanup all registered temporary directories
 */
async function cleanupTempDirs() {
  const { rm } = await import('fs/promises');
  
  for (const dir of tempDirs) {
    try {
      // Only attempt cleanup if dir is a valid string path
      if (typeof dir === 'string' && dir.length > 0) {
        await rm(dir, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors, but safely convert dir to string for logging
      const dirStr = typeof dir === 'string' ? dir : String(dir);
      console.warn(`Failed to cleanup temp dir: ${dirStr}`, error.message);
    }
  }
  
  tempDirs.clear();
}

/**
 * Test timeout configuration
 */
export const TEST_TIMEOUTS = {
  unit: 5000,      // 5 seconds for unit tests
  integration: 15000, // 15 seconds for integration tests
  performance: 30000, // 30 seconds for performance tests
  server: 10000    // 10 seconds for server tests
};

/**
 * Test data constants
 */
export const TEST_CONSTANTS = {
  TEMP_DIR_PREFIX: 'unify-test-',
  DEFAULT_TIMEOUT: 5000,
  PERFORMANCE_MEMORY_LIMIT: 100 * 1024 * 1024, // 100MB
  PERFORMANCE_TIME_LIMIT: 5000, // 5 seconds
};

// Make utilities available globally for tests
globalThis.TEST_TIMEOUTS = TEST_TIMEOUTS;
globalThis.TEST_CONSTANTS = TEST_CONSTANTS;
globalThis.registerTempDir = registerTempDir;