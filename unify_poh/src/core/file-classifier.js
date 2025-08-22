/**
 * File Classifier for Unify
 * Implements US-009: Asset Copying and Management and US-016: Glob Pattern Processing
 * 
 * Classifies files into different types (pages, assets, fragments)
 * and determines appropriate processing strategies with optional glob pattern support.
 */

import { extname } from 'path';
import { GlobPatternProcessor } from './glob-pattern-processor.js';

/**
 * FileClassifier class for categorizing files in the build process
 */
export class FileClassifier {
  constructor() {
    // File type configurations
    this.pageExtensions = ['.html', '.htm'];
    this.markdownExtensions = ['.md', '.markdown'];
    this.assetExtensions = [
      // Images
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff',
      // Fonts
      '.woff', '.woff2', '.ttf', '.otf', '.eot',
      // Audio/Video
      '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
      // Stylesheets and Scripts
      '.css', '.js', '.ts', '.scss', '.sass', '.less',
      // Documents
      '.pdf', '.doc', '.docx', '.txt', '.json', '.xml',
      // Archives
      '.zip', '.tar', '.gz', '.rar', '.7z',
      // Other
      '.map', '.wasm', '.bin'
    ];

    // Glob pattern processor (optional)
    this._globProcessor = null;
    this.onWarning = null;
  }

  /**
   * Classify a file based on its path and content
   * @param {string} filePath - Full path to the file
   * @returns {Object} Classification result
   */
  classifyFile(filePath) {
    // If glob processor is configured, use enhanced classification
    if (this._globProcessor) {
      try {
        return this._enhancedClassifyFile(filePath);
      } catch (error) {
        // Fallback to basic classification if glob processing fails
        this._warn(`Glob processing failed for ${filePath}: ${error.message}`);
      }
    }

    // Basic classification (backward compatibility)
    return this._basicClassifyFile(filePath);
  }

  /**
   * Basic file classification (original logic)
   * @param {string} filePath - Full path to the file
   * @returns {Object} Basic classification result
   * @private
   */
  _basicClassifyFile(filePath) {
    const extension = extname(filePath).toLowerCase();
    const filename = filePath.split('/').pop() || filePath.split('\\').pop();
    
    const result = {
      type: null,
      shouldEmit: false,
      shouldCopy: false,
      isFragment: false,
      isAsset: false,
      isPage: false,
      extension: extension,
      processingStrategy: null
    };

    // Check if it's a fragment (starts with underscore)
    if (filename.startsWith('_')) {
      result.isFragment = true;
      result.type = 'fragment';
      result.shouldEmit = false; // Fragments are not directly emitted
      result.processingStrategy = 'fragment';
      return result;
    }

    // Check if it's a page
    if (this.pageExtensions.includes(extension)) {
      result.isPage = true;
      result.type = 'page';
      result.shouldEmit = true;
      result.processingStrategy = 'html';
      return result;
    }

    // Check if it's a markdown file
    if (this.markdownExtensions.includes(extension)) {
      result.isPage = true;
      result.type = 'page';
      result.shouldEmit = true;
      result.processingStrategy = 'markdown';
      return result;
    }

    // Check if it's an asset
    if (this.assetExtensions.includes(extension)) {
      result.isAsset = true;
      result.type = 'asset';
      result.shouldCopy = true;
      result.processingStrategy = 'asset';
      return result;
    }

    // Unknown file type
    result.type = 'unknown';
    result.shouldCopy = false; // Don't copy unknown files by default
    result.processingStrategy = 'skip';

    return result;
  }

  /**
   * Enhanced file classification with glob pattern processing
   * @param {string} filePath - Full path to the file
   * @returns {Object} Enhanced classification result
   * @private
   */
  _enhancedClassifyFile(filePath) {
    // Get basic classification first
    const basicResult = this._basicClassifyFile(filePath);
    
    // For fragments, check if they should be auto-ignored (unless forced to render)
    if (basicResult.isFragment && this._globProcessor.options.autoIgnore !== false) {
      this._globProcessor.addAutoIgnoredFile(filePath, 'fragment');
    }
    
    // Get glob pattern classification
    const globResult = this._globProcessor.classifyFile(filePath);
    
    // Handle special case: fragments that are forced to render should not be considered fragments
    const isFragmentOverride = basicResult.isFragment && globResult.action === 'EMIT';
    
    // Merge results with glob taking precedence
    const enhancedResult = {
      // Enhanced properties
      action: globResult.action,
      tier: globResult.tier,
      reason: globResult.reason,
      matchedPattern: globResult.matchedPattern,
      
      // Backward compatibility properties
      type: this._mapActionToType(globResult.action, basicResult.type),
      shouldEmit: globResult.action === 'EMIT',
      shouldCopy: globResult.action === 'COPY',
      isFragment: basicResult.isFragment && !isFragmentOverride,
      isAsset: (basicResult.isAsset && globResult.action !== 'IGNORED' && globResult.action !== 'SKIP') || globResult.action === 'COPY',
      isPage: isFragmentOverride || (basicResult.isPage && globResult.action === 'EMIT'),
      extension: basicResult.extension,
      processingStrategy: this._mapActionToProcessingStrategy(globResult.action, basicResult.processingStrategy)
    };

    return enhancedResult;
  }

