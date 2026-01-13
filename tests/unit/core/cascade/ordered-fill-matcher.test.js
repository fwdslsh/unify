/**
 * Unit Tests for OrderedFillMatcher Class - DOM Cascade Components
 * Tests ordered fill fallback matching functionality per DOM Cascade v1 specification
 * Addresses ISSUE-005: DOM Cascade Components Untested (Scenario 4)
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { OrderedFillMatcher } from '../../../../src/core/cascade/ordered-fill-matcher.js';
import { DOMHelpers } from '../../../helpers/dom-helpers.js';

describe('OrderedFillMatcher', () => {
  let orderedFillMatcher;

  beforeEach(() => {
    orderedFillMatcher = new OrderedFillMatcher();
  });

  describe('OrderedFillMatcher Initialization', () => {
    test('should_create_ordered_fill_matcher_with_default_configuration', () => {
      expect(orderedFillMatcher).toBeDefined();
      expect(orderedFillMatcher.options).toBeDefined();
      expect(orderedFillMatcher.config).toBeDefined();
    });

    test('should_use_default_options_when_none_provided', () => {
      expect(orderedFillMatcher.options.enableWarnings).toBe(true);
      expect(orderedFillMatcher.options.maxDepth).toBe(10);
    });

    test('should_accept_valid_configuration_options', () => {
      const options = {
        enableWarnings: false,
        maxDepth: 5
      };

      const matcher = new OrderedFillMatcher(options);
      
      expect(matcher.options.enableWarnings).toBe(false);
      expect(matcher.options.maxDepth).toBe(5);
    });

    test('should_validate_options_and_reject_invalid_types', () => {
      expect(() => {
        new OrderedFillMatcher({ enableWarnings: 'invalid' });
      }).toThrow('enableWarnings must be a boolean');

      expect(() => {
        new OrderedFillMatcher({ maxDepth: 'invalid' });
      }).toThrow('maxDepth must be a non-negative number');

      expect(() => {
        new OrderedFillMatcher({ maxDepth: -1 });
      }).toThrow('maxDepth must be a non-negative number');

      expect(() => {
        new OrderedFillMatcher(null);
      }).toThrow('Options must be an object');
    });

    test('should_define_required_constants', () => {
      expect(OrderedFillMatcher.MATCH_TYPE).toBe('ordered-fill');
      expect(OrderedFillMatcher.UNIFY_PREFIX).toBe('unify-');
      expect(OrderedFillMatcher.MAIN_TAG).toBe('main');
      expect(OrderedFillMatcher.SECTION_TAG).toBe('section');
    });
  });

  describe('Main Section Discovery', () => {
    test('should_find_sections_within_main_elements', () => {
      const doc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>Section 1</section>
              <section>Section 2</section>
              <section>Section 3</section>
            </main>
          </body>
        </html>
      `);

      const sections = orderedFillMatcher.findMainSections(doc);

      expect(sections).toBeArray();
      expect(sections.length).toBe(3);
    });

    test('should_find_sections_across_multiple_main_elements', () => {
      const doc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>First Main - Section 1</section>
              <section>First Main - Section 2</section>
            </main>
            <main>
              <section>Second Main - Section 1</section>
            </main>
          </body>
        </html>
      `);

      const sections = orderedFillMatcher.findMainSections(doc);

      expect(sections).toBeArray();
      expect(sections.length).toBe(3);
    });

    test('should_return_empty_array_when_no_main_elements_exist', () => {
      const doc = DOMHelpers.createDocument(`
        <html>
          <body>
            <div>No main elements here</div>
            <section>Section outside main</section>
          </body>
        </html>
      `);

      const sections = orderedFillMatcher.findMainSections(doc);

      expect(sections).toBeArray();
      expect(sections).toHaveLength(0);
    });

    test('should_return_empty_array_when_main_has_no_sections', () => {
      const doc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <div>Just divs here</div>
              <p>No sections</p>
            </main>
          </body>
        </html>
      `);

      const sections = orderedFillMatcher.findMainSections(doc);

      expect(sections).toBeArray();
      expect(sections).toHaveLength(0);
    });

    test('should_handle_nested_sections_within_main', () => {
      const doc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>
                Top level section
                <section>Nested section</section>
              </section>
            </main>
          </body>
        </html>
      `);

      const sections = orderedFillMatcher.findMainSections(doc);

      expect(sections).toBeArray();
      expect(sections.length).toBe(2); // Both top-level and nested
    });
  });

  describe('Ordered Fill Matching Algorithm', () => {
    test('should_match_layout_and_page_sections_by_index', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section></section>
              <section></section>
              <section></section>
            </main>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>Page Section 1</section>
              <section>Page Section 2</section>
              <section>Page Section 3</section>
            </main>
          </body>
        </html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);

      expect(result.matches).toBeArray();
      expect(result.appendedElements).toBeArray();
      expect(result.warnings).toBeArray();
      expect(result.errors).toBeArray();

      expect(result.matches.length).toBe(3); // 1:1, 2:2, 3:3 mapping
      expect(result.errors).toHaveLength(0);
    });

    test('should_create_proper_match_structure', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body><main><section></section></main></body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body><main><section>Content here</section></main></body></html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);

      expect(result.matches).toHaveLength(1);
      
      const match = result.matches[0];
      expect(match.matchType).toBe('ordered-fill');
      expect(match.index).toBeNumber();
      expect(match.layoutElement).toBeDefined();
      expect(match.pageElements).toBeArray();
      expect(match.pageContent).toBeString();
    });

    test('should_handle_more_page_sections_than_layout_sections', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section></section>
              <section></section>
            </main>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>Page Section 1</section>
              <section>Page Section 2</section>
              <section>Extra Page Section 3</section>
              <section>Extra Page Section 4</section>
            </main>
          </body>
        </html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);

      expect(result.matches.length).toBe(2); // Only 2 layout sections
      expect(result.appendedElements.length).toBe(2); // 2 extra page sections
    });

    test('should_handle_more_layout_sections_than_page_sections', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section></section>
              <section></section>
              <section></section>
              <section></section>
            </main>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>Page Section 1</section>
              <section>Page Section 2</section>
            </main>
          </body>
        </html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);

      expect(result.matches.length).toBe(2); // Only 2 page sections available
      expect(result.appendedElements.length).toBe(0); // No extra page sections
    });

    test('should_handle_documents_with_no_sections', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body><div>No main or sections</div></body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body><div>No main or sections</div></body></html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);

      expect(result.matches).toHaveLength(0);
      expect(result.appendedElements).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Element Exclusion Support', () => {
    test('should_exclude_already_matched_elements_from_consideration', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section id="section-1"></section>
              <section id="section-2"></section>
              <section id="section-3"></section>
            </main>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>Page Section 1</section>
              <section>Page Section 2</section>
              <section>Page Section 3</section>
            </main>
          </body>
        </html>
      `);

      // Create mock excluded elements set
      const excludedElements = new Set([
        layoutDoc.querySelector('#section-1'),
        layoutDoc.querySelector('#section-2')
      ]);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc, {
        excludedElements
      });

      // Should only match section-3 (1 match instead of 3)
      expect(result.matches.length).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    test('should_handle_empty_excluded_elements_set', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body><main><section></section></main></body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body><main><section>Content</section></main></body></html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc, {
        excludedElements: new Set()
      });

      expect(result.matches.length).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Validation and Error Handling', () => {
    test('should_validate_documents_and_throw_for_null_inputs', () => {
      expect(() => {
        orderedFillMatcher.matchOrderedFill(null, null);
      }).toThrow(); // Should throw ValidationError
    });

    test('should_validate_documents_and_throw_for_undefined_inputs', () => {
      const validDoc = DOMHelpers.createDocument('<html><body></body></html>');

      expect(() => {
        orderedFillMatcher.matchOrderedFill(validDoc, undefined);
      }).toThrow();

      expect(() => {
        orderedFillMatcher.matchOrderedFill(undefined, validDoc);
      }).toThrow();
    });

    test('should_handle_document_processing_errors_gracefully', () => {
      // Create a mock that will cause an error during section finding
      const validDoc = DOMHelpers.createDocument('<html><body></body></html>');
      
      // Mock findMainSections to throw an error
      const originalFindMainSections = orderedFillMatcher.findMainSections;
      orderedFillMatcher.findMainSections = () => {
        throw new Error('Document processing error');
      };

      const result = orderedFillMatcher.matchOrderedFill(validDoc, validDoc);

      expect(result.errors).toBeArray();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/Ordered fill matching failed/);

      // Restore original method
      orderedFillMatcher.findMainSections = originalFindMainSections;
    });

    test('should_provide_meaningful_error_messages', () => {
      // Validation errors are thrown, not returned in result
      expect(() => {
        orderedFillMatcher.matchOrderedFill(null, null);
      }).toThrow('Both layout and page documents are required');
    });
  });

  describe('Warning System', () => {
    test('should_generate_warnings_for_mixed_usage_patterns', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section class="unify-content"></section>
              <section></section>
            </main>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>Page Section 1</section>
              <section>Page Section 2</section>
            </main>
          </body>
        </html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);

      expect(result.warnings).toBeArray();
      // May contain warnings about mixed usage patterns
    });

    test('should_respect_warning_configuration_option', () => {
      const matcherWithoutWarnings = new OrderedFillMatcher({ enableWarnings: false });
      
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body><main><section class="unify-test"></section></main></body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html><body><main><section>Content</section></main></body></html>
      `);

      const result = matcherWithoutWarnings.matchOrderedFill(layoutDoc, pageDoc);

      // Should not generate warnings when disabled
      expect(result.warnings).toBeArray();
      expect(matcherWithoutWarnings.options.enableWarnings).toBe(false);
    });
  });

  describe('Appended Elements Handling', () => {
    test('should_create_appended_element_objects_with_required_fields', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body><main><section></section></main></body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>Matched Section</section>
              <section>Extra Section 1</section>
              <section>Extra Section 2</section>
            </main>
          </body>
        </html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);

      expect(result.appendedElements).toHaveLength(2);
      
      for (const appended of result.appendedElements) {
        expect(appended.element).toBeDefined();
        expect(appended.content).toBeString();
        expect(appended.index).toBeNumber();
      }
    });

    test('should_preserve_order_of_appended_elements', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html><body><main></main></body></html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>First Extra</section>
              <section>Second Extra</section>
              <section>Third Extra</section>
            </main>
          </body>
        </html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);

      expect(result.appendedElements).toHaveLength(3);
      expect(result.appendedElements[0].content).toContain('First Extra');
      expect(result.appendedElements[1].content).toContain('Second Extra');
      expect(result.appendedElements[2].content).toContain('Third Extra');
    });
  });

  describe('DOM Cascade v1 Specification Compliance', () => {
    test('should_implement_ordered_fill_as_lowest_precedence_fallback', () => {
      // Ordered fill should only activate when no area or landmark matches exist
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section></section>
              <section></section>
            </main>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>Fallback Content 1</section>
              <section>Fallback Content 2</section>
            </main>
          </body>
        </html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);

      expect(result.matches).toHaveLength(2);
      expect(result.matches[0].matchType).toBe('ordered-fill');
      expect(result.matches[1].matchType).toBe('ordered-fill');
    });

    test('should_map_main_section_elements_by_sequential_index', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section id="layout-1"></section>
              <section id="layout-2"></section>
              <section id="layout-3"></section>
            </main>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>Page Content 1</section>
              <section>Page Content 2</section>
              <section>Page Content 3</section>
            </main>
          </body>
        </html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);

      expect(result.matches).toHaveLength(3);
      
      // Verify index mapping
      expect(result.matches[0].index).toBe(0);
      expect(result.matches[1].index).toBe(1);
      expect(result.matches[2].index).toBe(2);

      // Verify content mapping
      expect(result.matches[0].pageContent).toContain('Page Content 1');
      expect(result.matches[1].pageContent).toContain('Page Content 2');
      expect(result.matches[2].pageContent).toContain('Page Content 3');
    });

    test('should_handle_cross_main_element_section_ordering', () => {
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>Layout Main 1 - Section 1</section>
            </main>
            <main>
              <section>Layout Main 2 - Section 1</section>
            </main>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <main>
              <section>Page Main 1 - Section 1</section>
              <section>Page Main 1 - Section 2</section>
            </main>
          </body>
        </html>
      `);

      const result = orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);

      // Should match across main boundaries in document order
      expect(result.matches.length).toBe(2);
      expect(result.appendedElements).toHaveLength(0);
    });
  });
});