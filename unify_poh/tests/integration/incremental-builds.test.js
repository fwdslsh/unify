/**
 * Integration Tests for Incremental Builds - US-010
 * Following TDD methodology - RED phase
 * 
 * Tests for incremental build logic, dependency tracking integration,
 * and watch command functionality
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from 'fs';
import { tmpdir } from 'os';

describe('Incremental Builds Integration - US-010', () => {
  let testDir;
  let sourceRoot;
  let outputRoot;

  beforeEach(() => {
    // Create temporary test directories
    testDir = mkdtempSync(join(tmpdir(), 'incremental-builds-test-'));
    sourceRoot = join(testDir, 'src');
    outputRoot = join(testDir, 'dist');
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(outputRoot, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Dependency-Based Incremental Builds', () => {
    test('should_rebuild_only_affected_pages_when_fragment_changes', async () => {
      // Create layout fragment and multiple pages using it
      const layoutFile = join(sourceRoot, '_layout.html');
      const page1File = join(sourceRoot, 'page1.html');
      const page2File = join(sourceRoot, 'page2.html');
      const page3File = join(sourceRoot, 'page3.html'); // Not using layout
      
      writeFileSync(layoutFile, '<html><body><div class="unify-content">Default content</div></body></html>');
      writeFileSync(page1File, '<html data-unify="_layout.html"><body><div class="unify-content">Page 1 content</div></body></html>');
      writeFileSync(page2File, '<html data-unify="_layout.html"><body><div class="unify-content">Page 2 content</div></body></html>');
      writeFileSync(page3File, '<html><body>Independent page</body></html>');

      const { IncrementalBuilder } = await import('../../src/core/incremental-builder.js');
      const incrementalBuilder = new IncrementalBuilder();
      
      // Perform initial build
      const initialResult = await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      expect(initialResult.success).toBe(true);
      expect(initialResult.processedFiles).toBe(3); // 3 pages processed (_layout.html is a fragment, not processed)
      
      // Verify initial output files exist
      expect(existsSync(join(outputRoot, 'page1.html'))).toBe(true);
      expect(existsSync(join(outputRoot, 'page2.html'))).toBe(true);
      expect(existsSync(join(outputRoot, 'page3.html'))).toBe(true);
      
      // Record initial build timestamps
      const { statSync } = await import('fs');
      const initialTimestamps = {
        page1: statSync(join(outputRoot, 'page1.html')).mtime.getTime(),
        page2: statSync(join(outputRoot, 'page2.html')).mtime.getTime(),
        page3: statSync(join(outputRoot, 'page3.html')).mtime.getTime()
      };
      
      // Wait to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Modify the layout fragment
      writeFileSync(layoutFile, '<html><body><div class="unify-content">Updated default content</div></body></html>');
      
      // Perform incremental build
      const incrementalResult = await incrementalBuilder.performIncrementalBuild(layoutFile, sourceRoot, outputRoot);
      
      expect(incrementalResult.success).toBe(true);
      expect(incrementalResult.rebuiltFiles).toBe(2); // Only page1 and page2 should be rebuilt
      expect(incrementalResult.affectedPages).toContain(join(outputRoot, 'page1.html'));
      expect(incrementalResult.affectedPages).toContain(join(outputRoot, 'page2.html'));
      expect(incrementalResult.affectedPages).not.toContain(join(outputRoot, 'page3.html'));
      
      // Verify timestamps - page1 and page2 should be newer, page3 should be unchanged
      const finalTimestamps = {
        page1: statSync(join(outputRoot, 'page1.html')).mtime.getTime(),
        page2: statSync(join(outputRoot, 'page2.html')).mtime.getTime(),
        page3: statSync(join(outputRoot, 'page3.html')).mtime.getTime()
      };
      
      expect(finalTimestamps.page1).toBeGreaterThan(initialTimestamps.page1);
      expect(finalTimestamps.page2).toBeGreaterThan(initialTimestamps.page2);
      expect(finalTimestamps.page3).toBe(initialTimestamps.page3); // Should be unchanged
    });

    test('should_rebuild_only_single_page_when_page_content_changes', async () => {
      // Create multiple independent pages
      const page1File = join(sourceRoot, 'page1.html');
      const page2File = join(sourceRoot, 'page2.html');
      const page3File = join(sourceRoot, 'page3.html');
      
      writeFileSync(page1File, '<html><body>Page 1 content</body></html>');
      writeFileSync(page2File, '<html><body>Page 2 content</body></html>');
      writeFileSync(page3File, '<html><body>Page 3 content</body></html>');

      const { IncrementalBuilder } = await import('../../src/core/incremental-builder.js');
      const incrementalBuilder = new IncrementalBuilder();
      
      // Perform initial build
      await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      
      // Record initial timestamps
      const { statSync } = await import('fs');
      const initialTimestamps = {
        page1: statSync(join(outputRoot, 'page1.html')).mtime.getTime(),
        page2: statSync(join(outputRoot, 'page2.html')).mtime.getTime(),
        page3: statSync(join(outputRoot, 'page3.html')).mtime.getTime()
      };
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Modify only page2
      writeFileSync(page2File, '<html><body>Updated Page 2 content</body></html>');
      
      const incrementalResult = await incrementalBuilder.performIncrementalBuild(page2File, sourceRoot, outputRoot);
      
      expect(incrementalResult.success).toBe(true);
      expect(incrementalResult.rebuiltFiles).toBe(1);
      expect(incrementalResult.affectedPages).toContain(join(outputRoot, 'page2.html'));
      expect(incrementalResult.affectedPages).not.toContain(join(outputRoot, 'page1.html'));
      expect(incrementalResult.affectedPages).not.toContain(join(outputRoot, 'page3.html'));
      
      // Verify only page2 timestamp changed
      const finalTimestamps = {
        page1: statSync(join(outputRoot, 'page1.html')).mtime.getTime(),
        page2: statSync(join(outputRoot, 'page2.html')).mtime.getTime(),
        page3: statSync(join(outputRoot, 'page3.html')).mtime.getTime()
      };
      
      expect(finalTimestamps.page1).toBe(initialTimestamps.page1);
      expect(finalTimestamps.page2).toBeGreaterThan(initialTimestamps.page2);
      expect(finalTimestamps.page3).toBe(initialTimestamps.page3);
    });

    test('should_copy_assets_when_asset_files_change', async () => {
      // Create page with asset references
      const pageFile = join(sourceRoot, 'page.html');
      const cssFile = join(sourceRoot, 'styles.css');
      const imageFile = join(sourceRoot, 'logo.png');
      
      writeFileSync(pageFile, `
        <html>
          <head><link rel="stylesheet" href="styles.css"></head>
          <body><img src="logo.png" alt="Logo"></body>
        </html>
      `);
      writeFileSync(cssFile, 'body { color: red; }');
      writeFileSync(imageFile, 'fake-image-data');

      const { IncrementalBuilder } = await import('../../src/core/incremental-builder.js');
      const incrementalBuilder = new IncrementalBuilder();
      
      // Initial build
      await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      
      expect(existsSync(join(outputRoot, 'styles.css'))).toBe(true);
      expect(existsSync(join(outputRoot, 'logo.png'))).toBe(true);
      
      const initialCssTimestamp = statSync(join(outputRoot, 'styles.css')).mtime.getTime();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Modify CSS asset
      writeFileSync(cssFile, 'body { color: blue; }');
      
      const incrementalResult = await incrementalBuilder.performIncrementalBuild(cssFile, sourceRoot, outputRoot);
      
      expect(incrementalResult.success).toBe(true);
      expect(incrementalResult.copiedAssets).toBe(1);
      expect(incrementalResult.assetsCopied).toContain(join(outputRoot, 'styles.css'));
      
      // Verify asset was updated
      const finalCssTimestamp = statSync(join(outputRoot, 'styles.css')).mtime.getTime();
      expect(finalCssTimestamp).toBeGreaterThan(initialCssTimestamp);
      
      // Verify content was updated
      const updatedCss = readFileSync(join(outputRoot, 'styles.css'), 'utf-8');
      expect(updatedCss).toContain('color: blue');
    });

    test('should_handle_new_file_additions_during_watch', async () => {
      // Create initial files
      const page1File = join(sourceRoot, 'page1.html');
      writeFileSync(page1File, '<html><body>Page 1</body></html>');

      const { IncrementalBuilder } = await import('../../src/core/incremental-builder.js');
      const incrementalBuilder = new IncrementalBuilder();
      
      await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      
      expect(existsSync(join(outputRoot, 'page1.html'))).toBe(true);
      expect(existsSync(join(outputRoot, 'page2.html'))).toBe(false);
      
      // Add new file
      const page2File = join(sourceRoot, 'page2.html');
      writeFileSync(page2File, '<html><body>New Page 2</body></html>');
      
      const incrementalResult = await incrementalBuilder.handleNewFile(page2File, sourceRoot, outputRoot);
      
      expect(incrementalResult.success).toBe(true);
      expect(incrementalResult.newFiles).toBe(1);
      expect(existsSync(join(outputRoot, 'page2.html'))).toBe(true);
      
      const page2Content = readFileSync(join(outputRoot, 'page2.html'), 'utf-8');
      expect(page2Content).toContain('New Page 2');
    });

    test('should_clean_up_output_when_source_files_deleted', async () => {
      // Create files
      const page1File = join(sourceRoot, 'page1.html');
      const page2File = join(sourceRoot, 'page2.html');
      const assetFile = join(sourceRoot, 'asset.css');
      
      writeFileSync(page1File, '<html><head><link rel="stylesheet" href="asset.css"></head><body>Page 1</body></html>');
      writeFileSync(page2File, '<html><body>Page 2</body></html>');
      writeFileSync(assetFile, 'body { margin: 0; }');

      const { IncrementalBuilder } = await import('../../src/core/incremental-builder.js');
      const incrementalBuilder = new IncrementalBuilder();
      
      await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      
      expect(existsSync(join(outputRoot, 'page1.html'))).toBe(true);
      expect(existsSync(join(outputRoot, 'page2.html'))).toBe(true);
      expect(existsSync(join(outputRoot, 'asset.css'))).toBe(true);
      
      // Delete source files
      rmSync(page2File);
      rmSync(assetFile);
      
      const cleanupResult = await incrementalBuilder.handleDeletedFiles([page2File, assetFile], sourceRoot, outputRoot);
      
      expect(cleanupResult.success).toBe(true);
      expect(cleanupResult.cleanedFiles).toBe(2);
      
      // Verify output files are removed
      expect(existsSync(join(outputRoot, 'page1.html'))).toBe(true); // Should remain
      expect(existsSync(join(outputRoot, 'page2.html'))).toBe(false); // Should be removed
      expect(existsSync(join(outputRoot, 'asset.css'))).toBe(false); // Should be removed
    });
  });

  describe('Build Cache Integration', () => {
    test('should_use_build_cache_to_skip_unchanged_files', async () => {
      const page1File = join(sourceRoot, 'page1.html');
      const page2File = join(sourceRoot, 'page2.html');
      
      writeFileSync(page1File, '<html><body>Page 1</body></html>');
      writeFileSync(page2File, '<html><body>Page 2</body></html>');

      const { IncrementalBuilder } = await import('../../src/core/incremental-builder.js');
      const incrementalBuilder = new IncrementalBuilder();
      
      // First build should process all files
      const firstResult = await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      expect(firstResult.processedFiles).toBe(2);
      expect(firstResult.cacheHits).toBe(0);
      
      // Second build without changes should use cache
      const secondResult = await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      expect(secondResult.processedFiles).toBe(0); // No files processed
      expect(secondResult.cacheHits).toBe(2); // Both files found in cache
      expect(secondResult.skippedFiles).toBe(2);
    });

    test('should_invalidate_cache_when_file_content_changes', async () => {
      const pageFile = join(sourceRoot, 'page.html');
      writeFileSync(pageFile, '<html><body>Original content</body></html>');

      const { IncrementalBuilder } = await import('../../src/core/incremental-builder.js');
      const incrementalBuilder = new IncrementalBuilder();
      
      // First build
      const firstResult = await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      expect(firstResult.processedFiles).toBe(1);
      
      // Modify file content
      writeFileSync(pageFile, '<html><body>Modified content</body></html>');
      
      // Second build should process the changed file
      const secondResult = await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      expect(secondResult.processedFiles).toBe(1);
      expect(secondResult.cacheHits).toBe(0);
      expect(secondResult.cacheInvalidations).toBe(1);
      
      // Verify content was updated
      const outputContent = readFileSync(join(outputRoot, 'page.html'), 'utf-8');
      expect(outputContent).toContain('Modified content');
    });

    test('should_handle_dependency_changes_with_cache_invalidation', async () => {
      const layoutFile = join(sourceRoot, '_layout.html');
      const pageFile = join(sourceRoot, 'page.html');
      
      // Layout has header that should be preserved, and unify-content that gets replaced
      writeFileSync(layoutFile, '<html><body><header class="site-header">Original Header</header><div class="unify-content">Layout content</div></body></html>');
      writeFileSync(pageFile, '<html data-unify="_layout.html"><body><div class="unify-content">Page content</div></body></html>');

      const { IncrementalBuilder } = await import('../../src/core/incremental-builder.js');
      const incrementalBuilder = new IncrementalBuilder();
      
      // Initial build
      const initialResult = await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      expect(initialResult.processedFiles).toBe(1); // Only page.html is processed, _layout.html is a fragment
      
      // Verify initial composition worked
      const initialContent = readFileSync(join(outputRoot, 'page.html'), 'utf-8');
      expect(initialContent).toContain('Original Header'); // Layout preserved
      expect(initialContent).toContain('Page content'); // Page content wins
      
      // Modify layout header (dependency)
      writeFileSync(layoutFile, '<html><body><header class="site-header">Updated Header</header><div class="unify-content">Layout content</div></body></html>');
      
      // Build should invalidate cache for both layout and dependent page
      const result = await incrementalBuilder.performIncrementalBuild(layoutFile, sourceRoot, outputRoot);
      expect(result.rebuiltFiles).toBe(1); // Only page rebuilt (layout is not emitted)
      expect(result.cacheInvalidations).toBeGreaterThan(0);
      
      // Verify dependency-based rebuild occurred - layout header should be updated
      const outputContent = readFileSync(join(outputRoot, 'page.html'), 'utf-8');
      expect(outputContent).toContain('Updated Header'); // Layout header updated
      expect(outputContent).toContain('Page content'); // Page content still wins
    });
  });

  describe('Watch Command Integration', () => {
    test('should_start_watching_and_perform_initial_build_when_watch_command_executed', async () => {
      const pageFile = join(sourceRoot, 'page.html');
      writeFileSync(pageFile, '<html><body>Page content</body></html>');

      const { WatchCommand } = await import('../../src/cli/commands/watch-command.js');
      const watchCommand = new WatchCommand();
      
      let watchResults = [];
      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        onBuild: (result) => watchResults.push(result),
        timeout: 1000 // Auto-stop after 1 second for testing
      };
      
      const result = await watchCommand.execute(watchOptions);
      
      expect(result.success).toBe(true);
      expect(result.initialBuildCompleted).toBe(true);
      expect(result.watchingStarted).toBe(true);
      expect(existsSync(join(outputRoot, 'page.html'))).toBe(true);
      
      // Initial build should be recorded
      expect(watchResults.length).toBeGreaterThanOrEqual(1);
      expect(watchResults[0].type).toBe('initial');
      expect(watchResults[0].processedFiles).toBe(1);
    });

    test('should_trigger_incremental_builds_when_files_change_during_watch', async () => {
      const pageFile = join(sourceRoot, 'page.html');
      writeFileSync(pageFile, '<html><body>Original content</body></html>');

      const { WatchCommand } = await import('../../src/cli/commands/watch-command.js');
      const watchCommand = new WatchCommand();
      
      let buildEvents = [];
      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        onBuild: (result) => buildEvents.push(result)
      };
      
      // Start watching
      const watchPromise = watchCommand.execute(watchOptions);
      
      // Wait for initial build to complete
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Modify file to trigger incremental build
      writeFileSync(pageFile, '<html><body>Updated content</body></html>');
      
      // Wait for incremental build
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Stop watching
      await watchCommand.stop();
      
      expect(buildEvents.length).toBeGreaterThanOrEqual(2);
      expect(buildEvents[0].type).toBe('initial');
      expect(buildEvents[1].type).toBe('incremental');
      expect(buildEvents[1].changedFiles).toContain(pageFile);
      
      // Verify file was updated
      const outputContent = readFileSync(join(outputRoot, 'page.html'), 'utf-8');
      expect(outputContent).toContain('Updated content');
    });

    test('should_handle_rapid_file_changes_with_debouncing_during_watch', async () => {
      const page1File = join(sourceRoot, 'page1.html');
      const page2File = join(sourceRoot, 'page2.html');
      const page3File = join(sourceRoot, 'page3.html');
      
      writeFileSync(page1File, '<html><body>Page 1</body></html>');
      writeFileSync(page2File, '<html><body>Page 2</body></html>');
      writeFileSync(page3File, '<html><body>Page 3</body></html>');

      const { WatchCommand } = await import('../../src/cli/commands/watch-command.js');
      const watchCommand = new WatchCommand();
      
      let buildEvents = [];
      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        debounceMs: 100,
        onBuild: (result) => buildEvents.push(result)
      };
      
      // Start watching
      const watchPromise = watchCommand.execute(watchOptions);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Make rapid changes to different files with slight delays
      writeFileSync(page1File, '<html><body>Page 1 v2</body></html>');
      await new Promise(resolve => setTimeout(resolve, 10));
      writeFileSync(page2File, '<html><body>Page 2 v2</body></html>');
      await new Promise(resolve => setTimeout(resolve, 10));
      writeFileSync(page3File, '<html><body>Page 3 v2</body></html>');
      
      // Wait for debounced build
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await watchCommand.stop();
      
      // Should have initial build + one debounced incremental build
      expect(buildEvents.length).toBe(2);
      expect(buildEvents[1].type).toBe('incremental');
      expect(buildEvents[1].changedFiles.length).toBeGreaterThanOrEqual(2);
    });

    test('should_handle_watch_command_termination_gracefully', async () => {
      const pageFile = join(sourceRoot, 'page.html');
      writeFileSync(pageFile, '<html><body>Page content</body></html>');

      const { WatchCommand } = await import('../../src/cli/commands/watch-command.js');
      const watchCommand = new WatchCommand();
      
      const watchOptions = {
        source: sourceRoot,
        output: outputRoot
      };
      
      // Start watching
      const watchPromise = watchCommand.execute(watchOptions);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Stop watching
      const stopResult = await watchCommand.stop();
      
      expect(stopResult.success).toBe(true);
      expect(stopResult.watchingStopped).toBe(true);
      expect(stopResult.resourcesCleaned).toBe(true);
      
      // Verify watcher is no longer active
      expect(watchCommand.isWatching).toBe(false);
    });
  });

  describe('Performance and Scalability', () => {
    test('should_handle_incremental_builds_efficiently_with_large_projects', async () => {
      // Create large project structure
      const pageCount = 100;
      const pages = [];
      
      // Create layout
      const layoutFile = join(sourceRoot, '_layout.html');
      writeFileSync(layoutFile, '<html><body><div class="unify-content">Layout</div></body></html>');
      
      // Create many pages
      for (let i = 0; i < pageCount; i++) {
        const pageFile = join(sourceRoot, `page-${i.toString().padStart(3, '0')}.html`);
        writeFileSync(pageFile, `<html data-unify="_layout.html"><body><div class="unify-content">Page ${i}</div></body></html>`);
        pages.push(pageFile);
      }

      const { IncrementalBuilder } = await import('../../src/core/incremental-builder.js');
      const incrementalBuilder = new IncrementalBuilder();
      
      // Initial build
      const initialStart = Date.now();
      const initialResult = await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      const initialTime = Date.now() - initialStart;
      
      expect(initialResult.success).toBe(true);
      expect(initialResult.processedFiles).toBe(pageCount); // only pages processed, not layout (fragment)
      
      // Modify layout to trigger rebuilds of all pages
      writeFileSync(layoutFile, '<html><body><div class="unify-content">Updated Layout</div></body></html>');
      
      const incrementalStart = Date.now();
      const incrementalResult = await incrementalBuilder.performIncrementalBuild(layoutFile, sourceRoot, outputRoot);
      const incrementalTime = Date.now() - incrementalStart;
      
      expect(incrementalResult.success).toBe(true);
      expect(incrementalResult.rebuiltFiles).toBe(pageCount); // All pages should rebuild
      
      // Incremental build should be faster than initial build
      expect(incrementalTime).toBeLessThan(initialTime);
      
      // Should complete within reasonable time (< 5 seconds for 100 pages)
      expect(incrementalTime).toBeLessThan(5000);
    });

    test('should_maintain_memory_efficiency_during_incremental_builds', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create multiple files and perform incremental builds
      const fileCount = 50;
      const { IncrementalBuilder } = await import('../../src/core/incremental-builder.js');
      const incrementalBuilder = new IncrementalBuilder();
      
      for (let i = 0; i < fileCount; i++) {
        const pageFile = join(sourceRoot, `page-${i}.html`);
        writeFileSync(pageFile, `<html><body>Page ${i} content</body></html>`);
        
        await incrementalBuilder.performIncrementalBuild(pageFile, sourceRoot, outputRoot);
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (< 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should_continue_watching_when_build_errors_occur', async () => {
      const validPageFile = join(sourceRoot, 'valid.html');
      const invalidPageFile = join(sourceRoot, 'invalid.html');
      
      writeFileSync(validPageFile, '<html><body>Valid page</body></html>');
      writeFileSync(invalidPageFile, '<html data-unify="non-existent-layout.html"><body>Invalid</body></html>');

      const { WatchCommand } = await import('../../src/cli/commands/watch-command.js');
      const watchCommand = new WatchCommand();
      
      let buildEvents = [];
      let errorEvents = [];
      
      const watchOptions = {
        source: sourceRoot,
        output: outputRoot,
        onBuild: (result) => buildEvents.push(result),
        onError: (error) => errorEvents.push(error)
      };
      
      const watchPromise = watchCommand.execute(watchOptions);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Modify invalid file to trigger build error
      writeFileSync(invalidPageFile, '<html data-unify="still-non-existent.html"><body>Still invalid</body></html>');
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Modify valid file to ensure watching continues
      writeFileSync(validPageFile, '<html><body>Updated valid page</body></html>');
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await watchCommand.stop();
      
      // Should have recorded error but continued watching
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(buildEvents.length).toBeGreaterThanOrEqual(2); // Initial + valid file update
      
      // Valid file should still be updated despite errors
      const validContent = readFileSync(join(outputRoot, 'valid.html'), 'utf-8');
      expect(validContent).toContain('Updated valid page');
    });

    test('should_recover_from_temporary_file_system_issues', async () => {
      const pageFile = join(sourceRoot, 'recovery-test.html');
      writeFileSync(pageFile, '<html><body>Original</body></html>');

      const { IncrementalBuilder } = await import('../../src/core/incremental-builder.js');
      const incrementalBuilder = new IncrementalBuilder();
      
      // Initial build
      await incrementalBuilder.performInitialBuild(sourceRoot, outputRoot);
      
      // Simulate temporary file system issue by creating invalid permission
      // (In real testing environment, this would involve more complex setup)
      
      // Try incremental build that might fail - should return error result instead of throwing
      const failResult = await incrementalBuilder.performIncrementalBuild('/invalid/path/file.html', sourceRoot, outputRoot);
      
      // Should handle error gracefully by returning failure result
      expect(failResult.success).toBe(false);
      expect(failResult.error).toContain('permission denied');
      
      // Normal incremental build should still work after recovery
      writeFileSync(pageFile, '<html><body>Recovered</body></html>');
      
      const recoveryResult = await incrementalBuilder.performIncrementalBuild(pageFile, sourceRoot, outputRoot);
      expect(recoveryResult.success).toBe(true);
      
      const recoveredContent = readFileSync(join(outputRoot, 'recovery-test.html'), 'utf-8');
      expect(recoveredContent).toContain('Recovered');
    });
  });
});