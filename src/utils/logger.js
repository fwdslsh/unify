/**
 * Simple logging utility for unify
 * Provides consistent logging across the application
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  constructor() {
    // Support both UNIFY_DEBUG (spec-compliant) and DEBUG (generic) environment variables
    const debugEnabled = Bun.env.UNIFY_DEBUG || Bun.env.DEBUG;
    
    if (debugEnabled) {
      this.level = LOG_LEVELS.DEBUG;
    } else {
      this.level = Bun.env.LOG_LEVEL ? 
        LOG_LEVELS[Bun.env.LOG_LEVEL.toUpperCase()] ?? LOG_LEVELS.INFO : 
        LOG_LEVELS.INFO;
    }
  }
  
  setLevel(level) {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    } else if (typeof level === 'number') {
      this.level = level;
    }
  }
  
  debug(...args) {
    if (this.level <= LOG_LEVELS.DEBUG) {
      console.debug('[DEBUG]', ...args);
    }
  }
  
  info(...args) {
    if (this.level <= LOG_LEVELS.INFO) {
      console.log('[INFO]', ...args);
    }
  }
  
  warn(...args) {
    if (this.level <= LOG_LEVELS.WARN) {
      console.warn('[WARN]', ...args);
    }
  }
  
  error(...args) {
    if (this.level <= LOG_LEVELS.ERROR) {
      console.error('[ERROR]', ...args);
    }
  }
  
  success(...args) {
    if (this.level <= LOG_LEVELS.INFO) {
      console.log('[SUCCESS]', ...args);
    }
  }
}

export const logger = new Logger();