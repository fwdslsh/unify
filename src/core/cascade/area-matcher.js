/**
 * DOM Cascade Area Matching Engine - Simplified (Following Reference Implementation)
 * Implements DOM Cascade v1 area matching with focus on core logic
 */

import { LandmarkMatcher } from './landmark-matcher.js';
import { OrderedFillMatcher } from './ordered-fill-matcher.js';

/**
 * Simplified AreaMatcher following reference implementation pattern
 * Focuses on core area class matching logic per refactor plan
 */
export class AreaMatcher {
  constructor() {
    this.landmarkMatcher = new LandmarkMatcher();
    this.orderedFillMatcher = new OrderedFillMatcher();
  }

  /**
   * Match page content to layout areas - simplified approach
   * Phase 1: Area class matching only (remove complex scope validation)
   * @param {Document} layoutDoc - Layout document with areas to fill
   * @param {Document} pageDoc - Page document with content to place
   * @returns {MatchResult} Matching results
   */
  matchAreas(layoutDoc, pageDoc) {
    const result = { matches: [], warnings: [], errors: [] };
    
    try {
      // Phase 1: Area class matching only (simplified per refactor plan)
      const layoutUnifyElements = this._getUnifyElements(layoutDoc);
      const pageUnifyElements = this._getUnifyElements(pageDoc);
      const excludeMatchedClasses = new Set();
      
      for (const layoutElement of layoutUnifyElements) {
        for (const className of this._getClassList(layoutElement)) {
          if (!className.startsWith('unify-')) continue;
          
          const matchingPageElements = pageUnifyElements.filter(pageEl =>
            this._hasClass(pageEl, className)
          );
          
          if (matchingPageElements.length > 0) {
            result.matches.push({
              matchType: 'area-class',
              targetClass: className,
              layoutElement,
              pageElements: matchingPageElements,
              combinedContent: this._combineElementsContent(matchingPageElements)
            });
            // Track this class as already matched
            excludeMatchedClasses.add(className);
          }
        }
      }
      
      // Phase 2: Landmark fallback matching
      const landmarkMatches = this.landmarkMatcher.matchLandmarks(layoutDoc, pageDoc, { excludeMatchedClasses });
      result.matches.push(...landmarkMatches.matches);
      result.warnings.push(...landmarkMatches.warnings);
      if (landmarkMatches.errors) {
        result.errors.push(...landmarkMatches.errors);
      }
      
      // Phase 3: Ordered fill fallback
      const orderedMatches = this.orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc);
      result.matches.push(...orderedMatches.matches);
      result.warnings.push(...orderedMatches.warnings);
      if (orderedMatches.errors) {
        result.errors.push(...orderedMatches.errors);
      }
      
    } catch (error) {
      result.errors.push(`Area matching failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Get unify elements from document
   * @private
   */
  _getUnifyElements(doc) {
    if (doc.getUnifyElements) {
      return doc.getUnifyElements();
    }
    // Fallback for different document implementations
    if (doc.querySelectorAll) {
      return Array.from(doc.querySelectorAll('[class*="unify-"]'));
    }
    if (doc.document && doc.document.querySelectorAll) {
      return Array.from(doc.document.querySelectorAll('[class*="unify-"]'));
    }
    return [];
  }

  /**
   * Get class list from element
   * @private
   */
  _getClassList(element) {
    if (element.classList) {
      return Array.from(element.classList);
    }
    if (element.className) {
      return element.className.split(' ').filter(Boolean);
    }
    const classAttr = element.getAttribute && element.getAttribute('class');
    return classAttr ? classAttr.split(' ').filter(Boolean) : [];
  }

  /**
   * Check if element has a specific class
   * @private
   */
  _hasClass(element, className) {
    if (element.classList && element.classList.contains) {
      return element.classList.contains(className);
    }
    return this._getClassList(element).includes(className);
  }

  /**
   * Combine content from multiple elements preserving source order
   * @private
   * @param {Element[]} elements - Elements to combine
   * @returns {string} Combined content
   */
  _combineElementsContent(elements) {
    return elements.map(el => {
      if (el.innerHTML !== undefined) {
        return el.innerHTML;
      }
      if (el.textContent !== undefined) {
        return el.textContent;
      }
      return '';
    }).join('\n');
  }
}