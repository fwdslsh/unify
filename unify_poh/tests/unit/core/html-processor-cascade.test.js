/**
 * HTML Processor DOM Cascade Unit Tests
 * Tests specific DOM Cascade composition functionality with granular test cases
 * 
 * These tests target the core DOM Cascade composition logic with minimal setup
 * to isolate specific behaviors and edge cases that may not be covered by
 * integration tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { HtmlProcessor } from "../../../src/core/html-processor.js";
import { PathValidator } from "../../../src/core/path-validator.js";
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';

describe("HTML Processor DOM Cascade Unit Tests", () => {
  let processor;
  let pathValidator;
  let testDir;
  let sourceRoot;

  beforeEach(() => {
    // Create proper test directory structure
    testDir = mkdtempSync(join(tmpdir(), 'html-processor-cascade-test-'));
    sourceRoot = join(testDir, 'src');
    mkdirSync(sourceRoot, { recursive: true });
    
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
  });

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Data-unify attribute extraction and removal", () => {
    it("should_extract_data_unify_attribute_correctly", () => {
      const htmlWithDataUnify = '<html data-unify="layout.html"><body>Content</body></html>';
      const extracted = processor._extractDataUnifyAttribute(htmlWithDataUnify);
      expect(extracted).toBe('layout.html');
    });

    it("should_extract_data_unify_with_single_quotes", () => {
      const htmlWithDataUnify = "<html data-unify='layout.html'><body>Content</body></html>";
      const extracted = processor._extractDataUnifyAttribute(htmlWithDataUnify);
      expect(extracted).toBe('layout.html');
    });

    it("should_return_null_when_no_data_unify_attribute", () => {
      const htmlWithoutDataUnify = '<html><body>Content</body></html>';
      const extracted = processor._extractDataUnifyAttribute(htmlWithoutDataUnify);
      expect(extracted).toBeNull();
    });

    it("should_remove_all_data_unify_attributes_completely", () => {
      const htmlWithMultipleDataUnify = `
        <html data-unify="layout.html">
          <body>
            <div data-unify="header.html">Header</div>
            <main data-unify='content.html'>Content</main>
            <footer data-unify="_includes/footer.html">Footer</footer>
          </body>
        </html>
      `;
      
      const cleaned = processor._removeDataUnifyAttributes(htmlWithMultipleDataUnify);
      
      // Should not contain any data-unify attributes
      expect(cleaned).not.toContain('data-unify="layout.html"');
      expect(cleaned).not.toContain('data-unify="header.html"');
      expect(cleaned).not.toContain("data-unify='content.html'");
      expect(cleaned).not.toContain('data-unify="_includes/footer.html"');
      
      // Should not contain any data-unify at all
      expect(cleaned).not.toMatch(/data-unify\s*=/);
    });

    it("should_preserve_other_data_attributes_when_removing_data_unify", () => {
      const htmlWithMixedDataAttrs = `
        <div data-unify="component.html" data-test="keep" data-custom="preserve">
          <span data-unify="inner.html" data-value="123">Content</span>
        </div>
      `;
      
      const cleaned = processor._removeDataUnifyAttributes(htmlWithMixedDataAttrs);
      
      // Should remove data-unify but keep others
      expect(cleaned).not.toContain('data-unify');
      expect(cleaned).toContain('data-test="keep"');
      expect(cleaned).toContain('data-custom="preserve"');
      expect(cleaned).toContain('data-value="123"');
    });

    it("should_handle_data_unify_with_spaces_and_edge_cases", () => {
      const htmlWithSpacedAttrs = `
        <div data-unify = "spaced.html" >
        <div data-unify  ="no-space.html">
        <div data-unify= "mixed.html" >
      `;
      
      const cleaned = processor._removeDataUnifyAttributes(htmlWithSpacedAttrs);
      expect(cleaned).not.toMatch(/data-unify\s*=/);
    });
  });

  describe("Area class matching logic", () => {
    it("should_match_simple_unify_classes", async () => {
      const layoutHtml = `
        <html>
          <body>
            <div class="unify-content">Layout content</div>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="_layout.html">
          <body>
            <div class="unify-content">Page content</div>
          </body>
        </html>
      `;
      
      // Write test files to proper directory structure with underscore prefix (valid pattern)
      const layoutPath = join(sourceRoot, '_layout.html');
      const pagePath = join(sourceRoot, 'page.html');
      writeFileSync(layoutPath, layoutHtml);
      writeFileSync(pagePath, pageHtml);
      
      const mockFiles = { '_layout.html': layoutHtml };
      const result = await processor.processFile('page.html', pageHtml, mockFiles, sourceRoot);
      
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page content');
      expect(result.html).not.toContain('Layout content');
    });

    it("should_match_unify_classes_with_additional_classes", async () => {
      const layoutHtml = `
        <html>
          <body>
            <div class="container unify-hero primary">Layout hero</div>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <body>
            <div class="custom unify-hero section">Page hero</div>
          </body>
        </html>
      `;
      
      const mockFiles = { 'layout.html': layoutHtml };
      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');
      
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page hero');
      expect(result.html).not.toContain('Layout hero');
      
      // Should preserve class merging
      expect(result.html).toContain('container unify-hero primary custom section');
    });

    it("should_handle_multiple_unify_areas_in_same_document", async () => {
      const layoutHtml = `
        <html>
          <body>
            <header class="unify-header">Layout header</header>
            <main class="unify-content">Layout content</main>
            <footer class="unify-footer">Layout footer</footer>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <body>
            <header class="unify-header">Page header</header>
            <main class="unify-content">Page content</main>
            <footer class="unify-footer">Page footer</footer>
          </body>
        </html>
      `;
      
      const mockFiles = { 'layout.html': layoutHtml };
      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');
      
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page header');
      expect(result.html).toContain('Page content');
      expect(result.html).toContain('Page footer');
      expect(result.html).not.toContain('Layout header');
      expect(result.html).not.toContain('Layout content');
      expect(result.html).not.toContain('Layout footer');
    });

    it("should_handle_different_tag_names_with_same_unify_class", async () => {
      const layoutHtml = `
        <html>
          <body>
            <div class="unify-hero">Layout div hero</div>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <body>
            <section class="unify-hero">Page section hero</section>
          </body>
        </html>
      `;
      
      const mockFiles = { 'layout.html': layoutHtml };
      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');
      
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page section hero');
      expect(result.html).not.toContain('Layout div hero');
    });

    it("should_handle_no_matching_unify_areas_gracefully", async () => {
      const layoutHtml = `
        <html>
          <body>
            <div class="unify-header">Layout header</div>
            <div class="unify-content">Layout content</div>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <body>
            <div class="unify-sidebar">Page sidebar</div>
            <div class="unify-footer">Page footer</div>
          </body>
        </html>
      `;
      
      const mockFiles = { 'layout.html': layoutHtml };
      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');
      
      expect(result.success).toBe(true);
      // Should still include layout content for non-matching areas
      expect(result.html).toContain('Layout header');
      expect(result.html).toContain('Layout content');
    });
  });

  describe("Attribute merging functionality", () => {
    it("should_merge_element_attributes_correctly", () => {
      const layoutAttrs = {
        'id': 'stable',
        'class': 'layout base',
        'data-layout': 'value',
        'role': 'layout-role'
      };
      
      const pageAttrs = {
        'class': 'page custom',
        'data-page': 'value',
        'role': 'page-role',
        'aria-label': 'page-label'
      };
      
      const merged = processor._mergeElementAttributes(layoutAttrs, pageAttrs);
      
      expect(merged.id).toBe('stable'); // Layout ID wins
      expect(merged.class).toBe('layout base page custom'); // Classes union
      expect(merged['data-layout']).toBe('value'); // Layout data preserved
      expect(merged['data-page']).toBe('value'); // Page data added
      expect(merged.role).toBe('page-role'); // Page wins for other attributes
      expect(merged['aria-label']).toBe('page-label'); // Page attribute added
    });

    it("should_extract_attributes_from_html_element_string", () => {
      const elementHtml = '<div id="test" class="primary secondary" data-value="123" aria-label="Test Element">';
      const attrs = processor._extractAttributes(elementHtml);
      
      expect(attrs.id).toBe('test');
      expect(attrs.class).toBe('primary secondary');
      expect(attrs['data-value']).toBe('123');
      expect(attrs['aria-label']).toBe('Test Element');
    });

    it("should_handle_empty_or_missing_attributes", () => {
      const layoutAttrs = { 'class': 'layout' };
      const pageAttrs = { 'class': 'page', 'id': 'page-id' };
      
      const merged = processor._mergeElementAttributes(layoutAttrs, pageAttrs);
      
      expect(merged.class).toBe('layout page');
      expect(merged.id).toBe('page-id');
    });
  });

  describe("Landmark fallback behavior", () => {
    it("should_apply_landmark_fallback_when_no_unify_classes", async () => {
      const layoutHtml = `
        <html>
          <body>
            <header>Layout header</header>
            <main>Layout main</main>
            <footer>Layout footer</footer>
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
      
      const mockFiles = { 'layout.html': layoutHtml };
      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');
      
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page header');
      expect(result.html).toContain('Page main');
      expect(result.html).toContain('Page footer');
    });

    it("should_prefer_unify_classes_over_landmark_matching", async () => {
      const layoutHtml = `
        <html>
          <body>
            <header class="unify-header">Layout header with class</header>
            <nav>Layout nav landmark</nav>
            <main>Layout main landmark</main>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html data-unify="layout.html">
          <body>
            <div class="unify-header">Page header div with class</div>
            <nav>Page nav landmark</nav>
            <main>Page main landmark</main>
          </body>
        </html>
      `;
      
      const mockFiles = { 'layout.html': layoutHtml };
      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');
      
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page header div with class'); // Unify class match
      expect(result.html).toContain('Page nav landmark'); // Landmark match
      expect(result.html).toContain('Page main landmark'); // Landmark match
    });
  });

  describe("Validation and error handling", () => {
    it("should_validate_composition_result", () => {
      const validHtml = '<html><head><title>Valid</title></head><body>Content</body></html>';
      const validation = processor.validateComposition(validHtml);
      
      expect(validation.isValid).toBe(true);
      expect(validation.warnings).toHaveLength(0);
      expect(validation.errors).toHaveLength(0);
    });

    it("should_detect_remaining_data_unify_attributes", () => {
      const invalidHtml = '<html data-unify="remaining.html"><body>Content</body></html>';
      const validation = processor.validateComposition(invalidHtml);
      
      expect(validation.warnings).toContain('data-unify attributes found in final output');
    });

    it("should_detect_invalid_html_structure", () => {
      const invalidHtml = '<div>Missing html tags</div>';
      const validation = processor.validateComposition(invalidHtml);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid HTML structure - missing html tags');
    });

    it("should_handle_standalone_html_processing", () => {
      const standaloneHtml = '<html><body>No layout needed</body></html>';
      const result = processor._processStandalone(standaloneHtml);
      
      expect(result).toBe(standaloneHtml); // Should return as-is for simple HTML
    });
  });

  describe("Performance and caching", () => {
    it("should_cache_processed_layouts", async () => {
      const layoutHtml = '<html><body><div class="unify-content">Cached</div></body></html>';
      const pageHtml1 = '<html data-unify="layout.html"><body><div class="unify-content">Page 1</div></body></html>';
      const pageHtml2 = '<html data-unify="layout.html"><body><div class="unify-content">Page 2</div></body></html>';
      
      const mockFiles = {
        'layout.html': layoutHtml,
        'page1.html': pageHtml1,
        'page2.html': pageHtml2
      };
      
      // Process first page (cache miss)
      await processor.processFile('page1.html', pageHtml1, mockFiles, '.');
      const statsAfterFirst = processor.getCacheStats();
      expect(statsAfterFirst.layoutCacheMisses).toBe(1);
      
      // Process second page (cache hit)
      await processor.processFile('page2.html', pageHtml2, mockFiles, '.');
      const statsAfterSecond = processor.getCacheStats();
      expect(statsAfterSecond.layoutCacheHits).toBe(1);
    });

    it("should_clear_cache_when_requested", () => {
      processor.layoutCache.set('test.html', '<html>cached</html>');
      expect(processor.layoutCache.size).toBe(1);
      
      processor.clearCache();
      expect(processor.layoutCache.size).toBe(0);
    });
  });
});

/**
 * These unit tests specifically target the core DOM Cascade functionality
 * with granular test cases. They are designed to:
 * 
 * 1. Test data-unify attribute extraction and removal logic
 * 2. Test area class matching behavior with various scenarios
 * 3. Test attribute merging functionality  
 * 4. Test landmark fallback behavior
 * 5. Test validation and error handling
 * 6. Test performance and caching features
 * 
 * Expected failures (TDD RED phase):
 * - Data-unify attribute removal may not be complete
 * - Area matching may not work correctly in all scenarios
 * - Attribute merging may not follow the specified policy
 * - Validation may not catch all edge cases
 */