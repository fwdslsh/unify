/**
 * DOM Cascade Attribute Merging Tests (US-002)
 * Implements page-wins attribute merging per DOM Cascade v1
 * 
 * Acceptance Criteria from US-002:
 * - GIVEN layout element with attributes and page content with attributes
 * - WHEN content is composed using DOM Cascade
 * - THEN page attributes should win over layout attributes (except ID)
 * - AND ID attributes should be preserved from host element for stability
 * - AND class attributes should be merged (union, not replacement)
 * - AND data attributes should follow page-wins rule
 * - AND accessibility attributes should be properly merged
 */

import { describe, it, expect } from "bun:test";
import { AttributeMerger } from "../../../src/core/cascade/attribute-merger.js";
import { DOMParser } from "../../../src/io/dom-parser.js";

describe("DOM Cascade Attribute Merging (US-002)", () => {
  function setup() {
    return {
      merger: new AttributeMerger(),
      parser: new DOMParser()
    };
  }

  describe("Page-wins attribute merging", () => {
    it("should merge attributes with page winning over layout", () => {
      const { merger } = setup();
      
      const layoutElement = {
        tagName: 'div',
        attributes: {
          'data-layout': 'value1',
          'aria-label': 'Layout label',
          'title': 'Layout title'
        }
      };
      
      const pageElement = {
        tagName: 'div',
        attributes: {
          'data-page': 'value2',
          'aria-label': 'Page label',
          'title': 'Page title'
        }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['data-layout']).toBe('value1'); // Layout-only attribute preserved
      expect(result['data-page']).toBe('value2'); // Page-only attribute added
      expect(result['aria-label']).toBe('Page label'); // Page wins on conflict
      expect(result['title']).toBe('Page title'); // Page wins on conflict
    });

    it("should preserve layout attributes when page doesn't override", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: {
          'data-layout-only': 'layout-value',
          'aria-describedby': 'layout-desc',
          'role': 'layout-role'
        }
      };
      
      const pageElement = {
        attributes: {
          'data-page-only': 'page-value'
        }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['data-layout-only']).toBe('layout-value');
      expect(result['aria-describedby']).toBe('layout-desc');
      expect(result['role']).toBe('layout-role');
      expect(result['data-page-only']).toBe('page-value');
    });
  });

  describe("ID attribute stability", () => {
    it("should preserve layout ID when page has no ID", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: { 'id': 'layout-stable-id' }
      };
      
      const pageElement = {
        attributes: { 'class': 'page-class' }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['id']).toBe('layout-stable-id');
      expect(result['class']).toBe('page-class');
    });

    it("should preserve layout ID even when page has ID (stability)", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: { 'id': 'stable-layout-id', 'class': 'layout-class' }
      };
      
      const pageElement = {
        attributes: { 'id': 'page-id', 'class': 'page-class' }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['id']).toBe('stable-layout-id'); // Layout ID preserved
      expect(result['class']).toBe('layout-class page-class'); // Classes merged
    });

    it("should use page ID only if layout has no ID", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: { 'class': 'layout-class' }
      };
      
      const pageElement = {
        attributes: { 'id': 'page-id', 'class': 'page-class' }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['id']).toBe('page-id'); // Page ID used when layout has none
      expect(result['class']).toBe('layout-class page-class'); // Classes merged
    });
  });

  describe("Class attribute merging (union)", () => {
    it("should merge class attributes as union, not replacement", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: { 'class': 'layout-class another-layout' }
      };
      
      const pageElement = {
        attributes: { 'class': 'page-class another-page' }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['class']).toBe('layout-class another-layout page-class another-page');
    });

    it("should deduplicate identical classes", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: { 'class': 'shared-class layout-specific' }
      };
      
      const pageElement = {
        attributes: { 'class': 'shared-class page-specific' }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['class']).toBe('shared-class layout-specific page-specific');
      expect(result['class']).not.toMatch(/shared-class.*shared-class/); // No duplicates
    });

    it("should handle empty or missing class attributes", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: { 'class': 'layout-class' }
      };
      
      const pageElement = {
        attributes: {} // No class attribute
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['class']).toBe('layout-class');
    });

    it("should preserve class order (layout first, page second)", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: { 'class': 'layout-a layout-b' }
      };
      
      const pageElement = {
        attributes: { 'class': 'page-a page-b' }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['class']).toBe('layout-a layout-b page-a page-b');
    });
  });

  describe("Data attribute handling", () => {
    it("should apply page-wins rule to data attributes", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: {
          'data-testid': 'layout-test',
          'data-layout-only': 'layout-value'
        }
      };
      
      const pageElement = {
        attributes: {
          'data-testid': 'page-test',
          'data-page-only': 'page-value'
        }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['data-testid']).toBe('page-test'); // Page wins
      expect(result['data-layout-only']).toBe('layout-value'); // Layout preserved
      expect(result['data-page-only']).toBe('page-value'); // Page added
    });

    it("should remove data-unify attributes from final output", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: { 'data-unify': '/layouts/base.html', 'class': 'layout' }
      };
      
      const pageElement = {
        attributes: { 'data-unify': '/components/card.html', 'class': 'page' }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['data-unify']).toBeUndefined(); // Should be removed
      expect(result['class']).toBe('layout page'); // Other attributes preserved
    });
  });

  describe("Accessibility attribute handling", () => {
    it("should merge ARIA attributes with page-wins policy", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: {
          'aria-label': 'Layout label',
          'aria-describedby': 'layout-desc',
          'aria-expanded': 'false'
        }
      };
      
      const pageElement = {
        attributes: {
          'aria-label': 'Page label',
          'aria-hidden': 'true'
        }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['aria-label']).toBe('Page label'); // Page wins
      expect(result['aria-describedby']).toBe('layout-desc'); // Layout preserved
      expect(result['aria-expanded']).toBe('false'); // Layout preserved
      expect(result['aria-hidden']).toBe('true'); // Page added
    });

    it("should handle role attribute merging", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: { 'role': 'layout-role' }
      };
      
      const pageElement = {
        attributes: { 'role': 'page-role' }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['role']).toBe('page-role'); // Page wins for role
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle elements with no attributes", () => {
      const { merger } = setup();
      
      const layoutElement = { attributes: {} };
      const pageElement = { attributes: {} };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result).toEqual({});
    });

    it("should handle null or undefined attributes gracefully", () => {
      const { merger } = setup();
      
      const layoutElement = { attributes: null };
      const pageElement = { attributes: { 'class': 'page-class' } };
      
      expect(() => merger.mergeAttributes(layoutElement, pageElement)).not.toThrow();
    });

    it("should handle malformed attribute values", () => {
      const { merger } = setup();
      
      const layoutElement = {
        attributes: { 'class': null, 'id': undefined }
      };
      
      const pageElement = {
        attributes: { 'class': 'page-class' }
      };
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['class']).toBe('page-class');
      expect(result['id']).toBeUndefined();
    });
  });

  describe("Integration with area matching", () => {
    it("should merge attributes on matched elements", () => {
      const { merger, parser } = setup();
      
      const layoutHtml = '<div id="stable" class="layout unify-hero" data-layout="value">Layout content</div>';
      const pageHtml = '<div class="page unify-hero" data-page="value">Page content</div>';
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const layoutElement = layoutDoc.getElementsByClassName('unify-hero')[0];
      const pageElement = pageDoc.getElementsByClassName('unify-hero')[0];
      
      const result = merger.mergeAttributes(layoutElement, pageElement);
      
      expect(result['id']).toBe('stable'); // ID preserved
      expect(result['class']).toBe('layout unify-hero page'); // Classes merged (union with deduplication)
      expect(result['data-layout']).toBe('value'); // Layout data preserved
      expect(result['data-page']).toBe('value'); // Page data added
    });
  });
});

/**
 * This test file implements TDD methodology for US-002:
 * 1. RED: These tests will fail because AttributeMerger doesn't exist yet
 * 2. GREEN: Implementation must be written to make these tests pass
 * 3. REFACTOR: Code can be improved while keeping tests green
 * 
 * Coverage requirement: This file must achieve ≥90% coverage of attribute-merger.js
 * Specification compliance: Must implement exact DOM Cascade v1 attribute merging
 */