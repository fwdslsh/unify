/**
 * Test for the updated layout discovery system according to new app spec
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { processHtmlUnified } from '../../src/core/unified-html-processor.js';
import { DependencyTracker } from '../../src/core/dependency-tracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFixturesDir = path.join(__dirname, '../fixtures/layout-discovery-new-spec');

describe('layout discovery new spec', () => {
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
  
  it('should use _includes/layout.html as site-wide fallback (no underscore)', async () => {
    // Create site-wide fallback layout in _includes (no underscore prefix)
    const includesDir = path.join(sourceDir, '_includes');
    await fs.mkdir(includesDir, { recursive: true });
    
    const fallbackLayoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>Site Layout</title>
</head>
<body>
  <header>Site Header</header>
  <main>
    <main data-slot="default"></main>
  </main>
  <footer>Site Footer</footer>
</body>
</html>`;
    
    await fs.writeFile(path.join(includesDir, 'layout.html'), fallbackLayoutContent);
    
    // Create page without explicit layout
    const pageContent = `<div>
  <h1>Page Content</h1>
  <p>This should use the site-wide fallback layout.</p>
</div>`;
    
    const pagePath = path.join(sourceDir, 'test.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Process the page
    const result = await processHtmlUnified(pageContent, pagePath, sourceDir, dependencyTracker, {});
    
    // Verify site-wide layout was applied
    expect(result.content).toContain('<title>Site Layout</title>');
    expect(result.content).toContain('Site Header');
    expect(result.content).toContain('Site Footer');
    expect(result.content).toContain('<h1>Page Content</h1>');
  });
  
  it('should prefer _layout.html in current directory over _includes fallback', async () => {
    // Create site-wide fallback
    const includesDir = path.join(sourceDir, '_includes');
    await fs.mkdir(includesDir, { recursive: true });
    
    const fallbackLayoutContent = `<!DOCTYPE html>
<html>
<head><title>Fallback Layout</title></head>
<body><main data-slot="default"></main></body>
</html>`;
    
    await fs.writeFile(path.join(includesDir, 'layout.html'), fallbackLayoutContent);
    
    // Create local layout in source root
    const localLayoutContent = `<!DOCTYPE html>
<html>
<head><title>Local Layout</title></head>
<body>
  <nav>Local Nav</nav>
  <main data-slot="default"></main>
</body>
</html>`;
    
    await fs.writeFile(path.join(sourceDir, '_layout.html'), localLayoutContent);
    
    // Create page
    const pageContent = `<h1>Page Content</h1>`;
    const pagePath = path.join(sourceDir, 'test.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Process the page
    const result = await processHtmlUnified(pageContent, pagePath, sourceDir, dependencyTracker, {});
    
    // Verify local layout was used, not fallback
    expect(result.content).toContain('<title>Local Layout</title>');
    expect(result.content).toContain('Local Nav');
    expect(result.content).not.toContain('Fallback Layout');
  });
  
  it('should support directory hierarchy layout discovery', async () => {
    // Create blog directory with layout
    const blogDir = path.join(sourceDir, 'blog');
    await fs.mkdir(blogDir, { recursive: true });
    
    // Create blog layout
    const blogLayoutContent = `<!DOCTYPE html>
<html>
<head><title>Blog Layout</title></head>
<body>
  <header>Blog Header</header>
  <main data-slot="default"></main>
</body>
</html>`;
    
    await fs.writeFile(path.join(blogDir, '_layout.html'), blogLayoutContent);
    
    // Create page directly in blog directory (not nested deeper)
    const pageContent = `<article>
  <h1>Blog Post</h1>
  <p>This post should use the blog layout.</p>
</article>`;
    
    const pagePath = path.join(blogDir, 'post.html');
    await fs.writeFile(pagePath, pageContent);
    
    // Process the page
    const result = await processHtmlUnified(pageContent, pagePath, sourceDir, dependencyTracker, {});
    
    // Verify blog layout was found and applied
    expect(result.content).toContain('<title>Blog Layout</title>');
    expect(result.content).toContain('Blog Header');
    expect(result.content).toContain('<h1>Blog Post</h1>');
  });
  
});