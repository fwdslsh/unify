/**
 * Test helper for programmatic API access
 * Provides direct access to build functionality without CLI overhead
 */

import { join } from 'path';
import { readdir, stat, readFile } from 'fs/promises';

// Import core components directly for unit testing
import { FileClassifier } from '../../src/core/file-classifier.js';
import { BuildCache } from '../../src/core/build-cache.js';
import { DependencyTracker } from '../../src/core/dependency-tracker.js';
import { AssetTracker } from '../../src/core/asset-tracker.js';
import { processLayoutAttribute } from '../../src/core/unified-html-processor.js';
import { processMarkdown } from '../../src/core/markdown-processor.js';
import { CascadingImportsProcessor } from '../../src/core/cascading-imports-processor.js';
import { LayoutDiscovery } from '../../src/core/layout-discovery.js';
import { HeadMergeProcessor } from '../../src/core/head-merge-processor.js';

/**
 * Programmatic build interface for unit testing
 * @param {Object} options - Build configuration
 * @param {string} options.source - Source directory
 * @param {string} options.output - Output directory
 * @param {boolean} options.clean - Clean output before build
 * @param {boolean} options.dryRun - Perform dry run only
 * @param {string[]} options.copyGlobs - Additional copy patterns
 * @param {string[]} options.ignoreGlobs - Ignore patterns
 * @param {string[]} options.renderGlobs - Force render patterns
 * @param {boolean} options.autoIgnore - Auto-ignore layouts and includes
 * @param {Object} options.defaultLayouts - Default layout mappings
 * @returns {Promise<Object>} Build result
 */
