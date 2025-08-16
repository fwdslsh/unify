import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { processHtmlUnified } from '../../src/core/unified-html-processor.js';

describe('Include Slot Injection', () => {
  let tempDir;
  let sourceRoot;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = path.join(os.tmpdir(), `unify-test-${Date.now()}`);
    sourceRoot = tempDir;
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(path.join(tempDir, '_includes'), { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should inject slot content into included component', async () => {
    // Create a component with data-slot targets
    const componentContent = `<nav class="navbar">
  <div data-slot="brand">Default Brand</div>
  <ul data-slot="links">
    <li><a href="/">Home</a></li>
  </ul>
  <div data-slot="actions">
    <button>Sign In</button>
  </div>
</nav>`;
    
    await fs.writeFile(
      path.join(tempDir, '_includes', 'nav.html'),
      componentContent
    );

    // Create a page using the component with slot injection
    const pageContent = `<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
</head>
<body>
  <include src="/_includes/nav.html">
    <a data-slot="brand" href="/">MyBrand</a>
    
    <ul data-slot="links">
      <li><a href="/docs/">Docs</a></li>
      <li><a href="/blog/">Blog</a></li>
    </ul>
    
    <div data-slot="actions">
      <a href="/start/" class="btn">Get Started</a>
    </div>
  </include>
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

    // Verify slot content was injected
    expect(result.content).toContain('<a href="/">MyBrand</a>');
    expect(result.content).toContain('<li><a href="/docs/">Docs</a></li>');
    expect(result.content).toContain('<li><a href="/blog/">Blog</a></li>');
    expect(result.content).toContain('<a href="/start/" class="btn">Get Started</a>');
    
    // Verify default content was replaced
    expect(result.content).not.toContain('Default Brand');
    expect(result.content).not.toContain('<li><a href="/">Home</a></li>');
    expect(result.content).not.toContain('<button>Sign In</button>');
    
    // Verify data-slot attributes are removed from final output
    expect(result.content).not.toMatch(/data-slot=/);
  });

  test('should use fallback content when no slot is provided', async () => {
    // Create a component with data-slot targets and fallback content
    const componentContent = `<header>
  <h1 data-slot="title">Default Title</h1>
  <p data-slot="subtitle">Default Subtitle</p>
</header>`;
    
    await fs.writeFile(
      path.join(tempDir, '_includes', 'header.html'),
      componentContent
    );

    // Create a page that only provides content for one slot
    const pageContent = `<include src="/_includes/header.html">
  <h1 data-slot="title">Custom Title</h1>
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

    // Verify custom slot content was injected
    expect(result.content).toContain('<h1>Custom Title</h1>');
    
    // Verify fallback content is still present for unprovided slot (data-slot attribute should be removed)
    expect(result.content).toContain('<p>Default Subtitle</p>');
  });

  test('should handle self-closing includes without slot injection', async () => {
    // Create a simple component
    const componentContent = `<footer>
  <p>&copy; 2024 Company Name</p>
</footer>`;
    
    await fs.writeFile(
      path.join(tempDir, '_includes', 'footer.html'),
      componentContent
    );

    // Create a page with self-closing include
    const pageContent = `<include src="/_includes/footer.html" />`;

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

    // Verify component content was included
    expect(result.content).toContain('<footer>');
    expect(result.content).toContain('&copy; 2024 Company Name');
  });

  test('should handle nested includes with slot injection', async () => {
    // Create a card component with slots
    const cardContent = `<div class="card">
  <div class="card-header" data-slot="header">Default Header</div>
  <div class="card-body" data-slot="body">Default Body</div>
</div>`;
    
    await fs.writeFile(
      path.join(tempDir, '_includes', 'card.html'),
      cardContent
    );

    // Create a wrapper component that uses the card
    const wrapperContent = `<section class="wrapper">
  <include src="/_includes/card.html">
    <h2 data-slot="header">Nested Card Title</h2>
    <p data-slot="body">Nested card content from wrapper</p>
  </include>
</section>`;
    
    await fs.writeFile(
      path.join(tempDir, '_includes', 'wrapper.html'),
      wrapperContent
    );

    // Create a page that uses the wrapper
    const pageContent = `<include src="/_includes/wrapper.html" />`;

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

    // Verify nested slot injection worked
    expect(result.content).toContain('<h2>Nested Card Title</h2>');
    expect(result.content).toContain('<p>Nested card content from wrapper</p>');
    expect(result.content).not.toContain('Default Header');
    expect(result.content).not.toContain('Default Body');
  });

  test('should extract and relocate component styles and scripts with slot injection', async () => {
    // Create a component with styles, scripts, and slots
    const componentContent = `<style>
  .custom-nav { background: blue; }
</style>
<nav class="custom-nav">
  <div data-slot="brand">Default Brand</div>
</nav>
<script>
  console.log('Nav component loaded');
</script>`;
    
    await fs.writeFile(
      path.join(tempDir, '_includes', 'styled-nav.html'),
      componentContent
    );

    // Create a page using the component
    const pageContent = `<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
</head>
<body>
  <include src="/_includes/styled-nav.html">
    <a data-slot="brand" href="/">My Brand</a>
  </include>
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

    // Verify styles were moved to head
    expect(result.content).toContain('<style>\n  .custom-nav { background: blue; }\n</style>\n</head>');
    
    // Verify scripts were moved to end of body
    expect(result.content).toContain("<script>\n  console.log('Nav component loaded');\n</script>\n</body>");
    
    // Verify slot content was injected
    expect(result.content).toContain('<a href="/">My Brand</a>');
  });
});