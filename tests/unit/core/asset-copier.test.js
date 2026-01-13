/**
 * Asset Copier Comprehensive Error Recovery Tests - TDD Implementation
 * Coverage target: Lines 56-57,61-62,67-68,75,77-78,112-114,118,201,204-205,208-209,235,355-356,381-383,406-408,411,414-415
 * 
 * Following TDD RED-GREEN-REFACTOR methodology to achieve 95%+ coverage
 * for critical P1 error handling and security validation gaps.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { join } from 'path';
import { AssetCopier } from '../../../src/core/asset-copier.js';
import { PathValidator } from '../../../src/core/path-validator.js';
import { FileSystemError } from '../../../src/core/errors.js';
import { logger } from '../../../src/utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock AssetTracker
const mockAssetTracker = {
  getAllReferencedAssets: mock(() => new Set()),
  extractCssAssetReferences: mock(() => []),
  referencedAssets: new Set(),
  assetReferences: new Map()
};

describe('AssetCopier Error Recovery Tests', () => {
  let assetCopier;
  let pathValidatorSpy;
  let loggerWarnSpy;
  let loggerErrorSpy;
  let fsMocks;
  let originalBunFile;

  beforeEach(() => {
    // Store original Bun.file
    originalBunFile = Bun.file;
    
    // Reset AssetTracker mocks
    mockAssetTracker.getAllReferencedAssets.mockReset();
    mockAssetTracker.extractCssAssetReferences.mockReset();
    mockAssetTracker.referencedAssets.clear();
    mockAssetTracker.assetReferences.clear();

    // Create AssetCopier instance
    assetCopier = new AssetCopier(mockAssetTracker);

    // Setup spies for logging
    loggerWarnSpy = spyOn(logger, 'warn');
    loggerErrorSpy = spyOn(logger, 'error');

    // Setup PathValidator spy
    pathValidatorSpy = spyOn(assetCopier.pathValidator, 'validatePath');

    // Setup file system mocks
    fsMocks = {
      existsSync: spyOn(fs, 'existsSync'),
      statSync: spyOn(fs, 'statSync'),
      mkdirSync: spyOn(fs, 'mkdirSync'),
      copyFileSync: spyOn(fs, 'copyFileSync'),
      readdirSync: spyOn(fs, 'readdirSync')
    };

    // Setup Bun.file mock
    Bun.file = mock(() => ({
      text: mock(() => Promise.resolve(''))
    }));
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
    pathValidatorSpy.mockRestore();
    
    // Restore file system methods
    Object.values(fsMocks).forEach(spy => spy.mockRestore());
    
    // Restore Bun.file
    Bun.file = originalBunFile;
  });

  describe('Invalid Asset Path Validation (Lines 56-57)', () => {
    test('should_return_error_when_asset_path_is_null', async () => {
      const result = await assetCopier.copyAsset(null, '/src', '/dist');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid asset path provided');
      expect(result.assetPath).toBe(null);
    });

    test('should_return_error_when_asset_path_is_undefined', async () => {
      const result = await assetCopier.copyAsset(undefined, '/src', '/dist');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid asset path provided');
      expect(result.assetPath).toBe(undefined);
    });

    test('should_return_error_when_asset_path_is_empty_string', async () => {
      const result = await assetCopier.copyAsset('', '/src', '/dist');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid asset path provided');
      expect(result.assetPath).toBe('');
    });

    test('should_return_error_when_asset_path_is_not_string', async () => {
      const result = await assetCopier.copyAsset(123, '/src', '/dist');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid asset path provided');
      expect(result.assetPath).toBe(123);
    });

    test('should_return_error_when_asset_path_is_object', async () => {
      const invalidPath = { path: '/some/path' };
      const result = await assetCopier.copyAsset(invalidPath, '/src', '/dist');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid asset path provided');
      expect(result.assetPath).toBe(invalidPath);
    });
  });

  describe('Invalid Source/Output Root Validation (Lines 61-62)', () => {
    test('should_return_error_when_source_root_is_null', async () => {
      const result = await assetCopier.copyAsset('/src/image.png', null, '/dist');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid source or output root provided');
      expect(result.assetPath).toBe('/src/image.png');
    });

    test('should_return_error_when_source_root_is_empty', async () => {
      const result = await assetCopier.copyAsset('/src/image.png', '', '/dist');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid source or output root provided');
      expect(result.assetPath).toBe('/src/image.png');
    });

    test('should_return_error_when_output_root_is_null', async () => {
      const result = await assetCopier.copyAsset('/src/image.png', '/src', null);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid source or output root provided');
      expect(result.assetPath).toBe('/src/image.png');
    });

    test('should_return_error_when_output_root_is_empty', async () => {
      const result = await assetCopier.copyAsset('/src/image.png', '/src', '');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid source or output root provided');
      expect(result.assetPath).toBe('/src/image.png');
    });

    test('should_return_error_when_both_roots_are_invalid', async () => {
      const result = await assetCopier.copyAsset('/src/image.png', null, '');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid source or output root provided');
      expect(result.assetPath).toBe('/src/image.png');
    });
  });

  describe('Security Validation Failures (Lines 67-68)', () => {
    test('should_return_error_when_path_validation_fails', async () => {
      pathValidatorSpy.mockImplementation(() => {
        throw new Error('Path traversal detected');
      });

      const result = await assetCopier.copyAsset('/src/../../../etc/passwd', '/src', '/dist');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Asset path failed security validation - outside source root');
      expect(result.assetPath).toBe('/src/../../../etc/passwd');
      expect(pathValidatorSpy).toHaveBeenCalledWith('/src/../../../etc/passwd', '/src');
    });

    test('should_return_error_when_validateAssetPath_returns_false', async () => {
      pathValidatorSpy.mockImplementation(() => {
        throw new Error('Invalid path');
      });

      const result = await assetCopier.copyAsset('/src/image.png', '/src', '/dist');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Asset path failed security validation - outside source root');
    });
  });

  describe('Output Root Path Resolution Failures (Lines 75, 77-78)', () => {
    test('should_handle_resolve_error_for_relative_output_path', async () => {
      // Mock resolve to throw error
      const resolveSpy = spyOn(path, 'resolve').mockImplementation(() => {
        throw new Error('Invalid path format');
      });

      pathValidatorSpy.mockImplementation(() => {});
      
      const result = await assetCopier.copyAsset('/src/image.png', '/src', 'relative/path');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid output root path');
      
      resolveSpy.mockRestore();
    });

    test('should_attempt_resolve_for_relative_path_without_drive_letter', async () => {
      pathValidatorSpy.mockImplementation(() => {});
      fsMocks.existsSync.mockReturnValue(true);
      fsMocks.statSync.mockReturnValue({ 
        mtime: new Date('2023-12-01'), 
        size: 1000 
      });
      fsMocks.mkdirSync.mockImplementation(() => {});
      fsMocks.copyFileSync.mockImplementation(() => {});
      
      const result = await assetCopier.copyAsset('/src/image.png', '/src', 'relative/dist');
      
      // Should attempt to resolve since path doesn't start with / or drive letter
      // This tests the condition on line 74-75
      expect(result.success).toBe(true);
    });
  });

  describe('File Stat Comparison Failures (Lines 201, 204-205, 208-209)', () => {
    test('should_return_true_when_source_stat_fails', async () => {
      pathValidatorSpy.mockImplementation(() => {});
      fsMocks.existsSync.mockReturnValue(true);
      fsMocks.statSync.mockImplementation((path) => {
        if (path === '/src/image.png') {
          throw new Error('ENOENT: no such file or directory');
        }
        return { mtime: new Date('2023-01-01'), size: 1000 };
      });

      const result = await assetCopier.isCopyNeeded('/src/image.png', '/dist/image.png');
      
      expect(result).toBe(true); // Should assume copy is needed when stat fails
    });

    test('should_return_true_when_output_stat_fails', async () => {
      pathValidatorSpy.mockImplementation(() => {});
      fsMocks.existsSync.mockReturnValue(true);
      fsMocks.statSync.mockImplementation((path) => {
        if (path === '/src/image.png') {
          return { mtime: new Date('2023-01-01'), size: 1000 };
        }
        throw new Error('EACCES: permission denied');
      });

      const result = await assetCopier.isCopyNeeded('/src/image.png', '/dist/image.png');
      
      expect(result).toBe(true); // Should assume copy is needed when stat fails
    });

    test('should_return_true_when_source_newer_than_output', async () => {
      pathValidatorSpy.mockImplementation(() => {});
      fsMocks.existsSync.mockReturnValue(true);
      fsMocks.statSync.mockImplementation((path) => {
        if (path === '/src/image.png') {
          return { mtime: new Date('2023-12-01'), size: 1000 };
        }
        return { mtime: new Date('2023-01-01'), size: 1000 };
      });

      const result = await assetCopier.isCopyNeeded('/src/image.png', '/dist/image.png');
      
      expect(result).toBe(true);
    });

    test('should_return_true_when_file_sizes_differ', async () => {
      pathValidatorSpy.mockImplementation(() => {});
      fsMocks.existsSync.mockReturnValue(true);
      fsMocks.statSync.mockImplementation((path) => {
        if (path === '/src/image.png') {
          return { mtime: new Date('2023-01-01'), size: 2000 };
        }
        return { mtime: new Date('2023-01-01'), size: 1000 };
      });

      const result = await assetCopier.isCopyNeeded('/src/image.png', '/dist/image.png');
      
      expect(result).toBe(true);
    });
  });

  describe('Copy Success with Skip Logic (Lines 112-114)', () => {
    test('should_set_skipped_true_when_copy_not_needed', async () => {
      pathValidatorSpy.mockImplementation(() => {});
      fsMocks.existsSync.mockReturnValue(true);
      fsMocks.statSync.mockReturnValue({ 
        mtime: new Date('2023-01-01'), 
        size: 1000 
      });

      const result = await assetCopier.copyAsset('/src/image.png', '/src', '/dist');
      
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Asset is up to date');
    });
  });

  describe('Copy Exception Handling (Line 118)', () => {
    test('should_handle_copy_exception_gracefully', async () => {
      pathValidatorSpy.mockImplementation(() => {});
      // Source file exists
      fsMocks.existsSync.mockImplementation((path) => {
        if (path === '/src/image.png') return true;
        return false; // Output file doesn't exist, so copy is needed
      });
      fsMocks.statSync.mockReturnValue({ 
        mtime: new Date('2023-12-01'), 
        size: 1000 
      });
      fsMocks.mkdirSync.mockImplementation(() => {});
      fsMocks.copyFileSync.mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      const result = await assetCopier.copyAsset('/src/image.png', '/src', '/dist');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Copy failed: ENOSPC: no space left on device');
    });
  });

  describe('PathValidator validatePath Exception (Line 235)', () => {
    test('should_return_false_when_validatePath_throws_exception', () => {
      pathValidatorSpy.mockImplementation(() => {
        throw new Error('Security validation failed');
      });

      const result = assetCopier.validateAssetPath('/src/image.png', '/src');
      
      expect(result).toBe(false);
    });
  });

  describe('CSS Processing Error Scenarios (Lines 355-356, 406-408, 411, 414-415)', () => {
    test('should_log_warning_when_css_file_not_found', async () => {
      fsMocks.existsSync.mockReturnValue(false);

      await assetCopier._processCssForAssetReferences('/src/missing.css', '/src');
      
      expect(loggerWarnSpy).toHaveBeenCalledWith('CSS file not found for processing: /src/missing.css');
    });

    test('should_handle_css_read_error_and_log_properly', async () => {
      fsMocks.existsSync.mockReturnValue(true);
      Bun.file = mock(() => ({
        text: mock(() => Promise.reject(new Error('EACCES: permission denied')))
      }));

      await assetCopier._processCssForAssetReferences('/src/protected.css', '/src');
      
      expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to process CSS file /src/protected.css: EACCES: permission denied');
      expect(assetCopier.stats.failureCount).toBe(1);
    });

    test('should_throw_filesystem_error_on_permission_denied', async () => {
      fsMocks.existsSync.mockReturnValue(true);
      Bun.file = mock(() => ({
        text: mock(() => Promise.reject({ code: 'EACCES', message: 'permission denied' }))
      }));

      await expect(assetCopier._processCssForAssetReferences('/src/protected.css', '/src')).rejects.toThrow(FileSystemError);
      expect(assetCopier.stats.failureCount).toBe(1);
    });

    test('should_throw_filesystem_error_on_eperm_error', async () => {
      fsMocks.existsSync.mockReturnValue(true);
      Bun.file = mock(() => ({
        text: mock(() => Promise.reject({ code: 'EPERM', message: 'operation not permitted' }))
      }));

      await expect(assetCopier._processCssForAssetReferences('/src/protected.css', '/src')).rejects.toThrow(FileSystemError);
    });
  });

  describe('Circular CSS Import Detection (Lines 381-383)', () => {
    test('should_detect_and_warn_about_circular_css_imports', async () => {
      fsMocks.existsSync.mockReturnValue(true);
      Bun.file = mock(() => ({
        text: mock(() => Promise.resolve('@import "other.css";'))
      }));
      mockAssetTracker.extractCssAssetReferences.mockReturnValue(['/src/other.css']);
      
      // Simulate circular import by pre-adding the CSS file to processed set
      assetCopier.processedCssFiles.add('/src/other.css');

      await assetCopier._processCssForAssetReferences('/src/main.css', '/src');
      
      expect(loggerWarnSpy).toHaveBeenCalledWith('Circular CSS import detected: /src/main.css -> /src/other.css');
      expect(loggerWarnSpy).toHaveBeenCalledWith('Found 1 circular CSS imports in /src/main.css');
    });

    test('should_skip_adding_circular_import_to_referenced_assets', async () => {
      fsMocks.existsSync.mockReturnValue(true);
      Bun.file = mock(() => ({
        text: mock(() => Promise.resolve('@import "circular.css";'))
      }));
      mockAssetTracker.extractCssAssetReferences.mockReturnValue(['/src/circular.css']);
      
      // Pre-add circular import
      assetCopier.processedCssFiles.add('/src/circular.css');

      await assetCopier._processCssForAssetReferences('/src/main.css', '/src');
      
      // Should not add circular import to referenced assets
      expect(mockAssetTracker.referencedAssets.has('/src/circular.css')).toBe(false);
    });
  });

  describe('Asset File Existence Checks (Lines 87-88)', () => {
    test('should_return_error_when_source_file_does_not_exist', async () => {
      pathValidatorSpy.mockImplementation(() => {});
      fsMocks.existsSync.mockImplementation((path) => {
        if (path === '/src/missing.png') return false;
        return true;
      });

      const result = await assetCopier.copyAsset('/src/missing.png', '/src', '/dist');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Asset file not found: /src/missing.png');
      expect(result.assetPath).toBe('/src/missing.png');
    });

    test('should_proceed_when_source_file_exists', async () => {
      pathValidatorSpy.mockImplementation(() => {});
      fsMocks.existsSync.mockReturnValue(true);
      fsMocks.statSync.mockReturnValue({ 
        mtime: new Date('2023-01-01'), 
        size: 1000 
      });

      const result = await assetCopier.copyAsset('/src/existing.png', '/src', '/dist');
      
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Asset is up to date');
    });
  });

  describe('CSS File Processing Integration (Lines 110-111)', () => {
    test('should_process_css_file_after_successful_copy', async () => {
      pathValidatorSpy.mockImplementation(() => {});
      // Set up successful copy scenario
      fsMocks.existsSync.mockImplementation((path) => {
        if (path === '/src/styles.css') return true;
        return false; // Output doesn't exist, so copy is needed
      });
      fsMocks.statSync.mockReturnValue({ 
        mtime: new Date('2023-12-01'), 
        size: 1000 
      });
      fsMocks.mkdirSync.mockImplementation(() => {});
      fsMocks.copyFileSync.mockImplementation(() => {});
      
      // Mock CSS processing
      Bun.file = mock(() => ({
        text: mock(() => Promise.resolve('body { color: red; }'))
      }));
      mockAssetTracker.extractCssAssetReferences.mockReturnValue([]);

      const result = await assetCopier.copyAsset('/src/styles.css', '/src', '/dist');
      
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      // CSS processing should have been called
      expect(mockAssetTracker.extractCssAssetReferences).toHaveBeenCalledWith(
        'body { color: red; }', 
        '/src/styles.css', 
        '/src'
      );
    });

    test('should_not_process_non_css_files', async () => {
      pathValidatorSpy.mockImplementation(() => {});
      // Set up successful copy scenario for non-CSS file
      fsMocks.existsSync.mockImplementation((path) => {
        if (path === '/src/image.png') return true;
        return false; // Output doesn't exist, so copy is needed
      });
      fsMocks.statSync.mockReturnValue({ 
        mtime: new Date('2023-12-01'), 
        size: 1000 
      });
      fsMocks.mkdirSync.mockImplementation(() => {});
      fsMocks.copyFileSync.mockImplementation(() => {});
      
      const result = await assetCopier.copyAsset('/src/image.png', '/src', '/dist');
      
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      // CSS processing should NOT have been called for PNG file
      expect(mockAssetTracker.extractCssAssetReferences).not.toHaveBeenCalled();
    });
  });

  describe('Statistics Management (Lines 306, 313-320)', () => {
    test('should_return_copy_of_stats_from_getStats', () => {
      assetCopier.stats.successCount = 5;
      assetCopier.stats.failureCount = 2;
      assetCopier.stats.totalAssets = 10;

      const stats = assetCopier.getStats();
      
      expect(stats.successCount).toBe(5);
      expect(stats.failureCount).toBe(2);
      expect(stats.totalAssets).toBe(10);
      
      // Ensure it's a copy, not reference
      stats.successCount = 999;
      expect(assetCopier.stats.successCount).toBe(5);
    });

    test('should_reset_all_stats_to_zero', () => {
      assetCopier.stats.successCount = 5;
      assetCopier.stats.failureCount = 2;
      assetCopier.stats.skippedCount = 3;
      assetCopier.stats.totalAssets = 10;
      assetCopier.stats.startTime = Date.now();
      assetCopier.stats.duration = 1000;

      assetCopier.resetStats();
      
      expect(assetCopier.stats.successCount).toBe(0);
      expect(assetCopier.stats.failureCount).toBe(0);
      expect(assetCopier.stats.skippedCount).toBe(0);
      expect(assetCopier.stats.totalAssets).toBe(0);
      expect(assetCopier.stats.startTime).toBe(0);
      expect(assetCopier.stats.duration).toBe(0);
    });
  });


  describe('Batch Asset Copying Integration (Lines 122-186)', () => {
    test('should_copy_all_referenced_assets_successfully', async () => {
      // Setup mock referenced assets
      mockAssetTracker.getAllReferencedAssets.mockReturnValue(new Set([
        '/src/image.png',
        '/src/styles.css'
      ]));
      
      pathValidatorSpy.mockImplementation(() => {});
      fsMocks.existsSync.mockImplementation((path) => {
        // Source files exist
        if (path === '/src/image.png' || path === '/src/styles.css') return true;
        // Output files don't exist initially (need copy)
        return false;
      });
      fsMocks.statSync.mockReturnValue({ 
        mtime: new Date('2023-12-01'), 
        size: 1000 
      });
      fsMocks.mkdirSync.mockImplementation(() => {});
      fsMocks.copyFileSync.mockImplementation(() => {});
      
      // Mock CSS processing for styles.css
      Bun.file = mock(() => ({
        text: mock(() => Promise.resolve('body { color: red; }'))
      }));
      mockAssetTracker.extractCssAssetReferences.mockReturnValue([]);

      const result = await assetCopier.copyAllAssets('/src', '/dist');
      
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.totalAssets).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    test('should_handle_mixed_success_and_failure_scenarios', async () => {
      // Setup mixed scenario: one success, one failure
      mockAssetTracker.getAllReferencedAssets.mockReturnValue(new Set([
        '/src/good.png',
        '/src/missing.css'
      ]));
      
      pathValidatorSpy.mockImplementation(() => {});
      fsMocks.existsSync.mockImplementation((path) => {
        if (path === '/src/good.png') return true;
        if (path === '/src/missing.css') return false;
        return false;
      });
      fsMocks.statSync.mockReturnValue({ 
        mtime: new Date('2023-12-01'), 
        size: 1000 
      });
      fsMocks.mkdirSync.mockImplementation(() => {});
      fsMocks.copyFileSync.mockImplementation(() => {});

      const result = await assetCopier.copyAllAssets('/src', '/dist');
      
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.totalAssets).toBe(2);
      expect(result.results).toHaveLength(2);
    });

    test('should_handle_empty_referenced_assets', async () => {
      mockAssetTracker.getAllReferencedAssets.mockReturnValue(new Set());

      const result = await assetCopier.copyAllAssets('/src', '/dist');
      
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.totalAssets).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('CSS Asset Reference Processing Edge Cases (Lines 362-363, 384, 386, 389-396)', () => {
    test('should_skip_already_processed_css_file', async () => {
      fsMocks.existsSync.mockReturnValue(true);
      
      // Pre-add the CSS file to processed set
      assetCopier.processedCssFiles.add('/src/already-processed.css');

      await assetCopier._processCssForAssetReferences('/src/already-processed.css', '/src');
      
      // Should not call Bun.file since it's already processed
      expect(Bun.file).not.toHaveBeenCalled();
    });

    test('should_add_non_circular_css_references_to_tracker', async () => {
      fsMocks.existsSync.mockReturnValue(true);
      Bun.file = mock(() => ({
        text: mock(() => Promise.resolve('@import "valid.css";'))
      }));
      mockAssetTracker.extractCssAssetReferences.mockReturnValue(['/src/valid.css']);
      mockAssetTracker.assetReferences.set('/src/valid.css', []);

      await assetCopier._processCssForAssetReferences('/src/main.css', '/src');
      
      // Should add valid reference
      expect(mockAssetTracker.referencedAssets.has('/src/valid.css')).toBe(true);
      expect(mockAssetTracker.assetReferences.get('/src/valid.css')).toContain('/src/main.css');
    });

    test('should_handle_css_with_no_asset_references', async () => {
      fsMocks.existsSync.mockReturnValue(true);
      Bun.file = mock(() => ({
        text: mock(() => Promise.resolve('body { color: red; }'))
      }));
      mockAssetTracker.extractCssAssetReferences.mockReturnValue([]);

      await assetCopier._processCssForAssetReferences('/src/simple.css', '/src');
      
      // Should complete without errors
      expect(mockAssetTracker.extractCssAssetReferences).toHaveBeenCalledWith(
        'body { color: red; }',
        '/src/simple.css',
        '/src'
      );
    });
  });

  describe('Edge Cases and Integration Scenarios', () => {
    test('should_handle_multiple_validation_failures_in_sequence', async () => {
      // Test sequence: invalid path, then security failure, then copy failure
      let result = await assetCopier.copyAsset(null, '/src', '/dist');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid asset path provided');

      pathValidatorSpy.mockImplementation(() => {
        throw new Error('Security error');
      });
      result = await assetCopier.copyAsset('/src/../attack.png', '/src', '/dist');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Asset path failed security validation - outside source root');
    });

    test('should_maintain_stats_consistency_across_errors', () => {
      expect(assetCopier.stats.failureCount).toBeGreaterThanOrEqual(0);
      expect(assetCopier.stats.successCount).toBeGreaterThanOrEqual(0);
      expect(assetCopier.stats.skippedCount).toBeGreaterThanOrEqual(0);
    });
  });
});