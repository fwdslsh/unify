/**
 * Tests for live reload functionality - include file changes
 * This test ensures that when an include file changes, a reload event is broadcast
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Live Reload - Include File Changes', () => {
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  it('should trigger rebuild when include file changes', async () => {
    const structure = {
      'src/index.html': '<!--#include virtual="/includes/header.html" --><p>Main content</p>',
      'src/includes/header.html': '<h1>Original Header</h1>'
    };

    await createTestStructure(tempDir, structure);

    const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
    
    try {
      // Wait for initial build
      await waitForBuild();
      
      // Check initial content
      let content = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(content).toContain('Original Header');
      
      // Modify include file
      await fs.writeFile(
        path.join(sourceDir, 'includes', 'header.html'), 
        '<h1>Updated Header</h1>'
      );
      
      // Wait for rebuild (includes should trigger rebuild)
      await waitForBuild();
      
      // Check updated content
      content = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(content).toContain('Updated Header');
      
    } finally {
      await stopDevServer(serverResult.process);
    }
  });

  it('should broadcast reload event when include file changes', async () => {
    const structure = {
      'src/index.html': '<!--#include virtual="/includes/nav.html" --><main>Content</main>',
      'src/includes/nav.html': '<nav>Original Navigation</nav>'
    };

    await createTestStructure(tempDir, structure);

    const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
    
    try {
      // Wait for initial build
      await waitForBuild();
      
      // Start monitoring SSE endpoint for reload events
      const reloadPromise = listenForReloadEvent(serverResult.port);
      
      // Modify include file to trigger reload
      await fs.writeFile(
        path.join(sourceDir, 'includes', 'nav.html'), 
        '<nav>Updated Navigation Menu</nav>'
      );
      
      // Wait for reload event (with timeout)
      const reloadReceived = await Promise.race([
        reloadPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Reload event timeout')), 8000)
        )
      ]);
      
      expect(reloadReceived).toBe(true);
      
      // Verify the content was also updated
      await waitForBuild();
      const content = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(content).toContain('Updated Navigation Menu');
      
    } finally {
      await stopDevServer(serverResult.process);
    }
  });
});

/**
 * Helper function to start development server
 */
async function startDevServer(workingDir, sourceDir, outputDir) {
  // Find available port
  const port = await findAvailablePort(3100);
  
  // Start server in background
  const cliPath = new URL('../../bin/cli.js', import.meta.url).pathname;
  const bunPath = Bun.env.BUN_PATH || process.execPath;
  const serverProcess = Bun.spawn([
    bunPath, 
    cliPath, 
    'serve',
    '--source', sourceDir,
    '--output', outputDir,
    '--port', port.toString()
  ], {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  
  // Wait for server to be ready
  await waitForServer(port);
  
  return { process: serverProcess, port };
}

/**
 * Helper function to stop development server
 */
async function stopDevServer(process) {
  process.kill();
  await process.exited;
}

/**
 * Helper function to find available port
 */
async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      const server = Bun.serve({
        port,
        fetch() {
          return new Response();
        }
      });
      server.stop();
      return port;
    } catch {
      continue;
    }
  }
  throw new Error('No available port found');
}

/**
 * Helper function to wait for server to be ready
 */
async function waitForServer(port, timeout = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}`);
      // Accept any HTTP status code (200-599) as server being ready
      if (response.status >= 200 && response.status < 600) {
        // Add delay to ensure build process completes
        await new Promise(resolve => setTimeout(resolve, 200));
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Server not ready within ${timeout}ms`);
}

/**
 * Helper function to wait for build completion
 */
async function waitForBuild() {
  // Allow time for file system events and build to complete
  await new Promise(resolve => setTimeout(resolve, 1500));
}

/**
 * Helper function to listen for reload events from SSE endpoint
 * Uses curl to connect to the SSE stream and parse events
 */
async function listenForReloadEvent(port, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      process.kill();
      reject(new Error('Timeout waiting for reload event'));
    }, timeout);
    
    // Use curl to connect to SSE endpoint
    const process = Bun.spawn([
      'curl', 
      '-N', 
      '--silent',
      '--no-buffer',
      `http://localhost:${port}/__live-reload`
    ], {
      stdout: 'pipe',
      stderr: 'ignore'
    });
    
    // Read from stdout and look for reload events
    const reader = process.stdout.getReader();
    const decoder = new TextDecoder();
    
    const readStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          
          // Look for reload event in SSE data
          if (chunk.includes('data:') && chunk.includes('"type":"reload"')) {
            clearTimeout(timer);
            process.kill();
            resolve(true);
            return;
          }
        }
      } catch (error) {
        if (!timer._destroyed) {
          clearTimeout(timer);
          reject(error);
        }
      }
    };
    
    readStream();
  });
}
