import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger.js';

/**
 * Layout discovery system for convention-based architecture
 * Finds layouts using folder-scoped _layout.html files and fallback default layout
 */
export class LayoutDiscovery {
  /**
   * Find the appropriate layout for a given page
   * @param {string} pagePath - Absolute path to the page file
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {Promise<string|null>} Absolute path to layout file, or null if no layout found
   */
  async findLayoutForPage(pagePath, sourceRoot) {
    logger.debug(`Finding layout for page: ${path.relative(sourceRoot, pagePath)}`);
    
    // Start from the page's directory and climb up to source root
    let currentDir = path.dirname(pagePath);
    
    while (currentDir && currentDir !== path.dirname(sourceRoot)) {
      // Check for _layout.html in current directory
      const layoutPath = path.join(currentDir, '_layout.html');
      
      try {
        await fs.access(layoutPath);
        logger.debug(`Found layout: ${path.relative(sourceRoot, layoutPath)}`);
        return layoutPath;
      } catch {
        // Layout not found in this directory, continue climbing
      }
      
      // Also check for _layout.htm variant
      const layoutPathHtm = path.join(currentDir, '_layout.htm');
      try {
        await fs.access(layoutPathHtm);
        logger.debug(`Found layout: ${path.relative(sourceRoot, layoutPathHtm)}`);
        return layoutPathHtm;
      } catch {
        // Layout not found in this directory, continue climbing
      }
      
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root
        break;
      }
      currentDir = parentDir;
    }
    
    // No folder-scoped layout found, check for default layout in _includes
    const defaultLayoutPath = path.join(sourceRoot, '_includes', 'default-layout.html');
    try {
      await fs.access(defaultLayoutPath);
      logger.debug(`Found default layout: ${path.relative(sourceRoot, defaultLayoutPath)}`);
      return defaultLayoutPath;
    } catch {
      // Check .htm variant
      const defaultLayoutPathHtm = path.join(sourceRoot, '_includes', 'default-layout.htm');
      try {
        await fs.access(defaultLayoutPathHtm);
        logger.debug(`Found default layout: ${path.relative(sourceRoot, defaultLayoutPathHtm)}`);
        return defaultLayoutPathHtm;
      } catch {
        // No default layout found
      }
    }
    
    logger.debug(`No layout found for page: ${path.relative(sourceRoot, pagePath)}`);
    return null;
  }
  
  /**
   * Get the complete layout chain for a page (nested layouts)
   * @param {string} pagePath - Absolute path to the page file
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {Promise<string[]>} Array of layout paths from most specific to least specific
   */
  async getLayoutChain(pagePath, sourceRoot) {
    const layouts = [];
    let currentDir = path.dirname(pagePath);
    
    // Collect all _layout.html files from page directory up to source root
    while (currentDir && currentDir !== path.dirname(sourceRoot)) {
      // Check for _layout.html in current directory
      const layoutPath = path.join(currentDir, '_layout.html');
      
      try {
        await fs.access(layoutPath);
        layouts.push(layoutPath);
      } catch {
        // Check for _layout.htm variant
        const layoutPathHtm = path.join(currentDir, '_layout.htm');
        try {
          await fs.access(layoutPathHtm);
          layouts.push(layoutPathHtm);
        } catch {
          // No layout in this directory
        }
      }
      
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root
        break;
      }
      currentDir = parentDir;
    }
    
    // Add default layout if no other layouts found
    if (layouts.length === 0) {
      const defaultLayout = await this.findLayoutForPage(pagePath, sourceRoot);
      if (defaultLayout) {
        layouts.push(defaultLayout);
      }
    }
    
    logger.debug(`Layout chain for ${path.relative(sourceRoot, pagePath)}: [${layouts.map(l => path.relative(sourceRoot, l)).join(', ')}]`);
    return layouts;
  }
  
  /**
   * Resolve layout path from data-layout attribute or frontmatter
   * @param {string} layoutSpec - Layout specification from data-layout or frontmatter
   * @param {string} sourceRoot - Absolute path to source directory
   * @param {string} pagePath - Absolute path to the page file (for relative resolution)
   * @returns {Promise<string|null>} Absolute path to layout file, or null if not found
   */
  async resolveLayoutOverride(layoutSpec, sourceRoot, pagePath) {
    if (!layoutSpec) {
      return null;
    }
    
    logger.debug(`Resolving layout override: ${layoutSpec}`);
    
    let layoutPath;
    
    // If path starts with /, resolve from source root
    if (layoutSpec.startsWith('/')) {
      layoutPath = path.join(sourceRoot, layoutSpec.substring(1));
    } else {
      // Relative to page directory
      layoutPath = path.resolve(path.dirname(pagePath), layoutSpec);
    }
    
    // Add .html extension if not present
    if (!path.extname(layoutPath)) {
      layoutPath += '.html';
    }
    
    try {
      await fs.access(layoutPath);
      logger.debug(`Resolved layout override: ${path.relative(sourceRoot, layoutPath)}`);
      return layoutPath;
    } catch {
      // Try .htm extension
      const layoutPathHtm = layoutPath.replace(/\.html$/, '.htm');
      try {
        await fs.access(layoutPathHtm);
        logger.debug(`Resolved layout override: ${path.relative(sourceRoot, layoutPathHtm)}`);
        return layoutPathHtm;
      } catch {
        logger.warn(`Layout override not found: ${layoutSpec}`);
        return null;
      }
    }
  }
  
  /**
   * Check if a file has a complete HTML structure (shouldn't get a layout)
   * @param {string} content - File content
   * @returns {boolean} True if file contains complete HTML structure
   */
  hasCompleteHtmlStructure(content) {
    const htmlTagRegex = /<html[^>]*>/i;
    const headTagRegex = /<head[^>]*>/i;
    const bodyTagRegex = /<body[^>]*>/i;
    
    return htmlTagRegex.test(content) && headTagRegex.test(content) && bodyTagRegex.test(content);
  }
  
  /**
   * Get all layout files that should trigger rebuilds for a given page
   * @param {string} pagePath - Absolute path to the page file
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {Promise<string[]>} Array of layout paths that affect this page
   */
  async getLayoutDependencies(pagePath, sourceRoot) {
    const dependencies = [];
    
    // Get the layout chain
    const layoutChain = await this.getLayoutChain(pagePath, sourceRoot);
    dependencies.push(...layoutChain);
    
    // Also include default layout as a potential dependency
    const defaultLayoutPath = path.join(sourceRoot, '_includes', 'default-layout.html');
    const defaultLayoutPathHtm = path.join(sourceRoot, '_includes', 'default-layout.htm');
    
    try {
      await fs.access(defaultLayoutPath);
      if (!dependencies.includes(defaultLayoutPath)) {
        dependencies.push(defaultLayoutPath);
      }
    } catch {
      try {
        await fs.access(defaultLayoutPathHtm);
        if (!dependencies.includes(defaultLayoutPathHtm)) {
          dependencies.push(defaultLayoutPathHtm);
        }
      } catch {
        // No default layout
      }
    }
    
    return dependencies;
  }
}

// Export singleton instance
export const layoutDiscovery = new LayoutDiscovery();