/**
 * Tests for Cascading Imports System v0.6.0
 * Tests the new data-import, slot, and data-target system
 */

import { test, expect } from 'bun:test';
import { CascadingImportsProcessor, CircularImportError, FragmentNotFoundError } from '../../src/core/cascading-imports-processor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper functions for temp directories
async function createTempDir() {
  const tempDir = path.join(__dirname, '../fixtures/unit-test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

async function writeTempFile(tempDir, filePath, content) {
  const fullPath = path.join(tempDir, filePath);
  const dirPath = path.dirname(fullPath);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

async function cleanupTempDir(tempDir) {
  try {
    await fs.rmdir(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

test('CascadingImportsProcessor should process basic imports', async () => {
  const tempDir = await createTempDir();
  
  try {
    // Create layout
    await writeTempFile(tempDir, '_layout.html', `
      <html>
        <head><title>Site</title></head>
        <body>
          <header><slot name="header">Default Header</slot></header>
          <main><slot>Default Content</slot></main>
        </body>
      </html>
    `);
    
    // Create page
    const pageHtml = `
      <div data-import="_layout.html">
        <h1>Page Content</h1>
        <template data-target="header">
          <h1>Custom Header</h1>
        </template>
      </div>
    `;
    
    const processor = new CascadingImportsProcessor(tempDir);
    const result = await processor.processImports(pageHtml, path.join(tempDir, 'page.html'));
    
    expect(result).toContain('<h1>Custom Header</h1>');
    expect(result).toContain('<h1>Page Content</h1>');
    expect(result).not.toContain('data-import');
    expect(result).not.toContain('data-target');
  } finally {
    await cleanupTempDir(tempDir);
  }
});

test('CascadingImportsProcessor should handle default slot content', async () => {
  const tempDir = await createTempDir();
  
  try {
    // Create simple fragment
    await writeTempFile(tempDir, '_card.html', `
      <div class="card">
        <slot>Default card content</slot>
      </div>
    `);
    
    const pageHtml = `
      <div data-import="_card.html">
        <p>This is custom card content</p>
      </div>
    `;
    
    const processor = new CascadingImportsProcessor(tempDir);
    const result = await processor.processImports(pageHtml, path.join(tempDir, 'page.html'));
    
    expect(result).toContain('<div class="card">');
    expect(result).toContain('<p>This is custom card content</p>');
    expect(result).not.toContain('Default card content');
    expect(result).not.toContain('data-import');
  } finally {
    await cleanupTempDir(tempDir);
  }
});

test('CascadingImportsProcessor should detect circular dependencies', async () => {
  const tempDir = await createTempDir();
  
  try {
    await writeTempFile(tempDir, 'a.html', '<div data-import="b.html">A</div>');
    await writeTempFile(tempDir, 'b.html', '<div data-import="a.html">B</div>');
    
    const processor = new CascadingImportsProcessor(tempDir);
    
    await expect(
      processor.processImports('<div data-import="a.html">Test</div>', path.join(tempDir, 'test.html'))
    ).rejects.toThrow(CircularImportError);
  } finally {
    await cleanupTempDir(tempDir);
  }
});

test('CascadingImportsProcessor should resolve short names', async () => {
  const tempDir = await createTempDir();
  
  try {
    // Create layout with various naming patterns
    await writeTempFile(tempDir, '_base.layout.html', `
      <div class="layout">
        <slot>Layout content</slot>
      </div>
    `);
    
    // Use short name
    const pageHtml = '<div data-import="base">Content</div>';
    
    const processor = new CascadingImportsProcessor(tempDir);
    const result = await processor.processImports(pageHtml, path.join(tempDir, 'page.html'));
    
    expect(result).toContain('<div class="layout">');
    expect(result).toContain('Content');
    expect(result).not.toContain('data-import');
  } finally {
    await cleanupTempDir(tempDir);
  }
});

test('CascadingImportsProcessor should handle nested imports', async () => {
  const tempDir = await createTempDir();
  
  try {
    // Create nested fragments
    await writeTempFile(tempDir, '_header.html', `
      <header>
        <h1><slot>Default Title</slot></h1>
      </header>
    `);
    
    await writeTempFile(tempDir, '_layout.html', `
      <html>
        <body>
          <div data-import="_header.html">
            <slot name="title">Site Name</slot>
          </div>
          <main><slot>Main content</slot></main>
        </body>
      </html>
    `);
    
    const pageHtml = `
      <div data-import="_layout.html">
        <p>Page content</p>
        <template data-target="title">Custom Page Title</template>
      </div>
    `;
    
    const processor = new CascadingImportsProcessor(tempDir);
    const result = await processor.processImports(pageHtml, path.join(tempDir, 'page.html'));
    
    expect(result).toContain('<header>');
    expect(result).toContain('Custom Page Title'); // Should come from nested slot
    expect(result).toContain('<p>Page content</p>');
    expect(result).not.toContain('data-import');
  } finally {
    await cleanupTempDir(tempDir);
  }
});

test('CascadingImportsProcessor should handle missing fragments gracefully', async () => {
  const tempDir = await createTempDir();
  
  try {
    const pageHtml = '<div data-import="nonexistent.html">Content</div>';
    
    const processor = new CascadingImportsProcessor(tempDir);
    const result = await processor.processImports(pageHtml, path.join(tempDir, 'page.html'));
    
    // Should contain error comment
    expect(result).toContain('<!-- Import Error:');
    expect(result).toContain('nonexistent.html');
  } finally {
    await cleanupTempDir(tempDir);
  }
});

test('CascadingImportsProcessor should process markdown fragments', async () => {
  const tempDir = await createTempDir();
  
  try {
    // Create markdown fragment
    await writeTempFile(tempDir, 'content.md', `
# Markdown Fragment

This is **bold** text.
    `);
    
    await writeTempFile(tempDir, '_wrapper.html', `
      <div class="content">
        <slot>Default content</slot>
      </div>
    `);
    
    const pageHtml = `
      <div data-import="_wrapper.html">
        <div data-import="content.md"></div>
      </div>
    `;
    
    const processor = new CascadingImportsProcessor(tempDir);
    const result = await processor.processImports(pageHtml, path.join(tempDir, 'page.html'));
    
    expect(result).toContain('<div class="content">');
    expect(result).toContain('<h1');
    expect(result).toContain('Markdown Fragment');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).not.toContain('data-import');
  } finally {
    await cleanupTempDir(tempDir);
  }
});

test('CascadingImportsProcessor should handle multiple named slots', async () => {
  const tempDir = await createTempDir();
  
  try {
    await writeTempFile(tempDir, '_article.html', `
      <article>
        <header>
          <h1><slot name="title">Default Title</slot></h1>
          <p class="meta"><slot name="meta">No meta</slot></p>
        </header>
        <div class="content">
          <slot>Default content</slot>
        </div>
        <footer>
          <slot name="footer">Default footer</slot>
        </footer>
      </article>
    `);
    
    const pageHtml = `
      <div data-import="_article.html">
        <p>This is the main article content.</p>
        <template data-target="title">Custom Article Title</template>
        <template data-target="meta">Published on 2024-01-01</template>
        <template data-target="footer">© 2024 Author</template>
      </div>
    `;
    
    const processor = new CascadingImportsProcessor(tempDir);
    const result = await processor.processImports(pageHtml, path.join(tempDir, 'page.html'));
    
    expect(result).toContain('<h1>Custom Article Title</h1>');
    expect(result).toContain('<p class="meta">Published on 2024-01-01</p>');
    expect(result).toContain('<p>This is the main article content.</p>');
    expect(result).toContain('© 2024 Author');
    expect(result).not.toContain('Default Title');
    expect(result).not.toContain('Default footer');
    expect(result).not.toContain('data-import');
    expect(result).not.toContain('data-target');
  } finally {
    await cleanupTempDir(tempDir);
  }
});

test('CascadingImportsProcessor should respect max depth limit', async () => {
  const tempDir = await createTempDir();
  
  try {
    // Create a long chain of imports
    for (let i = 1; i <= 15; i++) {
      const nextImport = i < 15 ? `<div data-import="level${i + 1}.html">Next</div>` : 'End';
      await writeTempFile(tempDir, `level${i}.html`, `<div>Level ${i} ${nextImport}</div>`);
    }
    
    const processor = new CascadingImportsProcessor(tempDir, { maxDepth: 10 });
    
    await expect(
      processor.processImports('<div data-import="level1.html">Start</div>', path.join(tempDir, 'page.html'))
    ).rejects.toThrow('Maximum import depth');
  } finally {
    await cleanupTempDir(tempDir);
  }
});

test('CascadingImportsProcessor should extract slot content correctly', async () => {
  const processor = new CascadingImportsProcessor('/tmp');
  
  const content = `
    <p>This is default content</p>
    <template data-target="header">
      <h1>Custom Header</h1>
    </template>
    <template data-target="sidebar">
      <nav>Navigation</nav>
    </template>
    <p>More default content</p>
  `;
  
  const slotContent = processor.extractSlotContent(content);
  
  expect(slotContent.default).toContain('This is default content');
  expect(slotContent.default).toContain('More default content');
  expect(slotContent.default).not.toContain('template');
  
  expect(slotContent.named.header).toContain('<h1>Custom Header</h1>');
  expect(slotContent.named.sidebar).toContain('<nav>Navigation</nav>');
});

test('CascadingImportsProcessor should handle self-closing import elements', async () => {
  const tempDir = await createTempDir();
  
  try {
    await writeTempFile(tempDir, '_icon.html', '<i class="icon">★</i>');
    
    const pageHtml = '<div>Before <span data-import="_icon.html" /> After</div>';
    
    const processor = new CascadingImportsProcessor(tempDir);
    const result = await processor.processImports(pageHtml, path.join(tempDir, 'page.html'));
    
    expect(result).toContain('Before <i class="icon">★</i> After');
    expect(result).not.toContain('data-import');
  } finally {
    await cleanupTempDir(tempDir);
  }
});