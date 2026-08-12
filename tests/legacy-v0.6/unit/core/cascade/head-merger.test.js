/**
 * Unit Tests for HeadMerger Class - DOM Cascade Components
 * Tests head element merging functionality per DOM Cascade v1 specification
 * Addresses ISSUE-005: DOM Cascade Components Untested (Scenario 2)
 */

import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import { HeadMerger } from '../../../../src/core/cascade/head-merger.js';

describe('HeadMerger', () => {
  let headMerger;
  let mockHTMLRewriterUtils;

  beforeEach(() => {
    headMerger = new HeadMerger();
    
    // Mock HTMLRewriterUtils for isolated testing
    mockHTMLRewriterUtils = {
      deduplicateMetaTags: (meta) => meta,
      deduplicateLinkTags: (links) => links,
      extractHeadElements: (html) => ({ title: null, meta: [], links: [], scripts: [], styles: [] }),
      extractAttributes: (element) => ({}),
      generateHeadHtml: (head) => ''
    };
  });

  describe('HeadMerger Initialization', () => {
    test('should_create_head_merger_with_deduplication_configuration', () => {
      expect(headMerger).toBeDefined();
      expect(headMerger.deduplicatedElements).toBeInstanceOf(Set);
      expect(headMerger.neverDeduplicated).toBeInstanceOf(Set);
    });

    test('should_configure_deduplicated_element_types_correctly', () => {
      expect(headMerger.deduplicatedElements.has('meta')).toBe(true);
      expect(headMerger.deduplicatedElements.has('link')).toBe(true);
      expect(headMerger.deduplicatedElements.has('script')).toBe(true);
    });

    test('should_configure_never_deduplicated_element_types', () => {
      expect(headMerger.neverDeduplicated.has('style')).toBe(true);
    });
  });

  describe('Basic Head Merging - Layout and Page', () => {
    test('should_merge_simple_layout_and_page_head_elements', () => {
      const layoutHead = {
        title: 'Layout Title',
        meta: [{ name: 'description', content: 'Layout description' }],
        links: [{ rel: 'stylesheet', href: '/layout.css' }],
        scripts: [{ src: '/layout.js' }],
        styles: [{ inline: 'body { margin: 0; }' }]
      };

      const pageHead = {
        title: 'Page Title',
        meta: [{ name: 'keywords', content: 'page, keywords' }],
        links: [{ rel: 'canonical', href: '/page' }],
        scripts: [{ src: '/page.js' }],
        styles: [{ inline: '.content { padding: 20px; }' }]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.title).toBe('Page Title'); // Page wins
      expect(result.meta).toBeArray();
      expect(result.meta.length).toBe(2); // Both layout and page meta
      expect(result.links).toBeArray();
      expect(result.links.length).toBe(2); // Both layout and page links
      expect(result.scripts).toBeArray();
      expect(result.scripts.length).toBe(2); // Both layout and page scripts
      expect(result.styles).toBeArray();
      expect(result.styles.length).toBe(2); // Both styles preserved
    });

    test('should_handle_null_or_undefined_head_objects_gracefully', () => {
      const validHead = {
        title: 'Test Title',
        meta: [{ name: 'description', content: 'Test description' }]
      };

      expect(() => {
        headMerger.merge(null, validHead);
      }).not.toThrow();

      expect(() => {
        headMerger.merge(validHead, undefined);
      }).not.toThrow();

      expect(() => {
        headMerger.merge(null, null);
      }).not.toThrow();
    });

    test('should_clean_head_removing_empty_arrays_and_undefined_values', () => {
      const layoutHead = {
        title: 'Title',
        meta: [],
        links: undefined,
        scripts: null,
        styles: []
      };

      const pageHead = {
        meta: [{ name: 'description', content: 'desc' }]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.title).toBe('Title');
      expect(result.meta).toBeArray();
      expect(result.meta.length).toBe(1);
      expect(result.links).toBeUndefined();
      expect(result.scripts).toBeUndefined();
      expect(result.styles).toBeUndefined();
    });
  });

  describe('Title Merging - Page Wins Rule', () => {
    test('should_use_page_title_when_both_layout_and_page_have_titles', () => {
      const layoutHead = { title: 'Layout Title' };
      const pageHead = { title: 'Page Title' };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.title).toBe('Page Title');
    });

    test('should_use_layout_title_when_page_has_no_title', () => {
      const layoutHead = { title: 'Layout Title' };
      const pageHead = {};

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.title).toBe('Layout Title');
    });

    test('should_return_undefined_title_when_neither_has_title', () => {
      const layoutHead = {};
      const pageHead = {};

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.title).toBeUndefined();
    });
  });

  describe('Meta Element Deduplication', () => {
    test('should_deduplicate_meta_elements_by_name_attribute', () => {
      const layoutHead = {
        meta: [
          { name: 'description', content: 'Layout description' },
          { name: 'keywords', content: 'layout, keywords' }
        ]
      };

      const pageHead = {
        meta: [
          { name: 'description', content: 'Page description' }, // Should replace layout
          { name: 'author', content: 'Page Author' }
        ]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.meta).toHaveLength(3); // description (replaced), keywords, author
      
      const description = result.meta.find(m => m.name === 'description');
      expect(description.content).toBe('Page description'); // Page wins
      
      const keywords = result.meta.find(m => m.name === 'keywords');
      expect(keywords.content).toBe('layout, keywords'); // Layout preserved
      
      const author = result.meta.find(m => m.name === 'author');
      expect(author.content).toBe('Page Author'); // Page added
    });

    test('should_deduplicate_meta_elements_by_property_attribute', () => {
      const layoutHead = {
        meta: [{ property: 'og:title', content: 'Layout Title' }]
      };

      const pageHead = {
        meta: [{ property: 'og:title', content: 'Page Title' }]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.meta).toHaveLength(1);
      expect(result.meta[0].content).toBe('Page Title');
    });

    test('should_deduplicate_meta_elements_by_http_equiv_attribute', () => {
      const layoutHead = {
        meta: [{ 'http-equiv': 'refresh', content: '30' }]
      };

      const pageHead = {
        meta: [{ 'http-equiv': 'refresh', content: '60' }]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.meta).toHaveLength(1);
      expect(result.meta[0].content).toBe('60');
    });

    test('should_deduplicate_charset_meta_elements', () => {
      const layoutHead = {
        meta: [{ charset: 'utf-8' }]
      };

      const pageHead = {
        meta: [{ charset: 'iso-8859-1' }]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.meta).toHaveLength(1);
      expect(result.meta[0].charset).toBe('iso-8859-1');
    });

    test('should_not_deduplicate_meta_elements_without_deduplication_keys', () => {
      const layoutHead = {
        meta: [{ content: 'Layout custom meta' }]
      };

      const pageHead = {
        meta: [{ content: 'Page custom meta' }]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.meta).toHaveLength(2);
    });
  });

  describe('Link Element Deduplication', () => {
    test('should_deduplicate_stylesheet_links_by_href', () => {
      const layoutHead = {
        links: [{ rel: 'stylesheet', href: '/styles.css' }]
      };

      const pageHead = {
        links: [{ rel: 'stylesheet', href: '/styles.css' }] // Duplicate
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.links).toHaveLength(1);
      expect(result.links[0].href).toBe('/styles.css');
    });

    test('should_deduplicate_canonical_links_by_rel_only_with_page_winning', () => {
      const layoutHead = {
        links: [{ rel: 'canonical', href: '/layout-canonical' }]
      };

      const pageHead = {
        links: [{ rel: 'canonical', href: '/page-canonical' }]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.links).toHaveLength(1);
      expect(result.links[0].href).toBe('/page-canonical'); // Page wins
    });

    test('should_deduplicate_icon_links_by_rel_only_with_page_winning', () => {
      const layoutHead = {
        links: [{ rel: 'icon', href: '/layout-icon.ico' }]
      };

      const pageHead = {
        links: [{ rel: 'icon', href: '/page-icon.ico' }]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.links).toHaveLength(1);
      expect(result.links[0].href).toBe('/page-icon.ico'); // Page wins
    });

    test('should_not_deduplicate_links_without_both_rel_and_href', () => {
      const layoutHead = {
        links: [{ rel: 'stylesheet' }] // Missing href
      };

      const pageHead = {
        links: [{ href: '/page.css' }] // Missing rel
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.links).toHaveLength(2);
    });
  });

  describe('Script Element Deduplication', () => {
    test('should_deduplicate_external_scripts_by_src', () => {
      const layoutHead = {
        scripts: [{ src: '/script.js' }]
      };

      const pageHead = {
        scripts: [{ src: '/script.js' }] // Duplicate
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0].src).toBe('/script.js');
    });

    test('should_deduplicate_inline_scripts_by_content_hash', () => {
      const scriptContent = 'console.log("test");';
      
      const layoutHead = {
        scripts: [{ inline: scriptContent }]
      };

      const pageHead = {
        scripts: [{ inline: scriptContent }] // Duplicate content
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0].inline).toBe(scriptContent);
    });

    test('should_allow_different_inline_scripts_with_different_content', () => {
      const layoutHead = {
        scripts: [{ inline: 'console.log("layout");' }]
      };

      const pageHead = {
        scripts: [{ inline: 'console.log("page");' }]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.scripts).toHaveLength(2);
    });

    test('should_handle_inline_script_content_normalization', () => {
      const layoutHead = {
        scripts: [{ inline: '  console.log("test");  \n  ' }]
      };

      const pageHead = {
        scripts: [{ inline: 'console.log("test");' }] // Same after normalization
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.scripts).toHaveLength(1); // Should deduplicate
    });
  });

  describe('Style Element CSS Cascade Order', () => {
    test('should_preserve_css_cascade_order_layout_then_page', () => {
      const layoutHead = {
        styles: [
          { inline: 'body { margin: 0; }' },
          { inline: '.layout { color: blue; }' }
        ]
      };

      const pageHead = {
        styles: [
          { inline: '.page { color: red; }' },
          { inline: 'h1 { font-size: 2em; }' }
        ]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.styles).toHaveLength(4);
      expect(result.styles[0].inline).toBe('body { margin: 0; }');
      expect(result.styles[1].inline).toBe('.layout { color: blue; }');
      expect(result.styles[2].inline).toBe('.page { color: red; }');
      expect(result.styles[3].inline).toBe('h1 { font-size: 2em; }');
    });

    test('should_not_deduplicate_style_elements', () => {
      const sameStyle = 'body { margin: 0; }';
      
      const layoutHead = {
        styles: [{ inline: sameStyle }]
      };

      const pageHead = {
        styles: [{ inline: sameStyle }]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.styles).toHaveLength(2); // No deduplication for styles
    });
  });

  describe('Component Head Merging - CSS Cascade Order', () => {
    test('should_merge_layout_components_and_page_in_correct_order', () => {
      const layoutHead = {
        title: 'Layout',
        styles: [{ inline: 'body { margin: 0; }' }]
      };

      const componentHeads = [
        { styles: [{ inline: '.component1 { color: blue; }' }] },
        { styles: [{ inline: '.component2 { color: green; }' }] }
      ];

      const pageHead = {
        title: 'Page', // Should win
        styles: [{ inline: '.page { color: red; }' }]
      };

      const result = headMerger.mergeWithComponents(layoutHead, componentHeads, pageHead);

      expect(result.title).toBe('Page');
      expect(result.styles).toHaveLength(4);
      expect(result.styles[0].inline).toBe('body { margin: 0; }'); // Layout first
      expect(result.styles[1].inline).toBe('.component1 { color: blue; }'); // Component 1
      expect(result.styles[2].inline).toBe('.component2 { color: green; }'); // Component 2
      expect(result.styles[3].inline).toBe('.page { color: red; }'); // Page last
    });

    test('should_handle_empty_or_null_component_heads', () => {
      const layoutHead = { title: 'Layout' };
      const pageHead = { title: 'Page' };

      expect(() => {
        headMerger.mergeWithComponents(layoutHead, null, pageHead);
      }).not.toThrow();

      expect(() => {
        headMerger.mergeWithComponents(layoutHead, [], pageHead);
      }).not.toThrow();

      const result = headMerger.mergeWithComponents(layoutHead, undefined, pageHead);
      expect(result.title).toBe('Page');
    });
  });

  describe('Head Normalization', () => {
    test('should_normalize_null_or_undefined_heads_to_empty_structure', () => {
      const normalized = headMerger._normalizeHead(null);

      expect(normalized.title).toBe(null);
      expect(normalized.meta).toBeArray();
      expect(normalized.meta).toHaveLength(0);
      expect(normalized.links).toBeArray();
      expect(normalized.links).toHaveLength(0);
      expect(normalized.scripts).toBeArray();
      expect(normalized.scripts).toHaveLength(0);
      expect(normalized.styles).toBeArray();
      expect(normalized.styles).toHaveLength(0);
    });

    test('should_normalize_partial_head_objects', () => {
      const partialHead = {
        title: 'Test Title',
        meta: [{ name: 'description', content: 'desc' }]
        // Missing links, scripts, styles
      };

      const normalized = headMerger._normalizeHead(partialHead);

      expect(normalized.title).toBe('Test Title');
      expect(normalized.meta).toHaveLength(1);
      expect(normalized.links).toBeArray();
      expect(normalized.links).toHaveLength(0);
      expect(normalized.scripts).toBeArray();
      expect(normalized.scripts).toHaveLength(0);
      expect(normalized.styles).toBeArray();
      expect(normalized.styles).toHaveLength(0);
    });

    test('should_handle_non_array_properties_gracefully', () => {
      const invalidHead = {
        title: 'Title',
        meta: 'not an array',
        links: null,
        scripts: 123,
        styles: {}
      };

      const normalized = headMerger._normalizeHead(invalidHead);

      expect(normalized.title).toBe('Title');
      expect(normalized.meta).toBeArray();
      expect(normalized.meta).toHaveLength(0);
      expect(normalized.links).toBeArray();
      expect(normalized.links).toHaveLength(0);
      expect(normalized.scripts).toBeArray();
      expect(normalized.scripts).toHaveLength(0);
      expect(normalized.styles).toBeArray();
      expect(normalized.styles).toHaveLength(0);
    });
  });

  describe('Inline Script Hashing', () => {
    test('should_generate_consistent_hashes_for_identical_content', () => {
      const content = 'console.log("test");';
      
      const hash1 = headMerger._hashInlineScript(content);
      const hash2 = headMerger._hashInlineScript(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toBeString();
    });

    test('should_generate_different_hashes_for_different_content', () => {
      const content1 = 'console.log("test1");';
      const content2 = 'console.log("test2");';
      
      const hash1 = headMerger._hashInlineScript(content1);
      const hash2 = headMerger._hashInlineScript(content2);

      expect(hash1).not.toBe(hash2);
    });

    test('should_normalize_whitespace_before_hashing', () => {
      const content1 = '  console.log("test");  \n  ';
      const content2 = 'console.log("test");';
      
      const hash1 = headMerger._hashInlineScript(content1);
      const hash2 = headMerger._hashInlineScript(content2);

      expect(hash1).toBe(hash2);
    });

    test('should_handle_null_or_undefined_content', () => {
      expect(headMerger._hashInlineScript(null)).toBe('');
      expect(headMerger._hashInlineScript(undefined)).toBe('');
      expect(headMerger._hashInlineScript('')).toBe(''); // Empty string also returns empty string
    });
  });

  describe('DOM Cascade v1 Specification Compliance', () => {
    test('should_follow_head_merging_precedence_rules', () => {
      const layoutHead = {
        title: 'Layout Title',
        meta: [{ name: 'description', content: 'Layout desc' }]
      };

      const pageHead = {
        title: 'Page Title',
        meta: [{ name: 'description', content: 'Page desc' }]
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.title).toBe('Page Title'); // Page wins for title
      expect(result.meta[0].content).toBe('Page desc'); // Page wins for meta
    });

    test('should_implement_css_cascade_order_correctly', () => {
      const layoutHead = { styles: [{ inline: '.layout {}' }] };
      const componentHeads = [{ styles: [{ inline: '.component {}' }] }];
      const pageHead = { styles: [{ inline: '.page {}' }] };

      const result = headMerger.mergeWithComponents(layoutHead, componentHeads, pageHead);

      expect(result.styles[0].inline).toBe('.layout {}');
      expect(result.styles[1].inline).toBe('.component {}');
      expect(result.styles[2].inline).toBe('.page {}');
    });

    test('should_deduplicate_meta_and_links_but_preserve_styles', () => {
      const layoutHead = {
        meta: [{ name: 'description', content: 'Layout' }],
        links: [{ rel: 'stylesheet', href: '/style.css' }],
        styles: [{ inline: 'body { margin: 0; }' }]
      };

      const pageHead = {
        meta: [{ name: 'description', content: 'Page' }], // Should replace
        links: [{ rel: 'stylesheet', href: '/style.css' }], // Should deduplicate  
        styles: [{ inline: 'body { margin: 0; }' }] // Should NOT deduplicate
      };

      const result = headMerger.merge(layoutHead, pageHead);

      expect(result.meta).toHaveLength(1);
      expect(result.meta[0].content).toBe('Page');
      expect(result.links).toHaveLength(1);
      expect(result.styles).toHaveLength(2); // No deduplication for styles
    });
  });
});