export async function buildProgrammatic(options) {
  const {
    source,
    output,
    clean = false,
    dryRun = false,
    copyGlobs = [],
    ignoreGlobs = [],
    renderGlobs = [],
    autoIgnore = true,
    defaultLayouts = {},
    prettyUrls = false,
    minify = false
  } = options;

  const startTime = performance.now();
  const results = {
    files: {
      emitted: [],
      copied: [],
      ignored: [],
      skipped: []
    },
    errors: [],
    warnings: [],
    stats: {
      duration: 0,
      filesProcessed: 0,
      bytesProcessed: 0
    }
  };

  try {
    // Initialize components
    const fileClassifier = new FileClassifier({
      copyGlobs,
      ignoreGlobs,
      renderGlobs,
      autoIgnore
    });

    const buildCache = new BuildCache(join(output, '.unify-cache'));
    const dependencyTracker = new DependencyTracker();
    const assetTracker = new AssetTracker();
    
    // Discover all files
    const allFiles = await discoverFiles(source);
    
    // Classify each file with error handling
    for (const filePath of allFiles) {
      try {
        const relativePath = filePath.replace(source + '/', '');
        const classification = await fileClassifier.classifyFile(relativePath);
        
        // Validate classification result
        if (!classification.action || !classification.reason) {
          throw new Error(`Invalid classification result for ${relativePath}: missing action or reason`);
        }
        
        const actionKey = classification.action.toLowerCase();
        if (!results.files[actionKey]) {
          results.files[actionKey] = [];
        }
        
        results.files[actionKey].push({
          path: relativePath,
          fullPath: filePath,
          reason: classification.reason,
          tier: classification.tier
        });
        
      } catch (error) {
        results.errors.push({
          file: filePath.replace(source + '/', ''),
          phase: 'classification',
          error: error.message
        });
      }
    }

    // If dry run, validate and return classification results
    if (dryRun) {
      try {
        // Validate that we have valid file classifications
        const totalFiles = Object.values(results.files).reduce((sum, arr) => sum + arr.length, 0);
        if (totalFiles === 0 && allFiles.length > 0) {
          results.warnings.push('Dry run produced no classified files despite discovering files');
        }
        
        // Generate dry run report if debug enabled
        if (process.env.UNIFY_DEBUG || process.env.DEBUG) {
          results.dryRunReport = fileClassifier.generateDryRunReport(
            Object.values(results.files).flat()
          );
        }
        
        results.stats.duration = performance.now() - startTime;
        return results;
        
      } catch (error) {
        results.errors.push({
          phase: 'dry-run-processing',
          error: error.message
        });
        results.stats.duration = performance.now() - startTime;
        return results;
      }
    }

    // Initialize processors with error handling
    let layoutDiscovery, headMerger, cascadingImports;
    
    try {
      layoutDiscovery = new LayoutDiscovery(source, defaultLayouts);
      headMerger = new HeadMergeProcessor();
      cascadingImports = new CascadingImportsProcessor(source);
    } catch (error) {
      results.errors.push({
        phase: 'processor-initialization',
        error: error.message
      });
      results.stats.duration = performance.now() - startTime;
      return results;
    }

    // Process emitted files (HTML/Markdown pages) with comprehensive error handling
    const emittedFiles = results.files.emit || results.files.emitted || [];
    for (const file of emittedFiles) {
      try {
        const content = await readFile(file.fullPath, 'utf8');
        
        if (!content || content.length === 0) {
          results.warnings.push({
            file: file.path,
            warning: 'Empty file content'
          });
          continue;
        }
        
        let processedResult;
        
        if (file.path.endsWith('.md')) {
          // Process markdown with validation
          processedResult = await processMarkdown(content, file.fullPath);
        } else {
          // Process HTML with validation - first handle slot processing
          let htmlContent = content;
          
          // Step 1: Process cascading imports (data-import, slots, templates)
          htmlContent = await cascadingImports.processImports(htmlContent, file.fullPath);
          
          // Step 2: Process layouts and other HTML processing
          processedResult = await processLayoutAttribute(htmlContent, file.fullPath, source);
        }
        
        // Validate processing result
        if (!processedResult || (!processedResult.html && !processedResult.content)) {
          throw new Error('Processing returned invalid result - no HTML content');
        }
        
        const finalContent = processedResult.html || processedResult.content || processedResult;
        
        // Validate that we got actual content back
        if (typeof finalContent !== 'string' || finalContent.length === 0) {
          throw new Error('Processing returned empty or invalid content');
        }
        
        // Track dependencies with error handling
        try {
          const dependencies = extractDependencies(finalContent);
          if (dependencies && dependencies.length > 0) {
            dependencyTracker.addDependencies(file.path, dependencies);
          }
        } catch (depError) {
          results.warnings.push({
            file: file.path,
            warning: `Dependency extraction failed: ${depError.message}`
          });
        }
        
        // Track assets with error handling
        try {
          const assets = extractAssetReferences(finalContent);
          if (assets && assets.length > 0) {
            assetTracker.addReferences(file.path, assets);
          }
        } catch (assetError) {
          results.warnings.push({
            file: file.path,
            warning: `Asset extraction failed: ${assetError.message}`
          });
        }
        
        results.stats.filesProcessed++;
        results.stats.bytesProcessed += content.length;
        
      } catch (error) {
        results.errors.push({
          file: file.path,
          phase: 'processing',
          error: error.message,
          stack: error.stack
        });
      }
    }

    // Process copied files with comprehensive error recovery
    const copiedFiles = results.files.copy || results.files.copied || [];
    for (const file of copiedFiles) {
      try {
        // Validate file exists before attempting to stat
        if (!file.fullPath) {
          throw new Error('Missing fullPath for copied file');
        }
        
        const fileStats = await stat(file.fullPath);
        
        // Validate file stats
        if (!fileStats || !fileStats.isFile()) {
          throw new Error('Invalid file stats - not a regular file');
        }
        
        // Track size
        if (fileStats.size >= 0) {
          results.stats.bytesProcessed += fileStats.size;
        } else {
          results.warnings.push({
            file: file.path,
            warning: 'File has invalid size'
          });
        }
        
        // Track successful copy operation
        results.stats.filesProcessed++;
        
      } catch (error) {
        results.errors.push({
          file: file.path,
          phase: 'asset-copying',
          error: error.message
        });
        
        // Attempt recovery - try to continue with other files
        continue;
      }
    }

  } catch (error) {
    results.errors.push({
      error: error.message,
      stack: error.stack
    });
  }

  results.stats.duration = performance.now() - startTime;
  return results;
}

/**
 * Unit test helper for file classification
 * @param {string} filePath - File path to classify
 * @param {Object} options - Classification options
 * @returns {Promise<Object>} Classification result
 */
export async function classifyFile(filePath, options = {}) {
  const classifier = new FileClassifier(options);
  const result = await classifier.classifyFile(filePath);
  
  // Transform to match test expectations
  return {
    decision: result.action.toUpperCase(),
    reason: result.reason
  };
}

