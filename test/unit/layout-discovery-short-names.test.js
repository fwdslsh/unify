import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LayoutDiscovery } from '../../src/core/layout-discovery.js';
import fs from 'fs/promises';
import path from 'path';

describe('LayoutDiscovery Short Name Resolution', () => {
  let tempDir;
  let discovery;
  
  beforeEach(async () => {
    discovery = new LayoutDiscovery();
    tempDir = path.join(process.cwd(), 'test', 'fixtures', `layout-short-names-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });
  
  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup failed, ignore
    }
  });

  describe('resolveShortNameLayout', () => {
    test('should resolve short name to .layout. file in same directory', async () => {
      // Setup: Create page and layout in same directory
      const pageDir = path.join(tempDir, 'blog');
      await fs.mkdir(pageDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPath = path.join(pageDir, '_blog.layout.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPath, '<html><body><slot></slot></body></html>');
      
      const result = await discovery.resolveShortNameLayout('blog', tempDir, pagePath);
      expect(result).toBe(layoutPath);
    });

    test('should prefer .layout. files over non-.layout. files', async () => {
      // Setup: Create both types of files
      const pageDir = path.join(tempDir, 'blog');
      await fs.mkdir(pageDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPathPreferred = path.join(pageDir, '_blog.layout.html');
      const layoutPathSecondary = path.join(pageDir, '_blog.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPathSecondary, '<html><body>Secondary</body></html>');
      await fs.writeFile(layoutPathPreferred, '<html><body>Preferred</body></html>');
      
      const result = await discovery.resolveShortNameLayout('blog', tempDir, pagePath);
      expect(result).toBe(layoutPathPreferred);
    });

    test('should fallback to non-.layout. files when .layout. not available', async () => {
      // Setup: Create only non-.layout. file
      const pageDir = path.join(tempDir, 'blog');
      await fs.mkdir(pageDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPath = path.join(pageDir, '_blog.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPath, '<html><body><slot></slot></body></html>');
      
      const result = await discovery.resolveShortNameLayout('blog', tempDir, pagePath);
      expect(result).toBe(layoutPath);
    });

    test('should check _includes directory when not found in same directory', async () => {
      // Setup: Create page and layout in _includes
      const pageDir = path.join(tempDir, 'blog');
      const includesDir = path.join(tempDir, '_includes');
      await fs.mkdir(pageDir, { recursive: true });
      await fs.mkdir(includesDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPath = path.join(includesDir, 'blog.layout.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPath, '<html><body><slot></slot></body></html>');
      
      const result = await discovery.resolveShortNameLayout('blog', tempDir, pagePath);
      expect(result).toBe(layoutPath);
    });

    test('should prefer _includes files without underscore prefix', async () => {
      // Setup: Create both types in _includes
      const pageDir = path.join(tempDir, 'blog');
      const includesDir = path.join(tempDir, '_includes');
      await fs.mkdir(pageDir, { recursive: true });
      await fs.mkdir(includesDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPathPreferred = path.join(includesDir, 'blog.layout.html');
      const layoutPathSecondary = path.join(includesDir, '_blog.layout.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPathSecondary, '<html><body>Secondary</body></html>');
      await fs.writeFile(layoutPathPreferred, '<html><body>Preferred</body></html>');
      
      const result = await discovery.resolveShortNameLayout('blog', tempDir, pagePath);
      expect(result).toBe(layoutPathPreferred);
    });

    test('should return null when short name not found anywhere', async () => {
      // Setup: Create page but no matching layout
      const pageDir = path.join(tempDir, 'blog');
      await fs.mkdir(pageDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      
      const result = await discovery.resolveShortNameLayout('nonexistent', tempDir, pagePath);
      expect(result).toBe(null);
    });

    test('should handle .htm extension files', async () => {
      // Setup: Create .htm layout file
      const pageDir = path.join(tempDir, 'blog');
      await fs.mkdir(pageDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPath = path.join(pageDir, '_blog.layout.htm');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPath, '<html><body><slot></slot></body></html>');
      
      const result = await discovery.resolveShortNameLayout('blog', tempDir, pagePath);
      expect(result).toBe(layoutPath);
    });
  });

  describe('resolveLayoutOverride integration', () => {
    test('should detect short names and use short name resolution', async () => {
      // Setup: Create layout in _includes
      const pageDir = path.join(tempDir, 'blog');
      const includesDir = path.join(tempDir, '_includes');
      await fs.mkdir(pageDir, { recursive: true });
      await fs.mkdir(includesDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPath = path.join(includesDir, 'special.layout.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPath, '<html><body><slot></slot></body></html>');
      
      const result = await discovery.resolveLayoutOverride('special', tempDir, pagePath);
      expect(result).toBe(layoutPath);
    });

    test('should use full path resolution for paths with slashes', async () => {
      // Setup: Create layout in subdirectory relative to page
      const pageDir = path.join(tempDir, 'blog');
      const layoutDir = path.join(pageDir, 'layouts');
      await fs.mkdir(pageDir, { recursive: true });
      await fs.mkdir(layoutDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPath = path.join(layoutDir, 'special.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPath, '<html><body><slot></slot></body></html>');
      
      const result = await discovery.resolveLayoutOverride('layouts/special.html', tempDir, pagePath);
      expect(result).toBe(layoutPath);
    });

    test('should use full path resolution for paths with extensions', async () => {
      // Setup: Create layout file
      const pageDir = path.join(tempDir, 'blog');
      await fs.mkdir(pageDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPath = path.join(pageDir, '_custom.layout.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPath, '<html><body><slot></slot></body></html>');
      
      const result = await discovery.resolveLayoutOverride('_custom.layout.html', tempDir, pagePath);
      expect(result).toBe(layoutPath);
    });
  });
});