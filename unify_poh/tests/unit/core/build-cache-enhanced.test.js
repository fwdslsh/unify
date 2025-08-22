/**
 * Enhanced Build Cache Tests
 * Implements US-014: Incremental Build System with Dependency Tracking
 * 
 * Tests for persistent build cache that enables fast change detection
 * and supports <1 second incremental build requirements.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { BuildCache } from '../../../src/core/build-cache.js';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Enhanced BuildCache', () => {
  let cache;
  let tempDir;
  let cacheDir;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cacheDir = join(tempDir, '.unify-cache');
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(cacheDir, { recursive: true });
    
    cache = new BuildCache(cacheDir);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Cache Storage and Retrieval', () => {
    test('should_store_file_hashes_when_build_completes', async () => {
      // Arrange
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Test content</body></html>';
      writeFileSync(filePath, content);

      // Act
      await cache.storeFileHash(filePath, content);

      // Assert
      const storedHash = await cache.getFileHash(filePath);
      expect(storedHash).toBeTruthy();
      expect(typeof storedHash).toBe('string');
      expect(storedHash.length).toBeGreaterThan(0);
    });

    test('should_retrieve_cached_hashes_when_checking_changes', async () => {
      // Arrange
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Test content</body></html>';
      writeFileSync(filePath, content);

      const expectedHash = await cache.calculateHash(content);
      await cache.storeFileHash(filePath, content);

      // Act
      const retrievedHash = await cache.getFileHash(filePath);

      // Assert
      expect(retrievedHash).toBe(expectedHash);
    });

    test('should_persist_cache_to_disk_when_build_ends', async () => {
      // Arrange
      const filePath1 = join(tempDir, 'test1.html');
      const filePath2 = join(tempDir, 'test2.html');
      const content1 = '<html><body>Test content 1</body></html>';
      const content2 = '<html><body>Test content 2</body></html>';
      
      writeFileSync(filePath1, content1);
      writeFileSync(filePath2, content2);

      await cache.storeFileHash(filePath1, content1);
      await cache.storeFileHash(filePath2, content2);

      // Act
      await cache.persistToDisk();

      // Assert
      const cacheFile = join(cacheDir, 'hash-cache.json');
      expect(await Bun.file(cacheFile).exists()).toBe(true);
      
      const cacheData = JSON.parse(readFileSync(cacheFile, 'utf8'));
      
      // Debug: Check if keys match exactly
      const keys = Object.keys(cacheData);
      expect(keys).toContain(filePath1);
      expect(keys).toContain(filePath2);
      expect(Object.keys(cacheData).length).toBe(2);
    });

    test('should_load_cache_from_disk_when_starting', async () => {
      // Arrange
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Test content</body></html>';
      writeFileSync(filePath, content);

      // Store and persist cache
      await cache.storeFileHash(filePath, content);
      await cache.persistToDisk();
      
      // Create new cache instance
      const newCache = new BuildCache(cacheDir);

      // Act
      await newCache.loadFromDisk();

      // Assert
      const retrievedHash = await newCache.getFileHash(filePath);
      const expectedHash = await cache.calculateHash(content);
      expect(retrievedHash).toBe(expectedHash);
    });
  });

  describe('Change Detection', () => {
    test('should_detect_changed_files_when_hash_differs', async () => {
      // Arrange
      const filePath = join(tempDir, 'test.html');
      const originalContent = '<html><body>Original content</body></html>';
      const modifiedContent = '<html><body>Modified content</body></html>';
      
      writeFileSync(filePath, originalContent);
      await cache.storeFileHash(filePath, originalContent);

      // Act
      writeFileSync(filePath, modifiedContent);
      const hasChanged = await cache.hasFileChanged(filePath);

      // Assert
      expect(hasChanged).toBe(true);
    });

    test('should_identify_unchanged_files_when_hash_matches', async () => {
      // Arrange
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Unchanged content</body></html>';
      
      writeFileSync(filePath, content);
      await cache.storeFileHash(filePath, content);

      // Act
      const hasChanged = await cache.hasFileChanged(filePath);

      // Assert
      expect(hasChanged).toBe(false);
    });

    test('should_handle_new_files_when_no_cache_entry', async () => {
      // Arrange
      const filePath = join(tempDir, 'new-file.html');
      const content = '<html><body>New file content</body></html>';
      writeFileSync(filePath, content);

      // Act
      const hasChanged = await cache.hasFileChanged(filePath);

      // Assert
      expect(hasChanged).toBe(true); // New files should be considered "changed"
    });

    test('should_handle_deleted_files_when_cache_entry_exists', async () => {
      // Arrange
      const filePath = join(tempDir, 'deleted-file.html');
      const content = '<html><body>To be deleted</body></html>';
      
      writeFileSync(filePath, content);
      await cache.storeFileHash(filePath, content);
      
      // Delete the file
      rmSync(filePath);

      // Act
      const hasChanged = await cache.hasFileChanged(filePath);

      // Assert
      expect(hasChanged).toBe(true); // Deleted files should be considered "changed"
    });

    test('should_batch_check_multiple_files_efficiently', async () => {
      // Arrange
      const files = [];
      for (let i = 0; i < 100; i++) {
        const filePath = join(tempDir, `file${i}.html`);
        const content = `<html><body>Content ${i}</body></html>`;
        writeFileSync(filePath, content);
        await cache.storeFileHash(filePath, content);
        files.push(filePath);
      }

      // Modify some files
      for (let i = 0; i < 10; i++) {
        const content = `<html><body>Modified content ${i}</body></html>`;
        writeFileSync(files[i], content);
      }

      // Act
      const startTime = Date.now();
      const changes = await cache.checkMultipleFiles(files);
      const endTime = Date.now();

      // Assert
      expect(endTime - startTime).toBeLessThan(500); // Should complete in under 500ms
      expect(changes.changed.length).toBe(10);
      expect(changes.unchanged.length).toBe(90);
      expect(changes.changed.every(file => files.slice(0, 10).includes(file))).toBe(true);
    });
  });

  describe('Performance Requirements', () => {
    test('should_calculate_hashes_in_under_50ms_when_checking_files', async () => {
      // Arrange
      const content = '<html><body>' + 'x'.repeat(10000) + '</body></html>'; // Large content

      // Act
      const startTime = Date.now();
      const hash = await cache.calculateHash(content);
      const endTime = Date.now();

      // Assert
      expect(endTime - startTime).toBeLessThan(50);
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
    });

    test('should_compare_hashes_efficiently_when_many_files', async () => {
      // Arrange
      const files = [];
      for (let i = 0; i < 1000; i++) {
        const filePath = join(tempDir, `file${i}.html`);
        const content = `<html><body>Content ${i}</body></html>`;
        writeFileSync(filePath, content);
        await cache.storeFileHash(filePath, content);
        files.push(filePath);
      }

      // Act
      const startTime = Date.now();
      const changes = await cache.checkMultipleFiles(files);
      const endTime = Date.now();

      // Assert
      expect(endTime - startTime).toBeLessThan(2000); // Should complete in under 2 seconds
      expect(changes.unchanged.length).toBe(1000);
      expect(changes.changed.length).toBe(0);
    });

    test('should_minimize_disk_io_when_checking_cache', async () => {
      // Arrange
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Test content</body></html>';
      writeFileSync(filePath, content);
      
      await cache.storeFileHash(filePath, content);
      await cache.persistToDisk();

      // Create new cache and load from disk
      const newCache = new BuildCache(cacheDir);
      await newCache.loadFromDisk();

      // Act - Check same file multiple times (should use in-memory cache)
      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        await newCache.hasFileChanged(filePath);
      }
      const endTime = Date.now();

      // Assert - Should be very fast due to in-memory caching
      expect(endTime - startTime).toBeLessThan(100);
    });

    test('should_handle_large_cache_files_efficiently', async () => {
      // Arrange - Create large cache with many entries
      for (let i = 0; i < 5000; i++) {
        const filePath = join(tempDir, `file${i}.html`);
        const content = `<html><body>Content ${i}</body></html>`;
        const hash = await cache.calculateHash(content);
        cache.cache.set(filePath, hash);
      }

      // Act - Persist and load large cache
      const startTime = Date.now();
      await cache.persistToDisk();
      
      const newCache = new BuildCache(cacheDir);
      await newCache.loadFromDisk();
      const endTime = Date.now();

      // Assert
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
      expect(newCache.cache.size).toBe(5000);
    });
  });

  describe('Cache Management', () => {
    test('should_clear_cache_when_requested', async () => {
      // Arrange
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Test content</body></html>';
      writeFileSync(filePath, content);
      await cache.storeFileHash(filePath, content);

      expect(cache.cache.size).toBeGreaterThan(0);

      // Act
      cache.clear();

      // Assert
      expect(cache.cache.size).toBe(0);
      const hash = await cache.getFileHash(filePath);
      expect(hash).toBeNull();
    });

    test('should_remove_specific_file_from_cache', async () => {
      // Arrange
      const filePath1 = join(tempDir, 'test1.html');
      const filePath2 = join(tempDir, 'test2.html');
      const content1 = '<html><body>Content 1</body></html>';
      const content2 = '<html><body>Content 2</body></html>';
      
      writeFileSync(filePath1, content1);
      writeFileSync(filePath2, content2);
      
      await cache.storeFileHash(filePath1, content1);
      await cache.storeFileHash(filePath2, content2);

      // Act
      cache.removeFile(filePath1);

      // Assert
      expect(await cache.getFileHash(filePath1)).toBeNull();
      expect(await cache.getFileHash(filePath2)).toBeTruthy();
    });

    test('should_get_cache_statistics', async () => {
      // Arrange
      for (let i = 0; i < 50; i++) {
        const filePath = join(tempDir, `file${i}.html`);
        const content = `<html><body>Content ${i}</body></html>`;
        writeFileSync(filePath, content);
        await cache.storeFileHash(filePath, content);
      }

      // Act
      const stats = cache.getStats();

      // Assert
      expect(stats).toHaveProperty('totalFiles');
      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('hashMethod');
      expect(stats.totalFiles).toBe(50);
      expect(stats.hashMethod).toBe('native-crypto');
    });

    test('should_handle_corrupt_cache_files_gracefully', async () => {
      // Arrange - Create corrupt cache file
      const cacheFile = join(cacheDir, 'hash-cache.json');
      writeFileSync(cacheFile, 'invalid json {{{');

      // Act & Assert - Should not throw error
      const newCache = new BuildCache(cacheDir);
      expect(async () => {
        await newCache.loadFromDisk();
      }).not.toThrow();

      // Should start with empty cache
      expect(newCache.cache.size).toBe(0);
    });
  });

  describe('Integration Scenarios', () => {
    test('should_work_with_dependency_tracker_integration', async () => {
      // Arrange
      const pagePath = join(tempDir, 'page.html');
      const fragmentPath = join(tempDir, '_fragment.html');
      
      const pageContent = '<body data-unify="_fragment.html">Page content</body>';
      const fragmentContent = '<div class="unify-content">Fragment content</div>';
      
      writeFileSync(pagePath, pageContent);
      writeFileSync(fragmentPath, fragmentContent);

      // Act - Cache both files
      await cache.storeFileHash(pagePath, pageContent);
      await cache.storeFileHash(fragmentPath, fragmentContent);

      // Check if fragment change affects cache
      const modifiedFragmentContent = '<div class="unify-content">Modified fragment</div>';
      writeFileSync(fragmentPath, modifiedFragmentContent);

      // Assert
      expect(await cache.hasFileChanged(pagePath)).toBe(false); // Page unchanged
      expect(await cache.hasFileChanged(fragmentPath)).toBe(true); // Fragment changed
    });

    test('should_persist_across_build_sessions', async () => {
      // Arrange - First build session
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Test content</body></html>';
      writeFileSync(filePath, content);

      await cache.storeFileHash(filePath, content);
      await cache.persistToDisk();

      // Act - Simulate new build session
      const newCache = new BuildCache(cacheDir);
      await newCache.loadFromDisk();

      // Assert - Cache should be restored
      expect(await newCache.hasFileChanged(filePath)).toBe(false);
      
      // Modify file and check again
      const modifiedContent = '<html><body>Modified content</body></html>';
      writeFileSync(filePath, modifiedContent);
      expect(await newCache.hasFileChanged(filePath)).toBe(true);
    });
  });
});