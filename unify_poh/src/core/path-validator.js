/**
 * Path Validation Security Module
 * Prevents path traversal attacks and validates file access
 */

import { resolve, relative, normalize, isAbsolute } from "path";
import { PathTraversalError } from "./errors.js";
import { createLogger } from '../utils/logger.js';

/**
 * PathValidator class for secure file path validation
 * Implements US-012: Path Traversal Prevention
 */
export class PathValidator {
  constructor() {
    this.logger = createLogger('PATH-VALIDATOR');
  }
  /**
   * Validates that a file path is safe and within the authorized source root
   * @param {string} inputPath - The path to validate
   * @param {string} sourceRoot - The authorized source root directory
   * @throws {PathTraversalError} If path traversal is detected
   * @returns {void}
   */
  validatePath(inputPath, sourceRoot) {
    // Check for null or undefined paths
    if (!inputPath || typeof inputPath !== 'string') {
      throw new PathTraversalError(inputPath, sourceRoot, "Invalid path: path must be a non-empty string");
    }

    if (!sourceRoot || typeof sourceRoot !== 'string') {
      throw new PathTraversalError(inputPath, sourceRoot, "Invalid source root: must be a non-empty string");
    }

    // Decode URL-encoded characters to prevent encoded traversal
    const decodedPath = this._decodePathSafely(inputPath);
    
    // Normalize the path to resolve . and .. components
    const normalizedPath = normalize(decodedPath);
    
    // Check for obviously malicious traversal patterns (but allow legitimate relative paths)
    if (this._containsMaliciousPatterns(normalizedPath)) {
      this.logger.warn(`Malicious pattern detected`, { inputPath, normalizedPath });
      throw new PathTraversalError(inputPath, sourceRoot);
    }

    // Check for null byte injection
    if (this._containsNullBytes(decodedPath)) {
      throw new PathTraversalError(inputPath, sourceRoot, "Null byte injection attempt detected");
    }

    // Resolve to absolute path for final validation
    const normalizedSourceRoot = resolve(sourceRoot);
    let resolvedPath;
    
    // Handle both relative and absolute input paths
    if (isAbsolute(normalizedPath)) {
      // Already absolute path (e.g., from LayoutResolver)
      resolvedPath = normalize(normalizedPath);
    } else {
      // Relative path - resolve from source root
      resolvedPath = resolve(sourceRoot, normalizedPath);
    }

    // Check if resolved path is a system directory (security check after resolution)
    // Only block if it's truly accessing system files, not just directories in /tmp or similar
    if (this._isSystemDirectory(resolvedPath, normalizedSourceRoot) && !this._isLegitimateWorkingPath(resolvedPath)) {
      this.logger.warn(`System directory access blocked`, { inputPath, resolvedPath });
      throw new PathTraversalError(inputPath, sourceRoot);
    }

    // Check if resolved path is within source root
    const relativePath = relative(normalizedSourceRoot, resolvedPath);
    
    // Allow legitimate directory references while blocking actual malicious paths
    if (relativePath.startsWith('..')) {
      // Allow traversal to _layouts, _includes, and other underscore directories (legitimate layout patterns)
      // Also allow common output directory patterns (dist, build, output, etc.)
      const pathSegments = relativePath.split(/[/\\]/); // Handle both Unix and Windows separators
      const hasLegitimatePattern = pathSegments.some(segment => 
        segment === '_layouts' || 
        segment === '_includes' || 
        segment === '_components' ||
        segment === '_layout.html' ||
        segment === '_default.html' ||
        segment === 'dist' ||
        segment === 'build' ||
        segment === 'output' ||
        segment === 'public' ||
        segment === 'styles' ||
        segment === 'assets' ||
        segment === 'static' ||
        segment === 'css' ||
        segment === 'js' ||
        segment === 'img' ||
        segment === 'images'
      ) || relativePath.includes('/_layouts/') || 
           relativePath.includes('/_includes/') || 
           relativePath.includes('/_components/') ||
           relativePath.endsWith('/_layout.html') ||
           relativePath.endsWith('/_default.html');
      
      if (!hasLegitimatePattern) {
        this.logger.warn(`Path traversal blocked`, { inputPath, relativePath });
        throw new PathTraversalError(inputPath, sourceRoot);
      }
    } else if (resolve(normalizedSourceRoot, relativePath) !== resolvedPath) {
      throw new PathTraversalError(inputPath, sourceRoot);
    }
  }

  /**
   * Validates and resolves a path to its absolute form
   * @param {string} inputPath - The path to validate and resolve
   * @param {string} sourceRoot - The authorized source root directory
   * @returns {string} The resolved absolute path
   * @throws {PathTraversalError} If path traversal is detected
   */
  validateAndResolve(inputPath, sourceRoot) {
    this.validatePath(inputPath, sourceRoot);
    return resolve(sourceRoot, normalize(this._decodePathSafely(inputPath)));
  }

  /**
   * Safely decode URL-encoded path components
   * @private
   * @param {string} path - The path to decode
   * @returns {string} Decoded path
   */
  _decodePathSafely(path) {
    try {
      return decodeURIComponent(path);
    } catch (error) {
      // If decoding fails, use original path
      return path;
    }
  }

