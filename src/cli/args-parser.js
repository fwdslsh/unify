import { UnifyError } from "../utils/errors.js";

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a First string
 * @param {string} b Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Find the closest command suggestion for a typo
 * @param {string} input The user's input
 * @param {string[]} commands Available commands
 * @returns {string|null} Closest command or null if no good match
 */
function findClosestCommand(input, commands) {
  const maxDistance = 2; // Only suggest if edit distance is 2 or less
  let bestMatch = null;
  let bestDistance = Infinity;

  for (const command of commands) {
    const distance = levenshteinDistance(input.toLowerCase(), command.toLowerCase());
    if (distance < bestDistance && distance <= maxDistance) {
      bestDistance = distance;
      bestMatch = command;
    }
  }

  return bestMatch;
}

/**
 * Command-line argument parser for unify
 * Handles parsing of CLI arguments and options
 */

export function parseArgs(argv) {
  const args = {
    command: null,
    source: "src",
    output: "dist",
    port: 3000,
    host: "localhost",
    prettyUrls: false,
    baseUrl: "https://example.com",
    clean: false,
    sitemap: true,
    failOn: null, // Can be 'warning', 'error', or null (default: null = only fail on fatal errors)
    minify: false,
    verbose: false,
    help: false,
    version: false,
    copy: null,
    layouts: null,
  };

  // Only the first non-option argument is considered a command
  let commandFound = false;
  let i = 0;
  const validCommands = ['build', 'watch', 'serve'];
  while (i < argv.length) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    // Help/version flags should always be recognized
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      i++;
      continue;
    }
    if (arg === '--version' || arg === '-v') {
      args.version = true;
      i++;
      continue;
    }

    // If not a flag/option, and command not yet found, treat as command or error
    if (!arg.startsWith('-') && !commandFound) {
      if (validCommands.includes(arg)) {
        args.command = arg;
        commandFound = true;
        i++;
        continue;
      } else {
        // If help/version is set, don't throw error
        if (args.help || args.version) {
          i++;
          continue;
        }
        const suggestion = findClosestCommand(arg, validCommands);
        const suggestions = [];
        if (suggestion) {
          suggestions.push(`Did you mean "${suggestion}"?`);
        }
        suggestions.push(
          'Use --help to see valid options',
          'Check for typos in the command name',
          'Check the documentation for supported commands'
        );
        throw new UnifyError(
          `Unknown command: ${arg}`,
          null,
          null,
          suggestions
        );
      }
    }
    // If not a flag/option, and command already found, treat as unknown option
    if (!arg.startsWith('-') && commandFound) {
      throw new UnifyError(
        `Unknown option: ${arg}`,
        null,
        null,
        [
          'Use --help to see valid options',
          'Check for typos in the argument'
        ]
      );
    }

    // Options with values
    if ((arg === '--source' || arg === '-s') && nextArg && !nextArg.startsWith('-')) {
      args.source = nextArg;
      i += 2;
      continue;
    }
    if ((arg === '--output' || arg === '-o') && nextArg && !nextArg.startsWith('-')) {
      args.output = nextArg;
      i += 2;
      continue;
    }
    if ((arg === '--layouts' || arg === '-l' || arg === '--templates') && nextArg && !nextArg.startsWith('-')) {
      args.layouts = nextArg;
      i += 2;
      continue;
    }
    if ((arg === '--copy') && nextArg && !nextArg.startsWith('-')) {
      args.copy = nextArg;
      i += 2;
      continue;
    }
    // Handle --copy without value
    if (arg === '--copy') {
      const error = new UnifyError(
        'The --copy option requires a glob pattern value',
        null,
        null,
        [
          'Provide a glob pattern like: --copy "./assets/**/*.*"',
          'Use quotes around patterns with special characters',
          'Check the documentation for glob pattern examples'
        ]
      );
      error.errorType = 'UsageError';
      throw error;
    }
    if ((arg === '--port' || arg === '-p') && nextArg && !nextArg.startsWith('-')) {
      args.port = parseInt(nextArg, 10);
      if (isNaN(args.port) || args.port < 1 || args.port > 65535) {
        throw new UnifyError(
          'Port must be a number between 1 and 65535',
          null,
          null,
          [
            'Use a port number like 3000, 8080, or 8000',
            'Check that the port is not already in use',
            'Valid port range is 1-65535'
          ]
        );
      }
      i += 2;
      continue;
    }
    if (arg === '--host' && nextArg && !nextArg.startsWith('-')) {
      args.host = nextArg;
      i += 2;
      continue;
    }
    if (arg === '--pretty-urls' || arg === '-u') {
      args.prettyUrls = true;
      i++;
      continue;
    }
    if (arg === '--base-url' && nextArg && !nextArg.startsWith('-')) {
      args.baseUrl = nextArg;
      i += 2;
      continue;
    }
    if (arg === '--clean') {
      args.clean = true;
      i++;
      continue;
    }
    if (arg === '--no-sitemap') {
      args.sitemap = false;
      i++;
      continue;
    }
    if (arg === '--fail-on' && nextArg && !nextArg.startsWith('-')) {
      const validLevels = ['warning', 'error'];
      if (validLevels.includes(nextArg)) {
        args.failOn = nextArg;
        i += 2;
        continue;
      } else {
        const error = new UnifyError(
          `Invalid --fail-on level: ${nextArg}`,
          null,
          null,
          [
            'Valid levels are: warning, error',
            'Use --fail-on warning to fail on any warning or error',
            'Use --fail-on error to fail only on errors (default behavior)',
            'Omit --fail-on to only fail on fatal build errors'
          ]
        );
        error.errorType = 'UsageError';
        throw error;
      }
    }
    if (arg === '--fail-on') {
      const error = new UnifyError(
        'The --fail-on option requires a level value',
        null,
        null,
        [
          'Valid levels are: warning, error',
          'Use --fail-on warning to fail on any warning or error',
          'Use --fail-on error to fail only on errors',
          'Omit --fail-on to only fail on fatal build errors'
        ]
      );
      error.errorType = 'UsageError';
      throw error;
    }
    // Backward compatibility: --perfection maps to --fail-on error
    if (arg === '--perfection' || arg === '-f') {
      args.failOn = 'error';
      logger.warn('--perfection is deprecated, use --fail-on error instead');
      i++;
      continue;
    }
    if (arg === '--minify' || arg === '-m') {
      args.minify = true;
      i++;
      continue;
    }
    if (arg === '--verbose' || arg === '-V') {
      args.verbose = true;
      i++;
      continue;
    }

    // Unknown arguments
    if (arg.startsWith('-')) {
      const validOptions = [
        '--help', '-h', '--version', '-v', '--source', '-s', '--output', '-o',
        '--copy', '--port', '-p', '--host', '--layouts', '-l', '--templates',
        '--pretty-urls', '--base-url', '--clean', '--no-sitemap', 
        '--fail-on', '--perfection', '--minify', '--verbose', '-u', '-f', '-m', '-V'
      ];
      const suggestion = findClosestCommand(arg, validOptions);
      const suggestions = [];
      if (suggestion) {
        suggestions.push(`Did you mean "${suggestion}"?`);
      }
      suggestions.push(
        'Use --help to see valid options',
        'Check for typos in the option name',
        'Check the documentation for supported flags'
      );
      throw new UnifyError(
        `Unknown option: ${arg}`,
        null,
        null,
        suggestions
      );
    } else {
      // Non-option argument that's not a command
      throw new UnifyError(
        `Unknown option: ${arg}`,
        null,
        null,
        [
          'Use --help to see valid options',
          'Check for typos in the argument'
        ]
      );
    }
  }

  if (!args.command && !args.help && !args.version) {
    // Default to build if no command found and not help/version
    args.command = 'build';
  }
  return args;
}