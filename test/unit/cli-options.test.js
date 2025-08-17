import { test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { parseArgs } from '../../src/cli/args-parser.js';
import { build } from '../../src/core/file-processor.js';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

let tempDir;
let sourceDir;
let outputDir;

beforeEach(async () => {
  tempDir = await createTempDirectory();
  sourceDir = path.join(tempDir, 'src');
  outputDir = path.join(tempDir, 'dist');
});

afterEach(async () => {
  await cleanupTempDirectory(tempDir);
});

test('CLI Options > --default-layout option > should parse correctly', () => {
  const args = parseArgs(['build', '--default-layout', 'mylayout']);
  expect(args.defaultLayout).toBe('mylayout');
});

test('CLI Options > --exclude-pattern option > should parse correctly', () => {
  const args = parseArgs(['build', '--exclude-pattern', 'temp.*']);
  expect(args.excludePattern).toBe('temp.*');
});

test('CLI Options > both options together > should parse correctly', () => {
  const args = parseArgs(['build', '--default-layout', 'base', '--exclude-pattern', 'draft.*']);
  expect(args.defaultLayout).toBe('base');
  expect(args.excludePattern).toBe('draft.*');
});

test('CLI Options > --default-layout without value > should throw error', () => {
  expect(() => {
    parseArgs(['build', '--default-layout']);
  }).toThrow('The --default-layout option requires a filename value');
});

test('CLI Options > --exclude-pattern without value > should throw error', () => {
  expect(() => {
    parseArgs(['build', '--exclude-pattern']);
  }).toThrow('The --exclude-pattern option requires a pattern value');
});

test('Default Layout Override > should use custom layout filename', async () => {
  // Create custom layout file
  await createTestStructure(sourceDir, {
    '_custom.html': `<!DOCTYPE html>
<html>
<head><title>Custom Layout</title></head>
<body><main data-slot="default"></main></body>
</html>`,
    'index.html': '<h1>Test Page</h1>'
  });

  // Build with custom default layout
  const result = await build({
    source: sourceDir,
    output: outputDir,
    defaultLayout: 'custom'
  });

  expect(result.processed).toBe(1);

  // Check that layout was applied
  const outputContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
  expect(outputContent).toContain('Custom Layout');
  expect(outputContent).toContain('Test Page');
});

test('Exclude Pattern Override > should use custom exclude pattern', async () => {
  // Create test files
  await createTestStructure(sourceDir, {
    'index.html': '<h1>Main Page</h1>',
    'draft-page.html': '<h1>Draft Page</h1>',
    'temp-file.html': '<h1>Temp File</h1>',
    '_layout.html': `<!DOCTYPE html>
<html>
<head><title>Layout</title></head>
<body><main data-slot="default"></main></body>
</html>`
  });

  // Build with custom exclude pattern
  const result = await build({
    source: sourceDir,
    output: outputDir,
    excludePattern: 'draft.*'
  });

  // Should process index.html and temp-file.html, but not draft-page.html
  expect(result.processed).toBe(2);

  // Check output files
  const files = await fs.readdir(outputDir);
  expect(files).toContain('index.html');
  expect(files).toContain('temp-file.html');
  expect(files).not.toContain('draft-page.html');
});

test('Combined Options > should work together', async () => {
  // Create test structure
  await createTestStructure(sourceDir, {
    '_base.html': `<!DOCTYPE html>
<html>
<head><title>Base Layout</title></head>
<body><header>Header</header><main data-slot="default"></main></body>
</html>`,
    'index.html': '<h1>Home Page</h1>',
    'draft-post.html': '<h1>Draft Post</h1>',
    'published-post.html': '<h1>Published Post</h1>'
  });

  // Build with both custom options
  const result = await build({
    source: sourceDir,
    output: outputDir,
    defaultLayout: 'base',
    excludePattern: 'draft.*'
  });

  // Should process index.html and published-post.html with base layout
  expect(result.processed).toBe(2);

  // Check layout was applied
  const homeContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
  expect(homeContent).toContain('Base Layout');
  expect(homeContent).toContain('Header');
  expect(homeContent).toContain('Home Page');

  // Check draft was excluded
  const files = await fs.readdir(outputDir);
  expect(files).not.toContain('draft-post.html');
  expect(files).toContain('published-post.html');
});

test('Backward Compatibility > should maintain default behavior', async () => {
  // Create default structure
  await createTestStructure(sourceDir, {
    '_layout.html': `<!DOCTYPE html>
<html>
<head><title>Default Layout</title></head>
<body><main data-slot="default"></main></body>
</html>`,
    'index.html': '<h1>Main Page</h1>',
    '_partial.html': '<div>Partial content</div>'
  });

  // Build with default options
  const result = await build({
    source: sourceDir,
    output: outputDir
  });

  // Should process only index.html (exclude _partial.html)
  expect(result.processed).toBe(1);

  // Check default layout was applied
  const outputContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
  expect(outputContent).toContain('Default Layout');
  expect(outputContent).toContain('Main Page');

  // Check _partial.html was excluded by default pattern
  const files = await fs.readdir(outputDir);
  expect(files).not.toContain('_partial.html');
});