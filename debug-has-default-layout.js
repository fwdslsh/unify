import { build } from './src/core/file-processor.js';
import fs from 'fs/promises';
import path from 'path';

// Add a manual hasDefaultLayout check
async function hasDefaultLayout(sourceRoot, layoutsDir = ".layouts") {
  const defaultLayoutPath = path.join(sourceRoot, layoutsDir, "default.html");
  console.log('Checking for default layout at:', defaultLayoutPath);
  try {
    await fs.access(defaultLayoutPath);
    console.log('✅ Default layout found');
    return true;
  } catch (e) {
    console.log('❌ Default layout not found:', e.message);
    return false;
  }
}

const testDir = './test-debug';
const sourceDir = './test-debug/src';
const outputDir = './test-debug/dist';

// Clean and create test structure
await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
await fs.mkdir(sourceDir, { recursive: true });
await fs.mkdir(sourceDir + '/.layouts', { recursive: true });

console.log('Creating default layout...');
// Create default layout
await fs.writeFile(sourceDir + '/.layouts/default.html', `<!DOCTYPE html>
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
</html>`);

console.log('Creating markdown file...');
// Create markdown file
await fs.writeFile(sourceDir + '/test-markdown.md', `---
title: Test Page
---

# Test Content

This is a test page content.`);

console.log('Checking hasDefaultLayout function...');
const hasDefault = await hasDefaultLayout(sourceDir, '.layouts');
console.log('hasDefaultLayout returned:', hasDefault);

// Build with debug
console.log('Building...');
const result = await build({
  source: sourceDir,
  output: outputDir,
  layouts: '.layouts',
  clean: true
});

console.log('Build result:', result);

// Check output
const content = await fs.readFile(outputDir + '/test-markdown.html', 'utf-8');
console.log('=== MARKDOWN OUTPUT ===');
console.log(content);
console.log('=== END OUTPUT ===');

console.log('Contains Default Layout:', content.includes('Default Layout'));
console.log('Contains Default Footer:', content.includes('Default Footer'));
console.log('Contains Test Content:', content.includes('Test Content'));
