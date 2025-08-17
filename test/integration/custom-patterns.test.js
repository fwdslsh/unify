import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';
import { build } from '../../src/core/file-processor.js';
import fs from 'fs/promises';
import path from 'path';

describe('Custom Patterns Integration', () => {
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

  describe('Custom Component Pattern', () => {
    test('should support *.component.* pattern for non-emitting files', async () => {
      await createTestStructure(sourceDir, {
        'index.html': `
          <html>
            <head><title>Home</title></head>
            <body>
              <h1>Home Page</h1>
              <!--#include file="nav.component.html" -->
            </body>
          </html>
        `,
        'nav.component.html': '<nav>Navigation</nav>',
        'about.html': '<h1>About</h1>',
        'card.component.html': '<div class="card">Card content</div>',
        'style.css': 'body { margin: 0; }'
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        componentPattern: '*.component.*'
      });

      // Check that pages were processed
      expect(result.processed).toBe(2); // index.html + about.html

      // Check that component files were not emitted to output
      const outputFiles = await fs.readdir(outputDir);
      expect(outputFiles).toContain('index.html');
      expect(outputFiles).toContain('about.html');
      expect(outputFiles).toContain('style.css');
      expect(outputFiles).not.toContain('nav.component.html');
      expect(outputFiles).not.toContain('card.component.html');

      // Check that component was included in the page
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).toContain('<nav>Navigation</nav>');
    });
  });

  describe('Custom Layout Pattern', () => {
    test('should support *.layout.* pattern for layout files', async () => {
      await createTestStructure(sourceDir, {
        'index.html': `
          <div data-layout="main">
            <h1>Home Page</h1>
          </div>
        `,
        'main.layout.html': `
          <html>
            <head><title>Site</title></head>
            <body>
              <slot name="content"></slot>
            </body>
          </html>
        `,
        'blog.layout.html': `
          <html>
            <head><title>Blog</title></head>
            <body>
              <header>Blog Header</header>
              <slot name="content"></slot>
            </body>
          </html>
        `,
        'about.html': '<h1>About</h1>'
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        layoutPattern: '*.layout.*'
      });

      // Check that pages were processed
      expect(result.processed).toBe(2); // index.html + about.html

      // Check that layout files were not emitted
      const outputFiles = await fs.readdir(outputDir);
      expect(outputFiles).toContain('index.html');
      expect(outputFiles).toContain('about.html');
      expect(outputFiles).not.toContain('main.layout.html');
      expect(outputFiles).not.toContain('blog.layout.html');

      // Check that layout was applied
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).toContain('<title>Site</title>');
      expect(indexContent).toContain('<h1>Home Page</h1>');
    });
  });

  describe('Custom Includes Directory', () => {
    test('should support custom includes directory', async () => {
      await createTestStructure(sourceDir, {
        'index.html': `
          <html>
            <head><title>Home</title></head>
            <body>
              <h1>Home Page</h1>
              <!--#include virtual="/header.html" -->
            </body>
          </html>
        `,
        'components/header.html': '<header>Site Header</header>',
        'components/footer.html': '<footer>Site Footer</footer>',
        'components/base.layout.html': `
          <html>
            <head><title>Base Layout</title></head>
            <body>
              <slot name="content"></slot>
            </body>
          </html>
        `,
        'about.html': '<div data-layout="base"><h1>About</h1></div>'
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        includesDir: 'components',
        layoutPattern: '*.layout.*'
      });

      // Check that pages were processed
      expect(result.processed).toBe(2);

      // Check that components directory was not emitted
      const outputFiles = await fs.readdir(outputDir);
      expect(outputFiles).toContain('index.html');
      expect(outputFiles).toContain('about.html');
      expect(outputFiles).not.toContain('components');

      // Check that include was processed
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).toContain('<header>Site Header</header>');

      // Check that layout was applied
      const aboutContent = await fs.readFile(path.join(outputDir, 'about.html'), 'utf-8');
      expect(aboutContent).toContain('<title>Base Layout</title>');
      expect(aboutContent).toContain('<h1>About</h1>');
    });
  });

  describe('Custom Layout Filename', () => {
    test('should support custom default layout filename', async () => {
      await createTestStructure(sourceDir, {
        'index.html': '<h1>Home Page</h1>',
        'about.html': '<h1>About</h1>',
        'components/default.layout.html': `
          <html>
            <head><title>Default Layout</title></head>
            <body>
              <main><slot name="content"></slot></main>
            </body>
          </html>
        `
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        includesDir: 'components',
        layoutFilename: 'default.layout.html',
        layoutPattern: '*.layout.*'
      });

      // Check that pages were processed with layout
      expect(result.processed).toBe(2);

      // Check that layout was applied to both pages
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).toContain('<title>Default Layout</title>');
      expect(indexContent).toContain('<main><h1>Home Page</h1></main>');

      const aboutContent = await fs.readFile(path.join(outputDir, 'about.html'), 'utf-8');
      expect(aboutContent).toContain('<title>Default Layout</title>');
      expect(aboutContent).toContain('<main><h1>About</h1></main>');
    });
  });

  describe('Combined Custom Patterns', () => {
    test('should work with all custom patterns together', async () => {
      await createTestStructure(sourceDir, {
        'index.html': `
          <div data-layout="main">
            <h1>Home</h1>
            <!--#include file="nav.component.html" -->
          </div>
        `,
        'about.html': `
          <div data-layout="page">
            <h1>About</h1>
            <!--#include file="nav.component.html" -->
          </div>
        `,
        'includes/main.layout.html': `
          <html>
            <head><title>Main Layout</title></head>
            <body><slot name="content"></slot></body>
          </html>
        `,
        'includes/page.layout.html': `
          <html>
            <head><title>Page Layout</title></head>
            <body><slot name="content"></slot></body>
          </html>
        `,
        'includes/default.html': `
          <html>
            <head><title>Default</title></head>
            <body><slot name="content"></slot></body>
          </html>
        `,
        'nav.component.html': '<nav>Navigation</nav>',
        'header.component.html': '<header>Header</header>',
        'style.css': 'body { margin: 0; }'
      });

      const result = await build({
        source: sourceDir,
        output: outputDir,
        includesDir: 'includes',
        layoutsDir: null, // Auto-discovery + includes
        componentPattern: '*.component.*',
        layoutPattern: '*.layout.*',
        layoutFilename: 'default.html'
      });

      expect(result.processed).toBe(2);

      // Check output structure
      const outputFiles = await fs.readdir(outputDir);
      expect(outputFiles).toContain('index.html');
      expect(outputFiles).toContain('about.html');
      expect(outputFiles).toContain('style.css');
      expect(outputFiles).not.toContain('includes');
      expect(outputFiles).not.toContain('nav.component.html');
      expect(outputFiles).not.toContain('header.component.html');

      // Check content
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).toContain('<title>Main Layout</title>');
      expect(indexContent).toContain('<nav>Navigation</nav>');

      const aboutContent = await fs.readFile(path.join(outputDir, 'about.html'), 'utf-8');
      expect(aboutContent).toContain('<title>Page Layout</title>');
      expect(aboutContent).toContain('<nav>Navigation</nav>');
    });
  });

  describe('Backwards Compatibility', () => {
    test('should maintain underscore convention by default', async () => {
      await createTestStructure(sourceDir, {
        'index.html': `
          <html>
            <body>
              <h1>Home</h1>
              <!--#include file="_header.html" -->
            </body>
          </html>
        `,
        '_header.html': '<header>Header</header>',
        '_layout.html': `
          <html>
            <head><title>Layout</title></head>
            <body><slot name="content"></slot></body>
          </html>
        `,
        'about.html': '<h1>About</h1>',
        'style.css': 'body { margin: 0; }'
      });

      const result = await build({
        source: sourceDir,
        output: outputDir
        // No custom patterns - should use defaults
      });

      expect(result.processed).toBe(2);

      const outputFiles = await fs.readdir(outputDir);
      expect(outputFiles).toContain('index.html');
      expect(outputFiles).toContain('about.html');
      expect(outputFiles).toContain('style.css');
      expect(outputFiles).not.toContain('_header.html');
      expect(outputFiles).not.toContain('_layout.html');

      // Check include was processed
      const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(indexContent).toContain('<header>Header</header>');

      // Check layout was applied to about.html
      const aboutContent = await fs.readFile(path.join(outputDir, 'about.html'), 'utf-8');
      expect(aboutContent).toContain('<title>Layout</title>');
    });
  });
});