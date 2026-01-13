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
import { processMarkdownForDOMCascade } from './markdown-processor.js';
import { createLogger } from '../utils/logger.js';

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
    this.logger = createLogger('INCREMENTAL');
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
      // If buildCommand is set (e.g., in tests), delegate to it with cache integration
      if (this.buildCommand && typeof this.buildCommand.execute === 'function') {
        try {
          // Load cache before delegating to BuildCommand
          await this.buildCache.loadFromDisk();
          
          // Check for cached files before building
          const { changed, unchanged } = await this._analyzeFileChanges(sourceRoot);
          
          // If all files are cached and unchanged, skip processing
          if (changed.length === 0 && unchanged.length > 0) {
            return {
              success: true,
              processedFiles: 0,
              cacheHits: unchanged.length,
              skippedFiles: unchanged.length,
              cacheInvalidations: 0,
              buildTime: Date.now() - startTime
            };
          }
          
          const result = await this.buildCommand.execute({
            source: sourceRoot,
            output: outputRoot,
            ...options
          });
          
          // Update cache and track dependencies after successful build
          if (result.success) {
            await this._trackDependenciesForAllFiles(sourceRoot);
            await this._updateBuildCache(sourceRoot);
          }
          
          return {
            success: result.success,
            processedFiles: result.processedFiles || 0,
            cacheHits: unchanged.length,
            cacheInvalidations: changed.length,
            buildTime: Date.now() - startTime,
            error: result.error
          };
        } catch (error) {
          // Ensure buildTime is always positive for error cases
          const buildTime = Math.max(1, Date.now() - startTime);
          return {
            success: false,
            processedFiles: 0,
            cacheHits: 0,
            cacheInvalidations: 0,
            buildTime: buildTime,
            error: error.message
          };
        }
      }
      
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

      // Copy only referenced assets detected during HTML processing (per spec requirements)
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
  async performIncrementalBuild(changedFile, sourceRoot, outputRoot, options = {}) {
    const startTime = Date.now();
    const collectedErrors = []; // Collect recoverable errors to include in result

    try {
      this.logger.debug(`Processing file change`, { changedFile });
      
      const classification = this.fileClassifier.classifyFile(changedFile);
      
      this.logger.debug(`File classification`, {
        isPage: classification.isPage,
        isFragment: classification.isFragment,
        isAsset: classification.isAsset
      });
      
      let rebuiltFiles = 0;
      let affectedPages = [];
      let assetsCopied = [];
      let copiedAssets = 0;

      if (classification.isFragment) {
        // Fragment changed - rebuild all transitively dependent pages
        const dependentPages = this.dependencyTracker.getAllTransitiveDependents(changedFile);
        
        // Create a snapshot copy to avoid any modification during async operations
        const dependentPagesCopy = [...dependentPages];
        
        // Rebuild each dependent page
        for (const pagePath of dependentPagesCopy) {
          const outputPath = this._getOutputPath(pagePath, sourceRoot, outputRoot, options);
          try {
            const pageErrors = await this._rebuildSingleFile(pagePath, outputPath, sourceRoot, options);
            collectedErrors.push(...pageErrors);
            affectedPages.push(outputPath);
            rebuiltFiles++;
          } catch (rebuildError) {
            // If rebuild fails, still count it as processed but add to error info
            rebuiltFiles++;
            // Let the outer catch block handle the error
            throw rebuildError;
          }
        }
        
      } else if (classification.isPage) {
        // Page changed - rebuild only this page
        this.logger.debug(`Rebuilding single page`, { changedFile });
        const outputPath = this._getOutputPath(changedFile, sourceRoot, outputRoot, options);
        try {
          const pageErrors = await this._rebuildSingleFile(changedFile, outputPath, sourceRoot, options);
          collectedErrors.push(...pageErrors);
          affectedPages.push(outputPath);
          rebuiltFiles = 1;
        } catch (rebuildError) {
          rebuiltFiles = 1;
          throw rebuildError;
        }
        
      } else if (classification.isAsset) {
        // Asset changed - copy asset to output
        const outputPath = this._getOutputPath(changedFile, sourceRoot, outputRoot, options);
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
        buildTime: Date.now() - startTime,
        errors: collectedErrors // Include any recoverable errors for watch command
      };

    } catch (error) {
      // Handle RecoverableError gracefully for missing dependencies
      if (error.name === 'RecoverableError' && error.isRecoverable) {
        return {
          success: false,
          rebuiltFiles: 0,
          affectedPages: [],
          assetsCopied: [],
          copiedAssets: 0,
          cacheInvalidations: 0,
          buildTime: Math.max(1, Date.now() - startTime),
          errors: [{
            message: error.message,
            file: error.file || error.sourcePath,
            type: 'RecoverableError',
            timestamp: Date.now()
          }],
          error: error.message,
          recoverable: true
        };
      }
      
      // Handle file system errors gracefully
      if (error.message && (error.message.includes('Source file not found') || 
                           error.message.includes('permission denied') ||
                           error.message.includes('EACCES') ||
                           error.message.includes('ENOENT'))) {
        return {
          success: false,
          rebuiltFiles: 0,
          affectedPages: [],
          assetsCopied: [],
          copiedAssets: 0,
          cacheInvalidations: 0,
          buildTime: Math.max(1, Date.now() - startTime),
          errors: [{
            message: error.message,
            file: error.file || error.path,
            type: 'FilesystemError',
            timestamp: Date.now()
          }],
          error: error.message
        };
      }
      
      // For other errors, return failed result
      return {
        success: false,
        rebuiltFiles: 0,
        affectedPages: [],
        assetsCopied: [],
        copiedAssets: 0,
        cacheInvalidations: 0,
        buildTime: Math.max(1, Date.now() - startTime),
        errors: [{
          message: error.message,
          file: error.file || error.path || 'unknown',
          type: 'BuildError',
          timestamp: Date.now()
        }],
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
  async handleNewFile(newFile, sourceRoot, outputRoot, options = {}) {
    const startTime = Date.now();

    try {
      const classification = this.fileClassifier.classifyFile(newFile);
      
      if (classification.isPage) {
        // New page - process it
        const outputPath = this._getOutputPath(newFile, sourceRoot, outputRoot, options);
        await this._rebuildSingleFile(newFile, outputPath, sourceRoot, options);
        
        return {
          success: true,
          newFiles: 1,
          buildTime: Date.now() - startTime
        };
      } else if (classification.isAsset) {
        // New asset - copy it if referenced
        const outputPath = this._getOutputPath(newFile, sourceRoot, outputRoot, options);
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
  async handleDeletedFiles(deletedFiles, sourceRoot, outputRoot, options = {}) {
    const startTime = Date.now();
    let cleanedFiles = 0;

    try {
      const { rmSync, existsSync } = await import('fs');

      for (const deletedFile of deletedFiles) {
        const outputPath = this._getOutputPath(deletedFile, sourceRoot, outputRoot, options);
        
        // Only count files that actually exist and get deleted
        if (existsSync(outputPath)) {
          try {
            rmSync(outputPath, { force: true });
            cleanedFiles++;
          } catch (error) {
            // Propagate deletion errors instead of silently catching them
            throw new Error(`Failed to delete ${outputPath}: ${error.message}`);
          }
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
  _getOutputPath(sourcePath, sourceRoot, outputRoot, options = {}) {
    const { relative, join, parse, extname } = require('path');
    let relativePath = relative(sourceRoot, sourcePath);
    const extension = extname(sourcePath).toLowerCase();
    const isMarkdown = extension === '.md' || extension === '.markdown';
    
    // Convert markdown to HTML output
    if (isMarkdown) {
      const parsed = parse(relativePath);
      relativePath = join(parsed.dir, `${parsed.name}.html`);
    }
    
    // Check if pretty URLs are enabled and this is an HTML or markdown file
    if (options.prettyUrls && (['.html', '.htm'].includes(extension) || isMarkdown)) {
      const parsed = parse(relativePath);
      
      // Don't transform index.html files - they stay as is
      if (parsed.name === 'index') {
        return join(outputRoot, relativePath);
      }
      
      // Transform other HTML files: about.html → about/index.html
      const prettyPath = join(parsed.dir, parsed.name, 'index.html');
      return join(outputRoot, prettyPath);
    }
    
    // For all other files or when pretty URLs are disabled
    return join(outputRoot, relativePath);
  }

  /**
   * Rebuild a single file
   * @private
   * @param {string} sourcePath - Source file path
   * @param {string} outputPath - Output file path
   * @param {string} sourceRoot - Source root directory
   * @returns {Promise<Array>} Array of any recoverable errors encountered
   */
  async _rebuildSingleFile(sourcePath, outputPath, sourceRoot, options = {}) {
    const recoverableErrors = []; // Collect recoverable errors to return
    this.logger.debug(`Starting rebuild`, { sourcePath, outputPath });
    try {
      const { dirname, extname } = require('path');
      const { mkdirSync } = await import('fs');
      
      // Ensure output directory exists
      this.logger.debug(`Creating output directory`, { outputDir: dirname(outputPath) });
      try {
        mkdirSync(dirname(outputPath), { recursive: true });
      } catch (dirError) {
        this.logger.debug(`Failed to create directory`, { error: dirError.message });
        throw dirError;
      }
      
      // Read source file
      const sourceFile = Bun.file(sourcePath);
      const fileExists = await sourceFile.exists();
      this.logger.debug(`File exists check`, { sourcePath, fileExists });
      if (fileExists) {
        const content = await sourceFile.text();
        const extension = extname(sourcePath).toLowerCase();
        const isMarkdown = extension === '.md' || extension === '.markdown';
        
        let processedContent = content;
        
        // Process HTML files through HtmlProcessor to handle data-unify attributes
        if (['.html', '.htm'].includes(extension)) {
          // Always rebuild file system map to get latest layout content
          const fileSystem = await this._buildFileSystemMap(sourceRoot);
          
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
          
          processedContent = result.success && result.html ? result.html : processedContent;
          
          // Always track dependencies for HTML files
          await this.dependencyTracker.trackPageDependencies(sourcePath, content, sourceRoot);
          
          this._handleRecoverableErrors(result, sourcePath, recoverableErrors);
        } else if (isMarkdown) {
          const processingOptions = {
            prettyUrls: options.prettyUrls || false,
            minify: options.minify || false
          };
          
          const markdownResult = await processMarkdownForDOMCascade(content, sourcePath, processingOptions);
          const fileSystem = await this._buildFileSystemMap(sourceRoot);
          const htmlForProcessing = this._createHtmlFromMarkdown(markdownResult);
          
          this.htmlProcessor.clearCache();
          
          const result = await this.htmlProcessor.processFile(
            sourcePath,
            htmlForProcessing,
            fileSystem,
            sourceRoot,
            processingOptions
          );
          
          processedContent = result.html || htmlForProcessing;
          
          await this.dependencyTracker.trackPageDependencies(sourcePath, htmlForProcessing, sourceRoot);
          
          this._handleRecoverableErrors(result, sourcePath, recoverableErrors);
        }
        
        await Bun.write(outputPath, processedContent);
        
        // Update cache with new content
        await this.buildCache.updateFileHash(sourcePath, content);
      } else {
        // Source file doesn't exist - this is an error condition
        this.logger.debug(`Source file not found`, { sourcePath });
        throw new Error(`Source file not found: ${sourcePath}`);
      }
      
      return recoverableErrors; // Return collected recoverable errors
    } catch (error) {
      // Re-throw error so it can be caught by caller
      throw error;
    }
  }

  _handleRecoverableErrors(result, sourcePath, recoverableErrors) {
    if (result?.recoverableErrors && result.recoverableErrors.length > 0) {
      for (const errorMessage of result.recoverableErrors) {
        if (recoverableErrors) {
          recoverableErrors.push({
            message: errorMessage,
            file: sourcePath,
            type: 'RecoverableError',
            timestamp: Date.now()
          });
        }

        const recoverableError = new Error(errorMessage);
        recoverableError.name = 'RecoverableError';
        recoverableError.isRecoverable = true;
        recoverableError.file = sourcePath;
        throw recoverableError;
      }
    }
  }

  _createHtmlFromMarkdown(markdownResult) {
    const htmlAttributes = this._extractHtmlAttributes(markdownResult.frontmatter, 'html');
    const bodyAttributes = this._extractHtmlAttributes(markdownResult.frontmatter, 'body');

    if (markdownResult.frontmatter?.layout) {
      const hasAreaClasses = markdownResult.html.includes('class="unify-') ||
        markdownResult.html.includes("class='unify-") ||
        markdownResult.html.includes('class=unify-');

      let bodyContent = '';
      if (hasAreaClasses) {
        bodyContent = markdownResult.html;
      } else {
        const { landmarks, content } = this._extractLandmarksFromHtml(markdownResult.html);

        if (landmarks.length > 0) {
          bodyContent = landmarks.join('\n');
          if (content.trim()) {
            bodyContent += '\n<main>' + content + '</main>';
          }
        } else {
          bodyContent = markdownResult.html;
        }
      }

      return `<html${htmlAttributes} data-unify="${markdownResult.frontmatter.layout}">
<head>
<title>${markdownResult.title || 'Untitled'}</title>
${markdownResult.headHtml}
</head>
<body${bodyAttributes}>
${bodyContent}
</body>
</html>`;
    }

    return `<html${htmlAttributes}>
<head>
<title>${markdownResult.title || 'Untitled'}</title>
${markdownResult.headHtml}
</head>
<body${bodyAttributes}>
<main>${markdownResult.html}</main>
</body>
</html>`;
  }

  _extractHtmlAttributes(frontmatter, prefix) {
    if (!frontmatter || typeof frontmatter !== 'object') {
      return '';
    }

    const attributes = [];
    const prefixPattern = `${prefix}_`;

    for (const [key, value] of Object.entries(frontmatter)) {
      if (key.startsWith(prefixPattern) && value) {
        let attrName = key.substring(prefixPattern.length);

        if (attrName.startsWith('data_')) {
          attrName = attrName.replace('data_', 'data-');
        }

        const escapedValue = String(value)
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        attributes.push(`${attrName}="${escapedValue}"`);
      }
    }

    return attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
  }

  _extractLandmarksFromHtml(html) {
    if (!html || typeof html !== 'string') {
      return { landmarks: [], content: '' };
    }

    const landmarks = [];
    const landmarkTags = ['header', 'nav', 'main', 'aside', 'footer'];
    let remainingContent = html;

    for (const tag of landmarkTags) {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
      let match;

      while ((match = regex.exec(html)) !== null) {
        landmarks.push(match[0]);
        remainingContent = remainingContent.replace(match[0], '');
      }
    }

    remainingContent = remainingContent.replace(/\n\s*\n/g, '\n').trim();

    return { landmarks, content: remainingContent };
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

      // Only process page files (not fragments or assets)
      if (classification.isPage) {
        const outputPath = this._getOutputPath(sourcePath, sourceRoot, outputRoot, options);
        await this._rebuildSingleFileWithFileSystem(sourcePath, outputPath, sourceRoot, fileSystem, options);
        processedCount++;
      }
      // Note: Fragments are used during composition but not counted as processed files
      // per specification - they are "non-emitting" files
    }

    return processedCount;
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

      const sourceFile = Bun.file(sourcePath);
      if (await sourceFile.exists()) {
        const content = await sourceFile.text();
        const extension = extname(sourcePath).toLowerCase();
        const isMarkdown = extension === '.md' || extension === '.markdown';

        let processedContent = content;

        if (['.html', '.htm'].includes(extension)) {
          const processingOptions = {
            prettyUrls: options.prettyUrls || false,
            minify: options.minify || false
          };

          this.htmlProcessor.clearCache();

          const result = await this.htmlProcessor.processFile(
            sourcePath,
            content,
            fileSystem,
            sourceRoot,
            processingOptions
          );

          processedContent = result.success && result.html ? result.html : processedContent;

          this._handleRecoverableErrors(result, sourcePath);

          await this.assetTracker.recordAssetReferences(sourcePath, processedContent, sourceRoot);
        } else if (isMarkdown) {
          const processingOptions = {
            prettyUrls: options.prettyUrls || false,
            minify: options.minify || false
          };

          const markdownResult = await processMarkdownForDOMCascade(content, sourcePath, processingOptions);
          const htmlForProcessing = this._createHtmlFromMarkdown(markdownResult);

          this.htmlProcessor.clearCache();

          const result = await this.htmlProcessor.processFile(
            sourcePath,
            htmlForProcessing,
            fileSystem,
            sourceRoot,
            processingOptions
          );

          processedContent = result.html || htmlForProcessing;

          this._handleRecoverableErrors(result, sourcePath);

          await this.assetTracker.recordAssetReferences(sourcePath, processedContent, sourceRoot);
        } else if (['.css', '.js'].includes(extension)) {
          await this.assetTracker.trackPageAssets(sourcePath, content, sourceRoot);
        }

        await Bun.write(outputPath, processedContent);

        // Update cache with new content
        await this.buildCache.updateFileHash(sourcePath, content);
      }
    } catch (error) {
      throw error;
    }
  }
}
