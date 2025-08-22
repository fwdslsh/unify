/**
 * Head Merger Coverage Tests
 * Comprehensive coverage for DOM Cascade v1 head element merging
 */

import { describe, test, expect } from 'bun:test';
import { HeadMerger } from '../../../src/core/cascade/head-merger.js';

describe('HeadMerger Coverage Enhancement', () => {
  let merger;

  beforeEach(() => {
    merger = new HeadMerger();
  });

  describe('Complex Attribute Parsing Coverage (Lines 78-82, 88-90)', () => {
    test('should_parse_script_tags_with_inline_content', () => {
      const html = `
        <head>
          <script src="external.js"></script>
          <script type="text/javascript">
            console.log('inline script');
            var data = { key: 'value' };
          </script>
          <script async defer src="deferred.js"></script>
        </head>
      `;

      const doc = { html };
      const result = merger.extractHead(doc);

      expect(result.scripts).toHaveLength(3);
      
      // External script
      expect(result.scripts[0]).toEqual({ src: 'external.js' });
      
      // Inline script
      expect(result.scripts[1]).toEqual({
        type: 'text/javascript',
        inline: "console.log('inline script');\n            var data = { key: 'value' };"
      });
      
      // Deferred external script
      expect(result.scripts[2]).toEqual({
        async: '',
        defer: '',
        src: 'deferred.js'
      });
    });

    test('should_parse_style_tags_with_inline_css', () => {
      const html = `
        <head>
          <style type="text/css">
            body { margin: 0; }
            .container { max-width: 1200px; }
          </style>
          <style media="print">
            .no-print { display: none; }
          </style>
        </head>
      `;

      const doc = { html };
      const result = merger.extractHead(doc);

      expect(result.styles).toHaveLength(2);
      
      expect(result.styles[0]).toEqual({
        type: 'text/css',
        inline: 'body { margin: 0; }\n            .container { max-width: 1200px; }'
      });
      
      expect(result.styles[1]).toEqual({
        media: 'print',
        inline: '.no-print { display: none; }'
      });
    });

    test('should_handle_scripts_with_complex_attributes', () => {
      const html = `
        <head>
          <script 
            src="module.js" 
            type="module" 
            crossorigin="anonymous" 
            integrity="sha384-xyz">
          </script>
          <script nomodule src="fallback.js"></script>
        </head>
      `;

      const doc = { html };
      const result = merger.extractHead(doc);

      expect(result.scripts).toHaveLength(2);
      
      expect(result.scripts[0]).toEqual({
        src: 'module.js',
        type: 'module',
        crossorigin: 'anonymous',
        integrity: 'sha384-xyz'
      });
      
      expect(result.scripts[1]).toEqual({
        nomodule: '',
        src: 'fallback.js'
      });
    });
  });

  describe('Meta Deduplication Edge Cases Coverage (Lines 157, 190-191)', () => {
    test('should_handle_meta_without_deduplication_keys', () => {
      const layoutHead = {
        meta: [
          { charset: 'utf-8' }, // No name/property/http-equiv
          { content: 'some-content' }, // No deduplication key
          { name: 'description', content: 'Layout description' }
        ]
      };

      const pageHead = {
        meta: [
          { charset: 'iso-8859-1' }, // Different charset, no deduplication
          { 'custom-attr': 'value' }, // No deduplication key
          { name: 'description', content: 'Page description' }
        ]
      };

      const result = merger.merge(layoutHead, pageHead);

      expect(result.meta).toHaveLength(5);
      
      // Non-deduplicated metas should all be included
      expect(result.meta.filter(m => m.charset)).toHaveLength(2);
      expect(result.meta.filter(m => m.content === 'some-content')).toHaveLength(1);
      expect(result.meta.filter(m => m['custom-attr'])).toHaveLength(1);
      
      // Deduplicated meta (page should win)
      const descriptionMeta = result.meta.find(m => m.name === 'description');
      expect(descriptionMeta.content).toBe('Page description');
    });

    test('should_handle_meta_replacement_in_merged_array', () => {
      const layoutHead = {
        meta: [
          { name: 'viewport', content: 'width=device-width' },
          { property: 'og:title', content: 'Layout Title' },
          { name: 'description', content: 'Layout desc' },
          { 'http-equiv': 'refresh', content: '30' }
        ]
      };

      const pageHead = {
        meta: [
          { property: 'og:title', content: 'Page Title' }, // Should replace
          { name: 'keywords', content: 'page, keywords' }, // New
          { 'http-equiv': 'refresh', content: '60' } // Should replace
        ]
      };

      const result = merger.merge(layoutHead, pageHead);

      expect(result.meta).toHaveLength(5);
      
      // Check replacements
      const ogTitle = result.meta.find(m => m.property === 'og:title');
      expect(ogTitle.content).toBe('Page Title');
      
      const refresh = result.meta.find(m => m['http-equiv'] === 'refresh');
      expect(refresh.content).toBe('60');
      
      // Check preserved
      const viewport = result.meta.find(m => m.name === 'viewport');
      expect(viewport.content).toBe('width=device-width');
      
      const description = result.meta.find(m => m.name === 'description');
      expect(description.content).toBe('Layout desc');
      
      // Check new
      const keywords = result.meta.find(m => m.name === 'keywords');
      expect(keywords.content).toBe('page, keywords');
    });
  });

  describe('Link Deduplication Coverage (Lines 209, 224)', () => {
    test('should_handle_links_without_deduplication_keys', () => {
      const layoutHead = {
        links: [
          { rel: 'icon', type: 'image/x-icon' }, // No href - no deduplication
          { href: 'style.css' }, // No rel - no deduplication
          { rel: 'stylesheet', href: 'layout.css' }
        ]
      };

      const pageHead = {
        links: [
          { rel: 'icon', type: 'image/png' }, // Different icon, no href
          { href: 'page.css' }, // No rel
          { rel: 'stylesheet', href: 'page.css' }
        ]
      };

      const result = merger.merge(layoutHead, pageHead);

      expect(result.links).toHaveLength(6);
      
      // Non-deduplicated links should all be included
      expect(result.links.filter(l => l.rel === 'icon' && !l.href)).toHaveLength(2);
      expect(result.links.filter(l => l.href && !l.rel)).toHaveLength(2);
      
      // Deduplicated links
      expect(result.links.filter(l => l.rel === 'stylesheet')).toHaveLength(2);
    });

    test('should_handle_link_replacement_with_same_rel_href', () => {
      const layoutHead = {
        links: [
          { rel: 'stylesheet', href: 'shared.css', media: 'screen' },
          { rel: 'canonical', href: 'https://example.com/layout' },
          { rel: 'alternate', href: 'feed.xml', type: 'application/rss+xml' }
        ]
      };

      const pageHead = {
        links: [
          { rel: 'stylesheet', href: 'shared.css', media: 'all' }, // Should replace
          { rel: 'canonical', href: 'https://example.com/page' }, // Should replace
          { rel: 'next', href: 'next-page.html' } // New
        ]
      };

      const result = merger.merge(layoutHead, pageHead);

      expect(result.links).toHaveLength(4);
      
      // Check replacements
      const stylesheet = result.links.find(l => 
        l.rel === 'stylesheet' && l.href === 'shared.css'
      );
      expect(stylesheet.media).toBe('all');
      
      const canonical = result.links.find(l => l.rel === 'canonical');
      expect(canonical.href).toBe('https://example.com/page');
      
      // Check preserved
      const alternate = result.links.find(l => l.rel === 'alternate');
      expect(alternate.href).toBe('feed.xml');
      
      // Check new
      const next = result.links.find(l => l.rel === 'next');
      expect(next.href).toBe('next-page.html');
    });
  });

  describe('Script Deduplication Coverage (Lines 245, 260)', () => {
    test('should_never_deduplicate_inline_scripts', () => {
      const layoutHead = {
        scripts: [
          { inline: 'console.log("layout");' },
          { inline: 'var x = 1;' },
          { src: 'shared.js' }
        ]
      };

      const pageHead = {
        scripts: [
          { inline: 'console.log("layout");' }, // Same inline content
          { inline: 'var y = 2;' },
          { src: 'shared.js' } // Should be deduplicated
        ]
      };

      const result = merger.merge(layoutHead, pageHead);

      expect(result.scripts).toHaveLength(5);
      
      // All inline scripts should be preserved
      const inlineScripts = result.scripts.filter(s => s.inline);
      expect(inlineScripts).toHaveLength(4);
      
      // External script should be deduplicated
      const externalScripts = result.scripts.filter(s => s.src === 'shared.js');
      expect(externalScripts).toHaveLength(1);
    });

    test('should_deduplicate_external_scripts_by_src', () => {
      const layoutHead = {
        scripts: [
          { src: 'jquery.js', version: '3.6.0' },
          { src: 'utils.js' },
          { inline: 'console.log("init");' }
        ]
      };

      const pageHead = {
        scripts: [
          { src: 'jquery.js', version: '3.7.0' }, // Same src, different attrs
          { src: 'page.js' },
          { inline: 'console.log("page");' }
        ]
      };

      const result = merger.merge(layoutHead, pageHead);

      expect(result.scripts).toHaveLength(5);
      
      // jQuery should appear only once (layout version)
      const jqueryScripts = result.scripts.filter(s => s.src === 'jquery.js');
      expect(jqueryScripts).toHaveLength(1);
      expect(jqueryScripts[0].version).toBe('3.6.0');
      
      // Other external scripts
      expect(result.scripts.filter(s => s.src === 'utils.js')).toHaveLength(1);
      expect(result.scripts.filter(s => s.src === 'page.js')).toHaveLength(1);
      
      // Inline scripts
      expect(result.scripts.filter(s => s.inline)).toHaveLength(2);
    });

    test('should_handle_scripts_without_src_or_inline', () => {
      const layoutHead = {
        scripts: [
          { type: 'application/ld+json' }, // No src or inline
          { src: 'external.js' }
        ]
      };

      const pageHead = {
        scripts: [
          { type: 'application/ld+json', id: 'schema' }, // Different attrs
          { async: true } // No src or inline
        ]
      };

      const result = merger.merge(layoutHead, pageHead);

      expect(result.scripts).toHaveLength(4);
      
      // All scripts without src should be preserved
      const noSrcScripts = result.scripts.filter(s => !s.src && !s.inline);
      expect(noSrcScripts).toHaveLength(3);
    });
  });

  describe('HTML Generation Coverage (Lines 330-381)', () => {
    test('should_generate_complete_head_html', () => {
      const head = {
        title: 'Test Page',
        meta: [
          { charset: 'utf-8' },
          { name: 'viewport', content: 'width=device-width' },
          { property: 'og:title', content: 'Test' }
        ],
        links: [
          { rel: 'stylesheet', href: 'style.css', media: 'screen' },
          { rel: 'icon', href: 'favicon.ico', type: 'image/x-icon' }
        ],
        scripts: [
          { src: 'external.js', async: '', defer: '' },
          { inline: 'console.log("inline");', type: 'text/javascript' }
        ],
        styles: [
          { inline: 'body { margin: 0; }', type: 'text/css' },
          { inline: '.hidden { display: none; }' }
        ]
      };

      const html = merger.generateHeadHtml(head);

      expect(html).toContain('<title>Test Page</title>');
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain('<meta name="viewport" content="width=device-width">');
      expect(html).toContain('<meta property="og:title" content="Test">');
      expect(html).toContain('<link rel="stylesheet" href="style.css" media="screen">');
      expect(html).toContain('<link rel="icon" href="favicon.ico" type="image/x-icon">');
      expect(html).toContain('<script src="external.js" async="" defer=""></script>');
      expect(html).toContain('<script type="text/javascript">console.log("inline");</script>');
      expect(html).toContain('<style type="text/css">body { margin: 0; }</style>');
      expect(html).toContain('<style>.hidden { display: none; }</style>');
    });

    test('should_generate_html_for_scripts_without_attributes', () => {
      const head = {
        scripts: [
          { inline: 'console.log("no attributes");' },
          { src: 'script.js' }
        ]
      };

      const html = merger.generateHeadHtml(head);

      expect(html).toContain('<script>console.log("no attributes");</script>');
      expect(html).toContain('<script src="script.js"></script>');
    });

    test('should_generate_html_for_styles_without_attributes', () => {
      const head = {
        styles: [
          { inline: 'body { background: white; }' }
        ]
      };

      const html = merger.generateHeadHtml(head);

      expect(html).toContain('<style>body { background: white; }</style>');
    });

    test('should_generate_empty_sections_for_missing_elements', () => {
      const head = {
        title: 'Only Title'
      };

      const html = merger.generateHeadHtml(head);

      expect(html).toBe('<title>Only Title</title>');
      expect(html).not.toContain('<meta');
      expect(html).not.toContain('<link');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('<style');
    });

    test('should_handle_empty_head_object', () => {
      const head = {};
      const html = merger.generateHeadHtml(head);
      expect(html).toBe('');
    });

    test('should_escape_attribute_values_in_generated_html', () => {
      const head = {
        meta: [
          { name: 'description', content: 'Text with "quotes" & ampersands' }
        ],
        links: [
          { rel: 'canonical', href: 'https://example.com/path?param=value&other=test' }
        ]
      };

      const html = merger.generateHeadHtml(head);

      expect(html).toContain('content="Text with "quotes" & ampersands"');
      expect(html).toContain('href="https://example.com/path?param=value&other=test"');
    });
  });

  describe('Attribute Parsing Edge Cases', () => {
    test('should_parse_attributes_with_various_quote_styles', () => {
      const html = `
        <head>
          <meta name="description" content='Single quoted content'>
          <meta name=viewport content=width=device-width>
          <link rel="stylesheet" href="style.css" media='screen'>
          <script src=script.js type="text/javascript"></script>
        </head>
      `;

      const doc = { html };
      const result = merger.extractHead(doc);

      expect(result.meta).toHaveLength(2);
      expect(result.meta[0]).toEqual({
        name: 'description',
        content: 'Single quoted content'
      });
      expect(result.meta[1]).toEqual({
        name: 'viewport',
        content: 'width=device-width'
      });

      expect(result.links).toHaveLength(1);
      expect(result.links[0]).toEqual({
        rel: 'stylesheet',
        href: 'style.css',
        media: 'screen'
      });

      expect(result.scripts).toHaveLength(1);
      expect(result.scripts[0]).toEqual({
        src: 'script.js',
        type: 'text/javascript'
      });
    });

    test('should_handle_malformed_or_empty_attributes', () => {
      const html = `
        <head>
          <meta name="" content="empty-name">
          <meta content="no-name">
          <link rel="">
          <script src=""></script>
          <style></style>
        </head>
      `;

      const doc = { html };
      const result = merger.extractHead(doc);

      expect(result.meta).toHaveLength(2);
      expect(result.links).toHaveLength(1);
      expect(result.scripts).toHaveLength(1);
      expect(result.styles).toHaveLength(1);
      
      // Check that empty attributes are preserved
      expect(result.meta[0]).toEqual({ name: '', content: 'empty-name' });
      expect(result.links[0]).toEqual({ rel: '' });
      expect(result.scripts[0]).toEqual({ src: '' });
      expect(result.styles[0]).toEqual({ inline: '' });
    });

    test('should_extract_title_with_html_entities', () => {
      const html = `
        <head>
          <title>Test &amp; Title with "Quotes" &lt;HTML&gt;</title>
        </head>
      `;

      const doc = { html };
      const result = merger.extractHead(doc);

      expect(result.title).toBe('Test &amp; Title with "Quotes" &lt;HTML&gt;');
    });
  });

  describe('Integration with DOM Cascade Rules', () => {
    test('should_apply_complete_head_merging_rules', () => {
      const layoutHead = {
        title: 'Layout Title',
        meta: [
          { charset: 'utf-8' },
          { name: 'viewport', content: 'width=device-width' },
          { name: 'description', content: 'Layout description' }
        ],
        links: [
          { rel: 'stylesheet', href: 'layout.css' },
          { rel: 'icon', href: 'favicon.ico' }
        ],
        scripts: [
          { src: 'layout.js' },
          { inline: 'var layoutVar = true;' }
        ],
        styles: [
          { inline: '.layout { display: block; }' }
        ]
      };

      const pageHead = {
        title: 'Page Title',
        meta: [
          { name: 'description', content: 'Page description' },
          { name: 'keywords', content: 'page, test' }
        ],
        links: [
          { rel: 'stylesheet', href: 'page.css' },
          { rel: 'canonical', href: 'https://example.com/page' }
        ],
        scripts: [
          { src: 'page.js' },
          { inline: 'var pageVar = true;' }
        ],
        styles: [
          { inline: '.page { display: flex; }' }
        ]
      };

      const result = merger.merge(layoutHead, pageHead);

      // Title: Page wins
      expect(result.title).toBe('Page Title');

      // Meta: Layout + Page with page overrides
      expect(result.meta).toHaveLength(4);
      expect(result.meta.find(m => m.charset)).toBeDefined();
      expect(result.meta.find(m => m.name === 'viewport')).toBeDefined();
      expect(result.meta.find(m => m.name === 'description').content).toBe('Page description');
      expect(result.meta.find(m => m.name === 'keywords')).toBeDefined();

      // Links: All preserved (different rel+href combinations)
      expect(result.links).toHaveLength(4);

      // Scripts: External deduplicated, inline preserved
      expect(result.scripts).toHaveLength(4);
      expect(result.scripts.filter(s => s.inline)).toHaveLength(2);
      expect(result.scripts.filter(s => s.src)).toHaveLength(2);

      // Styles: All preserved (never deduplicated)
      expect(result.styles).toHaveLength(2);
    });
  });
});