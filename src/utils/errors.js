/**
 * Custom error classes for unify
 * Provides specific error types with actionable guidance for different failure scenarios
 */

/**
 * Base error class for unify errors
 */
export class UnifyError extends Error {
  constructor(message, filePath = null, lineNumber = null, suggestions = []) {
    super(message);
    this.name = this.constructor.name;
    this.filePath = filePath;
    this.lineNumber = lineNumber;
    this.suggestions = Array.isArray(suggestions) ? suggestions : [];
    
    // Include file context in message if available
    if (filePath) {
      const location = lineNumber ? `${filePath}:${lineNumber}` : filePath;
      this.message = `${message} in ${location}`;
    }
    
    // Don't add suggestions to message here - let formatForCLI() handle it
    // This prevents duplication when both constructor and formatForCLI() add suggestions
  }
  
  /**
   * Determine if this error should be handled gracefully (as a warning)
   * Override in subclasses to customize behavior
   * @returns {boolean} True if error should be treated as a warning
   */
  isRecoverable() {
    return false;
  }
  
  /**
   * Generate a warning comment to replace the failed include
   * @returns {string} HTML comment with error details
   */
  toWarningComment() {
    const errorMsg = this.message.split(' in ')[0];
    return `<!-- WARNING: ${errorMsg} -->`;
  }
  
  /**
   * Format error for CLI display with colors and structure
   */
  formatForCLI() {
    const location = this.lineNumber ? `${this.filePath}:${this.lineNumber}` : this.filePath;
    let output = `ERROR ${this.name}: ${this.message.split(' in ')[0]}`;
    
    if (this.filePath) {
      output += `\n   File: ${location}`;
    }
    
    if (this.suggestions.length > 0) {
      output += '\n\nSuggestions:';
      output += '\n' + this.suggestions.map(s => `   - ${s}`).join('\n');
    }
    
    return output;
  }
}

/**
 * Error thrown when an include file is not found
 */
export class IncludeNotFoundError extends UnifyError {
  constructor(includePath, parentFile, searchPaths = [], componentsDir = '.components') {
    const suggestions = [
      `Create the missing file: ${includePath}`,
      `Verify the file exists: ${includePath}`,
      searchPaths.length > 0 ? `Searched in: ${searchPaths.join(', ')}` : `Place include files in the ${componentsDir}/ directory`,
      `Check for typos in the include path`,
      `Ensure the path is relative to ${parentFile} (for file="...") or source root (for virtual="...")`
    ];
    
  super(`Include not found: ${includePath}`, parentFile, null, suggestions);
    this.includePath = includePath;
    this.parentFile = parentFile;
    this.searchPaths = searchPaths;
  }
  
  /**
   * Include not found errors are recoverable - continue processing with warning
   */
  isRecoverable() {
    return true;
  }
}

/**
 * Error thrown when a circular dependency is detected in includes
 */
export class CircularDependencyError extends UnifyError {
  constructor(filePath, dependencyChain) {
    const chain = dependencyChain.join(' → ');
    const suggestions = [
      'Remove one of the include statements to break the cycle',
      'Consider restructuring your components to avoid circular references',
      'Use conditional includes if the circular dependency is intentional'
    ];
    
    super(`Circular dependency detected: ${chain} → ${filePath}`, filePath, null, suggestions);
    this.dependencyChain = dependencyChain;
  }
}

/**
 * Error thrown when a path escapes the source directory (security)
 */
export class PathTraversalError extends UnifyError {
  constructor(attemptedPath, sourceRoot) {
    const suggestions = [
      'Use relative paths within your source directory',
      'Avoid using "../" to escape the source directory',
      'Place all includes within the source tree for security',
      `Ensure all paths are within: ${sourceRoot}`
    ];
    
    super(`Path traversal attempt blocked: ${attemptedPath}`, null, null, suggestions);
    this.attemptedPath = attemptedPath;
    this.sourceRoot = sourceRoot;
  }
  
  /**
   * Path traversal attempts are recoverable - log security warning but continue build
   * The alternative would be to fail builds due to malicious or accidental path traversal attempts
   */
  isRecoverable() {
    return true;
  }
}

/**
 * Error thrown when include directive syntax is malformed
 */
export class MalformedDirectiveError extends UnifyError {
  constructor(directive, filePath, lineNumber) {
    const suggestions = [
      'Use correct syntax: <!--#include file="path.html" --> or <!--#include virtual="/path.html" -->',
      'Ensure quotes around the file path',
      'Check for typos in "file" or "virtual" keywords',
      'Verify the directive is properly closed with -->'
    ];
    
    super(`Malformed include directive: ${directive}`, filePath, lineNumber, suggestions);
    this.directive = directive;
  }
}

