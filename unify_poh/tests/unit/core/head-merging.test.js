/**
 * DOM Cascade Head Merging Tests (US-011)
 * Implements head element merging and deduplication per DOM Cascade v1
 * 
 * Acceptance Criteria from US-011:
 * - GIVEN layout with head elements and page with head elements
 * - WHEN DOM Cascade composition is applied
 * - THEN head elements should be merged with deduplication
 * - AND page head elements should win over layout head elements
 * - AND CSS/JS load order should follow layout → components → page
 * - AND meta elements should be deduplicated by name/property
 * - AND link elements should be deduplicated by rel+href
 * - AND title element should use page title (last wins)
 * - AND inline styles/scripts should never be deduplicated
 */

import { describe, it, expect } from "bun:test";
import { HeadMerger } from "../../../src/core/cascade/head-merger.js";
import { DOMParser } from "../../../src/io/dom-parser.js";

describe("DOM Cascade Head Merging (US-011)", () => {
  function setup() {
    return {
      headMerger: new HeadMerger(),
      parser: new DOMParser()
    };
  }

  describe("Basic head merging", () => {
    it("should merge layout and page head elements", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        title: 'Layout Title',
        meta: [
          { name: 'description', content: 'Layout description' },
          { name: 'keywords', content: 'layout, keywords' }
        ],
        links: [
          { rel: 'stylesheet', href: '/layout.css' }
        ]
      };
      
      const pageHead = {
        title: 'Page Title',
        meta: [
          { name: 'description', content: 'Page description' },
          { name: 'author', content: 'Page author' }
        ],
        links: [
          { rel: 'stylesheet', href: '/page.css' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.title).toBe('Page Title'); // Page wins
      expect(result.meta).toHaveLength(3); // 2 unique + 1 page override
      expect(result.links).toHaveLength(2); // Both stylesheets
    });

    it("should preserve head element order (layout → page)", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        links: [
          { rel: 'stylesheet', href: '/layout.css' },
          { rel: 'preload', href: '/fonts.woff2' }
        ]
      };
      
      const pageHead = {
        links: [
          { rel: 'stylesheet', href: '/page.css' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.links[0].href).toBe('/layout.css');
      expect(result.links[1].href).toBe('/fonts.woff2');
      expect(result.links[2].href).toBe('/page.css');
    });
  });

  describe("Title element handling", () => {
    it("should use page title when both layout and page have titles", () => {
      const { headMerger } = setup();
      
      const layoutHead = { title: 'Layout Title' };
      const pageHead = { title: 'Page Title' };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.title).toBe('Page Title');
    });

    it("should use layout title when page has no title", () => {
      const { headMerger } = setup();
      
      const layoutHead = { title: 'Layout Title' };
      const pageHead = {};
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.title).toBe('Layout Title');
    });

    it("should handle empty or missing titles gracefully", () => {
      const { headMerger } = setup();
      
      const layoutHead = {};
      const pageHead = {};
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.title).toBeUndefined();
    });
  });

  describe("Meta element deduplication", () => {
    it("should deduplicate meta elements by name attribute", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        meta: [
          { name: 'description', content: 'Layout description' },
          { name: 'keywords', content: 'layout keywords' }
        ]
      };
      
      const pageHead = {
        meta: [
          { name: 'description', content: 'Page description' },
          { name: 'author', content: 'Page author' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.meta).toHaveLength(3);
      
      const description = result.meta.find(m => m.name === 'description');
      expect(description.content).toBe('Page description'); // Page wins
      
      const keywords = result.meta.find(m => m.name === 'keywords');
      expect(keywords.content).toBe('layout keywords'); // Layout preserved
      
      const author = result.meta.find(m => m.name === 'author');
      expect(author.content).toBe('Page author'); // Page added
    });

    it("should deduplicate meta elements by property attribute (Open Graph)", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        meta: [
          { property: 'og:title', content: 'Layout OG Title' },
          { property: 'og:image', content: '/layout-image.jpg' }
        ]
      };
      
      const pageHead = {
        meta: [
          { property: 'og:title', content: 'Page OG Title' },
          { property: 'og:description', content: 'Page OG Description' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.meta).toHaveLength(3);
      
      const ogTitle = result.meta.find(m => m.property === 'og:title');
      expect(ogTitle.content).toBe('Page OG Title'); // Page wins
    });

    it("should handle meta elements with http-equiv", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        meta: [
          { 'http-equiv': 'X-UA-Compatible', content: 'IE=edge' }
        ]
      };
      
      const pageHead = {
        meta: [
          { 'http-equiv': 'X-UA-Compatible', content: 'IE=edge,chrome=1' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.meta).toHaveLength(1);
      expect(result.meta[0].content).toBe('IE=edge,chrome=1'); // Page wins
    });
  });

  describe("Link element deduplication", () => {
    it("should deduplicate link elements by rel+href combination", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        links: [
          { rel: 'stylesheet', href: '/shared.css' },
          { rel: 'stylesheet', href: '/layout.css' }
        ]
      };
      
      const pageHead = {
        links: [
          { rel: 'stylesheet', href: '/shared.css' }, // Duplicate
          { rel: 'stylesheet', href: '/page.css' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.links).toHaveLength(3); // Deduplicated
      expect(result.links.map(l => l.href)).toEqual([
        '/shared.css', '/layout.css', '/page.css'
      ]);
    });

    it("should preserve different rel types for same href", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        links: [
          { rel: 'preload', href: '/font.woff2', as: 'font' }
        ]
      };
      
      const pageHead = {
        links: [
          { rel: 'stylesheet', href: '/font.woff2' } // Different rel
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.links).toHaveLength(2); // Not deduplicated (different rel)
    });

    it("should handle canonical links properly", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        links: [
          { rel: 'canonical', href: 'https://site.com/default' }
        ]
      };
      
      const pageHead = {
        links: [
          { rel: 'canonical', href: 'https://site.com/page' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.links).toHaveLength(2); // Different canonical URLs
      expect(result.links[0].href).toBe('https://site.com/default'); // Layout canonical
      expect(result.links[1].href).toBe('https://site.com/page'); // Page canonical
    });
  });

  describe("Script element handling", () => {
    it("should preserve script load order (layout → page)", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        scripts: [
          { src: '/layout.js' },
          { src: '/shared.js' }
        ]
      };
      
      const pageHead = {
        scripts: [
          { src: '/page.js' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.scripts).toHaveLength(3);
      expect(result.scripts.map(s => s.src)).toEqual([
        '/layout.js', '/shared.js', '/page.js'
      ]);
    });

    it("should never deduplicate inline scripts", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        scripts: [
          { inline: 'console.log("layout");' }
        ]
      };
      
      const pageHead = {
        scripts: [
          { inline: 'console.log("layout");' } // Same content
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.scripts).toHaveLength(2); // Never deduplicated
    });

    it("should deduplicate external scripts by src", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        scripts: [
          { src: '/shared.js' }
        ]
      };
      
      const pageHead = {
        scripts: [
          { src: '/shared.js' } // Duplicate
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.scripts).toHaveLength(1); // Deduplicated
    });
  });

  describe("Style element handling", () => {
    it("should never deduplicate inline styles", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        styles: [
          { inline: 'body { margin: 0; }' }
        ]
      };
      
      const pageHead = {
        styles: [
          { inline: 'body { margin: 0; }' } // Same content
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.styles).toHaveLength(2); // Never deduplicated
    });

    it("should preserve style order for CSS cascade", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        styles: [
          { inline: '.layout { color: blue; }' }
        ]
      };
      
      const pageHead = {
        styles: [
          { inline: '.page { color: red; }' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.styles[0].inline).toContain('layout');
      expect(result.styles[1].inline).toContain('page');
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle empty head objects", () => {
      const { headMerger } = setup();
      
      const result = headMerger.merge({}, {});
      
      expect(result).toEqual({});
    });

    it("should handle null/undefined head objects", () => {
      const { headMerger } = setup();
      
      expect(() => headMerger.merge(null, {})).not.toThrow();
      expect(() => headMerger.merge({}, null)).not.toThrow();
    });

    it("should handle malformed meta elements", () => {
      const { headMerger } = setup();
      
      const layoutHead = {
        meta: [
          { name: 'valid', content: 'valid content' },
          { invalidAttribute: 'invalid' } // Malformed
        ]
      };
      
      const pageHead = {
        meta: [
          { name: 'page', content: 'page content' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.meta).toHaveLength(3); // Should still work
    });
  });

  describe("Integration with composition", () => {
    it("should extract head from HTML documents", () => {
      const { headMerger, parser } = setup();
      
      const layoutHtml = `
        <html>
          <head>
            <title>Layout</title>
            <meta name="description" content="Layout description">
            <link rel="stylesheet" href="/layout.css">
          </head>
          <body>Layout body</body>
        </html>
      `;
      
      const pageHtml = `
        <html>
          <head>
            <title>Page</title>
            <meta name="author" content="Page author">
            <link rel="stylesheet" href="/page.css">
          </head>
          <body>Page body</body>
        </html>
      `;
      
      const layoutDoc = parser.parse(layoutHtml);
      const pageDoc = parser.parse(pageHtml);
      
      const layoutHead = headMerger.extractHead(layoutDoc);
      const pageHead = headMerger.extractHead(pageDoc);
      const merged = headMerger.merge(layoutHead, pageHead);
      
      expect(merged.title).toBe('Page');
      expect(merged.meta).toHaveLength(2);
      expect(merged.links).toHaveLength(2);
    });
  });
});

/**
 * This test file implements TDD methodology for US-011:
 * 1. RED: These tests will fail because HeadMerger doesn't exist yet
 * 2. GREEN: Implementation must be written to make these tests pass
 * 3. REFACTOR: Code can be improved while keeping tests green
 * 
 * Coverage requirement: This file must achieve ≥90% coverage of head-merger.js
 * Specification compliance: Must implement exact DOM Cascade v1 head merging
 */