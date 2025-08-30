/**
 * DOM Cascade Landmark Fallback Matching Engine (US-003)
 * Implements DOM Cascade v1 landmark fallback matching
 */

import { ValidationError } from '../errors.js';

/**
 * @typedef {Object} LandmarkMatcherOptions
 * @property {boolean} [enableAmbiguousWarnings=true] - Enable warnings for ambiguous landmarks
 * @property {boolean} [requireSectioningRoot=false] - Require sectioning root context matching
 */

/**
 * @typedef {Object} LandmarkResult
 * @property {Element[]} header - Header landmark elements
 * @property {Element[]} nav - Navigation landmark elements
 * @property {Element[]} main - Main content landmark elements  
 * @property {Element[]} aside - Aside/sidebar landmark elements
 * @property {Element[]} footer - Footer landmark elements
 */

/**
 * @typedef {Object} MatchingOptions
 * @property {Set<string>} [excludeMatchedClasses] - Area classes already matched to skip
 */

/**
 * @typedef {Object} MatchResult
 * @property {Array<LandmarkMatch>} matches - Array of successful matches
 * @property {string[]} warnings - Array of warning messages
 * @property {string[]} errors - Array of error messages
 */

/**
 * @typedef {Object} LandmarkMatch
 * @property {string} matchType - Type of match ('landmark' or 'semantic')
 * @property {string} landmarkType - Type of landmark (header, nav, main, aside, footer)
 * @property {Element} layoutElement - Element from layout document
 * @property {Element[]} pageElements - Elements from page document
 * @property {string} pageContent - Combined content from page elements
 * @property {number} confidence - Confidence score (0-1)
 * @property {number} [sectioningContext] - Sectioning context index if applicable
 */

/**
 * @typedef {Object} PrecedenceResult
 * @property {Array} areaMatches - Area class matches found
 * @property {Array} landmarkMatches - Landmark matches found
 * @property {Array} orderedFillMatches - Ordered fill matches found
 * @property {string} precedence - Precedence determination
 */

/**
 * LandmarkMatcher implements landmark fallback matching per DOM Cascade v1
 * Precedence: Area class match > Landmark fallback > Ordered fill
 * 
 * This class handles the second phase of DOM matching when area classes are not available.
 * It matches content based on unique HTML5 landmark elements within sectioning contexts,
 * providing semantic fallback behavior for well-structured HTML documents.
 * 
 * @example
 * const matcher = new LandmarkMatcher();
 * const result = matcher.matchLandmarks(layoutDoc, pageDoc);
 * 
 * @since v0.6.0
 */
export class LandmarkMatcher {
  /**
   * Creates a new LandmarkMatcher instance
   * 
   * @param {LandmarkMatcherOptions} options - Configuration options
   * @param {boolean} [options.enableAmbiguousWarnings=true] - Enable warnings for ambiguous landmarks
   * @param {boolean} [options.requireSectioningRoot=false] - Require sectioning root context matching
   */
  constructor(options = {}) {
    /** @private @type {Set<string>} HTML5 landmark elements */
    this.landmarkElements = new Set(['header', 'nav', 'main', 'aside', 'footer']);
    
    /** @private @type {Set<string>} All semantic elements including landmarks */
    this.semanticElements = new Set(['article', 'section', 'header', 'nav', 'main', 'aside', 'footer']);
    
    // Hardcoded configuration - external config loading removed
    this.config = {
      dom_cascade: {
        area_prefix: 'unify-'
      }
    };
    this.areaPrefix = this.config.dom_cascade.area_prefix;
    this.options = {
      enableAmbiguousWarnings: true,
      requireSectioningRoot: false,
      ...this._validateOptions(options)
    };
  }


  /**
   * Validate constructor options
   * @private
   * @param {Object} options - Options to validate
   * @returns {Object} Validated options
   * @throws {ValidationError} If options are invalid
   */
  _validateOptions(options) {
    if (typeof options !== 'object' || options === null) {
      throw new ValidationError('Options must be an object');
    }

    const validated = {};
    
    if (options.enableAmbiguousWarnings !== undefined) {
      if (typeof options.enableAmbiguousWarnings !== 'boolean') {
        throw new ValidationError('enableAmbiguousWarnings must be a boolean');
      }
      validated.enableAmbiguousWarnings = options.enableAmbiguousWarnings;
    }

    if (options.requireSectioningRoot !== undefined) {
      if (typeof options.requireSectioningRoot !== 'boolean') {
        throw new ValidationError('requireSectioningRoot must be a boolean');
      }
      validated.requireSectioningRoot = options.requireSectioningRoot;
    }

    return validated;
  }

