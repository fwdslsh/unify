// Complete comprehensive test suite for unified-html-processor.js
// Targeting 95%+ coverage from current 40.19%

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
  processHtmlUnified,
  readIncludeWithFallback,
  optimizeHtml
} from '../../../src/core/unified-html-processor.js';
import { makeTempProjectFromStructure } from '../../helpers/temp-project.js';
import fs from 'fs/promises';
import path from 'path';

describe('Unified HTML Processor - Comprehensive Coverage', () => {
  let cleanupTasks = [];

  afterEach(async () => {
    // Clean up any temp projects created during tests
    for (const cleanup of cleanupTasks) {
      try {
        await cleanup();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    cleanupTasks = [];
  });

  describe('processHtmlUnified - Core Processing', () => {
    test('should process basic HTML with cascading imports', async () => {
      const project = await makeTempProjectFromStructure({
        'index.html': '<html data-import="layout.html"><body><div data-target="content">Page content</div></body></html>',
        'layout.html': '<html><head><title>Layout</title></head><body><slot name="content">Default</slot></body></html>'
      });
      cleanupTasks.push(project.cleanup);

      const indexPath = path.join(project.sourceDir, 'index.html');
      const content = await fs.readFile(indexPath, 'utf-8');
      
      const result = await processHtmlUnified(content, indexPath, project.sourceDir, null, {});
      
      expect(result).toContain('Page content');
      expect(result).toContain('<title>Layout</title>');
    });

    test('should handle HTML without any imports (fallback path)', async () => {
      const project = await makeTempProjectFromStructure({
        'simple.html': '<html><head><title>Simple</title></head><body>Simple content</body></html>'
      });
      cleanupTasks.push(project.cleanup);

      const htmlPath = path.join(project.sourceDir, 'simple.html');
      const content = await fs.readFile(htmlPath, 'utf-8');
      
      const result = await processHtmlUnified(content, htmlPath, project.sourceDir, null, {});
      
      expect(result).toContain('Simple content');
      expect(result).toContain('<title>Simple</title>');
    });

    test('should handle CascadingImportsProcessor errors gracefully', async () => {
      const project = await makeTempProjectFromStructure({
        'broken.html': '<html data-import="missing-layout.html"><body>Content</body></html>'
      });
      cleanupTasks.push(project.cleanup);

      const htmlPath = path.join(project.sourceDir, 'broken.html');
      const content = await fs.readFile(htmlPath, 'utf-8');
      
      // Should handle import errors by showing error comment
      const result = await processHtmlUnified(content, htmlPath, project.sourceDir, null, {});
      
      expect(result).toContain('Import Error');
      expect(result).toContain('Fragment not found');
    });
  });

  describe('readIncludeWithFallback - File Resolution', () => {
    test('should read file from exact resolved path', async () => {
      const project = await makeTempProjectFromStructure({
        'fragment.html': '<div>Fragment content</div>'
      });
      cleanupTasks.push(project.cleanup);

      const fragmentPath = path.join(project.sourceDir, 'fragment.html');
      const result = await readIncludeWithFallback(
        fragmentPath, 
        'fragment.html', 
        path.join(project.sourceDir, 'page.html'), 
        project.sourceRoot
      );
      
      expect(result.content).toContain('Fragment content');
      expect(result.resolvedPath).toBe(fragmentPath);
    });

    test('should try sourceRoot-relative fallback when exact path fails', async () => {
      const project = await makeTempProjectFromStructure({
        'components/header.html': '<header>Site header</header>'
      });
      cleanupTasks.push(project.cleanup);

      // Try to read with wrong initial path, should find via fallback
      const wrongPath = path.join(project.sourceDir, 'wrong-path.html');
      const result = await readIncludeWithFallback(
        wrongPath,
        'components/header.html',
        path.join(project.sourceDir, 'page.html'),
        project.sourceDir
      );
      
      expect(result.content).toContain('Site header');
      expect(result.resolvedPath).toContain('components/header.html');
    });

    test('should try _includes fallback directory', async () => {
      const project = await makeTempProjectFromStructure({
        '_includes/footer.html': '<footer>Site footer</footer>'
      });
      cleanupTasks.push(project.cleanup);

      const wrongPath = path.join(project.sourceDir, 'missing.html');
      const result = await readIncludeWithFallback(
        wrongPath,
        'footer.html', // Just basename, should find in _includes
        path.join(project.sourceDir, 'page.html'),
        project.sourceDir
      );
      
      expect(result.content).toContain('Site footer');
      expect(result.resolvedPath).toContain('_includes/footer.html');
    });

    test('should process markdown includes correctly', async () => {
      const project = await makeTempProjectFromStructure({
        'content.md': `---
title: Markdown Content
---
# Hello World
This is markdown content.`
      });
      cleanupTasks.push(project.cleanup);

      const mdPath = path.join(project.sourceDir, 'content.md');
      const result = await readIncludeWithFallback(
        mdPath,
        'content.md',
        path.join(project.sourceDir, 'page.html'),
        project.sourceDir
      );
      
      expect(result.content).toContain('<h1>Hello World</h1>');
      expect(result.content).toContain('<p>This is markdown content.</p>');
    });

    test('should handle markdown processing errors', async () => {
      const project = await makeTempProjectFromStructure({
        'broken.md': `---
invalid: yaml: content
malformed: yaml: content
---
# Broken Frontmatter`
      });
      cleanupTasks.push(project.cleanup);

      const mdPath = path.join(project.sourceDir, 'broken.md');
      
      // Should throw error for malformed markdown
      await expect(async () => {
        await readIncludeWithFallback(
          mdPath,
          'broken.md',
          path.join(project.sourceDir, 'page.html'),
          project.sourceDir
        );
      }).toThrow();
    });

    test('should try relative to requesting file directory', async () => {
      const project = await makeTempProjectFromStructure({
        'pages/blog/sidebar.html': '<aside>Blog sidebar</aside>',
        'pages/blog/post.html': '<article>Blog post</article>'
      });
      cleanupTasks.push(project.cleanup);

      const wrongPath = path.join(project.sourceDir, 'missing.html');
      const requestingFile = path.join(project.sourceDir, 'pages/blog/post.html');
      
      const result = await readIncludeWithFallback(
        wrongPath,
        'sidebar.html', // Should find relative to blog directory
        requestingFile,
        project.sourceDir
      );
      
      expect(result.content).toContain('Blog sidebar');
      expect(result.resolvedPath).toContain('pages/blog/sidebar.html');
    });

    test('should handle all fallback failures and throw meaningful error', async () => {
      const project = await makeTempProjectFromStructure({
        'page.html': '<div>Page content</div>'
      });
      cleanupTasks.push(project.cleanup);

      const wrongPath = path.join(project.sourceDir, 'missing.html');
      
      await expect(async () => {
        await readIncludeWithFallback(
          wrongPath,
          'completely-missing-file.html',
          path.join(project.sourceDir, 'page.html'),
          project.sourceDir
        );
      }).toThrow();
    });
  });

  describe('optimizeHtml - HTML Optimization', () => {
    test('should process slots and templates according to app-spec', async () => {
      const html = '<div><slot name="test">Default</slot><template data-target="test">New content</template></div>';
      const result = await optimizeHtml(html);
      
      // According to app-spec: slots should be replaced, templates removed
      expect(result).not.toContain('<template');
      expect(result).toContain('div');
    });

    test('should remove data-import, data-target, and data-layer attributes', async () => {
      const html = '<div data-import="layout.html" data-target="content" data-layer="main">Content</div>';
      const result = await optimizeHtml(html);
      
      // Per app-spec: these attributes should be removed
      expect(result).not.toContain('data-import');
      expect(result).not.toContain('data-target');
      expect(result).not.toContain('data-layer');
      expect(result).toContain('Content'); // Content preserved
      expect(result).toContain('div'); // Structure preserved
    });

    test('should handle empty HTML gracefully', async () => {
      const result = await optimizeHtml('');
      expect(result).toBe('');
    });

    test('should handle HTML without optimization targets', async () => {
      const html = '<div class="normal">Regular content</div>';
      const result = await optimizeHtml(html);
      
      expect(result).toBe(html); // Should be unchanged
    });

    test('should handle complex nested structures', async () => {
      const html = `
        <div data-import="layout.html">
          <section data-target="main">
            <slot name="content">
              <template data-target="content">
                Nested content
              </template>
            </slot>
          </section>
        </div>`;
      
      const result = await optimizeHtml(html);
      
      // Test that attributes are removed and structure preserved
      expect(result).not.toContain('data-import');
      expect(result).not.toContain('data-target');
      expect(result).not.toContain('<template');
      expect(result).toContain('section');
      expect(result).toContain('div');
    });

    test('should preserve HTML structure and content during optimization', async () => {
      const html = `
        <html>
          <head><title>Test</title></head>
          <body data-layer="body">
            <main data-target="content">
              <h1>Title</h1>
              <p>Paragraph content</p>
            </main>
          </body>
        </html>`;
      
      const result = await optimizeHtml(html);
      
      expect(result).toContain('<title>Test</title>');
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<p>Paragraph content</p>');
      expect(result).toContain('main'); // Structure preserved
      expect(result).toContain('body'); // Body preserved
      // Unify-specific attributes should be removed
      expect(result).not.toContain('data-layer');
      expect(result).not.toContain('data-target');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle files with special characters in paths', async () => {
      const project = await makeTempProjectFromStructure({
        'special-file_name.html': '<div>Special file content</div>'
      });
      cleanupTasks.push(project.cleanup);

      const specialPath = path.join(project.sourceDir, 'special-file_name.html');
      const result = await readIncludeWithFallback(
        path.join(project.sourceDir, 'missing.html'), // Wrong path
        'special-file_name.html',
        path.join(project.sourceDir, 'page.html'),
        project.sourceDir
      );
      
      expect(result.content).toContain('Special file content');
    });

    test('should handle deep nested directory structures', async () => {
      const project = await makeTempProjectFromStructure({
        'deep/nested/components/complex.html': '<div>Deep nested component</div>',
        'pages/section/article.html': '<article>Article content</article>'
      });
      cleanupTasks.push(project.cleanup);

      const result = await readIncludeWithFallback(
        path.join(project.sourceDir, 'wrong/path/complex.html'), // Wrong path
        'deep/nested/components/complex.html',
        path.join(project.sourceDir, 'pages/section/article.html'),
        project.sourceDir
      );
      
      expect(result.content).toContain('Deep nested component');
    });

    test('should handle absolute vs relative path resolution', async () => {
      const project = await makeTempProjectFromStructure({
        'utils/helper.html': '<div>Helper utility</div>'
      });
      cleanupTasks.push(project.cleanup);

      const result = await readIncludeWithFallback(
        path.join(project.sourceDir, 'missing/helper.html'), // Wrong path
        '/utils/helper.html', // Absolute-style path
        path.join(project.sourceDir, 'page.html'),
        project.sourceDir
      );
      
      expect(result.content).toContain('Helper utility');
    });

    test('should handle concurrent file reading operations', async () => {
      const project = await makeTempProjectFromStructure({
        'shared/component.html': '<div>Shared component</div>',
        'pages/index.html': '<div>Index page</div>'
      });
      cleanupTasks.push(project.cleanup);

      // Test multiple concurrent reads
      const promises = [
        readIncludeWithFallback(
          path.join(project.sourceDir, 'nonexistent/component.html'),
          'shared/component.html',
          path.join(project.sourceDir, 'pages/index.html'),
          project.sourceDir
        ),
        readIncludeWithFallback(
          path.join(project.sourceDir, 'nonexistent/component.html'),
          'shared/component.html',
          path.join(project.sourceDir, 'pages/index.html'),
          project.sourceDir
        )
      ];

      const results = await Promise.all(promises);
      
      expect(results[0].content).toContain('Shared component');
      expect(results[1].content).toContain('Shared component');
    });

    test('should handle malformed HTML during optimization', async () => {
      const malformedHtml = `
        <div data-import="layout.html">
          <slot name="content">Default
          <template data-target="content">
            New content
          <div>Unclosed
        </div>`;
      
      // Should not throw, should handle gracefully
      const result = await optimizeHtml(malformedHtml);
      
      expect(result).toContain('div'); // Structure preserved
      expect(result).not.toContain('data-import'); // Attributes should be removed
      expect(result).not.toContain('<template'); // Templates should be removed
    });
  });

  describe('Performance and Scale', () => {
    test('should handle large HTML documents efficiently', async () => {
      // Generate large HTML content (1MB+)
      const largeContent = '<div>' + 'x'.repeat(1000000) + '</div>';
      const html = `<div data-import="layout.html" data-target="content">${largeContent}</div>`;
      
      const startTime = performance.now();
      const result = await optimizeHtml(html);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in <1 second
      expect(result).toContain(largeContent);
      expect(result).not.toContain('data-import');
    });

    test('should handle many simultaneous optimization operations', async () => {
      const htmlTemplates = Array.from({ length: 50 }, (_, i) => 
        `<div data-target="content-${i}">Content ${i}</div>`
      );
      
      const startTime = performance.now();
      const results = await Promise.all(
        htmlTemplates.map(html => optimizeHtml(html))
      );
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(2000); // Should handle 50 operations in <2 seconds
      expect(results).toHaveLength(50);
      results.forEach((result, i) => {
        expect(result).toContain(`Content ${i}`);
        expect(result).not.toContain('data-target');
        expect(result).toContain('div');
      });
    });
  });
});