/**
 * Test to reproduce the layout discovery bug where system looks for .layouts directory
 * instead of using naming convention discovery
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { processHtmlUnified } from '../../src/core/unified-html-processor.js';
import { DependencyTracker } from '../../src/core/dependency-tracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFixturesDir = path.join(__dirname, '../fixtures/layout-discovery-bug');

describe('layout discovery bug - .layouts directory references', () => {
  let sourceDir;
  let dependencyTracker;
  
  beforeEach(async () => {
    sourceDir = path.join(testFixturesDir, 'src');
    
    await fs.mkdir(sourceDir, { recursive: true });
    dependencyTracker = new DependencyTracker();
  });
  
  afterEach(async () => {
    try {
      await fs.rm(testFixturesDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  it('should find layout file using naming convention, not .layouts directory', async () => {
    // Create layout file directly in source directory using naming convention
    const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>Blog Layout</title>
</head>
<body>
  <header>
    <h1>My Blog</h1>
  </header>
  <main>
    <slot></slot>
  </main>
  <footer>
    <p>© 2024 My Blog</p>
  </footer>
</body>
</html>`;
    
    await fs.writeFile(path.join(sourceDir, '_blog.layout.html'), layoutContent);
    
    // Create page that references the layout by filename
    const pageContent = `<div data-layout="_blog.layout.html">
  <h2>My Blog Post</h2>
  <p>This is a blog post that should use the blog layout.</p>
</div>`;
    
    const pagePath = path.join(sourceDir, 'blog.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Process the page - this should work without looking for .layouts directory
    const result = await processHtmlUnified(pageContent, pagePath, sourceDir, dependencyTracker, {});
    
    // Verify layout was applied correctly
    expect(result.content).toContain('<title>Blog Layout</title>');
    expect(result.content).toContain('<h1>My Blog</h1>');
    expect(result.content).toContain('<h2>My Blog Post</h2>');
    expect(result.content).toContain('© 2024 My Blog');
    expect(result.content).not.toContain('data-layout');
  });
  
  it('should handle relative layout paths in subdirectories', async () => {
    // Create subdirectory with its own layout
    const blogDir = path.join(sourceDir, 'blog');
    await fs.mkdir(blogDir, { recursive: true });
    
    // Create layout in subdirectory
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <div class="blog-layout">
    <slot></slot>
  </div>
</body>
</html>`;
    
    await fs.writeFile(path.join(blogDir, '_post.layout.html'), layoutContent);
    
    // Create page in subdirectory that references layout by filename
    const pageContent = `<div data-layout="_post.layout.html">
  <article>
    <h1>Blog Post Title</h1>
    <p>Blog post content</p>
  </article>
</div>`;
    
    const pagePath = path.join(blogDir, 'post.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Process the page
    const result = await processHtmlUnified(pageContent, pagePath, sourceDir, dependencyTracker, {});
    
    // Verify layout was applied
    expect(result.content).toContain('<div class="blog-layout">');
    expect(result.content).toContain('<h1>Blog Post Title</h1>');
    expect(result.content).not.toContain('data-layout');
  });
  
  it('should handle absolute layout paths from source root', async () => {
    // Create layout in source root
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <div class="main-layout">
    <slot></slot>
  </div>
</body>
</html>`;
    
    await fs.writeFile(path.join(sourceDir, '_main.layout.html'), layoutContent);
    
    // Create subdirectory and page
    const subDir = path.join(sourceDir, 'pages');
    await fs.mkdir(subDir, { recursive: true });
    
    // Create page that references layout with absolute path
    const pageContent = `<div data-layout="/_main.layout.html">
  <h1>Page Title</h1>
  <p>Page content</p>
</div>`;
    
    const pagePath = path.join(subDir, 'page.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Process the page
    const result = await processHtmlUnified(pageContent, pagePath, sourceDir, dependencyTracker, {});
    
    // Verify layout was applied
    expect(result.content).toContain('<div class="main-layout">');
    expect(result.content).toContain('<h1>Page Title</h1>');
    expect(result.content).not.toContain('data-layout');
  });
  
  it('should not look for .layouts directory when it does not exist', async () => {
    // Create layout file directly in source directory
    const layoutContent = `<!DOCTYPE html>
<html>
<body>
  <main><slot></slot></main>
</body>
</html>`;
    
    await fs.writeFile(path.join(sourceDir, '_simple.layout.html'), layoutContent);
    
    // Create page that references the layout
    const pageContent = `<div data-layout="_simple.layout.html">
  <p>Simple content</p>
</div>`;
    
    const pagePath = path.join(sourceDir, 'simple.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Ensure .layouts directory does NOT exist
    const layoutsDir = path.join(sourceDir, '.layouts');
    try {
      await fs.access(layoutsDir);
      throw new Error('.layouts directory should not exist');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // Good - directory doesn't exist
    }
    
    // Process should succeed without trying to access .layouts
    const result = await processHtmlUnified(pageContent, pagePath, sourceDir, dependencyTracker, {});
    
    expect(result.content).toContain('<main>');
    expect(result.content).toContain('<p>Simple content</p>');
    expect(result.content).not.toContain('data-layout');
  });
});