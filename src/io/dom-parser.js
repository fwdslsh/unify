/**
 * DOM Parser for HTML Processing
 * Uses linkedom for proper DOM parsing with fallback to simple parser
 */

/**
 * LinkedOM adapter for dependency injection
 */
class LinkedOMAdapter {
  constructor(linkedomLib = null) {
    this.linkedom = linkedomLib;
    if (!linkedomLib) {
      try {
        this.linkedom = require("linkedom");
      } catch (error) {
        this.linkedom = null;
      }
    }
  }

  /**
   * Check if linkedom is available
   * @returns {boolean} True if available
   */
  isAvailable() {
    return this.linkedom !== null;
  }

  /**
   * Parse HTML using linkedom
   * @param {string} html - HTML to parse
   * @returns {Object} Parsed document
   */
  parseHTML(html) {
    if (!this.linkedom) {
      throw new Error('LinkedOM not available');
    }
    return this.linkedom.parseHTML(html);
  }
}

/**
 * Enhanced DOM parser with linkedom integration
 * Provides real DOM interface for HTML processing
 */
export class DOMParser {
  constructor(dependencies = {}) {
    this.linkedomAdapter = dependencies.linkedomAdapter || new LinkedOMAdapter();
  }

  /**
   * Parse HTML string into a queryable document structure
   * @param {string} html - HTML string to parse
   * @returns {Document} Parsed document structure
   */
  parse(html) {
    if (!html || typeof html !== 'string') {
      return new Document('');
    }

    // Try linkedom first for real DOM parsing
    try {
      if (this.linkedomAdapter.isAvailable()) {
        const { document } = this.linkedomAdapter.parseHTML(html);
        return new DocumentWrapper(document);
      }
    } catch (error) {
      // Fall through to simple parser
    }
    
    // Fallback to simple parser
    return new Document(html);
  }
}

/**
 * Document wrapper for linkedom integration
 */
class DocumentWrapper {
  constructor(document) {
    this.document = document;
    this.html = document.toString();
  }

  querySelector(selector) {
    return this.document.querySelector(selector);
  }

  querySelectorAll(selector) {
    return Array.from(this.document.querySelectorAll(selector));
  }

  /**
   * Find elements by class name
   */
  getElementsByClassName(className) {
    return Array.from(this.document.getElementsByClassName(className));
  }

  /**
   * Find elements by tag name
   */
  getElementsByTagName(tagName) {
    return Array.from(this.document.getElementsByTagName(tagName));
  }

  /**
   * Find all elements with unify- prefix classes
   */
  getUnifyElements() {
    const elements = this.document.querySelectorAll('[class*="unify-"]');
    return Array.from(elements).filter(el => {
      const classList = el.className.split(' ');
      return classList.some(cls => cls.startsWith('unify-'));
    });
  }

  /**
   * Get all elements
   */
  getAllElements() {
    // Use querySelectorAll instead of getElementsByTagName for better linkedom compatibility
    return Array.from(this.document.querySelectorAll('*'));
  }

  toString() {
    return this.document.toString();
  }
}

/**
 * Minimal Document implementation (fallback)
 * Provides basic DOM querying capabilities
 */
class Document {
  /**
   * @param {string} html - HTML content
   */
  constructor(html) {
    this.html = html;
    this._elements = this._parseElements(html);
  }

  /**
   * Find elements by class name
   * @param {string} className - Class name to search for
   * @returns {Element[]} Array of matching elements
   */
  getElementsByClassName(className) {
    return this._elements.filter(el => 
      el.classList.contains(className)
    );
  }

  /**
   * Find elements by tag name
   * @param {string} tagName - Tag name to search for
   * @returns {Element[]} Array of matching elements
   */
  getElementsByTagName(tagName) {
    return this._elements.filter(el => 
      el.tagName.toLowerCase() === tagName.toLowerCase()
    );
  }

  /**
   * Find all elements with unify- prefix classes
   * @returns {Element[]} Array of elements with unify classes
   */
  getUnifyElements() {
    return this._elements.filter(el =>
      Array.from(el.classList).some(cls => cls.startsWith('unify-'))
    );
  }

