/**
 * Integration Tests for US-003: Landmark Fallback Matching
 * Tests the complete landmark fallback matching workflow
 */

import { describe, test, expect } from 'bun:test';
import { AreaMatcher } from '../../src/core/cascade/area-matcher.js';
import { LandmarkMatcher } from '../../src/core/cascade/landmark-matcher.js';
import { DOMParser } from '../../src/io/dom-parser.js';

describe('US-003: Landmark Fallback Matching - Integration Tests', () => {
  test('should_use_landmark_fallback_when_no_area_classes_match', () => {
    const areaMatcher = new AreaMatcher();
    const parser = new DOMParser();
    
    // Layout with landmarks but no area classes
    const layoutHtml = `
      <html>
        <body>
          <header>Default Header</header>
          <main>Default Main Content</main>
          <footer>Default Footer</footer>
        </body>
      </html>
    `;
    
    // Page with landmarks but no area classes
    const pageHtml = `
      <html>
        <body>
          <header>Custom Header Content</header>
          <main>Custom Main Content</main>
          <footer>Custom Footer Content</footer>
        </body>
      </html>
    `;
    
    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);
    
    const result = areaMatcher.matchAreas(layoutDoc, pageDoc);
    
    // Should find landmark matches since no area classes exist
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every(m => m.matchType === 'landmark')).toBe(true);
    expect(result.errors).toHaveLength(0);
    
    // Verify specific landmark matches
    const headerMatch = result.matches.find(m => m.landmarkType === 'header');
    const mainMatch = result.matches.find(m => m.landmarkType === 'main');
    const footerMatch = result.matches.find(m => m.landmarkType === 'footer');
    
    expect(headerMatch).toBeDefined();
    expect(mainMatch).toBeDefined();
    expect(footerMatch).toBeDefined();
  });

  test('should_prioritize_area_classes_over_landmarks', () => {
    const areaMatcher = new AreaMatcher();
    const parser = new DOMParser();
    
    // Layout with both area classes and landmarks
    const layoutHtml = `
      <html>
        <body>
          <header class="unify-header">Default Header</header>
          <main>Default Main Content</main>
          <footer>Default Footer</footer>
        </body>
      </html>
    `;
    
    // Page with both area classes and landmarks
    const pageHtml = `
      <html>
        <body>
          <header class="unify-header">Custom Header with Area Class</header>
          <main>Custom Main Content</main>
          <footer>Custom Footer Content</footer>
        </body>
      </html>
    `;
    
    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);
    
    const result = areaMatcher.matchAreas(layoutDoc, pageDoc);
    
    // Should have both area and landmark matches
    const areaMatches = result.matches.filter(m => m.matchType === 'area-class');
    const landmarkMatches = result.matches.filter(m => m.matchType === 'landmark');
    
    expect(areaMatches).toHaveLength(1); // header with unify-header class
    expect(landmarkMatches).toHaveLength(2); // main and footer without area classes
    
    // Verify header was matched by area class, not landmark
    const headerAreaMatch = areaMatches.find(m => m.targetClass === 'unify-header');
    expect(headerAreaMatch).toBeDefined();
    
    // Verify main and footer were matched by landmark
    const mainLandmarkMatch = landmarkMatches.find(m => m.landmarkType === 'main');
    const footerLandmarkMatch = landmarkMatches.find(m => m.landmarkType === 'footer');
    expect(mainLandmarkMatch).toBeDefined();
    expect(footerLandmarkMatch).toBeDefined();
  });

  test('should_provide_warnings_for_ambiguous_landmarks', () => {
    const areaMatcher = new AreaMatcher();
    const parser = new DOMParser();
    
    // Layout with multiple same landmarks
    const layoutHtml = `
      <html>
        <body>
          <header>Header 1</header>
          <header>Header 2</header>
          <main>Main Content</main>
        </body>
      </html>
    `;
    
    // Page with single landmark
    const pageHtml = `
      <html>
        <body>
          <header>Page Header</header>
          <main>Page Main</main>
        </body>
      </html>
    `;
    
    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);
    
    const result = areaMatcher.matchAreas(layoutDoc, pageDoc);
    
    // Should have warnings about ambiguous landmarks
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('Ambiguous'))).toBe(true);
    expect(result.warnings.some(w => w.includes('header'))).toBe(true);
  });

  test('should_handle_sectioning_root_context_when_enabled', () => {
    const landmarkMatcher = new LandmarkMatcher({ requireSectioningRoot: true });
    const parser = new DOMParser();
    
    // Layout with landmarks in different sectioning contexts
    const layoutHtml = `
      <html>
        <body>
          <article>
            <header>Article Header</header>
          </article>
          <section>
            <header>Section Header</header>
          </section>
        </body>
      </html>
    `;
    
    // Page with landmarks in corresponding sectioning contexts
    const pageHtml = `
      <html>
        <body>
          <article>
            <header>Custom Article Header</header>
          </article>
          <section>
            <header>Custom Section Header</header>
          </section>
        </body>
      </html>
    `;
    
    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);
    
    const result = landmarkMatcher.matchLandmarks(layoutDoc, pageDoc);
    
    // Should match both headers within their sectioning contexts
    expect(result.matches).toHaveLength(2);
    expect(result.matches.every(m => m.landmarkType === 'header')).toBe(true);
    expect(result.matches.every(m => m.hasOwnProperty('sectioningContext'))).toBe(true);
  });

  test('should_demonstrate_complete_precedence_hierarchy', () => {
    const areaMatcher = new AreaMatcher();
    const parser = new DOMParser();
    
    // Complex layout with area classes, landmarks, and sections
    const layoutHtml = `
      <html>
        <body>
          <header class="unify-header">Default Header</header>
          <nav>Default Navigation</nav>
          <main>
            <section>Section 1</section>
            <section>Section 2</section>
          </main>
          <aside>Default Sidebar</aside>
          <footer>Default Footer</footer>
        </body>
      </html>
    `;
    
    // Page with mixed content
    const pageHtml = `
      <html>
        <body>
          <header class="unify-header">Custom Header (Area Class)</header>
          <nav>Custom Navigation (Landmark)</nav>
          <main>
            <section>Custom Section 1 (Ordered Fill)</section>
            <section>Custom Section 2 (Ordered Fill)</section>
          </main>
          <aside>Custom Sidebar (Landmark)</aside>
          <footer>Custom Footer (Landmark)</footer>
        </body>
      </html>
    `;
    
    const layoutDoc = parser.parse(layoutHtml);
    const pageDoc = parser.parse(pageHtml);
    
    const result = areaMatcher.matchAreas(layoutDoc, pageDoc);
    
    // Verify precedence hierarchy
    const areaMatches = result.matches.filter(m => m.matchType === 'area-class');
    const landmarkMatches = result.matches.filter(m => m.matchType === 'landmark');
    const orderedFillMatches = result.matches.filter(m => m.matchType === 'ordered-fill');
    
    // Should have area class match for header
    expect(areaMatches).toHaveLength(1);
    expect(areaMatches[0].targetClass).toBe('unify-header');
    
    // Should have landmark matches for nav, aside, footer
    expect(landmarkMatches.length).toBeGreaterThan(0);
    
    // Should have ordered fill matches for sections
    expect(orderedFillMatches.length).toBeGreaterThan(0);
    
    // Verify complete coverage - all content should be matched
    const totalMatches = areaMatches.length + landmarkMatches.length + orderedFillMatches.length;
    expect(totalMatches).toBeGreaterThanOrEqual(5); // header, nav, aside, footer, sections
  });
});