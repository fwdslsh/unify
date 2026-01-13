/**
 * Comprehensive Unit Tests for ArgsParser
 * Tests CLI argument parsing with 95%+ coverage target
 * Covers all parsing scenarios, validation, and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ArgsParser } from '../../../src/cli/args-parser.js';

describe('ArgsParser', () => {
  let parser;
  let originalProcessEnv;

  beforeEach(() => {
    parser = new ArgsParser();
    // Backup original environment
    originalProcessEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalProcessEnv;
  });

  describe('constructor', () => {
    it('should_initialize_with_default_commands', () => {
      expect(parser.commands.has('build')).toBe(true);
      expect(parser.commands.has('serve')).toBe(true);
      expect(parser.commands.has('watch')).toBe(true);
      expect(parser.commands.has('init')).toBe(true);
      expect(parser.commands.size).toBe(4);
    });

    it('should_initialize_with_comprehensive_options', () => {
      // Basic options
      expect(parser.options.source).toEqual({
        short: 's', hasValue: true, default: '.'
      });
      expect(parser.options.output).toEqual({
        short: 'o', hasValue: true, default: 'dist'
      });
      expect(parser.options.help).toEqual({
        short: 'h', hasValue: false, default: false
      });
      expect(parser.options.version).toEqual({
        short: 'V', hasValue: false, default: false
      });

      // Array options
      expect(parser.options.copy.isArray).toBe(true);
      expect(parser.options.copy.default).toEqual([]);
      expect(parser.options.ignore.isArray).toBe(true);
      expect(parser.options.defaultLayout.isArray).toBe(true);

      // Long name options
      expect(parser.options.ignoreRender.longName).toBe('ignore-render');
      expect(parser.options.prettyUrls.longName).toBe('pretty-urls');
      expect(parser.options.logLevel.longName).toBe('log-level');
    });
  });

  describe('parse() - Core Parsing Logic', () => {
    it('should_return_defaults_when_no_args_provided', () => {
      const result = parser.parse([]);

      expect(result.command).toBe('build');
      expect(result.source).toBe('.');
      expect(result.output).toBe('dist');
      expect(result.clean).toBe(false);
      expect(result.verbose).toBe(false);
      expect(result.port).toBe(3000);
      expect(result.host).toBe('localhost');
      expect(result.template).toBe('default');
      expect(result.copy).toEqual([]);
      expect(result.ignore).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should_parse_command_as_first_argument', () => {
      expect(parser.parse(['build']).command).toBe('build');
      expect(parser.parse(['serve']).command).toBe('serve');
      expect(parser.parse(['watch']).command).toBe('watch');
      expect(parser.parse(['init']).command).toBe('init');
    });

    it('should_default_to_build_when_first_arg_not_command', () => {
      const result = parser.parse(['--source', './src']);
      expect(result.command).toBe('build');
      expect(result.source).toBe('./src');
    });

    it('should_parse_positional_argument_as_source', () => {
      const result = parser.parse(['./my-source']);
      expect(result.command).toBe('build');
      expect(result.source).toBe('./my-source');
    });

    it('should_ignore_extra_positional_arguments_with_warning', () => {
      const result = parser.parse(['./source', './extra', './more']);
      expect(result.source).toBe('./source');
      expect(result.warnings).toContain('Ignoring unexpected argument: ./extra');
      expect(result.warnings).toContain('Ignoring unexpected argument: ./more');
    });

    it('should_handle_mixed_command_and_options', () => {
      const result = parser.parse([
        'serve', '--source', './src', '--port', '8080', '--verbose'
      ]);
      
      expect(result.command).toBe('serve');
      expect(result.source).toBe('./src');
      expect(result.port).toBe(8080);
      expect(result.verbose).toBe(true);
    });
  });

  describe('parse() - Short Options', () => {
    it('should_parse_short_boolean_flags', () => {
      const result = parser.parse(['-v', '-c', '-h']);
      expect(result.verbose).toBe(true);
      expect(result.clean).toBe(true);
      expect(result.help).toBe(true);
    });

    it('should_parse_short_options_with_values', () => {
      const result = parser.parse(['-s', './source', '-o', './output', '-p', '9000']);
      expect(result.source).toBe('./source');
      expect(result.output).toBe('./output');
      expect(result.port).toBe('9000'); // Short options don't auto-convert to number
    });

    it('should_error_on_unknown_short_option', () => {
      const result = parser.parse(['-x']);
      expect(result.errors).toContain('Unknown option: -x');
    });

    it('should_error_when_short_option_missing_required_value', () => {
      const result = parser.parse(['-s']);
      expect(result.errors).toContain('Option -s requires a value');
    });

    it('should_parse_template_short_option', () => {
      const result = parser.parse(['init', '-t', 'advanced']);
      expect(result.template).toBe('advanced');
    });
  });

  describe('parse() - Long Options', () => {
    it('should_parse_long_boolean_flags', () => {
      const result = parser.parse(['--verbose', '--clean', '--help', '--version']);
      expect(result.verbose).toBe(true);
      expect(result.clean).toBe(true);
      expect(result.help).toBe(true);
      expect(result.version).toBe(true);
    });

    it('should_parse_long_options_with_values', () => {
      const result = parser.parse([
        '--source', './my-source',
        '--output', './my-output',
        '--port', '4000',
        '--host', '0.0.0.0'
      ]);
      
      expect(result.source).toBe('./my-source');
      expect(result.output).toBe('./my-output');
      expect(result.port).toBe(4000);
      expect(result.host).toBe('0.0.0.0');
    });

    it('should_parse_long_options_with_equals_syntax', () => {
      const result = parser.parse([
        '--source=./equals-source',
        '--port=5000',
        '--log-level=debug'
      ]);
      
      expect(result.source).toBe('./equals-source');
      expect(result.port).toBe(5000);
      expect(result.logLevel).toBe('debug');
    });

    it('should_parse_hyphenated_long_options', () => {
      const result = parser.parse([
        '--ignore-render', '*.tmp',
        '--ignore-copy', '*.bak', 
        '--pretty-urls',
        '--dry-run',
        '--log-level', 'warn'
      ]);
      
      expect(result.ignoreRender).toContain('*.tmp');
      expect(result.ignoreCopy).toContain('*.bak');
      expect(result.prettyUrls).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.logLevel).toBe('warn');
    });

    it('should_error_on_unknown_long_option', () => {
      const result = parser.parse(['--unknown']);
      expect(result.errors).toContain('Unknown option: --unknown');
    });

    it('should_error_when_long_option_missing_required_value', () => {
      const result = parser.parse(['--source']);
      expect(result.errors).toContain('Option --source requires a value');
    });
  });

  describe('parse() - Array Options', () => {
    it('should_accumulate_multiple_copy_patterns', () => {
      const result = parser.parse([
        '--copy', 'assets/**',
        '--copy', 'images/**',
        '--copy', 'fonts/**'
      ]);
      
      expect(result.copy).toEqual(['assets/**', 'images/**', 'fonts/**']);
    });

    it('should_accumulate_multiple_ignore_patterns', () => {
      const result = parser.parse([
        '--ignore', '*.tmp',
        '--ignore', 'node_modules/**',
        '--ignore', '.git/**'
      ]);
      
      expect(result.ignore).toEqual(['*.tmp', 'node_modules/**', '.git/**']);
    });

    it('should_handle_default_layout_patterns', () => {
      const result = parser.parse([
        '--default-layout', 'blog/**=blog.html',
        '--default-layout', 'docs/**=doc.html'
      ]);
      
      expect(result.defaultLayout).toEqual(['blog/**=blog.html', 'docs/**=doc.html']);
    });

    it('should_validate_glob_patterns', () => {
      const result = parser.parse(['--copy', 'invalid\\backslash']);
      expect(result.errors).toContain('Use forward slashes in glob patterns for cross-platform compatibility');
    });

    it('should_warn_about_performance_patterns', () => {
      const result = parser.parse(['--copy', '**/*']);
      expect(result.warnings).toContain("Pattern '**/*' may have performance impact on large file sets");
    });

    it('should_validate_fail_on_values', () => {
      const result = parser.parse(['--fail-on', 'security,warning']);
      expect(result.failOn).toEqual(['security,warning']);
      expect(result.errors).toHaveLength(0);
    });

    it('should_error_on_invalid_fail_on_values', () => {
      const result = parser.parse(['--fail-on', 'invalid']);
      expect(result.errors).toContain("Invalid fail-on value: 'invalid'. Valid values are: security, warning, error, U001, U002, U003, U004, U005, U006, U008");
    });
  });

  describe('parse() - Special Value Validation', () => {
    it('should_validate_port_numbers', () => {
      // Valid ports
      expect(parser.parse(['--port', '3000']).port).toBe(3000);
      expect(parser.parse(['--port', '8080']).port).toBe(8080);
      expect(parser.parse(['--port', '65535']).port).toBe(65535);
      
      // Invalid ports
      expect(parser.parse(['--port', '0']).errors).toContain('Invalid port number: 0. Must be between 1 and 65535.');
      expect(parser.parse(['--port', '65536']).errors).toContain('Invalid port number: 65536. Must be between 1 and 65535.');
      expect(parser.parse(['--port', 'abc']).errors).toContain('Invalid port number: abc. Must be between 1 and 65535.');
      expect(parser.parse(['--port', '-1']).errors).toContain('Invalid port number: -1. Must be between 1 and 65535.');
    });

    it('should_validate_auto_ignore_boolean', () => {
      // Valid values
      expect(parser.parse(['--auto-ignore', 'true']).autoIgnore).toBe(true);
      expect(parser.parse(['--auto-ignore', 'false']).autoIgnore).toBe(false);
      
      // Invalid values
      const result = parser.parse(['--auto-ignore', 'maybe']);
      expect(result.errors).toContain('Option --auto-ignore must be true or false');
    });

    it('should_validate_log_levels', () => {
      // Valid log levels
      expect(parser.parse(['--log-level', 'error']).logLevel).toBe('error');
      expect(parser.parse(['--log-level', 'warn']).logLevel).toBe('warn');
      expect(parser.parse(['--log-level', 'info']).logLevel).toBe('info');
      expect(parser.parse(['--log-level', 'debug']).logLevel).toBe('debug');
      
      // Invalid log level
      const result = parser.parse(['--log-level', 'invalid']);
      expect(result.errors).toContain("Invalid log level: 'invalid'. Valid levels are: error, warn, info, debug");
    });
  });

  describe('parse() - Environment Variable Integration', () => {
    it('should_apply_debug_environment_variables', () => {
      process.env.DEBUG = '1';
      const result = parser.parse([]);
      expect(result.logLevel).toBe('debug');
    });

    it('should_apply_unify_debug_environment_variable', () => {
      process.env.UNIFY_DEBUG = '1';
      const result = parser.parse([]);
      expect(result.logLevel).toBe('debug');
    });

    it('should_apply_log_level_environment_variable', () => {
      process.env.LOG_LEVEL = 'warn';
      const result = parser.parse([]);
      expect(result.logLevel).toBe('warn');
    });

    it('should_handle_invalid_log_level_environment_variable', () => {
      process.env.LOG_LEVEL = 'invalid';
      const result = parser.parse([]);
      expect(result.warnings).toContain("Invalid LOG_LEVEL environment variable: 'invalid'. Using default 'info'.");
    });

    it('should_prefer_debug_env_over_log_level_env', () => {
      process.env.DEBUG = '1';
      process.env.LOG_LEVEL = 'warn';
      const result = parser.parse([]);
      expect(result.logLevel).toBe('debug');
    });

    it('should_support_abbreviated_log_levels_in_env', () => {
      process.env.LOG_LEVEL = 'e';
      const result = parser.parse([]);
      expect(result.logLevel).toBe('error');

      process.env.LOG_LEVEL = 'w';
      const result2 = parser.parse([]);
      expect(result2.logLevel).toBe('warn');
    });
  });

  describe('parse() - Error Handling', () => {
    it('should_handle_parsing_exceptions_gracefully', () => {
      // Mock a parsing method to throw an error
      const originalParseLong = parser._parseLongOption;
      parser._parseLongOption = mock(() => {
        throw new Error('Parse error');
      });

      const result = parser.parse(['--source', 'test']);
      expect(result.errors).toContain('Parse error');

      // Restore original method
      parser._parseLongOption = originalParseLong;
    });

    it('should_collect_multiple_errors', () => {
      const result = parser.parse([
        '--port', 'invalid',
        '--log-level', 'bad',
        '--unknown', 'value'
      ]);
      
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain('Invalid port number: invalid. Must be between 1 and 65535.');
      expect(result.errors).toContain("Invalid log level: 'bad'. Valid levels are: error, warn, info, debug");
      expect(result.errors).toContain('Unknown option: --unknown');
    });
  });

  describe('validate() - Validation Logic', () => {
    it('should_validate_successful_parse_results', () => {
      const parsed = parser.parse(['build', '--source', './src']);
      const validation = parser.validate(parsed);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.warnings).toEqual([]);
    });

    it('should_fail_validation_with_parse_errors', () => {
      const parsed = parser.parse(['--invalid']);
      const validation = parser.validate(parsed);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Unknown option: --invalid');
    });

    it('should_validate_command_existence', () => {
      const parsed = { command: 'nonexistent', errors: [], warnings: [] };
      const validation = parser.validate(parsed);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid command: nonexistent');
    });

    it('should_validate_path_types', () => {
      const parsed = { 
        command: 'build', 
        source: 123, 
        output: [], 
        errors: [], 
        warnings: [] 
      };
      const validation = parser.validate(parsed);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Source path must be a string');
      expect(validation.errors).toContain('Output path must be a string');
    });

    it('should_validate_build_command_requirements', () => {
      const parsed = { 
        command: 'build', 
        source: null, 
        output: null, 
        errors: [], 
        warnings: [] 
      };
      const validation = parser.validate(parsed);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Build command requires source directory');
      expect(validation.errors).toContain('Build command requires output directory');
    });

    it('should_validate_glob_patterns_in_validation_phase', () => {
      const parsed = {
        command: 'build',
        source: './src',
        output: './dist',
        copy: ['valid/**', 'invalid\\pattern'],
        errors: [],
        warnings: []
      };
      const validation = parser.validate(parsed);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Use forward slashes in glob patterns for cross-platform compatibility');
    });

    it('should_validate_default_layout_patterns_in_validation', () => {
      const parsed = {
        command: 'build',
        source: './src',
        output: './dist',
        defaultLayout: ['valid/**=layout.html', 'invalid\\pattern=bad.html'],
        errors: [],
        warnings: []
      };
      const validation = parser.validate(parsed);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Use forward slashes in glob patterns for cross-platform compatibility');
    });

    it('should_warn_about_ignored_options_for_init_command', () => {
      const parsed = {
        command: 'init',
        source: './custom',
        output: './build',
        copy: ['assets/**'],
        dryRun: true,
        errors: [],
        warnings: []
      };
      const validation = parser.validate(parsed);
      
      expect(validation.isValid).toBe(true);
      expect(validation.warnings).toContain('Config and glob pattern options are ignored for init command');
    });

    it('should_not_warn_about_default_source_output_for_init', () => {
      const parsed = {
        command: 'init',
        source: '.',
        output: 'dist',
        errors: [],
        warnings: []
      };
      const validation = parser.validate(parsed);
      
      expect(validation.warnings).not.toContain('Config and glob pattern options are ignored for init command');
    });
  });

  describe('_validateGlobPattern()', () => {
    it('should_accept_valid_patterns', () => {
      expect(parser._validateGlobPattern('**/*.js')).toBeNull();
      expect(parser._validateGlobPattern('src/**')).toBeNull();
      expect(parser._validateGlobPattern('*.html')).toBeNull();
      expect(parser._validateGlobPattern('docs/**/*.{md,pdf}')).toBeNull();
    });

    it('should_reject_empty_patterns', () => {
      expect(parser._validateGlobPattern('')).toBe('Empty glob pattern not allowed');
      expect(parser._validateGlobPattern('   ')).toBe('Empty glob pattern not allowed');
      expect(parser._validateGlobPattern(null)).toBe('Empty glob pattern not allowed');
      expect(parser._validateGlobPattern(undefined)).toBe('Empty glob pattern not allowed');
    });

    it('should_reject_backslash_patterns', () => {
      expect(parser._validateGlobPattern('src\\**')).toBe('Use forward slashes in glob patterns for cross-platform compatibility');
      expect(parser._validateGlobPattern('docs\\*.md')).toBe('Use forward slashes in glob patterns for cross-platform compatibility');
    });
  });

  describe('_validateDefaultLayoutPattern()', () => {
    it('should_accept_valid_layout_patterns', () => {
      expect(parser._validateDefaultLayoutPattern('blog/**=blog.html')).toBeNull();
      expect(parser._validateDefaultLayoutPattern('docs/**/*.md=doc-layout.html')).toBeNull();
      expect(parser._validateDefaultLayoutPattern('simple-layout.html')).toBeNull();
    });

    it('should_reject_empty_patterns', () => {
      expect(parser._validateDefaultLayoutPattern('')).toBe('Empty glob pattern not allowed');
    });

    it('should_validate_glob_part_in_pattern_rules', () => {
      expect(parser._validateDefaultLayoutPattern('src\\**=layout.html')).toBe('Use forward slashes in glob patterns for cross-platform compatibility');
    });

    it('should_reject_empty_parts_in_pattern_rules', () => {
      expect(parser._validateDefaultLayoutPattern('=layout.html')).toBe('Empty glob pattern not allowed before = in default layout rule');
      expect(parser._validateDefaultLayoutPattern('blog/**=')).toBe('Empty layout path not allowed after = in default layout rule');
    });
  });

  describe('_normalizeLogLevel()', () => {
    it('should_normalize_valid_levels', () => {
      expect(parser._normalizeLogLevel('ERROR')).toBe('error');
      expect(parser._normalizeLogLevel('Warn')).toBe('warn');
      expect(parser._normalizeLogLevel('INFO')).toBe('info');
      expect(parser._normalizeLogLevel('Debug')).toBe('debug');
    });

    it('should_support_abbreviations', () => {
      expect(parser._normalizeLogLevel('e')).toBe('error');
      expect(parser._normalizeLogLevel('w')).toBe('warn');
      expect(parser._normalizeLogLevel('i')).toBe('info');
      expect(parser._normalizeLogLevel('d')).toBe('debug');
    });

    it('should_return_null_for_invalid_levels', () => {
      expect(parser._normalizeLogLevel('invalid')).toBeNull();
      expect(parser._normalizeLogLevel('trace')).toBe('trace'); // trace is valid but not in main validation
      expect(parser._normalizeLogLevel(123)).toBe('info'); // non-string defaults to info
    });
  });

  describe('getHelpText()', () => {
    it('should_return_comprehensive_help_text', () => {
      const helpText = parser.getHelpText();
      
      expect(helpText).toContain('Unify Static Site Generator');
      expect(helpText).toContain('Commands:');
      expect(helpText).toContain('build');
      expect(helpText).toContain('serve');
      expect(helpText).toContain('watch');
      expect(helpText).toContain('init');
      
      expect(helpText).toContain('Basic Options:');
      expect(helpText).toContain('--source');
      expect(helpText).toContain('--output');
      
      expect(helpText).toContain('Glob Pattern Options:');
      expect(helpText).toContain('--copy');
      expect(helpText).toContain('--ignore');
      
      expect(helpText).toContain('Examples:');
      expect(helpText).toContain('unify build');
      expect(helpText).toContain('unify serve');
    });
  });

  describe('getVersionText()', () => {
    it('should_return_version_information', () => {
      const versionText = parser.getVersionText();
      expect(versionText).toBe('Unify v0.6.0 - DOM Cascade Static Site Generator');
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should_handle_empty_string_arguments', () => {
      const result = parser.parse(['', '--source', '']);
      expect(result.command).toBe('build');
      expect(result.source).toBe('');
    });

    it('should_handle_special_characters_in_paths', () => {
      const result = parser.parse(['--source', './src with spaces', '--output', './dist-ñ']);
      expect(result.source).toBe('./src with spaces');
      expect(result.output).toBe('./dist-ñ');
    });

    it('should_handle_maximum_array_accumulation', () => {
      const copyPatterns = Array.from({ length: 100 }, (_, i) => `pattern${i}/**`);
      const args = copyPatterns.flatMap(pattern => ['--copy', pattern]);
      
      const result = parser.parse(args);
      expect(result.copy).toHaveLength(100);
      expect(result.copy[0]).toBe('pattern0/**');
      expect(result.copy[99]).toBe('pattern99/**');
    });

    it('should_handle_unicode_in_options', () => {
      const result = parser.parse(['--host', '🌐.example.com', '--source', './src-🚀']);
      expect(result.host).toBe('🌐.example.com');
      expect(result.source).toBe('./src-🚀');
    });

    it('should_preserve_option_order_in_arrays', () => {
      const result = parser.parse([
        '--copy', 'first/**',
        '--ignore', 'skip1/**',
        '--copy', 'second/**',
        '--ignore', 'skip2/**',
        '--copy', 'third/**'
      ]);
      
      expect(result.copy).toEqual(['first/**', 'second/**', 'third/**']);
      expect(result.ignore).toEqual(['skip1/**', 'skip2/**']);
    });
  });

  describe('Performance and Memory Tests', () => {
    it('should_handle_large_argument_lists', () => {
      const largeArgs = ['build'];
      for (let i = 0; i < 1000; i++) {
        largeArgs.push('--copy', `pattern${i}/**`);
      }
      
      const startTime = performance.now();
      const result = parser.parse(largeArgs);
      const endTime = performance.now();
      
      expect(result.copy).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(100); // Should parse in <100ms
    });

    it('should_not_leak_memory_with_repeated_parsing', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < 1000; i++) {
        parser.parse(['build', '--source', `./src${i}`, '--verbose']);
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      
      // Memory growth should be reasonable (less than 10MB)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Integration with Real CLI Usage', () => {
    it('should_parse_realistic_build_scenario', () => {
      const args = [
        'build',
        '--source', './website/src',
        '--output', './website/dist', 
        '--copy', 'assets/**',
        '--copy', 'images/**',
        '--ignore', '.DS_Store',
        '--ignore', '*.tmp',
        '--pretty-urls',
        '--minify',
        '--clean',
        '--verbose'
      ];
      
      const result = parser.parse(args);
      expect(result.command).toBe('build');
      expect(result.source).toBe('./website/src');
      expect(result.output).toBe('./website/dist');
      expect(result.copy).toEqual(['assets/**', 'images/**']);
      expect(result.ignore).toEqual(['.DS_Store', '*.tmp']);
      expect(result.prettyUrls).toBe(true);
      expect(result.minify).toBe(true);
      expect(result.clean).toBe(true);
      expect(result.verbose).toBe(true);
      
      const validation = parser.validate(result);
      expect(validation.isValid).toBe(true);
    });

    it('should_parse_realistic_serve_scenario', () => {
      const args = [
        'serve',
        '--port', '8080',
        '--host', '0.0.0.0',
        '--source', './src',
        '--verbose',
        '--log-level', 'debug'
      ];
      
      const result = parser.parse(args);
      expect(result.command).toBe('serve');
      expect(result.port).toBe(8080);
      expect(result.host).toBe('0.0.0.0');
      expect(result.source).toBe('./src');
      expect(result.verbose).toBe(true);
      expect(result.logLevel).toBe('debug');
      
      const validation = parser.validate(result);
      expect(validation.isValid).toBe(true);
    });

    it('should_parse_realistic_init_scenario', () => {
      const args = [
        'init',
        '--template', 'blog',
        '--target', './my-new-site'
      ];
      
      const result = parser.parse(args);
      expect(result.command).toBe('init');
      expect(result.template).toBe('blog');
      expect(result.target).toBe('./my-new-site');
      
      const validation = parser.validate(result);
      expect(validation.isValid).toBe(true);
    });
  });
});