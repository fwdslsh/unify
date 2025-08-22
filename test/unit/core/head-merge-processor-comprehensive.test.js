/**
 * Comprehensive tests for Head Merge Processor
 * Tests all methods and edge cases for 95%+ coverage
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { HeadMergeProcessor } from '../../../src/core/head-merge-processor.js';

describe('HeadMergeProcessor - Comprehensive Coverage', () => {
  let processor;
  
  beforeEach(() => {
    processor = new HeadMergeProcessor();
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with empty processedElements map', () => {
      expect(processor.processedElements).toBeInstanceOf(Map);
      expect(processor.processedElements.size).toBe(0);
    });
  });

  describe('mergeHeadContent Method', () => {
    test('should merge head content from multiple fragments', () => {
      const fragments = [
        {
          headHtml: '<title>Layout Title</title><meta name="author" content="Layout">',
          source: 'layout.html'
        },
        {
          headHtml: '<title>Page Title</title><meta name="description" content="Page desc">',
          source: 'page.html'
        }
      ];
      
      const result = processor.mergeHeadContent(fragments);
      
      expect(result).toContain('Page Title'); // Page wins over layout
      expect(result).toContain('Layout'); // Layout author preserved
      expect(result).toContain('Page desc'); // Page description added
    });

    test('should handle empty fragments array', () => {
      const result = processor.mergeHeadContent([]);
      expect(result).toBe('');
    });

    test('should handle fragments with empty headHtml', () => {
      const fragments = [
        { headHtml: '', source: 'empty.html' },
        { headHtml: null, source: 'null.html' },
        { headHtml: '<title>Valid</title>', source: 'valid.html' }
      ];
      
      const result = processor.mergeHeadContent(fragments);
      expect(result).toContain('Valid');
    });
  });

  describe('parseHeadElements Method', () => {
    test('should parse self-closing tags correctly', () => {
      const html = '<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="style.css">';
      const elements = processor.parseHeadElements(html);
      
      expect(elements.length).toBe(2);
      
      const meta = elements.find(el => el.tagName === 'meta');
      expect(meta.attributes.name).toBe('viewport');
      expect(meta.attributes.content).toBe('width=device-width');
      expect(meta.content).toBe('');
      
      const link = elements.find(el => el.tagName === 'link');
      expect(link.attributes.rel).toBe('stylesheet');
      expect(link.attributes.href).toBe('style.css');
    });

    test('should parse paired tags correctly', () => {
      const html = '<title>Test Title</title><script src="app.js"></script><style>body{color:red}</style>';
      const elements = processor.parseHeadElements(html);
      
      expect(elements.length).toBe(3);
      
      const title = elements.find(el => el.tagName === 'title');
      expect(title.content).toBe('Test Title');
      
      const script = elements.find(el => el.tagName === 'script');
      expect(script.attributes.src).toBe('app.js');
      expect(script.content).toBe('');
      
      const style = elements.find(el => el.tagName === 'style');
      expect(style.content).toBe('body{color:red}');
    });

    test('should handle mixed self-closing and paired tags', () => {
      const html = `
        <meta charset="utf-8">
        <title>Mixed Tags</title>
        <link rel="icon" href="favicon.ico">
        <script>console.log('inline');</script>
      `;
      
      const elements = processor.parseHeadElements(html);
      expect(elements.length).toBe(4);
      
      const tagNames = elements.map(el => el.tagName);
      expect(tagNames).toContain('meta');
      expect(tagNames).toContain('title');
      expect(tagNames).toContain('link');
      expect(tagNames).toContain('script');
    });

    test('should handle empty and invalid inputs', () => {
      expect(processor.parseHeadElements('')).toEqual([]);
      expect(processor.parseHeadElements(null)).toEqual([]);
      expect(processor.parseHeadElements(undefined)).toEqual([]);
      expect(processor.parseHeadElements(123)).toEqual([]);
      expect(processor.parseHeadElements('   ')).toEqual([]);
    });

    test('should handle malformed HTML gracefully', () => {
      const malformed = [
        '<meta name="desc content="broken">',
        '<link rel=stylesheet href=>',
        '<script></',
        '<style>/* unclosed comment',
        '<<script>nested<tags></script>'
      ];
      
      malformed.forEach(html => {
        expect(() => processor.parseHeadElements(html)).not.toThrow();
        const result = processor.parseHeadElements(html);
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('parseAttributes Method', () => {
    test('should parse quoted attributes correctly', () => {
      const attrs = 'name="viewport" content="width=device-width, initial-scale=1"';
      const result = processor.parseAttributes(attrs);
      
      expect(result.name).toBe('viewport');
      expect(result.content).toBe('width=device-width, initial-scale=1');
    });

    test('should parse single-quoted attributes', () => {
      const attrs = "rel='stylesheet' href='style.css'";
      const result = processor.parseAttributes(attrs);
      
      expect(result.rel).toBe('stylesheet');
      expect(result.href).toBe('style.css');
    });

    test('should parse unquoted attributes', () => {
      const attrs = 'defer async src=script.js';
      const result = processor.parseAttributes(attrs);
      
      expect(result.src).toBe('script.js');
      expect(result.defer).toBe('');
      expect(result.async).toBe('');
    });

    test('should handle hyphenated attributes', () => {
      const attrs = 'data-test="value" http-equiv="refresh"';
      const result = processor.parseAttributes(attrs);
      
      expect(result['data-test']).toBe('value');
      expect(result['http-equiv']).toBe('refresh');
    });

    test('should handle boolean attributes', () => {
      const attrs = 'defer async disabled';
      const result = processor.parseAttributes(attrs);
      
      expect(result.defer).toBe('');
      expect(result.async).toBe('');
      expect(result.disabled).toBe('');
    });

    test('should handle empty and invalid attribute strings', () => {
      expect(processor.parseAttributes('')).toEqual({});
      expect(processor.parseAttributes(null)).toEqual({});
      expect(processor.parseAttributes(undefined)).toEqual({});
    });

    test('should normalize attribute names to lowercase', () => {
      const attrs = 'NAME="test" REL="stylesheet" Data-Custom="value"';
      const result = processor.parseAttributes(attrs);
      
      expect(result.name).toBe('test');
      expect(result.rel).toBe('stylesheet');
      expect(result['data-custom']).toBe('value');
    });
  });

  describe('getDeduplicationKey Method', () => {
    test('should generate correct keys for title elements', () => {
      const element = { tagName: 'title', attributes: {} };
      expect(processor.getDeduplicationKey(element)).toBe('title');
    });

    test('should generate correct keys for meta elements', () => {
      const metaName = { tagName: 'meta', attributes: { name: 'description' } };
      expect(processor.getDeduplicationKey(metaName)).toBe('meta:description');
      
      const metaProperty = { tagName: 'meta', attributes: { property: 'og:title' } };
      expect(processor.getDeduplicationKey(metaProperty)).toBe('meta:og:title');
      
      const metaHttpEquiv = { tagName: 'meta', attributes: { 'http-equiv': 'refresh' } };
      expect(processor.getDeduplicationKey(metaHttpEquiv)).toBe('meta:refresh');
      
      const metaNoKey = { tagName: 'meta', attributes: { content: 'value' } };
      expect(processor.getDeduplicationKey(metaNoKey)).toBeNull();
    });

    test('should generate correct keys for link elements', () => {
      const canonical = { tagName: 'link', attributes: { rel: 'canonical', href: 'test.html' } };
      expect(processor.getDeduplicationKey(canonical)).toBe('link:canonical');
      
      const stylesheet = { tagName: 'link', attributes: { rel: 'stylesheet', href: 'style.css' } };
      expect(processor.getDeduplicationKey(stylesheet)).toBe('link:stylesheet:style.css');
      
      const noHref = { tagName: 'link', attributes: { rel: 'icon' } };
      expect(processor.getDeduplicationKey(noHref)).toBeNull();
    });

    test('should generate correct keys for script elements', () => {
      const external = { tagName: 'script', attributes: { src: 'app.js' } };
      expect(processor.getDeduplicationKey(external)).toBe('script:src:app.js');
      
      const inline = { tagName: 'script', attributes: { type: 'text/javascript' } };
      expect(processor.getDeduplicationKey(inline)).toBeNull();
    });

    test('should generate correct keys for style elements', () => {
      const external = { tagName: 'style', attributes: { href: 'style.css' } };
      expect(processor.getDeduplicationKey(external)).toBe('style:href:style.css');
      
      const inline = { tagName: 'style', attributes: {} };
      expect(processor.getDeduplicationKey(inline)).toBeNull();
    });

    test('should generate correct keys for base elements', () => {
      const base = { tagName: 'base', attributes: { href: '/' } };
      expect(processor.getDeduplicationKey(base)).toBe('base');
    });

    test('should return null for unknown elements', () => {
      const unknown = { tagName: 'unknown', attributes: {} };
      expect(processor.getDeduplicationKey(unknown)).toBeNull();
    });
  });

  describe('applyDeduplicationRule Method', () => {
    test('should apply title deduplication rule (last wins)', () => {
      const existing = { tagName: 'title', content: 'Layout Title' };
      const incoming = { tagName: 'title', content: 'Page Title' };
      
      const result = processor.applyDeduplicationRule(existing, incoming);
      expect(result).toBe(incoming);
    });

    test('should apply meta deduplication rule (last wins)', () => {
      const existing = { tagName: 'meta', attributes: { name: 'description', content: 'Layout desc' } };
      const incoming = { tagName: 'meta', attributes: { name: 'description', content: 'Page desc' } };
      
      const result = processor.applyDeduplicationRule(existing, incoming);
      expect(result).toBe(incoming);
    });

    test('should apply canonical link deduplication rule (last wins)', () => {
      const existing = { tagName: 'link', attributes: { rel: 'canonical', href: 'layout.html' } };
      const incoming = { tagName: 'link', attributes: { rel: 'canonical', href: 'page.html' } };
      
      const result = processor.applyDeduplicationRule(existing, incoming);
      expect(result).toBe(incoming);
    });

    test('should apply non-canonical link deduplication rule (first wins)', () => {
      const existing = { tagName: 'link', attributes: { rel: 'stylesheet', href: 'layout.css' } };
      const incoming = { tagName: 'link', attributes: { rel: 'stylesheet', href: 'page.css' } };
      
      const result = processor.applyDeduplicationRule(existing, incoming);
      expect(result).toBeUndefined(); // Keep existing
    });

    test('should apply script deduplication rule', () => {
      // External scripts: first wins
      const existingExt = { tagName: 'script', attributes: { src: 'layout.js' } };
      const incomingExt = { tagName: 'script', attributes: { src: 'page.js' } };
      
      const resultExt = processor.applyDeduplicationRule(existingExt, incomingExt);
      expect(resultExt).toBeUndefined(); // Keep existing
      
      // Inline scripts: keep both
      const existingInline = { tagName: 'script', attributes: {} };
      const incomingInline = { tagName: 'script', attributes: {} };
      
      const resultInline = processor.applyDeduplicationRule(existingInline, incomingInline);
      expect(resultInline).toBeNull(); // Keep both
    });

    test('should apply style deduplication rule', () => {
      // External styles: first wins
      const existingExt = { tagName: 'style', attributes: { href: 'layout.css' } };
      const incomingExt = { tagName: 'style', attributes: { href: 'page.css' } };
      
      const resultExt = processor.applyDeduplicationRule(existingExt, incomingExt);
      expect(resultExt).toBeUndefined(); // Keep existing
      
      // Inline styles: keep both
      const existingInline = { tagName: 'style', attributes: {} };
      const incomingInline = { tagName: 'style', attributes: {} };
      
      const resultInline = processor.applyDeduplicationRule(existingInline, incomingInline);
      expect(resultInline).toBeNull(); // Keep both
    });

    test('should apply base deduplication rule (last wins)', () => {
      const existing = { tagName: 'base', attributes: { href: '/' } };
      const incoming = { tagName: 'base', attributes: { href: '/app/' } };
      
      const result = processor.applyDeduplicationRule(existing, incoming);
      expect(result).toBe(incoming);
    });

    test('should apply unknown element deduplication rule (last wins)', () => {
      const existing = { tagName: 'unknown', attributes: {} };
      const incoming = { tagName: 'unknown', attributes: {} };
      
      const result = processor.applyDeduplicationRule(existing, incoming);
      expect(result).toBe(incoming);
    });
  });

  describe('processElement Method', () => {
    test('should add non-deduplicated elements', () => {
      const mergedElements = [];
      const element = { tagName: 'custom', attributes: {} };
      
      processor.processElement(element, mergedElements);
      
      expect(mergedElements.length).toBe(1);
      expect(mergedElements[0]).toBe(element);
    });

    test('should add new deduplicated elements', () => {
      const mergedElements = [];
      const element = { tagName: 'title', content: 'Test Title' };
      
      processor.processElement(element, mergedElements);
      
      expect(mergedElements.length).toBe(1);
      expect(mergedElements[0]).toBe(element);
    });

    test('should replace existing elements when rule allows', () => {
      const mergedElements = [
        { tagName: 'title', content: 'Old Title' }
      ];
      const newElement = { tagName: 'title', content: 'New Title' };
      
      processor.processElement(newElement, mergedElements);
      
      expect(mergedElements.length).toBe(1);
      expect(mergedElements[0]).toBe(newElement);
    });

    test('should keep existing elements when rule forbids replacement', () => {
      const existingElement = { tagName: 'link', attributes: { rel: 'stylesheet', href: 'layout.css' } };
      const mergedElements = [existingElement];
      const newElement = { tagName: 'link', attributes: { rel: 'stylesheet', href: 'layout.css' } }; // Same href for deduplication
      
      processor.processElement(newElement, mergedElements);
      
      expect(mergedElements.length).toBe(1);
      expect(mergedElements[0]).toBe(existingElement);
    });

    test('should keep both elements when rule allows', () => {
      const existingElement = { tagName: 'script', attributes: {}, content: 'console.log("old");' };
      const mergedElements = [existingElement];
      const newElement = { tagName: 'script', attributes: {}, content: 'console.log("new");' };
      
      processor.processElement(newElement, mergedElements);
      
      expect(mergedElements.length).toBe(2);
      expect(mergedElements[0]).toBe(existingElement);
      expect(mergedElements[1]).toBe(newElement);
    });
  });

  describe('renderMergedHead Method', () => {
    test('should render elements using fullElement when available', () => {
      const elements = [
        { fullElement: '<title>Test Title</title>' },
        { fullElement: '<meta name="description" content="Test">' }
      ];
      
      const result = processor.renderMergedHead(elements);
      
      expect(result).toContain('<title>Test Title</title>');
      expect(result).toContain('<meta name="description" content="Test">');
    });

    test('should render self-closing elements correctly', () => {
      const elements = [
        {
          tagName: 'meta',
          attributes: { name: 'viewport', content: 'width=device-width' },
          content: ''
        }
      ];
      
      const result = processor.renderMergedHead(elements);
      expect(result).toBe('<meta name="viewport" content="width=device-width">');
    });

    test('should render paired elements correctly', () => {
      const elements = [
        {
          tagName: 'title',
          attributes: {},
          content: 'Test Title'
        }
      ];
      
      const result = processor.renderMergedHead(elements);
      expect(result).toBe('<title>Test Title</title>');
    });

    test('should render boolean attributes correctly', () => {
      const elements = [
        {
          tagName: 'script',
          attributes: { src: 'app.js', defer: '', async: '' },
          content: ''
        }
      ];
      
      const result = processor.renderMergedHead(elements);
      expect(result).toContain('defer');
      expect(result).toContain('async');
      expect(result).toContain('src="app.js"');
    });

    test('should handle empty elements array', () => {
      const result = processor.renderMergedHead([]);
      expect(result).toBe('');
    });
  });

  describe('Static extractHeadContent Method', () => {
    test('should extract head content from complete HTML', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test</title>
            <meta name="description" content="Test page">
          </head>
          <body>Content</body>
        </html>
      `;
      
      const result = HeadMergeProcessor.extractHeadContent(html);
      expect(result).toContain('<title>Test</title>');
      expect(result).toContain('meta name="description"');
    });

    test('should handle HTML without head tag', () => {
      const html = '<html><body>No head</body></html>';
      const result = HeadMergeProcessor.extractHeadContent(html);
      expect(result).toBe('');
    });

    test('should handle empty or invalid HTML', () => {
      expect(HeadMergeProcessor.extractHeadContent('')).toBe('');
      expect(HeadMergeProcessor.extractHeadContent(null)).toBe('');
      expect(HeadMergeProcessor.extractHeadContent(undefined)).toBe('');
      expect(HeadMergeProcessor.extractHeadContent(123)).toBe('');
    });

    test('should handle head tag with attributes', () => {
      const html = '<html><head class="test" id="main"><title>Test</title></head><body></body></html>';
      const result = HeadMergeProcessor.extractHeadContent(html);
      expect(result).toBe('<title>Test</title>');
    });
  });

  describe('Static injectHeadContent Method', () => {
    test('should replace existing head content', () => {
      const html = '<html><head><title>Old</title></head><body></body></html>';
      const headContent = '<title>New</title><meta name="test" content="value">';
      
      const result = HeadMergeProcessor.injectHeadContent(html, headContent);
      
      expect(result).toContain('<title>New</title>');
      expect(result).toContain('<meta name="test" content="value">');
      expect(result).not.toContain('<title>Old</title>');
    });

    test('should inject head after html tag when no head exists', () => {
      const html = '<html><body>Content</body></html>';
      const headContent = '<title>Injected</title>';
      
      const result = HeadMergeProcessor.injectHeadContent(html, headContent);
      
      expect(result).toContain('<html>\n<head>\n<title>Injected</title>\n</head>');
    });

    test('should prepend head when no html tag exists', () => {
      const html = '<body>Content</body>';
      const headContent = '<title>Prepended</title>';
      
      const result = HeadMergeProcessor.injectHeadContent(html, headContent);
      
      expect(result).toContain('<head>\n<title>Prepended</title>\n</head>\n<body>Content</body>');
    });

    test('should handle HTML with attributes on html tag', () => {
      const html = '<html lang="en" class="test"><body></body></html>';
      const headContent = '<title>Test</title>';
      
      const result = HeadMergeProcessor.injectHeadContent(html, headContent);
      
      expect(result).toContain('<html lang="en" class="test">\n<head>\n<title>Test</title>\n</head>');
    });

    test('should handle empty or invalid HTML', () => {
      expect(HeadMergeProcessor.injectHeadContent('', 'content')).toBe('');
      expect(HeadMergeProcessor.injectHeadContent(null, 'content')).toBeNull();
      expect(HeadMergeProcessor.injectHeadContent(undefined, 'content')).toBeUndefined();
    });

    test('should handle head tag with attributes', () => {
      const html = '<html><head class="old" id="test"><title>Old</title></head><body></body></html>';
      const headContent = '<title>New</title>';
      
      const result = HeadMergeProcessor.injectHeadContent(html, headContent);
      
      expect(result).toContain('<head>\n<title>New</title>\n</head>');
      expect(result).not.toContain('class="old"');
    });
  });

  describe('Complex Integration Scenarios', () => {
    test('should handle complex deduplication scenario', () => {
      const fragments = [
        {
          headHtml: `
            <title>Layout Title</title>
            <meta name="author" content="Layout Author">
            <link rel="stylesheet" href="layout.css">
            <link rel="canonical" href="layout.html">
            <script src="layout.js"></script>
          `,
          source: 'layout.html'
        },
        {
          headHtml: `
            <title>Page Title</title>
            <meta name="description" content="Page Description">
            <link rel="stylesheet" href="page.css">
            <link rel="canonical" href="page.html">
            <script src="page.js"></script>
            <script>console.log("inline");</script>
          `,
          source: 'page.html'
        }
      ];
      
      const result = processor.mergeHeadContent(fragments);
      
      // Title: page wins
      expect(result).toContain('Page Title');
      expect(result).not.toContain('Layout Title');
      
      // Meta: both preserved (different names)
      expect(result).toContain('Layout Author');
      expect(result).toContain('Page Description');
      
      // Stylesheets: both are kept because they have different hrefs
      expect(result).toContain('layout.css');
      expect(result).toContain('page.css');
      
      // Canonical: page wins (last wins)
      expect(result).toContain('page.html');
      expect(result).not.toContain('layout.html');
      
      // Scripts: both are kept because they have different src attributes
      expect(result).toContain('layout.js');
      expect(result).toContain('page.js');
      expect(result).toContain('console.log("inline")');
    });

    test('should handle very large head content', () => {
      const largeContent = 'x'.repeat(10000);
      const html = `<title>${largeContent}</title>`;
      
      const elements = processor.parseHeadElements(html);
      expect(elements.length).toBe(1);
      expect(elements[0].content).toBe(largeContent);
      
      const rendered = processor.renderMergedHead(elements);
      expect(rendered).toContain(largeContent);
    });

    test('should handle deeply nested scenarios', () => {
      const fragments = [];
      
      // Create many fragments with overlapping meta tags
      for (let i = 0; i < 50; i++) {
        fragments.push({
          headHtml: `<meta name="test-${i}" content="value-${i}"><meta name="common" content="fragment-${i}">`,
          source: `fragment-${i}.html`
        });
      }
      
      const result = processor.mergeHeadContent(fragments);
      
      // Should have 50 unique meta tags plus the last common one
      const metaCount = (result.match(/<meta/g) || []).length;
      expect(metaCount).toBe(51); // 50 unique + 1 common (last wins)
      
      // Last common meta should win
      expect(result).toContain('fragment-49');
    });
  });
});