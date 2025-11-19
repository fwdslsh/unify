/**
 * Tests for live reload functionality
 * Simplified tests focusing on core file watching and server functional      await createTestStructure(tempDir, structure);

      const server = await startDevServer(sourceDir, outputDir, { workingDir: tempDir });
      
      try:*/

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';
import { startDevServer, stopDevServer, testSSEConnection, waitForBuild, cleanupAllServers } from '../fixtures/server-helper.js';

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
    // Clean up any servers created in this test
    await cleanupAllServers();
    await cleanupTempDirectory(tempDir);
  });

  describe('Server-Sent Events (SSE)', () => {
    it('should provide SSE endpoint at /__live-reload', async () => {
      const structure = {
        'src/index.html': '<h1>Home</h1>'
      };

      await createTestStructure(tempDir, structure);

      // Start development server
      const server = await startDevServer(sourceDir, outputDir, { workingDir: tempDir });
      
      try {
        // Make request to SSE endpoint
        const response = await fetch(`http://localhost:${server.port}/__live-reload`);
        
        expect(response.ok).toBeTruthy();
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        expect(response.headers.get('cache-control')).toContain('no-cache');
        
      } finally {
        await stopDevServer(server);
      }
    });

    it('should establish SSE connection and receive initial message', async () => {
      const structure = {
        'src/index.html': '<h1>Test SSE Connection</h1>'
      };

      await createTestStructure(tempDir, structure);

      const server = await startDevServer(sourceDir, outputDir, { workingDir: tempDir });
      
      try {
        // Test that we can connect to SSE and receive initial connection message
        const connectTest = await testSSEConnection(server.port);
        expect(connectTest.connected).toBeTruthy();
        expect(connectTest.receivedMessage).toBeTruthy();
        
      } finally {
        await stopDevServer(server);
      }
    });
  });

  describe('File Watching and Rebuilds', () => {
    it('should serve static files correctly', async () => {
      const structure = {
        'src/index.html': '<h1>Original</h1>'
      };

      await createTestStructure(tempDir, structure);

      const server = await startDevServer(sourceDir, outputDir, { workingDir: tempDir });
      
      try {
        // Check that the server serves the built content
        const response = await fetch(`http://localhost:${server.port}/`);
        expect(response.ok).toBeTruthy();
        const content = await response.text();
        expect(content).toContain('Original');
        
      } finally {
        await stopDevServer(server);
      }
    });

    it('should serve include-processed content correctly', async () => {
      const structure = {
        'src/index.html': '<include src="/includes/header.html" /><p>Main content</p>',
        'src/includes/header.html': '<h1>Test Header</h1>'
      };

      await createTestStructure(tempDir, structure);

      const server = await startDevServer(sourceDir, outputDir, { workingDir: tempDir });
      
      try {
        // Check that includes are processed correctly
        const response = await fetch(`http://localhost:${server.port}/`);
        expect(response.ok).toBeTruthy();
        const content = await response.text();
        expect(content).toContain('Test Header');
        expect(content).toContain('Main content');
        
      } finally {
        await stopDevServer(server);
      }
    });

    it('should serve layout-processed content correctly', async () => {
      const structure = {
        'src/page.html': '<div><h1>Content</h1></div>',
        'src/_includes/layout.html': '<!DOCTYPE html><html><body>Layout: <main data-slot="default"></main></body></html>'
      };

      await createTestStructure(tempDir, structure);

      const server = await startDevServer(sourceDir, outputDir, { workingDir: tempDir });
      
      try {
        // Check that layouts are processed correctly
        const response = await fetch(`http://localhost:${server.port}/page.html`);
        expect(response.ok).toBeTruthy();
        const content = await response.text();
        expect(content).toContain('Layout:');
        expect(content).toContain('Content');
        
      } finally {
        await stopDevServer(server);
      }
    });
  });

  describe('Performance and Stability', () => {
    it('should handle file changes with reasonable timing', async () => {
      const structure = {
        'src/index.html': '<h1>Version 1</h1>'
      };

      await createTestStructure(tempDir, structure);

      const server = await startDevServer(sourceDir, outputDir, { workingDir: tempDir });
      
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
        await stopDevServer(server);
      }
    });

    it('should not rebuild for temporary/backup files', async () => {
      const structure = {
        'src/index.html': '<h1>Original Content</h1>'
      };

      await createTestStructure(tempDir, structure);

      const server = await startDevServer(sourceDir, outputDir, { workingDir: tempDir });
      
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
        await stopDevServer(server);
      }
    });
  });
});
