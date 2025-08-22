/**
 * DOM Cascade Ordered Fill Matching Engine (US-004)
 * Implements DOM Cascade v1 ordered fill fallback matching
 */

import { ValidationError } from '../errors.js';

/**
 * @typedef {Object} OrderedFillMatcherOptions
 * @property {boolean} [enableWarnings=true] - Enable warnings for mixed usage patterns
 * @property {number} [maxDepth=10] - Maximum depth for nested matching
 */

/**
 * @typedef {Object} OrderedFillResult
 * @property {Array<OrderedFillMatch>} matches - Array of successful matches
 * @property {Array<AppendedElement>} appendedElements - Elements to append
 * @property {string[]} warnings - Array of warning messages
 * @property {string[]} errors - Array of error messages
 */

/**
 * @typedef {Object} OrderedFillMatch
 * @property {string} matchType - Type of match ('ordered-fill')
 * @property {number} index - Index in the matching sequence
 * @property {Element} layoutElement - Element from layout document
 * @property {Element[]} pageElements - Elements from page document
 * @property {string} pageContent - Combined content from page elements
 */

/**
 * @typedef {Object} AppendedElement
 * @property {Element} element - Element to append
 * @property {string} content - Content of the element
 * @property {number} index - Index in the original sequence
 */

/**
 * @typedef {Object} SectionValidationResult
 * @property {Element[]} eligibleSections - Sections eligible for ordered fill
 * @property {Element[]} excludedSections - Sections excluded due to area classes
 * @property {string[]} warnings - Validation warnings
 */

/**
 * OrderedFillMatcher implements ordered fill fallback matching per DOM Cascade v1
 * 
 * This matcher provides the lowest precedence matching in the DOM Cascade system.
 * When no area class or landmark matches are found, this matcher applies sequential
 * matching of page content to layout areas in document order.
 * 
 * Key behaviors:
 * - Maps main > section elements by index (1→1, 2→2, etc.)
 * - Appends extra page sections that have no layout counterpart
 * - Provides warnings when area classes exist but are unused
 * - Integrates with the precedence system by respecting excluded elements
 * 
 * @example
 * const matcher = new OrderedFillMatcher();
 * const result = matcher.matchOrderedFill(layoutDoc, pageDoc);
 * 
 * @since v0.6.0
 */
export class OrderedFillMatcher {
  /**
   * Default configuration constants
   * @private
   * @readonly
   */
  static DEFAULT_OPTIONS = {
    enableWarnings: true,
    maxDepth: 10
  };

  static MATCH_TYPE = 'ordered-fill';
  static UNIFY_PREFIX = 'unify-';
  static MAIN_TAG = 'main';
  static SECTION_TAG = 'section';

  /**
   * Creates a new OrderedFillMatcher instance
   * 
   * @param {OrderedFillMatcherOptions} options - Configuration options
   * @param {boolean} [options.enableWarnings=true] - Enable warnings for mixed usage patterns
   * @param {number} [options.maxDepth=10] - Maximum depth for nested matching
   */
  constructor(options = {}) {
    // Handle both old-style options and new config structure
    if (options && typeof options === 'object' && options.dom_cascade) {
      // New configuration structure
      this.config = this._mergeWithDefaults(options);
      this.areaPrefix = this.config.dom_cascade.area_prefix;
      this.options = OrderedFillMatcher.DEFAULT_OPTIONS;
    } else {
      // Legacy options structure or null/invalid options
      this.config = this._mergeWithDefaults({});
      this.areaPrefix = this.config.dom_cascade.area_prefix;
      this.options = {
        ...OrderedFillMatcher.DEFAULT_OPTIONS,
        ...this._validateOptions(options)
      };
    }
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
    
    if (options.enableWarnings !== undefined) {
      if (typeof options.enableWarnings !== 'boolean') {
        throw new ValidationError('enableWarnings must be a boolean');
      }
      validated.enableWarnings = options.enableWarnings;
    }

    if (options.maxDepth !== undefined) {
      if (typeof options.maxDepth !== 'number' || options.maxDepth < 0) {
        throw new ValidationError('maxDepth must be a non-negative number');
      }
      validated.maxDepth = options.maxDepth;
    }

    return validated;
  }

