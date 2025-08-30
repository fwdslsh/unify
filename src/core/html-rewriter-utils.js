/**
 * HTML Processing Utilities
 * Robust HTML processing with improved regex patterns and error handling
 * Designed to replace fragile regex throughout HtmlProcessor
 */

/**
 * HTMLRewriterUtils provides robust HTML processing with improved regex patterns
 * and comprehensive error handling for better reliability
 */
export class HTMLRewriterUtils {
  /**
   * Extract data-unify attribute from html or body elements only
   * @param {string} html - HTML content
   * @returns {string|null} The data-unify value or null if not found
   */
  static extractLayoutDataUnify(html) {
    if (!html || typeof html !== 'string') {
      return null;
    }

    try {
      // Check for data-unify on html element
      const htmlMatch = html.match(/<html[^>]*\sdata-unify\s*=\s*["']([^"']+)["'][^>]*>/i);
      if (htmlMatch) return htmlMatch[1];
      
      // Check for data-unify on body element  
      const bodyMatch = html.match(/<body[^>]*\sdata-unify\s*=\s*["']([^"']+)["'][^>]*>/i);
      if (bodyMatch) return bodyMatch[1];
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract head content from HTML (content between <head> tags)
   * @param {string} html - HTML content
   * @returns {string} Head content without <head> tags, comments filtered
   */
  static extractHeadContent(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    try {
      const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
      if (headMatch) {
        // Filter out HTML comments from head content
        return headMatch[1].replace(/<!--[\s\S]*?-->/g, '').trim();
      }
      return '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Extract structured head elements from HTML
   * @param {string} html - HTML content
   * @returns {Object} Structured head elements {title, meta, links, scripts, styles}
   */
  static extractHeadElements(html) {
    const head = {
      title: null,
      meta: [],
      links: [],
      scripts: [],
      styles: []
    };

    if (!html || typeof html !== 'string') {
      return head;
    }

    try {
      // Extract title
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      if (titleMatch) {
        head.title = titleMatch[1].trim();
      }

      // Extract meta tags with better handling
      const metaMatches = html.matchAll(/<meta\s+[^>]*?>/gi);
      for (const match of metaMatches) {
        const attributes = this.extractAttributes(match[0]);
        if (Object.keys(attributes).length > 0) {
          head.meta.push(attributes);
        }
      }

      // Extract link tags
      const linkMatches = html.matchAll(/<link\s+[^>]*?>/gi);
      for (const match of linkMatches) {
        const attributes = this.extractAttributes(match[0]);
        if (Object.keys(attributes).length > 0) {
          head.links.push(attributes);
        }
      }

      // Extract script tags (both external and inline)
      const scriptMatches = html.matchAll(/<script([^>]*?)>([\s\S]*?)<\/script>/gi);
      for (const match of scriptMatches) {
        const attributes = this.extractAttributes(`<script${match[1]}>`);
        if (match[2].trim()) {
          attributes.inline = match[2].trim();
        }
        head.scripts.push(attributes);
      }

      // Extract self-closing script tags
      const scriptSelfClosingMatches = html.matchAll(/<script\s+([^>]*?)\/>/gi);
      for (const match of scriptSelfClosingMatches) {
        const attributes = this.extractAttributes(match[0]);
        if (attributes.src) {
          head.scripts.push(attributes);
        }
      }

      // Extract style tags (excluding data-unify-docs blocks per DOM spec)
      const styleMatches = html.matchAll(/<style([^>]*?)>([\s\S]*?)<\/style>/gi);
      for (const match of styleMatches) {
        const attributes = this.extractAttributes(`<style${match[1]}>`);
        
        // Skip style blocks with data-unify-docs attribute (DOM spec requirement)
        if (attributes['data-unify-docs'] !== undefined) {
          continue;
        }
        
        attributes.inline = match[2].trim();
        head.styles.push(attributes);
      }

      return head;
    } catch (error) {
      return head;
    }
  }

  /**
   * Deduplicate meta tags by name/property/http-equiv/charset
   * @param {Array} metaTags - Array of meta tag objects
   * @returns {Array} Deduplicated meta tags
   */
  static deduplicateMetaTags(metaTags) {
    if (!Array.isArray(metaTags)) {
      return [];
    }

    const seen = new Map();
    const result = [];

    for (const meta of metaTags) {
      let key = null;
      
      // Determine deduplication key
      if (meta.charset) {
        key = 'charset';
      } else if (meta.name) {
        key = `name:${meta.name}`;
      } else if (meta.property) {
        key = `property:${meta.property}`;
      } else if (meta['http-equiv']) {
        key = `http-equiv:${meta['http-equiv']}`;
      }

      if (key) {
        // Skip if we've seen this key before
        if (!seen.has(key)) {
          seen.set(key, meta);
          result.push(meta);
        }
      } else {
        // No deduplication key, always include
        result.push(meta);
      }
    }

    return result;
  }

  /**
   * Deduplicate link tags by rel and href
   * @param {Array} linkTags - Array of link tag objects
   * @returns {Array} Deduplicated link tags
   */
  static deduplicateLinkTags(linkTags) {
    if (!Array.isArray(linkTags)) {
      return [];
    }

    const seen = new Set();
    const result = [];

    for (const link of linkTags) {
      let key = null;

      if (link.rel && link.href) {
        // Special handling for canonical and icon
        if (link.rel === 'canonical' || link.rel === 'icon') {
          key = link.rel;
        } else {
          key = `${link.rel}:${link.href}`;
        }
      }

      if (key) {
        if (!seen.has(key)) {
          seen.add(key);
          result.push(link);
        }
      } else {
        // No deduplication key, always include
        result.push(link);
      }
    }

    return result;
  }

  /**
   * Generate HTML string from head elements object
   * @param {Object} head - Head elements {title, meta, links, scripts, styles}
   * @returns {string} HTML head content
   */
  static generateHeadHtml(head) {
    const parts = [];

    if (head.title) {
      parts.push(`<title>${head.title}</title>`);
    }

    if (head.meta && Array.isArray(head.meta)) {
      for (const meta of head.meta) {
        const attrs = Object.entries(meta)
          .filter(([key]) => key !== 'meta') // Skip tag name if present
          .map(([key, value]) => {
            if (value === '' || value === true) {
              return key;
            }
            return `${key}="${value}"`;
          })
          .join(' ');
        parts.push(`<meta ${attrs}>`);
      }
    }

    if (head.links && Array.isArray(head.links)) {
      for (const link of head.links) {
        const attrs = Object.entries(link)
          .filter(([key]) => key !== 'link') // Skip tag name if present
          .map(([key, value]) => {
            if (value === '' || value === true) {
              return key;
            }
            return `${key}="${value}"`;
          })
          .join(' ');
        parts.push(`<link ${attrs}>`);
      }
    }

    if (head.scripts && Array.isArray(head.scripts)) {
      for (const script of head.scripts) {
        if (script.inline) {
          const attrs = Object.entries(script)
            .filter(([key]) => key !== 'inline' && key !== 'script')
            .map(([key, value]) => {
              if (value === '' || value === true) {
                return key;
              }
              return `${key}="${value}"`;
            })
            .join(' ');
          parts.push(`<script${attrs ? ' ' + attrs : ''}>${script.inline}</script>`);
        } else {
          const attrs = Object.entries(script)
            .filter(([key]) => key !== 'script')
            .map(([key, value]) => {
              if (value === '' || value === true) {
                return key;
              }
              return `${key}="${value}"`;
            })
            .join(' ');
          parts.push(`<script ${attrs}></script>`);
        }
      }
    }

    if (head.styles && Array.isArray(head.styles)) {
      for (const style of head.styles) {
        const attrs = Object.entries(style)
          .filter(([key]) => key !== 'inline' && key !== 'style')
          .map(([key, value]) => {
            if (value === '' || value === true) {
              return key;
            }
            return `${key}="${value}"`;
          })
          .join(' ');
        parts.push(`<style${attrs ? ' ' + attrs : ''}>${style.inline || ''}</style>`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Extract body content from HTML (content between <body> tags or clean fragment)
   * @param {string} html - HTML content  
   * @returns {string} Body content without <body> tags
   */
  static extractBodyContent(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }

    try {
      // Extract content within <body> tags
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        return bodyMatch[1].trim();
      }
      
      // If no body tag found, return cleaned HTML (might be a fragment)
      return html
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
        .replace(/^\s*<!doctype[^>]*>/i, '')
        .replace(/^\s*<html[^>]*>/i, '')
        .replace(/<\/html>\s*$/i, '')
        .replace(/^\s*<body[^>]*>/i, '')
        .replace(/<\/body>\s*$/i, '')
        .trim();
    } catch (error) {
      return html;
    }
  }

  /**
   * Remove data-unify attributes from HTML
   * @param {string} html - HTML content
   * @returns {string} HTML with data-unify attributes removed
   */
  static removeDataUnifyAttributes(html) {
    if (!html || typeof html !== 'string') {
      return html || '';
    }

    try {
      let result = html;
      
      // Remove data-unify attributes with comprehensive patterns
      result = result
        // Double quotes (most common)
        .replace(/\s*data-unify\s*=\s*"[^"]*"/gi, '')
        // Single quotes
        .replace(/\s*data-unify\s*=\s*'[^']*'/gi, '')
        // Unquoted values
        .replace(/\s*data-unify\s*=\s*[^\s>]+/gi, '')
        // Legacy data-layer attributes
        .replace(/\s*data-layer\s*=\s*"[^"]*"/gi, '')
        .replace(/\s*data-layer\s*=\s*'[^']*'/gi, '')
        .replace(/\s*data-layer\s*=\s*[^\s>]+/gi, '');
      
      // Clean up whitespace issues from attribute removal
      result = result
        .replace(/\s+>/g, '>') // Fix spaces before closing bracket
        .replace(/<(\w+)\s+>/g, '<$1>'); // Fix empty attribute spaces
        
      return result;
    } catch (error) {
      return html;
    }
  }

  /**
   * Remove style blocks with data-unify-docs attribute (DOM spec requirement)
   * @param {string} html - HTML content
   * @returns {string} HTML with data-unify-docs style blocks removed
   */
  static removeDataUnifyDocsStyleBlocks(html) {
    if (!html || typeof html !== 'string') {
      return html || '';
    }

    try {
      // Remove style blocks with data-unify-docs attribute
      // This includes any combination of quotes and values
      const result = html.replace(/<style[^>]*\s+data-unify-docs[^>]*>[\s\S]*?<\/style>/gi, '');
      return result;
    } catch (error) {
      return html;
    }
  }

  /**
   * Inject content before closing head tag
   * @param {string} html - HTML content
   * @param {string} content - Content to inject
   * @returns {string} Modified HTML
   */
  static injectIntoHead(html, content) {
    if (!html || !content) {
      return html || '';
    }

    try {
      return html.replace(/<\/head>/i, `\n${content}\n</head>`);
    } catch (error) {
      return html;
    }
  }

  /**
   * Extract title from HTML
   * @param {string} html - HTML content
   * @returns {string|null} Title content or null
   */
  static extractTitle(html) {
    if (!html || typeof html !== 'string') {
      return null;
    }

    try {
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      return titleMatch ? titleMatch[1].trim() : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Replace title in HTML
   * @param {string} html - HTML content
   * @param {string} newTitle - New title
   * @returns {string} Modified HTML
   */
  static replaceTitle(html, newTitle) {
    if (!html || !newTitle) {
      return html || '';
    }

    try {
      return html.replace(/<title[^>]*>.*?<\/title>/i, `<title>${newTitle}</title>`);
    } catch (error) {
      return html;
    }
  }

  /**
   * Find elements with specific area classes (like .unify-hero)
   * @param {string} html - HTML content
   * @param {string} areaClass - Area class to find (e.g., 'unify-hero')
   * @returns {boolean} True if elements with the class are found
   */
  static hasAreaClass(html, areaClass) {
    if (!html || !areaClass) {
      return false;
    }

    try {
      const classPattern = new RegExp(`\\bclass\\s*=\\s*["'][^"']*\\b${areaClass}\\b[^"']*["']`, 'i');
      return classPattern.test(html);
    } catch (error) {
      return false;
    }
  }

  /**
   * Replace element content by class selector (like .unify-hero)
   * @param {string} html - HTML content
   * @param {string} className - CSS class name (without dot)
   * @param {string} newContent - New content to replace
   * @returns {string} Modified HTML
   */
  static replaceElementContentByClass(html, className, newContent) {
    if (!html || !className || newContent === undefined) {
      return html || '';
    }

    try {
      // Create a regex to find elements with the specific class
      const elementPattern = new RegExp(
        `(<[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>)[\\s\\S]*?(<\\/[^>]+>)`,
        'gi'
      );
      
      return html.replace(elementPattern, `$1${newContent}$2`);
    } catch (error) {
      return html;
    }
  }

  /**
   * Check if HTML has specific elements by tag name
   * @param {string} html - HTML content
   * @param {string} tagName - Tag name to check (e.g., 'main', 'header')
   * @returns {boolean} True if elements found
   */
  static hasTag(html, tagName) {
    if (!html || !tagName) {
      return false;
    }

    try {
      const tagPattern = new RegExp(`<${tagName}[^>]*>`, 'i');
      return tagPattern.test(html);
    } catch (error) {
      return false;
    }
  }

  /**
   * Escape regex special characters in a string
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  static escapeRegex(str) {
    if (!str || typeof str !== 'string') {
      return '';
    }
    
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Extract attributes from an HTML element string
   * @param {string} elementHtml - HTML element string
   * @returns {Object} Attribute key-value pairs
   */
  static extractAttributes(elementHtml) {
    if (!elementHtml || typeof elementHtml !== 'string') {
      return {};
    }

    const attrs = {};
    
    try {
      // Match attributes with values (quoted and unquoted)
      const attrWithValueRegex = /(\w+(?:-\w+)*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
      let match;

      while ((match = attrWithValueRegex.exec(elementHtml)) !== null) {
        const name = match[1];
        const value = match[2] !== undefined ? match[2] : 
                     match[3] !== undefined ? match[3] : match[4];
        attrs[name] = value;
      }

      // Find boolean attributes (standalone)
      const remaining = elementHtml.replace(attrWithValueRegex, '');
      const booleanAttrRegex = /\s+(\w+(?:-\w+)*)\s*(?=\s|>|$)/g;
      
      while ((match = booleanAttrRegex.exec(remaining)) !== null) {
        const attrName = match[1];
        if (!(attrName in attrs) && attrName.length > 1) {
          attrs[attrName] = '';
        }
      }

      return attrs;
    } catch (error) {
      return {};
    }
  }

  /**
   * Safe string replacement with error handling
   * @param {string} str - Input string
   * @param {RegExp|string} search - Search pattern
   * @param {string} replacement - Replacement string
   * @returns {string} Modified string
   */
  static safeReplace(str, search, replacement) {
    if (!str || typeof str !== 'string') {
      return str || '';
    }

    try {
      return str.replace(search, replacement);
    } catch (error) {
      return str;
    }
  }

  /**
   * Validate HTML structure for basic wellformedness
   * @param {string} html - HTML content
   * @returns {boolean} True if HTML appears well-formed
   */
  static isValidHTML(html) {
    if (!html || typeof html !== 'string') {
      return false;
    }

    try {
      // Basic checks for wellformedness
      const openTags = (html.match(/<[^\/][^>]*>/g) || []).length;
      const closeTags = (html.match(/<\/[^>]*>/g) || []).length;
      const selfCloseTags = (html.match(/<[^>]*\/>/g) || []).length;
      
      // Rough heuristic: should have similar numbers of open/close tags
      // accounting for self-closing tags
      return Math.abs(openTags - closeTags - selfCloseTags) <= 2;
    } catch (error) {
      return false;
    }
  }
}