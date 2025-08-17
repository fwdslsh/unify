/**
 * Get output path for a source file, supporting pretty URLs
 * @param {string} sourcePath - Source file path
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 * @param {boolean} prettyUrls - Whether to use pretty URLs
 * @returns {string} Output file path
 */
export function getOutputPathWithPrettyUrls(sourcePath, sourceRoot, outputRoot, prettyUrls = false, config = {}) {
  const relativePath = path.relative(sourceRoot, sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();
  // Only apply pretty URLs to HTML/Markdown files not matching exclude pattern
  const fileName = path.basename(sourcePath);
  const excludePattern = config.excludePattern || '_.*';
  let excludeRegex;
  if (excludePattern === "_.*") {
    excludeRegex = /^_/;
  } else {
    excludeRegex = new RegExp('^' + excludePattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  }
  const isPage = !excludeRegex.test(fileName) && (ext === '.html' || ext === '.htm' || ext === '.md');
  if (prettyUrls && isPage) {
    // Special case: any index.html files stay as index.html
    if (path.basename(relativePath, path.extname(relativePath)) === 'index') {
      return path.resolve(outputRoot, relativePath);
    }
    // Remove all extensions for pretty URLs
    // file.md.html -> file, guide.html -> guide
    let withoutExt = relativePath;
    while (path.extname(withoutExt)) {
      withoutExt = path.basename(withoutExt, path.extname(withoutExt));
    }
    // Add back the directory structure
    const dir = path.dirname(relativePath);
    if (dir !== '.') {
      withoutExt = path.join(dir, withoutExt);
    }
    return path.resolve(outputRoot, withoutExt, 'index.html');
  }
  // Standard output: preserve relative path
  return path.resolve(outputRoot, relativePath);
}
/**
 * Path resolution utilities for unify
 * Handles secure path resolution and validation
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { PathTraversalError } from './errors.js';

/**
 * Resolve include path based on type (file vs virtual)
 * @param {string} type - 'file' or 'virtual'
 * @param {string} includePath - Path from include directive
 * @param {string} currentFilePath - Path of file containing the include
 * @param {string} sourceRoot - Root source directory
 * @returns {string} Resolved absolute path
 */
export function resolveIncludePath(type, includePath, currentFilePath, sourceRoot) {
  // Validate input
  if (!includePath || typeof includePath !== 'string') {
    throw new Error('Include path must be a non-empty string');
  }
  
  let resolvedPath;
  
  if (type === 'file') {
    // Relative to current file's directory
    const currentDir = path.dirname(currentFilePath);
    resolvedPath = path.resolve(currentDir, includePath);
  } else if (type === 'virtual') {
    // Relative to source root, remove all leading slashes and normalize
    let cleanPath = includePath.replace(/^\/+/, '');
    // Normalize multiple slashes
    cleanPath = cleanPath.replace(/\/+/g, '/');
    resolvedPath = path.resolve(sourceRoot, cleanPath);
  } else {
    throw new Error(`Invalid include type: ${type}`);
  }
  
  // Security check: ensure resolved path is within source root
  if (!isPathWithinDirectory(resolvedPath, sourceRoot)) {
    throw new PathTraversalError(includePath, sourceRoot);
  }
  
  return resolvedPath;
}

/**
 * Check if a path is within a directory (prevents path traversal)
 * @param {string} filePath - Path to check
 * @param {string} directory - Directory that should contain the path
 * @returns {boolean} True if path is within directory
 */
export function isPathWithinDirectory(filePath, directory) {
  const resolvedFilePath = path.resolve(filePath);
  const resolvedDirectory = path.resolve(directory);
  
  return resolvedFilePath.startsWith(resolvedDirectory + path.sep) || 
         resolvedFilePath === resolvedDirectory;
}

/**
 * Get file extension from path
 * @param {string} filePath - File path
 * @returns {string} Extension including dot (e.g., '.html')
 */
export function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

/**
 * Check if file is an HTML file
 * @param {string} filePath - File path
 * @returns {boolean} True if HTML file
 */
export function isHtmlFile(filePath) {
  return getFileExtension(filePath) === '.html';
}

/**
 * Check if file is a partial (should not be output as a page)
 * @param {string} filePath - File path to check
 * @param {string|Object} config - Components directory name or full config object
 * @returns {boolean} True if file is a partial/component/layout file
 */
export function isPartialFile(filePath, config = '.components') {
  const fileName = path.basename(filePath);
  
  // Handle both string and object config for backward compatibility
  let componentsDir, layoutsDir, excludePattern;
  if (typeof config === 'string') {
    componentsDir = config;
    layoutsDir = '.layouts'; // default
    excludePattern = '_.*'; // default
  } else {
    componentsDir = config.components || '.components';
    layoutsDir = config.layouts || '.layouts';
    excludePattern = config.excludePattern || '_.*';
  }
  
  // Create regex from exclude pattern
  let excludeRegex;
  if (excludePattern === "_.*") {
    excludeRegex = /^_/;
  } else {
    excludeRegex = new RegExp('^' + excludePattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  }
  
  // Check if filename matches exclude pattern (traditional partial marker)
  if (excludeRegex.test(fileName)) {
    return true;
  }
  
  // Check if in configured components directory
  if (isFileInDirectory(filePath, componentsDir)) {
    return true;
  }
  
  // Check if in configured layouts directory
  if (isFileInDirectory(filePath, layoutsDir)) {
    return true;
  }
  
  // Also check for common standard directory names that should be treated as partials
  const commonPartialDirs = [
    'layouts', 'components', '.components', '.layouts',
    'includes', 'partials', 'templates',
    'custom_components', 'site_layouts'  // Support custom naming conventions
  ];
  
  for (const dirName of commonPartialDirs) {
    if (isFileInDirectory(filePath, dirName)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a file is within a specific directory
 * @param {string} filePath - File path to check
 * @param {string} dirPattern - Directory name or absolute path to check against
 * @returns {boolean} True if file is in the directory
 */
function isFileInDirectory(filePath, dirPattern) {
  const normalizedFilePath = path.resolve(filePath);
  
  // If dirPattern is an absolute path, check if file is within that directory
  if (path.isAbsolute(dirPattern)) {
    const normalizedDirPattern = path.resolve(dirPattern);
    return normalizedFilePath.startsWith(normalizedDirPattern + path.sep) || 
           normalizedFilePath === normalizedDirPattern;
  }
  
  // If dirPattern is a relative directory name, check if any part of the path matches
  const normalizedPath = path.normalize(filePath);
  const pathParts = normalizedPath.split(path.sep);
  
  // Check if any part of the path matches the directory name
  return pathParts.includes(dirPattern);
}

/**
 * Get output path for a source file
 * @param {string} sourcePath - Source file path
 * @param {string} sourceRoot - Source root directory
 * @param {string} outputRoot - Output root directory
 * @returns {string} Output file path
 */
export function getOutputPath(sourcePath, sourceRoot, outputRoot) {
  const relativePath = path.relative(sourceRoot, sourcePath);
  return path.resolve(outputRoot, relativePath);
}

/**
 * Get current file's directory (for ES modules)
 * @param {string} importMetaUrl - import.meta.url
 * @returns {string} Directory path
 */
export function getCurrentDirectory(importMetaUrl) {
  return path.dirname(fileURLToPath(importMetaUrl));
}

/**
 * Resolve layout or component path with security checks
 * @param {string} resourcePath - The layout/component path from attribute
 * @param {string} sourceRoot - Source root directory  
 * @param {string} resourceDir - Base directory for the resource (layouts/components)
 * @param {string} resourceType - Type of resource for error messages ('layout' or 'component')
 * @param {boolean} allowDirectoryPaths - Whether to treat paths with slashes as relative to sourceRoot
 * @returns {string} Resolved absolute path
 * @throws {Error} If path is outside allowed directories
 */
export function resolveResourcePath(resourcePath, sourceRoot, resourceDir, resourceType = 'resource', allowDirectoryPaths = false) {
  let resolvedPath;
  
  if (resourcePath.startsWith('/')) {
    // Absolute path relative to source root
    const relativePath = resourcePath.substring(1); // Remove leading slash
    resolvedPath = path.join(sourceRoot, relativePath);
    
    // Security check - must be within source root for absolute paths
    if (!isPathWithinDirectory(resolvedPath, sourceRoot)) {
      throw new Error(`${resourceType} path outside source directory: ${resourcePath}`);
    }
  } else if (allowDirectoryPaths && resourcePath.includes('/')) {
    // Path with directory structure, relative to source root
    resolvedPath = path.join(sourceRoot, resourcePath);
    
    // Security check - must be within source root
    if (!isPathWithinDirectory(resolvedPath, sourceRoot)) {
      throw new Error(`${resourceType} path outside source directory: ${resourcePath}`);
    }
  } else {
    // Relative path within resource directory
    if (path.isAbsolute(resourceDir)) {
      // If resourceDir is an absolute path (from CLI), use it directly
      resolvedPath = path.join(resourceDir, resourcePath);
      
      // Security check - must be within the configured resource directory
      if (!isPathWithinDirectory(resolvedPath, resourceDir)) {
        throw new Error(`${resourceType} path outside ${resourceType} directory: ${resourcePath}`);
      }
    } else {
      // If resourceDir is relative, join with sourceRoot
      resolvedPath = path.join(sourceRoot, resourceDir, resourcePath);
      
      // Security check - must be within source root for relative paths
      if (!isPathWithinDirectory(resolvedPath, sourceRoot)) {
        throw new Error(`${resourceType} path outside source directory: ${resourcePath}`);
      }
    }
  }
  
  return resolvedPath;
}