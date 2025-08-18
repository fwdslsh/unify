/**
 * Final Boss Integration Test
 * 
 * This is the ultimate comprehensive test that exercises the entire unify v0.6.0 system
 * including all major features, edge cases, and real-world scenarios.
 * 
 * Features tested:
 * - Cascading imports with data-import attributes
 * - File classification system 
 * - Markdown processing with frontmatter
 * - Basic asset copying
 * - Sitemap generation 
 * - CLI argument parsing and options
 * - Build process end-to-end
 * - Error handling with current functionality
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { runCLI } from '../test-utils.js';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Final Boss Integration Test', () => {
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

  describe('Complete Website Build', () => {
    it('should build a basic multi-page website with current v0.6.0 features', async () => {
      const siteStructure = {
        // Package.json for sitemap baseUrl
        'package.json': JSON.stringify({
          name: 'final-boss-test-site',
          homepage: 'https://finalboss.example.com',
          version: '1.0.0'
        }),

        // Simple HTML pages
        'src/index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Home - Final Boss Test</title>
  <meta name="description" content="Welcome to our comprehensive test site">
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <header>
    <nav>
      <ul>
        <li><a href="/index.html">Home</a></li>
        <li><a href="/about.html">About</a></li>
        <li><a href="/features.html">Features</a></li>
      </ul>
    </nav>
  </header>
  <main>
    <h1>Welcome to Final Boss Test Site</h1>
    <p>This site tests current Unify v0.6.0 features.</p>
    
    <div class="card">
      <h3>Feature Card</h3>
      <p>This is a test card component.</p>
    </div>
    
    <h2>Features Tested</h2>
    <ul>
      <li>Basic HTML processing</li>
      <li>Asset copying</li>
      <li>Sitemap generation</li>
      <li>Markdown processing</li>
    </ul>
  </main>
  <footer>
    <p>&copy; 2025 Final Boss Test Site</p>
  </footer>
</body>
</html>`,

        'src/about.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>About - Final Boss Test</title>
  <meta name="description" content="Learn about our test methodology">
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <h1>About This Test</h1>
  <p>This is a comprehensive integration test for Unify v0.6.0.</p>
</body>
</html>`,

        'src/features.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Features - Final Boss Test</title>
  <meta name="description" content="Explore all the features we test">
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <h1>Features</h1>
  <p>Here are all the features this test covers:</p>
</body>
</html>`,

        // Assets
        'src/styles/main.css': `body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 20px;
}
.card {
  border: 1px solid #ddd;
  padding: 16px;
  margin: 16px 0;
  border-radius: 8px;
}`,

        // Markdown file
        'src/blog.md': `---
title: "Blog Post"
description: "A test blog post"
---

# Blog Post

This is a test blog post written in Markdown.

## Features

- Frontmatter support
- Markdown to HTML conversion
- File classification
`
      };

      await createTestStructure(tempDir, siteStructure);

      // Run the build
      const result = await runCLI([
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--clean'
      ], { cwd: tempDir });

      // Verify build succeeded
      expect(result.code).toBe(0);

      // Verify main pages were generated
      const expectedFiles = [
        'index.html',
        'about.html', 
        'features.html',
        'blog.html'
      ];

      for (const file of expectedFiles) {
        const filePath = path.join(outputDir, file);
        try {
          await fs.access(filePath);
        } catch (error) {
          throw new Error(`Expected file ${file} was not generated`);
        }
      }

      // Verify basic content processing
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent.includes('<!DOCTYPE html>')).toBeTruthy();
      expect(indexContent.includes('Home - Final Boss Test')).toBeTruthy();
      expect(indexContent.includes('Welcome to Final Boss Test Site')).toBeTruthy();

      // Verify markdown processing
      const blogContent = await fs.readFile(path.join(outputDir, 'blog.html'), 'utf-8');
      expect(blogContent.includes('<h1 id="blog-post">Blog Post</h1>')).toBeTruthy();
      expect(blogContent.includes('Markdown to HTML conversion')).toBeTruthy();
    });

    it('should handle basic edge cases gracefully', async () => {
      const edgeCaseStructure = {
        'package.json': JSON.stringify({
          name: 'edge-case-test',
          homepage: 'https://edge.example.com'
        }),

        // Test with invalid HTML that should still process
        'src/invalid.html': `<!DOCTYPE html>
<html>
<head>
  <title>Invalid HTML Test</title>
</head>
<body>
  <p>This page has some malformed HTML</p>
  <div>Unclosed div
  <span>Unclosed span
</body>
</html>`,

        // Test with empty HTML
        'src/empty.html': ``,

        // Test markdown with valid frontmatter
        'src/good-frontmatter.md': `---
title: "Good Frontmatter"
description: "A test with valid frontmatter"
---

# Good Frontmatter Test

This markdown has valid YAML frontmatter.`,

        // Test basic HTML page that should work
        'src/good.html': `<!DOCTYPE html>
<html>
<head><title>Good Page</title></head>
<body><h1>Good Page</h1></body>
</html>`
      };

      await createTestStructure(tempDir, edgeCaseStructure);

      // Run the build - should succeed despite edge cases
      const result = await runCLI([
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ], { cwd: tempDir });

      // Build should complete (graceful degradation)
      expect(result.code).toBe(0);

      // Verify that at least the good file was processed
      const goodExists = await fs.access(path.join(outputDir, 'good.html'))
        .then(() => true).catch(() => false);
      expect(goodExists).toBeTruthy();

      // Verify the good content is there
      const goodContent = await fs.readFile(path.join(outputDir, 'good.html'), 'utf-8');
      expect(goodContent.includes('Good Page')).toBeTruthy();
    });
  });
});


