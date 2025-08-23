#!/usr/bin/env bun

/**
 * Unify CLI Entry Point
 * Main command-line interface for the Unify static site generator
 */

import { ArgsParser } from './cli/args-parser.js';
import { BuildCommand } from './cli/commands/build-command.js';
import { InitCommand } from './cli/commands/init-command.js';
import { ConfigLoader } from './config/config-loader.js';
import { DOMCascadeLinter } from './core/dom-cascade-linter.js';
import { Logger } from './utils/logger.js';

/**
 * Main CLI application
 */
export class UnifyCLI {
  constructor() {
    this.argsParser = new ArgsParser();
    this.buildCommand = new BuildCommand();
    this.initCommand = new InitCommand();
    this.configLoader = new ConfigLoader();
    this.logger = new Logger({ component: 'CLI' });
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

      // Load configuration
      this.logger.debug('Loading configuration', { 
        configFile: parsed.config || 'auto-discovery',
        workingDir: process.cwd()
      });
      
      let config = null;
      if (parsed.config) {
        config = await this.configLoader.loadConfigurationFromFile(parsed.config);
      } else {
        config = await this.configLoader.loadConfiguration(process.cwd());
      }
      
      this.logger.debug('Configuration loaded', { 
        hasConfig: !!config,
        configKeys: config ? Object.keys(config) : []
      });

      // Execute command
      this.logger.info('Executing command', { 
        command: parsed.command,
        source: parsed.source,
        output: parsed.output
      });
      
      switch (parsed.command) {
        case 'build':
          await this.executeBuild(parsed, config);
          break;
        case 'serve':
          this.logger.error('Command not yet implemented', { command: 'serve' });
          console.log('Serve command not yet implemented');
          process.exit(1);
          break;
        case 'watch':
          this.logger.error('Command not yet implemented', { command: 'watch' });
          console.log('Watch command not yet implemented');
          process.exit(1);
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
   * Execute build command with linting integration
   * @param {Object} options - Parsed CLI options
   * @param {Object} config - Loaded configuration
   */
  async executeBuild(options, config) {
    try {
      // Initialize linter with configuration
      const linter = new DOMCascadeLinter(config);
      
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
        config: config,
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
}

// Run CLI if this file is executed directly
if (import.meta.main) {
  const cli = new UnifyCLI();
  await cli.run(process.argv.slice(2));
}