/**
 * Unit Tests for LayoutLogger
 * Tests US-019 layout resolution chain debugging/logging functionality
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LayoutLogger } from '../../../src/utils/layout-logger.js';

describe('LayoutLogger', () => {
  let logger;
  let originalConsole;
  let capturedLogs;

  beforeEach(() => {
    // Capture console output for testing
    capturedLogs = [];
    
    // Store original console methods
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
    
    logger = new LayoutLogger({
      enabled: true,
      logLevel: 3, // Debug level
      colors: false // Disable colors for easier testing
    });
  });

  afterEach(() => {
    // Restore console
    if (originalConsole) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
    }
  });

  describe('Construction and Configuration', () => {
    test('should_create_logger_with_default_options', () => {
      // Arrange & Act
      const defaultLogger = new LayoutLogger();
      
      // Assert
      expect(defaultLogger).toBeDefined();
      expect(defaultLogger.enabled).toBe(true);
    });

    test('should_create_logger_with_custom_options', () => {
      // Arrange
      const options = {
        enabled: false,
        logLevel: 1,
        prefix: '[CUSTOM]',
        colors: false
      };
      
      // Act
      const customLogger = new LayoutLogger(options);
      
      // Assert
      expect(customLogger.enabled).toBe(false);
      expect(customLogger.logLevel).toBe(1);
      expect(customLogger.prefix).toBe('[CUSTOM]');
      expect(customLogger.colors).toBe(false);
    });

    test('should_support_method_chaining_with_options', () => {
      // Arrange
      const baseLogger = new LayoutLogger({ prefix: '[BASE]' });
      
      // Act
      const newLogger = baseLogger.withOptions({ prefix: '[NEW]' });
      
      // Assert
      expect(baseLogger.prefix).toBe('[BASE]');
      expect(newLogger.prefix).toBe('[NEW]');
    });
  });

  describe('Log Level Management', () => {
    test('should_set_log_level_from_number', () => {
      // Arrange & Act
      logger.setLogLevel(2);
      
      // Assert
      expect(logger.logLevel).toBe(2);
    });

    test('should_set_log_level_from_string', () => {
      // Arrange & Act
      logger.setLogLevel('info');
      
      // Assert
      expect(logger.logLevel).toBe(2);
    });

    test('should_handle_invalid_log_level_gracefully', () => {
      // Arrange & Act
      logger.setLogLevel('invalid');
      
      // Assert
      expect(logger.logLevel).toBe(2); // Default to info
    });

    test('should_clamp_numeric_log_levels', () => {
      // Arrange & Act
      logger.setLogLevel(-1);
      expect(logger.logLevel).toBe(0);
      
      logger.setLogLevel(10);
      expect(logger.logLevel).toBe(3);
    });
  });

  describe('Layout Resolution Logging', () => {
    test('should_log_explicit_layout_resolution', () => {
      // Arrange
      const resolution = {
        filePath: 'src/test.html',
        source: 'explicit',
        reason: 'Explicit data-unify: _layout.html',
        precedenceApplied: 'explicit',
        processingTime: 5,
        resolutionChain: [
          { step: 1, type: 'explicit', result: '_layout.html', applied: true },
          { step: 2, type: 'default-layout', result: null, applied: false },
          { step: 3, type: 'discovery', result: null, applied: false }
        ]
      };
      
      // Act
      logger.logResolution(resolution);
      
      // Assert
      expect(capturedLogs.length).toBeGreaterThan(0);
      const allLogMessages = capturedLogs.map(log => log.args[0]).join(' ');
      expect(allLogMessages).toContain('Layout resolution for src/test.html');
      expect(allLogMessages).toContain('explicit');
    });

    test('should_log_default_pattern_resolution', () => {
      // Arrange
      const resolution = {
        filePath: 'src/blog/post.html',
        source: 'default-pattern',
        reason: 'Default pattern match: blog/** → _post.html',
        precedenceApplied: 'default-layout',
        processingTime: 3,
        resolutionChain: [
          { step: 1, type: 'explicit', result: null, applied: false },
          { step: 2, type: 'default-layout', subType: 'pattern', result: '_post.html', pattern: 'blog/**', applied: true },
          { step: 3, type: 'discovery', result: null, applied: false }
        ]
      };
      
      // Act
      logger.logResolution(resolution);
      
      // Assert
      const logMessages = capturedLogs.map(log => log.args[0]).join(' ');
      expect(logMessages).toContain('default-pattern');
      expect(logMessages).toContain('blog/**');
    });

    test('should_log_resolution_chain_at_debug_level', () => {
      // Arrange
      const resolution = {
        filePath: 'src/test.html',
        source: 'none',
        reason: 'No layout found',
        precedenceApplied: 'none',
        processingTime: 2,
        resolutionChain: [
          { step: 1, type: 'explicit', result: null, applied: false },
          { step: 2, type: 'default-layout', result: null, applied: false },
          { step: 3, type: 'discovery', result: null, applied: false }
        ]
      };
      
      // Act
      logger.logResolution(resolution);
      
      // Assert
      const debugLogs = capturedLogs.filter(log => log.args[0].includes('Resolution chain'));
      expect(debugLogs.length).toBeGreaterThan(0);
    });

    test('should_not_log_when_disabled', () => {
      // Arrange
      logger.setEnabled(false);
      const resolution = {
        filePath: 'src/test.html',
        source: 'none',
        reason: 'No layout found',
        precedenceApplied: 'none',
        processingTime: 1,
        resolutionChain: []
      };
      
      // Act
      logger.logResolution(resolution);
      
      // Assert
      expect(capturedLogs.length).toBe(0);
    });
  });

  describe('Default Layout Rules Logging', () => {
    test('should_log_pattern_rules', () => {
      // Arrange
      const rules = [
        { type: 'pattern', pattern: 'blog/**', layout: '_post.html' },
        { type: 'filename', layout: '_base.html' }
      ];
      
      // Act
      logger.logDefaultLayoutRules(rules);
      
      // Assert
      const logMessages = capturedLogs.map(log => log.args[0]).join(' ');
      expect(logMessages).toContain('Default layout rules configured');
      expect(logMessages).toContain('blog/**');
      expect(logMessages).toContain('_post.html');
      expect(logMessages).toContain('Filename fallback');
    });

    test('should_not_log_empty_rules', () => {
      // Arrange & Act
      logger.logDefaultLayoutRules([]);
      
      // Assert
      expect(capturedLogs.length).toBe(0);
    });
  });

  describe('Statistics Logging', () => {
    test('should_log_resolution_statistics', () => {
      // Arrange
      const stats = {
        explicitLayouts: 5,
        defaultPatternMatches: 10,
        defaultFilenameMatches: 3,
        discoveredLayouts: 2,
        noLayoutFiles: 1,
        cacheHits: 15,
        cacheMisses: 5
      };
      
      // Act
      logger.logStatistics(stats);
      
      // Assert
      const logMessages = capturedLogs.map(log => log.args[0]).join(' ');
      expect(logMessages).toContain('Layout resolution statistics');
      expect(logMessages).toContain('Explicit layouts: 5');
      expect(logMessages).toContain('Default pattern matches: 10');
      expect(logMessages).toContain('Cache hits: 15');
    });
  });

  describe('Error and Warning Logging', () => {
    test('should_log_warnings', () => {
      // Arrange & Act
      logger.logWarning('Layout file not found', 'src/test.html');
      
      // Assert
      expect(capturedLogs.length).toBeGreaterThan(0);
      const logMessage = capturedLogs.find(log => log.level === 'warn')?.args[0];
      expect(logMessage).toContain('Layout file not found');
      expect(logMessage).toContain('src/test.html');
    });

    test('should_log_errors', () => {
      // Arrange
      const error = new Error('Test error');
      
      // Act
      logger.logError('Failed to resolve layout', 'src/test.html', error);
      
      // Assert
      expect(capturedLogs.length).toBeGreaterThan(0);
      const errorLog = capturedLogs.find(log => log.level === 'error')?.args[0];
      expect(errorLog).toContain('Failed to resolve layout');
      expect(errorLog).toContain('src/test.html');
    });

    test('should_include_error_details_at_debug_level', () => {
      // Arrange
      const error = new Error('Detailed error message');
      error.stack = 'Error stack trace';
      
      // Act
      logger.logError('Error occurred', 'src/test.html', error);
      
      // Assert
      const logMessages = capturedLogs.map(log => log.args[0]).join(' ');
      expect(logMessages).toContain('Detailed error message');
    });
  });

  describe('Debug Logging', () => {
    test('should_log_debug_messages_at_debug_level', () => {
      // Arrange & Act
      logger.logDebug('Debug message', 'src/test.html');
      
      // Assert
      const debugLogs = capturedLogs.filter(log => log.args[0].includes('Debug message'));
      expect(debugLogs.length).toBeGreaterThan(0);
    });

    test('should_not_log_debug_at_lower_levels', () => {
      // Arrange
      logger.setLogLevel(2); // Info level
      
      // Act
      logger.logDebug('Debug message');
      
      // Assert
      const debugLogs = capturedLogs.filter(log => log.args[0].includes('Debug message'));
      expect(debugLogs.length).toBe(0);
    });
  });

  describe('Log Level Filtering', () => {
    test('should_respect_log_level_for_info_messages', () => {
      // Arrange
      logger.setLogLevel(1); // Warn/Error only
      const resolution = {
        filePath: 'src/test.html',
        source: 'none',
        reason: 'No layout found',
        precedenceApplied: 'none',
        processingTime: 1,
        resolutionChain: []
      };
      
      // Act
      logger.logResolution(resolution);
      
      // Assert
      expect(capturedLogs.length).toBe(0);
    });

    test('should_always_log_errors_regardless_of_level', () => {
      // Arrange
      logger.setLogLevel(0); // No logging
      
      // Act
      logger.logError('Critical error');
      
      // Assert
      expect(capturedLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Step Information Formatting', () => {
    test('should_format_explicit_step_info', () => {
      // Arrange
      const step = {
        step: 1,
        type: 'explicit',
        result: '_layout.html',
        applied: true
      };
      
      // Act
      const formatted = logger._formatStepInfo(step);
      
      // Assert
      expect(formatted).toContain('data-unify=');
      expect(formatted).toContain('_layout.html');
    });

    test('should_format_pattern_step_info', () => {
      // Arrange
      const step = {
        step: 2,
        type: 'default-layout',
        subType: 'pattern',
        result: '_post.html',
        pattern: 'blog/**',
        applied: true
      };
      
      // Act
      const formatted = logger._formatStepInfo(step);
      
      // Assert
      expect(formatted).toContain('pattern');
      expect(formatted).toContain('blog/**');
      expect(formatted).toContain('_post.html');
    });

    test('should_format_unapplied_step_info', () => {
      // Arrange
      const step = {
        step: 3,
        type: 'discovery',
        result: null,
        applied: false
      };
      
      // Act
      const formatted = logger._formatStepInfo(step);
      
      // Assert
      expect(formatted).toContain('not applied');
    });
  });

  describe('Environment Variable Integration', () => {
    test('should_respect_debug_environment_variable', () => {
      // Arrange
      const originalDebug = process.env.DEBUG;
      process.env.DEBUG = '1';
      
      try {
        // Act
        const debugLogger = new LayoutLogger();
        
        // Assert
        expect(debugLogger.logLevel).toBe(3);
      } finally {
        // Cleanup
        if (originalDebug !== undefined) {
          process.env.DEBUG = originalDebug;
        } else {
          delete process.env.DEBUG;
        }
      }
    });

    test('should_respect_log_level_environment_variable', () => {
      // Arrange
      const originalLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'warn';
      
      try {
        // Act
        const warnLogger = new LayoutLogger();
        
        // Assert
        expect(warnLogger.logLevel).toBe(1);
      } finally {
        // Cleanup
        if (originalLogLevel !== undefined) {
          process.env.LOG_LEVEL = originalLogLevel;
        } else {
          delete process.env.LOG_LEVEL;
        }
      }
    });
  });
});