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
    layouts: ".layouts",
    components: ".components",
    port: 3000,
    host: "localhost",
    prettyUrls: false,
    baseUrl: "https://example.com",
    clean: false,
    sitemap: true,
    perfection: false,
    minify: false,
    verbose: false,
    help: false,
    version: false,
  };
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextArg = argv[i + 1];
    
    // Commands (only at the beginning, before any options)
    if (arg === 'build' || arg === 'watch' || arg === 'serve') {
      if (i === 0) {
        args.command = arg;
        continue;
      } else {
        // Command found after options, treat as unknown option
        throw new UnifyError(
          `Unknown option: ${arg}`,
          null,
          null,
          [
            'Commands must be the first argument',
            'Use --help to see valid options',
            'Check for typos in the option name'
          ]
        );
      }
    }
    
    // Check for unknown commands (first non-option argument)
    if (!arg.startsWith('-') && !args.command && i === 0) {
      if (arg !== 'build' && arg !== 'watch' && arg !== 'serve') {
        const validCommands = ['build', 'watch', 'serve'];
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
      args.command = arg;
      continue;
    }
    
    // Flags
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    
    if (arg === '--version' || arg === '-v') {
      args.version = true;
      continue;
    }
    
    // Options with values
    if ((arg === '--source' || arg === '-s') && nextArg) {
      args.source = nextArg;
      i++;
      continue;
    }
    
    if ((arg === '--output' || arg === '-o') && nextArg) {
      args.output = nextArg;
      i++;
      continue;
    }
    
    if ((arg === '--layouts' || arg === '-l') && nextArg) {
      args.layouts = nextArg;
      i++;
      continue;
    }
    
    if ((arg === '--components' || arg === '-c') && nextArg) {
      args.components = nextArg;
      i++;
      continue;
    }
    
    
    if ((arg === '--port' || arg === '-p') && nextArg) {
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
      i++;
      continue;
    }
    
    if (arg === '--host' && nextArg) {
      args.host = nextArg;
      i++;
      continue;
    }
    
    if (arg === '--pretty-urls') {
      args.prettyUrls = true;
      continue;
    }
    
    if (arg === '--base-url' && nextArg) {
      args.baseUrl = nextArg;
      i++;
      continue;
    }
    
    if (arg === '--clean') {
      args.clean = true;
      continue;
    }
    
    if (arg === '--no-sitemap') {
      args.sitemap = false;
      continue;
    }
    
    if (arg === '--perfection') {
      args.perfection = true;
      continue;
    }
    
    if (arg === '--minify') {
      args.minify = true;
      continue;
    }
    
    if (arg === '--verbose') {
      args.verbose = true;
      continue;
    }
    
    // Unknown arguments
    if (arg.startsWith('-')) {
      const validOptions = [
        '--help', '-h', '--version', '-v', '--source', '-s', '--output', '-o',
        '--layouts', '-l', '--components', '-c', '--port', '-p', '--host',
        '--pretty-urls', '--base-url', '--clean', '--no-sitemap', 
        '--perfection', '--minify', '--verbose'
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
      
      // Use UnifyError for consistent CLI exit code
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
          'Commands must be the first argument',
          'Use --help to see valid options',
          'Check for typos in the argument'
        ]
      );
    }
  }
  
  return args;
}