/**
 * Unit test helper for HTML processing
 * @param {string} htmlContent - HTML content to process
 * @param {string} filePath - File path for context
 * @param {string} sourceDir - Source directory for context
 * @returns {Promise<string>} Processed HTML
 */
export async function processHtml(htmlContent, filePath = 'test.html', sourceDir = './') {
  return processLayoutAttribute(htmlContent, filePath, sourceDir);
}

/**
 * Unit test helper for markdown processing
 * @param {string} markdownContent - Markdown content to process
 * @param {string} filePath - File path for context
 * @returns {Promise<Object>} Processed result with HTML and frontmatter
 */
export async function processMarkdownHelper(markdownContent, filePath = 'test.md') {
  return processMarkdown(markdownContent, filePath);
}

/**
 * Unit test helper for head merging
 * @param {string[]} headContents - Array of head content to merge
 * @param {Object} options - Merge options
 * @returns {Promise<string>} Merged head content
 */
export async function mergeHeads(headContents, options = {}) {
  const merger = new HeadMergeProcessor(options);
  return merger.merge(headContents);
}

/**
 * Unit test helper for layout discovery
 * @param {string} pageFile - Page file path
 * @param {string} sourceDir - Source directory
 * @param {Object} defaultLayouts - Default layout mappings
 * @returns {Promise<string|null>} Discovered layout path
 */
export async function discoverLayout(pageFile, sourceDir, defaultLayouts = {}) {
  const discovery = new LayoutDiscovery(sourceDir, defaultLayouts);
  return discovery.discover(pageFile);
}

/**
 * Recursively discovers all files in a directory with comprehensive error handling
 * @param {string} dir - Directory to scan
 * @param {string[]} files - Accumulator for file paths
 * @param {Object} options - Discovery options
 * @returns {Promise<string[]>} Array of file paths
 */
async function discoverFiles(dir, files = [], options = {}) {
  const { maxDepth = 50, currentDepth = 0, errors = [] } = options;
  
  // Prevent infinite recursion
  if (currentDepth > maxDepth) {
    errors.push({
      directory: dir,
      error: `Maximum directory depth exceeded (${maxDepth})`
    });
    return files;
  }
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      try {
        const fullPath = join(dir, entry.name);
        
        // Validate path length (prevent path too long errors)
        if (fullPath.length > 4000) {
          errors.push({
            path: fullPath,
            error: 'Path too long'
          });
          continue;
        }
        
        if (entry.isDirectory()) {
          // Skip problematic directories
          if (entry.name.startsWith('.') || 
              entry.name === 'node_modules' ||
              entry.name === '__pycache__' ||
              entry.name === '.git') {
            continue;
          }
          
          // Recursive directory traversal with error isolation
          await discoverFiles(fullPath, files, {
            maxDepth,
            currentDepth: currentDepth + 1,
            errors
          });
          
        } else if (entry.isFile()) {
          // Skip hidden and temp files
          if (!entry.name.startsWith('.') && 
              !entry.name.endsWith('~') &&
              !entry.name.endsWith('.tmp')) {
            files.push(fullPath);
          }
          
        } else if (entry.isSymbolicLink()) {
          // Handle symlinks carefully to avoid loops
          try {
            const stats = await stat(fullPath);
            if (stats.isFile()) {
              files.push(fullPath);
            }
          } catch (symError) {
            // Broken symlink, skip it
            errors.push({
              path: fullPath,
              error: `Broken symlink: ${symError.message}`
            });
          }
        }
        
      } catch (entryError) {
        // Individual entry error - continue with others
        errors.push({
          path: join(dir, entry.name),
          error: entryError.message
        });
        continue;
      }
    }
    
  } catch (error) {
    // Directory read error
    errors.push({
      directory: dir,
      error: error.message
    });
  }
  
  return files;
}

/**
 * Extract dependency references from processed content with error handling
 * @param {string} content - Processed content
 * @returns {string[]} Array of dependency paths
 */
