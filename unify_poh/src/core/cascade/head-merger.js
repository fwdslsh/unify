/**
 * DOM Cascade Head Merging Engine
 * Implements DOM Cascade v1 head element merging with deduplication
 */

/**
 * HeadMerger implements DOM Cascade v1 head merging rules
 * Layout → Components → Page order with deduplication
 */
export class HeadMerger {
  constructor() {
    this.deduplicatedElements = new Set(['meta', 'link', 'script']);
    this.neverDeduplicated = new Set(['style']); // Inline styles never deduplicated
  }

  /**
   * Merge head elements from layout and page following DOM Cascade v1 rules
   * @param {Object} layoutHead - Layout head elements
   * @param {Object} pageHead - Page head elements
   * @returns {Object} Merged head elements
   */
  merge(layoutHead, pageHead) {
    const layoutNormalized = this._normalizeHead(layoutHead);
    const pageNormalized = this._normalizeHead(pageHead);
    
    const merged = {
      title: this._mergeTitle(layoutNormalized.title, pageNormalized.title),
      meta: this._mergeMeta(layoutNormalized.meta, pageNormalized.meta),
      links: this._mergeLinks(layoutNormalized.links, pageNormalized.links),
      scripts: this._mergeScripts(layoutNormalized.scripts, pageNormalized.scripts),
      styles: this._mergeStyles(layoutNormalized.styles, pageNormalized.styles)
    };

    // Clean up undefined values
    return this._cleanHead(merged);
  }

  /**
   * Extract head elements from HTML document
   * @param {Document} doc - Parsed HTML document
   * @returns {Object} Extracted head elements
   */
  extractHead(doc) {
    const head = {
      title: null,
      meta: [],
      links: [],
      scripts: [],
      styles: []
    };

    // Simple extraction based on our basic DOM parser
    const html = doc.html || '';
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) {
      head.title = titleMatch[1];
    }

    // Extract meta tags
    const metaMatches = html.matchAll(/<meta([^>]*)>/gi);
    for (const match of metaMatches) {
      const attributes = this._parseAttributes(match[1]);
      head.meta.push(attributes);
    }

    // Extract link tags
    const linkMatches = html.matchAll(/<link([^>]*)>/gi);
    for (const match of linkMatches) {
      const attributes = this._parseAttributes(match[1]);
      head.links.push(attributes);
    }

    // Extract script tags
    const scriptMatches = html.matchAll(/<script([^>]*?)>(.*?)<\/script>/gis);
    for (const match of scriptMatches) {
      const attributes = this._parseAttributes(match[1]);
      if (match[2].trim()) {
        attributes.inline = match[2].trim();
      }
      head.scripts.push(attributes);
    }

    // Extract style tags
    const styleMatches = html.matchAll(/<style([^>]*?)>(.*?)<\/style>/gis);
    for (const match of styleMatches) {
      const attributes = this._parseAttributes(match[1]);
      attributes.inline = match[2].trim();
      head.styles.push(attributes);
    }

