/**
 * CLI Args Parser Tests for --fail-on Option
 * Tests the --fail-on option parsing and validation
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ArgsParser } from '../../../src/cli/args-parser.js';

describe('ArgsParser --fail-on Option', () => {
  let parser;

  beforeEach(() => {
    parser = new ArgsParser();
  });

  describe('Parsing', () => {
    test('should_parse_single_fail_on_value', () => {
      const result = parser.parse(['build', '--fail-on', 'security']);
      
      expect(result.command).toBe('build');
      expect(result.failOn).toEqual(['security']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_multiple_fail_on_values', () => {
      const result = parser.parse(['build', '--fail-on', 'security', '--fail-on', 'warning']);
      
      expect(result.failOn).toEqual(['security', 'warning']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_comma_separated_fail_on_values', () => {
      const result = parser.parse(['build', '--fail-on', 'security,warning,error']);
      
      expect(result.failOn).toEqual(['security,warning,error']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_linter_rule_values', () => {
      const result = parser.parse(['build', '--fail-on', 'U001,U002,U003']);
      
      expect(result.failOn).toEqual(['U001,U002,U003']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_have_empty_default_value', () => {
      const result = parser.parse(['build']);
      
      expect(result.failOn).toEqual([]);
    });
  });

  describe('Validation', () => {
    test('should_accept_valid_security_value', () => {
      const result = parser.parse(['build', '--fail-on', 'security']);
      const validation = parser.validate(result);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should_accept_valid_warning_value', () => {
      const result = parser.parse(['build', '--fail-on', 'warning']);
      const validation = parser.validate(result);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should_accept_valid_error_value', () => {
      const result = parser.parse(['build', '--fail-on', 'error']);
      const validation = parser.validate(result);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should_accept_valid_linter_rules', () => {
      const result = parser.parse(['build', '--fail-on', 'U001']);
      const validation = parser.validate(result);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should_reject_invalid_value', () => {
      const result = parser.parse(['build', '--fail-on', 'invalid']);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid fail-on value: \'invalid\'');
    });

    test('should_reject_empty_value', () => {
      const result = parser.parse(['build', '--fail-on', '']);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Empty fail-on value not allowed');
    });

    test('should_reject_whitespace_only_value', () => {
      const result = parser.parse(['build', '--fail-on', '   ']);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Empty fail-on value not allowed');
    });

    test('should_validate_comma_separated_values', () => {
      const result = parser.parse(['build', '--fail-on', 'security,invalid,warning']);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid fail-on value: \'invalid\'');
    });

    test('should_accept_all_valid_comma_separated_values', () => {
      const result = parser.parse(['build', '--fail-on', 'security,warning,error,U001,U002']);
      
      expect(result.errors).toHaveLength(0);
    });

    test('should_show_valid_values_in_error_message', () => {
      const result = parser.parse(['build', '--fail-on', 'invalid']);
      
      expect(result.errors[0]).toContain('Valid values are: security, warning, error, U001, U002, U003, U004, U005, U006, U008');
    });
  });

  describe('Help Text', () => {
    test('should_include_fail_on_option_in_help', () => {
      const helpText = parser.getHelpText();
      
      expect(helpText).toContain('--fail-on <types>');
      expect(helpText).toContain('Fail build on specific issue types');
      expect(helpText).toContain('security,warning,error,U001-U008');
    });

    test('should_include_fail_on_examples_in_help', () => {
      const helpText = parser.getHelpText();
      
      expect(helpText).toContain('--fail-on security');
      expect(helpText).toContain('--fail-on security,warning');
    });
  });

  describe('Edge Cases', () => {
    test('should_handle_missing_value_gracefully', () => {
      const result = parser.parse(['build', '--fail-on']);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('requires a value');
    });

    test('should_handle_mixed_case_values', () => {
      const result = parser.parse(['build', '--fail-on', 'SECURITY']);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid fail-on value: \'SECURITY\'');
    });

    test('should_trim_whitespace_in_comma_separated_values', () => {
      const result = parser.parse(['build', '--fail-on', 'security, warning , error']);
      
      expect(result.errors).toHaveLength(0);
      expect(result.failOn).toEqual(['security, warning , error']);
    });
  });
});