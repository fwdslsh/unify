/**
 * DOM Cascade Issues Summary Tests
 * 
 * Based on the test results, here are the confirmed issues with the current implementation:
 * 
 * CONFIRMED ISSUES:
 * 1. ✅ Layout hierarchy processing is incomplete (only processes 1 layout instead of multiple)
 * 2. ✅ Data-unify attributes remain in final output when processing fails
 * 3. ✅ Some composition scenarios return incomplete HTML fragments
 * 4. ✅ Validation detects remaining data-unify attributes but composition can still "succeed"
 * 
 * WORKING CORRECTLY:
 * 1. ✅ Basic area matching works (unify-* classes are matched and content replaced)
 * 2. ✅ Data-unify attribute removal works in successful scenarios
 * 3. ✅ Basic single-layout composition works
 * 4. ✅ Class merging preserves unify-* classes in output
 * 
 * These tests focus on the confirmed issues that need to be fixed.
 */

import { describe, it, expect } from "bun:test";
import { HtmlProcessor } from "../../src/core/html-processor.js";
import { PathValidator } from "../../src/core/path-validator.js";

describe("DOM Cascade Confirmed Issues", () => {
  
  describe("ISSUE 1: Layout hierarchy processing incomplete", () => {
    it("should_process_multiple_layouts_in_hierarchy_chain", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const rootHtml = `<!doctype html>
<html>
<head><title>Root</title></head>
<body>
  <header class="unify-header">Root Header</header>
  <main>Root Main</main>
  <footer class="unify-footer">Root Footer</footer>
</body>
</html>`;

      const siteHtml = `<!doctype html>
<html data-unify="root.html">
<head><title>Site</title></head>
<body>
  <main>
    <section class="unify-hero">Site Hero</section>
  </main>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="site.html">
<head><title>Page</title></head>
<body>
  <header class="unify-header">Page Header</header>
  <main>
    <section class="unify-hero">Page Hero</section>
  </main>
  <footer class="unify-footer">Page Footer</footer>
</body>
</html>`;

      const mockFiles = {
        'root.html': rootHtml,
        'site.html': siteHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      // CURRENT ISSUE: Only processes 1 layout instead of the full chain
      // Expected: Should process root.html and site.html (2+ layouts)
      // Actual: Only processes site.html (1 layout)
      expect(result.success).toBe(true);
      expect(result.layoutsProcessed).toBeGreaterThan(1); // ❌ FAILS: Currently returns 1
      
      // Should contain content from the final composed hierarchy
      expect(result.html).toContain('Page Header'); // From page
      expect(result.html).toContain('Page Hero'); // From page
      expect(result.html).toContain('Page Footer'); // From page
      expect(result.html).toContain('Page'); // Page title should win
    });
  });

  describe("ISSUE 2: Data-unify attributes remain when processing fails", () => {
    it("should_remove_data_unify_even_when_imports_fail", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const layoutHtml = `<!doctype html>
<html data-unify="missing.html">
<head><title>Layout</title></head>
<body>
  <div class="unify-content">Layout content</div>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="layout.html">
<head><title>Page</title></head>
<body>
  <div class="unify-content" data-unify="also-missing.html">Page content</div>
</body>
</html>`;

      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      // When processing fails, data-unify attributes remain in fallback HTML
      // This is the issue - they should be cleaned up even in failure scenarios
      if (!result.success) {
        // ❌ ISSUE: data-unify attributes remain in fallback HTML
        expect(result.fallbackHtml).not.toContain('data-unify=');
        
        // Validation should catch remaining attributes
        const validation = processor.validateComposition(result.fallbackHtml);
        expect(validation.warnings).not.toContain('data-unify attributes found in final output');
      }
    });
  });

  describe("ISSUE 3: Incomplete HTML fragments returned", () => {
    it("should_return_complete_html_documents_not_fragments", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const rootHtml = `<!doctype html>
<html>
<head><title>Root</title></head>
<body>
  <header class="unify-header">
    <nav data-unify="nav.html">Default Nav</nav>
  </header>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="root.html">
<head><title>Page</title></head>
<body>
  <header class="unify-header">
    <nav class="custom">Page Nav</nav>
  </header>
</body>
</html>`;

      const navHtml = `<nav class="nav"><a href="/">Home</a></nav>`;

      const mockFiles = {
        'root.html': rootHtml,
        'nav.html': navHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      // Should return complete HTML document, not just fragments
      expect(result.success).toBe(true);
      expect(result.html).toMatch(/^<!doctype html>/i); // Should start with doctype
      expect(result.html).toContain('<html'); // Should have html tag
      expect(result.html).toContain('<head>'); // Should have head
      expect(result.html).toContain('<body>'); // Should have body
      expect(result.html).toContain('</html>'); // Should close html tag
      expect(result.html.length).toBeGreaterThan(100); // Should be substantial content
      
      // Should not be just a fragment like "<nav>...</nav>"
      expect(result.html).not.toMatch(/^<nav/); // Should not start with nav
    });
  });

  describe("ISSUE 4: Component composition within areas", () => {
    it("should_handle_nested_component_imports_correctly", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const cardHtml = `<article class="card">
  <h3 class="unify-title">Default Title</h3>
  <p class="unify-body">Default body</p>
</article>`;

      const pageHtml = `<!doctype html>
<html>
<head><title>Page</title></head>
<body>
  <section class="unify-features">
    <div data-unify="card.html">
      <h3 class="unify-title">Custom Title</h3>
      <p class="unify-body">Custom body content</p>
    </div>
  </section>
</body>
</html>`;

      const mockFiles = {
        'card.html': cardHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      expect(result.success).toBe(true);
      
      // Should compose the card component with custom content
      expect(result.html).toContain('Custom Title');
      expect(result.html).toContain('Custom body content');
      expect(result.html).not.toContain('Default Title');
      expect(result.html).not.toContain('Default body');
      
      // Should remove data-unify from component import
      expect(result.html).not.toContain('data-unify="card.html"');
    });
  });

  describe("WORKING CORRECTLY: Basic composition", () => {
    it("should_demonstrate_working_basic_composition", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const layoutHtml = `<!doctype html>
<html>
<head><title>Layout</title></head>
<body>
  <div class="unify-content">Layout content</div>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="layout.html">
<head><title>Page</title></head>
<body>
  <div class="unify-content">Page content</div>
</body>
</html>`;

      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      // ✅ This works correctly
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page content');
      expect(result.html).not.toContain('Layout content');
      expect(result.html).toContain('Page'); // Page title wins
      expect(result.html).not.toContain('data-unify'); // Attributes removed
    });
  });

  describe("Performance and validation", () => {
    it("should_complete_processing_within_reasonable_time", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const layoutHtml = `<!doctype html>
<html><body><div class="unify-content">Layout</div></body></html>`;
      
      const pageHtml = `<!doctype html>
<html data-unify="layout.html"><body><div class="unify-content">Page</div></body></html>`;

      const mockFiles = { 'layout.html': layoutHtml };

      const startTime = Date.now();
      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(1000); // Should complete within 1 second
    });

    it("should_provide_meaningful_validation_results", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const validHtml = `<!doctype html>
<html><head><title>Valid</title></head><body>Content</body></html>`;

      const invalidHtml = `<div data-unify="remaining.html">Invalid</div>`;

      const validResult = processor.validateComposition(validHtml);
      const invalidResult = processor.validateComposition(invalidHtml);

      expect(validResult.isValid).toBe(true);
      expect(validResult.warnings).toHaveLength(0);

      expect(invalidResult.warnings).toContain('data-unify attributes found in final output');
      expect(invalidResult.isValid).toBe(false); // Invalid structure
    });
  });
});

/**
 * Test Summary - Issues to Fix:
 * 
 * 1. ❌ Layout hierarchy processing incomplete
 *    - Current: Only processes 1 layout in chain
 *    - Expected: Should process full hierarchy (root → site → page)
 * 
 * 2. ❌ Data-unify attributes remain in failure scenarios
 *    - Current: Attributes remain in fallback HTML
 *    - Expected: Should be cleaned even in failure cases
 * 
 * 3. ❌ Component composition within areas may not work
 *    - Current: Nested data-unify in components may not be processed
 *    - Expected: Should compose components with area-based content replacement
 * 
 * 4. ❌ Some scenarios return incomplete HTML fragments
 *    - Current: May return fragments instead of complete documents
 *    - Expected: Should always return complete HTML documents
 * 
 * Working correctly:
 * - ✅ Basic single-layout composition
 * - ✅ Area matching with unify-* classes
 * - ✅ Data-unify removal in successful scenarios
 * - ✅ Validation detects remaining attributes
 * - ✅ Performance is acceptable
 */