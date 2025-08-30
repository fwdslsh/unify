/**
 * LandmarkMatcher Coverage Gap Tests - ISSUE-002  
 * Tests missing coverage lines for landmark-matcher.js component
 * Lines to cover: 305-306, 339-344, 349, 352, 378-396
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { LandmarkMatcher } from '../../../../src/core/cascade/landmark-matcher.js';
import { DOMHelpers } from '../../../helpers/dom-helpers.js';

describe('LandmarkMatcher Coverage Gaps', () => {
  let landmarkMatcher;

  beforeEach(() => {
    landmarkMatcher = new LandmarkMatcher();
  });

  describe('Precedence Logic Edge Cases', () => {
    test('should_handle_area_only_precedence_case', () => {
      // Test lines 305-306: area matches but no landmark matches
      const layoutDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <section class="unify-content">Layout Content</section>
          </body>
        </html>
      `);

      const pageDoc = DOMHelpers.createDocument(`
        <html>
          <body>
            <section class="unify-content">Page Content</section>
          </body>
        </html>
      `);

      // Mock getUnifyElements to return area matches
      layoutDoc.getUnifyElements = () => [{
        className: 'unify-content',
        classList: {
          contains: (cls) => cls === 'unify-content',
          [Symbol.iterator]: function* () { yield 'unify-content'; }
        }
      }];

      pageDoc.getUnifyElements = () => [{
        className: 'unify-content', 
        classList: {
          contains: (cls) => cls === 'unify-content',
          [Symbol.iterator]: function* () { yield 'unify-content'; }
        }
      }];

      const result = landmarkMatcher.getMatchingPrecedence(layoutDoc, pageDoc);

      expect(result.areaMatches).toBeArray();
      expect(result.areaMatches.length).toBeGreaterThan(0);
      expect(result.landmarkMatches).toBeArray();
      expect(result.landmarkMatches.length).toBe(0);
      expect(result.precedence).toBe('area-only'); // This exercises line 306
    });
  });

  describe('Ambiguous Landmark Warnings', () => {
    test('should_warn_about_multiple_layout_landmarks', () => {
      // Test line 349: warning for multiple layout elements
      const landmarkType = 'header';
      
      // Create layout elements - multiple headers to trigger warning
      const layoutElements = [
        {
          className: 'layout-header-1',
          innerHTML: 'Layout Header 1',
          classList: {
            contains: (cls) => cls === 'layout-header-1',
            [Symbol.iterator]: function* () { yield 'layout-header-1'; }
          }
        },
        {
          className: 'layout-header-2', 
          innerHTML: 'Layout Header 2',
          classList: {
            contains: (cls) => cls === 'layout-header-2',
            [Symbol.iterator]: function* () { yield 'layout-header-2'; }
          }
        }
      ];

      // Create single page element
      const pageElements = [
        {
          className: 'page-header',
          innerHTML: 'Page Header',
          classList: {
            contains: (cls) => cls === 'page-header',
            [Symbol.iterator]: function* () { yield 'page-header'; }
          }
        }
      ];

      const result = {
        matches: [],
        warnings: []
      };

      // Test with ambiguous warnings enabled
      const matcher = new LandmarkMatcher({ enableAmbiguousWarnings: true });
      
      matcher._matchLandmarkType(landmarkType, layoutElements, pageElements, new Set(), result);

      expect(result.warnings).toBeArray();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(warning => 
        warning.includes('multiple <header> elements found in layout')
      )).toBe(true);
    });

    test('should_warn_about_multiple_page_landmarks', () => {
      // Test line 352: warning for multiple page elements
      const landmarkType = 'main';
      
      // Create single layout element
      const layoutElements = [
        {
          className: 'layout-main',
          innerHTML: 'Layout Main',
          classList: {
            contains: (cls) => cls === 'layout-main',
            [Symbol.iterator]: function* () { yield 'layout-main'; }
          }
        }
      ];

      // Create multiple page elements to trigger warning  
      const pageElements = [
        {
          className: 'page-main-1',
          innerHTML: 'Page Main 1',
          classList: {
            contains: (cls) => cls === 'page-main-1',
            [Symbol.iterator]: function* () { yield 'page-main-1'; }
          }
        },
        {
          className: 'page-main-2',
          innerHTML: 'Page Main 2',
          classList: {
            contains: (cls) => cls === 'page-main-2',
            [Symbol.iterator]: function* () { yield 'page-main-2'; }
          }
        }
      ];

      const result = {
        matches: [],
        warnings: []
      };

      // Test with ambiguous warnings enabled
      const matcher = new LandmarkMatcher({ enableAmbiguousWarnings: true });
      
      matcher._matchLandmarkType(landmarkType, layoutElements, pageElements, new Set(), result);

      expect(result.warnings).toBeArray();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(warning =>
        warning.includes('multiple <main> elements found in page')
      )).toBe(true);
    });

    test('should_warn_about_both_multiple_layout_and_page_landmarks', () => {
      // Test both line 349 and 352: warnings for both layout and page multiples
      const landmarkType = 'aside';
      
      // Create multiple layout elements
      const layoutElements = [
        {
          className: 'layout-aside-1',
          innerHTML: 'Layout Aside 1',
          classList: {
            contains: (cls) => cls === 'layout-aside-1',
            [Symbol.iterator]: function* () { yield 'layout-aside-1'; }
          }
        },
        {
          className: 'layout-aside-2',
          innerHTML: 'Layout Aside 2',
          classList: {
            contains: (cls) => cls === 'layout-aside-2',
            [Symbol.iterator]: function* () { yield 'layout-aside-2'; }
          }
        }
      ];

      // Create multiple page elements
      const pageElements = [
        {
          className: 'page-aside-1',
          innerHTML: 'Page Aside 1',
          classList: {
            contains: (cls) => cls === 'page-aside-1',
            [Symbol.iterator]: function* () { yield 'page-aside-1'; }
          }
        },
        {
          className: 'page-aside-2',
          innerHTML: 'Page Aside 2',
          classList: {
            contains: (cls) => cls === 'page-aside-2',
            [Symbol.iterator]: function* () { yield 'page-aside-2'; }
          }
        }
      ];

      const result = {
        matches: [],
        warnings: []
      };

      // Test with ambiguous warnings enabled
      const matcher = new LandmarkMatcher({ enableAmbiguousWarnings: true });
      
      matcher._matchLandmarkType(landmarkType, layoutElements, pageElements, new Set(), result);

      expect(result.warnings).toBeArray();
      expect(result.warnings.length).toBe(2);
      expect(result.warnings.some(warning =>
        warning.includes('multiple <aside> elements found in layout')
      )).toBe(true);
      expect(result.warnings.some(warning =>
        warning.includes('multiple <aside> elements found in page')
      )).toBe(true);
    });
  });

  describe('Sectioning Root Context Matching', () => {
    test('should_use_sectioning_root_matching_when_enabled', () => {
      // Test lines 339-344: sectioning root matching path
      const landmarkType = 'header';
      
      const layoutElements = [
        {
          className: 'layout-header',
          innerHTML: 'Layout Header',
          classList: {
            contains: (cls) => cls === 'layout-header',
            [Symbol.iterator]: function* () { yield 'layout-header'; }
          }
        }
      ];

      const pageElements = [
        {
          className: 'page-header',
          innerHTML: 'Page Header',
          classList: {
            contains: (cls) => cls === 'page-header',
            [Symbol.iterator]: function* () { yield 'page-header'; }
          }
        }
      ];

      const result = {
        matches: [],
        warnings: []
      };

      // Test with sectioning root matching enabled
      const matcher = new LandmarkMatcher({ requireSectioningRoot: true });
      
      matcher._matchLandmarkType(landmarkType, layoutElements, pageElements, new Set(), result);

      expect(result.matches).toBeArray();
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].matchType).toBe('landmark');
      expect(result.matches[0].landmarkType).toBe('header');
    });

    test('should_match_landmarks_within_sectioning_roots', () => {
      // Test lines 378-396: _matchLandmarkWithinSectioningRoots method
      const landmarkType = 'nav';
      
      // Create multiple layout and page elements to test index-based matching
      const layoutElements = [
        {
          className: 'layout-nav-1',
          innerHTML: 'Layout Nav 1',
          classList: {
            contains: (cls) => cls === 'layout-nav-1',
            [Symbol.iterator]: function* () { yield 'layout-nav-1'; }
          }
        },
        {
          className: 'layout-nav-2',
          innerHTML: 'Layout Nav 2',
          classList: {
            contains: (cls) => cls === 'layout-nav-2',
            [Symbol.iterator]: function* () { yield 'layout-nav-2'; }
          }
        }
      ];

      const pageElements = [
        {
          className: 'page-nav-1',
          innerHTML: 'Page Nav 1',
          classList: {
            contains: (cls) => cls === 'page-nav-1',
            [Symbol.iterator]: function* () { yield 'page-nav-1'; }
          }
        },
        {
          className: 'page-nav-2',
          innerHTML: 'Page Nav 2',
          classList: {
            contains: (cls) => cls === 'page-nav-2',
            [Symbol.iterator]: function* () { yield 'page-nav-2'; }
          }
        },
        {
          className: 'page-nav-3',
          innerHTML: 'Page Nav 3',
          classList: {
            contains: (cls) => cls === 'page-nav-3',
            [Symbol.iterator]: function* () { yield 'page-nav-3'; }
          }
        }
      ];

      const result = {
        matches: [],
        warnings: []
      };

      // Directly test the sectioning root method
      landmarkMatcher._matchLandmarkWithinSectioningRoots(landmarkType, layoutElements, pageElements, result);

      expect(result.matches).toBeArray();
      expect(result.matches.length).toBe(2); // Should match min(2, 3) = 2 elements
      
      // Verify first match
      expect(result.matches[0].matchType).toBe('landmark');
      expect(result.matches[0].landmarkType).toBe('nav');
      expect(result.matches[0].sectioningContext).toBe(0);
      
      // Verify second match
      expect(result.matches[1].matchType).toBe('landmark');
      expect(result.matches[1].landmarkType).toBe('nav');
      expect(result.matches[1].sectioningContext).toBe(1);
    });

    test('should_handle_sectioning_root_with_single_elements', () => {
      // Test sectioning root matching with minimal elements
      const landmarkType = 'footer';
      
      const layoutElements = [
        {
          className: 'layout-footer',
          innerHTML: 'Layout Footer',
          classList: {
            contains: (cls) => cls === 'layout-footer',
            [Symbol.iterator]: function* () { yield 'layout-footer'; }
          }
        }
      ];

      const pageElements = [
        {
          className: 'page-footer',
          innerHTML: 'Page Footer',
          classList: {
            contains: (cls) => cls === 'page-footer',
            [Symbol.iterator]: function* () { yield 'page-footer'; }
          }
        }
      ];

      const result = {
        matches: [],
        warnings: []
      };

      landmarkMatcher._matchLandmarkWithinSectioningRoots(landmarkType, layoutElements, pageElements, result);

      expect(result.matches).toBeArray();
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].matchType).toBe('landmark');
      expect(result.matches[0].landmarkType).toBe('footer');
      expect(result.matches[0].sectioningContext).toBe(0);
    });

    test('should_handle_empty_sectioning_root_elements', () => {
      // Test edge case with no elements
      const landmarkType = 'article';
      const result = { matches: [], warnings: [] };

      landmarkMatcher._matchLandmarkWithinSectioningRoots(landmarkType, [], [], result);

      expect(result.matches).toBeArray();
      expect(result.matches.length).toBe(0);
    });
  });

  describe('Integration Test for All Missing Coverage', () => {
    test('should_exercise_all_missing_coverage_paths_in_single_test', () => {
      // This test exercises multiple missing coverage paths together
      
      // 1. Test area-only precedence (lines 305-306)
      const areaOnlyLayoutDoc = DOMHelpers.createDocument(`
        <html><body><section class="unify-hero">Layout</section></body></html>
      `);
      const areaOnlyPageDoc = DOMHelpers.createDocument(`
        <html><body><section class="unify-hero">Page</section></body></html>
      `);

      areaOnlyLayoutDoc.getUnifyElements = () => [{
        className: 'unify-hero',
        classList: { contains: (cls) => cls === 'unify-hero', [Symbol.iterator]: function* () { yield 'unify-hero'; }}
      }];
      
      areaOnlyPageDoc.getUnifyElements = () => [{
        className: 'unify-hero',
        classList: { contains: (cls) => cls === 'unify-hero', [Symbol.iterator]: function* () { yield 'unify-hero'; }}
      }];

      const areaResult = landmarkMatcher.getMatchingPrecedence(areaOnlyLayoutDoc, areaOnlyPageDoc);
      expect(areaResult.precedence).toBe('area-only');

      // 2. Test sectioning root matching (lines 339-344, 378-396)
      const sectionMatcher = new LandmarkMatcher({ requireSectioningRoot: true });
      
      const sectionLayoutElements = [
        {
          className: 'section-header-1',
          innerHTML: 'Section Header 1',
          classList: {
            contains: (cls) => cls === 'section-header-1',
            [Symbol.iterator]: function* () { yield 'section-header-1'; }
          }
        }
      ];

      const sectionPageElements = [
        {
          className: 'section-page-header-1',
          innerHTML: 'Section Page Header 1',
          classList: {
            contains: (cls) => cls === 'section-page-header-1',
            [Symbol.iterator]: function* () { yield 'section-page-header-1'; }
          }
        }
      ];

      const sectionResult = { matches: [], warnings: [] };
      sectionMatcher._matchLandmarkType('header', sectionLayoutElements, sectionPageElements, new Set(), sectionResult);

      expect(sectionResult.matches.length).toBeGreaterThan(0);
      expect(sectionResult.matches[0].sectioningContext).toBeDefined();
      
      // 3. Test warning paths separately with standard matching (lines 349, 352)
      const warningMatcher = new LandmarkMatcher({ enableAmbiguousWarnings: true, requireSectioningRoot: false });
      
      const multiLayoutElements = [
        {
          className: 'warn-header-1',
          innerHTML: 'Warning Header 1',
          classList: {
            contains: (cls) => cls === 'warn-header-1',
            [Symbol.iterator]: function* () { yield 'warn-header-1'; }
          }
        },
        {
          className: 'warn-header-2',
          innerHTML: 'Warning Header 2',
          classList: {
            contains: (cls) => cls === 'warn-header-2',
            [Symbol.iterator]: function* () { yield 'warn-header-2'; }
          }
        }
      ];

      const multiPageElements = [
        {
          className: 'warn-page-header-1',
          innerHTML: 'Warning Page Header 1',
          classList: {
            contains: (cls) => cls === 'warn-page-header-1',
            [Symbol.iterator]: function* () { yield 'warn-page-header-1'; }
          }
        },
        {
          className: 'warn-page-header-2',
          innerHTML: 'Warning Page Header 2',
          classList: {
            contains: (cls) => cls === 'warn-page-header-2',
            [Symbol.iterator]: function* () { yield 'warn-page-header-2'; }
          }
        }
      ];

      const warningResult = { matches: [], warnings: [] };
      warningMatcher._matchLandmarkType('header', multiLayoutElements, multiPageElements, new Set(), warningResult);

      expect(warningResult.warnings.length).toBe(2);
      expect(warningResult.warnings.some(w => w.includes('layout'))).toBe(true);
      expect(warningResult.warnings.some(w => w.includes('page'))).toBe(true);
    });
  });
});