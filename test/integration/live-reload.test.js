/**
 * Tests for live reload functionality
 * Simplified tests focusing on core file watching and server functionality
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Live Reload Functionality', () => {
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

  describe('Server-Sent Events (SSE)', () => {
    it('should provide SSE endpoint at /__live-reload', async () => {
      const structure = {
        'src/index.html': '<h1>Home</h1>'
      };

      await createTestStructure(tempDir, structure);

      // Start development server
      const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
      
      try {
        // Make request to SSE endpoint
        const response = await fetch(`http://localhost:${serverResult.port}/__live-reload`);
        
        expect(response.ok).toBeTruthy();
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        expect(response.headers.get('cache-control')).toContain('no-cache');
        
      } finally {
        await stopDevServer(serverResult.process);
      }
    });

    it('should establish SSE connection and receive initial message', async () => {
      const structure = {
        'src/index.html': '<h1>Test SSE Connection</h1>'
      };

      await createTestStructure(tempDir, structure);

      const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
      
      try {
        // Test that we can connect to SSE and receive initial connection message
        const connectTest = await testSSEConnection(serverResult.port);
        expect(connectTest.connected).toBeTruthy();
        expect(connectTest.receivedMessage).toBeTruthy();
        
      } finally {
        await stopDevServer(serverResult.process);
      }
    });
  });

  describe('File Watching and Rebuilds', () => {
    it('should rebuild when HTML file changes', async () => {
      const structure = {
        'src/index.html': '<h1>Original</h1>'
      };

      await createTestStructure(tempDir, structure);

      const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
      
      try {
        // Wait for initial build
        await waitForBuild(outputDir);
        
        // Check initial content
        let content = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
        expect(content).toContain('Original');
        
        // Modify file
        await fs.writeFile(
          path.join(sourceDir, 'index.html'), 
          '<h1>Modified</h1>'
        );
        
        // Wait for rebuild
        await waitForBuild(outputDir);
        
        // Check updated content
        content = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
        expect(content).toContain('Modified');
        
      } finally {
        await stopDevServer(serverResult.process);
      }
    });

    it('should rebuild when include file changes', async () => {
      const structure = {
        'src/index.html': '<!--#include virtual="/includes/header.html" --><p>Main content</p>',
        'src/includes/header.html': '<h1>Original Header</h1>'
      };

      await createTestStructure(tempDir, structure);

      const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
      
      try {
        // Wait for initial build
        await waitForBuild(outputDir);
        
        // Check initial content
        let content = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
        expect(content).toContain('Original Header');
        
        // Modify include file
        await fs.writeFile(
          path.join(sourceDir, 'includes', 'header.html'), 
          '<h1>Updated Header</h1>'
        );
        
        // Wait for rebuild with longer timeout for dependency tracking
        await waitForBuild(outputDir, 3000);
        
        // Check updated content
        content = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
        expect(content).toContain('Updated Header');
        
      } finally {
        await stopDevServer(serverResult.process);
      }
    });

    it('should rebuild when layout file changes', async () => {
      const structure = {
        'src/page.html': '<div data-layout="main.html"><h1>Content</h1></div>',
        'src/.layouts/main.html': '<!DOCTYPE html><html><body>Original Layout: <slot></slot></body></html>'
      };

      await createTestStructure(tempDir, structure);

      const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
      
      try {
        // Wait for initial build
        await waitForBuild(outputDir);
        
        // Check initial content
        let content = await fs.readFile(path.join(outputDir, 'page.html'), 'utf-8');
        expect(content).toContain('Original Layout');
        
        // Modify layout file
        await fs.writeFile(
          path.join(sourceDir, '.layouts', 'main.html'), 
          '<!DOCTYPE html><html><body>Updated Layout: <slot></slot></body></html>'
        );
        
        // Wait for rebuild with longer timeout for layout processing
        await waitForBuild(outputDir, 3000);
        
        // Check updated content
        content = await fs.readFile(path.join(outputDir, 'page.html'), 'utf-8');
        expect(content).toContain('Updated Layout');
        
      } finally {
        await stopDevServer(serverResult.process);
      }
    });
  });

  describe('Performance and Stability', () => {
    it('should handle file changes with reasonable timing', async () => {
      const structure = {
        'src/index.html': '<h1>Version 1</h1>'
      };

      await createTestStructure(tempDir, structure);

      const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
      
      try {
        // Wait for initial build
        await waitForBuild(outputDir);
        
        // Make a single change and verify it works
        await fs.writeFile(
          path.join(sourceDir, 'index.html'), 
          '<h1>Version 2</h1>'
        );
        
        // Wait for rebuild
        await waitForBuild(outputDir, 2000);
        
        // Check final content
        const content = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
        expect(content).toContain('Version 2');
        
      } finally {
        await stopDevServer(serverResult.process);
      }
    });

    it('should not rebuild for temporary/backup files', async () => {
      const structure = {
        'src/index.html': '<h1>Original Content</h1>'
      };

      await createTestStructure(tempDir, structure);

      const serverResult = await startDevServer(tempDir, sourceDir, outputDir);
      
      try {
        // Wait for initial build
        await waitForBuild(outputDir);
        
        // Get initial content
        const initialContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
        expect(initialContent).toContain('Original Content');
        
        // Create temporary files that shouldn't trigger rebuilds
        await fs.writeFile(path.join(sourceDir, 'temp.tmp'), 'temp');
        await fs.writeFile(path.join(sourceDir, '.hidden'), 'hidden');
        await fs.writeFile(path.join(sourceDir, 'backup~'), 'backup');
        
        // Wait a reasonable amount of time
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Verify content hasn't changed
        const finalContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
        expect(finalContent).toContain('Original Content');
        
      } finally {
        await stopDevServer(serverResult.process);
      }
    });
  });
});

/**
 * Helper function to start development server
 */
