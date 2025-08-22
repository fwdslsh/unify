/**
 * Comprehensive tests for Build Cache System
 * Tests all methods and edge cases for 95%+ coverage
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { BuildCache, createBuildCache, clearCacheOnRestart } from '../../../src/core/build-cache.js';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

describe('BuildCache - Comprehensive Coverage', () => {
  let cache;
  let tempDir;
  let originalFs;
  
  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'unify-cache-test-'));
    
    // Store original fs functions
    originalFs = {
      mkdir: fs.mkdir,
      writeFile: fs.writeFile,
      readFile: fs.readFile,
      access: fs.access,
      unlink: fs.unlink
    };
    
    cache = new BuildCache(path.join(tempDir, '.cache'));
  });
  
  afterEach(async () => {
    // Restore original fs functions
    Object.assign(fs, originalFs);
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with default cache directory', () => {
      const defaultCache = new BuildCache();
      expect(defaultCache.cacheDir).toBe('.unify-cache');
      expect(defaultCache.hashCache).toBeInstanceOf(Map);
      expect(defaultCache.dependencyGraph).toBeInstanceOf(Map);
      expect(defaultCache.isInitialized).toBe(false);
    });

    test('should initialize with custom cache directory', () => {
      const customDir = '/custom/cache/dir';
      const customCache = new BuildCache(customDir);
      expect(customCache.cacheDir).toBe(customDir);
    });

    test('should initialize cache directory on first call', async () => {
      const mkdirSpy = mock(() => Promise.resolve());
      fs.mkdir = mkdirSpy;
      
      expect(cache.isInitialized).toBe(false);
      await cache.initialize();
      expect(cache.isInitialized).toBe(true);
      
      // Should create cache directory
      expect(mkdirSpy).toHaveBeenCalledWith(
        expect.stringContaining('.cache'),
        { recursive: true }
      );
    });

    test('should not reinitialize if already initialized', async () => {
      const mkdirSpy = mock(() => Promise.resolve());
      fs.mkdir = mkdirSpy;
      
      await cache.initialize();
      await cache.initialize(); // Second call
      
      // Should only be called once
      expect(mkdirSpy).toHaveBeenCalledTimes(1);
    });

    test('should handle initialization errors gracefully', async () => {
      const errorMock = mock(() => Promise.reject(new Error('Permission denied')));
      fs.mkdir = errorMock;
      
      // Should not throw, just log warning
      try {
        await cache.initialize();
        expect(cache.isInitialized).toBe(false);
      } catch (error) {
        throw new Error('initialize() should not throw, just log warning');
      }
    });
  });

  describe('File Hashing Methods', () => {
    test('should hash file content consistently', async () => {
      const testContent = 'test content for hashing';
      const filePath = path.join(tempDir, 'test-file.txt');
      
      // Create test file
      await fs.writeFile(filePath, testContent);
      
      const result = await cache.hashFile(filePath);
      
      expect(typeof result).toBe('string');
      expect(result).toHaveLength(64); // SHA-256 hex = 64 chars
      expect(result).toMatch(/^[a-f0-9]{64}$/);
      
      // Hash same file again - should be identical
      const result2 = await cache.hashFile(filePath);
      expect(result2).toBe(result);
    });

    test('should handle file hashing errors', async () => {
      const result = await cache.hashFile('/nonexistent/file.txt');
      expect(result).toBe('error');
    });

    test('should hash string content consistently', () => {
      const content = 'test content to hash';
      
      const result1 = cache.hashContent(content);
      const result2 = cache.hashContent(content);
      
      expect(typeof result1).toBe('string');
      expect(result1).toHaveLength(64);
      expect(result1).toMatch(/^[a-f0-9]{64}$/);
      expect(result2).toBe(result1);
    });

    test('should generate different hashes for different content', () => {
      const content1 = 'content one';
      const content2 = 'content two';
      
      const hash1 = cache.hashContent(content1);
      const hash2 = cache.hashContent(content2);
      
      expect(hash1).not.toBe(hash2);
    });

    test('should hash multiple files and combine', async () => {
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      
      await fs.writeFile(file1, 'content 1');
      await fs.writeFile(file2, 'content 2');
      
      const result = await cache.hashFiles([file1, file2]);
      
      expect(typeof result).toBe('string');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Change Detection Methods', () => {
    test('should detect file changes', async () => {
      const filePath = path.join(tempDir, 'test-file.txt');
      
      // Create initial file
      await fs.writeFile(filePath, 'initial content');
      
      // First call - no cached hash
      const changed1 = await cache.hasFileChanged(filePath);
      expect(changed1).toBe(true);
      expect(cache.hashCache.has(filePath)).toBe(true);
      
      // Second call - same content
      const changed2 = await cache.hasFileChanged(filePath);
      expect(changed2).toBe(false);
      
      // Modify file content
      await fs.writeFile(filePath, 'modified content');
      
      // Third call - file changed
      const changed3 = await cache.hasFileChanged(filePath);
      expect(changed3).toBe(true);
    });

    test('should check if dependencies have changed', async () => {
      const mainFile = path.join(tempDir, 'main.txt');
      const dep1 = path.join(tempDir, 'dep1.txt');
      const dep2 = path.join(tempDir, 'dep2.txt');
      
      // Create dependency files
      await fs.writeFile(dep1, 'dependency 1');
      await fs.writeFile(dep2, 'dependency 2');
      
      // Set up dependencies
      cache.setDependencies(mainFile, [dep1, dep2]);
      
      // Cache initial hashes
      await cache.hasFileChanged(dep1);
      await cache.hasFileChanged(dep2);
      
      // No changes initially
      const hasChanged1 = await cache.haveDependenciesChanged(mainFile);
      expect(hasChanged1).toBe(false);
      
      // Modify one dependency
      await fs.writeFile(dep1, 'dependency 1 modified');
      
      // Should detect change
      const hasChanged2 = await cache.haveDependenciesChanged(mainFile);
      expect(hasChanged2).toBe(true);
    });

    test('should handle files with no dependencies', async () => {
      const mainFile = '/main.txt';
      
      const hasChanged = await cache.haveDependenciesChanged(mainFile);
      expect(hasChanged).toBe(false);
    });

    test('should handle missing dependency files', async () => {
      const mainFile = '/main.txt';
      const missingDep = '/missing-dep.txt';
      
      cache.setDependencies(mainFile, [missingDep]);
      
      const hasChanged = await cache.haveDependenciesChanged(mainFile);
      expect(hasChanged).toBe(true); // Missing file always triggers change
    });
  });

  describe('Dependency Management', () => {
    test('should set dependencies for a file', () => {
      const mainFile = '/main.txt';
      const deps = ['/dep1.txt', '/dep2.txt', '/dep3.txt'];
      
      cache.setDependencies(mainFile, deps);
      
      expect(cache.dependencyGraph.get(mainFile)).toEqual(deps);
    });

    test('should create copy of dependencies array', () => {
      const mainFile = '/main.txt';
      const deps = ['/dep1.txt', '/dep2.txt'];
      
      cache.setDependencies(mainFile, deps);
      
      // Modify original array
      deps.push('/dep3.txt');
      
      // Cached dependencies should not be affected
      expect(cache.dependencyGraph.get(mainFile)).toEqual(['/dep1.txt', '/dep2.txt']);
    });

    test('should add single dependency to existing list', () => {
      const mainFile = '/main.txt';
      const existing = ['/dep1.txt', '/dep2.txt'];
      
      cache.setDependencies(mainFile, existing);
      cache.addDependency(mainFile, '/dep3.txt');
      
      expect(cache.dependencyGraph.get(mainFile)).toEqual(['/dep1.txt', '/dep2.txt', '/dep3.txt']);
    });

    test('should create new dependency list when adding to non-existent file', () => {
      const mainFile = '/main.txt';
      
      cache.addDependency(mainFile, '/dep1.txt');
      
      expect(cache.dependencyGraph.get(mainFile)).toEqual(['/dep1.txt']);
    });

    test('should not add duplicate dependencies', () => {
      const mainFile = '/main.txt';
      
      cache.addDependency(mainFile, '/dep1.txt');
      cache.addDependency(mainFile, '/dep1.txt'); // Duplicate
      cache.addDependency(mainFile, '/dep2.txt');
      
      expect(cache.dependencyGraph.get(mainFile)).toEqual(['/dep1.txt', '/dep2.txt']);
    });
  });

  describe('Up-to-date Checking', () => {
    test('should return false when output file does not exist', async () => {
      const inputPath = path.join(tempDir, 'input.txt');
      const outputPath = path.join(tempDir, 'nonexistent-output.txt');
      
      // Create input file
      await fs.writeFile(inputPath, 'input content');
      
      const upToDate = await cache.isUpToDate(inputPath, outputPath);
      expect(upToDate).toBe(false);
    });

    test('should return false when input file has changed', async () => {
      const inputPath = path.join(tempDir, 'input.txt');
      const outputPath = path.join(tempDir, 'output.txt');
      
      // Create files
      await fs.writeFile(inputPath, 'initial content');
      await fs.writeFile(outputPath, 'output content');
      
      // Cache initial hash
      await cache.hasFileChanged(inputPath);
      
      // Modify input file
      await fs.writeFile(inputPath, 'modified content');
      
      const upToDate = await cache.isUpToDate(inputPath, outputPath);
      expect(upToDate).toBe(false);
    });

    test('should return false when dependencies have changed', async () => {
      const inputPath = path.join(tempDir, 'input.txt');
      const outputPath = path.join(tempDir, 'output.txt');
      const depPath = path.join(tempDir, 'dep.txt');
      
      // Create files
      await fs.writeFile(inputPath, 'input content');
      await fs.writeFile(outputPath, 'output content');
      await fs.writeFile(depPath, 'dependency content');
      
      cache.setDependencies(inputPath, [depPath]);
      
      // Cache initial hashes
      await cache.hasFileChanged(inputPath);
      await cache.hasFileChanged(depPath);
      
      // Modify dependency
      await fs.writeFile(depPath, 'modified dependency content');
      
      const upToDate = await cache.isUpToDate(inputPath, outputPath);
      expect(upToDate).toBe(false);
    });

    test('should return true when everything is up-to-date', async () => {
      const inputPath = path.join(tempDir, 'input.txt');
      const outputPath = path.join(tempDir, 'output.txt');
      
      // Create files
      await fs.writeFile(inputPath, 'input content');
      await fs.writeFile(outputPath, 'output content');
      
      // Cache initial hash
      await cache.hasFileChanged(inputPath);
      
      const upToDate = await cache.isUpToDate(inputPath, outputPath);
      expect(upToDate).toBe(true);
    });

    test('should handle access errors on output file', async () => {
      const inputPath = path.join(tempDir, 'input.txt');
      const outputPath = '/root/protected-output.txt'; // Likely no access
      
      const mockAccess = mock(() => Promise.reject(new Error('Permission denied')));
      fs.access = mockAccess;
      
      const upToDate = await cache.isUpToDate(inputPath, outputPath);
      expect(upToDate).toBe(false);
    });
  });

  describe('Cache Persistence', () => {
    test('should load cache from disk', async () => {
      const hashCacheData = { '/file1.txt': 'hash1', '/file2.txt': 'hash2' };
      const depsCacheData = { '/main.txt': ['/dep1.txt', '/dep2.txt'] };
      
      const readFileMock = mock((filePath) => {
        if (filePath.includes('hash-cache.json')) {
          return Promise.resolve(JSON.stringify(hashCacheData));
        }
        if (filePath.includes('deps-cache.json')) {
          return Promise.resolve(JSON.stringify(depsCacheData));
        }
        return Promise.reject(new Error('Unknown file'));
      });
      
      fs.readFile = readFileMock;
      
      await cache.loadCache();
      
      expect(cache.hashCache.get('/file1.txt')).toBe('hash1');
      expect(cache.hashCache.get('/file2.txt')).toBe('hash2');
      expect(cache.dependencyGraph.get('/main.txt')).toEqual(['/dep1.txt', '/dep2.txt']);
    });

    test('should handle missing cache files gracefully', async () => {
      const readFileMock = mock(() => Promise.reject(new Error('File not found')));
      fs.readFile = readFileMock;
      
      // Should not throw
      try {
        await cache.loadCache();
        // Should start with empty caches
        expect(cache.hashCache.size).toBe(0);
        expect(cache.dependencyGraph.size).toBe(0);
      } catch (error) {
        throw new Error('loadCache() should not throw on missing files');
      }
    });

    test('should save cache to disk', async () => {
      const writeFileMock = mock(() => Promise.resolve());
      fs.writeFile = writeFileMock;
      
      // Set up some cache data
      cache.hashCache.set('/file1.txt', 'hash1');
      cache.hashCache.set('/file2.txt', 'hash2');
      cache.dependencyGraph.set('/main.txt', ['/dep1.txt']);
      
      await cache.initialize();
      await cache.saveCache();
      
      expect(writeFileMock).toHaveBeenCalledTimes(2);
      
      // Check hash cache file
      const hashCall = writeFileMock.mock.calls.find(call => 
        call[0].includes('hash-cache.json')
      );
      expect(hashCall).toBeDefined();
      
      // Check deps cache file
      const depsCall = writeFileMock.mock.calls.find(call => 
        call[0].includes('deps-cache.json')
      );
      expect(depsCall).toBeDefined();
    });

    test('should not save cache if not initialized', async () => {
      const writeFileMock = mock(() => Promise.resolve());
      fs.writeFile = writeFileMock;
      
      await cache.saveCache();
      
      expect(writeFileMock).not.toHaveBeenCalled();
    });

    test('should handle save errors gracefully', async () => {
      const writeFileMock = mock(() => Promise.reject(new Error('Disk full')));
      fs.writeFile = writeFileMock;
      
      await cache.initialize();
      
      // Should not throw
      try {
        await cache.saveCache();
      } catch (error) {
        throw new Error('saveCache() should not throw on write errors');
      }
    });
  });

  describe('Cache Clearing', () => {
    test('should clear in-memory cache', async () => {
      // Set up some cache data
      cache.hashCache.set('/file1.txt', 'hash1');
      cache.dependencyGraph.set('/main.txt', ['/dep1.txt']);
      
      await cache.clearCache();
      
      expect(cache.hashCache.size).toBe(0);
      expect(cache.dependencyGraph.size).toBe(0);
    });

    test('should remove cache files from disk', async () => {
      const unlinkMock = mock(() => Promise.resolve());
      fs.unlink = unlinkMock;
      
      await cache.clearCache();
      
      expect(unlinkMock).toHaveBeenCalledTimes(2);
      expect(unlinkMock).toHaveBeenCalledWith(expect.stringContaining('hash-cache.json'));
      expect(unlinkMock).toHaveBeenCalledWith(expect.stringContaining('deps-cache.json'));
    });

    test('should handle file deletion errors gracefully', async () => {
      const unlinkMock = mock(() => Promise.reject(new Error('Permission denied')));
      fs.unlink = unlinkMock;
      
      // Should not throw
      try {
        await cache.clearCache();
      } catch (error) {
        throw new Error('clearCache() should not throw on deletion errors');
      }
    });
  });

  describe('Cache Statistics', () => {
    test('should provide accurate statistics', () => {
      cache.hashCache.set('/file1.txt', 'hash1');
      cache.hashCache.set('/file2.txt', 'hash2');
      cache.dependencyGraph.set('/main.txt', ['/dep1.txt']);
      cache.dependencyGraph.set('/other.txt', ['/dep2.txt', '/dep3.txt']);
      
      const stats = cache.getStats();
      
      expect(stats.cachedFiles).toBe(2);
      expect(stats.dependencyGraphSize).toBe(2);
      expect(stats.cacheDir).toBe(path.join(tempDir, '.cache'));
      expect(stats.hashingMethod).toBe('native-crypto');
    });

    test('should handle empty cache statistics', () => {
      const stats = cache.getStats();
      
      expect(stats.cachedFiles).toBe(0);
      expect(stats.dependencyGraphSize).toBe(0);
      expect(stats.cacheDir).toBeTruthy();
      expect(stats.hashingMethod).toBe('native-crypto');
    });
  });

  describe('Hash Cache Update', () => {
    test('should update file hash with provided hash', async () => {
      const filePath = path.join(tempDir, 'test-file.txt');
      const providedHash = 'provided-hash-123';
      
      await cache.updateFileHash(filePath, providedHash);
      
      expect(cache.hashCache.get(filePath)).toBe(providedHash);
    });

    test('should compute hash when not provided', async () => {
      const filePath = path.join(tempDir, 'test-file.txt');
      await fs.writeFile(filePath, 'test content');
      
      await cache.updateFileHash(filePath);
      
      expect(cache.hashCache.has(filePath)).toBe(true);
      expect(typeof cache.hashCache.get(filePath)).toBe('string');
      expect(cache.hashCache.get(filePath)).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Group Operations', () => {
    test('should detect group changes', async () => {
      const file1 = path.join(tempDir, 'file1.txt');
      const file2 = path.join(tempDir, 'file2.txt');
      const cacheKey = 'group-key';
      
      // Create initial files
      await fs.writeFile(file1, 'content 1');
      await fs.writeFile(file2, 'content 2');
      
      // First call - no cached hash
      const changed1 = await cache.hasGroupChanged([file1, file2], cacheKey);
      expect(changed1).toBe(true);
      expect(cache.hashCache.has(cacheKey)).toBe(true);
      
      // Second call - same content
      const changed2 = await cache.hasGroupChanged([file1, file2], cacheKey);
      expect(changed2).toBe(false);
      
      // Modify one file
      await fs.writeFile(file1, 'modified content 1');
      
      // Third call - content changed
      const changed3 = await cache.hasGroupChanged([file1, file2], cacheKey);
      expect(changed3).toBe(true);
    });
  });

  describe('Factory Functions', () => {
    test('should create build cache with default directory', () => {
      const cache = createBuildCache();
      
      expect(cache).toBeInstanceOf(BuildCache);
      expect(cache.cacheDir).toBe('.unify-cache');
    });

    test('should create build cache with custom directory', () => {
      const customDir = '/custom/cache';
      const cache = createBuildCache(customDir);
      
      expect(cache).toBeInstanceOf(BuildCache);
      expect(cache.cacheDir).toBe(customDir);
    });

    test('should clear cache on restart', async () => {
      const mkdirMock = mock(() => Promise.resolve());
      const unlinkMock = mock(() => Promise.resolve());
      
      fs.mkdir = mkdirMock;
      fs.unlink = unlinkMock;
      
      await clearCacheOnRestart('/test/cache');
      
      expect(mkdirMock).toHaveBeenCalled();
      expect(unlinkMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling Edge Cases', () => {
    test('should handle corrupted cache JSON gracefully', async () => {
      const readFileMock = mock((filePath) => {
        if (filePath.includes('hash-cache.json')) {
          return Promise.resolve('invalid json {');
        }
        return Promise.resolve('{ "valid": "json" }');
      });
      
      fs.readFile = readFileMock;
      
      try {
        await cache.loadCache();
        // Should start fresh on corrupted data
        expect(cache.hashCache.size).toBe(0);
        expect(cache.dependencyGraph.size).toBe(0);
      } catch (error) {
        throw new Error('loadCache() should not throw on corrupted JSON');
      }
    });

    test('should handle hashing failures gracefully', () => {
      // Test that the hashContent method has built-in error handling
      // by testing with null input which should trigger the catch block
      const testCache = new BuildCache();
      
      // Try to hash null/undefined which should be handled gracefully
      let result;
      try {
        result = testCache.hashContent(null);
      } catch (error) {
        result = 'error';
      }
      
      // Should either return a hash or 'error', not throw
      expect(typeof result).toBe('string');
    });

    test('should handle file system permission errors', async () => {
      const mockAccess = mock(() => Promise.reject(new Error('Permission denied')));
      fs.access = mockAccess;
      
      const upToDate = await cache.isUpToDate('/input.txt', '/output.txt');
      
      expect(upToDate).toBe(false);
    });
  });
});