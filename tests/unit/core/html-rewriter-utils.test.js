/**
 * Unit Tests for HTMLRewriterUtils Class - Core HTML Processing
 * Tests HTML processing utilities per DOM Cascade v1 specification
 * Addresses ISSUE-001: html-rewriter-utils.js - ZERO TEST COVERAGE (CRITICAL)
 */

import { describe, test, expect } from 'bun:test';
import { HTMLRewriterUtils } from '../../../src/core/html-rewriter-utils.js';

describe('HTMLRewriterUtils', () => {
  
  describe('Layout Data-Unify Extraction', () => {
    test('should_extract_data_unify_from_html_element', () => {
      const html = '<html data-unify="/layouts/main.html"><head><title>Test</title></head><body>Content</body></html>';
      const result = HTMLRewriterUtils.extractLayoutDataUnify(html);
      expect(result).toBe('/layouts/main.html');
    });

    test('should_extract_data_unify_from_body_element', () => {
      const html = '<html><body data-unify="/layouts/page.html">Content</body></html>';
      const result = HTMLRewriterUtils.extractLayoutDataUnify(html);
      expect(result).toBe('/layouts/page.html');
    });

    test('should_prioritize_html_element_over_body_element', () => {
      const html = '<html data-unify="/html-layout.html"><body data-unify="/body-layout.html">Content</body></html>';
      const result = HTMLRewriterUtils.extractLayoutDataUnify(html);
      expect(result).toBe('/html-layout.html');
    });

    test('should_return_null_for_missing_data_unify_attribute', () => {
      const html = '<html><head><title>Test</title></head><body>Content</body></html>';
      const result = HTMLRewriterUtils.extractLayoutDataUnify(html);
      expect(result).toBe(null);
    });

    test('should_handle_single_quotes_in_data_unify_attribute', () => {
      const html = "<html data-unify='/layouts/single.html'><body>Content</body></html>";
      const result = HTMLRewriterUtils.extractLayoutDataUnify(html);
      expect(result).toBe('/layouts/single.html');
    });

    test('should_handle_data_unify_with_additional_attributes', () => {
      const html = '<html class="main" data-unify="/layouts/main.html" lang="en"><body>Content</body></html>';
      const result = HTMLRewriterUtils.extractLayoutDataUnify(html);
      expect(result).toBe('/layouts/main.html');
    });

    test('should_return_null_for_null_or_undefined_input', () => {
      expect(HTMLRewriterUtils.extractLayoutDataUnify(null)).toBe(null);
      expect(HTMLRewriterUtils.extractLayoutDataUnify(undefined)).toBe(null);
      expect(HTMLRewriterUtils.extractLayoutDataUnify('')).toBe(null);
    });

    test('should_return_null_for_non_string_input', () => {
      expect(HTMLRewriterUtils.extractLayoutDataUnify(123)).toBe(null);
      expect(HTMLRewriterUtils.extractLayoutDataUnify({})).toBe(null);
      expect(HTMLRewriterUtils.extractLayoutDataUnify([])).toBe(null);
    });

    test('should_handle_malformed_html_gracefully', () => {
      const malformedHtml = '<html data-unify="/test.html" <body>Missing closing bracket';
      const result = HTMLRewriterUtils.extractLayoutDataUnify(malformedHtml);
      expect(result).toBe('/test.html');
    });

    test('should_handle_case_insensitive_html_tags', () => {
      const html = '<HTML data-unify="/layouts/upper.html"><BODY>Content</BODY></HTML>';
      const result = HTMLRewriterUtils.extractLayoutDataUnify(html);
      expect(result).toBe('/layouts/upper.html');
    });
  });

  describe('Head Content Extraction', () => {
    test('should_extract_head_content_between_head_tags', () => {
      const html = '<html><head><title>Test Title</title><meta charset="utf-8"></head><body>Content</body></html>';
      const result = HTMLRewriterUtils.extractHeadContent(html);
      expect(result).toBe('<title>Test Title</title><meta charset="utf-8">');
    });

    test('should_filter_html_comments_from_head_content', () => {
      const html = '<html><head><!-- This is a comment --><title>Test</title><!-- Another comment --></head><body>Content</body></html>';
      const result = HTMLRewriterUtils.extractHeadContent(html);
      expect(result).toBe('<title>Test</title>');
    });

    test('should_return_empty_string_for_missing_head_tags', () => {
      const html = '<html><body>Content without head</body></html>';
      const result = HTMLRewriterUtils.extractHeadContent(html);
      expect(result).toBe('');
    });

    test('should_handle_head_with_attributes', () => {
      const html = '<html><head lang="en" class="test"><title>Test</title></head><body>Content</body></html>';
      const result = HTMLRewriterUtils.extractHeadContent(html);
      expect(result).toBe('<title>Test</title>');
    });

    test('should_return_empty_string_for_null_or_undefined_input', () => {
      expect(HTMLRewriterUtils.extractHeadContent(null)).toBe('');
      expect(HTMLRewriterUtils.extractHeadContent(undefined)).toBe('');
      expect(HTMLRewriterUtils.extractHeadContent('')).toBe('');
    });

    test('should_handle_multiline_head_content', () => {
      const html = `<html>
        <head>
          <title>Multi-line Title</title>
          <meta charset="utf-8">
          <link rel="stylesheet" href="/styles.css">
        </head>
        <body>Content</body>
      </html>`;
      const result = HTMLRewriterUtils.extractHeadContent(html);
      expect(result).toContain('<title>Multi-line Title</title>');
      expect(result).toContain('<meta charset="utf-8">');
      expect(result).toContain('<link rel="stylesheet" href="/styles.css">');
    });

    test('should_handle_case_insensitive_head_tags', () => {
      const html = '<HTML><HEAD><title>Test</title></HEAD><BODY>Content</BODY></HTML>';
      const result = HTMLRewriterUtils.extractHeadContent(html);
      expect(result).toBe('<title>Test</title>');
    });

    test('should_handle_empty_head_tags', () => {
      const html = '<html><head></head><body>Content</body></html>';
      const result = HTMLRewriterUtils.extractHeadContent(html);
      expect(result).toBe('');
    });
  });

  describe('Head Elements Extraction', () => {
    test('should_extract_all_head_element_types', () => {
      const html = `
        <html>
          <head>
            <title>Test Title</title>
            <meta charset="utf-8">
            <meta name="description" content="Test description">
            <link rel="stylesheet" href="/styles.css">
            <link rel="icon" href="/favicon.ico">
            <script src="/external.js"></script>
            <script>console.log('inline');</script>
            <style>.test { color: red; }</style>
          </head>
          <body>Content</body>
        </html>
      `;
      
      const result = HTMLRewriterUtils.extractHeadElements(html);
      
      expect(result.title).toBe('Test Title');
      expect(result.meta).toBeArray();
      expect(result.meta.length).toBe(2);
      expect(result.links).toBeArray();
      expect(result.links.length).toBe(2);
      expect(result.scripts).toBeArray();
      expect(result.scripts.length).toBe(2);
      expect(result.styles).toBeArray();
      expect(result.styles.length).toBe(1);
    });

    test('should_extract_meta_tag_attributes_correctly', () => {
      const html = '<head><meta name="description" content="Test description" data-test="value"></head>';
      const result = HTMLRewriterUtils.extractHeadElements(html);
      
      expect(result.meta).toBeArray();
      expect(result.meta[0]).toEqual({
        name: 'description',
        content: 'Test description',
        'data-test': 'value'
      });
    });

    test('should_extract_link_tag_attributes_correctly', () => {
      const html = '<head><link rel="stylesheet" href="/test.css" media="screen"></head>';
      const result = HTMLRewriterUtils.extractHeadElements(html);
      
      expect(result.links).toBeArray();
      expect(result.links[0]).toEqual({
        rel: 'stylesheet',
        href: '/test.css',
        media: 'screen'
      });
    });

    test('should_handle_inline_and_external_scripts', () => {
      const html = `
        <head>
          <script src="/external.js" defer></script>
          <script type="text/javascript">var test = true;</script>
          <script src="/another.js"/>
        </head>
      `;
      const result = HTMLRewriterUtils.extractHeadElements(html);
      
      expect(result.scripts).toBeArray();
      expect(result.scripts.length).toBe(3);
      
      // External script with defer
      expect(result.scripts[0]).toEqual({
        src: '/external.js',
        defer: ''
      });
      
      // Inline script
      expect(result.scripts[1]).toEqual({
        type: 'text/javascript',
        inline: 'var test = true;'
      });
      
      // Self-closing external script
      expect(result.scripts[2]).toEqual({
        src: '/another.js'
      });
    });

    test('should_skip_data_unify_docs_style_blocks_per_dom_spec', () => {
      const html = `
        <head>
          <style>.normal { color: blue; }</style>
          <style data-unify-docs="v1">.unify-hero { margin: 0; }</style>
          <style data-unify-docs>.unify-content { padding: 20px; }</style>
          <style class="regular">.regular { font-size: 16px; }</style>
        </head>
      `;
      const result = HTMLRewriterUtils.extractHeadElements(html);
      
      expect(result.styles).toBeArray();
      expect(result.styles.length).toBe(2); // Should skip both data-unify-docs blocks
      expect(result.styles[0].inline).toBe('.normal { color: blue; }');
      expect(result.styles[1].inline).toBe('.regular { font-size: 16px; }');
    });

    test('should_return_empty_structure_for_null_or_undefined_input', () => {
      const expected = {
        title: null,
        meta: [],
        links: [],
        scripts: [],
        styles: []
      };
      
      expect(HTMLRewriterUtils.extractHeadElements(null)).toEqual(expected);
      expect(HTMLRewriterUtils.extractHeadElements(undefined)).toEqual(expected);
      expect(HTMLRewriterUtils.extractHeadElements('')).toEqual(expected);
    });

    test('should_handle_empty_attributes_gracefully', () => {
      const html = '<head><meta name="test"><link rel="test"><script></script><style></style></head>';
      const result = HTMLRewriterUtils.extractHeadElements(html);
      
      // Should still create entries but with minimal attributes
      expect(result.meta.length).toBe(1);
      expect(result.links.length).toBe(1);
      expect(result.scripts.length).toBe(1);
      expect(result.styles.length).toBe(1);
    });
  });

  describe('Meta Tag Deduplication', () => {
    test('should_deduplicate_meta_tags_by_name', () => {
      const metaTags = [
        { name: 'description', content: 'First description' },
        { name: 'description', content: 'Second description' },
        { name: 'keywords', content: 'test, keywords' }
      ];
      
      const result = HTMLRewriterUtils.deduplicateMetaTags(metaTags);
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ name: 'description', content: 'First description' });
      expect(result[1]).toEqual({ name: 'keywords', content: 'test, keywords' });
    });

    test('should_deduplicate_meta_tags_by_property', () => {
      const metaTags = [
        { property: 'og:title', content: 'First title' },
        { property: 'og:title', content: 'Second title' },
        { property: 'og:description', content: 'Description' }
      ];
      
      const result = HTMLRewriterUtils.deduplicateMetaTags(metaTags);
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ property: 'og:title', content: 'First title' });
      expect(result[1]).toEqual({ property: 'og:description', content: 'Description' });
    });

    test('should_deduplicate_meta_tags_by_http_equiv', () => {
      const metaTags = [
        { 'http-equiv': 'refresh', content: '30' },
        { 'http-equiv': 'refresh', content: '60' },
        { 'http-equiv': 'content-type', content: 'text/html' }
      ];
      
      const result = HTMLRewriterUtils.deduplicateMetaTags(metaTags);
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ 'http-equiv': 'refresh', content: '30' });
      expect(result[1]).toEqual({ 'http-equiv': 'content-type', content: 'text/html' });
    });

    test('should_deduplicate_charset_meta_tags', () => {
      const metaTags = [
        { charset: 'utf-8' },
        { charset: 'iso-8859-1' },
        { name: 'description', content: 'Test' }
      ];
      
      const result = HTMLRewriterUtils.deduplicateMetaTags(metaTags);
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ charset: 'utf-8' });
      expect(result[1]).toEqual({ name: 'description', content: 'Test' });
    });

    test('should_include_meta_tags_without_deduplication_keys', () => {
      const metaTags = [
        { content: 'orphaned meta tag' },
        { 'custom-attr': 'value' },
        { name: 'description', content: 'Normal meta' }
      ];
      
      const result = HTMLRewriterUtils.deduplicateMetaTags(metaTags);
      
      expect(result).toBeArray();
      expect(result.length).toBe(3);
    });

    test('should_return_empty_array_for_invalid_input', () => {
      expect(HTMLRewriterUtils.deduplicateMetaTags(null)).toEqual([]);
      expect(HTMLRewriterUtils.deduplicateMetaTags(undefined)).toEqual([]);
      expect(HTMLRewriterUtils.deduplicateMetaTags('not an array')).toEqual([]);
      expect(HTMLRewriterUtils.deduplicateMetaTags({})).toEqual([]);
    });
  });

  describe('Link Tag Deduplication', () => {
    test('should_deduplicate_link_tags_by_rel_and_href', () => {
      const linkTags = [
        { rel: 'stylesheet', href: '/styles.css' },
        { rel: 'stylesheet', href: '/styles.css' },
        { rel: 'stylesheet', href: '/other.css' }
      ];
      
      const result = HTMLRewriterUtils.deduplicateLinkTags(linkTags);
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ rel: 'stylesheet', href: '/styles.css' });
      expect(result[1]).toEqual({ rel: 'stylesheet', href: '/other.css' });
    });

    test('should_handle_canonical_link_deduplication_specially', () => {
      const linkTags = [
        { rel: 'canonical', href: '/page1' },
        { rel: 'canonical', href: '/page2' }, // Should be deduplicated by rel only
        { rel: 'alternate', href: '/page1' }
      ];
      
      const result = HTMLRewriterUtils.deduplicateLinkTags(linkTags);
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ rel: 'canonical', href: '/page1' });
      expect(result[1]).toEqual({ rel: 'alternate', href: '/page1' });
    });

    test('should_handle_icon_link_deduplication_specially', () => {
      const linkTags = [
        { rel: 'icon', href: '/favicon16.ico' },
        { rel: 'icon', href: '/favicon32.ico' }, // Should be deduplicated by rel only
        { rel: 'stylesheet', href: '/favicon16.ico' }
      ];
      
      const result = HTMLRewriterUtils.deduplicateLinkTags(linkTags);
      
      expect(result).toBeArray();
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ rel: 'icon', href: '/favicon16.ico' });
      expect(result[1]).toEqual({ rel: 'stylesheet', href: '/favicon16.ico' });
    });

    test('should_include_link_tags_without_rel_or_href', () => {
      const linkTags = [
        { media: 'screen' },
        { type: 'text/css' },
        { rel: 'stylesheet', href: '/normal.css' }
      ];
      
      const result = HTMLRewriterUtils.deduplicateLinkTags(linkTags);
      
      expect(result).toBeArray();
      expect(result.length).toBe(3);
    });

    test('should_return_empty_array_for_invalid_input', () => {
      expect(HTMLRewriterUtils.deduplicateLinkTags(null)).toEqual([]);
      expect(HTMLRewriterUtils.deduplicateLinkTags(undefined)).toEqual([]);
      expect(HTMLRewriterUtils.deduplicateLinkTags('not an array')).toEqual([]);
      expect(HTMLRewriterUtils.deduplicateLinkTags({})).toEqual([]);
    });
  });

  describe('Head HTML Generation', () => {
    test('should_generate_complete_head_html_from_elements', () => {
      const head = {
        title: 'Test Title',
        meta: [
          { charset: 'utf-8' },
          { name: 'description', content: 'Test description' }
        ],
        links: [
          { rel: 'stylesheet', href: '/styles.css' },
          { rel: 'icon', href: '/favicon.ico' }
        ],
        scripts: [
          { src: '/external.js' },
          { inline: 'console.log("test");', type: 'text/javascript' }
        ],
        styles: [
          { inline: '.test { color: red; }' }
        ]
      };
      
      const result = HTMLRewriterUtils.generateHeadHtml(head);
      
      expect(result).toContain('<title>Test Title</title>');
      expect(result).toContain('<meta charset="utf-8">');
      expect(result).toContain('<meta name="description" content="Test description">');
      expect(result).toContain('<link rel="stylesheet" href="/styles.css">');
      expect(result).toContain('<link rel="icon" href="/favicon.ico">');
      expect(result).toContain('<script src="/external.js"></script>');
      expect(result).toContain('<script type="text/javascript">console.log("test");</script>');
      expect(result).toContain('<style>.test { color: red; }</style>');
    });

    test('should_handle_boolean_attributes_correctly', () => {
      const head = {
        meta: [{ charset: 'utf-8', required: true }],
        links: [{ rel: 'stylesheet', href: '/test.css', crossorigin: '' }],
        scripts: [{ src: '/test.js', async: true, defer: '' }]
      };
      
      const result = HTMLRewriterUtils.generateHeadHtml(head);
      
      expect(result).toContain('<meta charset="utf-8" required>');
      expect(result).toContain('<link rel="stylesheet" href="/test.css" crossorigin>');
      expect(result).toContain('<script src="/test.js" async defer></script>');
    });

    test('should_handle_empty_or_missing_element_arrays', () => {
      const head = {
        title: 'Only Title',
        meta: [],
        links: undefined,
        scripts: null,
        styles: []
      };
      
      const result = HTMLRewriterUtils.generateHeadHtml(head);
      
      expect(result).toBe('<title>Only Title</title>');
    });

    test('should_handle_scripts_without_inline_content', () => {
      const head = {
        scripts: [
          { src: '/external.js', type: 'module' }
        ]
      };
      
      const result = HTMLRewriterUtils.generateHeadHtml(head);
      
      expect(result).toBe('<script src="/external.js" type="module"></script>');
    });

    test('should_handle_styles_without_inline_content', () => {
      const head = {
        styles: [
          { media: 'screen' }
        ]
      };
      
      const result = HTMLRewriterUtils.generateHeadHtml(head);
      
      expect(result).toBe('<style media="screen"></style>');
    });
  });

  describe('Body Content Extraction', () => {
    test('should_extract_content_from_body_tags', () => {
      const html = '<html><head><title>Test</title></head><body><main>Main content</main></body></html>';
      const result = HTMLRewriterUtils.extractBodyContent(html);
      expect(result).toBe('<main>Main content</main>');
    });

    test('should_extract_content_from_body_with_attributes', () => {
      const html = '<html><body class="main" data-test="value"><div>Content</div></body></html>';
      const result = HTMLRewriterUtils.extractBodyContent(html);
      expect(result).toBe('<div>Content</div>');
    });

    test('should_clean_fragment_html_when_no_body_tag', () => {
      const html = '<div class="fragment"><p>Fragment content</p></div>';
      const result = HTMLRewriterUtils.extractBodyContent(html);
      expect(result).toBe('<div class="fragment"><p>Fragment content</p></div>');
    });

    test('should_remove_head_and_html_tags_from_fragments', () => {
      const html = '<!doctype html><html><head><title>Test</title></head><div>Fragment</div></html>';
      const result = HTMLRewriterUtils.extractBodyContent(html);
      expect(result).toBe('<div>Fragment</div>');
    });

    test('should_handle_multiline_body_content', () => {
      const html = `
        <html>
          <body>
            <header>Header</header>
            <main>Main content</main>
            <footer>Footer</footer>
          </body>
        </html>
      `;
      const result = HTMLRewriterUtils.extractBodyContent(html);
      expect(result).toContain('<header>Header</header>');
      expect(result).toContain('<main>Main content</main>');
      expect(result).toContain('<footer>Footer</footer>');
    });

    test('should_return_empty_string_for_null_or_undefined_input', () => {
      expect(HTMLRewriterUtils.extractBodyContent(null)).toBe('');
      expect(HTMLRewriterUtils.extractBodyContent(undefined)).toBe('');
      expect(HTMLRewriterUtils.extractBodyContent('')).toBe('');
    });

    test('should_handle_case_insensitive_body_tags', () => {
      const html = '<HTML><BODY>Upper case content</BODY></HTML>';
      const result = HTMLRewriterUtils.extractBodyContent(html);
      expect(result).toBe('Upper case content');
    });

    test('should_fallback_to_original_html_on_error', () => {
      const html = 'Simple text without tags';
      const result = HTMLRewriterUtils.extractBodyContent(html);
      expect(result).toBe('Simple text without tags');
    });
  });

  describe('Data-Unify Attribute Removal', () => {
    test('should_remove_data_unify_attributes_with_double_quotes', () => {
      const html = '<div data-unify="/fragment.html" class="test">Content</div>';
      const result = HTMLRewriterUtils.removeDataUnifyAttributes(html);
      expect(result).toBe('<div class="test">Content</div>');
    });

    test('should_remove_data_unify_attributes_with_single_quotes', () => {
      const html = "<div data-unify='/fragment.html' class='test'>Content</div>";
      const result = HTMLRewriterUtils.removeDataUnifyAttributes(html);
      expect(result).toBe("<div class='test'>Content</div>");
    });

    test('should_remove_unquoted_data_unify_attributes', () => {
      const html = '<div data-unify=/fragment.html class="test">Content</div>';
      const result = HTMLRewriterUtils.removeDataUnifyAttributes(html);
      expect(result).toBe('<div class="test">Content</div>');
    });

    test('should_remove_legacy_data_layer_attributes', () => {
      const html = '<div data-layer="/legacy.html" data-unify="/new.html" class="test">Content</div>';
      const result = HTMLRewriterUtils.removeDataUnifyAttributes(html);
      expect(result).toBe('<div class="test">Content</div>');
    });

    test('should_clean_up_whitespace_after_attribute_removal', () => {
      const html = '<div  data-unify="/test.html"  class="test"  >Content</div>';
      const result = HTMLRewriterUtils.removeDataUnifyAttributes(html);
      expect(result).toBe('<div  class="test">Content</div>');
    });

    test('should_handle_elements_with_only_data_unify_attribute', () => {
      const html = '<div data-unify="/test.html">Content</div>';
      const result = HTMLRewriterUtils.removeDataUnifyAttributes(html);
      expect(result).toBe('<div>Content</div>');
    });

    test('should_return_original_string_for_null_or_undefined_input', () => {
      expect(HTMLRewriterUtils.removeDataUnifyAttributes(null)).toBe('');
      expect(HTMLRewriterUtils.removeDataUnifyAttributes(undefined)).toBe('');
      expect(HTMLRewriterUtils.removeDataUnifyAttributes('')).toBe('');
    });

    test('should_handle_multiple_elements_with_data_unify', () => {
      const html = '<div data-unify="/test1.html">First</div><span data-unify="/test2.html">Second</span>';
      const result = HTMLRewriterUtils.removeDataUnifyAttributes(html);
      expect(result).toBe('<div>First</div><span>Second</span>');
    });

    test('should_preserve_non_data_unify_attributes', () => {
      const html = '<div data-test="keep" data-unify="/remove.html" data-other="also-keep">Content</div>';
      const result = HTMLRewriterUtils.removeDataUnifyAttributes(html);
      expect(result).toBe('<div data-test="keep" data-other="also-keep">Content</div>');
    });
  });

  describe('Data-Unify-Docs Style Block Removal', () => {
    test('should_remove_style_blocks_with_data_unify_docs_attribute', () => {
      const html = `
        <head>
          <style>.normal { color: blue; }</style>
          <style data-unify-docs="v1">.unify-area { display: block; }</style>
          <style>.another { margin: 0; }</style>
        </head>
      `;
      const result = HTMLRewriterUtils.removeDataUnifyDocsStyleBlocks(html);
      expect(result).toContain('<style>.normal { color: blue; }</style>');
      expect(result).not.toContain('data-unify-docs');
      expect(result).not.toContain('.unify-area { display: block; }');
      expect(result).toContain('<style>.another { margin: 0; }</style>');
    });

    test('should_handle_style_blocks_with_various_data_unify_docs_values', () => {
      const html = `
        <style data-unify-docs>Area docs</style>
        <style data-unify-docs="v1">Version 1 docs</style>
        <style data-unify-docs='v2'>Version 2 docs</style>
        <style class="keep">.keep { color: red; }</style>
      `;
      const result = HTMLRewriterUtils.removeDataUnifyDocsStyleBlocks(html);
      expect(result).not.toContain('Area docs');
      expect(result).not.toContain('Version 1 docs');
      expect(result).not.toContain('Version 2 docs');
      expect(result).toContain('<style class="keep">.keep { color: red; }</style>');
    });

    test('should_return_original_string_for_null_or_undefined_input', () => {
      expect(HTMLRewriterUtils.removeDataUnifyDocsStyleBlocks(null)).toBe('');
      expect(HTMLRewriterUtils.removeDataUnifyDocsStyleBlocks(undefined)).toBe('');
      expect(HTMLRewriterUtils.removeDataUnifyDocsStyleBlocks('')).toBe('');
    });

    test('should_handle_multiline_style_blocks', () => {
      const html = `
        <style data-unify-docs="v1">
          .unify-hero {
            background: blue;
            padding: 20px;
          }
          .unify-content {
            margin: 10px;
          }
        </style>
        <style>
          .normal {
            color: black;
          }
        </style>
      `;
      const result = HTMLRewriterUtils.removeDataUnifyDocsStyleBlocks(html);
      expect(result).not.toContain('.unify-hero');
      expect(result).not.toContain('background: blue');
      expect(result).toContain('.normal');
      expect(result).toContain('color: black');
    });
  });

  describe('Head Content Injection', () => {
    test('should_inject_content_before_closing_head_tag', () => {
      const html = '<html><head><title>Test</title></head><body>Content</body></html>';
      const content = '<meta name="injected" content="true">';
      const result = HTMLRewriterUtils.injectIntoHead(html, content);
      expect(result).toContain('<title>Test</title>\n<meta name="injected" content="true">\n</head>');
    });

    test('should_return_original_html_if_no_content_provided', () => {
      const html = '<html><head><title>Test</title></head><body>Content</body></html>';
      expect(HTMLRewriterUtils.injectIntoHead(html, null)).toBe(html);
      expect(HTMLRewriterUtils.injectIntoHead(html, '')).toBe(html);
      expect(HTMLRewriterUtils.injectIntoHead(html, undefined)).toBe(html);
    });

    test('should_return_empty_string_for_null_html', () => {
      const content = '<meta name="test" content="value">';
      expect(HTMLRewriterUtils.injectIntoHead(null, content)).toBe('');
      expect(HTMLRewriterUtils.injectIntoHead(undefined, content)).toBe('');
    });

    test('should_handle_case_insensitive_head_closing_tag', () => {
      const html = '<HTML><HEAD><title>Test</title></HEAD><BODY>Content</BODY></HTML>';
      const content = '<meta name="injected" content="true">';
      const result = HTMLRewriterUtils.injectIntoHead(html, content);
      expect(result).toContain('<meta name="injected" content="true">');
    });
  });

  describe('Title Extraction and Replacement', () => {
    test('should_extract_title_from_html', () => {
      const html = '<html><head><title>Test Title</title></head><body>Content</body></html>';
      const result = HTMLRewriterUtils.extractTitle(html);
      expect(result).toBe('Test Title');
    });

    test('should_return_null_for_missing_title', () => {
      const html = '<html><head><meta charset="utf-8"></head><body>Content</body></html>';
      const result = HTMLRewriterUtils.extractTitle(html);
      expect(result).toBe(null);
    });

    test('should_handle_title_with_attributes', () => {
      const html = '<html><head><title lang="en">Test Title</title></head><body>Content</body></html>';
      const result = HTMLRewriterUtils.extractTitle(html);
      expect(result).toBe('Test Title');
    });

    test('should_replace_title_in_html', () => {
      const html = '<html><head><title>Old Title</title></head><body>Content</body></html>';
      const result = HTMLRewriterUtils.replaceTitle(html, 'New Title');
      expect(result).toContain('<title>New Title</title>');
      expect(result).not.toContain('Old Title');
    });

    test('should_return_original_html_when_no_new_title_provided', () => {
      const html = '<html><head><title>Test</title></head><body>Content</body></html>';
      expect(HTMLRewriterUtils.replaceTitle(html, null)).toBe(html);
      expect(HTMLRewriterUtils.replaceTitle(html, '')).toBe(html);
      expect(HTMLRewriterUtils.replaceTitle(html, undefined)).toBe(html);
    });

    test('should_handle_multiline_title_content', () => {
      const html = '<html><head><title>Multi Line Title</title></head><body>Content</body></html>';
      const result = HTMLRewriterUtils.extractTitle(html);
      expect(result).toBe('Multi Line Title');
    });
  });

  describe('Area Class Detection and Content Replacement', () => {
    test('should_detect_area_classes_in_html', () => {
      const html = '<div class="container unify-hero main">Content</div>';
      const result = HTMLRewriterUtils.hasAreaClass(html, 'unify-hero');
      expect(result).toBe(true);
    });

    test('should_return_false_for_missing_area_classes', () => {
      const html = '<div class="container main">Content</div>';
      const result = HTMLRewriterUtils.hasAreaClass(html, 'unify-hero');
      expect(result).toBe(false);
    });

    test('should_handle_single_quoted_class_attributes', () => {
      const html = "<div class='container unify-content test'>Content</div>";
      const result = HTMLRewriterUtils.hasAreaClass(html, 'unify-content');
      expect(result).toBe(true);
    });

    test('should_replace_element_content_by_class', () => {
      const html = '<div class="unify-hero">Old content</div>';
      const newContent = 'New hero content';
      const result = HTMLRewriterUtils.replaceElementContentByClass(html, 'unify-hero', newContent);
      expect(result).toBe('<div class="unify-hero">New hero content</div>');
    });

    test('should_handle_multiple_elements_with_same_class', () => {
      const html = '<div class="unify-item">First</div><span class="unify-item">Second</span>';
      const newContent = 'Replaced';
      const result = HTMLRewriterUtils.replaceElementContentByClass(html, 'unify-item', newContent);
      expect(result).toContain('<div class="unify-item">Replaced</div>');
      expect(result).toContain('<span class="unify-item">Replaced</span>');
    });

    test('should_return_original_html_for_invalid_parameters', () => {
      const html = '<div class="test">Content</div>';
      expect(HTMLRewriterUtils.hasAreaClass(null, 'test')).toBe(false);
      expect(HTMLRewriterUtils.hasAreaClass(html, null)).toBe(false);
      expect(HTMLRewriterUtils.replaceElementContentByClass(html, null, 'new')).toBe(html);
    });
  });

  describe('Tag Detection', () => {
    test('should_detect_presence_of_html_tags', () => {
      const html = '<div><main>Content</main><aside>Sidebar</aside></div>';
      expect(HTMLRewriterUtils.hasTag(html, 'main')).toBe(true);
      expect(HTMLRewriterUtils.hasTag(html, 'aside')).toBe(true);
      expect(HTMLRewriterUtils.hasTag(html, 'header')).toBe(false);
    });

    test('should_handle_tags_with_attributes', () => {
      const html = '<header class="main-header" role="banner">Header</header>';
      const result = HTMLRewriterUtils.hasTag(html, 'header');
      expect(result).toBe(true);
    });

    test('should_be_case_insensitive_for_tag_detection', () => {
      const html = '<MAIN>Content</MAIN>';
      const result = HTMLRewriterUtils.hasTag(html, 'main');
      expect(result).toBe(true);
    });

    test('should_return_false_for_invalid_parameters', () => {
      expect(HTMLRewriterUtils.hasTag(null, 'main')).toBe(false);
      expect(HTMLRewriterUtils.hasTag('<div>test</div>', null)).toBe(false);
      expect(HTMLRewriterUtils.hasTag('', 'main')).toBe(false);
    });
  });

  describe('Regex Escaping and Safe Replacement', () => {
    test('should_escape_regex_special_characters', () => {
      const input = 'test.regex*with+special?chars^${}()|[]\\';
      const result = HTMLRewriterUtils.escapeRegex(input);
      expect(result).toBe('test\\.regex\\*with\\+special\\?chars\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });

    test('should_return_empty_string_for_invalid_input', () => {
      expect(HTMLRewriterUtils.escapeRegex(null)).toBe('');
      expect(HTMLRewriterUtils.escapeRegex(undefined)).toBe('');
      expect(HTMLRewriterUtils.escapeRegex('')).toBe('');
      expect(HTMLRewriterUtils.escapeRegex(123)).toBe('');
    });

    test('should_perform_safe_string_replacement', () => {
      const str = 'Hello world';
      const result = HTMLRewriterUtils.safeReplace(str, 'world', 'universe');
      expect(result).toBe('Hello universe');
    });

    test('should_handle_regex_pattern_replacement', () => {
      const str = 'Replace 123 and 456';
      const result = HTMLRewriterUtils.safeReplace(str, /\d+/g, 'NUMBER');
      expect(result).toBe('Replace NUMBER and NUMBER');
    });

    test('should_return_original_string_for_invalid_input', () => {
      expect(HTMLRewriterUtils.safeReplace(null, 'test', 'replace')).toBe('');
      expect(HTMLRewriterUtils.safeReplace(undefined, 'test', 'replace')).toBe('');
      expect(HTMLRewriterUtils.safeReplace('', 'test', 'replace')).toBe('');
    });
  });

  describe('Attribute Extraction', () => {
    test('should_extract_attributes_with_double_quoted_values', () => {
      const elementHtml = '<div class="test" id="main" data-value="123">';
      const result = HTMLRewriterUtils.extractAttributes(elementHtml);
      expect(result).toEqual({
        class: 'test',
        id: 'main',
        'data-value': '123'
      });
    });

    test('should_extract_attributes_with_single_quoted_values', () => {
      const elementHtml = "<div class='test' id='main' data-value='456'>";
      const result = HTMLRewriterUtils.extractAttributes(elementHtml);
      expect(result).toEqual({
        class: 'test',
        id: 'main',
        'data-value': '456'
      });
    });

    test('should_extract_attributes_with_unquoted_values', () => {
      const elementHtml = '<div class=test id=main data-value=789>';
      const result = HTMLRewriterUtils.extractAttributes(elementHtml);
      expect(result).toEqual({
        class: 'test',
        id: 'main',
        'data-value': '789'
      });
    });

    test('should_extract_boolean_attributes', () => {
      const elementHtml = '<input type="text" required disabled readonly>';
      const result = HTMLRewriterUtils.extractAttributes(elementHtml);
      expect(result).toEqual({
        type: 'text',
        required: '',
        disabled: '',
        readonly: ''
      });
    });

    test('should_handle_mixed_attribute_types', () => {
      const elementHtml = '<video src="video.mp4" controls autoplay muted loop>';
      const result = HTMLRewriterUtils.extractAttributes(elementHtml);
      expect(result).toEqual({
        src: 'video.mp4',
        controls: '',
        autoplay: '',
        muted: '',
        loop: ''
      });
    });

    test('should_handle_hyphenated_attribute_names', () => {
      const elementHtml = '<div data-test-value="123" aria-label="Test" my-custom-attr="value">';
      const result = HTMLRewriterUtils.extractAttributes(elementHtml);
      expect(result).toEqual({
        'data-test-value': '123',
        'aria-label': 'Test',
        'my-custom-attr': 'value'
      });
    });

    test('should_return_empty_object_for_invalid_input', () => {
      expect(HTMLRewriterUtils.extractAttributes(null)).toEqual({});
      expect(HTMLRewriterUtils.extractAttributes(undefined)).toEqual({});
      expect(HTMLRewriterUtils.extractAttributes('')).toEqual({});
      expect(HTMLRewriterUtils.extractAttributes(123)).toEqual({});
    });

    test('should_handle_empty_attribute_values', () => {
      const elementHtml = '<div class="" id="" data-empty="">';
      const result = HTMLRewriterUtils.extractAttributes(elementHtml);
      expect(result).toEqual({
        class: '',
        id: '',
        'data-empty': ''
      });
    });

    test('should_handle_attributes_with_spaces_in_values', () => {
      const elementHtml = '<div class="test class with spaces" title="A title with spaces">';
      const result = HTMLRewriterUtils.extractAttributes(elementHtml);
      expect(result).toEqual({
        class: 'test class with spaces',
        title: 'A title with spaces'
      });
    });
  });

  describe('HTML Validation', () => {
    test('should_validate_well_formed_html', () => {
      const html = '<div><p>Test</p><span>Content</span></div>';
      const result = HTMLRewriterUtils.isValidHTML(html);
      expect(result).toBe(true);
    });

    test('should_validate_html_with_self_closing_tags', () => {
      const html = '<div><img src="test.jpg" alt="test"/><br/><p>Content</p></div>';
      const result = HTMLRewriterUtils.isValidHTML(html);
      expect(result).toBe(true);
    });

    test('should_detect_malformed_html_with_unmatched_tags', () => {
      const html = '<div><p>Test</p><span>Content<p>More<div>Even more</div>'; // Severely unmatched
      const result = HTMLRewriterUtils.isValidHTML(html);
      expect(result).toBe(false);
    });

    test('should_handle_empty_html_gracefully', () => {
      expect(HTMLRewriterUtils.isValidHTML('')).toBe(false);
      expect(HTMLRewriterUtils.isValidHTML(null)).toBe(false);
      expect(HTMLRewriterUtils.isValidHTML(undefined)).toBe(false);
    });

    test('should_handle_html_with_comments', () => {
      const html = '<div><!-- Comment --><p>Test</p></div>';
      const result = HTMLRewriterUtils.isValidHTML(html);
      expect(result).toBe(true);
    });

    test('should_allow_minor_tag_imbalance_tolerance', () => {
      const html = '<div><p>Test</p><br><span>Content</span></div>'; // br without closing
      const result = HTMLRewriterUtils.isValidHTML(html);
      expect(result).toBe(true); // Should be tolerant within threshold
    });

    test('should_handle_complex_nested_html', () => {
      const html = `
        <html>
          <head><title>Test</title></head>
          <body>
            <div class="container">
              <header><h1>Title</h1></header>
              <main>
                <section><p>Content</p></section>
                <aside><span>Sidebar</span></aside>
              </main>
              <footer><small>Footer</small></footer>
            </div>
          </body>
        </html>
      `;
      const result = HTMLRewriterUtils.isValidHTML(html);
      expect(result).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should_handle_extremely_large_html_documents', () => {
      const largeHtml = '<div>' + 'a'.repeat(100000) + '</div>';
      expect(() => {
        HTMLRewriterUtils.extractHeadContent(largeHtml);
        HTMLRewriterUtils.extractBodyContent(largeHtml);
        HTMLRewriterUtils.isValidHTML(largeHtml);
      }).not.toThrow();
    });

    test('should_handle_html_with_unicode_characters', () => {
      const unicodeHtml = '<div title="测试 🚀 Тест">Unicode content: émojis 🎉 and symbols ∑</div>';
      const result = HTMLRewriterUtils.extractAttributes(unicodeHtml);
      expect(result.title).toBe('测试 🚀 Тест');
    });

    test('should_handle_malformed_regex_patterns_gracefully', () => {
      const html = '<div>Content</div>';
      // All methods should handle potential regex errors internally
      expect(() => {
        HTMLRewriterUtils.extractLayoutDataUnify(html);
        HTMLRewriterUtils.extractHeadContent(html);
        HTMLRewriterUtils.hasAreaClass(html, 'test');
      }).not.toThrow();
    });

    test('should_handle_circular_references_in_attribute_objects', () => {
      const metaTags = [
        { name: 'test', content: 'value' }
      ];
      // Simulate potential circular reference (though unlikely in practice)
      metaTags.circular = metaTags;
      
      expect(() => {
        HTMLRewriterUtils.deduplicateMetaTags(metaTags);
      }).not.toThrow();
    });

    test('should_handle_html_with_nested_quotes', () => {
      const html = `<div title='This has "nested" quotes' data-json='{"key": "value", "nested": "quote'}"'>Content</div>`;
      const result = HTMLRewriterUtils.extractAttributes(html);
      expect(result.title).toBe('This has "nested" quotes');
    });

    test('should_handle_incomplete_html_tags', () => {
      const malformedHtml = '<div class="test" <span>Incomplete opening tag';
      expect(() => {
        HTMLRewriterUtils.extractAttributes(malformedHtml);
        HTMLRewriterUtils.hasAreaClass(malformedHtml, 'test');
      }).not.toThrow();
    });
  });
});