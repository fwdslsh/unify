/**
 * Tests for new slot system functionality (v0.5.0)
 * Verifies spec compliance for data-slot="name" syntax and fallback content
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { processHtmlUnified } from '../../src/core/unified-html-processor.js';
import { DependencyTracker } from '../../src/core/dependency-tracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFixturesDir = path.join(__dirname, '../fixtures/slot-system');

describe('slot system v0.5.0', () => {
  let sourceDir;
  let layoutsDir;
  let dependencyTracker;
  
  beforeEach(async () => {
    // Create test directories
    sourceDir = path.join(testFixturesDir, 'src');
    layoutsDir = sourceDir; // Use source directory for layouts now (no .layouts directory)
    
    await fs.mkdir(sourceDir, { recursive: true });
    
    dependencyTracker = new DependencyTracker();
  });
  
  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(testFixturesDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  it('should handle template data-slot="name" syntax', async () => {
    // Create layout with named data-slot attributes
    const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>Test Layout</title>
  <div data-slot="head">Default head content</div>
</head>
<body>
  <header>
    <div data-slot="header">Default header</div>
  </header>
  <main>
    <div data-slot="default">Default main content</div>
  </main>
  <footer>
    <div data-slot="footer">Default footer</div>
  </footer>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    // Create page with template data-slot assignments
    const pageContent = `<div data-layout="_layout.html">
<template data-slot="head">
  <link rel="stylesheet" href="page.css">
</template>
<template data-slot="header">
  <h1>Page Header</h1>
</template>
<template data-slot="footer">
  <p>Copyright 2024</p>
</template>
<div>
  <h2>Main Content</h2>
  <p>This is the main content of the page.</p>
</div>
</div>`;
    
    const pagePath = path.join(sourceDir, 'index.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Process the page
    const result = await processHtmlUnified(
      pageContent,
      pagePath,
      sourceDir,
      dependencyTracker,
      {}
    );
    
    const html = result.content;
    
    // Verify data-slots were replaced correctly
    expect(html).toContain('<link rel="stylesheet" href="page.css">');
    expect(html).toContain('<h1>Page Header</h1>');
    expect(html).toContain('<h2>Main Content</h2>');
    expect(html).toContain('<p>Copyright 2024</p>');
    expect(html).not.toContain('Default head content');
    expect(html).not.toContain('Default header');
    expect(html).not.toContain('Default footer');
  });
  
  it('should handle regular elements with data-slot="name" attribute', async () => {
    // Create layout with named data-slot attributes
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <nav>
    <div data-slot="navigation">Default nav</div>
  </nav>
  <main>
    <div data-slot="default">Default content</div>
  </main>
  <aside>
    <div data-slot="sidebar">Default sidebar</div>
  </aside>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    // Create page with element data-slot assignments
    const pageContent = `<div data-layout="_layout.html">
<nav data-slot="navigation">
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</nav>
<aside data-slot="sidebar">
  <h3>Related Links</h3>
  <ul>
    <li><a href="/link1">Link 1</a></li>
  </ul>
</aside>
<article>
  <h1>Article Title</h1>
  <p>Article content here.</p>
</article>
</div>`;
    
    const pagePath = path.join(sourceDir, 'page.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Process the page
    const result = await processHtmlUnified(
      pageContent,
      pagePath,
      sourceDir,
      dependencyTracker,
      {}
    );
    
    const html = result.content;
    
    // Verify elements were moved to correct data-slots  
    expect(html).toContain('<ul>');
    expect(html).toContain('<li><a href="/">Home</a></li>');
    expect(html).toContain('<h3>Related Links</h3>');
    expect(html).toContain('<h1>Article Title</h1>');
    expect(html).not.toContain('Default nav');
    expect(html).not.toContain('Default sidebar');
  });
  
  it('should preserve fallback content when no data-slot assignment', async () => {
    // Create layout with fallback content
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <header>
    <div data-slot="header">
      <h1>Default Title</h1>
      <nav>
        <a href="/">Home</a>
      </nav>
    </div>
  </header>
  <main>
    <div data-slot="default">
      <h2>Welcome</h2>
      <p>This is the default content.</p>
    </div>
  </main>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    // Create page with no data-slot assignments (should use fallback)
    const pageContent = `<div data-layout="_layout.html">
<!-- No data-slot assignments - should show fallback content -->
</div>`;
    
    const pagePath = path.join(sourceDir, 'fallback.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Process the page
    const result = await processHtmlUnified(
      pageContent,
      pagePath,
      sourceDir,
      dependencyTracker,
      {}
    );
    
    const html = result.content;
    
    // Verify fallback content is preserved (with data-slot attributes removed for clean output)
    expect(html).toContain('<h1>Default Title</h1>');
    expect(html).toContain('<a href="/">Home</a>');  // Look for the link content
    expect(html).toContain('<h2>Welcome</h2>');
    expect(html).toContain('<p>This is the default content.</p>');
    // Verify data-slot attributes are removed even when using fallback content
    expect(html).not.toContain('data-slot=');
  });
  
  it('should handle multiple elements assigned to same data-slot', async () => {
    // Create layout
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <main>
    <div data-slot="content">Default content</div>
  </main>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    // Create page with multiple assignments to same data-slot
    const pageContent = `<div data-layout="_layout.html">
<section data-slot="content">
  <h2>Section 1</h2>
  <p>First section content.</p>
</section>
<article data-slot="content">
  <h2>Section 2</h2>
  <p>Second section content.</p>
</article>
<div data-slot="content">
  <h2>Section 3</h2>
  <p>Third section content.</p>
</div>
</div>`;
    
    const pagePath = path.join(sourceDir, 'multiple.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Process the page
    const result = await processHtmlUnified(
      pageContent,
      pagePath,
      sourceDir,
      dependencyTracker,
      {}
    );
    
    const html = result.content;
    
    // Verify all assignments are included in document order
    expect(html).toContain('<section>');  // Should have section tag
    expect(html).toContain('<article>');  // Should have article tag  
    expect(html).toContain('<div>');       // Should have div tag
    expect(html).toContain('Section 1');  // Should have content
    expect(html).toContain('Section 2');  // Should have content
    expect(html).toContain('Section 3');  // Should have content
    
    // Check that they appear in the correct order
    const section1Index = html.indexOf('Section 1');
    const section2Index = html.indexOf('Section 2');
    const section3Index = html.indexOf('Section 3');
    
    expect(section1Index).toBeLessThan(section2Index);
    expect(section2Index).toBeLessThan(section3Index);
    expect(html).not.toContain('Default content');
  });

  it('should handle short name layout references', async () => {
    // Create named layout file with .layout. convention
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <header>
    <div data-slot="header">Default header</div>
  </header>
  <main>
    <div data-slot="default">Default main content</div>
  </main>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, '_blog.layout.html'), layoutContent);
    
    // Create page with short name reference
    const pageContent = `<div data-layout="blog">
<template data-slot="header">
  <h1>Blog Post Title</h1>
</template>
<article>
  <p>This is the blog post content.</p>
</article>
</div>`;
    
    const pagePath = path.join(sourceDir, 'post.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Process the page
    const result = await processHtmlUnified(
      pageContent,
      pagePath,
      sourceDir,
      dependencyTracker,
      {}
    );
    
    const html = result.content;
    
    // Verify short name resolved to correct layout
    expect(html).toContain('<h1>Blog Post Title</h1>');  // Header data-slot content
    expect(html).toContain('<article>');  // Main content
    expect(html).toContain('This is the blog post content');
    expect(html).not.toContain('Default header');  // Should not have fallback
    expect(html).not.toContain('Default main content');  // Should not have fallback
  });

  // v2: Removed test for short name layout preference - short names not supported in v2
});