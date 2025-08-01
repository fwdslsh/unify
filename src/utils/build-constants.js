/**
 * Build constants for Unify CLI
 * Auto-generated during build process
 */

export const BUILD_INFO = {
  "version": "0.6.0",
  "buildTime": "2025-07-31T22:24:25.621Z",
  "gitCommit": "d2c245e",
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
