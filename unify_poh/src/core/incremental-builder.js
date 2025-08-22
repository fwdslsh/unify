/**
 * Incremental Builder for Unify
 * Implements US-010: File Watching and Incremental Builds
 * 
 * Provides intelligent incremental build capabilities with dependency tracking,
 * build cache integration, and performance optimization for large projects.
 */

import { BuildCommand } from '../cli/commands/build-command.js';
import { DependencyTracker } from './dependency-tracker.js';
import { AssetTracker } from './asset-tracker.js';
import { AssetCopier } from './asset-copier.js';
import { FileClassifier } from './file-classifier.js';
import { BuildCache } from './build-cache.js';
import { HtmlProcessor } from './html-processor.js';
import { PathValidator } from './path-validator.js';

/**
 * IncrementalBuilder class for efficient incremental builds
 */
export class IncrementalBuilder {
  constructor() {
    this.buildCommand = new BuildCommand();
    this.dependencyTracker = new DependencyTracker();
    this.assetTracker = new AssetTracker();
    this.assetCopier = new AssetCopier(this.assetTracker);
    this.fileClassifier = new FileClassifier();
    this.buildCache = new BuildCache(); // Enhanced build cache with persistence
    this.htmlProcessor = new HtmlProcessor(new PathValidator());
    this.lastBuildTime = null;
  }

