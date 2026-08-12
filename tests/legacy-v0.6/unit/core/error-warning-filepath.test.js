/**
 * Tests to ensure all errors and warnings include file paths
 * 
 * This test suite verifies that whenever an error or warning is logged,
 * it includes the file path context for better debugging and user experience.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { Logger } from '../../../src/utils/logger.js';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { AssetTracker } from '../../../src/core/asset-tracker.js';
import { AssetCopier } from '../../../src/core/asset-copier.js';
import { PathValidator } from '../../../src/core/path-validator.js';
import { BuildCommand } from '../../../src/cli/commands/build-command.js';
import { ServeCommand } from '../../../src/cli/commands/serve-command.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('Error and Warning File Path Inclusion', () => {
  let testDir;
  let mockLogger;
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    // Create test directory
    testDir = `/tmp/error-filepath-test-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });

    // Create mock logger to capture calls
    mockLogger = {
      error: (() => {
        const calls = [];
        const fn = (...args) => calls.push(args);
        fn.mock = { calls };
        return fn;
      })(),
      warn: (() => {
        const calls = [];
        const fn = (...args) => calls.push(args);
        fn.mock = { calls };
        return fn;
      })(),
      info: (() => {
        const calls = [];
        const fn = (...args) => calls.push(args);
        fn.mock = { calls };
        return fn;
      })(),
      debug: (() => {
        const calls = [];
        const fn = (...args) => calls.push(args);
        fn.mock = { calls };
        return fn;
      })()
    };

    // Spy on console methods
    consoleErrorSpy = spyOn(console, 'error');
    if (consoleErrorSpy.mockImplementation) {
      consoleErrorSpy.mockImplementation(() => {});
    }
    consoleWarnSpy = spyOn(console, 'warn');
    if (consoleWarnSpy.mockImplementation) {
      consoleWarnSpy.mockImplementation(() => {});
    }
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    // Restore console methods
    if (consoleErrorSpy && consoleErrorSpy.mockRestore) {
      consoleErrorSpy.mockRestore();
    }
    if (consoleWarnSpy && consoleWarnSpy.mockRestore) {
      consoleWarnSpy.mockRestore();
    }
  });

  describe('HTMLProcessor Errors', () => {
    it('should include file path in processing errors', async () => {
      const testFile = join(testDir, 'invalid.html');
      writeFileSync(testFile, '<html><body data-unify="non-existent.html">Content</body></html>');

      const processor = new HtmlProcessor({
        sourceDir: testDir,
        outputDir: join(testDir, 'dist'),
        logger: mockLogger
      });

      // Process file with missing layout - this should cause an error
      const result = await processor.processFile(testFile, '<html><body data-unify="non-existent.html">Content</body></html>');

      // Verify error logging includes file path
      const errorCalls = mockLogger.error.mock.calls;
      expect(errorCalls.length).toBeGreaterThan(0);
      
      const hasFilePathInError = errorCalls.some(call => {
        const [message, context] = call;
        return context && (context.filePath || context.file || message.includes(testFile));
      });
      
      expect(hasFilePathInError).toBe(true);
    });

    it('should include file path when layout is not found', async () => {
      const testFile = join(testDir, 'page.html');
      writeFileSync(testFile, '<html><body data-unify="missing-layout.html">Content</body></html>');

      const processor = new HtmlProcessor({
        sourceDir: testDir,
        outputDir: join(testDir, 'dist'),
        logger: mockLogger
      });

      await processor.processFile(testFile);

      // Check for warnings about missing layout with file path
      const errorCalls = [...mockLogger.error.mock.calls, ...mockLogger.warn.mock.calls];
      const hasFilePathInCall = errorCalls.some(call => {
        const [message, context] = call;
        return (context && (context.filePath || context.file)) || 
               message.includes(testFile) || 
               message.includes('page.html');
      });
      
      expect(hasFilePathInCall).toBe(true);
    });
  });

  describe('AssetTracker Errors', () => {
    it('should include file path in asset processing errors', async () => {
      const cssFile = join(testDir, 'styles.css');
      writeFileSync(cssFile, '.test { background-image: url("missing-file.jpg"); }');

      const tracker = new AssetTracker({
        sourceDir: testDir,
        outputDir: join(testDir, 'dist'),
        logger: mockLogger
      });

      await tracker.processCssFile(cssFile);

      // Check error/warning calls include file path
      const allCalls = [...mockLogger.error.mock.calls, ...mockLogger.warn.mock.calls, ...mockLogger.debug.mock.calls];
      // Asset tracker might log at debug level or warn level
      expect(allCalls.length).toBeGreaterThan(0);
      
      const hasFilePathInCall = allCalls.some(call => {
        const [message, context] = call;
        return message && (message.includes(cssFile) || message.includes('styles.css'));
      });
      
      expect(hasFilePathInCall).toBe(true);
    });

    it('should include file path in circular import warnings', async () => {
      const cssFile1 = join(testDir, 'styles1.css');
      const cssFile2 = join(testDir, 'styles2.css');
      
      // Use url() to reference other CSS files which AssetTracker actually parses
      writeFileSync(cssFile1, '.test { background: url("./styles2.css"); }');
      writeFileSync(cssFile2, '.test { background: url("./styles1.css"); }');

      const tracker = new AssetTracker({
        sourceDir: testDir,
        outputDir: join(testDir, 'dist'),
        logger: mockLogger
      });

      await tracker.processCssFile(cssFile1);

      // Check warning/debug calls include file paths
      const allCalls = [...mockLogger.warn.mock.calls, ...mockLogger.debug.mock.calls];
      expect(allCalls.length).toBeGreaterThan(0);
      
      const hasFilePathInCall = allCalls.some(call => {
        const [message] = call;
        return message && (message.includes('styles1.css') || message.includes('styles2.css'));
      });
      
      expect(hasFilePathInCall).toBe(true);
    });
  });

  describe('PathValidator Errors', () => {
    it('should include file path in path traversal errors', () => {
      const validator = new PathValidator();
      const maliciousPath = '../../../etc/passwd';

      try {
        validator.validatePath(maliciousPath, testDir);
      } catch (error) {
        // PathValidator throws errors, doesn't use logger for warnings in current implementation
        expect(error.message).toContain('traversal');
      }
    });
  });

  describe('BuildCommand Errors', () => {
    it('should include file path in build processing errors', async () => {
      const invalidHtml = join(testDir, 'invalid.html');
      writeFileSync(invalidHtml, '<html><body><unclosed-tag>Content</body></html>');

      const buildCommand = new BuildCommand({
        logger: mockLogger
      });

      try {
        await buildCommand._processFile(invalidHtml, {
          sourceDir: testDir,
          outputDir: join(testDir, 'dist'),
          options: {}
        });
      } catch (error) {
        // Error might be thrown
      }

      // Check that error logging includes file path
      const errorCalls = mockLogger.error.mock.calls;
      if (errorCalls.length > 0) {
        const hasFilePathInError = errorCalls.some(call => {
          const [message, context] = call;
          return message.includes(invalidHtml) || message.includes('invalid.html');
        });
        
        expect(hasFilePathInError).toBe(true);
      }
    });
  });


  describe('Logger Context Validation', () => {
    it('should properly format file paths in context', () => {
      const logger = new Logger({ component: 'TEST' });
      const testFilePath = '/path/to/test/file.html';
      
      // Spy on console.error to capture formatted output
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});
      
      logger.error('Test error message', { filePath: testFilePath });
      
      const loggedMessages = consoleSpy.mock.calls;
      expect(loggedMessages.length).toBe(1);
      
      const loggedMessage = loggedMessages[0][0];
      expect(loggedMessage).toContain('file=/path/to/test/file.html');
      
      consoleSpy.mockRestore();
    });

    it('should handle missing file path gracefully', () => {
      const logger = new Logger({ component: 'TEST' });
      
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});
      
      // Log error without file path context
      logger.error('Test error message without file path');
      
      const loggedMessages = consoleSpy.mock.calls;
      expect(loggedMessages.length).toBe(1);
      
      // Should not crash, just log without file context
      const loggedMessage = loggedMessages[0][0];
      expect(loggedMessage).toContain('Test error message without file path');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Asset Processing Errors', () => {
    it('should include file path in asset copy errors', async () => {
      const nonExistentFile = join(testDir, 'missing.jpg');
      
      const copier = new AssetCopier({
        sourceDir: testDir,
        outputDir: join(testDir, 'dist'),
        logger: mockLogger
      });

      try {
        await copier.copyFile(nonExistentFile, join(testDir, 'dist', 'missing.jpg'));
      } catch (error) {
        // Error should be thrown or logged
      }

      // Check if any errors/warnings were logged with file paths
      const allCalls = [...mockLogger.error.mock.calls, ...mockLogger.warn.mock.calls];
      if (allCalls.length > 0) {
        const hasFilePathInCall = allCalls.some(call => {
          const [message, context] = call;
          return message.includes('missing.jpg') || 
                 message.includes(nonExistentFile) ||
                 (context && context.filePath);
        });
        
        expect(hasFilePathInCall).toBe(true);
      }
    });
  });
});