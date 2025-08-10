/**
 * Test for --pretty-urls option with HTML files
 * This test verifies that the --pretty-urls option works correctly with HTML files
 */

import { describe, test, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { build } from '../../src/core/file-processor.js';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Pretty URLs with HTML files', () => {
  let tempDir, sourceDir, outputDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  test('should convert HTML files to pretty URLs when --pretty-urls is enabled', async () => {
    // Create test structure
    await createTestStructure(sourceDir, {
      'index.html': '<h1>Home Page</h1>',
      'docs.html': '<h1>Documentation</h1>',
      'about.html': '<h1>About Us</h1>',
      'docs/some-guide.html': '<h1>Some Guide</h1>',
      'docs/another-guide.html': '<h1>Another Guide</h1>'
    });

    // Build with pretty URLs enabled
    const result = await build({
      source: sourceDir,
      output: outputDir,
      prettyUrls: true
    });

    expect(result.processed).toBe(5);

    // Check that pretty URLs are generated correctly
    // src/index.html => dist/index.html (no change for index.html)
    const indexExists = await fs.access(path.join(outputDir, 'index.html')).then(() => true).catch(() => false);
    expect(indexExists).toBe(true);
    const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    expect(indexContent).toContain('Home Page');

    // src/docs.html => dist/docs/index.html
    const docsIndexExists = await fs.access(path.join(outputDir, 'docs', 'index.html')).then(() => true).catch(() => false);
    expect(docsIndexExists).toBe(true);
    const docsContent = await fs.readFile(path.join(outputDir, 'docs', 'index.html'), 'utf-8');
    expect(docsContent).toContain('Documentation');

    // src/about.html => dist/about/index.html
    const aboutIndexExists = await fs.access(path.join(outputDir, 'about', 'index.html')).then(() => true).catch(() => false);
    expect(aboutIndexExists).toBe(true);
    const aboutContent = await fs.readFile(path.join(outputDir, 'about', 'index.html'), 'utf-8');
    expect(aboutContent).toContain('About Us');

    // src/docs/some-guide.html => dist/docs/some-guide/index.html
    const someGuideIndexExists = await fs.access(path.join(outputDir, 'docs', 'some-guide', 'index.html')).then(() => true).catch(() => false);
    expect(someGuideIndexExists).toBe(true);
    const someGuideContent = await fs.readFile(path.join(outputDir, 'docs', 'some-guide', 'index.html'), 'utf-8');
    expect(someGuideContent).toContain('Some Guide');

    // src/docs/another-guide.html => dist/docs/another-guide/index.html
    const anotherGuideIndexExists = await fs.access(path.join(outputDir, 'docs', 'another-guide', 'index.html')).then(() => true).catch(() => false);
    expect(anotherGuideIndexExists).toBe(true);
    const anotherGuideContent = await fs.readFile(path.join(outputDir, 'docs', 'another-guide', 'index.html'), 'utf-8');
    expect(anotherGuideContent).toContain('Another Guide');

    // Verify that the original HTML files are not copied to the output
    const docsHtmlExists = await fs.access(path.join(outputDir, 'docs.html')).then(() => true).catch(() => false);
    expect(docsHtmlExists).toBe(false);
    const aboutHtmlExists = await fs.access(path.join(outputDir, 'about.html')).then(() => true).catch(() => false);
    expect(aboutHtmlExists).toBe(false);
  });

  test('should use normal paths when --pretty-urls is disabled', async () => {
    // Create test structure
    await createTestStructure(sourceDir, {
      'index.html': '<h1>Home Page</h1>',
      'docs.html': '<h1>Documentation</h1>',
      'about.html': '<h1>About Us</h1>'
    });

    // Build without pretty URLs
    const result = await build({
      source: sourceDir,
      output: outputDir,
      prettyUrls: false
    });

    expect(result.processed).toBe(3);

    // Check that normal paths are used
    const indexExists = await fs.access(path.join(outputDir, 'index.html')).then(() => true).catch(() => false);
    expect(indexExists).toBe(true);

    const docsExists = await fs.access(path.join(outputDir, 'docs.html')).then(() => true).catch(() => false);
    expect(docsExists).toBe(true);

    const aboutExists = await fs.access(path.join(outputDir, 'about.html')).then(() => true).catch(() => false);
    expect(aboutExists).toBe(true);

    // Verify pretty URL directories are not created
    const docsIndexExists = await fs.access(path.join(outputDir, 'docs', 'index.html')).then(() => true).catch(() => false);
    expect(docsIndexExists).toBe(false);
    const aboutIndexExists = await fs.access(path.join(outputDir, 'about', 'index.html')).then(() => true).catch(() => false);
    expect(aboutIndexExists).toBe(false);
  });

  test('should handle nested HTML files with pretty URLs correctly', async () => {
    // Create test structure with nested HTML files
    await createTestStructure(sourceDir, {
      'index.html': '<h1>Home</h1>',
      'docs/index.html': '<h1>Docs Home</h1>',
      'docs/guide.html': '<h1>Guide</h1>',
      'docs/tutorials/basic.html': '<h1>Basic Tutorial</h1>',
      'docs/tutorials/advanced.html': '<h1>Advanced Tutorial</h1>'
    });

    // Build with pretty URLs enabled
    const result = await build({
      source: sourceDir,
      output: outputDir,
      prettyUrls: true
    });

    expect(result.processed).toBe(5);

    // Check root index.html stays as index.html
    const rootIndexExists = await fs.access(path.join(outputDir, 'index.html')).then(() => true).catch(() => false);
    expect(rootIndexExists).toBe(true);

    // Check docs/index.html stays as docs/index.html
    const docsIndexExists = await fs.access(path.join(outputDir, 'docs', 'index.html')).then(() => true).catch(() => false);
    expect(docsIndexExists).toBe(true);

    // Check docs/guide.html => docs/guide/index.html
    const guideIndexExists = await fs.access(path.join(outputDir, 'docs', 'guide', 'index.html')).then(() => true).catch(() => false);
    expect(guideIndexExists).toBe(true);

    // Check docs/tutorials/basic.html => docs/tutorials/basic/index.html
    const basicIndexExists = await fs.access(path.join(outputDir, 'docs', 'tutorials', 'basic', 'index.html')).then(() => true).catch(() => false);
    expect(basicIndexExists).toBe(true);

    // Check docs/tutorials/advanced.html => docs/tutorials/advanced/index.html
    const advancedIndexExists = await fs.access(path.join(outputDir, 'docs', 'tutorials', 'advanced', 'index.html')).then(() => true).catch(() => false);
    expect(advancedIndexExists).toBe(true);
  });

  test('should handle files with multiple extensions correctly', async () => {
    // Create test structure with files having multiple extensions
    await createTestStructure(sourceDir, {
      'file.md.html': '<h1>Markdown HTML</h1>',
      'nested/file.md.html': '<h1>Nested Markdown HTML</h1>'
    });

    // Build with pretty URLs enabled
    const result = await build({
      source: sourceDir,
      output: outputDir,
      prettyUrls: true
    });

    expect(result.processed).toBe(2);

    // Check that files are processed correctly
    const fileExists = await fs.access(path.join(outputDir, 'file', 'index.html')).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);
    const fileContent = await fs.readFile(path.join(outputDir, 'file', 'index.html'), 'utf-8');
    expect(fileContent).toContain('Markdown HTML');

    const nestedFileExists = await fs.access(path.join(outputDir, 'nested', 'file', 'index.html')).then(() => true).catch(() => false);
    expect(nestedFileExists).toBe(true);
    const nestedFileContent = await fs.readFile(path.join(outputDir, 'nested', 'file', 'index.html'), 'utf-8');
    expect(nestedFileContent).toContain('Nested Markdown HTML');
  });
});