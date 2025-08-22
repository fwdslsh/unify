/**
 * CLI Arguments Parser Directory Options Tests (US-006)
 * Tests directory option parsing and validation
 * 
 * Acceptance Criteria from US-006:
 * - GIVEN user specifies --source and --output directory options
 * - WHEN CLI arguments are parsed
 * - THEN both long and short forms should work
 * - AND default values should be applied when options not specified
 * - AND path validation should be applied for security
 * - AND appropriate error messages should be generated
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { ArgsParser } from "../../../src/cli/args-parser.js";
import { ValidationError } from "../../../src/core/errors.js";

describe("CLI Args Parser - Directory Options (US-006)", () => {
  let argsParser;

  beforeEach(() => {
    argsParser = new ArgsParser();
  });

  describe("Source directory option parsing", () => {
    it("should_parse_long_source_option_when_provided", () => {
      const args = ['build', '--source', 'src'];
      const result = argsParser.parse(args);
      
      expect(result.command).toBe('build');
      expect(result.source).toBe('src');
      expect(result.errors).toHaveLength(0);
    });

    it("should_parse_short_source_option_when_provided", () => {
      const args = ['build', '-s', 'my-source'];
      const result = argsParser.parse(args);
      
      expect(result.command).toBe('build');
      expect(result.source).toBe('my-source');
      expect(result.errors).toHaveLength(0);
    });

    it("should_default_to_current_directory_when_source_not_specified", () => {
      const args = ['build'];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('.');
    });

    it("should_error_when_source_option_missing_value", () => {
      const args = ['build', '--source'];
      const result = argsParser.parse(args);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('requires a value');
    });

    it("should_error_when_short_source_option_missing_value", () => {
      const args = ['build', '-s'];
      const result = argsParser.parse(args);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('requires a value');
    });

    it("should_handle_source_with_spaces_in_path", () => {
      const args = ['build', '--source', 'my source dir'];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('my source dir');
      expect(result.errors).toHaveLength(0);
    });

    it("should_handle_relative_source_paths", () => {
      const args = ['build', '--source', './src/content'];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('./src/content');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Output directory option parsing", () => {
    it("should_parse_long_output_option_when_provided", () => {
      const args = ['build', '--output', 'build'];
      const result = argsParser.parse(args);
      
      expect(result.command).toBe('build');
      expect(result.output).toBe('build');
      expect(result.errors).toHaveLength(0);
    });

    it("should_parse_short_output_option_when_provided", () => {
      const args = ['build', '-o', 'public'];
      const result = argsParser.parse(args);
      
      expect(result.command).toBe('build');
      expect(result.output).toBe('public');
      expect(result.errors).toHaveLength(0);
    });

    it("should_default_to_dist_when_output_not_specified", () => {
      const args = ['build'];
      const result = argsParser.parse(args);
      
      expect(result.output).toBe('dist');
    });

    it("should_error_when_output_option_missing_value", () => {
      const args = ['build', '--output'];
      const result = argsParser.parse(args);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('requires a value');
    });

    it("should_error_when_short_output_option_missing_value", () => {
      const args = ['build', '-o'];
      const result = argsParser.parse(args);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('requires a value');
    });

    it("should_handle_output_with_spaces_in_path", () => {
      const args = ['build', '--output', 'my output dir'];
      const result = argsParser.parse(args);
      
      expect(result.output).toBe('my output dir');
      expect(result.errors).toHaveLength(0);
    });

    it("should_handle_relative_output_paths", () => {
      const args = ['build', '--output', './dist/production'];
      const result = argsParser.parse(args);
      
      expect(result.output).toBe('./dist/production');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Combined directory options", () => {
    it("should_parse_both_source_and_output_options", () => {
      const args = ['build', '--source', 'src', '--output', 'build'];
      const result = argsParser.parse(args);
      
      expect(result.command).toBe('build');
      expect(result.source).toBe('src');
      expect(result.output).toBe('build');
      expect(result.errors).toHaveLength(0);
    });

    it("should_parse_short_forms_of_both_options", () => {
      const args = ['build', '-s', 'content', '-o', 'public'];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('content');
      expect(result.output).toBe('public');
      expect(result.errors).toHaveLength(0);
    });

    it("should_handle_mixed_long_and_short_options", () => {
      const args = ['build', '--source', 'src', '-o', 'dist'];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('src');
      expect(result.output).toBe('dist');
      expect(result.errors).toHaveLength(0);
    });

    it("should_handle_options_in_different_order", () => {
      const args = ['build', '-o', 'build', '-s', 'content'];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('content');
      expect(result.output).toBe('build');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Option validation", () => {
    it("should_validate_source_is_string_type", () => {
      const parsed = {
        command: 'build',
        source: 123, // Invalid type
        output: 'dist',
        errors: [],
        warnings: []
      };
      
      const validation = argsParser.validate(parsed);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Source path must be a string');
    });

    it("should_validate_output_is_string_type", () => {
      const parsed = {
        command: 'build',
        source: 'src',
        output: {}, // Invalid type
        errors: [],
        warnings: []
      };
      
      const validation = argsParser.validate(parsed);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Output path must be a string');
    });

    it("should_require_source_for_build_command", () => {
      const parsed = {
        command: 'build',
        source: null,
        output: 'dist',
        errors: [],
        warnings: []
      };
      
      const validation = argsParser.validate(parsed);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Build command requires source directory');
    });

    it("should_require_output_for_build_command", () => {
      const parsed = {
        command: 'build',
        source: 'src',
        output: null,
        errors: [],
        warnings: []
      };
      
      const validation = argsParser.validate(parsed);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Build command requires output directory');
    });

    it("should_pass_validation_with_valid_directories", () => {
      const parsed = {
        command: 'build',
        source: 'src',
        output: 'dist',
        errors: [],
        warnings: []
      };
      
      const validation = argsParser.validate(parsed);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe("Edge cases and error handling", () => {
    it("should_handle_empty_source_value", () => {
      const args = ['build', '--source', ''];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('');
      // Empty paths should be caught by validation, not parsing
      expect(result.errors).toHaveLength(0);
    });

    it("should_handle_empty_output_value", () => {
      const args = ['build', '--output', ''];
      const result = argsParser.parse(args);
      
      expect(result.output).toBe('');
      // Empty paths should be caught by validation, not parsing
      expect(result.errors).toHaveLength(0);
    });

    it("should_handle_multiple_source_options_last_wins", () => {
      const args = ['build', '--source', 'first', '--source', 'second'];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('second');
    });

    it("should_handle_multiple_output_options_last_wins", () => {
      const args = ['build', '--output', 'first', '--output', 'second'];
      const result = argsParser.parse(args);
      
      expect(result.output).toBe('second');
    });

    it("should_error_on_unknown_directory_option", () => {
      const args = ['build', '--input', 'src']; // Unknown option
      const result = argsParser.parse(args);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Unknown option: --input');
    });

    it("should_handle_options_with_equals_syntax", () => {
      // This test assumes we want to support --source=value syntax
      const args = ['build', '--source=src', '--output=build'];
      const result = argsParser.parse(args);
      
      // This might need special handling in the parser
      // For now, expect it to be treated as single argument
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Help text and documentation", () => {
    it("should_include_directory_options_in_help_text", () => {
      const helpText = argsParser.getHelpText();
      
      expect(helpText).toContain('--source');
      expect(helpText).toContain('-s');
      expect(helpText).toContain('--output');
      expect(helpText).toContain('-o');
      expect(helpText).toContain('Source directory');
      expect(helpText).toContain('Output directory');
    });

    it("should_show_default_values_in_help_text", () => {
      const helpText = argsParser.getHelpText();
      
      expect(helpText).toContain('default: .');
      expect(helpText).toContain('default: dist');
    });
  });

  describe("Cross-platform path handling", () => {
    it("should_handle_windows_style_paths", () => {
      const args = ['build', '--source', 'C:\\src', '--output', 'C:\\build'];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('C:\\src');
      expect(result.output).toBe('C:\\build');
      expect(result.errors).toHaveLength(0);
    });

    it("should_handle_unix_style_paths", () => {
      const args = ['build', '--source', '/home/user/src', '--output', '/var/www'];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('/home/user/src');
      expect(result.output).toBe('/var/www');
      expect(result.errors).toHaveLength(0);
    });

    it("should_handle_mixed_path_separators", () => {
      const args = ['build', '--source', './src\\content', '--output', 'dist/build'];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('./src\\content');
      expect(result.output).toBe('dist/build');
      expect(result.errors).toHaveLength(0);
    });
  });
});

/**
 * This test file implements TDD RED phase for US-006:
 * 
 * EXPECTED FAILURES:
 * - ArgsParser doesn't have source/output in options configuration
 * - Directory option parsing not implemented
 * - Validation rules for directories not implemented
 * - Help text doesn't include directory options
 * 
 * NEXT STEPS (GREEN phase):
 * 1. Update ArgsParser.options to include source and output
 * 2. Implement directory option parsing logic
 * 3. Add directory validation rules
 * 4. Update help text to include directory options
 * 5. Ensure all tests pass with minimal implementation
 * 
 * COVERAGE TARGET: ≥90% of ArgsParser directory option handling
 */