  /**
   * Map glob action to file type
   * @param {string} action - Glob action (EMIT, COPY, IGNORED, SKIP)
   * @param {string} basicType - Basic file type
   * @returns {string} Mapped file type
   * @private
   */
  _mapActionToType(action, basicType) {
    switch (action) {
      case 'EMIT':
        return 'page';
      case 'COPY':
        return 'asset';
      case 'IGNORED':
        return 'ignored';
      case 'SKIP':
        return 'unknown';
      default:
        return basicType;
    }
  }

  /**
   * Map glob action to processing strategy
   * @param {string} action - Glob action (EMIT, COPY, IGNORED, SKIP)
   * @param {string} basicStrategy - Basic processing strategy
   * @returns {string} Processing strategy
   * @private
   */
  _mapActionToProcessingStrategy(action, basicStrategy) {
    switch (action) {
      case 'EMIT':
        return basicStrategy === 'markdown' ? 'markdown' : 'html';
      case 'COPY':
        return 'copy';
      case 'IGNORED':
        return 'ignore';
      case 'SKIP':
        return 'skip';
      default:
        return basicStrategy;
    }
  }

  /**
   * Configure glob pattern processing
   * @param {Object} options - Glob pattern configuration
   */
  configureGlobPatterns(options) {
    // Pass asset extension knowledge to glob processor
    const globOptions = {
      ...options,
      assetExtensions: this.assetExtensions,
      renderableExtensions: [...this.pageExtensions, ...this.markdownExtensions]
    };
    
    this._globProcessor = new GlobPatternProcessor(globOptions);
    
    // Forward warnings from glob processor
    this._globProcessor.onWarning = (warning) => this._warn(warning);
    
    // Add patterns if provided
    if (options.copy) {
      options.copy.forEach(pattern => this._globProcessor.addCopyPattern(pattern));
    }
    if (options.ignore) {
      options.ignore.forEach(pattern => this._globProcessor.addIgnorePattern(pattern));
    }
    if (options.ignoreRender) {
      options.ignoreRender.forEach(pattern => this._globProcessor.addIgnoreRenderPattern(pattern));
    }
    if (options.ignoreCopy) {
      options.ignoreCopy.forEach(pattern => this._globProcessor.addIgnoreCopyPattern(pattern));
    }
    if (options.render) {
      options.render.forEach(pattern => this._globProcessor.addRenderPattern(pattern));
    }
  }

  /**
   * Add auto-ignored layout file
   * @param {string} filePath - Path to layout file
   */
  addAutoIgnoredLayout(filePath) {
    if (this._globProcessor) {
      this._globProcessor.addAutoIgnoredFile(filePath, 'layout');
    }
  }

  /**
   * Load gitignore patterns
   * @param {string[]} patterns - Array of gitignore patterns
   */
  loadGitignorePatterns(patterns) {
    if (this._globProcessor) {
      patterns.forEach(pattern => this._globProcessor.addGitignorePattern(pattern));
    }
  }

  /**
   * Check if a file should be processed as a page
   * @param {string} filePath - File path to check
   * @returns {boolean} True if file should be processed as a page
   */
  isPageFile(filePath) {
    const classification = this.classifyFile(filePath);
    return classification.isPage;
  }

  /**
   * Check if a file should be copied as an asset
   * @param {string} filePath - File path to check
   * @returns {boolean} True if file should be copied as an asset
   */
  isAssetFile(filePath) {
    const classification = this.classifyFile(filePath);
    return classification.isAsset;
  }

  /**
   * Check if a file is a fragment (layout, component, etc.)
   * @param {string} filePath - File path to check
   * @returns {boolean} True if file is a fragment
   */
  isFragmentFile(filePath) {
    const classification = this.classifyFile(filePath);
    return classification.isFragment;
  }

  /**
   * Get the processing strategy for a file
   * @param {string} filePath - File path to analyze
   * @returns {string} Processing strategy (html|markdown|asset|fragment|skip)
   */
  getProcessingStrategy(filePath) {
    const classification = this.classifyFile(filePath);
    return classification.processingStrategy;
  }

  /**
   * Get all supported file extensions
   * @returns {Object} Object with arrays of extensions by type
   */
  getSupportedExtensions() {
    return {
      pages: [...this.pageExtensions],
      markdown: [...this.markdownExtensions],
      assets: [...this.assetExtensions]
    };
  }

  /**
   * Add custom asset extension
   * @param {string} extension - Extension to add (including dot)
   */
  addAssetExtension(extension) {
    if (!this.assetExtensions.includes(extension.toLowerCase())) {
      this.assetExtensions.push(extension.toLowerCase());
    }
  }

  /**
   * Add custom page extension
   * @param {string} extension - Extension to add (including dot)
   */
  addPageExtension(extension) {
    if (!this.pageExtensions.includes(extension.toLowerCase())) {
      this.pageExtensions.push(extension.toLowerCase());
    }
  }

  /**
   * Emit warning message
   * @param {string} message - Warning message
   * @private
   */
  _warn(message) {
    if (this.onWarning) {
      this.onWarning(message);
    }
  }
}