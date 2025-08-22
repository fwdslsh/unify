/**
 * Landmark Fallback Matching Tests (US-003)
 * Tests for DOM Cascade v1 landmark fallback matching functionality
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LandmarkMatcher } from '../../../src/core/cascade/landmark-matcher.js';
import { DOMParser } from '../../../src/io/dom-parser.js';

describe('LandmarkMatcher - US-003: Landmark Fallback Matching', () => {
  let matcher;
  let parser;

  beforeEach(() => {
    matcher = new LandmarkMatcher();
    parser = new DOMParser();
  });

  afterEach(() => {
    // Cleanup if needed
  });

  describe('Basic Instantiation and Configuration', () => {
    test('should_create_landmark_matcher_instance_when_instantiated', () => {
      expect(matcher).toBeInstanceOf(LandmarkMatcher);
    });

    test('should_expose_landmark_elements_set_when_instantiated', () => {
      expect(matcher.landmarkElements).toBeInstanceOf(Set);
      expect(matcher.landmarkElements.has('header')).toBe(true);
      expect(matcher.landmarkElements.has('nav')).toBe(true);
      expect(matcher.landmarkElements.has('main')).toBe(true);
      expect(matcher.landmarkElements.has('aside')).toBe(true);
      expect(matcher.landmarkElements.has('footer')).toBe(true);
    });

    test('should_configure_landmark_detection_options_when_instantiated', () => {
      expect(matcher.options).toBeDefined();
      expect(matcher.options.enableAmbiguousWarnings).toBe(true);
      expect(matcher.options.requireSectioningRoot).toBe(false);
    });
  });

  describe('Landmark Detection', () => {
    test('should_find_single_landmark_elements_when_unique_landmarks_exist', () => {
      const html = `
        <header>Header content</header>
        <nav>Navigation content</nav>
        <main>Main content</main>
        <aside>Sidebar content</aside>
        <footer>Footer content</footer>
      `;
      
      const doc = parser.parse(html);
      const landmarks = matcher.findLandmarks(doc);
      
      expect(landmarks.header).toHaveLength(1);
      expect(landmarks.nav).toHaveLength(1);
      expect(landmarks.main).toHaveLength(1);
      expect(landmarks.aside).toHaveLength(1);
      expect(landmarks.footer).toHaveLength(1);
    });

    test('should_detect_multiple_same_landmarks_when_ambiguous_landmarks_exist', () => {
      const html = `
        <header>Header 1</header>
        <header>Header 2</header>
        <main>Main content</main>
      `;
      
      const doc = parser.parse(html);
      const landmarks = matcher.findLandmarks(doc);
      
      expect(landmarks.header).toHaveLength(2);
      expect(landmarks.main).toHaveLength(1);
    });

    test('should_return_empty_arrays_when_no_landmarks_exist', () => {
      const html = '<div>No landmarks here</div>';
      
      const doc = parser.parse(html);
      const landmarks = matcher.findLandmarks(doc);
      
      expect(landmarks.header).toHaveLength(0);
      expect(landmarks.nav).toHaveLength(0);
      expect(landmarks.main).toHaveLength(0);
      expect(landmarks.aside).toHaveLength(0);
      expect(landmarks.footer).toHaveLength(0);
    });

    test('should_find_nested_landmarks_when_landmarks_are_nested', () => {
      const html = `
        <main>
          <header>Nested header</header>
          <section>
            <aside>Nested aside</aside>
          </section>
        </main>
      `;
      
      const doc = parser.parse(html);
      const landmarks = matcher.findLandmarks(doc);
      
      expect(landmarks.main).toHaveLength(1);
      expect(landmarks.header).toHaveLength(1);
      expect(landmarks.aside).toHaveLength(1);
    });
  });

  describe('Unique Landmark Matching', () => {
    test('should_match_unique_landmarks_when_both_layout_and_page_have_same_landmark', () => {
      const layoutHtml = `
        <header>Layout header</header>
        <main>Layout main</main>
      `;
      const pageHtml = `
        <header>Page header</header>
        <main>Page main</main>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      expect(result.matches).toHaveLength(2);
      expect(result.matches[0].matchType).toBe('landmark');
      expect(result.matches[0].landmarkType).toBe('header');
      expect(result.matches[1].landmarkType).toBe('main');
    });

    test('should_skip_landmarks_with_area_classes_when_area_matching_available', () => {
      const layoutHtml = `
        <header class="unify-header">Layout header</header>
        <main>Layout main</main>
      `;
      const pageHtml = `
        <header>Page header</header>
        <main>Page main</main>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      // Simulate already matched area classes
      const matchedClasses = new Set(['unify-header']);
      const result = matcher.matchLandmarks(layoutDoc, pageDoc, { excludeMatchedClasses: matchedClasses });
      
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].landmarkType).toBe('main');
    });

    test('should_match_first_landmark_when_page_has_multiple_same_landmarks', () => {
      const layoutHtml = '<main>Layout main</main>';
      const pageHtml = `
        <main>Page main 1</main>
        <main>Page main 2</main>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].pageElements).toHaveLength(1);
      expect(result.matches[0].pageElements[0].innerHTML).toBe('Page main 1');
    });

    test('should_not_match_when_page_lacks_corresponding_landmark', () => {
      const layoutHtml = `
        <header>Layout header</header>
        <main>Layout main</main>
      `;
      const pageHtml = '<main>Page main only</main>';
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].landmarkType).toBe('main');
    });
  });

  describe('Semantic Matching', () => {
    test('should_match_based_on_tag_names_when_semantic_elements_present', () => {
      const layoutHtml = `
        <article>Layout article</article>
        <section>Layout section</section>
      `;
      const pageHtml = `
        <article>Page article</article>
        <section>Page section</section>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchSemanticElements(layoutDoc, pageDoc);
      
      expect(result.matches).toHaveLength(2);
      expect(result.matches.some(m => m.tagName === 'article')).toBe(true);
      expect(result.matches.some(m => m.tagName === 'section')).toBe(true);
    });

    test('should_prioritize_landmarks_over_other_semantic_elements_when_both_exist', () => {
      const layoutHtml = `
        <main>Layout main</main>
        <article>Layout article</article>
      `;
      const pageHtml = `
        <main>Page main</main>
        <article>Page article</article>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].landmarkType).toBe('main');
    });
  });

  describe('Fallback Precedence', () => {
    test('should_have_lower_precedence_than_area_class_matching_when_both_available', () => {
      // This test verifies that landmark matching is only used when area matching fails
      const layoutHtml = `
        <header class="unify-header">Layout header</header>
        <main>Layout main</main>
      `;
      const pageHtml = `
        <header class="unify-header">Page header with area class</header>
        <main>Page main without area class</main>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.getMatchingPrecedence(layoutDoc, pageDoc);
      
      expect(result.areaMatches).toHaveLength(1);
      expect(result.landmarkMatches).toHaveLength(1); // Only main, header excluded due to area class
      expect(result.precedence).toBe('area-over-landmark');
    });

    test('should_have_higher_precedence_than_ordered_fill_when_landmarks_available', () => {
      const layoutHtml = `
        <main>
          <section>Section 1</section>
          <section>Section 2</section>
        </main>
      `;
      const pageHtml = `
        <main>
          <section>Page section 1</section>
          <section>Page section 2</section>
        </main>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.getMatchingPrecedence(layoutDoc, pageDoc);
      
      expect(result.landmarkMatches).toHaveLength(1);
      expect(result.orderedFillMatches).toHaveLength(0); // Landmarks prevent ordered fill
      expect(result.precedence).toBe('landmark-over-ordered-fill');
    });
  });

  describe('Ambiguous Landmark Warnings', () => {
    test('should_warn_when_multiple_same_landmarks_in_layout', () => {
      const layoutHtml = `
        <header>Header 1</header>
        <header>Header 2</header>
        <main>Main content</main>
      `;
      const pageHtml = '<header>Page header</header>';
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Ambiguous landmark');
      expect(result.warnings[0]).toContain('header');
    });

    test('should_warn_when_multiple_same_landmarks_in_page', () => {
      const layoutHtml = '<main>Layout main</main>';
      const pageHtml = `
        <main>Page main 1</main>
        <main>Page main 2</main>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('multiple');
      expect(result.warnings[0]).toContain('main');
    });

    test('should_not_warn_when_landmarks_are_unique', () => {
      const layoutHtml = `
        <header>Header</header>
        <main>Main</main>
        <footer>Footer</footer>
      `;
      const pageHtml = `
        <header>Page header</header>
        <main>Page main</main>
        <footer>Page footer</footer>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Sectioning Root Context', () => {
    test('should_respect_sectioning_root_boundaries_when_option_enabled', () => {
      matcher.options.requireSectioningRoot = true;
      
      const layoutHtml = `
        <article>
          <header>Article header</header>
          <main>Article main</main>
        </article>
        <section>
          <header>Section header</header>
        </section>
      `;
      const pageHtml = `
        <article>
          <header>Page article header</header>
        </article>
        <section>
          <header>Page section header</header>
        </section>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      // Should match headers within their respective sectioning roots
      expect(result.matches).toHaveLength(2);
      expect(result.matches.every(m => m.matchType === 'landmark')).toBe(true);
    });

    test('should_ignore_sectioning_roots_when_option_disabled', () => {
      matcher.options.requireSectioningRoot = false;
      
      const layoutHtml = `
        <article>
          <header>Article header</header>
        </article>
        <header>Top-level header</header>
      `;
      const pageHtml = `
        <header>Page header 1</header>
        <header>Page header 2</header>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      // Should find matches regardless of sectioning context
      expect(result.matches.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should_handle_null_documents_gracefully', () => {
      const result = matcher.matchLandmarks(null, null);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid documents');
      expect(result.matches).toHaveLength(0);
    });

    test('should_handle_malformed_html_gracefully', () => {
      const layoutHtml = '<header>Unclosed header';
      const pageHtml = '<main><section>Nested unclosed';
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      expect(result.errors).toHaveLength(0); // Should not error, just handle gracefully
      expect(result.matches).toBeDefined();
    });

    test('should_validate_security_constraints', () => {
      // Test that the matcher doesn't process dangerous content
      const maliciousHtml = '<script>alert("xss")</script><header>Header</header>';
      
      const doc = parser.parse(maliciousHtml);
      const landmarks = matcher.findLandmarks(doc);
      
      // Should still process landmarks but ignore scripts
      expect(landmarks.header).toHaveLength(1);
    });
  });

  describe('Coverage and Edge Cases', () => {
    test('should_handle_empty_html_documents', () => {
      const emptyDoc = parser.parse('');
      const landmarks = matcher.findLandmarks(emptyDoc);
      
      expect(landmarks).toBeDefined();
      expect(Object.keys(landmarks)).toHaveLength(5); // All landmark types
    });

    test('should_handle_documents_with_only_text_content', () => {
      const textOnlyDoc = parser.parse('Just plain text');
      const landmarks = matcher.findLandmarks(textOnlyDoc);
      
      expect(landmarks.main).toHaveLength(0);
      expect(landmarks.header).toHaveLength(0);
    });

    test('should_handle_deeply_nested_landmark_structures', () => {
      const deeplyNested = `
        <main>
          <section>
            <article>
              <header>Deep header</header>
              <section>
                <aside>Deep aside</aside>
              </section>
            </article>
          </section>
        </main>
      `;
      
      const doc = parser.parse(deeplyNested);
      const landmarks = matcher.findLandmarks(doc);
      
      expect(landmarks.main).toHaveLength(1);
      expect(landmarks.header).toHaveLength(1);
      expect(landmarks.aside).toHaveLength(1);
    });

    test('should_maintain_reference_integrity_during_matching', () => {
      const layoutHtml = '<main id="main-content">Layout main</main>';
      const pageHtml = '<main>Page main</main>';
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].layoutElement.getAttribute('id')).toBe('main-content');
    });

    test('should_provide_detailed_match_information', () => {
      const layoutHtml = '<header class="site-header">Layout header</header>';
      const pageHtml = '<header class="page-header">Page header</header>';
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const result = matcher.matchLandmarks(layoutDoc, pageDoc);
      
      expect(result.matches).toHaveLength(1);
      const match = result.matches[0];
      expect(match).toHaveProperty('matchType', 'landmark');
      expect(match).toHaveProperty('landmarkType', 'header');
      expect(match).toHaveProperty('layoutElement');
      expect(match).toHaveProperty('pageElements');
      expect(match).toHaveProperty('confidence');
    });
  });
});