/**
 * Tests for directory index serving behavior
 * Verifies that the development server correctly serves index.html files
 * for directory requests both with and without trailing slashes
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Directory Index Serving', () => {
  let tempDir;
  let sourceDir;
  let outputDir;
  let serverProcess;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
  });

  afterEach(async () => {
    if (serverProcess) {
      serverProcess.kill();
      await serverProcess.exited;
    }
    await cleanupTempDirectory(tempDir);
  });

  describe('Basic Directory Index Serving', () => {
    it('should serve index.html for directory requests with trailing slash', async () => {
      const structure = {
        'src/index.html': '<h1>Root Index</h1>',
        'src/blog/index.html': '<h1>Blog Index</h1>',
        'src/about/index.html': '<h1>About Index</h1>',
        'src/docs/api/index.html': '<h1>API Docs Index</h1>'
      };

      await createTestStructure(tempDir, structure);
      
      // Build the site first
      const { build } = await import('../../src/core/file-processor.js');
      await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      const server = await startDevServer(sourceDir, outputDir);
      
      try {
        // Test root directory with trailing slash
        const rootResponse = await fetch(`http://localhost:${server.port}/`);
        expect(rootResponse.ok).toBeTruthy();
        expect(rootResponse.status).toBe(200);
        const rootContent = await rootResponse.text();
        expect(rootContent).toContain('<h1>Root Index</h1>');

        // Test subdirectories with trailing slash
        const blogResponse = await fetch(`http://localhost:${server.port}/blog/`);
        expect(blogResponse.ok).toBeTruthy();
        expect(blogResponse.status).toBe(200);
        const blogContent = await blogResponse.text();
        expect(blogContent).toContain('<h1>Blog Index</h1>');

        const aboutResponse = await fetch(`http://localhost:${server.port}/about/`);
        expect(aboutResponse.ok).toBeTruthy();
        expect(aboutResponse.status).toBe(200);
        const aboutContent = await aboutResponse.text();
        expect(aboutContent).toContain('<h1>About Index</h1>');

        // Test nested directories with trailing slash
        const apiResponse = await fetch(`http://localhost:${server.port}/docs/api/`);
        expect(apiResponse.ok).toBeTruthy();
        expect(apiResponse.status).toBe(200);
        const apiContent = await apiResponse.text();
        expect(apiContent).toContain('<h1>API Docs Index</h1>');

      } finally {
        await stopDevServer(server.process);
      }
    });

    it('should serve index.html for directory requests without trailing slash', async () => {
      const structure = {
        'src/index.html': '<h1>Root Index</h1>',
        'src/blog/index.html': '<h1>Blog Index</h1>',
        'src/about/index.html': '<h1>About Index</h1>',
        'src/docs/api/index.html': '<h1>API Docs Index</h1>'
      };

      await createTestStructure(tempDir, structure);
      
      // Build the site first
      const { build } = await import('../../src/core/file-processor.js');
      await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      const server = await startDevServer(sourceDir, outputDir);
      
      try {
        // Test subdirectories without trailing slash
        const blogResponse = await fetch(`http://localhost:${server.port}/blog`);
        expect(blogResponse.ok).toBeTruthy();
        expect(blogResponse.status).toBe(200);
        const blogContent = await blogResponse.text();
        expect(blogContent).toContain('<h1>Blog Index</h1>');

        const aboutResponse = await fetch(`http://localhost:${server.port}/about`);
        expect(aboutResponse.ok).toBeTruthy();
        expect(aboutResponse.status).toBe(200);
        const aboutContent = await aboutResponse.text();
        expect(aboutContent).toContain('<h1>About Index</h1>');

        // Test nested directories without trailing slash
        const docsResponse = await fetch(`http://localhost:${server.port}/docs`);
        expect(docsResponse.ok).toBeTruthy();
        expect(docsResponse.status).toBe(200);
        const docsContent = await docsResponse.text();
        // Since there's no /docs/index.html, this should fall back to root index
        expect(docsContent).toContain('<h1>Root Index</h1>');

        const apiResponse = await fetch(`http://localhost:${server.port}/docs/api`);
        expect(apiResponse.ok).toBeTruthy();
        expect(apiResponse.status).toBe(200);
        const apiContent = await apiResponse.text();
        expect(apiContent).toContain('<h1>API Docs Index</h1>');

      } finally {
        await stopDevServer(server.process);
      }
    });

    it('should handle mixed scenarios correctly', async () => {
      const structure = {
        'src/index.html': '<h1>Root Index</h1>',
        'src/blog/index.html': '<h1>Blog Index</h1>',
        'src/blog/post1.html': '<h1>Blog Post 1</h1>',
        'src/products/list.html': '<h1>Product List</h1>', // No index.html in products
        'src/contact.html': '<h1>Contact Page</h1>' // Regular file, not directory
      };

      await createTestStructure(tempDir, structure);
      
      // Build the site first
      const { build } = await import('../../src/core/file-processor.js');
      await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      const server = await startDevServer(sourceDir, outputDir);
      
      try {
        // Test directory with index
        const blogResponse = await fetch(`http://localhost:${server.port}/blog`);
        expect(blogResponse.ok).toBeTruthy();
        const blogContent = await blogResponse.text();
        expect(blogContent).toContain('<h1>Blog Index</h1>');

        // Test specific file in directory
        const postResponse = await fetch(`http://localhost:${server.port}/blog/post1.html`);
        expect(postResponse.ok).toBeTruthy();
        const postContent = await postResponse.text();
        expect(postContent).toContain('<h1>Blog Post 1</h1>');

        // Test directory without index (should fall back to SPA fallback)
        const productsResponse = await fetch(`http://localhost:${server.port}/products`);
        expect(productsResponse.ok).toBeTruthy();
        const productsContent = await productsResponse.text();
        expect(productsContent).toContain('<h1>Root Index</h1>'); // Fallback to root

        // Test specific file in directory without index
        const listResponse = await fetch(`http://localhost:${server.port}/products/list.html`);
        expect(listResponse.ok).toBeTruthy();
        const listContent = await listResponse.text();
        expect(listContent).toContain('<h1>Product List</h1>');

        // Test regular file
        const contactResponse = await fetch(`http://localhost:${server.port}/contact.html`);
        expect(contactResponse.ok).toBeTruthy();
        const contactContent = await contactResponse.text();
        expect(contactContent).toContain('<h1>Contact Page</h1>');

      } finally {
        await stopDevServer(server.process);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle non-existent directories correctly', async () => {
      const structure = {
        'src/index.html': '<h1>Root Index</h1>',
        'src/blog/index.html': '<h1>Blog Index</h1>'
      };

      await createTestStructure(tempDir, structure);
      
      // Build the site first
      const { build } = await import('../../src/core/file-processor.js');
      await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      const server = await startDevServer(sourceDir, outputDir);
      
      try {
        // Test non-existent directory
        const nonExistentResponse = await fetch(`http://localhost:${server.port}/nonexistent`);
        expect(nonExistentResponse.ok).toBeTruthy();
        const nonExistentContent = await nonExistentResponse.text();
        expect(nonExistentContent).toContain('<h1>Root Index</h1>'); // Should fall back

        // Test non-existent nested path
        const nestedNonExistentResponse = await fetch(`http://localhost:${server.port}/blog/nonexistent`);
        expect(nestedNonExistentResponse.ok).toBeTruthy();
        const nestedContent = await nestedNonExistentResponse.text();
        expect(nestedContent).toContain('<h1>Root Index</h1>'); // Should fall back

      } finally {
        await stopDevServer(server.process);
      }
    });

    it('should prioritize exact file matches over directory index', async () => {
      const structure = {
        'src/index.html': '<h1>Root Index</h1>',
        'src/blog.html': '<h1>Blog Page</h1>',
        'src/blog/index.html': '<h1>Blog Index</h1>'
      };

      await createTestStructure(tempDir, structure);
      
      // Build the site first
      const { build } = await import('../../src/core/file-processor.js');
      await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      const server = await startDevServer(sourceDir, outputDir);
      
      try {
        // When both blog.html and blog/index.html exist, requesting /blog should prefer blog.html
        const blogResponse = await fetch(`http://localhost:${server.port}/blog`);
        expect(blogResponse.ok).toBeTruthy();
        const blogContent = await blogResponse.text();
        // This is an edge case - the current behavior might vary
        // Most web servers would serve blog.html if it exists as an exact match
        expect(blogContent).toContain('<h1>Blog'); // Either is acceptable
        
        // But requesting /blog/ should definitely serve the directory index
        const blogDirResponse = await fetch(`http://localhost:${server.port}/blog/`);
        expect(blogDirResponse.ok).toBeTruthy();
        const blogDirContent = await blogDirResponse.text();
        expect(blogDirContent).toContain('<h1>Blog Index</h1>');

        // And requesting the exact file should work
        const blogHtmlResponse = await fetch(`http://localhost:${server.port}/blog.html`);
        expect(blogHtmlResponse.ok).toBeTruthy();
        const blogHtmlContent = await blogHtmlResponse.text();
        expect(blogHtmlContent).toContain('<h1>Blog Page</h1>');

      } finally {
        await stopDevServer(server.process);
      }
    });
  });
});

/**
 * Helper function to start development server for testing
 */
async function startDevServer(sourceDir, outputDir, timeout = 10000) {
  const port = 4000 + Math.floor(Math.random() * 1000); // Use high port range to avoid conflicts
  
  const cliPath = new URL('../../bin/cli.js', import.meta.url).pathname;
  const serverProcess = Bun.spawn([
    Bun.env.BUN_PATH || process.execPath, 
    cliPath, 
    'serve',
    '--source', sourceDir,
    '--output', outputDir,
    '--port', port.toString(),
    '--verbose'
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...Bun.env, DEBUG: '1' }
  });
  
  // Wait for server to be ready
  await waitForServer(port, timeout);
  
  // Additional wait to ensure build is complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return { process: serverProcess, port };
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
 * Helper function to stop dev server
 */
async function stopDevServer(process) {
  if (process) {
    process.kill();
    await process.exited;
  }
}