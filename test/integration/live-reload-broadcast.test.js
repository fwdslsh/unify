/**
 * Test for live reload functionality - verifies that reload events are broadcast
 * when files change, including include files
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';
import { startDevServer, stopDevServer, listenForReloadEvent, waitForBuild, cleanupAllServers } from '../fixtures/server-helper.js';

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
    // Clean up any servers created in this test
    await cleanupAllServers();
    await cleanupTempDirectory(tempDir);
  });

  it('should broadcast reload event when main HTML file changes', async () => {
    const structure = {
      'src/index.html': '<h1>Original Content</h1>',
    };

    await createTestStructure(tempDir, structure);
    const server = await startDevServer(sourceDir, outputDir, { workingDir: tempDir });
    
    try {
      await waitForInitialBuild();
      
      // Start monitoring for reload events
      const reloadPromise = listenForReloadEvent(server.port);
      
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
      await stopDevServer(server);
    }
  });

  it('should broadcast reload event when include file changes', async () => {
    const structure = {
      'src/index.html': '<include src="/includes/header.html" /><p>Main content</p>',
      'src/includes/header.html': '<h1>Original Header</h1>'
    };

    await createTestStructure(tempDir, structure);
    const server = await startDevServer(sourceDir, outputDir, { workingDir: tempDir });
    
    try {
      await waitForInitialBuild();
      
      // Start monitoring for reload events  
      const reloadPromise = listenForReloadEvent(server.port);
      
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
      await stopDevServer(server);
    }
  });

  it('should broadcast reload event when CSS file changes', async () => {
    const structure = {
      'src/index.html': '<link rel="stylesheet" href="/css/style.css"><h1>Page</h1>',
      'src/css/style.css': 'body { background: white; }'
    };

    await createTestStructure(tempDir, structure);
    const server = await startDevServer(sourceDir, outputDir, { workingDir: tempDir });
    
    try {
      await waitForInitialBuild();
      
      // Start monitoring for reload events
      const reloadPromise = listenForReloadEvent(server.port);
      
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
      await stopDevServer(server);
    }
  });
});

// Helper function to wait for initial build
async function waitForInitialBuild() {
  await new Promise(resolve => setTimeout(resolve, 1000));
}
