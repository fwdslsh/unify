/**
 * Unit Tests for CLI Log Level Arguments
 * Tests CLI argument parsing for logging options (US-028)
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ArgsParser } from '../../../src/cli/args-parser.js';

describe('CLI Log Level Arguments', () => {
  let argsParser;
  let originalEnv;

  beforeEach(() => {
    argsParser = new ArgsParser();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Command Line Argument Parsing', () => {
    test('should_parse_log_level_option_correctly', () => {
      const result = argsParser.parse(['build', '--log-level', 'debug']);
      
      expect(result.logLevel).toBe('debug');
      expect(result.command).toBe('build');
      expect(result.errors).toHaveLength(0);
    });

    test('should_add_log_level_to_args_parser_options', () => {
      expect(argsParser.options.logLevel).toBeDefined();
      expect(argsParser.options.logLevel.hasValue).toBe(true);
      expect(argsParser.options.logLevel.default).toBe('info');
    });

    test('should_validate_log_level_values_during_parsing', () => {
      const validLevels = ['error', 'warn', 'info', 'debug'];
      
      for (const level of validLevels) {
        const result = argsParser.parse(['build', '--log-level', level]);
        expect(result.errors).toHaveLength(0);
        expect(result.logLevel).toBe(level);
      }
    });

    test('should_reject_invalid_log_level_values', () => {
      const invalidLevels = ['invalid', 'trace', 'verbose', '123', ''];
      
      for (const level of invalidLevels) {
        const result = argsParser.parse(['build', '--log-level', level]);
        expect(result.errors.length).toBeGreaterThan(0);
        // Check for either error message type
        const error = result.errors[0];
        const validErrorMessages = ['Invalid log level', 'Empty log level not allowed'];
        const hasValidError = validErrorMessages.some(msg => error.includes(msg));
        expect(hasValidError).toBe(true);
      }
    });

    test('should_support_both_long_and_short_log_level_names', () => {
      // Test full level names
      expect(argsParser.parse(['--log-level', 'error']).logLevel).toBe('error');
      expect(argsParser.parse(['--log-level', 'warn']).logLevel).toBe('warn');
      expect(argsParser.parse(['--log-level', 'info']).logLevel).toBe('info');
      expect(argsParser.parse(['--log-level', 'debug']).logLevel).toBe('debug');
      
      // Test abbreviated names
      expect(argsParser.parse(['--log-level', 'e']).logLevel).toBe('error');
      expect(argsParser.parse(['--log-level', 'w']).logLevel).toBe('warn');
      expect(argsParser.parse(['--log-level', 'i']).logLevel).toBe('info');
      expect(argsParser.parse(['--log-level', 'd']).logLevel).toBe('debug');
    });

    test('should_show_log_level_option_in_help_text', () => {
      const helpText = argsParser.getHelpText();
      
      expect(helpText).toContain('--log-level');
      expect(helpText).toContain('Set logging verbosity level');
      expect(helpText).toContain('error');
      expect(helpText).toContain('warn');
      expect(helpText).toContain('info');
      expect(helpText).toContain('debug');
    });

    test('should_require_value_for_log_level_option', () => {
      const result = argsParser.parse(['build', '--log-level']);
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('requires a value');
    });

    test('should_use_default_log_level_when_not_specified', () => {
      const result = argsParser.parse(['build']);
      
      expect(result.logLevel).toBe('info');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Environment Variable Integration', () => {
    test('should_respect_DEBUG_environment_variable', () => {
      process.env.DEBUG = '1';
      const result = argsParser.parse(['build']);
      
      // Parser should recognize DEBUG env and set appropriate log level
      expect(result.logLevel).toBe('debug');
    });

    test('should_respect_UNIFY_DEBUG_environment_variable', () => {
      process.env.UNIFY_DEBUG = '1';
      const result = argsParser.parse(['build']);
      
      expect(result.logLevel).toBe('debug');
    });

    test('should_respect_LOG_LEVEL_environment_variable', () => {
      process.env.LOG_LEVEL = 'warn';
      const result = argsParser.parse(['build']);
      
      expect(result.logLevel).toBe('warn');
    });

    test('should_prioritize_cli_option_over_environment_variables', () => {
      process.env.LOG_LEVEL = 'error';
      process.env.DEBUG = '1';
      
      const result = argsParser.parse(['build', '--log-level', 'info']);
      
      expect(result.logLevel).toBe('info');
    });

    test('should_prioritize_DEBUG_over_LOG_LEVEL_environment', () => {
      process.env.LOG_LEVEL = 'error';
      process.env.DEBUG = '1';
      
      const result = argsParser.parse(['build']);
      
      expect(result.logLevel).toBe('debug');
    });

    test('should_handle_malformed_LOG_LEVEL_values_gracefully', () => {
      process.env.LOG_LEVEL = 'invalid-level';
      
      const result = argsParser.parse(['build']);
      
      // Should fall back to default when environment has invalid value
      expect(result.logLevel).toBe('info');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Invalid LOG_LEVEL');
    });

    test('should_handle_empty_LOG_LEVEL_environment_variable', () => {
      process.env.LOG_LEVEL = '';
      
      const result = argsParser.parse(['build']);
      
      expect(result.logLevel).toBe('info');
    });
  });

  describe('Validation Integration', () => {
    test('should_validate_log_level_in_validation_phase', () => {
      const parsed = argsParser.parse(['build', '--log-level', 'debug']);
      const validation = argsParser.validate(parsed);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should_catch_invalid_log_levels_in_validation', () => {
      // Manually set invalid log level to test validation
      const parsed = {
        command: 'build',
        source: './src',
        output: './dist',
        logLevel: 'invalid-level',
        errors: [],
        warnings: []
      };
      
      const validation = argsParser.validate(parsed);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain('Invalid log level');
    });

    test('should_allow_log_level_option_with_all_commands', () => {
      const commands = ['build', 'serve', 'watch', 'init'];
      
      for (const command of commands) {
        const result = argsParser.parse([command, '--log-level', 'debug']);
        expect(result.errors).toHaveLength(0);
        expect(result.logLevel).toBe('debug');
        expect(result.command).toBe(command);
      }
    });

    test('should_not_show_warnings_for_log_level_with_init_command', () => {
      const result = argsParser.parse(['init', '--log-level', 'debug']);
      
      // log-level should be accepted for init command without warnings
      expect(result.warnings).toHaveLength(0);
      expect(result.logLevel).toBe('debug');
    });
  });

  describe('Help Text Integration', () => {
    test('should_include_log_level_in_global_options_section', () => {
      const helpText = argsParser.getHelpText();
      
      expect(helpText).toContain('Basic Options:');
      expect(helpText).toContain('--log-level <level>');
      expect(helpText).toContain('Set logging verbosity level');
    });

    test('should_show_available_log_levels_in_help', () => {
      const helpText = argsParser.getHelpText();
      
      expect(helpText).toContain('error');
      expect(helpText).toContain('warn');
      expect(helpText).toContain('info');
      expect(helpText).toContain('debug');
    });

    test('should_show_default_log_level_in_help', () => {
      const helpText = argsParser.getHelpText();
      
      expect(helpText).toContain('default: info');
    });

    test('should_include_log_level_examples_in_help', () => {
      const helpText = argsParser.getHelpText();
      
      expect(helpText).toContain('unify --log-level debug');
      expect(helpText).toContain('DEBUG=1 unify build');
    });
  });

  describe('Edge Cases', () => {
    test('should_handle_case_insensitive_log_levels', () => {
      const testCases = [
        ['DEBUG', 'debug'],
        ['Info', 'info'], 
        ['WARN', 'warn'],
        ['Error', 'error']
      ];
      
      for (const [input, expected] of testCases) {
        const result = argsParser.parse(['build', '--log-level', input]);
        expect(result.errors).toHaveLength(0);
        expect(result.logLevel).toBe(expected);
      }
    });

    test('should_handle_numeric_log_levels', () => {
      const numericLevels = ['0', '1', '2', '3', '4'];
      
      for (const level of numericLevels) {
        const result = argsParser.parse(['build', '--log-level', level]);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('Invalid log level');
      }
    });

    test('should_handle_multiple_log_level_options', () => {
      const result = argsParser.parse(['build', '--log-level', 'warn', '--log-level', 'debug']);
      
      // Last one should win
      expect(result.logLevel).toBe('debug');
      expect(result.errors).toHaveLength(0);
    });

    test('should_handle_log_level_with_equals_syntax', () => {
      const result = argsParser.parse(['build', '--log-level=debug']);
      
      expect(result.logLevel).toBe('debug');
      expect(result.errors).toHaveLength(0);
    });
  });
});