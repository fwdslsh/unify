/**
 * Integration Tests for Configuration File Processing in Build Command
 * Implements US-026: Configuration File Processing
 * 
 * Tests the complete configuration workflow from file discovery through
 * application in build commands, ensuring proper integration.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { BuildCommand } from '../../../src/cli/commands/build-command.js';
import { ConfigLoader } from '../../../src/config/config-loader.js';
import { TempProject } from '../../helpers/temp-project.js';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Build Command Configuration Integration', () => {
  let tempProject;
  let buildCommand;
  let configLoader;
  
  beforeEach(async () => {
    tempProject = new TempProject();
    buildCommand = new BuildCommand();
    configLoader = new ConfigLoader();
  });
  
  afterEach(async () => {
    if (tempProject) {
      await tempProject.cleanup();
    }
  });

  test('should_load_and_apply_configuration_when_unify_config_yaml_exists', async () => {
    // Create project structure
    await tempProject.addFile('index.html', '<h1>Hello World</h1>');
    
    // Create configuration file
    const configContent = `
unify:
  dom_cascade:
    version: "2.0"
    area_prefix: "custom-"
  lint:
    U001: error
    U002: warn
`;
    await tempProject.addFile('unify.config.yaml', configContent);

    // Load configuration and verify it works
    const config = await configLoader.loadConfiguration(tempProject.path());
    
    expect(config.dom_cascade.version).toBe('2.0');
    expect(config.dom_cascade.area_prefix).toBe('custom-');
    expect(config.lint.U001).toBe('error');
    expect(config.lint.U002).toBe('warn');
  });

  test('should_use_default_configuration_when_no_config_file_exists', async () => {
    // Create project structure without config file
    await tempProject.addFile('index.html', '<h1>Hello World</h1>');

    // Load configuration and verify defaults are used
    const config = await configLoader.loadConfiguration(tempProject.path());
    
    expect(config.dom_cascade.version).toBe('1.0');
    expect(config.dom_cascade.area_prefix).toBe('unify-');
    expect(config.lint.U001).toBe('warn');
    expect(config.lint.U002).toBe('error');
  });

  test('should_handle_old_format_configuration_gracefully_when_legacy_config_exists', async () => {
    // Create project structure
    await tempProject.addFile('index.html', '<h1>Hello World</h1>');
    
    // Create old format configuration file
    const oldConfigContent = `
source: .
output: dist
clean: true
verbose: false
`;
    await tempProject.addFile('unify.config.yaml', oldConfigContent);

    // Load configuration and verify it falls back to defaults
    const config = await configLoader.loadConfiguration(tempProject.path());
    
    expect(config.dom_cascade.version).toBe('1.0');
    expect(config.dom_cascade.area_prefix).toBe('unify-');
    expect(config.lint.U001).toBe('warn');
  });

  test('should_validate_configuration_and_fail_build_when_invalid_config_provided', async () => {
    // Create project structure
    await tempProject.addFile('index.html', '<h1>Hello World</h1>');
    
    // Create invalid configuration file
    const invalidConfigContent = `
unify:
  dom_cascade:
    version: "999.0"
    area_prefix: "123invalid"
`;
    await tempProject.addFile('unify.config.yaml', invalidConfigContent);

    // Attempt to load configuration and expect failure
    await expect(configLoader.loadConfiguration(tempProject.path()))
      .rejects.toThrow('Unsupported DOM Cascade version');
  });

  test('should_search_up_directory_hierarchy_when_config_not_in_working_directory', async () => {
    // Create nested project structure
    await tempProject.addFile('src/pages/index.html', '<h1>Hello World</h1>');
    
    // Create configuration in root directory
    const configContent = `
unify:
  dom_cascade:
    version: "2.0"
    area_prefix: "nested-"
`;
    await tempProject.addFile('unify.config.yaml', configContent);

    // Load configuration from nested directory
    const nestedPath = join(tempProject.path(), 'src', 'pages');
    const config = await configLoader.loadConfiguration(nestedPath);
    
    expect(config.dom_cascade.version).toBe('2.0');
    expect(config.dom_cascade.area_prefix).toBe('nested-');
  });

  test('should_prefer_yaml_over_yml_when_both_config_files_exist', async () => {
    // Create project structure
    await tempProject.addFile('index.html', '<h1>Hello World</h1>');
    
    // Create both .yaml and .yml configuration files
    const yamlConfigContent = `
unify:
  dom_cascade:
    version: "2.0"
    area_prefix: "yaml-"
`;
    
    const ymlConfigContent = `
unify:
  dom_cascade:
    version: "1.0"
    area_prefix: "yml-"
`;
    
    await tempProject.addFile('unify.config.yaml', yamlConfigContent);
    await tempProject.addFile('unify.config.yml', ymlConfigContent);

    // Load configuration and verify .yaml is preferred
    const config = await configLoader.loadConfiguration(tempProject.path());
    
    expect(config.dom_cascade.version).toBe('2.0');
    expect(config.dom_cascade.area_prefix).toBe('yaml-');
  });

  test('should_handle_partial_configuration_sections_when_incomplete_config_provided', async () => {
    // Create project structure
    await tempProject.addFile('index.html', '<h1>Hello World</h1>');
    
    // Create partial configuration (only lint section)
    const partialConfigContent = `
unify:
  lint:
    U001: error
    U002: off
`;
    await tempProject.addFile('unify.config.yaml', partialConfigContent);

    // Load configuration and verify merging with defaults
    const config = await configLoader.loadConfiguration(tempProject.path());
    
    // DOM cascade should use defaults
    expect(config.dom_cascade.version).toBe('1.0');
    expect(config.dom_cascade.area_prefix).toBe('unify-');
    
    // Lint should use overrides where specified, defaults elsewhere
    expect(config.lint.U001).toBe('error');
    expect(config.lint.U002).toBe('off');
    expect(config.lint.U003).toBe('warn'); // Default value
  });

  test('should_validate_area_prefix_format_when_invalid_prefix_in_config', async () => {
    // Create project structure
    await tempProject.addFile('index.html', '<h1>Hello World</h1>');
    
    // Create configuration with invalid area prefix
    const invalidPrefixContent = `
unify:
  dom_cascade:
    version: "1.0"
    area_prefix: "123-invalid"
`;
    await tempProject.addFile('unify.config.yaml', invalidPrefixContent);

    // Attempt to load configuration and expect failure
    await expect(configLoader.loadConfiguration(tempProject.path()))
      .rejects.toThrow('Invalid area prefix');
  });

  test('should_validate_linter_rules_and_severities_when_invalid_lint_config_provided', async () => {
    // Create project structure
    await tempProject.addFile('index.html', '<h1>Hello World</h1>');
    
    // Create configuration with invalid linter rules
    const invalidLintContent = `
unify:
  lint:
    U999: error
`;
    await tempProject.addFile('unify.config.yaml', invalidLintContent);

    // Attempt to load configuration and expect failure with helpful message
    try {
      await configLoader.loadConfiguration(tempProject.path());
      expect.unreachable('Should have thrown error');
    } catch (error) {
      expect(error.message).toContain('Invalid configuration');
      expect(error.message).toContain('U999'); // Should mention the invalid rule
    }
  });

  test('should_handle_empty_configuration_file_when_empty_config_provided', async () => {
    // Create project structure
    await tempProject.addFile('index.html', '<h1>Hello World</h1>');
    
    // Create empty configuration file
    await tempProject.addFile('unify.config.yaml', '');

    // Load configuration and verify defaults are used
    const config = await configLoader.loadConfiguration(tempProject.path());
    
    expect(config.dom_cascade.version).toBe('1.0');
    expect(config.dom_cascade.area_prefix).toBe('unify-');
    expect(config.lint.U001).toBe('warn');
  });

  test('should_apply_area_prefix_configuration_to_build_process_when_custom_prefix_specified', async () => {
    // Create project structure with custom area prefix usage
    await tempProject.addFile('_layout.html', `
<!DOCTYPE html>
<html>
<head><title>Layout</title></head>
<body>
  <div class="app-content">Default content</div>
</body>
</html>
`);

    await tempProject.addFile('index.html', `
<div class="app-content">
  <h1>Page Content</h1>
</div>
`);
    
    // Create configuration with custom area prefix
    const configContent = `
unify:
  dom_cascade:
    version: "2.0"
    area_prefix: "app-"
`;
    await tempProject.addFile('unify.config.yaml', configContent);

    // Load configuration and verify it includes custom prefix
    const config = await configLoader.loadConfiguration(tempProject.path());
    
    expect(config.dom_cascade.area_prefix).toBe('app-');
    
    // Verify the build command can use the configuration
    const buildOptions = {
      source: tempProject.path(),
      output: tempProject.path('dist'),
      config: config
    };

    const result = await buildCommand.execute(buildOptions);
    
    // Build should succeed with the custom area prefix configuration
    expect(result.success).toBe(true);
  });
});