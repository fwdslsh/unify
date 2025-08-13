/**
 * Test utilities for Bun-native operations
 */

import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

/**
 * Run CLI command by directly importing and executing the CLI module
 * @param {Array<string>} args - Command arguments
 * @param {Object} options - Spawn options
 * @returns {Promise<Object>} Result with code, stdout, stderr
 */
export async function runCLI(args, options = {}) {
  // Create a subprocess for isolation
  const cliUrl = new URL('../src/cli.js', import.meta.url);
  // Use fileURLToPath for proper cross-platform path handling
  const cliPath = fileURLToPath(cliUrl);
  
  const proc = Bun.spawn([process.execPath, cliPath, ...args], {
    cwd: options.cwd || import.meta.dir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...Bun.env, ...options.env },
    ...options
  });
  
  // Handle timeout if specified
  let timeoutHandle;
  let killed = false;
  
  if (options.timeout) {
    timeoutHandle = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
    }, options.timeout);
  }
  
  try {
    // Read streams as they come in
    const stdoutPromise = new Response(proc.stdout).text();
    const stderrPromise = new Response(proc.stderr).text();
    const exitPromise = proc.exited;
    
    // Wait for all streams to finish
    const [stdout, stderr, code] = await Promise.all([
      stdoutPromise,
      stderrPromise,  
      exitPromise
    ]);
    
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    
    // If the process was killed by timeout, return special result
    if (killed) {
      return { code: 124, stdout, stderr, timeout: true };
    }
    
    if (options.debug) {
      // Print captured output for inspection
      // eslint-disable-next-line no-console
      console.log('--- CLI DEBUG ---');
      // eslint-disable-next-line no-console
      console.log('Args:', args);
      // eslint-disable-next-line no-console
      console.log('Exit code:', code);
      // eslint-disable-next-line no-console
      console.log('STDOUT:', stdout);
      // eslint-disable-next-line no-console
      console.log('STDERR:', stderr);
      console.log('-----------------');
    }
    return { code, stdout, stderr };
  } catch (error) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    
    // If killed by timeout, try to get partial output
    if (killed) {
      try {
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        return { code: 124, stdout, stderr, timeout: true };
      } catch {
        return { code: 124, stdout: '', stderr: 'Test timed out', timeout: true };
      }
    }
    
    throw error;
  }
}

/**
 * Run any command using Bun.spawn
 * @param {string} command - Command to run
 * @param {Array<string>} args - Command arguments
 * @param {Object} options - Spawn options
 * @returns {Promise<Object>} Result with code, stdout, stderr
 */
export async function runCommand(command, args = [], options = {}) {
  const proc = Bun.spawn([command, ...args], {
    cwd: options.cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: options.env || {},
    ...options
  });
  
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  
  return { code, stdout, stderr };
}

/**
 * Cross-platform path utilities for testing
 * Ensures tests work consistently across Windows and Unix-like systems
 */
export const crossPlatformPath = {
  /**
   * Normalize a path for cross-platform comparison
   * @param {string} inputPath - Path to normalize
   * @returns {string} Normalized path with forward slashes
   */
  normalize(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') {
      return inputPath;
    }
    // Convert backslashes to forward slashes for consistent comparison
    return path.normalize(inputPath).replace(/\\/g, '/');
  },

  /**
   * Create a test-safe absolute path for the current platform
   * @param {...string} pathSegments - Path segments to join
   * @returns {string} Absolute path appropriate for the current platform
   */
  testPath(...pathSegments) {
    if (process.platform === 'win32') {
      // On Windows, create paths under temp directory to avoid permission issues
      return path.join(os.tmpdir(), 'unify-test-paths', ...pathSegments);
    } else {
      // On Unix-like systems, use standard test paths
      return path.join('/tmp', 'unify-test-paths', ...pathSegments);
    }
  },

  /**
   * Check if a path contains another path (cross-platform)
   * @param {string} fullPath - The full path to check
   * @param {string} segment - The path segment to look for
   * @returns {boolean} True if fullPath contains the segment
   */
  pathContains(fullPath, segment) {
    if (!fullPath || !segment) return false;
    const normalizedFull = this.normalize(fullPath);
    const normalizedSegment = this.normalize(segment);
    return normalizedFull.includes(normalizedSegment);
  },

  /**
   * Check if a path starts with another path (cross-platform)
   * @param {string} fullPath - The full path to check
   * @param {string} prefix - The prefix path to check for
   * @returns {boolean} True if fullPath starts with prefix
   */
  pathStartsWith(fullPath, prefix) {
    if (!fullPath || !prefix) return false;
    const normalizedFull = this.normalize(fullPath);
    const normalizedPrefix = this.normalize(prefix);
    return normalizedFull.startsWith(normalizedPrefix);
  },

  /**
   * Check if a path ends with another path (cross-platform)
   * @param {string} fullPath - The full path to check
   * @param {string} suffix - The suffix path to check for
   * @returns {boolean} True if fullPath ends with suffix
   */
  pathEndsWith(fullPath, suffix) {
    if (!fullPath || !suffix) return false;
    const normalizedFull = this.normalize(fullPath);
    const normalizedSuffix = this.normalize(suffix);
    return normalizedFull.endsWith(normalizedSuffix);
  },

  /**
   * Create platform-appropriate test directory paths
   * @param {string} baseName - Base name for the test directory
   * @returns {Object} Object with source, output, and component paths
   */
  createTestDirectories(baseName) {
    const base = this.testPath(baseName);
    return {
      base,
      source: path.join(base, 'src'),
      output: path.join(base, 'dist'),
      components: path.join(base, 'src', '.components'),
      layouts: path.join(base, 'src', '.layouts')
    };
  },

  /**
   * Get system-appropriate paths for security testing
   * @returns {Object} Object with test paths for the current platform
   */
  getSecurityTestPaths() {
    const baseTestPath = this.testPath('security-test');
    
    if (process.platform === 'win32') {
      return {
        safeSource: path.join(baseTestPath, 'safe', 'source'),
        safeFile: path.join(baseTestPath, 'safe', 'source', 'index.html'),
        maliciousSystemPath: 'C:\\Windows\\System32\\config\\SAM',
        maliciousTraversalPath: '..\\..\\..\\Windows\\System32\\config',
        encodedTraversalPath: '%2e%2e%5c%2e%2e%5c%2e%2e%5cWindows%5cSystem32%5cconfig'
      };
    } else {
      return {
        safeSource: path.join(baseTestPath, 'safe', 'source'),
        safeFile: path.join(baseTestPath, 'safe', 'source', 'index.html'),
        maliciousSystemPath: '/etc/passwd',
        maliciousTraversalPath: '../../../etc/passwd',
        encodedTraversalPath: '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      };
    }
  }
};