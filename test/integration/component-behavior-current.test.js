import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Current Component Include Behavior', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDirectory(tempDir);
    }
  });

  it('should inline style elements from SSI-included components', async () => {
    const sourceDir = path.join(tempDir, 'src');
    const outputDir = path.join(tempDir, 'dist');
    
    await createTestStructure(sourceDir, {
      '.components/styled-button.html': `
<style>
  .btn {
    background: blue;
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
  }
</style>
<button class="btn">Click Me</button>
      `,
      'index.html': `
<!DOCTYPE html>
<html>
<head>
  <title>SSI Style Test</title>
</head>
<body>
  <div>
    <!--#include virtual="/.components/styled-button.html" -->
  </div>
</body>
</html>
      `
    });

    const { build } = await import('../../src/core/file-processor.js');
    await build({
      source: sourceDir,
      output: outputDir,
      layouts: path.join(sourceDir, '.layouts'),
      components: path.join(sourceDir, '.components'),
      clean: true,
      cacheDir: path.join(tempDir, '.cache')
    });

    const outputFile = path.join(outputDir, 'index.html');
    const content = await fs.readFile(outputFile, 'utf-8');

    // Current behavior: styles are inlined at include location, NOT moved to head
    expect(content).toMatch(/<div>[\s\S]*<style>[\s\S]*\.btn[\s\S]*background:\s*blue[\s\S]*<\/style>[\s\S]*<button class="btn">Click Me<\/button>[\s\S]*<\/div>/);
    
    // Current behavior: styles are NOT in the head section  
    expect(content).not.toMatch(/<head>[\s\S]*<style>[\s\S]*\.btn[\s\S]*<\/style>[\s\S]*<\/head>/);
  });

  it('should inline script elements from SSI-included components', async () => {
    const sourceDir = path.join(tempDir, 'src');
    const outputDir = path.join(tempDir, 'dist');
    
    await createTestStructure(sourceDir, {
      '.components/counter.html': `
<div id="counter">0</div>
<script>
  function increment() {
    const counter = document.getElementById('counter');
    counter.textContent = parseInt(counter.textContent) + 1;
  }
</script>
      `,
      'index.html': `
<!DOCTYPE html>
<html>
<head>
  <title>SSI Script Test</title>
</head>
<body>
  <div>
    <!--#include virtual="/.components/counter.html" -->
  </div>
</body>
</html>
      `
    });

    const { build } = await import('../../src/core/file-processor.js');
    await build({
      source: sourceDir,
      output: outputDir,
      layouts: path.join(sourceDir, '.layouts'),
      components: path.join(sourceDir, '.components'),
      clean: true,
      cacheDir: path.join(tempDir, '.cache')
    });

    const outputFile = path.join(outputDir, 'index.html');
    const content = await fs.readFile(outputFile, 'utf-8');

    // Current behavior: scripts are inlined at include location, NOT moved to end of body
    expect(content).toMatch(/<div>[\s\S]*<div id="counter">0<\/div>[\s\S]*<script>[\s\S]*function increment\(\)[\s\S]*<\/script>[\s\S]*<\/div>/);
    
    // Current behavior: scripts are NOT moved to end of body (should be inside the div, not directly before </body>)
    expect(content).not.toMatch(/<script>[\s\S]*function increment\(\)\s*{[\s\S]*?<\/script>\s*<\/body>/);
  });

  it('should inline style elements from DOM-included components', async () => {
    const sourceDir = path.join(tempDir, 'src');
    const outputDir = path.join(tempDir, 'dist');
    
    await createTestStructure(sourceDir, {
      '.components/styled-button.html': `
<style>
  .btn {
    background: blue;
    color: white;
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
  }
</style>
<button class="btn">Click Me</button>
      `,
      'index.html': `
<!DOCTYPE html>
<html>
<head>
  <title>DOM Style Test</title>
</head>
<body>
  <div>
    <include src=".components/styled-button.html"></include>
  </div>
</body>
</html>
      `
    });

    const { build } = await import('../../src/core/file-processor.js');
    await build({
      source: sourceDir,
      output: outputDir,
      layouts: path.join(sourceDir, '.layouts'),
      components: path.join(sourceDir, '.components'),
      clean: true,
      cacheDir: path.join(tempDir, '.cache')
    });

    const outputFile = path.join(outputDir, 'index.html');
    const content = await fs.readFile(outputFile, 'utf-8');

    // Current behavior: styles are moved to head for DOM includes 
    expect(content).toMatch(/<head>[\s\S]*<style>[\s\S]*\.btn[\s\S]*background:\s*blue[\s\S]*<\/style>[\s\S]*<\/head>/);
    
    // The button should be in the body without the style
    expect(content).toMatch(/<div>[\s\S]*<button class="btn">Click Me<\/button>[\s\S]*<\/div>/);
    
    // Styles should NOT be inlined at include location for DOM includes
    expect(content).not.toMatch(/<div>[\s\S]*<style>[\s\S]*\.btn[\s\S]*background:\s*blue[\s\S]*<\/style>[\s\S]*<button class="btn">Click Me<\/button>[\s\S]*<\/div>/);
  });
});
