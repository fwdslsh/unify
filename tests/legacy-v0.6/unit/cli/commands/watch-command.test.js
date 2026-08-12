/**
 * Unit Tests for WatchCommand
 * Tests file watching with incremental builds and comprehensive mock coverage
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { WatchCommand } from '../../../../src/cli/commands/watch-command.js';

// Mock dependencies
const mockFileWatcher = {
  startWatching: mock(),
  stopWatching: mock(),
};

const mockIncrementalBuilder = {
  performInitialBuild: mock(),
  performIncrementalBuild: mock(),
};

const mockLogger = {
  info: mock(),
  error: mock(),
  debug: mock(),
  child: mock(() => mockLogger),
};

// Mock imports
mock.module('../../../../src/core/file-watcher.js', () => ({
  FileWatcher: mock(() => mockFileWatcher),
}));

mock.module('../../../../src/core/incremental-builder.js', () => ({
  IncrementalBuilder: mock(() => mockIncrementalBuilder),
}));

mock.module('../../../../src/utils/logger.js', () => ({
  createLogger: mock(() => mockLogger),
}));

describe('WatchCommand', () => {
  let watchCommand;
  let onBuildCallback;
  let onErrorCallback;

  beforeEach(() => {
    // Reset all mocks
    mockFileWatcher.startWatching.mockClear();
    mockFileWatcher.stopWatching.mockClear();
    mockIncrementalBuilder.performInitialBuild.mockClear();
    mockIncrementalBuilder.performIncrementalBuild.mockClear();
    mockLogger.info.mockClear();
    mockLogger.error.mockClear();
    mockLogger.debug.mockClear();

    // Setup default mock responses
    mockIncrementalBuilder.performInitialBuild.mockResolvedValue({
      success: true,
      processedFiles: 5,
      buildTime: 150
    });

    mockIncrementalBuilder.performIncrementalBuild.mockResolvedValue({
      success: true,
      rebuiltFiles: 2,
      affectedPages: ['index.html', 'about.html']
    });

    mockFileWatcher.startWatching.mockResolvedValue(undefined);
    mockFileWatcher.stopWatching.mockResolvedValue(undefined);

    // Setup callbacks
    onBuildCallback = mock();
    onErrorCallback = mock();

    watchCommand = new WatchCommand();
  });

  describe('constructor', () => {
    it('should initialize with correct default state', () => {
      expect(watchCommand.isWatching).toBe(false);
      expect(watchCommand.buildResults).toEqual([]);
    });

    it('should create required components', () => {
      expect(watchCommand.fileWatcher).toBeDefined();
      expect(watchCommand.incrementalBuilder).toBeDefined();
      expect(watchCommand.logger).toBeDefined();
    });
  });

  describe('execute()', () => {
    const defaultOptions = {
      source: './src',
      output: './dist'
    };

    it('should successfully execute watch command', async () => {
      const result = await watchCommand.execute(defaultOptions);

      expect(result.success).toBe(true);
      expect(result.initialBuildCompleted).toBe(true);
      expect(result.watchingStarted).toBe(true);
      expect(typeof result.buildTime).toBe('number');
      expect(watchCommand.isWatching).toBe(true);
    });

    it('should perform initial build before watching', async () => {
      await watchCommand.execute(defaultOptions);

      expect(mockIncrementalBuilder.performInitialBuild).toHaveBeenCalledWith(
        './src',
        './dist',
        expect.objectContaining({ prettyUrls: undefined, minify: undefined, clean: undefined, verbose: undefined })
      );

      expect(mockFileWatcher.startWatching).toHaveBeenCalled();
    });

    it('should fail if initial build fails', async () => {
      mockIncrementalBuilder.performInitialBuild.mockResolvedValue({
        success: false,
        error: 'Initial build failed'
      });

      const result = await watchCommand.execute(defaultOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Initial build failed');
      expect(result.initialBuildCompleted).toBe(false);
      expect(result.watchingStarted).toBe(false);
      
      // Should not start watching if initial build fails
      expect(mockFileWatcher.startWatching).not.toHaveBeenCalled();
    });

    it('should call onBuild callback after initial build', async () => {
      const options = {
        ...defaultOptions,
        onBuild: onBuildCallback
      };

      await watchCommand.execute(options);

      expect(onBuildCallback).toHaveBeenCalledWith({
        type: 'initial',
        processedFiles: 5,
        buildTime: 150,
        timestamp: expect.any(Number)
      });
    });

    it('should handle onBuild callback errors gracefully', async () => {
      const options = {
        ...defaultOptions,
        onBuild: mock(() => {
          throw new Error('Callback error');
        })
      };

      // Mock console.warn to verify it's called
      const originalWarn = console.warn;
      console.warn = mock();

      const result = await watchCommand.execute(options);

      expect(result.success).toBe(true);
      expect(console.warn).toHaveBeenCalledWith('Build callback error:', 'Callback error');
      
      // Restore console.warn
      console.warn = originalWarn;
    });

    it('should configure watch options with custom debounce', async () => {
      const options = {
        ...defaultOptions,
        debounceMs: 500,
        onBuild: onBuildCallback,
        onError: onErrorCallback
      };

      await watchCommand.execute(options);

      expect(mockFileWatcher.startWatching).toHaveBeenCalledWith(
        './src',
        {
          debounceMs: 500,
          onChange: expect.any(Function),
          onError: expect.any(Function)
        }
      );
    });

    it('should use default debounce if not specified', async () => {
      await watchCommand.execute(defaultOptions);

      expect(mockFileWatcher.startWatching).toHaveBeenCalledWith(
        './src',
        {
          debounceMs: 100,
          onChange: expect.any(Function),
          onError: expect.any(Function)
        }
      );
    });

    it('should handle timeout for testing', async () => {
      // Mock the stop method directly
      const originalStop = watchCommand.stop;
      watchCommand.stop = mock().mockResolvedValue({ success: true });

      const options = {
        ...defaultOptions,
        timeout: 50
      };

      await watchCommand.execute(options);

      // Wait for timeout to trigger
      await new Promise(resolve => setTimeout(resolve, 60));

      expect(watchCommand.stop).toHaveBeenCalled();
      
      // Restore original method
      watchCommand.stop = originalStop;
    });

    it('should handle unexpected errors during execution', async () => {
      mockIncrementalBuilder.performInitialBuild.mockRejectedValue(
        new Error('Unexpected error')
      );

      const result = await watchCommand.execute(defaultOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unexpected error');
      expect(result.initialBuildCompleted).toBe(false);
      expect(result.watchingStarted).toBe(false);
      expect(typeof result.buildTime).toBe('number');
    });

    it('should handle file watcher start failure', async () => {
      mockFileWatcher.startWatching.mockRejectedValue(
        new Error('Watch start failed')
      );

      const result = await watchCommand.execute(defaultOptions);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Watch start failed');
      expect(result.initialBuildCompleted).toBe(true);
      expect(result.watchingStarted).toBe(false);
    });
  });

  describe('stop()', () => {
    beforeEach(async () => {
      await watchCommand.execute({ source: './src', output: './dist' });
    });

    it('should successfully stop watching', async () => {
      const result = await watchCommand.stop();

      expect(result.success).toBe(true);
      expect(result.watchingStopped).toBe(true);
      expect(result.resourcesCleaned).toBe(true);
      expect(watchCommand.isWatching).toBe(false);
      expect(mockFileWatcher.stopWatching).toHaveBeenCalled();
    });

    it('should handle stop errors', async () => {
      mockFileWatcher.stopWatching.mockRejectedValue(
        new Error('Stop failed')
      );

      const result = await watchCommand.stop();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Stop failed');
      expect(result.watchingStopped).toBe(false);
      expect(result.resourcesCleaned).toBe(false);
    });
  });

  describe('_handleFileChanges()', () => {
    let watchOptions;

    beforeEach(async () => {
      const options = {
        source: './src',
        output: './dist',
        onBuild: onBuildCallback,
        onError: onErrorCallback
      };

      await watchCommand.execute(options);

      // Extract the onChange callback from the watch options
      const watchCall = mockFileWatcher.startWatching.mock.calls[0];
      watchOptions = watchCall[1];
    });

    it('should process single file change', async () => {
      const event = { filePath: './src/index.html' };
      
      await watchOptions.onChange(event);

      expect(mockIncrementalBuilder.performIncrementalBuild).toHaveBeenCalledWith(
        './src/index.html',
        './src',
        './dist',
        expect.objectContaining({ prettyUrls: undefined, minify: undefined })
      );

      expect(onBuildCallback).toHaveBeenCalledWith({
        type: 'incremental',
        changedFiles: ['./src/index.html'],
        rebuiltFiles: 2,
        affectedPages: ['index.html', 'about.html'],
        buildTime: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });

    it('should process multiple file changes', async () => {
      const events = [
        { filePath: './src/index.html' },
        { filePath: './src/style.css' }
      ];
      
      await watchOptions.onChange(events);

      expect(mockIncrementalBuilder.performIncrementalBuild).toHaveBeenCalledTimes(2);
      expect(onBuildCallback).toHaveBeenCalledWith({
        type: 'incremental',
        changedFiles: ['./src/index.html', './src/style.css'],
        rebuiltFiles: 4, // 2 + 2
        affectedPages: ['index.html', 'about.html', 'index.html', 'about.html'],
        buildTime: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });

    it('should handle build result errors and report them', async () => {
      const event = { filePath: './src/index.html' };
      
      mockIncrementalBuilder.performIncrementalBuild.mockResolvedValue({
        success: true,
        rebuiltFiles: 1,
        affectedPages: [],
        errors: [
          {
            message: 'Warning: unused CSS',
            file: './src/style.css',
            type: 'warning',
            timestamp: Date.now()
          }
        ]
      });

      await watchOptions.onChange(event);

      expect(onErrorCallback).toHaveBeenCalled();
      const errorArg = onErrorCallback.mock.calls[0][0];
      expect(errorArg.message).toBe('Warning: unused CSS');
      expect(errorArg.file).toBe('./src/style.css');
      expect(errorArg.type).toBe('warning');
    });

    it('should handle recoverable errors gracefully', async () => {
      const event = { filePath: './src/broken.html' };
      
      const recoverableError = new Error('Recoverable build error');
      recoverableError.name = 'RecoverableError';
      recoverableError.isRecoverable = true;
      recoverableError.file = './src/broken.html';

      mockIncrementalBuilder.performIncrementalBuild.mockRejectedValue(recoverableError);

      await watchOptions.onChange(event);

      expect(onErrorCallback).toHaveBeenCalledWith(recoverableError);
      expect(mockLogger.debug).toHaveBeenCalledWith('Caught recoverable error', {
        message: 'Recoverable build error',
        file: './src/broken.html'
      });
    });

    it('should re-throw non-recoverable errors', async () => {
      const event = { filePath: './src/index.html' };
      
      const fatalError = new Error('Fatal build error');
      mockIncrementalBuilder.performIncrementalBuild.mockRejectedValue(fatalError);

      await watchOptions.onChange(event);

      expect(onErrorCallback).toHaveBeenCalledWith(fatalError);
    });

    it('should handle abort signal during file processing', async () => {
      const event = { filePath: './src/index.html' };
      const abortSignal = { aborted: true };
      
      await watchOptions.onChange(event, abortSignal);

      // Should not process files if aborted
      expect(mockIncrementalBuilder.performIncrementalBuild).not.toHaveBeenCalled();
    });

    it('should handle abort signal during individual file processing', async () => {
      const events = [
        { filePath: './src/index.html' },
        { filePath: './src/style.css' }
      ];
      
      // Mock the first call to succeed, second should be aborted
      let callCount = 0;
      mockIncrementalBuilder.performIncrementalBuild.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { success: true, rebuiltFiles: 1, affectedPages: [] };
        }
        // This should not be reached
        return { success: true, rebuiltFiles: 1, affectedPages: [] };
      });

      // Start with aborted signal
      const abortSignal = { aborted: true };

      await watchOptions.onChange(events, abortSignal);

      // Should not process any files when aborted from the start
      expect(mockIncrementalBuilder.performIncrementalBuild).toHaveBeenCalledTimes(0);
    });

    it('should handle onBuild callback errors during incremental builds', async () => {
      onBuildCallback.mockImplementation(() => {
        throw new Error('Build callback error');
      });

      // Mock console.warn
      const originalWarn = console.warn;
      console.warn = mock();

      const event = { filePath: './src/index.html' };
      await watchOptions.onChange(event);

      expect(console.warn).toHaveBeenCalledWith('Build callback error:', 'Build callback error');
      
      // Restore console.warn
      console.warn = originalWarn;
    });

    it('should handle abort errors gracefully', async () => {
      const event = { filePath: './src/index.html' };
      
      const abortError = new Error('Operation aborted');
      abortError.name = 'AbortError';
      mockIncrementalBuilder.performIncrementalBuild.mockRejectedValue(abortError);

      // Should not call onError for abort errors
      await watchOptions.onChange(event);
      
      expect(onErrorCallback).not.toHaveBeenCalled();
    });

    it('should handle errors with "aborted" in message', async () => {
      const event = { filePath: './src/index.html' };
      
      mockIncrementalBuilder.performIncrementalBuild.mockRejectedValue(
        new Error('Operation was aborted due to timeout')
      );

      // Should not call onError for abort-related errors
      await watchOptions.onChange(event);
      
      expect(onErrorCallback).not.toHaveBeenCalled();
    });
  });

  describe('watch options error callback', () => {
    it('should forward file watcher errors to onError callback', async () => {
      const options = {
        source: './src',
        output: './dist',
        onError: onErrorCallback
      };

      await watchCommand.execute(options);

      // Extract the onError callback from watch options
      const watchCall = mockFileWatcher.startWatching.mock.calls[0];
      const watchOptions = watchCall[1];

      const watchError = new Error('File system error');
      watchOptions.onError(watchError);

      expect(onErrorCallback).toHaveBeenCalledWith(watchError);
    });

    it('should handle missing onError callback gracefully', async () => {
      const options = {
        source: './src',
        output: './dist'
        // No onError callback
      };

      await watchCommand.execute(options);

      // Extract the onError callback from watch options
      const watchCall = mockFileWatcher.startWatching.mock.calls[0];
      const watchOptions = watchCall[1];

      // Should not throw when calling onError without callback
      expect(() => {
        watchOptions.onError(new Error('Test error'));
      }).not.toThrow();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete watch lifecycle', async () => {
      const buildEvents = [];
      const errorEvents = [];

      const options = {
        source: './src',
        output: './dist',
        debounceMs: 50,
        onBuild: (event) => buildEvents.push(event),
        onError: (error) => errorEvents.push(error)
      };

      // Start watching
      const startResult = await watchCommand.execute(options);
      expect(startResult.success).toBe(true);
      expect(buildEvents).toHaveLength(1);
      expect(buildEvents[0].type).toBe('initial');

      // Extract onChange callback
      const watchCall = mockFileWatcher.startWatching.mock.calls[0];
      const watchOptions = watchCall[1];

      // Simulate file changes
      await watchOptions.onChange({ filePath: './src/test.html' });
      expect(buildEvents).toHaveLength(2);
      expect(buildEvents[1].type).toBe('incremental');

      // Stop watching
      const stopResult = await watchCommand.stop();
      expect(stopResult.success).toBe(true);
      expect(watchCommand.isWatching).toBe(false);
    });

    it('should handle mixed success and error scenarios', async () => {
      const buildEvents = [];
      const errorEvents = [];

      const options = {
        source: './src',
        output: './dist',
        onBuild: (event) => buildEvents.push(event),
        onError: (error) => errorEvents.push(error)
      };

      await watchCommand.execute(options);

      // Extract onChange callback
      const watchCall = mockFileWatcher.startWatching.mock.calls[0];
      const watchOptions = watchCall[1];

      // Mock mixed results - some files succeed, some have recoverable errors
      let callCount = 0;
      mockIncrementalBuilder.performIncrementalBuild.mockImplementation(async (filePath) => {
        callCount++;
        if (filePath.includes('broken')) {
          const error = new Error('Recoverable error');
          error.name = 'RecoverableError';
          error.isRecoverable = true;
          error.file = filePath;
          throw error;
        }
        return {
          success: true,
          rebuiltFiles: 1,
          affectedPages: [`page-${callCount}.html`]
        };
      });

      const events = [
        { filePath: './src/good.html' },
        { filePath: './src/broken.html' },
        { filePath: './src/also-good.html' }
      ];

      await watchOptions.onChange(events);

      // Should have build event with aggregated results from successful files
      expect(buildEvents).toHaveLength(2); // initial + incremental
      expect(buildEvents[1].rebuiltFiles).toBe(2); // Only successful files counted
      expect(buildEvents[1].affectedPages).toHaveLength(2);

      // Should have error event from broken file
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].message).toBe('Recoverable error');
    });

    it('should handle rapid file changes with debouncing simulation', async () => {
      const buildEvents = [];

      const options = {
        source: './src',
        output: './dist',
        debounceMs: 100,
        onBuild: (event) => buildEvents.push(event)
      };

      await watchCommand.execute(options);

      // Extract onChange callback
      const watchCall = mockFileWatcher.startWatching.mock.calls[0];
      const watchOptions = watchCall[1];

      // Simulate multiple rapid changes (in real scenario, debouncing would batch these)
      await watchOptions.onChange({ filePath: './src/file1.html' });
      await watchOptions.onChange({ filePath: './src/file2.html' });
      await watchOptions.onChange({ filePath: './src/file3.html' });

      // Each change processed separately in this test (actual debouncing happens in FileWatcher)
      expect(buildEvents).toHaveLength(4); // 1 initial + 3 incremental
      expect(buildEvents[1].changedFiles).toEqual(['./src/file1.html']);
      expect(buildEvents[2].changedFiles).toEqual(['./src/file2.html']);
      expect(buildEvents[3].changedFiles).toEqual(['./src/file3.html']);
    });
  });
});