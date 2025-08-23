import { describe, test, expect, beforeEach } from 'bun:test';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('HtmlProcessor - Recursion Prevention', () => {
  let processor;
  let pathValidator;
  let mockFileSystem;

  beforeEach(() => {
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
    mockFileSystem = {};
  });

  describe('Deep Layout Nesting Beyond Max Depth', () => {
    test('should_fail_at_max_depth_when_deeply_nested_layouts', async () => {
      // Arrange: Create a chain of 12 layouts (exceeding MAX_DEPTH = 10)
      for (let i = 1; i <= 12; i++) {
        const nextLayout = i < 12 ? `layout${i + 1}.html` : null;
        mockFileSystem[`layout${i}.html`] = `
          <html ${nextLayout ? `data-unify="${nextLayout}"` : ''}>
            <head><title>Layout ${i}</title></head>
            <body>
              <main class="unify-content">Layout ${i} content</main>
            </body>
          </html>
        `;
      }

      const pageHtml = `
        <html data-unify="layout1.html">
          <head><title>Page Title</title></head>
          <body>
            <main class="unify-content">Page content</main>
          </body>
        </html>
      `;

      // Act & Assert: Should fail with max depth exceeded error
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Maximum depth|depth exceeded|too deep/i);
      expect(result.exitCode).toBe(1);
    });

    test('should_succeed_at_max_depth_when_exactly_at_limit', async () => {
      // Arrange: Create exactly 10 layouts (at MAX_DEPTH = 10)
      for (let i = 1; i <= 10; i++) {
        const nextLayout = i < 10 ? `layout${i + 1}.html` : null;
        mockFileSystem[`layout${i}.html`] = `
          <html ${nextLayout ? `data-unify="${nextLayout}"` : ''}>
            <head><title>Layout ${i}</title></head>
            <body>
              <main class="unify-content">Layout ${i} content</main>
            </body>
          </html>
        `;
      }

      const pageHtml = `
        <html data-unify="layout1.html">
          <head><title>Page Title</title></head>
          <body>
            <main class="unify-content">Page content</main>
          </body>
        </html>
      `;

      // Act: Should succeed at exactly max depth
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Should succeed
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page content');
    });
  });

  describe('Circular Layout Import Detection', () => {
    test('should_detect_circular_import_when_a_imports_b_imports_a', async () => {
      // Arrange: A → B → A circular dependency
      mockFileSystem['layoutA.html'] = `
        <html data-unify="layoutB.html">
          <head><title>Layout A</title></head>
          <body>
            <main class="unify-content">Layout A content</main>
          </body>
        </html>
      `;

      mockFileSystem['layoutB.html'] = `
        <html data-unify="layoutA.html">
          <head><title>Layout B</title></head>
          <body>
            <main class="unify-content">Layout B content</main>
          </body>
        </html>
      `;

      const pageHtml = `
        <html data-unify="layoutA.html">
          <head><title>Page Title</title></head>
          <body>
            <main class="unify-content">Page content</main>
          </body>
        </html>
      `;

      // Act & Assert: Should detect circular import
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/circular.*import/i);
      expect(result.exitCode).toBe(1);
    });

    test('should_detect_circular_import_when_a_imports_b_imports_c_imports_a', async () => {
      // Arrange: A → B → C → A circular dependency
      mockFileSystem['layoutA.html'] = `
        <html data-unify="layoutB.html">
          <head><title>Layout A</title></head>
          <body>
            <main class="unify-content">Layout A content</main>
          </body>
        </html>
      `;

      mockFileSystem['layoutB.html'] = `
        <html data-unify="layoutC.html">
          <head><title>Layout B</title></head>
          <body>
            <main class="unify-content">Layout B content</main>
          </body>
        </html>
      `;

      mockFileSystem['layoutC.html'] = `
        <html data-unify="layoutA.html">
          <head><title>Layout C</title></head>
          <body>
            <main class="unify-content">Layout C content</main>
          </body>
        </html>
      `;

      const pageHtml = `
        <html data-unify="layoutA.html">
          <head><title>Page Title</title></head>
          <body>
            <main class="unify-content">Page content</main>
          </body>
        </html>
      `;

      // Act & Assert: Should detect circular import
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/circular.*import/i);
      expect(result.exitCode).toBe(1);
    });

    test('should_detect_self_referencing_layout', async () => {
      // Arrange: Layout that imports itself
      mockFileSystem['self-layout.html'] = `
        <html data-unify="self-layout.html">
          <head><title>Self Layout</title></head>
          <body>
            <main class="unify-content">Self layout content</main>
          </body>
        </html>
      `;

      const pageHtml = `
        <html data-unify="self-layout.html">
          <head><title>Page Title</title></head>
          <body>
            <main class="unify-content">Page content</main>
          </body>
        </html>
      `;

      // Act & Assert: Should detect self-reference
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/circular.*import/i);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('Error Messages and Stack Cleanup', () => {
    test('should_provide_clear_error_message_with_circular_path', async () => {
      // Arrange: Simple circular dependency  
      mockFileSystem['layoutA.html'] = `
        <html data-unify="layoutB.html">
          <head><title>Layout A</title></head>
          <body><main class="unify-content">A</main></body>
        </html>
      `;

      mockFileSystem['layoutB.html'] = `
        <html data-unify="layoutA.html">
          <head><title>Layout B</title></head>
          <body><main class="unify-content">B</main></body>
        </html>
      `;

      const pageHtml = `
        <html data-unify="layoutA.html">
          <head><title>Page</title></head>
          <body><main class="unify-content">Page</main></body>
        </html>
      `;

      // Act: Process and expect clear error message
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Error should show the circular path
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/circular.*import/i);
      // Should include file names in the error message
      expect(result.error).toMatch(/layoutA\.html|layoutB\.html/);
      expect(result.exitCode).toBe(1);
    });

    test('should_clean_up_processing_stack_after_error', async () => {
      // Arrange: Create a circular dependency
      mockFileSystem['layout1.html'] = `
        <html data-unify="layout2.html">
          <head><title>Layout 1</title></head>
          <body><main class="unify-content">1</main></body>
        </html>
      `;

      mockFileSystem['layout2.html'] = `
        <html data-unify="layout1.html">
          <head><title>Layout 2</title></head>
          <body><main class="unify-content">2</main></body>
        </html>
      `;

      const pageHtml = `
        <html data-unify="layout1.html">
          <head><title>Page</title></head>
          <body><main class="unify-content">Page</main></body>
        </html>
      `;

      // Act: Process and get error
      const result1 = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Create a valid page without circular dependencies
      const validPageHtml = `
        <html>
          <head><title>Valid Page</title></head>
          <body><main>Valid content</main></body>
        </html>
      `;

      // Act: Process valid page after error
      const result2 = await processor.processFile(
        'valid-page.html',
        validPageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: First should fail, second should succeed (stack cleaned up)
      expect(result1.success).toBe(false);
      expect(result2.success).toBe(true);
    });
  });

  describe('Statistics Tracking', () => {
    test('should_track_circular_imports_prevented_in_stats', async () => {
      // Arrange: Circular dependency
      mockFileSystem['circular1.html'] = `
        <html data-unify="circular2.html">
          <head><title>Circular 1</title></head>
          <body><main class="unify-content">1</main></body>
        </html>
      `;

      mockFileSystem['circular2.html'] = `
        <html data-unify="circular1.html">
          <head><title>Circular 2</title></head>
          <body><main class="unify-content">2</main></body>
        </html>
      `;

      const pageHtml = `
        <html data-unify="circular1.html">
          <head><title>Page</title></head>
          <body><main class="unify-content">Page</main></body>
        </html>
      `;

      // Get initial stats
      const initialStats = processor.getCacheStats();
      const initialCount = initialStats.circularImportsPrevented || 0;

      // Act: Process circular dependency
      await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Stats should increment
      const finalStats = processor.getCacheStats();
      expect(finalStats.circularImportsPrevented).toBe(initialCount + 1);
    });
  });
});