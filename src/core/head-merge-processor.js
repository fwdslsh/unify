/**
 * Head Merge Algorithm for Unify v0.6.0
 * 
 * Implements sophisticated head content merging with deduplication rules
 * Processing order: layout → fragments → page (last wins for conflicts)
 */

import { logger } from '../utils/logger.js';

/**
 * Processes head content merging with deduplication
 */
export class HeadMergeProcessor {
  constructor() {
    this.processedElements = new Map();
  }

  /**
   * Merge head content from multiple sources
   * @param {Array<Object>} fragments - Array of fragment objects with headHtml and source
   * @returns {string} - Merged head HTML
   */
  mergeHeadContent(fragments) {
    logger.debug(`Merging head content from ${fragments.length} fragments`);
    
    const mergedElements = [];
    
    // Process in order: layout → fragments → page
    for (const fragment of fragments) {
      const elements = this.parseHeadElements(fragment.headHtml);
      logger.debug(`Processing ${elements.length} head elements from ${fragment.source}`);
      
      for (const element of elements) {
        this.processElement(element, mergedElements);
      }
    }
    
    const result = this.renderMergedHead(mergedElements);
    logger.debug(`Merged head contains ${mergedElements.length} elements`);
    return result;
  }

  /**
   * Parse head HTML into structured elements
   * @param {string} headHtml - Head HTML content
   * @returns {Array<Object>} - Parsed elements
   */
  parseHeadElements(headHtml) {
    if (!headHtml || typeof headHtml !== 'string') {
      return [];
    }

    const elements = [];
    const cleanHtml = headHtml.trim();
    
    if (!cleanHtml) {
      return elements;
    }

    logger.debug(`Parsing head HTML: ${cleanHtml.substring(0, 200)}...`);

    // Handle self-closing and paired tags separately
    const selfClosingRegex = /<(meta|link|base)([^>]*)\/?>/gi;
    const pairedRegex = /<(title|script|style)([^>]*)>(.*?)<\/\1>/gis;
    
    // Parse self-closing tags
    let match;
    while ((match = selfClosingRegex.exec(cleanHtml)) !== null) {
      const [fullMatch, tagName, attributesStr] = match;
      
      const attributes = this.parseAttributes(attributesStr);
      
      elements.push({
        tagName: tagName.toLowerCase(),
        attributes,
        content: '',
        fullElement: fullMatch
      });
      
      logger.debug(`Parsed self-closing element: ${tagName}`, attributes);
    }
    
    // Parse paired tags
    while ((match = pairedRegex.exec(cleanHtml)) !== null) {
      const [fullMatch, tagName, attributesStr, content] = match;
      
      const attributes = this.parseAttributes(attributesStr);
      
      elements.push({
        tagName: tagName.toLowerCase(),
        attributes,
        content: content || '',
        fullElement: fullMatch
      });
      
      logger.debug(`Parsed paired element: ${tagName}`, attributes);
    }
    
    logger.debug(`Parsed ${elements.length} elements total`);
    return elements;
  }

