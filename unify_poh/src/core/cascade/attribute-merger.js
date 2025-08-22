/**
 * DOM Cascade Attribute Merging Engine
 * Implements DOM Cascade v1 page-wins attribute merging with special handling
 */

/**
 * AttributeMerger implements DOM Cascade v1 attribute merging rules
 * Page wins except for ID (stability) and class (union merge)
 */
export class AttributeMerger {
  constructor() {
    this.specialAttributes = new Set(['id', 'class', 'data-unify', 'data-layer']);
    this.removedAttributes = new Set(['data-unify', 'data-layer']);
  }

  /**
   * Merge attributes from layout and page elements following DOM Cascade v1 rules
   * @param {Object} layoutElement - Layout element with attributes
   * @param {Object} pageElement - Page element with attributes
   * @returns {Object} Merged attributes object
   */
  mergeAttributes(layoutElement, pageElement) {
    const layoutAttrs = this._normalizeAttributes(layoutElement?.attributes);
    const pageAttrs = this._normalizeAttributes(pageElement?.attributes);
    
    const merged = {};

    // Start with layout attributes as base
    for (const [name, value] of Object.entries(layoutAttrs)) {
      if (!this.removedAttributes.has(name)) {
        merged[name] = value;
      }
    }

    // Apply page attributes with special rules
    for (const [name, value] of Object.entries(pageAttrs)) {
      if (this.removedAttributes.has(name)) {
        // Skip removed attributes like data-unify
        continue;
      } else if (name === 'id') {
        // ID stability: layout ID wins if present, otherwise use page ID
        if (!layoutAttrs.id) {
          merged.id = value;
        }
        // If layout has ID, keep it (already set above)
      } else if (name === 'class') {
        // Class union merge: combine layout + page classes
        merged.class = this._mergeClasses(layoutAttrs.class, value);
      } else {
        // Page-wins rule for all other attributes
        merged[name] = value;
      }
    }

    // Clean up undefined/null values
    return this._cleanAttributes(merged);
  }

  /**
   * Normalize attributes object, handling null/undefined cases
   * @private
   * @param {Object|null|undefined} attributes - Attributes to normalize
   * @returns {Object} Normalized attributes object
   */
  _normalizeAttributes(attributes) {
    if (!attributes || typeof attributes !== 'object') {
      return {};
    }

    const normalized = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined) {
        normalized[key] = String(value);
      }
    }

    return normalized;
  }

  /**
   * Merge class attributes with deduplication
   * @private
   * @param {string} layoutClasses - Layout class string
   * @param {string} pageClasses - Page class string
   * @returns {string} Merged class string
   */
  _mergeClasses(layoutClasses, pageClasses) {
    const layoutClassList = this._parseClasses(layoutClasses);
    const pageClassList = this._parseClasses(pageClasses);
    
    // Combine with layout classes first, then page classes
    const combined = [...layoutClassList, ...pageClassList];
    
    // Deduplicate while preserving order
    const seen = new Set();
    const deduped = [];
    
    for (const className of combined) {
      if (!seen.has(className)) {
        seen.add(className);
        deduped.push(className);
      }
    }
    
    return deduped.join(' ');
  }

  /**
   * Parse class string into array of class names
   * @private
   * @param {string} classString - Space-separated class names
   * @returns {string[]} Array of class names
   */
  _parseClasses(classString) {
    if (!classString || typeof classString !== 'string') {
      return [];
    }
    
    return classString.trim().split(/\s+/).filter(cls => cls.length > 0);
  }

  /**
   * Clean attributes object, removing null/undefined values
   * @private
   * @param {Object} attributes - Attributes to clean
   * @returns {Object} Cleaned attributes object
   */
  _cleanAttributes(attributes) {
    const cleaned = {};
    
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== null && value !== undefined && value !== '') {
        cleaned[key] = value;
      }
    }
    
    return cleaned;
  }

  /**
   * Check if an attribute is a special DOM Cascade attribute
   * @param {string} attributeName - Name of attribute to check
   * @returns {boolean} True if special attribute
   */
  isSpecialAttribute(attributeName) {
    return this.specialAttributes.has(attributeName);
  }

  /**
   * Check if an attribute should be removed from final output
   * @param {string} attributeName - Name of attribute to check
   * @returns {boolean} True if should be removed
   */
  shouldRemoveAttribute(attributeName) {
    return this.removedAttributes.has(attributeName);
  }

  /**
   * Merge ARIA attributes with page-wins policy
   * @param {Object} layoutAttrs - Layout ARIA attributes
   * @param {Object} pageAttrs - Page ARIA attributes
   * @returns {Object} Merged ARIA attributes
   */
  mergeAriaAttributes(layoutAttrs, pageAttrs) {
    const merged = {};
    
    // Start with layout ARIA attributes
    for (const [key, value] of Object.entries(layoutAttrs)) {
      if (key.startsWith('aria-')) {
        merged[key] = value;
      }
    }
    
    // Override with page ARIA attributes (page wins)
    for (const [key, value] of Object.entries(pageAttrs)) {
      if (key.startsWith('aria-')) {
        merged[key] = value;
      }
    }
    
    return merged;
  }

  /**
   * Merge data attributes with page-wins policy
   * @param {Object} layoutAttrs - Layout data attributes
   * @param {Object} pageAttrs - Page data attributes
   * @returns {Object} Merged data attributes
   */
  mergeDataAttributes(layoutAttrs, pageAttrs) {
    const merged = {};
    
    // Start with layout data attributes
    for (const [key, value] of Object.entries(layoutAttrs)) {
      if (key.startsWith('data-') && !this.shouldRemoveAttribute(key)) {
        merged[key] = value;
      }
    }
    
    // Override with page data attributes (page wins)
    for (const [key, value] of Object.entries(pageAttrs)) {
      if (key.startsWith('data-') && !this.shouldRemoveAttribute(key)) {
        merged[key] = value;
      }
    }
    
    return merged;
  }
}