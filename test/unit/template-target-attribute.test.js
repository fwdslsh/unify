/**
 * Tests for template target attribute functionality
 * Verifies spec compliance for <template target="name"> syntax
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { processHtmlUnified } from '../../src/core/unified-html-processor.js';
import { DependencyTracker } from '../../src/core/dependency-tracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFixturesDir = path.join(__dirname, '../fixtures/template-target');

describe('template target attribute', () => {
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
  
  it('should handle template with target attribute for named slots', async () => {
    // Create layout with named slots
    const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>Test Layout</title>
  <slot name="head"></slot>
</head>
<body>
  <header>
    <slot name="header">Default Header</slot>
  </header>
  <main>
    <slot>Default main content</slot>
  </main>
  <aside>
    <slot name="sidebar">Default Sidebar</slot>
  </aside>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, 'default.html'), layoutContent);
    
    // Create page with template target attributes
    const pageContent = `<div data-layout="default.html">
  <template target="head">
    <meta name="description" content="Custom page description">
    <link rel="stylesheet" href="custom.css">
  </template>
  
  <template target="header">
    <h1>Custom Header</h1>
    <nav>Custom Navigation</nav>
  </template>
  
  <template target="sidebar">
    <ul>
      <li>Custom Sidebar Item 1</li>
      <li>Custom Sidebar Item 2</li>
    </ul>
  </template>
  
  <h2>Main Content</h2>
  <p>This is the main page content that goes in the default slot.</p>
</div>`;
    
    const pagePath = path.join(sourceDir, 'test.html');
    const result = await processHtmlUnified(
      pageContent,
      pagePath,
      sourceDir,
      dependencyTracker,
      { layoutsDir: '.layouts' }
    );
    
    // Verify head slot replacement
    expect(result.content.includes('<meta name="description" content="Custom page description">')).toBeTruthy();
    expect(result.content.includes('<link rel="stylesheet" href="custom.css">')).toBeTruthy();
    
    // Verify header slot replacement
    expect(result.content.includes('<h1>Custom Header</h1>')).toBeTruthy();
    expect(result.content.includes('<nav>Custom Navigation</nav>')).toBeTruthy();
    
    // Verify sidebar slot replacement
    expect(result.content.includes('<li>Custom Sidebar Item 1</li>')).toBeTruthy();
    expect(result.content.includes('<li>Custom Sidebar Item 2</li>')).toBeTruthy();
    
    // Verify main content in default slot
    expect(result.content.includes('<h2>Main Content</h2>')).toBeTruthy();
    expect(result.content.includes('<p>This is the main page content that goes in the default slot.</p>')).toBeTruthy();
    
    // Verify template elements are removed from output
    expect(result.content.includes('<template target=')).toBeFalsy();
  });
  
  it('should handle template without target attribute as default slot content', async () => {
    // Create simple layout
    const layoutContent = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <slot>Default content</slot>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, 'default.html'), layoutContent);
    
    // Create page with template without target (default slot)
    const pageContent = `<div data-layout="default.html">
  <template>
    <article>
      <h1>Article Title</h1>
      <p>Article content for default slot</p>
    </article>
  </template>
</div>`;
    
    const pagePath = path.join(sourceDir, 'test.html');
    const result = await processHtmlUnified(
      pageContent,
      pagePath,
      sourceDir,
      dependencyTracker,
      { layoutsDir: '.layouts' }
    );
    
    // Verify template content replaces default slot
    expect(result.content.includes('<article>')).toBeTruthy();
    expect(result.content.includes('<h1>Article Title</h1>')).toBeTruthy();
    expect(result.content.includes('<p>Article content for default slot</p>')).toBeTruthy();
    
    // Verify template element is removed
    expect(result.content.includes('<template>')).toBeFalsy();
  });
  
  it('should support multiple template elements with different targets', async () => {
    // Create layout with multiple named slots
    const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <slot name="meta"></slot>
</head>
<body>
  <header><slot name="nav"></slot></header>
  <main><slot></slot></main>
  <footer><slot name="footer"></slot></footer>
</body>
</html>`;
    
    await fs.writeFile(path.join(layoutsDir, 'multi-slot.html'), layoutContent);
    
    // Create page with multiple targeted templates
    const pageContent = `<div data-layout="multi-slot.html">
  <template target="meta">
    <meta charset="UTF-8">
    <title>Multi-Template Page</title>
  </template>
  
  <template target="nav">
    <a href="/">Home</a>
    <a href="/about">About</a>
  </template>
  
  <template target="footer">
    <p>&copy; 2024 Test Site</p>
  </template>
  
  <h1>Main Content</h1>
  <p>This goes in the default slot.</p>
</div>`;
    
    const pagePath = path.join(sourceDir, 'multi-test.html');
    const result = await processHtmlUnified(
      pageContent,
      pagePath,
      sourceDir,
      dependencyTracker,
      { layoutsDir: '.layouts' }
    );
    
    
    // Verify all targeted content is placed correctly
    expect(result.content.includes('<meta charset="UTF-8">')).toBeTruthy();
    expect(result.content.includes('<title>Multi-Template Page</title>')).toBeTruthy();
    expect(result.content.includes('<a href="/">Home</a>')).toBeTruthy();
    expect(result.content.includes('<a href="/about">About</a>')).toBeTruthy();
    expect(result.content.includes('<p>&copy; 2024 Test Site</p>')).toBeTruthy(); // Test for HTML entity, not decoded symbol
    expect(result.content.includes('<h1>Main Content</h1>')).toBeTruthy();
    
    // Verify all template elements are removed
    expect(result.content.includes('<template target=')).toBeFalsy();
  });
  

});