  /**
   * Perform initial build of the project
   * @param {string} sourceRoot - Source root directory
   * @param {string} outputRoot - Output root directory
   * @param {Object} options - Build options
   * @returns {Promise<Object>} Build result
   */
  async performInitialBuild(sourceRoot, outputRoot, options = {}) {
    const startTime = Date.now();
    
    try {
      // Check if files have changed since last build using cache
      const { changed, unchanged } = await this._analyzeFileChanges(sourceRoot);
      
      if (unchanged.length > 0 && changed.length === 0) {
        // All files are cached and unchanged
        return {
          success: true,
          processedFiles: 0,
          cacheHits: unchanged.length,
          skippedFiles: unchanged.length,
          buildTime: Date.now() - startTime
        };
      }

      // Clean output directory if requested
      if (options.clean) {
        await this._cleanOutputDirectory(outputRoot);
      }

      // Create output directory if it doesn't exist
      await this._createOutputDirectory(outputRoot);

      // Process all source files with proper HTML processing
      const processedFiles = await this._processAllSourceFiles(sourceRoot, outputRoot, options);

      // Copy all assets (both referenced and standalone)
      const assetResults = await this._copyAllAssets(sourceRoot, outputRoot);
      
      // Also copy any referenced assets detected during HTML processing
      const referencedAssetResults = await this.assetCopier.copyAllAssets(sourceRoot, outputRoot);

      // Track dependencies for all files after successful build
      await this._trackDependenciesForAllFiles(sourceRoot);
      await this._updateBuildCache(sourceRoot);
      this.lastBuildTime = Date.now();

      return {
        success: true,
        processedFiles: processedFiles,
        cacheHits: 0,
        cacheInvalidations: changed.length,
        buildTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        processedFiles: 0,
        buildTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Perform incremental build for specific changed file
   * @param {string} changedFile - Path to changed file
   * @param {string} sourceRoot - Source root directory
   * @param {string} outputRoot - Output root directory
   * @returns {Promise<Object>} Incremental build result
   */
  async performIncrementalBuild(changedFile, sourceRoot, outputRoot) {
    const startTime = Date.now();

    try {
      const classification = this.fileClassifier.classifyFile(changedFile);
      let rebuiltFiles = 0;
      let affectedPages = [];
      let assetsCopied = [];
      let copiedAssets = 0;

      if (classification.isFragment) {
        // Fragment changed - rebuild all dependent pages
        const dependentPages = this.dependencyTracker.getDependentPages(changedFile);
        
        // Create a snapshot copy to avoid any modification during async operations
        const dependentPagesCopy = [...dependentPages];
        
        // Rebuild each dependent page
        for (const pagePath of dependentPagesCopy) {
          const outputPath = this._getOutputPath(pagePath, sourceRoot, outputRoot);
          await this._rebuildSingleFile(pagePath, outputPath, sourceRoot);
          affectedPages.push(outputPath);
          rebuiltFiles++;
        }
        
      } else if (classification.isPage) {
        // Page changed - rebuild only this page
        const outputPath = this._getOutputPath(changedFile, sourceRoot, outputRoot);
        await this._rebuildSingleFile(changedFile, outputPath, sourceRoot);
        affectedPages.push(outputPath);
        rebuiltFiles = 1;
        
      } else if (classification.isAsset) {
        // Asset changed - copy asset to output
        const outputPath = this._getOutputPath(changedFile, sourceRoot, outputRoot);
        await this._copyAsset(changedFile, outputPath);
        assetsCopied.push(outputPath);
        copiedAssets = 1;
      }

      return {
        success: true,
        rebuiltFiles,
        affectedPages,
        assetsCopied,
        copiedAssets,
        cacheInvalidations: rebuiltFiles > 0 ? 1 : 0,
        buildTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        rebuiltFiles: 0,
        buildTime: Math.max(1, Date.now() - startTime),
        error: error.message
      };
    }
  }

  /**
   * Handle new file addition
   * @param {string} newFile - Path to new file
   * @param {string} sourceRoot - Source root directory
   * @param {string} outputRoot - Output root directory
   * @returns {Promise<Object>} Result
   */
  async handleNewFile(newFile, sourceRoot, outputRoot) {
    const startTime = Date.now();

    try {
      const classification = this.fileClassifier.classifyFile(newFile);
      
      if (classification.isPage) {
        // New page - process it
        const outputPath = this._getOutputPath(newFile, sourceRoot, outputRoot);
        await this._rebuildSingleFile(newFile, outputPath, sourceRoot);
        
        return {
          success: true,
          newFiles: 1,
          buildTime: Date.now() - startTime
        };
      } else if (classification.isAsset) {
        // New asset - copy it if referenced
        const outputPath = this._getOutputPath(newFile, sourceRoot, outputRoot);
        await this._copyAsset(newFile, outputPath);
        
        return {
          success: true,
          newFiles: 1,
          buildTime: Date.now() - startTime
        };
      }

      return {
        success: true,
        newFiles: 0,
        buildTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        newFiles: 0,
        buildTime: Math.max(1, Date.now() - startTime),
        error: error.message
      };
    }
  }

  /**
   * Handle deleted files cleanup
   * @param {string[]} deletedFiles - Array of deleted file paths
   * @param {string} sourceRoot - Source root directory
   * @param {string} outputRoot - Output root directory
   * @returns {Promise<Object>} Result
   */
  async handleDeletedFiles(deletedFiles, sourceRoot, outputRoot) {
    const startTime = Date.now();
    let cleanedFiles = 0;

    try {
      const { rmSync } = await import('fs');

      for (const deletedFile of deletedFiles) {
        const outputPath = this._getOutputPath(deletedFile, sourceRoot, outputRoot);
        
        try {
          rmSync(outputPath, { force: true });
          cleanedFiles++;
        } catch (error) {
          // File might not exist in output, continue
        }
      }

      return {
        success: true,
        cleanedFiles,
        buildTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        cleanedFiles,
        buildTime: Math.max(1, Date.now() - startTime),
        error: error.message
      };
    }
  }

  /**
   * Analyze file changes against cache
   * @private
   * @param {string} sourceRoot - Source root directory
   * @returns {Promise<Object>} Analysis result with changed and unchanged files
   */
  async _analyzeFileChanges(sourceRoot) {
    try {
      // Load cache from disk if it exists
      await this.buildCache.loadFromDisk();
      
      const files = await this._getAllSourceFiles(sourceRoot);
      
      // Use enhanced BuildCache for efficient change detection
      const result = await this.buildCache.checkMultipleFiles(files);
      
      return result;
    } catch (error) {
      // If we can't analyze changes, assume everything changed
      const files = await this._getAllSourceFiles(sourceRoot);
      return { changed: files, unchanged: [] };
    }
  }

  /**
   * Update build cache with current file hashes
   * @private
   * @param {string} sourceRoot - Source root directory
   */
  async _updateBuildCache(sourceRoot) {
    try {
      const files = await this._getAllSourceFiles(sourceRoot);
      
      // Store hashes for all files
      for (const file of files) {
        await this.buildCache.storeFileHash(file);
      }
      
      // Persist cache to disk
      await this.buildCache.persistToDisk();
    } catch (error) {
      // Cache update failed, continue without caching
    }
  }

  /**
   * Get all source files in directory
   * @private
   * @param {string} sourceRoot - Source root directory
   * @returns {Promise<string[]>} Array of file paths
   */
  async _getAllSourceFiles(sourceRoot) {
    try {
      const { readdirSync, statSync } = await import('fs');
      const { join } = await import('path');
      
      const files = [];
      const entries = readdirSync(sourceRoot, { recursive: true });
      
      for (const entry of entries) {
        const fullPath = join(sourceRoot, entry.toString());
        try {
          const stat = statSync(fullPath);
          if (stat.isFile()) {
            files.push(fullPath);
          }
        } catch (error) {
          // Skip files that can't be accessed
        }
      }
      
      return files;
    } catch (error) {
      return [];
    }
  }


  /**
   * Get output path for source file
   * @private
   * @param {string} sourcePath - Source file path
   * @param {string} sourceRoot - Source root directory
   * @param {string} outputRoot - Output root directory
   * @returns {string} Output file path
   */
  _getOutputPath(sourcePath, sourceRoot, outputRoot) {
    const { relative, join } = require('path');
    const relativePath = relative(sourceRoot, sourcePath);
    return join(outputRoot, relativePath);
  }

  /**
   * Rebuild a single file
   * @private
   * @param {string} sourcePath - Source file path
   * @param {string} outputPath - Output file path
   * @param {string} sourceRoot - Source root directory
   */
  async _rebuildSingleFile(sourcePath, outputPath, sourceRoot) {
    try {
      const { dirname, extname } = require('path');
      const { mkdirSync } = await import('fs');
      
      // Ensure output directory exists
      mkdirSync(dirname(outputPath), { recursive: true });
      
      // Read source file
      const sourceFile = Bun.file(sourcePath);
      if (await sourceFile.exists()) {
        const content = await sourceFile.text();
        const extension = extname(sourcePath).toLowerCase();
        
        let processedContent = content;
        
        // Process HTML files through HtmlProcessor to handle data-unify attributes
        if (['.html', '.htm'].includes(extension)) {
          // Always rebuild file system map to get latest layout content
          const fileSystem = await this._buildFileSystemMap(sourceRoot);
          
          
          const processingOptions = {
            prettyUrls: false,
            minify: false
          };
          
          // Clear HTML processor cache to ensure fresh layout content
          this.htmlProcessor.clearCache();
          
          const result = await this.htmlProcessor.processFile(
            sourcePath,
            content,
            fileSystem,
            sourceRoot,
            processingOptions
          );
          
          if (result.success) {
            processedContent = result.html;
            
            // Always track dependencies for HTML files
            await this.dependencyTracker.trackPageDependencies(sourcePath, content, sourceRoot);
          } else {
            // If processing fails, log warning but continue with original content
            console.warn(`HTML processing failed for ${sourcePath}: ${result.error}`);
            // Still track dependencies even if processing fails
            await this.dependencyTracker.trackPageDependencies(sourcePath, content, sourceRoot);
          }
        }
        
        await Bun.write(outputPath, processedContent);
        
        // Update cache with new content
        await this.buildCache.updateFileHash(sourcePath, content);
      }
    } catch (error) {
      // Re-throw error so it can be caught by caller
      throw error;
    }
  }

  /**
   * Copy all assets that should be copied according to FileClassifier
   * @private
   * @param {string} sourceRoot - Source root directory
   * @param {string} outputRoot - Output root directory
   * @returns {Promise<Object>} Copy results
   */
  async _copyAllAssets(sourceRoot, outputRoot) {
    try {
      const files = await this._getAllSourceFiles(sourceRoot);
      let copiedCount = 0;
      const results = [];

      for (const sourcePath of files) {
        const classification = this.fileClassifier.classifyFile(sourcePath);
        
        // Copy assets that should be copied according to FileClassifier
        if (classification.shouldCopy && classification.isAsset) {
          const outputPath = this._getOutputPath(sourcePath, sourceRoot, outputRoot);
          
          try {
            await this._copyAsset(sourcePath, outputPath);
            copiedCount++;
            results.push({ success: true, assetPath: sourcePath, outputPath });
          } catch (error) {
            results.push({ success: false, assetPath: sourcePath, error: error.message });
          }
        }
      }

      return {
        successCount: copiedCount,
        results
      };
    } catch (error) {
      return {
        successCount: 0,
        results: [{ success: false, error: error.message }]
      };
    }
  }

  /**
   * Copy asset file
   * @private
   * @param {string} sourcePath - Source asset path
   * @param {string} outputPath - Output asset path
   */
  async _copyAsset(sourcePath, outputPath) {
    try {
      const { dirname } = require('path');
      const { mkdirSync } = await import('fs');
      
      // Ensure output directory exists
      mkdirSync(dirname(outputPath), { recursive: true });
      
      // Copy asset file
      const sourceFile = Bun.file(sourcePath);
      if (await sourceFile.exists()) {
        const content = await sourceFile.arrayBuffer();
        await Bun.write(outputPath, content);
      }
    } catch (error) {
      // Re-throw error so it can be caught by caller
      throw error;
    }
  }

  /**
   * Track dependencies for all files in source directory
   * @private
   * @param {string} sourceRoot - Source root directory
   */
  async _trackDependenciesForAllFiles(sourceRoot) {
    try {
      const files = await this._getAllSourceFiles(sourceRoot);
      
      for (const filePath of files) {
        const classification = this.fileClassifier.classifyFile(filePath);
        
        // Only track dependencies for page files (HTML/Markdown)
        if (classification.isPage) {
          const fileContent = await Bun.file(filePath).text();
          await this.dependencyTracker.trackPageDependencies(filePath, fileContent, sourceRoot);
        }
      }
    } catch (error) {
      // If dependency tracking fails, log warning but continue
      console.warn(`Dependency tracking failed: ${error.message}`);
    }
  }

  /**
   * Build file system map for layout resolution
   * @private
   * @param {string} sourceRoot - Source root directory
   * @returns {Object} File system map with file paths as keys and content as values
   */
  async _buildFileSystemMap(sourceRoot) {
    const fileSystem = {};
    
    try {
      const files = await this._getAllSourceFiles(sourceRoot);
      const { relative, join } = require('path');
      
      for (const filePath of files) {
        const classification = this.fileClassifier.classifyFile(filePath);
        
        // Include fragments and layouts in file system map
        if (classification.isFragment || classification.isLayout || classification.isPage) {
          try {
            const content = await Bun.file(filePath).text();
            // Use both absolute path and relative path for maximum compatibility
            fileSystem[filePath] = content;
            
            // Also add relative path from source root for layout resolution
            const relativePath = relative(sourceRoot, filePath);
            fileSystem[relativePath] = content;
            
            // Add simple filename for files in source root
            const { basename } = require('path');
            const filename = basename(filePath);
            if (!relativePath.includes('/') && !fileSystem[filename]) {
              fileSystem[filename] = content;
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    } catch (error) {
      // Return empty file system if we can't build the map
    }
    
    return fileSystem;
  }

  /**
   * Clean output directory
   * @private
   * @param {string} outputRoot - Output root directory
   */
  async _cleanOutputDirectory(outputRoot) {
    try {
      const { rmSync } = await import('fs');
      rmSync(outputRoot, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, continue
    }
  }

  /**
   * Create output directory
   * @private
   * @param {string} outputRoot - Output root directory
   */
  async _createOutputDirectory(outputRoot) {
    try {
      const { mkdirSync } = await import('fs');
      mkdirSync(outputRoot, { recursive: true });
    } catch (error) {
      throw new Error(`Cannot create output directory: ${error.message}`);
    }
  }

  /**
   * Process all source files with proper HTML processing
   * @private
   * @param {string} sourceRoot - Source root directory
   * @param {string} outputRoot - Output root directory
   * @param {Object} options - Processing options
   * @returns {Promise<number>} Number of processed files
   */
  async _processAllSourceFiles(sourceRoot, outputRoot, options = {}) {
    const files = await this._getAllSourceFiles(sourceRoot);
    let processedCount = 0;

    // Build file system map once for all files
    const fileSystem = await this._buildFileSystemMap(sourceRoot);

    for (const sourcePath of files) {
      const classification = this.fileClassifier.classifyFile(sourcePath);

      // Process page files (which emit output files)
      if (classification.isPage) {
        const outputPath = this._getOutputPath(sourcePath, sourceRoot, outputRoot);
        await this._rebuildSingleFileWithFileSystem(sourcePath, outputPath, sourceRoot, fileSystem, options);
        processedCount++;
      }
      // Also count HTML fragments (layouts, components) as processed since they're used in builds
      else if (classification.isFragment && this._isHtmlFile(sourcePath)) {
        processedCount++;
      }
    }

    return processedCount;
  }

  /**
   * Check if a file is an HTML file
   * @private
   * @param {string} filePath - File path to check
   * @returns {boolean} True if file is HTML
   */
  _isHtmlFile(filePath) {
    const { extname } = require('path');
    const ext = extname(filePath).toLowerCase();
    return ['.html', '.htm'].includes(ext);
  }

  /**
   * Rebuild a single file with pre-built file system map
   * @private
   * @param {string} sourcePath - Source file path
   * @param {string} outputPath - Output file path
   * @param {string} sourceRoot - Source root directory
   * @param {Object} fileSystem - Pre-built file system map
   * @param {Object} options - Processing options
   */
  async _rebuildSingleFileWithFileSystem(sourcePath, outputPath, sourceRoot, fileSystem, options = {}) {
    try {
      const { dirname, extname } = require('path');
      const { mkdirSync } = await import('fs');
      
      // Ensure output directory exists
      mkdirSync(dirname(outputPath), { recursive: true });
      
      // Read source file
      const sourceFile = Bun.file(sourcePath);
      if (await sourceFile.exists()) {
        const content = await sourceFile.text();
        const extension = extname(sourcePath).toLowerCase();
        
        let processedContent = content;
        
        // Process HTML files through HtmlProcessor to handle data-unify attributes
        if (['.html', '.htm'].includes(extension)) {
          const processingOptions = {
            prettyUrls: options.prettyUrls || false,
            minify: options.minify || false
          };
          
          // Clear HTML processor cache to ensure fresh layout content
          this.htmlProcessor.clearCache();
          
          const result = await this.htmlProcessor.processFile(
            sourcePath,
            content,
            fileSystem,
            sourceRoot,
            processingOptions
          );
          
          if (result.success) {
            processedContent = result.html;
            
            // Check for recoverable errors and report them
            if (result.recoverableErrors && result.recoverableErrors.length > 0) {
              console.log('[DEBUG] Found recoverable errors:', result.recoverableErrors);
              for (const recoverableError of result.recoverableErrors) {
                // Create an error to be thrown so it can be caught by the watch command
                const error = new Error(recoverableError);
                error.name = 'RecoverableError';
                error.isRecoverable = true;
                error.sourcePath = sourcePath;
                console.log('[DEBUG] Throwing recoverable error:', error.message);
                throw error;
              }
            }
            
            // Track asset references in the processed HTML
            await this.assetTracker.recordAssetReferences(sourcePath, processedContent, sourceRoot);
          } else {
            // If processing fails, log warning but continue with original content
            console.warn(`HTML processing failed for ${sourcePath}: ${result.error}`);
            
            // Still track assets in original content
            await this.assetTracker.recordAssetReferences(sourcePath, content, sourceRoot);
          }
        } else {
          // For non-HTML files, still track asset references if it's a CSS or JS file
          if (['.css', '.js'].includes(extension)) {
            await this.assetTracker.trackPageAssets(sourcePath, content, sourceRoot);
          }
        }
        
        await Bun.write(outputPath, processedContent);
        
        // Update cache with new content
        await this.buildCache.updateFileHash(sourcePath, content);
      }
    } catch (error) {
      // Re-throw error so it can be caught by caller
      throw error;
    }
  }
}