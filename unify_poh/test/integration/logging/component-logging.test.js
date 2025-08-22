/**
 * Integration Tests for Component Logging
 * Tests logging integration across various unify components (US-028)
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { Logger, createLogger } from '../../../src/utils/logger.js';
import { ArgsParser } from '../../../src/cli/args-parser.js';

describe('Component Logging Integration', () => {
  let originalEnv;
  let originalConsole;
  let consoleOutputs;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Save original console methods
    originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error
    };
    
    // Setup console spies
    consoleOutputs = {
      log: [],
      warn: [],
      error: []
    };
    
    console.log = spyOn(console, 'log').mockImplementation((msg) => {
      consoleOutputs.log.push(msg);
    });
    console.warn = spyOn(console, 'warn').mockImplementation((msg) => {
      consoleOutputs.warn.push(msg);
    });
    console.error = spyOn(console, 'error').mockImplementation((msg) => {
      consoleOutputs.error.push(msg);
    });
  });

  afterEach(() => {
    // Restore environment  
    for (const key in process.env) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
    
    // Restore console methods
    if (originalConsole.log) console.log = originalConsole.log;
    if (originalConsole.warn) console.warn = originalConsole.warn;
    if (originalConsole.error) console.error = originalConsole.error;
  });

  describe('CLI Integration with Logging', () => {
    test('should_create_logger_based_on_cli_args', () => {
      const argsParser = new ArgsParser();
      const parsed = argsParser.parse(['build', '--log-level', 'debug']);
      
      expect(parsed.logLevel).toBe('debug');
      
      // Create logger with CLI options
      const logger = new Logger({ logLevel: parsed.logLevel });
      
      expect(logger.logLevel).toBe('debug');
      expect(logger.isLevelEnabled('debug')).toBe(true);
      expect(logger.isLevelEnabled('info')).toBe(true);
      expect(logger.isLevelEnabled('warn')).toBe(true);
      expect(logger.isLevelEnabled('error')).toBe(true);
    });

    test('should_respect_environment_variables_in_cli_integration', () => {
      process.env.DEBUG = '1';
      
      const argsParser = new ArgsParser();
      const parsed = argsParser.parse(['build']);
      
      expect(parsed.logLevel).toBe('debug');
      
      const logger = new Logger({ logLevel: parsed.logLevel });
      logger.debug('Debug message from environment');
      
      expect(consoleOutputs.log).toHaveLength(1);
      expect(consoleOutputs.log[0]).toContain('Debug message from environment');
    });

    test('should_override_environment_with_cli_args', () => {
      process.env.LOG_LEVEL = 'error';
      
      const argsParser = new ArgsParser();
      const parsed = argsParser.parse(['build', '--log-level', 'info']);
      
      expect(parsed.logLevel).toBe('info');
      
      const logger = new Logger({ logLevel: parsed.logLevel });
      
      logger.info('Info message');
      logger.debug('Debug message');
      
      expect(consoleOutputs.log).toHaveLength(1); // Only info, not debug
      expect(consoleOutputs.log[0]).toContain('Info message');
    });
  });

  describe('Component-Specific Loggers', () => {
    test('should_create_component_specific_loggers', () => {
      const fileProcessor = createLogger('FILE_PROCESSOR', { logLevel: 'debug' });
      const buildCache = createLogger('BUILD_CACHE', { logLevel: 'debug' });
      const assetTracker = createLogger('ASSET_TRACKER', { logLevel: 'debug' });
      
      fileProcessor.info('Processing file', { filePath: '/src/test.html' });
      buildCache.debug('Cache hit', { key: 'layout_discovery' });
      assetTracker.warn('Asset not found', { asset: '/images/missing.png' });
      
      expect(consoleOutputs.log).toHaveLength(2); // info + debug
      expect(consoleOutputs.warn).toHaveLength(1);
      
      // Check component names in output
      expect(consoleOutputs.log[0]).toContain('[FILE_PROCESSOR]');
      expect(consoleOutputs.log[1]).toContain('[BUILD_CACHE]');
      expect(consoleOutputs.warn[0]).toContain('[ASSET_TRACKER]');
    });

    test('should_log_structured_context_across_components', () => {
      const processor = createLogger('PROCESSOR', { logLevel: 'debug' });
      
      // Simulate processing multiple files with context
      const files = [
        { filePath: '/src/index.html', operation: 'build', duration: 25 },
        { filePath: '/src/about.md', operation: 'markdown', duration: 45 },
        { filePath: '/src/blog/post.html', operation: 'layout-discovery', duration: 15 }
      ];
      
      for (const file of files) {
        processor.info('File processed', file);
      }
      
      expect(consoleOutputs.log).toHaveLength(3);
      
      // Check structured context in logs
      expect(consoleOutputs.log[0]).toContain('file=/src/index.html');
      expect(consoleOutputs.log[0]).toContain('op=build');
      expect(consoleOutputs.log[0]).toContain('duration=25ms');
      
      expect(consoleOutputs.log[1]).toContain('file=/src/about.md');
      expect(consoleOutputs.log[1]).toContain('op=markdown');
      
      expect(consoleOutputs.log[2]).toContain('file=/src/blog/post.html');
      expect(consoleOutputs.log[2]).toContain('op=layout-discovery');
    });
  });

  describe('Build Process Logging Simulation', () => {
    test('should_log_build_process_flow_at_different_levels', () => {
      const buildLogger = createLogger('BUILD', { logLevel: 'debug' });
      
      // Simulate build process
      buildLogger.info('Build started', { source: './src', output: './dist' });
      
      buildLogger.debug('Scanning source directory', { 
        operation: 'scan',
        target: './src'
      });
      
      buildLogger.debug('File classified', {
        filePath: './src/index.html',
        classification: 'EMIT',
        reason: 'renderable(html)'
      });
      
      buildLogger.warn('Layout not found', {
        filePath: './src/blog/post.md',
        layout: '_post.html',
        fallback: '_layout.html'
      });
      
      buildLogger.info('Build completed', {
        fileCount: 15,
        duration: 234,
        output: './dist'
      });
      
      // Verify log levels and content
      expect(consoleOutputs.log).toHaveLength(4); // 2 info + 2 debug
      expect(consoleOutputs.warn).toHaveLength(1);
      
      // Check build flow logging
      expect(consoleOutputs.log[0]).toContain('Build started');
      expect(consoleOutputs.log[1]).toContain('Scanning source directory');
      expect(consoleOutputs.log[2]).toContain('File classified');
      expect(consoleOutputs.log[3]).toContain('Build completed');
      expect(consoleOutputs.log[3]).toContain('15 files');
      expect(consoleOutputs.log[3]).toContain('234ms');
      
      expect(consoleOutputs.warn[0]).toContain('Layout not found');
    });

    test('should_suppress_debug_logs_at_info_level', () => {
      const buildLogger = createLogger('BUILD', { logLevel: 'info' });
      
      buildLogger.debug('Debug message should not appear');
      buildLogger.info('Info message should appear');
      buildLogger.warn('Warning message should appear');
      buildLogger.error('Error message should appear');
      
      expect(consoleOutputs.log).toHaveLength(1); // Only info
      expect(consoleOutputs.warn).toHaveLength(1);
      expect(consoleOutputs.error).toHaveLength(1);
      
      expect(consoleOutputs.log[0]).toContain('Info message should appear');
      expect(consoleOutputs.warn[0]).toContain('Warning message should appear');
      expect(consoleOutputs.error[0]).toContain('Error message should appear');
    });
  });

  describe('Error and Warning Logging', () => {
    test('should_log_security_warnings_with_proper_format', () => {
      const securityLogger = createLogger('SECURITY', { logLevel: 'warn' });
      
      securityLogger.warn('[SECURITY] XSS Risk: Event handler detected', {
        filePath: 'src/page.html',
        line: 15,
        element: '<meta>'
      });
      
      securityLogger.warn('[SECURITY] JavaScript URL: Potential XSS vector', {
        filePath: 'src/components/nav.html',
        line: 8,
        attribute: 'href'
      });
      
      expect(consoleOutputs.warn).toHaveLength(2);
      expect(consoleOutputs.warn[0]).toContain('[SECURITY]');
      expect(consoleOutputs.warn[0]).toContain('XSS Risk');
      expect(consoleOutputs.warn[0]).toContain('src/page.html');
      
      expect(consoleOutputs.warn[1]).toContain('[SECURITY]');
      expect(consoleOutputs.warn[1]).toContain('JavaScript URL');
    });

    test('should_log_linter_warnings_with_rule_codes', () => {
      const linterLogger = createLogger('LINTER', { logLevel: 'debug' });
      
      linterLogger.warn('U002: Duplicate area class found', {
        filePath: 'src/layout.html',
        rule: 'area-unique-in-scope',
        class: '.unify-hero'
      });
      
      linterLogger.debug('U005: Documented area not used', {
        filePath: 'src/_layout.html',
        rule: 'docs-drift',
        class: '.unify-sidebar'
      });
      
      expect(consoleOutputs.warn).toHaveLength(1);
      expect(consoleOutputs.log).toHaveLength(1);
      
      expect(consoleOutputs.warn[0]).toContain('U002');
      expect(consoleOutputs.warn[0]).toContain('area-unique-in-scope');
      expect(consoleOutputs.log[0]).toContain('U005');
      expect(consoleOutputs.log[0]).toContain('docs-drift');
    });
  });

  describe('Performance and Timing Logging', () => {
    test('should_log_timing_information_consistently', () => {
      const perfLogger = createLogger('PERF', { logLevel: 'debug' });
      
      // Simulate operations with timing
      perfLogger.debug('Operation started', { operation: 'file-processing' });
      
      // Simulate some work
      const start = Date.now();
      // Simulate 10ms work
      while (Date.now() - start < 10) {
        // busy wait
      }
      const duration = Date.now() - start;
      
      perfLogger.info('Operation completed', { 
        operation: 'file-processing',
        duration: duration,
        fileCount: 5
      });
      
      expect(consoleOutputs.log).toHaveLength(2);
      expect(consoleOutputs.log[1]).toContain('duration=');
      expect(consoleOutputs.log[1]).toContain('ms');
      expect(consoleOutputs.log[1]).toContain('5 files');
    });

    test('should_handle_large_amounts_of_debug_output_efficiently', () => {
      const debugLogger = createLogger('DEBUG_TEST', { logLevel: 'debug' });
      
      // Generate many debug messages
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        debugLogger.debug(`Debug message ${i}`, { 
          iteration: i,
          filePath: `/src/file${i}.html`
        });
      }
      const duration = Date.now() - start;
      
      expect(consoleOutputs.log).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
      
      // Check first and last messages
      expect(consoleOutputs.log[0]).toContain('Debug message 0');
      expect(consoleOutputs.log[99]).toContain('Debug message 99');
    });
  });

  describe('Child Logger Functionality', () => {
    test('should_create_child_loggers_with_inherited_settings', () => {
      const parentLogger = new Logger({ 
        logLevel: 'debug',
        component: 'PARENT'
      });
      
      const childLogger = parentLogger.child('CHILD');
      const grandchildLogger = childLogger.child('GRANDCHILD');
      
      parentLogger.info('Parent message');
      childLogger.info('Child message');
      grandchildLogger.info('Grandchild message');
      
      expect(consoleOutputs.log).toHaveLength(3);
      expect(consoleOutputs.log[0]).toContain('[PARENT]');
      expect(consoleOutputs.log[1]).toContain('[CHILD]');
      expect(consoleOutputs.log[2]).toContain('[GRANDCHILD]');
      
      // All should have same log level capabilities
      expect(parentLogger.logLevel).toBe('debug');
      expect(childLogger.logLevel).toBe('debug');
      expect(grandchildLogger.logLevel).toBe('debug');
    });

    test('should_allow_child_logger_customization', () => {
      const parentLogger = new Logger({ logLevel: 'info' });
      const childLogger = parentLogger.child('CHILD', { logLevel: 'debug' });
      
      parentLogger.debug('Parent debug - should not show');
      childLogger.debug('Child debug - should show');
      
      expect(consoleOutputs.log).toHaveLength(1);
      expect(consoleOutputs.log[0]).toContain('[CHILD]');
      expect(consoleOutputs.log[0]).toContain('Child debug - should show');
    });
  });
});