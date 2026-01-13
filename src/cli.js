#!/usr/bin/env bun

/**
 * Unify CLI Entry Point
 * Main command-line interface for the Unify static site generator
 */

import { ArgsParser } from './cli/args-parser.js';
import { BuildCommand } from './cli/commands/build-command.js';
import { ServeCommand } from './cli/commands/serve-command.js';
import { WatchCommand } from './cli/commands/watch-command.js';
import { InitCommand } from './cli/commands/init-command.js';
import { DOMCascadeLinter } from './core/dom-cascade-linter.js';
import { Logger } from './utils/logger.js';

/**
 * Signal handler factory for dependency injection
 */
class SignalHandler {
  constructor(processInterface = process) {
    this.process = processInterface;
  }

  /**
   * Register signal handlers for graceful shutdown
   * @param {Object} options - Signal handling options
   * @param {Function} options.onSigint - SIGINT handler
   * @param {Function} options.onSigterm - SIGTERM handler
   */
  registerHandlers(options) {
    this.process.on('SIGINT', options.onSigint);
    this.process.on('SIGTERM', options.onSigterm);
  }

  /**
   * Remove signal handlers
   * @param {Object} options - Signal handling options
   */
  removeHandlers(options) {
    this.process.removeListener('SIGINT', options.onSigint);
    this.process.removeListener('SIGTERM', options.onSigterm);
  }
}

/**
 * Main CLI application
 */
export class UnifyCLI {
  constructor(dependencies = {}) {
    this.argsParser = dependencies.argsParser || new ArgsParser();
    this.buildCommand = dependencies.buildCommand || new BuildCommand();
    this.serveCommand = dependencies.serveCommand || new ServeCommand();
    this.watchCommand = dependencies.watchCommand || new WatchCommand();
    this.initCommand = dependencies.initCommand || new InitCommand();
    this.logger = dependencies.logger || new Logger({ component: 'CLI' });
    this.signalHandler = dependencies.signalHandler || new SignalHandler();
  }

