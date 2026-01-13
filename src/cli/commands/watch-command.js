/**
 * Watch Command Implementation
 * Implements US-010: File Watching and Incremental Builds
 * 
 * Provides file watching functionality with incremental builds,
 * integrating FileWatcher with IncrementalBuilder for efficient development workflow.
 */

import { FileWatcher } from '../../core/file-watcher.js';
import { IncrementalBuilder } from '../../core/incremental-builder.js';
import { createLogger } from '../../utils/logger.js';

/**
 * WatchCommand implements the `unify watch` command
 */
export class WatchCommand {
  constructor() {
    this.fileWatcher = new FileWatcher();
    this.incrementalBuilder = new IncrementalBuilder();
    this.logger = createLogger('WATCH');
    this.isWatching = false;
    this.buildResults = [];
  }

  /**
   * Execute the watch command
   * @param {Object} options - Watch options
   * @param {string} options.source - Source directory path
   * @param {string} options.output - Output directory path
   * @param {Function} options.onBuild - Callback for build events
   * @param {Function} options.onError - Callback for errors
   * @param {number} options.debounceMs - Debounce delay in milliseconds
   * @param {number} options.timeout - Auto-stop timeout for testing
   * @returns {Promise<Object>} Watch result
   */
  async execute(options) {
    const startTime = Date.now();
    let initialBuildCompleted = false;

    try {
      // Perform initial build
      const initialBuildResult = await this.incrementalBuilder.performInitialBuild(
        options.source,
        options.output,
        {
          prettyUrls: options.prettyUrls,
          minify: options.minify,
          clean: options.clean,
          verbose: options.verbose
        }
      );

      if (!initialBuildResult.success) {
        return {
          success: false,
          error: initialBuildResult.error,
          initialBuildCompleted: false,
          watchingStarted: false
        };
      }

      initialBuildCompleted = true;

      // Report initial build
      if (options.onBuild) {
        try {
          options.onBuild({
            type: 'initial',
            processedFiles: initialBuildResult.processedFiles,
            buildTime: initialBuildResult.buildTime,
            timestamp: Date.now()
          });
        } catch (callbackError) {
          // Log callback error but continue watching
          console.warn('Build callback error:', callbackError.message);
        }
      }

      // Start watching for changes
      const watchOptions = {
        debounceMs: options.debounceMs || 100,
        onChange: async (events, abortSignal) => {
          await this._handleFileChanges(events, options, abortSignal);
        },
        onError: (error) => {
          if (options.onError) {
            options.onError(error);
          }
        }
      };

      await this.fileWatcher.startWatching(options.source, watchOptions);
      this.isWatching = true;

      // Auto-stop for testing
      if (options.timeout) {
        setTimeout(async () => {
          await this.stop();
        }, options.timeout);
      }

      return {
        success: true,
        initialBuildCompleted: true,
        watchingStarted: true,
        buildTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        initialBuildCompleted,
        watchingStarted: false,
        buildTime: Date.now() - startTime
      };
    }
  }

  /**
   * Stop watching and clean up resources
   * @returns {Promise<Object>} Stop result
   */
  async stop() {
    try {
      await this.fileWatcher.stopWatching();
      this.isWatching = false;

      return {
        success: true,
        watchingStopped: true,
        resourcesCleaned: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        watchingStopped: false,
        resourcesCleaned: false
      };
    }
  }

  /**
   * Handle file changes during watch
   * @private
   * @param {Object|Object[]} events - File change event(s)
   * @param {Object} options - Watch options
   * @param {AbortSignal} abortSignal - Abort signal for cancellation
   */
  async _handleFileChanges(events, options, abortSignal) {
    try {
      // Check if operation was aborted
      if (abortSignal && abortSignal.aborted) {
        throw new Error('Operation aborted');
      }

      const eventArray = Array.isArray(events) ? events : [events];
      const changedFiles = eventArray.map(e => e.filePath);

      // Perform incremental builds for changed files
      let totalRebuiltFiles = 0;
      let allAffectedPages = [];

      for (const event of eventArray) {
        if (abortSignal && abortSignal.aborted) {
          throw new Error('Operation aborted');
        }

        try {
          this.logger.debug('Processing file change', { filePath: event.filePath });
          const result = await this.incrementalBuilder.performIncrementalBuild(
            event.filePath,
            options.source,
            options.output,
            { prettyUrls: options.prettyUrls, minify: options.minify }
          );
          this.logger.debug('Build result', { success: result.success, rebuiltFiles: result.rebuiltFiles });

          if (result.success) {
            totalRebuiltFiles += result.rebuiltFiles || 0;
            allAffectedPages.push(...(result.affectedPages || []));
          }
          
          // Report any errors (including recoverable ones) from the build result
          if (result.errors && result.errors.length > 0 && options.onError) {
            for (const errorInfo of result.errors) {
              this.logger.debug('Reporting result error to callback', { message: errorInfo.message, file: errorInfo.file });
              // Create error object compatible with existing error handling
              const error = new Error(errorInfo.message);
              error.file = errorInfo.file;
              error.type = errorInfo.type;
              error.timestamp = errorInfo.timestamp;
              options.onError(error);
            }
          }
        } catch (error) {
          if (error.name === 'RecoverableError' && error.isRecoverable) {
            // Report recoverable error to error callback but continue processing
            this.logger.debug('Caught recoverable error', { message: error.message, file: error.file });
            if (options.onError) {
              this.logger.debug('Reporting error to callback');
              options.onError(error);
            }
            // Continue processing other files
          } else {
            // Re-throw non-recoverable errors
            throw error;
          }
        }
      }

      // Report incremental build
      if (options.onBuild) {
        try {
          options.onBuild({
            type: 'incremental',
            changedFiles,
            rebuiltFiles: totalRebuiltFiles,
            affectedPages: allAffectedPages,
            buildTime: Date.now() - Date.now(), // Will be calculated properly
            timestamp: Date.now()
          });
        } catch (callbackError) {
          // Log callback error but continue watching
          console.warn('Build callback error:', callbackError.message);
        }
      }

    } catch (error) {
      if (error.name === 'AbortError' || error.message.includes('aborted')) {
        // Operation was cancelled, this is expected
        return;
      }
      
      if (options.onError) {
        options.onError(error);
      }
    }
  }
}