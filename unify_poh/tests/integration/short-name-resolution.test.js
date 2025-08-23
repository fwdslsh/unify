/**
 * Integration Tests for US-027: Short Name Layout Resolution
 * Tests end-to-end short name resolution functionality
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LayoutResolver } from '../../src/core/layout-resolver.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Short Name Resolution Integration', () => {
  let tempDir;
  let layoutResolver;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-integration-${Date.now()}`;
    mkdirSync(tempDir, { recursive: true });
    layoutResolver = new LayoutResolver();
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('End-to-End Short Name Resolution', () => {
    test('should_resolve_blog_shortname_to_blog_layout', () => {
      // Arrange: Create a typical blog structure
      mkdirSync(join(tempDir, 'blog', 'posts'), { recursive: true });
      mkdirSync(join(tempDir, '_includes'), { recursive: true });
      
      // Create layout files
      writeFileSync(join(tempDir, 'blog', '_post.layout.html'), `
        <html>
          <head><title>Blog Post Layout</title></head>
          <body>
            <header>Blog Header</header>
            <main class="unify-content">Default post content</main>
            <footer>Blog Footer</footer>
          </body>
        </html>
      `);
      
      // Create a page that uses short name resolution
      const pageContent = `
        <html data-unify="post">
          <head><title>My Amazing Post</title></head>
          <body>
            <main class="unify-content">
              <h1>My Amazing Post</h1>
              <p>This is the content of my post.</p>
            </main>
          </body>
        </html>
      `;
      
      // Act: Resolve the layout
      const result = layoutResolver.resolveLayout(
        join(tempDir, 'blog', 'posts', 'my-post.html'),
        pageContent,
        tempDir
      );
      
      // Assert: Short name should resolve to the layout file
      expect(result.source).toBe('explicit');
      expect(result.explicitLayout).toBe('post');
      expect(result.layoutPath).toBe(join(tempDir, 'blog', '_post.layout.html'));
      expect(result.reason).toContain('Explicit data-unify: post');
    });

    test('should_handle_complex_directory_structure_with_short_names', () => {
      // Arrange: Create complex nested structure
      mkdirSync(join(tempDir, 'content', 'documentation', 'api'), { recursive: true });
      mkdirSync(join(tempDir, 'content', 'layouts'), { recursive: true });
      mkdirSync(join(tempDir, '_includes'), { recursive: true });
      
      // Create different layout options
      writeFileSync(join(tempDir, 'content', '_guide.html'), '<html><body>Guide Layout</body></html>');
      writeFileSync(join(tempDir, 'content', 'layouts', '_api.layout.html'), '<html><body>API Layout</body></html>');
      writeFileSync(join(tempDir, '_includes', '_docs.html'), '<html><body>Docs Layout</body></html>');
      
      // Test 1: Resolve 'guide' from nested directory - should find parent directory layout
      const guidePageContent = `<html data-unify="guide"><body><p>Guide content</p></body></html>`;
      const guideResult = layoutResolver.resolveLayout(
        join(tempDir, 'content', 'documentation', 'guide.html'),
        guidePageContent,
        tempDir
      );
      
      expect(guideResult.source).toBe('explicit');
      expect(guideResult.layoutPath).toBe(join(tempDir, 'content', '_guide.html'));
      
      // Test 2: Resolve 'api' from same directory - should find layout suffix pattern
      const apiPageContent = `<html data-unify="api"><body><p>API content</p></body></html>`;
      const apiResult = layoutResolver.resolveLayout(
        join(tempDir, 'content', 'layouts', 'endpoints.html'),
        apiPageContent,
        tempDir
      );
      
      expect(apiResult.source).toBe('explicit');
      expect(apiResult.layoutPath).toBe(join(tempDir, 'content', 'layouts', '_api.layout.html'));
      
      // Test 3: Resolve 'docs' from deep nested directory - should find in _includes
      const docsPageContent = `<html data-unify="docs"><body><p>Documentation content</p></body></html>`;
      const docsResult = layoutResolver.resolveLayout(
        join(tempDir, 'content', 'documentation', 'api', 'reference.html'),
        docsPageContent,
        tempDir
      );
      
      expect(docsResult.source).toBe('explicit');
      expect(docsResult.layoutPath).toBe(join(tempDir, '_includes', '_docs.html'));
    });

    test('should_handle_precedence_correctly_with_multiple_matches', () => {
      // Arrange: Create multiple files that could match the same short name
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      
      // Create files in order of precedence (exact > prefix > suffix)
      writeFileSync(join(tempDir, 'layouts', 'main.html'), '<html><body>Exact Match Layout</body></html>');
      writeFileSync(join(tempDir, 'layouts', '_main.html'), '<html><body>Prefix Match Layout</body></html>');
      writeFileSync(join(tempDir, 'layouts', '_main.layout.html'), '<html><body>Suffix Match Layout</body></html>');
      
      const pageContent = `<html data-unify="main"><body><p>Page content</p></body></html>`;
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(tempDir, 'layouts', 'page.html'),
        pageContent,
        tempDir
      );
      
      // Assert: Should pick exact match over others
      expect(result.source).toBe('explicit');
      expect(result.layoutPath).toBe(join(tempDir, 'layouts', 'main.html'));
      
      // Verify stats were updated
      const stats = layoutResolver.getStats();
      expect(stats.shortNameResolutions).toBeGreaterThan(0);
    });

    test('should_fallback_gracefully_when_short_name_not_found', () => {
      // Arrange: Create minimal structure without matching layout
      mkdirSync(join(tempDir, 'pages'), { recursive: true });
      
      const pageContent = `<html data-unify="nonexistent"><body><p>Page content</p></body></html>`;
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(tempDir, 'pages', 'test.html'),
        pageContent,
        tempDir
      );
      
      // Assert: Should still return a result but with the original path
      expect(result.source).toBe('explicit');
      expect(result.explicitLayout).toBe('nonexistent');
      expect(result.layoutPath).toBe(join(tempDir, 'nonexistent'));
    });

    test('should_support_both_html_and_htm_extensions', () => {
      // Arrange: Create layouts with both extensions
      mkdirSync(join(tempDir, 'legacy'), { recursive: true });
      
      writeFileSync(join(tempDir, 'legacy', '_old.htm'), '<html><body>HTM Layout</body></html>');
      writeFileSync(join(tempDir, 'legacy', '_new.html'), '<html><body>HTML Layout</body></html>');
      
      // Test .htm extension
      const htmPageContent = `<html data-unify="old"><body><p>Legacy content</p></body></html>`;
      const htmResult = layoutResolver.resolveLayout(
        join(tempDir, 'legacy', 'legacy-page.html'),
        htmPageContent,
        tempDir
      );
      
      expect(htmResult.source).toBe('explicit');
      expect(htmResult.layoutPath).toBe(join(tempDir, 'legacy', '_old.htm'));
      
      // Test .html extension
      const htmlPageContent = `<html data-unify="new"><body><p>Modern content</p></body></html>`;
      const htmlResult = layoutResolver.resolveLayout(
        join(tempDir, 'legacy', 'modern-page.html'),
        htmlPageContent,
        tempDir
      );
      
      expect(htmlResult.source).toBe('explicit');
      expect(htmlResult.layoutPath).toBe(join(tempDir, 'legacy', '_new.html'));
    });
  });

  describe('Real-World Scenarios', () => {
    test('should_handle_typical_blog_site_structure', () => {
      // Arrange: Create realistic blog structure
      mkdirSync(join(tempDir, 'content', 'blog', 'posts', '2024'), { recursive: true });
      mkdirSync(join(tempDir, 'content', 'pages'), { recursive: true });
      mkdirSync(join(tempDir, '_includes'), { recursive: true });
      
      // Create layouts
      writeFileSync(join(tempDir, '_includes', '_base.html'), '<html><body>Base Layout</body></html>');
      writeFileSync(join(tempDir, 'content', 'blog', '_post.html'), '<html><body>Post Layout</body></html>');
      writeFileSync(join(tempDir, 'content', '_page.layout.html'), '<html><body>Page Layout</body></html>');
      
      // Test scenarios
      const scenarios = [
        {
          name: 'blog post with post layout',
          filePath: join(tempDir, 'content', 'blog', 'posts', '2024', 'my-post.html'),
          content: `<html data-unify="post"><body><p>Post content</p></body></html>`,
          expectedLayoutPath: join(tempDir, 'content', 'blog', '_post.html')
        },
        {
          name: 'static page with page layout',
          filePath: join(tempDir, 'content', 'pages', 'about.html'),
          content: `<html data-unify="page"><body><p>About content</p></body></html>`,
          expectedLayoutPath: join(tempDir, 'content', '_page.layout.html')
        },
        {
          name: 'page with base layout from includes',
          filePath: join(tempDir, 'content', 'contact.html'),
          content: `<html data-unify="base"><body><p>Contact content</p></body></html>`,
          expectedLayoutPath: join(tempDir, '_includes', '_base.html')
        }
      ];
      
      // Act & Assert
      scenarios.forEach(scenario => {
        const result = layoutResolver.resolveLayout(
          scenario.filePath,
          scenario.content,
          tempDir
        );
        
        expect(result.source).toBe('explicit');
        expect(result.layoutPath).toBe(scenario.expectedLayoutPath);
      });
    });

    test('should_provide_detailed_debugging_information', () => {
      // Arrange: Create structure for debugging
      mkdirSync(join(tempDir, 'debug', 'test'), { recursive: true });
      writeFileSync(join(tempDir, 'debug', '_layout.html'), '<html><body>Debug Layout</body></html>');
      
      const pageContent = `<html data-unify="layout"><body><p>Debug content</p></body></html>`;
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(tempDir, 'debug', 'test', 'page.html'),
        pageContent,
        tempDir
      );
      
      // Assert: Should provide comprehensive resolution information
      expect(result.source).toBe('explicit');
      expect(result.explicitLayout).toBe('layout');
      expect(result.layoutPath).toBe(join(tempDir, 'debug', '_layout.html'));
      expect(result.reason).toContain('Explicit data-unify: layout');
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      
      // Check statistics
      const stats = layoutResolver.getStats();
      expect(stats.explicitLayouts).toBeGreaterThan(0);
      expect(stats.shortNameResolutions).toBeGreaterThan(0);
    });
  });
});