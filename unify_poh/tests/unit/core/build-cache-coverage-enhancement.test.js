/**
 * Build Cache Coverage Enhancement Tests
 * Targets specific uncovered lines: 45, 94, 151, 225-263, 271-280
 * Focus on error handling, cache repair, and efficiency metrics
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { BuildCache } from '../../../src/core/build-cache.js';
import { mkdirSync, writeFileSync, rmSync, readFileSync, chmodSync } from 'fs';
import { join } from 'path';

describe('BuildCache Coverage Enhancement', () => {
  let cache;
  let tempDir;
  let cacheDir;

  beforeEach(() => {
    tempDir = `/tmp/build-cache-coverage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  describe('Error Handling in File Operations (Line 45)', () => {
    test('should_return_null_when_file_does_not_exist_in_storeFileHash', async () => {
      const nonExistentPath = join(tempDir, 'does-not-exist.html');
      
      // Should return null when file doesn't exist and no content provided
      const result = await cache.storeFileHash(nonExistentPath);
      
      expect(result).toBeNull();
    });

    test('should_handle_file_reading_with_valid_file', async () => {
      const filePath = join(tempDir, 'valid-file.html');
      const content = '<html><body>Valid content</body></html>';
      writeFileSync(filePath, content);
      
      // Should successfully store hash when file exists
      const result = await cache.storeFileHash(filePath);
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBe(64); // SHA-256 hex length
    });
  });

  describe('Error Handling in Change Detection (Line 94)', () => {
    test('should_return_true_when_file_check_throws_error', async () => {
      // Create a BuildCache with a mocked Bun.file that throws errors
      const filePath = join(tempDir, 'error-file.html');
      
      // Override Bun.file to throw an error
      const originalBunFile = global.Bun.file;
      global.Bun.file = mock(() => {
        throw new Error('File system error');
      });

      try {
        // Should return true (consider changed) when error occurs
        const hasChanged = await cache.hasFileChanged(filePath);
        expect(hasChanged).toBe(true);
      } finally {
        // Restore original Bun.file
        global.Bun.file = originalBunFile;
      }
    });

    test('should_handle_normal_file_change_detection', async () => {
      const filePath = join(tempDir, 'normal-file.html');
      const content = '<html><body>Normal content</body></html>';
      writeFileSync(filePath, content);
      
      // Store hash for file
      await cache.storeFileHash(filePath, content);
      
      // Should return false for unchanged file
      const hasChanged = await cache.hasFileChanged(filePath);
      expect(hasChanged).toBe(false);
    });
  });

  describe('Error Handling in Persistence (Line 151)', () => {
    test('should_handle_persistence_errors_gracefully', async () => {
      // Create cache with some data
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Test content</body></html>';
      await cache.storeFileHash(filePath, content);

      // Create cache with invalid cache directory to trigger the error path
      const invalidCache = new BuildCache('/invalid/permission/path');
      await invalidCache.storeFileHash(filePath, content);

      let errorLogged = false;
      const originalConsoleWarn = console.warn;
      
      console.warn = mock((message) => {
        if (message.includes('Failed to persist build cache')) {
          errorLogged = true;
        }
      });

      try {
        // Should not throw error, but should log warning
        await invalidCache.persistToDisk();
        expect(errorLogged).toBe(true);
      } finally {
        // Restore original function
        console.warn = originalConsoleWarn;
      }
    });

    test('should_handle_directory_creation_errors', async () => {
      // Create cache with invalid cache directory to trigger error
      const invalidCacheDir = '/root/invalid-permission-dir'; // Directory we can't create
      const restrictedCache = new BuildCache(invalidCacheDir);
      
      const filePath = join(tempDir, 'test.html');
      const content = '<html><body>Test content</body></html>';
      await restrictedCache.storeFileHash(filePath, content);

      let warningLogged = false;
      const originalConsoleWarn = console.warn;
      console.warn = mock((message) => {
        if (message.includes('Failed to persist build cache')) {
          warningLogged = true;
        }
      });

      try {
        // Should handle error gracefully
        await restrictedCache.persistToDisk();
        expect(warningLogged).toBe(true);
      } finally {
        console.warn = originalConsoleWarn;
      }
    });
  });

  describe('Cache Repair Functionality (Lines 225-263)', () => {
    test('should_remove_entries_for_deleted_files_during_repair', async () => {
      // Create files and add to cache
      const file1Path = join(tempDir, 'file1.html');
      const file2Path = join(tempDir, 'file2.html');
      const content1 = '<html><body>Content 1</body></html>';
      const content2 = '<html><body>Content 2</body></html>';
      
      writeFileSync(file1Path, content1);
      writeFileSync(file2Path, content2);
      
      await cache.storeFileHash(file1Path, content1);
      await cache.storeFileHash(file2Path, content2);
      
      expect(cache.cache.size).toBe(2);
      
      // Delete one file
      rmSync(file1Path);
      
      // Run repair
      const repairResult = await cache.repairCache();
      
      expect(repairResult.removed).toBe(1);
      expect(repairResult.repaired).toBe(0);
      expect(cache.cache.size).toBe(1);
      expect(cache.cache.has(file1Path)).toBe(false);
      expect(cache.cache.has(file2Path)).toBe(true);
    });

    test('should_repair_invalid_hash_entries_during_repair', async () => {
      const filePath = join(tempDir, 'file-to-repair.html');
      const content = '<html><body>Content to repair</body></html>';
      
      writeFileSync(filePath, content);
      
      // Manually add invalid hash to cache
      cache.cache.set(filePath, 'invalid-hash-too-short');
      
      // Run repair
      const repairResult = await cache.repairCache();
      
      expect(repairResult.repaired).toBe(1);
      expect(repairResult.removed).toBe(0);
      
      // Verify hash is now valid
      const repairedHash = cache.cache.get(filePath);
      expect(repairedHash).toBeTruthy();
      expect(repairedHash.length).toBe(64); // Valid SHA-256 length
    });

    test('should_repair_non_string_hash_entries', async () => {
      const filePath = join(tempDir, 'file-with-bad-hash.html');
      const content = '<html><body>Content with bad hash</body></html>';
      
      writeFileSync(filePath, content);
      
      // Manually add non-string hash to cache
      cache.cache.set(filePath, 123); // Number instead of string
      
      // Run repair
      const repairResult = await cache.repairCache();
      
      expect(repairResult.repaired).toBe(1);
      expect(repairResult.removed).toBe(0);
      
      // Verify hash is now valid string
      const repairedHash = cache.cache.get(filePath);
      expect(typeof repairedHash).toBe('string');
      expect(repairedHash.length).toBe(64);
    });

    test('should_handle_file_verification_errors_during_repair', async () => {
      const filePath = join(tempDir, 'file-with-read-error.html');
      const content = '<html><body>Content</body></html>';
      
      writeFileSync(filePath, content);
      await cache.storeFileHash(filePath, content);
      
      // Mock Bun.file to throw error for this specific file
      const originalBunFile = global.Bun.file;
      global.Bun.file = mock((path) => {
        if (path === filePath) {
          throw new Error('File read error');
        }
        return originalBunFile(path);
      });

      try {
        // Run repair - should remove entries that can't be verified
        const repairResult = await cache.repairCache();
        
        expect(repairResult.removed).toBe(1);
        expect(cache.cache.has(filePath)).toBe(false);
      } finally {
        global.Bun.file = originalBunFile;
      }
    });

    test('should_update_stats_after_repair', async () => {
      // Create multiple files with various issues
      const validFile = join(tempDir, 'valid.html');
      const deletedFile = join(tempDir, 'deleted.html');
      const invalidHashFile = join(tempDir, 'invalid-hash.html');
      
      const content = '<html><body>Content</body></html>';
      
      writeFileSync(validFile, content);
      writeFileSync(deletedFile, content);
      writeFileSync(invalidHashFile, content);
      
      await cache.storeFileHash(validFile, content);
      await cache.storeFileHash(deletedFile, content);
      cache.cache.set(invalidHashFile, 'invalid'); // Invalid hash
      
      expect(cache.cache.size).toBe(3);
      
      // Delete one file
      rmSync(deletedFile);
      
      // Run repair
      await cache.repairCache();
      
      // Stats should be updated
      expect(cache.stats.totalFiles).toBe(cache.cache.size);
      expect(cache.cache.size).toBe(2); // validFile + repaired invalidHashFile
    });

    test('should_handle_complex_repair_scenarios', async () => {
      // Mix of valid files, deleted files, and invalid hashes
      const validFile1 = join(tempDir, 'valid1.html');
      const validFile2 = join(tempDir, 'valid2.html');
      const deletedFile1 = join(tempDir, 'deleted1.html');
      const deletedFile2 = join(tempDir, 'deleted2.html');
      const invalidHashFile1 = join(tempDir, 'invalid1.html');
      const invalidHashFile2 = join(tempDir, 'invalid2.html');
      
      const content = '<html><body>Content</body></html>';
      
      // Create all files
      [validFile1, validFile2, deletedFile1, deletedFile2, invalidHashFile1, invalidHashFile2]
        .forEach(file => writeFileSync(file, content));
      
      // Add valid entries
      await cache.storeFileHash(validFile1, content);
      await cache.storeFileHash(validFile2, content);
      await cache.storeFileHash(deletedFile1, content);
      await cache.storeFileHash(deletedFile2, content);
      
      // Add invalid hash entries
      cache.cache.set(invalidHashFile1, 'short');
      cache.cache.set(invalidHashFile2, null);
      
      // Delete some files
      rmSync(deletedFile1);
      rmSync(deletedFile2);
      
      // Run repair
      const repairResult = await cache.repairCache();
      
      expect(repairResult.removed).toBe(2); // Two deleted files
      expect(repairResult.repaired).toBe(2); // Two invalid hashes
      expect(cache.cache.size).toBe(4); // 2 valid + 2 repaired
    });
  });

  describe('Efficiency Metrics (Lines 271-280)', () => {
    test('should_calculate_hit_and_miss_ratios', async () => {
      // Setup cache with some data
      const filePath1 = join(tempDir, 'file1.html');
      const filePath2 = join(tempDir, 'file2.html');
      const content = '<html><body>Content</body></html>';
      
      writeFileSync(filePath1, content);
      writeFileSync(filePath2, content);
      
      await cache.storeFileHash(filePath1, content);
      
      // Generate cache hits and misses
      await cache.getFileHash(filePath1); // Hit
      await cache.getFileHash(filePath1); // Hit
      await cache.getFileHash(filePath2); // Miss
      await cache.getFileHash(filePath2); // Miss
      
      const metrics = cache.getEfficiencyMetrics();
      
      expect(metrics.hitRatio).toBe(0.5); // 2 hits out of 4 total
      expect(metrics.missRatio).toBe(0.5); // 2 misses out of 4 total
      expect(metrics.totalQueries).toBe(4);
    });

    test('should_calculate_average_hash_calculations_per_file', async () => {
      // Store multiple files
      for (let i = 0; i < 5; i++) {
        const filePath = join(tempDir, `file${i}.html`);
        const content = `<html><body>Content ${i}</body></html>`;
        writeFileSync(filePath, content);
        await cache.storeFileHash(filePath, content);
      }
      
      // Make some cache queries to generate hit/miss data
      const filePath = join(tempDir, 'file0.html');
      await cache.getFileHash(filePath); // This will generate cache queries
      
      const metrics = cache.getEfficiencyMetrics();
      
      expect(metrics.avgHashCalculationsPerFile).toBe(1); // 5 calculations / 5 files
      expect(metrics.totalQueries).toBeGreaterThan(0);
    });

    test('should_calculate_cache_utilization', async () => {
      // Add files to cache
      for (let i = 0; i < 3; i++) {
        const filePath = join(tempDir, `file${i}.html`);
        const content = `<html><body>Content ${i}</body></html>`;
        writeFileSync(filePath, content);
        await cache.storeFileHash(filePath, content);
      }
      
      const metrics = cache.getEfficiencyMetrics();
      
      expect(metrics.cacheUtilization).toBe(1); // cache.size / totalFiles = 3/3 = 1
    });

    test('should_handle_zero_values_in_efficiency_calculations', async () => {
      // Test with empty cache
      const metrics = cache.getEfficiencyMetrics();
      
      expect(metrics.hitRatio).toBe(0);
      expect(metrics.missRatio).toBe(0);
      expect(metrics.totalQueries).toBe(0);
      expect(metrics.avgHashCalculationsPerFile).toBe(0);
      expect(metrics.cacheUtilization).toBe(0);
    });

    test('should_handle_mixed_hit_miss_scenarios', async () => {
      // Setup cache with files
      const files = [];
      for (let i = 0; i < 3; i++) {
        const filePath = join(tempDir, `file${i}.html`);
        const content = `<html><body>Content ${i}</body></html>`;
        writeFileSync(filePath, content);
        await cache.storeFileHash(filePath, content);
        files.push(filePath);
      }
      
      // Create specific hit/miss pattern
      await cache.getFileHash(files[0]); // Hit
      await cache.getFileHash(files[0]); // Hit
      await cache.getFileHash(files[0]); // Hit
      await cache.getFileHash('non-existent-file'); // Miss
      
      const metrics = cache.getEfficiencyMetrics();
      
      expect(metrics.hitRatio).toBe(0.75); // 3 hits out of 4
      expect(metrics.missRatio).toBe(0.25); // 1 miss out of 4
      expect(metrics.totalQueries).toBe(4);
    });

    test('should_track_hash_calculations_accurately', async () => {
      // Store files and trigger additional hash calculations
      const filePath = join(tempDir, 'file.html');
      const content = '<html><body>Content</body></html>';
      writeFileSync(filePath, content);
      
      // This should trigger 1 hash calculation
      await cache.storeFileHash(filePath, content);
      
      // This should trigger another hash calculation
      await cache.hasFileChanged(filePath);
      
      const metrics = cache.getEfficiencyMetrics();
      
      expect(metrics.avgHashCalculationsPerFile).toBe(2); // 2 calculations / 1 file
    });
  });

  describe('Combined Error and Edge Cases', () => {
    test('should_handle_repair_with_efficiency_metrics', async () => {
      // Create files, some to be deleted, some with invalid hashes
      const validFile = join(tempDir, 'valid.html');
      const deleteFile = join(tempDir, 'delete.html');
      const content = '<html><body>Content</body></html>';
      
      writeFileSync(validFile, content);
      writeFileSync(deleteFile, content);
      
      await cache.storeFileHash(validFile, content);
      cache.cache.set(deleteFile, 'invalid-hash');
      
      // Generate some cache activity
      await cache.getFileHash(validFile); // Hit
      await cache.getFileHash('missing'); // Miss
      
      // Delete file and repair
      rmSync(deleteFile);
      await cache.repairCache();
      
      const metrics = cache.getEfficiencyMetrics();
      
      expect(metrics.hitRatio).toBe(0.5); // Should preserve hit/miss ratios
      expect(metrics.cacheUtilization).toBe(1); // 1 file in cache, 1 totalFiles
    });

    test('should_maintain_consistency_between_stats_and_cache', async () => {
      // Perform various operations
      const filePath = join(tempDir, 'consistency-test.html');
      const content = '<html><body>Consistency test</body></html>';
      writeFileSync(filePath, content);
      
      await cache.storeFileHash(filePath, content);
      await cache.getFileHash(filePath);
      cache.removeFile(filePath);
      
      const stats = cache.getStats();
      const metrics = cache.getEfficiencyMetrics();
      
      expect(stats.totalFiles).toBe(cache.cache.size);
      expect(metrics.totalQueries).toBe(stats.cacheHits + stats.cacheMisses);
    });
  });
});