  /**
   * Parse attributes string into object
   * @param {string} attributesStr - Attributes string from HTML tag
   * @returns {Object} - Parsed attributes
   */
  parseAttributes(attributesStr) {
    const attributes = {};
    
    if (!attributesStr) {
      return attributes;
    }

    // Simple attribute parsing - handles most common cases
    const attrRegex = /(\w+(?:-\w+)*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    
    let match;
    while ((match = attrRegex.exec(attributesStr)) !== null) {
      const [, name, doubleQuoted, singleQuoted, unquoted] = match;
      attributes[name.toLowerCase()] = doubleQuoted || singleQuoted || unquoted || '';
    }
    
    // Handle boolean attributes (attributes without values)
    const booleanAttrRegex = /\b(\w+(?:-\w+)*)\b(?!\s*=)/g;
    let boolMatch;
    while ((boolMatch = booleanAttrRegex.exec(attributesStr)) !== null) {
      const name = boolMatch[1].toLowerCase();
      if (!attributes.hasOwnProperty(name)) {
        attributes[name] = '';
      }
    }
    
    return attributes;
  }

  /**
   * Process an individual element with deduplication logic
   * @param {Object} element - Element to process
   * @param {Array<Object>} mergedElements - Array of merged elements
   */
  processElement(element, mergedElements) {
    const key = this.getDeduplicationKey(element);
    
    if (!key) {
      // No deduplication for unknown elements
      mergedElements.push(element);
      logger.debug(`Added non-deduplicated element: ${element.tagName}`);
      return;
    }
    
    const existingIndex = mergedElements.findIndex(existing => 
      this.getDeduplicationKey(existing) === key
    );
    
    if (existingIndex === -1) {
      // New element
      mergedElements.push(element);
      logger.debug(`Added new element: ${element.tagName} (key: ${key})`);
    } else {
      // Apply deduplication rules
      const replacement = this.applyDeduplicationRule(
        mergedElements[existingIndex], 
        element
      );
      
      if (replacement === null) {
        // Keep both elements (data-allow-duplicate)
        mergedElements.push(element);
        logger.debug(`Kept both elements due to data-allow-duplicate: ${element.tagName}`);
      } else if (replacement) {
        // Replace existing element
        mergedElements[existingIndex] = replacement;
        logger.debug(`Replaced element: ${element.tagName} (key: ${key})`);
      }
      // If replacement is undefined/false, keep existing (do nothing)
    }
  }

  /**
   * Generate deduplication key for an element
   * @param {Object} element - Element to generate key for
   * @returns {string|null} - Deduplication key or null if no deduplication
   */
  getDeduplicationKey(element) {
    const { tagName, attributes } = element;
    
    switch (tagName) {
      case 'title':
        return 'title';
        
      case 'meta':
        // Deduplicate by name, property, or http-equiv
        const metaKey = attributes.name || attributes.property || attributes['http-equiv'];
        return metaKey ? `meta:${metaKey}` : null;
        
      case 'link':
        // Deduplicate by rel and href combination
        if (attributes.rel && attributes.href) {
          return `link:${attributes.rel}:${attributes.href}`;
        }
        return null;
        
      case 'script':
        // Only deduplicate scripts with src attribute
        if (attributes.src) {
          return `script:src:${attributes.src}`;
        }
        return null; // Inline scripts not deduplicated
        
      case 'style':
        // Only deduplicate stylesheets with href
        if (attributes.href) {
          return `style:href:${attributes.href}`;
        }
        return null; // Inline styles not deduplicated
        
      case 'base':
        return 'base'; // Only one base tag allowed
        
      default:
        return null; // Unknown elements not deduplicated
    }
  }

  /**
   * Apply deduplication rule between existing and incoming elements
   * @param {Object} existing - Existing element
   * @param {Object} incoming - Incoming element
   * @returns {Object|null|undefined} - Replacement element, null (keep both), or undefined (keep existing)
   */
  applyDeduplicationRule(existing, incoming) {
    const { tagName } = incoming;
    
    // Check for data-allow-duplicate attribute
    if (incoming.attributes['data-allow-duplicate'] !== undefined) {
      logger.debug(`Element has data-allow-duplicate: ${tagName}`);
      return null; // Keep both elements
    }
    
    switch (tagName) {
      case 'title':
        // Last wins (page beats layout)
        return incoming;
        
      case 'meta':
        // Last wins (page beats layout)
        return incoming;
        
      case 'link':
      case 'script':
      case 'style':
        // First wins (layout beats page) unless data-allow-duplicate
        return undefined; // Keep existing
        
      case 'base':
        // Last wins (only one base tag should exist)
        return incoming;
        
      default:
        // Last wins for unknown elements
        return incoming;
    }
  }

  /**
   * Render merged elements back to HTML
   * @param {Array<Object>} elements - Merged elements
   * @returns {string} - Rendered HTML
   */
  renderMergedHead(elements) {
    return elements.map(element => {
      if (element.fullElement) {
        return element.fullElement;
      }
      
      // Fallback rendering if fullElement is not available
      const attrs = Object.entries(element.attributes)
        .map(([key, value]) => value === '' ? key : `${key}="${value}"`)
        .join(' ');
      
      const attrsStr = attrs ? ` ${attrs}` : '';
      
      if (element.content) {
        return `<${element.tagName}${attrsStr}>${element.content}</${element.tagName}>`;
      } else if (['meta', 'link', 'base'].includes(element.tagName)) {
        return `<${element.tagName}${attrsStr}>`;
      } else {
        return `<${element.tagName}${attrsStr}></${element.tagName}>`;
      }
    }).join('\n');
  }

  /**
   * Extract head content from complete HTML document
   * @param {string} html - Full HTML document
   * @returns {string} - Head content
   */
  static extractHeadContent(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }
    
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    return headMatch ? headMatch[1].trim() : '';
  }

  /**
   * Inject merged head content into HTML document
   * @param {string} html - HTML document
   * @param {string} headContent - Merged head content
   * @returns {string} - HTML with merged head
   */
  static injectHeadContent(html, headContent) {
    if (!html || typeof html !== 'string') {
      return html;
    }
    
    // If there's already a head tag, replace its content
    const headRegex = /<head[^>]*>([\s\S]*?)<\/head>/i;
    const headMatch = html.match(headRegex);
    
    if (headMatch) {
      return html.replace(headRegex, `<head>\n${headContent}\n</head>`);
    }
    
    // If no head tag exists, try to inject after <html>
    const htmlTagRegex = /(<html[^>]*>)/i;
    const htmlMatch = html.match(htmlTagRegex);
    
    if (htmlMatch) {
      return html.replace(htmlTagRegex, `$1\n<head>\n${headContent}\n</head>`);
    }
    
    // If no html tag, just prepend to the document
    return `<head>\n${headContent}\n</head>\n${html}`;
  }
}