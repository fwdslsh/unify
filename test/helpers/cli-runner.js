/**
 * Test helper for running CLI commands and capturing output
 * Provides consistent interface for testing CLI functionality
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '../../src/cli.js');

/**
 * Executes CLI command and captures output
 * @param {string[]} args - CLI arguments
 * @param {string} cwd - Working directory for command execution  
 * @param {Object} options - Additional options
 * @param {Object} options.env - Environment variables
 * @param {number} options.timeout - Timeout in milliseconds (default: 10000)
 * @param {string} options.input - Input to send to stdin
 * @returns {Promise<{code: number, stdout: string, stderr: string, duration: number}>}
 */
export async function runCLI(args = [], cwd = process.cwd(), options = {}) {
  const {
    env = {},
    timeout = 10000,
    input = null
  } = options;
  
  const startTime = performance.now();
  
  return new Promise((resolve, reject) => {
    // Set up environment
    const childEnv = {
      ...process.env,
      ...env,
      // Ensure we're using the right paths
      NODE_ENV: 'test'
    };
    
    // Spawn the process
    const child = spawn('bun', ['run', CLI_PATH, ...args], {
      cwd,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    let timeoutId = null;
    
    // Set up timeout
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`CLI command timed out after ${timeout}ms`));
      }, timeout);
    }
    
    // Capture output
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Send input if provided
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
    
    // Handle process completion
    child.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      const duration = performance.now() - startTime;
      
      resolve({
        code: code || 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration
      });
    });
    
    child.on('error', (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(error);
    });
  });
}

/**
 * Runs CLI command expecting success (exit code 0)
 * @param {string[]} args - CLI arguments
 * @param {string} cwd - Working directory
 * @param {Object} options - Additional options
 * @returns {Promise<{stdout: string, stderr: string, duration: number}>}
 */
export async function runCLISuccess(args, cwd, options = {}) {
  const result = await runCLI(args, cwd, options);
  
  if (result.code !== 0) {
    const error = new Error(`CLI command failed with exit code ${result.code}`);
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.code = result.code;
    throw error;
  }
  
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    duration: result.duration
  };
}

/**
 * Runs CLI command expecting failure (non-zero exit code)
 * @param {string[]} args - CLI arguments
 * @param {string} cwd - Working directory
 * @param {Object} options - Additional options
 * @returns {Promise<{code: number, stdout: string, stderr: string, duration: number}>}
 */
export async function runCLIFailure(args, cwd, options = {}) {
  const result = await runCLI(args, cwd, options);
  
  if (result.code === 0) {
    throw new Error(`Expected CLI command to fail, but it succeeded`);
  }
  
  return result;
}

/**
 * Helper for running build command
 * @param {Object} project - Project object from makeTempProject
 * @param {string[]} extraArgs - Additional CLI arguments
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} CLI result
 */
export async function runBuild(project, extraArgs = [], options = {}) {
  const args = [
    'build',
    '--source', project.sourceDir,
    '--output', project.outputDir,
    ...extraArgs
  ];
  
  return runCLI(args, project.tempBase, options);
}

/**
 * Helper for running serve command (with timeout for testing)
 * @param {Object} project - Project object from makeTempProject
 * @param {string[]} extraArgs - Additional CLI arguments
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} CLI result
 */
export async function runServe(project, extraArgs = [], options = {}) {
  const args = [
    'serve',
    '--source', project.sourceDir,
    '--output', project.outputDir,
    '--port', '0', // Use random available port
    ...extraArgs
  ];
  
  // Default shorter timeout for serve command tests
  const defaultOptions = { timeout: 5000, ...options };
  
  return runCLI(args, project.tempBase, defaultOptions);
}

/**
 * Helper for running watch command (with timeout for testing)
 * @param {Object} project - Project object from makeTempProject
 * @param {string[]} extraArgs - Additional CLI arguments
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} CLI result
 */
export async function runWatch(project, extraArgs = [], options = {}) {
  const args = [
    'watch',
    '--source', project.sourceDir,
    '--output', project.outputDir,
    ...extraArgs
  ];
  // Determine watcher events for test scenario
  let watcherEvents = [];
  if (options.watcherEvents) {
    watcherEvents = options.watcherEvents;
  } else {
    // Default: emit change for index.html
    watcherEvents = [{ event: 'change', file: 'index.html', delay: 100 }];
  }
  const env = {
    ...(options.env || {}),
    UNIFY_TEST_MOCK_WATCHER: '1',
    UNIFY_TEST_MOCK_WATCHER_EVENTS: JSON.stringify(watcherEvents)
  };
  const defaultOptions = { timeout: 3000, ...options, env };
  return runCLI(args, project.tempBase, defaultOptions);
}

/**
 * Helper for running init command
 * @param {string} targetDir - Directory to initialize in
 * @param {string} template - Template name (optional)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} CLI result
 */
export async function runInit(targetDir, template = null, options = {}) {
  const args = ['init'];
  if (template) {
    args.push(template);
  }
  
  return runCLI(args, targetDir, options);
}

/**
 * Helper for running dry run commands
 * @param {Object} project - Project object from makeTempProject
 * @param {string[]} extraArgs - Additional CLI arguments
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} CLI result with classification output
 */
export async function runDryRun(project, extraArgs = [], options = {}) {
  const args = [
    'build',
    '--source', project.sourceDir,
    '--output', project.outputDir,
    '--dry-run',
    '--log-level', 'debug',
    ...extraArgs
  ];
  
  return runCLI(args, project.tempBase, options);
}