/**
 * Configuration Loader
 * Loads and validates unify.config.yaml configuration files
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
// Simple YAML parser for basic configuration
// For now, supports only the simple structure we need

/**
 * ConfigLoader handles loading and validating configuration files
 */
export class ConfigLoader {
  constructor() {
    this.defaultConfig = {
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
    };
  }

  /**
   * Load configuration from directory (searches for unify.config.yaml/yml)
   * @param {string} searchDir - Directory to search for config file
   * @returns {Promise<Object>} Merged configuration object
   */
  async loadConfiguration(searchDir) {
    try {
      const configPath = this._findConfigFile(searchDir);
      
      if (!configPath) {
        return this.defaultConfig;
      }

      return this.loadConfigurationFromFile(configPath);
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  /**
   * Load configuration from specific file path
   * @param {string} filePath - Path to configuration file
   * @returns {Promise<Object>} Merged configuration object
   */
  async loadConfigurationFromFile(filePath) {
    try {
      if (!existsSync(filePath)) {
        throw new Error(`Configuration file not found: ${filePath}`);
      }

      const fileContent = readFileSync(filePath, 'utf8');
      const parsedConfig = this._parseYaml(fileContent, filePath);
      const mergedConfig = this._mergeWithDefaults(parsedConfig);
      
      this._validateConfiguration(mergedConfig);
      
      return mergedConfig;
    } catch (error) {
      if (error.message.includes('Configuration file not found') || 
          error.message.includes('Failed to parse configuration') ||
          error.message.includes('Invalid configuration') ||
          error.message.includes('Unsupported DOM Cascade version') ||
          error.message.includes('Invalid area prefix')) {
        throw error;
      }
      throw new Error(`Failed to load configuration from ${filePath}: ${error.message}`);
    }
  }

  /**
   * Find configuration file in directory hierarchy
   * @private
   * @param {string} startDir - Directory to start searching from
   * @returns {string|null} Path to config file or null if not found
   */
  _findConfigFile(startDir) {
    let currentDir = resolve(startDir);
    const configFilenames = ['unify.config.yaml', 'unify.config.yml'];
    
    // Search up the directory tree
    while (currentDir !== dirname(currentDir)) {
      for (const filename of configFilenames) {
        const configPath = join(currentDir, filename);
        if (existsSync(configPath)) {
          return configPath;
        }
      }
      currentDir = dirname(currentDir);
    }
    
    return null;
  }

  /**
   * Parse YAML content
   * @private
   * @param {string} content - YAML content
   * @param {string} filePath - File path for error messages
   * @returns {Object} Parsed configuration
   */
  _parseYaml(content, filePath) {
    try {
      // Simple YAML parser for our specific configuration structure
      const config = this._parseSimpleYaml(content);
      
      if (!config || typeof config !== 'object') {
        throw new Error('Configuration must be a YAML object');
      }

      // Check if this is the new format with 'unify' root key
      if (config.unify) {
        return config.unify;
      }

      // Check if this is the old format (has source, output, clean, verbose at root level)
      if (this._isOldFormat(config)) {
        // For old format, return empty object to use defaults
        // Old format only contained CLI options, not DOM Cascade configuration
        return {};
      }

      // If neither format is detected, treat as empty (use defaults)
      return {};
    } catch (error) {
      throw new Error(`Failed to parse configuration file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Check if configuration follows old format
   * @private
   * @param {Object} config - Parsed configuration object
   * @returns {boolean} True if old format
   */
  _isOldFormat(config) {
    const oldFormatKeys = ['source', 'output', 'clean', 'verbose'];
    return oldFormatKeys.some(key => config.hasOwnProperty(key));
  }

  /**
   * Simple YAML parser for basic configuration
   * @private
   * @param {string} content - YAML content
   * @returns {Object} Parsed object
   */
  _parseSimpleYaml(content) {
    const lines = content.split('\n');
    const result = {};
    let currentPath = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Check for invalid YAML syntax (list items without proper structure)
      if (trimmed.startsWith('-') && !trimmed.includes(':')) {
        throw new Error(`Invalid YAML syntax at line ${i + 1}: unexpected list item`);
      }
      
      const indent = line.length - line.trimStart().length;
      const colonIndex = trimmed.indexOf(':');
      
      // Lines without colons are invalid in our simple format
      if (colonIndex === -1) continue;
      
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();
      
      // Validate key format
      if (!key) {
        throw new Error(`Invalid YAML key at line ${i + 1}: empty key`);
      }
      
      // Adjust current path based on indentation
      const level = Math.floor(indent / 2);
      currentPath = currentPath.slice(0, level);
      currentPath.push(key);
      
      // Set value in result object
      let current = result;
      for (let j = 0; j < currentPath.length - 1; j++) {
        const pathKey = currentPath[j];
        if (!current[pathKey]) current[pathKey] = {};
        current = current[pathKey];
      }
      
      const finalKey = currentPath[currentPath.length - 1];
      
      if (value) {
        // Parse value
        let parsedValue = value;
        if (value.startsWith('"') && value.endsWith('"')) {
          parsedValue = value.slice(1, -1);
        } else if (value === 'true') {
          parsedValue = true;
        } else if (value === 'false') {
          parsedValue = false;
        } else if (!isNaN(value)) {
          parsedValue = Number(value);
        }
        
        current[finalKey] = parsedValue;
      } else {
        current[finalKey] = {};
      }
    }
    
    return result;
  }

  /**
   * Merge user configuration with defaults
   * @private
   * @param {Object} userConfig - User configuration
   * @returns {Object} Merged configuration
   */
  _mergeWithDefaults(userConfig) {
    return {
      dom_cascade: {
        ...this.defaultConfig.dom_cascade,
        ...(userConfig.dom_cascade || {})
      },
      lint: {
        ...this.defaultConfig.lint,
        ...(userConfig.lint || {})
      }
    };
  }

  /**
   * Validate configuration object
   * @private
   * @param {Object} config - Configuration to validate
   */
  _validateConfiguration(config) {
    // Validate DOM Cascade version
    const supportedVersions = ['1.0', '2.0'];
    if (!supportedVersions.includes(config.dom_cascade.version)) {
      throw new Error(`Unsupported DOM Cascade version: ${config.dom_cascade.version}. Supported versions: ${supportedVersions.join(', ')}`);
    }

    // Validate area prefix
    if (!/^[a-zA-Z][a-zA-Z0-9-]*-$/.test(config.dom_cascade.area_prefix)) {
      throw new Error(`Invalid area prefix: '${config.dom_cascade.area_prefix}'. Must start with letter, contain only alphanumeric characters and hyphens, and end with hyphen.`);
    }

    // Validate linter rules
    const validSeverities = ['error', 'warn', 'info', 'off'];
    const validRules = ['U001', 'U002', 'U003', 'U004', 'U005', 'U006', 'U008'];

    for (const [rule, severity] of Object.entries(config.lint)) {
      if (!validRules.includes(rule)) {
        throw new Error(`Invalid configuration: unknown linter rule '${rule}'. Valid rules: ${validRules.join(', ')}`);
      }
      
      if (!validSeverities.includes(severity)) {
        throw new Error(`Invalid configuration: invalid severity '${severity}' for rule '${rule}'. Valid severities: ${validSeverities.join(', ')}`);
      }
    }
  }
}