/**
 * Error thrown when maximum include depth is exceeded
 */
export class MaxDepthExceededError extends UnifyError {
  constructor(filePath, depth, maxDepth) {
    const suggestions = [
      `Reduce the depth of nested includes to ${maxDepth} or fewer levels`,
      'Check for circular dependencies in your include structure',
      'Consider flattening your component hierarchy'
    ];
    
    super(`Maximum include depth (${maxDepth}) exceeded at depth ${depth}`, filePath, null, suggestions);
    this.depth = depth;
    this.maxDepth = maxDepth;
  }
  
  /**
   * Max depth errors are recoverable - stop processing this branch but continue with others
   */
  isRecoverable() {
    return true;
  }
}

/**
 * Error thrown when file system operations fail
 */
export class FileSystemError extends UnifyError {
  constructor(operation, filePath, originalError) {
    const suggestions = [];
    
    if (operation === 'read') {
      suggestions.push(
        'Check if the file exists and is readable',
        'Verify file permissions',
        'Ensure the path is correct'
      );
    } else if (operation === 'write') {
      suggestions.push(
        'Check if the output directory exists',
        'Verify write permissions to the output directory',
        'Ensure there is enough disk space'
      );
    } else if (operation === 'mkdir') {
      suggestions.push(
        'Verify parent directory exists',
        'Check directory creation permissions'
      );
    }
    
    super(`File system error during ${operation}: ${originalError.message}`, filePath, null, suggestions);
    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when CLI arguments are invalid
 */
export class InvalidArgumentError extends UnifyError {
  constructor(argument, value, reason) {
    const suggestions = [
      `Check the ${argument} value: ${value}`,
      'Use --help to see valid options',
      'Verify paths exist and are accessible'
    ];
    
    super(`Invalid argument ${argument}: ${value} (${reason})`, null, null, suggestions);
    this.argument = argument;
    this.value = value;
    this.reason = reason;
  }
}

/**
 * Error thrown when build process fails
 */
export class BuildError extends UnifyError {
  constructor(message, errors = []) {
    const suggestions = [];
    
    if (errors.length > 0) {
      suggestions.push(`Fix the ${errors.length} error(s) listed above`);
      
      // Analyze common error patterns
      const includeErrors = errors.filter(e => e.error?.includes('Include file not found'));
      const circularErrors = errors.filter(e => e.error?.includes('Circular dependency'));
      
      if (includeErrors.length > 0) {
        suggestions.push('Check that all include files exist in the correct locations');
      }
      if (circularErrors.length > 0) {
        suggestions.push('Review your include structure to remove circular dependencies');
      }
    }
    
    suggestions.push('Run with DEBUG=* for more detailed error information');
    
    super(`Build failed: ${message}`, null, null, suggestions);
    this.errors = errors;
  }
}

/**
 * Error thrown when development server fails to start
 */
export class ServerError extends UnifyError {
  constructor(message, port = null) {
    const suggestions = [];
    
    if (port) {
      suggestions.push(
        `Try a different port: --port ${port + 1}`,
        'Check if another process is using this port',
        'Use --port 0 to automatically find an available port'
      );
    }
    
    suggestions.push('Verify the output directory exists and contains files to serve');
    
    super(`Server error: ${message}`, null, null, suggestions);
    this.port = port;
  }
}

/**
 * Error thrown when layout files are not found or invalid
 */
export class LayoutError extends UnifyError {
  constructor(layoutPath, reason, alternatives = []) {
    const suggestions = [
      `Create the layout file: ${layoutPath}`,
      'Verify the layout directory path in your configuration'
    ];
    
    if (alternatives.length > 0) {
      suggestions.push(`Alternative layout locations: ${alternatives.join(', ')}`);
    }
    
    suggestions.push('Use {{ content }} placeholder in your layout for page content');
    
  super(`Layout not found: ${layoutPath} (${reason})`, layoutPath, null, suggestions);
    this.layoutPath = layoutPath;
    this.reason = reason;
    this.alternatives = alternatives;
  }
}

/**
 * Error thrown when component files have issues
 */
export class ComponentError extends UnifyError {
  constructor(componentPath, reason, parentFile = null) {
    const suggestions = [
      `Check the component file: ${componentPath}`,
      'Verify the component directory path in your configuration',
      'Ensure component files are properly formatted HTML'
    ];
    
    if (parentFile) {
      suggestions.push(`Referenced from: ${parentFile}`);
    }
    
    super(`Component error: ${reason}`, componentPath, null, suggestions);
    this.componentPath = componentPath;
    this.reason = reason;
    this.parentFile = parentFile;
  }
}