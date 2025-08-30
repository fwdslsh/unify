/**
 * Build Cache for Unify
 * Implements US-014: Incremental Build System with Dependency Tracking
 * 
 * Provides persistent build cache with fast change detection using SHA-256 hashes.
 * Enables <1 second incremental builds by avoiding unnecessary file processing.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * BuildCache class for persistent file change detection
 */
export class BuildCache {
  constructor(cacheDir = '.unify-cache') {
    this.cacheDir = cacheDir;
    this.cacheFile = join(cacheDir, 'hash-cache.json');
    this.cache = new Map(); // In-memory cache for fast access
    this.stats = {
      totalFiles: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hashCalculations: 0
    };
  }

  /**
   * Store file hash in cache
   * @param {string} filePath - Path to file
   * @param {string} content - File content (optional, will read if not provided)
   * @returns {Promise<string>} The calculated hash
   */
  async storeFileHash(filePath, content = null) {
    let hash;
    
    if (content !== null) {
      hash = await this.calculateHash(content);
    } else {
      // Read file and calculate hash
      const file = Bun.file(filePath);
      if (await file.exists()) {
        content = await file.text();
        hash = await this.calculateHash(content);
      } else {
        return null;
      }
    }
    
    this.cache.set(filePath, hash);
    this.stats.totalFiles = this.cache.size;
    return hash;
  }

  /**
   * Get cached hash for file
   * @param {string} filePath - Path to file
   * @returns {Promise<string|null>} Cached hash or null if not found
   */
  async getFileHash(filePath) {
    const hash = this.cache.get(filePath);
    if (hash) {
      this.stats.cacheHits++;
      return hash;
    }
    
    this.stats.cacheMisses++;
    return null;
  }

  /**
   * Check if file has changed since last cache
   * @param {string} filePath - Path to file
   * @returns {Promise<boolean>} True if file has changed or is new
   */
  async hasFileChanged(filePath) {
    try {
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        // File doesn't exist, consider it changed
        return true;
      }

      const cachedHash = await this.getFileHash(filePath);
      if (!cachedHash) {
        // No cache entry, consider it changed (new file)
        return true;
      }

      const currentContent = await file.text();
      const currentHash = await this.calculateHash(currentContent);
      
      return currentHash !== cachedHash;
    } catch (error) {
      // If we can't check, assume it changed
      return true;
    }
  }

  /**
   * Check multiple files efficiently
   * @param {string[]} filePaths - Array of file paths
   * @returns {Promise<{changed: string[], unchanged: string[]}>} Results
   */
  async checkMultipleFiles(filePaths) {
    const changed = [];
    const unchanged = [];

    const checkPromises = filePaths.map(async (filePath) => {
      const hasChanged = await this.hasFileChanged(filePath);
      if (hasChanged) {
        changed.push(filePath);
      } else {
        unchanged.push(filePath);
      }
    });

    await Promise.all(checkPromises);
    
    return { changed, unchanged };
  }

  /**
   * Calculate hash of content using Bun's native crypto
   * @param {string} content - Content to hash
   * @returns {Promise<string>} SHA-256 hash
   */
  async calculateHash(content) {
    this.stats.hashCalculations++;
    
    // Use Bun's native crypto hasher for performance
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(content);
    return hasher.digest('hex');
  }

  /**
   * Persist cache to disk
   * @returns {Promise<void>}
   */
  async persistToDisk() {
    try {
      // Ensure cache directory exists
      mkdirSync(this.cacheDir, { recursive: true });
      
      // Convert Map to object for JSON serialization
      const cacheObject = Object.fromEntries(this.cache);
      
      // Write cache file
      writeFileSync(this.cacheFile, JSON.stringify(cacheObject, null, 2));
    } catch (error) {
      // Silently fail - cache is optional
      console.warn('Failed to persist build cache:', error.message);
    }
  }

  /**
   * Load cache from disk
   * @returns {Promise<void>}
   */
  async loadFromDisk() {
    try {
      if (existsSync(this.cacheFile)) {
        const content = readFileSync(this.cacheFile, 'utf8');
        const cacheObject = JSON.parse(content);
        
        // Convert object back to Map
        this.cache = new Map(Object.entries(cacheObject));
        this.stats.totalFiles = this.cache.size;
      }
    } catch (error) {
      // If cache is corrupt or unreadable, start fresh
      this.cache = new Map();
      this.stats.totalFiles = 0;
    }
  }

  /**
   * Clear all cache data
   */
  clear() {
    this.cache.clear();
    this.stats.totalFiles = 0;
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
    this.stats.hashCalculations = 0;
  }

  /**
   * Remove specific file from cache
   * @param {string} filePath - File path to remove
   */
  removeFile(filePath) {
    const deleted = this.cache.delete(filePath);
    if (deleted) {
      this.stats.totalFiles = this.cache.size;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      totalFiles: this.stats.totalFiles,
      cacheSize: this.cache.size,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      hashCalculations: this.stats.hashCalculations,
      hitRatio: this.stats.cacheHits + this.stats.cacheMisses > 0 ? 
        this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) : 0,
      hashMethod: 'native-crypto',
      cacheDirectory: this.cacheDir
    };
  }

  /**
   * Update file hash after processing
   * @param {string} filePath - File path
   * @param {string} content - New content (optional)
   * @returns {Promise<void>}
   */
  async updateFileHash(filePath, content = null) {
    await this.storeFileHash(filePath, content);
  }

  /**
   * Check cache integrity and repair if needed
   * @returns {Promise<{repaired: number, removed: number}>} Repair results
   */
  async repairCache() {
    let repaired = 0;
    let removed = 0;
    
    const entries = Array.from(this.cache.entries());
    
    for (const [filePath, hash] of entries) {
      try {
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          // File no longer exists, remove from cache
          this.cache.delete(filePath);
          removed++;
        } else {
          // Verify hash is still valid format
          if (typeof hash !== 'string' || hash.length !== 64) {
            // Invalid hash, recalculate
            const content = await file.text();
            const newHash = await this.calculateHash(content);
            this.cache.set(filePath, newHash);
            repaired++;
          }
        }
      } catch (error) {
        // If we can't verify, remove from cache
        this.cache.delete(filePath);
        removed++;
      }
    }
    
    this.stats.totalFiles = this.cache.size;
    
    return { repaired, removed };
  }

  /**
   * Get cache efficiency metrics
   * @returns {Object} Efficiency metrics
   */
  getEfficiencyMetrics() {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    
    return {
      hitRatio: total > 0 ? this.stats.cacheHits / total : 0,
      missRatio: total > 0 ? this.stats.cacheMisses / total : 0,
      totalQueries: total,
      avgHashCalculationsPerFile: this.stats.totalFiles > 0 ? 
        this.stats.hashCalculations / this.stats.totalFiles : 0,
      cacheUtilization: this.cache.size > 0 ? this.cache.size / this.stats.totalFiles : 0
    };
  }
}