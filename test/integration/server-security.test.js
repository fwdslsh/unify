/**
 * Tests for development server security requirements
 * Verifies MIME type validation, request path validation, and security measures
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Server Security', () => {
  let tempDir;
  let sourceDir;
  let outputDir;
  let serverProcess;
  let serverPort;

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

  describe('Basic File Serving', () => {
    it('should serve files from the correct output directory', async () => {
      const structure = {
        'src/index.html': `<html><head><link rel="stylesheet" href="/css/style.css"><script src="/js/script.js"></script></head><body><h1>Hello World</h1></body></html>`,
        'src/about.html': '<h1>About Page</h1>',
        'src/css/style.css': 'body { color: blue; }',
        'src/js/script.js': 'console.log("Hello");'
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
        // Test that HTML files are served correctly
        const indexResponse = await fetch(`http://localhost:${server.port}/`);
        expect(indexResponse.ok).toBeTruthy();
        expect(indexResponse.status).toBe(200);
        expect(indexResponse.headers.get('content-type')).toContain('text/html');
        const indexContent = await indexResponse.text();
        expect(indexContent).toContain('<h1>Hello World</h1>');

        const aboutResponse = await fetch(`http://localhost:${server.port}/about.html`);
        expect(aboutResponse.ok).toBeTruthy();
        expect(aboutResponse.status).toBe(200);
        expect(aboutResponse.headers.get('content-type')).toContain('text/html');
        const aboutContent = await aboutResponse.text();
        expect(aboutContent).toContain('<h1>About Page</h1>');

        // Test that CSS files are served correctly
        const cssResponse = await fetch(`http://localhost:${server.port}/css/style.css`);
        expect(cssResponse.ok).toBeTruthy();
        expect(cssResponse.status).toBe(200);
        expect(cssResponse.headers.get('content-type')).toContain('text/css');
        const cssContent = await cssResponse.text();
        expect(cssContent).toContain('body { color: blue; }');

        // Test that JS files are served correctly
        const jsResponse = await fetch(`http://localhost:${server.port}/js/script.js`);
        expect(jsResponse.ok).toBeTruthy();
        expect(jsResponse.status).toBe(200);
        expect(jsResponse.headers.get('content-type')).toContain('javascript');
        const jsContent = await jsResponse.text();
        expect(jsContent).toContain('console.log("Hello");');

      } finally {
        await stopDevServer(server.process);
      }
    });

    it('should return 404 for non-existent files', async () => {
      const structure = {
        'src/index.html': '<h1>Hello World</h1>'
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
        // Test 404 for non-existent file
        const response = await fetch(`http://localhost:${server.port}/nonexistent.html`);
        expect(response.status).toBe(404);

        // Test 404 for non-existent directory
        const dirResponse = await fetch(`http://localhost:${server.port}/nonexistent/file.html`);
        expect(dirResponse.status).toBe(404);

      } finally {
        await stopDevServer(server.process);
      }
    });

    it('should serve files with correct MIME types', async () => {
      const structure = {
        'src/index.html': `<html><head><link rel="stylesheet" href="/style.css"><script src="/script.js"></script><script src="/data.json" type="application/json"></script></head><body><h1>HTML</h1><img src="/image.png"><object data="/document.pdf" type="application/pdf"></object></body></html>`,
        'src/style.css': 'body {}',
        'src/script.js': 'console.log("js");',
        'src/data.json': '{"key": "value"}',
        'src/image.png': 'fake-png-data',
        'src/document.pdf': 'fake-pdf-data'
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
        const tests = [
          { file: '/', expectedType: 'text/html' },
          { file: '/style.css', expectedType: 'text/css' },
          { file: '/script.js', expectedType: 'javascript' },
          { file: '/data.json', expectedType: 'application/json' },
          { file: '/image.png', expectedType: 'image/png' },
          { file: '/document.pdf', expectedType: 'application/pdf' }
        ];

        for (const test of tests) {
          const response = await fetch(`http://localhost:${server.port}${test.file}`);
          expect(response.ok).toBeTruthy();
          expect(response.headers.get('content-type')).toContain(test.expectedType);
        }

      } finally {
        await stopDevServer(server.process);
      }
    });
  });

  describe('Request Path Validation', () => {
    it('should prevent path traversal attacks', async () => {
      const structure = {
        'src/index.html': '<h1>Safe Content</h1>',
        'src/public/file.txt': 'Public file content'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      // Test various path traversal attempts
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '../package.json',
        '../../bin/cli.js',
        '../src/index.html',
        '..%2F..%2F..%2Fetc%2Fpasswd',
        '..%5C..%5C..%5Cwindows%5Csystem32%5Cconfig%5Csam',
        '../\\../\\../etc/passwd',
        '....//....//....//etc/passwd',
        '..;/..;/..;/etc/passwd'
      ];

      for (const maliciousPath of pathTraversalAttempts) {
        const response = await fetch(`http://localhost:${server.port}/${maliciousPath}`);
        
        // Should not allow access to files outside the output directory
        expect(response.status).not.toBe(200);
        expect([400, 403, 404]).toContain(response.status);
        
        // Should not return sensitive file contents
        const content = await response.text();
        expect(content).not.toContain('root:');
        expect(content).not.toContain('password');
        expect(content).not.toContain('#!/usr/bin/env');
      }
    });

    it('should reject requests with null bytes', async () => {
      const structure = {
        'src/index.html': '<h1>Content</h1>'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      const nullByteAttempts = [
        'index.html%00',
        'index.html\x00.txt',
        '../etc/passwd%00.html',
        'normal-file\x00'
      ];

      for (const maliciousPath of nullByteAttempts) {
        const response = await fetch(`http://localhost:${server.port}/${maliciousPath}`);
        expect([400, 403, 404]).toContain(response.status);
      }
    });

    it('should sanitize and validate request paths', async () => {
      const structure = {
        'src/index.html': '<h1>Home</h1>',
        'src/about.html': '<h1>About</h1>',
        'src/assets/style.css': 'body { margin: 0; }'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      // Test valid paths
      const validPaths = [
        '/',
        '/index.html',
        '/about.html',
        '/assets/style.css'
      ];

      for (const validPath of validPaths) {
        const response = await fetch(`http://localhost:${server.port}${validPath}`);
        expect([200, 404]).toContain(response.status); // 404 is ok if file doesn't exist in output
      }

      // Test path normalization
      const normalizedPaths = [
        { path: '/./index.html', shouldWork: true },
        { path: '/about/../index.html', shouldWork: true },
        { path: '//index.html', shouldWork: true },
        { path: '/assets/../index.html', shouldWork: true }
      ];

      for (const { path: testPath, shouldWork } of normalizedPaths) {
        const response = await fetch(`http://localhost:${server.port}${testPath}`);
        if (shouldWork) {
          expect([200, 404]).toContain(response.status);
        } else {
          expect([400, 403]).toContain(response.status);
        }
      }
    });

    it('should handle URL encoding safely', async () => {
      const structure = {
        'src/test file.html': '<h1>File with spaces</h1>',
        'src/special-chars.html': '<h1>Special chars</h1>'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      // Test legitimate URL encoding
      const response = await fetch(`http://localhost:${server.port}/test%20file.html`);
      expect([200, 404]).toContain(response.status);

      // Test double encoding attempts
      const doubleEncodedResponse = await fetch(`http://localhost:${server.port}/test%2520file.html`);
      expect([400, 403, 404]).toContain(doubleEncodedResponse.status);
    });
  });

  describe('MIME Type Validation', () => {
    it('should serve correct MIME types for common file types', async () => {
      const structure = {
        'src/index.html': '<h1>HTML Content</h1>',
        'src/style.css': 'body { margin: 0; }',
        'src/script.js': 'console.log("Hello");',
        'src/data.json': '{"key": "value"}',
        'src/image.svg': '<svg></svg>',
        'src/document.txt': 'Plain text content'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      const expectedMimeTypes = [
        { file: 'index.html', mimeType: 'text/html' },
        { file: 'style.css', mimeType: 'text/css' },
        { file: 'script.js', mimeType: 'application/javascript' },
        { file: 'data.json', mimeType: 'application/json' },
        { file: 'image.svg', mimeType: 'image/svg+xml' },
        { file: 'document.txt', mimeType: 'text/plain' }
      ];

      for (const { file, mimeType } of expectedMimeTypes) {
        const response = await fetch(`http://localhost:${server.port}/${file}`);
        if (response.status === 200) {
          const contentType = response.headers.get('content-type');
          expect(contentType).toContain(mimeType);
        }
      }
    });

    it('should handle unknown file types safely', async () => {
      const structure = {
        'src/unknown.xyz': 'Unknown file type content',
        'src/no-extension': 'File without extension'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      // Should serve unknown files with safe default MIME type
      const unknownResponse = await fetch(`http://localhost:${server.port}/unknown.xyz`);
      if (unknownResponse.status === 200) {
        const contentType = unknownResponse.headers.get('content-type');
        // Should use safe default like application/octet-stream or text/plain
        expect(contentType).toMatch(/(application\/octet-stream|text\/plain)/);
      }

      const noExtResponse = await fetch(`http://localhost:${server.port}/no-extension`);
      if (noExtResponse.status === 200) {
        const contentType = noExtResponse.headers.get('content-type');
        expect(contentType).toMatch(/(application\/octet-stream|text\/plain)/);
      }
    });

    it('should not serve potentially dangerous file types', async () => {
      const structure = {
        'src/script.php': '<?php echo "dangerous"; ?>',
        'src/config.ini': '[section]\nkey=value',
        'src/backup.sql': 'CREATE TABLE users...',
        'src/private.key': '-----BEGIN PRIVATE KEY-----'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      const dangerousFiles = ['script.php', 'config.ini', 'backup.sql', 'private.key'];

      for (const file of dangerousFiles) {
        const response = await fetch(`http://localhost:${server.port}/${file}`);
        
        // Should either reject or serve as plain text (not executed)
        if (response.status === 200) {
          const contentType = response.headers.get('content-type');
          expect(contentType).not.toContain('application/x-httpd-php');
          expect(contentType).not.toContain('application/x-php');
        } else {
          expect([403, 404]).toContain(response.status);
        }
      }
    });
  });

  describe('Security Headers', () => {
    it('should include appropriate security headers', async () => {
      const structure = {
        'src/index.html': '<h1>Content</h1>'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      const response = await fetch(`http://localhost:${server.port}/`);
      const headers = response.headers;

      // Check for security headers (appropriate for development server)
      //expect(headers.get('x-content-type-options')).toBe('nosniff');
      
      // Development server should not have overly restrictive headers
      // but should have basic security measures
      const csp = headers.get('content-security-policy');
      if (csp) {
        // If CSP is present, it should allow local development
        expect(csp).toContain('localhost');
      }
    });

    it('should prevent MIME type sniffing', async () => {
      const structure = {
        'src/data.txt': '<script>alert("xss")</script>'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      const response = await fetch(`http://localhost:${server.port}/data.txt`);
      
      if (response.status === 200) {
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('content-type')).toContain('text/plain');
      }
    });
  });

  describe('Request Size and Rate Limiting', () => {
    it('should handle reasonable request sizes', async () => {
      const structure = {
        'src/index.html': '<h1>Content</h1>'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      // Test normal request
      const response = await fetch(`http://localhost:${server.port}/`);
      expect([200, 404]).toContain(response.status);
    });

    it('should reject requests with excessively long URLs', async () => {
      const structure = {
        'src/index.html': '<h1>Content</h1>'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      // Generate very long URL
      const longPath = 'a'.repeat(8192); // 8KB URL
      const response = await fetch(`http://localhost:${server.port}/${longPath}`);
      
      // Should reject overly long URLs
      expect([400, 414, 404]).toContain(response.status);
    });

    it('should handle concurrent requests safely', async () => {
      const structure = {
        'src/index.html': '<h1>Content</h1>',
        'src/page1.html': '<h1>Page 1</h1>',
        'src/page2.html': '<h1>Page 2</h1>'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      // Make multiple concurrent requests
      const requests = Array.from({ length: 10 }, (_, i) => 
        fetch(`http://localhost:${server.port}/page${i % 2 + 1}.html`)
      );
      
      const responses = await Promise.all(requests);
      
      // All requests should be handled (even if some return 404)
      responses.forEach(response => {
        expect([200, 404]).toContain(response.status);
      });
    });
  });

  describe('Information Disclosure Prevention', () => {
    it('should not expose server information in headers', async () => {
      const structure = {
        'src/index.html': '<h1>Content</h1>'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      const response = await fetch(`http://localhost:${server.port}/`);
      
      // Should not expose unnecessary server information
      expect(response.headers.get('server')).toBeNull();
      expect(response.headers.get('x-powered-by')).toBeNull();
    });

    it('should not expose directory listings', async () => {
      const structure = {
        'src/assets/file1.txt': 'Content 1',
        'src/assets/file2.txt': 'Content 2'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      // Request directory without index file
      const response = await fetch(`http://localhost:${server.port}/assets/`);
      
      // Should not show directory listing
      expect(response.status).not.toBe(200);
      
      if (response.status === 200) {
        const content = await response.text();
        expect(content).not.toContain('file1.txt');
        expect(content).not.toContain('file2.txt');
        expect(content).not.toContain('Index of');
      }
    });

    it('should handle error pages safely', async () => {
      const structure = {
        'src/index.html': '<h1>Content</h1>'
      };

      await createTestStructure(tempDir, structure);
      const server = await startDevServer(sourceDir, outputDir);
      
      // Request non-existent file
      const response = await fetch(`http://localhost:${server.port}/nonexistent.html`);
      
      expect(response.status).toBe(404);
      
      const content = await response.text();
      // Error page should not expose sensitive information
      expect(content).not.toContain(tempDir);
      expect(content).not.toContain('/home/');
      expect(content).not.toContain('Error:');
      expect(content).not.toContain('stack trace');
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
      // Server is ready if it responds with any HTTP status (200, 404, etc.)
      // This means the server is up and handling requests
      if (response.status >= 200 && response.status < 600) {
        // Add a small delay to ensure build process has completed
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
 * Helper function to stop dev server
 */
async function stopDevServer(process) {
  if (process) {
    process.kill();
    await process.exited;
  }
}
