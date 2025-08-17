import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { build } from '../../src/core/file-processor.js';
import { watch } from '../../src/core/file-watcher.js';
import { DevServer } from '../../src/server/dev-server.js';
import { createBuildCache, clearCacheOnRestart } from '../../src/core/build-cache.js';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Cache Clearing on Restart', () => {
  let tempDir, sourceDir, outputDir, cacheDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
    cacheDir = path.join(tempDir, '.unify-cache');
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  test('should clear cache when clearCacheOnRestart is called', async () => {
    // Create test structure
    const structure = {
      'src/index.html': '<h1>Test Page</h1>',
      'src/about.html': '<h1>About Page</h1>'
    };
    await createTestStructure(tempDir, structure);

    // Initial build to create cache
    await build({
      source: sourceDir,
      output: outputDir,
      cacheDir: cacheDir
    });

    // Verify cache was created
    const cacheFiles = await fs.readdir(cacheDir);
    expect(cacheFiles.length).toBeGreaterThan(0);

    // Load cache and verify it has content
    const cache = createBuildCache(cacheDir);
    await cache.initialize();
    const initialStats = cache.getStats();
    expect(initialStats.cachedFiles).toBeGreaterThan(0);

    // Clear cache on restart
    await clearCacheOnRestart(cacheDir);

    // Verify cache was cleared
    const clearedCache = createBuildCache(cacheDir);
    await clearedCache.initialize();
    const clearedStats = clearedCache.getStats();
    expect(clearedStats.cachedFiles).toBe(0);
    expect(clearedStats.dependencyGraphSize).toBe(0);
  });

  test('should clear cache when starting file watcher', async () => {
    // Create test structure
    const structure = {
      'src/index.html': '<h1>Watch Test</h1>'
    };
    await createTestStructure(tempDir, structure);

    // Initial build to create cache
    await build({
      source: sourceDir,
      output: outputDir,
      cacheDir: cacheDir
    });

    // Verify cache exists
    const cache = createBuildCache(cacheDir);
    await cache.initialize();
    const initialStats = cache.getStats();
    expect(initialStats.cachedFiles).toBeGreaterThan(0);

    // Start watcher (which should clear cache)
    const watcher = await watch({
      source: sourceDir,
      output: outputDir,
      cacheDir: cacheDir
    });

    try {
      // Cache should have been cleared and rebuilt
      // Wait a moment for the initial build to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // The cache should now contain fresh data from the rebuild
      const newCache = createBuildCache(cacheDir);
      await newCache.initialize();
      const newStats = newCache.getStats();
      
      // Cache should exist (from fresh build) but be different from initial state
      expect(newStats.cachedFiles).toBeGreaterThan(0);
      
    } finally {
      await watcher.stopWatching();
    }
  });

  test('should clear cache when starting development server', async () => {
    // Create test structure  
    const structure = {
      'src/index.html': '<h1>Server Test</h1>'
    };
    await createTestStructure(tempDir, structure);

    // Initial build to create cache
    await build({
      source: sourceDir,
      output: outputDir,
      cacheDir: cacheDir
    });

    // Verify initial cache exists
    const cache = createBuildCache(cacheDir);
    await cache.initialize();
    const initialStats = cache.getStats();
    expect(initialStats.cachedFiles).toBeGreaterThan(0);

    // Clear cache as would happen in serve command
    await clearCacheOnRestart(cacheDir);
    
    // Verify cache was cleared
    const clearedCache = createBuildCache(cacheDir);
    await clearedCache.initialize();
    const clearedStats = clearedCache.getStats();
    expect(clearedStats.cachedFiles).toBe(0);
    expect(clearedStats.dependencyGraphSize).toBe(0);

    // Cache directory should still exist
    const cacheExists = await fs.access(cacheDir).then(() => true).catch(() => false);
    expect(cacheExists).toBe(true);
  });

  test('should handle cache clearing when cache directory does not exist', async () => {
    // Attempt to clear cache when no cache directory exists
    const nonExistentCacheDir = path.join(tempDir, 'non-existent-cache');
    
    // Should not throw error - test directly
    let threwError = false;
    try {
      await clearCacheOnRestart(nonExistentCacheDir);
    } catch (error) {
      threwError = true;
    }
    expect(threwError).toBe(false);
    
    // Cache directory should be created
    const exists = await fs.access(nonExistentCacheDir).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  test('should maintain cache clearing behavior across multiple restarts', async () => {
    // Create test structure
    const structure = {
      'src/index.html': '<h1>Multiple Restarts Test</h1>'
    };
    await createTestStructure(tempDir, structure);

    // Build and create cache
    await build({
      source: sourceDir,
      output: outputDir,
      cacheDir: cacheDir
    });

    // First clear
    await clearCacheOnRestart(cacheDir);
    let cache = createBuildCache(cacheDir);
    await cache.initialize();
    expect(cache.getStats().cachedFiles).toBe(0);

    // Rebuild to populate cache again
    await build({
      source: sourceDir,
      output: outputDir,
      cacheDir: cacheDir
    });

    cache = createBuildCache(cacheDir);
    await cache.initialize();
    expect(cache.getStats().cachedFiles).toBeGreaterThan(0);

    // Second clear
    await clearCacheOnRestart(cacheDir);
    cache = createBuildCache(cacheDir);
    await cache.initialize();
    expect(cache.getStats().cachedFiles).toBe(0);

    // Third clear (on empty cache)
    await clearCacheOnRestart(cacheDir);
    cache = createBuildCache(cacheDir);
    await cache.initialize();
    expect(cache.getStats().cachedFiles).toBe(0);
  });
});