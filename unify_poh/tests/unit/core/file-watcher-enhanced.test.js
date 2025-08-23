/**
 * FileWatcher Behavior Tests
 * Following TDD methodology - Testing actual behavior, not implementation details
 * 
 * These tests validate the specification requirements from app-spec.md:
 * - File watching and incremental rebuilds
 * - Dependency tracking and cascade rebuilds
 * - Asset copying on changes
 * - File deletion handling
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { FileWatcher } from '../../../src/core/file-watcher.js';

describe('FileWatcher Behavior Tests', () => {
  let testDir;
  let sourceRoot; 
  let outputRoot;
  let fileWatcher;

  beforeEach(async () => {
    // Create real test directories
    testDir = mkdtempSync(join(tmpdir(), 'file-watcher-behavior-'));
    sourceRoot = join(testDir, 'src');
    outputRoot = join(testDir, 'dist');
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(outputRoot, { recursive: true });

    fileWatcher = new FileWatcher();
  });

  afterEach(async () => {
    if (fileWatcher) {
      await fileWatcher.stopWatching();
    }
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Basic File Watching Behavior', () => {
    test('should_detect_when_html_file_changes', async () => {
      // Arrange: Create test files
      const testFile = join(sourceRoot, 'page.html');
      writeFileSync(testFile, '<html><body>Original</body></html>');

      let detectedChanges = [];
      const watchOptions = {
        onChange: (event) => detectedChanges.push(event)
      };

      // Act: Start watching and change file
      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Wait a bit to ensure watcher is ready
      await new Promise(resolve => setTimeout(resolve, 50));
      
      writeFileSync(testFile, '<html><body>Updated</body></html>');
      
      // Wait for change detection
      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert: Should detect the change
      expect(detectedChanges.length).toBeGreaterThan(0);
      expect(detectedChanges.some(event => event.filePath === testFile)).toBe(true);
    });

    test('should_detect_when_new_file_added', async () => {
      let addedFiles = [];
      const watchOptions = {
        onChange: (event) => {
          if (event.isAddition) {
            addedFiles.push(event);
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Add new file
      const newFile = join(sourceRoot, 'new-page.html');
      writeFileSync(newFile, '<html><body>New Page</body></html>');
      
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(addedFiles.length).toBeGreaterThan(0);
      expect(addedFiles[0].filePath).toBe(newFile);
    });

    test('should_detect_when_file_deleted', async () => {
      // Create file first
      const testFile = join(sourceRoot, 'delete-me.html');
      writeFileSync(testFile, '<html><body>Delete Me</body></html>');
      
      let deletedFiles = [];
      const watchOptions = {
        onChange: (event) => {
          if (event.isDeletion) {
            deletedFiles.push(event);
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Delete the file
      rmSync(testFile);
      
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(deletedFiles.length).toBeGreaterThan(0);
      expect(deletedFiles[0].filePath).toBe(testFile);
    });
  });

  describe('Dependency Impact Analysis', () => {
    test('should_identify_fragment_dependencies_when_fragment_changes', async () => {
      // Create fragment and pages that use it
      const fragmentFile = join(sourceRoot, '_header.html');
      const page1File = join(sourceRoot, 'page1.html');
      const page2File = join(sourceRoot, 'page2.html');
      
      writeFileSync(fragmentFile, '<header>Site Header</header>');
      writeFileSync(page1File, '<html data-unify="_header.html"><body>Page 1</body></html>');
      writeFileSync(page2File, '<html data-unify="_header.html"><body>Page 2</body></html>');

      // Test impact analysis
      const impact = fileWatcher.getChangeImpact(fragmentFile);
      
      expect(impact.changedFile).toBe(fragmentFile);
      expect(impact.isFragment).toBe(true);
      expect(impact.dependentPages.length).toBeGreaterThan(0);
      expect(impact.impactLevel).toBe('medium'); // Fragment affects multiple pages
    });

    test('should_identify_asset_dependencies_when_css_changes', async () => {
      // Create CSS and pages that reference it
      const cssFile = join(sourceRoot, 'style.css');
      const pageFile = join(sourceRoot, 'page.html');
      
      writeFileSync(cssFile, 'body { color: red; }');
      writeFileSync(pageFile, '<html><head><link rel="stylesheet" href="style.css"></head></html>');

      const impact = fileWatcher.getChangeImpact(cssFile);
      
      expect(impact.changedFile).toBe(cssFile);
      expect(impact.isAsset).toBe(true);
      expect(impact.dependentPages.length).toBeGreaterThan(0);
      expect(impact.dependentPages).toContain(pageFile);
    });

    test('should_identify_single_page_impact_when_page_changes', async () => {
      const pageFile = join(sourceRoot, 'single-page.html');
      writeFileSync(pageFile, '<html><body>Single Page</body></html>');

      const impact = fileWatcher.getChangeImpact(pageFile);
      
      expect(impact.changedFile).toBe(pageFile);
      expect(impact.isPage).toBe(true);
      expect(impact.impactLevel).toBe('low'); // Single page change
      expect(impact.rebuildNeeded).toBe(true);
    });
  });

  describe('Real File Operations', () => {
    test('should_watch_recursively_in_nested_directories', async () => {
      // Create nested structure
      const subDir = join(sourceRoot, 'components');
      const deepDir = join(subDir, 'forms');
      mkdirSync(deepDir, { recursive: true });

      let nestedChanges = [];
      const watchOptions = {
        recursive: true,
        onChange: (event) => nestedChanges.push(event)
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Create file in nested directory
      const nestedFile = join(deepDir, 'form.html');
      writeFileSync(nestedFile, '<form>Test Form</form>');
      
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(nestedChanges.length).toBeGreaterThan(0);
      expect(nestedChanges.some(event => event.filePath === nestedFile)).toBe(true);
    });

    test('should_handle_rapid_file_changes_appropriately', async () => {
      const testFile = join(sourceRoot, 'rapid-test.html');
      writeFileSync(testFile, '<html><body>v1</body></html>');

      let changeCount = 0;
      const watchOptions = {
        debounceMs: 100, // Use debouncing
        onChange: () => changeCount++
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Make rapid changes
      writeFileSync(testFile, '<html><body>v2</body></html>');
      writeFileSync(testFile, '<html><body>v3</body></html>');  
      writeFileSync(testFile, '<html><body>v4</body></html>');
      
      // Wait for debouncing to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should handle rapid changes without excessive processing
      expect(changeCount).toBeGreaterThanOrEqual(1);
      expect(changeCount).toBeLessThanOrEqual(2); // Reasonable debouncing
    });
  });

  describe('Resource Management', () => {
    test('should_clean_up_resources_when_stopped', async () => {
      const watchOptions = {
        onChange: () => {}
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      expect(fileWatcher.isWatching).toBe(true);
      expect(fileWatcher.watchedDirectories).toContain(sourceRoot);
      
      await fileWatcher.stopWatching();
      
      expect(fileWatcher.isWatching).toBe(false);
      expect(fileWatcher.watchedDirectories).toHaveLength(0);
    });

    test('should_provide_watch_statistics', async () => {
      const watchOptions = {
        onChange: () => {}
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      const stats = fileWatcher.getWatchStats();
      expect(stats.isWatching).toBe(true);
      expect(stats.watchedDirectories).toBeGreaterThan(0);
      expect(stats.dependencies).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should_handle_nonexistent_directory_gracefully', async () => {
      const nonExistentDir = join(testDir, 'does-not-exist');
      
      let errorCaught = null;
      const watchOptions = {
        onChange: () => {},
        onError: (error) => errorCaught = error
      };

      try {
        await fileWatcher.startWatching(nonExistentDir, watchOptions);
      } catch (error) {
        errorCaught = error;
      }
      
      expect(errorCaught).toBeDefined();
      expect(errorCaught.code).toBe('ENOENT');
      expect(errorCaught.helpfulMessage).toContain('directory does not exist');
    });
  });
});