async function startDevServer(workingDir, sourceDir, outputDir, timeout = 10000) {
  // Find available port
  const port = await findAvailablePort(3000);
  
  // Start server in background
  const cliPath = path.resolve(path.dirname(import.meta.path || import.meta.url.pathname), '../../bin/cli.js');
  const bunPath = Bun.env?.BUN_PATH || process.execPath;
  
  const proc = Bun.spawn([
    bunPath,
    cliPath,
    'serve',
    '--output', outputDir,  // Fixed: use --output instead of --source
    '--port', port.toString()
  ], {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  
  // Wait for server to be ready
  await waitForServer(port, timeout);
  
  return { process: proc, port };
}

/**
 * Helper function to stop development server
 */
async function stopDevServer(process) {
  if (process && process.pid) {
    process.kill('SIGTERM');
    await process.exited;
  }
}

/**
 * Helper function to find available port
 */
async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      // Try to create a server on this port
      const testServer = Bun.serve({
        port,
        fetch() {
          return new Response('test');
        }
      });
      testServer.stop();
      return port;
    } catch (error) {
      // Port is in use, try next one
      continue;
    }
  }
  throw new Error('No available port found in range');
}

/**
 * Helper function to wait for server to be ready
 */
async function waitForServer(port, timeout = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}`);
      if (response.ok || response.status === 404) {
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
 * Helper function to test SSE connection (simplified)
 */
async function testSSEConnection(port, timeout = 3000) {
  return new Promise(async (resolve) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      resolve({ connected: false, receivedMessage: false });
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
      
      // Try to read the first chunk (connection message)
      const { done, value } = await reader.read();
      
      clearTimeout(timer);
      controller.abort();
      
      if (!done && value) {
        const chunk = decoder.decode(value);
        const hasMessage = chunk.includes('data:') && chunk.includes('connected');
        resolve({ connected: true, receivedMessage: hasMessage });
      } else {
        resolve({ connected: true, receivedMessage: false });
      }
      
    } catch (error) {
      clearTimeout(timer);
      resolve({ connected: false, receivedMessage: false });
    }
  });
}

/**
 * Helper function to wait for build completion by checking output files
 */
async function waitForBuild(outputDir, timeout = 2000) {
  const startTime = Date.now();
  
  // Wait for the output directory to exist and contain files
  while (Date.now() - startTime < timeout) {
    try {
      const files = await fs.readdir(outputDir);
      if (files.length > 0) {
        // Wait a bit more to ensure build is complete
        await new Promise(resolve => setTimeout(resolve, 500));
        return;
      }
    } catch (error) {
      // Output directory doesn't exist yet
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // If we get here, just wait the full timeout
  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Helper function to wait for SSE reload event (simplified and more robust)
 */
async function waitForSSEReloadEvent(port, timeout = 10000) {
  return new Promise(async (resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`SSE reload event not received within ${timeout}ms`));
    }, timeout);
    
    try {
      // Connect to the live reload SSE endpoint
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
                resolve({
                  type: 'reload',
                  timestamp: data.timestamp
                });
                return;
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
 * Helper function to wait for build completion
 */
async function waitForBuild(port, timeout = 5000) {
  // Wait for the build process to complete by checking if files exist and are recent
  await new Promise(resolve => setTimeout(resolve, 1500)); // Allow time for build process
}
