import { build } from './src/core/file-processor.js';
import fs from 'fs/promises';
import path from 'path';

// Create a test directory
const testDir = '/tmp/debug-component-assets';
const sourceDir = path.join(testDir, 'src');
const outputDir = path.join(testDir, 'dist');
const componentsDir = path.join(sourceDir, '.components');
const layoutsDir = path.join(sourceDir, '.layouts');

// Clean up and create test directories
await fs.rm(testDir, { recursive: true, force: true });
await fs.mkdir(testDir, { recursive: true });
await fs.mkdir(sourceDir, { recursive: true });
await fs.mkdir(componentsDir, { recursive: true });
await fs.mkdir(layoutsDir, { recursive: true });

// Create component with styles
await fs.writeFile(
  path.join(componentsDir, 'styled-button.html'),
  `<style>
  .btn {
    background: #007bff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
  }
</style>

<button class="btn">Click Me</button>`
);

// Create default layout
await fs.writeFile(
  path.join(layoutsDir, 'default.html'),
  `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
</head>
<body>
  <slot></slot>
</body>
</html>`
);

// Create test page with DOM include
await fs.writeFile(
  path.join(sourceDir, 'test.html'),
  `<div>
  <h1>Testing Component Styles</h1>
  <include src="/.components/styled-button.html" />
</div>`
);

// Build
console.log('Building...');
const result = await build({
  source: sourceDir,
  output: outputDir,
  components: componentsDir,
  layouts: layoutsDir
});

console.log('Build result:', result);

// Read output
const outputFile = path.join(outputDir, 'test.html');
const outputContent = await fs.readFile(outputFile, 'utf-8');
console.log('\n=== OUTPUT CONTENT ===');
console.log(outputContent);
console.log('=== END OUTPUT ===');

// Check if assets were moved
console.log('\nStyles in head:', outputContent.includes('<head>') && outputContent.includes('.btn {'));
console.log('Button in body:', outputContent.includes('<body>') && outputContent.includes('<button'));
