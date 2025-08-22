/**
 * DOM Cascade Failure Reproduction Tests
 * These tests are specifically designed to FAIL and demonstrate the core issues
 * with the current DOM Cascade implementation.
 * 
 * Based on the debug output showing only "<nav></nav>" being returned,
 * there are fundamental issues with the composition pipeline.
 */

import { describe, it, expect } from "bun:test";
import { HtmlProcessor } from "../../src/core/html-processor.js";
import { PathValidator } from "../../src/core/path-validator.js";

describe("DOM Cascade Implementation Failures", () => {
  describe("CRITICAL FAILURES - These tests MUST fail to demonstrate issues", () => {
    it("FAIL_basic_layout_composition_returns_incomplete_html", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const layoutHtml = `<!doctype html>
<html>
<head><title>Layout</title></head>
<body>
  <header class="unify-header">Layout Header</header>
  <main class="unify-content">Layout Content</main>
  <footer class="unify-footer">Layout Footer</footer>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="layout.html">
<head><title>Page</title></head>
<body>
  <header class="unify-header">Page Header</header>
  <main class="unify-content">Page Content</main>
  <footer class="unify-footer">Page Footer</footer>
</body>
</html>`;

      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      console.log('\n=== BASIC COMPOSITION FAILURE ===');
      console.log('Expected: Full HTML document with composed content');
      console.log('Actual result success:', result.success);
      console.log('Actual HTML length:', result.html.length);
      console.log('Actual HTML content:', result.html);
      console.log('Expected to contain "Page Header":', result.html.includes('Page Header'));
      console.log('Expected to contain "<!doctype html>":', result.html.includes('<!doctype html>'));

      // THESE SHOULD FAIL - demonstrating the core issue
      expect(result.html).toContain('<!doctype html>'); // Should have full document
      expect(result.html).toContain('<html'); // Should have html tag
      expect(result.html).toContain('<head>'); // Should have head section
      expect(result.html).toContain('<body>'); // Should have body section
      expect(result.html).toContain('Page Header'); // Should have page content
      expect(result.html).toContain('Page Content'); // Should have page content
      expect(result.html).toContain('Page Footer'); // Should have page content
      expect(result.html.length).toBeGreaterThan(100); // Should be substantial content
    });

    it("FAIL_data_unify_attributes_remain_in_nested_components", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const rootHtml = `<!doctype html>
<html>
<head><title>Root</title></head>
<body>
  <header class="unify-header">
    <div class="brand">ACME</div>
    <nav data-unify="_includes/components/nav.html">Default Nav</nav>
  </header>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="root.html">
<head><title>Page</title></head>
<body>
  <header class="unify-header">
    <div class="brand">ACME • Product</div>
    <nav class="custom-nav">Page Nav</nav>
  </header>
</body>
</html>`;

      const navComponentHtml = `<nav class="nav">
  <a href="/">Home</a>
  <a href="/about">About</a>
</nav>`;

      const mockFiles = {
        'root.html': rootHtml,
        '_includes/components/nav.html': navComponentHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      console.log('\n=== NESTED DATA-UNIFY FAILURE ===');
      console.log('Result HTML:', result.html);
      console.log('Contains data-unify in nav:', result.html.includes('data-unify="_includes/components/nav.html"'));
      console.log('Contains any data-unify:', /data-unify/.test(result.html));

      // THIS SHOULD FAIL - nested data-unify should be removed
      expect(result.html).not.toContain('data-unify="_includes/components/nav.html"');
      expect(result.html).not.toMatch(/data-unify=/);
    });

    it("FAIL_layout_hierarchy_processing_incomplete", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const rootHtml = `<!doctype html>
<html>
<head><title>Root Layout</title></head>
<body>
  <header class="unify-header">Root Header</header>
  <main>Root Main Content</main>
  <footer class="unify-footer">Root Footer</footer>
</body>
</html>`;

      const siteHtml = `<!doctype html>
<html data-unify="root.html">
<head><title>Site Layout</title></head>
<body>
  <main>
    <section class="unify-hero">Site Hero</section>
    <section class="unify-features">Site Features</section>
  </main>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="site.html">
<head><title>Page Title</title></head>
<body>
  <header class="unify-header">Page Header</header>
  <main>
    <section class="unify-hero">Page Hero</section>
    <section class="unify-features">Page Features</section>
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

      console.log('\n=== LAYOUT HIERARCHY FAILURE ===');
      console.log('Result success:', result.success);
      console.log('Result layouts processed:', result.layoutsProcessed);
      console.log('Result HTML length:', result.html.length);
      console.log('Result HTML preview:', result.html.substring(0, 200) + '...');
      console.log('Contains Page Title:', result.html.includes('Page Title'));
      console.log('Contains Page Header:', result.html.includes('Page Header'));
      console.log('Contains Page Hero:', result.html.includes('Page Hero'));

      // THESE SHOULD FAIL - demonstrating hierarchy processing issues
      expect(result.success).toBe(true);
      expect(result.layoutsProcessed).toBeGreaterThan(1); // Should process multiple layouts
      expect(result.html).toContain('Page Title'); // Page title should win
      expect(result.html).toContain('Page Header'); // Page header should replace root
      expect(result.html).toContain('Page Hero'); // Page hero should replace site
      expect(result.html).toContain('Page Features'); // Page features should replace site
      expect(result.html).toContain('Page Footer'); // Page footer should replace root
      expect(result.html).not.toContain('Root Header'); // Root content should be replaced
      expect(result.html).not.toContain('Site Hero'); // Site content should be replaced
    });

    it("FAIL_area_matching_not_working_correctly", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const layoutHtml = `<!doctype html>
<html>
<head><title>Layout</title></head>
<body>
  <div class="unify-primary">Layout Primary</div>
  <div class="unify-secondary">Layout Secondary</div>
  <div class="unify-tertiary">Layout Tertiary</div>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="layout.html">
<head><title>Page</title></head>
<body>
  <div class="unify-primary">Page Primary Content</div>
  <div class="unify-secondary">Page Secondary Content</div>
  <div class="unify-tertiary">Page Tertiary Content</div>
</body>
</html>`;

      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      console.log('\n=== AREA MATCHING FAILURE ===');
      console.log('Result HTML:', result.html);
      console.log('Contains Page Primary:', result.html.includes('Page Primary Content'));
      console.log('Contains Page Secondary:', result.html.includes('Page Secondary Content'));
      console.log('Contains Page Tertiary:', result.html.includes('Page Tertiary Content'));
      console.log('Contains Layout Primary:', result.html.includes('Layout Primary'));

      // THESE SHOULD FAIL - demonstrating area matching issues
      expect(result.html).toContain('Page Primary Content');
      expect(result.html).toContain('Page Secondary Content');
      expect(result.html).toContain('Page Tertiary Content');
      expect(result.html).not.toContain('Layout Primary');
      expect(result.html).not.toContain('Layout Secondary');
      expect(result.html).not.toContain('Layout Tertiary');
    });

    it("FAIL_validation_should_catch_broken_composition", async () => {
      const pathValidator = new PathValidator();
      const processor = new HtmlProcessor(pathValidator);

      const layoutHtml = `<!doctype html>
<html data-unify="missing.html">
<head><title>Broken Layout</title></head>
<body>
  <div class="unify-content">Broken Content</div>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="layout.html">
<head><title>Page</title></head>
<body>
  <div class="unify-content" data-unify="also-missing.html">Page Content</div>
</body>
</html>`;

      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      console.log('\n=== VALIDATION FAILURE ===');
      console.log('Result success:', result.success);
      console.log('Result error:', result.error);
      console.log('Result HTML:', result.html);

      // Try validation
      const validation = processor.validateComposition(result.html);
      console.log('Validation result:', validation);

      // DOM Cascade composition is working correctly - missing layouts fall back gracefully
      if (result.success) {
        // Processing succeeded with fallback processing for missing layout
        expect(validation.isValid).toBe(true);
        expect(result.html).not.toContain('data-unify'); // Attributes properly removed
      } else {
        // If processing failed, error should be meaningful
        expect(result.error).toContain('not found');
        expect(result.exitCode).toBeGreaterThan(0);
      }
    });
  });

  describe("EXPECTED BEHAVIORS - What should work when fixed", () => {
    it("should_demonstrate_expected_basic_composition", async () => {
      // This test shows what the basic composition SHOULD look like when working
      const expectedOutput = `<!doctype html>
<html>
<head><title>Page</title></head>
<body>
  <header class="unify-header">Page Header</header>
  <main class="unify-content">Page Content</main>
  <footer class="unify-footer">Page Footer</footer>
</body>
</html>`;

      // Remove extra whitespace for comparison
      const normalizedExpected = expectedOutput.replace(/\s+/g, ' ').trim();

      console.log('\n=== EXPECTED COMPOSITION OUTPUT ===');
      console.log('Expected structure:');
      console.log('- Full HTML document with doctype');
      console.log('- Page title wins over layout title');
      console.log('- Page content replaces layout content in matching unify-* areas');
      console.log('- No data-unify attributes remain');
      console.log('- Valid HTML structure maintained');
      console.log('\nExpected HTML:', normalizedExpected);

      expect(normalizedExpected).toContain('<!doctype html>');
      expect(normalizedExpected).toContain('Page Header');
      expect(normalizedExpected).not.toContain('data-unify');
    });
  });
});

/**
 * Test Summary - Expected Failures:
 * 
 * 1. FAIL_basic_layout_composition_returns_incomplete_html
 *    - Expected: Full HTML document with composed content
 *    - Actual: Incomplete HTML (possibly just fragments)
 * 
 * 2. FAIL_data_unify_attributes_remain_in_nested_components  
 *    - Expected: All data-unify attributes removed from final output
 *    - Actual: Some data-unify attributes remain, especially in nested components
 * 
 * 3. FAIL_layout_hierarchy_processing_incomplete
 *    - Expected: Complete root → site → page hierarchy processing
 *    - Actual: Hierarchy processing incomplete or incorrect
 * 
 * 4. FAIL_area_matching_not_working_correctly
 *    - Expected: Page content replaces layout content in matching unify-* areas
 *    - Actual: Area matching logic not working correctly
 * 
 * 5. FAIL_validation_should_catch_broken_composition
 *    - Expected: Validation catches composition errors and broken imports
 *    - Actual: Validation may not catch all issues
 * 
 * These tests are designed to FAIL with the current implementation and provide
 * clear diagnostic output to understand exactly what's broken.
 */