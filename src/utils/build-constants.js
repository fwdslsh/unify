/**
 * Build constants for Unify CLI
 * Auto-generated during build process
 */

export const BUILD_INFO = {
  "version": "0.4.1",
  "buildTime": "2025-08-01T17:41:54.565Z",
  "gitCommit": "552efdf"
};

export const FEATURES = {
  htmlRewriter: true,
  fsWatch: true,
  serve: true,
  hash: true,
  compile: true
};

export function getFeatures() {
  return FEATURES;
}

export function getBuildInfo() {
  return BUILD_INFO;
}
