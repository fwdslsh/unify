import { build } from './src/core/file-processor.js';
import { wrapInLayout } from './src/core/markdown-processor.js';
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

await fs.writeFile(sourceDir + '/.layouts/default.html', layoutContent);

console.log('Creating markdown file...');
await fs.writeFile(sourceDir + '/test-markdown.md', `---
title: Test Page
---

# Test Content

This is a test page content.`);

// Test wrapInLayout directly
console.log('\\n=== TESTING wrapInLayout DIRECTLY ===');
const testHtml = '<h1 id="test-content">Test Content</h1>\\n<p>This is a test page content.</p>';
const testMetadata = {
  title: 'Test Page',
  frontmatter: { title: 'Test Page' }
};

console.log('Input HTML:', testHtml);
console.log('Input layout contains "Default Layout":', layoutContent.includes('Default Layout'));
console.log('Input layout contains "{{ content }}":', layoutContent.includes('{{ content }}'));

const directResult = wrapInLayout(testHtml, testMetadata, layoutContent);
console.log('\\nDirect wrapInLayout result contains "Default Layout":', directResult.includes('Default Layout'));
console.log('Direct result contains "Test Content":', directResult.includes('Test Content'));

// Build and compare
console.log('\\n=== TESTING VIA BUILD ===');
await build({
  source: sourceDir,
  output: outputDir,
  layouts: '.layouts',
  clean: true
});

const buildResult = await fs.readFile(outputDir + '/test-markdown.html', 'utf-8');
console.log('Build result contains "Default Layout":', buildResult.includes('Default Layout'));
console.log('Build result contains "Test Content":', buildResult.includes('Test Content'));

console.log('\\n=== COMPARISON ===');
console.log('Direct and build results match:', directResult.trim() === buildResult.trim());
