import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger.js';

/**
 * Layout discovery system for convention-based architecture
 * Finds layouts using folder-scoped _layout.html files and fallback default layout
 */
export class LayoutDiscovery {
  /**
   * Find layout file in a specific directory using naming convention
   * @param {string} directory - Directory path to search in
   * @param {string} sourceRoot - Source root for logging
   * @returns {Promise<string|null>} Path to layout file or null
   */
  async findLayoutInDirectory(directory, sourceRoot) {
    try {
      const files = await fs.readdir(directory);
      
      // Separate files into preferred (.layout.) and secondary (no .layout.)
      const preferredFiles = [];
      const secondaryFiles = [];
      
      for (const file of files) {
        if (this.isLayoutFileName(file)) {
          if (file.includes('.layout.')) {
            preferredFiles.push(file);
          } else {
            secondaryFiles.push(file);
          }
        }
      }
      
      // Sort both arrays alphabetically for deterministic results
      preferredFiles.sort();
      secondaryFiles.sort();
      
      // Check preferred files first, then secondary files
      const orderedFiles = [...preferredFiles, ...secondaryFiles];
      
      for (const file of orderedFiles) {
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
   * Check if a filename matches the layout naming convention
   * @param {string} fileName - Name of the file to check
   * @returns {boolean} True if matches layout pattern
   */
  isLayoutFileName(fileName) {
    // Must start with underscore
    if (!fileName.startsWith('_')) {
      return false;
    }
    
    // Must end with .html or .htm
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      return true;
    }
    
    return false;
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
      // Look for any layout file that matches the pattern: _*.layout.htm(l)
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
      // Look for any layout file that matches the pattern
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
   * Find fallback layout in _includes directory with flexible naming
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {Promise<string|null>} Path to fallback layout or null
   */
  async findFallbackLayoutInIncludes(sourceRoot) {
    const includesDir = path.join(sourceRoot, '_includes');
    
    try {
      const files = await fs.readdir(includesDir);
      
      // Separate files into preferred (.layout.) and secondary (no .layout.)
      const preferredFiles = [];
      const secondaryFiles = [];
      
      for (const file of files) {
        if (this.isIncludesLayoutFileName(file)) {
          if (file.includes('.layout.')) {
            preferredFiles.push(file);
          } else {
            secondaryFiles.push(file);
          }
        }
      }
      
      // Sort both arrays alphabetically for deterministic results
      preferredFiles.sort();
      secondaryFiles.sort();
      
      // Check preferred files first, then secondary files
      const orderedFiles = [...preferredFiles, ...secondaryFiles];
      
      for (const file of orderedFiles) {
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
   * Check if a filename in _includes matches layout naming convention
   * @param {string} fileName - Name of the file to check
   * @returns {boolean} True if matches layout pattern
   */
  isIncludesLayoutFileName(fileName) {
    // In _includes, we look for layout.html/htm (no underscore required)
    // Also accept underscore prefixed files for compatibility
    if ((fileName === 'layout.html' || fileName === 'layout.htm') ||
        (fileName === '_layout.html' || fileName === '_layout.htm')) {
      return true;
    }
    
    // Also accept any file ending with .layout.html/htm
    if (fileName.endsWith('.layout.html') || fileName.endsWith('.layout.htm')) {
      return true;
    }
    
    return false;
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
   * @param {string} shortName - Short name without prefix, .layout, or extension
   * @param {string} sourceRoot - Absolute path to source directory
   * @param {string} pagePath - Absolute path to the page file
   * @returns {Promise<string|null>} Absolute path to layout file, or null if not found
   */
  async resolveShortNameLayout(shortName, sourceRoot, pagePath) {
    logger.debug(`Resolving short name layout: ${shortName}`);
    
    const pageDir = path.dirname(pagePath);
    
    // Generate possible filenames in order of preference
    const sameDirectoryOptions = [
      `_${shortName}.layout.html`,
      `_${shortName}.layout.htm`,
      `_${shortName}.html`,
      `_${shortName}.htm`
    ];
    
    const includesDirectoryOptions = [
      `${shortName}.layout.html`,
      `${shortName}.layout.htm`, 
      `${shortName}.html`,
      `${shortName}.htm`,
      `_${shortName}.layout.html`,
      `_${shortName}.layout.htm`,
      `_${shortName}.html`, 
      `_${shortName}.htm`
    ];
    
    // Check same directory first
    for (const filename of sameDirectoryOptions) {
      const layoutPath = path.join(pageDir, filename);
      try {
        await fs.access(layoutPath);
        logger.debug(`Resolved short name layout: ${path.relative(sourceRoot, layoutPath)}`);
        return layoutPath;
      } catch {
        // File doesn't exist, continue
      }
    }
    
    // Check _includes directory
    const includesDir = path.join(sourceRoot, '_includes');
    for (const filename of includesDirectoryOptions) {
      const layoutPath = path.join(includesDir, filename);
      try {
        await fs.access(layoutPath);
        logger.debug(`Resolved short name layout: ${path.relative(sourceRoot, layoutPath)}`);
        return layoutPath;
      } catch {
        // File doesn't exist, continue
      }
    }
    
    logger.warn(`Short name layout not found: ${shortName}`);
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