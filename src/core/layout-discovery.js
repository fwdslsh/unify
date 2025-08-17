import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger.js';

/**
 * Layout discovery system for convention-based architecture
 * Finds layouts using configurable patterns and directories
 */
export class LayoutDiscovery {
  constructor(buildConfig = null) {
    this.buildConfig = buildConfig;
  }

  /**
   * Set or update the build configuration
   * @param {BuildConfig} buildConfig - Build configuration instance
   */
  setBuildConfig(buildConfig) {
    this.buildConfig = buildConfig;
  }

  /**
   * Get the build configuration, falling back to global if not set
   * @returns {BuildConfig|null} Build configuration instance
   */
  getBuildConfig() {
    return this.buildConfig || globalThis.UNIFY_PATTERNS_CONFIG || null;
  }
  /**
   * Find layout file in a specific directory using naming convention
   * Looks for files matching the configured layout pattern
   * @param {string} directory - Directory path to search in
   * @param {string} sourceRoot - Source root for logging
   * @returns {Promise<string|null>} Path to layout file or null
   */
  async findLayoutInDirectory(directory, sourceRoot) {
    try {
      const files = await fs.readdir(directory);
      const buildConfig = this.getBuildConfig();
      
      if (buildConfig) {
        // Use configured layout pattern
        for (const file of files) {
          if (buildConfig.isLayoutFile(file)) {
            const layoutPath = path.join(directory, file);
            try {
              await fs.access(layoutPath);
              return layoutPath;
            } catch {
              // File not accessible, continue
            }
          }
        }
      } else {
        // Fallback: Look for _layout.html or _layout.htm only
        const layoutFiles = ['_layout.html', '_layout.htm'];
        
        for (const file of layoutFiles) {
          const layoutPath = path.join(directory, file);
          try {
            await fs.access(layoutPath);
            return layoutPath;
          } catch {
            // File not accessible, continue
          }
        }
      }
    } catch {
      // Directory not readable or doesn't exist
    }
    
    return null;
  }

  /**
   * Check if a filename matches the auto-discovery layout naming convention
   * Uses configured layout pattern or fallback to _layout.html/_layout.htm
   * @param {string} fileName - Name of the file to check
   * @returns {boolean} True if matches auto-discovery pattern
   */
  isLayoutFileName(fileName) {
    const buildConfig = this.getBuildConfig();
    
    if (buildConfig) {
      return buildConfig.isLayoutFile(fileName);
    }
    
    // Fallback to hardcoded pattern
    return fileName === '_layout.html' || fileName === '_layout.htm';
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
      // Look for _layout.html or _layout.htm only for auto-discovery
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
      // Look for _layout.html or _layout.htm only for auto-discovery
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
   * Find fallback layout in configured includes directory
   * Looks for the configured layout filename in the includes directory
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {Promise<string|null>} Path to fallback layout or null
   */
  async findFallbackLayoutInIncludes(sourceRoot) {
    const buildConfig = this.getBuildConfig();
    const includesDirName = buildConfig ? buildConfig.getIncludesDir() : '_includes';
    const layoutFilename = buildConfig ? buildConfig.getLayoutFilename() : 'layout.html';
    
    const includesDir = path.join(sourceRoot, includesDirName);
    
    try {
      // Look for configured layout filename and alternative extensions
      const layoutFiles = [layoutFilename];
      
      // Add .htm alternative if original has .html extension
      if (layoutFilename.endsWith('.html')) {
        layoutFiles.push(layoutFilename.replace(/\.html$/, '.htm'));
      } else if (layoutFilename.endsWith('.htm')) {
        layoutFiles.push(layoutFilename.replace(/\.htm$/, '.html'));
      }
      
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
   * Check if a filename in includes dir matches fallback layout naming convention
   * Uses configured layout filename or fallback to layout.html/htm
   * @param {string} fileName - Name of the file to check
   * @returns {boolean} True if matches fallback pattern
   */
  isIncludesLayoutFileName(fileName) {
    const buildConfig = this.getBuildConfig();
    const layoutFilename = buildConfig ? buildConfig.getLayoutFilename() : 'layout.html';
    
    // Check for configured layout filename
    if (fileName === layoutFilename) {
      return true;
    }
    
    // Check for alternative extension
    if (layoutFilename.endsWith('.html') && fileName === layoutFilename.replace(/\.html$/, '.htm')) {
      return true;
    }
    
    if (layoutFilename.endsWith('.htm') && fileName === layoutFilename.replace(/\.htm$/, '.html')) {
      return true;
    }
    
    // Fallback to hardcoded pattern if no build config
    if (!buildConfig) {
      return fileName === 'layout.html' || fileName === 'layout.htm';
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
   * Files must match the configured layout pattern to be found via short name
   * @param {string} shortName - Short name without prefix, .layout, or extension
   * @param {string} sourceRoot - Absolute path to source directory
   * @param {string} pagePath - Absolute path to the page file
   * @returns {Promise<string|null>} Absolute path to layout file, or null if not found
   */
  async resolveShortNameLayout(shortName, sourceRoot, pagePath) {
    logger.debug(`Resolving short name layout: ${shortName}`);
    
    const buildConfig = this.getBuildConfig();
    let currentDir = path.dirname(pagePath);
    
    // Search up the directory hierarchy
    while (currentDir && currentDir !== path.dirname(sourceRoot)) {
      if (buildConfig) {
        // Use configurable patterns - try to find files matching layout pattern with shortName
        try {
          const files = await fs.readdir(currentDir);
          for (const file of files) {
            if (buildConfig.isLayoutFile(file) && file.includes(shortName)) {
              const layoutPath = path.join(currentDir, file);
              try {
                await fs.access(layoutPath);
                logger.debug(`Resolved short name layout: ${path.relative(sourceRoot, layoutPath)}`);
                return layoutPath;
              } catch {
                // File doesn't exist, continue
              }
            }
          }
        } catch {
          // Directory not readable, continue
        }
      } else {
        // Fallback: Check for _[shortName].layout.html and _[shortName].layout.htm
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
      }
      
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root
        break;
      }
      currentDir = parentDir;
    }
    
    // Check configured includes directory
    const includesDirName = buildConfig ? buildConfig.getIncludesDir() : '_includes';
    const includesDir = path.join(sourceRoot, includesDirName);
    
    if (buildConfig) {
      // Look for files matching layout pattern that contain the short name
      try {
        const files = await fs.readdir(includesDir);
        for (const file of files) {
          if (buildConfig.isLayoutFile(file) && file.includes(shortName)) {
            const layoutPath = path.join(includesDir, file);
            try {
              await fs.access(layoutPath);
              logger.debug(`Resolved short name layout: ${path.relative(sourceRoot, layoutPath)}`);
              return layoutPath;
            } catch {
              // File doesn't exist, continue
            }
          }
        }
      } catch {
        // Directory not readable, continue
      }
    } else {
      // Fallback: files don't need underscore prefix in includes
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
    }
    
    // Warning: short name didn't resolve
    const patternDesc = buildConfig ? 'configured layout pattern' : '.layout.htm(l) file';
    logger.warn(`Layout short name '${shortName}' could not be resolved to a ${patternDesc}`);
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