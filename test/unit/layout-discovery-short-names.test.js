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
    test('should resolve short name by searching up directory hierarchy', async () => {
      // Setup: Create page in subdirectory and layout in parent
      const parentDir = path.join(tempDir, 'blog');
      const subDir = path.join(parentDir, 'posts');
      await fs.mkdir(subDir, { recursive: true });
      
      const pagePath = path.join(subDir, 'post.html');
      const layoutPath = path.join(parentDir, '_blog.layout.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPath, '<html><body><slot></slot></body></html>');
      
      const result = await discovery.resolveShortNameLayout('blog', tempDir, pagePath);
      expect(result).toBe(layoutPath);
    });

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

    test('should ONLY find .layout. files (non-.layout. files are not resolved)', async () => {
      // Setup: Create both types of files
      const pageDir = path.join(tempDir, 'blog');
      await fs.mkdir(pageDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPathValid = path.join(pageDir, '_blog.layout.html');
      const layoutPathInvalid = path.join(pageDir, '_blog.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPathInvalid, '<html><body>Should not be found</body></html>');
      await fs.writeFile(layoutPathValid, '<html><body>Should be found</body></html>');
      
      const result = await discovery.resolveShortNameLayout('blog', tempDir, pagePath);
      expect(result).toBe(layoutPathValid);
    });

    test('should NOT find non-.layout. files (requires .layout. suffix)', async () => {
      // Setup: Create only non-.layout. file
      const pageDir = path.join(tempDir, 'blog');
      await fs.mkdir(pageDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPath = path.join(pageDir, '_blog.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      await fs.writeFile(layoutPath, '<html><body><slot></slot></body></html>');
      
      // Should return null since _blog.html doesn't have .layout. suffix
      const result = await discovery.resolveShortNameLayout('blog', tempDir, pagePath);
      expect(result).toBe(null);
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

    test('should find both prefixed and non-prefixed .layout. files in _includes', async () => {
      // Setup: Create both types in _includes
      const pageDir = path.join(tempDir, 'blog');
      const includesDir = path.join(tempDir, '_includes');
      await fs.mkdir(pageDir, { recursive: true });
      await fs.mkdir(includesDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const layoutPathNonPrefixed = path.join(includesDir, 'blog.layout.html');
      const layoutPathPrefixed = path.join(includesDir, '_blog.layout.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      // Test with non-prefixed version
      await fs.writeFile(layoutPathNonPrefixed, '<html><body>Non-prefixed</body></html>');
      
      const result = await discovery.resolveShortNameLayout('blog', tempDir, pagePath);
      expect(result).toBe(layoutPathNonPrefixed);
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

    test('should find simple .html files ONLY in _includes directory', async () => {
      // Setup: Create a page and simple .html files both in regular directory and _includes
      const pageDir = path.join(tempDir, 'blog');
      const includesDir = path.join(tempDir, '_includes');
      await fs.mkdir(pageDir, { recursive: true });
      await fs.mkdir(includesDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const regularDirLayoutPath = path.join(pageDir, 'special.html');
      const includesDirLayoutPath = path.join(includesDir, 'special.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      // Create a simple .html file in regular directory (should NOT be found)
      await fs.writeFile(regularDirLayoutPath, '<html><body>Regular dir layout</body></html>');
      // Create a simple .html file in _includes directory (SHOULD be found)
      await fs.writeFile(includesDirLayoutPath, '<html><body>Includes dir layout</body></html>');
      
      const result = await discovery.resolveShortNameLayout('special', tempDir, pagePath);
      // Should find the one in _includes, not the one in regular directory
      expect(result).toBe(includesDirLayoutPath);
    });

    test('should NOT find simple .html files outside _includes directory when no _includes version exists', async () => {
      // Setup: Create a page and simple .html file only in regular directory
      const pageDir = path.join(tempDir, 'blog');
      await fs.mkdir(pageDir, { recursive: true });
      
      const pagePath = path.join(pageDir, 'post.html');
      const regularDirLayoutPath = path.join(pageDir, 'special.html');
      
      await fs.writeFile(pagePath, '<h1>Post</h1>');
      // Create a simple .html file in regular directory (should NOT be found)
      await fs.writeFile(regularDirLayoutPath, '<html><body>Regular dir layout</body></html>');
      
      const result = await discovery.resolveShortNameLayout('special', tempDir, pagePath);
      // Should return null since simple .html files are only matched in _includes
      expect(result).toBe(null);
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