  /**
   * Get all elements
   * @returns {Element[]} All parsed elements
   */
  getAllElements() {
    return [...this._elements];
  }

  /**
   * Simple HTML parsing - extracts elements and their attributes
   * @private
   * @param {string} html - HTML to parse
   * @returns {Element[]} Array of parsed elements
   */
  _parseElements(html) {
    const elements = [];
    if (!html) return elements;
    
    const processedElements = new Set(); // Prevent duplicate processing

    // Recursive function to parse elements at all levels
    const parseLevel = (htmlContent, depth = 0) => {
      if (depth > 10) return; // Prevent infinite recursion
      
      // Match opening tags with their content
      const tagRegex = /<(\w+)([^>]*?)>([\s\S]*?)<\/\1>/g;
      let match;

      while ((match = tagRegex.exec(htmlContent)) !== null) {
        const [fullMatch, tagName, attributes, content] = match;
        const elementKey = `${tagName}-${attributes}-${fullMatch.length}`;
        
        // Skip if we've already processed this exact element
        if (processedElements.has(elementKey)) {
          continue;
        }
        processedElements.add(elementKey);
        
        const element = new Element(tagName, attributes, content, fullMatch);
        elements.push(element);
        
        // Recursively parse nested elements
        if (content && content.includes('<')) {
          parseLevel(content, depth + 1);
        }
      }
      
      // Also match self-closing tags
      const selfClosingRegex = /<(\w+)([^>]*?)\/>/g;
      while ((match = selfClosingRegex.exec(htmlContent)) !== null) {
        const [fullMatch, tagName, attributes] = match;
        const elementKey = `${tagName}-${attributes}-${fullMatch.length}`;
        
        if (!processedElements.has(elementKey)) {
          processedElements.add(elementKey);
          const element = new Element(tagName, attributes, '', fullMatch);
          elements.push(element);
        }
      }
    };

    parseLevel(html);
    return elements;
  }
}

/**
 * Minimal Element implementation
 * Provides basic element properties and methods
 */
class Element {
  /**
   * @param {string} tagName - Element tag name
   * @param {string} attributes - Attribute string
   * @param {string} content - Inner content
   * @param {string} outerHTML - Full element HTML
   */
  constructor(tagName, attributes, content, outerHTML) {
    this.tagName = tagName;
    this.innerHTML = content;
    this.outerHTML = outerHTML;
    this.classList = this._parseClasses(attributes);
    this.attributes = this._parseAttributes(attributes);
  }

  /**
   * Check if element has a specific class
   * @param {string} className - Class name to check
   * @returns {boolean} True if class exists
   */
  hasClass(className) {
    return this.classList.contains(className);
  }

  /**
   * Get attribute value
   * @param {string} name - Attribute name
   * @returns {string|null} Attribute value or null
   */
  getAttribute(name) {
    return this.attributes[name] || null;
  }

  /**
   * Parse class names from attributes string
   * @private
   * @param {string} attributes - Attributes string
   * @returns {Set<string>} Set of class names
   */
  _parseClasses(attributes) {
    const classMatch = attributes.match(/class=(?:"([^"]*)"|'([^']*)'|([^\s]+))/);
    if (!classMatch) return new Set();
    
    // Get the class value from whichever quote type was used
    const classValue = classMatch[1] || classMatch[2] || classMatch[3] || '';
    return new Set(classValue.split(/\s+/).filter(cls => cls.length > 0));
  }

  /**
   * Parse all attributes from attributes string
   * @private
   * @param {string} attributes - Attributes string
   * @returns {Object} Attributes object
   */
  _parseAttributes(attributes) {
    const attrs = {};
    if (!attributes) return attrs;
    
    // Handle both quoted and unquoted attributes properly
    const attrRegex = /(\w+(?:-\w+)*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
    let match;

    while ((match = attrRegex.exec(attributes)) !== null) {
      // match[2] = double-quoted value, match[3] = single-quoted value, match[4] = unquoted value
      const value = match[2] || match[3] || match[4] || '';
      attrs[match[1]] = value;
    }

    return attrs;
  }
}

// Add contains method to Set prototype for classList compatibility
if (!Set.prototype.contains) {
  Set.prototype.contains = Set.prototype.has;
}