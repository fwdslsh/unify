/**
 * Dependency Tracking System for unify
 * Tracks include relationships for selective rebuilds
 */

import path from 'path';
import { logger } from '../utils/logger.js';
import { extractIncludeDependencies } from './include-processor.js';

/**
 * Dependency tracker for managing include relationships
 */
export class DependencyTracker {
  constructor() {
    // Maps page file path to array of include file paths it depends on
    this.includesInPage = new Map();
    
    // Maps include file path to array of page file paths that depend on it
    this.pagesByInclude = new Map();
    
    // Cache of all known files for efficient lookups
    this.knownFiles = new Set();
  }
  
  /**
   * Record dependencies for a page
   * @param {string} pagePath - Path to the page file
   * @param {string[]} includePaths - Array of include file paths
   * @param {string[]} layoutPaths - Array of layout file paths (optional)
   */
  recordDependencies(pagePath, includePaths, layoutPaths = []) {
    // Clear existing dependencies for this page
    this.clearPageDependencies(pagePath);
    
    // Combine include and layout dependencies
    const allDependencies = [...includePaths, ...layoutPaths];
    
    // Record new dependencies
    if (allDependencies.length > 0) {
      this.includesInPage.set(pagePath, [...allDependencies]);
      
      // Update reverse mapping
      for (const dependencyPath of allDependencies) {
        if (!this.pagesByInclude.has(dependencyPath)) {
          this.pagesByInclude.set(dependencyPath, []);
        }
        this.pagesByInclude.get(dependencyPath).push(pagePath);
      }
      
      logger.debug(`Recorded ${allDependencies.length} dependencies (${includePaths.length} includes, ${layoutPaths.length} layouts) for ${pagePath}`);
    }
    
    // Track all known files
    this.knownFiles.add(pagePath);
    allDependencies.forEach(path => this.knownFiles.add(path));
  }
  
  /**
   * Clear dependencies for a specific page
   * @param {string} pagePath - Path to the page file
   */
  clearPageDependencies(pagePath) {
    const existingIncludes = this.includesInPage.get(pagePath);
    
    if (existingIncludes) {
      // Remove from reverse mapping
      for (const includePath of existingIncludes) {
        const pages = this.pagesByInclude.get(includePath);
        if (pages) {
          const index = pages.indexOf(pagePath);
          if (index > -1) {
            pages.splice(index, 1);
          }
          
          // Clean up empty arrays
          if (pages.length === 0) {
            this.pagesByInclude.delete(includePath);
          }
        }
      }
      
      this.includesInPage.delete(pagePath);
    }
  }
  
  /**
   * Get all pages that depend on a specific include file (alias for getAffectedPages)
   * @param {string} includePath - Path to the include file
   * @returns {string[]} Array of page paths that depend on the include
   */
  getDependentPages(includePath) {
    return this.getAffectedPages(includePath);
  }

  /**
   * Optimized Get all pages that depend on a specific include file
   * @param {string} includePath - Path to the include file
   * @returns {string[]} Array of page paths that depend on the include
   */
  getAffectedPages(includePath, cache = new Map()) {
    if (cache.has(includePath)) {
      return cache.get(includePath);
    }

    const directlyAffected = this.pagesByInclude.get(includePath) || [];
    const allAffected = new Set(directlyAffected);

    // Check for nested dependencies - if this include is included by other includes
    const includesUsingThis = [];
    for (const [page, includes] of this.includesInPage.entries()) {
      if (includes.includes(includePath) && this.isIncludeFile(page)) {
        includesUsingThis.push(page);
      }
    }

    // Recursively find pages affected by nested includes
    for (const nestedInclude of includesUsingThis) {
      const nestedAffected = this.getAffectedPages(nestedInclude, cache);
      nestedAffected.forEach(page => allAffected.add(page));
    }

    const result = Array.from(allAffected);
    cache.set(includePath, result);
    logger.debug(`Include ${includePath} affects ${result.length} pages: ${result.join(', ')}`);

    return result;
  }
  
