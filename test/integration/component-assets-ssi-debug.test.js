import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Debug SSI Includes', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDirectory(tempDir);
    }
  });

  it('should build with SSI includes', async () => {
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
    
    console.log('Building with:', {
      source: sourceDir,
      output: outputDir,
      layouts: path.join(sourceDir, '.layouts'),
      components: path.join(sourceDir, '.components')
    });
    
    const result = await build({
      source: sourceDir,
      output: outputDir,
      layouts: path.join(sourceDir, '.layouts'),
      components: path.join(sourceDir, '.components'),
      clean: true,
      cacheDir: path.join(tempDir, '.cache')  // Use temp directory for cache
    });
    
    console.log('Build result:', result);

    // Check if output file exists
    const outputFile = path.join(outputDir, 'index.html');
    console.log('Checking for output file:', outputFile);
    
    try {
      const outputDirStat = await fs.stat(outputDir);
      console.log('Output dir exists:', true);
      
      const files = await fs.readdir(outputDir);
      console.log('Files in output dir:', files);
    } catch (e) {
      console.log('Output dir does not exist:', e.message);
    }
    
    const content = await fs.readFile(outputFile, 'utf-8');
    console.log('Content preview:', content.substring(0, 500));

    // Simple test to see if styles are in head
    expect(content).toContain('<style>');
  });
});
