/**
 * Short Name Resolver
 * Implements US-027: Short Name Layout Resolution
 * 
 * Provides pattern matching and directory traversal for resolving short names
 * like "blog" to actual layout files like "_blog.layout.html"
 * 
 * Search order:
 * 1. Current directory up through parent directories to source root
 * 2. _includes directory as fallback
 * 
 * Pattern precedence (within each directory):
 * 1. Exact filename match (blog.html)
 * 2. Underscore prefix match (_blog.html)
 * 3. Layout suffix match (_blog.layout.html)
 * 
 * Supports both .html and .htm extensions
 */

import { resolve, dirname, join, relative } from 'path';
import { existsSync, statSync } from 'fs';

/**
 * ShortNameResolver handles resolution of short names to layout files
 */
export class ShortNameResolver {
  constructor(logger = null) {
    this.logger = logger || {
      logDebug: () => {},
      logInfo: () => {}
    };
    
    // Supported file extensions for layouts
    this.extensions = ['.html', '.htm'];
    
    // Pattern definitions with precedence order (lower index = higher priority)
    this.patterns = [
      {
        name: 'exact',
        generateFilename: (shortName) => `${shortName}`,
        description: 'exact filename match'
      },
      {
        name: 'underscore-prefix',
        generateFilename: (shortName) => `_${shortName}`,
        description: 'underscore prefix pattern'
      },
      {
        name: 'layout-suffix',
        generateFilename: (shortName) => `_${shortName}.layout`,
        description: 'layout suffix pattern'
      }
    ];
  }

  /**
   * Resolve a short name to a layout file path
   * @param {string} shortName - The short name to resolve (e.g., "blog")
   * @param {string} startDirectory - Directory to start searching from
   * @param {string} sourceRoot - Source root directory (search boundary)
   * @returns {Object} Resolution result
   */
  resolve(shortName, startDirectory, sourceRoot) {
    const result = {
      found: false,
      shortName: shortName,
      layoutPath: null,
      searchPath: null,
      source: null,
      reason: 'Layout not found',
      patternsChecked: [],
      searchDirectories: []
    };

    // Validate input parameters
    if (!this._validateInputs(shortName, startDirectory, sourceRoot, result)) {
      return result;
    }

    this.logger.logDebug(`Starting short name resolution for "${shortName}"`, {
      startDirectory,
      sourceRoot
    });

    try {
      // Get search directories in order: current -> parents -> _includes
      const searchDirectories = this._getSearchDirectories(startDirectory, sourceRoot);
      result.searchDirectories = searchDirectories;

      this.logger.logDebug(`Search directories: ${searchDirectories.join(', ')}`);

      // Search each directory in order
      for (const directory of searchDirectories) {
        this.logger.logDebug(`Searching directory: ${directory}`);
        
        const directoryResult = this._searchDirectory(shortName, directory);
        
        if (directoryResult.found) {
          result.found = true;
          result.layoutPath = directoryResult.layoutPath;
          result.searchPath = directory;
          result.source = directoryResult.source;
          result.reason = `Found ${directoryResult.source} in ${relative(sourceRoot, directory)}: ${directoryResult.description}`;
          result.patternsChecked = directoryResult.patternsChecked;
          
          this.logger.logInfo(`Short name "${shortName}" resolved to: ${result.layoutPath}`);
          return result;
        }
        
        // Accumulate patterns checked across all directories
        result.patternsChecked.push(...directoryResult.patternsChecked);
      }

      // No layout found in any directory
      result.reason = `Layout "${shortName}" not found in any search directory`;
      this.logger.logDebug(`Short name resolution failed for "${shortName}"`);

    } catch (error) {
      result.reason = `Error during short name resolution: ${error.message}`;
      this.logger.logDebug(`Error resolving short name "${shortName}": ${error.message}`);
    }

    return result;
  }

  /**
   * Validate input parameters
   * @private
   * @param {string} shortName - Short name to validate
   * @param {string} startDirectory - Start directory to validate
   * @param {string} sourceRoot - Source root to validate
   * @param {Object} result - Result object to update with error info
   * @returns {boolean} True if inputs are valid
   */
  _validateInputs(shortName, startDirectory, sourceRoot, result) {
    if (shortName === null || shortName === undefined) {
      result.reason = 'Invalid short name provided';
      return false;
    }

    if (typeof shortName !== 'string') {
      result.reason = 'Invalid short name provided';
      return false;
    }

    if (shortName.trim() === '') {
      result.reason = 'Empty short name provided';
      return false;
    }

    if (!startDirectory || typeof startDirectory !== 'string') {
      result.reason = 'Invalid start directory provided';
      return false;
    }

    if (!sourceRoot || typeof sourceRoot !== 'string') {
      result.reason = 'Invalid source root provided';
      return false;
    }

    // Check if start directory exists
    try {
      if (!existsSync(startDirectory)) {
        result.reason = 'Start directory does not exist';
        return false;
      }

      const stats = statSync(startDirectory);
      if (!stats.isDirectory()) {
        result.reason = 'Start path is not a directory';
        return false;
      }
    } catch (error) {
      result.reason = `Cannot access start directory: ${error.message}`;
      return false;
    }

    return true;
  }

