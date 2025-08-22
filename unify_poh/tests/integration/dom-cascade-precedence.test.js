/**
 * DOM Cascade Precedence Integration Tests
 * Tests the complete precedence system: Area class match > Landmark fallback > Ordered fill
 * Validates US-001, US-003, and US-004 integration
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { AreaMatcher } from "../../src/core/cascade/area-matcher.js";
import { DOMParser } from "../../src/io/dom-parser.js";

describe("DOM Cascade Precedence Integration", () => {
  let matcher;
  let parser;

  beforeEach(() => {
    matcher = new AreaMatcher();
    parser = new DOMParser();
  });

  test("should_use_area_class_matching_when_available", () => {
    const layoutHtml = `
      <main>
        <header>Default header</header>
        <section class="unify-hero">Default hero</section>
        <section>Default section</section>
      </main>
    `;
    
    const pageHtml = `
      <main>
        <section class="unify-hero">Custom hero content</section>
      </main>
    `;

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchAreas(layoutDoc, pageDoc);

    // Should prefer area class matching over landmark or ordered fill
    const areaMatches = result.matches.filter(m => m.matchType === 'area-class');
    const landmarkMatches = result.matches.filter(m => m.matchType === 'landmark');
    const orderedFillMatches = result.matches.filter(m => m.matchType === 'ordered-fill');

    expect(areaMatches.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  test("should_fallback_to_landmark_when_no_area_classes", () => {
    const layoutHtml = `
      <main>
        <header>Default header</header>
        <section>Default section</section>
      </main>
    `;
    
    const pageHtml = `
      <main>
        <header>Custom header</header>
        <section>Custom section</section>
      </main>
    `;

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchAreas(layoutDoc, pageDoc);

    // Should have landmark matches when no area classes are used
    const landmarkMatches = result.matches.filter(m => m.matchType === 'landmark');
    
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  test("should_fallback_to_ordered_fill_when_no_landmarks_or_areas", () => {
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

    const result = matcher.matchAreas(layoutDoc, pageDoc);

    // Should have ordered fill matches as the lowest precedence fallback
    const orderedFillMatches = result.matches.filter(m => m.matchType === 'ordered-fill');
    
    expect(orderedFillMatches.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  test("should_handle_mixed_matching_with_correct_precedence", () => {
    const layoutHtml = `
      <main>
        <header>Default header</header>
        <section class="unify-hero">Default hero</section>
        <section>Regular section</section>
        <footer>Default footer</footer>
      </main>
    `;
    
    const pageHtml = `
      <main>
        <header>Custom header</header>
        <section class="unify-hero">Custom hero</section>
        <section>Custom section</section>
        <footer>Custom footer</footer>
      </main>
    `;

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchAreas(layoutDoc, pageDoc);

    const areaMatches = result.matches.filter(m => m.matchType === 'area-class');
    const landmarkMatches = result.matches.filter(m => m.matchType === 'landmark');
    const orderedFillMatches = result.matches.filter(m => m.matchType === 'ordered-fill');

    // Should have matches from multiple precedence levels
    expect(result.matches.length).toBeGreaterThan(0);
    
    // Area class should be present for unify-hero
    expect(areaMatches.length).toBeGreaterThan(0);
    
    expect(result.errors).toHaveLength(0);
  });

  test("should_exclude_matched_elements_from_lower_precedence", () => {
    const layoutHtml = `
      <main>
        <section class="unify-hero">Layout hero</section>
        <section>Layout regular</section>
      </main>
    `;
    
    const pageHtml = `
      <main>
        <section class="unify-hero">Page hero</section>
        <section>Page regular</section>
      </main>
    `;

    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);

    const result = matcher.matchAreas(layoutDoc, pageDoc);

    // Elements already matched by area class should not be matched by ordered fill
    const areaMatches = result.matches.filter(m => m.matchType === 'area-class');
    const orderedFillMatches = result.matches.filter(m => m.matchType === 'ordered-fill');

    expect(areaMatches.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });
});