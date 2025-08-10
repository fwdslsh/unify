#!/usr/bin/env bun

import fs from 'fs/promises';
import path from 'path';
import { build } from './src/core/file-processor.js';

async function debugDOMIncludes() {
  const testDir = '/tmp/debug-dom-includes';
  const sourceDir = path.join(testDir, 'src');
  const outputDir = path.join(testDir, 'dist');
  const componentsDir = path.join(sourceDir, 'custom_components');
  const layoutsDir = path.join(sourceDir, '_includes');

  try {
    // Clean up and create test directories
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(componentsDir, { recursive: true });
    await fs.mkdir(layoutsDir, { recursive: true });

    // Create a simple component with styles
    await fs.writeFile(
      path.join(componentsDir, 'alert.html'),
      `<style>
  .alert { 
    color: red; 
    padding: 1rem; 
    border: 1px solid red; 
    border-radius: 4px;
    background: #fff5f5;
  }
</style>

<div class="alert">
  <strong>Title</strong>
  <p>Message</p>
</div>`
    );

    // Create a simple test page
    await fs.writeFile(
      path.join(sourceDir, 'test.html'),
      `<!DOCTYPE html>
<html>
<head>
  <title>DOM Include Test</title>
</head>
<body>
  <h1>Testing DOM Includes</h1>
  
  <include src="/custom_components/alert.html" />
  
  <p>End of page</p>
</body>
</html>`
    );

    console.log('🔍 Building DOM includes test...');
    await build({
      source: sourceDir,
      output: outputDir
    });

    console.log('\n📄 Output Content:');
    const outputFile = path.join(outputDir, 'test.html');
    const outputContent = await fs.readFile(outputFile, 'utf-8');
    console.log(outputContent);

    console.log('\n🔍 Analysis:');
    console.log('Has <include> tags:', outputContent.includes('<include'));
    console.log('Has alert content:', outputContent.includes('<div class="alert">'));
    console.log('Has alert styles:', outputContent.includes('.alert {'));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  }
}

debugDOMIncludes();
