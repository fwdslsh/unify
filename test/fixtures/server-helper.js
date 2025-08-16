/**
 * Shared server management utilities for integration tests
 * Provides robust, reliable server management with proper cleanup
 */

import path from 'path';
import { fileURLToPath } from 'url';

// Global set to track all server instances across tests
const activeServers = new Set();

// Cleanup handler for orphaned processes
process.on('SIGINT', async () => {
  console.log('\n🔄 Cleaning up servers on interrupt...');
  await cleanupAllServers();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Cleaning up servers on termination...');
  await cleanupAllServers();
  process.exit(1);
});

process.on('exit', async () => {
  await cleanupAllServers();
});

process.on('beforeExit', async () => {
  await cleanupAllServers();
});

// Windows-specific cleanup
if (process.platform === 'win32') {
  process.on('SIGBREAK', async () => {
    console.log('\n🔄 Cleaning up servers on break...');
    await cleanupAllServers();
    process.exit(1);
  });
}

/**
 * Cleanup all active servers
 */
export async function cleanupAllServers() {
  const cleanupPromises = Array.from(activeServers).map(async (server) => {
    try {
      if (server.cleanup) {
        await server.cleanup();
      }
    } catch (error) {
      console.warn(`Error cleaning up server: ${error.message}`);
    }
  });
  
  await Promise.allSettled(cleanupPromises);
  activeServers.clear();
  
  // Additional cleanup delay on Windows to ensure ports are released
  if (process.platform === 'win32') {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * Start a development server for testing with robust cleanup
 * @param {string} sourceDir - Source directory path  
 * @param {string} outputDir - Output directory path
 * @param {Object} options - Server options
 * @returns {Object} Server object with cleanup capabilities
 */
export async function startDevServer(sourceDir, outputDir, options = {}) {
  const {
    timeout = 15000,
    workingDir = null,
    verbose = false
  } = options;

  // Ensure output directory exists and do initial build
  const { build } = await import("../../src/core/file-processor.js");
  await build({
    source: sourceDir,
    output: outputDir,
    clean: true,
  });

  // Find an available port more reliably with wider range to avoid conflicts
  const basePort = 4000 + Math.floor(Math.random() * 5000); // Wider port range
  const port = await findAvailablePort(basePort);

  // Use fileURLToPath for cross-platform compatibility
  const cliUrl = new URL("../../src/cli.js", import.meta.url);
  const cliPath = fileURLToPath(cliUrl);
  
  // Use AbortController for proper cleanup
  const abortController = new AbortController();
  
  const spawnOptions = {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, DEBUG: verbose ? "1" : "0" },
    signal: abortController.signal,
    cwd: workingDir || process.cwd()
  };
  
  // On Windows, ensure we don't have conflicting spawn options
  if (process.platform === 'win32') {
    // Windows-specific adjustments if needed
    spawnOptions.windowsHide = true;
  }
  
  const { spawn } = await import('bun');
  const serverProcess = spawn(
    [
      process.env.BUN_PATH || process.execPath,
      cliPath,
      "serve",
      "--source",
      sourceDir,
      "--output", 
      outputDir,
      "--port",
      port.toString(),
      ...(verbose ? ["--verbose"] : [])
    ],
    spawnOptions
  );

  // Create server object with cleanup capability
  const serverObj = {
    process: serverProcess,
    port,
    abortController,
    cleanup: async () => {
      try {
        // Signal the process to terminate
        abortController.abort();
        
        // Platform-specific graceful shutdown timing
        const gracefulDelay = process.platform === 'win32' ? 200 : 100;
        await new Promise(resolve => setTimeout(resolve, gracefulDelay));
        
        // Force kill if still running
        if (!serverProcess.killed) {
          // On Windows, try different termination signals
          if (process.platform === 'win32') {
            // Windows doesn't support SIGTERM reliably, use 'SIGKILL' directly
            try {
              serverProcess.kill("SIGKILL");
            } catch (killError) {
              // Ignore kill errors - process might already be dead
            }
          } else {
            // Unix-like systems: try SIGTERM first, then SIGKILL
            serverProcess.kill("SIGTERM");
          }
          
          // Wait for process to exit with longer timeout on Windows
          const killTimeoutMs = process.platform === 'win32' ? 5000 : 2000;
          const killTimeout = setTimeout(() => {
            if (!serverProcess.killed) {
              try {
                serverProcess.kill("SIGKILL");
              } catch (killError) {
                // Ignore kill errors
              }
            }
          }, killTimeoutMs);
          
          try {
            await serverProcess.exited;
            clearTimeout(killTimeout);
          } catch (error) {
            clearTimeout(killTimeout);
            // Process already exited or was killed
          }
        }
        
        // Additional cleanup time on Windows
        if (process.platform === 'win32') {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Remove from active servers
        activeServers.delete(serverObj);
      } catch (error) {
        console.warn(`Error during server cleanup: ${error.message}`);
      }
    }
  };
  
  // Add to active servers for tracking
  activeServers.add(serverObj);

  // Wait for server to be ready with more robust checking
  await waitForServer(port, timeout);

  // Additional wait to ensure build is complete and server is stable
  await new Promise((resolve) => setTimeout(resolve, 500));

  return serverObj;
}

/**
 * Stop a development server
 * @param {Object} serverObj - Server object returned from startDevServer
 */
export async function stopDevServer(serverObj) {
  if (serverObj && serverObj.cleanup) {
    await serverObj.cleanup();
  }
}

/**
 * Find an available port
 * @param {number} startPort - Starting port to check
 * @returns {number} Available port number
 */
async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      // Try to create a temporary server on this port
      const { serve } = await import('bun');
      const testServer = serve({
        port,
        hostname: '127.0.0.1', // Explicit localhost binding
        fetch: () => new Response("test"),
      });
      
      // If successful, stop it and return the port
      testServer.stop();
      
      // Longer cleanup wait on Windows
      const cleanupDelay = process.platform === 'win32' ? 200 : 50;
      await new Promise(resolve => setTimeout(resolve, cleanupDelay));
      return port;
    } catch {
      // Port is in use, try next one
      continue;
    }
  }
  
  throw new Error(`Could not find available port starting from ${startPort}`);
}

