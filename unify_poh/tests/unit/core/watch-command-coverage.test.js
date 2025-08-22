/**
 * Watch Command Coverage Tests
 * Comprehensive coverage for file watching and incremental build coordination
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { WatchCommand } from '../../../src/cli/commands/watch-command.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

describe('WatchCommand Coverage Enhancement', () => {
  let watchCommand;
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(() => {
    tempDir = `/tmp/unify-watch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sourceDir = join(tempDir, 'src');
    outputDir = join(tempDir, 'dist');
    
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    
    watchCommand = new WatchCommand();
  });

  afterEach(async () => {
    try {
      await watchCommand.stop();
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Initial Build Error Handling Coverage (Lines 45-50)', () => {
    test('should_handle_initial_build_failures', async () => {
      // Mock IncrementalBuilder to fail initial build
      watchCommand.incrementalBuilder.performInitialBuild = mock(async () => ({
        success: false,
        error: 'Initial build failed',
        processedFiles: 0,
        buildTime: 100
      }));

      const options = {
        source: sourceDir,
        output: outputDir
      };

      const result = await watchCommand.execute(options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Initial build failed');
      expect(result.initialBuildCompleted).toBe(false);
      expect(result.watchingStarted).toBe(false);
    });

    test('should_handle_initial_build_with_missing_source', async () => {
      const nonexistentSource = join(tempDir, 'missing');
      
      const options = {
        source: nonexistentSource,
        output: outputDir
      };

      const result = await watchCommand.execute(options);

      expect(result.success).toBe(false);
      expect(result.initialBuildCompleted).toBe(false);
      expect(result.watchingStarted).toBe(false);
    });
  });

  describe('Build Event Reporting Coverage (Lines 54-61)', () => {
    test('should_call_onBuild_callback_for_initial_build', async () => {
      const buildEvents = [];
      
      // Mock successful initial build
      watchCommand.incrementalBuilder.performInitialBuild = mock(async () => ({
        success: true,
        processedFiles: 5,
        buildTime: 150
      }));

      // Mock FileWatcher to not actually start watching
      watchCommand.fileWatcher.startWatching = mock(async () => {});

      const options = {
        source: sourceDir,
        output: outputDir,
        timeout: 10, // Short timeout for testing
        onBuild: (event) => {
          buildEvents.push(event);
        }
      };

      await watchCommand.execute(options);

      expect(buildEvents.length).toBe(1);
      expect(buildEvents[0].type).toBe('initial');
      expect(buildEvents[0].processedFiles).toBe(5);
      expect(buildEvents[0].buildTime).toBe(150);
      expect(buildEvents[0].timestamp).toBeDefined();
    });

    test('should_not_crash_when_onBuild_callback_throws', async () => {
      // Mock successful initial build
      watchCommand.incrementalBuilder.performInitialBuild = mock(async () => ({
        success: true,
        processedFiles: 1,
        buildTime: 50
      }));

      // Mock FileWatcher
      watchCommand.fileWatcher.startWatching = mock(async () => {});

      const options = {
        source: sourceDir,
        output: outputDir,
        timeout: 10,
        onBuild: () => {
          throw new Error('Callback error');
        }
      };

      // Should not throw
      const result = await watchCommand.execute(options);
      expect(result.success).toBe(true);
    });
  });

  describe('Watch Setup Error Handling Coverage (Lines 69-71, 76-78)', () => {
    test('should_handle_file_watcher_startup_errors', async () => {
      // Mock successful initial build
      watchCommand.incrementalBuilder.performInitialBuild = mock(async () => ({
        success: true,
        processedFiles: 1,
        buildTime: 50
      }));

      // Mock FileWatcher to throw error during startup
      watchCommand.fileWatcher.startWatching = mock(async () => {
        throw new Error('Watch setup failed');
      });

      const options = {
        source: sourceDir,
        output: outputDir
      };

      const result = await watchCommand.execute(options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Watch setup failed');
      expect(result.initialBuildCompleted).toBe(true);
      expect(result.watchingStarted).toBe(false);
    });

    test('should_call_onError_callback_for_watch_errors', async () => {
      const errors = [];

      // Mock successful initial build
      watchCommand.incrementalBuilder.performInitialBuild = mock(async () => ({
        success: true,
        processedFiles: 1,
        buildTime: 50
      }));

      // Mock FileWatcher to call onError
      watchCommand.fileWatcher.startWatching = mock(async (source, options) => {
        // Simulate error after starting
        setTimeout(() => {
          options.onError(new Error('Watch runtime error'));
        }, 5);
      });

      const options = {
        source: sourceDir,
        output: outputDir,
        timeout: 50,
        onError: (error) => {
          errors.push(error);
        }
      };

      await watchCommand.execute(options);

      // Wait for async error
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('Watch runtime error');
    });
  });

  describe('Timeout Handling Coverage (Lines 80-84)', () => {
    test('should_auto_stop_after_timeout', async () => {
      let watchingStopped = false;

      // Mock successful initial build
      watchCommand.incrementalBuilder.performInitialBuild = mock(async () => ({
        success: true,
        processedFiles: 1,
        buildTime: 50
      }));

      // Mock FileWatcher
      watchCommand.fileWatcher.startWatching = mock(async () => {});
      
      // Override stop method to track calls
      const originalStop = watchCommand.stop.bind(watchCommand);
      watchCommand.stop = mock(async () => {
        watchingStopped = true;
        return originalStop();
      });

      const options = {
        source: sourceDir,
        output: outputDir,
        timeout: 50 // 50ms timeout
      };

      await watchCommand.execute(options);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(watchingStopped).toBe(true);
    });
  });

  describe('Stop Method Error Handling Coverage (Lines 118-123)', () => {
    test('should_handle_stop_errors_gracefully', async () => {
      // Mock FileWatcher to throw error during stop
      watchCommand.fileWatcher.stopWatching = mock(async () => {
        throw new Error('Stop failed');
      });

      const result = await watchCommand.stop();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Stop failed');
      expect(result.watchingStopped).toBe(false);
      expect(result.resourcesCleaned).toBe(false);
    });

    test('should_successfully_stop_when_not_watching', async () => {
      // Mock FileWatcher
      watchCommand.fileWatcher.stopWatching = mock(async () => {});

      const result = await watchCommand.stop();

      expect(result.success).toBe(true);
      expect(result.watchingStopped).toBe(true);
      expect(result.resourcesCleaned).toBe(true);
    });
  });

  describe('File Change Handler Coverage (Lines 139, 151, 178-185)', () => {
    test('should_handle_aborted_operations', async () => {
      const controller = new AbortController();
      const events = [
        { filePath: join(sourceDir, 'test.html') }
      ];

      // Abort immediately
      controller.abort();

      // Mock file change handler
      const options = {
        source: sourceDir,
        output: outputDir
      };

      // Should handle abort gracefully
      await watchCommand._handleFileChanges(events, options, controller.signal);

      // Should not throw and complete silently
    });

    test('should_handle_abort_during_incremental_build', async () => {
      const controller = new AbortController();
      const events = [
        { filePath: join(sourceDir, 'test.html') }
      ];

      // Mock incremental builder with delay
      watchCommand.incrementalBuilder.performIncrementalBuild = mock(async () => {
        // Abort during build
        controller.abort();
        throw new Error('Operation aborted');
      });

      const options = {
        source: sourceDir,
        output: outputDir
      };

      // Should handle abort gracefully
      await watchCommand._handleFileChanges(events, options, controller.signal);

      // Should not throw
    });

    test('should_call_onBuild_for_incremental_changes', async () => {
      const buildEvents = [];
      const events = [
        { filePath: join(sourceDir, 'page1.html') },
        { filePath: join(sourceDir, 'page2.html') }
      ];

      // Mock incremental builder
      watchCommand.incrementalBuilder.performIncrementalBuild = mock(async (filePath) => ({
        success: true,
        rebuiltFiles: 1,
        affectedPages: [filePath.replace(sourceDir, outputDir)]
      }));

      const options = {
        source: sourceDir,
        output: outputDir,
        onBuild: (event) => {
          buildEvents.push(event);
        }
      };

      await watchCommand._handleFileChanges(events, options, null);

      expect(buildEvents.length).toBe(1);
      expect(buildEvents[0].type).toBe('incremental');
      expect(buildEvents[0].changedFiles).toEqual([
        join(sourceDir, 'page1.html'),
        join(sourceDir, 'page2.html')
      ]);
      expect(buildEvents[0].rebuiltFiles).toBe(2); // Both files
      expect(buildEvents[0].affectedPages.length).toBe(2);
    });

    test('should_handle_onError_callback_for_build_failures', async () => {
      const errors = [];
      const events = [
        { filePath: join(sourceDir, 'problematic.html') }
      ];

      // Mock incremental builder to fail
      watchCommand.incrementalBuilder.performIncrementalBuild = mock(async () => {
        throw new Error('Build process failed');
      });

      const options = {
        source: sourceDir,
        output: outputDir,
        onError: (error) => {
          errors.push(error);
        }
      };

      await watchCommand._handleFileChanges(events, options, null);

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('Build process failed');
    });

    test('should_handle_non_abort_errors_during_change_processing', async () => {
      const errors = [];
      const events = [
        { filePath: join(sourceDir, 'test.html') }
      ];

      // Mock incremental builder to throw non-abort error
      watchCommand.incrementalBuilder.performIncrementalBuild = mock(async () => {
        throw new Error('Filesystem error');
      });

      const options = {
        source: sourceDir,
        output: outputDir,
        onError: (error) => {
          errors.push(error);
        }
      };

      await watchCommand._handleFileChanges(events, options, null);

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe('Filesystem error');
    });
  });

  describe('Event Processing Edge Cases', () => {
    test('should_handle_single_event_vs_array_events', async () => {
      const singleEvent = { filePath: join(sourceDir, 'single.html') };
      const arrayEvents = [
        { filePath: join(sourceDir, 'array1.html') },
        { filePath: join(sourceDir, 'array2.html') }
      ];

      const buildEvents = [];

      // Mock incremental builder
      watchCommand.incrementalBuilder.performIncrementalBuild = mock(async () => ({
        success: true,
        rebuiltFiles: 1,
        affectedPages: []
      }));

      const options = {
        source: sourceDir,
        output: outputDir,
        onBuild: (event) => {
          buildEvents.push(event);
        }
      };

      // Test single event
      await watchCommand._handleFileChanges(singleEvent, options, null);
      expect(buildEvents[0].changedFiles).toEqual([join(sourceDir, 'single.html')]);

      // Test array events
      await watchCommand._handleFileChanges(arrayEvents, options, null);
      expect(buildEvents[1].changedFiles).toEqual([
        join(sourceDir, 'array1.html'),
        join(sourceDir, 'array2.html')
      ]);
    });

    test('should_accumulate_results_from_multiple_file_changes', async () => {
      const events = [
        { filePath: join(sourceDir, 'page1.html') },
        { filePath: join(sourceDir, 'page2.html') },
        { filePath: join(sourceDir, 'page3.html') }
      ];

      let buildCallCount = 0;

      // Mock incremental builder with varying results
      watchCommand.incrementalBuilder.performIncrementalBuild = mock(async (filePath) => {
        buildCallCount++;
        return {
          success: true,
          rebuiltFiles: buildCallCount,
          affectedPages: [`output-${buildCallCount}`]
        };
      });

      const buildEvents = [];
      const options = {
        source: sourceDir,
        output: outputDir,
        onBuild: (event) => {
          buildEvents.push(event);
        }
      };

      await watchCommand._handleFileChanges(events, options, null);

      expect(buildCallCount).toBe(3);
      expect(buildEvents.length).toBe(1);
      expect(buildEvents[0].rebuiltFiles).toBe(6); // 1 + 2 + 3
      expect(buildEvents[0].affectedPages).toEqual([
        'output-1', 'output-2', 'output-3'
      ]);
    });

    test('should_handle_incremental_build_failures_gracefully', async () => {
      const events = [
        { filePath: join(sourceDir, 'good.html') },
        { filePath: join(sourceDir, 'bad.html') },
        { filePath: join(sourceDir, 'good2.html') }
      ];

      // Mock incremental builder with mixed success
      watchCommand.incrementalBuilder.performIncrementalBuild = mock(async (filePath) => {
        if (filePath.includes('bad.html')) {
          return { success: false, rebuiltFiles: 0 };
        }
        return { success: true, rebuiltFiles: 1, affectedPages: [filePath] };
      });

      const buildEvents = [];
      const options = {
        source: sourceDir,
        output: outputDir,
        onBuild: (event) => {
          buildEvents.push(event);
        }
      };

      await watchCommand._handleFileChanges(events, options, null);

      expect(buildEvents.length).toBe(1);
      expect(buildEvents[0].rebuiltFiles).toBe(2); // Only successful builds counted
      expect(buildEvents[0].affectedPages.length).toBe(2);
    });
  });
});