/**
 * File Processing System for unify
 * Handles the build workflow and file operations
 */

import fs from 'fs/promises';
import path from 'path';
// processIncludes is now handled by unified-html-processor
import { DependencyTracker } from './dependency-tracker.js';
import { AssetTracker } from './asset-tracker.js';
import { FileClassifier } from './file-classifier.js';
import { LayoutDiscovery } from './layout-discovery.js';
import { 
  processMarkdown, 
  isMarkdownFile, 
  wrapInLayout, 
  generateTableOfContents, 
  addAnchorLinks,
  hasHtmlElement
} from './markdown-processor.js';
import { 
  isHtmlFile, 
  isPartialFile, 
  getOutputPath, 
  getFileExtension 
} from '../utils/path-resolver.js';
import { 
  generateSitemap, 
  extractPageInfo, 
  enhanceWithFrontmatter, 
  writeSitemap 
} from './sitemap-generator.js';
import { 
  processHtmlUnified,
  getUnifiedConfig
} from './unified-html-processor.js';
import { createBuildCache } from './build-cache.js';
import { FileSystemError, BuildError, UnifyError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { getBaseUrlFromPackage } from '../utils/package-reader.js';

/**
 * Enhanced HTML minifier that removes unnecessary whitespace, comments, and optimizes attributes
 * @param {string} html - HTML content to minify
 * @returns {string} - Minified HTML content
 */
function minifyHtml(html) {
  return html
    // Remove HTML comments (but preserve conditional comments and live reload script)
    .replace(/<!--(?!\s*(?:\[if\s|\[endif|<!\[|.*live reload))[\s\S]*?-->/g, '')
    // Remove extra whitespace between tags
    .replace(/>\s+</g, '><')
    // Remove whitespace around equal signs in attributes
    .replace(/\s*=\s*/g, '=')
    // Remove unnecessary quotes from attributes (but keep if they contain spaces or special chars)
    .replace(/=["']([a-zA-Z0-9\-_\.]+)["']/g, '=$1')
    // Remove empty attributes (except for specific ones that need to be preserved)
    .replace(/\s+(class|id|data-[\w-]+)=""/g, '')
    // Collapse multiple whitespace within text content to single space
    .replace(/\s+/g, ' ')
    // Remove whitespace at start/end of tags
    .replace(/\s+>/g, '>')
    .replace(/<\s+/g, '<')
    // Remove unnecessary whitespace in CSS and JavaScript
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
      const minifiedCss = css
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove CSS comments
        .replace(/\s*{\s*/g, '{')          // Remove whitespace around braces
        .replace(/\s*}\s*/g, '}')
        .replace(/\s*;\s*/g, ';')          // Remove whitespace around semicolons
        .replace(/\s*:\s*/g, ':')          // Remove whitespace around colons
        .replace(/\s+/g, ' ')              // Collapse whitespace
        .trim();
      return match.replace(css, minifiedCss);
    })
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (match, js) => {
      // Basic JavaScript minification (preserve functionality)
      const minifiedJs = js
        .replace(/\/\*[\s\S]*?\*\//g, '')   // Remove block comments
        .replace(/\/\/[^\r\n]*/g, '')       // Remove line comments (but preserve line structure)
        .replace(/\s*([{}();,=])\s*/g, '$1') // Remove whitespace around punctuation
        .replace(/\s+/g, ' ')               // Collapse whitespace
        .trim();
      return match.replace(js, minifiedJs);
    })
    // Remove leading/trailing whitespace
    .trim();
}

/**
 * Cache for tracking file modification times for incremental builds
 */
const fileModificationCache = new Map();

/**
 * Build configuration options
 */
const DEFAULT_OPTIONS = {
  source: 'src',
  output: 'dist',
  clean: true,
  prettyUrls: false,
  baseUrl: 'https://example.com'
};

/**
 * Build the complete static site from source files with convention-based architecture.
 * Uses underscore-prefixed files and directories for non-emitting content like layouts and partials.
 * Processes HTML files through the include engine, applies layouts automatically, copies static assets,
 * and generates dependency tracking information for development server use.
 * 
 * @param {Object} options - Build configuration options
 * @param {string} [options.source='src'] - Source directory path
 * @param {string} [options.output='dist'] - Output directory path
 * @param {boolean} [options.clean=true] - Whether to clean output directory before build
 * @returns {Promise<Object>} Build results with statistics and dependency tracker
 * @returns {number} returns.processed - Number of HTML pages processed
 * @returns {number} returns.copied - Number of static assets copied
 * @returns {number} returns.skipped - Number of partial files skipped
 * @returns {Array} returns.errors - Array of build errors encountered
 * @returns {number} returns.duration - Build time in milliseconds
 * @returns {DependencyTracker} returns.dependencyTracker - Dependency tracking instance
 * @throws {BuildError} When source directory doesn't exist or other critical errors
 * 
 * @example
 * // Basic build with convention-based layouts
 * const result = await build({ source: 'src', output: 'dist' });
 * console.log(`Built ${result.processed} pages in ${result.duration}ms`);
 * 
 * // Build with custom options
 * const result = await build({ 
 *   source: 'src', 
 *   output: 'public',
 *   prettyUrls: true
 * });
 */
export async function build(options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  
  logger.info(`Building site from ${config.source} to ${config.output}`);
  
  // Initialize build cache if caching is enabled
  let buildCache = null;
  if (config.cache !== false) {
    buildCache = createBuildCache(config.cacheDir || '.unify-cache');
    await buildCache.initialize();
    logger.debug('Build cache initialized with Bun native hashing');
  }
  
  try {
    // Resolve paths
    const sourceRoot = path.resolve(config.source);
    const outputRoot = path.resolve(config.output);
    
    // Validate source directory exists
    try {
      await fs.access(sourceRoot);
    } catch (error) {
      throw new UnifyError(
        `Source directory not found: ${sourceRoot}`,
        null,
        null,
        [
          'Check that the source path is correct',
          'Verify the directory exists and is accessible',
          'Use --source flag to specify the correct source directory',
          'Create the source directory if it doesn\'t exist'
        ]
      );
    }
    
    // Clean output directory if requested
    if (config.clean) {
      await cleanOutputDirectory(outputRoot);
    }
    
    // Ensure output directory exists
    await fs.mkdir(outputRoot, { recursive: true });
    
    // Initialize dependency and asset trackers  
    const dependencyTracker = new DependencyTracker();
    const assetTracker = new AssetTracker();
    const fileClassifier = new FileClassifier();
    const layoutDiscovery = new LayoutDiscovery();
    
    // Scan source directory
    const sourceFiles = await scanDirectory(sourceRoot);
    logger.info(`Found ${sourceFiles.length} source files`);
    
    // Categorize files using convention-based classification
    const contentFiles = sourceFiles.filter(file => {
      return fileClassifier.isPage(file, sourceRoot);
    });
    const assetFiles = sourceFiles.filter(file => {
      const fileType = fileClassifier.getFileType(file, sourceRoot);
      // Exclude files in components or layouts directories
      const relativePath = path.relative(sourceRoot, file);
      const pathParts = relativePath.split(path.sep);
      if (config.components && pathParts.includes(path.basename(config.components))) {
        return false;
      }
      if (config.layouts && pathParts.includes(path.basename(config.layouts))) {
        return false;
      }
      return fileType === 'asset' && fileClassifier.shouldEmit(file, sourceRoot);
    });
    
    const results = {
      processed: 0,
      copied: 0,
      skipped: 0,
      errors: []
    };
    
    // Track processed content files for sitemap generation
    const processedFiles = [];
    const frontmatterData = new Map();
    
    // Process content files (HTML and Markdown) first to discover asset dependencies
    for (const filePath of sourceFiles) {
      try {
        const relativePath = path.relative(sourceRoot, filePath);
        const fileType = fileClassifier.getFileType(filePath, sourceRoot);
        
        if (fileType === 'page') {
          if (isHtmlFile(filePath)) {
            // Process HTML file with new convention-based system
            await processHtmlFileWithConventions(
              filePath, 
              sourceRoot, 
              outputRoot, 
              dependencyTracker,
              assetTracker,
              fileClassifier,
              layoutDiscovery,
              config,
              buildCache
            );
            processedFiles.push(filePath);
            results.processed++;
            logger.debug(`Processed HTML: ${relativePath}`);
          } else if (isMarkdownFile(filePath)) {
            // Process Markdown file with new convention-based layouts
            const frontmatter = await processMarkdownFileWithConventions(
              filePath,
              sourceRoot,
              outputRoot,
              layoutDiscovery,
              assetTracker,
              config.prettyUrls,
              config.minify
            );
            processedFiles.push(filePath);
            if (frontmatter) {
              frontmatterData.set(filePath, frontmatter);
            }
            results.processed++;
            logger.debug(`Processed Markdown: ${relativePath}`);
          }
        } else if (fileType === 'partial' || fileType === 'layout') {
          // Skip partial and layout files in output
          logger.debug(`Skipping ${fileType} file: ${relativePath}`);
          results.skipped++;
        }
      } catch (error) {
        const relativePath = path.relative(sourceRoot, filePath);
        
        // Use enhanced error formatting if available
        if (error.formatForCLI) {
          logger.error(error.formatForCLI());
        } else {
          logger.error(`Error processing ${relativePath}: ${error.message}`);
        }
        
        results.errors.push({ 
          file: filePath, 
          relativePath,
          error: error.message,
          errorType: error.constructor.name,
          suggestions: error.suggestions || []
        });
        
        // If perfection mode is enabled, fail fast on any error
        if (config.perfection) {
          throw new BuildError(`Build failed in perfection mode due to error in ${relativePath}: ${error.message}`, results.errors);
        }
      }
    }
    
    // Second pass: Copy only referenced assets
    for (const filePath of assetFiles) {
      try {
        const relativePath = path.relative(sourceRoot, filePath);
        const pathParts = relativePath.split(path.sep);
        // Skip copying any file or directory starting with _
        if (pathParts.some(part => part.startsWith('_'))) {
          logger.debug(`Skipped underscore-prefixed asset: ${relativePath}`);
          results.skipped++;
          continue;
        }
        if (assetTracker.isAssetReferenced(filePath)) {
          await copyAsset(filePath, sourceRoot, outputRoot);
          results.copied++;
          logger.debug(`Copied referenced asset: ${relativePath}`);
        } else {
          logger.debug(`Skipped unreferenced asset: ${relativePath}`);
          results.skipped++;
        }
      } catch (error) {
        const relativePath = path.relative(sourceRoot, filePath);
        // ...existing code...
        // If perfection mode is enabled, fail fast on any error
        if (config.perfection) {
          throw new BuildError(`Build failed in perfection mode due to error in ${relativePath}: ${error.message}`, results.errors);
        }
      }
    }
    
    // Third pass: Copy additional assets from glob pattern (if specified)
    if (config.assets) {
      try {
        const glob = new Bun.Glob(config.assets);
        const additionalAssets = [];
        
        // Scan from source root
        for await (const file of glob.scan(sourceRoot)) {
          const fullPath = path.resolve(sourceRoot, file);
          additionalAssets.push(fullPath);
        }
        
        logger.info(`Found ${additionalAssets.length} additional assets matching pattern: ${config.assets}`);
        
        for (const filePath of additionalAssets) {
          try {
            const relativePath = path.relative(sourceRoot, filePath);
            
            // Skip if this asset was already copied in the referenced assets pass
            if (!assetTracker.isAssetReferenced(filePath)) {
              await copyAsset(filePath, sourceRoot, outputRoot);
              results.copied++;
              logger.debug(`Copied additional asset: ${relativePath}`);
            } else {
              logger.debug(`Skipped additional asset (already copied): ${relativePath}`);
            }
          } catch (error) {
            const relativePath = path.relative(sourceRoot, filePath);
            
            // Use enhanced error formatting if available
            if (error.formatForCLI) {
              logger.error(error.formatForCLI());
            } else {
              logger.error(`Error copying additional asset ${relativePath}: ${error.message}`);
            }
            
            results.errors.push({ 
              file: filePath, 
              relativePath,
              error: error.message,
              errorType: error.constructor.name,
              suggestions: error.suggestions || []
            });
            
            // If perfection mode is enabled, fail fast on any error
            if (config.perfection) {
              throw new BuildError(`Build failed in perfection mode due to error copying additional asset ${relativePath}: ${error.message}`, results.errors);
            }
          }
        }
      } catch (error) {
        // Handle glob pattern errors
        logger.error(`Error processing assets glob pattern "${config.assets}": ${error.message}`);
        results.errors.push({ 
          file: 'assets-glob', 
          error: `Invalid glob pattern "${config.assets}": ${error.message}`,
          errorType: error.constructor.name,
          suggestions: [
            'Check the glob pattern syntax (e.g., "./assets/**/*.*")',
            'Ensure the pattern is relative to the source directory',
            'Use forward slashes for paths even on Windows'
          ]
        });
        
        // If perfection mode is enabled, fail fast on any error
        if (config.perfection) {
          throw new BuildError(`Build failed in perfection mode due to assets glob error: ${error.message}`, results.errors);
        }
      }
    }
    
    // Generate sitemap.xml (if enabled)  
    if (config.sitemap !== false) {
      try {
        // Resolve baseUrl: CLI arg → package.json homepage → default
        const baseUrl = config.baseUrl !== 'https://example.com' 
          ? config.baseUrl 
          : await getBaseUrlFromPackage(sourceRoot, config.baseUrl);
          
        const pageInfo = extractPageInfo(processedFiles, sourceRoot, outputRoot, config.prettyUrls);
        const enhancedPageInfo = enhanceWithFrontmatter(pageInfo, frontmatterData);
        const sitemapContent = generateSitemap(enhancedPageInfo, baseUrl);
        await writeSitemap(sitemapContent, outputRoot);
      } catch (error) {
        // Use enhanced error formatting if available
        if (error.formatForCLI) {
          logger.error(error.formatForCLI());
        } else {
          logger.error(`Error generating sitemap: ${error.message}`);
        }
        results.errors.push({ file: 'sitemap.xml', error: error.message });
        
        // If perfection mode is enabled, fail fast on any error
        if (config.perfection) {
          throw new BuildError(`Build failed in perfection mode due to sitemap generation error: ${error.message}`, results.errors);
        }
      }
    }
    
    // Build summary
    const duration = Date.now() - startTime;
    logger.success(`Build completed in ${duration}ms`);
    logger.info(`Processed: ${results.processed} pages, Copied: ${results.copied} assets, Skipped: ${results.skipped} partials`);
    
    if (results.errors.length > 0) {
      // Enhanced error reporting with categorization
      const errorsByType = results.errors.reduce((acc, err) => {
        acc[err.errorType] = (acc[err.errorType] || 0) + 1;
        return acc;
      }, {});
      
      logger.error('\\n📋 Build Error Summary:');
      for (const [errorType, count] of Object.entries(errorsByType)) {
        logger.error(`   ${errorType}: ${count} error(s)`);
      }
      
      logger.error(`\\n💥 Total: ${results.errors.length} error(s) encountered`);
      
      throw new BuildError(`${results.errors.length} error(s)`, results.errors);
    }
    
    // Save build cache if enabled
    if (buildCache) {
      await buildCache.saveCache();
      logger.debug('Build cache saved');
    }
    
    return {
      ...results,
      duration,
      dependencyTracker,
      assetTracker,
      buildCache
    };
    
  } catch (error) {
    if (error.formatForCLI) {
      logger.error(error.formatForCLI());
    } else {
      logger.error('Build failed:', error.message);
    }
    throw error;
  }
}

/**
 * Perform incremental build - only rebuild files that have changed
 * @param {Object} options - Build configuration options
 * @param {DependencyTracker} dependencyTracker - Existing dependency tracker
 * @param {AssetTracker} assetTracker - Existing asset tracker
 * @param {string} changedFile - Specific file that changed (optional)
 * @returns {Promise<Object>} Build results
 */
export async function incrementalBuild(options = {}, dependencyTracker = null, assetTracker = null, changedFile = null) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  
  logger.info(`Starting incremental build...`);
  
  try {
    const sourceRoot = path.resolve(config.source);
    const outputRoot = path.resolve(config.output);
    
    // Initialize or reuse trackers
    const tracker = dependencyTracker || new DependencyTracker();
    const assets = assetTracker || new AssetTracker();
    
    // Determine what files need rebuilding
    let filesToRebuild = await getFilesToRebuild(sourceRoot, changedFile, tracker, config);

    // If dependencyTracker is available and changedFile is set, rebuild all affected pages
    if (changedFile && tracker) {
      const affectedPages = tracker.getAffectedPages(path.resolve(changedFile));
      affectedPages.forEach(page => filesToRebuild.push(page));
      // Remove duplicates
      filesToRebuild = Array.from(new Set(filesToRebuild));
      logger.debug(`Incremental build: rebuilding ${filesToRebuild.length} files (including affected pages)`);
    }

    const results = {
      processed: 0,
      copied: 0,
      skipped: 0,
      errors: []
    };

    if (filesToRebuild.length === 0) {
      logger.info('No files need rebuilding');
      return { ...results, duration: Date.now() - startTime, dependencyTracker: tracker };
    }

    logger.info(`Rebuilding ${filesToRebuild.length} file(s)...`);

    for (const filePath of filesToRebuild) {
      try {
        const relativePath = path.relative(sourceRoot, filePath);

        // Check if the file still exists (might be deleted)
        let fileExists = true;
        try {
          await fs.access(filePath);
        } catch (error) {
          fileExists = false;
        }

        if (!fileExists) {
          // File was deleted - just remove it from modification cache
          fileModificationCache.delete(filePath);
          logger.debug(`Removed deleted file from cache: ${relativePath}`);
          continue;
        }

        if (isHtmlFile(filePath)) {
          if (!isPartialFile(filePath, config)) {
            await processHtmlFile(filePath, sourceRoot, outputRoot, tracker, assets, config);
            results.processed++;
            logger.debug(`Rebuilt HTML: ${relativePath}`);
          }
        } else if (isMarkdownFile(filePath)) {
          // Load layout for markdown processing
          const layoutFile = await findLayoutFile(sourceRoot, config.layouts);
          let layoutContent = null;
          if (layoutFile) {
            try {
              layoutContent = await fs.readFile(layoutFile, 'utf-8');
            } catch (error) {
              // If perfection mode is enabled, fail fast on layout errors
              if (config.perfection) {
                throw new BuildError(`Build failed in perfection mode due to layout error: Could not read layout file ${layoutFile}: ${error.message}`, results.errors);
              }
              logger.warn(`Could not read layout file ${layoutFile}: ${error.message}`);
            }
          }

          await processMarkdownFile(filePath, sourceRoot, outputRoot, layoutContent, assets, config.prettyUrls, config.layouts, config.minify);
          results.processed++;
          logger.debug(`Rebuilt Markdown: ${relativePath}`);
        } else {
          // For assets, only copy if referenced (or during initial build)
          if (assets.isAssetReferenced(filePath) || !assetTracker) {
            await copyAsset(filePath, sourceRoot, outputRoot);
            results.copied++;
            logger.debug(`Copied: ${relativePath}`);
          } else {
            logger.debug(`Skipped unreferenced asset: ${relativePath}`);
            results.skipped++;
          }
        }

        // Update modification cache for existing files
        const stats = await fs.stat(filePath);
        fileModificationCache.set(filePath, stats.mtime.getTime());

      } catch (error) {
        logger.error(error.formatForCLI ? error.formatForCLI() : `Error processing ${filePath}: ${error.message}`);
        results.errors.push({ file: filePath, error: error.message });
      }
    }

    const duration = Date.now() - startTime;
    logger.success(`Incremental build completed in ${duration}ms`);
    logger.info(`Rebuilt: ${results.processed} pages, ${results.copied} assets`);

    if (results.errors.length > 0) {
      logger.error(`Incremental build failed with ${results.errors.length} errors`);
      throw new BuildError(`Incremental build failed with ${results.errors.length} errors`, results.errors);
    }

    return {
      ...results,
      duration,
      dependencyTracker: tracker,
      assetTracker: assets
    };
    
  } catch (error) {
    if (error.formatForCLI) {
      logger.error(error.formatForCLI());
    } else {
      logger.error('Incremental build failed:', error.message);
    }
    throw error;
  }
}

/**
 * Get list of files that need rebuilding based on changes
 * @param {string} sourceRoot - Source root directory
 * @param {string|null} changedFile - Specific file that changed
 * @param {DependencyTracker} dependencyTracker - Dependency tracker
 * @returns {Promise<string[]>} Array of file paths to rebuild
 */
async function getFilesToRebuild(sourceRoot, changedFile, dependencyTracker, config = {}) {
  const filesToRebuild = new Set();
  
  if (changedFile) {
    // Specific file changed - determine impact
    const resolvedChangedFile = path.resolve(changedFile);
    
    if (isHtmlFile(resolvedChangedFile)) {
      if (isPartialFile(resolvedChangedFile, config)) {
        // Partial file changed - rebuild all pages that depend on it
        const dependentPages = dependencyTracker.getDependentPages(resolvedChangedFile);
        dependentPages.forEach(page => filesToRebuild.add(page));
        logger.debug(`Partial ${path.relative(sourceRoot, resolvedChangedFile)} changed, rebuilding ${dependentPages.length} dependent pages`);
      } else {
        // Main page changed - rebuild just this page
        filesToRebuild.add(resolvedChangedFile);
        logger.debug(`Page ${path.relative(sourceRoot, resolvedChangedFile)} changed`);
      }
    } else {
      // Asset or unknown file type changed
      filesToRebuild.add(resolvedChangedFile);
      
      // For new asset files, we should also rebuild all HTML/Markdown pages 
      // to check if they now reference this asset
      if (!isHtmlFile(resolvedChangedFile) && !isMarkdownFile(resolvedChangedFile)) {
        try {
          // Check if this is a new file (not in modification cache)
          const isNewFile = !fileModificationCache.has(resolvedChangedFile);
          
          if (isNewFile) {
            // New asset file - rebuild all content pages to pick up potential references
            const allFiles = await scanDirectory(sourceRoot);
            const contentFiles = allFiles.filter(file => 
              (isHtmlFile(file) && !isPartialFile(file, config)) || isMarkdownFile(file)
            );
            contentFiles.forEach(page => filesToRebuild.add(page));
            logger.debug(`New asset ${path.relative(sourceRoot, resolvedChangedFile)} added, rebuilding ${contentFiles.length} pages to check for references`);
          } else {
            logger.debug(`Asset ${path.relative(sourceRoot, resolvedChangedFile)} changed`);
          }
        } catch (error) {
          // If we can't determine if it's new, just copy the asset
          logger.debug(`Asset ${path.relative(sourceRoot, resolvedChangedFile)} changed`);
        }
      }
    }
  } else {
    // No specific file - check all files for changes
    const allFiles = await scanDirectory(sourceRoot);
    
    for (const filePath of allFiles) {
      if (await hasFileChanged(filePath)) {
        filesToRebuild.add(filePath);
      }
    }
  }
  
  return Array.from(filesToRebuild);
}

/**
 * Check if a file has changed since last build
 * @param {string} filePath - File path to check
 * @returns {Promise<boolean>} True if file has changed
 */
async function hasFileChanged(filePath) {
  try {
    const stats = await fs.stat(filePath);
    const currentMtime = stats.mtime.getTime();
    const cachedMtime = fileModificationCache.get(filePath);
    
    return !cachedMtime || currentMtime > cachedMtime;
  } catch (error) {
    // File doesn't exist or can't be accessed - consider it changed
    return true;
  }
}

/**
 * Initialize file modification cache for a directory
 * @param {string} sourceRoot - Source root directory
 */
export async function initializeModificationCache(sourceRoot) {
  const files = await scanDirectory(sourceRoot);
  
  for (const filePath of files) {
    try {
      const stats = await fs.stat(filePath);
      fileModificationCache.set(filePath, stats.mtime.getTime());
    } catch (error) {
      // Ignore files that can't be accessed
    }
  }
  
  logger.debug(`Initialized modification cache with ${fileModificationCache.size} files`);
}

/**
 * Generate output path for a file, with optional pretty URL support
 * @param {string} filePath - Source file path
 * @param {string} sourceRoot - Source root directory  
 * @param {string} outputRoot - Output root directory
 * @param {boolean} prettyUrls - Whether to generate pretty URLs
 * @returns {string} Output file path
 */
function getOutputPathWithPrettyUrls(filePath, sourceRoot, outputRoot, prettyUrls = false) {
  const relativePath = path.relative(sourceRoot, filePath);
  
  if (prettyUrls && (isMarkdownFile(filePath) || isHtmlFile(filePath))) {
    const nameWithoutExt = path.basename(relativePath, path.extname(relativePath));
    const dir = path.dirname(relativePath);
    
    // Special case: if the file is already named index.md or index.html, don't create nested directory
    if (nameWithoutExt === 'index') {
      if (isMarkdownFile(filePath)) {
        return path.join(outputRoot, dir, 'index.html');
      } else {
        // For HTML files, keep as index.html in the same directory
        return path.join(outputRoot, dir, 'index.html');
      }
    }
    
    // Create directory structure: 
    // about.md → about/index.html
    // docs.html → docs/index.html
    if (isMarkdownFile(filePath)) {
      return path.join(outputRoot, dir, nameWithoutExt, 'index.html');
    } else {
      // For HTML files, create directory with the basename and put index.html inside
      return path.join(outputRoot, dir, nameWithoutExt, 'index.html');
    }
  }
  
  // For HTML files or when pretty URLs is disabled, use standard conversion
  if (isMarkdownFile(filePath)) {
    return path.join(outputRoot, relativePath.replace(/\.md$/i, '.html'));
  }
  
  // For all other files (HTML, assets), use original logic
  return getOutputPath(filePath, sourceRoot, outputRoot);
}

/**
 * Find layout file for markdown processing
 * @param {string} sourceRoot - Source root directory
 * @returns {Promise<string|null>} Path to layout file or null if not found
 */
async function findLayoutFile(sourceRoot, layoutsDir = '.layouts') {
  const possibleLayouts = [
    path.join(sourceRoot, 'layout.html'),
    path.join(sourceRoot, '_layout.html'),
    path.join(sourceRoot, 'templates', 'layout.html'),
    path.join(sourceRoot, layoutsDir, 'default.html'),
    path.join(sourceRoot, 'layouts', 'default.html'),  // Legacy support
    path.join(sourceRoot, '.components', 'layout.html')  // Components directory fallback
  ];
  
  for (const layoutPath of possibleLayouts) {
    try {
      await fs.access(layoutPath);
      return layoutPath;
    } catch {
      // File doesn't exist, try next
    }
  }
  
  return null;
}

/**
 * Check if default.html layout exists in the layouts directory
 * @param {string} sourceRoot - Source root directory
 * @param {string} layoutsDir - Layouts directory name
 * @returns {Promise<boolean>} True if default.html exists
 */
async function hasDefaultLayout(sourceRoot, layoutsDir = '.layouts') {
  const defaultLayoutPath = path.join(sourceRoot, layoutsDir, 'default.html');
  try {
    await fs.access(defaultLayoutPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create basic HTML structure for content without layout
 * @param {string} content - HTML content
 * @param {string} title - Page title
 * @param {string} excerpt - Page excerpt
 * @returns {string} Complete HTML document
 */
function createBasicHtmlStructure(content, title, excerpt) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Untitled'}</title>
  ${excerpt ? `<meta name="description" content="${excerpt}">` : ''}
</head>
<body>
  <main>
    ${content}
  </main>
</body>
</html>`;
}

/**
 * Process a single Markdown file
 * @param {string} filePath - Path to Markdown file
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 * @param {string|null} layoutContent - Layout template content
 * @param {AssetTracker} assetTracker - Asset tracker instance
 * @param {boolean} prettyUrls - Whether to generate pretty URLs
 * @param {string} layoutsDir - Layouts directory name
 * @returns {Promise<Object|null>} Frontmatter data or null
 */
async function processMarkdownFile(filePath, sourceRoot, outputRoot, layoutContent, assetTracker, prettyUrls = false, layoutsDir = '.layouts', minify = false) {
  // Read markdown content
  let markdownContent;
  try {
    markdownContent = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new FileSystemError('read', filePath, error);
  }
  
  // Process includes in markdown content first (before converting to HTML)
  // For markdown, we'll import processIncludes directly since we're processing markdown syntax
  const { processIncludes } = await import('./include-processor.js');
  const processedMarkdown = await processIncludes(markdownContent, filePath, sourceRoot, new Set(), 0, null);
  
  // Process markdown to HTML
  const { html, frontmatter, title, excerpt } = processMarkdown(processedMarkdown, filePath);
  
  // Add anchor links to headings
  const htmlWithAnchors = addAnchorLinks(html);
  
  // Generate table of contents
  const tableOfContents = generateTableOfContents(htmlWithAnchors);
  
  // Determine layout application strategy
  const metadata = { frontmatter, title, excerpt, tableOfContents };
  let finalContent;
  
  // Check if content already has <html> element
  const contentHasHtml = hasHtmlElement(htmlWithAnchors);
  
  if (contentHasHtml) {
    // Content already has complete HTML structure, use as-is
    finalContent = htmlWithAnchors;
    logger.debug('Using content as-is (contains <html> element)');
  } else if (layoutContent) {
    // Apply specified layout when content doesn't have <html> element
    finalContent = wrapInLayout(htmlWithAnchors, metadata, layoutContent);
    logger.debug('Applied specified layout');
  } else if (frontmatter.layout) {
    // Load layout from frontmatter specification
    const layoutPath = path.isAbsolute(layoutsDir) 
      ? path.join(layoutsDir, frontmatter.layout)
      : path.join(sourceRoot, layoutsDir, frontmatter.layout);
    
    try {
      const frontmatterLayoutContent = await fs.readFile(layoutPath, 'utf-8');
      
      // Process layout content through include processor to handle includes
      const { processIncludes } = await import('./include-processor.js');
      const processedLayout = await processIncludes(frontmatterLayoutContent, layoutPath, sourceRoot, new Set(), 0, null);
      
      // Replace slots with content (DOM mode style)
      let layoutWithContent = processedLayout.replace(/<slot[^>]*><\/slot>/g, htmlWithAnchors);
      
      // Also handle markdown-style template variables if present
      layoutWithContent = layoutWithContent.replace(/\{\{\s*content\s*\}\}/g, htmlWithAnchors);
      layoutWithContent = layoutWithContent.replace(/\{\{\s*title\s*\}\}/g, metadata.title || 'Untitled');
      
      // Replace frontmatter variables
      const allData = { ...metadata.frontmatter, ...metadata };
      for (const [key, value] of Object.entries(allData)) {
        if (typeof value === 'string') {
          const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
          layoutWithContent = layoutWithContent.replace(regex, value);
        }
      }
      
      finalContent = layoutWithContent;
      logger.debug(`Applied frontmatter layout: ${frontmatter.layout}`);
    } catch (error) {
      logger.warn(`Could not read frontmatter layout ${frontmatter.layout}: ${error.message}`);
      // Fall through to default layout check
    }
  }
  
  if (!finalContent) {
    // No layout specified, check for default layout
    const hasDefault = await hasDefaultLayout(sourceRoot, layoutsDir);
    if (hasDefault) {
      // Load and apply default layout
      const defaultLayoutPath = path.join(sourceRoot, layoutsDir, 'default.html');
      try {
        const defaultLayoutContent = await fs.readFile(defaultLayoutPath, 'utf-8');
        finalContent = wrapInLayout(htmlWithAnchors, metadata, defaultLayoutContent);
        logger.debug('Applied default layout');
      } catch (error) {
        logger.warn(`Could not read default layout: ${error.message}`);
        // Fallback: only create basic HTML if layout is not specified, default not found, and no <html> element
        finalContent = createBasicHtmlStructure(htmlWithAnchors, title, excerpt);
        logger.debug('Created basic HTML structure (default layout failed)');
      }
    } else {
      // No layout specified, no default layout found, no <html> element → create basic HTML
      finalContent = createBasicHtmlStructure(htmlWithAnchors, title, excerpt);
      logger.debug('Created basic HTML structure (no layout available)');
    }
  }
  
  // Track asset references in the final content
  if (assetTracker) {
    await assetTracker.recordAssetReferences(filePath, finalContent, sourceRoot);
  }
  
  // Generate output path with pretty URL support
  const outputPath = getOutputPathWithPrettyUrls(filePath, sourceRoot, outputRoot, prettyUrls);
  await ensureDirectoryExists(path.dirname(outputPath));
  
  // Apply minification if enabled
  if (minify) {
    finalContent = minifyHtml(finalContent);
  }
  
  try {
    await fs.writeFile(outputPath, finalContent, 'utf-8');
  } catch (error) {
    throw new FileSystemError('write', outputPath, error);
  }
  
  // Return frontmatter for sitemap generation
  return frontmatter;
}

/**
 * Process a single HTML file
 * @param {string} filePath - Path to HTML file
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 * @param {DependencyTracker} dependencyTracker - Dependency tracker instance
 * @param {AssetTracker} assetTracker - Asset tracker instance
 */
async function processHtmlFile(filePath, sourceRoot, outputRoot, dependencyTracker, assetTracker, config = {}, buildCache = null) {
  const outputPath = getOutputPathWithPrettyUrls(filePath, sourceRoot, outputRoot, config.prettyUrls);
  
  // Check cache if available
  if (buildCache && await buildCache.isUpToDate(filePath, outputPath)) {
    logger.debug(`Skipping unchanged file: ${path.relative(sourceRoot, filePath)}`);
    return;
  }
  
  // Read HTML content
  let htmlContent;
  try {
    htmlContent = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new FileSystemError('read', filePath, error);
  }
  
  // Use unified HTML processor that handles both SSI includes and DOM templating
  logger.debug(`Processing HTML with unified processor: ${path.relative(sourceRoot, filePath)}`);
  
  const unifiedConfig = getUnifiedConfig(config);
  let processedContent = await processHtmlUnified(
    htmlContent, 
    filePath, 
    sourceRoot, 
    dependencyTracker,
    unifiedConfig
  );
  
  // Track asset references in the final content
  if (assetTracker) {
    await assetTracker.recordAssetReferences(filePath, processedContent, sourceRoot);
  }
  
  // Write to output
  await ensureDirectoryExists(path.dirname(outputPath));
  
  // Apply minification if enabled
  if (config.minify) {
    processedContent = minifyHtml(processedContent);
  }
  
  try {
    await fs.writeFile(outputPath, processedContent, 'utf-8');
    
    // Update cache after successful write
    if (buildCache) {
      await buildCache.updateFileHash(filePath);
      
      // Update dependencies from dependency tracker
      if (dependencyTracker) {
        const dependencies = dependencyTracker.getPageDependencies(filePath);
        if (dependencies && dependencies.length > 0) {
          buildCache.setDependencies(filePath, dependencies);
        }
      }
    }
  } catch (error) {
    throw new FileSystemError('write', outputPath, error);
  }
}

/**
 * Copy a static asset file
 * @param {string} filePath - Path to asset file
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 */
async function copyAsset(filePath, sourceRoot, outputRoot) {
  const outputPath = getOutputPath(filePath, sourceRoot, outputRoot);
  await ensureDirectoryExists(path.dirname(outputPath));
  
  try {
    await fs.copyFile(filePath, outputPath);
  } catch (error) {
    throw new FileSystemError('copy', filePath, error);
  }
}

/**
 * Recursively scan directory for files
 * @param {string} dirPath - Directory to scan
 * @param {string[]} files - Accumulated file list
 * @returns {Promise<string[]>} Array of file paths
 */
async function scanDirectory(dirPath, files = []) {
  let entries;
  
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    throw new FileSystemError('readdir', dirPath, error);
  }
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      // Skip hidden directories and common build/dependency directories
      // Now includes all underscore directories since they're part of the convention
      if (!entry.name.startsWith('.') &&
          entry.name !== 'node_modules' && 
          entry.name !== 'dist' && 
          entry.name !== 'build') {
        await scanDirectory(fullPath, files);
      }
    } else if (entry.isFile()) {
      // Include all files (underscore files are now part of the convention)
      // Still skip hidden files that start with '.'
      if (!entry.name.startsWith('.')) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

/**
 * Clean output directory
 * @param {string} outputRoot - Output directory to clean
 */
async function cleanOutputDirectory(outputRoot) {
  try {
    const stats = await fs.stat(outputRoot);
    if (stats.isDirectory()) {
      logger.debug(`Cleaning output directory: ${outputRoot}`);
      await fs.rm(outputRoot, { recursive: true, force: true });
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new FileSystemError('clean', outputRoot, error);
    }
    // Directory doesn't exist, nothing to clean
  }
}

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new FileSystemError('mkdir', dirPath, error);
  }
}

/**
 * Process HTML file with convention-based layout discovery
 * @param {string} filePath - Path to HTML file
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 * @param {DependencyTracker} dependencyTracker - Dependency tracker instance
 * @param {AssetTracker} assetTracker - Asset tracker instance
 * @param {FileClassifier} fileClassifier - File classifier instance
 * @param {LayoutDiscovery} layoutDiscovery - Layout discovery instance
 * @param {Object} config - Build configuration
 * @param {Object} buildCache - Build cache instance
 */
async function processHtmlFileWithConventions(filePath, sourceRoot, outputRoot, dependencyTracker, assetTracker, fileClassifier, layoutDiscovery, config = {}, buildCache = null) {
  const outputPath = getOutputPathWithPrettyUrls(filePath, sourceRoot, outputRoot, config.prettyUrls);
  
  // Check cache if available
  if (buildCache && await buildCache.isUpToDate(filePath, outputPath)) {
    logger.debug(`Skipping unchanged file: ${path.relative(sourceRoot, filePath)}`);
    return;
  }
  
  // Read HTML content
  let htmlContent;
  try {
    htmlContent = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new FileSystemError('read', filePath, error);
  }
  
  // Use unified HTML processor with convention-based configuration
  logger.debug(`Processing HTML with conventions: ${path.relative(sourceRoot, filePath)}`);
  
  // Create unified config that works with convention-based system
  const unifiedConfig = {
    ...getUnifiedConfig(config),
    layoutDiscovery,
    fileClassifier,
    sourceRoot
  };
  
  let processedContent = await processHtmlUnified(
    htmlContent, 
    filePath, 
    sourceRoot, 
    dependencyTracker,
    unifiedConfig
  );
  
  // Track asset references in the final content
  if (assetTracker) {
    await assetTracker.recordAssetReferences(filePath, processedContent, sourceRoot);
  }
  
  // Write to output
  await ensureDirectoryExists(path.dirname(outputPath));
  
  // Apply minification if enabled
  if (config.minify) {
    processedContent = minifyHtml(processedContent);
  }
  
  try {
    await fs.writeFile(outputPath, processedContent, 'utf-8');
    
    // Update cache after successful write
    if (buildCache) {
      await buildCache.updateFileHash(filePath);
      
      // Update dependencies from dependency tracker
      if (dependencyTracker) {
        const dependencies = dependencyTracker.getPageDependencies(filePath);
        if (dependencies && dependencies.length > 0) {
          buildCache.setDependencies(filePath, dependencies);
        }
      }
    }
  } catch (error) {
    throw new FileSystemError('write', outputPath, error);
  }
}

/**
 * Process Markdown file with convention-based layout discovery
 * @param {string} filePath - Path to Markdown file
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 * @param {LayoutDiscovery} layoutDiscovery - Layout discovery instance
 * @param {AssetTracker} assetTracker - Asset tracker instance
 * @param {boolean} prettyUrls - Whether to generate pretty URLs
 * @param {boolean} minify - Whether to minify HTML output
 * @returns {Promise<Object|null>} Frontmatter data or null
 */
async function processMarkdownFileWithConventions(filePath, sourceRoot, outputRoot, layoutDiscovery, assetTracker, prettyUrls = false, minify = false) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { processedContent, frontmatter } = await processMarkdown(content, filePath, sourceRoot);
    
    // Determine layout using convention-based discovery
    let layoutPath = null;
    
    // Check for layout override in frontmatter
    if (frontmatter?.layout) {
      layoutPath = await layoutDiscovery.resolveLayoutOverride(frontmatter.layout, sourceRoot, filePath);
      if (!layoutPath) {
        logger.warn(`Layout specified in frontmatter not found: ${frontmatter.layout} (${path.relative(sourceRoot, filePath)})`);
      }
    }
    
    // Fall back to automatic layout discovery
    if (!layoutPath) {
      layoutPath = await layoutDiscovery.findLayoutForPage(filePath, sourceRoot);
    }
    
    let finalContent = processedContent;
    
    // Apply layout if found
    if (layoutPath) {
      logger.debug(`Applying layout to Markdown: ${path.relative(sourceRoot, layoutPath)}`);
      const layoutContent = await fs.readFile(layoutPath, 'utf-8');
      
      // Check if the processed content already has complete HTML structure
      if (!layoutDiscovery.hasCompleteHtmlStructure(processedContent)) {
        finalContent = wrapInLayout(processedContent, layoutContent, frontmatter);
      } else {
        logger.debug(`Markdown file already has complete HTML structure, skipping layout: ${path.relative(sourceRoot, filePath)}`);
      }
    } else {
      logger.debug(`No layout found for Markdown file: ${path.relative(sourceRoot, filePath)}`);
    }
    
    // Determine output path
    const outputPath = prettyUrls 
      ? getOutputPath(filePath, sourceRoot, outputRoot, true)
      : getOutputPath(filePath.replace(/\.md$/, '.html'), sourceRoot, outputRoot);
    
    // Track asset references
    if (assetTracker) {
      await assetTracker.recordAssetReferences(filePath, finalContent, sourceRoot);
    }
    
    // Write output
    await ensureDirectoryExists(path.dirname(outputPath));
    
    // Apply minification if enabled
    if (minify) {
      finalContent = minifyHtml(finalContent);
    }
    
    await fs.writeFile(outputPath, finalContent, 'utf-8');
    
    return frontmatter;
  } catch (error) {
    throw new FileSystemError('process', filePath, error);
  }
}

