/**
 * Integration test to verify that SSI-style includes don't process component assets
 * This documents the difference between SSI and DOM-style includes
 */

import { it, describe, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from '../../src/core/file-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('SSI vs DOM Include Comparison', () => {
  let testDir = null;
  let sourceDir = null;
  let outputDir = null;
  let componentsDir = null;
  let layoutsDir = null;

  beforeEach(async () => {
    // Create unique test directories for each test
    testDir = path.join(__dirname, '../test-temp/ssi-comparison-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    sourceDir = path.join(testDir, 'src');
    outputDir = path.join(testDir, 'dist');
    componentsDir = path.join(sourceDir, '.components');
    layoutsDir = path.join(sourceDir, '.layouts');

    // Clean up and create test directories
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(componentsDir, { recursive: true });
    await fs.mkdir(layoutsDir, { recursive: true });

    // Create a component with styles and scripts
    await fs.writeFile(
      path.join(componentsDir, 'test-component.html'),
      `<style>
  .test-component { background: red; color: white; }
</style>

<div class="test-component">Test Component</div>

<script>
  console.log('Test component script');
</script>`
    );

    // Create a layout (but we won't use it for the SSI test)
    await fs.writeFile(
      path.join(layoutsDir, 'default.html'),
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Test Page</title>
</head>
<body>
  <slot></slot>
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
      layoutsDir = null;
    }
  });

  it('SSI-style includes should NOT process component assets', async () => {
    // Create a test page using SSI-style includes with complete HTML structure
    // to avoid layout processing
    await fs.writeFile(
      path.join(sourceDir, 'ssi-test.html'),
      `<!DOCTYPE html>
<html>
<head>
  <title>SSI Test</title>
</head>
<body>
  <div>
    <h1>SSI Include Test</h1>
    <!--#include virtual="/.components/test-component.html" -->
  </div>
</body>
</html>`
    );

    // Build the site WITHOUT layout processing to test pure SSI includes
    await build({
      source: sourceDir,
      output: outputDir,
      components: componentsDir
      // layouts: layoutsDir // Removed - this test should not use layouts
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'ssi-test.html');
    const outputContent = await fs.readFile(outputFile, 'utf-8');
    

    // Check that the component HTML content is included
    expect(outputContent.includes('<div class="test-component">Test Component</div>')).toBeTruthy();

    // Check that styles and scripts are NOT moved/processed - they should be inline
    expect(outputContent.includes('<style>')).toBeTruthy(); // Style should remain inline
    expect(outputContent.includes('<script>')).toBeTruthy(); // Script should remain inline
    expect(outputContent.includes('.test-component { background: red')).toBeTruthy(); // Style content preserved

    // Extract head and body sections
    const headSection = outputContent.substring(
      outputContent.indexOf('<head>'),
      outputContent.indexOf('</head>')
    );

    // Verify styles are NOT moved to head (they stay inline)
    expect(headSection.includes('.test-component')).toBeFalsy();
  });

  it('DOM-style includes should process component assets', async () => {
    // Create a test page using DOM-style includes
    await fs.writeFile(
      path.join(sourceDir, 'dom-test.html'),
      `<div>
  <h1>DOM Include Test</h1>
  <include src="/.components/test-component.html" />
</div>`
    );

    // Build the site
    await build({
      source: sourceDir,
      output: outputDir,
      components: componentsDir,
      layouts: layoutsDir
    });

    // Read the output file
    const outputFile = path.join(outputDir, 'dom-test.html');
    const outputContent = await fs.readFile(outputFile, 'utf-8');

    // Check that the component HTML content is included
    expect(outputContent.includes('<div class="test-component">Test Component</div>')).toBeTruthy();

    // Extract head and body sections
    const headSection = outputContent.substring(
      outputContent.indexOf('<head>'),
      outputContent.indexOf('</head>')
    );
    const bodySection = outputContent.substring(
      outputContent.indexOf('<body>'),
      outputContent.indexOf('</body>')
    );

    // Verify styles ARE moved to head
    expect(headSection.includes('.test-component { background: red')).toBeTruthy();

    // Verify scripts ARE moved to end of body
    expect(bodySection.includes('console.log(\'Test component script\')')).toBeTruthy();

    // Verify that styles and scripts are NOT inline in the component area
    const componentAreaStart = outputContent.indexOf('<h1>DOM Include Test</h1>');
    const componentAreaEnd = outputContent.indexOf('</div>', componentAreaStart);
    const componentArea = outputContent.substring(componentAreaStart, componentAreaEnd);
    
    expect(componentArea.includes('<style>')).toBeFalsy(); // No inline styles
    expect(componentArea.includes('<script>')).toBeFalsy(); // No inline scripts
  });
});
