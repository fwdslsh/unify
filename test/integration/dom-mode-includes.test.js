/**
 * Integration test for DOM Mode include processing
 * Tests that <include> elements are properly processed and components/layouts are excluded from output
 */

import { it, describe, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from '../../src/core/file-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('DOM Mode Include Processing', () => {
  const tempBase = '/tmp/unify-dom-mode-test';
  let testDir, sourceDir, outputDir, componentsDir, layoutsDir;

  beforeEach(async () => {
    testDir = tempBase;
    sourceDir = path.join(testDir, 'src');
    outputDir = path.join(testDir, 'dist');
    componentsDir = path.join(sourceDir, 'custom_components'); // Changed from '_includes'
    layoutsDir = path.join(sourceDir, '_includes');

    // Clean up and create test directories
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(componentsDir, { recursive: true });
    await fs.mkdir(layoutsDir, { recursive: true });

    // Create a simple component
    await fs.writeFile(
      path.join(componentsDir, 'alert.html'),
      `<style>
  .alert { 
    color: red; 
    padding: 1rem; 
    border: 1px solid red; 
    border-radius: 4px;
    background: #fff5f5;
    margin: 16px 0;
  }
  .alert strong {
    display: block;
    margin-bottom: 8px;
  }
</style>

<div class="alert">
  <strong>Title</strong>
  <p>Message</p>
</div>`
    );

    // Create a card component
    await fs.writeFile(
      path.join(componentsDir, 'card.html'),
      `<style>
  .card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
    background: white;
  }
  .card h3 {
    margin-top: 0;
    color: #333;
  }
</style>

<div class="card">
  <h3>Card Title</h3>
  <p>Card content goes here.</p>
</div>`
    );

    // Create a navigation component
    await fs.writeFile(
      path.join(componentsDir, 'navigation.html'),
      `<nav>
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/about.html">About</a></li>
    <li><a href="/blog.html">Blog</a></li>
  </ul>
</nav>`
    );

    // Create a blog layout
    await fs.writeFile(
      path.join(layoutsDir, 'blog.layout.html'),
      `<!DOCTYPE html>
<html>
<head>
  <title><slot name="title">My Blog</slot></title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/styles/site.css">
  <style>
    .blog-layout {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    .blog-header {
      text-align: center;
      border-bottom: 2px solid #eee;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .blog-content {
      line-height: 1.6;
    }
    .blog-footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
      color: #666;
    }
  </style>
</head>
<body class="blog-layout">
  <template slot="header">
    <h1>My Blog</h1>
  </template>
  <main class="blog-content">
    <slot></slot> <!-- Main blog content -->
  </main>
</body>
</html>`
    );

    // Create the test page with DOM-style includes
    await fs.writeFile(
      path.join(sourceDir, 'blog.html'),
      `<body data-layout="/_includes/blog.layout.html">
  <template slot="title">Welcome to DOM Mode</template>
  <template slot="header">
    <h1>🧱 Unify DOM Mode</h1>
    <p>Modern templating with pure HTML</p>
  </template>

  <h2>Hello!</h2>
  <p>This is a blog post rendered with the Unify DOM Mode layout engine. This content goes into the unnamed slot.</p>

  <include src="/custom_components/alert.html"
           data-title="Note"
           data-message="This site uses 100% declarative HTML." />

  <h3>Components Example</h3>
  <p>Here are some reusable components:</p>

  <include src="/custom_components/card.html"
           data-title="🎯 Features"
           data-content="DOM Mode supports layouts and components." />

  <include src="/custom_components/card.html"
           data-title="⚡ Performance"
           data-content="All processing happens at build time - zero runtime JavaScript needed." />

  <include src="/custom_components/navigation.html" />

  <template slot="footer">
    <p>© 2025 - Built with Unify DOM Mode</p>
    <p><a href="https://github.com/yourusername/unify">View on GitHub</a></p>
  </template>
</body>`
    );

    // Create a styles directory (to be copied as asset)
    await fs.mkdir(path.join(sourceDir, 'styles'), { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, 'styles', 'site.css'),
      `body { font-family: Arial, sans-serif; }`
    );
  });

  afterEach(async () => {
  // Clean up after each test
  await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should process <include> elements and include component content', async () => {
    // Build the site
    await build({
      source: sourceDir,
      output: outputDir
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'blog.html');
    const outputContent = await fs.readFile(outputFile, 'utf-8');

    // Debug: Log the actual output content
    console.log('\n=== ACTUAL OUTPUT CONTENT ===');
    console.log(outputContent);
    console.log('=== END OUTPUT ===\n');

    // Check that include elements are processed and replaced with component content
    expect(outputContent.includes('<include')).toBeFalsy();

    // Check that component content was included
    expect(outputContent.includes('<div class="alert">')).toBeTruthy();
    expect(outputContent.includes('<div class="card">')).toBeTruthy();

    // Check that component styles were moved to head
    expect(outputContent.includes('.alert {')).toBeTruthy();
    expect(outputContent.includes('.card {')).toBeTruthy();

    // Check that navigation content was included
    expect(outputContent.includes('<nav>')).toBeTruthy();
    expect(outputContent.includes('<a href="/about.html">About</a>')).toBeTruthy();

    // Check that layout was applied
    expect(outputContent.includes('<!DOCTYPE html>')).toBeTruthy();
    expect(outputContent.includes('<title>Welcome to DOM Mode</title>')).toBeTruthy();
  });

  it('should exclude component and layout directories from output', async () => {

    // Build the site
    await build({
      source: sourceDir,
      output: outputDir
    });

  // Check that _includes directory is not copied to output
  const outputIncludesDir = path.join(outputDir, '_includes');
  const includesExists = await fs.access(outputIncludesDir).then(() => true).catch(() => false);
  expect(includesExists).toBe(false);

    // Check that other assets (like styles) are copied
    const outputStylesDir = path.join(outputDir, 'styles');
    await fs.access(outputStylesDir); // Should not throw
    const cssFile = path.join(outputStylesDir, 'site.css');
    await fs.access(cssFile); // Should not throw
  });

  it('should handle nested includes recursively', async () => {
    // Create a component that includes another component
    await fs.writeFile(
      path.join(componentsDir, 'nested.html'),
      `<div class="nested">
  <h4>Nested Component</h4>
  <include src="/custom_components/alert.html" />
</div>`
    );

    // Update the blog page to include the nested component
    await fs.writeFile(
      path.join(sourceDir, 'blog.html'),
      `<body data-layout="/_includes/blog.layout.html">
  <template slot="title">Nested Include Test</template>
  
  <h2>Testing Nested Includes</h2>
  <include src="/custom_components/nested.html" />
</body>`
    );

    // Build the site
    await build({
      source: sourceDir,
      output: outputDir
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'blog.html');
    const outputContent = await fs.readFile(outputFile, 'utf-8');

    // Check that nested includes are processed
    expect(outputContent.includes('<include')).toBeFalsy();
    expect(outputContent.includes('Nested Component')).toBeTruthy();
    expect(outputContent.includes('<div class="alert">')).toBeTruthy();
  });
});
