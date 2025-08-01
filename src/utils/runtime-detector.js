/**
 * Feature detection utilities
 * Checks for availability of specific features
 */

/**
 * Check if a specific feature is available
 * @param {string} feature - Feature to check
 * @returns {boolean} True if feature is available
 */
export function hasFeature(feature) {
  switch (feature) {
    case 'htmlRewriter':
      return typeof HTMLRewriter !== 'undefined';
    case 'serve':
      return typeof Bun.serve !== 'undefined';
    case 'hash':
      return typeof Bun.CryptoHasher !== 'undefined';
    case 'fsWatch':
      return true;
    default:
      return false;
  }
}

/**
 * Ensure a feature is available, throw if not
 * @param {string} feature - Feature to ensure
 * @throws {Error} If feature is not available
 */
export function ensureFeature(feature) {
  if (!hasFeature(feature)) {
    throw new Error(`Feature '${feature}' is not available in this runtime`);
  }
}

/**
 * Get runtime information
 * @returns {Object} Runtime information
 */
export function getRuntimeInfo() {
  return {
    name: 'bun',
    version: Bun.version
  };
}
