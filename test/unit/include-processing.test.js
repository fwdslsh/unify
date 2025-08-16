/**
 * Tests for include processing, specifically self-closing include tags
 */

import { test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { processHtmlUnified } from '../../src/core/unified-html-processor.js';

const testDir = path.join(process.cwd(), 'test', 'temp', 'include-processing');

beforeEach(async () => {
  // Create test directory structure
  await fs.mkdir(testDir, { recursive: true });
  await fs.mkdir(path.join(testDir, '_includes'), { recursive: true });
});

afterEach(async () => {
  // Clean up test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
});

test('should process self-closing include tags', async () => {
  // Create a footer include file
  const footerContent = `<footer>
  <div class="footer-content">
    <p>Test Footer Content</p>
  </div>
</footer>`;
  
  await fs.writeFile(path.join(testDir, '_includes', 'footer.html'), footerContent);

  // Create HTML with self-closing include tag
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
</head>
<body>
  <main>
    <h1>Main Content</h1>
  </main>
  <include src="_includes/footer.html"/>
</body>
</html>`;

  const layoutPath = path.join(testDir, 'layout.html');
  await fs.writeFile(layoutPath, htmlContent);

  const config = { 
    failFast: false,
    componentsDir: path.join(testDir, 'components')
  };

  // Process the HTML
  const result = await processHtmlUnified(
    htmlContent,
    layoutPath,
    testDir,
    null, // No dependency tracker
    config
  );

  const processedContent = result.content || result;

  // The result should contain the footer content, not the include tag
  expect(processedContent).toContain('Test Footer Content');
  expect(processedContent).toContain('<footer>');
  expect(processedContent).not.toContain('<include');
});

test('should process self-closing include tags with spaces', async () => {
  // Create a footer include file
  const footerContent = `<footer><p>Spaced Footer</p></footer>`;
  
  await fs.writeFile(path.join(testDir, '_includes', 'footer.html'), footerContent);

  // Create HTML with self-closing include tag with various spacing
  const htmlContent = `<!DOCTYPE html>
<html>
<body>
  <include src="_includes/footer.html" />
</body>
</html>`;

  const layoutPath = path.join(testDir, 'layout.html');
  await fs.writeFile(layoutPath, htmlContent);

  const config = { 
    failFast: false,
    componentsDir: path.join(testDir, 'components')
  };

  // Process the HTML
  const result = await processHtmlUnified(
    htmlContent,
    layoutPath,
    testDir,
    null,
    config
  );

  const processedContent = result.content || result;

  // The result should contain the footer content, not the include tag
  expect(processedContent).toContain('Spaced Footer');
  expect(processedContent).not.toContain('<include');
});

test('should process include tags with empty children', async () => {
  // Create a footer include file
  const footerContent = `<footer><p>Empty Children Footer</p></footer>`;
  
  await fs.writeFile(path.join(testDir, '_includes', 'footer.html'), footerContent);

  // Create HTML with include tag that has empty children (like the website layout)
  const htmlContent = `<!DOCTYPE html>
<html>
<body>
  <main>
    <h1>Main Content</h1>
  </main>
  <include src="_includes/footer.html"></include>
</body>
</html>`;

  const layoutPath = path.join(testDir, 'layout.html');
  await fs.writeFile(layoutPath, htmlContent);

  const config = { 
    failFast: false,
    componentsDir: path.join(testDir, 'components')
  };

  // Process the HTML
  const result = await processHtmlUnified(
    htmlContent,
    layoutPath,
    testDir,
    null,
    config
  );

  const processedContent = result.content || result;

  // The result should contain the footer content, not the include tag
  expect(processedContent).toContain('Empty Children Footer');
  expect(processedContent).toContain('<footer>');
  expect(processedContent).not.toContain('<include');
});

test('should process regular include tags with children', async () => {
  // Create a layout include file that uses slots
  const layoutContent = `<div class="wrapper">
  <div data-slot="default"></div>
</div>`;
  
  await fs.writeFile(path.join(testDir, '_includes', 'wrapper.html'), layoutContent);

  // Create HTML with include tag that has children
  const htmlContent = `<!DOCTYPE html>
<html>
<body>
  <include src="_includes/wrapper.html">
    <p>This is slot content</p>
  </include>
</body>
</html>`;

  const layoutPath = path.join(testDir, 'layout.html');
  await fs.writeFile(layoutPath, htmlContent);

  const config = { 
    failFast: false,
    componentsDir: path.join(testDir, 'components')
  };

  // Process the HTML
  const result = await processHtmlUnified(
    htmlContent,
    layoutPath,
    testDir,
    null,
    config
  );

  const processedContent = result.content || result;

  // The result should contain the wrapper and slot content
  expect(processedContent).toContain('wrapper');
  expect(processedContent).toContain('This is slot content');
  expect(processedContent).not.toContain('<include');
});

test('should process include tags with explicit slot targeting', async () => {
  // Create a layout include file that uses multiple slots
  const layoutContent = `<div class="wrapper">
  <header data-slot="header"></header>
  <div data-slot="default"></div>
  <footer data-slot="footer"></footer>
</div>`;
  
  await fs.writeFile(path.join(testDir, '_includes', 'multi-slot.html'), layoutContent);

  // Create HTML with include tag that has multiple slot targets
  const htmlContent = `<!DOCTYPE html>
<html>
<body>
  <include src="_includes/multi-slot.html">
    <h1 data-slot="header">Page Title</h1>
    <p data-slot="default">Main content here</p>
    <small data-slot="footer">Copyright info</small>
  </include>
</body>
</html>`;

  const layoutPath = path.join(testDir, 'layout.html');
  await fs.writeFile(layoutPath, htmlContent);

  const config = { 
    failFast: false,
    componentsDir: path.join(testDir, 'components')
  };

  // Process the HTML
  const result = await processHtmlUnified(
    htmlContent,
    layoutPath,
    testDir,
    null,
    config
  );

  const processedContent = result.content || result;

  // The result should contain all slot content in the right places
  expect(processedContent).toContain('wrapper');
  expect(processedContent).toContain('Page Title');
  expect(processedContent).toContain('Main content here');
  expect(processedContent).toContain('Copyright info');
  expect(processedContent).not.toContain('<include');
  expect(processedContent).not.toContain('data-slot');
});
