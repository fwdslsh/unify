/**
 * TempProject Test Helper
 * Provides utilities for creating temporary project directories for testing
 */

import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

/**
 * TempProject manages temporary directories and files for testing
 */
export class TempProject {
  constructor() {
    this.basePath = `/tmp/unify-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    mkdirSync(this.basePath, { recursive: true });
  }

  /**
   * Add a file to the temporary project
   * @param {string} relativePath - Path relative to project root
   * @param {string} content - File content
   */
  async addFile(relativePath, content) {
    const fullPath = join(this.basePath, relativePath);
    const dir = dirname(fullPath);
    
    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(fullPath, content);
  }

  /**
   * Write a file to the temporary project (alias for addFile)
   * @param {string} relativePath - Path relative to project root
   * @param {string} content - File content
   */
  async writeFile(relativePath, content) {
    return this.addFile(relativePath, content);
  }

  /**
   * Get the full path to a file/directory in the project
   * @param {string} relativePath - Path relative to project root
   * @returns {string} Full path
   */
  path(relativePath = '') {
    return join(this.basePath, relativePath);
  }

  /**
   * Check if a directory exists
   * @param {string} relativePath - Path relative to project root
   * @returns {boolean} True if directory exists
   */
  async directoryExists(relativePath) {
    return existsSync(this.path(relativePath));
  }

  /**
   * Check if a file exists
   * @param {string} relativePath - Path relative to project root
   * @returns {boolean} True if file exists
   */
  async fileExists(relativePath) {
    return existsSync(this.path(relativePath));
  }

  /**
   * Clean up the temporary project directory
   */
  async cleanup() {
    if (existsSync(this.basePath)) {
      rmSync(this.basePath, { recursive: true, force: true });
    }
  }
}