  /**
   * Get all includes used by a specific page
   * @param {string} pagePath - Path to the page file
   * @returns {string[]} Array of include paths used by the page
   */
  getPageDependencies(pagePath) {
    return this.includesInPage.get(pagePath) || [];
  }
  
  /**
   * Check if a file is an include (used by other files but not a main page)
   * @param {string} filePath - Path to check
   * @returns {boolean} True if file is used as an include
   */
  isIncludeFile(filePath) {
    return this.pagesByInclude.has(filePath);
  }
  
  /**
   * Check if a file is a main page (not used as an include by others)
   * @param {string} filePath - Path to check
   * @returns {boolean} True if file is a main page
   */
  isMainPage(filePath) {
    return this.includesInPage.has(filePath) && !this.pagesByInclude.has(filePath);
  }
  
  /**
   * Get all known files
   * @returns {string[]} Array of all known file paths
   */
  getAllFiles() {
    return Array.from(this.knownFiles);
  }
  
  /**
   * Get all main pages (files that are not includes)
   * @returns {string[]} Array of main page paths
   */
  getMainPages() {
    return this.getAllFiles().filter(file => !this.isIncludeFile(file) || this.includesInPage.has(file));
  }
  
  /**
   * Get all include files (files used by other files)
   * @returns {string[]} Array of include file paths
   */
  getIncludeFiles() {
    return Array.from(this.pagesByInclude.keys());
  }
  
  /**
   * Analyze and record dependencies from HTML content
   * @param {string} pagePath - Path to the page file
   * @param {string} htmlContent - HTML content to analyze
   * @param {string} sourceRoot - Source root directory
   */
  async analyzePage(pagePath, htmlContent, sourceRoot) {
    const includeDependencies = extractIncludeDependencies(htmlContent, pagePath, sourceRoot);
    const layoutDependencies = await this.extractLayoutDependencies(htmlContent, pagePath, sourceRoot);
    this.recordDependencies(pagePath, includeDependencies, layoutDependencies);
    
    // Also analyze nested dependencies for deeper tracking
    await this.analyzeNestedDependencies(pagePath, sourceRoot);
  }

  /**
   * Extract layout dependencies from HTML content
   * @param {string} htmlContent - HTML content to analyze
   * @param {string} pagePath - Path to the current page
   * @param {string} sourceRoot - Source root directory
   * @returns {Promise<string[]>} Array of resolved layout file paths
   */
  async extractLayoutDependencies(htmlContent, pagePath, sourceRoot) {
    const dependencies = [];
    
    // Look for explicit data-layout attribute
    const layoutMatch = htmlContent.match(/data-layout=["']([^"']+)["']/i);
    
    if (layoutMatch) {
      const layoutPath = layoutMatch[1];
      
      try {
        // Resolve layout path (similar to unified-html-processor logic)
        let resolvedLayoutPath;
        
        if (layoutPath.startsWith("/")) {
          // Absolute path from source root
          resolvedLayoutPath = path.join(sourceRoot, layoutPath.substring(1));
        } else if (layoutPath.includes('/')) {
          // Path with directory structure, relative to source root
          resolvedLayoutPath = path.join(sourceRoot, layoutPath);
        } else {
          // Bare filename, relative to current page directory
          const pageDir = path.dirname(pagePath);
          resolvedLayoutPath = path.join(pageDir, layoutPath);
        }
        
        dependencies.push(resolvedLayoutPath);
        logger.debug(`Extracted explicit layout dependency: ${layoutPath} -> ${resolvedLayoutPath}`);
      } catch (error) {
        // Log warning but continue - dependency tracking shouldn't break builds
        logger.warn(`Could not resolve layout dependency: ${layoutPath} in ${pagePath}`);
      }
    }
    
    // Also discover auto-discovered layouts (folder-scoped _layout.html, fallback layouts)
    try {
      const { LayoutDiscovery } = await import('./layout-discovery.js');
      const discovery = new LayoutDiscovery();
      const autoDiscoveredLayouts = await discovery.getLayoutDependencies(pagePath, sourceRoot);
      
      // Add auto-discovered layouts that aren't already in dependencies
      for (const layoutPath of autoDiscoveredLayouts) {
        if (!dependencies.includes(layoutPath)) {
          dependencies.push(layoutPath);
          logger.debug(`Extracted auto-discovered layout dependency: ${layoutPath}`);
        }
      }
    } catch (error) {
      // Log warning but continue - dependency tracking shouldn't break builds
      logger.warn(`Could not discover auto-layout dependencies for ${pagePath}: ${error.message}`);
    }
    
    return dependencies;
  }