/**
 * Wait for server to be ready with better error handling
 * @param {number} port - Port to check
 * @param {number} timeout - Timeout in milliseconds
 */
async function waitForServer(port, timeout = 15000) {
  // Windows might need more time for server startup
  if (process.platform === 'win32' && timeout === 15000) {
    timeout = 45000; // Triple timeout for Windows CI environments
  }
  const startTime = Date.now();
  let lastError = null;

  while (Date.now() - startTime < timeout) {
    try {
      // Use longer timeout on Windows for each request
      const requestTimeout = process.platform === 'win32' ? 3000 : 1000;
      const response = await fetch(`http://localhost:${port}`, {
        signal: AbortSignal.timeout(requestTimeout)
      });
      
      // Server is ready if it responds with any HTTP status
      if (response.status >= 200 && response.status < 600) {
        // Additional stability check - make sure it responds consistently
        const stabilityDelay = process.platform === 'win32' ? 300 : 100;
        await new Promise(resolve => setTimeout(resolve, stabilityDelay));
        
        try {
          const confirmResponse = await fetch(`http://localhost:${port}`, {
            signal: AbortSignal.timeout(requestTimeout)
          });
          if (confirmResponse.status >= 200 && confirmResponse.status < 600) {
            return; // Server is stable and ready
          }
        } catch {
          // Continue waiting if confirmation fails
        }
      }
    } catch (error) {
      lastError = error;
      // Server not ready yet, continue waiting
    }
    
    // Longer polling interval on Windows
    const pollInterval = process.platform === 'win32' ? 500 : 200;
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Server not ready within ${timeout}ms. Last error: ${lastError?.message || 'unknown'}`);
}

/**
 * Test SSE connection to a server
 * @param {number} port - Server port
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Object} Connection test result
 */
export async function testSSEConnection(port, timeout = 5000) {
  return new Promise(async (resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`SSE connection test timeout after ${timeout}ms`));
    }, timeout);
    
    try {
      const response = await fetch(`http://localhost:${port}/__live-reload`, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        clearTimeout(timer);
        resolve({ connected: false, receivedMessage: false });
        return;
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let receivedMessage = false;
      
      // Read first chunk to see if we get a message
      const { done, value } = await reader.read();
      
      if (!done) {
        const chunk = decoder.decode(value);
        if (chunk.includes('data:')) {
          receivedMessage = true;
        }
      }
      
      clearTimeout(timer);
      controller.abort();
      
      resolve({ 
        connected: true, 
        receivedMessage 
      });
      
    } catch (error) {
      clearTimeout(timer);
      if (error.name !== 'AbortError') {
        resolve({ connected: false, receivedMessage: false });
      }
    }
  });
}

/**
 * Listen for a specific SSE reload event
 * @param {number} port - Server port
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} True if reload event received
 */
export async function listenForReloadEvent(port, timeout = 10000) {
  return new Promise(async (resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`SSE reload event not received within ${timeout}ms`));
    }, timeout);
    
    try {
      const response = await fetch(`http://localhost:${port}/__live-reload`, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`SSE endpoint returned ${response.status}: ${response.statusText}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          clearTimeout(timer);
          reject(new Error('SSE stream ended without reload event'));
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)); // Remove 'data: ' prefix
              
              if (data.type === 'reload') {
                clearTimeout(timer);
                controller.abort();
                resolve(true);
                return;
              }
              
              // Also accept 'connected' as a sign the SSE is working
              if (data.type === 'connected') {
                // Continue listening for reload event
                continue;
              }
            } catch (e) {
              // Invalid JSON, continue reading
              console.warn('Invalid SSE data:', line);
            }
          }
        }
      }
      
    } catch (error) {
      clearTimeout(timer);
      if (error.name !== 'AbortError') {
        reject(error);
      }
    }
  });
}

/**
 * Wait for build completion by checking file modification times
 * @param {string} outputDir - Output directory to check
 * @param {number} timeout - Maximum wait time in milliseconds
 */
export async function waitForBuild(outputDir, timeout = 5000) {
  // Check if index.html exists and was recently modified
  const indexPath = path.join(outputDir, 'index.html');
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const { file } = await import('bun');
      const stats = await file(indexPath).exists();
      if (stats) {
        // File exists, wait a bit more to ensure build is complete
        await new Promise(resolve => setTimeout(resolve, 500));
        return;
      }
    } catch {
      // File doesn't exist yet, continue waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // If we get here, just wait the remainder and assume build is done
  await new Promise(resolve => setTimeout(resolve, 500));
}
