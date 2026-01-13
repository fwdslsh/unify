/**
 * Clean Command Implementation
 * Implements the `clean` command to remove build artifacts and output directories
 * 
 * Provides safe cleanup of build outputs with path traversal protection
 * and optional dry-run mode for previewing what would be deleted.
 */

import { PathValidator } from '../../core/path-validator.js';
import { FileSystemError, ValidationError } from '../../core/errors.js';
import { createLogger } from '../../utils/logger.js';
import { promises as fs, statSync } from 'fs';
import { resolve, join } from 'path';

/**
 * CleanCommand implements the `unify clean` command
 */
export class CleanCommand {
  constructor() {
    this.pathValidator = new PathValidator();
    this.logger = createLogger('CLEAN');
    this.deletedFiles = [];
    this.deletedDirs = [];
  }

  /**
   * Execute the clean command
   * @param {Object} options - Clean options
   * @param {string} options.output - Output directory path to clean
   * @param {boolean} [options.dryRun=false] - Preview mode without actual deletion
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   * @param {string[]} [options.patterns] - Additional patterns to clean
   * @returns {Promise<Object>} Clean result
   */
  async execute(options) {
    const startTime = Date.now();
    
    try {
      // Validate options
      this.validateOptions(options);
      
      // Reset tracking arrays
      this.deletedFiles = [];
      this.deletedDirs = [];

      this.logger.info('Starting cleanup', {
        output: options.output,
        dryRun: options.dryRun,
        patterns: options.patterns
      });

      // Clean the output directory
      const cleanResult = await this._cleanOutputDirectory(options);
      
      // Clean additional patterns if specified
      if (options.patterns && options.patterns.length > 0) {
        const patternResult = await this._cleanPatterns(options.patterns, options);
        cleanResult.patternsProcessed = patternResult.patternsProcessed;
      }

      // Show summary
      this._showSummary(options, cleanResult);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        deletedFiles: this.deletedFiles.length,
        deletedDirs: this.deletedDirs.length,
        outputCleaned: cleanResult.outputCleaned,
        patternsProcessed: cleanResult.patternsProcessed || 0,
        dryRun: options.dryRun || false,
        executionTime
      };

    } catch (error) {
      this.logger.error('Clean command failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        deletedFiles: 0,
        deletedDirs: 0,
        outputCleaned: false,
        patternsProcessed: 0,
        dryRun: options.dryRun || false,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Validate clean options
   * @param {Object} options - Clean options
   * @throws {ValidationError} If options are invalid
   */
  validateOptions(options) {
    // Output directory is required
    if (!options.output) {
      throw new ValidationError('output', 'Output directory is required');
    }

    // Validate output path security
    try {
      this.pathValidator.validatePath(options.output, process.cwd());
    } catch (error) {
      throw new ValidationError('output', 'Output path contains invalid or unsafe characters');
    }

    // Validate patterns if provided
    if (options.patterns) {
      if (!Array.isArray(options.patterns)) {
        throw new ValidationError('patterns', 'Patterns must be an array');
      }
      
      for (const pattern of options.patterns) {
        if (typeof pattern !== 'string') {
          throw new ValidationError('patterns', 'All patterns must be strings');
        }
        
        // Check for dangerous patterns
        if (this._isDangerousPattern(pattern)) {
          throw new ValidationError('patterns', `Dangerous pattern rejected: ${pattern}`);
        }
      }
    }
  }

  /**
   * Check if a pattern is dangerous (could affect system files)
   * @param {string} pattern - Pattern to check
   * @returns {boolean} True if dangerous
   * @private
   */
  _isDangerousPattern(pattern) {
    const dangerousPatterns = [
      '/',
      '/bin',
      '/usr',
      '/etc',
      '/var',
      '/sys',
      '/proc',
      'C:\\',
      'C:\\Windows',
      'C:\\Program Files',
      '../..',
      '../../..',
      '../../../..'
    ];
    
    const normalizedPattern = pattern.replace(/\\/g, '/').toLowerCase();
    
    // Normalize dangerous patterns for consistent comparison
    return dangerousPatterns.some(dangerous => {
      const normalizedDangerous = dangerous.replace(/\\/g, '/').toLowerCase();
      return normalizedPattern === normalizedDangerous || 
             normalizedPattern.startsWith(normalizedDangerous + '/');
    });
  }

  /**
   * Clean the output directory
   * @param {Object} options - Clean options
   * @returns {Promise<Object>} Clean result
   * @private
   */
  async _cleanOutputDirectory(options) {
    const outputPath = resolve(options.output);
    
    try {
      // Check if directory exists
      const stats = await fs.stat(outputPath);
      
      if (!stats.isDirectory()) {
        this.logger.info('Output path is not a directory, skipping', { output: outputPath });
        return { outputCleaned: false };
      }

      // Security check - ensure we're not cleaning dangerous directories
      const safePaths = ['/dist', '/build', '/out', '/.next', '/public'];
      const isOutputSafe = safePaths.some(safePath => 
        outputPath.includes(safePath) || 
        outputPath.endsWith(safePath.substring(1))
      );

      if (!isOutputSafe && !outputPath.includes('temp') && !outputPath.includes('tmp')) {
        // Additional confirmation for non-standard output directories
        if (!options.force) {
          throw new Error(`Output directory doesn't appear to be a standard build directory. Use --force to clean anyway: ${outputPath}`);
        }
      }

      if (options.dryRun) {
        console.log(`[DRY RUN] Would clean directory: ${outputPath}`);
        await this._previewDirectoryContents(outputPath);
        return { outputCleaned: false };
      }

      // Clean the directory contents
      await this._cleanDirectory(outputPath, options);
      
      this.logger.info('Output directory cleaned successfully', { 
        output: outputPath,
        deletedFiles: this.deletedFiles.length,
        deletedDirs: this.deletedDirs.length
      });

      return { outputCleaned: true };

    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.info('Output directory does not exist, nothing to clean', { output: outputPath });
        return { outputCleaned: false };
      }
      
      throw new FileSystemError('clean', outputPath, error.message);
    }
  }

  /**
   * Clean directory contents recursively
   * @param {string} dirPath - Directory path to clean
   * @param {Object} options - Clean options
   * @private
   */
  async _cleanDirectory(dirPath, options) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively clean subdirectory
        await this._cleanDirectory(fullPath, options);
        
        // Remove empty directory
        await fs.rmdir(fullPath);
        this.deletedDirs.push(fullPath);
        
        if (options.verbose) {
          console.log(`Removed directory: ${fullPath}`);
        }
      } else {
        // Remove file
        await fs.unlink(fullPath);
        this.deletedFiles.push(fullPath);
        
        if (options.verbose) {
          console.log(`Removed file: ${fullPath}`);
        }
      }
    }
  }

  /**
   * Preview directory contents for dry run
   * @param {string} dirPath - Directory to preview
   * @private
   */
  async _previewDirectoryContents(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          console.log(`[DRY RUN] Directory: ${fullPath}`);
          this.deletedDirs.push(fullPath);
          await this._previewDirectoryContents(fullPath);
        } else {
          console.log(`[DRY RUN] File: ${fullPath}`);
          this.deletedFiles.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`[DRY RUN] Cannot preview ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Clean additional patterns
   * @param {string[]} patterns - Patterns to clean
   * @param {Object} options - Clean options
   * @returns {Promise<Object>} Pattern clean result
   * @private
   */
  async _cleanPatterns(patterns, options) {
    const glob = await this._importGlob();
    let patternsProcessed = 0;
    
    for (const pattern of patterns) {
      try {
        const matches = await glob.glob(pattern, {
          dot: true, // Include hidden files
          absolute: true
        });

        for (const match of matches) {
          // Security validation for each matched path
          try {
            this.pathValidator.validatePath(match, process.cwd());
          } catch (error) {
            this.logger.warn('Skipping unsafe path', { path: match });
            continue;
          }

          if (options.dryRun) {
            console.log(`[DRY RUN] Would remove: ${match}`);
            continue;
          }

          await this._removePathSafely(match, options);
        }

        patternsProcessed++;
        
      } catch (error) {
        this.logger.error('Pattern processing failed', { pattern, error: error.message });
        // Continue with other patterns
      }
    }

    return { patternsProcessed };
  }

  /**
   * Import glob module dynamically
   * @returns {Promise<Object>} Glob module
   * @private
   */
  async _importGlob() {
    try {
      return await import('glob');
    } catch (error) {
      throw new Error('Glob pattern matching requires the "glob" package to be installed');
    }
  }

  /**
   * Remove path safely with validation
   * @param {string} targetPath - Path to remove
   * @param {Object} options - Clean options
   * @private
   */
  async _removePathSafely(targetPath, options) {
    try {
      const stats = await fs.stat(targetPath);
      
      if (stats.isDirectory()) {
        await this._cleanDirectory(targetPath, options);
        await fs.rmdir(targetPath);
        this.deletedDirs.push(targetPath);
      } else {
        await fs.unlink(targetPath);
        this.deletedFiles.push(targetPath);
      }

      if (options.verbose) {
        console.log(`Removed: ${targetPath}`);
      }
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File/directory doesn't exist, skip silently
        return;
      }
      
      throw new Error(`Failed to remove ${targetPath}: ${error.message}`);
    }
  }

  /**
   * Show cleanup summary
   * @param {Object} options - Clean options
   * @param {Object} result - Clean result
   * @private
   */
  _showSummary(options, result) {
    if (options.dryRun) {
      console.log('');
      console.log('🔍 Dry run completed - no files were actually deleted');
      console.log(`📊 Would delete: ${this.deletedFiles.length} files, ${this.deletedDirs.length} directories`);
      console.log('💡 Run without --dry-run to perform actual cleanup');
    } else {
      console.log('');
      console.log('✅ Cleanup completed successfully');
      console.log(`🗑️  Deleted: ${this.deletedFiles.length} files, ${this.deletedDirs.length} directories`);
      
      if (result.outputCleaned) {
        console.log(`📁 Output directory cleaned: ${options.output}`);
      }
      
      if (result.patternsProcessed > 0) {
        console.log(`🎯 Processed ${result.patternsProcessed} additional patterns`);
      }
    }
    console.log('');
  }

  /**
   * Get current cleanup statistics
   * @returns {Object} Cleanup stats
   */
  getStats() {
    return {
      deletedFiles: this.deletedFiles.length,
      deletedDirs: this.deletedDirs.length,
      totalDeleted: this.deletedFiles.length + this.deletedDirs.length
    };
  }
}