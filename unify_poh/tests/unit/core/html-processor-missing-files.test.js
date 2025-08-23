import { describe, test, expect, beforeEach } from 'bun:test';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('HtmlProcessor - Missing File Handling', () => {
  let processor;
  let pathValidator;
  let mockFileSystem;

  beforeEach(() => {
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
    mockFileSystem = {};
  });

  describe('Missing Layout File Graceful Fallback', () => {
    test('should_gracefully_fallback_when_layout_file_missing', async () => {
      // Arrange: Page references missing layout
      const pageHtml = `
        <html data-unify="missing-layout.html">
          <head><title>Page Title</title></head>
          <body>
            <main class="unify-content">Page content</main>
          </body>
        </html>
      `;

      // Act: Process with missing layout (should not throw)
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem, // Empty - missing layout
        '/test',
        {}
      );

      // Assert: Should succeed with fallback to original content
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page content');
      expect(result.html).toContain('<title>Page Title</title>');
      // Should preserve original structure but remove data-unify attribute
      expect(result.html).not.toContain('data-unify');
      expect(result.html).toContain('<html>');
    });

    test('should_log_warning_for_missing_layout_without_failing_build', async () => {
      // Arrange: Track console output
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(' '));

      const pageHtml = `
        <html data-unify="missing-layout.html">
          <head><title>Test</title></head>
          <body><main>Content</main></body>
        </html>
      `;

      try {
        // Act: Process with missing layout
        const result = await processor.processFile(
          'page.html',
          pageHtml,
          mockFileSystem,
          '/test',
          {}
        );

        // Assert: Build succeeds but warning logged
        expect(result.success).toBe(true);
        expect(warnings.some(w => w.includes('missing-layout.html'))).toBe(true);
        expect(warnings.some(w => w.includes('Layout file not found'))).toBe(true);
      } finally {
        console.warn = originalWarn;
      }
    });

    test('should_track_missing_layouts_in_statistics', async () => {
      // Arrange: Get initial stats
      const initialStats = processor.getCacheStats();
      const initialMissing = initialStats.layoutMissing || 0;

      const pageHtml = `
        <html data-unify="missing.html">
          <head><title>Test</title></head>
          <body><main>Content</main></body>
        </html>
      `;

      // Act: Process multiple pages with missing layouts
      await processor.processFile('page1.html', pageHtml, mockFileSystem, '/test', {});
      await processor.processFile('page2.html', pageHtml, mockFileSystem, '/test', {});

      // Assert: Statistics should increment missing layout count
      const finalStats = processor.getCacheStats();
      expect(finalStats.layoutMissing).toBe(initialMissing + 2);
    });

    test('should_handle_missing_layout_in_nested_composition', async () => {
      // Arrange: Valid layout exists but references missing nested layout
      mockFileSystem['valid-layout.html'] = `
        <html data-unify="missing-nested.html">
          <head><title>Layout Title</title></head>
          <body>
            <div class="unify-content">Layout content</div>
          </body>
        </html>
      `;

      const pageHtml = `
        <html data-unify="valid-layout.html">
          <head><title>Page Title</title></head>
          <body>
            <div class="unify-content">Page content</div>
          </body>
        </html>
      `;

      // Act: Process page with nested missing layout
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Should fallback gracefully at the missing level
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page content');
      // Should still apply valid-layout.html but fallback on missing-nested.html
      expect(result.html).toContain('<title>Page Title</title>');
    });
  });

  describe('Different Missing File Scenarios', () => {
    test('should_handle_unreadable_layout_file_gracefully', async () => {
      // Arrange: Simulate file exists but is unreadable (null/undefined content)
      mockFileSystem['unreadable-layout.html'] = null;

      const pageHtml = `
        <html data-unify="unreadable-layout.html">
          <head><title>Page</title></head>
          <body><main>Content</main></body>
        </html>
      `;

      // Act: Process with unreadable layout
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Should fallback gracefully
      expect(result.success).toBe(true);
      expect(result.html).not.toContain('data-unify');
    });

    test('should_handle_empty_layout_file_gracefully', async () => {
      // Arrange: Layout file exists but is empty
      mockFileSystem['empty-layout.html'] = '';

      const pageHtml = `
        <html data-unify="empty-layout.html">
          <head><title>Page</title></head>
          <body><main>Content</main></body>
        </html>
      `;

      // Act: Process with empty layout
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Should handle empty layout appropriately
      expect(result.success).toBe(true);
      // Empty layout should be processed (this is valid, not an error)
      expect(result.html).toBeDefined();
    });

    test('should_maintain_processing_performance_with_missing_files', async () => {
      // Arrange: Multiple pages with missing layouts
      const pageTemplate = `
        <html data-unify="missing-{index}.html">
          <head><title>Page {index}</title></head>
          <body><main>Content {index}</main></body>
        </html>
      `;

      const startTime = Date.now();

      // Act: Process multiple pages with missing layouts
      const promises = [];
      for (let i = 1; i <= 10; i++) {
        const pageHtml = pageTemplate.replace(/{index}/g, i);
        promises.push(processor.processFile(`page${i}.html`, pageHtml, mockFileSystem, '/test', {}));
      }

      const results = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      // Assert: Should complete quickly despite missing files
      expect(elapsed).toBeLessThan(1000); // Should be fast even with 10 missing files
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('Error Recovery and Build Continuity', () => {
    test('should_continue_build_after_missing_layout_encountered', async () => {
      // Arrange: First page with missing layout, second with valid layout
      mockFileSystem['valid-layout.html'] = `
        <html>
          <head><title>Valid Layout</title></head>
          <body>
            <div class="unify-content">Layout content</div>
          </body>
        </html>
      `;

      const page1Html = `
        <html data-unify="missing-layout.html">
          <head><title>Page 1</title></head>
          <body><div class="unify-content">Page 1 content</div></body>
        </html>
      `;

      const page2Html = `
        <html data-unify="valid-layout.html">
          <head><title>Page 2</title></head>
          <body><div class="unify-content">Page 2 content</div></body>
        </html>
      `;

      // Act: Process both pages
      const result1 = await processor.processFile('page1.html', page1Html, mockFileSystem, '/test', {});
      const result2 = await processor.processFile('page2.html', page2Html, mockFileSystem, '/test', {});

      // Assert: Both should succeed, first falls back, second processes normally
      expect(result1.success).toBe(true);
      expect(result1.html).not.toContain('data-unify'); // Fallback removes data-unify
      expect(result2.success).toBe(true);
      expect(result2.html).toContain('Page 2 content'); // Processed with layout
    });

    test('should_reset_processing_state_after_missing_file_error', async () => {
      // Arrange: Process page with missing layout
      const pageWithMissingLayout = `
        <html data-unify="missing.html">
          <head><title>Missing Layout Page</title></head>
          <body><main>Content</main></body>
        </html>
      `;

      // Act: Process and then check processor state
      await processor.processFile('page1.html', pageWithMissingLayout, mockFileSystem, '/test', {});

      // Process another valid page without layout
      const simplePageHtml = `
        <html>
          <head><title>Simple Page</title></head>
          <body><main>Simple content</main></body>
        </html>
      `;

      const result = await processor.processFile('page2.html', simplePageHtml, mockFileSystem, '/test', {});

      // Assert: Processing state should be clean
      expect(result.success).toBe(true);
      expect(result.html).toContain('Simple content');
      // Processing stack should be empty
      expect(processor.processingStack.size).toBe(0);
    });
  });

  describe('Integration with Existing Features', () => {
    test('should_integrate_missing_file_handling_with_circular_detection', async () => {
      // Arrange: Create circular layout reference with one missing file
      mockFileSystem['layout-a.html'] = `
        <html data-unify="missing-layout-b.html">
          <head><title>Layout A</title></head>
          <body><main class="unify-content">Layout A</main></body>
        </html>
      `;

      const pageHtml = `
        <html data-unify="layout-a.html">
          <head><title>Page</title></head>
          <body><main class="unify-content">Page content</main></body>
        </html>
      `;

      // Act: Process page (layout-a exists, but layout-b is missing)
      const result = await processor.processFile('page.html', pageHtml, mockFileSystem, '/test', {});

      // Assert: Should handle missing file gracefully without circular detection issues
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page content');
    });

    test('should_integrate_missing_file_stats_with_cache_stats', async () => {
      // Arrange: Mix of missing and existing layouts
      mockFileSystem['existing-layout.html'] = `
        <html>
          <head><title>Existing</title></head>
          <body><div class="unify-content">Content</div></body>
        </html>
      `;

      const pageWithExisting = `
        <html data-unify="existing-layout.html">
          <head><title>Page 1</title></head>
          <body><div class="unify-content">Page 1</div></body>
        </html>
      `;

      const pageWithMissing = `
        <html data-unify="missing-layout.html">
          <head><title>Page 2</title></head>
          <body><div class="unify-content">Page 2</div></body>
        </html>
      `;

      // Act: Process both pages
      await processor.processFile('page1.html', pageWithExisting, mockFileSystem, '/test', {});
      await processor.processFile('page2.html', pageWithMissing, mockFileSystem, '/test', {});

      // Assert: Stats should reflect both cache operations and missing files
      const stats = processor.getCacheStats();
      expect(stats.layoutCacheMisses).toBeGreaterThan(0); // Existing layout cached
      expect(stats.layoutMissing).toBeGreaterThan(0); // Missing layout tracked
    });
  });
});

/**
 * This test file implements TDD methodology for ISSUE-002:
 * 1. RED: These tests will fail because missing file handling throws FileSystemError
 * 2. GREEN: Implementation must handle missing files gracefully with fallback
 * 3. REFACTOR: Code can be improved while keeping tests green
 * 
 * Coverage requirement: This file must cover line 227 and graceful fallback paths
 * Integration requirement: Must work with existing circular detection and caching
 */