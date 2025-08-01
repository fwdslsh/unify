/**
 * Temporary directory helpers for testing
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Create a temporary directory for testing
 * @returns {Promise<string>} Path to temporary directory
 */
export async function createTempDirectory() {
  const tempBase = os.tmpdir();
  const tempName = `dompile-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const tempPath = path.join(tempBase, tempName);
  
  await fs.mkdir(tempPath, { recursive: true });
  return tempPath;
}

/**
 * Clean up temporary directory
 * @param {string} tempPath - Path to temporary directory
 */
export async function cleanupTempDirectory(tempPath) {
  if (tempPath && tempPath.includes('dompile-test-')) {
    await fs.rm(tempPath, { recursive: true, force: true });
  }
}

/**
 * Create a test file in temporary directory
 * @param {string} tempDir - Temporary directory path
 * @param {string} filename - File name
 * @param {string} content - File content
 * @returns {Promise<string>} Full path to created file
 */
export async function createTestFile(tempDir, filename, content) {
  const filePath = path.join(tempDir, filename);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Create a test directory structure
 * @param {string} tempDir - Base temporary directory
 * @param {Object} structure - Directory structure object
 */
export async function createTestStructure(tempDir, structure) {
  for (const [name, content] of Object.entries(structure)) {
    const fullPath = path.join(tempDir, name);
    
    if (typeof content === 'string') {
      // It's a file
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    } else if (typeof content === 'object') {
      // It's a directory
      await fs.mkdir(fullPath, { recursive: true });
      await createTestStructure(fullPath, content);
    }
  }
}