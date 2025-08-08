#!/usr/bin/env bun

import { parseArgs } from '../src/cli/args-parser.js';
import { build } from '../src/core/file-processor.js';
import { watch } from '../src/core/file-watcher.js';
import { DevServer } from '../src/server/dev-server.js';
import { logger } from '../src/utils/logger.js';
import pkg from "../package.json";

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    
    // Handle version and help flags
    if (args.version) {
      console.log(`unify v${pkg.version}`);
      process.exit(0);
    }
    
    if (args.help) {
      showHelp();
      process.exit(0);
    }
    
    // Set logging level based on verbose flag
    if (args.verbose) {
      logger.setLevel('DEBUG');
    }
    
    // Default to build command if none specified
    if (!args.command) {
      args.command = 'build';
      logger.info('No command specified, defaulting to build');
    }
    
    // Execute commands
    switch (args.command) {
      case 'build':
        logger.info('Building static site...');
        await build(args);
        logger.info('Build completed successfully!');
        break;
        
      case 'watch':
        logger.info('Starting file watcher...');
        await watch(args);
        break;
        
      case 'serve':
        logger.info('Starting development server with live reload...');
        const server = new DevServer();
        
        // Start server with proper config mapping
        await server.start({
          port: args.port,
          hostname: args.host,
          outputDir: args.output,
          fallback: 'index.html',
          cors: true,
          liveReload: true,
          verbose: args.verbose
        });
        
        // Start file watcher with live reload callback
        const watchConfig = {
          ...args,
          onReload: (eventType, filePath) => {
            server.broadcastReload();
          }
        };
        
        await watch(watchConfig);
        break;
        
      default:
        throw new (await import('../src/utils/errors.js')).UnifyError(
          `Unknown command: ${args.command}`,
          null,
          null,
          [
            'Use --help to see valid commands',
            'Check for typos in the command name',
            'Refer to the documentation for supported commands'
          ]
        );
    }
  } catch (error) {
    // Enhanced error formatting
    if (error.formatForCLI) {
      console.error('\n' + error.formatForCLI());
    } else {
      logger.error('Error:', error.message);
    }

    // Show stack trace in debug mode or for unexpected errors
    if (Bun.env.DEBUG || (!error.suggestions && !error.formatForCLI)) {
      console.error('\n🔍 Stack trace:');
      console.error(error.stack);
    }

    // Exit with code 2 for usage/argument errors, 1 for build errors (Unix standard)
    if (error) {
      const { BuildError } = await import('../src/utils/errors.js');
      
      // Build errors always get exit code 1, regardless of suggestions
      if (error instanceof BuildError) {
        process.exit(1);
      }
      // Other errors with suggestions get exit code 2 (user/argument errors)
      else if (error.suggestions && Array.isArray(error.suggestions)) {
        process.exit(2);
      }
      // Unexpected errors without suggestions get exit code 1
      else {
        process.exit(1);
      }
    }
  }
}

function showHelp() {
  console.log(`
unify v${pkg.version}

Usage: unify [command] [options]

Commands:
  build     Build static site from source files (default)
  watch     Watch files and rebuild on changes
  serve     Start development server with live reload

Options:
  --source, -s      Source directory (default: src)
  --output, -o      Output directory (default: dist)
  --layouts, -l     Layouts directory (default: .layouts, relative to source)
  --components, -c  Components directory (default: .components, relative to source)
  --assets, -a      Additional assets glob pattern to copy recursively
  --port, -p        Server port (default: 3000)
  --host            Server host (default: localhost)
  --pretty-urls     Generate pretty URLs (about.md → about/index.html)
  --base-url        Base URL for sitemap.xml (default: https://example.com)
  --clean           Clean output directory before build
  --no-sitemap      Disable sitemap.xml generation
  --perfection      Fail entire build if any single page fails to build
  --minify          Enable HTML minification for production builds
  --verbose         Enable debug level messages in console output
  --help, -h        Show this help message
  --version, -v     Show version number

Examples:
  unify                                   # Build with defaults (src → dist)
  unify build                             # Explicit build command
  unify serve                             # Serve with live reload on port 3000
  unify build --pretty-urls
  unify build --base-url https://mysite.com
  unify build --assets "./assets/**/*.*"  # Copy additional assets
  unify serve --port 8080
`);
}

main();