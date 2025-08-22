/**
 * CLI Arguments Parser
 * Parses command line arguments for Unify CLI
 */

import { ValidationError } from "../core/errors.js";

/**
 * ArgsParser handles CLI argument parsing and validation
 */
export class ArgsParser {
  constructor() {
    this.commands = new Set(['build', 'serve', 'watch', 'init']);
    this.options = {
      // Basic options
      source: { short: 's', hasValue: true, default: '.' },
      output: { short: 'o', hasValue: true, default: 'dist' },
      clean: { short: 'c', hasValue: false, default: false },
      verbose: { short: 'v', hasValue: false, default: false },
      help: { short: 'h', hasValue: false, default: false },
      version: { short: 'V', hasValue: false, default: false },
      config: { short: null, hasValue: true, default: null },
      
      // Glob pattern options
      copy: { short: null, hasValue: true, default: [], isArray: true },
      ignore: { short: null, hasValue: true, default: [], isArray: true },
      ignoreRender: { short: null, hasValue: true, default: [], isArray: true, longName: 'ignore-render' },
      ignoreCopy: { short: null, hasValue: true, default: [], isArray: true, longName: 'ignore-copy' },
      render: { short: null, hasValue: true, default: [], isArray: true },
      autoIgnore: { short: null, hasValue: true, default: true, longName: 'auto-ignore' },
      defaultLayout: { short: null, hasValue: true, default: [], isArray: true, longName: 'default-layout' },
      dryRun: { short: null, hasValue: false, default: false, longName: 'dry-run' },
      prettyUrls: { short: null, hasValue: false, default: false, longName: 'pretty-urls' },
      minify: { short: null, hasValue: false, default: false },
      
      // Build failure options
      failOn: { short: null, hasValue: true, default: [], isArray: true, longName: 'fail-on' },
      
      // Logging options
      logLevel: { short: null, hasValue: true, default: 'info', longName: 'log-level' },
      
      // Init command options
      template: { short: 't', hasValue: true, default: 'default' },
      target: { short: null, hasValue: true, default: null }
    };
  }

