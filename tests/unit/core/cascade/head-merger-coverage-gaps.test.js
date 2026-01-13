/**
 * Head Merger Coverage Gap Tests - ISSUE-003
 * Tests missing coverage lines for head-merger.js component
 * Lines to cover: 107-109,277,298,346-350,358-359,398-399
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { HeadMerger } from '../../../../src/core/cascade/head-merger.js';

describe('HeadMerger Coverage Gaps', () => {
  let headMerger;

  beforeEach(() => {
    headMerger = new HeadMerger();
  });

  describe('Document Head Extraction', () => {
    test('should_extract_head_from_document_with_html_property', () => {
      // Test line 107-109: extractHead method
      const mockDoc = {
        html: '<html><head><title>Test Title</title><meta charset="utf-8"></head><body>Content</body></html>'
      };
      
      const result = headMerger.extractHead(mockDoc);
      
      expect(result).toBeDefined();
      expect(result.title).toBe('Test Title');
      expect(result.meta).toBeArray();
      expect(result.meta.length).toBeGreaterThan(0);
    });

    test('should_extract_head_from_document_without_html_property', () => {
      // Test line 109: fallback to empty string when doc.html is undefined
      const mockDoc = {};
      
      const result = headMerger.extractHead(mockDoc);
      
      expect(result).toBeDefined();
      expect(result.title).toBe(null);
      expect(result.meta).toEqual([]);
    });

    test('should_extract_head_from_null_document', () => {
      // Test edge case handling - null doc will cause error accessing doc.html
      expect(() => {
        headMerger.extractHead(null);
      }).toThrow();
    });
  });

  describe('Script Merging Edge Cases', () => {
    test('should_handle_layout_scripts_without_src_or_inline', () => {
      // Test line 277: script without src or inline in layout
      const layoutHead = {
        scripts: [
          { type: 'module' }, // Script without src or inline
          { src: '/normal.js' }
        ]
      };
      
      const pageHead = {
        scripts: [
          { src: '/page.js' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.scripts).toBeArray();
      expect(result.scripts.length).toBe(3);
      expect(result.scripts[0]).toEqual({ type: 'module' });
    });

    test('should_handle_page_scripts_without_src_or_inline', () => {
      // Test line 298: script without src or inline in page
      const layoutHead = {
        scripts: [
          { src: '/layout.js' }
        ]
      };
      
      const pageHead = {
        scripts: [
          { defer: true }, // Script without src or inline
          { src: '/page.js' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.scripts).toBeArray();
      expect(result.scripts.length).toBe(3);
      expect(result.scripts[1]).toEqual({ defer: true });
    });

    test('should_handle_multiple_scripts_without_src_or_inline', () => {
      // Test both edge cases together
      const layoutHead = {
        scripts: [
          { type: 'module', async: true }, // No src or inline
          { src: '/layout.js' }
        ]
      };
      
      const pageHead = {
        scripts: [
          { defer: true, crossorigin: 'anonymous' }, // No src or inline
          { inline: 'console.log("test");' }
        ]
      };
      
      const result = headMerger.merge(layoutHead, pageHead);
      
      expect(result.scripts).toBeArray();
      expect(result.scripts.length).toBe(4);
      expect(result.scripts[0]).toEqual({ type: 'module', async: true });
      expect(result.scripts[2]).toEqual({ defer: true, crossorigin: 'anonymous' });
    });
  });

  describe('Style Content Key Generation', () => {
    test('should_generate_style_content_key_for_inline_styles', () => {
      // Test lines 346-350: _getStyleContentKey method
      const style1 = { inline: '  body { margin: 0;   padding: 10px; }  ' };
      const style2 = { inline: 'body { margin: 0; padding: 10px; }' };
      
      const key1 = headMerger._getStyleContentKey(style1);
      const key2 = headMerger._getStyleContentKey(style2);
      
      // Should normalize whitespace
      expect(key1).toBe(key2);
      expect(key1).toBe('body { margin: 0; padding: 10px; }');
    });

    test('should_generate_unique_keys_for_empty_styles', () => {
      // Test line 351: empty styles get unique keys
      const emptyStyle1 = {};
      const emptyStyle2 = { media: 'screen' };
      
      const key1 = headMerger._getStyleContentKey(emptyStyle1);
      const key2 = headMerger._getStyleContentKey(emptyStyle2);
      
      expect(key1).toStartWith('empty-');
      expect(key2).toStartWith('empty-');
      expect(key1).not.toBe(key2); // Should be unique
    });

    test('should_handle_style_with_empty_inline_content', () => {
      // Test edge case - empty inline content should trim to empty string
      const style = { inline: '   ' }; // Whitespace only
      
      const key = headMerger._getStyleContentKey(style);
      
      expect(key).toBe(''); // Should trim whitespace to empty string
    });

    test('should_normalize_complex_whitespace_in_styles', () => {
      const style = { 
        inline: `
          .class1 {
            margin:    0;
            padding:   20px;
          }
          
          .class2     {
            color: red;
          }
        `
      };
      
      const key = headMerger._getStyleContentKey(style);
      
      expect(key).toBe('.class1 { margin: 0; padding: 20px; } .class2 { color: red; }');
    });
  });

  describe('Head Cleaning and Processing', () => {
    test('should_clean_head_elements_removing_undefined_values', () => {
      // Test lines 358-382: _cleanHead method functionality
      const dirtyHead = {
        title: 'Test Title',
        meta: [], // Empty array should be removed
        links: [{ rel: 'stylesheet', href: '/test.css' }],
        scripts: [], // Empty array should be removed
        styles: [{ inline: '.test { color: red; }' }],
        undefined_field: undefined // Should be removed
      };
      
      const result = headMerger._cleanHead(dirtyHead);
      
      expect(result).toEqual({
        title: 'Test Title',
        links: [{ rel: 'stylesheet', href: '/test.css' }],
        styles: [{ inline: '.test { color: red; }' }]
      });
      expect(result).not.toHaveProperty('meta');
      expect(result).not.toHaveProperty('scripts');
      expect(result).not.toHaveProperty('undefined_field');
    });

    test('should_clean_head_with_only_empty_arrays', () => {
      const emptyHead = {
        title: null,
        meta: [],
        links: [],
        scripts: [],
        styles: []
      };
      
      const result = headMerger._cleanHead(emptyHead);
      
      expect(result).toEqual({});
    });

    test('should_preserve_all_valid_head_elements', () => {
      const fullHead = {
        title: 'Complete Title',
        meta: [{ name: 'description', content: 'Test desc' }],
        links: [{ rel: 'canonical', href: '/canonical' }],
        scripts: [{ src: '/script.js' }],
        styles: [{ inline: 'body { margin: 0; }' }]
      };
      
      const result = headMerger._cleanHead(fullHead);
      
      expect(result).toEqual(fullHead);
    });

    test('should_handle_null_and_undefined_head_object', () => {
      // _cleanHead doesn't handle null/undefined - these would throw TypeError
      expect(() => headMerger._cleanHead(null)).toThrow();
      expect(() => headMerger._cleanHead(undefined)).toThrow();
      expect(headMerger._cleanHead({})).toEqual({});
    });
  });

  describe('HTML Generation', () => {
    test('should_generate_html_from_head_elements', () => {
      // Test lines 398-399: generateHeadHtml method
      const headElements = {
        title: 'Test Title',
        meta: [
          { charset: 'utf-8' },
          { name: 'description', content: 'Test description' }
        ],
        links: [
          { rel: 'stylesheet', href: '/styles.css' }
        ],
        scripts: [
          { src: '/script.js' },
          { inline: 'console.log("test");' }
        ],
        styles: [
          { inline: '.test { color: red; }' }
        ]
      };
      
      const result = headMerger.generateHeadHtml(headElements);
      
      expect(result).toContain('<title>Test Title</title>');
      expect(result).toContain('<meta charset="utf-8">');
      expect(result).toContain('<meta name="description" content="Test description">');
      expect(result).toContain('<link rel="stylesheet" href="/styles.css">');
      expect(result).toContain('<script src="/script.js"></script>');
      expect(result).toContain('<script>console.log("test");</script>');
      expect(result).toContain('<style>.test { color: red; }</style>');
    });

    test('should_generate_html_from_empty_head_elements', () => {
      const emptyHead = {};
      
      const result = headMerger.generateHeadHtml(emptyHead);
      
      expect(result).toBe('');
    });

    test('should_generate_html_from_minimal_head_elements', () => {
      const minimalHead = {
        title: 'Only Title'
      };
      
      const result = headMerger.generateHeadHtml(minimalHead);
      
      expect(result).toBe('<title>Only Title</title>');
    });

    test('should_delegate_to_html_rewriter_utils_correctly', () => {
      // Verify that the method properly delegates to HTMLRewriterUtils
      const complexHead = {
        title: 'Complex Title',
        meta: [
          { name: 'viewport', content: 'width=device-width, initial-scale=1' },
          { property: 'og:title', content: 'Open Graph Title' }
        ],
        links: [
          { rel: 'canonical', href: '/canonical' },
          { rel: 'icon', href: '/favicon.ico' }
        ],
        scripts: [
          { src: '/module.js', type: 'module' },
          { inline: 'window.config = {};', defer: '' }
        ],
        styles: [
          { inline: 'body { margin: 0; }', media: 'screen' }
        ]
      };
      
      const result = headMerger.generateHeadHtml(complexHead);
      
      // Verify all elements are included
      expect(result).toContain('Complex Title');
      expect(result).toContain('viewport');
      expect(result).toContain('og:title');
      expect(result).toContain('canonical');
      expect(result).toContain('icon');
      expect(result).toContain('module.js');
      expect(result).toContain('window.config');
      expect(result).toContain('margin: 0');
    });
  });

  describe('Integration Test for All Missing Coverage', () => {
    test('should_exercise_all_missing_coverage_paths_in_single_test', () => {
      // This test exercises multiple missing coverage paths together
      
      // 1. Test extractHead method (lines 107-109)
      const mockDoc = {
        html: '<html><head><title>Integration Test</title></head><body></body></html>'
      };
      
      const extractedHead = headMerger.extractHead(mockDoc);
      expect(extractedHead.title).toBe('Integration Test');
      
      // 2. Test script merging with edge cases (lines 277, 298)
      const layoutHead = {
        scripts: [
          { type: 'module' }, // No src or inline - line 277
          { src: '/layout.js' }
        ]
      };
      
      const pageHead = {
        scripts: [
          { async: true }, // No src or inline - line 298
          { inline: 'console.log("page");' }
        ]
      };
      
      const mergedHead = headMerger.merge(layoutHead, pageHead);
      expect(mergedHead.scripts.length).toBe(4);
      
      // 3. Test style content key generation (lines 346-350)
      const style = { inline: '  body { padding: 10px; }  ' };
      const styleKey = headMerger._getStyleContentKey(style);
      expect(styleKey).toBe('body { padding: 10px; }');
      
      // 4. Test head cleaning (lines 358-382)
      const dirtyHead = { title: 'Test', meta: [], scripts: [{ src: '/test.js' }] };
      const cleanedHead = headMerger._cleanHead(dirtyHead);
      expect(cleanedHead).toEqual({ title: 'Test', scripts: [{ src: '/test.js' }] });
      
      // 5. Test HTML generation (lines 398-399)
      const htmlOutput = headMerger.generateHeadHtml(mergedHead);
      expect(htmlOutput).toContain('<script type="module"></script>');
      expect(htmlOutput).toContain('<script async></script>');
    });
  });
});