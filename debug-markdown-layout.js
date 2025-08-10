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

// Create markdown file
await fs.writeFile(sourceDir + '/test-markdown.md', `---
title: Test Page
---

# Test Content

This is a test page content.`);

// Build
await build({
  source: sourceDir,
  output: outputDir,
  layouts: '.layouts',
  clean: true
});

// Check output
const content = await fs.readFile(outputDir + '/test-markdown.html', 'utf-8');
console.log('=== MARKDOWN OUTPUT ===');
console.log(content);
console.log('=== END OUTPUT ===');

console.log('Contains Default Layout:', content.includes('Default Layout'));
console.log('Contains Default Footer:', content.includes('Default Footer'));
console.log('Contains Test Content:', content.includes('Test Content'));
