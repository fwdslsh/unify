/**
 * HTML File Processor Tests (US-007)
 * Integrates all DOM Cascade components for complete HTML processing
 * 
 * Acceptance Criteria from US-007:
 * - GIVEN HTML files with data-unify attributes and areas
 * - WHEN processing through DOM Cascade pipeline
 * - THEN all composition rules should be applied correctly
 * - AND area matching should work with fallbacks
 * - AND attribute merging should follow page-wins policy
 * - AND head elements should be merged and deduplicated
 * - AND security validation should prevent path traversal
 * - AND processed output should be valid HTML
 */

import { describe, it, expect } from "bun:test";
import { HtmlProcessor } from "../../../src/core/html-processor.js";
import { PathValidator } from "../../../src/core/path-validator.js";

describe("HTML File Processor (US-007)", () => {
  function setup() {
    const pathValidator = new PathValidator();
    return {
      processor: new HtmlProcessor(pathValidator),
      pathValidator
    };
  }

  describe("Basic HTML processing", () => {
    it("should process HTML with area matching", async () => {
      const { processor } = setup();
      
      const layoutHtml = `
        <html>
          <head><title>Layout</title></head>
          <body>
            <div class="unify-content">Default content</div>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <head><title>Page</title></head>
          <body>
            <div class="unify-content">Page content</div>
          </body>
        </html>
      `;
      
      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };
      
      const result = await processor.processFile('page.html', pageHtml, mockFiles);
      
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page content');
      expect(result.html).toContain('<title>Page</title>');
    });

    it("should integrate head merging with composition", async () => {
      const { processor } = setup();
      
      const layoutHtml = `
        <html>
          <head>
            <title>Layout Title</title>
            <meta name="description" content="Layout description">
            <link rel="stylesheet" href="/layout.css">
          </head>
          <body>
            <div class="unify-content">Layout content</div>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <head>
            <title>Page Title</title>
            <meta name="author" content="Page author">
            <link rel="stylesheet" href="/page.css">
          </head>
          <body>
            <div class="unify-content">Page content</div>
          </body>
        </html>
      `;
      
      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };
      
      const result = await processor.processFile('page.html', pageHtml, mockFiles);
      
      expect(result.success).toBe(true);
      expect(result.html).toContain('<title>Page Title</title>'); // Page wins
      expect(result.html).toContain('name="description"'); // Layout meta preserved
      expect(result.html).toContain('name="author"'); // Page meta added
      expect(result.html).toContain('/layout.css'); // Layout CSS
      expect(result.html).toContain('/page.css'); // Page CSS
    });

    it("should apply attribute merging during composition", async () => {
      const { processor } = setup();
      
      const layoutHtml = `
        <html>
          <body>
            <div id="stable" class="layout unify-content" data-layout="value">
              Default content
            </div>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <body>
            <div class="page unify-content" data-page="value">
              Page content
            </div>
          </body>
        </html>
      `;
      
      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };
      
      const result = await processor.processFile('page.html', pageHtml, mockFiles);
      
      expect(result.success).toBe(true);
      expect(result.html).toContain('id="stable"'); // ID preserved
      expect(result.html).toContain('class="layout unify-content page"'); // Classes merged
      expect(result.html).toContain('data-layout="value"'); // Layout data preserved
      expect(result.html).toContain('data-page="value"'); // Page data added
    });
  });

  describe("Security integration", () => {
    it("should enforce path validation for data-unify imports", async () => {
      const { processor } = setup();
      
      const pageHtml = `
        <html data-unify="../../../etc/passwd">
          <body>Malicious content</body>
        </html>
      `;
      
      const result = await processor.processFile('page.html', pageHtml, {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Path traversal');
      expect(result.exitCode).toBe(2);
    });

    it("should validate all file paths in composition chain", async () => {
      const { processor } = setup();
      
      const layoutHtml = `
        <html data-unify="../dangerous.html">
          <body>Layout with dangerous import</body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <body>Page content</body>
        </html>
      `;
      
      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };
      
      const result = await processor.processFile('page.html', pageHtml, mockFiles);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Path traversal');
    });
  });

  describe("Fallback matching integration", () => {
    it("should apply landmark fallback when no area classes", async () => {
      const { processor } = setup();
      
      const layoutHtml = `
        <html>
          <body>
            <header>Default header</header>
            <main>Default main</main>
            <footer>Default footer</footer>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <body>
            <header>Page header</header>
            <main>Page main</main>
            <footer>Page footer</footer>
          </body>
        </html>
      `;
      
      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };
      
      const result = await processor.processFile('page.html', pageHtml, mockFiles);
      
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page header');
      expect(result.html).toContain('Page main');
      expect(result.html).toContain('Page footer');
    });

    it("should prefer area classes over landmark matching", async () => {
      const { processor } = setup();
      
      const layoutHtml = `
        <html>
          <body>
            <header class="unify-header">Default header</header>
            <nav>Default nav</nav>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <body>
            <div class="unify-header">Page header via class</div>
            <nav>Page nav via landmark</nav>
          </body>
        </html>
      `;
      
      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };
      
      const result = await processor.processFile('page.html', pageHtml, mockFiles);
      
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page header via class');
      expect(result.html).toContain('Page nav via landmark');
    });
  });

  describe("Error handling and edge cases", () => {
    it("should handle missing layout files gracefully", async () => {
      const { processor } = setup();
      
      const pageHtml = `
        <html data-unify="missing.html">
          <body>Page content</body>
        </html>
      `;
      
      const result = await processor.processFile('page.html', pageHtml, {});
      
      expect(result.success).toBe(true); // Should succeed with graceful fallback
      expect(result.html).toContain('Page content');
      expect(result.html).not.toContain('data-unify'); // data-unify should be removed
    });

    it("should handle malformed HTML gracefully", async () => {
      const { processor } = setup();
      
      const malformedHtml = '<div><span>unclosed tags';
      
      const result = await processor.processFile('page.html', malformedHtml, {});
      
      expect(result.success).toBe(true); // Should still process
      expect(result.html).toBeDefined();
    });

    it("should validate circular imports", async () => {
      const { processor } = setup();
      
      const layoutHtml = `
        <html data-unify="page.html">
          <body>Layout</body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <body>Page</body>
        </html>
      `;
      
      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };
      
      const result = await processor.processFile('page.html', pageHtml, mockFiles);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Circular');
    });
  });

  describe("Performance and optimization", () => {
    it("should process files efficiently", async () => {
      const { processor } = setup();
      
      const startTime = Date.now();
      
      const result = await processor.processFile('page.html', '<html><body>Simple</body></html>', {});
      
      const elapsed = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(100); // Should be fast
    });

    it("should cache processed layouts to avoid reprocessing", async () => {
      const { processor } = setup();
      
      const layoutHtml = '<html><body><div class="unify-content">Layout</div></body></html>';
      const pageHtml1 = '<html data-unify="layout.html"><body><div class="unify-content">Page 1</div></body></html>';
      const pageHtml2 = '<html data-unify="layout.html"><body><div class="unify-content">Page 2</div></body></html>';
      
      const mockFiles = {
        'layout.html': layoutHtml,
        'page1.html': pageHtml1,
        'page2.html': pageHtml2
      };
      
      const result1 = await processor.processFile('page1.html', pageHtml1, mockFiles);
      const result2 = await processor.processFile('page2.html', pageHtml2, mockFiles);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(processor.getCacheStats().layoutCacheHits).toBeGreaterThan(0);
    });
  });

  describe("Data attribute removal", () => {
    it("should remove data-unify attributes from final output", async () => {
      const { processor } = setup();
      
      const layoutHtml = `
        <html>
          <body>
            <div class="unify-content" data-layout="preserve">Content</div>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <body>
            <div class="unify-content" data-page="preserve">Page content</div>
          </body>
        </html>
      `;
      
      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };
      
      const result = await processor.processFile('page.html', pageHtml, mockFiles);
      
      expect(result.success).toBe(true);
      expect(result.html).not.toContain('data-unify'); // Should be removed
      expect(result.html).toContain('data-layout="preserve"'); // Other data preserved
      expect(result.html).toContain('data-page="preserve"'); // Other data preserved
    });
  });
});

/**
 * This test file implements TDD methodology for US-007:
 * 1. RED: These tests will fail because HtmlProcessor doesn't exist yet
 * 2. GREEN: Implementation must be written to make these tests pass
 * 3. REFACTOR: Code can be improved while keeping tests green
 * 
 * Coverage requirement: This file must achieve ≥90% coverage of html-processor.js
 * Integration requirement: Must use all DOM Cascade components together
 */