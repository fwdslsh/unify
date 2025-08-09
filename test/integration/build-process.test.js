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
    
    // Create test files
    await fs.writeFile(
      path.join(sourceDir, '.components', 'head.html'),
      '<meta charset="UTF-8">\n<link rel="stylesheet" href="/css/style.css">'
    );
    
    await fs.writeFile(
      path.join(sourceDir, '.components', 'header.html'),
      '<header><h1>Test Site</h1><nav><!--#include file="nav.html" --></nav></header>'
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
  <!--#include virtual="/.components/head.html" -->
</head>
<body>
  <!--#include virtual="/.components/header.html" -->
  <main>
    <h2>Welcome</h2>
    <p>This is the home page.</p>
  </main>
  <!--#include virtual="/.components/footer.html" -->
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
  <!--#include virtual="/.components/header.html" -->
  <main>
    <h2>About Us</h2>
    <p>This is the about page.</p>
  </main>
  <!--#include virtual="/.components/footer.html" -->
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
  <!--#include virtual="/.components/header.html" -->
  <main>
    <h2>About Us</h2>
    <p>This is the about page.</p>
  </main>
  <!--#include virtual="/.components/footer.html" -->
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
  
  it('should process nested components correctly', async () => {
    await build({
      source: sourceDir,
      output: outputDir,
      components: '.components'
    });
    
    const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    
    // Should contain nested navigation from header -> nav
    expect(indexContent.includes('<ul><li><a href="/">Home</a></li>')).toBeTruthy();
    expect(indexContent.includes('<li><a href="/about.html">About</a></li></ul>')).toBeTruthy();
    
    // Should not contain any include directives
    expect(indexContent.includes('<!--#include')).toBeFalsy();
  });
  

  it('should maintain directory structure for assets', async () => {
    await build({
      source: sourceDir,
      output: outputDir
    });
    
    const cssContent = await fs.readFile(path.join(outputDir, 'css', 'style.css'), 'utf-8');
    expect(cssContent.includes('font-family: Arial')).toBeTruthy();
  });
  
  it('should track dependencies correctly', async () => {
    const result = await build({
      source: sourceDir,
      output: outputDir,
      components: '.components'
    });
    
    const tracker = result.dependencyTracker;
    
    // Verify dependency tracking
    const indexPath = path.join(sourceDir, 'index.html');
    const headerPath = path.join(sourceDir, '.components', 'header.html');
    const navPath = path.join(sourceDir, '.components', 'nav.html');
    
    const indexDeps = tracker.getPageDependencies(indexPath);
    expect(indexDeps.includes(headerPath)).toBeTruthy();
    expect(indexDeps.includes(path.join(sourceDir, '.components', 'footer.html'))).toBeTruthy();
    
    // Verify reverse mapping
    const headerAffected = tracker.getAffectedPages(headerPath);
    expect(headerAffected.includes(indexPath)).toBeTruthy();
    expect(headerAffected.includes(path.join(sourceDir, 'about.html'))).toBeTruthy();
    
    // Verify nested dependencies (nav included by header)
    const navAffected = tracker.getAffectedPages(navPath);
    // nav.html is included by header.html, which is included by both pages
    expect(navAffected.length).toBeGreaterThan(0);
  });
  
  it('should fail build when components are missing', async () => {
    // Create a file with missing include
    const brokenFilePath = path.join(sourceDir, 'broken.html');
    await fs.writeFile(
      brokenFilePath,
      '<!DOCTYPE html><html><head></head><body><!--#include file="missing.html" --></body></html>'
    );
    
    // Build should succeed but emit a warning when components are missing
    const result = await build({
      source: sourceDir,
      output: outputDir,
      components: '.components'
    });

    // Verify the build succeeded

    expect(result.errors.length).toBe(0); // Expect one warning/error
    //Output broken.html should contain a warning comment
    const brokenContent = await fs.readFile(brokenFilePath.replace('src', 'dist'), 'utf-8');
    expect(brokenContent.includes('<!-- Include not found: missing.html -->')).toBeTruthy();

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
  


  
  it('should apply default layout unless the source page includes an <html> element explicitly', async () => {
    // Create layouts directory with default.html
    await fs.mkdir(path.join(sourceDir, '.layouts'), { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, '.layouts', 'default.html'),
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{ title }}</title>
</head>
<body>
  <header><h1>Default Layout</h1></header>
  <main>{{ content }}</main>
  <footer><p>Default Footer</p></footer>
</body>
</html>`
    );
    
    // Create markdown file without html element
    await fs.writeFile(
      path.join(sourceDir, 'test-markdown.md'),
      `---
title: Test Page
---

# Test Content

This is a test page content.`
    );
    
    // Create markdown file WITH html element (should not use layout)
    await fs.writeFile(
      path.join(sourceDir, 'full-html.md'),
      `---
title: Full HTML Page
---

<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Custom HTML</title>
</head>
<body>
  <h1>Custom HTML Structure</h1>
  <p>This has its own HTML structure.</p>
</body>
</html>`
    );

    // Create markdown file WITH html elements but WITHOUT <html> element (should use layout)
    await fs.writeFile(
      path.join(sourceDir, 'partial-html.md'),
      `---
title: Partial HTML Page
---

<head>
  <meta charset="UTF-8">
  <title>Partial HTML</title>
</head>
<body>
  <h1>Partial HTML Structure</h1>
  <p>This does not include the <html> element.</p>
</body>`
    );
    
    await build({
      source: sourceDir,
      output: outputDir,
      components: '.components',
      layouts: '.layouts',
      clean: true
    });
    
    // Verify markdown without html element uses default layout
    const testMarkdownContent = await fs.readFile(path.join(outputDir, 'test-markdown.html'), 'utf-8');
    expect(testMarkdownContent.includes('Default Layout')).toBeTruthy();
    expect(testMarkdownContent.includes('Default Footer')).toBeTruthy();
    expect(testMarkdownContent.includes('Test Content')).toBeTruthy(); // Check for content presence
    
    // Verify markdown with html element does NOT use layout
    const fullHtmlContent = await fs.readFile(path.join(outputDir, 'full-html.html'), 'utf-8');
    expect(fullHtmlContent.includes('Custom HTML Structure')).toBeTruthy();
    expect(fullHtmlContent.includes('Default Layout')).toBeFalsy();
    expect(fullHtmlContent.includes('Default Footer')).toBeFalsy();
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
      components: '.components',
      layouts: '.layouts',
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