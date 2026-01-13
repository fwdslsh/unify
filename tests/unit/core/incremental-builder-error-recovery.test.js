/**
 * Incremental Builder Error Recovery Tests
 * 
 * ISSUE-006: Target specific uncovered error recovery scenarios
 * Target coverage: 96.97% function / 84.74% line coverage -> 100%/95%+
 * 
 * Focuses on:
 * - Error handling in initial build (lines 106-112, 142-147)
 * - Fragment rebuild error handling (lines 194, 196)  
 * - Asset error handling (line 373)
 * - File system error scenarios (lines 386-391)
 * - Error recovery paths (lines 523-524)
 * - Cache error handling (lines 606-647)
 * - Private method error scenarios (lines 855-864, 869, 871, 876, 878-879)
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IncrementalBuilder } from '../../../src/core/incremental-builder.js';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

// Mock a RecoverableError class for testing error recovery
class RecoverableError extends Error {
  constructor(message, file = null) {
    super(message);
    this.name = 'RecoverableError';
    this.isRecoverable = true;
    this.file = file;
  }
}

describe('IncrementalBuilder Error Recovery', () => {
  let builder;
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(() => {
    tempDir = `/tmp/incremental-error-test-${Date.now()}`;
    sourceDir = join(tempDir, 'src');
    outputDir = join(tempDir, 'dist');
    
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    
    builder = new IncrementalBuilder();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Initial build error handling (lines 106-112, 142-147)', () => {
    test('should handle all files unchanged with cache hit scenario', async () => {
      // Mock buildCache to return no changed files
      builder.buildCache = {
        loadFromDisk: mock(async () => {}),
        checkMultipleFiles: mock(async () => ({
          changed: [],
          unchanged: [join(sourceDir, 'index.html')]
        }))
      };
      
      // Mock buildCommand to exist
      builder.buildCommand = {
        execute: mock(async () => ({ success: true, processedFiles: 0 }))
      };

      const result = await builder.performInitialBuild(sourceDir, outputDir);
      
      expect(result.success).toBe(true);
      expect(result.processedFiles).toBe(0);
      expect(result.cacheHits).toBe(1);
      expect(result.skippedFiles).toBe(1);
      expect(result.cacheInvalidations).toBe(0);
    });

    test('should handle buildCommand error during initial build', async () => {
      // Mock buildCommand to throw error
      builder.buildCommand = {
        execute: mock(async () => {
          throw new Error('Build command failed');
        })
      };
      
      builder.buildCache = {
        loadFromDisk: mock(async () => {}),
        checkMultipleFiles: mock(async () => ({
          changed: [join(sourceDir, 'index.html')],
          unchanged: []
        }))
      };

      const result = await builder.performInitialBuild(sourceDir, outputDir);
      
      expect(result.success).toBe(false);
      expect(result.processedFiles).toBe(0);
      expect(result.cacheHits).toBe(0);
      expect(result.error).toBe('Build command failed');
      expect(result.buildTime).toBeGreaterThan(0);
    });

    test('should handle general error in performInitialBuild without buildCommand', async () => {
      // Remove buildCommand to test direct build path
      builder.buildCommand = null;
      
      // Mock _analyzeFileChanges to throw error
      builder._analyzeFileChanges = mock(async () => {
        throw new Error('File analysis failed');
      });

      // Add a small delay to ensure positive build time
      const result = await new Promise(resolve => {
        setTimeout(async () => {
          resolve(await builder.performInitialBuild(sourceDir, outputDir));
        }, 5);
      });
      
      expect(result.success).toBe(false);
      expect(result.processedFiles).toBe(0);
      expect(result.buildTime).toBeGreaterThanOrEqual(0);
      expect(result.error).toBe('File analysis failed');
    });
  });

  describe('Fragment rebuild error handling (lines 194, 196)', () => {
    test('should handle error during fragment rebuild', async () => {
      writeFileSync(join(sourceDir, '_fragment.html'), '<div>Fragment</div>');
      
      builder.fileClassifier = {
        classifyFile: mock(() => ({ isFragment: true, isPage: false, isAsset: false }))
      };
      
      builder.dependencyTracker = {
        getAllTransitiveDependents: mock(() => [join(sourceDir, 'page.html')])
      };
      
      // Mock _rebuildSingleFile to throw error
      builder._rebuildSingleFile = mock(async () => {
        throw new Error('Rebuild failed');
      });

      const result = await builder.performIncrementalBuild(
        join(sourceDir, '_fragment.html'),
        sourceDir,
        outputDir
      );
      
      expect(result.success).toBe(false);
      expect(result.rebuiltFiles).toBe(0); // Error prevents counting as rebuilt
      expect(result.error).toBe('Rebuild failed');
    });

    test('should handle recoverable error during fragment rebuild', async () => {
      writeFileSync(join(sourceDir, '_fragment.html'), '<div>Fragment</div>');
      
      builder.fileClassifier = {
        classifyFile: mock(() => ({ isFragment: true, isPage: false, isAsset: false }))
      };
      
      builder.dependencyTracker = {
        getAllTransitiveDependents: mock(() => [join(sourceDir, 'page.html')])
      };
      
      // Mock _rebuildSingleFile to throw RecoverableError
      builder._rebuildSingleFile = mock(async () => {
        throw new RecoverableError('Missing dependency', join(sourceDir, 'missing.html'));
      });

      const result = await builder.performIncrementalBuild(
        join(sourceDir, '_fragment.html'),
        sourceDir,
        outputDir
      );
      
      expect(result.success).toBe(false);
      expect(result.recoverable).toBe(true);
      expect(result.errors[0].type).toBe('RecoverableError');
      expect(result.errors[0].file).toBe(join(sourceDir, 'missing.html'));
    });
  });

  describe('Asset error handling (line 373)', () => {
    test('should handle asset processing error', async () => {
      writeFileSync(join(sourceDir, 'image.png'), 'fake image content');
      
      builder.fileClassifier = {
        classifyFile: mock(() => ({ isAsset: true, isPage: false, isFragment: false }))
      };
      
      // Mock _copyAsset to throw error
      builder._copyAsset = mock(async () => {
        throw new Error('Asset copy failed');
      });

      const result = await builder.performIncrementalBuild(
        join(sourceDir, 'image.png'),
        sourceDir,
        outputDir
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Asset copy failed');
      expect(result.copiedAssets).toBe(0);
    });
  });

  describe('File system error scenarios (lines 386-391)', () => {
    test('should handle permission denied error gracefully', async () => {
      const mockError = new Error('permission denied accessing file');
      mockError.code = 'EACCES';
      
      builder.fileClassifier = {
        classifyFile: mock(() => ({ isPage: true, isFragment: false, isAsset: false }))
      };
      
      builder._rebuildSingleFile = mock(async () => {
        throw mockError;
      });

      const result = await builder.performIncrementalBuild(
        join(sourceDir, 'page.html'),
        sourceDir,
        outputDir
      );
      
      expect(result.success).toBe(false);
      expect(result.errors[0].type).toBe('FilesystemError');
      expect(result.error).toContain('permission denied');
    });

    test('should handle ENOENT file not found error', async () => {
      const mockError = new Error('Source file not found: /missing/file.html');
      mockError.code = 'ENOENT';
      
      builder.fileClassifier = {
        classifyFile: mock(() => ({ isPage: true, isFragment: false, isAsset: false }))
      };
      
      builder._rebuildSingleFile = mock(async () => {
        throw mockError;
      });

      const result = await builder.performIncrementalBuild(
        join(sourceDir, 'missing.html'),
        sourceDir,
        outputDir
      );
      
      expect(result.success).toBe(false);
      expect(result.errors[0].type).toBe('FilesystemError');
      expect(result.error).toContain('Source file not found');
    });
  });

  describe('Error recovery in handleNewFile method', () => {
    test('should handle error when processing new file', async () => {
      writeFileSync(join(sourceDir, 'newpage.html'), '<html>New Page</html>');
      
      builder.fileClassifier = {
        classifyFile: mock(() => ({ isPage: true, isFragment: false, isAsset: false }))
      };
      
      builder._rebuildSingleFile = mock(async () => {
        throw new Error('Processing failed');
      });

      const result = await builder.handleNewFile(
        join(sourceDir, 'newpage.html'),
        sourceDir,
        outputDir
      );
      
      expect(result.success).toBe(false);
      expect(result.newFiles).toBe(0);
      expect(result.error).toBe('Processing failed');
    });

    test('should handle asset copy error in handleNewFile', async () => {
      writeFileSync(join(sourceDir, 'newimage.png'), 'fake image');
      
      builder.fileClassifier = {
        classifyFile: mock(() => ({ isAsset: true, isPage: false, isFragment: false }))
      };
      
      builder._copyAsset = mock(async () => {
        throw new Error('Asset copy failed');
      });

      const result = await builder.handleNewFile(
        join(sourceDir, 'newimage.png'),
        sourceDir,
        outputDir
      );
      
      expect(result.success).toBe(false);
      expect(result.newFiles).toBe(0);
      expect(result.error).toBe('Asset copy failed');
    });
  });

  describe('Cache error handling', () => {
    test('should handle cache load error gracefully', async () => {
      builder.buildCache = {
        loadFromDisk: mock(async () => {
          throw new Error('Cache load failed');
        }),
        checkMultipleFiles: mock(async () => ({
          changed: [],
          unchanged: []
        }))
      };

      builder.buildCommand = {
        execute: mock(async () => ({ success: true, processedFiles: 0 }))
      };

      // Should not throw despite cache error
      const result = await builder.performInitialBuild(sourceDir, outputDir);
      
      // Result may succeed despite cache error
      expect(result).toBeDefined();
      expect(result.buildTime).toBeGreaterThan(0);
    });
  });

  describe('Private method error scenarios', () => {
    test('should handle build time calculation for minimum value', async () => {
      // Test the Math.max(1, buildTime) logic by simulating very fast operation
      const startTime = Date.now() + 100; // Future timestamp to create negative duration
      
      builder.fileClassifier = {
        classifyFile: mock(() => ({ isPage: true, isFragment: false, isAsset: false }))
      };
      
      builder._rebuildSingleFile = mock(async () => {
        throw new Error('Test error');
      });

      // Mock Date.now to simulate past start time scenario
      const originalDateNow = Date.now;
      Date.now = mock(() => startTime - 10); // Simulate negative duration

      const result = await builder.performIncrementalBuild(
        join(sourceDir, 'test.html'),
        sourceDir,
        outputDir
      );
      
      // Restore original Date.now
      Date.now = originalDateNow;
      
      expect(result.success).toBe(false);
      expect(result.buildTime).toBe(1); // Should be minimum 1 due to Math.max
    });

    test('should handle non-recoverable build error with default values', async () => {
      // Test general error path with minimal error object
      const minimalError = new Error('General build error');
      
      builder.fileClassifier = {
        classifyFile: mock(() => ({ isPage: true, isFragment: false, isAsset: false }))
      };
      
      builder._rebuildSingleFile = mock(async () => {
        throw minimalError;
      });

      const result = await builder.performIncrementalBuild(
        join(sourceDir, 'test.html'),
        sourceDir,
        outputDir
      );
      
      expect(result.success).toBe(false);
      expect(result.errors[0].type).toBe('BuildError');
      expect(result.errors[0].file).toBe('unknown'); // Default value when no file info
    });

    test('should handle error recovery with collected errors', async () => {
      writeFileSync(join(sourceDir, 'page.html'), '<html>Page</html>');
      
      builder.fileClassifier = {
        classifyFile: mock(() => ({ isPage: true, isFragment: false, isAsset: false }))
      };
      
      // Mock _rebuildSingleFile to return errors but not throw
      builder._rebuildSingleFile = mock(async () => {
        return [{
          message: 'Warning: deprecated syntax',
          type: 'warning'
        }];
      });

      const result = await builder.performIncrementalBuild(
        join(sourceDir, 'page.html'),
        sourceDir,
        outputDir
      );
      
      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].message).toBe('Warning: deprecated syntax');
    });
  });
});