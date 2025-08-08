/**
 * Build constants for Unify CLI
 * Auto-generated during build process
 */

export const BUILD_INFO = {
  "version": "0.4.1",
  "buildTime": "2025-08-01T17:41:54.565Z",
  "gitCommit": "552efdf",
  "runtime": "bun",
  "bunVersion": "1.2.19"
};

export const RUNTIME_FEATURES = {
  htmlRewriter: true,
  fsWatch: true,
  serve: true,
  hash: true,
  compile: true
};

export function getRuntimeFeatures() {
  return RUNTIME_FEATURES;
}

export function getBuildInfo() {
  return BUILD_INFO;
}
