/**
 * LayoutLogger Coverage Gap Tests - ISSUE-004
 * Tests missing coverage lines for layout-logger.js component
 * Lines to cover: 69-70, 72-73, 201-202, 213-215, 240-249, 251-252, 303
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LayoutLogger } from '../../../src/utils/layout-logger.js';

describe('LayoutLogger Coverage Gaps', () => {
  let logger;
  let originalConsole;
  let originalEnv;
  let capturedLogs;

  beforeEach(() => {
    // Capture console output for testing
    capturedLogs = [];
    
    if (!originalConsole) {
      originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error
      };
    }
    
    console.log = (...args) => capturedLogs.push({ level: 'log', args });
    console.warn = (...args) => capturedLogs.push({ level: 'warn', args });
    console.error = (...args) => capturedLogs.push({ level: 'error', args });
    
    // Store original environment variables
    originalEnv = {
      DEBUG: process.env.DEBUG,
      UNIFY_DEBUG: process.env.UNIFY_DEBUG,
      LOG_LEVEL: process.env.LOG_LEVEL
    };
  });

  afterEach(() => {
    // Restore console and environment
    if (originalConsole) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
    }

    // Restore environment variables
    if (originalEnv.DEBUG !== undefined) {
      process.env.DEBUG = originalEnv.DEBUG;
    } else {
      delete process.env.DEBUG;
    }
    if (originalEnv.UNIFY_DEBUG !== undefined) {
      process.env.UNIFY_DEBUG = originalEnv.UNIFY_DEBUG;
    } else {
      delete process.env.UNIFY_DEBUG;
    }
    if (originalEnv.LOG_LEVEL !== undefined) {
      process.env.LOG_LEVEL = originalEnv.LOG_LEVEL;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  describe('Step Description Edge Cases', () => {
    test('should_format_filename_fallback_step_description', () => {
      // Test lines 69-70: filename fallback case
      logger = new LayoutLogger({ enabled: true, logLevel: 3, colors: false });
      
      const step = {
        type: 'default-layout',
        subType: 'filename', // Not 'pattern' so will trigger filename fallback
        pattern: null,
        result: 'fallback-layout.html',
        applied: true,
        step: 1
      };

      // Call the private method directly
      const formatted = logger._formatStepInfo(step);
      
      expect(formatted).toBe('filename fallback → "fallback-layout.html"');
    });

    test('should_format_discovery_step_description', () => {
      // Test lines 72-73: discovery case
      logger = new LayoutLogger({ enabled: true, logLevel: 3, colors: false });
      
      const step = {
        type: 'discovery',
        result: 'discovered-layout.html',
        applied: true
      };

      // Call the private method directly
      const formatted = logger._formatStepInfo(step);
      
      expect(formatted).toBe('found "discovered-layout.html"');
    });
  });

  describe('Log Level Priority Edge Cases', () => {
    test('should_handle_info_log_level_priority', () => {
      // Test line 201: info level case in _getLogLevel
      // Set environment to test info level
      delete process.env.DEBUG;
      delete process.env.UNIFY_DEBUG;
      process.env.LOG_LEVEL = 'info';
      
      logger = new LayoutLogger({ enabled: true });
      
      const level = logger._getLogLevel();
      expect(level).toBe(2);
    });

    test('should_handle_debug_log_level_priority', () => {
      // Test line 202: debug level case in _getLogLevel
      // Set environment to test debug level
      delete process.env.DEBUG;
      delete process.env.UNIFY_DEBUG;
      process.env.LOG_LEVEL = 'debug';
      
      logger = new LayoutLogger({ enabled: true });
      
      const level = logger._getLogLevel();
      expect(level).toBe(3);
    });
  });

  describe('Debug Environment Detection', () => {
    test('should_detect_debug_from_DEBUG_environment_variable', () => {
      // Test line 214: DEBUG=1 case in _isDebugEnabled
      process.env.DEBUG = '1';
      delete process.env.UNIFY_DEBUG;
      delete process.env.LOG_LEVEL;
      
      logger = new LayoutLogger({ enabled: true });
      
      const debugEnabled = logger._isDebugEnabled();
      expect(debugEnabled).toBe(true);
    });

    test('should_detect_debug_from_UNIFY_DEBUG_environment_variable', () => {
      // Test line 215: UNIFY_DEBUG=1 case in _isDebugEnabled
      delete process.env.DEBUG;
      process.env.UNIFY_DEBUG = '1';
      delete process.env.LOG_LEVEL;
      
      logger = new LayoutLogger({ enabled: true });
      
      const debugEnabled = logger._isDebugEnabled();
      expect(debugEnabled).toBe(true);
    });

    test('should_detect_debug_from_LOG_LEVEL_environment_variable', () => {
      // Test line 215: LOG_LEVEL=debug case in _isDebugEnabled
      delete process.env.DEBUG;
      delete process.env.UNIFY_DEBUG;
      process.env.LOG_LEVEL = 'debug';
      
      logger = new LayoutLogger({ enabled: true });
      
      const debugEnabled = logger._isDebugEnabled();
      expect(debugEnabled).toBe(true);
    });

    test('should_handle_case_insensitive_LOG_LEVEL_debug', () => {
      // Test case insensitive handling
      delete process.env.DEBUG;
      delete process.env.UNIFY_DEBUG;
      process.env.LOG_LEVEL = 'DEBUG';
      
      logger = new LayoutLogger({ enabled: true });
      
      const debugEnabled = logger._isDebugEnabled();
      expect(debugEnabled).toBe(true);
    });
  });

  describe('Color Code Generation', () => {
    test('should_generate_color_codes_for_all_colors', () => {
      // Test lines 240-249, 251-252: _colorize method color codes
      logger = new LayoutLogger({ enabled: true });
      // Force colors to be true regardless of TTY
      logger.colors = true;
      
      const testColors = [
        { name: 'red', code: '\x1b[31m' },
        { name: 'green', code: '\x1b[32m' },
        { name: 'yellow', code: '\x1b[33m' },
        { name: 'blue', code: '\x1b[34m' },
        { name: 'magenta', code: '\x1b[35m' },
        { name: 'cyan', code: '\x1b[36m' },
        { name: 'gray', code: '\x1b[90m' }
      ];
      
      for (const { name, code } of testColors) {
        const colorizedText = logger._colorize('test', name);
        expect(colorizedText).toBeString();
        expect(colorizedText).toContain('test');
        expect(colorizedText).toContain(code); // Should have the color code
        expect(colorizedText).toContain('\x1b[0m'); // Should have reset code
      }
    });

    test('should_handle_unknown_color_gracefully', () => {
      // Test line 251: colors[color] || '' fallback
      logger = new LayoutLogger({ enabled: true });
      logger.colors = true; // Force colors on
      
      const colorizedText = logger._colorize('test text', 'unknown-color');
      expect(colorizedText).toBeString();
      expect(colorizedText).toContain('test text');
    });

    test('should_add_reset_code_to_colorized_text', () => {
      // Test line 252: reset code addition
      logger = new LayoutLogger({ enabled: true });
      logger.colors = true; // Force colors on
      
      const colorizedText = logger._colorize('test', 'red');
      expect(colorizedText).toBeString();
      expect(colorizedText).toContain('\x1b[31m'); // Red color code
      expect(colorizedText).toContain('test');
      expect(colorizedText).toContain('\x1b[0m'); // Reset code
      expect(colorizedText).toBe('\x1b[31mtest\x1b[0m'); // Full format
    });
  });

  describe('Set Log Level Edge Cases', () => {
    test('should_handle_error_string_in_setLogLevel', () => {
      // Test line 303: error case in setLogLevel
      logger = new LayoutLogger({ enabled: true });
      
      logger.setLogLevel('error');
      expect(logger.logLevel).toBe(1);
    });

    test('should_handle_all_string_cases_in_setLogLevel', () => {
      // Test comprehensive string handling including line 303
      logger = new LayoutLogger({ enabled: true });
      
      const testCases = [
        { input: 'error', expected: 1 },
        { input: 'warn', expected: 1 },
        { input: 'warning', expected: 1 },
        { input: 'info', expected: 2 },
        { input: 'debug', expected: 3 },
        { input: 'none', expected: 0 },
        { input: 'off', expected: 0 },
        { input: 'invalid', expected: 2 } // Default
      ];

      for (const testCase of testCases) {
        logger.setLogLevel(testCase.input);
        expect(logger.logLevel).toBe(testCase.expected);
      }
    });
  });

  describe('Integration Test for All Missing Coverage', () => {
    test('should_exercise_all_missing_coverage_paths', () => {
      // Integration test covering multiple missing coverage areas
      
      // Setup environment for debug detection (lines 214-215)
      process.env.DEBUG = '1';
      process.env.UNIFY_DEBUG = '1';
      process.env.LOG_LEVEL = 'debug';
      
      logger = new LayoutLogger({ enabled: true, logLevel: 3 });
      logger.colors = true; // Force colors on for testing
      
      // Test debug detection
      expect(logger._isDebugEnabled()).toBe(true);
      
      // Test log level from environment (lines 201-202)
      const level = logger._getLogLevel();
      expect(level).toBe(3); // Should be debug since we set those env vars
      
      // Test color generation (lines 240-249, 251-252)
      const redText = logger._colorize('red text', 'red');
      expect(redText).toContain('\x1b[31m'); // Red color code
      expect(redText).toContain('\x1b[0m');  // Reset code
      
      // Test setLogLevel error case (line 303)
      logger.setLogLevel('error');
      expect(logger.logLevel).toBe(1);
      
      // Test step descriptions (lines 69-70, 72-73)
      const filenameContext = {
        page: 'test.html',
        steps: [{
          type: 'resolution',
          subType: 'filename',
          result: 'fallback.html'
        }],
        result: 'fallback.html'
      };
      
      const discoveryContext = {
        page: 'test.html',
        steps: [{
          type: 'discovery',
          result: 'found.html'
        }],
        result: 'found.html'
      };
      
      // Test step formatting directly
      const filenameStep = {
        type: 'default-layout',
        subType: 'filename',
        result: 'fallback.html',
        applied: true
      };
      
      const discoveryStep = {
        type: 'discovery',
        result: 'found.html',
        applied: true
      };
      
      const formattedFilename = logger._formatStepInfo(filenameStep);
      const formattedDiscovery = logger._formatStepInfo(discoveryStep);
      
      expect(formattedFilename).toContain('filename fallback');
      expect(formattedDiscovery).toContain('found "found.html"');
      
      // Captured logs may not have these since we're testing private methods
      // But the formatting should be correct
      expect(formattedFilename).toBeDefined();
      expect(formattedDiscovery).toBeDefined();
    });
  });
});