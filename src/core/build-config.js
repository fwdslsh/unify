/**
 * Build Configuration System for Unify
 * Centralizes configuration for file patterns, naming conventions, and directory structures
 */

import path from 'path';

/**
 * Default configuration values for backwards compatibility
 */
const DEFAULT_CONFIG = {
  // Source and output directories
  source: 'src',
  output: 'dist',
  
  // Build behavior
  clean: true,
  prettyUrls: false,
  baseUrl: 'https://example.com',
  sitemap: true,
  minify: false,
  
  // File pattern configuration
  includesDir: '_includes',
  layoutsDir: null, // null means auto-discovery + includes dir
  componentPattern: '_*', // Glob pattern for non-emitting component files
  layoutPattern: '*layout.html|*layout.htm', // Patterns for layout files
  layoutFilename: 'layout.html', // Default layout filename in includes directory
  
  // Advanced options
  cache: true,
  cacheDir: '.unify-cache',
  failOn: null,
  verbose: false,
};

/**
 * Build configuration class that manages file patterns and naming conventions
 */
export class BuildConfig {
  constructor(options = {}) {
    // Filter out null/undefined values from options to use defaults
    const filteredOptions = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== null && value !== undefined) {
        filteredOptions[key] = value;
      }
    }
    
    this.config = { ...DEFAULT_CONFIG, ...filteredOptions };
    this._compilePatterns();
  }

  /**
   * Compile glob patterns into regular expressions for performance
   * @private
   */
  _compilePatterns() {
    // Convert glob pattern to regex for component matching
    this.componentRegex = this._globToRegex(this.config.componentPattern);
    
    // Convert layout patterns to regex array
    const layoutPatterns = this.config.layoutPattern.split('|');
    this.layoutRegexes = layoutPatterns.map(pattern => this._globToRegex(pattern));
  }

  /**
   * Convert a simple glob pattern to regex
   * Supports * (wildcard) and basic patterns
   * @param {string} pattern - Glob pattern
   * @returns {RegExp} Compiled regular expression
   * @private
   */
  _globToRegex(pattern) {
    // Escape special regex characters except *
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Convert * to regex wildcard
    const regex = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${regex}$`);
  }

  /**
   * Check if a filename matches the component pattern (non-emitting)
   * @param {string} filename - File name to check
   * @returns {boolean} True if file should not be emitted
   */
  isNonEmittingFile(filename) {
    return this.componentRegex.test(filename);
  }

  /**
   * Check if a filename matches any layout pattern
   * @param {string} filename - File name to check
   * @returns {boolean} True if file is a layout
   */
  isLayoutFile(filename) {
    return this.layoutRegexes.some(regex => regex.test(filename));
  }

  /**
   * Check if a directory path should be non-emitting
   * @param {string} dirPath - Directory path (relative to source)
   * @returns {boolean} True if directory should not be emitted
   */
  isNonEmittingDirectory(dirPath) {
    const pathParts = dirPath.split(path.sep);
    
    // Check if any path component matches the component pattern
    // Only check directory names, not file patterns within the path
    return pathParts.some(part => {
      // Skip checking if this looks like a filename (has extension)
      if (part.includes('.') && path.extname(part)) {
        return false;
      }
      return this.isNonEmittingFile(part);
    });
  }

  /**
   * Get the includes directory path relative to source root
   * @returns {string} Includes directory path
   */
  getIncludesDir() {
    return this.config.includesDir;
  }

  /**
   * Get the layouts directory path relative to source root
   * Returns null if using auto-discovery
   * @returns {string|null} Layouts directory path or null for auto-discovery
   */
  getLayoutsDir() {
    return this.config.layoutsDir;
  }

  /**
   * Get the default layout filename to look for in includes directory
   * @returns {string} Default layout filename
   */
  getLayoutFilename() {
    return this.config.layoutFilename;
  }

  /**
   * Check if a directory is the configured includes directory
   * @param {string} dirPath - Directory path to check
   * @param {string} sourceRoot - Source root directory
   * @returns {boolean} True if this is the includes directory
   */
  isIncludesDirectory(dirPath, sourceRoot) {
    const includesPath = path.join(sourceRoot, this.config.includesDir);
    return path.resolve(dirPath) === path.resolve(includesPath);
  }

  /**
   * Check if a directory is the configured layouts directory
   * @param {string} dirPath - Directory path to check
   * @param {string} sourceRoot - Source root directory
   * @returns {boolean} True if this is the layouts directory
   */
  isLayoutsDirectory(dirPath, sourceRoot) {
    if (!this.config.layoutsDir) {
      return false; // No specific layouts directory configured
    }
    const layoutsPath = path.join(sourceRoot, this.config.layoutsDir);
    return path.resolve(dirPath) === path.resolve(layoutsPath);
  }

  /**
   * Get all configured non-emitting directory patterns
   * @returns {string[]} Array of directory patterns that should not be emitted
   */
  getNonEmittingDirectories() {
    const dirs = [this.config.includesDir];
    if (this.config.layoutsDir) {
      dirs.push(this.config.layoutsDir);
    }
    return dirs;
  }

  /**
   * Get a copy of the raw configuration object
   * @returns {Object} Configuration object
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration with new options
   * @param {Object} options - New configuration options
   */
  update(options) {
    this.config = { ...this.config, ...options };
    this._compilePatterns();
  }

  /**
   * Validate the configuration for common issues
   * @throws {Error} If configuration is invalid
   */
  validate() {
    // Check that includes directory doesn't conflict with layouts directory
    if (this.config.layoutsDir && this.config.includesDir === this.config.layoutsDir) {
      throw new Error('Includes directory and layouts directory cannot be the same');
    }

    // Validate patterns are not empty
    if (!this.config.componentPattern) {
      throw new Error('Component pattern cannot be empty');
    }
    
    if (!this.config.layoutPattern) {
      throw new Error('Layout pattern cannot be empty');
    }

    // Validate layout filename
    if (!this.config.layoutFilename || this.config.layoutFilename.trim() === '') {
      throw new Error('Layout filename cannot be empty');
    }
  }
}

/**
 * Create a build configuration from CLI arguments and options
 * @param {Object} options - Build options from CLI or API
 * @returns {BuildConfig} Configured BuildConfig instance
 */
export function createBuildConfig(options = {}) {
  const config = new BuildConfig(options);
  config.validate();
  return config;
}