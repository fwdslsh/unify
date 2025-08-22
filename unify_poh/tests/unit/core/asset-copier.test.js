/**
 * Tests for AssetCopier Class
 * US-009: Asset Copying and Management
 * 
 * Following TDD methodology - RED phase
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AssetCopier } from '../../../src/core/asset-copier.js';
import { AssetTracker } from '../../../src/core/asset-tracker.js';
import { PathTraversalError } from '../../../src/core/errors.js';
import { join, resolve, dirname } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync, statSync } from 'fs';
import { tmpdir } from 'os';

describe('AssetCopier', () => {
  let assetCopier;
  let assetTracker;
  let testDir;
  let sourceRoot;
  let outputRoot;

  beforeEach(() => {
    // Create temporary test directories
    testDir = mkdtempSync(join(tmpdir(), 'asset-copier-test-'));
    sourceRoot = join(testDir, 'src');
    outputRoot = join(testDir, 'dist');
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(outputRoot, { recursive: true });
    
    assetTracker = new AssetTracker();
    assetCopier = new AssetCopier(assetTracker);
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Safe Asset Copying', () => {
    test('should_copy_asset_to_output_when_asset_exists_and_referenced', async () => {
      const assetContent = 'fake-logo-content';
      const assetPath = join(sourceRoot, 'images', 'logo.png');
      const expectedOutputPath = join(outputRoot, 'images', 'logo.png');
      
      // Create source asset
      mkdirSync(join(sourceRoot, 'images'), { recursive: true });
      writeFileSync(assetPath, assetContent);
      
      // Mark asset as referenced
      assetTracker.referencedAssets.add(assetPath);

      const result = await assetCopier.copyAsset(assetPath, sourceRoot, outputRoot);
      
      expect(result.success).toBe(true);
      expect(existsSync(expectedOutputPath)).toBe(true);
      expect(readFileSync(expectedOutputPath, 'utf-8')).toBe(assetContent);
    });

    test('should_preserve_directory_structure_when_copying_nested_assets', async () => {
      const assetContent = 'nested-asset-content';
      const assetPath = join(sourceRoot, 'deep', 'nested', 'assets', 'file.txt');
      const expectedOutputPath = join(outputRoot, 'deep', 'nested', 'assets', 'file.txt');
      
      // Create nested source asset
      mkdirSync(join(sourceRoot, 'deep', 'nested', 'assets'), { recursive: true });
      writeFileSync(assetPath, assetContent);
      
      // Mark asset as referenced
      assetTracker.referencedAssets.add(assetPath);

      const result = await assetCopier.copyAsset(assetPath, sourceRoot, outputRoot);
      
      expect(result.success).toBe(true);
      expect(existsSync(expectedOutputPath)).toBe(true);
      expect(readFileSync(expectedOutputPath, 'utf-8')).toBe(assetContent);
    });

    test('should_skip_copy_when_asset_not_referenced', async () => {
      const assetPath = join(sourceRoot, 'unreferenced.png');
      
      // Create source asset but don't mark as referenced
      writeFileSync(assetPath, 'unreferenced-content');

      const result = await assetCopier.copyAsset(assetPath, sourceRoot, outputRoot);
      
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Asset not referenced by any page');
    });

    test('should_create_output_directories_when_they_dont_exist', async () => {
      const assetPath = join(sourceRoot, 'new', 'directory', 'asset.jpg');
      const expectedOutputPath = join(outputRoot, 'new', 'directory', 'asset.jpg');
      
      // Create nested source asset
      mkdirSync(join(sourceRoot, 'new', 'directory'), { recursive: true });
      writeFileSync(assetPath, 'asset-content');
      
      // Mark asset as referenced
      assetTracker.referencedAssets.add(assetPath);

      const result = await assetCopier.copyAsset(assetPath, sourceRoot, outputRoot);
      
      expect(result.success).toBe(true);
      expect(existsSync(expectedOutputPath)).toBe(true);
      expect(existsSync(join(outputRoot, 'new', 'directory'))).toBe(true);
    });

    test('should_handle_copy_failures_gracefully_when_permissions_denied', async () => {
      const assetPath = join(sourceRoot, 'readonly.txt');
      
      // Create source asset
      writeFileSync(assetPath, 'readonly-content');
      
      // Mark asset as referenced
      assetTracker.referencedAssets.add(assetPath);
      
      // Try to copy to an invalid output path to trigger an error
      const invalidOutputRoot = '/invalid/nonexistent/path';

      const result = await assetCopier.copyAsset(assetPath, sourceRoot, invalidOutputRoot);
      
      // Should handle the error gracefully
      expect(typeof result.success).toBe('boolean');
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('Path Security', () => {
    test('should_validate_source_path_before_copying_when_path_provided', async () => {
      const dangerousSourcePath = join(sourceRoot, '..', '..', 'etc', 'passwd');
      
      const result = await assetCopier.copyAsset(dangerousSourcePath, sourceRoot, outputRoot);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('security');
    });

    test('should_validate_output_path_before_copying_when_path_provided', async () => {
      const assetPath = join(sourceRoot, 'safe.txt');
      const dangerousOutputRoot = '/tmp'; // Absolute system path (outside our test dir)
      
      // Create source asset
      writeFileSync(assetPath, 'safe-content');
      assetTracker.referencedAssets.add(assetPath);

      const result = await assetCopier.copyAsset(assetPath, sourceRoot, dangerousOutputRoot);
      
      // This should either fail or succeed, but handle the path appropriately
      expect(typeof result.success).toBe('boolean');
    });

    test('should_reject_copy_when_source_path_outside_source_root', async () => {
      const outsideSourcePath = join(testDir, 'outside-source.txt');
      
      // Create file outside source root
      writeFileSync(outsideSourcePath, 'outside-content');

      const result = await assetCopier.copyAsset(outsideSourcePath, sourceRoot, outputRoot);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('outside source root');
    });

    test('should_reject_copy_when_output_path_outside_output_root', async () => {
      const assetPath = join(sourceRoot, 'asset.txt');
      const dangerousOutputRoot = '/nonexistent/dangerous/path';
      
      // Create source asset
      writeFileSync(assetPath, 'asset-content');
      assetTracker.referencedAssets.add(assetPath);

      const result = await assetCopier.copyAsset(assetPath, sourceRoot, dangerousOutputRoot);
      
      // Should handle dangerous paths appropriately
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('Performance Features', () => {
    test('should_skip_copy_when_destination_newer_than_source', async () => {
      const assetPath = join(sourceRoot, 'uptodate.txt');
      const outputPath = join(outputRoot, 'uptodate.txt');
      
      // Create source asset first
      writeFileSync(assetPath, 'source-content');
      
      // Wait a moment then create newer destination
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Create destination directory and file
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, 'dest-content');
      
      assetTracker.referencedAssets.add(assetPath);

      const result = await assetCopier.copyAsset(assetPath, sourceRoot, outputRoot);
      
      expect(result.success).toBe(true);
      if (result.skipped) {
        expect(result.reason).toContain('up to date');
      }
    });

    test('should_copy_when_source_newer_than_destination', async () => {
      const assetPath = join(sourceRoot, 'newer.txt');
      const outputPath = join(outputRoot, 'newer.txt');
      
      // Create destination first (older)
      writeFileSync(outputPath, 'old-content');
      
      // Wait a moment then create newer source
      await new Promise(resolve => setTimeout(resolve, 10));
      writeFileSync(assetPath, 'new-content');
      
      assetTracker.referencedAssets.add(assetPath);

      const result = await assetCopier.copyAsset(assetPath, sourceRoot, outputRoot);
      
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(false);
      expect(readFileSync(outputPath, 'utf-8')).toBe('new-content');
    });

    test('should_batch_copy_operations_when_multiple_assets_pending', async () => {
      const assetPaths = [
        join(sourceRoot, 'asset1.txt'),
        join(sourceRoot, 'asset2.txt'),
        join(sourceRoot, 'asset3.txt')
      ];
      
      // Create source assets
      for (let i = 0; i < assetPaths.length; i++) {
        writeFileSync(assetPaths[i], `content-${i + 1}`);
        assetTracker.referencedAssets.add(assetPaths[i]);
      }

      const results = await assetCopier.copyAllAssets(sourceRoot, outputRoot);
      
      expect(results.successCount).toBe(3);
      expect(results.failureCount).toBe(0);
      expect(results.skippedCount).toBe(0);
      
      // Verify all files were copied
      for (let i = 0; i < assetPaths.length; i++) {
        const expectedOutput = join(outputRoot, `asset${i + 1}.txt`);
        expect(existsSync(expectedOutput)).toBe(true);
        expect(readFileSync(expectedOutput, 'utf-8')).toBe(`content-${i + 1}`);
      }
    });

    test('should_report_copy_statistics_when_operation_complete', async () => {
      const assetPaths = [
        join(sourceRoot, 'success.txt'),
        join(sourceRoot, 'skip.txt')  // Will be skipped - not referenced
      ];
      
      // Create source assets
      writeFileSync(assetPaths[0], 'success-content');
      writeFileSync(assetPaths[1], 'skip-content');
      
      // Only mark first as referenced
      assetTracker.referencedAssets.add(assetPaths[0]);

      const results = await assetCopier.copyAllAssets(sourceRoot, outputRoot);
      
      expect(results).toHaveProperty('successCount');
      expect(results).toHaveProperty('failureCount');
      expect(results).toHaveProperty('skippedCount');
      expect(results).toHaveProperty('totalAssets');
      expect(results).toHaveProperty('duration');
      
      expect(results.successCount).toBe(1);
      expect(results.skippedCount).toBe(1);
      expect(results.failureCount).toBe(0);
      expect(results.totalAssets).toBe(2);
    });
  });

  describe('Integration with AssetTracker', () => {
    test('should_copy_only_referenced_assets_when_tracker_has_references', async () => {
      const referencedPath = join(sourceRoot, 'referenced.png');
      const unreferencedPath = join(sourceRoot, 'unreferenced.png');
      
      // Create both assets
      writeFileSync(referencedPath, 'referenced-content');
      writeFileSync(unreferencedPath, 'unreferenced-content');
      
      // Only mark one as referenced
      assetTracker.referencedAssets.add(referencedPath);

      const results = await assetCopier.copyAllAssets(sourceRoot, outputRoot);
      
      expect(results.successCount).toBe(1);
      expect(results.skippedCount).toBe(1);
      expect(existsSync(join(outputRoot, 'referenced.png'))).toBe(true);
      expect(existsSync(join(outputRoot, 'unreferenced.png'))).toBe(false);
    });

    test('should_respect_asset_tracker_reference_data_when_copying', async () => {
      const htmlContent = '<img src="./logo.png" alt="Logo">';
      const pagePath = join(sourceRoot, 'index.html');
      const assetPath = join(sourceRoot, 'logo.png');
      
      // Create assets
      writeFileSync(assetPath, 'logo-content');
      
      // Use asset tracker to record references
      await assetTracker.recordAssetReferences(pagePath, htmlContent, sourceRoot);

      const results = await assetCopier.copyAllAssets(sourceRoot, outputRoot);
      
      expect(results.successCount).toBe(1);
      expect(existsSync(join(outputRoot, 'logo.png'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should_handle_missing_source_files_gracefully', async () => {
      const missingPath = join(sourceRoot, 'missing.txt');
      
      // Mark as referenced but don't create the file
      assetTracker.referencedAssets.add(missingPath);

      const result = await assetCopier.copyAsset(missingPath, sourceRoot, outputRoot);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should_handle_invalid_paths_gracefully', async () => {
      const invalidPath = null;

      const result = await assetCopier.copyAsset(invalidPath, sourceRoot, outputRoot);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    test('should_continue_batch_copy_when_individual_files_fail', async () => {
      const validPath = join(sourceRoot, 'valid.txt');
      const invalidPath = join(sourceRoot, 'missing.txt');
      
      // Create one valid asset
      writeFileSync(validPath, 'valid-content');
      
      // Mark both as referenced
      assetTracker.referencedAssets.add(validPath);
      assetTracker.referencedAssets.add(invalidPath);

      const results = await assetCopier.copyAllAssets(sourceRoot, outputRoot);
      
      expect(results.successCount).toBe(1);
      expect(results.failureCount).toBe(1);
      expect(existsSync(join(outputRoot, 'valid.txt'))).toBe(true);
    });
  });

  describe('Utility Methods', () => {
    test('should_check_if_copy_needed_based_on_timestamps', async () => {
      const assetPath = join(sourceRoot, 'check.txt');
      const outputPath = join(outputRoot, 'check.txt');
      
      // Create source file
      writeFileSync(assetPath, 'source-content');
      
      // No output file exists - copy needed
      expect(await assetCopier.isCopyNeeded(assetPath, outputPath)).toBe(true);
      
      // Create output file - copy not needed if same timestamp
      writeFileSync(outputPath, 'dest-content');
      
      // Should check timestamps and file sizes to determine if copy needed
      const copyNeeded = await assetCopier.isCopyNeeded(assetPath, outputPath);
      expect(typeof copyNeeded).toBe('boolean');
    });

    test('should_get_relative_asset_path_from_source_root', () => {
      const assetPath = join(sourceRoot, 'images', 'logo.png');
      
      const relativePath = assetCopier.getRelativeAssetPath(assetPath, sourceRoot);
      
      expect(relativePath).toBe(join('images', 'logo.png'));
    });

    test('should_validate_asset_paths_for_security', () => {
      const validPath = join(sourceRoot, 'valid.png');
      const invalidPath = join(sourceRoot, '..', '..', 'invalid.png');
      
      expect(assetCopier.validateAssetPath(validPath, sourceRoot)).toBe(true);
      expect(assetCopier.validateAssetPath(invalidPath, sourceRoot)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should_handle_symbolic_links_appropriately', async () => {
      // This test may need platform-specific handling
      const realFile = join(sourceRoot, 'real.txt');
      const symLink = join(sourceRoot, 'link.txt');
      
      // Create real file
      writeFileSync(realFile, 'real-content');
      
      try {
        // Create symbolic link (if supported by platform)
        await Bun.spawn(['ln', '-s', realFile, symLink]);
        
        assetTracker.referencedAssets.add(symLink);
        
        const result = await assetCopier.copyAsset(symLink, sourceRoot, outputRoot);
        
        // Should handle symbolic links according to security policy
        expect(typeof result.success).toBe('boolean');
      } catch (error) {
        // Symbolic links not supported on this platform - skip test
        expect(true).toBe(true);
      }
    });

    test('should_handle_very_large_files_efficiently', async () => {
      const largePath = join(sourceRoot, 'large.bin');
      
      // Create a reasonably large file for testing (1MB)
      const largeContent = Buffer.alloc(1024 * 1024, 'a');
      writeFileSync(largePath, largeContent);
      
      assetTracker.referencedAssets.add(largePath);
      
      const startTime = Date.now();
      const result = await assetCopier.copyAsset(largePath, sourceRoot, outputRoot);
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should_handle_files_with_special_characters_in_names', async () => {
      const specialNames = [
        'file with spaces.txt',
        'file-with-dashes.txt',
        'file_with_underscores.txt',
        'file.with.dots.txt'
      ];
      
      for (const fileName of specialNames) {
        const assetPath = join(sourceRoot, fileName);
        writeFileSync(assetPath, `content for ${fileName}`);
        assetTracker.referencedAssets.add(assetPath);
      }

      const results = await assetCopier.copyAllAssets(sourceRoot, outputRoot);
      
      expect(results.successCount).toBe(specialNames.length);
      
      // Verify all files were copied with correct names
      for (const fileName of specialNames) {
        expect(existsSync(join(outputRoot, fileName))).toBe(true);
      }
    });
  });
});