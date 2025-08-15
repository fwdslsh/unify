/**
 * Tests for new slot system functionality (v0.5.0)
 * Verifies spec compliance for slot="name" syntax and fallback content
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
    layoutsDir = path.join(sourceDir, '.layouts');
    
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(layoutsDir, { recursive: true });
    
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
  
  it('should handle template slot="name" syntax', async () => {
    // Create layout with named slots
    const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>Test Layout</title>
  <slot name="head">Default head content</slot>
</head>
<body>
  <header>
    <slot name="header">Default header</slot>
  </header>
  <main>
    <slot>Default main content</slot>
  </main>
  <footer>
    <slot name="footer">Default footer</slot>
  </footer>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    // Create page with template slot assignments
    const pageContent = `<div data-layout="_layout.html">
<template slot="head">
  <link rel="stylesheet" href="page.css">
</template>
<template slot="header">
  <h1>Page Header</h1>
</template>
<template slot="footer">
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
    
    // Verify slots were replaced correctly
    expect(html).toContain('<link rel="stylesheet" href="page.css">');
    expect(html).toContain('<h1>Page Header</h1>');
    expect(html).toContain('<h2>Main Content</h2>');
    expect(html).toContain('<p>Copyright 2024</p>');
    expect(html).not.toContain('Default head content');
    expect(html).not.toContain('Default header');
    expect(html).not.toContain('Default footer');
  });
  
  it('should handle regular elements with slot="name" attribute', async () => {
    // Create layout with named slots
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <nav>
    <slot name="navigation">Default nav</slot>
  </nav>
  <main>
    <slot>Default content</slot>
  </main>
  <aside>
    <slot name="sidebar">Default sidebar</slot>
  </aside>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    // Create page with element slot assignments
    const pageContent = `<div data-layout="_layout.html">
<nav slot="navigation">
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</nav>
<aside slot="sidebar">
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
    
    // Verify elements were moved to correct slots  
    expect(html).toMatch(/<nav>\s*<nav>/);  // Nav element is in navigation slot (allow whitespace)
    expect(html).toMatch(/<aside>\s*<aside>/);  // Aside element is in sidebar slot (allow whitespace)
    expect(html).toMatch(/<article>\s*<h1>Article Title<\/h1>/);  // Article is in main content (allow whitespace)
    expect(html).not.toContain('Default nav');
    expect(html).not.toContain('Default sidebar');
  });
  
  it('should preserve fallback content when no slot assignment', async () => {
    // Create layout with fallback content
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <header>
    <slot name="header">
      <h1>Default Title</h1>
      <nav>
        <a href="/">Home</a>
      </nav>
    </slot>
  </header>
  <main>
    <slot>
      <h2>Welcome</h2>
      <p>This is the default content.</p>
    </slot>
  </main>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    // Create page with no slot assignments (should use fallback)
    const pageContent = `<div data-layout="_layout.html">
<!-- No slot assignments - should show fallback content -->
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
    
    // Verify fallback content is preserved
    expect(html).toContain('<h1>Default Title</h1>');
    expect(html).toContain('<a href="/">Home</a>');  // Look for the link content
    expect(html).toContain('<h2>Welcome</h2>');
    expect(html).toContain('<p>This is the default content.</p>');
    expect(html).not.toContain('<slot>');
  });
  
  it('should handle multiple elements assigned to same slot', async () => {
    // Create layout
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <main>
    <slot name="content">Default content</slot>
  </main>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    // Create page with multiple assignments to same slot
    const pageContent = `<div data-layout="_layout.html">
<section slot="content">
  <h2>Section 1</h2>
  <p>First section content.</p>
</section>
<article slot="content">
  <h2>Section 2</h2>
  <p>Second section content.</p>
</article>
<div slot="content">
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
});