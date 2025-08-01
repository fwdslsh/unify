/**
 * File watching system for unify
 * Uses native fs.watch for high-performance file monitoring
 */

import fs from 'fs/promises';
import path from 'path';
import { build, incrementalBuild, initializeModificationCache } from './file-processor.js';
import { getOutputPath } from '../utils/path-resolver.js';
import { logger } from '../utils/logger.js';

export class FileWatcher {
  constructor() {
    this.watchers = new Map();
    this.isWatching = false;
    this.dependencyTracker = null;
    this.assetTracker = null;
    this.buildQueue = new Set();
    this.buildTimeout = null;
    this.eventCallbacks = new Map();
  }

  /**
   * Register event callbacks
   */
  on(eventType, callback) {
    if (!this.eventCallbacks.has(eventType)) {
      this.eventCallbacks.set(eventType, []);
    }
    this.eventCallbacks.get(eventType).push(callback);
    return this;
  }

  /**
   * Emit events to registered callbacks
   */
  emit(eventType, ...args) {
    const callbacks = this.eventCallbacks.get(eventType) || [];
    callbacks.forEach(callback => {
      try {
        callback(...args);
      } catch (error) {
        logger.error(error.formatForCLI ? error.formatForCLI() : `Error in ${eventType} callback: ${error.message}`);
      }
    });
  }

  /**
   * Start watching files with native fs.watch
   * @param {Object} options - Watch configuration options
   */
  async startWatching(options = {}) {
    const config = {
      source: 'src',
      output: 'dist',
      includes: 'includes',
      head: null,
      clean: true,
      debounceMs: 300, // Increased debounce time to prevent excessive rebuilds
      ...options,
      perfection: false // Watch mode should not use perfection flag
    };

    // Register the onReload callback if provided
    if (config.onReload && typeof config.onReload === 'function') {
      this.on('reload', config.onReload);
    }

    logger.info('Starting file watcher...');

    try {
      // Initial build
      const result = await build(config);
      this.dependencyTracker = result.dependencyTracker;
      this.assetTracker = result.assetTracker;
      
      // Initialize modification cache for incremental builds
      await initializeModificationCache(config.source);
      
      logger.success('Initial build completed');

      // Start watching with fs.watch
      await this.setupWatcher(config);
      
      this.isWatching = true;
      logger.info(`Watching ${config.source} for changes...`);
      
      return this;
    } catch (error) {
      if (error.formatForCLI) {
        logger.error(error.formatForCLI());
      } else {
        logger.error('Failed to start file watcher:', error.message);
      }
      throw error;
    }
  }

  /**
   * Set up native fs.watch for the source directory
   */
  async setupWatcher(config) {
    const sourcePath = path.resolve(config.source);
    
    try {
      // Watch the entire source directory recursively
      const watcher = fs.watch(sourcePath, { 
        recursive: true,
        persistent: true,
        encoding: 'utf8'
      });
      
      this.watchers.set(sourcePath, watcher);
      logger.debug(`Started fs.watch on: ${sourcePath}`);

      // Process file change events asynchronously
      this.processWatchEvents(watcher, config);
      
    } catch (error) {
      if (error.formatForCLI) {
        logger.error(error.formatForCLI());
      } else {
        logger.error(`Failed to watch directory ${sourcePath}:`, error.message);
      }
      throw error;
    }
  }

  /**
   * Process watch events from fs.watch iterator
   */
  async processWatchEvents(watcher, config) {
    try {
      for await (const event of watcher) {
        if (!this.isWatching) {
          break;
        }
        
        await this.handleFileChange(event, config);
      }
    } catch (error) {
      if (this.isWatching) {
        logger.error(error.formatForCLI ? error.formatForCLI() : `Error processing watch events: ${error.message}`);
        // Attempt to restart watcher
        setTimeout(() => {
          if (this.isWatching) {
            logger.info('Attempting to restart file watcher...');
            this.setupWatcher(config);
          }
        }, 1000);
      }
    }
  }

