/**
 * Dependency Tracker for Unify
 * Implements US-009: Asset Copying and Management
 * 
 * Tracks dependencies between pages, fragments, and assets
 * to enable efficient incremental builds and change propagation.
 */

import { AssetTracker } from './asset-tracker.js';

/**
 * DependencyTracker class for managing file dependencies
 */
export class DependencyTracker {
  constructor() {
    // Maps page path to array of dependency paths
    this.pageDependencies = new Map();
    
    // Maps dependency path to array of pages that depend on it
    this.dependentPages = new Map();
    
    // Asset tracker for asset-specific dependencies
    this.assetTracker = new AssetTracker();
  }

  /**
   * Track dependencies for a page based on its content
   * @param {string} pagePath - Path to the page file
   * @param {string} content - Page content to analyze
   * @param {string} sourceRoot - Source root directory
   */
  async trackPageDependencies(pagePath, content, sourceRoot) {
    const dependencies = new Set();

    // Extract asset dependencies
    const assetRefs = this.assetTracker.extractAssetReferences(content, pagePath, sourceRoot);
    for (const assetRef of assetRefs) {
      dependencies.add(assetRef);
    }

    // Extract fragment dependencies (data-unify imports)
    const fragmentRefs = this._extractFragmentReferences(content, pagePath, sourceRoot);
    for (const fragmentRef of fragmentRefs) {
      dependencies.add(fragmentRef);
    }

    // Extract legacy includes (SSI includes)
    const includeRefs = this._extractIncludeReferences(content, pagePath, sourceRoot);
    for (const includeRef of includeRefs) {
      dependencies.add(includeRef);
    }

    // Update dependency mappings
    this._updateDependencyMappings(pagePath, Array.from(dependencies));
  }

  /**
   * Get all dependencies for a specific page
   * @param {string} pagePath - Path to the page file
   * @returns {string[]} Array of dependency paths
   */
  getPageDependencies(pagePath) {
    return this.pageDependencies.get(pagePath) || [];
  }

  /**
   * Get all pages that depend on a specific file
   * @param {string} dependencyPath - Path to the dependency file
   * @returns {string[]} Array of page paths that depend on this file
   */
  getDependentPages(dependencyPath) {
    return this.dependentPages.get(dependencyPath) || [];
  }

  /**
   * Get all pages transitively dependent on a specific dependency path
   * This includes direct dependents and dependents of dependents, recursively
   * @param {string} dependencyPath - Path to dependency (fragment/layout)
   * @returns {string[]} List of all transitively dependent page paths
   */
  getAllTransitiveDependents(dependencyPath) {
    const visited = new Set();
    const result = new Set();
    
    const collectDependents = (path) => {
      if (visited.has(path)) {
        return; // Avoid infinite loops
      }
      visited.add(path);
      
      const directDependents = this.dependentPages.get(path) || [];
      for (const dependent of directDependents) {
        result.add(dependent);
        // Recursively collect dependents of this dependent
        collectDependents(dependent);
      }
    };
    
    collectDependents(dependencyPath);
    return Array.from(result);
  }

  /**
   * Remove all dependencies for a page (when page is deleted)
   * @param {string} pagePath - Path to the deleted page
   */
  removePage(pagePath) {
    const dependencies = this.pageDependencies.get(pagePath) || [];
    
    // Remove this page from all dependency mappings
    for (const depPath of dependencies) {
      const dependentPages = this.dependentPages.get(depPath) || [];
      const index = dependentPages.indexOf(pagePath);
      if (index > -1) {
        dependentPages.splice(index, 1);
      }
      
      // Clean up empty arrays
      if (dependentPages.length === 0) {
        this.dependentPages.delete(depPath);
      } else {
        this.dependentPages.set(depPath, dependentPages);
      }
    }
    
    // Remove the page's dependency list
    this.pageDependencies.delete(pagePath);
  }

  /**
   * Clear all dependency data
   */
  clear() {
    this.pageDependencies.clear();
    this.dependentPages.clear();
    this.assetTracker.clear();
  }

  /**
   * Get dependency statistics
   * @returns {Object} Statistics about tracked dependencies
   */
  getStats() {
    return {
      totalPages: this.pageDependencies.size,
      totalDependencies: Array.from(this.pageDependencies.values())
        .reduce((sum, deps) => sum + deps.length, 0),
      totalAssets: this.assetTracker.getAllReferencedAssets().length,
      averageDependenciesPerPage: this.pageDependencies.size > 0 
        ? Array.from(this.pageDependencies.values())
            .reduce((sum, deps) => sum + deps.length, 0) / this.pageDependencies.size
        : 0
    };
  }

