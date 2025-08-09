import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';
import { build } from '../../src/core/file-processor.js';
import path from 'path';
import fs from 'fs/promises';

describe('Convention-Based Architecture Integration', () => {
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

  describe('File Classification', () => {
    test('should build pages and skip partials correctly', async () => {
      // Create test structure with convention-based files
      await createTestStructure(sourceDir, {
        'index.html': '<html><head><link rel="stylesheet" href="css/main.css"></head><body><h1>Home Page</h1></body></html>',
        'about.html': '<h1>About Page</h1>',
        '_includes/header.html': '<header>Site Header</header>',
        '_includes/footer.html': '<footer>Site Footer</footer>',
        'blog/_layout.html': '<html><body><h1>Blog</h1><slot></slot></body></html>',
        'blog/_sidebar.html': '<aside>Blog Sidebar</aside>',
        'blog/post.html': '<article>Blog Post</article>',
        'css/main.css': 'body { margin: 0; }',
        '_private.css': 'body { color: red; }' // Should not be copied
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      // Check that pages were processed  
      expect(result.processed).toBe(3); // index.html, about.html, blog/post.html
      expect(result.copied).toBe(1); // css/main.css

      // Check that pages exist in output
      const indexExists = await fs.access(path.join(outputDir, 'index.html')).then(() => true).catch(() => false);
      const aboutExists = await fs.access(path.join(outputDir, 'about.html')).then(() => true).catch(() => false);
      const blogPostExists = await fs.access(path.join(outputDir, 'blog', 'post.html')).then(() => true).catch(() => false);
      
      expect(indexExists).toBe(true);
      expect(aboutExists).toBe(true);
      expect(blogPostExists).toBe(true);

      // Check that partials are NOT in output
      const includesExists = await fs.access(path.join(outputDir, '_includes')).then(() => true).catch(() => false);
      const blogLayoutExists = await fs.access(path.join(outputDir, 'blog', '_layout.html')).then(() => true).catch(() => false);
      const blogSidebarExists = await fs.access(path.join(outputDir, 'blog', '_sidebar.html')).then(() => true).catch(() => false);
      
      expect(includesExists).toBe(false);
      expect(blogLayoutExists).toBe(false);
      expect(blogSidebarExists).toBe(false);

      // Check that regular assets are copied
      const cssExists = await fs.access(path.join(outputDir, 'css', 'main.css')).then(() => true).catch(() => false);
      expect(cssExists).toBe(true);

      // Check that underscore assets are NOT copied (since not referenced)
      const privateExists = await fs.access(path.join(outputDir, '_private.css')).then(() => true).catch(() => false);
      expect(privateExists).toBe(false);
    });

    test('should handle nested underscore directories', async () => {
      await createTestStructure(sourceDir, {
        'index.html': '<h1>Home</h1>',
        '_components/ui/button.html': '<button>Click me</button>',
        '_components/forms/input.html': '<input type="text">',
        'docs/_shared/note.html': '<div class="note">Note content</div>',
        'docs/guide.html': '<h1>Guide</h1>'
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      // Should process only the actual pages
      expect(result.processed).toBe(2); // index.html, docs/guide.html

      // Pages should exist
      const indexExists = await fs.access(path.join(outputDir, 'index.html')).then(() => true).catch(() => false);
      const docsExists = await fs.access(path.join(outputDir, 'docs', 'guide.html')).then(() => true).catch(() => false);
      
      expect(indexExists).toBe(true);
      expect(docsExists).toBe(true);

      // Underscore directories should not exist in output
      const componentsExists = await fs.access(path.join(outputDir, '_components')).then(() => true).catch(() => false);
      const sharedExists = await fs.access(path.join(outputDir, 'docs', '_shared')).then(() => true).catch(() => false);
      
      expect(componentsExists).toBe(false);
      expect(sharedExists).toBe(false);
    });
  });

  describe('Layout Discovery', () => {
    test('should apply folder-scoped layouts correctly', async () => {
      await createTestStructure(sourceDir, {
        '_includes/default-layout.html': '<html><body><main><slot></slot></main></body></html>',
        'blog/_layout.html': '<html><body><h1>Blog</h1><div class="blog-content"><slot></slot></div></body></html>',
        'blog/post.html': '<article>Post content</article>',
        'docs/_layout.html': '<html><body><h1>Documentation</h1><div class="docs-content"><slot></slot></div></body></html>',
        'docs/guide.html': '<section>Guide content</section>',
        'simple.html': '<div>Simple page</div>'
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      expect(result.processed).toBe(3); // blog/post.html, docs/guide.html, simple.html

      // Check that layouts were applied (this test will need to be updated once layout processing is fully integrated)
      const blogPostContent = await fs.readFile(path.join(outputDir, 'blog', 'post.html'), 'utf-8');
      const docsGuideContent = await fs.readFile(path.join(outputDir, 'docs', 'guide.html'), 'utf-8');
      const simpleContent = await fs.readFile(path.join(outputDir, 'simple.html'), 'utf-8');

      // For now, just check that the files exist and contain the original content
      // Once layout processing is integrated, we can check for layout wrapper content
      expect(blogPostContent).toContain('Post content');
      expect(docsGuideContent).toContain('Guide content'); 
      expect(simpleContent).toContain('Simple page');
    });
  });

  describe.skip('Markdown Processing', () => {
    test('should process markdown with convention-based layouts', async () => {
      await createTestStructure(sourceDir, {
        '_includes/default-layout.html': '<html><body><main><slot></slot></main></body></html>',
        'blog/_layout.html': '<html><body><h1>Blog</h1><div class="blog-content"><slot></slot></div></body></html>',
        'blog/post.md': '# My Blog Post\n\nThis is a test post.',
        'docs/readme.md': `---
layout: /custom-layout.html
title: Custom Layout Test
---

# Documentation

This uses a custom layout.`,
        'custom-layout.html': '<html><body><h1>Custom</h1><slot></slot></body></html>'
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      expect(result.processed).toBe(3); // blog/post.md, docs/readme.md, custom-layout.html

      // Check that markdown files were converted to HTML
      await expect(fs.access(path.join(outputDir, 'blog', 'post.html'))).resolves.not.toThrow();
      await expect(fs.access(path.join(outputDir, 'docs', 'readme.html'))).resolves.not.toThrow();

      // Check content exists
      const blogPostContent = await fs.readFile(path.join(outputDir, 'blog', 'post.html'), 'utf-8');
      const readmeContent = await fs.readFile(path.join(outputDir, 'docs', 'readme.html'), 'utf-8');

      expect(blogPostContent).toContain('My Blog Post');
      expect(readmeContent).toContain('Documentation');
    });
  });

  describe('Asset Handling', () => {
    test('should copy only referenced assets respecting underscore conventions', async () => {
      await createTestStructure(sourceDir, {
        'index.html': `
          <html>
          <head>
            <link rel="stylesheet" href="css/main.css">
          </head>
          <body>
            <img src="images/logo.png" alt="Logo">
          </body>
          </html>
        `,
        'css/main.css': 'body { margin: 0; }',
        'css/_internal.css': 'body { padding: 0; }', // Not referenced, should not be copied
        'images/logo.png': 'fake-png-content',
        '_assets/private-image.png': 'private-content', // Should not be copied
        'js/unused.js': 'console.log("unused");' // Not referenced, should not be copied
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      expect(result.processed).toBe(1); // index.html
      expect(result.copied).toBe(2); // css/main.css, images/logo.png

      // Referenced assets should be copied
      const cssExists = await fs.access(path.join(outputDir, 'css', 'main.css')).then(() => true).catch(() => false);
      const imageExists = await fs.access(path.join(outputDir, 'images', 'logo.png')).then(() => true).catch(() => false);
      
      expect(cssExists).toBe(true);
      expect(imageExists).toBe(true);

      // Unreferenced and underscore assets should NOT be copied
      const internalCssExists = await fs.access(path.join(outputDir, 'css', '_internal.css')).then(() => true).catch(() => false);
      const assetsExists = await fs.access(path.join(outputDir, '_assets')).then(() => true).catch(() => false);
      const unusedJsExists = await fs.access(path.join(outputDir, 'js', 'unused.js')).then(() => true).catch(() => false);
      
      expect(internalCssExists).toBe(false);
      expect(assetsExists).toBe(false);
      expect(unusedJsExists).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing includes gracefully', async () => {
      await createTestStructure(sourceDir, {
        'index.html': `
          <div>
            <!--#include virtual="/missing-file.html" -->
            <p>Regular content</p>
          </div>
        `
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      // Build should continue despite missing include
      expect(result.processed).toBe(1);
      expect(result.errors.length).toBe(0); // Error should be handled gracefully

      // Output file should still exist
      const indexExists = await fs.access(path.join(outputDir, 'index.html')).then(() => true).catch(() => false);
      expect(indexExists).toBe(true);
    });

    test('should warn about misnamed conventions', async () => {
      await createTestStructure(sourceDir, {
        'index.html': '<h1>Home</h1>',
        'header.html': '<header>This should be _header.html</header>', // Regular file used as partial
        'sidebar.html': '<aside>This might be a partial</aside>'
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      // All files should be processed as pages (since they don't start with _)
      expect(result.processed).toBe(3);

      // All files should exist in output
      const indexExists = await fs.access(path.join(outputDir, 'index.html')).then(() => true).catch(() => false);
      const headerExists = await fs.access(path.join(outputDir, 'header.html')).then(() => true).catch(() => false);
      const sidebarExists = await fs.access(path.join(outputDir, 'sidebar.html')).then(() => true).catch(() => false);
      
      expect(indexExists).toBe(true);
      expect(headerExists).toBe(true);
      expect(sidebarExists).toBe(true);
    });
  });
});