  /**
   * Get ordered list of directories to search
   * @private
   * @param {string} startDirectory - Directory to start from
   * @param {string} sourceRoot - Source root boundary
   * @returns {string[]} Array of directory paths to search
   */
  _getSearchDirectories(startDirectory, sourceRoot) {
    const directories = [];
    const absoluteStartDir = resolve(startDirectory);
    const absoluteSourceRoot = resolve(sourceRoot);

    // Start from the start directory and climb to source root
    let currentDir = absoluteStartDir;
    
    while (currentDir.startsWith(absoluteSourceRoot) && currentDir.length >= absoluteSourceRoot.length) {
      directories.push(currentDir);
      
      if (currentDir === absoluteSourceRoot) {
        break;
      }
      
      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        break; // Reached filesystem root
      }
      currentDir = parentDir;
    }

    // Add _includes directory as fallback
    const includesDir = join(absoluteSourceRoot, '_includes');
    if (existsSync(includesDir) && !directories.includes(includesDir)) {
      directories.push(includesDir);
    }

    return directories;
  }

  /**
   * Search a single directory for the short name pattern
   * @private
   * @param {string} shortName - Short name to search for
   * @param {string} directory - Directory to search in
   * @returns {Object} Search result for this directory
   */
  _searchDirectory(shortName, directory) {
    const result = {
      found: false,
      layoutPath: null,
      source: null,
      description: null,
      patternsChecked: []
    };

    if (!existsSync(directory)) {
      return result;
    }

    // Check each pattern in precedence order
    for (const pattern of this.patterns) {
      const patternResult = this._checkPattern(shortName, directory, pattern);
      result.patternsChecked.push(patternResult);
      
      if (patternResult.found) {
        result.found = true;
        result.layoutPath = patternResult.layoutPath;
        result.source = pattern.name;
        result.description = pattern.description;
        return result;
      }
    }

    return result;
  }

  /**
   * Check a specific pattern in a directory
   * @private
   * @param {string} shortName - Short name to check
   * @param {string} directory - Directory to check in
   * @param {Object} pattern - Pattern definition
   * @returns {Object} Pattern check result
   */
  _checkPattern(shortName, directory, pattern) {
    const result = {
      pattern: pattern.name,
      found: false,
      layoutPath: null,
      filesChecked: []
    };

    const baseFilename = pattern.generateFilename(shortName);
    
    // Check each extension
    for (const extension of this.extensions) {
      const filename = `${baseFilename}${extension}`;
      const filePath = join(directory, filename);
      
      result.filesChecked.push(filename);
      
      if (existsSync(filePath)) {
        try {
          const stats = statSync(filePath);
          if (stats.isFile()) {
            result.found = true;
            result.layoutPath = filePath;
            this.logger.logDebug(`Found match: ${filename} in ${directory}`);
            return result;
          }
        } catch (error) {
          this.logger.logDebug(`Error checking file ${filePath}: ${error.message}`);
        }
      }
    }

    return result;
  }

  /**
   * Get information about supported patterns
   * @returns {Object[]} Array of pattern information
   */
  getSupportedPatterns() {
    return this.patterns.map(pattern => ({
      name: pattern.name,
      description: pattern.description,
      example: `${pattern.generateFilename('blog')}.html`
    }));
  }

  /**
   * Get supported file extensions
   * @returns {string[]} Array of supported extensions
   */
  getSupportedExtensions() {
    return [...this.extensions];
  }

  /**
   * Create a mock result for testing purposes
   * @param {Object} overrides - Properties to override in the result
   * @returns {Object} Mock result object
   */
  _createMockResult(overrides = {}) {
    return {
      found: false,
      shortName: null,
      layoutPath: null,
      searchPath: null,
      source: null,
      reason: 'Mock result',
      patternsChecked: [],
      searchDirectories: [],
      ...overrides
    };
  }
}