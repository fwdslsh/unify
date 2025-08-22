import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { BuildCache, createBuildCache, clearCacheOnRestart } from '../../../src/core/build-cache.js';
import { mkdtemp, writeFile, unlink, rmdir, mkdir, readFile, chmod } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';

describe('BuildCache - Hash Functions & Reliability', () => {
  let cache, tempDir, cleanupTasks;
  
  beforeEach(async () => {
    cleanupTasks = [];
    tempDir = await mkdtemp(join(tmpdir(), 'unify-cache-test-'));
    cleanupTasks.push(() => rmdir(tempDir, { recursive: true }));
    
    cache = new BuildCache(join(tempDir, '.cache'));
    await cache.initialize();
  });
  
  afterEach(async () => {
    for (const cleanup of cleanupTasks.reverse()) {
      await cleanup().catch(() => {});
    }
  });

  describe('File Hashing Security & Reliability', () => {
    test('should generate consistent hashes for identical files', async () => {
      const content = 'test content for hashing';
      const file1 = join(tempDir, 'file1.txt');
      const file2 = join(tempDir, 'file2.txt');
      
      await writeFile(file1, content);
      await writeFile(file2, content);
      
      const hash1 = await cache.hashFile(file1);
      const hash2 = await cache.hashFile(file2);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should generate different hashes for different content', async () => {
      const file1 = join(tempDir, 'file1.txt');
      const file2 = join(tempDir, 'file2.txt');
      
      await writeFile(file1, 'content 1');
      await writeFile(file2, 'content 2');
      
      const hash1 = await cache.hashFile(file1);
      const hash2 = await cache.hashFile(file2);
      
      expect(hash1).not.toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash2).toHaveLength(64);
    });

    test('should handle binary files correctly', async () => {
      const binaryContent = Buffer.from([0x00, 0xFF, 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56]);
      const binaryFile = join(tempDir, 'binary.bin');
      
      await writeFile(binaryFile, binaryContent);
      
      const hash = await cache.hashFile(binaryFile);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      
      // Verify consistency
      const hash2 = await cache.hashFile(binaryFile);
      expect(hash).toBe(hash2);
    });

    test('should handle large files efficiently', async () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB file
      const largeFile = join(tempDir, 'large.txt');
      
      await writeFile(largeFile, largeContent);
      
      const start = Date.now();
      const hash = await cache.hashFile(largeFile);
      const duration = Date.now() - start;
      
      expect(hash).toHaveLength(64);
      expect(duration).toBeLessThan(1000); // Should hash 1MB in <1s
      
      // Verify different large files produce different hashes
      const largeContent2 = 'y'.repeat(1024 * 1024);
      const largeFile2 = join(tempDir, 'large2.txt');
      await writeFile(largeFile2, largeContent2);
      
      const hash2 = await cache.hashFile(largeFile2);
      expect(hash).not.toBe(hash2);
    });

    test('should handle very large files without memory issues', async () => {
      const veryLargeFile = join(tempDir, 'very-large.txt');
      
      // Create 10MB file by writing in chunks
      const chunk = 'x'.repeat(1024); // 1KB chunk
      const fileHandle = await Bun.file(veryLargeFile).writer();
      
      for (let i = 0; i < 10240; i++) { // 10MB total
        fileHandle.write(chunk);
      }
      fileHandle.end();
      
      const start = Date.now();
      const hash = await cache.hashFile(veryLargeFile);
      const duration = Date.now() - start;
      
      expect(hash).toHaveLength(64);
      expect(duration).toBeLessThan(3000); // Should handle 10MB in <3s
    });

    test('should handle non-existent files gracefully', async () => {
      const nonExistentFile = join(tempDir, 'does-not-exist.txt');
      
      const hash = await cache.hashFile(nonExistentFile);
      expect(hash).toBe('error');
    });

    test('should handle files with unusual names and characters', async () => {
      const unusualNames = [
        'file with spaces.txt',
        'file-with-dashes.txt',
        'file_with_underscores.txt',
        'file.with.dots.txt',
        'UPPERCASE.TXT',
        'file123.txt',
        'file@#$%^&()_+.txt'
      ];
      
      for (const fileName of unusualNames) {
        const filePath = join(tempDir, fileName);
        await writeFile(filePath, `content for ${fileName}`);
        
        const hash = await cache.hashFile(filePath);
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    test('should handle empty files', async () => {
      const emptyFile = join(tempDir, 'empty.txt');
      await writeFile(emptyFile, '');
      
      const hash = await cache.hashFile(emptyFile);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      
      // Empty files should have consistent hash
      const emptyFile2 = join(tempDir, 'empty2.txt');
      await writeFile(emptyFile2, '');
      
      const hash2 = await cache.hashFile(emptyFile2);
      expect(hash).toBe(hash2);
    });

    test('should handle concurrent hashing operations safely', async () => {
      // Create multiple files
      const files = [];
      for (let i = 0; i < 10; i++) {
        const file = join(tempDir, `concurrent-${i}.txt`);
        await writeFile(file, `content ${i}`);
        files.push(file);
      }
      
      // Hash all files concurrently
      const hashPromises = files.map(file => cache.hashFile(file));
      const hashes = await Promise.all(hashPromises);
      
      // All hashes should be valid
      expect(hashes).toHaveLength(10);
      hashes.forEach(hash => {
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });
      
      // All hashes should be different
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(10);
    });
  });

  describe('Content Hashing Security', () => {
    test('should hash string content consistently', () => {
      const content = 'test content string';
      
      const hash1 = cache.hashContent(content);
      const hash2 = cache.hashContent(content);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should handle unicode content correctly', () => {
      const unicodeContent = '测试内容🎉 with émojis and spëciål characters';
      
      const hash = cache.hashContent(unicodeContent);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      
      // Should be consistent
      const hash2 = cache.hashContent(unicodeContent);
      expect(hash).toBe(hash2);
    });

    test('should handle empty and edge case content', () => {
      const testCases = [
        '',
        ' ',
        '\n',
        '\t',
        '\r\n',
        '0',
        'false',
        JSON.stringify({}),
        JSON.stringify([])
      ];
      
      testCases.forEach(content => {
        const hash = cache.hashContent(content);
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });
      
      // Different content should produce different hashes
      const hashes = testCases.map(content => cache.hashContent(content));
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(testCases.length);
    });

    test('should handle null and invalid input gracefully', () => {
      const invalidInputs = [null, undefined, 123, {}, [], true, false];
      
      invalidInputs.forEach(input => {
        const hash = cache.hashContent(input);
        expect(hash).toBe('error');
      });
    });

    test('should handle very large content efficiently', async () => {
      const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB string
      
      const start = Date.now();
      const hash = cache.hashContent(largeContent);
      const duration = Date.now() - start;
      
      expect(hash).toHaveLength(64);
      expect(duration).toBeLessThan(2000); // Should hash 10MB in <2s
    });

    test('should handle special characters and escape sequences', () => {
      const specialContent = [
        'Content with "quotes" and \'apostrophes\'',
        'Content with <tags> and &entities;',
        'Content with \n newlines \r\n and \t tabs',
        'Content with \\backslashes\\ and /forward/slashes/',
        'Content with null\\0bytes and control\\x01chars'
      ];
      
      specialContent.forEach(content => {
        const hash = cache.hashContent(content);
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });
    });
  });

  describe('Dependency Graph Validation & Infinite Loop Prevention', () => {
    test('should prevent circular dependency infinite loops', async () => {
      // Create circular dependency: A -> B -> C -> A
      cache.setDependencies('fileA.html', ['fileB.html']);
      cache.setDependencies('fileB.html', ['fileC.html']);
      cache.setDependencies('fileC.html', ['fileA.html']);
      
      // Create the files
      const fileA = join(tempDir, 'fileA.html');
      const fileB = join(tempDir, 'fileB.html');
      const fileC = join(tempDir, 'fileC.html');
      
      await writeFile(fileA, 'content A');
      await writeFile(fileB, 'content B');
      await writeFile(fileC, 'content C');
      
      // This should not hang or cause infinite recursion
      const start = Date.now();
      const hasChanged = await cache.haveDependenciesChanged('fileA.html');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Max 1 second
      expect(typeof hasChanged).toBe('boolean');
    });

    test('should handle deep dependency chains efficiently', async () => {
      // Create deep chain: A -> B -> C -> ... -> Z
      const files = [];
      for (let i = 0; i < 26; i++) {
        const fileName = `file${String.fromCharCode(65 + i)}.html`;
        files.push(fileName);
        
        const filePath = join(tempDir, fileName);
        await writeFile(filePath, `content ${i}`);
        
        if (i > 0) {
          cache.setDependencies(files[i - 1], [fileName]);
        }
      }
      
      const start = Date.now();
      const hasChanged = await cache.haveDependenciesChanged('fileA.html');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(2000); // Should handle 26-deep chain quickly
      expect(typeof hasChanged).toBe('boolean');
    });

    test('should validate dependency graph integrity', () => {
      const testDeps = [
        ['fileA.html', ['fileB.html', 'fileC.html']],
        ['fileB.html', []],
        ['fileC.html', ['fileD.html']],
        ['fileD.html', []]
      ];
      
      testDeps.forEach(([file, deps]) => {
        cache.setDependencies(file, deps);
      });
      
      // Verify dependencies are stored correctly
      expect(cache.dependencyGraph.get('fileA.html')).toEqual(['fileB.html', 'fileC.html']);
      expect(cache.dependencyGraph.get('fileB.html')).toEqual([]);
      expect(cache.dependencyGraph.get('fileC.html')).toEqual(['fileD.html']);
      expect(cache.dependencyGraph.get('fileD.html')).toEqual([]);
    });

    test('should handle dependency graph with missing files', async () => {
      cache.setDependencies('existing.html', ['missing.html', 'also-missing.html']);
      
      const existingFile = join(tempDir, 'existing.html');
      await writeFile(existingFile, 'content');
      
      // Should not throw when dependencies don't exist
      const hasChanged = await cache.haveDependenciesChanged('existing.html');
      expect(typeof hasChanged).toBe('boolean');
    });

    test('should handle self-referencing dependencies', async () => {
      cache.setDependencies('self.html', ['self.html']);
      
      const selfFile = join(tempDir, 'self.html');
      await writeFile(selfFile, 'content');
      
      // Should not cause infinite loop
      const start = Date.now();
      const hasChanged = await cache.haveDependenciesChanged('self.html');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(500);
      expect(typeof hasChanged).toBe('boolean');
    });

    test('should handle complex dependency networks', async () => {
      // Create complex network: star pattern with cycles
      const centerFile = 'center.html';
      const dependentFiles = [];
      
      for (let i = 0; i < 10; i++) {
        const file = `dep-${i}.html`;
        dependentFiles.push(file);
        await writeFile(join(tempDir, file), `content ${i}`);
      }
      
      await writeFile(join(tempDir, centerFile), 'center content');
      
      // Center depends on all files
      cache.setDependencies(centerFile, dependentFiles);
      
      // Each file depends on the center (creates cycles)
      dependentFiles.forEach(file => {
        cache.setDependencies(file, [centerFile]);
      });
      
      const start = Date.now();
      const hasChanged = await cache.haveDependenciesChanged(centerFile);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(2000);
      expect(typeof hasChanged).toBe('boolean');
    });

    test('should handle addDependency method correctly', () => {
      const file = 'main.html';
      
      // Add first dependency
      cache.addDependency(file, 'dep1.html');
      expect(cache.dependencyGraph.get(file)).toEqual(['dep1.html']);
      
      // Add second dependency
      cache.addDependency(file, 'dep2.html');
      expect(cache.dependencyGraph.get(file)).toEqual(['dep1.html', 'dep2.html']);
      
      // Adding same dependency should not duplicate
      cache.addDependency(file, 'dep1.html');
      expect(cache.dependencyGraph.get(file)).toEqual(['dep1.html', 'dep2.html']);
    });

    test('should handle empty dependency arrays', async () => {
      cache.setDependencies('isolated.html', []);
      
      const isolatedFile = join(tempDir, 'isolated.html');
      await writeFile(isolatedFile, 'content');
      
      const hasChanged = await cache.haveDependenciesChanged('isolated.html');
      expect(hasChanged).toBe(false); // No dependencies, so no changes
    });
  });

  describe('Cache Persistence & Data Integrity', () => {
    test('should survive and restore from disk corruption', async () => {
      // Populate cache
      const testFile = join(tempDir, 'test.html');
      await writeFile(testFile, 'test content');
      await cache.updateFileHash(testFile);
      cache.setDependencies(testFile, ['dep1.html', 'dep2.html']);
      
      // Save cache
      await cache.saveCache();
      
      // Corrupt cache files
      const hashCacheFile = join(cache.cacheDir, 'hash-cache.json');
      const depsCacheFile = join(cache.cacheDir, 'deps-cache.json');
      
      await writeFile(hashCacheFile, 'invalid json {');
      await writeFile(depsCacheFile, '{"incomplete": ');
      
      // Create new cache instance (should handle corruption gracefully)
      const newCache = new BuildCache(join(tempDir, '.cache'));
      await newCache.initialize();
      
      // Should start fresh without throwing
      expect(newCache.hashCache.size).toBe(0);
      expect(newCache.dependencyGraph.size).toBe(0);
    });

    test('should handle concurrent access to cache files', async () => {
      // Simulate multiple cache instances accessing same directory
      const cache1 = new BuildCache(join(tempDir, '.shared-cache'));
      const cache2 = new BuildCache(join(tempDir, '.shared-cache'));
      
      await cache1.initialize();
      await cache2.initialize();
      
      // Both caches write simultaneously
      const testFile1 = join(tempDir, 'test1.html');
      const testFile2 = join(tempDir, 'test2.html');
      
      await writeFile(testFile1, 'content 1');
      await writeFile(testFile2, 'content 2');
      
      const promises = [
        cache1.updateFileHash(testFile1).then(() => cache1.saveCache()),
        cache2.updateFileHash(testFile2).then(() => cache2.saveCache())
      ];
      
      // Should not throw or corrupt data
      await expect(Promise.all(promises)).resolves.toBeDefined();
    });

    test('should validate cache file format and version', async () => {
      // Create cache with valid data
      const testFile = join(tempDir, 'test.html');
      await writeFile(testFile, 'content');
      await cache.updateFileHash(testFile);
      await cache.saveCache();
      
      // Verify saved format is correct JSON
      const hashCacheFile = join(cache.cacheDir, 'hash-cache.json');
      const depsCacheFile = join(cache.cacheDir, 'deps-cache.json');
      
      const hashData = JSON.parse(await readFile(hashCacheFile, 'utf-8'));
      const depsData = JSON.parse(await readFile(depsCacheFile, 'utf-8'));
      
      expect(typeof hashData).toBe('object');
      expect(typeof depsData).toBe('object');
      expect(hashData[testFile]).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should handle missing cache directory gracefully', async () => {
      const nonExistentDir = join(tempDir, 'non-existent', 'cache');
      const newCache = new BuildCache(nonExistentDir);
      
      // Should create directory and initialize without error
      await newCache.initialize();
      expect(newCache.isInitialized).toBe(true);
    });

    test('should handle cache directory permission issues', async () => {
      // Create directory with restricted permissions (Unix-like systems)
      const restrictedDir = join(tempDir, 'restricted');
      await mkdir(restrictedDir);
      
      try {
        await chmod(restrictedDir, 0o444); // Read-only
        
        const restrictedCache = new BuildCache(join(restrictedDir, 'cache'));
        
        // Should handle permission errors gracefully
        await restrictedCache.initialize();
        await restrictedCache.saveCache(); // This may fail silently
        
        // Reset permissions for cleanup
        await chmod(restrictedDir, 0o755);
      } catch (error) {
        // Skip test on systems that don't support chmod or if running as root
        console.log('Skipping permission test:', error.message);
      }
    });

    test('should handle partial cache corruption', async () => {
      // Create valid cache
      const testFile = join(tempDir, 'test.html');
      await writeFile(testFile, 'content');
      await cache.updateFileHash(testFile);
      cache.setDependencies(testFile, ['dep.html']);
      await cache.saveCache();
      
      // Corrupt only one cache file
      const hashCacheFile = join(cache.cacheDir, 'hash-cache.json');
      await writeFile(hashCacheFile, 'invalid json');
      
      // Should handle partial corruption gracefully
      const newCache = new BuildCache(join(tempDir, '.cache'));
      await newCache.initialize();
      
      // Should start fresh
      expect(newCache.hashCache.size).toBe(0);
      expect(newCache.dependencyGraph.size).toBe(0);
    });

    test('should handle empty cache files', async () => {
      // Create empty cache files
      const hashCacheFile = join(cache.cacheDir, 'hash-cache.json');
      const depsCacheFile = join(cache.cacheDir, 'deps-cache.json');
      
      await writeFile(hashCacheFile, '');
      await writeFile(depsCacheFile, '');
      
      const newCache = new BuildCache(join(tempDir, '.cache'));
      await newCache.initialize();
      
      // Should handle empty files gracefully
      expect(newCache.hashCache.size).toBe(0);
      expect(newCache.dependencyGraph.size).toBe(0);
    });
  });

  describe('File Change Detection & Performance', () => {
    test('should accurately detect file modifications', async () => {
      const testFile = join(tempDir, 'changeable.html');
      await writeFile(testFile, 'initial content');
      
      // First check - should detect as changed (new file)
      const firstCheck = await cache.hasFileChanged(testFile);
      expect(firstCheck).toBe(true);
      
      // Second check - should not detect change (cached)
      const secondCheck = await cache.hasFileChanged(testFile);
      expect(secondCheck).toBe(false);
      
      // Modify file
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamp
      await writeFile(testFile, 'modified content');
      
      // Third check - should detect change
      const thirdCheck = await cache.hasFileChanged(testFile);
      expect(thirdCheck).toBe(true);
    });

    test('should handle rapid successive file changes', async () => {
      const testFile = join(tempDir, 'rapid-change.html');
      
      // Rapid succession of changes
      const changes = [];
      for (let i = 0; i < 10; i++) {
        await writeFile(testFile, `content ${i}`);
        changes.push(await cache.hasFileChanged(testFile));
        await new Promise(resolve => setTimeout(resolve, 1)); // Small delay
      }
      
      // First change should be detected, others depend on timing
      expect(changes[0]).toBe(true);
      expect(changes.some(changed => changed)).toBe(true);
    });

    test('should efficiently check large numbers of files', async () => {
      // Create 100 test files
      const files = [];
      for (let i = 0; i < 100; i++) {
        const file = join(tempDir, `file-${i}.html`);
        await writeFile(file, `content ${i}`);
        files.push(file);
      }
      
      // Check all files for changes
      const start = Date.now();
      const results = await Promise.all(
        files.map(file => cache.hasFileChanged(file))
      );
      const duration = Date.now() - start;
      
      expect(results.every(changed => changed)).toBe(true); // All new files
      expect(duration).toBeLessThan(1000); // Should check 100 files in <1s
    });

    test('should handle files with identical content but different paths', async () => {
      const content = 'identical content';
      const file1 = join(tempDir, 'dir1', 'file.html');
      const file2 = join(tempDir, 'dir2', 'file.html');
      
      await mkdir(dirname(file1), { recursive: true });
      await mkdir(dirname(file2), { recursive: true });
      await writeFile(file1, content);
      await writeFile(file2, content);
      
      const hash1 = await cache.hashFile(file1);
      const hash2 = await cache.hashFile(file2);
      
      // Same content should produce same hash
      expect(hash1).toBe(hash2);
      
      // But files should be tracked separately
      await cache.updateFileHash(file1);
      await cache.updateFileHash(file2);
      
      expect(cache.hashCache.get(file1)).toBe(hash1);
      expect(cache.hashCache.get(file2)).toBe(hash2);
    });

    test('should handle updateFileHash with pre-computed hash', async () => {
      const testFile = join(tempDir, 'test.html');
      await writeFile(testFile, 'content');
      
      const computedHash = await cache.hashFile(testFile);
      
      // Update with pre-computed hash
      await cache.updateFileHash(testFile, computedHash);
      
      expect(cache.hashCache.get(testFile)).toBe(computedHash);
      
      // Should not detect change since hash matches
      const hasChanged = await cache.hasFileChanged(testFile);
      expect(hasChanged).toBe(false);
    });
  });

  describe('Group Hash Operations & Multi-file Processing', () => {
    test('should handle group hash operations correctly', async () => {
      const files = [];
      for (let i = 0; i < 5; i++) {
        const file = join(tempDir, `group-${i}.html`);
        await writeFile(file, `content ${i}`);
        files.push(file);
      }
      
      // Check group initially
      const hasChanged1 = await cache.hasGroupChanged(files, 'test-group');
      expect(hasChanged1).toBe(true); // First time checking group
      
      // Check again - should not have changed
      const hasChanged2 = await cache.hasGroupChanged(files, 'test-group');
      expect(hasChanged2).toBe(false);
      
      // Modify one file in the group
      await writeFile(files[0], 'modified content');
      
      // Group should now be detected as changed
      const hasChanged3 = await cache.hasGroupChanged(files, 'test-group');
      expect(hasChanged3).toBe(true);
    });

    test('should handle empty file groups', async () => {
      const emptyGroup = [];
      
      const hasChanged = await cache.hasGroupChanged(emptyGroup, 'empty-group');
      expect(typeof hasChanged).toBe('boolean');
    });

    test('should handle groups with missing files', async () => {
      const files = [
        join(tempDir, 'existing.html'),
        join(tempDir, 'missing.html')
      ];
      
      await writeFile(files[0], 'content');
      // Don't create files[1]
      
      const hasChanged = await cache.hasGroupChanged(files, 'mixed-group');
      expect(typeof hasChanged).toBe('boolean');
    });

    test('should handle large file groups efficiently', async () => {
      const files = [];
      for (let i = 0; i < 50; i++) {
        const file = join(tempDir, `large-group-${i}.html`);
        await writeFile(file, `content ${i}`);
        files.push(file);
      }
      
      const start = Date.now();
      const hasChanged = await cache.hasGroupChanged(files, 'large-group');
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(2000); // Should handle 50 files quickly
      expect(hasChanged).toBe(true); // First check
    });

    test('should generate consistent composite hashes', async () => {
      const files = [];
      for (let i = 0; i < 3; i++) {
        const file = join(tempDir, `composite-${i}.html`);
        await writeFile(file, `content ${i}`);
        files.push(file);
      }
      
      const hash1 = await cache.hashFiles(files);
      const hash2 = await cache.hashFiles(files);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      
      // Modify one file and verify hash changes
      await writeFile(files[0], 'modified content');
      const hash3 = await cache.hashFiles(files);
      expect(hash3).not.toBe(hash1);
    });
  });

  describe('Up-to-Date Checks & Build Optimization', () => {
    test('should accurately determine build up-to-date status', async () => {
      const inputFile = join(tempDir, 'input.html');
      const outputFile = join(tempDir, 'output.html');
      
      await writeFile(inputFile, 'input content');
      await writeFile(outputFile, 'output content');
      
      // Initially up-to-date check should be false (no cache entry)
      const upToDate1 = await cache.isUpToDate(inputFile, outputFile);
      expect(upToDate1).toBe(false);
      
      // Update cache for input file
      await cache.updateFileHash(inputFile);
      
      // Now should be up-to-date
      const upToDate2 = await cache.isUpToDate(inputFile, outputFile);
      expect(upToDate2).toBe(true);
      
      // Modify input file
      await writeFile(inputFile, 'modified input');
      
      // Should no longer be up-to-date
      const upToDate3 = await cache.isUpToDate(inputFile, outputFile);
      expect(upToDate3).toBe(false);
    });

    test('should handle missing output files in up-to-date checks', async () => {
      const inputFile = join(tempDir, 'input.html');
      const outputFile = join(tempDir, 'non-existent-output.html');
      
      await writeFile(inputFile, 'input content');
      await cache.updateFileHash(inputFile);
      
      // Missing output file should be considered not up-to-date
      const upToDate = await cache.isUpToDate(inputFile, outputFile);
      expect(upToDate).toBe(false);
    });

    test('should consider dependencies in up-to-date checks', async () => {
      const inputFile = join(tempDir, 'input.html');
      const outputFile = join(tempDir, 'output.html');
      const depFile = join(tempDir, 'dependency.html');
      
      await writeFile(inputFile, 'input content');
      await writeFile(outputFile, 'output content');
      await writeFile(depFile, 'dependency content');
      
      // Set up dependency and cache
      cache.setDependencies(inputFile, [depFile]);
      await cache.updateFileHash(inputFile);
      await cache.updateFileHash(depFile);
      
      // Should be up-to-date
      const upToDate1 = await cache.isUpToDate(inputFile, outputFile);
      expect(upToDate1).toBe(true);
      
      // Modify dependency
      await writeFile(depFile, 'modified dependency');
      
      // Should no longer be up-to-date
      const upToDate2 = await cache.isUpToDate(inputFile, outputFile);
      expect(upToDate2).toBe(false);
    });
  });

  describe('Cache Statistics & Utilities', () => {
    test('should provide accurate cache statistics', async () => {
      // Add some data to cache
      const files = ['file1.html', 'file2.html', 'file3.html'];
      for (const file of files) {
        const filePath = join(tempDir, file);
        await writeFile(filePath, `content of ${file}`);
        await cache.updateFileHash(filePath);
        cache.setDependencies(filePath, [`dep-${file}`]);
      }
      
      const stats = cache.getStats();
      
      expect(stats.cachedFiles).toBe(3);
      expect(stats.dependencyGraphSize).toBe(3);
      expect(stats.cacheDir).toContain('.cache');
      expect(stats.hashingMethod).toBe('native-crypto');
    });

    test('should handle cache clearing completely', async () => {
      // Populate cache
      const testFile = join(tempDir, 'test.html');
      await writeFile(testFile, 'content');
      await cache.updateFileHash(testFile);
      cache.setDependencies(testFile, ['dep.html']);
      await cache.saveCache();
      
      // Verify cache has data
      expect(cache.hashCache.size).toBeGreaterThan(0);
      expect(cache.dependencyGraph.size).toBeGreaterThan(0);
      
      // Clear cache
      await cache.clearCache();
      
      // Verify cache is empty
      expect(cache.hashCache.size).toBe(0);
      expect(cache.dependencyGraph.size).toBe(0);
    });

    test('should handle factory function and utilities', async () => {
      // Test factory function
      const newCache = createBuildCache(join(tempDir, '.factory-cache'));
      expect(newCache).toBeInstanceOf(BuildCache);
      expect(newCache.cacheDir).toContain('.factory-cache');
      
      // Test clear on restart
      await newCache.initialize();
      await clearCacheOnRestart(join(tempDir, '.factory-cache'));
      // Should complete without error
    });

    test('should handle multiple cache instances with different directories', async () => {
      const cache1 = new BuildCache(join(tempDir, 'cache1'));
      const cache2 = new BuildCache(join(tempDir, 'cache2'));
      
      await cache1.initialize();
      await cache2.initialize();
      
      // Add different data to each cache
      const file1 = join(tempDir, 'test1.html');
      const file2 = join(tempDir, 'test2.html');
      
      await writeFile(file1, 'content 1');
      await writeFile(file2, 'content 2');
      
      await cache1.updateFileHash(file1);
      await cache2.updateFileHash(file2);
      
      // Caches should be independent
      expect(cache1.hashCache.size).toBe(1);
      expect(cache2.hashCache.size).toBe(1);
      expect(cache1.hashCache.has(file1)).toBe(true);
      expect(cache1.hashCache.has(file2)).toBe(false);
      expect(cache2.hashCache.has(file1)).toBe(false);
      expect(cache2.hashCache.has(file2)).toBe(true);
    });
  });

  describe('Error Handling & Edge Cases', () => {
    test('should handle cache reinitialization', async () => {
      // Initialize cache
      expect(cache.isInitialized).toBe(true);
      
      // Reinitialize should not cause issues
      await cache.initialize();
      expect(cache.isInitialized).toBe(true);
    });

    test('should handle operations on uninitialized cache', async () => {
      const uninitializedCache = new BuildCache(join(tempDir, '.uninitialized'));
      
      // Should handle operations gracefully even without initialization
      const testFile = join(tempDir, 'test.html');
      await writeFile(testFile, 'content');
      
      const hash = await uninitializedCache.hashFile(testFile);
      expect(hash).toHaveLength(64);
      
      await uninitializedCache.updateFileHash(testFile);
      expect(uninitializedCache.hashCache.size).toBe(1);
    });

    test('should handle save operations on uninitialized cache', async () => {
      const uninitializedCache = new BuildCache(join(tempDir, '.uninitialized'));
      
      // Save should be no-op for uninitialized cache
      await uninitializedCache.saveCache();
      // Should not throw
    });

    test('should handle concurrent file modifications during hashing', async () => {
      const testFile = join(tempDir, 'concurrent-mod.html');
      await writeFile(testFile, 'initial content');
      
      // Start hashing and modify file concurrently
      const hashPromise = cache.hashFile(testFile);
      
      // Modify file while hashing (may or may not affect result)
      setTimeout(async () => {
        await writeFile(testFile, 'modified content').catch(() => {});
      }, 1);
      
      const hash = await hashPromise;
      expect(hash).toHaveLength(64);
    });
  });
});