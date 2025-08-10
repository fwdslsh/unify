import { build } from './src/core/file-processor.js';
import fs from 'fs/promises';
import path from 'path';

const testDir = './test-debug';
const sourceDir = './test-debug/src';
const outputDir = './test-debug/dist';

// Clean and create test structure
await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
await fs.mkdir(sourceDir, { recursive: true });
await fs.mkdir(sourceDir + '/.layouts', { recursive: true });

console.log('Creating default layout...');
const layoutContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{ title }}</title>
</head>
<body>
  <header><h1>Default Layout</h1></header>
  <main>{{ content }}</main>
  <footer><p>Default Footer</p></footer>
</body>
</html>`;

// Create default layout
await fs.writeFile(sourceDir + '/.layouts/default.html', layoutContent);

console.log('Creating markdown file...');
// Create markdown file
await fs.writeFile(sourceDir + '/test-markdown.md', `---
title: Test Page
---

# Test Content

This is a test page content.`);

// Check all the file paths manually
console.log('\\nFile existence checks:');
console.log('sourceDir:', sourceDir);
console.log('layoutsDir:', '.layouts');

const defaultLayoutPath = path.join(sourceDir, '.layouts', 'default.html');
console.log('Default layout path:', defaultLayoutPath);

try {
  await fs.access(defaultLayoutPath);
  console.log('✅ Default layout exists');
  const content = await fs.readFile(defaultLayoutPath, 'utf-8');
  console.log('Layout content length:', content.length);
  console.log('Layout contains "Default Layout":', content.includes('Default Layout'));
} catch (e) {
  console.log('❌ Default layout error:', e.message);
}

// Build
console.log('\\nBuilding...');
await build({
  source: sourceDir,
  output: outputDir,
  layouts: '.layouts',
  clean: true
});

// Check output
const outputContent = await fs.readFile(outputDir + '/test-markdown.html', 'utf-8');
console.log('\\n=== OUTPUT ANALYSIS ===');
console.log('Output contains "Default Layout":', outputContent.includes('Default Layout'));
console.log('Output contains "Default Footer":', outputContent.includes('Default Footer'));
console.log('Output contains "Test Content":', outputContent.includes('Test Content'));

// Show first few lines of output to see structure
const lines = outputContent.split('\\n');
console.log('\\nFirst 5 lines of output:');
lines.slice(0, 5).forEach((line, i) => console.log(`${i+1}: ${line}`));
