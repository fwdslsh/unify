#!/usr/bin/env bun

import { parseArgs } from './cli/args-parser.js';
import { build } from './core/file-processor.js';
import { watch } from './core/file-watcher.js';
import { DevServer } from './server/dev-server.js';
import { init } from './cli/init.js';
import { logger } from './utils/logger.js';
import pkg from "../package.json";

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    
    // Always show version/help output if requested, regardless of command
    if (args.version) {
      process.stdout.write(`unify v${pkg.version}\n`);
      await flushAndExit(0);
    }
    if (args.help) {
      showHelp();
      await flushAndExit(0);
    }

    // Set logging level based on verbose flag
    if (args.verbose) {
      logger.setLevel('DEBUG');
    }

    // Default to build command if none specified and not help/version
    if (!args.command && !args.help && !args.version) {
      args.command = 'build';
      logger.info('No command specified, defaulting to build');
    }

    // Only allow valid commands
    const validCommands = ['build', 'watch', 'serve', 'init'];
    if (!validCommands.includes(args.command)) {
  showHelp();
  process.stderr.write(`\nUnknown command: ${args.command}\n`);
  await flushAndExit(2);
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
        await server.start({
          port: args.port,
          hostname: args.host,
          outputDir: args.output,
          fallback: 'index.html',
          cors: true,
          liveReload: true,
          verbose: args.verbose
        });
        const watchConfig = {
          ...args,
          onReload: (eventType, filePath) => {
            server.broadcastReload();
          }
        };
        await watch(watchConfig);
        break;
      case 'init':
        logger.info('Initializing new Unify project...');
        await init(args);
        logger.info('Project initialized successfully!');
        break;
    }
  } catch (error) {
    // Enhanced error formatting
    let errorOutput = '';
    if (error.formatForCLI) {
      errorOutput = '\n' + error.formatForCLI();
    } else {
      errorOutput = 'Error: ' + error.message;
    }
    // Show stack trace in debug mode or for unexpected errors
    if (Bun.env.DEBUG || (!error.suggestions && !error.formatForCLI)) {
      errorOutput += '\n🔍 Stack trace:\n' + error.stack;
    }
    // Always flush error output to stderr before exiting
    try {
      process.stderr.write(errorOutput + '\n');
    } catch {}
    // Exit with code 2 for usage/argument errors (UnifyError with suggestions), 1 for build errors
    if (error) {
      const { BuildError, UnifyError } = await import('./utils/errors.js');
      // Prioritize usage/argument errors for exit code 2
      if (error.errorType === 'UsageError') {
        await flushAndExit(2);
      } else if (error instanceof BuildError) {
        await flushAndExit(1);
      } else if (error instanceof UnifyError && error.suggestions && Array.isArray(error.suggestions)) {
        await flushAndExit(2);
      } else {
        await flushAndExit(1);
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
  init      Initialize new project with starter template

Options:
  --source, -s      Source directory (default: src)
  --output, -o      Output directory (default: dist)
  --copy            Additional files glob pattern to copy recursively
  --port, -p        Server port (default: 3000)
  --host            Server host (default: localhost)
  --pretty-urls     Generate pretty URLs (about.md → about/index.html)
  --base-url        Base URL for sitemap.xml (default: https://example.com)
  --clean           Clean output directory before build
  --no-sitemap      Disable sitemap.xml generation
  --fail-on         Fail build on specified level: warning, error
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
  unify build --copy "./assets/**/*.*"    # Copy additional files
  unify serve --port 8080
  unify init                              # Initialize with default starter
  unify init basic                        # Initialize with basic starter template

Notes:
  • src/assets is automatically copied to dist/assets (if exists)
  • Files/folders starting with _ are not copied to output (use for layouts/partials)
`);
}

// Ensures output is flushed before exiting (especially on Windows)
async function flushAndExit(code) {
  try {
    process.stdout.write("");
    process.stderr.write("");
    await new Promise(resolve => setTimeout(resolve, 15));
  } catch {}
  process.exit(code);
}

main();