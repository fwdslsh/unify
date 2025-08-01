import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rm, writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { build, incrementalBuild } from '../../src/core/file-processor.js';
import '../bun-setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Component Asset Inline Behavior', () => {
  let sourceDir;
  let outputDir;
  let testFixturesDir;
  
  beforeEach(async () => {
    testFixturesDir = join(__dirname, '../fixtures/integration-test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    sourceDir = join(testFixturesDir, 'src');
    outputDir = join(testFixturesDir, 'dist');
    
    await mkdir(sourceDir, { recursive: true });
    await mkdir(join(sourceDir, '.components'), { recursive: true });
    await mkdir(join(sourceDir, 'components'), { recursive: true });
  });
  
  afterEach(async () => {
    if (testFixturesDir) {
      await rm(testFixturesDir, { recursive: true, force: true });
    }
  });

  test('SSI-included components keep styles inline at include location', async () => {
    // Create component with style
    await writeFile(join(sourceDir, '.components/styled-button.html'), `<style>
  .btn { background: blue; color: white; padding: 10px; }
</style>
<button class="btn">Click Me</button>`);

    // Create page that includes the component via SSI
    await writeFile(join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
</head>
<body>
  <h1>My Page</h1>
  <div class="button-container">
    <!--#include virtual="/.components/styled-button.html" -->
  </div>
</body>
</html>`);

    await build({
      source: sourceDir,
      output: outputDir,
      components: '.components',
      clean: true
    });
    const output = await readFile(join(outputDir, 'index.html'), 'utf-8');
    
    // Verify style remains inline within the component content
    expect(output).toContain('<div class="button-container">');
    expect(output).toContain('<style>');
    expect(output).toContain('.btn { background: blue; color: white; padding: 10px; }');
    expect(output).toContain('<button class="btn">Click Me</button>');
    
    // Verify style is NOT moved to head section
    const headContent = output.substring(output.indexOf('<head>'), output.indexOf('</head>'));
    expect(headContent).not.toContain('.btn { background: blue');
  });

  test('SSI-included components keep scripts inline at include location', async () => {
    await writeFile(join(sourceDir, '.components/alert-button.html'), `<button onclick="showAlert()">Click for Alert</button>
<script>
  function showAlert() {
    alert('Hello from component!');
  }
</script>`);

    await writeFile(join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<body>
  <h1>Script Test</h1>
  <!--#include virtual="/.components/alert-button.html" -->
</body>
</html>`);

    await build({
      source: sourceDir,
      output: outputDir,
      components: '.components',
      clean: true
    });
    const output = await readFile(join(outputDir, 'index.html'), 'utf-8');
    
    // Verify script remains inline within the component content
    expect(output).toContain('<button onclick="showAlert()">Click for Alert</button>');
    expect(output).toContain('<script>');
    expect(output).toContain('function showAlert()');
    expect(output).toContain("alert('Hello from component!');");
    
    // Verify script is NOT moved to end of body
    const beforeLastBodyTag = output.substring(0, output.lastIndexOf('</body>'));
    const afterComponentScript = beforeLastBodyTag.substring(
      beforeLastBodyTag.indexOf('</script>') + '</script>'.length
    );
    expect(afterComponentScript.trim()).toBe('');
  });

  test('DOM-included components also keep styles inline at include location', async () => {
    await writeFile(join(sourceDir, 'components/card.html'), `<style>
  .card { border: 1px solid #ccc; padding: 20px; margin: 10px; }
  .card h3 { color: #333; }
</style>
<div class="card">
  <h3>Card Title</h3>
  <p>Card content goes here.</p>
</div>`);

    await writeFile(join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <title>DOM Include Test</title>
</head>
<body>
  <h1>DOM Include Example</h1>
  <include src="components/card.html"></include>
</body>
</html>`);

    await build({
      source: sourceDir,
      output: outputDir,
      components: '.components',
      clean: true
    });
    const output = await readFile(join(outputDir, 'index.html'), 'utf-8');
    
    // Verify style remains inline within the component content
    expect(output).toContain('<style>');
    expect(output).toContain('.card { border: 1px solid #ccc; padding: 20px; margin: 10px; }');
    expect(output).toContain('<div class="card">');
    expect(output).toContain('<h3>Card Title</h3>');
    
    // Verify style is NOT in the head section
    const headContent = output.substring(output.indexOf('<head>'), output.indexOf('</head>'));
    expect(headContent).not.toContain('.card {');
  });

  test('component changes trigger complete page rebuild with updated content', async () => {
    // Create initial component
    await writeFile(join(sourceDir, '.components/dynamic-content.html'), `<div class="dynamic">
  <h3>Version 1</h3>
  <p>Original content here</p>
</div>`);

    // Create page that includes the component
    await writeFile(join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <title>Component Rebuild Test</title>
</head>
<body>
  <h1>Main Page</h1>
  <!--#include virtual="/.components/dynamic-content.html" -->
  <footer>End of page</footer>
</body>
</html>`);

    // Initial build
    await build({
      source: sourceDir,
      output: outputDir,
      components: '.components',
      clean: true
    });
    
    let output = await readFile(join(outputDir, 'index.html'), 'utf-8');
    expect(output).toContain('Version 1');
    expect(output).toContain('Original content here');
    
    // Update the component with completely different content
    await writeFile(join(sourceDir, '.components/dynamic-content.html'), `<div class="dynamic-updated">
  <h3>Version 2 - UPDATED</h3>
  <p>Completely new content with different styling</p>
  <span>Extra element added</span>
</div>`);

    // Rebuild only the affected page
    await build({
      source: sourceDir,
      output: outputDir,
      components: '.components',
      clean: false  // Incremental build
    });
    
    // Verify the output has been completely updated
    output = await readFile(join(outputDir, 'index.html'), 'utf-8');
    
    // Should contain new content
    expect(output).toContain('Version 2 - UPDATED');
    expect(output).toContain('Completely new content with different styling');
    expect(output).toContain('Extra element added');
    expect(output).toContain('dynamic-updated');
    
    // Should NOT contain old content
    expect(output).not.toContain('Version 1');
    expect(output).not.toContain('Original content here');
    expect(output).not.toContain('class="dynamic"'); // old class name
    
    // Page structure should remain intact
    expect(output).toContain('<h1>Main Page</h1>');
    expect(output).toContain('<footer>End of page</footer>');
  });

  test('nested include changes trigger complete rebuild of all dependent pages', async () => {
    // Create nested includes: page -> header -> nav
    await writeFile(join(sourceDir, '.components/nav.html'), `<ul class="nav-v1">
  <li><a href="/">Home v1</a></li>
  <li><a href="/about">About v1</a></li>
</ul>`);

    await writeFile(join(sourceDir, '.components/header.html'), `<header class="site-header">
  <h1>Site Title</h1>
  <!--#include virtual="/.components/nav.html" -->
</header>`);

    await writeFile(join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head><title>Nested Include Test</title></head>
<body>
  <!--#include virtual="/.components/header.html" -->
  <main>Index page content</main>
</body>
</html>`);

    await writeFile(join(sourceDir, 'about.html'), `<!DOCTYPE html>
<html>
<head><title>About - Nested Include Test</title></head>
<body>
  <!--#include virtual="/.components/header.html" -->
  <main>About page content</main>
</body>
</html>`);

    // Initial build
    const buildResult = await build({
      source: sourceDir,
      output: outputDir,
      components: '.components',
      clean: true
    });
    
    let indexOutput = await readFile(join(outputDir, 'index.html'), 'utf-8');
    let aboutOutput = await readFile(join(outputDir, 'about.html'), 'utf-8');
    
    // Verify initial content in both pages
    expect(indexOutput).toContain('nav-v1');
    expect(indexOutput).toContain('Home v1');
    expect(aboutOutput).toContain('nav-v1');
    expect(aboutOutput).toContain('About v1');
    
    // Update the deeply nested navigation component
    await writeFile(join(sourceDir, '.components/nav.html'), `<ul class="nav-v2">
  <li><a href="/">Home v2 UPDATED</a></li>
  <li><a href="/about">About v2 UPDATED</a></li>
  <li><a href="/contact">Contact NEW</a></li>
</ul>`);

    // Incremental rebuild simulating what file watcher would do
    const changedFile = join(sourceDir, '.components/nav.html');
    await incrementalBuild({
      source: sourceDir,
      output: outputDir,
      components: '.components',
      clean: false
    }, buildResult.dependencyTracker, buildResult.assetTracker, changedFile);
    
    // Verify both dependent pages have been completely rebuilt with new content
    indexOutput = await readFile(join(outputDir, 'index.html'), 'utf-8');
    aboutOutput = await readFile(join(outputDir, 'about.html'), 'utf-8');
    
    // Both pages should have updated navigation
    [indexOutput, aboutOutput].forEach(output => {
      // Should contain new content
      expect(output).toContain('nav-v2');
      expect(output).toContain('Home v2 UPDATED');
      expect(output).toContain('About v2 UPDATED');
      expect(output).toContain('Contact NEW');
      
      // Should NOT contain old content
      expect(output).not.toContain('nav-v1');
      expect(output).not.toContain('Home v1');
      expect(output).not.toContain('About v1');
    });
    
    // Page-specific content should remain unchanged
    expect(indexOutput).toContain('Index page content');
    expect(aboutOutput).toContain('About page content');
  });
});
