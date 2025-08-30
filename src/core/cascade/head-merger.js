/**
 * DOM Cascade Head Merging Engine
 * Implements DOM Cascade v1 head element merging with deduplication
 */

import { HTMLRewriterUtils } from '../html-rewriter-utils.js';

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
   * Merge head elements from layout, components, and page following DOM Cascade v1 CSS cascade order
   * DOM Cascade v1: "CSS order: layout → components → page"
   * @param {Object} layoutHead - Layout head elements
   * @param {Array<Object>} componentHeads - Component head elements (in processing order)
   * @param {Object} pageHead - Page head elements
   * @returns {Object} Merged head elements
   */
  mergeWithComponents(layoutHead, componentHeads, pageHead) {
    const layoutNormalized = this._normalizeHead(layoutHead);
    const pageNormalized = this._normalizeHead(pageHead);
    
    // Normalize component heads
    const componentNormalized = (componentHeads || []).map(head => this._normalizeHead(head));
    
    // Title: page wins over all
    const title = pageNormalized.title || layoutNormalized.title;
    
    // Meta: merge all with page-wins deduplication
    let meta = [...layoutNormalized.meta];
    for (const componentHead of componentNormalized) {
      meta = this._mergeMeta(meta, componentHead.meta);
    }
    meta = this._mergeMeta(meta, pageNormalized.meta);
    // Final deduplication pass to ensure no duplicates
    meta = HTMLRewriterUtils.deduplicateMetaTags(meta);
    
    // Links: merge all with deduplication
    let links = [...layoutNormalized.links];
    for (const componentHead of componentNormalized) {
      links = this._mergeLinks(links, componentHead.links);
    }
    links = this._mergeLinks(links, pageNormalized.links);
    // Final deduplication pass to ensure no duplicates
    links = HTMLRewriterUtils.deduplicateLinkTags(links);
    
    // Scripts: merge all with deduplication
    let scripts = [...layoutNormalized.scripts];
    for (const componentHead of componentNormalized) {
      scripts = this._mergeScripts(scripts, componentHead.scripts);
    }
    scripts = this._mergeScripts(scripts, pageNormalized.scripts);
    
    // Styles: CSS cascade order - layout → components → page (no deduplication per DOM spec)
    const styles = [...layoutNormalized.styles];
    for (const componentHead of componentNormalized) {
      styles.push(...componentHead.styles);
    }
    styles.push(...pageNormalized.styles);
    
    const merged = {
      title,
      meta,
      links,
      scripts,
      styles
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
    // Use HTMLRewriterUtils for robust extraction
    const html = doc.html || '';
    return HTMLRewriterUtils.extractHeadElements(html);
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
    if (meta.charset) return 'charset';
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
      // For canonical and icon links, deduplicate by rel only (page wins)
      // Per DOM Cascade v1: "link[rel=canonical], link[rel=icon]: page overrides matching entries"
      if (link.rel === 'canonical' || link.rel === 'icon') {
        return link.rel;
      }
      
      // For other link types (stylesheet, alternate, etc.), use rel:href for deduplication
      // Normalize href to handle both relative and absolute paths to the same resource
      const normalizedHref = this._normalizeAssetPath(link.href);
      return `${link.rel}:${normalizedHref}`;
    }
    return null; // No deduplication key for links without both rel and href
  }

  /**
   * Normalize asset path for deduplication
   * Converts both "assets/nav.css" and "/assets/nav.css" to the same normalized form
   * @private
   */
  _normalizeAssetPath(path) {
    if (!path || typeof path !== 'string') {
      return path;
    }
    
    // Skip external URLs
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
      return path;
    }
    
    // Skip data URLs and other special schemes
    if (path.includes(':')) {
      return path;
    }
    
    // Convert relative paths to absolute form for consistent deduplication
    // Both "assets/nav.css" and "/assets/nav.css" become "/assets/nav.css"
    return path.startsWith('/') ? path : `/${path}`;
  }

  /**
   * Merge script elements with deduplication by src (external) and content hash (inline)
   * DOM Cascade v1: "JS: External `src` deduped; inline scripts deduped by hash."
   * @private
   */
  _mergeScripts(layoutScripts, pageScripts) {
    const merged = [];
    const seenExternalSrc = new Set();
    const seenInlineHashes = new Set();

    // Add layout scripts first
    for (const script of layoutScripts) {
      if (script.inline) {
        // Deduplicate inline scripts by content hash
        const contentHash = this._hashInlineScript(script.inline);
        if (!seenInlineHashes.has(contentHash)) {
          seenInlineHashes.add(contentHash);
          merged.push(script);
        }
      } else if (script.src) {
        if (!seenExternalSrc.has(script.src)) {
          seenExternalSrc.add(script.src);
          merged.push(script);
        }
      } else {
        merged.push(script);
      }
    }

    // Add page scripts
    for (const script of pageScripts) {
      if (script.inline) {
        // Deduplicate inline scripts by content hash
        const contentHash = this._hashInlineScript(script.inline);
        if (!seenInlineHashes.has(contentHash)) {
          seenInlineHashes.add(contentHash);
          merged.push(script);
        }
        // Skip duplicate inline scripts with same content
      } else if (script.src) {
        if (!seenExternalSrc.has(script.src)) {
          seenExternalSrc.add(script.src);
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
   * Generate simple hash of inline script content for deduplication
   * @private
   * @param {string} content - Script content
   * @returns {string} Simple hash string
   */
  _hashInlineScript(content) {
    if (!content || typeof content !== 'string') {
      return '';
    }
    
    // Simple hash based on content - normalize whitespace for comparison
    const normalized = content.trim().replace(/\s+/g, ' ');
    
    // Simple string hash algorithm
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash.toString();
  }

  /**
   * Merge style elements preserving CSS cascade order 
   * DOM Cascade v1: CSS order is layout → components → page (no deduplication)
   * @private
   */
  _mergeStyles(layoutStyles, pageStyles) {
    // Preserve CSS cascade order - layout first, then page
    const merged = [...layoutStyles, ...pageStyles];
    return merged;
  }

  /**
   * Generate content key for style deduplication
   * @private
   */
  _getStyleContentKey(style) {
    if (style.inline) {
      // Normalize whitespace for comparison
      return style.inline.trim().replace(/\s+/g, ' ');
    }
    return `empty-${Math.random()}`; // Empty styles are never considered duplicates
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
    // Use HTMLRewriterUtils for robust HTML generation
    return HTMLRewriterUtils.generateHeadHtml(head);
  }
}