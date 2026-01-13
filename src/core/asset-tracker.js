/**
 * Asset Reference Tracker for Unify
 * Implements US-009: Asset Copying and Management
 * 
 * Tracks which assets are referenced in HTML/CSS content and provides
 * secure path resolution and reference management functionality.
 */

import { join, resolve, relative, normalize, dirname, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { PathValidator } from './path-validator.js';
import { logger } from '../utils/logger.js';

/**
 * AssetTracker class for managing asset references and dependencies
 */
export class AssetTracker {
  constructor(options = {}) {
    // Maps asset file path to array of pages that reference it
    this.assetReferences = new Map();
    
    // Set of all referenced assets for quick lookup
    this.referencedAssets = new Set();
    
    // Cache of parsed asset references from HTML content
    this.htmlAssetCache = new Map();
    
    // Path validator for security
    this.pathValidator = new PathValidator();
    
    // Configuration options
    this.sourceDir = options.sourceDir || process.cwd();
    this.outputDir = options.outputDir || 'dist';
    this.logger = options.logger || logger;
  }

  /**
   * Extract asset references from HTML content
   * @param {string} htmlContent - HTML content to analyze
   * @param {string} pagePath - Path to the page file
   * @param {string} sourceRoot - Source root directory
   * @returns {string[]} Array of referenced asset paths
   */
  extractAssetReferences(htmlContent, pagePath, sourceRoot) {
    if (!htmlContent || typeof htmlContent !== 'string') {
      return [];
    }

    const references = new Set();
    
    // Patterns to match asset references
    const patterns = [
      // CSS files in link tags
      /<link[^>]+href=["']([^"']+\.css)["']/gi,
      // JavaScript files
      /<script[^>]+src=["']([^"']+\.js)["']/gi,
      // Images in img tags
      /<img[^>]+src=["']([^"']+\.(png|jpg|jpeg|gif|svg|webp|ico))["']/gi,
      // Link icons (favicon, apple-icon, etc.)
      /<link[^>]+rel=["'](?:icon|apple-touch-icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/gi,
      /<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:icon|apple-touch-icon|shortcut icon)["']/gi,
      // Background images in style attributes
      /style=["'][^"']*background-image:\s*url\(["']?([^"')]+)["']?\)/gi,
      // CSS url() references in style blocks
      /url\(["']?([^"')]+\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot|otf))["']?\)/gi,
      // Fonts in link tags
      /<link[^>]+href=["']([^"']+\.(woff2?|ttf|eot|otf))["']/gi,
      // Video/audio sources
      /<(?:video|audio)[^>]+src=["']([^"']+\.(mp4|webm|ogg|mp3|wav))["']/gi,
      // Source elements
      /<source[^>]+src=["']([^"']+)["']/gi,
      // Object data attributes
      /<object[^>]+data=["']([^"']+)["']/gi,
      // Generic href/src attributes for other files
      /(?:href|src)=["']([^"']+\.(pdf|zip|doc|docx|txt|json))["']/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        // Handle different capture groups - some patterns have multiple groups
        let assetPath = match[1] || match[2];
        
        if (!assetPath) continue;
        
        
        // Skip external URLs
        if (this._isExternalUrl(assetPath)) {
          continue;
        }
        
        // Skip data URLs
        if (assetPath.startsWith('data:')) {
          continue;
        }
        
        // Resolve relative paths
        const resolvedPath = this.resolveAssetPath(assetPath, pagePath, sourceRoot);
        if (resolvedPath) {
          references.add(resolvedPath);
        }
      }
    }

    return Array.from(references);
  }

  /**
   * Extract asset references from CSS content
   * @param {string} cssContent - CSS content to analyze
   * @param {string} cssPath - Path to the CSS file
   * @param {string} sourceRoot - Source root directory
   * @returns {string[]} Array of referenced asset paths
   */
  extractCssAssetReferences(cssContent, cssPath, sourceRoot) {
    if (!cssContent || typeof cssContent !== 'string') {
      return [];
    }

    const references = new Set();
    
    // Match all url() references (background, src, etc.)
    const urlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
    let match;
    while ((match = urlPattern.exec(cssContent)) !== null) {
      const assetPath = match[1];
      if (!assetPath) continue;
      if (this._isExternalUrl(assetPath)) continue;
      if (assetPath.startsWith('data:')) continue;
      if (assetPath.startsWith('#')) continue;
      
      const resolvedPath = this.resolveAssetPath(assetPath, cssPath, sourceRoot);
      if (resolvedPath) {
        references.add(resolvedPath);
      }
    }

    // Match all @font-face src URLs (multiple URLs per src)
    const fontFacePattern = /@font-face[^}]*src\s*:\s*([^;}]*)/gi;
    while ((match = fontFacePattern.exec(cssContent)) !== null) {
      const srcValue = match[1];
      // Find all url() inside src
      const srcUrlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
      let srcMatch;
      while ((srcMatch = srcUrlPattern.exec(srcValue)) !== null) {
        const assetPath = srcMatch[1];
        if (!assetPath) continue;
        if (this._isExternalUrl(assetPath)) continue;
        if (assetPath.startsWith('data:')) continue;
        if (assetPath.startsWith('#')) continue;
        
        const resolvedPath = this.resolveAssetPath(assetPath, cssPath, sourceRoot);
        if (resolvedPath) {
          references.add(resolvedPath);
        }
      }
    }

    // Match all @import statements
    const importPattern = /@import\s+(?:url\()?\s*["']([^"']+)["']?\s*\)?/gi;
    while ((match = importPattern.exec(cssContent)) !== null) {
      const assetPath = match[1];
      if (!assetPath) continue;
      if (this._isExternalUrl(assetPath)) continue;
      if (assetPath.startsWith('data:')) continue;
      if (assetPath.startsWith('#')) continue;
      
      const resolvedPath = this.resolveAssetPath(assetPath, cssPath, sourceRoot);
      if (resolvedPath) {
        references.add(resolvedPath);
      }
    }

    return Array.from(references);
  }

  /**
   * Resolve asset path relative to page and source root
   * @param {string} assetPath - Asset path from HTML
   * @param {string} pagePath - Path to the page file
   * @param {string} sourceRoot - Source root directory
   * @returns {string|null} Resolved asset path or null if invalid
   */
  resolveAssetPath(assetPath, pagePath, sourceRoot) {
    if (!assetPath || typeof assetPath !== 'string') {
      return null;
    }

    try {
      // First, validate the input for security
      if (!this._validateAssetPath(assetPath)) {
        return null;
      }

      let resolvedPath;
      
      if (assetPath.startsWith('/')) {
        // Absolute path from source root
        resolvedPath = join(sourceRoot, assetPath.slice(1));
      } else {
        // Relative path from current page  
        const pageDir = dirname(pagePath);
        // Normalize asset path separators first
        const normalizedAssetPath = assetPath.replace(/\\/g, '/');
        resolvedPath = resolve(pageDir, normalizedAssetPath);
      }
      
      // Normalize the path to handle platform differences
      resolvedPath = normalize(resolvedPath);
      
      // Ensure the resolved path is within source root using path validator
      try {
        this.pathValidator.validatePath(resolvedPath, sourceRoot);
        return resolvedPath;
      } catch (error) {
        return null;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Record asset references for a page
   * @param {string} pagePath - Path to the page file
   * @param {string} htmlContent - HTML content to analyze
   * @param {string} sourceRoot - Source root directory
   */
  async recordAssetReferences(pagePath, htmlContent, sourceRoot) {
    // Clear existing references for this page
    this.clearPageAssetReferences(pagePath);
    
    // Extract new references from HTML
    const assets = this.extractAssetReferences(htmlContent, pagePath, sourceRoot);
    
    // Process CSS files recursively to handle @import chains
    const cssAssets = new Set();
    const processedCssFiles = new Set(); // Prevent infinite loops
    
    const processCssFile = async (cssPath, depth = 0, referringFile = pagePath) => {
      // Prevent infinite recursion with max depth
      const MAX_CSS_IMPORT_DEPTH = 10;
      if (depth > MAX_CSS_IMPORT_DEPTH) {
        logger.warn(`Maximum CSS import depth (${MAX_CSS_IMPORT_DEPTH}) exceeded at ${cssPath}`);
        return;
      }
      
      if (processedCssFiles.has(cssPath)) {
        logger.debug(`Skipping already processed CSS file: ${cssPath}`);
        return; // Already processed this CSS file
      }
      processedCssFiles.add(cssPath);
      
      // Validate CSS file exists before processing
      if (!existsSync(cssPath)) {
        logger.warn(`CSS file not found: ${cssPath} [referenced by: ${referringFile}]`);
        return;
      }

      try {
        const cssContent = await Bun.file(cssPath).text();
        const cssReferences = this.extractCssAssetReferences(cssContent, cssPath, sourceRoot);
        
        logger.debug(`Found ${cssReferences.length} asset references in CSS file: ${cssPath}`);

        for (const cssRef of cssReferences) {
          cssAssets.add(cssRef);

          // If this reference is another CSS file, process it recursively
          if (cssRef.endsWith('.css')) {
            // Check for circular import before recursing
            if (processedCssFiles.has(cssRef)) {
              logger.warn(`Circular CSS import detected: ${cssPath} -> ${cssRef}`);
              continue;
            }
            await processCssFile(cssRef, depth + 1, cssPath);
          }
        }
      } catch (error) {
        // Log the error with context
        logger.error(`Failed to process CSS file ${cssPath}: ${error.message}`);
        
        // Continue processing other files
        // CSS processing errors shouldn't break the build
      }
    };
    
    // Process all CSS files found in HTML
    for (const assetPath of assets) {
      if (assetPath.endsWith('.css')) {
        await processCssFile(assetPath);
      }
    }
    
    // Combine HTML and CSS asset references
    const allAssets = [...assets, ...Array.from(cssAssets)];
    
    // Record new references
    for (const assetPath of allAssets) {
      if (!this.assetReferences.has(assetPath)) {
        this.assetReferences.set(assetPath, []);
      }
      this.assetReferences.get(assetPath).push(pagePath);
      this.referencedAssets.add(assetPath);
    }
    
    // Cache for this page (include both HTML and CSS references)
    this.htmlAssetCache.set(pagePath, allAssets);
  }

  /**
   * Clear asset references for a specific page
   * @param {string} pagePath - Path to the page file
   */
  clearPageAssetReferences(pagePath) {
    const cachedAssets = this.htmlAssetCache.get(pagePath);
    
    if (cachedAssets) {
      for (const assetPath of cachedAssets) {
        const pages = this.assetReferences.get(assetPath);
        if (pages) {
          const index = pages.indexOf(pagePath);
          if (index > -1) {
            pages.splice(index, 1);
          }
          
          // Clean up empty arrays
          if (pages.length === 0) {
            this.assetReferences.delete(assetPath);
            this.referencedAssets.delete(assetPath);
          }
        }
      }
      
      this.htmlAssetCache.delete(pagePath);
    }
  }

  /**
   * Check if an asset is referenced by any page
   * @param {string} assetPath - Path to the asset file
   * @returns {boolean} True if asset is referenced
   */
  isAssetReferenced(assetPath) {
    return this.referencedAssets.has(assetPath);
  }

  /**
   * Get all pages that reference a specific asset
   * @param {string} assetPath - Path to the asset file
   * @returns {string[]} Array of page paths that reference the asset
   */
  getPagesThatReference(assetPath) {
    return this.assetReferences.get(assetPath) || [];
  }

  /**
   * Get all referenced assets
   * @returns {string[]} Array of all referenced asset paths
   */
  getAllReferencedAssets() {
    return Array.from(this.referencedAssets);
  }

  /**
   * Get all assets referenced by a specific page
   * @param {string} pagePath - Path to the page file
   * @returns {string[]} Array of asset paths referenced by the page
   */
  getPageAssets(pagePath) {
    return this.htmlAssetCache.get(pagePath) || [];
  }

  /**
   * Remove all records of a page (when page is deleted)
   * @param {string} pagePath - Path to the deleted page
   */
  removePage(pagePath) {
    this.clearPageAssetReferences(pagePath);
  }

  /**
   * Get asset reference statistics for debugging
   * @returns {Object} Statistics about tracked asset references
   */
  getStats() {
    return {
      totalReferencedAssets: this.referencedAssets.size,
      totalAssetReferences: Array.from(this.assetReferences.values())
        .reduce((sum, pages) => sum + pages.length, 0),
      pagesWithAssets: this.htmlAssetCache.size
    };
  }

  /**
   * Clear all asset reference data
   */
  clear() {
    this.assetReferences.clear();
    this.referencedAssets.clear();
    this.htmlAssetCache.clear();
  }

  /**
   * Process a CSS file to extract and track asset references
   * @param {string} cssPath - Path to the CSS file to process
   * @param {number} depth - Recursion depth (for preventing infinite loops)
   * @param {string} referringFile - Optional path to file that referenced this CSS
   * @returns {Promise<void>}
   */
  async processCssFile(cssPath, depth = 0, referringFile = null) {
    // Prevent infinite recursion with max depth
    const MAX_CSS_IMPORT_DEPTH = 10;
    if (depth > MAX_CSS_IMPORT_DEPTH) {
      this.logger.warn(`Maximum CSS import depth (${MAX_CSS_IMPORT_DEPTH}) exceeded at ${cssPath}`);
      return;
    }
    
    // Set to track processed files in this call chain
    if (!this._processedCssFiles) {
      this._processedCssFiles = new Set();
    }
    
    if (this._processedCssFiles.has(cssPath)) {
      this.logger.debug(`Skipping already processed CSS file: ${cssPath}`);
      return; // Already processed this CSS file
    }
    this._processedCssFiles.add(cssPath);
    
    // Validate CSS file exists before processing
    if (!existsSync(cssPath)) {
      const referenceInfo = referringFile ? ` [referenced by: ${referringFile}]` : '';
      this.logger.error(`CSS file not found: ${cssPath}${referenceInfo}`);
      return;
    }

    try {
      const cssContent = await Bun.file(cssPath).text();
      const cssReferences = this.extractCssAssetReferences(cssContent, cssPath, this.sourceDir);
      
      this.logger.debug(`Found ${cssReferences.length} asset references in CSS file: ${cssPath}`);

      for (const cssRef of cssReferences) {
        // Validate that referenced assets exist
        if (!existsSync(cssRef)) {
          this.logger.warn(`Referenced asset not found in ${cssPath}: ${cssRef}`);
        }
        
        // If this reference is another CSS file, process it recursively
        if (cssRef.endsWith('.css')) {
          // Check for circular import before recursing
          if (this._processedCssFiles.has(cssRef)) {
            this.logger.warn(`Circular CSS import detected: ${cssPath} -> ${cssRef}`);
            continue;
          }
          await this.processCssFile(cssRef, depth + 1, cssPath);
        }
      }
    } catch (error) {
      // Log the error with context - including file path for debugging
      this.logger.error(`Failed to process CSS file ${cssPath}: ${error.message}`);
      
      // Continue processing other files
      // CSS processing errors shouldn't break the build
    }
  }

  /**
   * Check if URL is external
   * @private
   * @param {string} url - URL to check
   * @returns {boolean} True if external
   */
  _isExternalUrl(url) {
    return url.startsWith('http://') || 
           url.startsWith('https://') || 
           url.startsWith('//');
  }

  /**
   * Validate asset path for basic security issues
   * @private
   * @param {string} assetPath - Asset path to validate
   * @returns {boolean} True if path is safe
   */
  _validateAssetPath(assetPath) {
    if (!assetPath || typeof assetPath !== 'string') {
      return false;
    }

    // Enhanced protocol blocking with comprehensive dangerous schemes
    const dangerousProtocols = [
      'javascript:', 'vbscript:', 'data:', 'file:', 'about:', 'blob:',
      'chrome:', 'chrome-extension:', 'ms-', 'moz-', 'opera-', 'safari-',
      'jar:', 'gopher:', 'telnet:', 'ssh:', 'ftp:', 'ldap:', 'mailto:'
    ];
    
    const lowerPath = assetPath.toLowerCase();
    for (const protocol of dangerousProtocols) {
      if (lowerPath.includes(protocol)) {
        logger.warn(`Blocked dangerous protocol in asset path: ${assetPath}`);
        return false;
      }
    }

    // Block protocol-relative URLs
    if (assetPath.includes('://')) {
      return false;
    }

    // Block UNC paths (Windows network shares)
    if (assetPath.startsWith('\\\\') || assetPath.startsWith('//')) {
      return false;
    }

    // Block drive letters (Windows absolute paths)
    if (/^[a-zA-Z]:/.test(assetPath)) {
      return false;
    }

    // Enhanced encoded sequence detection with multiple encoding levels
    try {
      let decodedPath = assetPath;
      let previousDecoded = '';
      let decodeDepth = 0;
      const MAX_DECODE_DEPTH = 3;
      
      // Decode multiple levels to catch double/triple encoding
      while (previousDecoded !== decodedPath && decodeDepth < MAX_DECODE_DEPTH) {
        previousDecoded = decodedPath;
        decodedPath = decodeURIComponent(decodedPath);
        decodeDepth++;
      }
      
      // Check for null bytes (path truncation attacks)
      if (decodedPath.includes('\0') || decodedPath.includes('%00')) {
        logger.warn(`Blocked null byte in asset path: ${assetPath}`);
        return false;
      }
      
      // Check for various encoded traversal patterns
      const encodedPatterns = [
        '%2e%2e', '%2E%2E', // encoded ..
        '%252e%252e', '%252E%252E', // double encoded ..
        '..%2f', '..%2F', '%2e%2e/', '%2E%2E/', // encoded ../
        '..%5c', '..%5C', '%2e%2e\\', '%2E%2E\\', // encoded ..\\
        '%c0%ae', '%c1%9c' // Unicode encoding tricks
      ];
      
      for (const pattern of encodedPatterns) {
        if (lowerPath.includes(pattern) || decodedPath.toLowerCase().includes(pattern)) {
          logger.warn(`Blocked encoded traversal pattern in asset path: ${assetPath}`);
          return false;
        }
      }
    } catch (error) {
      // If decoding fails, path might be corrupted - be cautious
      logger.debug(`Failed to decode asset path, treating as suspicious: ${assetPath}`);
      return false;
    }

    // Enhanced dangerous pattern detection
    const dangerousPatterns = [
      /^\.\.$/,         // Just ".." alone
      /\.\.\.+/,        // Multiple dots like "..." or "...."  
      /\/\.\.$/,        // Ending with "/.."
      /\\\.\.$/,        // Ending with "\.."
      /\.\.\x00/,       // Null byte after ..
      /\.\.%00/,        // Encoded null byte after ..
      /[<>:"|?*]/       // Windows forbidden characters (when not in query string)
    ];

    // Check for forbidden patterns (but allow Windows chars in query strings)
    const pathWithoutQuery = assetPath.split('?')[0];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(pathWithoutQuery)) {
        logger.debug(`Blocked dangerous pattern in asset path: ${assetPath}`);
        return false;
      }
    }
    
    // Check for suspicious file extensions (potential web shells or executables)
    const suspiciousExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.scr', '.vbs', '.vbe', '.jar',
      '.app', '.dmg', '.pkg', '.deb', '.rpm', '.msi', '.dll', '.so',
      '.php.jpg', '.asp.gif', '.jsp.png', '.aspx.jpeg' // Double extension attacks
    ];
    
    const pathLower = assetPath.toLowerCase();
    for (const ext of suspiciousExtensions) {
      if (pathLower.endsWith(ext) || pathLower.includes(ext + '?')) {
        logger.warn(`Blocked suspicious file extension in asset path: ${assetPath}`);
        return false;
      }
    }

    // Block dangerous absolute paths
    if (assetPath.startsWith('/')) {
      // Block system paths
      const dangerousAbsolutePaths = [
        '/etc/', '/var/', '/usr/', '/bin/', '/sbin/', '/root/', '/home/',
        '/proc/', '/sys/', '/dev/', '/tmp/', '/opt/', '/mnt/', '/media/',
        '/boot/', '/lib/', '/srv/', '/run/', '/lost+found'
      ];
      
      for (const dangerousPath of dangerousAbsolutePaths) {
        if (assetPath.startsWith(dangerousPath)) {
          logger.warn(`Blocked system path access: ${assetPath}`);
          return false;
        }
      }
    }

    return true;
  }
}