/**
 * Test utilities for Bun-native operations
 */

/**
 * Run CLI command by directly importing and executing the CLI module
 * @param {Array<string>} args - Command arguments
 * @param {Object} options - Spawn options
 * @returns {Promise<Object>} Result with code, stdout, stderr
 */
export async function runCLI(args, options = {}) {
  // Create a subprocess for isolation
  const cliPath = new URL('../bin/cli.js', import.meta.url).pathname;
  
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