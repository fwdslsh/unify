import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigLoader } from '../../../src/config/config-loader.js';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

describe('ConfigLoader', () => {
  let loader;
  let tempDir;

  beforeEach(() => {
    loader = new ConfigLoader();
    tempDir = join('/tmp', `unify-config-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should_load_default_configuration_when_no_config_file_exists', async () => {
    const config = await loader.loadConfiguration(tempDir);
    
    expect(config).toEqual({
      dom_cascade: {
        version: '1.0',
        area_prefix: 'unify-'
      },
      lint: {
        U001: 'warn',
        U002: 'error',
        U003: 'warn',
        U004: 'warn',
        U005: 'info',
        U006: 'warn',
        U008: 'warn'
      }
    });
  });

  test('should_load_yaml_configuration_when_valid_config_file_exists', async () => {
    const configContent = `
unify:
  dom_cascade:
    version: "1.0"
    area_prefix: "custom-"
  lint:
    U001: error
    U002: off
    U003: info
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, configContent);

    const config = await loader.loadConfiguration(tempDir);
    
    expect(config.dom_cascade.area_prefix).toBe('custom-');
    expect(config.lint.U001).toBe('error');
    expect(config.lint.U002).toBe('off');
    expect(config.lint.U003).toBe('info');
  });

  test('should_merge_partial_configuration_with_defaults_when_partial_config_provided', async () => {
    const configContent = `
unify:
  lint:
    U001: error
    U002: off
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, configContent);

    const config = await loader.loadConfiguration(tempDir);
    
    // Should merge with defaults
    expect(config.dom_cascade.version).toBe('1.0');
    expect(config.dom_cascade.area_prefix).toBe('unify-');
    expect(config.lint.U001).toBe('error');
    expect(config.lint.U002).toBe('off');
    expect(config.lint.U003).toBe('warn'); // Default value
  });

  test('should_validate_configuration_and_throw_error_when_invalid_values_provided', async () => {
    const invalidConfigContent = `
unify:
  lint:
    U001: invalid-severity
    U999: warn
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, invalidConfigContent);

    await expect(loader.loadConfiguration(tempDir)).rejects.toThrow('Invalid configuration');
  });

  test('should_support_dom_cascade_version_1_0_when_v1_specified', async () => {
    const validVersionContent = `
unify:
  dom_cascade:
    version: "1.0"
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, validVersionContent);

    const config = await loader.loadConfiguration(tempDir);
    expect(config.dom_cascade.version).toBe('1.0');
  });

  test('should_support_dom_cascade_version_2_0_when_v2_specified', async () => {
    const validVersionContent = `
unify:
  dom_cascade:
    version: "2.0"
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, validVersionContent);

    const config = await loader.loadConfiguration(tempDir);
    expect(config.dom_cascade.version).toBe('2.0');
  });

  test('should_reject_unsupported_dom_cascade_versions_when_invalid_version_provided', async () => {
    const invalidVersionContent = `
unify:
  dom_cascade:
    version: "3.0"
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, invalidVersionContent);

    await expect(loader.loadConfiguration(tempDir)).rejects.toThrow('Unsupported DOM Cascade version: 3.0. Supported versions: 1.0, 2.0');
  });

  test('should_handle_malformed_yaml_gracefully_when_invalid_yaml_provided', async () => {
    const malformedYaml = `
unify:
  lint:
    U001: warn
  - invalid yaml structure
    U002: error
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, malformedYaml);

    await expect(loader.loadConfiguration(tempDir)).rejects.toThrow('Failed to parse configuration');
  });

  test('should_support_yml_extension_when_using_yml_file', async () => {
    const configContent = `
unify:
  lint:
    U001: error
`;
    
    const configPath = join(tempDir, 'unify.config.yml');
    writeFileSync(configPath, configContent);

    const config = await loader.loadConfiguration(tempDir);
    
    expect(config.lint.U001).toBe('error');
  });

  test('should_prefer_yaml_over_yml_when_both_files_exist', async () => {
    const yamlContent = `
unify:
  lint:
    U001: error
`;
    
    const ymlContent = `
unify:
  lint:
    U001: warn
`;
    
    writeFileSync(join(tempDir, 'unify.config.yaml'), yamlContent);
    writeFileSync(join(tempDir, 'unify.config.yml'), ymlContent);

    const config = await loader.loadConfiguration(tempDir);
    
    // Should prefer .yaml over .yml
    expect(config.lint.U001).toBe('error');
  });

  test('should_resolve_config_from_specified_file_path_when_explicit_path_provided', async () => {
    const configContent = `
unify:
  lint:
    U001: info
`;
    
    const customConfigPath = join(tempDir, 'custom-config.yaml');
    writeFileSync(customConfigPath, configContent);

    const config = await loader.loadConfigurationFromFile(customConfigPath);
    
    expect(config.lint.U001).toBe('info');
  });

  test('should_throw_error_when_specified_config_file_does_not_exist', async () => {
    const nonExistentPath = join(tempDir, 'nonexistent.yaml');

    await expect(loader.loadConfigurationFromFile(nonExistentPath)).rejects.toThrow('Configuration file not found');
  });

  test('should_validate_area_prefix_format_when_invalid_prefix_provided', async () => {
    const invalidPrefixContent = `
unify:
  dom_cascade:
    area_prefix: "123invalid"
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, invalidPrefixContent);

    await expect(loader.loadConfiguration(tempDir)).rejects.toThrow('Invalid area prefix');
  });

  test('should_provide_helpful_error_messages_when_configuration_issues_found', async () => {
    const configContent = `
unify:
  lint:
    U001: invalid-level
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, configContent);

    try {
      await loader.loadConfiguration(tempDir);
      expect.unreachable('Should have thrown error');
    } catch (error) {
      expect(error.message).toContain('Invalid configuration');
      expect(error.message).toContain('U001');
      expect(error.message).toContain('invalid-level');
    }
  });

  test('should_support_nested_directory_search_when_config_not_in_current_directory', async () => {
    const nestedDir = join(tempDir, 'nested', 'deep');
    mkdirSync(nestedDir, { recursive: true });
    
    const configContent = `
unify:
  lint:
    U001: error
`;
    
    // Place config in parent directory
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, configContent);

    const config = await loader.loadConfiguration(nestedDir);
    
    expect(config.lint.U001).toBe('error');
  });

  test('should_handle_old_format_configuration_when_legacy_config_provided', async () => {
    const oldFormatContent = `
source: .
output: dist
clean: true
verbose: false
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, oldFormatContent);

    const config = await loader.loadConfiguration(tempDir);
    
    // Should use defaults when old format is detected
    expect(config.dom_cascade.version).toBe('1.0');
    expect(config.dom_cascade.area_prefix).toBe('unify-');
  });

  test('should_validate_complete_configuration_structure_when_full_config_provided', async () => {
    const fullConfigContent = `
unify:
  dom_cascade:
    version: "2.0"
    area_prefix: "app-"
  lint:
    U001: error
    U002: warn
    U003: info
    U004: off
    U005: warn
    U006: error
    U008: info
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, fullConfigContent);

    const config = await loader.loadConfiguration(tempDir);
    
    expect(config.dom_cascade.version).toBe('2.0');
    expect(config.dom_cascade.area_prefix).toBe('app-');
    expect(config.lint.U001).toBe('error');
    expect(config.lint.U002).toBe('warn');
    expect(config.lint.U003).toBe('info');
    expect(config.lint.U004).toBe('off');
    expect(config.lint.U005).toBe('warn');
    expect(config.lint.U006).toBe('error');
    expect(config.lint.U008).toBe('info');
  });

  test('should_provide_detailed_error_messages_when_configuration_validation_fails', async () => {
    const invalidConfig = `
unify:
  dom_cascade:
    version: "1.0"
    area_prefix: "123-invalid"
  lint:
    U999: error
    U001: invalid-severity
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, invalidConfig);

    try {
      await loader.loadConfiguration(tempDir);
      expect.unreachable('Should have thrown error');
    } catch (error) {
      expect(error.message).toContain('Invalid area prefix');
      expect(error.message).toContain('123-invalid');
    }
  });

  test('should_handle_empty_configuration_sections_when_partial_config_provided', async () => {
    const partialConfig = `
unify:
  dom_cascade:
  lint:
`;
    
    const configPath = join(tempDir, 'unify.config.yaml');
    writeFileSync(configPath, partialConfig);

    const config = await loader.loadConfiguration(tempDir);
    
    // Should merge with defaults
    expect(config.dom_cascade.version).toBe('1.0');
    expect(config.dom_cascade.area_prefix).toBe('unify-');
    expect(config.lint.U001).toBe('warn');
  });
});