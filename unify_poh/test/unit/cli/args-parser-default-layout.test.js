/**
 * Unit Tests for ArgsParser --default-layout Option
 * Tests US-019: Default Layout Assignment with Glob Patterns
 * 
 * Tests the parsing and validation of --default-layout CLI option with glob patterns
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ArgsParser } from '../../../src/cli/args-parser.js';

describe('ArgsParser Default Layout Options', () => {
  let parser;

  beforeEach(() => {
    parser = new ArgsParser();
  });

  describe('Basic Default Layout Parsing', () => {
    test('should_parse_single_filename_default_layout', () => {
      // Act
      const result = parser.parse(['build', '--default-layout', '_base.html']);

      // Assert
      expect(result.defaultLayout).toEqual(['_base.html']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_single_glob_pattern_default_layout', () => {
      // Act
      const result = parser.parse(['build', '--default-layout', 'blog/**=_post.html']);

      // Assert
      expect(result.defaultLayout).toEqual(['blog/**=_post.html']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_multiple_default_layout_options', () => {
      // Act
      const result = parser.parse([
        'build',
        '--default-layout', '_base.html',
        '--default-layout', 'blog/**=_post.html',
        '--default-layout', 'docs/**=_docs.html'
      ]);

      // Assert
      expect(result.defaultLayout).toEqual([
        '_base.html',
        'blog/**=_post.html',
        'docs/**=_docs.html'
      ]);
      expect(result.errors).toHaveLength(0);
    });

    test('should_require_value_for_default_layout_option', () => {
      // Act
      const result = parser.parse(['build', '--default-layout']);

      // Assert
      expect(result.errors).toContain('Option --default-layout requires a value');
      expect(result.defaultLayout).toEqual([]);
    });

    test('should_start_with_empty_default_layout_array', () => {
      // Act
      const result = parser.parse(['build']);

      // Assert
      expect(result.defaultLayout).toEqual([]);
    });
  });

  describe('Pattern Validation', () => {
    test('should_accept_valid_glob_patterns', () => {
      // Act
      const validPatterns = [
        'blog/**=_post.html',
        'docs/*.md=_doc.html',
        'api/**/v*=_api.html',
        'content/blog/*/index.html=_blog-index.html'
      ];
      
      const result = parser.parse([
        'build',
        '--default-layout', validPatterns[0],
        '--default-layout', validPatterns[1],
        '--default-layout', validPatterns[2],
        '--default-layout', validPatterns[3]
      ]);

      // Assert
      expect(result.defaultLayout).toEqual(validPatterns);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('should_reject_patterns_with_backslashes', () => {
      // Act
      const result = parser.parse(['build', '--default-layout', 'blog\\\\**=_post.html']);

      // Assert
      expect(result.errors).toContain('Use forward slashes in glob patterns for cross-platform compatibility');
    });

    test('should_accept_filename_only_patterns', () => {
      // Act
      const result = parser.parse([
        'build',
        '--default-layout', '_base.html',
        '--default-layout', '_includes/layout.html',
        '--default-layout', 'layouts/_default.html'
      ]);

      // Assert
      expect(result.defaultLayout).toEqual([
        '_base.html',
        '_includes/layout.html',
        'layouts/_default.html'
      ]);
      expect(result.errors).toHaveLength(0);
    });

    test('should_reject_empty_default_layout_values', () => {
      // Act
      const result = parser.parse(['build', '--default-layout', '']);

      // Assert
      expect(result.errors).toContain('Empty glob pattern not allowed');
    });

    test('should_warn_about_overly_broad_patterns', () => {
      // Act
      const result = parser.parse(['build', '--default-layout', '**=_catch_all.html']);

      // Assert
      expect(result.defaultLayout).toEqual(['**=_catch_all.html']);
      expect(result.warnings).toContain('Pattern \'**\' may have performance impact on large file sets');
    });

    test('should_warn_about_very_broad_patterns', () => {
      // Act
      const result = parser.parse(['build', '--default-layout', '**/*=_catch_all.html']);

      // Assert
      expect(result.defaultLayout).toEqual(['**/*=_catch_all.html']);
      expect(result.warnings).toContain('Pattern \'**/*\' may have performance impact on large file sets');
    });
  });

  describe('Mixed Options Integration', () => {
    test('should_parse_default_layout_with_other_options', () => {
      // Act
      const result = parser.parse([
        'build',
        '--source', 'content',
        '--output', 'public',
        '--default-layout', '_base.html',
        '--default-layout', 'blog/**=_post.html',
        '--clean',
        '--pretty-urls'
      ]);

      // Assert
      expect(result.source).toBe('content');
      expect(result.output).toBe('public');
      expect(result.defaultLayout).toEqual(['_base.html', 'blog/**=_post.html']);
      expect(result.clean).toBe(true);
      expect(result.prettyUrls).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_default_layout_with_glob_options', () => {
      // Act
      const result = parser.parse([
        'build',
        '--copy', 'assets/**',
        '--ignore', 'temp/**',
        '--default-layout', '_base.html',
        '--default-layout', 'blog/**=_post.html',
        '--render', 'drafts/**'
      ]);

      // Assert
      expect(result.copy).toEqual(['assets/**']);
      expect(result.ignore).toEqual(['temp/**']);
      expect(result.defaultLayout).toEqual(['_base.html', 'blog/**=_post.html']);
      expect(result.render).toEqual(['drafts/**']);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Command Integration', () => {
    test('should_parse_default_layout_with_build_command', () => {
      // Act
      const result = parser.parse(['build', '--default-layout', '_layout.html']);

      // Assert
      expect(result.command).toBe('build');
      expect(result.defaultLayout).toEqual(['_layout.html']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_default_layout_with_serve_command', () => {
      // Act
      const result = parser.parse(['serve', '--default-layout', 'blog/**=_post.html']);

      // Assert
      expect(result.command).toBe('serve');
      expect(result.defaultLayout).toEqual(['blog/**=_post.html']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_parse_default_layout_with_watch_command', () => {
      // Act
      const result = parser.parse(['watch', '--default-layout', '_base.html']);

      // Assert
      expect(result.command).toBe('watch');
      expect(result.defaultLayout).toEqual(['_base.html']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_warn_when_default_layout_used_with_init_command', () => {
      // Act
      const parsed = parser.parse(['init', '--default-layout', '_base.html']);
      const validation = parser.validate(parsed);

      // Assert
      expect(parsed.command).toBe('init');
      expect(parsed.defaultLayout).toEqual(['_base.html']);
      expect(validation.warnings).toContain('Glob pattern options are ignored for init command');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should_handle_quoted_patterns_with_spaces', () => {
      // Act
      const result = parser.parse(['build', '--default-layout', 'blog posts/**=_post.html']);

      // Assert
      expect(result.defaultLayout).toEqual(['blog posts/**=_post.html']);
      expect(result.errors).toHaveLength(0);
    });

    test('should_handle_patterns_with_special_characters', () => {
      // Act
      const result = parser.parse([
        'build',
        '--default-layout', 'blog-2024/**=_post.html',
        '--default-layout', 'docs_v2/**=_docs.html',
        '--default-layout', 'api.v1/**=_api.html'
      ]);

      // Assert
      expect(result.defaultLayout).toEqual([
        'blog-2024/**=_post.html',
        'docs_v2/**=_docs.html',
        'api.v1/**=_api.html'
      ]);
      expect(result.errors).toHaveLength(0);
    });

    test('should_preserve_order_of_default_layout_rules', () => {
      // Act
      const result = parser.parse([
        'build',
        '--default-layout', '_global.html',
        '--default-layout', 'blog/**=_post.html',
        '--default-layout', 'blog/featured/**=_featured.html',
        '--default-layout', 'docs/**=_docs.html'
      ]);

      // Assert
      expect(result.defaultLayout).toEqual([
        '_global.html',
        'blog/**=_post.html',
        'blog/featured/**=_featured.html',
        'docs/**=_docs.html'
      ]);
    });

    test('should_handle_complex_nested_patterns', () => {
      // Act
      const result = parser.parse([
        'build',
        '--default-layout', 'content/**/blog/**/post-*.{html,md}=_blog-post.html'
      ]);

      // Assert
      expect(result.defaultLayout).toEqual([
        'content/**/blog/**/post-*.{html,md}=_blog-post.html'
      ]);
      expect(result.errors).toHaveLength(0);
    });

    test('should_handle_equals_sign_in_layout_filename', () => {
      // For filenames that contain equals signs, they should be treated as patterns
      // but this would be caught by validation as invalid
      // Act
      const result = parser.parse(['build', '--default-layout', 'layout=special.html']);

      // Assert  
      expect(result.defaultLayout).toEqual(['layout=special.html']);
      // This will be validated later by DefaultLayoutResolver
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Validation Integration', () => {
    test('should_validate_when_validation_called', () => {
      // Act
      const parsed = parser.parse([
        'build',
        '--default-layout', '_base.html',
        '--default-layout', 'blog/**=_post.html'
      ]);
      const validation = parser.validate(parsed);

      // Assert
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.warnings).toEqual(parsed.warnings);
    });

    test('should_include_glob_validation_errors', () => {
      // Act
      const parsed = parser.parse(['build', '--default-layout', 'blog\\\\**=_post.html']);
      const validation = parser.validate(parsed);

      // Assert - The error should be caught during parsing, not validation
      expect(parsed.errors.length > 0 || validation.errors.length > 0).toBe(true);
      const allErrors = [...parsed.errors, ...validation.errors];
      expect(allErrors).toContain('Use forward slashes in glob patterns for cross-platform compatibility');
      expect(validation.isValid).toBe(false);
    });

    test('should_pass_empty_default_layout_validation', () => {
      // Act
      const parsed = parser.parse(['build']);
      const validation = parser.validate(parsed);

      // Assert
      expect(validation.isValid).toBe(true);
      expect(parsed.defaultLayout).toEqual([]);
    });
  });

  describe('Help Text Integration', () => {
    test('should_include_default_layout_in_help_text', () => {
      // Act
      const helpText = parser.getHelpText();

      // Assert
      expect(helpText).toContain('--default-layout');
      expect(helpText).toContain('Set default layout (filename or glob=layout)');
    });
  });
});