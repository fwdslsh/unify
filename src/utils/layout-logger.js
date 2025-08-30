/**
 * Layout Resolution Logger
 * Provides detailed logging for layout resolution chain debugging
 * Implements US-019 requirement for layout resolution chain logging
 */

/**
 * LayoutLogger provides structured logging for layout resolution debugging
 */
export class LayoutLogger {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.logLevel = options.logLevel || this._getLogLevel();
    this.prefix = options.prefix || '[LAYOUT]';
    this.colors = options.colors !== false && this._supportsColor();
  }

  /**
   * Log layout resolution result with full chain details
   * @param {Object} resolution - Layout resolution result
   */
  logResolution(resolution) {
    if (!this.enabled || this.logLevel < 2) return;

    const { filePath, source, reason, precedenceApplied, processingTime } = resolution;
    
    this._log('info', `Layout resolution for ${filePath}:`);
    this._log('info', `  Result: ${source} (${precedenceApplied})`);
    this._log('info', `  Reason: ${reason}`);
    this._log('info', `  Time: ${processingTime}ms`);
    
    if (this.logLevel >= 3) {
      this._logResolutionChain(resolution.resolutionChain);
    }
  }

  /**
   * Log detailed resolution chain (debug level)
   * @private
   * @param {Array} resolutionChain - Resolution chain steps
   */
  _logResolutionChain(resolutionChain) {
    this._log('debug', '  Resolution chain:');
    
    for (const step of resolutionChain) {
      const status = step.applied ? this._colorize('✓', 'green') : this._colorize('✗', 'red');
      const stepInfo = this._formatStepInfo(step);
      this._log('debug', `    ${step.step}. ${step.type}: ${status} ${stepInfo}`);
    }
  }

  /**
   * Format step information for logging
   * @private
   * @param {Object} step - Resolution step
   * @returns {string} Formatted step info
   */
  _formatStepInfo(step) {
    if (!step.applied) {
      return this._colorize('(not applied)', 'gray');
    }

    switch (step.type) {
      case 'explicit':
        return `data-unify="${step.result}"`;
      case 'default-layout':
        if (step.subType === 'pattern') {
          return `pattern "${step.pattern}" → "${step.result}"`;
        } else {
          return `filename fallback → "${step.result}"`;
        }
      case 'discovery':
        return `found "${step.result}"`;
      default:
        return `result: ${step.result}`;
    }
  }

  /**
   * Log default layout rules configuration
   * @param {Array} rules - Default layout rules
   */
  logDefaultLayoutRules(rules) {
    if (!this.enabled || this.logLevel < 2 || !rules || rules.length === 0) return;

    this._log('info', 'Default layout rules configured:');
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (rule.type === 'pattern') {
        this._log('info', `  ${i + 1}. Pattern: ${rule.pattern} → ${rule.layout}`);
      } else {
        this._log('info', `  ${i + 1}. Filename fallback: ${rule.layout}`);
      }
    }
  }

  /**
   * Log layout resolution statistics
   * @param {Object} stats - Resolution statistics
   */
  logStatistics(stats) {
    if (!this.enabled || this.logLevel < 2) return;

    this._log('info', 'Layout resolution statistics:');
    this._log('info', `  Explicit layouts: ${stats.explicitLayouts}`);
    this._log('info', `  Default pattern matches: ${stats.defaultPatternMatches}`);
    this._log('info', `  Default filename matches: ${stats.defaultFilenameMatches}`);
    this._log('info', `  Discovered layouts: ${stats.discoveredLayouts}`);
    this._log('info', `  No layout files: ${stats.noLayoutFiles}`);
    this._log('info', `  Cache hits: ${stats.cacheHits} / misses: ${stats.cacheMisses}`);
  }

  /**
   * Log layout resolution warning
   * @param {string} message - Warning message
   * @param {string} filePath - File path (optional)
   */
  logWarning(message, filePath = null) {
    if (!this.enabled || this.logLevel < 1) return;

    const fileInfo = filePath ? ` (${filePath})` : '';
    this._log('warn', `${message}${fileInfo}`);
  }

  /**
   * Log layout resolution error
   * @param {string} message - Error message
   * @param {string} filePath - File path (optional)
   * @param {Error} error - Error object (optional)
   */
  logError(message, filePath = null, error = null) {
    if (!this.enabled) return;

    const fileInfo = filePath ? ` (${filePath})` : '';
    this._log('error', `${message}${fileInfo}`);
    
    if (error && this.logLevel >= 3) {
      this._log('debug', `  Error details: ${error.message}`);
      if (error.stack) {
        this._log('debug', `  Stack trace: ${error.stack}`);
      }
    }
  }

  /**
   * Log debug information
   * @param {string} message - Debug message
   * @param {string} filePath - File path (optional)
   */
  logDebug(message, filePath = null) {
    if (!this.enabled || this.logLevel < 3) return;

    const fileInfo = filePath ? ` (${filePath})` : '';
    this._log('debug', `${message}${fileInfo}`);
  }

  /**
   * Internal logging method
   * @private
   * @param {string} level - Log level
   * @param {string} message - Log message
   */
  _log(level, message) {
    const timestamp = new Date().toISOString();
    const levelTag = this._colorize(`[${level.toUpperCase()}]`, this._getLevelColor(level));
    const prefixTag = this._colorize(this.prefix, 'cyan');
    
    const logMessage = `${timestamp} ${levelTag} ${prefixTag} ${message}`;
    
    switch (level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'debug':
        if (this.logLevel >= 3) {
          console.log(logMessage);
        }
        break;
      default:
        console.log(logMessage);
    }
  }

  /**
   * Get log level from environment or options
   * @private
   * @returns {number} Log level (0=none, 1=errors/warnings, 2=info, 3=debug)
   */
  _getLogLevel() {
    const envLevel = process.env?.LOG_LEVEL?.toLowerCase();
    const debugMode = process.env?.DEBUG === '1' || process.env?.UNIFY_DEBUG === '1';
    
    if (debugMode) return 3;
    
    switch (envLevel) {
      case 'error': return 1;
      case 'warn': case 'warning': return 1;
      case 'info': return 2;
      case 'debug': return 3;
      case 'none': case 'off': return 0;
      default: return 2; // Default to info level
    }
  }

  /**
   * Check if debug logging is specifically enabled
   * @private
   * @returns {boolean} True if debug is enabled
   */
  _isDebugEnabled() {
    return process.env?.DEBUG === '1' || 
           process.env?.UNIFY_DEBUG === '1' || 
           process.env?.LOG_LEVEL?.toLowerCase() === 'debug';
  }

  /**
   * Check if terminal supports colors
   * @private
   * @returns {boolean} True if colors are supported
   */
  _supportsColor() {
    return process.stdout?.isTTY && 
           !process.env.NO_COLOR && 
           process.env.TERM !== 'dumb';
  }

  /**
   * Colorize text if colors are enabled
   * @private
   * @param {string} text - Text to colorize
   * @param {string} color - Color name
   * @returns {string} Colorized text
   */
  _colorize(text, color) {
    if (!this.colors) return text;

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
    switch (level) {
      case 'error': return 'red';
      case 'warn': return 'yellow';
      case 'info': return 'blue';
      case 'debug': return 'gray';
      default: return 'blue';
    }
  }

  /**
   * Create a new logger with different options
   * @param {Object} options - Logger options
   * @returns {LayoutLogger} New logger instance
   */
  withOptions(options = {}) {
    return new LayoutLogger({
      enabled: this.enabled,
      logLevel: this.logLevel,
      prefix: this.prefix,
      colors: this.colors,
      ...options
    });
  }

  /**
   * Enable or disable logging
   * @param {boolean} enabled - Whether to enable logging
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Set log level
   * @param {number|string} level - Log level (0-3 or 'error'/'warn'/'info'/'debug')
   */
  setLogLevel(level) {
    if (typeof level === 'string') {
      switch (level.toLowerCase()) {
        case 'error': this.logLevel = 1; break;
        case 'warn': case 'warning': this.logLevel = 1; break;
        case 'info': this.logLevel = 2; break;
        case 'debug': this.logLevel = 3; break;
        case 'none': case 'off': this.logLevel = 0; break;
        default: this.logLevel = 2;
      }
    } else if (typeof level === 'number') {
      this.logLevel = Math.max(0, Math.min(3, level));
    }
  }
}

// Create and export default logger instance
export const layoutLogger = new LayoutLogger();