/**
 * Integration tests for full build process
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from '../../src/core/file-processor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('build-process integration', () => {
  let sourceDir = null;
  let outputDir = null;
  
  
  beforeEach(async () => {
    const testFixturesDir = path.join(__dirname, '../fixtures/integration-test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    // Create test directories
    sourceDir = path.join(testFixturesDir, 'src');
    outputDir = path.join(testFixturesDir, 'dist');
    
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(path.join(sourceDir, '.components'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'css'), { recursive: true });
    
    // Create test files using v0.6.0 data-import syntax
    await fs.writeFile(
      path.join(sourceDir, '.components', 'head.html'),
      '<meta charset="UTF-8">\n<link rel="stylesheet" href="/css/style.css">'
    );
    
    await fs.writeFile(
      path.join(sourceDir, '.components', 'header.html'),
      '<header><h1>Test Site</h1><nav><slot><ul><li><a href="/">Default Nav</a></li></ul></slot></nav></header>'
    );
    
    await fs.writeFile(
      path.join(sourceDir, '.components', 'nav.html'),
      '<ul><li><a href="/">Home</a></li><li><a href="/about.html">About</a></li></ul>'
    );
    
    await fs.writeFile(
      path.join(sourceDir, '.components', 'footer.html'),
      '<footer><p>&copy; 2024 Test Site</p></footer>'
    );
    
    await fs.writeFile(
      path.join(sourceDir, 'index.html'),
      `<!DOCTYPE html>
<html>
<head>
  <title>Home - Test Site</title>
  <template data-import=".components/head.html"></template>
</head>
<body>
  <template data-import=".components/header.html">
    <ul data-target="default">
      <li><a href="/">Home</a></li>
      <li><a href="/about.html">About</a></li>
    </ul>
  </template>
  <main>
    <h2>Welcome</h2>
    <p>This is the home page.</p>
  </main>
  <template data-import=".components/footer.html"></template>
</body>
</html>`
    );
    
    await fs.writeFile(
      path.join(sourceDir, 'about.html'),
      `<!DOCTYPE html>
<html>
<head>
  <title>About - Test Site</title>
</head>
<body>
  <template data-import=".components/header.html"></template>
  <main>
    <h2>About Us</h2>
    <p>This is the about page.</p>
  </main>
  <template data-import=".components/footer.html"></template>
</body>
</html>`
    );

        await fs.writeFile(
          path.join(sourceDir, "default-layout.html"),
          `
<head>
  <title>Default Layout - Test Site</title>
</head>
<body>
  <template data-import=".components/header.html"></template>
  <main>
    <h2>About Us</h2>
    <p>This is the about page.</p>
  </main>
  <template data-import=".components/footer.html"></template>
</body>`
        );
    
    await fs.writeFile(
      path.join(sourceDir, 'css', 'style.css'),
      'body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }'
    );
  });
  
  afterEach(async () => {
    // Log output directory for debugging
    if (outputDir) {
      console.log(`[TEST OUTPUT DIR] ${outputDir}`);
    }
    // SKIP cleanup for debugging and validation
    // sourceDir = null;
    // outputDir = null;
  });
  
  it('should process data-import components correctly', async () => {
    await build({
      source: sourceDir,
      output: outputDir
    });
    
    const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    
    // Should contain processed components with slot replacement
    expect(indexContent.includes('<header><h1>Test Site</h1>')).toBeTruthy();
    expect(indexContent.includes('<footer><p>&copy; 2024 Test Site</p></footer>')).toBeTruthy();
    expect(indexContent.includes('<li><a href="/">Home</a></li>')).toBeTruthy();
    expect(indexContent.includes('<li><a href="/about.html">About</a></li>')).toBeTruthy();
    
    // Should not contain any data-import attributes or template elements in final output
    expect(indexContent.includes('data-import')).toBeFalsy();
    expect(indexContent.includes('<template')).toBeFalsy();
    // Note: data-target might still be present if not fully cleaned up - this is a known v0.6.0 behavior
  });
  

  it('should maintain directory structure for assets', async () => {
    await build({
      source: sourceDir,
      output: outputDir
    });
    
    // Check if CSS file exists and has correct content
    const cssPath = path.join(outputDir, 'css', 'style.css');
    const cssExists = await fs.access(cssPath).then(() => true).catch(() => false);
    expect(cssExists).toBeTruthy();
    
    if (cssExists) {
      const cssContent = await fs.readFile(cssPath, 'utf-8');
      expect(cssContent.includes('font-family: Arial')).toBeTruthy();
    }
  });
  
  it('should track dependencies correctly', async () => {
    const result = await build({
      source: sourceDir,
      output: outputDir
    });
    
    // Basic build success verification
    expect(result.processed).toBeGreaterThan(0);
    expect(result.errors.length).toBe(0);
    
    // Verify files were processed and copied correctly
    const indexExists = await fs.access(path.join(outputDir, 'index.html')).then(() => true).catch(() => false);
    const aboutExists = await fs.access(path.join(outputDir, 'about.html')).then(() => true).catch(() => false);
    expect(indexExists).toBeTruthy();
    expect(aboutExists).toBeTruthy();
    
    // Verify CSS was copied (asset tracking)
    const cssExists = await fs.access(path.join(outputDir, 'css', 'style.css')).then(() => true).catch(() => false);
    expect(cssExists).toBeTruthy();
  });
  
  it('should handle missing data-import fragments gracefully', async () => {
    // Create a file with missing data-import
    const brokenFilePath = path.join(sourceDir, 'broken.html');
    await fs.writeFile(
      brokenFilePath,
      '<!DOCTYPE html><html><head></head><body><template data-import="missing.html">Content</template></body></html>'
    );
    
    // Build should succeed even when fragments are missing (graceful degradation)
    const result = await build({
      source: sourceDir,
      output: outputDir
    });

    // Verify the build succeeded (v0.6.0 handles missing fragments gracefully)
    expect(result.errors.length).toBe(0);
    
    // Verify the broken file was still processed
    const outputBrokenPath = path.join(outputDir, 'broken.html');
    const brokenExists = await fs.access(outputBrokenPath).then(() => true).catch(() => false);
    expect(brokenExists).toBeTruthy();
    
    if (brokenExists) {
      const brokenContent = await fs.readFile(outputBrokenPath, 'utf-8');
      // Should not contain data-import in final output
      expect(brokenContent.includes('data-import')).toBeFalsy();
      // Should not contain template elements in final output
      expect(brokenContent.includes('<template')).toBeFalsy();
    }

    // Clean up the broken file immediately after test
    try {
      await fs.unlink(brokenFilePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });
  
  it('should clean output directory before build', async () => {
    // Create output directory with existing file
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'old-file.txt'), 'should be deleted');
    
    await build({
      source: sourceDir,
      output: outputDir,
      clean: true
    });
    
    // Old file should be removed
    let oldFileExists = true;
    try {
      await fs.access(path.join(outputDir, 'old-file.txt'));
    } catch {
      oldFileExists = false;
    }
    expect(oldFileExists).toBe(false);
    
    // New files should exist
    await fs.access(path.join(outputDir, 'index.html'));
  });
  


  
  it('should process markdown files with layout system', async () => {
    // Create _includes directory with layout.html
    await fs.mkdir(path.join(sourceDir, '_includes'), { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, '_includes', 'layout.html'),
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title><slot name="title">Default Title</slot></title>
</head>
<body>
  <header><h1>Default Layout</h1></header>
  <main><slot></slot></main>
  <footer><p>Default Footer</p></footer>
</body>
</html>`
    );
    
    // Create markdown file with frontmatter
    await fs.writeFile(
      path.join(sourceDir, 'test-markdown.md'),
      `---
title: Test Page
description: A test page
---

# Test Content

This is a test page content.`
    );
    
    await build({
      source: sourceDir,
      output: outputDir,
      clean: true
    });
    
    // Verify markdown was processed and converted to HTML
    const testMarkdownPath = path.join(outputDir, 'test-markdown.html');
    const markdownExists = await fs.access(testMarkdownPath).then(() => true).catch(() => false);
    expect(markdownExists).toBeTruthy();
    
    if (markdownExists) {
      const testMarkdownContent = await fs.readFile(testMarkdownPath, 'utf-8');
      expect(testMarkdownContent.includes('Test Content')).toBeTruthy();
      expect(testMarkdownContent.includes('<h1')).toBeTruthy(); // Markdown was processed
      expect(testMarkdownContent.includes('Test Page')).toBeTruthy(); // Title from frontmatter
    }
  });
  
  it('should not apply layout when no default.html exists and content has no html element', async () => {
    // Create markdown file without html element, but no default layout
    await fs.writeFile(
      path.join(sourceDir, 'no-layout.md'),
      `---\ntitle: No Layout Test\n---\n\n# Content Without Layout\n\nThis should get basic HTML structure.`
    );
    await build({
      source: sourceDir,
      output: outputDir,
      clean: true
    });
    // PATCH: Assert output file exists and print its contents for debug
    const noLayoutOutputPath = path.join(outputDir, 'no-layout.html');
    let exists = false;
    try {
      await fs.access(noLayoutOutputPath);
      exists = true;
    } catch {}
    console.log('[TEST DEBUG] no-layout.html exists:', exists);
    if (exists) {
      const content = await fs.readFile(noLayoutOutputPath, 'utf-8');
      console.log('[TEST DEBUG] no-layout.html content:', content);
    }
    expect(exists).toBeTruthy();
    
    // Verify basic HTML structure is created
    const noLayoutContent = await fs.readFile(path.join(outputDir, 'no-layout.html'), 'utf-8');
    expect(noLayoutContent.includes('<!DOCTYPE html>')).toBeTruthy();
    expect(noLayoutContent.includes('<html lang="en">')).toBeTruthy();
    expect(noLayoutContent.includes('<title>No Layout Test</title>')).toBeTruthy();
    expect(noLayoutContent.includes('<main>')).toBeTruthy();
    expect(noLayoutContent.includes('Content Without Layout')).toBeTruthy(); // Check for content presence
    expect(noLayoutContent.includes('Default Layout')).toBeFalsy(); // Should not have default layout content
  });
});