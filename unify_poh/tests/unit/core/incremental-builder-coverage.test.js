/**
 * Incremental Builder Coverage Tests
 * Targets uncovered lines for critical path coverage improvement
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IncrementalBuilder } from '../../../src/core/incremental-builder.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

describe('IncrementalBuilder Coverage Enhancement', () => {
  let builder;
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(() => {
    tempDir = `/tmp/unify-coverage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sourceDir = join(tempDir, 'src');
    outputDir = join(tempDir, 'dist');
    
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    
    builder = new IncrementalBuilder();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Error Handling Coverage (Lines 76-81)', () => {
    test('should_handle_initial_build_errors_properly', async () => {
      // Mock BuildCommand to throw error
      const mockBuildCommand = {
        execute: mock(() => {
          throw new Error('Build command failed');
        })
      };
      builder.buildCommand = mockBuildCommand;

      const result = await builder.performInitialBuild(sourceDir, outputDir);

      expect(result.success).toBe(false);
      expect(result.processedFiles).toBe(0);
      expect(result.error).toBe('Build command failed');
      expect(result.buildTime).toBeGreaterThanOrEqual(0);
    });

    test('should_handle_build_command_timeout', async () => {
      // Mock BuildCommand with delayed response
      const mockBuildCommand = {
        execute: mock(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          throw new Error('Build timeout');
        })
      };
      builder.buildCommand = mockBuildCommand;

      const result = await builder.performInitialBuild(sourceDir, outputDir);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Build timeout');
    });
  });

  describe('File Change Analysis Coverage (Lines 173, 175-176, 178-183, 185-189)', () => {
    test('should_handle_new_page_file_addition', async () => {
      const newPagePath = join(sourceDir, 'new-page.html');
      writeFileSync(newPagePath, '<html><body>New page content</body></html>');

      // Mock FileClassifier to return page classification
      builder.fileClassifier.classifyFile = mock(() => ({
        isPage: true,
        isFragment: false,
        isAsset: false
      }));

      const result = await builder.handleNewFile(newPagePath, sourceDir, outputDir);

      expect(result.success).toBe(true);
      expect(result.newFiles).toBe(1);
      expect(result.buildTime).toBeGreaterThanOrEqual(0);
    });

    test('should_handle_new_asset_file_addition', async () => {
      const assetDir = join(sourceDir, 'assets');
      mkdirSync(assetDir, { recursive: true });
      const newAssetPath = join(assetDir, 'image.jpg');
      writeFileSync(newAssetPath, 'fake-image-data');

      // Mock FileClassifier to return asset classification
      builder.fileClassifier.classifyFile = mock(() => ({
        isPage: false,
        isFragment: false,
        isAsset: true
      }));

      const result = await builder.handleNewFile(newAssetPath, sourceDir, outputDir);

      expect(result.success).toBe(true);
      expect(result.newFiles).toBe(1);
    });

    test('should_handle_new_fragment_file_addition', async () => {
      const newFragmentPath = join(sourceDir, '_new-fragment.html');
      writeFileSync(newFragmentPath, '<div>New fragment content</div>');

      // Mock FileClassifier to return fragment classification
      builder.fileClassifier.classifyFile = mock(() => ({
        isPage: false,
        isFragment: true,
        isAsset: false
      }));

      const result = await builder.handleNewFile(newFragmentPath, sourceDir, outputDir);

      expect(result.success).toBe(true);
      expect(result.newFiles).toBe(0); // Fragments don't count as new files
    });

    test('should_handle_new_file_processing_errors', async () => {
      const newPagePath = join(sourceDir, 'error-page.html');
      writeFileSync(newPagePath, '<html><body>Error page</body></html>');

      // Mock FileClassifier to throw error
      builder.fileClassifier.classifyFile = mock(() => {
        throw new Error('Classification failed');
      });

      const result = await builder.handleNewFile(newPagePath, sourceDir, outputDir);

      expect(result.success).toBe(false);
      expect(result.newFiles).toBe(0);
      expect(result.error).toBe('Classification failed');
      expect(result.buildTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('File Deletion Coverage (Lines 191-237)', () => {
    test('should_handle_single_file_deletion', async () => {
      const pageToDelete = join(sourceDir, 'to-delete.html');
      const outputToDelete = join(outputDir, 'to-delete.html');
      
      // Create files first
      writeFileSync(pageToDelete, '<html><body>To be deleted</body></html>');
      writeFileSync(outputToDelete, '<html><body>To be deleted</body></html>');

      // Delete source file
      rmSync(pageToDelete);

      const result = await builder.handleDeletedFiles([pageToDelete], sourceDir, outputDir);

      expect(result.success).toBe(true);
      expect(result.cleanedFiles).toBe(1);
      expect(result.buildTime).toBeGreaterThanOrEqual(0);
    });

    test('should_handle_multiple_file_deletions', async () => {
      const filesToDelete = [
        join(sourceDir, 'delete1.html'),
        join(sourceDir, 'delete2.html'),
        join(sourceDir, 'assets', 'delete.css')
      ];
      
      const outputFiles = [
        join(outputDir, 'delete1.html'),
        join(outputDir, 'delete2.html'),
        join(outputDir, 'assets', 'delete.css')
      ];

      // Create output directory for assets
      mkdirSync(join(outputDir, 'assets'), { recursive: true });

      // Create all output files
      outputFiles.forEach(file => {
        writeFileSync(file, 'content to delete');
      });

      const result = await builder.handleDeletedFiles(filesToDelete, sourceDir, outputDir);

      expect(result.success).toBe(true);
      expect(result.cleanedFiles).toBe(3);
    });

    test('should_handle_deletion_of_nonexistent_files', async () => {
      const nonexistentFiles = [
        join(sourceDir, 'never-existed.html'),
        join(sourceDir, 'also-missing.css')
      ];

      const result = await builder.handleDeletedFiles(nonexistentFiles, sourceDir, outputDir);

      expect(result.success).toBe(true);
      expect(result.cleanedFiles).toBe(0); // No files actually deleted
    });

    test('should_handle_filesystem_errors_during_deletion', async () => {
      const problematicFile = join(sourceDir, 'problematic.html');
      const problematicOutputFile = join(outputDir, 'problematic.html');
      
      // Create the output file so deletion attempt is actually made
      writeFileSync(problematicOutputFile, 'content to delete');
      
      // Mock the fs module for dynamic import using Bun's mock.module
      const { spyOn } = require('bun:test');
      const fs = await import('fs');
      const mockRmSync = spyOn(fs, 'rmSync').mockImplementation((path, options) => {
        if (path.includes('problematic.html')) {
          throw new Error('Permission denied');
        }
        // For other files, just do nothing (normal behavior for force: true)
      });

      const result = await builder.handleDeletedFiles([problematicFile], sourceDir, outputDir);

      // Restore original function
      mockRmSync.mockRestore();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('File Analysis Coverage (Lines 259, 261, 314)', () => {
    test('should_handle_cache_analysis_errors', async () => {
      // Mock buildCache to throw error during analysis
      builder.buildCache.loadFromDisk = mock(() => {
        throw new Error('Cache corruption');
      });

      // This should fall back to treating all files as changed
      const result = await builder._analyzeFileChanges(sourceDir);

      expect(result).toHaveProperty('changed');
      expect(result).toHaveProperty('unchanged');
      expect(Array.isArray(result.changed)).toBe(true);
      expect(Array.isArray(result.unchanged)).toBe(true);
    });

    test('should_handle_source_file_enumeration_errors', async () => {
      // Create a directory that will cause enumeration issues
      const problematicDir = join(sourceDir, 'problematic');
      mkdirSync(problematicDir, { recursive: true });
      
      // Mock readdirSync to throw error using Bun-compatible approach
      const { spyOn } = require('bun:test');
      const fs = await import('fs');
      const mockReaddir = spyOn(fs, 'readdirSync').mockImplementation(() => {
        throw new Error('Access denied');
      });

      const result = await builder._getAllSourceFiles(sourceDir);

      // Restore original function
      mockReaddir.mockRestore();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0); // Should return empty array on error
    });

    test('should_handle_stat_errors_during_file_enumeration', async () => {
      writeFileSync(join(sourceDir, 'test.html'), '<html><body>Test</body></html>');
      
      // Mock statSync to throw for some files using Bun-compatible approach
      const { spyOn } = require('bun:test');
      const fs = await import('fs');
      const originalStat = fs.statSync;
      const mockStat = spyOn(fs, 'statSync').mockImplementation((path) => {
        if (path.includes('test.html')) {
          throw new Error('Stat failed');
        }
        return originalStat(path);
      });

      const result = await builder._getAllSourceFiles(sourceDir);

      // Restore original function
      mockStat.mockRestore();

      // Should skip files that can't be accessed
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Incremental Build Edge Cases', () => {
    test('should_return_zero_rebuilt_files_for_unknown_file_type', async () => {
      const unknownFile = join(sourceDir, 'unknown.xyz');
      writeFileSync(unknownFile, 'unknown content');

      // Mock FileClassifier to return unknown type
      builder.fileClassifier.classifyFile = mock(() => ({
        isPage: false,
        isFragment: false,
        isAsset: false
      }));

      const result = await builder.performIncrementalBuild(unknownFile, sourceDir, outputDir);

      expect(result.success).toBe(true);
      expect(result.rebuiltFiles).toBe(0);
      expect(result.affectedPages).toEqual([]);
      expect(result.assetsCopied).toEqual([]);
    });

    test('should_handle_dependency_tracking_errors', async () => {
      const pagePath = join(sourceDir, 'page.html');
      writeFileSync(pagePath, '<html><body>Page content</body></html>');

      // Mock FileClassifier
      builder.fileClassifier.classifyFile = mock(() => ({
        isPage: true,
        isFragment: false,
        isAsset: false
      }));

      // Mock DependencyTracker to throw error
      builder.dependencyTracker.trackPageDependencies = mock(() => {
        throw new Error('Dependency tracking failed');
      });

      // Should still complete the incremental build
      const result = await builder.performIncrementalBuild(pagePath, sourceDir, outputDir);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Dependency tracking failed');
    });

    test('should_handle_asset_copy_errors', async () => {
      const assetPath = join(sourceDir, 'assets', 'image.jpg');
      mkdirSync(join(sourceDir, 'assets'), { recursive: true });
      writeFileSync(assetPath, 'image-data');

      // Mock FileClassifier
      builder.fileClassifier.classifyFile = mock(() => ({
        isPage: false,
        isFragment: false,
        isAsset: true
      }));

      // Create read-only output directory to cause copy error
      const restrictedOutput = join(tempDir, 'restricted');
      mkdirSync(restrictedOutput, { mode: 0o444 });

      const result = await builder.performIncrementalBuild(assetPath, sourceDir, restrictedOutput);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});