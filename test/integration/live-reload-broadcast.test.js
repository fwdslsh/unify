/**
 * Test for live reload functionality - verifies that reload events are broadcast
 * when files change, including include files
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Live Reload - Broadcast Events', () => {
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

  it('should broadcast reload event when main HTML file changes', async () => {
    const structure = {
      'src/index.html': '<h1>Original Content</h1>',
    };

    await createTestStructure(tempDir, structure);
    const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
    
    try {
      await waitForInitialBuild();
      
      // Start monitoring for reload events
      const reloadPromise = listenForReloadEvent(serverResult.port);
      
      // Modify main file
      await fs.writeFile(
        path.join(sourceDir, 'index.html'), 
        '<h1>Updated Content</h1>'
      );
      
      // Wait for reload event
      const reloadReceived = await Promise.race([
        reloadPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Reload event timeout')), 8000)
        )
      ]);
      
      expect(reloadReceived).toBe(true);
      
    } finally {
      await stopDevServer(serverResult.process);
    }
  });

  it('should broadcast reload event when include file changes', async () => {
    const structure = {
      'src/index.html': '<!--#include virtual="/includes/header.html" --><p>Main content</p>',
      'src/includes/header.html': '<h1>Original Header</h1>'
    };

    await createTestStructure(tempDir, structure);
    const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
    
    try {
      await waitForInitialBuild();
      
      // Start monitoring for reload events  
      const reloadPromise = listenForReloadEvent(serverResult.port);
      
      // Modify include file
      await fs.writeFile(
        path.join(sourceDir, 'includes', 'header.html'), 
        '<h1>Updated Header</h1>'
      );
      
      // Wait for reload event
      const reloadReceived = await Promise.race([
        reloadPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Reload event timeout')), 8000)
        )
      ]);
      
      expect(reloadReceived).toBe(true);
      
    } finally {
      await stopDevServer(serverResult.process);
    }
  });

  it('should broadcast reload event when CSS file changes', async () => {
    const structure = {
      'src/index.html': '<link rel="stylesheet" href="/css/style.css"><h1>Page</h1>',
      'src/css/style.css': 'body { background: white; }'
    };

    await createTestStructure(tempDir, structure);
    const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
    
    try {
      await waitForInitialBuild();
      
      // Start monitoring for reload events
      const reloadPromise = listenForReloadEvent(serverResult.port);
      
      // Modify CSS file
      await fs.writeFile(
        path.join(sourceDir, 'css', 'style.css'), 
        'body { background: blue; }'
      );
      
      // Wait for reload event
      const reloadReceived = await Promise.race([
        reloadPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Reload event timeout')), 8000)
        )
      ]);
      
      expect(reloadReceived).toBe(true);
      
    } finally {
      await stopDevServer(serverResult.process);
    }
  });
});

/**
 * Helper functions
 */

async function startDevServer(workingDir, sourceDir, outputDir) {
  const port = await findAvailablePort(3200);
  
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
    stdio: ['ignore', 'ignore', 'ignore'], // Suppress output for cleaner test logs
  });
  
  await waitForServer(port);
  return { process: serverProcess, port };
}

async function stopDevServer(process) {
  process.kill();
  await process.exited;
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      const server = Bun.serve({ port, fetch() { return new Response(); } });
      server.stop();
      return port;
    } catch {
      continue;
    }
  }
  throw new Error('No available port found');
}

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
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server not ready within ${timeout}ms`);
}

async function waitForInitialBuild() {
  // Give time for initial build to complete
  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Listen for reload events using native fetch streaming
 */
async function listenForReloadEvent(port, timeout = 6000) {
  return new Promise(async (resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Timeout waiting for reload event'));
    }, timeout);
    
    try {
      const response = await fetch(`http://localhost:${port}/__live-reload`, {
        signal: controller.signal,
        headers: { 'Accept': 'text/event-stream' }
      });
      
      if (!response.ok) {
        throw new Error(`SSE endpoint returned ${response.status}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        
        // Look for reload event
        if (chunk.includes('data:') && chunk.includes('"type":"reload"')) {
          clearTimeout(timer);
          controller.abort();
          resolve(true);
          return;
        }
      }
      
      clearTimeout(timer);
      reject(new Error('SSE stream ended without reload event'));
      
    } catch (error) {
      clearTimeout(timer);
      if (error.name !== 'AbortError') {
        reject(error);
      }
    }
  });
}
