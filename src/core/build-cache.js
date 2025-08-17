/**
 * Build Cache for Unify CLI
 * Provides efficient file tracking and build caching
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

export class BuildCache {
  constructor(cacheDir = '.unify-cache') {
    this.cacheDir = cacheDir;
    this.hashCache = new Map();
    this.dependencyGraph = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the build cache
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      // Load existing cache if available
      await this.loadCache();
      
      this.isInitialized = true;
      logger.debug(`Build cache initialized at ${this.cacheDir}`);
    } catch (error) {
      logger.warn('Failed to initialize build cache:', error.message);
    }
  }

  /**
   * Generate hash for file using Bun's native hashing
   * @param {string} filePath - Path to the file
   * @returns {Promise<string>} File hash
   */
  async hashFile(filePath) {
    try {
      const file = Bun.file(filePath);
      const arrayBuffer = await file.arrayBuffer();
      
      // Use Bun's native hash function (SHA-256 by default)
      const hasher = new Bun.CryptoHasher('sha256');
      hasher.update(arrayBuffer);
      return hasher.digest('hex');
    } catch (error) {
      logger.warn(`Failed to hash file ${filePath}:`, error.message);
      return 'error';
    }
  }

  /**
   * Generate hash for string content using Bun's native hashing
   * @param {string} content - Content to hash
   * @returns {string} Content hash
   */
  hashContent(content) {
    try {
      const hasher = new Bun.CryptoHasher('sha256');
      hasher.update(content);
      return hasher.digest('hex');
    } catch (error) {
      logger.warn('Failed to hash content:', error.message);
      return 'error';
    }
  }

  /**
   * Check if a file has changed since last build
   * @param {string} filePath - Path to the file
   * @returns {Promise<boolean>} True if file has changed
   */
  async hasFileChanged(filePath) {
    const currentHash = await this.hashFile(filePath);
    const cachedHash = this.hashCache.get(filePath);
    
    const hasChanged = currentHash !== cachedHash;
    
    if (hasChanged) {
      logger.debug(`File changed: ${filePath}`);
      this.hashCache.set(filePath, currentHash);
    }
    
    return hasChanged;
  }

  /**
   * Update hash cache for a file
   * @param {string} filePath - Path to the file
   * @param {string} [hash] - Pre-computed hash (optional)
   */
  async updateFileHash(filePath, hash = null) {
    const fileHash = hash || await this.hashFile(filePath);
    this.hashCache.set(filePath, fileHash);
  }

  /**
   * Check if any dependencies of a file have changed
   * @param {string} filePath - Path to the main file
   * @returns {Promise<boolean>} True if any dependency has changed
   */
  async haveDependenciesChanged(filePath) {
    const dependencies = this.dependencyGraph.get(filePath) || [];
    
    for (const depPath of dependencies) {
      if (await this.hasFileChanged(depPath)) {
        logger.debug(`Dependency changed: ${depPath} affects ${filePath}`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Set dependencies for a file
   * @param {string} filePath - Path to the main file
   * @param {string[]} dependencies - Array of dependency paths
   */
  setDependencies(filePath, dependencies) {
    this.dependencyGraph.set(filePath, [...dependencies]);
  }

  /**
   * Add a dependency to a file
   * @param {string} filePath - Path to the main file
   * @param {string} dependencyPath - Path to the dependency
   */
  addDependency(filePath, dependencyPath) {
    if (!this.dependencyGraph.has(filePath)) {
      this.dependencyGraph.set(filePath, []);
    }
    
    const dependencies = this.dependencyGraph.get(filePath);
    if (!dependencies.includes(dependencyPath)) {
      dependencies.push(dependencyPath);
    }
  }

  /**
   * Check if a build output is up-to-date
   * @param {string} inputPath - Path to the input file
   * @param {string} outputPath - Path to the output file
   * @returns {Promise<boolean>} True if output is up-to-date
   */
  async isUpToDate(inputPath, outputPath) {
    try {
      // Check if output file exists
      await fs.access(outputPath);
      
      // Check if input file has changed
      if (await this.hasFileChanged(inputPath)) {
        return false;
      }
      
      // Check if any dependencies have changed
      if (await this.haveDependenciesChanged(inputPath)) {
        return false;
      }
      
      return true;
    } catch (error) {
      // Output file doesn't exist or can't be accessed
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      cachedFiles: this.hashCache.size,
      dependencyGraphSize: this.dependencyGraph.size,
      cacheDir: this.cacheDir,
      hashingMethod: 'native-crypto'
    };
  }

  /**
   * Load cache from disk
   */
  async loadCache() {
    const cacheFilePath = path.join(this.cacheDir, 'hash-cache.json');
    const depsFilePath = path.join(this.cacheDir, 'deps-cache.json');
    
    try {
      // Load hash cache
      const hashCacheData = await fs.readFile(cacheFilePath, 'utf-8');
      const hashData = JSON.parse(hashCacheData);
      this.hashCache = new Map(Object.entries(hashData));
      
      // Load dependency graph
      const depsCacheData = await fs.readFile(depsFilePath, 'utf-8');
      const depsData = JSON.parse(depsCacheData);
      this.dependencyGraph = new Map(Object.entries(depsData));
      
      logger.debug(`Loaded cache: ${this.hashCache.size} files, ${this.dependencyGraph.size} dependency entries`);
    } catch (error) {
      // Cache files don't exist or are corrupted, start fresh
      logger.debug('No existing cache found, starting fresh');
    }
  }

  /**
   * Save cache to disk
   */
  async saveCache() {
    if (!this.isInitialized) return;
    
    const cacheFilePath = path.join(this.cacheDir, 'hash-cache.json');
    const depsFilePath = path.join(this.cacheDir, 'deps-cache.json');
    
    try {
      // Save hash cache
      const hashData = Object.fromEntries(this.hashCache);
      await fs.writeFile(cacheFilePath, JSON.stringify(hashData, null, 2));
      
      // Save dependency graph
      const depsData = Object.fromEntries(this.dependencyGraph);
      await fs.writeFile(depsFilePath, JSON.stringify(depsData, null, 2));
      
      logger.debug('Build cache saved to disk');
    } catch (error) {
      logger.warn('Failed to save cache:', error.message);
    }
  }

  /**
   * Clear the entire cache
   */
  async clearCache() {
    this.hashCache.clear();
    this.dependencyGraph.clear();
    
    try {
      // Remove cache files
      const cacheFilePath = path.join(this.cacheDir, 'hash-cache.json');
      const depsFilePath = path.join(this.cacheDir, 'deps-cache.json');
      
      await fs.unlink(cacheFilePath).catch(() => {});
      await fs.unlink(depsFilePath).catch(() => {});
      
      logger.info('Build cache cleared');
    } catch (error) {
      logger.warn('Error clearing cache files:', error.message);
    }
  }

  /**
   * Generate a composite hash for multiple files
   * @param {string[]} filePaths - Array of file paths
   * @returns {Promise<string>} Composite hash
   */
  async hashFiles(filePaths) {
    const hashes = await Promise.all(
      filePaths.map(filePath => this.hashFile(filePath))
    );
    
    const combinedHash = hashes.join('|');
    return await this.hashContent(combinedHash);
  }

  /**
   * Check if any file in a group has changed
   * @param {string[]} filePaths - Array of file paths
   * @param {string} cacheKey - Cache key for the group
   * @returns {Promise<boolean>} True if any file has changed
   */
  async hasGroupChanged(filePaths, cacheKey) {
    const currentHash = await this.hashFiles(filePaths);
    const cachedHash = this.hashCache.get(cacheKey);
    
    const hasChanged = currentHash !== cachedHash;
    
    if (hasChanged) {
      this.hashCache.set(cacheKey, currentHash);
    }
    
    return hasChanged;
  }
}

/**
 * Factory function to create build cache instance
 * @param {string} cacheDir - Cache directory path
 * @returns {BuildCache} Cache instance
 */
export function createBuildCache(cacheDir = '.unify-cache') {
  const cache = new BuildCache(cacheDir);
  return cache;
}

/**
 * Clear cache on restart for serve/watch commands
 * @param {string} cacheDir - Cache directory path
 */
export async function clearCacheOnRestart(cacheDir = '.unify-cache') {
  const cache = new BuildCache(cacheDir);
  await cache.initialize();
  await cache.clearCache();
  logger.info('Build cache cleared for fresh start');
}