/**
 * File Processing System for unify
 * Handles the build workflow and file operations
 */

import fs from "fs/promises";
import path from "path";
// processIncludes is now handled by unified-html
import { DependencyTracker } from "./dependency-tracker.js";
import { AssetTracker } from "./asset-tracker.js";
import { FileClassifier, FileClassification } from "./file-classifier.js";
import { LayoutDiscovery } from "./layout-discovery.js";
import { CascadingImportsProcessor } from "./cascading-imports-processor.js";
import { HeadMergeProcessor } from "./head-merge-processor.js";
import {
  processMarkdown,
  isMarkdownFile,
  wrapInLayout,
  generateTableOfContents,
  addAnchorLinks,
  hasHtmlElement,
} from "./markdown-processor.js";
import {
  isHtmlFile,
  isPartialFile,
  getOutputPath,
  getFileExtension,
} from "../utils/path-resolver.js";
import {
  extractPageInfo,
  enhanceWithFrontmatter,
  writeSitemap,
  generateSitemap,
} from "./sitemap-generator.js";
import {
  processHtmlUnified,
  getUnifiedConfig,
} from "./unified-html-processor.js";
import { createBuildCache } from "./build-cache.js";
import { FileSystemError, BuildError, UnifyError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getBaseUrlFromPackage } from "../utils/package-reader.js";

/**
 * Determine if build should fail based on configuration and error type
 * @param {Object} config - Build configuration
 * @param {string} errorType - Type of error that occurred
 * @param {Object} error - The actual error object
 * @returns {boolean} True if build should fail
 */
function shouldFailBuild(config, errorType = 'error', error = null) {
  // New fail-on logic
  if (!config.failOn) {
    // Default: only fail on fatal build errors, not individual page errors
    return false;
  }
  
  if (config.failOn === 'warning') {
    // Fail on any warning or error
    return true;
  }
  
  if (config.failOn === 'error') {
    // Fail on errors (but not warnings)
    return errorType === 'error' || errorType === 'fatal';
  }
  
  return false;
}

/**
 * Enhanced HTML minifier that removes unnecessary whitespace, comments, and optimizes attributes
 * @param {string} html - HTML content to minify
 * @returns {string} - Minified HTML content
 */
