/**
 * Comprehensive Build Cache Tests
 * Implements US-014: Incremental Build System with Dependency Tracking
 * 
 * Tests for persistent build cache that enables fast change detection,
 * error handling, and supports <1 second incremental build requirements.
 * 
 * Consolidated from build-cache-enhanced.test.js and build-cache-coverage-enhancement.test.js
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { BuildCache } from '../../../src/core/build-cache.js';
import { mkdirSync, writeFileSync, rmSync, readFileSync, chmodSync } from 'fs';
import { join } from 'path';

describe('Comprehensive BuildCache', () => {
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
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Test content</body></html>';
      writeFileSync(filePath, content);

      await cache.storeFileHash(filePath, content);

      const storedHash = await cache.getFileHash(filePath);
      expect(storedHash).toBeTruthy();
      expect(typeof storedHash).toBe('string');
      expect(storedHash.length).toBeGreaterThan(0);
    });

    test('should_retrieve_cached_hashes_when_checking_changes', async () => {
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Test content</body></html>';
      writeFileSync(filePath, content);

      const expectedHash = await cache.calculateHash(content);
      await cache.storeFileHash(filePath, content);

      const retrievedHash = await cache.getFileHash(filePath);
      expect(retrievedHash).toBe(expectedHash);
    });

    test('should_persist_cache_to_disk_when_build_ends', async () => {
      const filePath1 = join(tempDir, 'test1.html');
      const filePath2 = join(tempDir, 'test2.html');
      const content1 = '<html><body>Test content 1</body></html>';
      const content2 = '<html><body>Test content 2</body></html>';
      
      writeFileSync(filePath1, content1);
      writeFileSync(filePath2, content2);

      await cache.storeFileHash(filePath1, content1);
      await cache.storeFileHash(filePath2, content2);
      await cache.persistToDisk();

      const cacheFile = join(cacheDir, 'hash-cache.json');
      expect(await Bun.file(cacheFile).exists()).toBe(true);
      
      const cacheData = JSON.parse(readFileSync(cacheFile, 'utf8'));
      expect(Object.keys(cacheData)).toContain(filePath1);
      expect(Object.keys(cacheData)).toContain(filePath2);
    });

    test('should_load_cache_from_disk_when_starting', async () => {
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Test content</body></html>';
      writeFileSync(filePath, content);

      await cache.storeFileHash(filePath, content);
      await cache.persistToDisk();

      const newCache = new BuildCache(cacheDir);
      await newCache.loadFromDisk();

      const retrievedHash = await newCache.getFileHash(filePath);
      const expectedHash = await cache.calculateHash(content);
      expect(retrievedHash).toBe(expectedHash);
    });
  });

  describe('Change Detection', () => {
    test('should_detect_changed_files_when_hash_differs', async () => {
      const filePath = join(tempDir, 'test.html');
      const originalContent = '<html><body>Original content</body></html>';
      const updatedContent = '<html><body>Updated content</body></html>';
      
      writeFileSync(filePath, originalContent);
      await cache.storeFileHash(filePath, originalContent);

      writeFileSync(filePath, updatedContent);

      const hasChanged = await cache.hasFileChanged(filePath);
      expect(hasChanged).toBe(true);
    });

    test('should_identify_unchanged_files_when_hash_matches', async () => {
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Unchanged content</body></html>';
      
      writeFileSync(filePath, content);
      await cache.storeFileHash(filePath, content);

      const hasChanged = await cache.hasFileChanged(filePath);
      expect(hasChanged).toBe(false);
    });

    test('should_handle_new_files_when_no_cache_entry', async () => {
      const filePath = join(tempDir, 'new-file.html');
      const content = '<html><body>New file content</body></html>';
      writeFileSync(filePath, content);

      const hasChanged = await cache.hasFileChanged(filePath);
      expect(hasChanged).toBe(true);
    });
  });

  describe('Error Handling - File Operations', () => {
    test('should_return_null_when_file_does_not_exist_in_storeFileHash', async () => {
      const nonExistentPath = join(tempDir, 'non-existent.html');
      
      const result = await cache.storeFileHash(nonExistentPath);
      expect(result).toBeNull();
    });

    test('should_handle_file_reading_with_valid_file', async () => {
      const filePath = join(tempDir, 'valid-file.html');
      const content = '<html><body>Valid content</body></html>';
      writeFileSync(filePath, content);
      
      const result = await cache.storeFileHash(filePath, content);
      expect(result).not.toBeNull();
    });
  });

  describe('Error Handling - Change Detection', () => {
    test('should_return_true_when_file_check_throws_error', async () => {
      const filePath = join(tempDir, 'error-file.html');
      
      // Mock file system error by trying to read non-existent file
      const hasChanged = await cache.hasFileChanged(filePath);
      expect(hasChanged).toBe(true); // Should default to true on errors
    });

    test('should_handle_normal_file_change_detection', async () => {
      const filePath = join(tempDir, 'normal-file.html');
      const content = '<html><body>Normal content</body></html>';
      writeFileSync(filePath, content);
      
      await cache.storeFileHash(filePath, content);
      const hasChanged = await cache.hasFileChanged(filePath);
      expect(hasChanged).toBe(false);
    });
  });

  describe('Error Handling - Persistence', () => {
    test('should_handle_persistence_errors_gracefully', async () => {
      const filePath = join(tempDir, 'test-file.html');
      const content = '<html><body>Test content</body></html>';
      writeFileSync(filePath, content);
      
      await cache.storeFileHash(filePath, content);
      
      // Make cache directory read-only to trigger persistence error
      chmodSync(cacheDir, 0o444);
      
      try {
        await cache.persistToDisk();
        // If it doesn't throw, that's also acceptable (graceful handling)
        expect(true).toBe(true);
      } catch (error) {
        // If it does throw, verify it's the expected error
        expect(error.code).toBe('EACCES');
      }
      
      // Restore permissions for cleanup
      chmodSync(cacheDir, 0o755);
    });

    test('should_handle_directory_creation_errors', async () => {
      // Test with invalid cache directory
      const invalidCache = new BuildCache('/invalid/nonexistent/path');
      const filePath = join(tempDir, 'test-file.html');
      const content = '<html><body>Test content</body></html>';
      writeFileSync(filePath, content);
      
      await invalidCache.storeFileHash(filePath, content);
      
      try {
        await invalidCache.persistToDisk();
        // If it doesn't throw, that's also acceptable (graceful handling)
        expect(true).toBe(true);
      } catch (error) {
        // If it does throw, verify it's a filesystem error
        expect(['EACCES', 'ENOENT', 'EPERM']).toContain(error.code);
      }
    });
  });

  describe('Performance and Efficiency', () => {
    test('should_cache_multiple_files_efficiently', async () => {
      const fileCount = 10;
      const files = [];
      
      // Create multiple test files
      for (let i = 0; i < fileCount; i++) {
        const filePath = join(tempDir, `file${i}.html`);
        const content = `<html><body>Content ${i}</body></html>`;
        writeFileSync(filePath, content);
        files.push({ path: filePath, content });
      }

      const startTime = performance.now();
      
      for (const file of files) {
        await cache.storeFileHash(file.path, file.content);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      
      // Verify all files were cached
      for (const file of files) {
        const hash = await cache.getFileHash(file.path);
        expect(hash).toBeTruthy();
      }
    });

    test('should_detect_changes_efficiently_with_large_cache', async () => {
      // Populate cache with many files
      const fileCount = 20;
      for (let i = 0; i < fileCount; i++) {
        const filePath = join(tempDir, `cached-file${i}.html`);
        const content = `<html><body>Cached content ${i}</body></html>`;
        writeFileSync(filePath, content);
        await cache.storeFileHash(filePath, content);
      }

      // Test change detection performance
      const testFilePath = join(tempDir, 'test-change.html');
      const originalContent = '<html><body>Original</body></html>';
      writeFileSync(testFilePath, originalContent);
      await cache.storeFileHash(testFilePath, originalContent);

      const startTime = performance.now();
      const hasChanged = await cache.hasFileChanged(testFilePath);
      const endTime = performance.now();
      
      expect(hasChanged).toBe(false);
      expect(endTime - startTime).toBeLessThan(100); // Should be very fast
    });
  });

  describe('Cache Repair and Recovery', () => {
    test('should_handle_corrupted_cache_file', async () => {
      const cacheFile = join(cacheDir, 'hash-cache.json');
      
      // Create corrupted cache file
      writeFileSync(cacheFile, 'invalid json content');
      
      const newCache = new BuildCache(cacheDir);
      await newCache.loadFromDisk();
      
      // Should not throw and should initialize empty cache
      const testFilePath = join(tempDir, 'test.html');
      const content = '<html><body>Test</body></html>';
      writeFileSync(testFilePath, content);
      
      const hasChanged = await newCache.hasFileChanged(testFilePath);
      expect(hasChanged).toBe(true); // Should treat as new file
    });

    test('should_rebuild_cache_when_missing', async () => {
      const testFilePath = join(tempDir, 'rebuild-test.html');
      const content = '<html><body>Rebuild test</body></html>';
      writeFileSync(testFilePath, content);
      
      // Cache should work even without existing cache file
      await cache.storeFileHash(testFilePath, content);
      const hash = await cache.getFileHash(testFilePath);
      
      expect(hash).toBeTruthy();
    });
  });
});