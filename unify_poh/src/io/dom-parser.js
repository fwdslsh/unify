/**
 * DOM Parser for HTML Processing
 * Bun-native DOM parsing without external dependencies
 */

/**
 * Simple DOM parser using Bun's built-in capabilities
 * Provides minimal DOM-like interface for HTML processing
 */
export class DOMParser {
  /**
   * Parse HTML string into a queryable document structure
   * @param {string} html - HTML string to parse
   * @returns {Document} Parsed document structure
   */
  parse(html) {
    if (!html || typeof html !== 'string') {
      return new Document('');
    }

    // Create document wrapper
    return new Document(html);
  }
}

/**
 * Minimal Document implementation
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

    // Use global flag to find all matches, including nested ones
    const tagRegex = /<(\w+)([^>]*?)>([\s\S]*?)<\/\1>/g;
    let match;

    // First pass: find all complete tags
    while ((match = tagRegex.exec(html)) !== null) {
      const [fullMatch, tagName, attributes, content] = match;
      const element = new Element(tagName, attributes, content, fullMatch);
      elements.push(element);
    }

    // Second pass: find nested tags by looking inside the content of each element
    const allMatches = [...html.matchAll(tagRegex)];
    for (const match of allMatches) {
      const content = match[3];
      if (content && content.includes('<')) {
        const nestedElements = this._parseElements(content);
        elements.push(...nestedElements);
      }
    }

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
    const classMatch = attributes.match(/class=["']([^"']*)["']/);
    if (!classMatch) return new Set();
    
    return new Set(classMatch[1].split(/\s+/).filter(cls => cls.length > 0));
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
    
    // Handle both quoted and unquoted attributes
    const attrRegex = /(\w+(?:-\w+)*)=["']?([^"'\s]*)["']?/g;
    let match;

    while ((match = attrRegex.exec(attributes)) !== null) {
      attrs[match[1]] = match[2];
    }

    return attrs;
  }
}

// Add contains method to Set prototype for classList compatibility
if (!Set.prototype.contains) {
  Set.prototype.contains = Set.prototype.has;
}