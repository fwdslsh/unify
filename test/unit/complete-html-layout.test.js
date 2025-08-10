/**
 * Test for BUG: Layout applied to complete HTML files
 * Tests that complete HTML documents do not get layouts applied to them
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { processHtmlUnified } from '../../src/core/unified-html-processor.js';
import { createTempDirectory, cleanupTempDirectory } from '../fixtures/temp-helper.js';

describe('Complete HTML Layout Bug', () => {
  let tempDir;
  let sourceDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    await fs.mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  it('should NOT apply layout to complete HTML documents', async () => {
    // Create a complete HTML document like the one from the issue
    const completeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>My Complete Page</title>
  <meta charset="UTF-8">
</head>
<body>
  <h1>This is a complete HTML document</h1>
  <p>It should not get wrapped in any layout.</p>
</body>
</html>`;

    const filePath = path.join(sourceDir, 'index.html');
    await fs.writeFile(filePath, completeHtml);

    // Create a default layout that would wrap content
    const layoutsDir = path.join(sourceDir, '.layouts');
    await fs.mkdir(layoutsDir, { recursive: true });
    const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>Layout Title</title>
</head>
<body>
  <header>Site Header</header>
  <slot></slot>
  <footer>Site Footer</footer>
</body>
</html>`;
    await fs.writeFile(path.join(layoutsDir, 'default.html'), layoutContent);

    // Process the HTML
    const result = await processHtmlUnified(
      completeHtml,
      filePath,
      sourceDir,
      null, // No dependency tracker
      {
        layoutsDir: '.layouts',
        defaultLayout: 'default.html'
      }
    );

    // The result should be the original complete HTML, NOT wrapped in layout
    expect(result.content).toBe(completeHtml);
    expect(result.content.includes('Site Header')).toBe(false);
    expect(result.content.includes('Site Footer')).toBe(false);
    expect(result.content.includes('Layout Title')).toBe(false);
    expect(result.content.includes('My Complete Page')).toBe(true);
  });

  it('should apply layout to HTML fragments', async () => {
    // Create an HTML fragment (no <html> tag)
    const fragmentHtml = `<h1>This is a fragment</h1>
<p>It should get wrapped in a layout.</p>`;

    const filePath = path.join(sourceDir, 'fragment.html');
    await fs.writeFile(filePath, fragmentHtml);

    // Create a default layout
    const layoutsDir = path.join(sourceDir, '.layouts');
    await fs.mkdir(layoutsDir, { recursive: true });
    const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>Layout Title</title>
</head>
<body>
  <header>Site Header</header>
  <slot></slot>
  <footer>Site Footer</footer>
</body>
</html>`;
    await fs.writeFile(path.join(layoutsDir, 'default.html'), layoutContent);

    // Process the HTML
    const result = await processHtmlUnified(
      fragmentHtml,
      filePath,
      sourceDir,
      null, // No dependency tracker
      {
        layoutsDir: '.layouts',
        defaultLayout: 'default.html'
      }
    );

    // The result should be wrapped in the layout
    expect(result.content.includes('Site Header')).toBe(true);
    expect(result.content.includes('Site Footer')).toBe(true);
    expect(result.content.includes('Layout Title')).toBe(true);
    expect(result.content.includes('This is a fragment')).toBe(true);
    expect(result.content.includes('<!DOCTYPE html>')).toBe(true);
  });

  it('should apply explicit layout when data-layout attribute is present', async () => {
    // Create a complete HTML document with explicit layout attribute
    const completeHtmlWithLayout = `<!DOCTYPE html>
<html lang="en" data-layout="custom.html">
<head>
  <title>My Page</title>
</head>
<body>
  <h1>Content with explicit layout</h1>
</body>
</html>`;

    const filePath = path.join(sourceDir, 'explicit.html');
    await fs.writeFile(filePath, completeHtmlWithLayout);

    // Create custom layout
    const layoutsDir = path.join(sourceDir, '.layouts');
    await fs.mkdir(layoutsDir, { recursive: true });
    const customLayoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>Custom Layout</title>
</head>
<body>
  <nav>Custom Nav</nav>
  <slot></slot>
</body>
</html>`;
    await fs.writeFile(path.join(layoutsDir, 'custom.html'), customLayoutContent);

    // Process the HTML
    const result = await processHtmlUnified(
      completeHtmlWithLayout,
      filePath,
      sourceDir,
      null, // No dependency tracker
      {
        layoutsDir: '.layouts',
        defaultLayout: 'default.html'
      }
    );

    // The result should use the explicit layout
    expect(result.content.includes('Custom Nav')).toBe(true);
    expect(result.content.includes('Custom Layout')).toBe(true);
    expect(result.content.includes('Content with explicit layout')).toBe(true);
  });
});