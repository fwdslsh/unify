import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';
import { processHtmlUnified } from '../../src/core/unified-html-processor.js';
import { DependencyTracker } from '../../src/core/dependency-tracker.js';
import path from 'path';

describe('HTML Page Types', () => {
  let tempDir;
  let sourceDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  describe('Page Fragment vs Full HTML Documents', () => {
    test('should process page fragment with data-layout attribute', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': `<!DOCTYPE html>
<html>
<head><title>Site Layout</title></head>
<body><main><slot></slot></main></body>
</html>`,
        'fragment.html': `<div data-layout="_layout.html">
  <h1>Fragment Content</h1>
  <p>This is a page fragment.</p>
</div>`
      });

      const fragmentPath = path.join(sourceDir, 'fragment.html');
      const dependencyTracker = new DependencyTracker();
      
      const result = await processHtmlUnified(
        `<div data-layout="_layout.html">
  <h1>Fragment Content</h1>
  <p>This is a page fragment.</p>
</div>`,
        fragmentPath,
        sourceDir,
        dependencyTracker
      );

      expect(result.content).toContain('<!DOCTYPE html>');
      expect(result.content).toContain('<title>Site Layout</title>');
      expect(result.content).toContain('<h1>Fragment Content</h1>');
      expect(result.content).toContain('<main>');
    });

    test('should process full HTML document with link rel=layout', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': `<!DOCTYPE html>
<html lang="en">
<head><title>Site Layout</title></head>
<body><main><slot></slot></main></body>
</html>`,
        'full-document.html': `<!DOCTYPE html>
<html>
<head>
  <title>Page Title</title>
  <link rel="layout" href="_layout.html">
</head>
<body>
  <h1>Full Document Content</h1>
  <p>This is a full HTML document.</p>
</body>
</html>`
      });

      const documentPath = path.join(sourceDir, 'full-document.html');
      const dependencyTracker = new DependencyTracker();
      
      const result = await processHtmlUnified(
        `<!DOCTYPE html>
<html>
<head>
  <title>Page Title</title>
  <link rel="layout" href="_layout.html">
</head>
<body>
  <h1>Full Document Content</h1>
  <p>This is a full HTML document.</p>
</body>
</html>`,
        documentPath,
        sourceDir,
        dependencyTracker
      );

      expect(result.content).toContain('<!DOCTYPE html>');
      expect(result.content).toContain('lang="en"'); // Layout's html attributes preserved
      expect(result.content).toContain('<title>Page Title</title>'); // Page title wins
      expect(result.content).toContain('<h1>Full Document Content</h1>');
      expect(result.content).toContain('<main>'); // Layout structure
    });

    test('should not apply layout to full HTML document without explicit layout', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': `<!DOCTYPE html>
<html>
<head><title>Site Layout</title></head>
<body><main><slot></slot></main></body>
</html>`,
        'standalone.html': `<!DOCTYPE html>
<html>
<head>
  <title>Standalone Page</title>
</head>
<body>
  <h1>Standalone Content</h1>
</body>
</html>`
      });

      const standalonePath = path.join(sourceDir, 'standalone.html');
      const dependencyTracker = new DependencyTracker();
      
      const result = await processHtmlUnified(
        `<!DOCTYPE html>
<html>
<head>
  <title>Standalone Page</title>
</head>
<body>
  <h1>Standalone Content</h1>
</body>
</html>`,
        standalonePath,
        sourceDir,
        dependencyTracker
      );

      // Should remain unchanged
      expect(result.content).toContain('<title>Standalone Page</title>');
      expect(result.content).toContain('<h1>Standalone Content</h1>');
      expect(result.content).not.toContain('<main>'); // No layout applied
    });

    test('should validate multiple data-layout attributes in fragments', async () => {
      const fragmentContent = `<div data-layout="first.html">
  <span data-layout="second.html">Invalid</span>
</div>`;

      const fragmentPath = path.join(sourceDir, 'invalid-fragment.html');
      const dependencyTracker = new DependencyTracker();
      
      try {
        await processHtmlUnified(
          fragmentContent,
          fragmentPath,
          sourceDir,
          dependencyTracker
        );
        expect(false).toBe(true); // Should have thrown an error
      } catch (error) {
        expect(error.message).toContain('Fragment pages cannot have multiple data-layout attributes');
      }
    });

    test('should allow multiple data-layout attributes in full HTML documents', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': `<!DOCTYPE html>
<html>
<head><title>Site Layout</title></head>
<body><main><slot></slot></main></body>
</html>`
      });

      const fullDocumentContent = `<!DOCTYPE html>
<html>
<head>
  <title>Page Title</title>
  <link rel="layout" href="_layout.html">
</head>
<body>
  <div data-layout="ignored.html">
    <h1>Content with data-layout (should be ignored)</h1>
  </div>
</body>
</html>`;

      const documentPath = path.join(sourceDir, 'full-document.html');
      const dependencyTracker = new DependencyTracker();
      
      const result = await processHtmlUnified(
        fullDocumentContent,
        documentPath,
        sourceDir,
        dependencyTracker
      );

      // Should process without error (link rel=layout takes precedence)
      expect(result.content).toContain('<title>Page Title</title>');
      expect(result.content).toContain('<main>');
    });
  });

  describe('Link rel=layout Precedence', () => {
    test('should prioritize link rel=layout over data-layout in full documents', async () => {
      await createTestStructure(sourceDir, {
        'primary-layout.html': `<!DOCTYPE html>
<html>
<head><title>Primary Layout</title></head>
<body><div class="primary"><slot></slot></div></body>
</html>`,
        'secondary-layout.html': `<!DOCTYPE html>
<html>
<head><title>Secondary Layout</title></head>
<body><div class="secondary"><slot></slot></div></body>
</html>`
      });

      const documentContent = `<!DOCTYPE html>
<html data-layout="secondary-layout.html">
<head>
  <title>Page Title</title>
  <link rel="layout" href="primary-layout.html">
</head>
<body>
  <h1>Content</h1>
</body>
</html>`;

      const documentPath = path.join(sourceDir, 'precedence-test.html');
      const dependencyTracker = new DependencyTracker();
      
      const result = await processHtmlUnified(
        documentContent,
        documentPath,
        sourceDir,
        dependencyTracker
      );

      // Should use primary layout (link rel=layout) not secondary (data-layout)
      expect(result.content).toContain('<div class="primary">');
      expect(result.content).not.toContain('<div class="secondary">');
      expect(result.content).toContain('<title>Page Title</title>');
    });

    test('should support short name syntax in link rel=layout', async () => {
      await createTestStructure(sourceDir, {
        '_blog.layout.html': `<!DOCTYPE html>
<html>
<head><title>Blog Layout</title></head>
<body><div class="blog"><slot></slot></div></body>
</html>`
      });

      const documentContent = `<!DOCTYPE html>
<html>
<head>
  <title>Blog Post</title>
  <link rel="layout" href="blog">
</head>
<body>
  <h1>Post Content</h1>
</body>
</html>`;

      const documentPath = path.join(sourceDir, 'blog-post.html');
      const dependencyTracker = new DependencyTracker();
      
      const result = await processHtmlUnified(
        documentContent,
        documentPath,
        sourceDir,
        dependencyTracker
      );

      expect(result.content).toContain('<div class="blog">');
      expect(result.content).toContain('<title>Blog Post</title>');
    });

    test('should support absolute paths in link rel=layout', async () => {
      await createTestStructure(sourceDir, {
        'layouts/custom.html': `<!DOCTYPE html>
<html>
<head><title>Custom Layout</title></head>
<body><div class="custom"><slot></slot></div></body>
</html>`
      });

      const documentContent = `<!DOCTYPE html>
<html>
<head>
  <title>Custom Page</title>
  <link rel="layout" href="/layouts/custom.html">
</head>
<body>
  <h1>Custom Content</h1>
</body>
</html>`;

      const documentPath = path.join(sourceDir, 'custom-page.html');
      const dependencyTracker = new DependencyTracker();
      
      const result = await processHtmlUnified(
        documentContent,
        documentPath,
        sourceDir,
        dependencyTracker
      );

      expect(result.content).toContain('<div class="custom">');
      expect(result.content).toContain('<title>Custom Page</title>');
    });
  });

  describe('HTML Document Merging', () => {
    test('should merge DOCTYPE correctly - page wins', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN">
<html>
<head><title>Layout</title></head>
<body><slot></slot></body>
</html>`
      });

      const documentContent = `<!DOCTYPE html>
<html>
<head>
  <title>Page</title>
  <link rel="layout" href="_layout.html">
</head>
<body>
  <h1>Content</h1>
</body>
</html>`;

      const documentPath = path.join(sourceDir, 'doctype-test.html');
      const dependencyTracker = new DependencyTracker();
      
      const result = await processHtmlUnified(
        documentContent,
        documentPath,
        sourceDir,
        dependencyTracker
      );

      
      // Page DOCTYPE should win
      expect(result.content).toMatch(/^<!DOCTYPE html>/);
      expect(result.content).not.toContain('XHTML');
    });

    test('should merge HTML attributes correctly - page wins on conflicts', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': `<!DOCTYPE html>
<html lang="en" class="layout-class" data-theme="dark">
<head><title>Layout</title></head>
<body><slot></slot></body>
</html>`
      });

      const documentContent = `<!DOCTYPE html>
<html lang="fr" data-version="1.0">
<head>
  <title>Page</title>
  <link rel="layout" href="_layout.html">
</head>
<body>
  <h1>Content</h1>
</body>
</html>`;

      const documentPath = path.join(sourceDir, 'attributes-test.html');
      const dependencyTracker = new DependencyTracker();
      
      const result = await processHtmlUnified(
        documentContent,
        documentPath,
        sourceDir,
        dependencyTracker
      );

      expect(result.content).toContain('lang="fr"'); // Page wins
      expect(result.content).toContain('class="layout-class"'); // Layout preserved
      expect(result.content).toContain('data-theme="dark"'); // Layout preserved
      expect(result.content).toContain('data-version="1.0"'); // Page added
    });

    test('should merge head content correctly - page title wins', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': `<!DOCTYPE html>
<html>
<head>
  <title>Layout Title</title>
  <meta name="description" content="Layout description">
  <link rel="stylesheet" href="layout.css">
</head>
<body><slot></slot></body>
</html>`
      });

      const documentContent = `<!DOCTYPE html>
<html>
<head>
  <title>Page Title</title>
  <meta name="keywords" content="page, keywords">
  <link rel="layout" href="_layout.html">
</head>
<body>
  <h1>Content</h1>
</body>
</html>`;

      const documentPath = path.join(sourceDir, 'head-merge-test.html');
      const dependencyTracker = new DependencyTracker();
      
      const result = await processHtmlUnified(
        documentContent,
        documentPath,
        sourceDir,
        dependencyTracker
      );

      expect(result.content).toContain('<title>Page Title</title>'); // Page wins
      expect(result.content).toContain('content="Layout description"'); // Layout preserved
      expect(result.content).toContain('href="layout.css"'); // Layout preserved
      expect(result.content).toContain('content="page, keywords"'); // Page added
    });

    test('should insert page body into layout default slot', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': `<!DOCTYPE html>
<html>
<head><title>Layout</title></head>
<body>
  <header>Site Header</header>
  <main><slot></slot></main>
  <footer>Site Footer</footer>
</body>
</html>`
      });

      const documentContent = `<!DOCTYPE html>
<html>
<head>
  <title>Page</title>
  <link rel="layout" href="_layout.html">
</head>
<body>
  <article>
    <h1>Article Title</h1>
    <p>Article content</p>
  </article>
</body>
</html>`;

      const documentPath = path.join(sourceDir, 'body-slot-test.html');
      const dependencyTracker = new DependencyTracker();
      
      const result = await processHtmlUnified(
        documentContent,
        documentPath,
        sourceDir,
        dependencyTracker
      );

      expect(result.content).toContain('<header>Site Header</header>');
      expect(result.content).toContain('<main>');
      expect(result.content).toContain('<article>');
      expect(result.content).toContain('<h1>Article Title</h1>');
      expect(result.content).toContain('<footer>Site Footer</footer>');
    });
  });
});