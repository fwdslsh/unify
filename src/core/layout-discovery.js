import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger.js';

/**
 * Simplified Layout Discovery System for v2
 * Supports only two methods:
 * 1. Auto-discovery: _layout.html files walking up directory tree
 * 2. Explicit override: data-layout attribute with explicit paths
 */
export class LayoutDiscovery {
  /**
   * Find _layout.html file in a specific directory
   * @param {string} directory - Directory path to search in
   * @param {string} sourceRoot - Source root for logging
   * @returns {Promise<string|null>} Path to layout file or null
   */
  async findLayoutInDirectory(directory, sourceRoot) {
    try {
      // Only look for _layout.html (single naming convention)
      const layoutPath = path.join(directory, '_layout.html');
      await fs.access(layoutPath);
      return layoutPath;
    } catch {
      // File not accessible
      return null;
    }
  }

  /**
   * Check if a filename is the auto-discovery layout file
   * @param {string} fileName - Name of the file to check
   * @returns {boolean} True if matches auto-discovery pattern
   */
  isLayoutFileName(fileName) {
    return fileName === '_layout.html';
  }

  /**
   * Auto-discover layout by walking up directory tree
   * Looks for _layout.html starting from page directory up to source root
   * @param {string} pagePath - Absolute path to the page file
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {Promise<string|null>} Absolute path to layout file, or null if no layout found
   */
  async findLayoutForPage(pagePath, sourceRoot) {
    logger.debug(`Auto-discovering layout for page: ${path.relative(sourceRoot, pagePath)}`);

    // Start from the page's directory and climb up to source root
    let currentDir = path.dirname(pagePath);

    while (currentDir && currentDir !== path.dirname(sourceRoot)) {
      // Look for _layout.html
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
      const layoutFile = await this.findLayoutInDirectory(currentDir, sourceRoot);
      if (layoutFile) {
        layouts.push(layoutFile);
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }

    return layouts;
  }

  /**
   * Resolve explicit layout override from data-layout attribute
   * Supports only explicit paths (absolute with / or relative)
   * Short names are NO LONGER SUPPORTED in v2
   * @param {string} layoutSpec - Layout path from data-layout attribute
   * @param {string} sourceRoot - Absolute path to source directory
   * @param {string} pagePath - Absolute path to the page file
   * @returns {Promise<string|null>} Absolute path to layout file, or null if not found
   */
  async resolveLayoutOverride(layoutSpec, sourceRoot, pagePath) {
    if (!layoutSpec) {
      return null;
    }

    logger.debug(`Resolving explicit layout: ${layoutSpec}`);

    // v2 BREAKING CHANGE: No more short name support
    // Short names have no path separator AND no file extension (e.g., "blog")
    // But simple filenames like "shared.html" are valid (treated as relative to current directory)
    const hasPathSeparator = layoutSpec.includes('/') || layoutSpec.includes('\\');
    const hasExtension = path.extname(layoutSpec) !== '';

    if (!hasPathSeparator && !hasExtension) {
      // This is a short name (e.g., "blog" instead of "/layouts/blog.html")
      logger.error(`Invalid layout path: "${layoutSpec}". Short names are not supported in v2. Use explicit paths like "/layouts/${layoutSpec}.html" or "./${layoutSpec}.html"`);
      return null;
    }

    // Resolve path: absolute (starts with /) or relative
    let layoutPath;
    if (layoutSpec.startsWith('/')) {
      // Absolute path from source root
      layoutPath = path.join(sourceRoot, layoutSpec.substring(1));
    } else {
      // Relative path from page directory (including simple filenames like "shared.html")
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
      logger.warn(`Layout not found: ${layoutSpec} (resolved to ${layoutPath})`);
      return null;
    }
  }

  /**
   * Check if HTML content has complete structure
   * @param {string} content - HTML content to check
   * @returns {boolean} True if has <!DOCTYPE>, <html>, <head>, <body>
   */
  hasCompleteHtmlStructure(content) {
    const hasDoctype = /<!DOCTYPE\s+html/i.test(content);
    const hasHtml = /<html[\s>]/i.test(content);
    const hasHead = /<head[\s>]/i.test(content);
    const hasBody = /<body[\s>]/i.test(content);

    return hasDoctype && hasHtml && hasHead && hasBody;
  }

  /**
   * Get all layout dependencies for a page
   * @param {string} pagePath - Absolute path to the page file
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {Promise<string[]>} Array of layout file paths
   */
  async getLayoutDependencies(pagePath, sourceRoot) {
    const dependencies = [];
    const layouts = await this.getLayoutChain(pagePath, sourceRoot);
    dependencies.push(...layouts);
    return dependencies;
  }
}