  /**
   * Find all HTML5 landmark elements in a document
   * 
   * Searches for header, nav, main, aside, and footer elements within the document,
   * providing the foundation for landmark-based matching.
   * 
   * @param {Document} doc - Document to search for landmarks
   * @returns {LandmarkResult} Object containing arrays of found landmarks by type
   * @throws {ValidationError} If document is invalid
   * 
   * @example
   * const landmarks = matcher.findLandmarks(doc);
   * console.log(`Found ${landmarks.main.length} main elements`);
   */
  findLandmarks(doc) {
    if (!doc || typeof doc.getElementsByTagName !== 'function') {
      throw new ValidationError('Invalid document provided - must have getElementsByTagName method');
    }

    const landmarks = {
      header: [],
      nav: [],
      main: [],
      aside: [],
      footer: []
    };

    try {
      for (const landmarkType of this.landmarkElements) {
        landmarks[landmarkType] = doc.getElementsByTagName(landmarkType);
      }
    } catch (error) {
      throw new ValidationError(`Failed to find landmarks: ${error.message}`);
    }

    return landmarks;
  }

  /**
   * Match page landmarks to layout landmarks following DOM Cascade v1 rules
   * 
   * Implements the landmark fallback matching phase of DOM Cascade v1, which activates
   * when no area class matches are found. Matches unique landmark elements between
   * layout and page documents according to semantic HTML5 roles.
   * 
   * @param {Document} layoutDoc - Layout document containing landmark placeholders
   * @param {Document} pageDoc - Page document containing content to place
   * @param {MatchingOptions} [options={}] - Matching configuration options
   * @param {Set<string>} [options.excludeMatchedClasses] - Area classes already matched to skip
   * @returns {MatchResult} Landmark matching results with matches, warnings, and errors
   * @throws {ValidationError} If documents are invalid
   * 
   * @example
   * const result = matcher.matchLandmarks(layoutDoc, pageDoc);
   * console.log(`Found ${result.matches.length} landmark matches`);
   * if (result.warnings.length > 0) {
   *   console.warn('Warnings:', result.warnings);
   * }
   */
  matchLandmarks(layoutDoc, pageDoc, options = {}) {
    const result = {
      matches: [],
      warnings: [],
      errors: []
    };

    try {
      // Validate inputs
      if (!layoutDoc || !pageDoc) {
        result.errors.push('Invalid documents provided for landmark matching');
        return result;
      }

      const excludeMatchedClasses = options.excludeMatchedClasses || new Set();
      
      const layoutLandmarks = this.findLandmarks(layoutDoc);
      const pageLandmarks = this.findLandmarks(pageDoc);

      // Process each landmark type
      for (const landmarkType of this.landmarkElements) {
        this._matchLandmarkType(
          landmarkType,
          layoutLandmarks[landmarkType],
          pageLandmarks[landmarkType],
          excludeMatchedClasses,
          result
        );
      }

    } catch (error) {
      result.errors.push(`Landmark matching failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Match semantic elements (broader than just landmarks)
   * @param {Document} layoutDoc - Layout document
   * @param {Document} pageDoc - Page document
   * @returns {MatchResult} Semantic matching results
   */
  matchSemanticElements(layoutDoc, pageDoc) {
    const result = {
      matches: [],
      warnings: [],
      errors: []
    };

    if (!layoutDoc || !pageDoc) {
      result.errors.push('Invalid documents provided for semantic matching');
      return result;
    }

    for (const tagName of this.semanticElements) {
      const layoutElements = layoutDoc.getElementsByTagName(tagName);
      const pageElements = pageDoc.getElementsByTagName(tagName);

      if (layoutElements.length > 0 && pageElements.length > 0) {
        const match = {
          matchType: 'semantic',
          tagName,
          layoutElement: layoutElements[0],
          pageElements: [pageElements[0]],
          pageContent: pageElements[0].innerHTML,
          confidence: this._calculateSemanticConfidence(tagName)
        };

        result.matches.push(match);
      }
    }

    return result;
  }

  /**
   * Get matching precedence analysis for debugging/testing
   * @param {Document} layoutDoc - Layout document
   * @param {Document} pageDoc - Page document
   * @returns {PrecedenceResult} Precedence analysis results
   */
  getMatchingPrecedence(layoutDoc, pageDoc) {
    const result = {
      areaMatches: [],
      landmarkMatches: [],
      orderedFillMatches: [],
      precedence: 'none'
    };

    // Simulate area matches (would come from AreaMatcher)
    const layoutUnifyElements = layoutDoc.getUnifyElements?.() || [];
    const pageUnifyElements = pageDoc.getUnifyElements?.() || [];
    
    for (const layoutEl of layoutUnifyElements) {
      for (const className of layoutEl.classList) {
        if (className.startsWith(this.areaPrefix)) {
          const matchingPageElements = pageUnifyElements.filter(pageEl =>
            pageEl.classList.contains(className)
          );
          if (matchingPageElements.length > 0) {
            result.areaMatches.push({ className, count: matchingPageElements.length });
          }
        }
      }
    }

    // Get landmark matches (excluding those with area classes)
    const excludeMatchedClasses = new Set(result.areaMatches.map(m => m.className));
    const landmarkResult = this.matchLandmarks(layoutDoc, pageDoc, { excludeMatchedClasses });
    result.landmarkMatches = landmarkResult.matches;

    // Determine precedence
    if (result.areaMatches.length > 0 && result.landmarkMatches.length > 0) {
      result.precedence = 'area-over-landmark';
    } else if (result.landmarkMatches.length > 0) {
      result.precedence = 'landmark-over-ordered-fill';
    } else if (result.areaMatches.length > 0) {
      result.precedence = 'area-only';
    }

    return result;
  }

  /**
   * Match a specific landmark type between layout and page
   * @private
   * @param {string} landmarkType - Type of landmark to match
   * @param {Element[]} layoutElements - Layout elements of this type
   * @param {Element[]} pageElements - Page elements of this type
   * @param {Set} excludeMatchedClasses - Classes already matched by area matching
   * @param {MatchResult} result - Result object to populate
   */
  _matchLandmarkType(landmarkType, layoutElements, pageElements, excludeMatchedClasses, result) {
    if (layoutElements.length === 0 || pageElements.length === 0) {
      return; // No match possible
    }

    // Check if layout elements have area classes that are already matched
    const availableLayoutElements = layoutElements.filter(el =>
      !Array.from(el.classList).some(cls =>
        cls.startsWith(this.areaPrefix) && excludeMatchedClasses.has(cls)
      )
    );

    if (availableLayoutElements.length === 0) {
      return; // All layout elements already matched by area classes
    }

    // Handle sectioning root context if enabled
    if (this.options.requireSectioningRoot) {
      this._matchLandmarkWithinSectioningRoots(
        landmarkType, 
        availableLayoutElements, 
        pageElements, 
        result
      );
    } else {
      // Standard matching - warn about ambiguous landmarks
      if (this.options.enableAmbiguousWarnings) {
        if (availableLayoutElements.length > 1) {
          result.warnings.push(`Ambiguous landmark matching: multiple <${landmarkType}> elements found in layout`);
        }
        if (pageElements.length > 1) {
          result.warnings.push(`Ambiguous landmark matching: multiple <${landmarkType}> elements found in page`);
        }
      }

      // Create match using first elements when ambiguous
      const match = {
        matchType: 'landmark',
        landmarkType,
        layoutElement: availableLayoutElements[0],
        pageElements: [pageElements[0]],
        pageContent: pageElements[0].innerHTML,
        confidence: this._calculateLandmarkConfidence(landmarkType)
      };

      result.matches.push(match);
    }
  }

  /**
   * Match landmarks within sectioning root contexts
   * @private
   * @param {string} landmarkType - Type of landmark to match
   * @param {Element[]} layoutElements - Layout elements of this type
   * @param {Element[]} pageElements - Page elements of this type
   * @param {MatchResult} result - Result object to populate
   */
  _matchLandmarkWithinSectioningRoots(landmarkType, layoutElements, pageElements, result) {
    // For sectioning root matching, we try to match landmarks within the same context
    // For simplicity, we'll match by index but in practice this would involve
    // analyzing the DOM tree structure to find sectioning roots
    
    const maxMatches = Math.min(layoutElements.length, pageElements.length);
    
    for (let i = 0; i < maxMatches; i++) {
      const match = {
        matchType: 'landmark',
        landmarkType,
        layoutElement: layoutElements[i],
        pageElements: [pageElements[i]],
        pageContent: pageElements[i].innerHTML,
        confidence: this._calculateLandmarkConfidence(landmarkType),
        sectioningContext: i // Indicate which sectioning context this belongs to
      };

      result.matches.push(match);
    }
  }

  /**
   * Calculate confidence score for landmark matching
   * @private
   * @param {string} landmarkType - Type of landmark
   * @returns {number} Confidence score (0-1)
   */
  _calculateLandmarkConfidence(landmarkType) {
    // Priority landmarks get higher confidence
    const priorities = {
      'main': 0.9,
      'header': 0.8,
      'footer': 0.8,
      'nav': 0.7,
      'aside': 0.6
    };
    
    return priorities[landmarkType] || 0.5;
  }

  /**
   * Calculate confidence score for semantic element matching
   * @private
   * @param {string} tagName - Tag name
   * @returns {number} Confidence score (0-1)
   */
  _calculateSemanticConfidence(tagName) {
    if (this.landmarkElements.has(tagName)) {
      return this._calculateLandmarkConfidence(tagName);
    }
    
    // Other semantic elements get lower confidence
    const semanticPriorities = {
      'article': 0.7,
      'section': 0.6
    };
    
    return semanticPriorities[tagName] || 0.4;
  }
}