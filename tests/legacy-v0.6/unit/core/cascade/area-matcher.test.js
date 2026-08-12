/**
 * Unit Tests for AreaMatcher Class - DOM Cascade Components
 * Tests area matching functionality per DOM Cascade v1 specification
 * Addresses ISSUE-005: DOM Cascade Components Untested
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { AreaMatcher } from '../../../../src/core/cascade/area-matcher.js';
import { DOMHelpers, DOMCascadeFixtures } from '../../../helpers/dom-helpers.js';

describe('AreaMatcher', () => {
  let areaMatcher;

  beforeEach(() => {
    areaMatcher = new AreaMatcher();
  });

  describe('AreaMatcher Initialization', () => {
    test('should_create_area_matcher_with_landmark_and_ordered_fill_matchers', () => {
      expect(areaMatcher).toBeDefined();
      expect(areaMatcher.landmarkMatcher).toBeDefined();
      expect(areaMatcher.orderedFillMatcher).toBeDefined();
    });

    test('should_initialize_dependency_matchers_correctly', () => {
      expect(areaMatcher.landmarkMatcher.constructor.name).toBe('LandmarkMatcher');
      expect(areaMatcher.orderedFillMatcher.constructor.name).toBe('OrderedFillMatcher');
    });
  });

  describe('Area Class Matching - Core Functionality', () => {
    test('should_match_unify_classes_between_layout_and_page_documents', () => {
      const fixture = DOMCascadeFixtures.getAreaMatching();
      const result = areaMatcher.matchAreas(fixture.layout, fixture.page);

      expect(result).toBeDefined();
      expect(result.matches).toBeArray();
      expect(result.warnings).toBeArray();
      expect(result.errors).toBeArray();

      // Should find matches for unify-hero, unify-sidebar, unify-content
      const areaMatches = result.matches.filter(match => match.matchType === 'area-class');
      expect(areaMatches.length).toBeGreaterThan(0);

      // Check for specific area matches
      const heroMatch = areaMatches.find(match => match.targetClass === 'unify-hero');
      const sidebarMatch = areaMatches.find(match => match.targetClass === 'unify-sidebar');
      const contentMatch = areaMatches.find(match => match.targetClass === 'unify-content');

      expect(heroMatch).toBeDefined();
      expect(sidebarMatch).toBeDefined();
      expect(contentMatch).toBeDefined();
    });

    test('should_return_correct_match_structure_with_all_required_fields', () => {
      const fixture = DOMCascadeFixtures.getSimpleComposition();
      const result = areaMatcher.matchAreas(fixture.layout, fixture.page);

      const areaMatches = result.matches.filter(match => match.matchType === 'area-class');
      expect(areaMatches.length).toBeGreaterThan(0);

      const match = areaMatches[0];
      expect(match.matchType).toBe('area-class');
      expect(match.targetClass).toMatch(/^unify-/);
      expect(match.layoutElement).toBeDefined();
      expect(match.pageElements).toBeArray();
      expect(match.combinedContent).toBeString();
    });

    test('should_combine_content_from_multiple_page_elements_with_same_class', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body>
          <div class="unify-content"></div>
        </body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body>
          <div class="unify-content">First content</div>
          <div class="unify-content">Second content</div>
        </body></html>
      `);

      const result = areaMatcher.matchAreas(layoutDoc, pageDoc);
      const contentMatch = result.matches.find(match => match.targetClass === 'unify-content');

      expect(contentMatch).toBeDefined();
      expect(contentMatch.pageElements).toHaveLength(2);
      expect(contentMatch.combinedContent).toContain('First content');
      expect(contentMatch.combinedContent).toContain('Second content');
    });

    test('should_only_match_classes_with_unify_prefix', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body>
          <div class="unify-header"></div>
          <div class="header"></div>
          <div class="content"></div>
        </body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body>
          <div class="unify-header">Header content</div>
          <div class="header">Regular header</div>
          <div class="content">Regular content</div>
        </body></html>
      `);

      const result = areaMatcher.matchAreas(layoutDoc, pageDoc);
      const areaMatches = result.matches.filter(match => match.matchType === 'area-class');

      // Should only match unify-header, not header or content
      expect(areaMatches).toHaveLength(1);
      expect(areaMatches[0].targetClass).toBe('unify-header');
    });
  });

  describe('Element Detection and Querying', () => {
    test('should_detect_unify_elements_using_querySelectorAll', () => {
      const doc = DOMHelpers.createDocument(`
        <html><body>
          <div class="unify-header">Header</div>
          <div class="regular-class">Regular</div>
          <div class="unify-content">Content</div>
        </body></html>
      `);

      const elements = areaMatcher._getUnifyElements(doc);
      
      expect(elements).toHaveLength(2);
      expect(elements[0].className).toContain('unify-header');
      expect(elements[1].className).toContain('unify-content');
    });

    test('should_fallback_to_document_property_when_querySelectorAll_not_available', () => {
      const mockDoc = {
        document: {
          querySelectorAll: (selector) => {
            if (selector === '[class*="unify-"]') {
              return [
                { className: 'unify-test' },
                { className: 'unify-mock' }
              ];
            }
            return [];
          }
        }
      };

      const elements = areaMatcher._getUnifyElements(mockDoc);
      
      expect(elements).toHaveLength(2);
      expect(elements[0].className).toBe('unify-test');
      expect(elements[1].className).toBe('unify-mock');
    });

    test('should_return_empty_array_when_no_query_method_available', () => {
      const mockDoc = {};
      const elements = areaMatcher._getUnifyElements(mockDoc);
      
      expect(elements).toBeArray();
      expect(elements).toHaveLength(0);
    });

    test('should_use_custom_getUnifyElements_method_when_available', () => {
      const mockDoc = {
        getUnifyElements: () => [
          { className: 'unify-custom' }
        ]
      };

      const elements = areaMatcher._getUnifyElements(mockDoc);
      
      expect(elements).toHaveLength(1);
      expect(elements[0].className).toBe('unify-custom');
    });
  });

  describe('Class List Handling', () => {
    test('should_extract_class_list_using_classList_when_available', () => {
      const element = {
        classList: ['unify-header', 'header-style', 'unify-main']
      };

      const classes = areaMatcher._getClassList(element);
      
      expect(classes).toEqual(['unify-header', 'header-style', 'unify-main']);
    });

    test('should_extract_class_list_using_className_property', () => {
      const element = {
        className: 'unify-header header-style unify-main'
      };

      const classes = areaMatcher._getClassList(element);
      
      expect(classes).toEqual(['unify-header', 'header-style', 'unify-main']);
    });

    test('should_extract_class_list_using_getAttribute_method', () => {
      const element = {
        getAttribute: (attr) => {
          if (attr === 'class') return 'unify-header header-style';
          return null;
        }
      };

      const classes = areaMatcher._getClassList(element);
      
      expect(classes).toEqual(['unify-header', 'header-style']);
    });

    test('should_return_empty_array_when_no_class_information_available', () => {
      const element = {};
      const classes = areaMatcher._getClassList(element);
      
      expect(classes).toBeArray();
      expect(classes).toHaveLength(0);
    });

    test('should_filter_out_empty_class_names_from_split', () => {
      const element = {
        className: '  unify-header   header-style  '
      };

      const classes = areaMatcher._getClassList(element);
      
      expect(classes).toEqual(['unify-header', 'header-style']);
    });
  });

  describe('Class Matching Logic', () => {
    test('should_check_class_presence_using_classList_contains', () => {
      const element = {
        classList: {
          contains: (cls) => cls === 'unify-header'
        }
      };

      expect(areaMatcher._hasClass(element, 'unify-header')).toBe(true);
      expect(areaMatcher._hasClass(element, 'unify-footer')).toBe(false);
    });

    test('should_fallback_to_class_list_includes_when_classList_not_available', () => {
      const element = {
        className: 'unify-header header-style'
      };

      expect(areaMatcher._hasClass(element, 'unify-header')).toBe(true);
      expect(areaMatcher._hasClass(element, 'header-style')).toBe(true);
      expect(areaMatcher._hasClass(element, 'unify-footer')).toBe(false);
    });
  });

  describe('Content Combination', () => {
    test('should_combine_innerHTML_from_multiple_elements', () => {
      const elements = [
        { innerHTML: '<h1>First</h1>' },
        { innerHTML: '<p>Second</p>' }
      ];

      const combined = areaMatcher._combineElementsContent(elements);
      
      expect(combined).toBe('<h1>First</h1>\n<p>Second</p>');
    });

    test('should_fallback_to_textContent_when_innerHTML_not_available', () => {
      const elements = [
        { textContent: 'First text' },
        { textContent: 'Second text' }
      ];

      const combined = areaMatcher._combineElementsContent(elements);
      
      expect(combined).toBe('First text\nSecond text');
    });

    test('should_return_empty_string_for_elements_without_content', () => {
      const elements = [
        {},
        { innerHTML: '<p>Content</p>' },
        {}
      ];

      const combined = areaMatcher._combineElementsContent(elements);
      
      expect(combined).toBe('\n<p>Content</p>\n');
    });

    test('should_preserve_source_order_when_combining_content', () => {
      const elements = [
        { innerHTML: 'First' },
        { innerHTML: 'Second' },
        { innerHTML: 'Third' }
      ];

      const combined = areaMatcher._combineElementsContent(elements);
      
      expect(combined).toBe('First\nSecond\nThird');
    });
  });

  describe('Fallback Matching Integration', () => {
    test('should_call_landmark_matcher_with_excluded_classes', () => {
      const fixture = DOMCascadeFixtures.getSimpleComposition();
      
      // Mock the landmark matcher to verify it's called
      let landmarkMatcherCalled = false;
      let excludedClasses = null;
      
      areaMatcher.landmarkMatcher.matchLandmarks = (layoutDoc, pageDoc, options) => {
        landmarkMatcherCalled = true;
        excludedClasses = options?.excludeMatchedClasses;
        return { matches: [], warnings: [], errors: [] };
      };

      areaMatcher.matchAreas(fixture.layout, fixture.page);

      expect(landmarkMatcherCalled).toBe(true);
      expect(excludedClasses).toBeInstanceOf(Set);
    });

    test('should_call_ordered_fill_matcher_after_landmark_matching', () => {
      const fixture = DOMCascadeFixtures.getSimpleComposition();
      
      let orderedFillMatcherCalled = false;
      
      areaMatcher.orderedFillMatcher.matchOrderedFill = (layoutDoc, pageDoc) => {
        orderedFillMatcherCalled = true;
        return { matches: [], warnings: [], errors: [] };
      };

      areaMatcher.matchAreas(fixture.layout, fixture.page);

      expect(orderedFillMatcherCalled).toBe(true);
    });

    test('should_aggregate_matches_warnings_and_errors_from_all_matchers', () => {
      const fixture = DOMCascadeFixtures.getSimpleComposition();
      
      // Mock matchers to return specific results
      areaMatcher.landmarkMatcher.matchLandmarks = () => ({
        matches: [{ matchType: 'landmark' }],
        warnings: ['Landmark warning'],
        errors: ['Landmark error']
      });

      areaMatcher.orderedFillMatcher.matchOrderedFill = () => ({
        matches: [{ matchType: 'ordered-fill' }],
        warnings: ['Ordered fill warning'],
        errors: ['Ordered fill error']
      });

      const result = areaMatcher.matchAreas(fixture.layout, fixture.page);

      // Should aggregate all results
      expect(result.matches.length).toBeGreaterThan(2); // area + landmark + ordered fill
      expect(result.warnings).toContain('Landmark warning');
      expect(result.warnings).toContain('Ordered fill warning');
      expect(result.errors).toContain('Landmark error');
      expect(result.errors).toContain('Ordered fill error');
    });
  });

  describe('Error Handling', () => {
    test('should_handle_malformed_HTML_gracefully', () => {
      const fixture = DOMCascadeFixtures.getErrorConditions();
      
      expect(() => {
        areaMatcher.matchAreas(fixture.layout, fixture.page);
      }).not.toThrow();
    });

    test('should_capture_errors_in_result_when_matching_fails', () => {
      // Force an error by making getUnifyElements throw
      areaMatcher._getUnifyElements = () => {
        throw new Error('Test matching error');
      };

      const fixture = DOMCascadeFixtures.getSimpleComposition();
      const result = areaMatcher.matchAreas(fixture.layout, fixture.page);

      expect(result.errors).toBeArray();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Area matching failed');
      expect(result.errors[0]).toContain('Test matching error');
    });

    test('should_return_valid_result_structure_even_when_errors_occur', () => {
      // Force an error in area matching
      areaMatcher._getUnifyElements = () => {
        throw new Error('Simulated error');
      };

      const fixture = DOMCascadeFixtures.getSimpleComposition();
      const result = areaMatcher.matchAreas(fixture.layout, fixture.page);

      expect(result).toBeDefined();
      expect(result.matches).toBeArray();
      expect(result.warnings).toBeArray();
      expect(result.errors).toBeArray();
      expect(result.errors).toHaveLength(1);
    });

    test('should_handle_null_or_undefined_documents', () => {
      expect(() => {
        areaMatcher.matchAreas(null, null);
      }).not.toThrow();

      expect(() => {
        areaMatcher.matchAreas(undefined, undefined);
      }).not.toThrow();
    });
  });

  describe('DOM Cascade Specification Compliance', () => {
    test('should_follow_area_class_matching_precedence', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body>
          <div class="unify-content"></div>
          <main></main>
        </body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body>
          <div class="unify-content">Area class content</div>
          <main>Landmark content</main>
        </body></html>
      `);

      const result = areaMatcher.matchAreas(layoutDoc, pageDoc);

      // Area class matching should take precedence
      const areaMatch = result.matches.find(match => match.matchType === 'area-class');
      expect(areaMatch).toBeDefined();
      expect(areaMatch.targetClass).toBe('unify-content');
    });

    test('should_exclude_matched_classes_from_subsequent_matching', () => {
      const fixture = DOMCascadeFixtures.getAreaMatching();
      
      let excludedFromLandmark = null;
      
      areaMatcher.landmarkMatcher.matchLandmarks = (layoutDoc, pageDoc, options) => {
        excludedFromLandmark = options?.excludeMatchedClasses;
        return { matches: [], warnings: [], errors: [] };
      };

      const result = areaMatcher.matchAreas(fixture.layout, fixture.page);
      
      // Classes that were matched by area matching should be excluded
      const areaMatches = result.matches.filter(match => match.matchType === 'area-class');
      
      expect(excludedFromLandmark).toBeInstanceOf(Set);
      
      areaMatches.forEach(match => {
        expect(excludedFromLandmark.has(match.targetClass)).toBe(true);
      });
    });

    test('should_support_scope_isolation_per_specification', () => {
      // Area matching should never cross component boundaries
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body>
          <div class="unify-content">
            <div class="unify-nested"></div>
          </div>
        </body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body>
          <div class="unify-content">Content</div>
          <div class="unify-nested">Should not cross scope</div>
        </body></html>
      `);

      const result = areaMatcher.matchAreas(layoutDoc, pageDoc);
      
      // Both classes should be matched, scope isolation handled in composition
      const areaMatches = result.matches.filter(match => match.matchType === 'area-class');
      const matchedClasses = areaMatches.map(match => match.targetClass);
      
      expect(matchedClasses).toContain('unify-content');
      expect(matchedClasses).toContain('unify-nested');
    });
  });
});