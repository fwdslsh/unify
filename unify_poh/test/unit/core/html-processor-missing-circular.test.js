import { describe, test, expect, beforeEach } from 'bun:test';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('HtmlProcessor - Missing Files with Circular References', () => {
  let processor;
  let pathValidator;
  let mockFileSystem;

  beforeEach(() => {
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
    mockFileSystem = {};
  });

  describe('Circular Reference Detection with Missing Files', () => {
    test('should_handle_circular_reference_when_some_files_missing', async () => {
      // Arrange: A → B (missing) → C, where A exists but B is missing
      mockFileSystem['layoutA.html'] = `
        <html data-unify="layoutB.html">
          <head><title>Layout A</title></head>
          <body>
            <main class="unify-content">Layout A content</main>
          </body>
        </html>
      `;
      
      // layoutB.html is intentionally missing
      // layoutC.html also missing
      
      const pageHtml = `
        <html data-unify="layoutA.html">
          <head><title>Page Title</title></head>
          <body>
            <main class="unify-content">Page content</main>
          </body>
        </html>
      `;

      // Act: This should not infinite loop
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Should succeed with graceful fallback
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page content');
    });

    test('should_handle_missing_files_in_complex_chain', async () => {
      // Arrange: Complex chain with missing files
      // Page → Layout1 → Layout2 (missing) → Layout3 (missing)
      mockFileSystem['layout1.html'] = `
        <html data-unify="layout2.html">
          <head><title>Layout 1</title></head>
          <body>
            <div class="unify-content">Layout 1 content</div>
          </body>
        </html>
      `;
      
      // layout2.html missing - this should cause fallback to layout1 content
      // layout3.html missing - should not be reached

      const pageHtml = `
        <html data-unify="layout1.html">
          <head><title>Page</title></head>
          <body>
            <div class="unify-content">Page content</div>
          </body>
        </html>
      `;

      // Act: Process the chain
      const result = await processor.processFile(
        'page.html', 
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Should succeed with composition up to the missing file
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page content');
    });

    test('should_prevent_infinite_processing_with_missing_file_loops', async () => {
      // Arrange: Simulate scenario that caused the repeated missing file messages
      mockFileSystem['_includes/layouts/root.html'] = `
        <html data-unify="_includes/layouts/site.html">
          <head><title>Root Layout</title></head>
          <body>
            <div class="unify-content">Root content</div>
          </body>
        </html>
      `;
      
      // _includes/layouts/site.html is missing
      // _includes/components/nav.html is missing
      // _includes/post.html is missing

      const pageHtml = `
        <html data-unify="_includes/layouts/root.html">
          <head><title>Test Page</title></head>
          <body>
            <div class="unify-content">Test page content</div>
          </body>
        </html>
      `;

      // Track warnings to ensure no infinite repetition
      const warnings = [];
      const originalWarn = console.warn;
      console.warn = (...args) => warnings.push(args.join(' '));

      try {
        // Act: Process with missing file chain
        const startTime = Date.now();
        const result = await processor.processFile(
          'page.html',
          pageHtml,
          mockFileSystem,
          '/test',
          {}
        );
        const elapsed = Date.now() - startTime;

        // Assert: Should complete quickly without infinite loops
        expect(result.success).toBe(true);
        expect(elapsed).toBeLessThan(1000); // Should not take more than 1 second
        
        // Should only have one warning per unique missing file
        const uniqueWarnings = new Set(warnings);
        expect(uniqueWarnings.size).toBeLessThanOrEqual(4); // Max 4 unique missing files
        
        // Verify no repetitive processing
        const siteLayoutWarnings = warnings.filter(w => w.includes('_includes/layouts/site.html'));
        expect(siteLayoutWarnings.length).toBeLessThanOrEqual(1); // Should not repeat
        
      } finally {
        console.warn = originalWarn;
      }
    });

    test('should_clean_processing_stack_when_missing_file_encountered', async () => {
      // Arrange: Chain with missing file in middle
      mockFileSystem['valid-layout.html'] = `
        <html data-unify="missing-layout.html">
          <head><title>Valid Layout</title></head>
          <body>
            <div class="unify-content">Valid layout content</div>
          </body>
        </html>
      `;
      
      // missing-layout.html is intentionally missing

      const pageHtml = `
        <html data-unify="valid-layout.html">
          <head><title>Page</title></head>
          <body>
            <div class="unify-content">Page content</div>
          </body>
        </html>
      `;

      // Act: Process with missing file in chain
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Processing stack should be clean after missing file
      expect(result.success).toBe(true);
      expect(processor.processingStack.size).toBe(0);
      
      // Should be able to process another file without issues
      const simplePageHtml = `
        <html>
          <head><title>Simple Page</title></head>
          <body><main>Simple content</main></body>
        </html>
      `;
      
      const result2 = await processor.processFile(
        'simple.html',
        simplePageHtml,
        mockFileSystem,
        '/test',
        {}
      );
      
      expect(result2.success).toBe(true);
    });

    test('should_track_statistics_correctly_with_missing_files_in_chains', async () => {
      // Arrange: Multiple chains with missing files
      mockFileSystem['chain1-layout.html'] = `
        <html data-unify="missing-chain1.html">
          <head><title>Chain 1</title></head>
          <body><div class="unify-content">Chain 1</div></body>
        </html>
      `;

      mockFileSystem['chain2-layout.html'] = `
        <html data-unify="missing-chain2.html">
          <head><title>Chain 2</title></head>
          <body><div class="unify-content">Chain 2</div></body>
        </html>
      `;

      const page1Html = `
        <html data-unify="chain1-layout.html">
          <head><title>Page 1</title></head>
          <body><div class="unify-content">Page 1</div></body>
        </html>
      `;

      const page2Html = `
        <html data-unify="chain2-layout.html">
          <head><title>Page 2</title></head>
          <body><div class="unify-content">Page 2</div></body>
        </html>
      `;

      // Get initial stats
      const initialStats = processor.getCacheStats();
      const initialMissing = initialStats.layoutMissing || 0;

      // Act: Process both chains
      await processor.processFile('page1.html', page1Html, mockFileSystem, '/test', {});
      await processor.processFile('page2.html', page2Html, mockFileSystem, '/test', {});

      // Assert: Should track missing files correctly
      const finalStats = processor.getCacheStats();
      expect(finalStats.layoutMissing).toBe(initialMissing + 2); // Two missing files encountered
      expect(finalStats.layoutCacheMisses).toBeGreaterThan(0); // Valid layouts were cached
    });
  });

  describe('Edge Cases with Missing Files', () => {
    test('should_handle_immediate_missing_layout', async () => {
      // Arrange: Page directly references missing layout
      const pageHtml = `
        <html data-unify="immediately-missing.html">
          <head><title>Page</title></head>
          <body><div class="unify-content">Page content</div></body>
        </html>
      `;

      // Act: Process with immediately missing layout
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Should fallback to original page content
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page content');
      expect(result.html).not.toContain('data-unify'); // Should be cleaned
    });

    test('should_handle_mixed_valid_and_missing_in_parallel_processing', async () => {
      // Arrange: Some files exist, some don't
      mockFileSystem['valid.html'] = `
        <html>
          <head><title>Valid</title></head>
          <body><div class="unify-content">Valid</div></body>
        </html>
      `;

      const validPageHtml = `
        <html data-unify="valid.html">
          <head><title>Valid Page</title></head>
          <body><div class="unify-content">Valid page</div></body>
        </html>
      `;

      const missingPageHtml = `
        <html data-unify="missing.html">
          <head><title>Missing Page</title></head>
          <body><div class="unify-content">Missing page</div></body>
        </html>
      `;

      // Act: Process both in parallel
      const [validResult, missingResult] = await Promise.all([
        processor.processFile('valid-page.html', validPageHtml, mockFileSystem, '/test', {}),
        processor.processFile('missing-page.html', missingPageHtml, mockFileSystem, '/test', {})
      ]);

      // Assert: Both should succeed, different processing paths
      expect(validResult.success).toBe(true);
      expect(missingResult.success).toBe(true);
      expect(validResult.html).toContain('Valid page'); // Processed with layout
      expect(missingResult.html).toContain('Missing page'); // Fallback content
    });
  });
});

/**
 * This test file investigates and resolves circular reference issues
 * when layout files are missing from the filesystem.
 * 
 * The problem: Missing file fallback may not properly clean processing stack,
 * leading to repeated processing attempts and warning messages.
 */