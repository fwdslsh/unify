/**
 * Unit Tests: Args Parser - Pretty URLs Option
 * Tests for US-018: CLI integration for --pretty-urls option
 * 
 * TDD Phase: RED - Creating failing tests for CLI integration
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ArgsParser } from '../../../src/cli/args-parser.js';

describe('ArgsParser - Pretty URLs Option', () => {
  let parser;

  beforeEach(() => {
    parser = new ArgsParser();
  });

  describe('Pretty URLs Flag Parsing', () => {
    test('should_parse_pretty_urls_long_option', () => {
      const result = parser.parse(['build', '--pretty-urls']);
      expect(result.prettyUrls).toBe(true);
      expect(result.command).toBe('build');
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_pretty_urls_with_other_options', () => {
      const result = parser.parse(['build', '--source', 'src', '--pretty-urls', '--output', 'dist']);
      expect(result.prettyUrls).toBe(true);
      expect(result.source).toBe('src');
      expect(result.output).toBe('dist');
      expect(result.command).toBe('build');
      expect(result.errors).toHaveLength(0);
    });

    test('should_default_pretty_urls_to_false', () => {
      const result = parser.parse(['build']);
      expect(result.prettyUrls).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    test('should_default_pretty_urls_with_empty_args', () => {
      const result = parser.parse([]);
      expect(result.prettyUrls).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    test('should_work_with_serve_command', () => {
      const result = parser.parse(['serve', '--pretty-urls', '--verbose']);
      expect(result.prettyUrls).toBe(true);
      expect(result.command).toBe('serve');
      expect(result.verbose).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should_work_with_watch_command', () => {
      const result = parser.parse(['watch', '--pretty-urls']);
      expect(result.prettyUrls).toBe(true);
      expect(result.command).toBe('watch');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Pretty URLs Flag Validation', () => {
    test('should_validate_pretty_urls_as_boolean_flag', () => {
      const parsed = parser.parse(['build', '--pretty-urls']);
      const validation = parser.validate(parsed);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should_not_accept_value_for_pretty_urls_flag', () => {
      const result = parser.parse(['build', '--pretty-urls', 'true']);
      // The 'true' should be treated as a positional argument, not a value for the flag
      expect(result.prettyUrls).toBe(true);
      // The 'true' becomes the source since it replaces the default '.'
      expect(result.source).toBe('true');
    });

    test('should_maintain_valid_state_with_pretty_urls', () => {
      const parsed = parser.parse(['build', '--source', 'src', '--pretty-urls']);
      const validation = parser.validate(parsed);
      expect(validation.isValid).toBe(true);
      expect(parsed.prettyUrls).toBe(true);
      expect(parsed.source).toBe('src');
    });
  });

  describe('Help Text Integration', () => {
    test('should_include_pretty_urls_in_help_text', () => {
      const helpText = parser.getHelpText();
      expect(helpText).toContain('--pretty-urls');
      expect(helpText).toContain('Transform HTML links to pretty URL structure');
    });

    test('should_show_pretty_urls_in_help_examples', () => {
      const helpText = parser.getHelpText();
      expect(helpText).toContain('--pretty-urls');
    });
  });

  describe('Edge Cases', () => {
    test('should_handle_pretty_urls_with_init_command', () => {
      const result = parser.parse(['init', '--pretty-urls']);
      expect(result.prettyUrls).toBe(true);
      expect(result.command).toBe('init');
      expect(result.errors).toHaveLength(0);
    });

    test('should_not_interfere_with_other_options', () => {
      const result = parser.parse([
        'build',
        '--source', 'src',
        '--output', 'dist',
        '--pretty-urls',
        '--clean',
        '--verbose'
      ]);
      
      expect(result.prettyUrls).toBe(true);
      expect(result.source).toBe('src');
      expect(result.output).toBe('dist');
      expect(result.clean).toBe(true);
      expect(result.verbose).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should_handle_pretty_urls_at_different_positions', () => {
      // At beginning
      const result1 = parser.parse(['--pretty-urls', 'build', '--source', 'src']);
      expect(result1.prettyUrls).toBe(true);
      expect(result1.command).toBe('build');
      
      // In middle
      const result2 = parser.parse(['build', '--pretty-urls', '--source', 'src']);
      expect(result2.prettyUrls).toBe(true);
      expect(result2.source).toBe('src');
      
      // At end
      const result3 = parser.parse(['build', '--source', 'src', '--pretty-urls']);
      expect(result3.prettyUrls).toBe(true);
      expect(result3.source).toBe('src');
    });
  });

  describe('Complex Scenarios', () => {
    test('should_work_with_all_glob_pattern_options', () => {
      const result = parser.parse([
        'build',
        '--pretty-urls',
        '--copy', '*.pdf',
        '--ignore', 'temp/**',
        '--render', 'docs/**',
        '--auto-ignore', 'false'
      ]);
      
      expect(result.prettyUrls).toBe(true);
      expect(result.copy).toEqual(['*.pdf']);
      expect(result.ignore).toEqual(['temp/**']);
      expect(result.render).toEqual(['docs/**']);
      expect(result.autoIgnore).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    test('should_validate_with_complex_option_combinations', () => {
      const parsed = parser.parse([
        'serve',
        '--pretty-urls',
        '--source', 'custom-src',
        '--output', 'custom-dist',
        '--clean',
        '--verbose'
      ]);
      
      const validation = parser.validate(parsed);
      expect(validation.isValid).toBe(true);
      expect(parsed.prettyUrls).toBe(true);
      expect(parsed.command).toBe('serve');
      expect(parsed.source).toBe('custom-src');
      expect(parsed.output).toBe('custom-dist');
      expect(parsed.clean).toBe(true);
      expect(parsed.verbose).toBe(true);
    });
  });
});