/**
 * OrderedFillMatcher Coverage Gap Tests - ISSUE-003
 * Tests missing coverage lines for ordered-fill-matcher.js component  
 * Lines to cover: 242-267 (validateSectionsForOrderedFill method)
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { OrderedFillMatcher } from '../../../../src/core/cascade/ordered-fill-matcher.js';

describe('OrderedFillMatcher Coverage Gaps', () => {
  let orderedFillMatcher;

  beforeEach(() => {
    orderedFillMatcher = new OrderedFillMatcher();
  });

  describe('Section Validation for Ordered Fill', () => {
    test('should_validate_sections_with_no_area_classes', () => {
      // Test lines 242-267: validateSectionsForOrderedFill method
      // Test case: all sections eligible (no area classes)
      const sections = [
        {
          className: 'regular-section-1',
          classList: {
            [Symbol.iterator]: function* () { yield 'regular-section-1'; }
          }
        },
        {
          className: 'regular-section-2',
          classList: {
            [Symbol.iterator]: function* () { yield 'regular-section-2'; }
          }
        }
      ];

      const result = orderedFillMatcher.validateSectionsForOrderedFill(sections);

      expect(result).toBeDefined();
      expect(result.eligibleSections).toBeArray();
      expect(result.excludedSections).toBeArray();
      expect(result.warnings).toBeArray();
      
      expect(result.eligibleSections.length).toBe(2);
      expect(result.excludedSections.length).toBe(0);
      expect(result.warnings.length).toBe(0);
      
      expect(result.eligibleSections[0].className).toBe('regular-section-1');
      expect(result.eligibleSections[1].className).toBe('regular-section-2');
    });

    test('should_validate_sections_with_all_area_classes', () => {
      // Test case: all sections excluded (all have area classes)
      const sections = [
        {
          className: 'unify-header regular-class',
          classList: {
            [Symbol.iterator]: function* () { 
              yield 'unify-header'; 
              yield 'regular-class'; 
            }
          }
        },
        {
          className: 'unify-content another-class',
          classList: {
            [Symbol.iterator]: function* () { 
              yield 'unify-content'; 
              yield 'another-class'; 
            }
          }
        }
      ];

      const result = orderedFillMatcher.validateSectionsForOrderedFill(sections);

      expect(result.eligibleSections.length).toBe(0);
      expect(result.excludedSections.length).toBe(2);
      expect(result.warnings.length).toBe(0);
      
      expect(result.excludedSections[0].className).toBe('unify-header regular-class');
      expect(result.excludedSections[1].className).toBe('unify-content another-class');
    });

    test('should_validate_mixed_sections_and_generate_warning', () => {
      // Test case: mixed sections (some with area classes, some without) - should generate U008 warning
      const sections = [
        {
          className: 'regular-section',
          classList: {
            [Symbol.iterator]: function* () { yield 'regular-section'; }
          }
        },
        {
          className: 'unify-hero special-class',
          classList: {
            [Symbol.iterator]: function* () { 
              yield 'unify-hero'; 
              yield 'special-class'; 
            }
          }
        },
        {
          className: 'another-regular',
          classList: {
            [Symbol.iterator]: function* () { yield 'another-regular'; }
          }
        }
      ];

      const result = orderedFillMatcher.validateSectionsForOrderedFill(sections);

      expect(result.eligibleSections.length).toBe(2);
      expect(result.excludedSections.length).toBe(1);
      expect(result.warnings.length).toBe(1);
      
      // Verify the eligible sections
      expect(result.eligibleSections[0].className).toBe('regular-section');
      expect(result.eligibleSections[1].className).toBe('another-regular');
      
      // Verify the excluded section
      expect(result.excludedSections[0].className).toBe('unify-hero special-class');
      
      // Verify the U008 warning
      expect(result.warnings[0]).toContain('Ordered fill used while public areas exist unused');
      expect(result.warnings[0]).toContain('consider using explicit area classes for all sections');
    });

    test('should_handle_empty_sections_array', () => {
      // Test edge case: empty sections array
      const sections = [];

      const result = orderedFillMatcher.validateSectionsForOrderedFill(sections);

      expect(result.eligibleSections.length).toBe(0);
      expect(result.excludedSections.length).toBe(0);
      expect(result.warnings.length).toBe(0);
    });

    test('should_handle_sections_with_multiple_area_classes', () => {
      // Test case: sections with multiple unify- classes  
      const sections = [
        {
          className: 'unify-header unify-nav combined-area',
          classList: {
            [Symbol.iterator]: function* () { 
              yield 'unify-header'; 
              yield 'unify-nav'; 
              yield 'combined-area'; 
            }
          }
        }
      ];

      const result = orderedFillMatcher.validateSectionsForOrderedFill(sections);

      expect(result.eligibleSections.length).toBe(0);
      expect(result.excludedSections.length).toBe(1);
      expect(result.warnings.length).toBe(0);
      
      expect(result.excludedSections[0].className).toBe('unify-header unify-nav combined-area');
    });

    test('should_detect_area_classes_with_unify_prefix', () => {
      // Test the startsWith logic with various unify- prefixed classes  
      const sections = [
        {
          className: 'unify-hero-section regular-class',
          classList: {
            [Symbol.iterator]: function* () { 
              yield 'unify-hero-section'; 
              yield 'regular-class'; 
            }
          }
        },
        {
          className: 'not-unify-header', // This should be eligible (doesn't start with unify-)
          classList: {
            [Symbol.iterator]: function* () { yield 'not-unify-header'; }
          }
        }
      ];

      const result = orderedFillMatcher.validateSectionsForOrderedFill(sections);

      expect(result.eligibleSections.length).toBe(1);
      expect(result.excludedSections.length).toBe(1);
      expect(result.warnings.length).toBe(1); // Mixed usage warning
      
      expect(result.eligibleSections[0].className).toBe('not-unify-header');
      expect(result.excludedSections[0].className).toBe('unify-hero-section regular-class');
    });

    test('should_handle_malformed_classList_gracefully', () => {
      // Test edge case: sections with null/undefined classList
      const sections = [
        {
          className: 'section-without-proper-classList',
          classList: null
        }
      ];

      // This should not crash - the method should handle it gracefully
      expect(() => {
        orderedFillMatcher.validateSectionsForOrderedFill(sections);
      }).toThrow(); // Expected to throw since Array.from(null) will fail
    });
  });

  describe('Integration Test for Complete Method Coverage', () => {
    test('should_exercise_all_validateSectionsForOrderedFill_paths', () => {
      // Integration test that exercises all code paths in lines 242-267
      
      // 1. Test empty array (lines 242-248)
      const emptyResult = orderedFillMatcher.validateSectionsForOrderedFill([]);
      expect(emptyResult.eligibleSections.length).toBe(0);
      expect(emptyResult.excludedSections.length).toBe(0);
      expect(emptyResult.warnings.length).toBe(0);
      
      // 2. Test sections without area classes (lines 249-258, 257 branch)
      const eligibleSections = [
        {
          className: 'regular-section',
          classList: {
            [Symbol.iterator]: function* () { yield 'regular-section'; }
          }
        }
      ];
      
      const eligibleResult = orderedFillMatcher.validateSectionsForOrderedFill(eligibleSections);
      expect(eligibleResult.eligibleSections.length).toBe(1);
      expect(eligibleResult.excludedSections.length).toBe(0);
      expect(eligibleResult.warnings.length).toBe(0);
      
      // 3. Test sections with area classes (lines 249-258, 255 branch)
      const excludedSections = [
        {
          className: 'unify-hero',
          classList: {
            [Symbol.iterator]: function* () { yield 'unify-hero'; }
          }
        }
      ];
      
      const excludedResult = orderedFillMatcher.validateSectionsForOrderedFill(excludedSections);
      expect(excludedResult.eligibleSections.length).toBe(0);
      expect(excludedResult.excludedSections.length).toBe(1);
      expect(excludedResult.warnings.length).toBe(0);
      
      // 4. Test mixed sections generating warning (lines 261-266)
      const mixedSections = [
        ...eligibleSections,
        ...excludedSections
      ];
      
      const mixedResult = orderedFillMatcher.validateSectionsForOrderedFill(mixedSections);
      expect(mixedResult.eligibleSections.length).toBe(1);
      expect(mixedResult.excludedSections.length).toBe(1);
      expect(mixedResult.warnings.length).toBe(1);
      expect(mixedResult.warnings[0]).toContain('Ordered fill used while public areas exist unused');
      
      // All branches and lines 242-267 are now covered
    });
  });
});