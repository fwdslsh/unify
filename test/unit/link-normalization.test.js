/**
 * Test for link normalization with --pretty-urls option
 * This test verifies that links in HTML content are transformed appropriately
 * when pretty URLs are enabled during the build process.
 */

import { describe, test, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { build } from '../../src/core/file-processor.js';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Link Normalization with Pretty URLs', () => {
  let tempDir, sourceDir, outputDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  test('should transform relative .html links to pretty URLs when --pretty-urls is enabled', async () => {
    // Create test structure with links
    await createTestStructure(sourceDir, {
      'index.html': `
        <html>
          <head><title>Home</title></head>
          <body>
            <nav>
              <a href="./about.html">About</a>
              <a href="./blog.html">Blog</a>
              <a href="./contact.html">Contact</a>
            </nav>
            <main>
              <h1>Home Page</h1>
              <p>Welcome to our site!</p>
            </main>
          </body>
        </html>
      `,
      'about.html': `
        <html>
          <head><title>About</title></head>
          <body>
            <nav>
              <a href="./index.html">Home</a>
              <a href="./blog.html">Blog</a>
            </nav>
            <main>
              <h1>About Us</h1>
            </main>
          </body>
        </html>
      `,
      'blog.html': `
        <html>
          <head><title>Blog</title></head>
          <body>
            <nav>
              <a href="./index.html">Home</a>
              <a href="./about.html">About</a>
            </nav>
            <main>
              <h1>Blog</h1>
            </main>
          </body>
        </html>
      `,
      'contact.html': '<html><head><title>Contact</title></head><body><h1>Contact Us</h1></body></html>'
    });

    // Build with pretty URLs enabled
    const result = await build({
      source: sourceDir,
      output: outputDir,
      prettyUrls: true
    });

    expect(result.processed).toBe(4);

    // Check that files are built with pretty URLs structure
    const indexExists = await fs.access(path.join(outputDir, 'index.html')).then(() => true).catch(() => false);
    expect(indexExists).toBe(true);
    
    const aboutIndexExists = await fs.access(path.join(outputDir, 'about', 'index.html')).then(() => true).catch(() => false);
    expect(aboutIndexExists).toBe(true);

    // Check that links in HTML content are transformed
    const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    
    // Links should be transformed from ./about.html to /about/
    expect(indexContent).toContain('href="/about/"');
    expect(indexContent).toContain('href="/blog/"');
    expect(indexContent).toContain('href="/contact/"');
    
    // Original .html links should not be present
    expect(indexContent).not.toContain('href="./about.html"');
    expect(indexContent).not.toContain('href="./blog.html"');

    // Check links in about page
    const aboutContent = await fs.readFile(path.join(outputDir, 'about', 'index.html'), 'utf-8');
    expect(aboutContent).toContain('href="/"'); // index.html should become /
    expect(aboutContent).toContain('href="/blog/"');
    expect(aboutContent).not.toContain('href="./index.html"');
  });

  test('should transform absolute .html links to pretty URLs when --pretty-urls is enabled', async () => {
    await createTestStructure(sourceDir, {
      'index.html': `
        <html>
          <head><title>Home</title></head>
          <body>
            <nav>
              <a href="/about.html">About</a>
              <a href="/blog.html">Blog</a>
            </nav>
            <main><h1>Home</h1></main>
          </body>
        </html>
      `,
      'about.html': '<html><head><title>About</title></head><body><h1>About</h1></body></html>',
      'blog.html': '<html><head><title>Blog</title></head><body><h1>Blog</h1></body></html>'
    });

    const result = await build({
      source: sourceDir,
      output: outputDir,
      prettyUrls: true
    });

    expect(result.processed).toBe(3);

    const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    
    // Absolute links should also be transformed
    expect(indexContent).toContain('href="/about/"');
    expect(indexContent).toContain('href="/blog/"');
    expect(indexContent).not.toContain('href="/about.html"');
    expect(indexContent).not.toContain('href="/blog.html"');
  });

  test('should NOT transform links when --pretty-urls is disabled', async () => {
    await createTestStructure(sourceDir, {
      'index.html': `
        <html>
          <head><title>Home</title></head>
          <body>
            <nav>
              <a href="./about.html">About</a>
              <a href="/blog.html">Blog</a>
            </nav>
            <main><h1>Home</h1></main>
          </body>
        </html>
      `,
      'about.html': '<html><head><title>About</title></head><body><h1>About</h1></body></html>',
      'blog.html': '<html><head><title>Blog</title></head><body><h1>Blog</h1></body></html>'
    });

    const result = await build({
      source: sourceDir,
      output: outputDir,
      prettyUrls: false
    });

    expect(result.processed).toBe(3);

    const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    
    // Links should remain unchanged when pretty URLs are disabled
    expect(indexContent).toContain('href="./about.html"');
    expect(indexContent).toContain('href="/blog.html"');
    expect(indexContent).not.toContain('href="/about/"');
    expect(indexContent).not.toContain('href="/blog/"');
  });

  test('should preserve external links and non-HTML links unchanged', async () => {
    await createTestStructure(sourceDir, {
      'index.html': `
        <html>
          <head><title>Home</title></head>
          <body>
            <nav>
              <a href="./about.html">About</a>
              <a href="https://example.com">External</a>
              <a href="mailto:test@example.com">Email</a>
              <a href="/assets/document.pdf">PDF</a>
              <a href="/styles.css">CSS</a>
              <a href="#section">Fragment</a>
            </nav>
            <main><h1>Home</h1></main>
          </body>
        </html>
      `,
      'about.html': '<html><head><title>About</title></head><body><h1>About</h1></body></html>'
    });

    const result = await build({
      source: sourceDir,
      output: outputDir,
      prettyUrls: true
    });

    expect(result.processed).toBe(2);

    const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    
    // HTML link should be transformed
    expect(indexContent).toContain('href="/about/"');
    
    // Non-HTML links should remain unchanged
    expect(indexContent).toContain('href="https://example.com"');
    expect(indexContent).toContain('href="mailto:test@example.com"');
    expect(indexContent).toContain('href="/assets/document.pdf"');
    expect(indexContent).toContain('href="/styles.css"');
    expect(indexContent).toContain('href="#section"');
  });

  test('should handle nested directory links correctly', async () => {
    await createTestStructure(sourceDir, {
      'index.html': `
        <html>
          <head><title>Home</title></head>
          <body>
            <nav>
              <a href="./docs/guide.html">Guide</a>
              <a href="/docs/api.html">API</a>
            </nav>
            <main><h1>Home</h1></main>
          </body>
        </html>
      `,
      'docs/guide.html': `
        <html>
          <head><title>Guide</title></head>
          <body>
            <nav>
              <a href="../index.html">Home</a>
              <a href="./api.html">API</a>
            </nav>
            <main><h1>Guide</h1></main>
          </body>
        </html>
      `,
      'docs/api.html': '<html><head><title>API</title></head><body><h1>API</h1></body></html>'
    });

    const result = await build({
      source: sourceDir,
      output: outputDir,
      prettyUrls: true
    });

    expect(result.processed).toBe(3);

    // Check root page links
    const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    expect(indexContent).toContain('href="/docs/guide/"');
    expect(indexContent).toContain('href="/docs/api/"');

    // Check nested page links
    const guideContent = await fs.readFile(path.join(outputDir, 'docs', 'guide', 'index.html'), 'utf-8');
    expect(guideContent).toContain('href="/"'); // ../index.html -> /
    expect(guideContent).toContain('href="/docs/api/"'); // ./api.html -> /docs/api/
  });

  test('should handle links with query parameters and fragments', async () => {
    await createTestStructure(sourceDir, {
      'index.html': `
        <html>
          <head><title>Home</title></head>
          <body>
            <nav>
              <a href="./about.html?tab=info">About Info</a>
              <a href="/blog.html#latest">Latest Blog</a>
              <a href="./contact.html?form=1#contact-form">Contact Form</a>
            </nav>
            <main><h1>Home</h1></main>
          </body>
        </html>
      `,
      'about.html': '<html><head><title>About</title></head><body><h1>About</h1></body></html>',
      'blog.html': '<html><head><title>Blog</title></head><body><h1>Blog</h1></body></html>',
      'contact.html': '<html><head><title>Contact</title></head><body><h1>Contact</h1></body></html>'
    });

    const result = await build({
      source: sourceDir,
      output: outputDir,
      prettyUrls: true
    });

    expect(result.processed).toBe(4);

    const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    
    // Links should preserve query parameters and fragments
    expect(indexContent).toContain('href="/about/?tab=info"');
    expect(indexContent).toContain('href="/blog/#latest"');
    expect(indexContent).toContain('href="/contact/?form=1#contact-form"');
  });
});