#!/usr/bin/env bun

import { parseArgs } from './cli/args-parser.js';
import { build } from './core/file-processor.js';
import { watch } from './core/file-watcher.js';
import { DevServer } from './server/dev-server.js';
import { init } from './cli/init.js';
import { clearCacheOnRestart } from './core/build-cache.js';
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

    // Set logging level based on logLevel or verbose flag (backwards compatibility)
    if (args.logLevel) {
      logger.setLevel(args.logLevel.toUpperCase());
    } else if (args.verbose) {
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
        // Clear cache for fresh start
        await clearCacheOnRestart(args.cacheDir || '.unify-cache');
        await watch(args);
        break;
      case 'serve':
        logger.info('Starting development server with live reload...');
        // Clear cache for fresh start  
        await clearCacheOnRestart(args.cacheDir || '.unify-cache');
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
    if (process.env.DEBUG || (!error.suggestions && !error.formatForCLI)) {
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

Directory Options:
  --source, -s <directory>        Source directory (default: src)
  --output, -o <directory>        Output directory (default: dist)
  --copy <glob>                   Add paths to copy set (repeatable)
  --ignore <glob>                 Ignore paths for rendering and copying (repeatable)
  --ignore-render <glob>          Ignore paths only for rendering (repeatable)
  --ignore-copy <glob>            Ignore paths only for copying (repeatable)
  --render <glob>                 Force render even if ignored (repeatable)
  --default-layout <value>        Set default layouts (repeatable, supports glob=layout)
  --dry-run                       Show file classification without building
  --auto-ignore <boolean>         Auto-ignore layout/include files (default: true)

Build Options:
  --pretty-urls                   Generate pretty URLs (about.html → about/index.html)
  --clean                         Clean output directory before build
  --fail-level <level>            Fail build on specified level: warning, error
  --minify                        Enable HTML minification for production builds

Server Options:
  --port, -p <number>             Server port (default: 3000)
  --host <hostname>               Server host (default: localhost)

Global Options:
  --help, -h                      Display help information
  --version, -v                   Display version number
  --log-level <level>             Set logging level: error, warn, info, debug
  --verbose                       Enable debug level messages (deprecated, use --log-level=debug)

Examples:
  unify                           # Build with defaults (src → dist)
  unify build --pretty-urls       # Build with pretty URLs
  unify serve --port 8080         # Serve on port 8080
  unify --dry-run                 # See what would be built

File Classification:
  unify --copy "docs/**" --ignore "**/drafts/**"
  unify --default-layout "_base.html" --default-layout "blog/**=_post.html"
  unify --render "experiments/**" --ignore-copy "assets/raw/**"

Asset Management:
  unify --copy "config/*.json" --ignore-copy "**/*.psd"
  unify --auto-ignore=false --ignore="_*" --ignore=".*"

Production:
  unify --minify --fail-level=warning --clean

Notes:
  • assets/** is copied by default unless excluded
  • Files/folders starting with _ are ignored by default
  • Use --dry-run to see file classification decisions
  • Glob patterns follow ripgrep/gitignore style
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