  /**
   * Run the CLI application
   * @param {string[]} args - Command line arguments
   */
  async run(args) {
    try {
      const parsed = this.argsParser.parse(args);
      const validation = this.argsParser.validate(parsed);

      // Configure logger based on parsed arguments
      this.logger.setLogLevel(parsed.logLevel || 'info');
      
      this.logger.debug('CLI started', { 
        args: args.join(' '), 
        command: parsed.command,
        logLevel: this.logger.logLevel
      });

      // Handle help and version first
      if (parsed.help) {
        console.log(this.argsParser.getHelpText());
        process.exit(0);
      }

      if (parsed.version) {
        console.log(this.argsParser.getVersionText());
        process.exit(0);
      }

      // Log validation warnings
      if (validation.warnings && validation.warnings.length > 0) {
        for (const warning of validation.warnings) {
          this.logger.warn(warning);
        }
      }

      // Check for validation errors
      if (!validation.isValid) {
        this.logger.error('Argument validation failed', { 
          errorCount: validation.errors.length 
        });
        console.error('Error: Invalid arguments');
        validation.errors.forEach(error => {
          console.error(`  ${error}`);
          this.logger.debug('Validation error detail', { error });
        });
        process.exit(2);
      }

      // Configuration is now hardcoded - no external config loading needed
      this.logger.debug('Using hardcoded configuration', {
        workingDir: process.cwd()
      });

      // Execute command
      this.logger.info('Executing command', { 
        command: parsed.command,
        source: parsed.source,
        output: parsed.output
      });
      
      switch (parsed.command) {
        case 'build':
          await this.executeBuild(parsed);
          break;
        case 'serve':
          await this.executeServe(parsed);
          break;
        case 'watch':
          await this.executeWatch(parsed);
          break;
        case 'init':
          await this.executeInit(parsed);
          break;
        default:
          this.logger.error('Unknown command specified', { command: parsed.command });
          console.error(`Unknown command: ${parsed.command}`);
          process.exit(2);
      }
    } catch (error) {
      // Check if this is a mocked process.exit error from tests
      if (error.isExpectedExit) {
        // Re-throw the error so tests can handle it properly
        throw error;
      }
      
      this.logger.error('CLI execution failed', { 
        error: error.message,
        stack: error.stack
      });
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Execute init command
   * @param {Object} options - Parsed CLI options
   */
  async executeInit(options) {
    try {
      const initOptions = {
        template: options.template || 'default',
        targetDir: options.target || process.cwd()
      };

      const result = await this.initCommand.execute(initOptions);

      if (result.success) {
        process.exit(0);
      } else {
        console.error('Initialization failed');
        process.exit(1);
      }
    } catch (error) {
      // Check if this is a mocked process.exit error from tests
      if (error.isExpectedExit) {
        // Re-throw the error so tests can handle it properly
        throw error;
      }
      
      // Handle validation errors with proper exit codes
      if (error.exitCode === 2) {
        console.error(`Error: ${error.message}`);
        process.exit(2);
      } else {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    }
  }

  /**
   * Execute serve command
   * @param {Object} options - Parsed CLI options
   */
  async executeServe(options) {
    try {
      this.logger.debug('Serve options prepared', {
        source: options.source,
        output: options.output,
        port: options.port,
        host: options.host
      });

      // Prepare serve options
      const serveOptions = {
        source: options.source,
        output: options.output,
        port: options.port || 3000,
        host: options.host || 'localhost',
        clean: options.clean,
        verbose: options.verbose,
        logger: this.logger.child('SERVE')
      };

      // Execute serve command
      this.logger.info('Starting development server');
      const result = await this.serveCommand.execute(serveOptions);

      if (result.success) {
        this.logger.info('Development server started', {
          port: result.port,
          host: result.host,
          url: result.url
        });

        // The serve command runs until interrupted, so we don't exit here
        // Instead, we set up signal handlers to gracefully shutdown
        let isShuttingDown = false;
        const shutdownHandler = async (signal) => {
          if (isShuttingDown) return; // Prevent multiple shutdowns
          isShuttingDown = true;
          
          console.log(`\n🛑 Shutting down development server... (${signal})`);
          try {
            await this.serveCommand.stop();
          } catch (error) {
            // Log error but continue with graceful exit
            this.logger.warn('Error during server shutdown', { error: error.message });
          }
          process.exit(0);
        };

        this.signalHandler.registerHandlers({
          onSigint: () => shutdownHandler('SIGINT'),
          onSigterm: () => shutdownHandler('SIGTERM')
        });

      } else {
        console.error(`Serve failed: ${result.error}`);
        process.exit(1);
      }

    } catch (error) {
      // Check if this is a mocked process.exit error from tests
      if (error.isExpectedExit) {
        // Re-throw the error so tests can handle it properly
        throw error;
      }
      
      console.error(`Serve failed: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Execute watch command
   * @param {Object} options - Parsed CLI options
   */
  async executeWatch(options) {
    try {
      this.logger.debug('Watch options prepared', {
        source: options.source,
        output: options.output,
        verbose: options.verbose
      });

      // Prepare watch options
      const watchOptions = {
        source: options.source,
        output: options.output,
        verbose: options.verbose,
        debounceMs: 100,
        prettyUrls: options.prettyUrls,
        minify: options.minify,
        clean: options.clean,
        logger: this.logger.child('WATCH'),
        onBuild: (buildInfo) => {
          // Report build events to console
          if (buildInfo.type === 'initial') {
            console.log(`✅ Initial build completed!`);
            console.log(`📁 ${buildInfo.processedFiles} files processed in ${buildInfo.buildTime}ms`);
          } else if (buildInfo.type === 'incremental') {
            const changedCount = buildInfo.changedFiles ? buildInfo.changedFiles.length : 0;
            const rebuiltCount = buildInfo.rebuiltFiles || 0;
            console.log(`🔄 Files changed: ${changedCount}, rebuilt: ${rebuiltCount}`);
            if (buildInfo.changedFiles && buildInfo.changedFiles.length > 0) {
              console.log(`   Changed: ${buildInfo.changedFiles.map(f => f.split('/').pop()).join(', ')}`);
            }
          }
        },
        onError: (error) => {
          // Report errors to console
          if (error.type === 'RecoverableError' || error.name === 'RecoverableError') {
            console.warn(`⚠️  Warning: ${error.message} (${error.file})`);
          } else {
            console.error(`❌ Error: ${error.message}${error.file ? ` (${error.file})` : ''}`);
          }
        }
      };

      // Execute watch command
      this.logger.info('Starting file watcher');
      const result = await this.watchCommand.execute(watchOptions);

      if (result.success) {
        this.logger.info('File watcher started', {
          source: options.source,
          output: options.output
        });

        console.log(`👀 Watching ${options.source} for changes...`);
        console.log(`📁 Output directory: ${options.output}`);
        console.log('\nPress Ctrl+C to stop');

        // Set up signal handlers to gracefully shutdown
        let isWatchShuttingDown = false;
        const watchShutdownHandler = async (signal) => {
          if (isWatchShuttingDown) return; // Prevent multiple shutdowns
          isWatchShuttingDown = true;
          
          console.log(`\n🛑 Stopping file watcher... (${signal})`);
          try {
            await this.watchCommand.stop();
          } catch (error) {
            // Log error but continue with graceful exit
            this.logger.warn('Error during watch shutdown', { error: error.message });
          }
          process.exit(0);
        };

        this.signalHandler.registerHandlers({
          onSigint: () => watchShutdownHandler('SIGINT'),
          onSigterm: () => watchShutdownHandler('SIGTERM')
        });

      } else {
        console.error(`Watch failed: ${result.error}`);
        process.exit(1);
      }

    } catch (error) {
      // Check if this is a mocked process.exit error from tests
      if (error.isExpectedExit) {
        // Re-throw the error so tests can handle it properly
        throw error;
      }
      
      console.error(`Watch failed: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Execute build command with linting integration
   * @param {Object} options - Parsed CLI options
   */
  async executeBuild(options) {
    try {
      // Initialize linter with hardcoded configuration
      const linter = new DOMCascadeLinter();
      
      this.logger.debug('Build options prepared', {
        source: options.source,
        output: options.output,
        dryRun: options.dryRun,
        verbose: options.verbose
      });
      
      // Prepare build options
      const buildOptions = {
        source: options.source,
        output: options.output,
        clean: options.clean,
        verbose: options.verbose,
        dryRun: options.dryRun,
        copy: options.copy,
        ignore: options.ignore,
        ignoreRender: options.ignoreRender,
        ignoreCopy: options.ignoreCopy,
        render: options.render,
        autoIgnore: options.autoIgnore,
        defaultLayout: options.defaultLayout,
        prettyUrls: options.prettyUrls,
        minify: options.minify,
        failOn: options.failOn,
        logger: this.logger.child('BUILD')
      };

      // Execute build
      this.logger.info('Starting build process');
      const result = await this.buildCommand.execute(buildOptions);
      
      this.logger.info('Build process completed', {
        success: result.success,
        fileCount: result.filesProcessed,
        duration: result.buildTime
      });

      // Check if build itself failed
      if (!result.success) {
        this.logger.error('Build failed', { reason: 'Build command returned success: false' });
        console.error('Build failed: Build process was unsuccessful');
        process.exit(1);
      }

      // Run linting on processed files
      this.logger.debug('Running linting analysis');
      await this.runLinting(linter, options, result);

      // Check for build failure conditions including linter
      const shouldFail = this.checkBuildFailure(options, result);
      
      if (shouldFail) {
        this.logger.error('Build failed', { reason: shouldFail });
        console.error(`Build failed: ${shouldFail}`);
        process.exit(1);
      }
      
      this.logger.info('Build succeeded');

      // Show success message
      const fileMsg = result.processedFiles === 1 ? 'file' : 'files';
      console.log(`✅ Build completed successfully!`);
      console.log(`📁 ${result.processedFiles} ${fileMsg} processed in ${result.buildTime}ms`);
      
      if (result.assetsCopied > 0) {
        const assetMsg = result.assetsCopied === 1 ? 'asset' : 'assets';
        console.log(`📦 ${result.assetsCopied} ${assetMsg} copied`);
      }

      if (result.dryRunOutput) {
        console.log('\n' + result.dryRunOutput);
      }

      process.exit(0);

    } catch (error) {
      // Check if this is a mocked process.exit error from tests
      if (error.isExpectedExit) {
        // Re-throw the error so tests can handle it properly
        throw error;
      }
      
      console.error(`Build failed: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Run linting on source files
   * @param {DOMCascadeLinter} linter - Configured linter instance
   * @param {Object} options - CLI options
   * @param {Object} buildResult - Build result
   */
  async runLinting(linter, options, buildResult) {
    try {
      // Get source files that need linting (layouts and components)
      const filesToLint = await this.getFilesToLint(options.source);
      
      const allViolations = [];

      // Lint each file
      for (const filePath of filesToLint) {
        try {
          const content = await Bun.file(filePath).text();
          const result = await linter.lintHTML(content, filePath);
          
          if (result.violations.length > 0) {
            allViolations.push(...result.violations);
            
            // Output violations to console
            for (const violation of result.violations) {
              const prefix = this.getLintPrefix(violation.rule, violation.severity);
              console.log(`${prefix} ${violation.message} (${filePath}:${violation.line})`);
            }
          }
        } catch (error) {
          console.warn(`Warning: Could not lint file ${filePath}: ${error.message}`);
        }
      }

      // Store violations for failure checking
      buildResult.linterViolations = allViolations;

    } catch (error) {
      console.warn(`Warning: Linting failed: ${error.message}`);
    }
  }

  /**
   * Get files that should be linted (layouts and components)
   * @param {string} sourceDir - Source directory
   * @returns {Promise<string[]>} Array of file paths to lint
   */
  async getFilesToLint(sourceDir) {
    const files = [];
    
    try {
      const { readdirSync, statSync } = await import('fs');
      const { join } = await import('path');
      
      const scanDirectory = (dirPath) => {
        const entries = readdirSync(dirPath);
        
        for (const entry of entries) {
          const fullPath = join(dirPath, entry);
          const stat = statSync(fullPath);
          
          if (stat.isDirectory()) {
            scanDirectory(fullPath);
          } else if (stat.isFile()) {
            // Lint layouts and components (files starting with _)
            if (entry.startsWith('_') && (entry.endsWith('.html') || entry.endsWith('.htm'))) {
              files.push(fullPath);
            }
          }
        }
      };
      
      scanDirectory(sourceDir);
    } catch (error) {
      console.warn(`Warning: Could not scan directory for linting: ${error.message}`);
    }
    
    return files;
  }

  /**
   * Get linter message prefix
   * @param {string} rule - Rule code (e.g., 'U001')
   * @param {string} severity - Severity level
   * @returns {string} Formatted prefix
   */
  getLintPrefix(rule, severity) {
    const icon = severity === 'error' ? '❌' : severity === 'warn' ? '⚠️' : 'ℹ️';
    return `${icon} [LINT:${rule}]`;
  }

  /**
   * Check if build should fail based on linter results
   * @param {Object} options - CLI options
   * @param {Object} buildResult - Build result with linter violations
   * @returns {string|null} Failure reason or null
   */
  checkBuildFailure(options, buildResult) {
    const failOnTypes = options.failOn || [];
    const violations = buildResult.linterViolations || [];

    if (failOnTypes.length === 0 || violations.length === 0) {
      return null;
    }

    // Check for specific rule failures
    for (const failType of failOnTypes) {
      if (failType.match(/^U\d{3}$/)) {
        const ruleViolations = violations.filter(v => v.rule === failType);
        if (ruleViolations.length > 0) {
          return `Linter rule ${failType} violations found`;
        }
      }
    }

    // Check for severity level failures
    if (failOnTypes.includes('error')) {
      const errorViolations = violations.filter(v => v.severity === 'error');
      if (errorViolations.length > 0) {
        return `${errorViolations.length} linter error(s) found`;
      }
    }

    if (failOnTypes.includes('warning')) {
      const warningViolations = violations.filter(v => v.severity === 'warn');
      if (warningViolations.length > 0) {
        return `${warningViolations.length} linter warning(s) found`;
      }
    }

    return null;
  }

  /**
   * Cleanup method for testing - removes signal handlers
   */
  cleanup() {
    // Signal handlers are automatically cleaned up when process exits
    // This method is primarily for testing scenarios where we need explicit cleanup
    if (this.signalHandler && this.signalHandler.removeHandlers) {
      // We can't easily remove all handlers, but this structure allows for testing
      this.logger.debug('CLI cleanup initiated');
    }
  }
}

// Run CLI if this file is executed directly
if (import.meta.main) {
  const cli = new UnifyCLI();
  await cli.run(process.argv.slice(2));
}