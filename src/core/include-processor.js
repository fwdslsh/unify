/**
 * HTML Include Processor for unify
 * Handles dependency extraction for <include> elements
 */

import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Extract include dependencies from HTML content
 * @param {string} htmlContent - HTML content to analyze
 * @param {string} filePath - Path of the current file
 * @param {string} sourceRoot - Root source directory
 * @returns {string[]} Array of resolved include file paths
 */
export function extractIncludeDependencies(htmlContent, filePath, sourceRoot) {
  const dependencies = [];

  // Match <include> elements (both self-closing and with content)
  const includeRegex = /<include\s+src=["']([^"']+)["'][^>]*(?:\/>|>[\s\S]*?<\/include>)/gi;
  const matches = Array.from(htmlContent.matchAll(includeRegex));

  for (const match of matches) {
    const includePath = match[1];

    try {
      let resolvedPath;
      if (includePath.startsWith('/')) {
        // Absolute path from source root
        resolvedPath = path.resolve(sourceRoot, includePath.replace(/^\/+/, ''));
      } else {
        // Relative path from current file
        resolvedPath = path.resolve(path.dirname(filePath), includePath);
      }

      dependencies.push(resolvedPath);
    } catch (error) {
      // Log warning but continue - dependency tracking shouldn't break builds
      logger.warn(`Could not resolve include dependency: ${includePath} in ${filePath}`);
    }
  }

  return dependencies;
}

/**
 * Check if content contains include elements
 * @param {string} htmlContent - HTML content to check
 * @returns {boolean} True if content has includes
 */
export function hasIncludes(htmlContent) {
  return /<include\s+src=["']/.test(htmlContent);
}
