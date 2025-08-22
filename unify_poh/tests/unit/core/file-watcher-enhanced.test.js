/**
 * Enhanced FileWatcher Tests - US-010 Implementation
 * Following TDD methodology - RED phase
 * 
 * Tests for file watching with Bun's fs.watch integration,
 * incremental builds, debouncing, and performance optimization
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';

describe('FileWatcher Enhanced - US-010', () => {
  let testDir;
  let sourceRoot;
  let outputRoot;
  let fileWatcher;

  beforeEach(async () => {
    // Create temporary test directories
    testDir = mkdtempSync(join(tmpdir(), 'file-watcher-enhanced-test-'));
    sourceRoot = join(testDir, 'src');
    outputRoot = join(testDir, 'dist');
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(outputRoot, { recursive: true });

    // Import FileWatcher
    const { FileWatcher } = await import('../../../src/core/file-watcher.js');
    fileWatcher = new FileWatcher();
  });

  afterEach(async () => {
    // Cleanup watcher and test directory
    if (fileWatcher) {
      await fileWatcher.stopWatching();
    }
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Bun fs.watch Integration', () => {
    test('should_use_bun_fs_watch_api_when_watching_files', async () => {
      // Test that the FileWatcher uses Bun's native fs.watch API
      const watchOptions = {
        recursive: true,
        onChange: (event) => {},
        onError: (error) => {}
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Verify that Bun's fs.watch is being used internally
      expect(fileWatcher.isWatching).toBe(true);
      expect(fileWatcher.watchedDirectories).toContain(sourceRoot);
      expect(fileWatcher.usesBunFsWatch).toBe(true);
    });

    test('should_watch_recursively_when_watching_directory', async () => {
      // Create nested directory structure
      const subDir = join(sourceRoot, 'components');
      const deepDir = join(subDir, 'forms');
      mkdirSync(deepDir, { recursive: true });

      let changeEvents = [];
      const watchOptions = {
        recursive: true,
        onChange: (event) => changeEvents.push(event)
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Create file in nested directory
      writeFileSync(join(deepDir, 'input.html'), '<input>');
      
      // Wait for file system events to propagate
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should detect changes in nested directories
      expect(changeEvents.length).toBeGreaterThan(0);
      expect(changeEvents.some(e => e.filePath.includes('forms/input.html'))).toBe(true);
    });

    test('should_detect_file_changes_when_fs_watch_triggers', async () => {
      const testFile = join(sourceRoot, 'test.html');
      writeFileSync(testFile, '<html><body>original</body></html>');

      let detectedChanges = [];
      const watchOptions = {
        onChange: (event) => detectedChanges.push(event)
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Modify the file
      writeFileSync(testFile, '<html><body>modified</body></html>');
      
      // Wait for change detection
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(detectedChanges.length).toBeGreaterThan(0);
      expect(detectedChanges[0].eventType).toBe('change');
      expect(detectedChanges[0].filePath).toBe(testFile);
    });

    test('should_detect_file_additions_when_fs_watch_triggers', async () => {
      let additionEvents = [];
      const watchOptions = {
        onChange: (event) => {
          if (event.eventType === 'rename' && event.isAddition) {
            additionEvents.push(event);
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Add new file
      const newFile = join(sourceRoot, 'new-page.html');
      writeFileSync(newFile, '<html><body>new page</body></html>');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(additionEvents.length).toBeGreaterThan(0);
      expect(additionEvents[0].filePath).toBe(newFile);
    });

    test('should_detect_file_deletions_when_fs_watch_triggers', async () => {
      const testFile = join(sourceRoot, 'delete-me.html');
      writeFileSync(testFile, '<html><body>delete me</body></html>');

      let deletionEvents = [];
      const watchOptions = {
        onChange: (event) => {
          if (event.eventType === 'rename' && event.isDeletion) {
            deletionEvents.push(event);
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Delete the file
      rmSync(testFile);
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(deletionEvents.length).toBeGreaterThan(0);
      expect(deletionEvents[0].filePath).toBe(testFile);
    });

    test('should_handle_watch_errors_gracefully_when_fs_watch_fails', async () => {
      let errorCaught = null;
      const watchOptions = {
        onChange: () => {},
        onError: (error) => errorCaught = error
      };

      // Try to watch a non-existent directory
      const nonExistentDir = join(testDir, 'does-not-exist');
      
      try {
        await fileWatcher.startWatching(nonExistentDir, watchOptions);
      } catch (error) {
        // Should handle error gracefully
        expect(error).toBeDefined();
        expect(fileWatcher.isWatching).toBe(false);
      }
      
      // Should not crash the process
      expect(fileWatcher).toBeDefined();
    });
  });

  describe('Debouncing and Performance', () => {
    test('should_debounce_rapid_changes_when_multiple_files_change_quickly', async () => {
      const testFile = join(sourceRoot, 'rapid-changes.html');
      writeFileSync(testFile, '<html><body>v1</body></html>');

      let processedEvents = [];
      const watchOptions = {
        debounceMs: 100,
        onChange: (event) => processedEvents.push(event)
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Make rapid changes
      writeFileSync(testFile, '<html><body>v2</body></html>');
      writeFileSync(testFile, '<html><body>v3</body></html>');
      writeFileSync(testFile, '<html><body>v4</body></html>');
      
      // Wait less than debounce period
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(processedEvents.length).toBe(0); // Should be debounced
      
      // Wait for debounce period to complete
      await new Promise(resolve => setTimeout(resolve, 120));
      
      // Should process only the final change
      expect(processedEvents.length).toBe(1);
      expect(processedEvents[0].filePath).toBe(testFile);
    });

    test('should_wait_100ms_before_processing_when_debouncing_active', async () => {
      const testFile = join(sourceRoot, 'debounce-test.html');
      writeFileSync(testFile, '<html><body>original</body></html>');

      let processedAt = null;
      const watchOptions = {
        debounceMs: 100,
        onChange: () => processedAt = Date.now()
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      const changeTime = Date.now();
      writeFileSync(testFile, '<html><body>changed</body></html>');
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(processedAt).toBeDefined();
      expect(processedAt - changeTime).toBeGreaterThanOrEqual(100);
    });

    test('should_reset_debounce_timer_when_additional_changes_occur', async () => {
      const testFile = join(sourceRoot, 'timer-reset.html');
      writeFileSync(testFile, '<html><body>v1</body></html>');

      let processCount = 0;
      const watchOptions = {
        debounceMs: 100,
        onChange: () => processCount++
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // First change
      writeFileSync(testFile, '<html><body>v2</body></html>');
      
      // Wait 75ms (less than debounce period)
      await new Promise(resolve => setTimeout(resolve, 75));
      
      // Second change should reset timer
      writeFileSync(testFile, '<html><body>v3</body></html>');
      
      // Wait another 75ms (total 150ms from first change, but only 75ms from second)
      await new Promise(resolve => setTimeout(resolve, 75));
      expect(processCount).toBe(0); // Should still be debounced
      
      // Wait additional time to complete debounce from second change
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(processCount).toBe(1); // Now should be processed
    });

    test('should_process_batch_of_changes_when_debounce_timer_expires', async () => {
      // Create multiple files
      const files = [
        join(sourceRoot, 'file1.html'),
        join(sourceRoot, 'file2.html'), 
        join(sourceRoot, 'file3.html')
      ];
      
      files.forEach(file => writeFileSync(file, '<html><body>original</body></html>'));

      let batchedChanges = [];
      const watchOptions = {
        debounceMs: 100,
        onChange: (batchedEvents) => {
          if (Array.isArray(batchedEvents)) {
            batchedChanges = batchedEvents;
          } else {
            batchedChanges.push(batchedEvents);
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Change all files rapidly
      files.forEach(file => writeFileSync(file, '<html><body>changed</body></html>'));
      
      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(batchedChanges.length).toBe(files.length);
      expect(batchedChanges.every(event => files.includes(event.filePath))).toBe(true);
    });
  });

  describe('AbortController Integration', () => {
    test('should_cancel_in_progress_build_when_new_changes_detected', async () => {
      const testFile = join(sourceRoot, 'cancel-test.html');
      writeFileSync(testFile, '<html><body>original</body></html>');

      let buildStarted = false;
      let buildCompleted = false;
      let buildCancelled = false;

      const watchOptions = {
        onChange: async (event, abortSignal) => {
          buildStarted = true;
          try {
            // Simulate long-running build
            await new Promise(resolve => setTimeout(resolve, 200));
            if (!abortSignal.aborted) {
              buildCompleted = true;
            }
          } catch (error) {
            if (error.name === 'AbortError') {
              buildCancelled = true;
            }
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Start first build
      writeFileSync(testFile, '<html><body>change1</body></html>');
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(buildStarted).toBe(true);
      
      // Trigger second change to cancel first build
      writeFileSync(testFile, '<html><body>change2</body></html>');
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      expect(buildCancelled).toBe(true);
      expect(buildCompleted).toBe(false); // First build should not complete
    });

    test('should_use_abort_controller_when_starting_build_operation', async () => {
      const testFile = join(sourceRoot, 'abort-controller-test.html');
      writeFileSync(testFile, '<html><body>test</body></html>');

      let receivedAbortSignal = null;
      const watchOptions = {
        onChange: (event, abortSignal) => {
          receivedAbortSignal = abortSignal;
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      writeFileSync(testFile, '<html><body>changed</body></html>');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(receivedAbortSignal).toBeDefined();
      expect(receivedAbortSignal).toBeInstanceOf(AbortSignal);
    });

    test('should_clean_up_aborted_operations_when_cancellation_occurs', async () => {
      const testFile = join(sourceRoot, 'cleanup-test.html');
      writeFileSync(testFile, '<html><body>original</body></html>');

      let operations = [];
      const watchOptions = {
        onChange: async (event, abortSignal) => {
          const operationId = Date.now();
          operations.push({ id: operationId, completed: false, aborted: false });
          
          try {
            await new Promise(resolve => setTimeout(resolve, 200));
            operations.find(op => op.id === operationId).completed = true;
          } catch (error) {
            if (error.name === 'AbortError') {
              operations.find(op => op.id === operationId).aborted = true;
            }
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Start and cancel operations
      writeFileSync(testFile, '<html><body>change1</body></html>');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      writeFileSync(testFile, '<html><body>change2</body></html>');
      await new Promise(resolve => setTimeout(resolve, 300));
      
      expect(operations.length).toBe(2);
      expect(operations[0].aborted).toBe(true);
      expect(operations[0].completed).toBe(false);
      expect(operations[1].completed).toBe(true);
    });

    test('should_handle_abort_signals_gracefully_when_operation_cancelled', async () => {
      const testFile = join(sourceRoot, 'graceful-abort.html');
      writeFileSync(testFile, '<html><body>original</body></html>');

      let errorHandled = false;
      const watchOptions = {
        onChange: async (event, abortSignal) => {
          try {
            abortSignal.throwIfAborted();
            await new Promise(resolve => setTimeout(resolve, 100));
            abortSignal.throwIfAborted();
          } catch (error) {
            if (error.name === 'AbortError') {
              errorHandled = true;
            }
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      writeFileSync(testFile, '<html><body>change1</body></html>');
      await new Promise(resolve => setTimeout(resolve, 25));
      
      // Trigger cancellation
      writeFileSync(testFile, '<html><body>change2</body></html>');
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(errorHandled).toBe(true);
    });
  });

  describe('Intelligent Rebuilding Logic', () => {
    test('should_rebuild_dependent_pages_when_fragment_changes', async () => {
      // Create fragment and pages that depend on it
      const fragmentFile = join(sourceRoot, '_header.html');
      const page1File = join(sourceRoot, 'page1.html');
      const page2File = join(sourceRoot, 'page2.html');
      
      writeFileSync(fragmentFile, '<header>Original Header</header>');
      writeFileSync(page1File, '<html data-unify="_header.html"><body>Page 1</body></html>');
      writeFileSync(page2File, '<html data-unify="_header.html"><body>Page 2</body></html>');

      let rebuildRequests = [];
      const watchOptions = {
        onChange: (event) => {
          const impact = fileWatcher.getChangeImpact(event.filePath);
          rebuildRequests.push(impact);
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Modify fragment
      writeFileSync(fragmentFile, '<header>Updated Header</header>');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(rebuildRequests.length).toBe(1);
      expect(rebuildRequests[0].changedFile).toBe(fragmentFile);
      expect(rebuildRequests[0].dependentPages).toContain(page1File);
      expect(rebuildRequests[0].dependentPages).toContain(page2File);
      expect(rebuildRequests[0].impactLevel).toBe('medium');
    });

    test('should_rebuild_single_page_when_page_file_changes', async () => {
      const pageFile = join(sourceRoot, 'single-page.html');
      writeFileSync(pageFile, '<html><body>Original Page</body></html>');

      let rebuildRequests = [];
      const watchOptions = {
        onChange: (event) => {
          const impact = fileWatcher.getChangeImpact(event.filePath);
          rebuildRequests.push(impact);
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      writeFileSync(pageFile, '<html><body>Updated Page</body></html>');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(rebuildRequests.length).toBe(1);
      expect(rebuildRequests[0].changedFile).toBe(pageFile);
      expect(rebuildRequests[0].dependentPages).toHaveLength(0);
      expect(rebuildRequests[0].impactLevel).toBe('low');
      expect(rebuildRequests[0].rebuildNeeded).toBe(true);
    });

    test('should_copy_asset_when_asset_file_changes', async () => {
      const assetFile = join(sourceRoot, 'style.css');
      const pageFile = join(sourceRoot, 'page.html');
      
      writeFileSync(assetFile, 'body { color: red; }');
      writeFileSync(pageFile, '<html><head><link rel="stylesheet" href="style.css"></head></html>');

      let assetCopyRequests = [];
      const watchOptions = {
        onChange: (event) => {
          const impact = fileWatcher.getChangeImpact(event.filePath);
          if (impact.isAsset) {
            assetCopyRequests.push(impact);
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      writeFileSync(assetFile, 'body { color: blue; }');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(assetCopyRequests.length).toBe(1);
      expect(assetCopyRequests[0].changedFile).toBe(assetFile);
      expect(assetCopyRequests[0].isAsset).toBe(true);
      expect(assetCopyRequests[0].dependentPages).toContain(pageFile);
    });

    test('should_handle_new_file_addition_appropriately', async () => {
      let additionEvents = [];
      const watchOptions = {
        onChange: (event) => {
          if (event.isAddition) {
            additionEvents.push(event);
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Add new page file
      const newPageFile = join(sourceRoot, 'new-page.html');
      writeFileSync(newPageFile, '<html><body>New Page</body></html>');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(additionEvents.length).toBe(1);
      expect(additionEvents[0].filePath).toBe(newPageFile);
      expect(additionEvents[0].eventType).toBe('rename');
    });

    test('should_clean_up_output_when_file_deleted', async () => {
      const pageFile = join(sourceRoot, 'delete-me.html');
      writeFileSync(pageFile, '<html><body>Delete Me</body></html>');

      let deletionEvents = [];
      const watchOptions = {
        onChange: (event) => {
          if (event.isDeletion) {
            deletionEvents.push(event);
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      rmSync(pageFile);
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(deletionEvents.length).toBe(1);
      expect(deletionEvents[0].filePath).toBe(pageFile);
      expect(deletionEvents[0].requiresCleanup).toBe(true);
    });
  });

  describe('Performance and Memory Management', () => {
    test('should_maintain_stable_memory_usage_when_watching_long_term', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      const watchOptions = {
        onChange: () => {} // Minimal handler
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Simulate long-term watching with periodic changes
      for (let i = 0; i < 100; i++) {
        const tempFile = join(sourceRoot, `temp-${i}.html`);
        writeFileSync(tempFile, `<html><body>Content ${i}</body></html>`);
        await new Promise(resolve => setTimeout(resolve, 10));
        rmSync(tempFile);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (< 50MB for this test)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should_handle_large_file_collections_efficiently_when_1000_plus_files', async () => {
      // Create large number of files
      const fileCount = 1000;
      const files = [];
      
      for (let i = 0; i < fileCount; i++) {
        const fileName = `file-${i.toString().padStart(4, '0')}.html`;
        const filePath = join(sourceRoot, fileName);
        writeFileSync(filePath, `<html><body>Content ${i}</body></html>`);
        files.push(filePath);
      }

      const startTime = Date.now();
      let changeCount = 0;
      
      const watchOptions = {
        onChange: () => changeCount++
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      const watchStartTime = Date.now() - startTime;
      
      // Should start watching quickly even with many files
      expect(watchStartTime).toBeLessThan(2000); // < 2 seconds
      
      // Make a change to trigger file watching
      writeFileSync(files[0], '<html><body>Modified</body></html>');
      
      const changeStartTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 300));
      const changeDetectionTime = Date.now() - changeStartTime;
      
      expect(changeCount).toBeGreaterThan(0);
      expect(changeDetectionTime).toBeLessThan(500); // Should detect changes quickly
    });

    test('should_avoid_duplicate_builds_when_same_file_changes_rapidly', async () => {
      const testFile = join(sourceRoot, 'rapid-duplicate-test.html');
      writeFileSync(testFile, '<html><body>original</body></html>');

      let buildCount = 0;
      const watchOptions = {
        debounceMs: 100,
        onChange: () => buildCount++
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Make rapid identical changes
      for (let i = 0; i < 10; i++) {
        writeFileSync(testFile, '<html><body>same change</body></html>');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      // Wait for debounce period
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should only trigger one build despite multiple changes
      expect(buildCount).toBe(1);
    });

    test('should_batch_related_changes_when_processing_file_groups', async () => {
      // Create related files
      const layoutFile = join(sourceRoot, '_layout.html');
      const page1File = join(sourceRoot, 'page1.html');
      const page2File = join(sourceRoot, 'page2.html');
      
      writeFileSync(layoutFile, '<html><body><slot name="content"></slot></body></html>');
      writeFileSync(page1File, '<html data-unify="_layout.html"><div data-target="content">Page 1</div></html>');
      writeFileSync(page2File, '<html data-unify="_layout.html"><div data-target="content">Page 2</div></html>');

      let batchedEvents = [];
      const watchOptions = {
        debounceMs: 100,
        onChange: (events) => {
          if (Array.isArray(events)) {
            batchedEvents.push(...events);
          } else {
            batchedEvents.push(events);
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Change related files simultaneously
      writeFileSync(layoutFile, '<html><body>Updated <slot name="content"></slot></body></html>');
      writeFileSync(page1File, '<html data-unify="_layout.html"><div data-target="content">Updated Page 1</div></html>');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should batch related changes
      expect(batchedEvents.length).toBe(2);
      expect(batchedEvents.map(e => e.filePath)).toContain(layoutFile);
      expect(batchedEvents.map(e => e.filePath)).toContain(page1File);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should_handle_file_permission_changes_when_watching', async () => {
      const testFile = join(sourceRoot, 'permission-test.html');
      writeFileSync(testFile, '<html><body>test</body></html>');

      let errorEvents = [];
      const watchOptions = {
        onChange: () => {},
        onError: (error) => errorEvents.push(error)
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Simulate permission change (in real scenario would use chmod)
      // For testing, we'll simulate by trying to watch a protected directory
      try {
        await fileWatcher.startWatching('/root', watchOptions);
      } catch (error) {
        // Should handle permission errors gracefully
        expect(error.message).toContain('permission');
      }
      
      // Original watcher should still be functional
      expect(fileWatcher.isWatching).toBe(true);
    });

    test('should_handle_temporary_file_creation_by_editors_when_watching', async () => {
      let tempFileEvents = [];
      const watchOptions = {
        onChange: (event) => {
          if (event.filePath.includes('.tmp') || event.filePath.includes('~')) {
            tempFileEvents.push(event);
          }
        }
      };

      await fileWatcher.startWatching(sourceRoot, watchOptions);
      
      // Simulate editor temporary files
      const tempFile1 = join(sourceRoot, 'page.html~');
      const tempFile2 = join(sourceRoot, '.page.html.tmp');
      
      writeFileSync(tempFile1, 'temp content');
      writeFileSync(tempFile2, 'temp content');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should detect temp files but they should be filtered appropriately
      expect(tempFileEvents.length).toBeGreaterThan(0);
    });

    test('should_recover_from_watch_errors_when_directory_temporarily_unavailable', async () => {
      let recoveryAttempts = 0;
      const watchOptions = {
        onChange: () => {},
        onError: (error) => recoveryAttempts++,
        retryOnError: true,
        maxRetries: 3
      };

      // Create directory then remove it to simulate unavailability
      const tempWatchDir = join(testDir, 'temp-watch-dir');
      mkdirSync(tempWatchDir);
      
      await fileWatcher.startWatching(tempWatchDir, watchOptions);
      
      // Remove directory while watching to trigger error
      rmSync(tempWatchDir, { recursive: true, force: true });
      
      // Recreate directory to test recovery
      await new Promise(resolve => setTimeout(resolve, 100));
      mkdirSync(tempWatchDir);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should attempt recovery
      expect(recoveryAttempts).toBeGreaterThan(0);
    });

    test('should_provide_helpful_error_messages_when_watch_fails', async () => {
      let capturedError = null;
      const watchOptions = {
        onChange: () => {},
        onError: (error) => capturedError = error
      };

      // Try to watch non-existent directory
      try {
        await fileWatcher.startWatching('/completely/invalid/path/that/does/not/exist', watchOptions);
      } catch (error) {
        capturedError = error;
      }
      
      expect(capturedError).toBeDefined();
      expect(capturedError.message).toContain('ENOENT');
      expect(capturedError.helpfulMessage).toBeDefined();
      expect(capturedError.helpfulMessage).toContain('directory does not exist');
    });
  });
});