  /**
   * Analyze nested dependencies by reading include files
   * @param {string} pagePath - Path to the page file
   * @param {string} sourceRoot - Source root directory
   */
  async analyzeNestedDependencies(pagePath, sourceRoot) {
    const directDependencies = this.getPageDependencies(pagePath);
    
    for (const includePath of directDependencies) {
      try {
        // Read the include file to find its dependencies
        const fs = await import('fs/promises');
        const includeContent = await fs.readFile(includePath, 'utf-8');
        const nestedDependencies = extractIncludeDependencies(includeContent, includePath, sourceRoot);
        
        if (nestedDependencies.length > 0) {
          this.recordDependencies(includePath, nestedDependencies);
          logger.debug(`Found ${nestedDependencies.length} nested dependencies in ${includePath}`);
        }
      } catch (error) {
        // Include file might not exist or be readable - log but continue
        logger.debug(`Could not analyze nested dependencies for ${includePath}: ${error.message}`);
      }
    }
  }
  
  /**
   * Remove all records of a file (when file is deleted)
   * @param {string} filePath - Path to the deleted file
   */
  removeFile(filePath) {
    // Clear if it's a page
    this.clearPageDependencies(filePath);
    
    // Clear if it's an include
    if (this.pagesByInclude.has(filePath)) {
      const affectedPages = this.pagesByInclude.get(filePath);
      this.pagesByInclude.delete(filePath);
      
      // Update affected pages
      for (const pagePath of affectedPages) {
        const includes = this.includesInPage.get(pagePath);
        if (includes) {
          const index = includes.indexOf(filePath);
          if (index > -1) {
            includes.splice(index, 1);
          }
        }
      }
    }
    
    this.knownFiles.delete(filePath);
    logger.debug(`Removed file from dependency tracking: ${filePath}`);
  }
  
  /**
   * Get dependency statistics for debugging
   * @returns {Object} Statistics about tracked dependencies
   */
  getStats() {
    return {
      totalFiles: this.knownFiles.size,
      pagesWithDependencies: this.includesInPage.size,
      includeFiles: this.pagesByInclude.size,
      totalDependencyRelationships: Array.from(this.includesInPage.values())
        .reduce((sum, deps) => sum + deps.length, 0)
    };
  }
  
  /**
   * Clear all dependency data
   */
  clear() {
    this.includesInPage.clear();
    this.pagesByInclude.clear();
    this.knownFiles.clear();
    logger.debug('Cleared all dependency data');
  }
  
  /**
   * Export dependency data for debugging or persistence
   * @returns {Object} Serializable dependency data
   */
  export() {
    return {
      includesInPage: Object.fromEntries(this.includesInPage),
      pagesByInclude: Object.fromEntries(this.pagesByInclude),
      knownFiles: Array.from(this.knownFiles)
    };
  }
  
  /**
   * Import dependency data
   * @param {Object} data - Dependency data to import
   */
  import(data) {
    this.clear();
    
    if (data.includesInPage) {
      this.includesInPage = new Map(Object.entries(data.includesInPage));
    }
    
    if (data.pagesByInclude) {
      this.pagesByInclude = new Map(Object.entries(data.pagesByInclude));
    }
    
    if (data.knownFiles) {
      this.knownFiles = new Set(data.knownFiles);
    }
  }
}