/**
 * Link normalization utilities for pretty URLs
 * Handles transformation of HTML links when --pretty-urls is enabled
 */

import path from 'path';
import { URL } from 'url';
import { logger } from './logger.js';

/**
 * Determine if a link should be transformed to pretty URL
 * @param {string} href - The href attribute value
 * @returns {boolean} True if link should be transformed
 */
export function shouldTransformLink(href) {
  if (!href || typeof href !== 'string') {
    return false;
  }

  // Trim whitespace
  href = href.trim();
  
  // Skip empty or fragment-only links
  if (!href || href.startsWith('#')) {
    return false;
  }
  
  // Skip data URLs
  if (href.startsWith('data:')) {
    return false;
  }
  
  // Check if it's an external URL
  try {
    const url = new URL(href);
    // If URL constructor succeeds and has a protocol, it's external
    if (url.protocol && !url.protocol.startsWith('file:')) {
      return false;
    }
  } catch (e) {
    // Not a valid absolute URL, continue with relative path checks
  }
  
  // Skip protocol links (mailto:, tel:, ftp:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return false;
  }
  
  // Only transform links ending with .html or .htm
  const urlParts = href.split(/[?#]/);
  const pathPart = urlParts[0];
  
  return /\.html?$/i.test(pathPart);
}

/**
 * Parse an href into its components
 * @param {string} href - The href attribute value
 * @returns {Object} Object with path, query, and fragment components
 */
export function parseHref(href) {
  if (!href) {
    return { path: '', query: '', fragment: '' };
  }
  
  // Split on ? and # to separate path, query, and fragment
  const queryIndex = href.indexOf('?');
  const fragmentIndex = href.indexOf('#');
  
  let path = href;
  let query = '';
  let fragment = '';
  
  if (queryIndex !== -1 && (fragmentIndex === -1 || queryIndex < fragmentIndex)) {
    path = href.substring(0, queryIndex);
    if (fragmentIndex !== -1) {
      query = href.substring(queryIndex, fragmentIndex);
      fragment = href.substring(fragmentIndex);
    } else {
      query = href.substring(queryIndex);
    }
  } else if (fragmentIndex !== -1) {
    path = href.substring(0, fragmentIndex);
    fragment = href.substring(fragmentIndex);
  }
  
  return { path, query, fragment };
}

/**
 * Resolve a relative path to an absolute path within the source directory
 * @param {string} linkPath - The link path to resolve
 * @param {string} currentPagePath - Path to the current page file
 * @param {string} sourceRoot - Source root directory
 * @returns {string} Resolved absolute path relative to source root
 */
export function resolveLinkPath(linkPath, currentPagePath, sourceRoot) {
  let resolvedPath;
  
  if (linkPath.startsWith('/')) {
    // Absolute path from source root
    resolvedPath = linkPath;
  } else {
    // Relative path from current page
    const currentPageDir = path.dirname(path.relative(sourceRoot, currentPagePath));
    resolvedPath = path.posix.join('/', currentPageDir, linkPath);
  }
  
  // Normalize and ensure leading slash
  resolvedPath = path.posix.normalize(resolvedPath);
  if (!resolvedPath.startsWith('/')) {
    resolvedPath = '/' + resolvedPath;
  }
  
  return resolvedPath;
}

/**
 * Transform a resolved HTML file path to pretty URL
 * @param {string} resolvedPath - Resolved path to HTML file (e.g., "/about.html")
 * @returns {string} Pretty URL path (e.g., "/about/")
 */
export function transformToPrettyUrl(resolvedPath) {
  // Remove .html or .htm extension
  const pathWithoutExt = resolvedPath.replace(/\.html?$/i, '');
  
  // Handle root index (with or without leading slash)
  if (pathWithoutExt === '/index' || pathWithoutExt === 'index' || pathWithoutExt === '') {
    return '/';
  }
  
  // Handle other index files
  if (pathWithoutExt.endsWith('/index')) {
    return pathWithoutExt.replace(/\/index$/, '/');
  }
  
  // Add trailing slash for non-index files
  return pathWithoutExt + '/';
}

/**
 * Transform a single link href to pretty URL format
 * @param {string} href - Original href attribute value
 * @param {string} currentPagePath - Path to the current page file
 * @param {string} sourceRoot - Source root directory
 * @returns {string} Transformed href or original if no transformation needed
 */
export function transformLink(href, currentPagePath, sourceRoot) {
  if (!shouldTransformLink(href)) {
    return href;
  }
  
  try {
    const { path: linkPath, query, fragment } = parseHref(href);
    const resolvedPath = resolveLinkPath(linkPath, currentPagePath, sourceRoot);
    const prettyUrl = transformToPrettyUrl(resolvedPath);
    
    logger.debug(`Link transformation: ${href} -> ${prettyUrl + query + fragment}`);
    return prettyUrl + query + fragment;
  } catch (error) {
    logger.warn(`Failed to transform link "${href}" in ${currentPagePath}: ${error.message}`);
    return href;
  }
}

/**
 * Transform all links in HTML content to pretty URLs
 * @param {string} htmlContent - HTML content to process
 * @param {string} currentPagePath - Path to the current page file
 * @param {string} sourceRoot - Source root directory
 * @returns {string} HTML content with transformed links
 */
export function transformLinksInHtml(htmlContent, currentPagePath, sourceRoot) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return htmlContent;
  }
  
  // Regular expression to match href attributes in HTML
  // This captures both single and double quoted href values
  const hrefRegex = /\bhref\s*=\s*(['"])((?:(?!\1)[^\\]|\\.)*)(\1)/gi;
  
  let transformedCount = 0;
  const result = htmlContent.replace(hrefRegex, (match, quote, href, endQuote) => {
    const originalHref = href;
    const transformedHref = transformLink(href, currentPagePath, sourceRoot);
    
    if (transformedHref !== originalHref) {
      transformedCount++;
      logger.debug(`Transformed link in ${path.relative(sourceRoot, currentPagePath)}: ${originalHref} -> ${transformedHref}`);
    }
    
    return `href=${quote}${transformedHref}${endQuote}`;
  });
  
  if (transformedCount > 0) {
    logger.debug(`Transformed ${transformedCount} links in ${path.relative(sourceRoot, currentPagePath)}`);
  }
  
  return result;
}