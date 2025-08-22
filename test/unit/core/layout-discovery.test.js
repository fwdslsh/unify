/**
 * Unit tests for layout discovery system
 * Tests convention-based layout discovery, short name resolution, and fallback mechanisms
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { LayoutDiscovery, layoutDiscovery } from '../../../src/core/layout-discovery.js';
import { makeTempProjectFromStructure } from '../../helpers/temp-project.js';

const cleanupTasks = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
});

describe('Layout Discovery System', () => {
  
  describe('Layout File Discovery', () => {
    test('should find _layout.html in directory', async () => {
      const structure = {
        '_layout.html': '<html><body><slot></slot></body></html>',
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const layoutPath = await discovery.findLayoutInDirectory(project.sourceDir, project.sourceDir);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('_layout.html');
    });

    test('should find _layout.htm in directory', async () => {
      const structure = {
        '_layout.htm': '<html><body><slot></slot></body></html>',
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const layoutPath = await discovery.findLayoutInDirectory(project.sourceDir, project.sourceDir);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('_layout.htm');
    });

    test('should prefer _layout.html over _layout.htm', async () => {
      const structure = {
        '_layout.html': '<html><body>HTML layout</body></html>',
        '_layout.htm': '<html><body>HTM layout</body></html>',
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const layoutPath = await discovery.findLayoutInDirectory(project.sourceDir, project.sourceDir);
      
      expect(layoutPath).toContain('_layout.html');
    });

    test('should return null if no layout files found', async () => {
      const structure = {
        'page.html': '<h1>Content</h1>',
        'style.css': 'body { margin: 0; }'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const layoutPath = await discovery.findLayoutInDirectory(project.sourceDir, project.sourceDir);
      
      expect(layoutPath).toBeNull();
    });

    test('should return null for non-existent directory', async () => {
      const discovery = new LayoutDiscovery();
      const layoutPath = await discovery.findLayoutInDirectory('/non/existent/path', '/src');
      
      expect(layoutPath).toBeNull();
    });
  });

  describe('Layout File Name Recognition', () => {
    test('should recognize _layout.html as layout file', () => {
      const discovery = new LayoutDiscovery();
      
      expect(discovery.isLayoutFileName('_layout.html')).toBe(true);
      expect(discovery.isLayoutFileName('_layout.htm')).toBe(true);
    });

    test('should not recognize non-layout files', () => {
      const discovery = new LayoutDiscovery();
      
      expect(discovery.isLayoutFileName('layout.html')).toBe(false);
      expect(discovery.isLayoutFileName('_template.html')).toBe(false);
      expect(discovery.isLayoutFileName('page.html')).toBe(false);
      expect(discovery.isLayoutFileName('_layout.md')).toBe(false);
    });

    test('should recognize includes layout file names', () => {
      const discovery = new LayoutDiscovery();
      
      expect(discovery.isIncludesLayoutFileName('layout.html')).toBe(true);
      expect(discovery.isIncludesLayoutFileName('layout.htm')).toBe(true);
      expect(discovery.isIncludesLayoutFileName('_layout.html')).toBe(true);
      expect(discovery.isIncludesLayoutFileName('_layout.htm')).toBe(true);
    });

    test('should not recognize non-includes layout files', () => {
      const discovery = new LayoutDiscovery();
      
      expect(discovery.isIncludesLayoutFileName('template.html')).toBe(false);
      expect(discovery.isIncludesLayoutFileName('base.html')).toBe(false);
      expect(discovery.isIncludesLayoutFileName('layout.md')).toBe(false);
    });
  });

  describe('Page Layout Discovery', () => {
    test('should find layout in same directory as page', async () => {
      const structure = {
        'blog/_layout.html': '<html><body>Blog Layout: <slot></slot></body></html>',
        'blog/post.html': '<h1>Blog Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const layoutPath = await discovery.findLayoutForPage(pagePath, project.sourceDir);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('blog/_layout.html');
    });

    test('should find layout in parent directory', async () => {
      const structure = {
        '_layout.html': '<html><body>Root Layout: <slot></slot></body></html>',
        'blog/post.html': '<h1>Blog Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const layoutPath = await discovery.findLayoutForPage(pagePath, project.sourceDir);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('_layout.html');
    });

    test('should find layout in deeply nested structure', async () => {
      const structure = {
        '_layout.html': '<html><body>Root Layout: <slot></slot></body></html>',
        'blog/category/_layout.html': '<html><body>Category Layout: <slot></slot></body></html>',
        'blog/category/subcategory/deep/post.html': '<h1>Deep Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/category/subcategory/deep/post.html`;
      const layoutPath = await discovery.findLayoutForPage(pagePath, project.sourceDir);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('blog/category/_layout.html'); // Most specific wins
    });

    test('should find fallback layout in _includes', async () => {
      const structure = {
        '_includes/layout.html': '<html><body>Fallback Layout: <slot></slot></body></html>',
        'blog/post.html': '<h1>Blog Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const layoutPath = await discovery.findLayoutForPage(pagePath, project.sourceDir);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('_includes/layout.html');
    });

    test('should return null if no layout found', async () => {
      const structure = {
        'blog/post.html': '<h1>Blog Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const layoutPath = await discovery.findLayoutForPage(pagePath, project.sourceDir);
      
      expect(layoutPath).toBeNull();
    });
  });

  describe('Layout Chain Resolution', () => {
    test('should build layout chain from nested directories', async () => {
      const structure = {
        '_layout.html': '<html><body>Root: <slot></slot></body></html>',
        'blog/_layout.html': '<html><body>Blog: <slot></slot></body></html>',
        'blog/category/_layout.html': '<html><body>Category: <slot></slot></body></html>',
        'blog/category/post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/category/post.html`;
      const layoutChain = await discovery.getLayoutChain(pagePath, project.sourceDir);
      
      expect(layoutChain).toHaveLength(3); // Includes category, blog, and root layouts
      expect(layoutChain[0]).toContain('blog/category/_layout.html');
      expect(layoutChain[1]).toContain('blog/_layout.html');
      expect(layoutChain[2]).toContain('_layout.html');
    });

    test('should return single layout if only one found', async () => {
      const structure = {
        '_layout.html': '<html><body>Root: <slot></slot></body></html>',
        'blog/post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const layoutChain = await discovery.getLayoutChain(pagePath, project.sourceDir);
      
      expect(layoutChain).toHaveLength(1);
      expect(layoutChain[0]).toContain('_layout.html');
    });

    test('should return empty array if no layouts found', async () => {
      const structure = {
        'blog/post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const layoutChain = await discovery.getLayoutChain(pagePath, project.sourceDir);
      
      expect(layoutChain).toHaveLength(0);
    });
  });

  describe('Fallback Layout Discovery', () => {
    test('should find layout.html in _includes', async () => {
      const structure = {
        '_includes/layout.html': '<html><body>Fallback: <slot></slot></body></html>',
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const fallbackPath = await discovery.findFallbackLayoutInIncludes(project.sourceDir);
      
      expect(fallbackPath).toBeDefined();
      expect(fallbackPath).toContain('_includes/layout.html');
    });

    test('should find _layout.html in _includes if layout.html not found', async () => {
      const structure = {
        '_includes/_layout.html': '<html><body>Fallback: <slot></slot></body></html>',
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const fallbackPath = await discovery.findFallbackLayoutInIncludes(project.sourceDir);
      
      expect(fallbackPath).toBeDefined();
      expect(fallbackPath).toContain('_includes/_layout.html');
    });

    test('should prefer layout.html over _layout.html in _includes', async () => {
      const structure = {
        '_includes/layout.html': '<html><body>Standard: <slot></slot></body></html>',
        '_includes/_layout.html': '<html><body>Underscore: <slot></slot></body></html>',
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const fallbackPath = await discovery.findFallbackLayoutInIncludes(project.sourceDir);
      
      expect(fallbackPath).toContain('_includes/layout.html');
    });

    test('should return null if _includes directory missing', async () => {
      const structure = {
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const fallbackPath = await discovery.findFallbackLayoutInIncludes(project.sourceDir);
      
      expect(fallbackPath).toBeNull();
    });
  });

  describe('Layout Override Resolution', () => {
    test('should resolve absolute layout path', async () => {
      const structure = {
        'layouts/custom.html': '<html><body>Custom: <slot></slot></body></html>',
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/page.html`;
      const layoutPath = await discovery.resolveLayoutOverride('/layouts/custom.html', project.sourceDir, pagePath);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('layouts/custom.html');
    });

    test('should resolve relative layout path', async () => {
      const structure = {
        'blog/layout.html': '<html><body>Blog Layout: <slot></slot></body></html>',
        'blog/post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const layoutPath = await discovery.resolveLayoutOverride('layout.html', project.sourceDir, pagePath);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('blog/layout.html');
    });

    test('should add .html extension if missing', async () => {
      const structure = {
        'layouts/custom.html': '<html><body>Custom: <slot></slot></body></html>',
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/page.html`;
      const layoutPath = await discovery.resolveLayoutOverride('/layouts/custom', project.sourceDir, pagePath);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('layouts/custom.html');
    });

    test('should try .htm extension if .html not found', async () => {
      const structure = {
        'layouts/custom.htm': '<html><body>Custom: <slot></slot></body></html>',
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/page.html`;
      const layoutPath = await discovery.resolveLayoutOverride('/layouts/custom', project.sourceDir, pagePath);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('layouts/custom.htm');
    });

    test('should return null for non-existent layout', async () => {
      const structure = {
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/page.html`;
      const layoutPath = await discovery.resolveLayoutOverride('/layouts/missing.html', project.sourceDir, pagePath);
      
      expect(layoutPath).toBeNull();
    });

    test('should handle null layout spec', async () => {
      const structure = {
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/page.html`;
      const layoutPath = await discovery.resolveLayoutOverride(null, project.sourceDir, pagePath);
      
      expect(layoutPath).toBeNull();
    });

    test('should handle empty layout spec', async () => {
      const structure = {
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/page.html`;
      const layoutPath = await discovery.resolveLayoutOverride('', project.sourceDir, pagePath);
      
      expect(layoutPath).toBeNull();
    });

    test('should handle layout spec with type errors gracefully', async () => {
      const structure = {
        'page.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/page.html`;
      
      // Test with non-string values that could cause "includes is not a function" error
      const layoutPath1 = await discovery.resolveLayoutOverride({}, project.sourceDir, pagePath);
      expect(layoutPath1).toBeNull();
      
      const layoutPath2 = await discovery.resolveLayoutOverride(123, project.sourceDir, pagePath);
      expect(layoutPath2).toBeNull();
      
      const layoutPath3 = await discovery.resolveLayoutOverride([], project.sourceDir, pagePath);
      expect(layoutPath3).toBeNull();
    });
  });

  describe('Short Name Layout Resolution', () => {
    test('should resolve short name layout in same directory', async () => {
      const structure = {
        'blog/_blog.layout.html': '<html><body>Blog Layout: <slot></slot></body></html>',
        'blog/post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const layoutPath = await discovery.resolveShortNameLayout('blog', project.sourceDir, pagePath);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('blog/_blog.layout.html');
    });

    test('should resolve short name layout in parent directory', async () => {
      const structure = {
        '_blog.layout.html': '<html><body>Blog Layout: <slot></slot></body></html>',
        'blog/post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const layoutPath = await discovery.resolveShortNameLayout('blog', project.sourceDir, pagePath);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('_blog.layout.html');
    });

    test('should resolve short name layout in _includes', async () => {
      const structure = {
        '_includes/blog.layout.html': '<html><body>Blog Layout: <slot></slot></body></html>',
        'post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/post.html`;
      const layoutPath = await discovery.resolveShortNameLayout('blog', project.sourceDir, pagePath);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('_includes/blog.layout.html');
    });

    test('should resolve short name without layout suffix in _includes', async () => {
      const structure = {
        '_includes/blog.html': '<html><body>Blog Layout: <slot></slot></body></html>',
        'post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/post.html`;
      const layoutPath = await discovery.resolveShortNameLayout('blog', project.sourceDir, pagePath);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('_includes/blog.html');
    });

    test('should prefer .layout.html over .html for short names', async () => {
      const structure = {
        '_includes/blog.layout.html': '<html><body>Layout Template</body></html>',
        '_includes/blog.html': '<html><body>Regular Template</body></html>',
        'post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/post.html`;
      const layoutPath = await discovery.resolveShortNameLayout('blog', project.sourceDir, pagePath);
      
      expect(layoutPath).toContain('blog.layout.html');
    });

    test('should return null for non-existent short name', async () => {
      const structure = {
        'post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/post.html`;
      const layoutPath = await discovery.resolveShortNameLayout('missing', project.sourceDir, pagePath);
      
      expect(layoutPath).toBeNull();
    });
  });

  describe('HTML Structure Detection', () => {
    test('should detect complete HTML structure', () => {
      const discovery = new LayoutDiscovery();
      const completeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Test</title>
</head>
<body>
  <h1>Content</h1>
</body>
</html>`;
      
      const result = discovery.hasCompleteHtmlStructure(completeHtml);
      expect(result).toBe(true);
    });

    test('should detect incomplete HTML structure', () => {
      const discovery = new LayoutDiscovery();
      
      expect(discovery.hasCompleteHtmlStructure('<h1>Just content</h1>')).toBe(false);
      expect(discovery.hasCompleteHtmlStructure('<html><body>No head</body></html>')).toBe(false);
      expect(discovery.hasCompleteHtmlStructure('<html><head></head>No body</html>')).toBe(false);
      expect(discovery.hasCompleteHtmlStructure('<head><body>No html tag</body></head>')).toBe(false);
    });

    test('should handle empty or invalid content', () => {
      const discovery = new LayoutDiscovery();
      
      expect(discovery.hasCompleteHtmlStructure('')).toBe(false);
      expect(discovery.hasCompleteHtmlStructure('   ')).toBe(false);
      expect(discovery.hasCompleteHtmlStructure('Plain text')).toBe(false);
    });

    test('should handle case insensitive HTML tags', () => {
      const discovery = new LayoutDiscovery();
      const mixedCaseHtml = `<HTML>
<HEAD>
  <title>Test</title>
</HEAD>
<BODY>
  Content
</BODY>
</HTML>`;
      
      const result = discovery.hasCompleteHtmlStructure(mixedCaseHtml);
      expect(result).toBe(true);
    });
  });

  describe('Layout Dependencies', () => {
    test('should collect all layout dependencies for a page', async () => {
      const structure = {
        '_layout.html': '<html><body>Root: <slot></slot></body></html>',
        'blog/_layout.html': '<html><body>Blog: <slot></slot></body></html>',
        '_includes/layout.html': '<html><body>Fallback: <slot></slot></body></html>',
        'blog/post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const dependencies = await discovery.getLayoutDependencies(pagePath, project.sourceDir);
      
      expect(dependencies).toHaveLength(3);
      expect(dependencies.some(dep => dep.includes('blog/_layout.html'))).toBe(true);
      expect(dependencies.some(dep => dep.includes('_layout.html'))).toBe(true);
      expect(dependencies.some(dep => dep.includes('_includes/layout.html'))).toBe(true);
    });

    test('should avoid duplicate dependencies', async () => {
      const structure = {
        '_includes/layout.html': '<html><body>Fallback: <slot></slot></body></html>',
        'blog/post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const dependencies = await discovery.getLayoutDependencies(pagePath, project.sourceDir);
      
      // Should only include the fallback layout once
      const fallbackCount = dependencies.filter(dep => dep.includes('_includes/layout.html')).length;
      expect(fallbackCount).toBe(1);
    });

    test('should return empty array if no dependencies found', async () => {
      const structure = {
        'blog/post.html': '<h1>Post</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const dependencies = await discovery.getLayoutDependencies(pagePath, project.sourceDir);
      
      expect(dependencies).toHaveLength(0);
    });
  });

  describe('Singleton Instance', () => {
    test('should provide singleton instance', () => {
      expect(layoutDiscovery).toBeInstanceOf(LayoutDiscovery);
    });

    test('should maintain same instance across imports', () => {
      const { layoutDiscovery: instance1 } = require('../../../src/core/layout-discovery.js');
      const { layoutDiscovery: instance2 } = require('../../../src/core/layout-discovery.js');
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle filesystem permission errors gracefully', async () => {
      const discovery = new LayoutDiscovery();
      
      // Test with paths that might have permission issues
      const result = await discovery.findLayoutInDirectory('/root/restricted', '/src');
      expect(result).toBeNull();
    });

    test('should handle malformed paths gracefully', async () => {
      const discovery = new LayoutDiscovery();
      
      const result1 = await discovery.findLayoutForPage('', '/src');
      expect(result1).toBeNull();
      
      const result2 = await discovery.findLayoutForPage('//', '/src');
      expect(result2).toBeNull();
    });

    test('should handle very deep directory hierarchies', async () => {
      const deepPath = '/src/' + 'level/'.repeat(50) + 'deep.html';
      const discovery = new LayoutDiscovery();
      
      const result = await discovery.findLayoutForPage(deepPath, '/src');
      // Should not crash, even if it returns null
      expect(result).toBeNull();
    });

    test('should handle unicode characters in paths', async () => {
      const structure = {
        '文档/_layout.html': '<html><body>Layout: <slot></slot></body></html>',
        '文档/页面.html': '<h1>Content</h1>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const discovery = new LayoutDiscovery();
      const pagePath = `${project.sourceDir}/文档/页面.html`;
      const layoutPath = await discovery.findLayoutForPage(pagePath, project.sourceDir);
      
      expect(layoutPath).toBeDefined();
      expect(layoutPath).toContain('文档/_layout.html');
    });

    test('should handle circular directory structures gracefully', async () => {
      // This would be more about ensuring the loop termination logic works
      const discovery = new LayoutDiscovery();
      
      // Test with a very deep but finite path
      const deepPath = '/src/' + Array(100).fill('dir').join('/') + '/page.html';
      const result = await discovery.findLayoutForPage(deepPath, '/src');
      
      // Should terminate without infinite loop
      expect(result).toBeNull();
    });
  });
});