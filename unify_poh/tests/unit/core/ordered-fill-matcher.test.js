/**
 * Ordered Fill Matcher Tests (US-004)
 * Tests for DOM Cascade v1 ordered fill fallback matching
 * Following TDD Red-Green-Refactor methodology
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { OrderedFillMatcher } from "../../../src/core/cascade/ordered-fill-matcher.js";
import { DOMParser } from "../../../src/io/dom-parser.js";
import { ValidationError } from "../../../src/core/errors.js";

describe("OrderedFillMatcher - Basic Structure and Validation", () => {
  let matcher;
  let parser;

  beforeEach(() => {
    matcher = new OrderedFillMatcher();
    parser = new DOMParser();
  });

  test("should_create_instance_when_constructor_called", () => {
    expect(matcher).toBeInstanceOf(OrderedFillMatcher);
  });

  test("should_have_default_configuration_when_created_without_options", () => {
    expect(matcher.options).toBeDefined();
    expect(matcher.options.enableWarnings).toBe(true);
    expect(matcher.options.maxDepth).toBe(10);
  });

  test("should_accept_valid_options_when_constructor_called", () => {
    const customMatcher = new OrderedFillMatcher({
      enableWarnings: false,
      maxDepth: 5
    });

    expect(customMatcher.options.enableWarnings).toBe(false);
    expect(customMatcher.options.maxDepth).toBe(5);
  });

  test("should_throw_validation_error_when_invalid_options_provided", () => {
    expect(() => new OrderedFillMatcher(null)).toThrow(ValidationError);
    expect(() => new OrderedFillMatcher({ enableWarnings: "invalid" })).toThrow(ValidationError);
    expect(() => new OrderedFillMatcher({ maxDepth: -1 })).toThrow(ValidationError);
  });
});

describe("OrderedFillMatcher - Core Matching Algorithm", () => {
  let matcher;
  let parser;

  beforeEach(() => {
    matcher = new OrderedFillMatcher();
    parser = new DOMParser();
  });

  test("should_return_empty_result_when_no_main_elements_exist", () => {
    const layoutHtml = '<div>No main element</div>';
    const pageHtml = '<div>No main element</div>';

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchOrderedFill(layoutDoc, pageDoc);

    expect(result.matches).toHaveLength(0);
    expect(result.appendedElements).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  test("should_match_sections_by_index_when_both_documents_have_main_sections", () => {
    const layoutHtml = `
      <main>
        <section>Layout Section 1</section>
        <section>Layout Section 2</section>
      </main>
    `;
    
    const pageHtml = `
      <main>
        <section>Page Section 1</section>
        <section>Page Section 2</section>
      </main>
    `;

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchOrderedFill(layoutDoc, pageDoc);

    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].matchType).toBe('ordered-fill');
    expect(result.matches[0].index).toBe(0);
    expect(result.matches[1].index).toBe(1);
    expect(result.appendedElements).toHaveLength(0);
  });

  test("should_append_extra_page_sections_when_page_has_more_sections", () => {
    const layoutHtml = `
      <main>
        <section>Layout Section 1</section>
      </main>
    `;
    
    const pageHtml = `
      <main>
        <section>Page Section 1</section>
        <section>Page Section 2</section>
        <section>Page Section 3</section>
      </main>
    `;

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchOrderedFill(layoutDoc, pageDoc);

    expect(result.matches).toHaveLength(1);
    expect(result.appendedElements).toHaveLength(2);
    expect(result.appendedElements[0].index).toBe(1);
    expect(result.appendedElements[1].index).toBe(2);
  });

  test("should_ignore_extra_layout_sections_when_layout_has_more_sections", () => {
    const layoutHtml = `
      <main>
        <section>Layout Section 1</section>
        <section>Layout Section 2</section>
        <section>Layout Section 3</section>
      </main>
    `;
    
    const pageHtml = `
      <main>
        <section>Page Section 1</section>
      </main>
    `;

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchOrderedFill(layoutDoc, pageDoc);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].index).toBe(0);
    expect(result.appendedElements).toHaveLength(0);
  });

  test("should_handle_multiple_main_elements_when_both_documents_have_them", () => {
    const layoutHtml = `
      <main>
        <section>Layout Main 1 - Section 1</section>
      </main>
      <main>
        <section>Layout Main 2 - Section 1</section>
      </main>
    `;
    
    const pageHtml = `
      <main>
        <section>Page Main 1 - Section 1</section>
      </main>
      <main>
        <section>Page Main 2 - Section 1</section>
      </main>
    `;

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchOrderedFill(layoutDoc, pageDoc);

    expect(result.matches.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.length).toBeGreaterThan(0); // Should warn about multiple main elements
  });
});

describe("OrderedFillMatcher - Edge Cases and Error Handling", () => {
  let matcher;
  let parser;

  beforeEach(() => {
    matcher = new OrderedFillMatcher();
    parser = new DOMParser();
  });

  test("should_throw_validation_error_when_invalid_documents_provided", () => {
    expect(() => matcher.matchOrderedFill(null, null)).toThrow(ValidationError);
    expect(() => matcher.matchOrderedFill({}, {})).toThrow(ValidationError);
  });

  test("should_handle_empty_documents_when_provided", () => {
    const emptyDoc = parser.parse('');
    
    const result = matcher.matchOrderedFill(emptyDoc, emptyDoc);

    expect(result.matches).toHaveLength(0);
    expect(result.appendedElements).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  test("should_handle_main_without_sections_when_provided", () => {
    const layoutHtml = '<main>Just text content</main>';
    const pageHtml = '<main>Just text content</main>';

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchOrderedFill(layoutDoc, pageDoc);

    expect(result.matches).toHaveLength(0);
    expect(result.appendedElements).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  test("should_handle_sections_outside_main_when_provided", () => {
    const layoutHtml = `
      <section>Section outside main</section>
      <main>
        <section>Section inside main</section>
      </main>
    `;
    
    const pageHtml = `
      <section>Page section outside main</section>
      <main>
        <section>Page section inside main</section>
      </main>
    `;

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchOrderedFill(layoutDoc, pageDoc);

    // Should only match sections inside main elements
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].index).toBe(0);
  });
});

describe("OrderedFillMatcher - Integration with Precedence System", () => {
  let matcher;
  let parser;

  beforeEach(() => {
    matcher = new OrderedFillMatcher();
    parser = new DOMParser();
  });

  test("should_respect_excluded_elements_when_provided_options", () => {
    const layoutHtml = `
      <main>
        <section class="unify-hero">Layout Section 1</section>
        <section>Layout Section 2</section>
      </main>
    `;
    
    const pageHtml = `
      <main>
        <section class="unify-hero">Page Section 1</section>
        <section>Page Section 2</section>
      </main>
    `;

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const excludedElements = new Set([
      layoutDoc.getElementsByClassName('unify-hero')[0]
    ]);

    const result = matcher.matchOrderedFill(layoutDoc, pageDoc, {
      excludedElements
    });

    // Should skip the excluded element and match remaining ones
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].index).toBe(0); // First available match after exclusion
  });

  test("should_provide_warnings_when_area_classes_exist_unused", () => {
    const layoutHtml = `
      <main>
        <section class="unify-unused">Unused area class</section>
        <section>Regular section</section>
      </main>
    `;
    
    const pageHtml = `
      <main>
        <section>Page Section 1</section>
        <section>Page Section 2</section>
      </main>
    `;

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchOrderedFill(layoutDoc, pageDoc);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('unused');
  });
});

describe("OrderedFillMatcher - Utility Methods", () => {
  let matcher;
  let parser;

  beforeEach(() => {
    matcher = new OrderedFillMatcher();
    parser = new DOMParser();
  });

  test("should_find_main_sections_when_document_provided", () => {
    const html = `
      <main>
        <section>Section 1</section>
        <section>Section 2</section>
        <div>Not a section</div>
      </main>
    `;

    const doc = parser.parse(html);
    const sections = matcher.findMainSections(doc);

    expect(sections).toHaveLength(2);
  });

  test("should_find_multiple_main_sections_when_multiple_main_elements", () => {
    const html = `
      <main>
        <section>Main 1 - Section 1</section>
      </main>
      <main>
        <section>Main 2 - Section 1</section>
        <section>Main 2 - Section 2</section>
      </main>
    `;

    const doc = parser.parse(html);
    const sections = matcher.findMainSections(doc);

    expect(sections).toHaveLength(3);
  });

  test("should_validate_sections_for_ordered_fill_when_called", () => {
    const html = `
      <main>
        <section class="unify-hero">Has area class</section>
        <section>Pure section</section>
      </main>
    `;

    const doc = parser.parse(html);
    const sections = matcher.findMainSections(doc);
    const result = matcher.validateSectionsForOrderedFill(sections);

    expect(result.eligibleSections).toHaveLength(1); // Only the pure section
    expect(result.excludedSections).toHaveLength(1); // The one with area class
    expect(result.warnings).toHaveLength(1); // Warning about mixed usage
  });
});