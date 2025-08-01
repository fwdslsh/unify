/**
 * Package.json reading utilities for unify
 * Extracts configuration like homepage URL for sitemap generation
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger.js';

/**
 * Read and parse package.json from a directory
 * @param {string} searchPath - Directory to search for package.json
 * @returns {Promise<Object|null>} Parsed package.json or null if not found
 */
export async function readPackageJson(searchPath) {
  const packagePath = path.join(searchPath, 'package.json');
  
  try {
    const content = await fs.readFile(packagePath, 'utf-8');
    const packageData = JSON.parse(content);
    logger.debug(`Read package.json from ${packagePath}`);
    return packageData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.debug(`No package.json found at ${packagePath}`);
      return null;
    }
    logger.warn(`Error reading package.json from ${packagePath}: ${error.message}`);
    return null;
  }
}

/**
 * Find package.json by searching up the directory tree
 * @param {string} startPath - Starting directory to search from
 * @returns {Promise<Object|null>} Parsed package.json or null if not found
 */
export async function findPackageJson(startPath) {
  let currentPath = path.resolve(startPath);
  
  while (currentPath !== path.dirname(currentPath)) {
    const packageData = await readPackageJson(currentPath);
    if (packageData) {
      return packageData;
    }
    currentPath = path.dirname(currentPath);
  }
  
  logger.debug('No package.json found in directory tree');
  return null;
}

/**
 * Extract base URL for sitemap from package.json homepage field
 * @param {string} searchPath - Directory to search for package.json
 * @param {string} fallbackUrl - Fallback URL if no homepage found
 * @returns {Promise<string>} Base URL for sitemap
 */
export async function getBaseUrlFromPackage(searchPath, fallbackUrl = 'https://example.com') {
  const packageData = await findPackageJson(searchPath);
  
  if (packageData && packageData.homepage) {
    logger.info(`Using homepage from package.json: ${packageData.homepage}`);
    return packageData.homepage;
  }
  
  logger.debug(`No homepage in package.json, using fallback: ${fallbackUrl}`);
  return fallbackUrl;
}