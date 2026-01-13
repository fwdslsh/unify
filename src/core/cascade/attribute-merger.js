/**
 * DOM Cascade Attribute Merging Engine - Following Reference Implementation
 * Implements DOM Cascade v1 specification exactly as per refactor plan
 */

/**
 * Simplified AttributeMerger following reference implementation pattern
 * Page wins except for ID (host id wins) and class (union)
 */
export class AttributeMerger {
  constructor() {
    // Simplified - no complex attribute categorization
  }

  /**
   * Merge attributes from host and page elements (following reference implementation exactly)
   * @param {Object} hostElement - Host element with attributes  
   * @param {Object} pageElement - Page element with attributes
   * @returns {Object} Merged attributes object
   */
  mergeAttributes(hostElement, pageElement) {
    const hostAttrs = this._getAttributes(hostElement);
    const pageAttrs = this._getAttributes(pageElement);
    
    const merged = { ...hostAttrs };
    
    for (const [key, value] of Object.entries(pageAttrs)) {
      if (key === 'id') {
        // Keep host id if exists, use page id only if host lacks one
        merged.id = hostAttrs.id || value;
      } else if (key === 'class') {
        // Union of classes
        const hostClasses = (hostAttrs.class || '').split(' ').filter(Boolean);
        const pageClasses = value.split(' ').filter(Boolean);
        merged.class = [...new Set([...hostClasses, ...pageClasses])].join(' ');
      } else {
        // Page wins for other attributes
        merged[key] = value;
      }
    }
    
    // Remove data-unify attributes per DOM Cascade v1 specification
    // These are processing directives and must not appear in final output
    delete merged['data-unify'];
    
    return merged;
  }

  /**
   * Get attributes from element (handles different element implementations)
   * @private
   */
  _getAttributes(element) {
    const attrs = {};
    
    if (!element) return attrs;
    
    // Handle different element implementations
    if (element.attributes) {
      // DOM element with attributes collection
      if (element.attributes[Symbol.iterator]) {
        // Iterable attributes
        for (const attr of element.attributes) {
          attrs[attr.name] = attr.value;
        }
      } else if (Array.isArray(element.attributes)) {
        // Array of attribute objects
        for (const attr of element.attributes) {
          attrs[attr.name] = attr.value;
        }
      } else {
        // Object-style attributes
        for (const [key, value] of Object.entries(element.attributes)) {
          if (value !== null && value !== undefined) {
            attrs[key] = String(value);
          }
        }
      }
    } else if (element.getAttribute) {
      // Element with getAttribute method - enumerate all possible attributes
      // Check common HTML attributes and data attributes
      const possibleAttrs = [
        'id', 'class', 'style', 'title', 'role', 'tabindex', 'dir', 'lang',
        'data-unify', 'data-theme', 'data-priority', 'data-custom', 'data-layout',
        'data-version', 'data-content', 'data-target', 'data-action', 'data-value',
        'data-config', 'data-state', 'data-type', 'data-name', 'data-id', 'data-key',
        'aria-label', 'aria-describedby', 'aria-expanded', 'aria-hidden',
        'onclick', 'onchange', 'onsubmit', 'onload'
      ];
      
      for (const attrName of possibleAttrs) {
        const value = element.getAttribute(attrName);
        if (value !== null) {
          attrs[attrName] = value;
        }
      }
      
      // Also try to get all data-* attributes by checking the element's properties
      // This is a fallback for cases where we don't know all possible attribute names
      if (element.dataset) {
        for (const [key, value] of Object.entries(element.dataset)) {
          const attrName = `data-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
          if (!(attrName in attrs) && value !== null && value !== undefined) {
            attrs[attrName] = String(value);
          }
        }
      }
    }
    
    return attrs;
  }
}