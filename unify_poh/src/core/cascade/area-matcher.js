/**
 * DOM Cascade Area Matching Engine
 * Implements DOM Cascade v1 area matching precedence and composition rules
 */

import { LandmarkMatcher } from './landmark-matcher.js';
import { OrderedFillMatcher } from './ordered-fill-matcher.js';

/**
 * AreaMatcher implements the core DOM Cascade v1 area matching algorithm
 * Precedence: Area class match > Landmark fallback > Ordered fill
 */
export class AreaMatcher {
  constructor(config = {}) {
    this.landmarkElements = new Set(['header', 'nav', 'main', 'aside', 'footer']);
    this.config = this._mergeWithDefaults(config);
    this.unifyPrefix = this.config.dom_cascade.area_prefix;
    this.landmarkMatcher = new LandmarkMatcher(config);
    this.orderedFillMatcher = new OrderedFillMatcher(config);
  }

  /**
   * Merge user config with default configuration
   * @private
   * @param {Object} userConfig - User configuration
   * @returns {Object} Merged configuration
   */
  _mergeWithDefaults(userConfig) {
    const defaultConfig = {
      dom_cascade: {
        area_prefix: 'unify-'
      }
    };

    return {
      dom_cascade: {
        ...defaultConfig.dom_cascade,
        ...(userConfig.dom_cascade || {})
      }
    };
  }

  /**
   * Get the configured area prefix
   * @private
   * @returns {string} Area prefix
   */
  _getAreaPrefix() {
    return this.unifyPrefix;
  }

  /**
   * Check if element has an area class with the configured prefix
   * @private
   * @param {Element} element - Element to check
   * @param {string} prefix - Prefix to check for
   * @returns {boolean} True if element has area class
   */
  _hasAreaClass(element, prefix) {
    return element.classList.some(cls => cls.startsWith(prefix));
  }

