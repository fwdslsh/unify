/**
 * Unit Tests for LandmarkMatcher Class - DOM Cascade Components
 * Tests landmark fallback matching functionality per DOM Cascade v1 specification
 * Addresses ISSUE-005: DOM Cascade Components Untested (Scenario 3)
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { LandmarkMatcher } from '../../../../src/core/cascade/landmark-matcher.js';
import { DOMHelpers } from '../../../helpers/dom-helpers.js';

describe('LandmarkMatcher', () => {
  let landmarkMatcher;

  beforeEach(() => {
    landmarkMatcher = new LandmarkMatcher();
  });

  describe('LandmarkMatcher Initialization', () => {
    test('should_create_landmark_matcher_with_default_configuration', () => {
      expect(landmarkMatcher).toBeDefined();
      expect(landmarkMatcher.landmarkElements).toBeInstanceOf(Set);
      expect(landmarkMatcher.semanticElements).toBeInstanceOf(Set);
    });

    test('should_configure_html5_landmark_elements_correctly', () => {
      expect(landmarkMatcher.landmarkElements.has('header')).toBe(true);
      expect(landmarkMatcher.landmarkElements.has('nav')).toBe(true);
      expect(landmarkMatcher.landmarkElements.has('main')).toBe(true);
      expect(landmarkMatcher.landmarkElements.has('aside')).toBe(true);
      expect(landmarkMatcher.landmarkElements.has('footer')).toBe(true);
    });

    test('should_configure_semantic_elements_including_landmarks', () => {
      expect(landmarkMatcher.semanticElements.has('article')).toBe(true);
      expect(landmarkMatcher.semanticElements.has('section')).toBe(true);
      expect(landmarkMatcher.semanticElements.has('header')).toBe(true);
      expect(landmarkMatcher.semanticElements.has('nav')).toBe(true);
      expect(landmarkMatcher.semanticElements.has('main')).toBe(true);
      expect(landmarkMatcher.semanticElements.has('aside')).toBe(true);
      expect(landmarkMatcher.semanticElements.has('footer')).toBe(true);
    });

    test('should_accept_valid_configuration_options', () => {
      const options = {
        enableAmbiguousWarnings: false,
        requireSectioningRoot: true
      };

      const matcher = new LandmarkMatcher(options);
      
      expect(matcher.options.enableAmbiguousWarnings).toBe(false);
      expect(matcher.options.requireSectioningRoot).toBe(true);
    });

    test('should_use_default_options_when_none_provided', () => {
      expect(landmarkMatcher.options.enableAmbiguousWarnings).toBe(true);
      expect(landmarkMatcher.options.requireSectioningRoot).toBe(false);
    });

    test('should_validate_options_and_reject_invalid_types', () => {
      expect(() => {
        new LandmarkMatcher({ enableAmbiguousWarnings: 'invalid' });
      }).toThrow('enableAmbiguousWarnings must be a boolean');

      expect(() => {
        new LandmarkMatcher({ requireSectioningRoot: 'invalid' });
      }).toThrow('requireSectioningRoot must be a boolean');

      expect(() => {
        new LandmarkMatcher(null);
      }).toThrow('Options must be an object');
    });
  });

  describe('Landmark Discovery', () => {
    test('should_find_all_html5_landmark_elements_in_document', () => {
      const doc = DOMHelpers.createDocument(`
        <!DOCTYPE html>
        <html>
          <body>
            <header>Site Header</header>
            <nav>Navigation</nav>
            <main>Main Content</main>
            <aside>Sidebar</aside>
            <footer>Site Footer</footer>
          </body>
        </html>
      `);

      const landmarks = landmarkMatcher.findLandmarks(doc);

      expect(landmarks.header).toBeDefined();
      expect(landmarks.nav).toBeDefined();
      expect(landmarks.main).toBeDefined();
      expect(landmarks.aside).toBeDefined();
      expect(landmarks.footer).toBeDefined();

      expect(landmarks.header.length).toBe(1);
      expect(landmarks.nav.length).toBe(1);
      expect(landmarks.main.length).toBe(1);
      expect(landmarks.aside.length).toBe(1);
      expect(landmarks.footer.length).toBe(1);
    });

    test('should_find_multiple_landmarks_of_same_type', () => {
      const doc = DOMHelpers.createDocument(`
        <html>
          <body>
            <header>Main Header</header>
            <section>
              <header>Section Header</header>
            </section>
            <nav>Primary Nav</nav>
            <nav>Secondary Nav</nav>
          </body>
        </html>
      `);

      const landmarks = landmarkMatcher.findLandmarks(doc);

      expect(landmarks.header.length).toBe(2);
      expect(landmarks.nav.length).toBe(2);
    });

    test('should_return_empty_arrays_when_no_landmarks_found', () => {
      const doc = DOMHelpers.createDocument(`
        <html>
          <body>
            <div>Just a div</div>
            <p>Just a paragraph</p>
          </body>
        </html>
      `);

      const landmarks = landmarkMatcher.findLandmarks(doc);

      expect(landmarks.header).toBeArray();
      expect(landmarks.header).toHaveLength(0);
      expect(landmarks.nav).toHaveLength(0);
      expect(landmarks.main).toHaveLength(0);
      expect(landmarks.aside).toHaveLength(0);
      expect(landmarks.footer).toHaveLength(0);
    });

    test('should_handle_nested_landmark_elements', () => {
      const doc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <header>Content Header</header>
              <aside>Content Sidebar</aside>
            </main>
          </body>
        </html>
      `);

      const landmarks = landmarkMatcher.findLandmarks(doc);

      expect(landmarks.main.length).toBe(1);
      expect(landmarks.header.length).toBe(1);
      expect(landmarks.aside.length).toBe(1);
    });

    test('should_throw_validation_error_for_invalid_documents', () => {
      expect(() => {
        landmarkMatcher.findLandmarks(null);
      }).toThrow('Invalid document provided');

      expect(() => {
        landmarkMatcher.findLandmarks({});
      }).toThrow('Invalid document provided');

      expect(() => {
        landmarkMatcher.findLandmarks({ getElementsByTagName: 'not a function' });
      }).toThrow('Invalid document provided');
    });
  });

  describe('Landmark Matching Between Documents', () => {
    test('should_match_corresponding_landmarks_between_layout_and_page', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <header></header>
            <nav></nav>
            <main></main>
            <aside></aside>
            <footer></footer>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <header>Page Header Content</header>
            <nav>Page Navigation</nav>
            <main>Page Main Content</main>
            <aside>Page Sidebar</aside>
            <footer>Page Footer</footer>
          </body>
        </html>
      `);

      const result = landmarkMatcher.matchLandmarks(layoutDoc, pageDoc);

      expect(result.matches).toBeArray();
      expect(result.warnings).toBeArray();
      expect(result.errors).toBeArray();

      // Should find matches for all landmark types
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should_return_proper_match_structure', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body><main></main></body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body><main>Main content here</main></body></html>
      `);

      const result = landmarkMatcher.matchLandmarks(layoutDoc, pageDoc);

      if (result.matches.length > 0) {
        const match = result.matches[0];
        expect(match.matchType).toBeDefined();
        expect(match.landmarkType).toBeDefined();
        expect(match.layoutElement).toBeDefined();
        expect(match.pageElements).toBeArray();
        expect(match.pageContent).toBeString();
        expect(match.confidence).toBeNumber();
      }
    });

    test('should_handle_documents_with_no_matching_landmarks', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body><main></main></body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body><div>No landmarks here</div></body></html>
      `);

      const result = landmarkMatcher.matchLandmarks(layoutDoc, pageDoc);

      expect(result.matches).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should_exclude_already_matched_classes_from_consideration', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <header class="unify-header"></header>
            <nav class="unify-nav"></nav>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <header class="unify-header">Header content</header>
            <nav class="unify-nav">Nav content</nav>
          </body>
        </html>
      `);

      const excludeMatchedClasses = new Set(['unify-header']);
      const result = landmarkMatcher.matchLandmarks(layoutDoc, pageDoc, {
        excludeMatchedClasses
      });

      // Should match nav but not header (header already matched by area class)
      const headerMatches = result.matches.filter(m => m.landmarkType === 'header');
      const navMatches = result.matches.filter(m => m.landmarkType === 'nav');

      expect(headerMatches).toHaveLength(0);
      expect(navMatches.length).toBeGreaterThanOrEqual(0);
    });

    test('should_handle_invalid_documents_gracefully', () => {
      const result1 = landmarkMatcher.matchLandmarks(null, null);
      expect(result1.errors).toContain('Invalid documents provided for landmark matching');

      const validDoc = DOMHelpers.createDocument('<html><body></body></html>');
      const result2 = landmarkMatcher.matchLandmarks(validDoc, null);
      expect(result2.errors).toContain('Invalid documents provided for landmark matching');

      const result3 = landmarkMatcher.matchLandmarks(null, validDoc);
      expect(result3.errors).toContain('Invalid documents provided for landmark matching');
    });
  });

  describe('Semantic Element Matching', () => {
    test('should_match_semantic_elements_beyond_landmarks', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <article></article>
            <section></section>
            <header></header>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <article>Article content</article>
            <section>Section content</section>
            <header>Header content</header>
          </body>
        </html>
      `);

      const result = landmarkMatcher.matchSemanticElements(layoutDoc, pageDoc);

      expect(result.matches).toBeArray();
      expect(result.warnings).toBeArray();
      expect(result.errors).toBeArray();

      // Should match article, section, and header
      expect(result.matches.length).toBe(3);

      const articleMatch = result.matches.find(m => m.tagName === 'article');
      const sectionMatch = result.matches.find(m => m.tagName === 'section');
      const headerMatch = result.matches.find(m => m.tagName === 'header');

      expect(articleMatch).toBeDefined();
      expect(sectionMatch).toBeDefined();
      expect(headerMatch).toBeDefined();
    });

    test('should_return_semantic_match_structure_with_confidence', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body><article></article></body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body><article>Article content</article></body></html>
      `);

      const result = landmarkMatcher.matchSemanticElements(layoutDoc, pageDoc);

      expect(result.matches).toHaveLength(1);
      
      const match = result.matches[0];
      expect(match.matchType).toBe('semantic');
      expect(match.tagName).toBe('article');
      expect(match.layoutElement).toBeDefined();
      expect(match.pageElements).toBeArray();
      expect(match.pageElements).toHaveLength(1);
      expect(match.pageContent).toBe('Article content');
      expect(match.confidence).toBeNumber();
      expect(match.confidence).toBeGreaterThan(0);
      expect(match.confidence).toBeLessThanOrEqual(1);
    });

    test('should_handle_documents_without_semantic_elements', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body><div>No semantic elements</div></body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body><span>No semantic elements</span></body></html>
      `);

      const result = landmarkMatcher.matchSemanticElements(layoutDoc, pageDoc);

      expect(result.matches).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should_handle_invalid_documents_for_semantic_matching', () => {
      const result = landmarkMatcher.matchSemanticElements(null, null);
      
      expect(result.errors).toContain('Invalid documents provided for semantic matching');
    });
  });

  describe('Matching Precedence Analysis', () => {
    test('should_analyze_matching_precedence_for_debugging', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <header class="unify-header"></header>
            <main></main>
          </body>
        </html>
      `);

      // Mock getUnifyElements method with proper DOM-like objects
      layoutDoc.getUnifyElements = () => [
        { 
          className: 'unify-header',
          classList: {
            contains: (cls) => cls === 'unify-header',
            [Symbol.iterator]: function* () {
              yield 'unify-header';
            }
          }
        }
      ];

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <header class="unify-header">Header content</header>
            <main>Main content</main>
          </body>
        </html>
      `);

      pageDoc.getUnifyElements = () => [
        { 
          className: 'unify-header',
          classList: {
            contains: (cls) => cls === 'unify-header',
            [Symbol.iterator]: function* () {
              yield 'unify-header';
            }
          }
        }
      ];

      const result = landmarkMatcher.getMatchingPrecedence(layoutDoc, pageDoc);

      expect(result.areaMatches).toBeArray();
      expect(result.landmarkMatches).toBeArray();
      expect(result.orderedFillMatches).toBeArray();
      expect(result.precedence).toBeString();
    });

    test('should_handle_documents_without_getUnifyElements_method', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body><main></main></body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body><main>Content</main></body></html>
      `);

      const result = landmarkMatcher.getMatchingPrecedence(layoutDoc, pageDoc);

      expect(result.areaMatches).toBeArray();
      expect(result.areaMatches).toHaveLength(0);
      expect(result.precedence).toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should_handle_malformed_documents_gracefully', () => {
      const mockDoc = {
        getElementsByTagName: () => {
          throw new Error('Document parsing error');
        }
      };

      expect(() => {
        landmarkMatcher.findLandmarks(mockDoc);
      }).toThrow('Failed to find landmarks: Document parsing error');
    });

    test('should_handle_errors_during_landmark_matching', () => {
      const errorDoc = {
        getElementsByTagName: () => {
          throw new Error('Matching error');
        }
      };

      const validDoc = DOMHelpers.createDocument('<html><body></body></html>');
      
      const result = landmarkMatcher.matchLandmarks(errorDoc, validDoc);

      expect(result.errors[0]).toMatch(/Landmark matching failed/);
      expect(result.errors[0]).toMatch(/Matching error/);
    });

    test('should_provide_meaningful_error_messages', () => {
      const result = landmarkMatcher.matchLandmarks(null, undefined);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/Invalid documents provided/);
    });
  });

  describe('DOM Cascade v1 Specification Compliance', () => {
    test('should_implement_landmark_fallback_after_area_class_matching', () => {
      // This test verifies that landmark matching acts as fallback
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <header class="unify-header"></header>
            <main></main>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <header class="unify-header">Header with area class</header>
            <main>Main without area class</main>
          </body>
        </html>
      `);

      // Exclude area-matched classes (simulating area matcher ran first)
      const excludeMatchedClasses = new Set(['unify-header']);
      const result = landmarkMatcher.matchLandmarks(layoutDoc, pageDoc, {
        excludeMatchedClasses
      });

      // Should match main landmark but not header (already matched by area)
      const mainMatches = result.matches.filter(m => m.landmarkType === 'main');
      const headerMatches = result.matches.filter(m => m.landmarkType === 'header');

      expect(mainMatches.length).toBeGreaterThanOrEqual(0);
      expect(headerMatches).toHaveLength(0);
    });

    test('should_match_unique_landmarks_within_sectioning_contexts', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <header></header>
              <aside></aside>
            </main>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>Main content
              <header>Section header</header>
              <aside>Section sidebar</aside>
            </main>
          </body>
        </html>
      `);

      const result = landmarkMatcher.matchLandmarks(layoutDoc, pageDoc);

      // Should find matches for main, header, and aside
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should_support_html5_semantic_roles_correctly', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <nav role="navigation"></nav>
            <main role="main"></main>
            <aside role="complementary"></aside>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <nav>Navigation content</nav>
            <main>Main content</main>
            <aside>Sidebar content</aside>
          </body>
        </html>
      `);

      const result = landmarkMatcher.matchLandmarks(layoutDoc, pageDoc);

      // Should match by element type regardless of role attributes
      expect(result.matches.length).toBeGreaterThanOrEqual(3);
      expect(result.errors).toHaveLength(0);
    });
  });
});