function minifyHtml(html) {
  return (
    html
      // Remove HTML comments (but preserve conditional comments and live reload script)
      .replace(
        /<!--(?!\s*(?:\[if\s|\[endif|<!\[|.*live reload))[\s\S]*?-->/g,
        ""
      )
      // Remove extra whitespace between tags
      .replace(/>\s+</g, "><")
      // Remove whitespace around equal signs in attributes
      .replace(/\s*=\s*/g, "=")
      // Remove unnecessary quotes from attributes (but keep if they contain spaces or special chars)
      .replace(/=["']([a-zA-Z0-9\-_\.]+)["']/g, "=$1")
      // Remove empty attributes (except for specific ones that need to be preserved)
      .replace(/\s+(class|id|data-[\w-]+)=""/g, "")
      // Collapse multiple whitespace within text content to single space
      .replace(/\s+/g, " ")
      // Remove whitespace at start/end of tags
      .replace(/\s+>/g, ">")
      .replace(/<\s+/g, "<")
      // Remove unnecessary whitespace in CSS and JavaScript
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
        const minifiedCss = css
          .replace(/\/\*[\s\S]*?\*\//g, "") // Remove CSS comments
          .replace(/\s*{\s*/g, "{") // Remove whitespace around braces
          .replace(/\s*}\s*/g, "}")
          .replace(/\s*;\s*/g, ";") // Remove whitespace around semicolons
          .replace(/\s*:\s*/g, ":") // Remove whitespace around colons
          .replace(/\s+/g, " ") // Collapse whitespace
          .trim();
        return match.replace(css, minifiedCss);
      })
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, (match, js) => {
        // Basic JavaScript minification (preserve functionality)
        const minifiedJs = js
          .replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
          .replace(/\/\/[^\r\n]*/g, "") // Remove line comments (but preserve line structure)
          .replace(/\s*([{}();,=])\s*/g, "$1") // Remove whitespace around punctuation
          .replace(/\s+/g, " ") // Collapse whitespace
          .trim();
        return match.replace(js, minifiedJs);
      })
      // Remove leading/trailing whitespace
      .trim()
  );
}

/**
 * Cache for tracking file modification times for incremental builds
 */
const fileModificationCache = new Map();

/**
 * Build configuration options
 */
const DEFAULT_OPTIONS = {
  source: "src",
  output: "dist",
  clean: true,
  prettyUrls: false,
  baseUrl: "https://example.com",
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
  // Propagate build config globally for asset copying and output logic
  globalThis.UNIFY_BUILD_CONFIG = config;
  const startTime = Date.now();

  logger.info(`Building site from ${config.source} to ${config.output}`);

  // Initialize build cache if caching is enabled
  let buildCache = null;
  if (config.cache !== false) {
    buildCache = createBuildCache(config.cacheDir || ".unify-cache");
    await buildCache.initialize();
    logger.debug("Build cache initialized with native hashing");
  }

  try {
    // Resolve paths
    const sourceRoot = path.resolve(config.source);
    const outputRoot = path.resolve(config.output);

    // Validate source directory exists
    try {
      await fs.access(sourceRoot);
    } catch (error) {
      const dirError = new UnifyError(
        `Source directory not found: ${sourceRoot}`,
        null,
        null,
        [
          "Check that the source path is correct",
          "Verify the directory exists and is accessible",
          "Use --source flag to specify the correct source directory",
          "Create the source directory if it doesn't exist",
        ]
      );
      dirError.errorType = 'UsageError';
      throw dirError;
    }

    // Clean output directory if requested
    if (config.clean) {
      logger.info(`Cleaning output directory: ${outputRoot}`);
      await cleanOutputDirectory(outputRoot);
    }

    // Ensure output directory exists
    await fs.mkdir(outputRoot, { recursive: true });

    // Initialize dependency and asset trackers
    const dependencyTracker = new DependencyTracker();
    const assetTracker = new AssetTracker();
    
    // Initialize new v0.6.0 FileClassifier with CLI options
    const fileClassifierOptions = {
      sourceRoot,
      copy: config.copy || [],
      ignore: config.ignore || [],
      ignoreRender: config.ignoreRender || [],
      ignoreCopy: config.ignoreCopy || [],
      render: config.render || [],
      autoIgnore: config.autoIgnore !== false // Default true
    };
    const fileClassifier = new FileClassifier(fileClassifierOptions);
    
    // Initialize other processors
    const layoutDiscovery = new LayoutDiscovery();
    const cascadingImports = new CascadingImportsProcessor(sourceRoot, {
      failFast: shouldFailBuild(config, 'error')
    });
    const headMerge = new HeadMergeProcessor();

    // Scan source directory
    const sourceFiles = await scanDirectory(sourceRoot);
    logger.info(`Found ${sourceFiles.length} source files`);

    // Handle dry-run mode - classify all files and generate report
    if (config.dryRun) {
      logger.info("Running in dry-run mode - analyzing file classification only");
      
      const classifications = [];
      for (const filePath of sourceFiles) {
        try {
          const classification = await fileClassifier.classifyFile(
            path.relative(sourceRoot, filePath)
          );
          classifications.push({
            ...classification,
            filePath: path.relative(sourceRoot, filePath)
          });
        } catch (error) {
          logger.warn(`Error classifying ${path.relative(sourceRoot, filePath)}: ${error.message}`);
        }
      }
      
      // Generate and display dry-run report
      const report = fileClassifier.generateDryRunReport(classifications);
      logger.info("\n" + report);
      
      const duration = Date.now() - startTime;
      logger.success(`Dry-run completed in ${duration}ms`);
      
      return {
        processed: 0,
        copied: 0,
        skipped: 0,
        errors: [],
        duration,
        dependencyTracker,
        assetTracker,
        buildCache: null,
        dryRun: true,
        classifications
      };
    }

    // Categorize files using new v0.6.0 classification system
    const contentFiles = [];
    const assetFiles = [];
    const ignoredFiles = [];
    
    for (const filePath of sourceFiles) {
      try {
        const classification = await fileClassifier.classifyFile(
          path.relative(sourceRoot, filePath)
        );
        
        if (classification.action === FileClassification.EMIT) {
          contentFiles.push(filePath);
        } else if (classification.action === FileClassification.COPY) {
          assetFiles.push(filePath);
        } else if (classification.action === FileClassification.IGNORED) {
          ignoredFiles.push(filePath);
          // Track layout and include files for auto-ignore system
          if (classification.reason.includes('layout') || classification.reason.includes('include')) {
            const relativePath = path.relative(sourceRoot, filePath);
            if (relativePath.includes('layout')) {
              fileClassifier.addLayoutFile(relativePath);
            } else {
              fileClassifier.addIncludeFile(relativePath);
            }
          }
        }
        // SKIP files are not processed or tracked
      } catch (error) {
        logger.warn(`Error classifying ${path.relative(sourceRoot, filePath)}: ${error.message}`);
      }
    }

    const results = {
      processed: 0,
      copied: 0,
      skipped: 0,
      errors: [],
    };

    // Track processed content files for sitemap generation
    const processedFiles = [];
    const frontmatterData = new Map();

    // Count ignored files as skipped for statistics
    results.skipped = ignoredFiles.length;

    // Process content files (HTML and Markdown) first to discover asset dependencies
    for (const filePath of contentFiles) {
      try {
        const outputPath = getOutputPathWithPrettyUrls(
          filePath,
          sourceRoot,
          outputRoot,
          config.prettyUrls
        );
        const relativePath = path.relative(sourceRoot, filePath);

        if (isHtmlFile(filePath)) {
          // Process HTML file with new v0.6.0 system
          await processHtmlFileV6(
            filePath,
            sourceRoot,
            outputRoot,
            dependencyTracker,
            assetTracker,
            cascadingImports,
            headMerge,
            layoutDiscovery,
            config,
            buildCache
          );
          processedFiles.push(filePath);
          results.processed++;
          logger.debug(`Processed HTML: ${relativePath} → ${outputPath}`);
        } else if (isMarkdownFile(filePath)) {
          // Process Markdown file with new v0.6.0 system
          const frontmatter = await processMarkdownFileV6(
            filePath,
            sourceRoot,
            outputRoot,
            layoutDiscovery,
            cascadingImports,
            headMerge,
            assetTracker,
            config
          );
          processedFiles.push(filePath);
          if (frontmatter) {
            frontmatterData.set(filePath, frontmatter);
          }
          results.processed++;
          logger.debug(`Processed Markdown: ${relativePath} → ${outputPath}`);
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
          suggestions: error.suggestions || [],
        });
        // If fail-on mode is enabled, fail fast on any error
        if (shouldFailBuild(config, 'error', error)) {
          throw new BuildError(
            `Build failed due to error in ${relativePath}: ${error.message}`,
            results.errors
          );
        }
      }
    }

    // Second pass: Copy only referenced assets
    const copiedAssetsSet = new Set();
    for (const filePath of assetFiles) {
      try {
        const relativePath = path.relative(sourceRoot, filePath);
        const pathParts = relativePath.split(path.sep);
        // Skip copying any file or directory starting with _
        if (pathParts.some((part) => part.startsWith("_"))) {
          logger.debug(`Skipped underscore-prefixed asset: ${relativePath}`);
          results.skipped++;
          continue;
        }
        if (assetTracker.isAssetReferenced(filePath)) {
          await copyAsset(filePath, sourceRoot, outputRoot);
          copiedAssetsSet.add(filePath);
          results.copied++;
          logger.debug(`Copied referenced asset: ${relativePath}`);
        } else {
          logger.debug(`Skipped unreferenced asset: ${relativePath}`);
          results.skipped++;
        }
      } catch (error) {
        const relativePath = path.relative(sourceRoot, filePath);
        // ...existing code...
        // If fail-on mode is enabled, fail fast on any error
        if (shouldFailBuild(config, 'error', error)) {
          throw new BuildError(
            `Build failed due to error in ${relativePath}: ${error.message}`,
            results.errors
          );
        }
      }
    }

    // Third pass: Copy src/assets to dist/assets (automatic)
    const assetsDir = path.join(sourceRoot, 'assets');
    try {
      const stats = await fs.stat(assetsDir);
      if (stats.isDirectory()) {
        const targetAssetsDir = path.join(outputRoot, 'assets');
        logger.info(`Copying src/assets to dist/assets...`);
        
        const assetFiles = await scanDirectory(assetsDir);
        for (const filePath of assetFiles) {
          try {
            const relativePath = path.relative(assetsDir, filePath);
            const targetPath = path.join(targetAssetsDir, relativePath);
            
            // Skip if this asset was already copied in the referenced assets pass
            if (!copiedAssetsSet.has(filePath)) {
              await ensureDirectoryExists(path.dirname(targetPath));
              await fs.copyFile(filePath, targetPath);
              copiedAssetsSet.add(filePath);
              results.copied++;
              logger.debug(`Copied assets directory file: ${relativePath}`);
            } else {
              logger.debug(`Skipped assets directory file (already copied): ${relativePath}`);
            }
          } catch (error) {
            const relativePath = path.relative(sourceRoot, filePath);
            logger.error(`Error copying assets directory file ${relativePath}: ${error.message}`);
            results.errors.push({
              file: filePath,
              relativePath,
              error: error.message,
              errorType: error.constructor.name,
              suggestions: [`Check file permissions for ${relativePath}`],
            });
            // If fail-on mode is enabled, fail fast on any error
            if (shouldFailBuild(config, 'error', error)) {
              throw new BuildError(
                `Build failed due to error copying assets directory file ${relativePath}: ${error.message}`,
                results.errors
              );
            }
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.debug(`src/assets directory not found or not accessible, skipping automatic copying`);
      }
    }

    // Fourth pass: Copy additional files from glob patterns (if specified)
    if (config.copy && config.copy.length > 0) {
      try {
        const additionalFiles = [];
        const { Glob } = await import('bun');
        
        // Process each copy pattern
        for (const copyPattern of config.copy) {
          if (copyPattern && typeof copyPattern === 'string') {
            const glob = new Glob(copyPattern);
            // Scan from source root
            for await (const file of glob.scan(sourceRoot)) {
              const fullPath = path.resolve(sourceRoot, file);
              additionalFiles.push(fullPath);
            }
          }
        }
        
        logger.info(
          `Found ${additionalFiles.length} additional files matching ${config.copy.length} copy pattern(s)`
        );
        for (const filePath of additionalFiles) {
          try {
            const relativePath = path.relative(sourceRoot, filePath);
            // Skip if this file was already copied in previous passes
            if (!copiedAssetsSet.has(filePath)) {
              await copyAsset(filePath, sourceRoot, outputRoot);
              copiedAssetsSet.add(filePath);
              results.copied++;
              logger.debug(`Copied additional file: ${relativePath}`);
            } else {
              logger.debug(
                `Skipped additional file (already copied): ${relativePath}`
              );
            }
          } catch (error) {
            const relativePath = path.relative(sourceRoot, filePath);
            // Use enhanced error formatting if available
            if (error.formatForCLI) {
              logger.error(error.formatForCLI());
            } else {
              logger.error(
                `Error copying additional file ${relativePath}: ${error.message}`
              );
            }
            results.errors.push({
              file: filePath,
              relativePath,
              error: error.message,
              errorType: error.constructor.name,
              suggestions: error.suggestions || [],
            });
            // If fail-on mode is enabled, fail fast on any error
            if (shouldFailBuild(config, 'error', error)) {
              throw new BuildError(
                `Build failed due to error copying additional file ${relativePath}: ${error.message}`,
                results.errors
              );
            }
          }
        }
      } catch (error) {
        // Handle glob pattern errors
        logger.error(
          `Error processing copy glob pattern "${config.copy}": ${error.message}`
        );
        results.errors.push({
          file: "copy-glob",
          error: `Invalid glob pattern "${config.copy}": ${error.message}`,
          errorType: error.constructor.name,
          suggestions: [
            'Check the glob pattern syntax (e.g., "./assets/**/*.*")',
            "Ensure the pattern is relative to the source directory",
            "Use forward slashes for paths even on Windows",
          ],
        });
        // If fail-on mode is enabled, fail fast on any error
        if (shouldFailBuild(config, 'error', error)) {
          throw new BuildError(
            `Build failed due to copy glob error: ${error.message}`,
            results.errors
          );
        }
      }
    }

    // Copy all referenced assets
    const referencedAssets = assetTracker.getAllReferencedAssets();
    logger.debug(`Found ${referencedAssets.length} referenced assets to copy`);
    
    for (const assetPath of referencedAssets) {
      try {
        await copyAsset(assetPath, sourceRoot, outputRoot);
        results.copied++;
        logger.debug(`Copied referenced asset: ${path.relative(sourceRoot, assetPath)}`);
      } catch (error) {
        const relativePath = path.relative(sourceRoot, assetPath);
        // For missing referenced assets, log a warning instead of failing the build
        const isNotFound = error.code === 'ENOENT' || 
                          (error.originalError && error.originalError.code === 'ENOENT');
        if (isNotFound) {
          logger.warn(`Referenced asset not found: ${relativePath}`);
        } else {
          // For other errors (permissions, etc), treat as errors
          if (error.formatForCLI) {
            logger.error(error.formatForCLI());
          } else {
            logger.error(`Error copying referenced asset ${relativePath}: ${error.message}`);
          }
          results.errors.push({
            file: assetPath,
            relativePath,
            error: error.message,
            errorType: error.constructor.name,
            suggestions: error.suggestions || [],
          });
          // If fail-on mode is enabled, fail fast on any error
          if (shouldFailBuild(config, 'error', error)) {
            throw new BuildError(
              `Build failed due to error copying referenced asset ${relativePath}: ${error.message}`,
              results.errors
            );
          }
        }
      }
    }

    // Generate sitemap.xml (if enabled)
    if (config.sitemap !== false) {
      try {
        // Resolve baseUrl: CLI arg → package.json homepage → default
        const baseUrl =
          config.baseUrl !== "https://example.com"
            ? config.baseUrl
            : await getBaseUrlFromPackage(sourceRoot, config.baseUrl);

        const pageInfo = extractPageInfo(
          processedFiles,
          sourceRoot,
          outputRoot,
          config.prettyUrls
        );
        const enhancedPageInfo = enhanceWithFrontmatter(
          pageInfo,
          frontmatterData
        );
        const sitemapContent = generateSitemap(enhancedPageInfo, baseUrl);
        await writeSitemap(sitemapContent, outputRoot);
      } catch (error) {
        // Use enhanced error formatting if available
        if (error.formatForCLI) {
          logger.error(error.formatForCLI());
        } else {
          logger.error(`Error generating sitemap: ${error.message}`);
        }
        results.errors.push({ file: "sitemap.xml", error: error.message });

        // If fail-on mode is enabled, fail fast on any error
        if (shouldFailBuild(config, 'error', error)) {
          throw new BuildError(
            `Build failed due to sitemap generation error: ${error.message}`,
            results.errors
          );
        }
      }
    }

    // Build summary
    const duration = Date.now() - startTime;
    logger.success(`Build completed in ${duration}ms`);
    logger.info(
      `Processed: ${results.processed} pages, Copied: ${results.copied} assets, Skipped: ${results.skipped} partials`
    );

    if (results.errors.length > 0) {
      // Enhanced error reporting with categorization
      const errorsByType = results.errors.reduce((acc, err) => {
        acc[err.errorType] = (acc[err.errorType] || 0) + 1;
        return acc;
      }, {});

      logger.error("\\n📋 Build Error Summary:");
      for (const [errorType, count] of Object.entries(errorsByType)) {
        logger.error(`   ${errorType}: ${count} error(s)`);
      }

      logger.error(
        `\\n💥 Total: ${results.errors.length} error(s) encountered`
      );

      throw new BuildError(`${results.errors.length} error(s)`, results.errors);
    }

    // Save build cache if enabled
    if (buildCache) {
      await buildCache.saveCache();
      logger.debug("Build cache saved");
    }

    return {
      ...results,
      duration,
      dependencyTracker,
      assetTracker,
      buildCache,
    };
  } catch (error) {
    if (error.formatForCLI) {
      logger.error(error.formatForCLI());
    } else {
      logger.error("Build failed:", error.message);
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
export async function incrementalBuild(
  options = {},
  dependencyTracker = null,
  assetTracker = null,
  changedFile = null
) {
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
    let filesToRebuild = await getFilesToRebuild(
      sourceRoot,
      changedFile,
      tracker,
      config
    );

    // If dependencyTracker is available and changedFile is set, rebuild all affected pages
    if (changedFile && tracker) {
      const affectedPages = tracker.getAffectedPages(path.resolve(changedFile));
      affectedPages.forEach((page) => filesToRebuild.push(page));
      // Remove duplicates
      filesToRebuild = Array.from(new Set(filesToRebuild));
      logger.debug(
        `Incremental build: rebuilding ${filesToRebuild.length} files (including affected pages)`
      );
    }

    const results = {
      processed: 0,
      copied: 0,
      skipped: 0,
      errors: [],
    };

    if (filesToRebuild.length === 0) {
      logger.info("No files need rebuilding");
      return {
        ...results,
        duration: Date.now() - startTime,
        dependencyTracker: tracker,
      };
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
            await processHtmlFile(
              filePath,
              sourceRoot,
              outputRoot,
              tracker,
              assets,
              config
            );
            results.processed++;
            logger.debug(`Rebuilt HTML: ${relativePath}`);
          }
        } else if (isMarkdownFile(filePath)) {
          // Load layout for markdown processing
          // Layout discovery is now handled by the unified HTML processor
          let layoutContent = null;
          if (layoutFile) {
            try {
              layoutContent = await fs.readFile(layoutFile, "utf-8");
            } catch (error) {
              // If fail-on mode is enabled, fail fast on layout errors
              if (shouldFailBuild(config, 'error', error)) {
                throw new BuildError(
                  `Build failed due to layout error: Could not read layout file ${layoutFile}: ${error.message}`,
                  results.errors
                );
              }
              logger.warn(
                `Could not read layout file ${layoutFile}: ${error.message}`
              );
            }
          }

          await processMarkdownFile(
            filePath,
            sourceRoot,
            outputRoot,
            layoutContent,
            assets,
            config.prettyUrls,
            config.layouts,
            config.minify,
            shouldFailBuild(config)
          );
          results.processed++;
          logger.debug(`Rebuilt Markdown: ${relativePath}`);
        } else {
          // For assets, copy if referenced OR if it's a new file during incremental build
          const isPartial = isPartialFile(filePath, config);
          const isNewFile = !fileModificationCache.has(filePath);
          if (!isPartial && (assets.isAssetReferenced(filePath) || !assetTracker || isNewFile)) {
            await copyAsset(filePath, sourceRoot, outputRoot);
            results.copied++;
            logger.debug(`Copied ${isNewFile ? 'new ' : ''}asset: ${relativePath}`);
          } else {
            if (isPartial) {
              logger.debug(`Skipped partial file: ${relativePath}`);
            } else {
              logger.debug(`Skipped unreferenced asset: ${relativePath}`);
            }
            results.skipped++;
          }
        }

        // Update modification cache for existing files
        const stats = await fs.stat(filePath);
        fileModificationCache.set(filePath, stats.mtime.getTime());
      } catch (error) {
        logger.error(
          error.formatForCLI
            ? error.formatForCLI()
            : `Error processing ${filePath}: ${error.message}`
        );
        results.errors.push({ file: filePath, error: error.message });
      }
    }

    const duration = Date.now() - startTime;
    logger.success(`Incremental build completed in ${duration}ms`);
    logger.info(
      `Rebuilt: ${results.processed} pages, ${results.copied} assets`
    );

    if (results.errors.length > 0) {
      logger.error(
        `Incremental build failed with ${results.errors.length} errors`
      );
      throw new BuildError(
        `Incremental build failed with ${results.errors.length} errors`,
        results.errors
      );
    }

    return {
      ...results,
      duration,
      dependencyTracker: tracker,
      assetTracker: assets,
    };
  } catch (error) {
    if (error.formatForCLI) {
      logger.error(error.formatForCLI());
    } else {
      logger.error("Incremental build failed:", error.message);
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
async function getFilesToRebuild(
  sourceRoot,
  changedFile,
  dependencyTracker,
  config = {}
) {
  const filesToRebuild = new Set();

  if (changedFile) {
    // Specific file changed - determine impact
    const resolvedChangedFile = path.resolve(changedFile);

    // Recursively collect all affected pages for includes/assets
    const collectAffectedPages = (file) => {
      const direct = dependencyTracker.getAffectedPages(file);
      direct.forEach((page) => filesToRebuild.add(page));
      // Recursively check for nested dependencies
      direct.forEach((dep) => collectAffectedPages(dep));
    };

    if (isHtmlFile(resolvedChangedFile)) {
      if (isPartialFile(resolvedChangedFile, config)) {
        // Partial file changed - recursively rebuild all pages that depend on it
        collectAffectedPages(resolvedChangedFile);
        logger.debug(
          `Partial ${path.relative(
            sourceRoot,
            resolvedChangedFile
          )} changed, recursively rebuilding affected pages`
        );
      } else {
        // Main page changed - rebuild just this page
        filesToRebuild.add(resolvedChangedFile);
        logger.debug(
          `Page ${path.relative(sourceRoot, resolvedChangedFile)} changed`
        );
      }
    } else {
      // Asset or unknown file type changed
      filesToRebuild.add(resolvedChangedFile);
      // For new asset files, rebuild all content pages to pick up potential references
      if (
        !isHtmlFile(resolvedChangedFile) &&
        !isMarkdownFile(resolvedChangedFile)
      ) {
        try {
          const isNewFile = !fileModificationCache.has(resolvedChangedFile);
          if (isNewFile) {
            const allFiles = await scanDirectory(sourceRoot);
            const contentFiles = allFiles.filter(
              (file) =>
                (isHtmlFile(file) && !isPartialFile(file, config)) ||
                isMarkdownFile(file)
            );
            contentFiles.forEach((page) => filesToRebuild.add(page));
            logger.debug(
              `New asset ${path.relative(
                sourceRoot,
                resolvedChangedFile
              )} added, rebuilding ${
                contentFiles.length
              } pages to check for references`
            );
          } else {
            logger.debug(
              `Asset ${path.relative(sourceRoot, resolvedChangedFile)} changed`
            );
          }
        } catch (error) {
          logger.debug(
            `Asset ${path.relative(sourceRoot, resolvedChangedFile)} changed`
          );
        }
      }
      // Also recursively rebuild all pages that depend on this asset
      collectAffectedPages(resolvedChangedFile);
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

  logger.debug(
    `Initialized modification cache with ${fileModificationCache.size} files`
  );
}

/**
 * Generate output path for a file, with optional pretty URL support
 * @param {string} filePath - Source file path
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 * @param {boolean} prettyUrls - Whether to generate pretty URLs
 * @returns {string} Output file path
 */
function getOutputPathWithPrettyUrls(
  filePath,
  sourceRoot,
  outputRoot,
  prettyUrls = false
) {
  const relativePath = path.relative(sourceRoot, filePath);

  if (prettyUrls && (isMarkdownFile(filePath) || isHtmlFile(filePath))) {
    const nameWithoutExt = path.basename(
      relativePath,
      path.extname(relativePath)
    );
    const dir = path.dirname(relativePath);

    // Handle files with multiple extensions (e.g., file.md.html)
    const finalName = nameWithoutExt.split(".")[0];

    // Special case: if the file is already named index.md or index.html, don't create nested directory
    if (finalName === "index") {
      if (isMarkdownFile(filePath)) {
        return path.join(outputRoot, dir, "index.html");
      } else {
        // For HTML files, keep as index.html in the same directory
        return path.join(outputRoot, dir, "index.html");
      }
    }

    // Create directory structure:
    // about.md → about/index.html
    // docs.html → docs/index.html
    if (isMarkdownFile(filePath)) {
      return path.join(outputRoot, dir, finalName, "index.html");
    } else {
      // For HTML files, create directory with the basename and put index.html inside
      return path.join(outputRoot, dir, finalName, "index.html");
    }
  }

  // For HTML files or when pretty URLs is disabled, use standard conversion
  if (isMarkdownFile(filePath)) {
    return path.join(outputRoot, relativePath.replace(/\.md$/i, ".html"));
  }

  // For all other files (HTML, assets), use original logic
  return getOutputPath(filePath, sourceRoot, outputRoot);
}

/**
 * Find layout file for markdown processing
 * @param {string} sourceRoot - Source root directory
 * @returns {Promise<string|null>} Path to layout file or null if not found
 */


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
  <title>${title || "Untitled"}</title>
  ${excerpt ? `<meta name="description" content="${excerpt}">` : ""}
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
async function processMarkdownFile(
  filePath,
  sourceRoot,
  outputRoot,
  layoutContent,
  assetTracker,
  prettyUrls = false,
  layoutsDir = ".layouts",
  minify = false,
  failFast = false
) {
  // Read markdown content
  let markdownContent;
  try {
    markdownContent = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    throw new FileSystemError("read", filePath, error);
  }

  // Process includes in markdown content first (before converting to HTML)
  const { processIncludes } = await import("./include-processor.js");
  const processedMarkdown = await processIncludes(
    markdownContent,
    filePath,
    sourceRoot,
    new Set(),
    0,
    null,
    failFast
  );

  // Process markdown to HTML
  const { html, frontmatter, title, excerpt } = processMarkdown(
    processedMarkdown,
    filePath
  );
  const htmlWithAnchors = addAnchorLinks(html);
  const tableOfContents = generateTableOfContents(htmlWithAnchors);
  const metadata = { frontmatter, title, excerpt, tableOfContents };
  let finalContent;

  // Strict layout application logic
  const contentHasHtml = hasHtmlElement(htmlWithAnchors);
  if (contentHasHtml) {
    finalContent = htmlWithAnchors;
    logger.debug("Using content as-is (contains <html> element)");
  } else if (frontmatter.layout) {
    const layoutPath = path.isAbsolute(layoutsDir)
      ? path.join(layoutsDir, frontmatter.layout)
      : path.join(sourceRoot, layoutsDir, frontmatter.layout);
    try {
      const frontmatterLayoutContent = await fs.readFile(layoutPath, "utf-8");
      const { processIncludes } = await import("./include-processor.js");
      const processedLayout = await processIncludes(
        frontmatterLayoutContent,
        layoutPath,
        sourceRoot,
        new Set(),
        0,
        null,
        failFast
      );
      let layoutWithContent = processedLayout.replace(
        /<slot[^>]*><\/slot>/g,
        htmlWithAnchors
      );
      layoutWithContent = layoutWithContent.replace(
        /\{\{\s*content\s*\}\}/g,
        htmlWithAnchors
      );
      layoutWithContent = layoutWithContent.replace(
        /\{\{\s*title\s*\}\}/g,
        metadata.title || "Untitled"
      );
      const allData = { ...metadata.frontmatter, ...metadata };
      for (const [key, value] of Object.entries(allData)) {
        if (typeof value === "string") {
          const regex = new RegExp(`\{\{\s*${key}\s*\}\}`, "g");
          layoutWithContent = layoutWithContent.replace(regex, value);
        }
      }
      finalContent = layoutWithContent;
      logger.debug(`Applied frontmatter layout: ${frontmatter.layout}`);
    } catch (error) {
      if (failFast) {
        throw new BuildError(
          `Build failed due to missing layout: ${frontmatter.layout} (${error.message})`,
          [{ file: filePath, error: error.message }]
        );
      }
      logger.warn(
        `Could not read frontmatter layout ${frontmatter.layout}: ${error.message}`
      );
    }
  } else if (layoutContent) {
    finalContent = wrapInLayout(htmlWithAnchors, metadata, layoutContent);
    logger.debug("Applied specified layout");
  } else {
    // Layout discovery is now handled by the unified HTML processor
    finalContent = htmlWithAnchors;
    logger.debug("No explicit layout specified, will use unified processor layout discovery");
  }

  // Remove any remaining include directives from output
  finalContent = finalContent.replace(
    /<!--#include\s+(virtual|file)="[^"]+"\s*-->/gi,
    ""
  );

  // Track asset references in the final content
  if (assetTracker) {
    await assetTracker.recordAssetReferences(
      filePath,
      finalContent,
      sourceRoot
    );
  }

  // Generate output path with pretty URL support
  const outputPath = getOutputPathWithPrettyUrls(
    filePath,
    sourceRoot,
    outputRoot,
    prettyUrls
  );
  await ensureDirectoryExists(path.dirname(outputPath));

  // Apply minification if enabled
  if (minify) {
    finalContent = minifyHtml(finalContent);
  }

  try {
    await fs.writeFile(outputPath, finalContent, "utf-8");
  } catch (error) {
    throw new FileSystemError("write", outputPath, error);
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
async function processHtmlFile(
  filePath,
  sourceRoot,
  outputRoot,
  dependencyTracker,
  assetTracker,
  config = {},
  buildCache = null
) {
  const outputPath = getOutputPathWithPrettyUrls(
    filePath,
    sourceRoot,
    outputRoot,
    config.prettyUrls
  );

  // Check cache if available
  if (buildCache && (await buildCache.isUpToDate(filePath, outputPath))) {
    logger.debug(
      `Skipping unchanged file: ${path.relative(sourceRoot, filePath)}`
    );
    return;
  }

  // Read HTML content
  let htmlContent;
  try {
    htmlContent = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    throw new FileSystemError("read", filePath, error);
  }

  // Use unified HTML processor that handles both SSI includes and DOM templating
  logger.debug(
    `Processing HTML with unified processor: ${path.relative(
      sourceRoot,
      filePath
    )}`
  );

  const unifiedConfig = getUnifiedConfig(config);
  let unifiedResult = await processHtmlUnified(
    htmlContent,
    filePath,
    sourceRoot,
    dependencyTracker,
    unifiedConfig
  );
  
  // Handle both old string format and new object format
  let processedContent;
  let extractedAssets = { styles: [], scripts: [] };
  if (typeof unifiedResult === 'object' && unifiedResult.content !== undefined) {
    processedContent = unifiedResult.content;
    extractedAssets = unifiedResult.extractedAssets || { styles: [], scripts: [] };
  } else {
    processedContent = unifiedResult;
  }

  // Track asset references in the final content
  if (assetTracker) {
    await assetTracker.recordAssetReferences(
      filePath,
      processedContent,
      sourceRoot
    );
  }

  // Write to output
  await ensureDirectoryExists(path.dirname(outputPath));

  // Apply minification if enabled
  if (config.minify) {
    processedContent = minifyHtml(processedContent);
  }

  try {
    await fs.writeFile(outputPath, processedContent, "utf-8");

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
    throw new FileSystemError("write", outputPath, error);
  }
}

/**
 * Copy a static asset file
 * @param {string} filePath - Path to asset file
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 */
async function copyAsset(filePath, sourceRoot, outputRoot) {
  // Use pretty URLs for assets if enabled in config
  // Default to false for assets unless config is passed
  let prettyUrls = false;
  if (
    typeof globalThis.UNIFY_BUILD_CONFIG === "object" &&
    globalThis.UNIFY_BUILD_CONFIG.prettyUrls
  ) {
    prettyUrls = true;
  }
  const outputPath = getOutputPathWithPrettyUrls(
    filePath,
    sourceRoot,
    outputRoot,
    prettyUrls
  );
  await ensureDirectoryExists(path.dirname(outputPath));

  try {
    await fs.copyFile(filePath, outputPath);
  } catch (error) {
    throw new FileSystemError("copy", filePath, error);
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
    throw new FileSystemError("readdir", dirPath, error);
  }

  const outputDirs = ["dist", "build", "output"];
  // Add support for all file types - we'll filter based on file classification later
  const supportedExtensions = [
    // HTML/Markdown content
    ".html", ".htm", ".md",
    // CSS/JavaScript
    ".css", ".js", ".mjs", ".ts",
    // Images
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp", ".tiff",
    // Fonts
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    // Audio/Video
    ".mp4", ".webm", ".ogg", ".mp3", ".wav", ".m4a",
    // Documents
    ".pdf", ".txt", ".json", ".xml", ".zip", ".doc", ".docx",
    // Other common assets
    ".map" // source maps
  ];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules" &&
        !outputDirs.includes(entry.name)
      ) {
        await scanDirectory(fullPath, files);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!entry.name.startsWith(".") && supportedExtensions.includes(ext)) {
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
    if (error.code !== "ENOENT") {
      throw new FileSystemError("clean", outputRoot, error);
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
    throw new FileSystemError("mkdir", dirPath, error);
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
async function processHtmlFileWithConventions(
  filePath,
  sourceRoot,
  outputRoot,
  dependencyTracker,
  assetTracker,
  fileClassifier,
  layoutDiscovery,
  config = {},
  buildCache = null
) {
  const outputPath = getOutputPathWithPrettyUrls(
    filePath,
    sourceRoot,
    outputRoot,
    config.prettyUrls
  );

  // Check cache if available
  if (buildCache && (await buildCache.isUpToDate(filePath, outputPath))) {
    logger.debug(
      `Skipping unchanged file: ${path.relative(sourceRoot, filePath)}`
    );
    return;
  }

  // Read HTML content
  let htmlContent;
  try {
    htmlContent = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    throw new FileSystemError("read", filePath, error);
  }

  // Use unified HTML processor with convention-based configuration
  logger.debug(
    `Processing HTML with conventions: ${path.relative(sourceRoot, filePath)}`
  );

  // Create unified config that works with convention-based system
  const unifiedConfig = {
    ...getUnifiedConfig(config),
    layoutDiscovery,
    fileClassifier,
    sourceRoot,
  };

  let unifiedResult = await processHtmlUnified(
    htmlContent,
    filePath,
    sourceRoot,
    dependencyTracker,
    unifiedConfig
  );
  
  // Handle both old string format and new object format
  let processedContent;
  if (typeof unifiedResult === 'object' && unifiedResult.content !== undefined) {
    processedContent = unifiedResult.content;
    // extractedAssets are already handled within processHtmlUnified
  } else {
    processedContent = unifiedResult;
  }

  // Track asset references in the final content
  if (assetTracker) {
    await assetTracker.recordAssetReferences(
      filePath,
      processedContent,
      sourceRoot
    );
  }

  // Write to output
  await ensureDirectoryExists(path.dirname(outputPath));

  // Apply minification if enabled
  if (config.minify) {
    processedContent = minifyHtml(processedContent);
  }

  try {
    await fs.writeFile(outputPath, processedContent, "utf-8");

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
    throw new FileSystemError("write", outputPath, error);
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
async function processMarkdownFileWithConventions(
  filePath,
  sourceRoot,
  outputRoot,
  layoutDiscovery,
  assetTracker,
  prettyUrls = false,
  minify = false,
  failFast = false
) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    // Process includes in the final content before layout application
    logger.debug(`Processing includes for markdown file: ${filePath}`);
    // Don't process includes yet - do it after layout application
    logger.debug(`Original markdown content length: ${content.length}`);
    
    const { html, frontmatter, title, excerpt } = processMarkdown(
      content,
      filePath
    );
    logger.debug(`Processed HTML content length: ${html.length}`);
    const htmlWithAnchors = addAnchorLinks(html);
    const tableOfContents = generateTableOfContents(htmlWithAnchors);
    const metadata = { frontmatter, title, excerpt, tableOfContents };
    let finalContent = htmlWithAnchors;

    // Determine layout using convention-based discovery
    let layoutPath = null;

    // Check for layout override in frontmatter
    if (frontmatter?.layout) {
      layoutPath = await layoutDiscovery.resolveLayoutOverride(
        frontmatter.layout,
        sourceRoot,
        filePath
      );
      if (!layoutPath) {
        if (failFast) {
          throw new BuildError(
            `Build failed due to missing layout: ${frontmatter.layout}`,
            [
              {
                file: filePath,
                error: `Layout not found: ${frontmatter.layout}`,
              },
            ]
          );
        }
        logger.warn(
          `Layout specified in frontmatter not found: ${
            frontmatter.layout
          } (${path.relative(sourceRoot, filePath)})`
        );
      }
    }

    // Fall back to automatic layout discovery
    if (!layoutPath) {
      layoutPath = await layoutDiscovery.findLayoutForPage(
        filePath,
        sourceRoot
      );
    }

    // Apply layout if found, else use default HTML wrapper
    if (layoutPath) {
      logger.debug(
        `Applying layout to Markdown: ${path.relative(sourceRoot, layoutPath)}`
      );
      const layoutContent = await fs.readFile(layoutPath, "utf-8");
      // Check if the processed content already has complete HTML structure
      if (!layoutDiscovery.hasCompleteHtmlStructure(htmlWithAnchors)) {
        finalContent = wrapInLayout(htmlWithAnchors, metadata, layoutContent);
      } else {
        logger.debug(
          `Markdown file already has complete HTML structure, skipping layout: ${path.relative(
            sourceRoot,
            filePath
          )}`
        );
      }
    } else {
      logger.debug(
        `No layout found for Markdown file: ${path.relative(
          sourceRoot,
          filePath
        )}. Using default HTML wrapper.`
      );
      // Always emit markdown as HTML per app spec
      if (!layoutDiscovery.hasCompleteHtmlStructure(htmlWithAnchors)) {
        finalContent = wrapInLayout(htmlWithAnchors, metadata);
      }
    }

    // Process includes in the final content AFTER layout application
    const { processIncludes } = await import("./include-processor.js");
    finalContent = await processIncludes(finalContent, filePath, sourceRoot);

    // Determine output path and ensure .html extension
    let outputPath;
    if (prettyUrls) {
      outputPath = getOutputPathWithPrettyUrls(
        filePath,
        sourceRoot,
        outputRoot,
        true
      );
    } else {
      outputPath = getOutputPath(
        filePath.replace(/\.md$/, ".html"),
        sourceRoot,
        outputRoot
      );
    }
    logger.debug(`[MARKDOWN EMIT] Output path for ${filePath}: ${outputPath}`);

    // Track asset references
    if (assetTracker) {
      await assetTracker.recordAssetReferences(
        filePath,
        finalContent,
        sourceRoot
      );
    }

    // Write output
    await ensureDirectoryExists(path.dirname(outputPath));

    // Apply minification if enabled
    if (minify) {
      finalContent = minifyHtml(finalContent);
    }

    await fs.writeFile(outputPath, finalContent, "utf-8");
    logger.debug(`[MARKDOWN EMIT] Wrote file: ${outputPath}`);

    return frontmatter;
  } catch (error) {
    if (failFast && error instanceof BuildError) {
      throw error;
    }
    throw new FileSystemError("process", filePath, error);
  }
}

/**
 * Process includes recursively
 * @param {string} filePath - Path to the file containing includes
 * @param {string} content - File content
 * @param {string} sourceRoot - Source root directory
 * @param {number} [depth=0] - Current recursion depth
 * @returns {Promise<string>} Processed content with includes replaced
 * @throws {CircularDependencyError} If circular dependency is detected
 */
async function processIncludesRecursively(filePath, content, sourceRoot, depth = 0) {
  if (depth > 10) {
    throw new CircularDependencyError(
      `Max include depth exceeded for file: ${filePath}`
    );
  }

  const rewriter = new HTMLRewriter();
  // Add detailed debug logs for include processing
  logger.debug(`Content before processing: ${content.substring(0, 200)}...`);
  logger.debug(`Content contains <!--#include: ${content.includes('<!--#include')}`);
  logger.debug(`Starting include processing for file: ${filePath}, depth: ${depth}`);

  rewriter.on('include', {
    element(element) {
      const src = element.getAttribute('src');
      logger.debug(`Found <include> element with src: ${src}`);
      if (src) {
        const includePath = src.startsWith('/')
          ? path.resolve(sourceRoot, `.${src}`)
          : path.resolve(path.dirname(filePath), src);
        logger.debug(`Resolved include path: ${includePath}`);

        try {
          const includeContent = fs.readFileSync(includePath, 'utf-8');
          logger.debug(`Read content from include path: ${includePath}`);
          const processedContent = processIncludesRecursively(
            includePath,
            includeContent,
            sourceRoot,
            depth + 1
          );
          element.replace(processedContent);
        } catch (error) {
          logger.error(`Error processing include at path: ${includePath}`, error);
        }
      }
    },
  });

    rewriter.on('comment', {
      text(comment) {
        logger.debug(`Found comment: ${comment.text}`);
        const match = comment.text.match(/#include (file|virtual)="([^"]+)"/);
        logger.debug(`Found <!--#include--> comment with match: ${JSON.stringify(match)}`);
        if (match) {
          const [, type, includePath] = match;
          const resolvedPath =
            type === 'virtual'
              ? path.resolve(sourceRoot, includePath)
              : path.resolve(path.dirname(filePath), includePath);
          logger.debug(`Resolved include path for comment: ${resolvedPath}`);

          try {
            const includeContent = fs.readFileSync(resolvedPath, 'utf-8');
            logger.debug(`Read content from include path: ${resolvedPath}`);
            const processedContent = processIncludesRecursively(
              resolvedPath,
              includeContent,
              sourceRoot,
              depth + 1
            );
            comment.replace(processedContent);
            logger.debug(`Replaced comment with processed content`);
          } catch (error) {
            logger.error(`Error processing include comment at path: ${resolvedPath}`, error);
          }
        }
      },
    });  return rewriter.transform(content).toString();
}

/**
 * Process HTML file with v0.6.0 systems (Cascading Imports + Head Merge)
 * @param {string} filePath - Path to HTML file  
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 * @param {DependencyTracker} dependencyTracker - Dependency tracker instance
 * @param {AssetTracker} assetTracker - Asset tracker instance
 * @param {CascadingImportsProcessor} cascadingImports - Cascading imports processor
 * @param {HeadMergeProcessor} headMerge - Head merge processor
 * @param {LayoutDiscovery} layoutDiscovery - Layout discovery instance
 * @param {Object} config - Build configuration
 * @param {Object} buildCache - Build cache instance
 */
async function processHtmlFileV6(
  filePath,
  sourceRoot,
  outputRoot,
  dependencyTracker,
  assetTracker,
  cascadingImports,
  headMerge,
  layoutDiscovery,
  config = {},
  buildCache = null
) {
  const outputPath = getOutputPathWithPrettyUrls(
    filePath,
    sourceRoot,
    outputRoot,
    config.prettyUrls
  );

  // Check cache if available
  if (buildCache && (await buildCache.isUpToDate(filePath, outputPath))) {
    logger.debug(`Skipping unchanged file: ${path.relative(sourceRoot, filePath)}`);
    return;
  }

  // Read HTML content
  let htmlContent;
  try {
    htmlContent = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    throw new FileSystemError("read", filePath, error);
  }

  logger.debug(`Processing HTML with v0.6.0 systems: ${path.relative(sourceRoot, filePath)}`);

  // Step 1: Process cascading imports (replaces SSI includes)
  let processedContent = await cascadingImports.processImports(htmlContent, filePath);

  // Step 1.5: Process legacy SSI includes (backwards compatibility)
  const { processIncludes } = await import("./include-processor.js");
  // Determine if we should fail fast based on config (missing includes are errors that can be downgraded to warnings)
  const failFast = shouldFailBuild(config, 'error');
  processedContent = await processIncludes(
    processedContent, 
    filePath, 
    sourceRoot, 
    new Set(), 
    0, 
    dependencyTracker,
    failFast
  );


  // Step 2: Extract head content for merging
  const headContent = HeadMergeProcessor.extractHeadContent(processedContent);
  
  // Step 3: Process head merge if we have head content
  if (headContent) {
    const fragments = [{ source: filePath, headHtml: headContent }];
    const mergedHead = headMerge.mergeHeadContent(fragments);
    processedContent = HeadMergeProcessor.injectHeadContent(processedContent, mergedHead);
  }

  // Step 4: Track asset references
  if (assetTracker) {
    await assetTracker.recordAssetReferences(filePath, processedContent, sourceRoot);
  }

  // Step 5: Transform links for pretty URLs (if enabled)
  if (config.prettyUrls) {
    const { transformLinksInHtml } = await import("../utils/link-transformer.js");
    processedContent = transformLinksInHtml(processedContent, filePath, sourceRoot);
  }

  // Step 6: Write to output
  await ensureDirectoryExists(path.dirname(outputPath));

  // Apply minification if enabled
  if (config.minify) {
    processedContent = minifyHtml(processedContent);
  }

  try {
    await fs.writeFile(outputPath, processedContent, "utf-8");

    // Update cache after successful write
    if (buildCache) {
      await buildCache.updateFileHash(filePath);
      // Update dependencies from cascading imports
      // TODO: Add dependency tracking to cascading imports processor
    }
  } catch (error) {
    throw new FileSystemError("write", outputPath, error);
  }
}

/**
 * Process Markdown file with v0.6.0 systems  
 * @param {string} filePath - Path to Markdown file
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 * @param {LayoutDiscovery} layoutDiscovery - Layout discovery instance
 * @param {CascadingImportsProcessor} cascadingImports - Cascading imports processor
 * @param {HeadMergeProcessor} headMerge - Head merge processor
 * @param {AssetTracker} assetTracker - Asset tracker instance
 * @param {Object} config - Build configuration
 * @returns {Promise<Object|null>} Frontmatter data or null
 */
async function processMarkdownFileV6(
  filePath,
  sourceRoot,
  outputRoot,
  layoutDiscovery,
  cascadingImports,
  headMerge,
  assetTracker,
  config = {}
) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    
    // Step 1: Process markdown to HTML
    const { html, frontmatter, title, excerpt } = processMarkdown(content, filePath);
    const htmlWithAnchors = addAnchorLinks(html);
    const tableOfContents = generateTableOfContents(htmlWithAnchors);
    const metadata = { frontmatter, title, excerpt, tableOfContents };
    let finalContent = htmlWithAnchors;

    // Step 2: Apply layout using layout discovery
    let layoutPath = null;

    // Check for layout override in frontmatter  
    if (frontmatter?.layout) {
      layoutPath = await layoutDiscovery.resolveLayoutOverride(
        frontmatter.layout,
        sourceRoot,
        filePath
      );
      if (!layoutPath) {
        if (config.failLevel === 'error' || config.failLevel === 'warning') {
          throw new BuildError(
            `Build failed due to missing layout: ${frontmatter.layout}`,
            [{ file: filePath, error: `Layout not found: ${frontmatter.layout}` }]
          );
        }
        logger.warn(`Layout specified in frontmatter not found: ${frontmatter.layout}`);
      }
    }

    // Fall back to automatic layout discovery
    if (!layoutPath) {
      layoutPath = await layoutDiscovery.findLayoutForPage(filePath, sourceRoot);
    }

    // Step 3: Apply layout if found
    if (layoutPath) {
      logger.debug(`Applying layout to Markdown: ${path.relative(sourceRoot, layoutPath)}`);
      const layoutContent = await fs.readFile(layoutPath, "utf-8");
      if (!layoutDiscovery.hasCompleteHtmlStructure(htmlWithAnchors)) {
        finalContent = wrapInLayout(htmlWithAnchors, metadata, layoutContent);
      }
    } else {
      // Create basic HTML wrapper if no layout found
      if (!layoutDiscovery.hasCompleteHtmlStructure(htmlWithAnchors)) {
        finalContent = wrapInLayout(htmlWithAnchors, metadata);
      }
    }

    // Step 4: Process cascading imports in the final content
    finalContent = await cascadingImports.processImports(finalContent, filePath);

    // Step 5: Synthesize and merge head content from frontmatter
    const fragments = [];
    
    // Add existing head content from layout/content
    const existingHead = HeadMergeProcessor.extractHeadContent(finalContent);
    if (existingHead) {
      fragments.push({ source: 'layout', headHtml: existingHead });
    }

    // Synthesize head content from frontmatter
    const frontmatterHead = synthesizeHeadFromFrontmatter(frontmatter, title, excerpt);
    if (frontmatterHead) {
      fragments.push({ source: 'frontmatter', headHtml: frontmatterHead });
    }

    // Merge head content if we have fragments
    if (fragments.length > 0) {
      const mergedHead = headMerge.mergeHeadContent(fragments);
      finalContent = HeadMergeProcessor.injectHeadContent(finalContent, mergedHead);
    }

    // Step 6: Generate output path
    const outputPath = getOutputPathWithPrettyUrls(
      filePath,
      sourceRoot,
      outputRoot,
      config.prettyUrls
    );

    // Step 7: Track asset references
    if (assetTracker) {
      await assetTracker.recordAssetReferences(filePath, finalContent, sourceRoot);
    }

    // Step 8: Write output
    await ensureDirectoryExists(path.dirname(outputPath));

    if (config.minify) {
      finalContent = minifyHtml(finalContent);
    }

    await fs.writeFile(outputPath, finalContent, "utf-8");
    logger.debug(`Wrote Markdown output: ${outputPath}`);

    return frontmatter;
  } catch (error) {
    throw new FileSystemError("process", filePath, error);
  }
}

/**
 * Synthesize head content from frontmatter data
 * @param {Object} frontmatter - Frontmatter data
 * @param {string} title - Page title
 * @param {string} excerpt - Page excerpt  
 * @returns {string} - Synthesized head HTML
 */
function synthesizeHeadFromFrontmatter(frontmatter = {}, title = '', excerpt = '') {
  const headElements = [];

  // Title from frontmatter or processed title
  const pageTitle = frontmatter.title || title;
  if (pageTitle) {
    headElements.push(`<title>${pageTitle}</title>`);
  }

  // Meta description from excerpt or frontmatter
  const description = frontmatter.description || excerpt;
  if (description) {
    headElements.push(`<meta name="description" content="${description.replace(/"/g, '&quot;')}">`);
  }

  // Meta keywords
  if (frontmatter.keywords) {
    const keywords = Array.isArray(frontmatter.keywords) 
      ? frontmatter.keywords.join(', ') 
      : frontmatter.keywords;
    headElements.push(`<meta name="keywords" content="${keywords}">`);
  }

  // Author
  if (frontmatter.author) {
    headElements.push(`<meta name="author" content="${frontmatter.author}">`);
  }

  // Open Graph tags
  if (frontmatter.og || pageTitle) {
    if (frontmatter.og?.title || pageTitle) {
      headElements.push(`<meta property="og:title" content="${frontmatter.og?.title || pageTitle}">`);
    }
    if (frontmatter.og?.description || description) {
      headElements.push(`<meta property="og:description" content="${(frontmatter.og?.description || description).replace(/"/g, '&quot;')}">`);
    }
    if (frontmatter.og?.image) {
      headElements.push(`<meta property="og:image" content="${frontmatter.og.image}">`);
    }
    if (frontmatter.og?.type) {
      headElements.push(`<meta property="og:type" content="${frontmatter.og.type}">`);
    }
  }

  // Twitter Card tags
  if (frontmatter.twitter) {
    if (frontmatter.twitter.card) {
      headElements.push(`<meta name="twitter:card" content="${frontmatter.twitter.card}">`);
    }
    if (frontmatter.twitter.site) {
      headElements.push(`<meta name="twitter:site" content="${frontmatter.twitter.site}">`);
    }
  }

  return headElements.join('\n');
}
