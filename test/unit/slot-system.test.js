/**
 * Tests for slot system functionality (v0.6.0)
 * Verifies spec compliance for data-target and slot syntax
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { CascadingImportsProcessor } from '../../src/core/cascading-imports-processor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper functions for temp directories  
async function createTempDir() {
  const tempDir = path.join(__dirname, '../fixtures/slot-system-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
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
    await fs.rm(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('slot system v0.6.0', () => {
  let tempDir;
  let processor;
  
  beforeEach(async () => {
    tempDir = await createTempDir();
    processor = new CascadingImportsProcessor(tempDir);
  });
  
  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });
  
  it('should handle template data-target assignments', async () => {
    // Create layout with named slots
    const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>Test Layout</title>
  <slot name="head">Default head content</slot>
</head>
<body>
  <header>
    <slot name="header">Default header</slot>
  </header>
  <main>
    <slot>Default main content</slot>
  </main>
  <footer>
    <slot name="footer">Default footer</slot>
  </footer>
</body>
</html>`;
    
    await writeTempFile(tempDir, '_layout.html', layoutContent);
    
    // Create page with template data-target assignments
    const pageContent = `<div data-import="_layout.html">
<template data-target="head">
  <link rel="stylesheet" href="page.css">
</template>
<template data-target="header">
  <h1>Page Header</h1>
</template>
<template data-target="footer">
  <p>Copyright 2024</p>
</template>
<div>
  <h2>Main Content</h2>
  <p>This is the main content of the page.</p>
</div>
</div>`;
    
    const result = await processor.processImports(pageContent, path.join(tempDir, 'index.html'));
    
    // Verify data-targets were placed correctly
    expect(result).toContain('<link rel="stylesheet" href="page.css">');
    expect(result).toContain('<h1>Page Header</h1>');
    expect(result).toContain('<h2>Main Content</h2>');
    expect(result).toContain('<p>Copyright 2024</p>');
    expect(result).not.toContain('Default head content');
    expect(result).not.toContain('Default header');
    expect(result).not.toContain('Default footer');
    expect(result).not.toContain('data-target');
    expect(result).not.toContain('data-import');
  });
  
  it('should handle template-based slot targeting', async () => {
    // Create layout with named slots
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <nav>
    <slot name="navigation">Default nav</slot>
  </nav>
  <main>
    <slot>Default content</slot>
  </main>
  <aside>
    <slot name="sidebar">Default sidebar</slot>
  </aside>
</body>
</html>`;
    
    await writeTempFile(tempDir, '_layout.html', layoutContent);
    
    // Create page with template data-target assignments (v0.6.0 way)
    const pageContent = `<div data-import="_layout.html">
<template data-target="navigation">
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</template>
<template data-target="sidebar">
  <h3>Related Links</h3>
  <ul>
    <li><a href="/link1">Link 1</a></li>
  </ul>
</template>
<article>
  <h1>Article Title</h1>
  <p>Article content here.</p>
</article>
</div>`;
    
    const result = await processor.processImports(pageContent, path.join(tempDir, 'page.html'));
    
    // Verify elements were moved to correct slots
    expect(result).toContain('<ul>');
    expect(result).toContain('<li><a href="/">Home</a></li>');
    expect(result).toContain('<h3>Related Links</h3>');
    expect(result).toContain('<h1>Article Title</h1>');
    expect(result).not.toContain('Default nav');
    expect(result).not.toContain('Default sidebar');
  });
  
  it('should preserve fallback content when no data-target assignment', async () => {
    // Create layout with fallback content
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <header>
    <slot name="header">
      <h1>Default Title</h1>
      <nav>
        <a href="/">Home</a>
      </nav>
    </slot>
  </header>
  <main>
    <slot>
      <h2>Welcome</h2>
      <p>This is the default content.</p>
    </slot>
  </main>
</body>
</html>`;
    
    await writeTempFile(tempDir, '_layout.html', layoutContent);
    
    // Create page with empty content (should use fallback)
    const pageContent = `<div data-import="_layout.html"></div>`;
    
    const result = await processor.processImports(pageContent, path.join(tempDir, 'fallback.html'));
    
    // Verify fallback content is preserved
    expect(result).toContain('<h1>Default Title</h1>');
    expect(result).toContain('<a href="/">Home</a>');
    // In v0.6.0, slot fallback only works when slot content is truly empty after trimming
    // Since we have empty content, should use fallback
    expect(result).toContain('<h1>Default Title</h1>');
    expect(result).toContain('<a href="/">Home</a>');
  });
  
  it('should handle template content targeting specific slot', async () => {
    // Create layout
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <main>
    <slot name="content">Default content</slot>
  </main>
</body>
</html>`;
    
    await writeTempFile(tempDir, '_layout.html', layoutContent);
    
    // Create page with template targeting specific slot
    const pageContent = `<div data-import="_layout.html">
<template data-target="content">
  <h2>Custom Content</h2>
  <p>This content replaces the default slot content.</p>
</template>
</div>`;
    
    const result = await processor.processImports(pageContent, path.join(tempDir, 'custom.html'));
    
    // Verify custom content is used
    expect(result).toContain('<h2>Custom Content</h2>');
    expect(result).toContain('This content replaces the default slot content.');
    expect(result).not.toContain('Default content');
  });

  it('should handle short name layout references', async () => {
    // Create named layout file with .layout. convention
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <header>
    <slot name="header">Default header</slot>
  </header>
  <main>
    <slot>Default main content</slot>
  </main>
</body>
</html>`;
    
    await writeTempFile(tempDir, '_blog.layout.html', layoutContent);
    
    // Create page with short name reference
    const pageContent = `<div data-import="blog">
<template data-target="header">
  <h1>Blog Post Title</h1>
</template>
<article>
  <p>This is the blog post content.</p>
</article>
</div>`;
    
    const result = await processor.processImports(pageContent, path.join(tempDir, 'post.html'));
    
    // Verify short name resolved to correct layout
    expect(result).toContain('<h1>Blog Post Title</h1>');
    expect(result).toContain('<article>');
    expect(result).toContain('This is the blog post content');
    expect(result).not.toContain('Default header');
    expect(result).not.toContain('Default main content');
  });

  it('should handle short name layout resolution', async () => {
    // Create layout file with .layout. convention
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <h1>Blog Layout</h1>
  <slot>Content</slot>
</body>
</html>`;
    
    await writeTempFile(tempDir, '_blog.layout.html', layoutContent);
    
    // Create page with short name reference
    const pageContent = `<div data-import="blog">
<p>Test content</p>
</div>`;
    
    const result = await processor.processImports(pageContent, path.join(tempDir, 'post.html'));
    
    // Verify layout was resolved and used
    expect(result).toContain('Blog Layout');
    expect(result).toContain('<p>Test content</p>');
  });
});