  /**
   * Match page content to layout areas using ordered fill fallback
   * 
   * Implements the ordered fill algorithm from DOM Cascade v1 specification:
   * - Map main > section elements by index
   * - Append extra page sections
   * - Provide warnings for unused area classes
   * 
   * @param {Document} layoutDoc - Layout document with areas to fill
   * @param {Document} pageDoc - Page document with content to place
   * @param {Object} [options={}] - Matching options
   * @param {Set<Element>} [options.excludedElements] - Elements already matched to skip
   * @returns {OrderedFillResult} Ordered fill matching results
   * @throws {ValidationError} If documents are invalid
   */
  matchOrderedFill(layoutDoc, pageDoc, options = {}) {
    const result = {
      matches: [],
      appendedElements: [],
      warnings: [],
      errors: []
    };

    try {
      // Validate inputs
      this._validateDocuments(layoutDoc, pageDoc);

      const excludedElements = options.excludedElements || new Set();

      // Find sections within main elements for both documents
      const layoutSections = this.findMainSections(layoutDoc);
      const pageSections = this.findMainSections(pageDoc);

      // Filter out excluded elements
      const eligibleLayoutSections = layoutSections.filter(section => 
        !excludedElements.has(section)
      );

      // Handle warnings for multiple main elements
      this._validateMultipleMainElements(layoutDoc, pageDoc, result);

      // Validate sections for ordered fill usage patterns
      this._validateOrderedFillUsage(layoutSections, pageSections, result);

      // Perform the ordered fill matching
      this._performOrderedFillMatching(eligibleLayoutSections, pageSections, result);

    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      result.errors.push(`Ordered fill matching failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Find all section elements within main elements
   * 
   * @param {Document} doc - Document to search
   * @returns {Element[]} Array of section elements within main elements
   */
  findMainSections(doc) {
    const sections = [];
    
    if (!doc || typeof doc.getElementsByTagName !== 'function') {
      return sections;
    }

    try {
      const mainElements = doc.getElementsByTagName(OrderedFillMatcher.MAIN_TAG);
      
      if (mainElements.length === 0) {
        return sections;
      }

      // Get all sections in the document
      const allSections = doc.getElementsByTagName(OrderedFillMatcher.SECTION_TAG);
      
      // For each main element, find sections that appear to be nested within it
      for (const mainElement of mainElements) {
        for (const section of allSections) {
          // Check if this section's outerHTML is contained within the main's innerHTML
          // This is a simplified check - in a full implementation we'd parse the DOM tree properly
          if (mainElement.innerHTML && mainElement.innerHTML.includes(section.outerHTML)) {
            // Avoid duplicates
            if (!sections.includes(section)) {
              sections.push(section);
            }
          }
        }
      }
    } catch (error) {
      // Silently handle parsing errors - return empty array
    }

    return sections;
  }

  /**
   * Validate sections for proper ordered fill usage
   * 
   * Checks for mixed usage patterns and provides appropriate warnings
   * according to DOM Cascade v1 linter rule U008.
   * 
   * @param {Element[]} sections - Sections to validate
   * @returns {SectionValidationResult} Validation results
   */
  validateSectionsForOrderedFill(sections) {
    const result = {
      eligibleSections: [],
      excludedSections: [],
      warnings: []
    };

    for (const section of sections) {
      const hasAreaClass = Array.from(section.classList).some(cls => 
        cls.startsWith(this.areaPrefix)
      );

      if (hasAreaClass) {
        result.excludedSections.push(section);
      } else {
        result.eligibleSections.push(section);
      }
    }

    // Warn about mixed usage patterns (U008)
    if (result.eligibleSections.length > 0 && result.excludedSections.length > 0) {
      result.warnings.push(
        'Ordered fill used while public areas exist unused - consider using explicit area classes for all sections'
      );
    }

    return result;
  }

  /**
   * Validate that documents are proper for ordered fill matching
   * @private
   * @param {Document} layoutDoc - Layout document
   * @param {Document} pageDoc - Page document
   * @throws {ValidationError} If documents are invalid
   */
  _validateDocuments(layoutDoc, pageDoc) {
    if (!layoutDoc || !pageDoc) {
      throw new ValidationError('Both layout and page documents are required');
    }

    if (typeof layoutDoc.getElementsByTagName !== 'function' ||
        typeof pageDoc.getElementsByTagName !== 'function') {
      throw new ValidationError('Documents must have getElementsByTagName method');
    }
  }

  /**
   * Validate and warn about multiple main elements
   * @private
   * @param {Document} layoutDoc - Layout document
   * @param {Document} pageDoc - Page document
   * @param {OrderedFillResult} result - Result object to populate
   */
  _validateMultipleMainElements(layoutDoc, pageDoc, result) {
    if (!this.options.enableWarnings) return;

    try {
      const layoutMainCount = layoutDoc.getElementsByTagName(OrderedFillMatcher.MAIN_TAG).length;
      const pageMainCount = pageDoc.getElementsByTagName(OrderedFillMatcher.MAIN_TAG).length;

      if (layoutMainCount > 1 || pageMainCount > 1) {
        result.warnings.push(
          'Multiple main elements detected - ordered fill matching may produce unexpected results'
        );
      }
    } catch (error) {
      // Ignore validation errors in warning generation - these are non-critical
    }
  }

  /**
   * Validate ordered fill usage patterns and add appropriate warnings
   * @private
   * @param {Element[]} layoutSections - Layout sections
   * @param {Element[]} pageSections - Page sections  
   * @param {OrderedFillResult} result - Result object to populate
   */
  _validateOrderedFillUsage(layoutSections, pageSections, result) {
    if (!this.options.enableWarnings) return;

    try {
      // Check for unused area classes in layout (U008 warning)
      const unusedAreaClasses = this._findUnusedAreaClasses(layoutSections);
      if (unusedAreaClasses.length > 0) {
        result.warnings.push(
          `Unused area classes detected: ${unusedAreaClasses.join(', ')} - consider removing unused classes or using explicit area matching`
        );
      }
    } catch (error) {
      // Ignore validation errors in warning generation - these are non-critical
    }
  }

  /**
   * Find area classes that are unused in the layout
   * @private
   * @param {Element[]} sections - Sections to check
   * @returns {string[]} Array of unused area class names
   */
  _findUnusedAreaClasses(sections) {
    const areaClasses = [];
    
    for (const section of sections) {
      for (const className of section.classList) {
        if (className.startsWith(this.areaPrefix)) {
          areaClasses.push(className);
        }
      }
    }

    return [...new Set(areaClasses)];
  }

  /**
   * Perform the actual ordered fill matching algorithm
   * @private
   * @param {Element[]} layoutSections - Layout sections to fill
   * @param {Element[]} pageSections - Page sections to use as content
   * @param {OrderedFillResult} result - Result object to populate
   */
  _performOrderedFillMatching(layoutSections, pageSections, result) {
    // Match sections by index (1→1, 2→2, etc.)
    const maxMatches = Math.min(layoutSections.length, pageSections.length);
    
    let matchIndex = 0;
    for (let i = 0; i < maxMatches; i++) {
      const match = {
        matchType: OrderedFillMatcher.MATCH_TYPE,
        index: matchIndex,
        layoutElement: layoutSections[i],
        pageElements: [pageSections[i]],
        pageContent: pageSections[i].innerHTML
      };

      result.matches.push(match);
      matchIndex++;
    }

    // Handle extra page sections (append them)
    if (pageSections.length > layoutSections.length) {
      for (let i = layoutSections.length; i < pageSections.length; i++) {
        const appendedElement = {
          element: pageSections[i],
          content: pageSections[i].innerHTML,
          index: i
        };

        result.appendedElements.push(appendedElement);
      }
    }
  }
}