    return head;
  }

  /**
   * Normalize head object, handling null/undefined cases
   * @private
   * @param {Object|null|undefined} head - Head object to normalize
   * @returns {Object} Normalized head object
   */
  _normalizeHead(head) {
    if (!head || typeof head !== 'object') {
      return { title: null, meta: [], links: [], scripts: [], styles: [] };
    }

    return {
      title: head.title || null,
      meta: Array.isArray(head.meta) ? head.meta : [],
      links: Array.isArray(head.links) ? head.links : [],
      scripts: Array.isArray(head.scripts) ? head.scripts : [],
      styles: Array.isArray(head.styles) ? head.styles : []
    };
  }

  /**
   * Merge title elements (page wins)
   * @private
   */
  _mergeTitle(layoutTitle, pageTitle) {
    return pageTitle || layoutTitle || undefined;
  }

  /**
   * Merge meta elements with deduplication by name/property/http-equiv
   * @private
   */
  _mergeMeta(layoutMeta, pageMeta) {
    const merged = [];
    const seen = new Map();

    // Add layout meta first
    for (const meta of layoutMeta) {
      const key = this._getMetaKey(meta);
      if (key) {
        seen.set(key, meta);
        merged.push(meta);
      } else {
        merged.push(meta); // Add non-deduplicated meta
      }
    }

    // Add page meta, replacing duplicates
    for (const meta of pageMeta) {
      const key = this._getMetaKey(meta);
      if (key) {
        if (seen.has(key)) {
          // Replace layout meta with page meta
          const index = merged.findIndex(m => this._getMetaKey(m) === key);
          if (index >= 0) {
            merged[index] = meta;
          }
        } else {
          seen.set(key, meta);
          merged.push(meta);
        }
      } else {
        merged.push(meta); // Add non-deduplicated meta
      }
    }

    return merged;
  }

  /**
   * Get deduplication key for meta element
   * @private
   */
  _getMetaKey(meta) {
    if (meta.name) return `name:${meta.name}`;
    if (meta.property) return `property:${meta.property}`;
    if (meta['http-equiv']) return `http-equiv:${meta['http-equiv']}`;
    return null; // No deduplication key
  }

  /**
   * Merge link elements with deduplication by rel+href
   * @private
   */
  _mergeLinks(layoutLinks, pageLinks) {
    const merged = [];
    const seen = new Set();

    // Add layout links first
    for (const link of layoutLinks) {
      const key = this._getLinkKey(link);
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(link);
      } else if (!key) {
        merged.push(link); // Add non-deduplicated links
      }
    }

    // Add page links, skipping duplicates but allowing overwrites
    for (const link of pageLinks) {
      const key = this._getLinkKey(link);
      if (key) {
        if (seen.has(key)) {
          // Replace layout link with page link
          const index = merged.findIndex(l => this._getLinkKey(l) === key);
          if (index >= 0) {
            merged[index] = link;
          }
        } else {
          seen.add(key);
          merged.push(link);
        }
      } else {
        merged.push(link); // Add non-deduplicated links
      }
    }

    return merged;
  }

  /**
   * Get deduplication key for link element
   * @private
   */
  _getLinkKey(link) {
    if (link.rel && link.href) {
      return `${link.rel}:${link.href}`;
    }
    return null; // No deduplication key
  }

  /**
   * Merge script elements with deduplication by src (but never inline)
   * @private
   */
  _mergeScripts(layoutScripts, pageScripts) {
    const merged = [];
    const seen = new Set();

    // Add layout scripts first
    for (const script of layoutScripts) {
      if (script.inline) {
        merged.push(script); // Never deduplicate inline scripts
      } else if (script.src) {
        if (!seen.has(script.src)) {
          seen.add(script.src);
          merged.push(script);
        }
      } else {
        merged.push(script);
      }
    }

    // Add page scripts
    for (const script of pageScripts) {
      if (script.inline) {
        merged.push(script); // Never deduplicate inline scripts
      } else if (script.src) {
        if (!seen.has(script.src)) {
          seen.add(script.src);
          merged.push(script);
        }
        // Skip duplicate external scripts
      } else {
        merged.push(script);
      }
    }

    return merged;
  }

  /**
   * Merge style elements (never deduplicated)
   * @private
   */
  _mergeStyles(layoutStyles, pageStyles) {
    // Never deduplicate styles - order matters for CSS cascade
    return [...layoutStyles, ...pageStyles];
  }

  /**
   * Parse attribute string into object
   * @private
   */
  _parseAttributes(attributeString) {
    const attrs = {};
    if (!attributeString) return attrs;

    const attrRegex = /(\w+(?:-\w+)*)=["']?([^"'\s]*)["']?/g;
    let match;

    while ((match = attrRegex.exec(attributeString)) !== null) {
      attrs[match[1]] = match[2];
    }

    return attrs;
  }

  /**
   * Clean head object, removing undefined/empty values
   * @private
   */
  _cleanHead(head) {
    const cleaned = {};

    if (head.title) {
      cleaned.title = head.title;
    }

    if (head.meta && head.meta.length > 0) {
      cleaned.meta = head.meta;
    }

    if (head.links && head.links.length > 0) {
      cleaned.links = head.links;
    }

    if (head.scripts && head.scripts.length > 0) {
      cleaned.scripts = head.scripts;
    }

    if (head.styles && head.styles.length > 0) {
      cleaned.styles = head.styles;
    }

    return cleaned;
  }

  /**
   * Generate HTML string from merged head elements
   * @param {Object} head - Merged head elements
   * @returns {string} HTML head content
   */
  generateHeadHtml(head) {
    const parts = [];

    if (head.title) {
      parts.push(`<title>${head.title}</title>`);
    }

    if (head.meta) {
      for (const meta of head.meta) {
        const attrs = Object.entries(meta)
          .map(([key, value]) => `${key}="${value}"`)
          .join(' ');
        parts.push(`<meta ${attrs}>`);
      }
    }

    if (head.links) {
      for (const link of head.links) {
        const attrs = Object.entries(link)
          .map(([key, value]) => `${key}="${value}"`)
          .join(' ');
        parts.push(`<link ${attrs}>`);
      }
    }

    if (head.scripts) {
      for (const script of head.scripts) {
        if (script.inline) {
          const attrs = Object.entries(script)
            .filter(([key]) => key !== 'inline')
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
          parts.push(`<script${attrs ? ' ' + attrs : ''}>${script.inline}</script>`);
        } else {
          const attrs = Object.entries(script)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
          parts.push(`<script ${attrs}></script>`);
        }
      }
    }

    if (head.styles) {
      for (const style of head.styles) {
        const attrs = Object.entries(style)
          .filter(([key]) => key !== 'inline')
          .map(([key, value]) => `${key}="${value}"`)
          .join(' ');
        parts.push(`<style${attrs ? ' ' + attrs : ''}>${style.inline}</style>`);
      }
    }

    return parts.join('\n');
  }
}