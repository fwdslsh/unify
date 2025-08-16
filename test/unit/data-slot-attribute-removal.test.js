import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { processHtmlUnified } from '../../src/core/unified-html-processor.js';

describe('Data-slot Attribute Removal', () => {
  let tempDir;
  let sourceRoot;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = path.join(os.tmpdir(), `unify-test-${Date.now()}`);
    sourceRoot = tempDir;
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should remove data-slot attributes from layout targets after slot injection', async () => {
    // Create a layout with data-slot attributes
    const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>Test Layout</title>
</head>
<body>
  <header>
    <div data-slot="header">
      <h1>Default Header</h1>
    </div>
  </header>
  <main data-slot="default">
    <p>Default content</p>
  </main>
  <aside data-slot="sidebar">
    <p>Default sidebar</p>
  </aside>
</body>
</html>`;
    
    await fs.writeFile(
      path.join(tempDir, 'layout.html'),
      layoutContent
    );

    // Create a page that uses the layout with slot content
    const pageContent = `<!DOCTYPE html>
<html>
<head>
  <link rel="layout" href="layout.html">
  <title>Test Page</title>
</head>
<body>
  <template data-slot="header">
    <h1>Custom Header</h1>
    <p>Custom subtitle</p>
  </template>
  
  <template data-slot="sidebar">
    <nav>Custom sidebar nav</nav>
  </template>
  
  <h2>Main Content</h2>
  <p>This goes into the default slot.</p>
</body>
</html>`;

    const pagePath = path.join(tempDir, 'test.html');
    await fs.writeFile(pagePath, pageContent);

    // Process the HTML
    const result = await processHtmlUnified(
      pageContent,
      pagePath,
      sourceRoot,
      null,
      {}
    );

    // Verify slot content was injected correctly
    expect(result.content).toContain('<h1>Custom Header</h1>');
    expect(result.content).toContain('<p>Custom subtitle</p>');
    expect(result.content).toContain('<nav>Custom sidebar nav</nav>');
    expect(result.content).toContain('<h2>Main Content</h2>');
    
    // CRITICAL: Verify data-slot attributes are removed from final output
    expect(result.content).not.toContain('data-slot="header"');
    expect(result.content).not.toContain('data-slot="default"');
    expect(result.content).not.toContain('data-slot="sidebar"');
    
    // Verify no data-slot attributes exist anywhere in the output
    expect(result.content).not.toMatch(/data-slot=/);
  });

  test('should remove data-slot attributes from include targets after slot injection', async () => {
    // Create a component with data-slot targets
    const componentContent = `<div class="card">
  <header data-slot="header">
    <h3>Default Title</h3>
  </header>
  <div data-slot="content">
    <p>Default content</p>
  </div>
  <footer data-slot="footer">
    <p>Default footer</p>
  </footer>
</div>`;
    
    await fs.mkdir(path.join(tempDir, '_includes'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '_includes', 'card.html'),
      componentContent
    );

    // Create a page using the component with slot injection
    const pageContent = `<include src="/_includes/card.html">
  <h3 data-slot="header">Custom Card Title</h3>
  
  <div data-slot="content">
    <p>Custom card content here</p>
    <ul>
      <li>Item 1</li>
      <li>Item 2</li>
    </ul>
  </div>
  
  <small data-slot="footer">Custom footer text</small>
</include>`;

    const pagePath = path.join(tempDir, 'test.html');
    await fs.writeFile(pagePath, pageContent);

    // Process the HTML
    const result = await processHtmlUnified(
      pageContent,
      pagePath,
      sourceRoot,
      null,
      {}
    );

    // Verify slot content was injected correctly
    expect(result.content).toContain('<h3>Custom Card Title</h3>');
    expect(result.content).toContain('<p>Custom card content here</p>');
    expect(result.content).toContain('<small>Custom footer text</small>');
    
    // CRITICAL: Verify data-slot attributes are removed from final output
    expect(result.content).not.toContain('data-slot="header"');
    expect(result.content).not.toContain('data-slot="content"');
    expect(result.content).not.toContain('data-slot="footer"');
    
    // Verify no data-slot attributes exist anywhere in the output
    expect(result.content).not.toMatch(/data-slot=/);
  });

  test('should handle empty slots and still remove data-slot attributes', async () => {
    // Create a layout with some empty slots and some with fallback content
    const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>Test Layout</title>
</head>
<body>
  <header data-slot="header"></header>
  <main data-slot="default">
    <p>Fallback content</p>
  </main>
  <aside data-slot="sidebar">
    <p>Sidebar fallback</p>
  </aside>
</body>
</html>`;
    
    await fs.writeFile(
      path.join(tempDir, 'layout.html'),
      layoutContent
    );

    // Create a page that only provides content for some slots
    const pageContent = `<!DOCTYPE html>
<html>
<head>
  <link rel="layout" href="layout.html">
  <title>Test Page</title>
</head>
<body>
  <template data-slot="header">
    <h1>Only Header Provided</h1>
  </template>
  
  <p>This goes to default slot, replacing fallback.</p>
</body>
</html>`;

    const pagePath = path.join(tempDir, 'test.html');
    await fs.writeFile(pagePath, pageContent);

    // Process the HTML
    const result = await processHtmlUnified(
      pageContent,
      pagePath,
      sourceRoot,
      null,
      {}
    );

    // Verify the provided slot content was injected
    expect(result.content).toContain('<h1>Only Header Provided</h1>');
    expect(result.content).toContain('<p>This goes to default slot');
    
    // Verify fallback content for unused slot is preserved
    expect(result.content).toContain('<p>Sidebar fallback</p>');
    
    // CRITICAL: Verify ALL data-slot attributes are removed, even from unused slots
    expect(result.content).not.toMatch(/data-slot=/);
  });
});