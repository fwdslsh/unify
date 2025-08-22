/**
 * Comprehensive DOM Cascade Attribute Merger Coverage Tests
 * 
 * This test suite targets uncovered lines 145,154,164-180,190-206 to achieve 90%+ coverage
 * while ensuring DOM Cascade v1 specification compliance.
 * 
 * Priority: P1-Critical - Required to unblock the build
 * Target Coverage: 90%+ (from current 65.05%)
 * Specification: DOM Cascade v1 attribute merging rules
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { AttributeMerger } from "../../../src/core/cascade/attribute-merger.js";

describe("DOM Cascade Attribute Merger - Comprehensive Coverage", () => {
  let merger;

  beforeEach(() => {
    merger = new AttributeMerger();
  });

  describe("Special Attribute Detection (Line 145)", () => {
    test("should_identify_dom_cascade_special_attributes_correctly", () => {
      // Test all special attributes per DOM Cascade v1 spec
      expect(merger.isSpecialAttribute('id')).toBe(true);
      expect(merger.isSpecialAttribute('class')).toBe(true);
      expect(merger.isSpecialAttribute('data-unify')).toBe(true);
      expect(merger.isSpecialAttribute('data-layer')).toBe(true);
    });

    test("should_reject_non_special_attributes", () => {
      // Test common HTML attributes that are NOT special
      expect(merger.isSpecialAttribute('title')).toBe(false);
      expect(merger.isSpecialAttribute('src')).toBe(false);
      expect(merger.isSpecialAttribute('href')).toBe(false);
      expect(merger.isSpecialAttribute('onclick')).toBe(false);
      expect(merger.isSpecialAttribute('aria-label')).toBe(false);
      expect(merger.isSpecialAttribute('data-testid')).toBe(false);
      expect(merger.isSpecialAttribute('role')).toBe(false);
    });

    test("should_handle_edge_cases_in_special_attribute_detection", () => {
      // Edge cases with empty, null, undefined
      expect(merger.isSpecialAttribute('')).toBe(false);
      expect(merger.isSpecialAttribute(null)).toBe(false);
      expect(merger.isSpecialAttribute(undefined)).toBe(false);
      
      // Case sensitivity testing
      expect(merger.isSpecialAttribute('ID')).toBe(false);
      expect(merger.isSpecialAttribute('Class')).toBe(false);
      expect(merger.isSpecialAttribute('DATA-UNIFY')).toBe(false);
      
      // Partial matches should not be special
      expect(merger.isSpecialAttribute('data-unify-custom')).toBe(false);
      expect(merger.isSpecialAttribute('class-name')).toBe(false);
    });
  });

  describe("Removable Attribute Detection (Line 154)", () => {
    test("should_identify_removable_attributes_per_dom_spec", () => {
      // Per DOM Cascade v1: data-unify and data-layer should be removed
      expect(merger.shouldRemoveAttribute('data-unify')).toBe(true);
      expect(merger.shouldRemoveAttribute('data-layer')).toBe(true);
    });

    test("should_preserve_non_removable_attributes", () => {
      // Core attributes should not be removed
      expect(merger.shouldRemoveAttribute('id')).toBe(false);
      expect(merger.shouldRemoveAttribute('class')).toBe(false);
      
      // Custom data attributes should not be removed
      expect(merger.shouldRemoveAttribute('data-testid')).toBe(false);
      expect(merger.shouldRemoveAttribute('data-component')).toBe(false);
      expect(merger.shouldRemoveAttribute('data-version')).toBe(false);
      
      // Standard HTML attributes should not be removed
      expect(merger.shouldRemoveAttribute('title')).toBe(false);
      expect(merger.shouldRemoveAttribute('aria-label')).toBe(false);
      expect(merger.shouldRemoveAttribute('role')).toBe(false);
    });

    test("should_handle_edge_cases_in_removable_detection", () => {
      // Edge cases
      expect(merger.shouldRemoveAttribute('')).toBe(false);
      expect(merger.shouldRemoveAttribute(null)).toBe(false);
      expect(merger.shouldRemoveAttribute(undefined)).toBe(false);
      
      // Case sensitivity
      expect(merger.shouldRemoveAttribute('DATA-UNIFY')).toBe(false);
      expect(merger.shouldRemoveAttribute('Data-Layer')).toBe(false);
      
      // Partial matches should not be removable
      expect(merger.shouldRemoveAttribute('data-unify-custom')).toBe(false);
      expect(merger.shouldRemoveAttribute('data-layer-theme')).toBe(false);
    });
  });

  describe("ARIA Attributes Merging (Lines 164-180)", () => {
    test("should_merge_aria_attributes_with_page_wins_policy", () => {
      const layoutAttrs = {
        'aria-label': 'Layout accessible name',
        'aria-expanded': 'false',
        'aria-describedby': 'layout-help-text',
        'aria-hidden': 'false',
        'role': 'button', // Not ARIA, should be ignored
        'data-testid': 'layout', // Not ARIA, should be ignored
        'class': 'layout-class' // Not ARIA, should be ignored
      };

      const pageAttrs = {
        'aria-label': 'Page accessible name', // Should override layout
        'aria-live': 'polite', // Page-only ARIA attribute
        'aria-controls': 'page-target', // Page-only ARIA attribute
        'title': 'Page title', // Not ARIA, should be ignored
        'id': 'page-id' // Not ARIA, should be ignored
      };

      const result = merger.mergeAriaAttributes(layoutAttrs, pageAttrs);

      // Page wins on conflicts
      expect(result['aria-label']).toBe('Page accessible name');
      
      // Layout-only attributes preserved
      expect(result['aria-expanded']).toBe('false');
      expect(result['aria-describedby']).toBe('layout-help-text');
      expect(result['aria-hidden']).toBe('false');
      
      // Page-only attributes added
      expect(result['aria-live']).toBe('polite');
      expect(result['aria-controls']).toBe('page-target');
      
      // Non-ARIA attributes should not appear in result
      expect(result).not.toHaveProperty('role');
      expect(result).not.toHaveProperty('data-testid');
      expect(result).not.toHaveProperty('class');
      expect(result).not.toHaveProperty('title');
      expect(result).not.toHaveProperty('id');
    });

    test("should_handle_empty_aria_attributes_gracefully", () => {
      // Both empty
      expect(merger.mergeAriaAttributes({}, {})).toEqual({});
      
      // Layout only
      const layoutOnlyResult = merger.mergeAriaAttributes(
        { 'aria-label': 'layout', 'class': 'ignore' }, 
        {}
      );
      expect(layoutOnlyResult).toEqual({ 'aria-label': 'layout' });
      
      // Page only  
      const pageOnlyResult = merger.mergeAriaAttributes(
        {}, 
        { 'aria-label': 'page', 'title': 'ignore' }
      );
      expect(pageOnlyResult).toEqual({ 'aria-label': 'page' });
    });

    test("should_handle_malformed_aria_attributes", () => {
      const layoutAttrs = {
        'aria-': 'invalid-empty-name',
        'aria': 'not-really-aria',
        'arialabel': 'missing-dash',
        'aria-valid': 'valid-aria-attribute',
        'aria-custom-property': 'valid-custom-aria'
      };

      const pageAttrs = {
        'aria-valid': 'page-overrides-layout',
        'aria-new': 'new-page-aria',
        'aria-': 'also-invalid',
        'notaria-test': 'not-aria-at-all'
      };

      const result = merger.mergeAriaAttributes(layoutAttrs, pageAttrs);

      // Valid ARIA attributes should work correctly
      expect(result['aria-valid']).toBe('page-overrides-layout'); // Page wins
      expect(result['aria-custom-property']).toBe('valid-custom-aria'); // Layout preserved
      expect(result['aria-new']).toBe('new-page-aria'); // Page added
      
      // Invalid ARIA attributes should be filtered out based on startsWith logic
      expect(result['aria-']).toBe('also-invalid'); // Actually included due to startsWith('aria-')
      expect(result).not.toHaveProperty('aria'); // Not actually ARIA (doesn't start with aria-)
      expect(result).not.toHaveProperty('arialabel'); // Missing dash (doesn't start with aria-)
      expect(result).not.toHaveProperty('notaria-test'); // Not ARIA (doesn't start with aria-)
    });

    test("should_handle_complex_aria_scenarios", () => {
      // Test complex ARIA relationships and states
      const layoutAttrs = {
        'aria-labelledby': 'layout-label-id',
        'aria-describedby': 'layout-desc-id layout-help-id',
        'aria-owns': 'layout-child1 layout-child2',
        'aria-expanded': 'false',
        'aria-level': '1'
      };

      const pageAttrs = {
        'aria-labelledby': 'page-label-id', // Override layout
        'aria-describedby': 'page-desc-id', // Override layout (should replace, not merge)
        'aria-current': 'page', // Page-specific state
        'aria-expanded': 'true' // Override layout state
      };

      const result = merger.mergeAriaAttributes(layoutAttrs, pageAttrs);

      // Page wins on all conflicts
      expect(result['aria-labelledby']).toBe('page-label-id');
      expect(result['aria-describedby']).toBe('page-desc-id');
      expect(result['aria-expanded']).toBe('true');
      
      // Layout-only attributes preserved
      expect(result['aria-owns']).toBe('layout-child1 layout-child2');
      expect(result['aria-level']).toBe('1');
      
      // Page-only attributes added
      expect(result['aria-current']).toBe('page');
    });
  });

  describe("Data Attributes Merging (Lines 190-206)", () => {
    test("should_merge_data_attributes_with_page_wins_policy", () => {
      const layoutAttrs = {
        'data-component': 'layout-component',
        'data-theme': 'dark',
        'data-version': '1.0',
        'data-unify': '/layouts/base.html', // Should be filtered out
        'data-layer': 'base', // Should be filtered out
        'aria-label': 'not-data', // Should be ignored
        'class': 'layout-class', // Should be ignored
        'id': 'layout-id' // Should be ignored
      };

      const pageAttrs = {
        'data-component': 'page-component', // Should override layout
        'data-state': 'active', // Page-only data attribute
        'data-analytics': 'track-click', // Page-only data attribute
        'data-unify': '/components/card.html', // Should be filtered out
        'data-layer': 'content', // Should be filtered out
        'title': 'page-title', // Should be ignored
        'onclick': 'pageClick()' // Should be ignored
      };

      const result = merger.mergeDataAttributes(layoutAttrs, pageAttrs);

      // Page wins on conflicts
      expect(result['data-component']).toBe('page-component');
      
      // Layout-only attributes preserved
      expect(result['data-theme']).toBe('dark');
      expect(result['data-version']).toBe('1.0');
      
      // Page-only attributes added
      expect(result['data-state']).toBe('active');
      expect(result['data-analytics']).toBe('track-click');
      
      // Removed attributes should not appear
      expect(result).not.toHaveProperty('data-unify');
      expect(result).not.toHaveProperty('data-layer');
      
      // Non-data attributes should not appear
      expect(result).not.toHaveProperty('aria-label');
      expect(result).not.toHaveProperty('class');
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('title');
      expect(result).not.toHaveProperty('onclick');
    });

    test("should_handle_empty_data_attributes_gracefully", () => {
      // Both empty
      expect(merger.mergeDataAttributes({}, {})).toEqual({});
      
      // Layout only
      const layoutOnlyResult = merger.mergeDataAttributes(
        { 'data-test': 'layout', 'class': 'ignore' }, 
        {}
      );
      expect(layoutOnlyResult).toEqual({ 'data-test': 'layout' });
      
      // Page only
      const pageOnlyResult = merger.mergeDataAttributes(
        {}, 
        { 'data-test': 'page', 'id': 'ignore' }
      );
      expect(pageOnlyResult).toEqual({ 'data-test': 'page' });
    });

    test("should_filter_removed_data_attributes_correctly", () => {
      const layoutAttrs = {
        'data-unify': '/layouts/should-be-removed.html',
        'data-layer': 'should-be-removed',
        'data-custom': 'should-be-kept',
        'data-component': 'layout-component'
      };

      const pageAttrs = {
        'data-unify': '/components/should-also-be-removed.html',
        'data-layer': 'also-should-be-removed',
        'data-page': 'should-be-kept',
        'data-component': 'page-component'
      };

      const result = merger.mergeDataAttributes(layoutAttrs, pageAttrs);

      // Removed attributes should not appear
      expect(result).not.toHaveProperty('data-unify');
      expect(result).not.toHaveProperty('data-layer');
      
      // Other data attributes should be preserved/merged correctly
      expect(result['data-custom']).toBe('should-be-kept'); // Layout only
      expect(result['data-page']).toBe('should-be-kept'); // Page only
      expect(result['data-component']).toBe('page-component'); // Page wins
    });

    test("should_handle_malformed_data_attributes", () => {
      const layoutAttrs = {
        'data-': 'invalid-empty-name',
        'data': 'not-really-data',
        'datatest': 'missing-dash',
        'data-valid': 'valid-data-attribute',
        'data-custom-property': 'valid-custom-data'
      };

      const pageAttrs = {
        'data-valid': 'page-overrides-layout',
        'data-new': 'new-page-data',
        'data-': 'also-invalid',
        'notdata-test': 'not-data-at-all'
      };

      const result = merger.mergeDataAttributes(layoutAttrs, pageAttrs);

      // Valid data attributes should work correctly
      expect(result['data-valid']).toBe('page-overrides-layout'); // Page wins
      expect(result['data-custom-property']).toBe('valid-custom-data'); // Layout preserved
      expect(result['data-new']).toBe('new-page-data'); // Page added
      
      // Invalid data attributes should be filtered out based on startsWith logic
      expect(result['data-']).toBe('also-invalid'); // Actually included due to startsWith('data-')
      expect(result).not.toHaveProperty('data'); // Not actually data (doesn't start with data-)
      expect(result).not.toHaveProperty('datatest'); // Missing dash (doesn't start with data-)
      expect(result).not.toHaveProperty('notdata-test'); // Not data (doesn't start with data-)
    });

    test("should_handle_complex_data_scenarios", () => {
      // Test complex data attribute scenarios
      const layoutAttrs = {
        'data-config': '{"theme": "dark", "size": "large"}',
        'data-analytics-id': 'layout-GA-123',
        'data-feature-flags': 'flag1,flag2,flag3',
        'data-cache-key': 'layout-cache-v1',
        'data-environment': 'production'
      };

      const pageAttrs = {
        'data-config': '{"theme": "light", "animation": "smooth"}', // Override layout
        'data-analytics-id': 'page-GA-456', // Override layout
        'data-user-preferences': 'pref1,pref2', // Page-specific
        'data-cache-key': 'page-cache-v2' // Override layout
      };

      const result = merger.mergeDataAttributes(layoutAttrs, pageAttrs);

      // Page wins on all conflicts
      expect(result['data-config']).toBe('{"theme": "light", "animation": "smooth"}');
      expect(result['data-analytics-id']).toBe('page-GA-456');
      expect(result['data-cache-key']).toBe('page-cache-v2');
      
      // Layout-only attributes preserved
      expect(result['data-feature-flags']).toBe('flag1,flag2,flag3');
      expect(result['data-environment']).toBe('production');
      
      // Page-only attributes added
      expect(result['data-user-preferences']).toBe('pref1,pref2');
    });
  });

  describe("Integration Scenarios", () => {
    test("should_handle_comprehensive_attribute_merging_scenario", () => {
      // Complex real-world scenario testing all method interactions
      const layoutElement = {
        attributes: {
          'id': 'stable-layout-id',
          'class': 'layout-base layout-theme',
          'data-unify': '/layouts/base.html', // Should be removed
          'data-layer': 'base', // Should be removed  
          'data-component': 'layout-card',
          'data-version': '1.0',
          'aria-label': 'Layout accessible name',
          'aria-expanded': 'false',
          'title': 'Layout title',
          'role': 'button'
        }
      };

      const pageElement = {
        attributes: {
          'id': 'page-id', // Should not override due to ID stability
          'class': 'page-content page-specific',
          'data-unify': '/components/custom.html', // Should be removed
          'data-layer': 'content', // Should be removed
          'data-component': 'page-card', // Should override layout
          'data-state': 'active', // Page-only
          'aria-label': 'Page accessible name', // Should override layout
          'aria-live': 'polite', // Page-only
          'title': 'Page title', // Should override layout
          'tabindex': '0' // Page-only
        }
      };

      // Test main mergeAttributes method
      const mainResult = merger.mergeAttributes(layoutElement, pageElement);
      
      // Test individual methods for comprehensive coverage
      const ariaResult = merger.mergeAriaAttributes(layoutElement.attributes, pageElement.attributes);
      const dataResult = merger.mergeDataAttributes(layoutElement.attributes, pageElement.attributes);

      // Main merge results
      expect(mainResult['id']).toBe('stable-layout-id'); // ID stability
      expect(mainResult['class']).toBe('layout-base layout-theme page-content page-specific'); // Class union
      expect(mainResult).not.toHaveProperty('data-unify'); // Removed
      expect(mainResult).not.toHaveProperty('data-layer'); // Removed
      expect(mainResult['data-component']).toBe('page-card'); // Page wins
      expect(mainResult['aria-label']).toBe('Page accessible name'); // Page wins
      expect(mainResult['title']).toBe('Page title'); // Page wins

      // ARIA-specific results
      expect(ariaResult['aria-label']).toBe('Page accessible name');
      expect(ariaResult['aria-expanded']).toBe('false');
      expect(ariaResult['aria-live']).toBe('polite');
      expect(ariaResult).not.toHaveProperty('title'); // Not ARIA

      // Data-specific results  
      expect(dataResult['data-component']).toBe('page-card');
      expect(dataResult['data-version']).toBe('1.0');
      expect(dataResult['data-state']).toBe('active');
      expect(dataResult).not.toHaveProperty('data-unify'); // Removed
      expect(dataResult).not.toHaveProperty('data-layer'); // Removed
      expect(dataResult).not.toHaveProperty('aria-label'); // Not data
    });

    test("should_validate_dom_cascade_specification_compliance", () => {
      // Test against DOM Cascade v1 specification requirements
      const layoutElement = {
        attributes: {
          'id': 'host-element-id', // Must be preserved per spec
          'class': 'host-classes', // Must be merged as union per spec
          'data-unify': '/layouts/site.html', // Must be removed per spec
          'title': 'Host title' // Page should win per spec
        }
      };

      const pageElement = {
        attributes: {
          'id': 'page-element-id', // Should NOT override host ID per spec
          'class': 'page-classes', // Should be appended to host classes per spec
          'data-unify': '/components/card.html', // Must be removed per spec
          'title': 'Page title' // Should override host title per spec
        }
      };

      const result = merger.mergeAttributes(layoutElement, pageElement);

      // Verify DOM Cascade v1 compliance
      expect(result['id']).toBe('host-element-id'); // ID stability rule
      expect(result['class']).toBe('host-classes page-classes'); // Class union rule
      expect(result).not.toHaveProperty('data-unify'); // Attribute removal rule
      expect(result['title']).toBe('Page title'); // Page-wins rule
    });

    test("should_handle_performance_with_large_attribute_sets", () => {
      // Test performance characteristics with many attributes
      const layoutAttrs = {};
      const pageAttrs = {};

      // Generate large attribute sets
      for (let i = 0; i < 100; i++) {
        layoutAttrs[`data-layout-${i}`] = `layout-value-${i}`;
        layoutAttrs[`aria-layout-${i}`] = `layout-aria-${i}`;
        pageAttrs[`data-page-${i}`] = `page-value-${i}`;
        pageAttrs[`aria-page-${i}`] = `page-aria-${i}`;
      }

      const layoutElement = { attributes: layoutAttrs };
      const pageElement = { attributes: pageAttrs };

      const startTime = performance.now();
      const result = merger.mergeAttributes(layoutElement, pageElement);
      const endTime = performance.now();

      // Performance should be reasonable (< 10ms for 200 attributes)
      expect(endTime - startTime).toBeLessThan(10);
      
      // Verify correctness with large sets (layout + page attributes = 400 total)
      expect(Object.keys(result)).toHaveLength(400); // All attributes preserved
      expect(result['data-layout-50']).toBe('layout-value-50');
      expect(result['data-page-50']).toBe('page-value-50');
      expect(result['aria-layout-50']).toBe('layout-aria-50');
      expect(result['aria-page-50']).toBe('page-aria-50');
    });
  });
});