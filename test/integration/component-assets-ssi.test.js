import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Component Assets with SSI Includes', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDirectory(tempDir);
    }
  });

  it('should inline style elements from SSI-included components (Apache SSI behavior)', async () => {
    // Create test structure
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

    // Build the site
    const { build } = await import('../../src/core/file-processor.js');
    await build({
      source: sourceDir,
      output: outputDir,
      layouts: path.join(sourceDir, '.layouts'),
      components: path.join(sourceDir, '.components'),
      clean: true
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'index.html');
    const content = await fs.readFile(outputFile, 'utf-8');

    // SSI includes should inline styles at include location (like Apache SSI)
    expect(content).toMatch(/<div>[\s\S]*<style>[\s\S]*\.btn[\s\S]*background:\s*blue[\s\S]*<\/style>[\s\S]*<button class="btn">Click Me<\/button>[\s\S]*<\/div>/);
    
    // Styles should NOT be moved to head (SSI maintains Apache SSI behavior)
    expect(content).not.toMatch(/<head>[\s\S]*<style>[\s\S]*\.btn[\s\S]*<\/style>[\s\S]*<\/head>/);
  });

  it('should inline script elements from SSI-included components (Apache SSI behavior)', async () => {
    // Create test structure
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

    // Build the site
    const { build } = await import('../../src/core/file-processor.js');
    await build({
      source: sourceDir,
      output: outputDir,
      layouts: path.join(sourceDir, '.layouts'),
      components: path.join(sourceDir, '.components'),
      clean: true
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'index.html');
    const content = await fs.readFile(outputFile, 'utf-8');

    // SSI includes should inline scripts at include location (like Apache SSI)
    expect(content).toMatch(/<div>[\s\S]*<div id="counter">0<\/div>[\s\S]*<script>[\s\S]*function increment\(\)[\s\S]*<\/script>[\s\S]*<\/div>/);
    
    // Scripts should NOT be moved to end of body (should be within the div, not directly before </body>)
    expect(content).not.toMatch(/<script>[\s\S]*function increment\(\)\s*{[\s\S]*?<\/script>\s*<\/body>/);
  });

  it('should inline both styles and scripts from SSI-included components (Apache SSI behavior)', async () => {
    // Create test structure
    const sourceDir = path.join(tempDir, 'src');
    const outputDir = path.join(tempDir, 'dist');
    
    await createTestStructure(sourceDir, {
      '.components/modal.html': `
<style>
  .modal {
    display: none;
    position: fixed;
    z-index: 1000;
    background: rgba(0,0,0,0.5);
  }
  .modal.show {
    display: block;
  }
</style>
<div class="modal" id="myModal">
  <div class="modal-content">
    <span class="close">&times;</span>
    <p>Modal content here!</p>
  </div>
</div>
<script>
  function showModal() {
    document.getElementById('myModal').classList.add('show');
  }
  function hideModal() {
    document.getElementById('myModal').classList.remove('show');
  }
</script>
        `,
      'index.html': `
<!DOCTYPE html>
<html>
<head>
  <title>SSI Combined Test</title>
</head>
<body>
  <button onclick="showModal()">Open Modal</button>
  <!--#include virtual="/.components/modal.html" -->
</body>
</html>
        `
    });

    // Build the site
    const { build } = await import('../../src/core/file-processor.js');
    await build({
      source: sourceDir,
      output: outputDir,
      layouts: path.join(sourceDir, '.layouts'),
      components: path.join(sourceDir, '.components'),
      clean: true
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'index.html');
    const content = await fs.readFile(outputFile, 'utf-8');

    // SSI includes should inline both styles and scripts at include location (like Apache SSI)
    // All the modal content (styles, HTML, scripts) should be inlined where the include was placed
    expect(content).toMatch(/<style>[\s\S]*\.modal[\s\S]*position:\s*fixed[\s\S]*<\/style>[\s\S]*<div class="modal" id="myModal">[\s\S]*<\/div>[\s\S]*<script>[\s\S]*function showModal\(\)[\s\S]*<\/script>/);
    
    // Styles should NOT be moved to head (SSI maintains Apache SSI behavior)
    expect(content).not.toMatch(/<head>[\s\S]*<style>[\s\S]*\.modal[\s\S]*<\/style>[\s\S]*<\/head>/);
  });
});