  /**
   * Match page content to layout areas following DOM Cascade v1 precedence
   * @param {Document} layoutDoc - Layout document with areas to fill
   * @param {Document} pageDoc - Page document with content to place
   * @returns {MatchResult} Matching results with precedence applied
   */
  matchAreas(layoutDoc, pageDoc) {
    const result = {
      matches: [],
      appendedElements: [],
      warnings: [],
      errors: []
    };

    try {
      // Phase 1: Area class matching (highest precedence)
      this._matchAreaClasses(layoutDoc, pageDoc, result);
      
      // Phase 2: Landmark fallback matching (medium precedence)
      this._matchLandmarks(layoutDoc, pageDoc, result);
      
      // Phase 3: Ordered fill fallback (lowest precedence)
      this._matchOrderedFill(layoutDoc, pageDoc, result);
      
    } catch (error) {
      result.errors.push(`Area matching failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Match areas within a specific scope (prevents cross-scope targeting)
   * @param {Document} layoutDoc - Layout document
   * @param {Document} pageDoc - Page document
   * @param {string} scope - Scope identifier
   * @returns {MatchResult} Scoped matching results
   */
  matchAreasInScope(layoutDoc, pageDoc, scope) {
    const result = {
      matches: [],
      appendedElements: [],
      warnings: [],
      errors: []
    };

    if (!scope || typeof scope !== 'string') {
      result.errors.push('Invalid scope identifier provided');
      return result;
    }

    try {
      // Find scope elements in both documents
      const layoutScopeElements = this._findElementsInScope(layoutDoc, scope);
      const pageScopeElements = this._findElementsInScope(pageDoc, scope);

      if (layoutScopeElements.length === 0) {
        result.warnings.push(`No elements found in scope '${scope}' in layout document`);
        return result;
      }

      if (pageScopeElements.length === 0) {
        result.warnings.push(`No elements found in scope '${scope}' in page document`);
        return result;
      }

      // Create temporary documents containing only scoped elements for matching
      const scopedLayoutDoc = this._createScopedDocument(layoutDoc, layoutScopeElements);
      const scopedPageDoc = this._createScopedDocument(pageDoc, pageScopeElements);

      // Apply standard matching within the scope
      const scopedResult = this.matchAreas(scopedLayoutDoc, scopedPageDoc);
      
      // Mark all matches as scoped
      for (const match of scopedResult.matches) {
        match.scope = scope;
        match.scopeRestricted = true;
      }

      // Merge results
      result.matches = scopedResult.matches;
      result.appendedElements = scopedResult.appendedElements;
      result.warnings.push(...scopedResult.warnings);
      result.errors.push(...scopedResult.errors);

    } catch (error) {
      result.errors.push(`Scoped matching failed for scope '${scope}': ${error.message}`);
    }

    return result;
  }

  /**
   * Find elements within a specific scope
   * @private
   * @param {Document} doc - Document to search
   * @param {string} scope - Scope identifier
   * @returns {Element[]} Elements within scope
   */
  _findElementsInScope(doc, scope) {
    const scopedElements = [];
    const allElements = doc.getAllElements();

    for (const element of allElements) {
      // Check if element has scope attribute or class
      if (element.getAttribute('data-scope') === scope ||
          element.classList.contains(`scope-${scope}`) ||
          element.hasAttribute(`data-${scope}-scope`)) {
        scopedElements.push(element);
      }
    }

    return scopedElements;
  }

  /**
   * Create a document containing only elements from specified scope
   * @private
   * @param {Document} sourceDoc - Source document
   * @param {Element[]} scopedElements - Elements within scope
   * @returns {Document} New document with scoped elements
   */
  _createScopedDocument(sourceDoc, scopedElements) {
    // This is a simplified implementation - in a real scenario
    // you'd create a proper DOM document structure
    return {
      getUnifyElements: () => scopedElements.filter(el => 
        el.classList.some(cls => cls.startsWith(this.unifyPrefix))
      ),
      getAllElements: () => scopedElements
    };
  }

  /**
   * Validate that scope boundaries are maintained
   * @param {Document} doc - Document to validate
   * @returns {ScopeValidationResult} Validation results
   */
  validateScopeBoundaries(doc) {
    const result = {
      scopeViolations: [],
      isValid: true
    };

    try {
      const allElements = doc.getAllElements();
      const scopeMap = new Map(); // scope -> elements
      const elementScopes = new Map(); // element -> scopes

      // First pass: identify all scoped elements
      for (const element of allElements) {
        const scopes = this._getElementScopes(element);
        
        for (const scope of scopes) {
          if (!scopeMap.has(scope)) {
            scopeMap.set(scope, []);
          }
          scopeMap.get(scope).push(element);
          
          if (!elementScopes.has(element)) {
            elementScopes.set(element, []);
          }
          elementScopes.get(element).push(scope);
        }
      }

      // Second pass: validate scope boundaries
      for (const [scope, elements] of scopeMap) {
        const violations = this._validateScopeIntegrity(scope, elements, allElements);
        result.scopeViolations.push(...violations);
      }

      // Check for cross-scope violations
      for (const [element, scopes] of elementScopes) {
        if (scopes.length > 1) {
          result.scopeViolations.push({
            type: 'cross-scope',
            element: element.tagName,
            scopes: scopes,
            message: `Element belongs to multiple scopes: ${scopes.join(', ')}`
          });
        }
      }

      result.isValid = result.scopeViolations.length === 0;

    } catch (error) {
      result.scopeViolations.push({
        type: 'validation-error',
        message: `Scope validation failed: ${error.message}`
      });
      result.isValid = false;
    }

    return result;
  }

  /**
   * Get all scopes that an element belongs to
   * @private
   * @param {Element} element - Element to check
   * @returns {string[]} Array of scope identifiers
   */
  _getElementScopes(element) {
    const scopes = [];

    // Check data-scope attribute
    const dataScope = element.getAttribute('data-scope');
    if (dataScope) {
      scopes.push(dataScope);
    }

    // Check scope-* classes
    for (const className of element.classList) {
      if (className.startsWith('scope-')) {
        scopes.push(className.substring(6)); // Remove 'scope-' prefix
      }
    }

    // Check data-*-scope attributes
    for (const attr of element.attributes) {
      if (attr.name.endsWith('-scope')) {
        const scopeName = attr.name.substring(5, attr.name.length - 6); // Remove 'data-' prefix and '-scope' suffix
        if (scopeName) {
          scopes.push(scopeName);
        }
      }
    }

    return scopes;
  }

  /**
   * Validate integrity of a specific scope
   * @private
   * @param {string} scope - Scope identifier
   * @param {Element[]} scopedElements - Elements in this scope
   * @param {Element[]} allElements - All elements in document
   * @returns {Object[]} Array of violations found
   */
  _validateScopeIntegrity(scope, scopedElements, allElements) {
    const violations = [];

    // Check for orphaned scope references
    for (const element of allElements) {
      // Look for area classes that reference this scope but aren't in it
      for (const className of element.classList) {
        if (className.includes(`-${scope}-`) || className.endsWith(`-${scope}`)) {
          if (!scopedElements.includes(element)) {
            violations.push({
              type: 'orphaned-reference',
              element: element.tagName,
              scope: scope,
              className: className,
              message: `Element references scope '${scope}' but is not within it`
            });
          }
        }
      }
    }

    // Check for scope containment violations
    for (const element of scopedElements) {
      let hasValidParent = false;
      let parent = element.parentElement;
      
      while (parent) {
        if (this._getElementScopes(parent).includes(scope)) {
          hasValidParent = true;
          break;
        }
        parent = parent.parentElement;
      }

      // Root elements in scope are allowed
      if (!hasValidParent && element.parentElement) {
        violations.push({
          type: 'scope-containment',
          element: element.tagName,
          scope: scope,
          message: `Element in scope '${scope}' has no scoped parent`
        });
      }
    }

    return violations;
  }

  /**
   * Validate area class uniqueness within scopes
   * @param {Document} doc - Document to validate
   * @returns {UniquenessValidationResult} Validation results
   */
  validateAreaUniqueness(doc) {
    const areaCounts = new Map();
    const unifyElements = doc.getUnifyElements();

    // Count occurrences of each unify class
    for (const element of unifyElements) {
      for (const className of element.classList) {
        if (className.startsWith(this.unifyPrefix)) {
          areaCounts.set(className, (areaCounts.get(className) || 0) + 1);
        }
      }
    }

    const duplicates = [];
    for (const [className, count] of areaCounts) {
      if (count > 1) {
        duplicates.push({ className, count });
      }
    }

    return {
      duplicates,
      isValid: duplicates.length === 0
    };
  }

  /**
   * Find all area classes in a document
   * @param {Document} doc - Document to search
   * @returns {AreaClassResult} Area classes found
   */
  findAreaClasses(doc) {
    const areaClasses = [];
    const nonUnifyClasses = [];
    
    const allElements = doc.getAllElements();
    
    for (const element of allElements) {
      for (const className of element.classList) {
        if (className.startsWith(this.unifyPrefix)) {
          areaClasses.push(className);
        } else {
          nonUnifyClasses.push(className);
        }
      }
    }

    return {
      areaClasses: [...new Set(areaClasses)],
      nonUnifyClasses: [...new Set(nonUnifyClasses)]
    };
  }

  /**
   * Phase 1: Match by area classes (highest precedence)
   * @private
   */
  _matchAreaClasses(layoutDoc, pageDoc, result) {
    const layoutUnifyElements = layoutDoc.getUnifyElements();
    const pageUnifyElements = pageDoc.getUnifyElements();

    for (const layoutElement of layoutUnifyElements) {
      for (const className of layoutElement.classList) {
        if (!className.startsWith(this.unifyPrefix)) continue;

        // Find matching page elements
        const matchingPageElements = pageUnifyElements.filter(pageEl =>
          pageEl.classList.contains(className)
        );

        if (matchingPageElements.length > 0) {
          const match = {
            matchType: 'area-class',
            targetClass: className,
            layoutElement,
            pageElements: matchingPageElements,
            pageContent: this._combineElementsContent(matchingPageElements),
            combinedContent: this._combineElementsContent(matchingPageElements)
          };

          result.matches.push(match);
        }
      }
    }
  }

  /**
   * Phase 2: Match by landmark elements (medium precedence)
   * @private
   */
  _matchLandmarks(layoutDoc, pageDoc, result) {
    // Collect area classes that were already matched to skip them in landmark matching
    const matchedClasses = new Set(result.matches.map(m => m.targetClass));

    try {
      // Use the dedicated LandmarkMatcher for sophisticated landmark matching
      const landmarkResult = this.landmarkMatcher.matchLandmarks(layoutDoc, pageDoc, {
        excludeMatchedClasses: matchedClasses
      });

      // Merge landmark matches into the main result
      result.matches.push(...landmarkResult.matches);
      result.warnings.push(...landmarkResult.warnings);
      result.errors.push(...landmarkResult.errors);

    } catch (error) {
      result.errors.push(`Landmark matching failed: ${error.message}`);
    }
  }

  /**
   * Phase 3: Match by ordered fill (lowest precedence)
   * @private
   */
  _matchOrderedFill(layoutDoc, pageDoc, result) {
    try {
      // Collect elements already matched by previous phases to exclude them
      const excludedElements = new Set();
      for (const match of result.matches) {
        excludedElements.add(match.layoutElement);
      }

      // Use the dedicated OrderedFillMatcher for sophisticated ordered fill matching
      const orderedFillResult = this.orderedFillMatcher.matchOrderedFill(layoutDoc, pageDoc, {
        excludedElements
      });

      // Merge ordered fill matches into the main result
      result.matches.push(...orderedFillResult.matches);
      result.appendedElements.push(...orderedFillResult.appendedElements);
      result.warnings.push(...orderedFillResult.warnings);
      result.errors.push(...orderedFillResult.errors);

    } catch (error) {
      result.errors.push(`Ordered fill matching failed: ${error.message}`);
    }
  }

  /**
   * Combine content from multiple elements preserving source order
   * @private
   * @param {Element[]} elements - Elements to combine
   * @returns {string} Combined content
   */
  _combineElementsContent(elements) {
    return elements.map(el => el.innerHTML).join('\n');
  }
}