  /**
   * Extract fragment references from HTML content
   * @private
   * @param {string} content - HTML content to analyze
   * @param {string} pagePath - Path to the page file
   * @param {string} sourceRoot - Source root directory
   * @returns {string[]} Array of fragment paths
   */
  _extractFragmentReferences(content, pagePath, sourceRoot) {
    const references = [];
    
    // Pattern to match data-unify attributes
    const dataUnifyPattern = /data-unify=["']([^"']+)["']/gi;
    let match;
    
    while ((match = dataUnifyPattern.exec(content)) !== null) {
      const fragmentPath = match[1];
      
      if (fragmentPath) {
        // Resolve the path relative to the page
        const resolvedPath = this._resolveFragmentPath(fragmentPath, pagePath, sourceRoot);
        if (resolvedPath) {
          references.push(resolvedPath);
        }
      }
    }
    
    return references;
  }

  /**
   * Extract include references from HTML content (SSI includes)
   * @private
   * @param {string} content - HTML content to analyze
   * @param {string} pagePath - Path to the page file
   * @param {string} sourceRoot - Source root directory
   * @returns {string[]} Array of include paths
   */
  _extractIncludeReferences(content, pagePath, sourceRoot) {
    const references = [];
    
    // Pattern to match SSI include directives
    const includePattern = /<!--#include\s+(?:file|virtual)=["']([^"']+)["']\s*-->/gi;
    let match;
    
    while ((match = includePattern.exec(content)) !== null) {
      const includePath = match[1];
      
      if (includePath) {
        // Resolve the path relative to the page
        const resolvedPath = this._resolveFragmentPath(includePath, pagePath, sourceRoot);
        if (resolvedPath) {
          references.push(resolvedPath);
        }
      }
    }
    
    return references;
  }

  /**
   * Update bidirectional dependency mappings
   * @private
   * @param {string} pagePath - Path to the page file
   * @param {string[]} dependencies - Array of dependency paths
   */
  _updateDependencyMappings(pagePath, dependencies) {
    // Clear old mappings for this page
    const oldDependencies = this.pageDependencies.get(pagePath) || [];
    for (const oldDep of oldDependencies) {
      const dependentPages = this.dependentPages.get(oldDep) || [];
      const index = dependentPages.indexOf(pagePath);
      if (index > -1) {
        dependentPages.splice(index, 1);
        if (dependentPages.length === 0) {
          this.dependentPages.delete(oldDep);
        } else {
          this.dependentPages.set(oldDep, dependentPages);
        }
      }
    }
    
    // Set new dependencies for this page
    this.pageDependencies.set(pagePath, dependencies);
    
    // Update reverse mappings
    for (const depPath of dependencies) {
      if (!this.dependentPages.has(depPath)) {
        this.dependentPages.set(depPath, []);
      }
      const dependentPages = this.dependentPages.get(depPath);
      if (!dependentPages.includes(pagePath)) {
        dependentPages.push(pagePath);
      }
    }
  }

  /**
   * Resolve fragment path relative to page and source root
   * @private
   * @param {string} fragmentPath - Fragment path from data-unify or include
   * @param {string} pagePath - Path to the page file
   * @param {string} sourceRoot - Source root directory
   * @returns {string|null} Resolved absolute path or null if not found
   */
  _resolveFragmentPath(fragmentPath, pagePath, sourceRoot) {
    const { resolve, dirname, join, isAbsolute } = require('path');
    const { existsSync } = require('fs');
    
    try {
      let resolvedPath;
      
      if (isAbsolute(fragmentPath)) {
        // Absolute path from source root
        resolvedPath = join(sourceRoot, fragmentPath.startsWith('/') ? fragmentPath.slice(1) : fragmentPath);
      } else if (fragmentPath.startsWith('./') || fragmentPath.startsWith('../')) {
        // Relative path from page directory
        const pageDir = dirname(pagePath);
        resolvedPath = resolve(pageDir, fragmentPath);
      } else {
        // Simple filename - resolve relative to page directory first
        const pageDir = dirname(pagePath);
        resolvedPath = join(pageDir, fragmentPath);
      }
      
      // Check if file exists
      if (existsSync(resolvedPath)) {
        return resolvedPath;
      }
      
      // If not found and it's a simple filename, try common directories
      if (!fragmentPath.includes('/')) {
        const commonDirs = [
          join(sourceRoot, '_layouts'),
          join(sourceRoot, '_components'),
          join(sourceRoot, '_includes'),
          sourceRoot
        ];
        
        for (const dir of commonDirs) {
          const testPath = join(dir, fragmentPath);
          if (existsSync(testPath)) {
            return testPath;
          }
        }
      }
      
      // For complex paths, don't return null - return the computed path anyway
      // This allows tracking dependencies even if files don't exist yet
      return resolvedPath;
    } catch (error) {
      return null;
    }
  }
}