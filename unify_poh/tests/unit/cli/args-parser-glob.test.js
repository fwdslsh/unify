/**
 * Unit Tests for ArgsParser Glob Options
 * Tests CLI parsing for glob-related options for US-016
 * 
 * Tests the parsing and validation of all glob pattern CLI options
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ArgsParser } from '../../../src/cli/args-parser.js';

describe('ArgsParser Glob Options', () => {
  let parser;

  beforeEach(() => {
    parser = new ArgsParser();
  });

  describe('Copy Pattern Options', () => {
    test('should_parse_single_copy_pattern', () => {
      // Act
      const result = parser.parse(['build', '--copy', 'assets/**']);

      // Assert
      expect(result.copy).toEqual(['assets/**']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_multiple_copy_patterns', () => {
      // Act
      const result = parser.parse([
        'build', 
        '--copy', 'assets/**', 
        '--copy', 'docs/*.pdf'
      ]);

      // Assert
      expect(result.copy).toEqual(['assets/**', 'docs/*.pdf']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_require_value_for_copy_option', () => {
      // Act
      const result = parser.parse(['build', '--copy']);

      // Assert
      expect(result.errors).toContain('Option --copy requires a value');
    });
  });

  describe('Ignore Pattern Options', () => {
    test('should_parse_ignore_patterns', () => {
      // Act
      const result = parser.parse([
        'build',
        '--ignore', 'temp/**',
        '--ignore', '*.tmp'
      ]);

      // Assert
      expect(result.ignore).toEqual(['temp/**', '*.tmp']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_ignore_render_patterns', () => {
      // Act
      const result = parser.parse([
        'build',
        '--ignore-render', 'drafts/**'
      ]);

      // Assert
      expect(result.ignoreRender).toEqual(['drafts/**']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_ignore_copy_patterns', () => {
      // Act
      const result = parser.parse([
        'build',
        '--ignore-copy', 'assets/raw/**'
      ]);

      // Assert
      expect(result.ignoreCopy).toEqual(['assets/raw/**']);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Render Pattern Options', () => {
    test('should_parse_render_patterns', () => {
      // Act
      const result = parser.parse([
        'build',
        '--render', 'experiments/**'
      ]);

      // Assert
      expect(result.render).toEqual(['experiments/**']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_multiple_render_patterns', () => {
      // Act
      const result = parser.parse([
        'build',
        '--render', 'experiments/**',
        '--render', 'drafts/published/**'
      ]);

      // Assert
      expect(result.render).toEqual(['experiments/**', 'drafts/published/**']);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Auto-Ignore Option', () => {
    test('should_parse_auto_ignore_true', () => {
      // Act
      const result = parser.parse(['build', '--auto-ignore', 'true']);

      // Assert
      expect(result.autoIgnore).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_auto_ignore_false', () => {
      // Act
      const result = parser.parse(['build', '--auto-ignore', 'false']);

      // Assert
      expect(result.autoIgnore).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    test('should_default_auto_ignore_to_true', () => {
      // Act
      const result = parser.parse(['build']);

      // Assert
      expect(result.autoIgnore).toBe(true);
    });

    test('should_validate_auto_ignore_value', () => {
      // Act
      const result = parser.parse(['build', '--auto-ignore', 'invalid']);

      // Assert
      expect(result.errors).toContain('Option --auto-ignore must be true or false');
    });
  });

  describe('Default Layout Options', () => {
    test('should_parse_default_layout_filename_only', () => {
      // Act
      const result = parser.parse(['build', '--default-layout', '_base.html']);

      // Assert
      expect(result.defaultLayout).toEqual(['_base.html']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_default_layout_with_glob', () => {
      // Act
      const result = parser.parse(['build', '--default-layout', 'blog/**=_post.html']);

      // Assert
      expect(result.defaultLayout).toEqual(['blog/**=_post.html']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_multiple_default_layouts', () => {
      // Act
      const result = parser.parse([
        'build',
        '--default-layout', '_base.html',
        '--default-layout', 'blog/**=_post.html'
      ]);

      // Assert
      expect(result.defaultLayout).toEqual(['_base.html', 'blog/**=_post.html']);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Dry Run Option', () => {
    test('should_parse_dry_run_flag', () => {
      // Act
      const result = parser.parse(['build', '--dry-run']);

      // Assert
      expect(result.dryRun).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should_default_dry_run_to_false', () => {
      // Act
      const result = parser.parse(['build']);

      // Assert
      expect(result.dryRun).toBe(false);
    });
  });

  describe('Complex Combinations', () => {
    test('should_parse_all_glob_options_together', () => {
      // Act
      const result = parser.parse([
        'build',
        '--copy', 'assets/**',
        '--copy', 'docs/*.pdf',
        '--ignore', 'temp/**',
        '--ignore-render', 'drafts/**',
        '--ignore-copy', 'private/**',
        '--render', 'experiments/**',
        '--auto-ignore', 'false',
        '--default-layout', '_base.html',
        '--default-layout', 'blog/**=_post.html',
        '--dry-run'
      ]);

      // Assert
      expect(result.copy).toEqual(['assets/**', 'docs/*.pdf']);
      expect(result.ignore).toEqual(['temp/**']);
      expect(result.ignoreRender).toEqual(['drafts/**']);
      expect(result.ignoreCopy).toEqual(['private/**']);
      expect(result.render).toEqual(['experiments/**']);
      expect(result.autoIgnore).toBe(false);
      expect(result.defaultLayout).toEqual(['_base.html', 'blog/**=_post.html']);
      expect(result.dryRun).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should_handle_mixed_short_and_long_options', () => {
      // Act
      const result = parser.parse([
        'build',
        '-s', 'src',
        '--copy', 'assets/**',
        '-o', 'build',
        '--ignore', 'temp/**'
      ]);

      // Assert
      expect(result.source).toBe('src');
      expect(result.output).toBe('build');
      expect(result.copy).toEqual(['assets/**']);
      expect(result.ignore).toEqual(['temp/**']);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Pattern Validation', () => {
    test('should_accept_valid_glob_patterns', () => {
      // Arrange
      const validPatterns = [
        'assets/**',
        '*.html',
        'docs/**/*.{md,html}',
        '!temp/**',
        'src/**/test.js'
      ];

      // Act & Assert
      for (const pattern of validPatterns) {
        const result = parser.parse(['build', '--copy', pattern]);
        expect(result.errors).toHaveLength(0);
        expect(result.copy).toEqual([pattern]);
      }
    });

    test('should_warn_about_potentially_problematic_patterns', () => {
      // Act
      const result = parser.parse(['build', '--copy', '**/*']);

      // Assert
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('performance'))).toBe(true);
    });

    test('should_reject_empty_patterns', () => {
      // Act
      const result = parser.parse(['build', '--copy', '']);

      // Assert
      expect(result.errors).toContain('Empty glob pattern not allowed');
    });
  });

  describe('Help Text Integration', () => {
    test('should_include_glob_options_in_help_text', () => {
      // Act
      const helpText = parser.getHelpText();

      // Assert
      expect(helpText).toContain('--copy');
      expect(helpText).toContain('--ignore');
      expect(helpText).toContain('--ignore-render');
      expect(helpText).toContain('--ignore-copy');
      expect(helpText).toContain('--render');
      expect(helpText).toContain('--auto-ignore');
      expect(helpText).toContain('--default-layout');
      expect(helpText).toContain('--dry-run');
    });

    test('should_provide_clear_descriptions_for_glob_options', () => {
      // Act
      const helpText = parser.getHelpText();

      // Assert
      expect(helpText).toContain('Copy matching files');
      expect(helpText).toContain('Ignore for both render and copy');
      expect(helpText).toContain('Show classification without writing');
      expect(helpText).toContain('Respect .gitignore and auto-ignore');
    });
  });

  describe('Validation Integration', () => {
    test('should_validate_glob_patterns_during_validation', () => {
      // Arrange
      const parsed = parser.parse(['build', '--copy', 'valid/**']);

      // Act
      const validation = parser.validate(parsed);

      // Assert
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should_report_validation_errors_for_invalid_patterns', () => {
      // Arrange
      const parsed = {
        ...parser.parse(['build']),
        copy: [''] // Invalid empty pattern
      };

      // Act
      const validation = parser.validate(parsed);

      // Assert
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('Empty glob pattern'))).toBe(true);
    });

    test('should_aggregate_all_validation_errors', () => {
      // Arrange
      const parsed = {
        ...parser.parse(['build']),
        copy: ['', 'valid/**'], // One invalid, one valid
        ignore: [''],           // Another invalid
        autoIgnore: 'invalid'   // Invalid boolean
      };

      // Act
      const validation = parser.validate(parsed);

      // Assert
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(1);
    });
  });

  describe('Command Compatibility', () => {
    test('should_support_glob_options_for_all_commands', () => {
      // Arrange
      const commands = ['build', 'serve', 'watch'];
      
      for (const command of commands) {
        // Act
        const result = parser.parse([command, '--copy', 'assets/**']);

        // Assert
        expect(result.copy).toEqual(['assets/**']);
        expect(result.errors).toHaveLength(0);
      }
    });

    test('should_ignore_glob_options_for_init_command', () => {
      // Act
      const parsed = parser.parse(['init', '--copy', 'assets/**']);
      const validation = parser.validate(parsed);

      // Assert
      expect(validation.warnings.some(w => w.includes('ignored for init'))).toBe(true);
    });
  });
});