/**
 * Comprehensive Logger for Unify CLI
 * Implements US-028: Verbose Logging and Debug Support
 * 
 * Provides structured logging with multiple levels, color support,
 * environment variable integration, and component-specific prefixes.
 */

/**
 * Logger class providing comprehensive logging functionality
 */
export class Logger {
  /**
   * Create a new Logger instance
   * @param {Object} options - Logger configuration options
   * @param {boolean} options.enabled - Whether logging is enabled (default: true)
   * @param {string} options.logLevel - Log level (error|warn|info|debug) (default: from env or 'info')
   * @param {string} options.component - Component name for log prefix (default: 'UNIFY')
   * @param {boolean} options.colors - Whether to use colors (default: auto-detect)
   */
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.logLevel = options.logLevel || this._detectLogLevel();
    this.component = options.component || 'UNIFY';
    this.colors = options.colors !== false ? this._detectColorSupport() : false;
    
    // Normalize log level
    this.logLevel = this._normalizeLogLevel(this.logLevel);
  }

  /**
   * Log an error message
   * @param {string} message - Error message
   * @param {Object} context - Additional context information
   */
  error(message, context = null) {
    this._log('error', message, context);
  }

  /**
   * Log a warning message
   * @param {string} message - Warning message
   * @param {Object} context - Additional context information
   */
  warn(message, context = null) {
    this._log('warn', message, context);
  }

  /**
   * Log an info message
   * @param {string} message - Info message
   * @param {Object} context - Additional context information
   */
  info(message, context = null) {
    this._log('info', message, context);
  }

  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {Object} context - Additional context information
   */
  debug(message, context = null) {
    this._log('debug', message, context);
  }

  /**
   * Create a child logger with a different component name
   * @param {string} component - Component name for the child logger
   * @param {Object} options - Additional options to override
   * @returns {Logger} New logger instance
   */
  child(component, options = {}) {
    return new Logger({
      enabled: this.enabled,
      logLevel: this.logLevel,
      colors: this.colors,
      component: component,
      ...options
    });
  }

  /**
   * Enable or disable logging
   * @param {boolean} enabled - Whether to enable logging
   */
  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  /**
   * Set the log level
   * @param {string|number} level - Log level or numeric value
   */
  setLogLevel(level) {
    if (typeof level === 'number') {
      const levels = ['none', 'error', 'warn', 'info', 'debug'];
      const clampedLevel = Math.max(0, Math.min(4, level));
      this.logLevel = levels[clampedLevel];
    } else {
      this.logLevel = this._normalizeLogLevel(level);
    }
  }

  /**
   * Check if a specific log level is enabled
   * @param {string} level - Log level to check
   * @returns {boolean} True if the level is enabled
   */
  isLevelEnabled(level) {
    if (!this.enabled) return false;
    
    const targetValue = this.getLogLevelValue(level);
    const currentValue = this.getLogLevelValue(this.logLevel);
    
    return targetValue <= currentValue;
  }

  /**
   * Get numeric value for log level
   * @param {string} level - Log level name
   * @returns {number} Numeric log level value
   */
  getLogLevelValue(level) {
    const levels = {
      'none': 0,
      'error': 1,
      'warn': 2,
      'info': 3,
      'debug': 4
    };
    
    return levels[level] || 0;
  }

  /**
   * Internal logging method
   * @private
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   */
  _log(level, message, context) {
    if (!this.enabled || !this.isLevelEnabled(level)) {
      return;
    }

    try {
      const formattedMessage = this._formatMessage(level, message, context);
      this._outputMessage(level, formattedMessage);
    } catch (error) {
      // Silently handle logging errors to prevent recursive issues
      // In a real-world scenario, you might want to write to stderr or a fallback
    }
  }

  /**
   * Format log message with timestamp, level, component, and context
   * @private
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   * @returns {string} Formatted message
   */
  _formatMessage(level, message, context) {
    const timestamp = new Date().toISOString();
    const levelTag = this._colorize(`[${level.toUpperCase()}]`, this._getLevelColor(level));
    const componentTag = this._colorize(`[${this.component}]`, 'cyan');
    
    // Safely handle message formatting
    const safeMessage = this._safeStringify(message);
    
    let formattedMessage = `${timestamp} ${levelTag} ${componentTag} ${safeMessage}`;
    
    // Add context information if provided
    if (context) {
      const contextString = this._formatContext(context);
      if (contextString) {
        formattedMessage += ` ${contextString}`;
      }
    }
    
    return formattedMessage;
  }

  /**
   * Format context object into readable string
   * @private
   * @param {Object} context - Context object
   * @returns {string} Formatted context string
   */
  _formatContext(context) {
    if (!context || typeof context !== 'object') {
      return '';
    }

    const parts = [];
    
    // Handle common context fields with special formatting
    if (context.filePath) {
      parts.push(`file=${context.filePath}`);
    }
    
    if (context.operation) {
      parts.push(`op=${context.operation}`);
    }
    
    if (context.duration !== undefined) {
      parts.push(`duration=${context.duration}ms`);
    }
    
    if (context.fileCount !== undefined) {
      parts.push(`files=${context.fileCount} files`);
    }
    
    if (context.target) {
      parts.push(`target=${context.target}`);
    }
    
    // Add any other properties
    for (const [key, value] of Object.entries(context)) {
      if (!['filePath', 'operation', 'duration', 'fileCount', 'target'].includes(key)) {
        parts.push(`${key}=${this._safeStringify(value)}`);
      }
    }
    
    return parts.length > 0 ? `[${parts.join(', ')}]` : '';
  }

  /**
   * Safely convert value to string
   * @private
   * @param {any} value - Value to stringify
   * @returns {string} String representation
   */
  _safeStringify(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  /**
   * Output message to appropriate console method
   * @private
   * @param {string} level - Log level
   * @param {string} message - Formatted message
   */
  _outputMessage(level, message) {
    switch (level) {
      case 'error':
        console.error(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      default:
        console.log(message);
        break;
    }
  }

  /**
   * Detect log level from environment variables
   * @private
   * @returns {string} Detected log level
   */
  _detectLogLevel() {
    // Check for debug mode first (highest priority)
    if (process.env.DEBUG === '1' || process.env.UNIFY_DEBUG === '1') {
      return 'debug';
    }
    
    // Check LOG_LEVEL environment variable
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    if (envLevel) {
      const validLevels = ['error', 'warn', 'info', 'debug', 'none'];
      if (validLevels.includes(envLevel)) {
        return envLevel;
      }
    }
    
    // Default to info level
    return 'info';
  }

  /**
   * Normalize log level to valid value
   * @private
   * @param {string} level - Input log level
   * @returns {string} Normalized log level
   */
  _normalizeLogLevel(level) {
    if (typeof level !== 'string') {
      return 'info';
    }
    
    const normalized = level.toLowerCase().trim();
    const validLevels = ['error', 'warn', 'info', 'debug', 'none'];
    
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
    
    return 'info';
  }

  /**
   * Detect if terminal supports colors
   * @private
   * @returns {boolean} True if colors are supported
   */
  _detectColorSupport() {
    // Check for explicit color disable
    if (process.env.NO_COLOR || process.env.TERM === 'dumb') {
      return false;
    }
    
    // Check if we're in a TTY (but allow override in tests)
    if (process.env.CLAUDECODE === '1') {
      return true; // Enable colors in Claude Code test mode
    }
    
    if (!process.stdout?.isTTY) {
      return false;
    }
    
    return true;
  }

  /**
   * Apply color to text if colors are enabled
   * @private
   * @param {string} text - Text to colorize
   * @param {string} color - Color name
   * @returns {string} Colorized text or original text
   */
  _colorize(text, color) {
    if (!this.colors) {
      return text;
    }

    const colors = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
      reset: '\x1b[0m'
    };

    const colorCode = colors[color] || '';
    const resetCode = colors.reset;
    
    return `${colorCode}${text}${resetCode}`;
  }

  /**
   * Get color for log level
   * @private
   * @param {string} level - Log level
   * @returns {string} Color name
   */
  _getLevelColor(level) {
    const levelColors = {
      error: 'red',
      warn: 'yellow',
      info: 'blue',
      debug: 'gray'
    };
    
    return levelColors[level] || 'blue';
  }
}

/**
 * Create a default logger instance
 */
export const logger = new Logger();

/**
 * Create component-specific loggers
 */
export const createLogger = (component, options = {}) => {
  return new Logger({ component, ...options });
};