/**
 * Error Classes for Unify CLI
 * Provides consistent error handling with appropriate exit codes
 */

/**
 * Base error class for all Unify CLI errors
 * @extends Error
 */
export class UnifyError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} exitCode - CLI exit code
   * @param {string} userMessage - User-friendly message
   */
  constructor(message, exitCode = 1, userMessage = null) {
    super(message);
    this.name = this.constructor.name;
    this.exitCode = exitCode;
    this.userMessage = userMessage || message;
  }
}

/**
 * Security violation error for path traversal attempts
 * @extends UnifyError
 */
export class PathTraversalError extends UnifyError {
  /**
   * @param {string} attemptedPath - The path that was rejected
   * @param {string} sourceRoot - The authorized source root directory
   * @param {string} message - Internal error message
   */
  constructor(attemptedPath, sourceRoot, message = null) {
    const defaultMessage = message || `Path traversal attempt detected: ${attemptedPath}`;
    const userMessage = "Invalid file path: access outside project directory not allowed";
    
    super(defaultMessage, 2, userMessage);
    
    this.attemptedPath = attemptedPath;
    this.sourceRoot = sourceRoot;
    
    // Log security violation
    console.error(`[SECURITY] ${this.message} (source root: ${sourceRoot})`);
  }
}

/**
 * File system operation error
 * @extends UnifyError
 */
export class FileSystemError extends UnifyError {
  /**
   * @param {string} operation - The file operation that failed
   * @param {string} path - The file path involved
   * @param {string} message - Error details
   */
  constructor(operation, path, message) {
    super(`File ${operation} failed for ${path}: ${message}`, 1);
    this.operation = operation;
    this.path = path;
  }
}

/**
 * CLI argument validation error
 * @extends UnifyError
 */
export class ValidationError extends UnifyError {
  /**
   * @param {string} argument - The invalid argument
   * @param {string} reason - Why the argument is invalid
   */
  constructor(argument, reason) {
    const message = `Invalid argument '${argument}': ${reason}`;
    super(message, 2, message);
    this.argument = argument;
    this.reason = reason;
  }
}