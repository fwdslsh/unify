/**
 * Unit Tests for Logger Class
 * Tests comprehensive logging functionality for US-028
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { Logger } from '../../../src/utils/logger.js';

describe('Logger', () => {
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
    process.env = originalEnv;
    
    // Restore console methods
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  describe('Logger Initialization', () => {
    test('should_create_logger_with_default_settings_when_no_options_provided', () => {
      const logger = new Logger();
      
      expect(logger.enabled).toBe(true);
      expect(logger.logLevel).toBe('info');
      expect(logger.component).toBe('UNIFY');
    });

    test('should_create_logger_with_custom_options_when_options_provided', () => {
      const logger = new Logger({
        enabled: false,
        logLevel: 'debug',
        component: 'TEST',
        colors: false
      });
      
      expect(logger.enabled).toBe(false);
      expect(logger.logLevel).toBe('debug');
      expect(logger.component).toBe('TEST');
      expect(logger.colors).toBe(false);
    });

    test('should_detect_log_level_from_environment_variables', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = new Logger();
      
      expect(logger.logLevel).toBe('debug');
    });

    test('should_detect_debug_mode_from_DEBUG_environment_variable', () => {
      process.env.DEBUG = '1';
      const logger = new Logger();
      
      expect(logger.logLevel).toBe('debug');
    });

    test('should_detect_debug_mode_from_UNIFY_DEBUG_environment_variable', () => {
      process.env.UNIFY_DEBUG = '1';
      const logger = new Logger();
      
      expect(logger.logLevel).toBe('debug');
    });

    test('should_disable_colors_when_NO_COLOR_environment_set', () => {
      process.env.NO_COLOR = '1';
      const logger = new Logger();
      
      expect(logger.colors).toBe(false);
    });

    test('should_enable_colors_when_terminal_supports_them', () => {
      // Mock TTY detection
      const originalIsTTY = process.stdout.isTTY;
      process.stdout.isTTY = true;
      delete process.env.NO_COLOR;
      process.env.TERM = 'xterm-256color';
      
      const logger = new Logger();
      
      expect(logger.colors).toBe(true);
      
      // Restore
      process.stdout.isTTY = originalIsTTY;
    });
  });

  describe('Log Level Management', () => {
    test('should_set_log_level_error_when_environment_LOG_LEVEL_is_error', () => {
      process.env.LOG_LEVEL = 'error';
      const logger = new Logger();
      
      expect(logger.logLevel).toBe('error');
    });

    test('should_set_log_level_warn_when_environment_LOG_LEVEL_is_warn', () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = new Logger();
      
      expect(logger.logLevel).toBe('warn');
    });

    test('should_set_log_level_info_when_environment_LOG_LEVEL_is_info', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = new Logger();
      
      expect(logger.logLevel).toBe('info');
    });

    test('should_set_log_level_debug_when_environment_LOG_LEVEL_is_debug', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = new Logger();
      
      expect(logger.logLevel).toBe('debug');
    });

    test('should_override_log_level_when_DEBUG_environment_variable_set', () => {
      process.env.LOG_LEVEL = 'error';
      process.env.DEBUG = '1';
      const logger = new Logger();
      
      expect(logger.logLevel).toBe('debug');
    });

    test('should_use_numeric_log_levels_correctly', () => {
      const logger = new Logger();
      
      expect(logger.getLogLevelValue('error')).toBe(1);
      expect(logger.getLogLevelValue('warn')).toBe(2);
      expect(logger.getLogLevelValue('info')).toBe(3);
      expect(logger.getLogLevelValue('debug')).toBe(4);
    });

    test('should_validate_log_level_bounds_when_setting_numeric_values', () => {
      const logger = new Logger();
      
      logger.setLogLevel(0);
      expect(logger.logLevel).toBe('none');
      
      logger.setLogLevel(5);
      expect(logger.logLevel).toBe('debug');
      
      logger.setLogLevel(-1);
      expect(logger.logLevel).toBe('none');
    });
  });

  describe('Message Formatting', () => {
    test('should_format_error_messages_with_red_color_when_colors_enabled', () => {
      const logger = new Logger({ colors: true });
      logger.error('Test error message');
      
      const output = consoleOutputs.error[0];
      expect(output).toContain('\x1b[31m'); // Red color code
      expect(output).toContain('[ERROR]');
      expect(output).toContain('Test error message');
    });

    test('should_format_warn_messages_with_yellow_color_when_colors_enabled', () => {
      const logger = new Logger({ colors: true });
      logger.warn('Test warning message');
      
      const output = consoleOutputs.warn[0];
      expect(output).toContain('\x1b[33m'); // Yellow color code
      expect(output).toContain('[WARN]');
      expect(output).toContain('Test warning message');
    });

    test('should_format_info_messages_with_blue_color_when_colors_enabled', () => {
      const logger = new Logger({ colors: true });
      logger.info('Test info message');
      
      const output = consoleOutputs.log[0];
      expect(output).toContain('\x1b[34m'); // Blue color code
      expect(output).toContain('[INFO]');
      expect(output).toContain('Test info message');
    });

    test('should_format_debug_messages_with_gray_color_when_colors_enabled', () => {
      const logger = new Logger({ colors: true, logLevel: 'debug' });
      logger.debug('Test debug message');
      
      const output = consoleOutputs.log[0];
      expect(output).toContain('\x1b[90m'); // Gray color code
      expect(output).toContain('[DEBUG]');
      expect(output).toContain('Test debug message');
    });

    test('should_include_timestamp_in_log_messages', () => {
      const logger = new Logger();
      logger.info('Test message');
      
      const output = consoleOutputs.log[0];
      // Should contain ISO timestamp format
      expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('should_include_level_tag_in_log_messages', () => {
      const logger = new Logger();
      logger.info('Test message');
      
      const output = consoleOutputs.log[0];
      expect(output).toContain('[INFO]');
    });

    test('should_include_component_prefix_in_log_messages', () => {
      const logger = new Logger({ component: 'TEST_COMPONENT' });
      logger.info('Test message');
      
      const output = consoleOutputs.log[0];
      expect(output).toContain('[TEST_COMPONENT]');
    });

    test('should_format_messages_without_colors_when_colors_disabled', () => {
      const logger = new Logger({ colors: false });
      logger.error('Test error message');
      
      const output = consoleOutputs.error[0];
      expect(output).not.toContain('\x1b['); // No color codes
      expect(output).toContain('[ERROR]');
      expect(output).toContain('Test error message');
    });
  });

  describe('Log Level Filtering', () => {
    test('should_output_error_messages_at_error_level', () => {
      const logger = new Logger({ logLevel: 'error' });
      
      logger.error('Error message');
      logger.warn('Warn message');
      logger.info('Info message');
      logger.debug('Debug message');
      
      expect(consoleOutputs.error).toHaveLength(1);
      expect(consoleOutputs.warn).toHaveLength(0);
      expect(consoleOutputs.log).toHaveLength(0);
    });

    test('should_output_warn_and_error_messages_at_warn_level', () => {
      const logger = new Logger({ logLevel: 'warn' });
      
      logger.error('Error message');
      logger.warn('Warn message');
      logger.info('Info message');
      logger.debug('Debug message');
      
      expect(consoleOutputs.error).toHaveLength(1);
      expect(consoleOutputs.warn).toHaveLength(1);
      expect(consoleOutputs.log).toHaveLength(0);
    });

    test('should_output_info_warn_and_error_messages_at_info_level', () => {
      const logger = new Logger({ logLevel: 'info' });
      
      logger.error('Error message');
      logger.warn('Warn message');
      logger.info('Info message');
      logger.debug('Debug message');
      
      expect(consoleOutputs.error).toHaveLength(1);
      expect(consoleOutputs.warn).toHaveLength(1);
      expect(consoleOutputs.log).toHaveLength(1);
    });

    test('should_output_all_messages_at_debug_level', () => {
      const logger = new Logger({ logLevel: 'debug' });
      
      logger.error('Error message');
      logger.warn('Warn message');
      logger.info('Info message');
      logger.debug('Debug message');
      
      expect(consoleOutputs.error).toHaveLength(1);
      expect(consoleOutputs.warn).toHaveLength(1);
      expect(consoleOutputs.log).toHaveLength(2); // info + debug
    });

    test('should_suppress_all_messages_when_level_is_none', () => {
      const logger = new Logger({ logLevel: 'none' });
      
      logger.error('Error message');
      logger.warn('Warn message');
      logger.info('Info message');
      logger.debug('Debug message');
      
      expect(consoleOutputs.error).toHaveLength(0);
      expect(consoleOutputs.warn).toHaveLength(0);
      expect(consoleOutputs.log).toHaveLength(0);
    });

    test('should_not_output_debug_when_level_is_info', () => {
      const logger = new Logger({ logLevel: 'info' });
      
      logger.debug('Debug message');
      
      expect(consoleOutputs.log).toHaveLength(0);
    });

    test('should_not_output_info_when_level_is_warn', () => {
      const logger = new Logger({ logLevel: 'warn' });
      
      logger.info('Info message');
      
      expect(consoleOutputs.log).toHaveLength(0);
    });
  });

  describe('Structured Logging', () => {
    test('should_log_structured_data_with_context_information', () => {
      const logger = new Logger({ logLevel: 'debug' });
      
      const context = {
        filePath: '/src/test.html',
        operation: 'build',
        duration: 150
      };
      
      logger.info('File processed', context);
      
      const output = consoleOutputs.log[0];
      expect(output).toContain('File processed');
      expect(output).toContain('/src/test.html');
      expect(output).toContain('build');
      expect(output).toContain('150');
    });

    test('should_include_file_paths_in_log_messages_when_provided', () => {
      const logger = new Logger();
      
      logger.info('Processing file', { filePath: '/src/components/header.html' });
      
      const output = consoleOutputs.log[0];
      expect(output).toContain('/src/components/header.html');
    });

    test('should_include_operation_context_in_log_messages', () => {
      const logger = new Logger({ logLevel: 'debug' });
      
      logger.debug('Operation started', { 
        operation: 'layout-discovery',
        target: 'blog/post.md'
      });
      
      expect(consoleOutputs.log).toHaveLength(1);
      const output = consoleOutputs.log[0];
      expect(output).toContain('layout-discovery');
      expect(output).toContain('blog/post.md');
    });

    test('should_format_timing_information_consistently', () => {
      const logger = new Logger();
      
      logger.info('Build completed', { 
        duration: 1234,
        fileCount: 42
      });
      
      const output = consoleOutputs.log[0];
      expect(output).toContain('1234ms');
      expect(output).toContain('42 files');
    });

    test('should_handle_undefined_or_null_context_gracefully', () => {
      const logger = new Logger();
      
      logger.info('Message with no context');
      logger.info('Message with null context', null);
      logger.info('Message with undefined context', undefined);
      
      expect(consoleOutputs.log).toHaveLength(3);
      expect(() => {
        logger.info('Safe message', null);
      }).not.toThrow();
    });
  });

  describe('Logger Error Handling', () => {
    test('should_handle_console_output_errors_gracefully', () => {
      const logger = new Logger();
      
      // Mock console.log to throw an error
      console.log.mockImplementation(() => {
        throw new Error('Console output failed');
      });
      
      expect(() => {
        logger.info('Test message');
      }).not.toThrow();
    });

    test('should_continue_operation_when_logging_fails', () => {
      const logger = new Logger();
      
      // Mock console methods to fail
      console.log.mockImplementation(() => {
        throw new Error('Logging failed');
      });
      console.warn.mockImplementation(() => {
        throw new Error('Logging failed');
      });
      console.error.mockImplementation(() => {
        throw new Error('Logging failed');
      });
      
      expect(() => {
        logger.error('Error message');
        logger.warn('Warning message');
        logger.info('Info message');
        logger.debug('Debug message');
      }).not.toThrow();
    });

    test('should_validate_log_message_parameters_safely', () => {
      const logger = new Logger();
      
      expect(() => {
        logger.info(); // No message
        logger.info(null); // Null message
        logger.info(undefined); // Undefined message
        logger.info({}); // Object as message
        logger.info([]); // Array as message
      }).not.toThrow();
    });
  });

  describe('Logger Utility Methods', () => {
    test('should_create_child_logger_with_inherited_settings', () => {
      const parentLogger = new Logger({ 
        logLevel: 'debug',
        colors: false,
        component: 'PARENT'
      });
      
      const childLogger = parentLogger.child('CHILD');
      
      expect(childLogger.logLevel).toBe('debug');
      expect(childLogger.colors).toBe(false);
      expect(childLogger.component).toBe('CHILD');
    });

    test('should_enable_and_disable_logging_dynamically', () => {
      const logger = new Logger();
      
      logger.info('Should log');
      expect(consoleOutputs.log).toHaveLength(1);
      
      logger.setEnabled(false);
      logger.info('Should not log');
      expect(consoleOutputs.log).toHaveLength(1);
      
      logger.setEnabled(true);
      logger.info('Should log again');
      expect(consoleOutputs.log).toHaveLength(2);
    });

    test('should_change_log_level_dynamically', () => {
      const logger = new Logger({ logLevel: 'info' });
      
      logger.debug('Should not log');
      expect(consoleOutputs.log).toHaveLength(0);
      
      logger.setLogLevel('debug');
      logger.debug('Should log now');
      expect(consoleOutputs.log).toHaveLength(1);
    });

    test('should_check_if_level_is_enabled', () => {
      const logger = new Logger({ logLevel: 'info' });
      
      expect(logger.isLevelEnabled('error')).toBe(true);
      expect(logger.isLevelEnabled('warn')).toBe(true);
      expect(logger.isLevelEnabled('info')).toBe(true);
      expect(logger.isLevelEnabled('debug')).toBe(false);
    });
  });
});