function extractDependencies(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }
  
  const dependencies = [];
  const errors = [];
  
  try {
    // Extract data-import references with validation
    const importMatches = content.match(/data-import=["']([^"']+)["']/g) || [];
    for (const match of importMatches) {
      try {
        const pathMatch = match.match(/data-import=["']([^"']+)["']/);
        if (pathMatch && pathMatch[1]) {
          const path = pathMatch[1].trim();
          if (path && !dependencies.includes(path)) {
            dependencies.push(path);
          }
        }
      } catch (matchError) {
        errors.push(`Failed to extract import from: ${match}`);
      }
    }
    
    // Extract SSI includes with validation
    const ssiMatches = content.match(/<!--#include\s+(virtual|file)=["']([^"']+)["']\s*-->/g) || [];
    for (const match of ssiMatches) {
      try {
        const pathMatch = match.match(/<!--#include\s+(?:virtual|file)=["']([^"']+)["']\s*-->/);
        if (pathMatch && pathMatch[1]) {
          const path = pathMatch[1].trim();
          if (path && !dependencies.includes(path)) {
            dependencies.push(path);
          }
        }
      } catch (matchError) {
        errors.push(`Failed to extract SSI include from: ${match}`);
      }
    }
    
  } catch (error) {
    // If regex fails completely, return empty array
    console.warn(`Dependency extraction failed: ${error.message}`);
    return [];
  }
  
  // Log errors if in debug mode
  if (errors.length > 0 && (process.env.UNIFY_DEBUG || process.env.DEBUG)) {
    console.warn('Dependency extraction warnings:', errors);
  }
  
  return dependencies;
}

/**
 * Extract asset references from content with comprehensive error handling
 * @param {string} content - Content to scan
 * @returns {string[]} Array of asset paths
 */
function extractAssetReferences(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }
  
  const assets = [];
  const errors = [];
  
  try {
    // Extract image sources with validation
    const imgMatches = content.match(/src=["']([^"']+)["']/g) || [];
    for (const match of imgMatches) {
      try {
        const srcMatch = match.match(/src=["']([^"']+)["']/);
        if (srcMatch && srcMatch[1]) {
          const src = srcMatch[1].trim();
          // Filter out external URLs, data URLs, and empty paths
          if (src && 
              !src.startsWith('http://') && 
              !src.startsWith('https://') && 
              !src.startsWith('data:') &&
              !src.startsWith('//') &&
              !assets.includes(src)) {
            assets.push(src);
          }
        }
      } catch (matchError) {
        errors.push(`Failed to extract src from: ${match}`);
      }
    }
    
    // Extract CSS/JS references with validation
    const linkMatches = content.match(/href=["']([^"']+)["']/g) || [];
    for (const match of linkMatches) {
      try {
        const hrefMatch = match.match(/href=["']([^"']+)["']/);
        if (hrefMatch && hrefMatch[1]) {
          const href = hrefMatch[1].trim();
          // Filter for local asset files only
          if (href && 
              !href.startsWith('http://') && 
              !href.startsWith('https://') && 
              !href.startsWith('#') &&
              !href.startsWith('//') &&
              (href.endsWith('.css') || href.endsWith('.js') || href.endsWith('.scss') || href.endsWith('.less')) &&
              !assets.includes(href)) {
            assets.push(href);
          }
        }
      } catch (matchError) {
        errors.push(`Failed to extract href from: ${match}`);
      }
    }
    
    // Extract additional asset types (fonts, icons, etc.)
    const additionalMatches = content.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/g) || [];
    for (const match of additionalMatches) {
      try {
        const urlMatch = match.match(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/);
        if (urlMatch && urlMatch[1]) {
          const url = urlMatch[1].trim();
          if (url && 
              !url.startsWith('http') && 
              !url.startsWith('data:') &&
              !url.startsWith('#') &&
              (url.includes('.woff') || url.includes('.ttf') || url.includes('.eot') || 
               url.includes('.svg') || url.includes('.png') || url.includes('.jpg') ||
               url.includes('.jpeg') || url.includes('.gif') || url.includes('.webp')) &&
              !assets.includes(url)) {
            assets.push(url);
          }
        }
      } catch (matchError) {
        errors.push(`Failed to extract CSS url from: ${match}`);
      }
    }
    
  } catch (error) {
    // If regex fails completely, return empty array
    console.warn(`Asset extraction failed: ${error.message}`);
    return [];
  }
  
  // Log errors if in debug mode
  if (errors.length > 0 && (process.env.UNIFY_DEBUG || process.env.DEBUG)) {
    console.warn('Asset extraction warnings:', errors);
  }
  
  return assets;
}