  /**
   * Handle file change events from fs.watch
   */
  async handleFileChange(event, config) {
    const { eventType, filename } = event;
    
    if (!filename) return;
    
    const fullPath = path.resolve(config.source, filename);
    
    // Filter out unwanted files and events
    if (this.shouldIgnoreFile(filename) || this.shouldIgnoreEvent(eventType, filename)) {
      return;
    }

    // Map events to standard events for compatibility, now with proper file existence checking
    const mappedEvent = await this.mapEventType(eventType, filename, fullPath);
    
    logger.debug(`File ${mappedEvent} (${eventType}): ${filename}`);
    
    // Emit event for compatibility
    this.emit(mappedEvent, fullPath);
    this.emit('all', mappedEvent, fullPath);
    
    // Handle different event types appropriately
    if (mappedEvent === 'unlink') {
      // File was deleted - clean up from tracking and output
      await this.handleFileDeletion(fullPath, config);
      // Note: dependent pages are added to build queue in handleFileDeletion
    } else {
      // File was added or changed - add to build queue
      this.buildQueue.add(fullPath);
    }
    
    if (this.buildTimeout) {
      clearTimeout(this.buildTimeout);
    }
    
    this.buildTimeout = setTimeout(async () => {
      await this.processBuildQueue(config);
    }, config.debounceMs);
  }

  /**
   * Handle file deletion by cleaning up tracking and removing from output
   */
  async handleFileDeletion(deletedFilePath, config) {
    logger.info(`File deleted: ${path.relative(config.source, deletedFilePath)}`);
    
    try {
      // Get dependent pages BEFORE cleaning up dependency tracking
      let dependentPages = [];
      if (this.dependencyTracker) {
        dependentPages = this.dependencyTracker.getDependentPages(deletedFilePath);
        logger.debug(`Found ${dependentPages.length} pages dependent on deleted file: ${dependentPages.map(p => path.relative(config.source, p)).join(', ')}`);
        
        // Add dependent pages to build queue for rebuilding
        dependentPages.forEach(page => {
          this.buildQueue.add(page);
          logger.debug(`Added dependent page to rebuild queue: ${path.relative(config.source, page)}`);
        });
        
        // Now clean up from dependency tracking
        this.dependencyTracker.removeFile(deletedFilePath);
      }
      
      // Clean up from asset tracking
      if (this.assetTracker) {
        this.assetTracker.removePage(deletedFilePath);
      }
      
      // Remove corresponding file from output directory
      const outputPath = getOutputPath(deletedFilePath, config.source, config.output);
      try {
        await fs.unlink(outputPath);
        logger.debug(`Removed output file: ${outputPath}`);
      } catch (error) {
        // File might not exist in output (e.g., if it's a partial file)
        if (error.code !== 'ENOENT') {
          logger.warn(`Failed to remove output file ${outputPath}: ${error.message}`);
        }
      }
      
    } catch (error) {
      logger.error(`Error handling file deletion for ${deletedFilePath}: ${error.message}`);
    }
  }

  /**
   * Map fs.watch event types to standardized event types with proper file existence checking
   */
  async mapEventType(eventType, filename, fullPath) {
    const eventMap = {
      'change': 'change',
      'delete': 'unlink'
    };
    
    // For 'rename' events, we need to check if the file exists to determine if it's add or unlink
    if (eventType === 'rename') {
      try {
        await fs.access(fullPath);
        // File exists - it's an addition or move-in
        return 'add';
      } catch (error) {
        // File doesn't exist - it's a deletion or move-out  
        return 'unlink';
      }
    }
    
    return eventMap[eventType] || 'change';
  }

  /**
   * Check if an event should be ignored
   */
  shouldIgnoreEvent(eventType, filename) {
    // Ignore certain event types that don't require rebuilds
    const ignoredEventTypes = ['access', 'attrib'];
    if (ignoredEventTypes.includes(eventType)) {
      return true;
    }
    
    // Ignore temporary files from editors and system
    const tempFilePatterns = [
      /\.tmp$/,
      /\.temp$/,
      /~$/,
      /^\.#/,
      /#$/,
      /\.swp$/,
      /\.swo$/,
      /\.orig$/,
      /\.bak$/,
      /4913$/, // Common vim temporary file pattern
      /\.DS_Store$/,
      /Thumbs\.db$/
    ];
    
    if (tempFilePatterns.some(pattern => pattern.test(filename))) {
      return true;
    }
    
    return false;
  }

