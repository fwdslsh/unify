/**
 * File Watcher Tests
 * Tests for the FileWatcher class that monitors file changes for incremental builds
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { join, dirname } from 'path';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { FileWatcher } from '../../../src/core/file-watcher.js';

describe('FileWatcher', () => {
  let fileWatcher;
  let tempDir;
  let mockComponents;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = await mkdtemp(join(tmpdir(), 'unify-file-watcher-test-'));
    await mkdir(join(tempDir, 'src'), { recursive: true });
    
    // Mock DependencyTracker
    const mockDependencyTracker = {
      getDependentPages: mock(() => []),
      trackPageDependencies: mock(async () => {}),
      getStats: mock(() => ({ totalDependencies: 0 }))
    };

    // Mock FileClassifier  
    const mockFileClassifier = {
      classifyFile: mock((filePath) => {
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
        const isFragment = fileName.startsWith('_');
        const isPage = fileName.endsWith('.html') && !isFragment;
        const isAsset = !fileName.endsWith('.html') && !isFragment;
        
        return {
          type: isPage ? 'page' : isFragment ? 'fragment' : 'asset',
          isAsset,
          isFragment,
          isPage,
          shouldEmit: fileName.endsWith('.html'),
          processingStrategy: fileName.endsWith('.html') ? 'html' : 'asset'
        };
      })
    };

    // Mock createLogger
    const mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {})
    };

    mockComponents = {
      dependencyTracker: mockDependencyTracker,
      fileClassifier: mockFileClassifier,
      logger: mockLogger
    };

    // Create FileWatcher and inject mocked components
    fileWatcher = new FileWatcher();
    fileWatcher.dependencyTracker = mockComponents.dependencyTracker;
    fileWatcher.fileClassifier = mockComponents.fileClassifier;
    fileWatcher.logger = mockComponents.logger;
  });

  afterEach(async () => {
    try {
      // Stop any active watching
      await fileWatcher.stopWatching();
      
      // Clean up temporary directory
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Constructor', () => {
    test('should initialize with correct default state', () => {
      const watcher = new FileWatcher();
      
      expect(watcher.isWatching).toBe(false);
      expect(watcher.usesBunFsWatch).toBe(true);
      expect(watcher.watchHandlers).toBeInstanceOf(Map);
      expect(watcher.watchedDirectories).toEqual([]);
      expect(watcher.debounceTimers).toBeInstanceOf(Map);
      expect(watcher.currentAbortController).toBeNull();
      expect(watcher.pendingChanges).toBeInstanceOf(Map);
    });

    test('should create dependency tracker and file classifier', () => {
      const watcher = new FileWatcher();
      
      expect(watcher.dependencyTracker).toBeDefined();
      expect(watcher.fileClassifier).toBeDefined();
      expect(watcher.logger).toBeDefined();
    });
  });

  describe('setWatchFunction', () => {
    test('should allow custom watch function injection', () => {
      const customWatchFunction = mock(() => ({}));
      
      fileWatcher.setWatchFunction(customWatchFunction);
      
      expect(fileWatcher._watchFunction).toBe(customWatchFunction);
    });
  });

  describe('startWatching', () => {
    test('should start watching directory with default options', async () => {
      const mockWatcher = {
        on: mock(() => {}),
        close: mock(() => {})
      };
      const mockWatchFunction = mock(() => mockWatcher);
      fileWatcher.setWatchFunction(mockWatchFunction);

      await fileWatcher.startWatching(tempDir);

      expect(fileWatcher.isWatching).toBe(true);
      expect(fileWatcher.watchedDirectories).toContain(tempDir);
      expect(fileWatcher.watchHandlers.has(tempDir)).toBe(true);
      expect(mockWatchFunction).toHaveBeenCalledWith(
        tempDir,
        { recursive: true },
        expect.any(Function)
      );
      expect(mockWatcher.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    test('should start watching with custom options', async () => {
      const mockWatcher = {
        on: mock(() => {}),
        close: mock(() => {})
      };
      const mockWatchFunction = mock(() => mockWatcher);
      fileWatcher.setWatchFunction(mockWatchFunction);

      const customOptions = {
        recursive: false,
        debounceMs: 200,
        onChange: mock(() => {}),
        onError: mock(() => {})
      };

      await fileWatcher.startWatching(tempDir, customOptions);

      expect(mockWatchFunction).toHaveBeenCalledWith(
        tempDir,
        { recursive: false },
        expect.any(Function)
      );
      
      const handlerInfo = fileWatcher.watchHandlers.get(tempDir);
      expect(handlerInfo.options.debounceMs).toBe(200);
      expect(handlerInfo.options.onChange).toBe(customOptions.onChange);
      expect(handlerInfo.options.onError).toBe(customOptions.onError);
    });

    test('should not start watching same directory twice', async () => {
      const mockWatcher = {
        on: mock(() => {}),
        close: mock(() => {})
      };
      const mockWatchFunction = mock(() => mockWatcher);
      fileWatcher.setWatchFunction(mockWatchFunction);

      await fileWatcher.startWatching(tempDir);
      expect(mockWatchFunction).toHaveBeenCalledTimes(1);

      // Try to start watching same directory again
      await fileWatcher.startWatching(tempDir);
      expect(mockWatchFunction).toHaveBeenCalledTimes(1);
    });

    test('should handle watch function errors gracefully', async () => {
      const mockError = new Error('Watch failed');
      mockError.code = 'ENOENT';
      const mockWatchFunction = mock(() => {
        throw mockError;
      });
      fileWatcher.setWatchFunction(mockWatchFunction);

      const onError = mock(() => {});

      await expect(fileWatcher.startWatching(tempDir, { onError })).rejects.toThrow();
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        helpfulMessage: expect.stringContaining('Watch failed: directory does not exist')
      }));
    });

    test('should enhance error messages for different error codes', async () => {
      const testCases = [
        { code: 'ENOENT', expectedMessage: 'directory does not exist' },
        { code: 'EACCES', expectedMessage: 'permission denied accessing directory' },
        { code: 'OTHER', expectedMessage: 'Watch failed' }
      ];

      for (const testCase of testCases) {
        const mockError = new Error('Test error');
        mockError.code = testCase.code;
        const mockWatchFunction = mock(() => {
          throw mockError;
        });
        fileWatcher.setWatchFunction(mockWatchFunction);

        const onError = mock(() => {});

        try {
          await fileWatcher.startWatching(tempDir, { onError });
        } catch (error) {
          expect(error.helpfulMessage).toContain(testCase.expectedMessage);
        }
      }
    });
  });

  describe('stopWatching', () => {
    test('should stop watching and clean up resources', async () => {
      const mockWatcher = {
        on: mock(() => {}),
        close: mock(() => {})
      };
      const mockWatchFunction = mock(() => mockWatcher);
      fileWatcher.setWatchFunction(mockWatchFunction);

      // Start watching first
      await fileWatcher.startWatching(tempDir);
      expect(fileWatcher.isWatching).toBe(true);

      // Add some pending changes and timers to test cleanup
      fileWatcher.pendingChanges.set('test.html', { filePath: 'test.html' });
      fileWatcher.debounceTimers.set('test', setTimeout(() => {}, 1000));
      fileWatcher.currentAbortController = new AbortController();

      // Stop watching
      await fileWatcher.stopWatching();

      expect(fileWatcher.isWatching).toBe(false);
      expect(fileWatcher.watchHandlers.size).toBe(0);
      expect(fileWatcher.watchedDirectories).toEqual([]);
      expect(fileWatcher.pendingChanges.size).toBe(0);
      expect(fileWatcher.debounceTimers.size).toBe(0);
      expect(fileWatcher.currentAbortController).toBeNull();
      expect(mockWatcher.close).toHaveBeenCalled();
    });

    test('should handle missing watcher gracefully', async () => {
      // Set up a handler without a close method
      fileWatcher.watchHandlers.set(tempDir, { someProperty: 'value' });
      fileWatcher.isWatching = true;

      // Should complete without throwing
      await fileWatcher.stopWatching();
      expect(fileWatcher.isWatching).toBe(false);
    });

    test('should abort current operations', async () => {
      const mockAbortController = {
        abort: mock(() => {}),
        signal: { aborted: false }
      };
      fileWatcher.currentAbortController = mockAbortController;

      await fileWatcher.stopWatching();

      expect(mockAbortController.abort).toHaveBeenCalled();
      expect(fileWatcher.currentAbortController).toBeNull();
    });
  });

  describe('registerPageDependencies', () => {
    test('should delegate to dependency tracker', async () => {
      const pagePath = join(tempDir, 'page.html');
      const content = '<html><body>Test</body></html>';

      await fileWatcher.registerPageDependencies(pagePath, content, tempDir);

      expect(mockComponents.dependencyTracker.trackPageDependencies).toHaveBeenCalledWith(
        pagePath,
        content,
        tempDir
      );
    });
  });

  describe('findPagesDependingOnAsset', () => {
    test('should return dependent pages for asset', async () => {
      const assetPath = join(tempDir, 'style.css');
      const expectedPages = [join(tempDir, 'page1.html'), join(tempDir, 'page2.html')];
      
      mockComponents.dependencyTracker.getDependentPages.mockReturnValueOnce(expectedPages);

      const result = await fileWatcher.findPagesDependingOnAsset(assetPath, tempDir);

      expect(result).toEqual(expectedPages);
      expect(mockComponents.dependencyTracker.getDependentPages).toHaveBeenCalledWith(assetPath);
    });
  });

  describe('findPagesDependingOnFragment', () => {
    test('should return dependent pages for fragment', async () => {
      const fragmentPath = join(tempDir, '_header.html');
      const expectedPages = [join(tempDir, 'index.html')];
      
      mockComponents.dependencyTracker.getDependentPages.mockReturnValueOnce(expectedPages);

      const result = await fileWatcher.findPagesDependingOnFragment(fragmentPath, tempDir);

      expect(result).toEqual(expectedPages);
      expect(mockComponents.dependencyTracker.getDependentPages).toHaveBeenCalledWith(fragmentPath);
    });
  });

  describe('getChangeImpact', () => {
    test('should analyze impact for page file', () => {
      const filePath = join(tempDir, 'page.html');
      mockComponents.dependencyTracker.getDependentPages.mockReturnValueOnce([]);

      const result = fileWatcher.getChangeImpact(filePath);

      expect(result).toEqual({
        changedFile: filePath,
        fileType: 'page',
        isAsset: false,
        isFragment: false,
        isPage: true,
        dependentPages: [],
        rebuildNeeded: true, // Pages always need rebuild
        impactLevel: 'low'
      });
    });

    test('should analyze impact for fragment file with dependencies', () => {
      const filePath = join(tempDir, '_header.html');
      const dependentPages = [join(tempDir, 'page1.html'), join(tempDir, 'page2.html')];
      
      mockComponents.dependencyTracker.getDependentPages.mockReturnValueOnce(dependentPages);

      const result = fileWatcher.getChangeImpact(filePath);

      expect(result).toEqual({
        changedFile: filePath,
        fileType: 'fragment',
        isAsset: false,
        isFragment: true,
        isPage: false,
        dependentPages: dependentPages,
        rebuildNeeded: true,
        impactLevel: 'medium' // 2 pages > 1, so medium impact
      });
    });

    test('should calculate high impact for fragment with many dependents', () => {
      const filePath = join(tempDir, '_common-header.html');
      const manyPages = Array.from({ length: 6 }, (_, i) => join(tempDir, `page${i}.html`));
      
      mockComponents.dependencyTracker.getDependentPages.mockReturnValueOnce(manyPages);

      const result = fileWatcher.getChangeImpact(filePath);

      expect(result.impactLevel).toBe('high');
      expect(result.dependentPages).toHaveLength(6);
    });

    test('should find potential dependencies when none tracked', async () => {
      const filePath = join(tempDir, 'src', '_header.html');
      
      // Create test files in the same directory as the fragment
      await writeFile(join(tempDir, 'src', 'page1.html'), '<html data-unify="_header.html"><body></body></html>');
      await writeFile(join(tempDir, 'src', 'page2.html'), '<html><body>No dependencies</body></html>');
      await writeFile(join(tempDir, 'src', '_header.html'), '<header>Header content</header>');
      
      mockComponents.dependencyTracker.getDependentPages.mockReturnValueOnce([]);

      const result = fileWatcher.getChangeImpact(filePath);

      expect(result.dependentPages.length).toBeGreaterThan(0);
      expect(result.rebuildNeeded).toBe(true);
    });
  });

  describe('_calculateImpactLevel', () => {
    test('should return low impact for page files', () => {
      const classification = { isPage: true, isFragment: false, isAsset: false };
      
      const result = fileWatcher._calculateImpactLevel(classification, 10);
      
      expect(result).toBe('low');
    });

    test('should return high impact for fragment with many dependencies', () => {
      const classification = { isPage: false, isFragment: true, isAsset: false };
      
      const result = fileWatcher._calculateImpactLevel(classification, 10);
      
      expect(result).toBe('high');
    });

    test('should return high impact for asset with many dependencies', () => {
      const classification = { isPage: false, isFragment: false, isAsset: true };
      
      const result = fileWatcher._calculateImpactLevel(classification, 15);
      
      expect(result).toBe('high');
    });

    test('should return medium impact for multiple dependencies', () => {
      const classification = { isPage: false, isFragment: false, isAsset: true };
      
      const result = fileWatcher._calculateImpactLevel(classification, 3);
      
      expect(result).toBe('medium');
    });

    test('should return low impact for single dependency', () => {
      const classification = { isPage: false, isFragment: true, isAsset: false };
      
      const result = fileWatcher._calculateImpactLevel(classification, 1);
      
      expect(result).toBe('low');
    });
  });

  describe('getWatchStats', () => {
    test('should return current watch statistics', async () => {
      const mockWatcher = {
        on: mock(() => {}),
        close: mock(() => {})
      };
      const mockWatchFunction = mock(() => mockWatcher);
      fileWatcher.setWatchFunction(mockWatchFunction);

      // Initially not watching
      let stats = fileWatcher.getWatchStats();
      expect(stats).toEqual({
        isWatching: false,
        watchedDirectories: 0,
        dependencies: { totalDependencies: 0 }
      });

      // Start watching
      await fileWatcher.startWatching(tempDir);
      
      stats = fileWatcher.getWatchStats();
      expect(stats).toEqual({
        isWatching: true,
        watchedDirectories: 1,
        dependencies: { totalDependencies: 0 }
      });
    });
  });

  describe('_handleFileChange', () => {
    test('should handle file change event with debouncing', (done) => {
      const onChange = mock(async (event) => {
        expect(event.filePath).toBe(join(tempDir, 'test.html'));
        expect(event.eventType).toBe('change');
        expect(event.isAddition).toBe(false);
        expect(event.isDeletion).toBe(false);
        done();
      });
      
      const watchOptions = { onChange, debounceMs: 50 };

      fileWatcher._handleFileChange('change', join(tempDir, 'test.html'), watchOptions);

      // Verify event was added to pending changes
      expect(fileWatcher.pendingChanges.has(join(tempDir, 'test.html'))).toBe(true);
    });

    test('should detect file addition on rename event', async () => {
      await writeFile(join(tempDir, 'new-file.html'), '<html></html>');
      
      const onChange = mock(async (event) => {
        expect(event.isAddition).toBe(true);
        expect(event.isDeletion).toBe(false);
      });
      
      const watchOptions = { onChange, debounceMs: 10 };

      fileWatcher._handleFileChange('rename', join(tempDir, 'new-file.html'), watchOptions);
      
      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    test('should detect file deletion on rename event', (done) => {
      const onChange = mock(async (event) => {
        expect(event.isAddition).toBe(false);
        expect(event.isDeletion).toBe(true);
        expect(event.requiresCleanup).toBe(true);
        done();
      });
      
      const watchOptions = { onChange, debounceMs: 10 };

      fileWatcher._handleFileChange('rename', join(tempDir, 'non-existent.html'), watchOptions);
    });

    test('should handle errors in file change processing', (done) => {
      const onError = mock((error) => {
        expect(error).toBeDefined();
        done();
      });
      
      const onChange = mock(async () => {
        throw new Error('Processing failed');
      });
      
      const watchOptions = { onChange, onError, debounceMs: 10 };

      fileWatcher._handleFileChange('change', join(tempDir, 'test.html'), watchOptions);
    });
  });

  describe('_processPendingChanges', () => {
    test('should process single change as individual event', (done) => {
      const testEvent = {
        filePath: join(tempDir, 'test.html'),
        eventType: 'change',
        timestamp: Date.now()
      };
      
      fileWatcher.pendingChanges.set(testEvent.filePath, testEvent);

      const onChange = mock(async (event) => {
        expect(event).toEqual(testEvent);
        expect(Array.isArray(event)).toBe(false);
        done();
      });

      fileWatcher._processPendingChanges({ onChange });
    });

    test('should process multiple changes as array', (done) => {
      const event1 = { filePath: join(tempDir, 'file1.html'), eventType: 'change', timestamp: Date.now() };
      const event2 = { filePath: join(tempDir, 'file2.html'), eventType: 'change', timestamp: Date.now() };
      
      fileWatcher.pendingChanges.set(event1.filePath, event1);
      fileWatcher.pendingChanges.set(event2.filePath, event2);

      const onChange = mock(async (events) => {
        expect(Array.isArray(events)).toBe(true);
        expect(events).toHaveLength(2);
        expect(events).toContain(event1);
        expect(events).toContain(event2);
        done();
      });

      fileWatcher._processPendingChanges({ onChange });
    });

    test('should support abort signal', (done) => {
      const testEvent = { filePath: join(tempDir, 'test.html'), eventType: 'change', timestamp: Date.now() };
      fileWatcher.pendingChanges.set(testEvent.filePath, testEvent);

      // Create a mock function that appears to accept 2 parameters
      const onChange = async function(event, signal) {
        expect(signal).toBeDefined();
        expect(signal.aborted).toBe(false);
        done();
      };

      fileWatcher._processPendingChanges({ onChange });
    });

    test('should handle abort signal cancellation', async () => {
      const testEvent = { filePath: join(tempDir, 'test.html'), eventType: 'change', timestamp: Date.now() };
      fileWatcher.pendingChanges.set(testEvent.filePath, testEvent);
      
      fileWatcher.currentAbortController = new AbortController();
      fileWatcher.currentAbortController.abort(); // Pre-abort for testing

      const onChange = mock(async () => {
        const error = new Error('Operation aborted');
        error.name = 'AbortError';
        throw error;
      });

      // Should complete without throwing even with AbortError
      await fileWatcher._processPendingChanges({ onChange });
      // Test passes if no exception is thrown
    });

    test('should handle errors with onError callback', async () => {
      const testEvent = { filePath: join(tempDir, 'test.html'), eventType: 'change', timestamp: Date.now() };
      fileWatcher.pendingChanges.set(testEvent.filePath, testEvent);

      const testError = new Error('Processing failed');
      const onChange = mock(async () => {
        throw testError;
      });
      
      const onError = mock(() => {});

      await fileWatcher._processPendingChanges({ onChange, onError });

      expect(onError).toHaveBeenCalledWith(testError);
    });

    test('should clear pending changes after processing', async () => {
      const testEvent = { filePath: join(tempDir, 'test.html'), eventType: 'change', timestamp: Date.now() };
      fileWatcher.pendingChanges.set(testEvent.filePath, testEvent);
      
      expect(fileWatcher.pendingChanges.size).toBe(1);

      await fileWatcher._processPendingChanges({ onChange: mock(async () => {}) });

      expect(fileWatcher.pendingChanges.size).toBe(0);
    });

    test('should cancel previous operation before starting new one', async () => {
      const mockAbortController = {
        abort: mock(() => {}),
        signal: { aborted: false }
      };
      
      fileWatcher.currentAbortController = mockAbortController;

      await fileWatcher._processPendingChanges({ onChange: mock(async () => {}) });

      expect(mockAbortController.abort).toHaveBeenCalled();
    });
  });

  describe('_findPotentialDependentPages', () => {
    test('should find pages with fragment dependencies', async () => {
      const fragmentPath = join(tempDir, '_header.html');
      
      // Create test files
      await writeFile(join(tempDir, 'page1.html'), '<html data-unify="_header.html"><body></body></html>');
      await writeFile(join(tempDir, 'page2.html'), '<html><body data-unify="./_header.html"></body></html>');
      await writeFile(join(tempDir, 'page3.html'), '<html><body>No dependencies</body></html>');

      const result = fileWatcher._findPotentialDependentPages(fragmentPath);

      expect(result).toContain(join(tempDir, 'page1.html'));
      expect(result).toContain(join(tempDir, 'page2.html'));
      expect(result).not.toContain(join(tempDir, 'page3.html'));
    });

    test('should find pages with asset dependencies', async () => {
      const assetPath = join(tempDir, 'style.css');
      
      // Create test files
      await writeFile(join(tempDir, 'page1.html'), '<html><head><link href="style.css" rel="stylesheet"></head></html>');
      await writeFile(join(tempDir, 'page2.html'), '<html><head><script src="style.css"></script></head></html>');
      await writeFile(join(tempDir, 'page3.html'), '<html><body>No dependencies</body></html>');

      const result = fileWatcher._findPotentialDependentPages(assetPath);

      expect(result).toContain(join(tempDir, 'page1.html'));
      expect(result).toContain(join(tempDir, 'page2.html'));
      expect(result).not.toContain(join(tempDir, 'page3.html'));
    });

    test('should handle directory read errors gracefully', () => {
      const nonExistentPath = join(tempDir, 'non-existent', '_fragment.html');
      
      const result = fileWatcher._findPotentialDependentPages(nonExistentPath);
      
      expect(result).toEqual([]);
    });

    test('should remove duplicate dependencies', async () => {
      const fragmentPath = join(tempDir, '_header.html');
      
      // Create file with multiple references to same fragment
      await writeFile(join(tempDir, 'page1.html'), `
        <html data-unify="_header.html">
          <body data-unify="./_header.html">
            <div data-unify="_header.html"></div>
          </body>
        </html>
      `);

      const result = fileWatcher._findPotentialDependentPages(fragmentPath);

      // Should have only one instance of page1.html despite multiple references
      const page1Occurrences = result.filter(path => path === join(tempDir, 'page1.html'));
      expect(page1Occurrences).toHaveLength(1);
    });
  });

  describe('_enhanceError', () => {
    test('should enhance ENOENT errors', () => {
      const originalError = new Error('File not found');
      originalError.code = 'ENOENT';
      
      const enhanced = fileWatcher._enhanceError(originalError, tempDir);
      
      expect(enhanced.helpfulMessage).toContain('directory does not exist');
      expect(enhanced.helpfulMessage).toContain(tempDir);
      expect(enhanced.code).toBe('ENOENT');
    });

    test('should enhance EACCES errors', () => {
      const originalError = new Error('Permission denied');
      originalError.code = 'EACCES';
      
      const enhanced = fileWatcher._enhanceError(originalError, tempDir);
      
      expect(enhanced.helpfulMessage).toContain('permission denied accessing directory');
      expect(enhanced.helpfulMessage).toContain(tempDir);
      expect(enhanced.code).toBe('EACCES');
    });

    test('should provide generic enhancement for other errors', () => {
      const originalError = new Error('Something went wrong');
      originalError.code = 'UNKNOWN';
      
      const enhanced = fileWatcher._enhanceError(originalError, tempDir);
      
      expect(enhanced.helpfulMessage).toBe('Watch failed: Something went wrong');
      expect(enhanced.code).toBe('UNKNOWN');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete watch lifecycle', async () => {
      const mockWatcher = {
        on: mock(() => {}),
        close: mock(() => {})
      };
      const mockWatchFunction = mock((path, options, callback) => {
        // Store callback for later invocation
        mockWatcher.callback = callback;
        return mockWatcher;
      });
      fileWatcher.setWatchFunction(mockWatchFunction);

      let changeEvents = [];
      const onChange = mock(async (event) => {
        if (Array.isArray(event)) {
          changeEvents.push(...event);
        } else {
          changeEvents.push(event);
        }
      });

      // Start watching
      await fileWatcher.startWatching(tempDir, { onChange, debounceMs: 10 });
      
      expect(fileWatcher.isWatching).toBe(true);

      // Simulate file changes
      mockWatcher.callback('change', 'test.html');
      mockWatcher.callback('change', 'style.css');

      // Wait for debouncing
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(changeEvents).toHaveLength(2);
      expect(changeEvents[0].filePath).toContain('test.html');
      expect(changeEvents[1].filePath).toContain('style.css');

      // Stop watching
      await fileWatcher.stopWatching();
      
      expect(fileWatcher.isWatching).toBe(false);
      expect(mockWatcher.close).toHaveBeenCalled();
    });

    test('should handle watch errors through error callback', async () => {
      const mockWatcher = {
        on: mock((event, callback) => {
          if (event === 'error') {
            // Simulate error after setup
            setTimeout(() => callback(new Error('Watch error')), 5);
          }
        }),
        close: mock(() => {})
      };
      const mockWatchFunction = mock(() => mockWatcher);
      fileWatcher.setWatchFunction(mockWatchFunction);

      const onError = mock(() => {});
      
      await fileWatcher.startWatching(tempDir, { onError });
      
      // Wait for error to be triggered
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Watch error'
      }));
    });
  });
});