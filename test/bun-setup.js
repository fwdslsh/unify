/**
 * Test Setup for Unify CLI
 * Configures test environment
 */

import { beforeAll, beforeEach, afterEach, afterAll } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../src/utils/logger.js';

// Global test configuration
const TEST_CONFIG = {
  timeout: 10000, // 10 seconds
  tempDir: path.join(import.meta.dir, 'temp'),
  fixturesDir: path.join(import.meta.dir, 'fixtures'),
  verbose: process.env.TEST_VERBOSE === 'true'
};

// Track created temp directories for cleanup
const createdTempDirs = new Set();
const createdTempFiles = new Set();

/**
 * Global test setup
 */
beforeAll(async () => {
  console.log('🧪 Setting up test environment...');
  
  // Configure logger for tests
  logger.setLevel(TEST_CONFIG.verbose ? 'DEBUG' : 'ERROR');
  
  // Ensure temp directory exists
  await fs.mkdir(TEST_CONFIG.tempDir, { recursive: true });
  
  // Log runtime info
  console.log(`   Runtime: ${process.release?.name || 'unknown'} (${process.version})`);
  console.log(`   Features: HTMLRewriter=true, fs.watch=true`);
  
  console.log('✅ Test environment ready');
});

/**
 * Test cleanup
 */
afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  
  // Clean up temp files and directories
  await cleanupTempResources();
  
  console.log('✅ Test cleanup complete');
});

/**
 * Per-test setup
 */
beforeEach(async () => {
  // Reset logger level
  logger.setLevel(TEST_CONFIG.verbose ? 'DEBUG' : 'ERROR');
});

/**
 * Per-test cleanup
 */
afterEach(async () => {
  // Clean up any resources created during the test
  await cleanupTempResources();
});

/**
 * Create a temporary directory for testing
 * @param {string} prefix - Directory name prefix
 * @returns {Promise<string>} Path to created directory
 */
export async function createTempDir(prefix = 'test') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const dirName = `${prefix}-${timestamp}-${random}`;
  const dirPath = path.join(TEST_CONFIG.tempDir, dirName);
  
  await fs.mkdir(dirPath, { recursive: true });
  createdTempDirs.add(dirPath);
  
  return dirPath;
}

/**
 * Create a temporary file for testing
 * @param {string} filename - File name
 * @param {string} content - File content
 * @param {string} dir - Directory (optional, uses temp dir)
 * @returns {Promise<string>} Path to created file
 */
export async function createTempFile(filename, content, dir = null) {
  const targetDir = dir || await createTempDir('file');
  const filePath = path.join(targetDir, filename);
  
  await fs.writeFile(filePath, content, 'utf-8');
  createdTempFiles.add(filePath);
  
  return filePath;
}

/**
 * Copy fixture files to temp directory
 * @param {string} fixtureName - Name of fixture directory
 * @returns {Promise<string>} Path to copied fixture
 */
export async function copyFixture(fixtureName) {
  const sourcePath = path.join(TEST_CONFIG.fixturesDir, fixtureName);
  const destPath = await createTempDir(`fixture-${fixtureName}`);
  
  await copyDirectory(sourcePath, destPath);
  return destPath;
}

/**
 * Clean up temporary resources
 */
async function cleanupTempResources() {
  // Clean up temp files
  for (const filePath of createdTempFiles) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // File might already be deleted
    }
  }
  createdTempFiles.clear();
  
  // Clean up temp directories
  for (const dirPath of createdTempDirs) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      // Directory might already be deleted
    }
  }
  createdTempDirs.clear();
}

/**
 * Copy directory recursively
 */
async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}


/**
 * Wait for a condition to be true
 * @param {Function} condition - Condition function
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} interval - Check interval in milliseconds
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Create a mock file system structure
 * @param {Object} structure - File system structure
 * @param {string} basePath - Base path for structure
 */
export async function createMockFS(structure, basePath = null) {
  const base = basePath || await createTempDir('mockfs');
  
  for (const [name, content] of Object.entries(structure)) {
    const fullPath = path.join(base, name);
    
    if (typeof content === 'object' && content !== null) {
      // Directory
      await fs.mkdir(fullPath, { recursive: true });
      await createMockFS(content, fullPath);
    } else {
      // File
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content.toString(), 'utf-8');
      createdTempFiles.add(fullPath);
    }
  }
  
  return base;
}

// Export test configuration and utilities
export { TEST_CONFIG };
export default {
  createTempDir,
  createTempFile,
  copyFixture,
  waitFor,
  createMockFS,
  TEST_CONFIG
};