  /**
   * Process queued file changes
   */
  async processBuildQueue(config) {
    if (this.buildQueue.size === 0) return;
    
    const changedFiles = Array.from(this.buildQueue);
    this.buildQueue.clear();
    
    logger.info(`Processing ${changedFiles.length} changed file(s)...`);
    
    try {
      // Use incremental build for better performance
      // For multiple files, build each individually to ensure proper dependency tracking
      if (changedFiles.length === 1) {
        await incrementalBuild(config, this.dependencyTracker, this.assetTracker, changedFiles[0]);
      } else {
        // For multiple changed files, process each one to ensure all dependencies are caught
        for (const changedFile of changedFiles) {
          await incrementalBuild(config, this.dependencyTracker, this.assetTracker, changedFile);
        }
      }
      logger.success('Incremental build completed');
      
      // Emit reload event for live reload
      this.emit('reload', 'build', changedFiles);
      
    } catch (error) {
      if (error.formatForCLI) {
        logger.error(error.formatForCLI());
      } else {
        logger.error('Incremental build failed:', error.message);
      }
      
      // Fallback to full rebuild
      try {
        logger.info('Attempting full rebuild...');
        const result = await build(config);
        this.dependencyTracker = result.dependencyTracker;
        this.assetTracker = result.assetTracker;
        logger.success('Full rebuild completed');
        
        // Emit reload event after successful fallback rebuild
        this.emit('reload', 'rebuild', changedFiles);
        
      } catch (rebuildError) {
        if (rebuildError.formatForCLI) {
          logger.error(rebuildError.formatForCLI());
        } else {
          logger.error('Full rebuild also failed:', rebuildError.message);
        }
      }
    }
  }

  /**
   * Check if a file should be ignored by the watcher
   */
  shouldIgnoreFile(filename) {
    const ignoredPatterns = [
      /node_modules/,
      /\.git/,
      /\.DS_Store/,
      /\.temp/,
      /\.tmp/,
      /\.log$/,
      /\.lock$/,
      /~$/,
      /dist\//, // Ignore output directory
      /build\//, // Ignore build directory
      /out\//, // Ignore out directory
      /\.cache/,
      /coverage/
    ];
    
    return ignoredPatterns.some(pattern => pattern.test(filename));
  }

  /**
   * Stop watching files
   */
  async stopWatching() {
    this.isWatching = false;
    
    if (this.buildTimeout) {
      clearTimeout(this.buildTimeout);
      this.buildTimeout = null;
    }
    
    // Close all watchers
    for (const [path, watcher] of this.watchers) {
      try {
        await watcher.close?.();
        logger.debug(`Stopped watching: ${path}`);
      } catch (error) {
        logger.warn(`Error closing watcher for ${path}:`, error.message);
      }
    }
    
    this.watchers.clear();
    this.buildQueue.clear();
    
    logger.info('File watcher stopped');
  }

  /**
   * Get watcher statistics
   */
  getStats() {
    return {
      isWatching: this.isWatching,
      watchedPaths: Array.from(this.watchers.keys()),
      queuedBuilds: this.buildQueue.size
    };
  }
}

/**
 * Start watching files and rebuild on changes
 * @param {Object} options - Watch configuration options
 * @param {string} [options.source='src'] - Source directory path
 * @param {string} [options.output='dist'] - Output directory path  
 * @param {string} [options.includes='includes'] - Include directory name
 * @param {string} [options.head=null] - Custom head file path
 * @param {boolean} [options.clean=true] - Whether to clean output directory before build
 */
export async function watch(options = {}) {
  logger.info('Using native file watcher');
  const watcher = new FileWatcher();
  await watcher.startWatching(options);
  return watcher;
}

