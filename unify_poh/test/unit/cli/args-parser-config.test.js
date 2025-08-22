import { describe, test, expect, beforeEach } from 'bun:test';
import { ArgsParser } from '../../../src/cli/args-parser.js';

describe('ArgsParser --config option', () => {
  let parser;

  beforeEach(() => {
    parser = new ArgsParser();
  });

  test('should_parse_config_option_when_provided', () => {
    const args = ['build', '--config', 'custom-config.yaml'];
    const result = parser.parse(args);

    expect(result.command).toBe('build');
    expect(result.config).toBe('custom-config.yaml');
    expect(result.errors).toHaveLength(0);
  });

  test('should_handle_config_as_long_option_only_since_short_c_is_used_by_clean', () => {
    // -c is used by --clean, so config only has long form
    const args = ['build', '-c']; // This should set clean, not config
    const result = parser.parse(args);

    expect(result.command).toBe('build');
    expect(result.clean).toBe(true);
    expect(result.config).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  test('should_handle_missing_config_value_when_option_provided_without_value', () => {
    const args = ['build', '--config'];
    const result = parser.parse(args);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('requires a value');
  });

  test('should_default_to_null_when_no_config_option_provided', () => {
    const args = ['build', '--source', 'src'];
    const result = parser.parse(args);

    expect(result.config).toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  test('should_validate_config_file_path_when_relative_path_provided', () => {
    const args = ['build', '--config', '../config/unify.yaml'];
    const result = parser.parse(args);

    expect(result.config).toBe('../config/unify.yaml');
    expect(result.errors).toHaveLength(0);
  });

  test('should_validate_config_file_path_when_absolute_path_provided', () => {
    const args = ['build', '--config', '/etc/unify/config.yaml'];
    const result = parser.parse(args);

    expect(result.config).toBe('/etc/unify/config.yaml');
    expect(result.errors).toHaveLength(0);
  });

  test('should_accept_both_yaml_and_yml_extensions_when_provided', () => {
    const yamlArgs = ['build', '--config', 'config.yaml'];
    const ymlArgs = ['build', '--config', 'config.yml'];

    const yamlResult = parser.parse(yamlArgs);
    const ymlResult = parser.parse(ymlArgs);

    expect(yamlResult.config).toBe('config.yaml');
    expect(ymlResult.config).toBe('config.yml');
    expect(yamlResult.errors).toHaveLength(0);
    expect(ymlResult.errors).toHaveLength(0);
  });

  test('should_warn_when_config_option_used_with_init_command', () => {
    const args = ['init', '--config', 'config.yaml'];
    const validation = parser.validate(parser.parse(args));

    expect(validation.warnings.length).toBeGreaterThan(0);
    expect(validation.warnings.some(w => w.includes('Config'))).toBe(true);
  });

  test('should_include_config_option_in_help_text_when_help_requested', () => {
    const helpText = parser.getHelpText();

    expect(helpText).toContain('--config');
    expect(helpText).toContain('Configuration file path');
  });

  test('should_handle_config_option_combined_with_other_options_when_multiple_options_provided', () => {
    const args = ['build', '--config', 'my-config.yaml', '--source', 'src', '--output', 'dist', '--verbose'];
    const result = parser.parse(args);

    expect(result.command).toBe('build');
    expect(result.config).toBe('my-config.yaml');
    expect(result.source).toBe('src');
    expect(result.output).toBe('dist');
    expect(result.verbose).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});