  /**
   * Parse command line arguments
   * @param {string[]} args - Command line arguments
   * @returns {ParseResult} Parsed arguments and options
   */
  parse(args) {
    const result = {
      command: 'build', // Default command
      options: {},
      errors: [],
      warnings: []
    };

    try {
      // Set default values
      for (const [name, config] of Object.entries(this.options)) {
        result[name] = Array.isArray(config.default) ? [...config.default] : config.default;
      }

      // Handle environment variable overrides
      this._applyEnvironmentVariables(result);

      if (args.length === 0) {
        return result; // Use all defaults
      }

      let i = 0;

      // Parse command (first argument if it's a known command)
      if (i < args.length && this.commands.has(args[i])) {
        result.command = args[i];
        i++;
      }

      // Parse options
      while (i < args.length) {
        const arg = args[i];

        if (arg.startsWith('--')) {
          // Long option
          const optionName = arg.substring(2);
          i += this._parseLongOption(args, i, optionName, result);
        } else if (arg.startsWith('-')) {
          // Short option
          const shortOption = arg.substring(1);
          i += this._parseShortOption(args, i, shortOption, result);
        } else {
          // Positional argument (treat as source if no source set)
          if (result.source === '.') {
            result.source = arg;
          } else {
            result.warnings.push(`Ignoring unexpected argument: ${arg}`);
          }
          i++;
        }
      }

    } catch (error) {
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Parse long option (--option)
   * @private
   */
  _parseLongOption(args, index, optionName, result) {
    // Handle equals syntax (--option=value)
    let value = null;
    if (optionName.includes('=')) {
      const parts = optionName.split('=', 2);
      optionName = parts[0];
      value = parts[1];
    }
    
    // Handle hyphenated option names
    let option = this.options[optionName];
    let optionKey = optionName;
    
    // Check if it's a hyphenated option
    if (!option) {
      for (const [name, config] of Object.entries(this.options)) {
        if (config.longName === optionName) {
          option = config;
          optionKey = name;
          break;
        }
      }
    }
    
    if (!option) {
      result.errors.push(`Unknown option: --${optionName}`);
      return 1;
    }

    if (option.hasValue) {
      // Use value from equals syntax if available, otherwise get from next argument
      if (value === null) {
        if (index + 1 >= args.length) {
          result.errors.push(`Option --${optionName} requires a value`);
          return 1;
        }
        value = args[index + 1];
      }
      
      // Handle special validation for auto-ignore
      if (optionKey === 'autoIgnore') {
        if (value !== 'true' && value !== 'false') {
          result.errors.push(`Option --${optionName} must be true or false`);
          return 2;
        }
        result[optionKey] = value === 'true';
      } else if (optionKey === 'logLevel') {
        // Validate log level
        const validationError = this._validateLogLevel(value);
        if (validationError) {
          result.errors.push(validationError);
          return 2;
        }
        const normalized = this._normalizeLogLevel(value);
        result[optionKey] = normalized || 'info';
      } else if (option.isArray) {
        // Validate glob patterns
        if (this._isGlobOption(optionKey)) {
          const validationError = this._validateGlobPattern(value);
          if (validationError) {
            result.errors.push(validationError);
            return 2;
          }
          
          // Check for performance warnings
          const performanceWarning = this._checkPatternPerformance(value);
          if (performanceWarning) {
            result.warnings.push(performanceWarning);
          }
        }

        // Validate default layout patterns
        if (optionKey === 'defaultLayout') {
          const validationError = this._validateDefaultLayoutPattern(value);
          if (validationError) {
            result.errors.push(validationError);
            return 2;
          }
          
          // Check for performance warnings in default layout patterns
          const performanceWarning = this._checkDefaultLayoutPatternPerformance(value);
          if (performanceWarning) {
            result.warnings.push(performanceWarning);
          }
        }

        // Validate fail-on option values
        if (optionKey === 'failOn') {
          const validationError = this._validateFailOnValue(value);
          if (validationError) {
            result.errors.push(validationError);
            return 2;
          }
        }
        
        result[optionKey].push(value);
      } else {
        result[optionKey] = value;
      }
      
      // Return 1 if we used equals syntax (only consumed current arg), 2 if we consumed next arg too
      return value === args[index + 1] ? 2 : 1;
    } else {
      result[optionKey] = true;
      return 1; // Consumed option only
    }
  }

  /**
   * Parse short option (-o)
   * @private
   */
  _parseShortOption(args, index, shortOption, result) {
    // Find option by short name
    const optionName = Object.keys(this.options).find(name =>
      this.options[name].short === shortOption
    );

    if (!optionName) {
      result.errors.push(`Unknown option: -${shortOption}`);
      return 1;
    }

    const option = this.options[optionName];

    if (option.hasValue) {
      if (index + 1 >= args.length) {
        result.errors.push(`Option -${shortOption} requires a value`);
        return 1;
      }
      result[optionName] = args[index + 1];
      return 2; // Consumed option and value
    } else {
      result[optionName] = true;
      return 1; // Consumed option only
    }
  }

  /**
   * Validate parsed arguments
   * @param {ParseResult} parsed - Parsed arguments
   * @returns {ValidationResult} Validation results
   */
  validate(parsed) {
    const validation = {
      isValid: true,
      errors: [...parsed.errors],
      warnings: [...parsed.warnings]
    };

    // If there were parse-time errors, validation is not valid
    if (parsed.errors && parsed.errors.length > 0) {
      validation.isValid = false;
    }

    // Validate command
    if (!this.commands.has(parsed.command)) {
      validation.errors.push(`Invalid command: ${parsed.command}`);
      validation.isValid = false;
    }

    // Validate paths
    if (parsed.source && typeof parsed.source !== 'string') {
      validation.errors.push('Source path must be a string');
      validation.isValid = false;
    }

    if (parsed.output && typeof parsed.output !== 'string') {
      validation.errors.push('Output path must be a string');
      validation.isValid = false;
    }

    // Check for required options based on command
    if (parsed.command === 'build') {
      if (!parsed.source) {
        validation.errors.push('Build command requires source directory');
        validation.isValid = false;
      }
      if (!parsed.output) {
        validation.errors.push('Build command requires output directory');
        validation.isValid = false;
      }
    }

    // Validate glob patterns (additional validation beyond parse-time checks)
    for (const [optionKey, patterns] of Object.entries(parsed)) {
      if (this._isGlobOption(optionKey) && Array.isArray(patterns)) {
        for (const pattern of patterns) {
          const error = this._validateGlobPattern(pattern);
          if (error) {
            validation.errors.push(error);
            validation.isValid = false;
          }
        }
      }
    }

    // Validate default layout patterns (additional validation beyond parse-time checks)
    if (parsed.defaultLayout && Array.isArray(parsed.defaultLayout)) {
      for (const pattern of parsed.defaultLayout) {
        const error = this._validateDefaultLayoutPattern(pattern);
        if (error) {
          validation.errors.push(error);
          validation.isValid = false;
        }
      }
    }

    // Validate auto-ignore value if set
    if (parsed.autoIgnore !== undefined && typeof parsed.autoIgnore !== 'boolean') {
      validation.errors.push('Auto-ignore option must be true or false');
      validation.isValid = false;
    }

    // Validate log level if set
    if (parsed.logLevel !== undefined) {
      const logLevelError = this._validateLogLevel(parsed.logLevel);
      if (logLevelError) {
        validation.errors.push(logLevelError);
        validation.isValid = false;
      }
    }

    // Warn about glob options being ignored for init command
    if (parsed.command === 'init') {
      const globOptionsUsed = ['copy', 'ignore', 'ignoreRender', 'ignoreCopy', 'render', 'defaultLayout']
        .some(key => parsed[key] && parsed[key].length > 0);
      
      const buildOptionsUsed = (parsed.source && parsed.source !== '.') || 
                              (parsed.output && parsed.output !== 'dist');
      
      if (globOptionsUsed || parsed.dryRun || parsed.config || buildOptionsUsed) {
        validation.warnings.push('Config and glob pattern options are ignored for init command');
      }
    }

    return validation;
  }

  /**
   * Get help text for CLI
   * @returns {string} Help text
   */
  getHelpText() {
    return `
Unify Static Site Generator

Usage:
  unify [command] [options]

Commands:
  build    Build static site (default)
  serve    Start development server
  watch    Watch files and rebuild
  init     Initialize new project

Basic Options:
  -s, --source <dir>     Source directory (default: .)
  -o, --output <dir>     Output directory (default: dist)
  -c, --clean            Clean output directory before build
  -v, --verbose          Enable verbose logging
  -h, --help             Show this help
  -V, --version          Show version
  --config <file>        Configuration file path (unify.config.yaml)
  --log-level <level>    Set logging verbosity level (error|warn|info|debug, default: info)
  --pretty-urls          Transform HTML links to pretty URL structure
  --minify               Enable HTML minification for production builds

Glob Pattern Options:
  --copy <pattern>       Copy matching files to output
  --ignore <pattern>     Ignore for both render and copy
  --ignore-render <pat>  Ignore only for rendering
  --ignore-copy <pat>    Ignore only for copying
  --render <pattern>     Force render matching files
  --auto-ignore <bool>   Respect .gitignore and auto-ignore (default: true)
  --default-layout <val> Set default layout (filename or glob=layout)
  --dry-run              Show classification without writing files
  --fail-on <types>      Fail build on specific issue types (security,warning,error,U001-U008)

Init Options:
  -t, --template <name>  Template to use (default, basic, blog, docs, portfolio)
  --target <dir>         Target directory for initialization

Examples:
  unify                                    # Build current directory to dist/
  unify build -s src -o build             # Build src/ to build/
  unify --copy "assets/**" --ignore "temp/**"  # Copy assets, ignore temp
  unify --render "experiments/**"         # Force render experiments
  unify --pretty-urls                     # Transform links to pretty URLs
  unify --minify                          # Minify HTML for production
  unify --fail-on security               # Fail build on security issues
  unify --fail-on security,warning       # Fail on security and warnings
  unify --dry-run                         # Show what would be processed
  unify --log-level debug                 # Enable debug logging
  DEBUG=1 unify build                     # Enable debug via environment
  unify init                              # Initialize with default template
  unify init --template blog              # Initialize with blog template
  unify init --target my-site             # Initialize in my-site directory
  unify --help                            # Show this help

Pattern Examples:
  "assets/**"         # All files in assets directory
  "*.html"           # All HTML files in current directory
  "docs/**/*.{md,pdf}" # All .md and .pdf files in docs
  "!temp/**"         # Exclude temp directory (negation)

For more information, visit: https://github.com/fwdslsh/unify
`;
  }

  /**
   * Get version information
   * @returns {string} Version text
   */
  getVersionText() {
    return 'Unify v0.6.0 - DOM Cascade Static Site Generator';
  }

  /**
   * Check if option is a glob pattern option
   * @param {string} optionKey - Option key
   * @returns {boolean} True if it's a glob option
   * @private
   */
  _isGlobOption(optionKey) {
    const globOptions = ['copy', 'ignore', 'ignoreRender', 'ignoreCopy', 'render'];
    return globOptions.includes(optionKey);
  }

  /**
   * Validate glob pattern
   * @param {string} pattern - Glob pattern to validate
   * @returns {string|null} Error message or null if valid
   * @private
   */
  _validateGlobPattern(pattern) {
    if (!pattern || typeof pattern !== 'string' || pattern.trim() === '') {
      return 'Empty glob pattern not allowed';
    }

    // Basic validation - more detailed validation happens in GlobPatternProcessor
    if (pattern.includes('\\')) {
      return 'Use forward slashes in glob patterns for cross-platform compatibility';
    }

    return null;
  }

  /**
   * Check pattern for performance issues
   * @param {string} pattern - Glob pattern to check
   * @returns {string|null} Warning message or null
   * @private
   */
  _checkPatternPerformance(pattern) {
    if (pattern === '**/*' || pattern === '**') {
      return `Pattern '${pattern}' may have performance impact on large file sets`;
    }
    return null;
  }

  /**
   * Validate default layout pattern
   * @param {string} pattern - Default layout pattern to validate
   * @returns {string|null} Error message or null if valid
   * @private
   */
  _validateDefaultLayoutPattern(pattern) {
    if (!pattern || typeof pattern !== 'string' || pattern.trim() === '') {
      return 'Empty glob pattern not allowed';
    }

    const trimmedPattern = pattern.trim();

    // Check for backslashes (should use forward slashes for cross-platform compatibility)
    if (trimmedPattern.includes('\\')) {
      return 'Use forward slashes in glob patterns for cross-platform compatibility';
    }

    // If it contains '=', validate both parts
    if (trimmedPattern.includes('=')) {
      const [globPart, layoutPart] = trimmedPattern.split('=', 2);
      
      if (!globPart || globPart.trim() === '') {
        return 'Empty glob pattern not allowed before = in default layout rule';
      }
      
      if (!layoutPart || layoutPart.trim() === '') {
        return 'Empty layout path not allowed after = in default layout rule';
      }
      
      // Validate glob part
      const globError = this._validateGlobPattern(globPart.trim());
      if (globError) {
        return globError;
      }
    }

    return null;
  }

  /**
   * Check default layout pattern for performance issues
   * @param {string} pattern - Default layout pattern to check
   * @returns {string|null} Warning message or null
   * @private
   */
  _checkDefaultLayoutPatternPerformance(pattern) {
    if (!pattern || typeof pattern !== 'string') {
      return null;
    }

    // Extract glob part if it's a pattern rule
    let globPart = pattern;
    if (pattern.includes('=')) {
      globPart = pattern.split('=', 2)[0].trim();
    }

    // Check for overly broad patterns
    if (globPart === '**' || globPart === '**/*') {
      return `Pattern '${globPart}' may have performance impact on large file sets`;
    }

    return null;
  }

  /**
   * Validate --fail-on option value
   * @param {string} value - Fail-on value to validate
   * @returns {string|null} Error message or null if valid
   * @private
   */
  _validateFailOnValue(value) {
    if (!value || typeof value !== 'string' || value.trim() === '') {
      return 'Empty fail-on value not allowed';
    }

    const trimmedValue = value.trim();
    
    // Valid fail-on values
    const validValues = [
      'security', 'warning', 'error',
      'U001', 'U002', 'U003', 'U004', 'U005', 'U006', 'U008'
    ];

    // Split by comma and validate each value
    const values = trimmedValue.split(',').map(v => v.trim());
    
    for (const val of values) {
      if (!validValues.includes(val)) {
        return `Invalid fail-on value: '${val}'. Valid values are: ${validValues.join(', ')}`;
      }
    }

    return null;
  }

  /**
   * Apply environment variable overrides to result
   * @param {Object} result - Parsed result object to modify
   * @private
   */
  _applyEnvironmentVariables(result) {
    // Handle log level environment variables
    const debugMode = process.env.DEBUG === '1' || process.env.UNIFY_DEBUG === '1';
    if (debugMode) {
      result.logLevel = 'debug';
    } else if (process.env.LOG_LEVEL) {
      const originalValue = process.env.LOG_LEVEL;
      const envLogLevel = this._normalizeLogLevel(originalValue);
      const validLevels = ['error', 'warn', 'info', 'debug'];
      
      // Check if normalization actually found a valid level
      if (envLogLevel && validLevels.includes(envLogLevel)) {
        result.logLevel = envLogLevel;
      } else {
        result.warnings.push(`Invalid LOG_LEVEL environment variable: '${originalValue}'. Using default 'info'.`);
      }
    }
  }

  /**
   * Validate log level value
   * @param {string} value - Log level value to validate
   * @returns {string|null} Error message or null if valid
   * @private
   */
  _validateLogLevel(value) {
    if (!value || typeof value !== 'string' || value.trim() === '') {
      return 'Empty log level not allowed';
    }

    const normalized = this._normalizeLogLevel(value);
    const validLevels = ['error', 'warn', 'info', 'debug'];
    
    if (!validLevels.includes(normalized)) {
      return `Invalid log level: '${value}'. Valid levels are: ${validLevels.join(', ')}`;
    }

    return null;
  }

  /**
   * Normalize log level to valid value
   * @param {string} level - Input log level
   * @returns {string} Normalized log level
   * @private
   */
  _normalizeLogLevel(level) {
    if (typeof level !== 'string') {
      return 'info';
    }
    
    const normalized = level.toLowerCase().trim();
    const validLevels = ['error', 'warn', 'info', 'debug'];
    
    // Support abbreviated forms
    const abbreviations = {
      'e': 'error',
      'w': 'warn', 
      'i': 'info',
      'd': 'debug'
    };
    
    if (abbreviations[normalized]) {
      return abbreviations[normalized];
    }
    
    if (validLevels.includes(normalized)) {
      return normalized;
    }
    
    // Return null for invalid levels instead of defaulting
    return null;
  }
}