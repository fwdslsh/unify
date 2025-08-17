import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger.js';

/**
 * Layout discovery system for convention-based architecture
 * Finds layouts using folder-scoped layout files and fallback default layout
 */
export class LayoutDiscovery {
  constructor(config = {}) {
    this.defaultLayout = config.defaultLayout || "layout";
  }
  
  /**
   * Find layout file in a specific directory using naming convention
   * Only looks for configured layout files for automatic discovery
   * @param {string} directory - Directory path to search in
   * @param {string} sourceRoot - Source root for logging
   * @returns {Promise<string|null>} Path to layout file or null
   */
  async findLayoutInDirectory(directory, sourceRoot) {
    try {
      const files = await fs.readdir(directory);
      
      // Look for _defaultLayout.html or _defaultLayout.htm
      const layoutFiles = [`_${this.defaultLayout}.html`, `_${this.defaultLayout}.htm`];
      
      for (const file of layoutFiles) {
        const layoutPath = path.join(directory, file);
        try {
          await fs.access(layoutPath);
          return layoutPath;
        } catch {
          // File not accessible, continue
        }
      }
    } catch {
      // Directory not readable or doesn't exist
    }
    
    return null;
  }

  /**
   * Check if a filename matches the auto-discovery layout naming convention
   * Only configured layout files are auto-discovered
   * @param {string} fileName - Name of the file to check
   * @returns {boolean} True if matches auto-discovery pattern
   */
  isLayoutFileName(fileName) {
    return fileName === `_${this.defaultLayout}.html` || fileName === `_${this.defaultLayout}.htm`;
  }

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
      // Look for configured layout files for auto-discovery
      const layoutFile = await this.findLayoutInDirectory(currentDir, sourceRoot);
      if (layoutFile) {
        logger.debug(`Found layout: ${path.relative(sourceRoot, layoutFile)}`);
        return layoutFile;
      }
      
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root
        break;
      }
      currentDir = parentDir;
    }
    
    // No folder-scoped layout found, check for fallback layout in _includes
    // According to spec: _includes directory files do NOT require underscore prefix
    const fallbackLayout = await this.findFallbackLayoutInIncludes(sourceRoot);
    if (fallbackLayout) {
      logger.debug(`Found fallback layout: ${path.relative(sourceRoot, fallbackLayout)}`);
      return fallbackLayout;
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
    
    // Collect all layout files from page directory up to source root
    while (currentDir && currentDir !== path.dirname(sourceRoot)) {
      // Look for configured layout files for auto-discovery
      const layoutFile = await this.findLayoutInDirectory(currentDir, sourceRoot);
      if (layoutFile) {
        layouts.push(layoutFile);
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
   * Find fallback layout in _includes directory
   * Only looks for layout.html or layout.htm for site-wide fallback
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {Promise<string|null>} Path to fallback layout or null
   */
  async findFallbackLayoutInIncludes(sourceRoot) {
    const includesDir = path.join(sourceRoot, '_includes');
    
    try {
      // Only look for layout.html or layout.htm as site-wide fallback
      const layoutFiles = ['layout.html', 'layout.htm'];
      
      for (const file of layoutFiles) {
        const layoutPath = path.join(includesDir, file);
        try {
          await fs.access(layoutPath);
          return layoutPath;
        } catch {
          // File not accessible, continue
        }
      }
    } catch {
      // Directory not readable or doesn't exist
    }
    
    return null;
  }

  /**
   * Check if a filename in _includes matches fallback layout naming convention
   * Only layout.html or layout.htm serve as site-wide fallback
   * @param {string} fileName - Name of the file to check
   * @returns {boolean} True if matches fallback pattern
   */
  isIncludesLayoutFileName(fileName) {
    // In _includes, only layout.html/htm serve as site-wide fallback
    return fileName === 'layout.html' || fileName === 'layout.htm';
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
    
    // Check if this is a short name (no path separators, no extension)
    if (!layoutSpec.includes('/') && !layoutSpec.includes('\\') && !path.extname(layoutSpec)) {
      return await this.resolveShortNameLayout(layoutSpec, sourceRoot, pagePath);
    }
    
    // Full path resolution
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
   * Resolve short name layout reference (e.g., "blog" -> "_blog.layout.html")
   * Files must have .layout.htm(l) suffix to be found via short name
   * @param {string} shortName - Short name without prefix, .layout, or extension
   * @param {string} sourceRoot - Absolute path to source directory
   * @param {string} pagePath - Absolute path to the page file
   * @returns {Promise<string|null>} Absolute path to layout file, or null if not found
   */
  async resolveShortNameLayout(shortName, sourceRoot, pagePath) {
    logger.debug(`Resolving short name layout: ${shortName}`);
    
    let currentDir = path.dirname(pagePath);
    
    // Search up the directory hierarchy
    while (currentDir && currentDir !== path.dirname(sourceRoot)) {
      // Check for _[shortName].layout.html and _[shortName].layout.htm
      const possibleFiles = [
        `_${shortName}.layout.html`,
        `_${shortName}.layout.htm`
      ];
      
      for (const filename of possibleFiles) {
        const layoutPath = path.join(currentDir, filename);
        try {
          await fs.access(layoutPath);
          logger.debug(`Resolved short name layout: ${path.relative(sourceRoot, layoutPath)}`);
          return layoutPath;
        } catch {
          // File doesn't exist, continue
        }
      }
      
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root
        break;
      }
      currentDir = parentDir;
    }
    
    // Check _includes directory (files don't need underscore prefix there)
    const includesDir = path.join(sourceRoot, '_includes');
    const includesOptions = [
      `${shortName}.layout.html`,
      `${shortName}.layout.htm`,
      `_${shortName}.layout.html`,
      `_${shortName}.layout.htm`,
      `${shortName}.html`,
      `${shortName}.htm`
    ];
    
    for (const filename of includesOptions) {
      const layoutPath = path.join(includesDir, filename);
      try {
        await fs.access(layoutPath);
        logger.debug(`Resolved short name layout: ${path.relative(sourceRoot, layoutPath)}`);
        return layoutPath;
      } catch {
        // File doesn't exist, continue
      }
    }
    
    // Warning: short name didn't resolve to a .layout.htm(l) file
    logger.warn(`Layout short name '${shortName}' could not be resolved to a .layout.htm(l) file`);
    return null;
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
    
    // Also include fallback layout as a potential dependency
    const fallbackLayout = await this.findFallbackLayoutInIncludes(sourceRoot);
    if (fallbackLayout && !dependencies.includes(fallbackLayout)) {
      dependencies.push(fallbackLayout);
    }
    
    return dependencies;
  }

}

// Export singleton instance
export const layoutDiscovery = new LayoutDiscovery();