  /**
   * Check if path is a legitimate working directory (like /tmp for tests)
   * @param {string} resolvedPath - The absolute resolved path
   * @returns {boolean} True if path is in a legitimate working area
   */
  _isLegitimateWorkingPath(resolvedPath) {
    const normalizedPath = resolvedPath.replace(/\\/g, '/');
    
    // Allow paths in common working directories
    const workingDirectories = [
      '/tmp/',
      '/var/tmp/',
      process.env.TMPDIR || '',
      process.env.TEMP || '',
      process.env.TMP || ''
    ].filter(Boolean);
    
    return workingDirectories.some(dir => 
      normalizedPath.startsWith(dir.replace(/\\/g, '/'))
    );
  }

  /**
   * Check if resolved path points to a system directory
   * @param {string} resolvedPath - The absolute resolved path
   * @param {string} sourceRoot - The source root for context
   * @returns {boolean} True if path points to a system directory
   */
  _isSystemDirectory(resolvedPath, sourceRoot = '') {
    const systemDirectories = [
      '/etc',
      '/proc',
      '/dev', 
      '/sys',
      '/root',
      '/boot',
      '/usr',
      '/bin',
      '/sbin',
      '/lib',
      '/lib64',
      '/opt',
      '/var'
    ];
    
    // Block system directories but allow temp directories when they're explicitly used as source roots
    // Only block if we're trying to traverse TO these directories, not when they're the source root itself
    const isSourceRootInTmp = sourceRoot && (sourceRoot.startsWith('/tmp/') || sourceRoot.startsWith('/home/'));
    if (!isSourceRootInTmp) {
      systemDirectories.push('/tmp');
      systemDirectories.push('/home');
    }
    
    // Normalize path separators for cross-platform compatibility
    const normalizedPath = resolvedPath.replace(/\\/g, '/');
    
    // Check if the path exactly matches or is a subdirectory of any system directory
    return systemDirectories.some(sysDir => 
      normalizedPath === sysDir || 
      normalizedPath.startsWith(sysDir + '/')
    );
  }

  /**
   * Check for obviously malicious traversal patterns while allowing legitimate relative paths
   * @private
   * @param {string} path - The normalized path to check
   * @returns {boolean} True if malicious patterns detected
   */
  _containsMaliciousPatterns(path) {
    // Obviously malicious system directory patterns - only flag when used for traversal
    const systemPaths = [
      '/etc/passwd',     // System files
      '/etc/shadow',
      '/proc/version',
      '/dev/null',
      '\\etc\\passwd',
      '\\proc\\version',
      '/etc',            // System directories
      '/proc',
      '/dev',
      '/sys',
      '/root',
      '\\etc',
      '\\proc',
      '\\dev',
      '\\sys',
      '\\root'
    ];

    // Null byte injection patterns
    const nullBytePatterns = [
      '\\x00',     // Null byte attempts
      '%00',       // URL-encoded null byte
    ];

    // Check for obviously malicious system paths
    const lowerPath = path.toLowerCase();
    
    // Only flag exact matches or paths that clearly target system directories
    // This prevents false positives with legitimate files that happen to contain system keywords
    for (const systemPath of systemPaths) {
      const lowerSystemPath = systemPath.toLowerCase();
      
      // Exact match or starts with system path followed by separator
      if (lowerPath === lowerSystemPath || 
          lowerPath.startsWith(lowerSystemPath + '/') || 
          lowerPath.startsWith(lowerSystemPath + '\\')) {
        return true;
      }
      
      // Check for absolute system paths (starting with / or \)
      if ((lowerSystemPath.startsWith('/') || lowerSystemPath.startsWith('\\')) && 
          lowerPath.startsWith(lowerSystemPath)) {
        return true;
      }
    }
    
    // Check for null byte injection
    if (nullBytePatterns.some(pattern => path.includes(pattern))) {
      return true;
    }

    // Check for Windows-specific traversal patterns at the start (absolute paths starting with backslash and ..)
    if (path.startsWith('\\..') || path.startsWith('\\.')) {
      return true;
    }

    // Check for suspicious traversal patterns - especially those targeting system directories
    const traversalCount = (path.match(/\.\.\//g) || []).length;
    
    // Check for traversal combined with system directory access
    if (traversalCount >= 3) {
      // Allow legitimate layout patterns even with 3+ traversals
      const isLegitimateLayoutPath = path.includes('_layout') || 
                                    path.includes('_include') || 
                                    path.includes('_component') ||
                                    path.endsWith('.layout.html') ||
                                    path.endsWith('layout.html');
      
      if (!isLegitimateLayoutPath) {
        return true; // Flag non-layout paths with 3+ traversals as suspicious
      }
    }
    
    // Always flag excessive traversal (more than 5 levels is definitely malicious)
    if (traversalCount > 5) {
      return true;
    }

    // Check for mixed separators (potential evasion technique) - but allow common Windows/Unix mixed patterns
    if (path.includes('\\') && path.includes('/')) {
      // Allow common legitimate mixed separator patterns like ./src\content/pages
      // These occur commonly in cross-platform development
      const hasOnlyCommonMixed = /^\.\/[^/\\]*\\[^/\\]*\/[^/\\]*$/.test(path) || // ./dir\subdir/file pattern
                                 /^[^/\\]*\\[^/\\]*\/[^/\\]*$/.test(path);      // dir\subdir/file pattern
      
      if (!hasOnlyCommonMixed) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for null byte injection attempts
   * @private
   * @param {string} path - The path to check
   * @returns {boolean} True if null bytes detected
   */
  _containsNullBytes(path) {
    return path.includes('\0') || path.includes('\\x00') || path.includes('%00');
  }
}