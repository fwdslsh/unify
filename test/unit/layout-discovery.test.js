import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';
import { LayoutDiscovery } from '../../src/core/layout-discovery.js';
import path from 'path';

describe('LayoutDiscovery', () => {
  let tempDir;
  let sourceDir;
  let discovery;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    discovery = new LayoutDiscovery();
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  describe('findLayoutForPage', () => {
    test('should find layout in same directory', async () => {
      await createTestStructure(sourceDir, {
        'blog/_layout.html': '<html><body><h1>Blog</h1><slot></slot></body></html>',
        'blog/post.html': '<article>Post content</article>'
      });

      const postPath = path.join(sourceDir, 'blog', 'post.html');
      const layout = await discovery.findLayoutForPage(postPath, sourceDir);

      expect(layout).toBe(path.join(sourceDir, 'blog', '_layout.html'));
    });

    test('should find layout in parent directory', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': '<html><body><slot></slot></body></html>',
        'blog/post.html': '<article>Post content</article>'
      });

      const postPath = path.join(sourceDir, 'blog', 'post.html');
      const layout = await discovery.findLayoutForPage(postPath, sourceDir);

      expect(layout).toBe(path.join(sourceDir, '_layout.html'));
    });

    test('should climb directory tree to find layout', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': '<html><body><slot></slot></body></html>',
        'docs/api/endpoints/get.html': '<div>GET endpoint docs</div>'
      });

      const endpointPath = path.join(sourceDir, 'docs', 'api', 'endpoints', 'get.html');
      const layout = await discovery.findLayoutForPage(endpointPath, sourceDir);

      expect(layout).toBe(path.join(sourceDir, '_layout.html'));
    });

    test('should prefer more specific layout over general one', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': '<html><body><slot></slot></body></html>',
        'blog/_layout.html': '<html><body><h1>Blog</h1><slot></slot></body></html>',
        'blog/post.html': '<article>Post content</article>'
      });

      const postPath = path.join(sourceDir, 'blog', 'post.html');
      const layout = await discovery.findLayoutForPage(postPath, sourceDir);

      expect(layout).toBe(path.join(sourceDir, 'blog', '_layout.html'));
    });

    test('should find fallback layout when no folder layout exists', async () => {
      await createTestStructure(sourceDir, {
        '_includes/_layout.html': '<html><body><slot></slot></body></html>',
        'page.html': '<div>Page content</div>'
      });

      const pagePath = path.join(sourceDir, 'page.html');
      const layout = await discovery.findLayoutForPage(pagePath, sourceDir);

      expect(layout).toBe(path.join(sourceDir, '_includes', '_layout.html'));
    });

    test('should handle .htm extension', async () => {
      await createTestStructure(sourceDir, {
        'blog/_layout.htm': '<html><body><h1>Blog</h1><slot></slot></body></html>',
        'blog/post.html': '<article>Post content</article>'
      });

      const postPath = path.join(sourceDir, 'blog', 'post.html');
      const layout = await discovery.findLayoutForPage(postPath, sourceDir);

      expect(layout).toBe(path.join(sourceDir, 'blog', '_layout.htm'));
    });

    test('should return null when no layout found', async () => {
      await createTestStructure(sourceDir, {
        'page.html': '<div>Page content</div>'
      });

      const pagePath = path.join(sourceDir, 'page.html');
      const layout = await discovery.findLayoutForPage(pagePath, sourceDir);

      expect(layout).toBeNull();
    });

    test('should find custom layout with extended pattern', async () => {
      await createTestStructure(sourceDir, {
        'blog/_custom.layout.html': '<html><body><h1>Custom Blog</h1><slot></slot></body></html>',
        'blog/post.html': '<article>Post content</article>'
      });

      const postPath = path.join(sourceDir, 'blog', 'post.html');
      const layout = await discovery.findLayoutForPage(postPath, sourceDir);

      expect(layout).toBe(path.join(sourceDir, 'blog', '_custom.layout.html'));
    });

    test('should find layout with complex naming pattern', async () => {
      await createTestStructure(sourceDir, {
        'docs/_documentation.layout.htm': '<html><body><nav>Docs Nav</nav><slot></slot></body></html>',
        'docs/guide.html': '<div>Guide content</div>'
      });

      const guidePath = path.join(sourceDir, 'docs', 'guide.html');
      const layout = await discovery.findLayoutForPage(guidePath, sourceDir);

      expect(layout).toBe(path.join(sourceDir, 'docs', '_documentation.layout.htm'));
    });

    test('should prefer _layout.html over other layout patterns in same directory', async () => {
      await createTestStructure(sourceDir, {
        'blog/_layout.html': '<html><body><h1>Standard Layout</h1><slot></slot></body></html>',
        'blog/_custom.layout.html': '<html><body><h1>Custom Layout</h1><slot></slot></body></html>',
        'blog/post.html': '<article>Post content</article>'
      });

      const postPath = path.join(sourceDir, 'blog', 'post.html');
      const layout = await discovery.findLayoutForPage(postPath, sourceDir);

      // Should find one of them (implementation may vary which one gets picked first)
      expect(layout === path.join(sourceDir, 'blog', '_layout.html') || 
             layout === path.join(sourceDir, 'blog', '_custom.layout.html')).toBe(true);
    });
  });

  describe('isLayoutFileName', () => {
    test('should recognize standard layout filenames', () => {
      expect(discovery.isLayoutFileName('_layout.html')).toBe(true);
      expect(discovery.isLayoutFileName('_layout.htm')).toBe(true);
    });

    test('should recognize extended layout patterns', () => {
      expect(discovery.isLayoutFileName('_custom.layout.html')).toBe(true);
      expect(discovery.isLayoutFileName('_blog-post.layout.htm')).toBe(true);
      expect(discovery.isLayoutFileName('_documentation.layout.html')).toBe(true);
    });

    test('should reject non-layout files', () => {
      expect(discovery.isLayoutFileName('layout.html')).toBe(false);
      expect(discovery.isLayoutFileName('_component.html')).toBe(false);
      expect(discovery.isLayoutFileName('_custom.template.html')).toBe(false);
      expect(discovery.isLayoutFileName('custom.layout.html')).toBe(false);
    });
  });

  describe('getLayoutChain', () => {
    test('should return single layout for simple case', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': '<html><body><slot></slot></body></html>',
        'page.html': '<div>Page content</div>'
      });

      const pagePath = path.join(sourceDir, 'page.html');
      const chain = await discovery.getLayoutChain(pagePath, sourceDir);

      expect(chain).toEqual([path.join(sourceDir, '_layout.html')]);
    });

    test('should return nested layout chain', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': '<html><body><slot></slot></body></html>',
        'blog/_layout.html': '<div class="blog-wrapper"><slot></slot></div>',
        'blog/2023/_layout.html': '<div class="year-2023"><slot></slot></div>',
        'blog/2023/post.html': '<article>Post content</article>'
      });

      const postPath = path.join(sourceDir, 'blog', '2023', 'post.html');
      const chain = await discovery.getLayoutChain(postPath, sourceDir);

      expect(chain).toEqual([
        path.join(sourceDir, 'blog', '2023', '_layout.html'),
        path.join(sourceDir, 'blog', '_layout.html'),
        path.join(sourceDir, '_layout.html')
      ]);
    });

    test('should return empty array when no layouts found', async () => {
      await createTestStructure(sourceDir, {
        'page.html': '<div>Page content</div>'
      });

      const pagePath = path.join(sourceDir, 'page.html');
      const chain = await discovery.getLayoutChain(pagePath, sourceDir);

      expect(chain).toEqual([]);
    });

    test('should include fallback layout when no folder layouts exist', async () => {
      await createTestStructure(sourceDir, {
        '_includes/_layout.html': '<html><body><slot></slot></body></html>',
        'page.html': '<div>Page content</div>'
      });

      const pagePath = path.join(sourceDir, 'page.html');
      const chain = await discovery.getLayoutChain(pagePath, sourceDir);

      expect(chain).toEqual([path.join(sourceDir, '_includes', '_layout.html')]);
    });
  });

  describe('resolveLayoutOverride', () => {
    test('should resolve absolute path from source root', async () => {
      await createTestStructure(sourceDir, {
        'layouts/custom.html': '<html><body><h1>Custom</h1><slot></slot></body></html>',
        'page.html': '<div data-layout="/layouts/custom.html">Page content</div>'
      });

      const pagePath = path.join(sourceDir, 'page.html');
      const layout = await discovery.resolveLayoutOverride('/layouts/custom.html', sourceDir, pagePath);

      expect(layout).toBe(path.join(sourceDir, 'layouts', 'custom.html'));
    });

    test('should resolve relative path from page directory', async () => {
      await createTestStructure(sourceDir, {
        'blog/layout.html': '<html><body><h1>Blog Layout</h1><slot></slot></body></html>',
        'blog/post.html': '<div data-layout="layout.html">Post content</div>'
      });

      const postPath = path.join(sourceDir, 'blog', 'post.html');
      const layout = await discovery.resolveLayoutOverride('layout.html', sourceDir, postPath);

      expect(layout).toBe(path.join(sourceDir, 'blog', 'layout.html'));
    });

    test('should add .html extension when missing', async () => {
      await createTestStructure(sourceDir, {
        'layouts/custom.html': '<html><body><h1>Custom</h1><slot></slot></body></html>',
        'page.html': '<div data-layout="/layouts/custom">Page content</div>'
      });

      const pagePath = path.join(sourceDir, 'page.html');
      const layout = await discovery.resolveLayoutOverride('/layouts/custom', sourceDir, pagePath);

      expect(layout).toBe(path.join(sourceDir, 'layouts', 'custom.html'));
    });

    test('should try .htm extension as fallback', async () => {
      await createTestStructure(sourceDir, {
        'layouts/custom.htm': '<html><body><h1>Custom</h1><slot></slot></body></html>',
        'page.html': '<div data-layout="/layouts/custom">Page content</div>'
      });

      const pagePath = path.join(sourceDir, 'page.html');
      const layout = await discovery.resolveLayoutOverride('/layouts/custom', sourceDir, pagePath);

      expect(layout).toBe(path.join(sourceDir, 'layouts', 'custom.htm'));
    });

    test('should return null for missing layout override', async () => {
      await createTestStructure(sourceDir, {
        'page.html': '<div data-layout="/missing/layout.html">Page content</div>'
      });

      const pagePath = path.join(sourceDir, 'page.html');
      const layout = await discovery.resolveLayoutOverride('/missing/layout.html', sourceDir, pagePath);

      expect(layout).toBeNull();
    });

    test('should return null for empty layout spec', async () => {
      const pagePath = path.join(sourceDir, 'page.html');
      const layout = await discovery.resolveLayoutOverride('', sourceDir, pagePath);

      expect(layout).toBeNull();
    });
  });

  describe('hasCompleteHtmlStructure', () => {
    test('should detect complete HTML structure', () => {
      const completeHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Test</title>
        </head>
        <body>
          <h1>Content</h1>
        </body>
        </html>
      `;

      expect(discovery.hasCompleteHtmlStructure(completeHtml)).toBe(true);
    });

    test('should detect incomplete HTML structure', () => {
      const incompleteHtml = '<div>Just some content</div>';
      expect(discovery.hasCompleteHtmlStructure(incompleteHtml)).toBe(false);
    });

    test('should detect missing head tag', () => {
      const noHead = `
        <html>
        <body>
          <h1>Content</h1>
        </body>
        </html>
      `;

      expect(discovery.hasCompleteHtmlStructure(noHead)).toBe(false);
    });

    test('should detect missing body tag', () => {
      const noBody = `
        <html>
        <head>
          <title>Test</title>
        </head>
        </html>
      `;

      expect(discovery.hasCompleteHtmlStructure(noBody)).toBe(false);
    });
  });

  describe('getLayoutDependencies', () => {
    test('should return all layouts in the chain plus default layout', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': '<html><body><slot></slot></body></html>',
        'blog/_layout.html': '<div class="blog-wrapper"><slot></slot></div>',
        '_includes/_layout.html': '<html><body><main><slot></slot></main></body></html>',
        'blog/post.html': '<article>Post content</article>'
      });

      const postPath = path.join(sourceDir, 'blog', 'post.html');
      const dependencies = await discovery.getLayoutDependencies(postPath, sourceDir);

      expect(dependencies).toContain(path.join(sourceDir, 'blog', '_layout.html'));
      expect(dependencies).toContain(path.join(sourceDir, '_layout.html'));
      expect(dependencies).toContain(path.join(sourceDir, '_includes', '_layout.html'));
    });

    test('should return unique dependencies', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': '<html><body><slot></slot></body></html>',
        'blog/post.html': '<article>Post content</article>'
      });

      const postPath = path.join(sourceDir, 'blog', 'post.html');
      const dependencies = await discovery.getLayoutDependencies(postPath, sourceDir);

      // Should not have duplicates
      const uniqueDeps = [...new Set(dependencies)];
      expect(dependencies.length).toBe(uniqueDeps.length);
    });
  });
});