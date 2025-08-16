/**
 * Integration test for component asset processing (styles and scripts)
 * Tests that <style> and <script> elements from components are properly included in the final HTML
 */

import { it, describe, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from '../../src/core/file-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Component Asset Processing', () => {
  let testDir = null;
  let sourceDir = null;
  let outputDir = null;
  let componentsDir = null;
  let includesDir = null;

  beforeEach(async () => {
    // Create unique test directories for each test
    testDir = path.join(__dirname, '../test-temp/component-assets-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    sourceDir = path.join(testDir, 'src');
    outputDir = path.join(testDir, 'dist');
    componentsDir = path.join(sourceDir, '.components');
    includesDir = path.join(sourceDir, '_includes');

    // Clean up and create test directories
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(componentsDir, { recursive: true });
    await fs.mkdir(includesDir, { recursive: true });

    // Create a component with styles only
    await fs.writeFile(
      path.join(componentsDir, 'styled-button.html'),
      `<style>
  .btn {
    background: #007bff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
  }
  .btn:hover {
    background: #0056b3;
  }
  .btn:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }
</style>

<button class="btn">Click Me</button>`
    );

    // Create a component with scripts only
    await fs.writeFile(
      path.join(componentsDir, 'interactive-counter.html'),
      `<div id="counter-widget">
  <span id="count">0</span>
  <button onclick="incrementCounter()">+</button>
  <button onclick="decrementCounter()">-</button>
</div>

<script>
  let count = 0;
  
  function incrementCounter() {
    count++;
    document.getElementById('count').textContent = count;
  }
  
  function decrementCounter() {
    count--;
    document.getElementById('count').textContent = count;
  }
  
  // Initialize counter
  document.addEventListener('DOMContentLoaded', function() {
    console.log('Counter widget initialized');
  });
</script>`
    );

    // Create a component with both styles and scripts
    await fs.writeFile(
      path.join(componentsDir, 'modal-dialog.html'),
      `<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: none;
    z-index: 1000;
  }
  .modal-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 20px;
    border-radius: 8px;
    max-width: 500px;
    width: 90%;
  }
  .modal-close {
    float: right;
    font-size: 24px;
    cursor: pointer;
    color: #999;
  }
</style>

<div class="modal-overlay" id="modal">
  <div class="modal-content">
    <span class="modal-close" onclick="closeModal()">&times;</span>
    <h3>Modal Title</h3>
    <p>Modal content goes here.</p>
  </div>
</div>

<script>
  function openModal() {
    document.getElementById('modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
  }
  
  function closeModal() {
    document.getElementById('modal').style.display = 'none';
    document.body.style.overflow = 'auto';
  }
  
  // Close modal when clicking overlay
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
      closeModal();
    }
  });
</script>`
    );

    // Create a component with multiple style and script blocks
    await fs.writeFile(
      path.join(componentsDir, 'complex-widget.html'),
      `<style>
  .widget {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 16px;
    margin: 8px 0;
  }
</style>

<div class="widget">
  <h4>Complex Widget</h4>
  <div class="widget-controls">
    <button onclick="widgetAction('save')">Save</button>
    <button onclick="widgetAction('cancel')">Cancel</button>
  </div>
</div>

<style>
  .widget-controls {
    margin-top: 12px;
  }
  .widget-controls button {
    margin-right: 8px;
    padding: 4px 12px;
    border: 1px solid #ccc;
    background: #f8f9fa;
    cursor: pointer;
  }
</style>

<script>
  function widgetAction(action) {
    console.log('Widget action:', action);
  }
</script>

<script>
  // Second script block for additional functionality
  document.addEventListener('DOMContentLoaded', function() {
    console.log('Complex widget loaded');
  });
</script>`
    );

    // Create a layout that includes styles and scripts
    await fs.writeFile(
      path.join(includesDir, 'layout.html'),
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component Test Page</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <main data-slot="default"></main>
  </div>
  
  <script>
    console.log('Layout script loaded');
  </script>
</body>
</html>`
    );
  });

  afterEach(async () => {
    if (testDir) {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
      testDir = null;
      sourceDir = null;
      outputDir = null;
      componentsDir = null;
      includesDir = null;
    }
  });

  it('should include styles from components in the final HTML head', async () => {
    // Create a test page that includes styled components
    await fs.writeFile(
      path.join(sourceDir, 'styles-test.html'),
      `<div>
  <h1>Testing Component Styles</h1>
  <include src="/.components/styled-button.html" />
  <include src="/.components/modal-dialog.html" />
</div>`
    );

    // Build the site
    await build({
      source: sourceDir,
      output: outputDir,
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'styles-test.html');
    const outputContent = await fs.readFile(outputFile, 'utf-8');
    
    console.log('=== OUTPUT CONTENT ===');
    console.log(outputContent);
    console.log('=== END OUTPUT ===');

    // Check that the page was built successfully
    expect(outputContent.includes('<!DOCTYPE html>')).toBeTruthy();
    expect(outputContent.includes('<head>')).toBeTruthy();

    // Check that component styles were moved to the head section
    expect(outputContent.includes('.btn {')).toBeTruthy();
    expect(outputContent.includes('background: #007bff')).toBeTruthy();
    expect(outputContent.includes('.btn:hover {')).toBeTruthy();
    
    expect(outputContent.includes('.modal-overlay {')).toBeTruthy();
    expect(outputContent.includes('position: fixed')).toBeTruthy();
    expect(outputContent.includes('.modal-content {')).toBeTruthy();

    // Check that styles are in the head section, not in the body
    const headSection = outputContent.substring(
      outputContent.indexOf('<head>'),
      outputContent.indexOf('</head>')
    );
    expect(headSection.includes('.btn {')).toBeTruthy();
    expect(headSection.includes('.modal-overlay {')).toBeTruthy();

    // Check that component HTML content is included but without style tags
    expect(outputContent.includes('<button class="btn">Click Me</button>')).toBeTruthy();
    expect(outputContent.includes('<div class="modal-overlay"')).toBeTruthy();
    
    // Verify that original style tags are not in the body
    const bodySection = outputContent.substring(
      outputContent.indexOf('<body>'),
      outputContent.indexOf('</body>')
    );
    expect(bodySection.includes('<style>')).toBeFalsy();
  });

  it('should include scripts from components at the end of body', async () => {
    // Create a test page that includes components with scripts
    await fs.writeFile(
      path.join(sourceDir, 'scripts-test.html'),
      `<div>
  <h1>Testing Component Scripts</h1>
  <include src="/.components/interactive-counter.html" />
  <include src="/.components/modal-dialog.html" />
</div>`
    );

    // Build the site
    await build({
      source: sourceDir,
      output: outputDir,
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'scripts-test.html');
    const outputContent = await fs.readFile(outputFile, 'utf-8');

    // Check that the page was built successfully
    expect(outputContent.includes('<!DOCTYPE html>')).toBeTruthy();
    expect(outputContent.includes('<body>')).toBeTruthy();

    // Check that component scripts were moved to the end of body
    expect(outputContent.includes('function incrementCounter()')).toBeTruthy();
    expect(outputContent.includes('function decrementCounter()')).toBeTruthy();
    expect(outputContent.includes('function openModal()')).toBeTruthy();
    expect(outputContent.includes('function closeModal()')).toBeTruthy();
    
    // Check that scripts include their functionality
    expect(outputContent.includes('count++')).toBeTruthy();
    expect(outputContent.includes('document.getElementById(\'count\')')).toBeTruthy();
    expect(outputContent.includes('document.body.style.overflow')).toBeTruthy();

    // Check that scripts are at the end of body, before </body>
    const bodyEndIndex = outputContent.lastIndexOf('</body>');
    const lastScriptIndex = outputContent.lastIndexOf('</script>');
    expect(lastScriptIndex).toBeLessThan(bodyEndIndex);

    // Check that component HTML content is included but without script tags
    expect(outputContent.includes('<div id="counter-widget">')).toBeTruthy();
    expect(outputContent.includes('<span id="count">0</span>')).toBeTruthy();
    expect(outputContent.includes('<div class="modal-overlay"')).toBeTruthy();
    
    // Verify that the scripts are collected together at the end
    const bodySection = outputContent.substring(
      outputContent.indexOf('<body>'),
      outputContent.indexOf('</body>')
    );
    
    // Count script tags in body - they should be at the end, not inline
    const scriptMatches = bodySection.match(/<script[^>]*>/g) || [];
    const scriptEndMatches = bodySection.match(/<\/script>/g) || [];
    expect(scriptMatches.length).toBeGreaterThan(0);
    expect(scriptEndMatches.length).toBe(scriptMatches.length);
  });

  it('should handle components with both styles and scripts correctly', async () => {
    // Create a test page that includes components with both styles and scripts
    await fs.writeFile(
      path.join(sourceDir, 'mixed-assets.html'),
      `<div>
  <h1>Testing Mixed Component Assets</h1>
  <include src="/.components/styled-button.html" />
  <include src="/.components/interactive-counter.html" />
  <include src="/.components/modal-dialog.html" />
  <include src="/.components/complex-widget.html" />
  
  <p>This page tests components with various combinations of styles and scripts.</p>
  <button onclick="openModal()">Open Modal</button>
</div>`
    );

    // Build the site
    await build({
      source: sourceDir,
      output: outputDir,
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'mixed-assets.html');
    const outputContent = await fs.readFile(outputFile, 'utf-8');

    // Check that the page was built successfully
    expect(outputContent.includes('<!DOCTYPE html>')).toBeTruthy();

    // Extract head and body sections for detailed testing
    const headSection = outputContent.substring(
      outputContent.indexOf('<head>'),
      outputContent.indexOf('</head>')
    );
    const bodySection = outputContent.substring(
      outputContent.indexOf('<body>'),
      outputContent.indexOf('</body>')
    );

    // Check that ALL component styles are in the head
    expect(headSection.includes('.btn {')).toBeTruthy(); // from styled-button
    expect(headSection.includes('.modal-overlay {')).toBeTruthy(); // from modal-dialog
    expect(headSection.includes('.widget {')).toBeTruthy(); // from complex-widget
    expect(headSection.includes('.widget-controls {')).toBeTruthy(); // second style block from complex-widget

    // Check that ALL component scripts are in the body (at the end)
    expect(bodySection.includes('function incrementCounter()')).toBeTruthy(); // from interactive-counter
    expect(bodySection.includes('function openModal()')).toBeTruthy(); // from modal-dialog
    expect(bodySection.includes('function widgetAction(')).toBeTruthy(); // from complex-widget
    expect(bodySection.includes('console.log(\'Complex widget loaded\')')).toBeTruthy(); // second script from complex-widget

    // Check that component HTML content is present
    expect(bodySection.includes('<button class="btn">Click Me</button>')).toBeTruthy();
    expect(bodySection.includes('<div id="counter-widget">')).toBeTruthy();
    expect(bodySection.includes('<div class="modal-overlay"')).toBeTruthy();
    expect(bodySection.includes('<div class="widget">')).toBeTruthy();

    // Verify no duplicate styles or scripts
    const btnStyleMatches = (headSection.match(/\.btn \{/g) || []).length;
    expect(btnStyleMatches).toBe(1); // Should only appear once

    // Verify scripts are at the end of body
    const lastScriptIndex = outputContent.lastIndexOf('</script>');
    const bodyEndIndex = outputContent.lastIndexOf('</body>');
    expect(lastScriptIndex).toBeLessThan(bodyEndIndex);

    // Check that layout styles and scripts are preserved
    expect(headSection.includes('font-family: Arial, sans-serif')).toBeTruthy(); // layout style
    expect(bodySection.includes('console.log(\'Layout script loaded\')')).toBeTruthy(); // layout script
  });

  it('should handle multiple style and script blocks from the same component', async () => {
    // Create a test page that includes the complex widget with multiple blocks
    await fs.writeFile(
      path.join(sourceDir, 'multiple-blocks.html'),
      `<div>
  <h1>Testing Multiple Style/Script Blocks</h1>
  <include src="/.components/complex-widget.html" />
</div>`
    );

    // Build the site
    await build({
      source: sourceDir,
      output: outputDir,
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'multiple-blocks.html');
    const outputContent = await fs.readFile(outputFile, 'utf-8');

    // Extract head and body sections
    const headSection = outputContent.substring(
      outputContent.indexOf('<head>'),
      outputContent.indexOf('</head>')
    );
    const bodySection = outputContent.substring(
      outputContent.indexOf('<body>'),
      outputContent.indexOf('</body>')
    );

    // Check that both style blocks are included in head
    expect(headSection.includes('.widget {')).toBeTruthy(); // first style block
    expect(headSection.includes('.widget-controls {')).toBeTruthy(); // second style block
    expect(headSection.includes('border: 1px solid #ddd')).toBeTruthy(); // from first block
    expect(headSection.includes('margin-right: 8px')).toBeTruthy(); // from second block

    // Check that both script blocks are included in body
    expect(bodySection.includes('function widgetAction(')).toBeTruthy(); // first script block
    expect(bodySection.includes('console.log(\'Complex widget loaded\')')).toBeTruthy(); // second script block

    // Verify the component HTML is present
    expect(bodySection.includes('<div class="widget">')).toBeTruthy();
    expect(bodySection.includes('<div class="widget-controls">')).toBeTruthy();
    expect(bodySection.includes('<button onclick="widgetAction(\'save\')">Save</button>')).toBeTruthy();
  });

  it('should deduplicate identical styles and scripts when same component is included multiple times', async () => {
    // Create a test page that includes the same component multiple times
    await fs.writeFile(
      path.join(sourceDir, 'duplicate-components.html'),
      `<div>
  <h1>Testing Duplicate Component Inclusion</h1>
  <include src="/.components/styled-button.html" />
  <include src="/.components/styled-button.html" />
  <include src="/.components/styled-button.html" />
</div>`
    );

    // Build the site
    await build({
      source: sourceDir,
      output: outputDir,
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'duplicate-components.html');
    const outputContent = await fs.readFile(outputFile, 'utf-8');

    // Extract head section
    const headSection = outputContent.substring(
      outputContent.indexOf('<head>'),
      outputContent.indexOf('</head>')
    );

    // Check that component styles appear only once despite multiple inclusions
    const btnStyleMatches = (headSection.match(/\.btn \{[\s\S]*?background: #007bff/g) || []).length;
    expect(btnStyleMatches).toBe(1); // Should only appear once, not three times

    // Check that all button instances are present in the body
    const bodySection = outputContent.substring(
      outputContent.indexOf('<body>'),
      outputContent.indexOf('</body>')
    );
    const buttonMatches = (bodySection.match(/<button class="btn">Click Me<\/button>/g) || []).length;
    expect(buttonMatches).toBe(3); // Should have three button instances
  });
});
