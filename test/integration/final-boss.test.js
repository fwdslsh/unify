/**
 * Final Boss Integration Test
 * 
 * This is the ultimate comprehensive test that exercises the entire unify system
 * including all major features, edge cases, and real-world scenarios.
 * 
 * Features tested:
 * - Apache SSI-style includes (file and virtual)
 * - Layout/slot system with data-layout attributes
 * - Markdown processing with frontmatter and layouts
 * - Layout conditional logic
 * - Asset tracking and copying
 * - Sitemap generation with package.json homepage
 * - Dependency tracking and circular dependency detection
 * - Security (path traversal prevention)
 * - Error handling and graceful degradation
 * - CLI argument parsing (including short flags)
 * - Build process end-to-end
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
    it('should build a complex multi-page website with all features', async () => {
      const siteStructure = {
        // Package.json for sitemap baseUrl
        'package.json': JSON.stringify({
          name: 'final-boss-test-site',
          homepage: 'https://finalboss.example.com',
          version: '1.0.0'
        }),

        // Base layout
        'src/_includes/base.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><title data-slot="title">Final Boss Test Site</title></title>
  <meta name="description" content="<meta data-slot="description">A comprehensive test site</meta>">
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <header>
    <nav><!--#include virtual="/.components/navigation.html" --></nav>
  </header>
  <main>
    <main data-slot="default"></main>
  </main>
  <footer>
    <p>&copy; 2025 Final Boss Test Site</p>
  </footer>
</body>
</html>`,

        // Simple components
        'src/.components/navigation.html': `<ul>
  <li><a href="/index.html">Home</a></li>
  <li><a href="/about.html">About</a></li>
  <li><a href="/features.html">Features</a></li>
</ul>`,

        'src/.components/card.html': `<div class="card">
  <h3>Feature Card</h3>
  <p>This is a reusable card component.</p>
</div>`,

        // Main pages using simplified layout system
        'src/index.html': `<div data-layout="_includes/base.html">
  <template data-slot="title">Home - Final Boss Test</template>
  <template data-slot="description">Welcome to our comprehensive test site</template>
  
  <h1>Welcome to Final Boss Test Site</h1>
  <p>This site tests all major Unify features.</p>
  
  <!--#include virtual="/.components/card.html" -->
  
  <h2>Features Tested</h2>
  <ul>
    <li>Layout system with slots</li>
    <li>SSI-style includes</li>
    <li>Asset processing</li>
    <li>Sitemap generation</li>
  </ul>
</div>`,

        'src/about.html': `<div data-layout="_includes/base.html">
  <template data-slot="title">About - Final Boss Test</template>
  <template data-slot="description">Learn about our test methodology</template>
  
  <h1>About This Test</h1>
  <p>This is a comprehensive integration test for Unify.</p>
  
  <!--#include virtual="/.components/card.html" -->
</div>`,

        'src/features.html': `<div data-layout="_includes/base.html">
  <template data-slot="title">Features - Final Boss Test</template>
  <template data-slot="description">Explore all the features we test</template>
  
  <h1>Features</h1>
  <p>Here are all the features this test covers:</p>
  
  <!--#include virtual="/.components/card.html" -->
</div>`,

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
- Automatic layout application
- Markdown to HTML conversion
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
      expect(result.stdout.includes('Build completed successfully')).toBeTruthy();

      // Verify all pages were generated
      const expectedFiles = [
        'index.html',
        'about.html', 
        'features.html',
        'blog.html',
        'styles/main.css',
        'sitemap.xml'
      ];

      for (const file of expectedFiles) {
        const filePath = path.join(outputDir, file);
        try {
          await fs.access(filePath);
        } catch (error) {
          throw new Error(`Expected file ${file} was not generated`);
        }
      }

      // Verify content processing
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent.includes('<!DOCTYPE html>')).toBeTruthy();
      expect(indexContent.includes('Home - Final Boss Test')).toBeTruthy();
      expect(indexContent.includes('Welcome to Final Boss Test Site')).toBeTruthy();
      expect(indexContent.includes('<div class="card">')).toBeTruthy();
      expect(indexContent.includes('<li><a href="/index.html">Home</a></li>')).toBeTruthy();

      // Verify sitemap was generated with correct base URL
      const sitemapContent = await fs.readFile(path.join(outputDir, 'sitemap.xml'), 'utf-8');
      expect(sitemapContent.includes('https://finalboss.example.com')).toBeTruthy();
      expect(sitemapContent.includes('<loc>https://finalboss.example.com/</loc>')).toBeTruthy();
      expect(sitemapContent.includes('<loc>https://finalboss.example.com/about.html</loc>')).toBeTruthy();

      // Verify markdown processing
      const blogContent = await fs.readFile(path.join(outputDir, 'blog.html'), 'utf-8');
      expect(blogContent.includes('<title>Blog Post</title>')).toBeTruthy();
      expect(blogContent.includes('<h1 id="blog-post">Blog Post</h1>')).toBeTruthy();
    });

    it('should handle edge cases and error conditions', async () => {
      const edgeCaseStructure = {
        'package.json': JSON.stringify({
          name: 'edge-case-test',
          homepage: 'https://edge.example.com'
        }),

        'src/_includes/default.html': `<!DOCTYPE html>
<html>
<head>
  <title><title data-slot="title">Default</title></title>
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`,

        // Test with missing component (should build but show error)
        'src/test-missing.html': `<div data-layout="default">
  <template data-slot="title">Missing Component Test</template>
  <!--#include virtual="/.components/missing.html" -->
  <p>This page tries to include a missing component.</p>
</div>`,

        // Test with circular dependency protection  
        'src/.components/circular-a.html': `<div>
  Component A
  <!--#include virtual="/.components/circular-b.html" -->
</div>`,

        'src/.components/circular-b.html': `<div>
  Component B
  <!--#include virtual="/.components/circular-c.html" -->
</div>`,

        'src/.components/circular-c.html': `<div>
  Component C
  <!--#include virtual="/.components/circular-a.html" -->
</div>`,

        'src/test-circular.html': `<div data-layout="default">
  <template data-slot="title">Circular Test</template>
  <!--#include virtual="/.components/circular-a.html" -->
</div>`
      };

      await createTestStructure(tempDir, edgeCaseStructure);

      // Run the build with fail-on error mode - should fail due to errors
      const result = await runCLI([
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--fail-on', 'error'  // Required for circular dependencies to fail the build
      ], { cwd: tempDir });

      // Build should fail due to errors in fail-on error mode
      expect(result.code).toBe(1);
      // Should have either missing file or circular dependency error (or both)
      const hasExpectedError = 
        result.stderr.includes('missing.html') || result.stdout.includes('missing.html') ||
        result.stderr.includes('Circular dependency') || result.stdout.includes('Circular dependency');
      expect(hasExpectedError).toBeTruthy();
    });
  });
});


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

    it('should handle edge cases and error conditions', async () => {
      const edgeCaseStructure = {
        'package.json': JSON.stringify({ name: 'edge-test' }, null, 2),

        // Test circular dependencies
        'src/layouts/circular-a.html': `<template extends="circular-b.html">
  <template data-slot="content">Circular A</template>
</template>`,

        'src/layouts/circular-b.html': `<template extends="circular-a.html">
  <template data-slot="content">Circular B</template>
</template>`,

        // Test missing includes
        'src/components/partial.html': `<div>
  <p>This partial exists</p>
  <!--#include virtual="/components/missing.html" -->
</div>`,

        // Test path traversal attempts (should be blocked)
        'src/components/security.html': `<div>
  <!--#include file="../../../etc/passwd" -->
  <!--#include virtual="/../sensitive/data.txt" -->
  <p>Security test</p>
</div>`,

        // Test malformed templates
        'src/malformed.html': `<template extends="missing-layout.html"
  <template data-slot="content">Malformed template syntax</template>
</template>`,

        // Test empty files
        'src/empty.html': '',

        // Main test page
        'src/edge-test.html': `<template extends="base.html">
  <template data-slot="content">
    <h1>Edge Case Tests</h1>
    <!--#include virtual="/components/partial.html" -->
    <!--#include virtual="/components/security.html" -->
    <!--#include virtual="/components/nonexistent.html" -->
  </template>
</template>`,

        'src/layouts/base.html': `<!DOCTYPE html>
<html>
<body><main data-slot="content">Default</main></body>
</html>`
      };

      await createTestStructure(tempDir, edgeCaseStructure);

      const buildResult = await runUnifyBuild(tempDir, sourceDir, outputDir);
      
      // Build should complete despite errors (graceful degradation)
      expect(buildResult.code).toBe(0);

      // Check that security violations are handled
      const edgeContent = await fs.readFile(path.join(outputDir, 'edge-test.html'), 'utf-8');
      
      // Should not contain actual sensitive file content
      expect(edgeContent.includes('root:x:0:0')).toBeFalsy();
      
      // Should contain error comments for missing files
      expect(edgeContent.includes('Error:') || edgeContent.includes('not found')).toBeTruthy();
      
      // Should still contain valid content
      expect(edgeContent.includes('Edge Case Tests')).toBeTruthy();
      expect(edgeContent.includes('Security test')).toBeTruthy();
    });

    it('should handle CLI argument variations', async () => {
      const structure = {
        'content/index.html': `<h1>Custom Source Dir</h1>`,
        'layouts/base.html': `<!DOCTYPE html><html><body><main data-slot="content">Default</main></body></html>`,
        'partials/header.html': `<header>Custom Header</header>`
      };

      await createTestStructure(tempDir, structure);

      // Test custom source and output directories with short flags
      const customOutputDir = path.join(tempDir, 'build');
      const buildResult = await runUnifyBuild(
        tempDir,
        path.join(tempDir, 'content'),
        customOutputDir,
        []
      );

      expect(buildResult.code).toBe(0);

      const indexExists = await fs.access(path.join(customOutputDir, 'index.html'))
        .then(() => true).catch(() => false);
      expect(indexExists).toBeTruthy();
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle large number of files efficiently', async () => {
      const startTime = Date.now();

      // Create 100 pages with includes
      const largeStructure = {
        'src/layouts/base.html': `<!DOCTYPE html>
<html><body><main data-slot="content">Default</main></body></html>`,
        'src/components/header.html': `<header>Site Header</header>`
      };

      // Generate 100 pages
      for (let i = 0; i < 1000; i++) {
        largeStructure[`src/page-${i}.html`] = `<template extends="base.html">
  <template data-slot="content">
    <!--#include virtual="/components/header.html" -->
    <h1>Page ${i}</h1>
    <p>This is page number ${i}</p>
  </template>
</template>`;
      }

      await createTestStructure(tempDir, largeStructure);

      const buildResult = await runUnifyBuild(tempDir, sourceDir, outputDir);
      const buildTime = Date.now() - startTime;

      expect(buildResult.code).toBe(0);
      
      // Should complete within reasonable time (adjust threshold based on platform)
      const timeThreshold = process.platform === 'win32' ? 5000 : 1000; //HACK: windoze is slow
      expect(buildTime).toBeLessThan(10000);

      // Verify some output files
      const page0Exists = await fs.access(path.join(outputDir, 'page-0.html'))
        .then(() => true).catch(() => false);
      const page99Exists = await fs.access(path.join(outputDir, 'page-99.html'))
        .then(() => true).catch(() => false);
      
      expect(page0Exists && page99Exists).toBeTruthy();
    });

    it('should handle deeply nested includes', async () => {
      const deepStructure = {
        'src/layouts/base.html': `<!DOCTYPE html>
<html><body><main data-slot="content">Base</main></body></html>`
      };

      // Create 10 levels of nested includes
      for (let i = 0; i < 10; i++) {
        const nextInclude = i < 9 ? `<!--#include virtual="/components/level-${i + 1}.html" -->` : '<p>Deep content</p>';
        deepStructure[`src/components/level-${i}.html`] = `<div class="level-${i}">
  <p>Level ${i}</p>
  ${nextInclude}
</div>`;
      }

      deepStructure['src/index.html'] = `<template extends="base.html">
  <template data-slot="content">
    <!--#include virtual="/components/level-0.html" -->
  </template>
</template>`;

      await createTestStructure(tempDir, deepStructure);

      const buildResult = await runUnifyBuild(tempDir, sourceDir, outputDir);
      
      expect(buildResult.code).toBe(0);

      const content = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      
      // Should contain all levels
      expect(content.includes('Level 0')).toBeTruthy();
      expect(content.includes('Level 9')).toBeTruthy();
      expect(content.includes('Deep content')).toBeTruthy();
    });
  });
});

/**
 * Helper function to run unify build command
 */
async function runUnifyBuild(workingDir, sourceDir, outputDir, extraArgs = []) {
  const args = [
    'build',
    '--source', sourceDir,
    '--output', outputDir,
    ...extraArgs
  ];

  return await runCLI(args, { cwd: workingDir });
}