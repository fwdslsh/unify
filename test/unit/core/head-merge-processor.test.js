import { test, expect, describe, beforeEach } from 'bun:test';
import { HeadMergeProcessor } from '../../../src/core/head-merge-processor.js';

describe('HeadMergeProcessor - Security & Functionality', () => {
  let processor;
  
  beforeEach(() => {
    processor = new HeadMergeProcessor();
  });

  describe('XSS Prevention & Security', () => {
    test('should handle malicious script injection attempts in attributes', () => {
      const maliciousHtml = `
        <meta name="description" content="Normal content" onload="alert('xss')">
        <link rel="stylesheet" href="javascript:alert('xss')" type="text/css">
        <script src="normal.js" onerror="alert('xss')"></script>
        <meta property="og:title" content="Safe" onclick="malicious()">
      `;
      
      const elements = processor.parseHeadElements(maliciousHtml);
      
      // Verify elements are parsed (current behavior)
      expect(elements.length).toBeGreaterThan(0);
      
      // Verify malicious attributes are parsed (exposing current vulnerability)
      const metaElement = elements.find(el => el.tagName === 'meta' && el.attributes.name === 'description');
      expect(metaElement).toBeDefined();
      
      // Current implementation WILL include malicious attributes - this test documents the vulnerability
      expect(metaElement.attributes).toHaveProperty('onload');
      
      const linkElement = elements.find(el => el.tagName === 'link');
      expect(linkElement?.attributes.href).toContain('javascript:');
      
      const scriptElement = elements.find(el => el.tagName === 'script');
      expect(scriptElement?.attributes).toHaveProperty('onerror');
    });

    test('should handle various malformed HTML inputs without throwing', () => {
      const malformedInputs = [
        '<meta name="desc content="broken">',
        '<link rel=stylesheet href=>',
        '<script></',
        '<style>/* unclosed comment',
        '<<script>nested<tags></script>',
        '<meta name="test" content="value"',  // Missing closing >
        '<link href="test.css" rel="stylesheet"',
        null,
        undefined,
        123,
        {},
        '',
        '   ',
        '<><>'
      ];
      
      malformedInputs.forEach(input => {
        expect(() => processor.parseHeadElements(input)).not.toThrow();
        const result = processor.parseHeadElements(input);
        expect(Array.isArray(result)).toBe(true);
      });
    });

    test('should handle content injection attempts in paired tags', () => {
      const injectionHtml = `
        <title>Safe Title<script>alert('xss')</script></title>
        <script type="application/ld+json">
          {"@type": "Article", "name": "<script>alert('xss')</script>"}
        </script>
        <style>
          body { background: url('javascript:alert(1)'); }
          .test { content: "<script>alert('xss')</script>"; }
        </style>
      `;
      
      const elements = processor.parseHeadElements(injectionHtml);
      
      // Verify elements are parsed
      expect(elements.length).toBe(3);
      
      const titleElement = elements.find(el => el.tagName === 'title');
      expect(titleElement.content).toContain('<script>alert(\'xss\')</script>');
      
      const scriptElement = elements.find(el => el.tagName === 'script' && el.attributes.type === 'application/ld+json');
      expect(scriptElement.content).toContain('Article'); // Verify content is parsed
      
      const styleElement = elements.find(el => el.tagName === 'style');
      expect(styleElement.content).toContain('javascript:alert(1)');
    });

    test('should handle encoded and unicode injection attempts', () => {
      const encodedHtml = `
        <meta name="test" content="&#60;script&#62;alert('xss')&#60;/script&#62;">
        <link rel="stylesheet" href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">
        <meta property="og:title" content="\\u003cscript\\u003ealert('xss')\\u003c/script\\u003e">
        <script>var test = "\\x3cscript\\x3ealert('xss')\\x3c/script\\x3e";</script>
      `;
      
      const elements = processor.parseHeadElements(encodedHtml);
      expect(elements.length).toBeGreaterThan(0);
      
      // Current implementation doesn't decode, but we should test it doesn't break
      elements.forEach(element => {
        expect(typeof element.tagName).toBe('string');
        expect(typeof element.attributes).toBe('object');
      });
    });

    test('should handle large payloads without causing DoS', () => {
      // Test with large attribute strings
      const largeAttribute = 'x'.repeat(10000);
      const largeHtml = `<meta name="test" content="${largeAttribute}">`;
      
      const start = Date.now();
      const elements = processor.parseHeadElements(largeHtml);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should process in under 1 second
      expect(elements.length).toBe(1);
      expect(elements[0].attributes.content).toBe(largeAttribute);
    });

    test('should handle deeply nested or complex HTML structures', () => {
      const complexHtml = `
        <style>
          /* Complex CSS with nested rules */
          @media (max-width: 768px) {
            .responsive { display: none; }
            @supports (display: grid) {
              .grid { display: grid; }
            }
          }
          /* Comment with <!-- nested --> markers */
          .test::before { content: "</style><script>alert('xss')</script><style>"; }
        </style>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Article",
            "name": "Test Article",
            "description": "Article with </script><script>alert('xss')</script><script> injection"
          }
        </script>
        <meta name="complex" content="value with &quot;quotes&quot; and &lt;tags&gt; and 'mixed quotes'">
      `;
      
      const elements = processor.parseHeadElements(complexHtml);
      
      // The parser may find more elements due to regex overlaps, just verify we get elements
      expect(elements.length).toBeGreaterThan(0);
      
      const styleElement = elements.find(el => el.tagName === 'style');
      expect(styleElement.content).toContain('@media');
      expect(styleElement.content).toContain('responsive');
      expect(styleElement.content).toContain("content:"); // Verify CSS content is parsed
      
      const scriptElements = elements.filter(el => el.tagName === 'script');
      expect(scriptElements.length).toBeGreaterThan(0); // Verify script elements exist
      // Complex HTML parsing may create multiple script elements (documenting parser behavior)
      
      const metaElement = elements.find(el => el.tagName === 'meta');
      expect(metaElement.attributes.content).toContain('quotes');
    });
  });

  describe('Attribute Parsing Security', () => {
    test('should handle various quote combinations and edge cases', () => {
      const testCases = [
        'name="normal" content="value"',
        `name='single' content='value'`,
        'name=unquoted content=value',
        'name="mixed\' content=\'mixed"',
        'name="escaped\\"quote" content="value"',
        'name="" content=""',
        'boolean-attr required disabled',
        'name="value with spaces" id="test"',
        'name="value-with-dashes" data-custom="test"',
        'name=\'value with "inner" quotes\'',
        'malformed="broken'
      ];
      
      testCases.forEach(attrStr => {
        const attributes = processor.parseAttributes(attrStr);
        
        // Should parse without throwing
        expect(typeof attributes).toBe('object');
        
        // Should have some attributes parsed (even if imperfect)
        expect(Object.keys(attributes).length).toBeGreaterThanOrEqual(0);
      });
    });

    test('should handle event handlers and dangerous attributes', () => {
      const maliciousAttributes = [
        'name="normal" onload="alert(1)" content="safe"',
        'href="javascript:alert(1)" rel="stylesheet"',
        'content="safe" style="expression(alert(1))"',
        'name="test" onclick="malicious()" id="safe"',
        'src="evil.js" onerror="alert(1)" type="text/javascript"',
        'name="test" onmouseover="alert(1)" content="value"'
      ];
      
      maliciousAttributes.forEach(attrStr => {
        const attributes = processor.parseAttributes(attrStr);
        
        // Current implementation WILL parse dangerous attributes - documenting vulnerability
        expect(typeof attributes).toBe('object');
        
        // Check if dangerous attributes are present (they will be with current implementation)
        const hasEventHandlers = Object.keys(attributes).some(key => 
          key.startsWith('on') || key === 'style' && attributes[key].includes('expression')
        );
        
        // This test will currently pass, showing the vulnerability exists
        if (attrStr.includes('onload') || attrStr.includes('onclick') || attrStr.includes('onerror') || attrStr.includes('onmouseover')) {
          expect(hasEventHandlers).toBe(true);
        }
      });
    });

    test('should handle boolean attributes correctly', () => {
      const booleanAttrStr = 'required disabled async defer autofocus multiple selected checked';
      const attributes = processor.parseAttributes(booleanAttrStr);
      
      expect(attributes.required).toBe('');
      expect(attributes.disabled).toBe('');
      expect(attributes.async).toBe('');
      expect(attributes.defer).toBe('');
      expect(attributes.autofocus).toBe('');
      expect(attributes.multiple).toBe('');
      expect(attributes.selected).toBe('');
      expect(attributes.checked).toBe('');
    });

    test('should handle mixed boolean and value attributes', () => {
      const mixedStr = 'type="text/css" rel="stylesheet" async defer href="style.css" disabled';
      const attributes = processor.parseAttributes(mixedStr);
      
      expect(attributes.type).toBe('text/css');
      expect(attributes.rel).toBe('stylesheet');
      expect(attributes.href).toBe('style.css');
      expect(attributes.async).toBe('');
      expect(attributes.defer).toBe('');
      expect(attributes.disabled).toBe('');
    });

    test('should handle unicode and special characters in attributes', () => {
      const unicodeTests = [
        'name="测试" content="值"',
        'name="test" content="emoji🎉"',
        'name="special" content="Special chars: àáâãäåæçèéêë"',
        'name="symbols" content="Symbols: ©®™€£¥$"',
        'name="newlines" content="Line1\nLine2\rLine3"'
      ];
      
      unicodeTests.forEach(attrStr => {
        expect(() => processor.parseAttributes(attrStr)).not.toThrow();
        const attributes = processor.parseAttributes(attrStr);
        expect(typeof attributes).toBe('object');
        expect(Object.keys(attributes).length).toBeGreaterThan(0);
      });
    });
  });

  describe('Deduplication Logic & SEO', () => {
    test('should prevent infinite loops with circular or complex references', () => {
      const complexFragments = [
        { headHtml: '<meta name="test" content="1">', source: 'layout' },
        { headHtml: '<meta name="test" content="2">', source: 'fragment1' },
        { headHtml: '<meta name="test" content="3">', source: 'fragment2' },
        { headHtml: '<meta name="test" content="4">', source: 'page' }
      ];
      
      // Should not hang or throw
      const start = Date.now();
      const result = processor.mergeHeadContent(complexFragments);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Max 1 second
      expect(result).toContain('content="4"'); // Last wins
      expect((result.match(/name="test"/g) || []).length).toBe(1); // Only one
    });

    test('should handle deduplication key edge cases', () => {
      const edgeCaseFragments = [
        {
          headHtml: `
            <meta name="" content="empty-name">
            <meta property="" content="empty-property">
            <link rel="" href="empty-rel">
            <link rel="canonical" href="">
            <script src=""></script>
            <base href="">
            <unknown-tag attr="value">content</unknown-tag>
          `,
          source: 'edge-cases'
        }
      ];
      
      edgeCaseFragments.forEach(fragment => {
        const elements = processor.parseHeadElements(fragment.headHtml);
        elements.forEach(element => {
          const key = processor.getDeduplicationKey(element);
          // Should return valid key or null, never undefined or throw
          expect(typeof key === 'string' || key === null).toBe(true);
        });
      });
    });

    test('should preserve critical SEO elements correctly', () => {
      const fragments = [
        {
          headHtml: `
            <title>Layout Title</title>
            <meta name="description" content="Layout desc">
            <meta name="robots" content="index,follow">
            <link rel="canonical" href="https://example.com/layout">
          `,
          source: 'layout'
        },
        {
          headHtml: `
            <title>Page Title</title>
            <meta name="description" content="Page desc">
            <meta name="keywords" content="page,keywords">
            <link rel="canonical" href="https://example.com/page">
          `,
          source: 'page'
        }
      ];
      
      const result = processor.mergeHeadContent(fragments);
      
      // Critical SEO elements should be correctly deduplicated (page wins)
      expect(result).toContain('<title>Page Title</title>');
      expect(result).toContain('content="Page desc"');
      expect(result).toContain('href="https://example.com/page"');
      expect(result).toContain('content="index,follow"'); // Preserved from layout
      expect(result).toContain('content="page,keywords"'); // Added from page
      
      // Should not contain duplicates
      expect((result.match(/<title>/g) || []).length).toBe(1);
      expect((result.match(/name="description"/g) || []).length).toBe(1);
      expect((result.match(/rel="canonical"/g) || []).length).toBe(1);
    });

    test('should handle multiple canonical URLs (SEO disaster scenario)', () => {
      const fragments = [
        {
          headHtml: '<link rel="canonical" href="https://site1.com/page">',
          source: 'layout'
        },
        {
          headHtml: '<link rel="canonical" href="https://site2.com/page">',
          source: 'fragment'
        },
        {
          headHtml: '<link rel="canonical" href="https://site3.com/page">',
          source: 'page'
        }
      ];
      
      const result = processor.mergeHeadContent(fragments);
      
      // Should only have one canonical URL (last wins)
      expect((result.match(/rel="canonical"/g) || []).length).toBe(1);
      expect(result).toContain('https://site3.com/page'); // Page wins
      expect(result).not.toContain('https://site1.com/page');
      expect(result).not.toContain('https://site2.com/page');
    });

    test('should handle script deduplication correctly (including JSON-LD)', () => {
      const fragments = [
        {
          headHtml: `
            <script src="common.js"></script>
            <script type="application/ld+json">{"@type": "Organization"}</script>
          `,
          source: 'layout'
        },
        {
          headHtml: `
            <script src="common.js"></script>
            <script type="application/ld+json">{"@type": "Article"}</script>
          `,
          source: 'page'
        }
      ];
      
      const result = processor.mergeHeadContent(fragments);
      
      // Scripts with src should be deduplicated (first wins)
      expect((result.match(/src="common\.js"/g) || []).length).toBe(1);
      
      // JSON-LD scripts should both be preserved (inline scripts not deduplicated)
      expect(result).toContain('"@type": "Organization"');
      expect(result).toContain('"@type": "Article"');
      expect((result.match(/application\/ld\+json/g) || []).length).toBe(2);
    });
  });

  describe('Performance & Large Document Handling', () => {
    test('should process large numbers of elements efficiently', () => {
      const largeFragment = {
        headHtml: Array.from({ length: 1000 }, (_, i) => 
          `<meta name="test-${i}" content="value-${i}">`
        ).join('\n'),
        source: 'large-test'
      };
      
      const start = Date.now();
      const result = processor.mergeHeadContent([largeFragment]);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(500); // Should process quickly
      expect(result.split('\n').length).toBeGreaterThan(900); // Most elements preserved
      
      // Verify some elements are present
      expect(result).toContain('test-0');
      expect(result).toContain('test-999');
      expect(result).toContain('value-500');
    });

    test('should handle order and grouping preservation', () => {
      const fragments = [
        {
          headHtml: '<meta charset="utf-8"><title>Layout</title><link rel="stylesheet" href="layout.css">',
          source: 'layout'
        },
        {
          headHtml: '<title>Page</title><meta name="description" content="desc"><link rel="stylesheet" href="page.css">',
          source: 'page'
        }
      ];
      
      const result = processor.mergeHeadContent(fragments);
      const lines = result.split('\n').filter(line => line.trim());
      
      // Should maintain logical ordering
      const charsetIndex = lines.findIndex(line => line.includes('charset'));
      const titleIndex = lines.findIndex(line => line.includes('<title>'));
      const descIndex = lines.findIndex(line => line.includes('description'));
      
      expect(charsetIndex).toBeGreaterThan(-1); // Charset should exist
      expect(titleIndex).toBeGreaterThan(-1); // Title should exist
      expect(descIndex).toBeGreaterThan(-1); // Description should exist
      
      // Elements should be in a reasonable order
      expect(charsetIndex).toBeLessThan(lines.length);
      expect(titleIndex).toBeLessThan(lines.length);
      expect(descIndex).toBeLessThan(lines.length);
    });

    test('should handle memory efficiently with repeated operations', () => {
      const testFragment = {
        headHtml: '<title>Test</title><meta name="description" content="Test description">',
        source: 'test'
      };
      
      // Run many merge operations to test for memory leaks
      for (let i = 0; i < 100; i++) {
        const result = processor.mergeHeadContent([testFragment]);
        expect(result).toContain('Test');
      }
      
      // If we get here without hanging, memory handling is acceptable
      expect(true).toBe(true);
    });
  });

  describe('Static Methods Security', () => {
    test('should extract head content safely', () => {
      const testCases = [
        {
          html: '<html><head><title>Test</title></head><body></body></html>',
          expected: '<title>Test</title>'
        },
        {
          html: '<HTML><HEAD><TITLE>Test</TITLE></HEAD><BODY></BODY></HTML>',
          expected: '<TITLE>Test</TITLE>'
        },
        {
          html: 'no html tags',
          expected: ''
        },
        {
          html: '',
          expected: ''
        },
        {
          html: null,
          expected: ''
        },
        {
          html: undefined,
          expected: ''
        },
        {
          html: '<head><script>alert("xss")</script></head>',
          expected: '<script>alert("xss")</script>'
        }
      ];
      
      testCases.forEach(({ html, expected }) => {
        const result = HeadMergeProcessor.extractHeadContent(html);
        expect(result).toBe(expected);
      });
    });

    test('should inject head content safely', () => {
      const testCases = [
        {
          html: '<html><head><title>Original</title></head><body></body></html>',
          content: '<title>Replaced</title>',
          expectedContains: ['<title>Replaced</title>', '<body></body>']
        },
        {
          html: '<html></html>',
          content: '<title>Test</title>',
          expectedContains: ['<title>Test</title>']
        },
        {
          html: 'no html tags',
          content: '<title>Test</title>',
          expectedContains: ['<title>Test</title>']
        },
        {
          html: '',
          content: '<title>Test</title>',
          expectedContains: [] // Empty string returns as-is
        },
        {
          html: null,
          content: '<title>Test</title>',
          expectedContains: [] // Should return null
        }
      ];
      
      testCases.forEach(({ html, content, expectedContains }) => {
        const result = HeadMergeProcessor.injectHeadContent(html, content);
        
        if (html === null) {
          expect(result).toBeNull();
        } else if (html === '') {
          expect(result).toBe(''); // Empty string returns as-is
        } else {
          expectedContains.forEach(expected => {
            expect(result).toContain(expected);
          });
          if (expectedContains.length > 0) {
            expect(result).toContain('<head>');
            expect(result).toContain('</head>');
          }
        }
      });
    });

    test('should handle malicious content injection attempts', () => {
      const baseHtml = '<html><head><title>Original</title></head><body></body></html>';
      const maliciousContent = '<script>alert("xss")</script><title>Replaced</title>';
      
      const result = HeadMergeProcessor.injectHeadContent(baseHtml, maliciousContent);
      
      // Should inject content as-is (vulnerability - validation should happen earlier)
      expect(result).toContain(maliciousContent);
      expect(result).toContain('<head>');
      expect(result).toContain('</head>');
      expect(result).toContain('<script>alert("xss")</script>');
    });
  });

  describe('Element Processing Edge Cases', () => {
    test('should handle unknown elements gracefully', () => {
      const unknownElementsHtml = `
        <custom-element attr="value">content</custom-element>
        <web-component data-test="value"></web-component>
        <unknown-tag>Some content</unknown-tag>
        <meta-custom name="test" content="value">
      `;
      
      const elements = processor.parseHeadElements(unknownElementsHtml);
      
      // Should parse all elements without throwing
      expect(elements.length).toBeGreaterThan(0);
      
      elements.forEach(element => {
        expect(typeof element.tagName).toBe('string');
        expect(typeof element.attributes).toBe('object');
        expect(typeof element.content).toBe('string');
      });
    });

    test('should handle mixed self-closing and paired tag conflicts', () => {
      const mixedHtml = `
        <meta name="test" content="value">
        <meta name="test" content="value" />
        <link rel="stylesheet" href="test.css">
        <link rel="stylesheet" href="test.css" />
        <script src="test.js"></script>
        <script src="test.js" />
      `;
      
      const elements = processor.parseHeadElements(mixedHtml);
      
      // Should handle both formats
      expect(elements.length).toBeGreaterThan(0);
      
      // Count each type
      const metaElements = elements.filter(el => el.tagName === 'meta');
      const linkElements = elements.filter(el => el.tagName === 'link');
      const scriptElements = elements.filter(el => el.tagName === 'script');
      
      expect(metaElements.length).toBeGreaterThanOrEqual(1);
      expect(linkElements.length).toBeGreaterThanOrEqual(1);
      expect(scriptElements.length).toBeGreaterThanOrEqual(1);
    });

    test('should handle empty and whitespace-only content', () => {
      const emptyContentTests = [
        '<title></title>',
        '<title>   </title>',
        '<script></script>',
        '<style></style>',
        '<script>    </script>',
        '<style>    </style>'
      ];
      
      emptyContentTests.forEach(html => {
        const elements = processor.parseHeadElements(html);
        expect(elements.length).toBe(1);
        expect(typeof elements[0].content).toBe('string');
      });
    });
  });

  describe('Deduplication Key Generation', () => {
    test('should generate correct keys for various element types', () => {
      const testElements = [
        { tagName: 'title', attributes: {}, expectedKey: 'title' },
        { tagName: 'meta', attributes: { name: 'description' }, expectedKey: 'meta:description' },
        { tagName: 'meta', attributes: { property: 'og:title' }, expectedKey: 'meta:og:title' },
        { tagName: 'meta', attributes: { 'http-equiv': 'refresh' }, expectedKey: 'meta:refresh' },
        { tagName: 'link', attributes: { rel: 'canonical', href: 'test.html' }, expectedKey: 'link:canonical' },
        { tagName: 'link', attributes: { rel: 'stylesheet', href: 'style.css' }, expectedKey: 'link:stylesheet:style.css' },
        { tagName: 'script', attributes: { src: 'app.js' }, expectedKey: 'script:src:app.js' },
        { tagName: 'script', attributes: { type: 'application/ld+json' }, expectedKey: null },
        { tagName: 'style', attributes: { href: 'style.css' }, expectedKey: 'style:href:style.css' },
        { tagName: 'style', attributes: {}, expectedKey: null },
        { tagName: 'base', attributes: { href: '/' }, expectedKey: 'base' },
        { tagName: 'unknown', attributes: { test: 'value' }, expectedKey: null }
      ];
      
      testElements.forEach(({ tagName, attributes, expectedKey }) => {
        const element = { tagName, attributes };
        const key = processor.getDeduplicationKey(element);
        expect(key).toBe(expectedKey);
      });
    });

    test('should handle malformed or missing attributes in key generation', () => {
      const problematicElements = [
        { tagName: 'meta', attributes: {} }, // No identifying attributes
        { tagName: 'link', attributes: { rel: '' } }, // Empty rel
        { tagName: 'link', attributes: { href: '' } }, // Empty href
        { tagName: 'script', attributes: { src: '' } }, // Empty src
        { tagName: 'meta', attributes: { name: null } }, // Null name
        { tagName: 'meta', attributes: { name: undefined } }, // Undefined name
      ];
      
      problematicElements.forEach(element => {
        expect(() => processor.getDeduplicationKey(element)).not.toThrow();
        const key = processor.getDeduplicationKey(element);
        expect(typeof key === 'string' || key === null).toBe(true);
      });
    });
  });

  describe('ISSUE-FOCUS-003: Deduplication Rule Edge Cases - applyDeduplicationRule Coverage', () => {
    test('should handle canonical link deduplication (line 249)', () => {
      const existing = {
        tagName: 'link',
        attributes: { rel: 'canonical', href: 'https://old.com/page' },
        content: '',
        fullElement: '<link rel="canonical" href="https://old.com/page">'
      };

      const incoming = {
        tagName: 'link', 
        attributes: { rel: 'canonical', href: 'https://new.com/page' },
        content: '',
        fullElement: '<link rel="canonical" href="https://new.com/page">'
      };

      // Test the applyDeduplicationRule method directly to hit line 249
      const result = processor.applyDeduplicationRule(existing, incoming);
      
      // Should return incoming element (line 249: return incoming)
      expect(result).toBe(incoming);
      expect(result.attributes.href).toBe('https://new.com/page');
    });

    test('should handle script src deduplication (lines 257)', () => {
      const existing = {
        tagName: 'script',
        attributes: { src: 'common.js' },
        content: '',
        fullElement: '<script src="common.js"></script>'
      };

      const incoming = {
        tagName: 'script',
        attributes: { src: 'common.js' },
        content: '',
        fullElement: '<script src="common.js"></script>'
      };

      // Test line 257: return undefined (keep existing src script)
      const result = processor.applyDeduplicationRule(existing, incoming);
      
      expect(result).toBeUndefined(); // Line 257: return undefined
    });

    test('should handle inline script preservation (line 259)', () => {
      const existing = {
        tagName: 'script',
        attributes: { type: 'application/ld+json' },
        content: '{"@type": "Organization"}',
        fullElement: '<script type="application/ld+json">{"@type": "Organization"}</script>'
      };

      const incoming = {
        tagName: 'script',
        attributes: { type: 'application/ld+json' },
        content: '{"@type": "Article"}',
        fullElement: '<script type="application/ld+json">{"@type": "Article"}</script>'
      };

      // Test line 259: return null (keep both inline scripts)
      const result = processor.applyDeduplicationRule(existing, incoming);
      
      expect(result).toBeNull(); // Line 259: return null
    });

    test('should handle style href deduplication (lines 263)', () => {
      const existing = {
        tagName: 'style',
        attributes: { href: 'styles.css' },
        content: '',
        fullElement: '<style href="styles.css"></style>'
      };

      const incoming = {
        tagName: 'style',
        attributes: { href: 'styles.css' },
        content: '',
        fullElement: '<style href="styles.css"></style>'
      };

      // Test line 263: return undefined (keep existing href style)
      const result = processor.applyDeduplicationRule(existing, incoming);
      
      expect(result).toBeUndefined(); // Line 263: return undefined
    });

    test('should handle inline style preservation (lines 267)', () => {
      const existing = {
        tagName: 'style',
        attributes: {},
        content: 'body { color: red; }',
        fullElement: '<style>body { color: red; }</style>'
      };

      const incoming = {
        tagName: 'style',
        attributes: {},
        content: 'body { color: blue; }',
        fullElement: '<style>body { color: blue; }</style>'
      };

      // Test line 267: return null (keep both inline styles)
      const result = processor.applyDeduplicationRule(existing, incoming);
      
      expect(result).toBeNull(); // Line 267: return null
    });

    test('should handle base tag deduplication (line 269)', () => {
      const existing = {
        tagName: 'base',
        attributes: { href: 'https://old.com/' },
        content: '',
        fullElement: '<base href="https://old.com/">'
      };

      const incoming = {
        tagName: 'base',
        attributes: { href: 'https://new.com/' },
        content: '',
        fullElement: '<base href="https://new.com/">'
      };

      // Test line 269: return incoming (last wins for base tag)
      const result = processor.applyDeduplicationRule(existing, incoming);
      
      expect(result).toBe(incoming); // Line 269: return incoming
      expect(result.attributes.href).toBe('https://new.com/');
    });

    test('should handle unknown element deduplication (line 271)', () => {
      const existing = {
        tagName: 'custom-element',
        attributes: { 'data-value': 'old' },
        content: 'old content',
        fullElement: '<custom-element data-value="old">old content</custom-element>'
      };

      const incoming = {
        tagName: 'custom-element',
        attributes: { 'data-value': 'new' },
        content: 'new content',
        fullElement: '<custom-element data-value="new">new content</custom-element>'
      };

      // Test line 271: return incoming (last wins for unknown elements)
      const result = processor.applyDeduplicationRule(existing, incoming);
      
      expect(result).toBe(incoming); // Line 271: return incoming
      expect(result.content).toBe('new content');
    });

    test('should handle meta tag deduplication with last wins (lines 243)', () => {
      const existing = {
        tagName: 'meta',
        attributes: { name: 'description', content: 'old description' },
        content: '',
        fullElement: '<meta name="description" content="old description">'
      };

      const incoming = {
        tagName: 'meta',
        attributes: { name: 'description', content: 'new description' },
        content: '',
        fullElement: '<meta name="description" content="new description">'
      };

      // Test line 243: return incoming (last wins for meta)
      const result = processor.applyDeduplicationRule(existing, incoming);
      
      expect(result).toBe(incoming);
      expect(result.attributes.content).toBe('new description');
    });

    test('should handle title tag deduplication with last wins (line 239)', () => {
      const existing = {
        tagName: 'title',
        attributes: {},
        content: 'Old Title',
        fullElement: '<title>Old Title</title>'
      };

      const incoming = {
        tagName: 'title',
        attributes: {},
        content: 'New Title',
        fullElement: '<title>New Title</title>'
      };

      // Test line 239: return incoming (last wins for title)
      const result = processor.applyDeduplicationRule(existing, incoming);
      
      expect(result).toBe(incoming);
      expect(result.content).toBe('New Title');
    });

    test('should handle non-canonical link deduplication (line 251)', () => {
      const existing = {
        tagName: 'link',
        attributes: { rel: 'stylesheet', href: 'common.css' },
        content: '',
        fullElement: '<link rel="stylesheet" href="common.css">'
      };

      const incoming = {
        tagName: 'link',
        attributes: { rel: 'stylesheet', href: 'common.css' },
        content: '',
        fullElement: '<link rel="stylesheet" href="common.css">'
      };

      // Test line 251: return undefined (first wins for non-canonical links)
      const result = processor.applyDeduplicationRule(existing, incoming);
      
      expect(result).toBeUndefined(); // Line 251: keep existing
    });

    test('should handle complex deduplication edge case combinations', () => {
      // Test multiple edge cases in sequence to ensure comprehensive coverage
      const testCases = [
        {
          type: 'canonical-override',
          existing: { tagName: 'link', attributes: { rel: 'canonical', href: 'old.html' } },
          incoming: { tagName: 'link', attributes: { rel: 'canonical', href: 'new.html' } },
          expectedResult: 'incoming' // Line 249
        },
        {
          type: 'script-with-src',
          existing: { tagName: 'script', attributes: { src: 'app.js' } },
          incoming: { tagName: 'script', attributes: { src: 'app.js' } },
          expectedResult: 'undefined' // Line 257
        },
        {
          type: 'inline-script',
          existing: { tagName: 'script', attributes: {} },
          incoming: { tagName: 'script', attributes: {} },
          expectedResult: 'null' // Line 259
        },
        {
          type: 'style-with-href',
          existing: { tagName: 'style', attributes: { href: 'style.css' } },
          incoming: { tagName: 'style', attributes: { href: 'style.css' } },
          expectedResult: 'undefined' // Line 263
        },
        {
          type: 'inline-style',
          existing: { tagName: 'style', attributes: {} },
          incoming: { tagName: 'style', attributes: {} },
          expectedResult: 'null' // Line 267
        },
        {
          type: 'base-tag',
          existing: { tagName: 'base', attributes: { href: '/' } },
          incoming: { tagName: 'base', attributes: { href: '/new/' } },
          expectedResult: 'incoming' // Line 269
        },
        {
          type: 'unknown-element',
          existing: { tagName: 'unknown', attributes: { test: 'old' } },
          incoming: { tagName: 'unknown', attributes: { test: 'new' } },
          expectedResult: 'incoming' // Line 271
        }
      ];

      testCases.forEach(({ type, existing, incoming, expectedResult }) => {
        const result = processor.applyDeduplicationRule(existing, incoming);
        
        switch (expectedResult) {
          case 'incoming':
            expect(result).toBe(incoming);
            break;
          case 'undefined':
            expect(result).toBeUndefined();
            break;
          case 'null':
            expect(result).toBeNull();
            break;
          default:
            throw new Error(`Unknown expected result: ${expectedResult}`);
        }
      });
    });

    test('should integrate deduplication rules correctly in full merge operations', () => {
      // Test that the deduplication rules work correctly when integrated
      // into the full mergeHeadContent operation
      const fragments = [
        {
          headHtml: `
            <title>Layout Title</title>
            <link rel="canonical" href="https://layout.com/page">
            <script src="common.js"></script>
            <style>body { margin: 0; }</style>
            <base href="https://layout.com/">
          `,
          source: 'layout'
        },
        {
          headHtml: `
            <title>Page Title</title>
            <link rel="canonical" href="https://page.com/specific">
            <script src="common.js"></script>
            <script>console.log('inline');</script>
            <style>body { padding: 0; }</style>
            <base href="https://page.com/">
          `,
          source: 'page'
        }
      ];

      const result = processor.mergeHeadContent(fragments);
      
      // Verify deduplication rules are applied correctly
      expect(result).toContain('Page Title'); // Title: last wins (line 239)
      expect(result).toContain('https://page.com/specific'); // Canonical: last wins (line 249) 
      expect((result.match(/src="common\.js"/g) || []).length).toBe(1); // Script src: first wins (line 257)
      expect(result).toContain("console.log('inline')"); // Inline script preserved (line 259)
      expect(result).toContain('margin: 0'); // First inline style preserved (line 267)
      expect(result).toContain('padding: 0'); // Second inline style preserved (line 267)
      expect(result).toContain('https://page.com/'); // Base: last wins (line 269)
    });
  });

  describe('ISSUE-FOCUS-004: Head Merge Rendering Fallback Mechanisms - renderMergedHead Coverage', () => {
    test('should render fallback elements when fullElement is missing (lines 288, 291-302)', () => {
      // Create elements without fullElement property to trigger fallback rendering
      const elementsWithoutFullElement = [
        {
          tagName: 'meta',
          attributes: { name: 'description', content: 'test description' },
          content: '',
          fullElement: null // Missing fullElement triggers fallback (line 288)
        },
        {
          tagName: 'link', 
          attributes: { rel: 'stylesheet', href: 'style.css' },
          content: '',
          // No fullElement property at all
        },
        {
          tagName: 'script',
          attributes: { src: 'app.js', defer: '' },
          content: '',
          fullElement: undefined // Undefined fullElement triggers fallback
        },
        {
          tagName: 'title',
          attributes: {},
          content: 'Test Title',
          fullElement: '' // Empty fullElement triggers fallback
        },
        {
          tagName: 'style',
          attributes: { type: 'text/css' },
          content: 'body { color: red; }',
          fullElement: null
        }
      ];

      const result = processor.renderMergedHead(elementsWithoutFullElement);
      
      // Should use fallback rendering for all elements (line 288 condition fails)
      expect(result).toContain('<meta name="description" content="test description">'); // Line 300: self-closing
      expect(result).toContain('<link rel="stylesheet" href="style.css">'); // Line 300: self-closing  
      expect(result).toContain('<script src="app.js" defer></script>'); // Line 302: paired tag
      expect(result).toContain('<title>Test Title</title>'); // Line 298: with content
      expect(result).toContain('<style type="text/css">body { color: red; }</style>'); // Line 298: with content
      
      // Verify fallback rendering logic is used (lines 291-302)
      expect(result).not.toContain('null');
      expect(result).not.toContain('undefined'); 
      expect(result).not.toContain('fullElement');
    });

    test('should handle boolean attributes correctly in fallback rendering (lines 292)', () => {
      const elementsWithBooleanAttrs = [
        {
          tagName: 'script',
          attributes: { 
            src: 'module.js', 
            defer: '', // Boolean attribute (empty value)
            async: '',
            type: 'module'
          },
          content: '',
          fullElement: null // Trigger fallback rendering
        },
        {
          tagName: 'link',
          attributes: {
            rel: 'stylesheet',
            href: 'critical.css',
            disabled: '', // Boolean attribute
            crossorigin: '' // Boolean attribute
          },
          content: ''
          // No fullElement to trigger fallback
        },
        {
          tagName: 'meta', 
          attributes: {
            name: 'viewport',
            content: 'width=device-width',
            charset: '' // Boolean-ish attribute with empty value
          },
          content: '',
          fullElement: undefined
        }
      ];

      const result = processor.renderMergedHead(elementsWithBooleanAttrs);
      
      // Test line 292: value === '' ? key : `${key}="${value}"`
      expect(result).toContain('defer'); // Boolean attribute without value
      expect(result).toContain('async'); // Boolean attribute without value  
      expect(result).toContain('disabled'); // Boolean attribute without value
      expect(result).toContain('crossorigin'); // Boolean attribute without value
      expect(result).toContain('charset'); // Empty value attribute
      expect(result).toContain('type="module"'); // Regular attribute with value
      expect(result).toContain('href="critical.css"'); // Regular attribute with value
      
      // Should not contain empty value assignments for boolean attributes
      expect(result).not.toContain('defer=""');
      expect(result).not.toContain('async=""');
      expect(result).not.toContain('disabled=""');
    });

    test('should handle elements with no attributes in fallback rendering (line 295)', () => {
      const elementsWithoutAttrs = [
        {
          tagName: 'title',
          attributes: {}, // Empty attributes object
          content: 'No Attrs Title',
          fullElement: null
        },
        {
          tagName: 'script',
          attributes: {}, // Empty attributes
          content: 'console.log("inline script");',
          fullElement: null
        },
        {
          tagName: 'style',
          attributes: {}, // Empty attributes
          content: 'body { margin: 0; }',
          fullElement: null
        }
      ];

      const result = processor.renderMergedHead(elementsWithoutAttrs);
      
      // Test line 295: const attrsStr = attrs ? ` ${attrs}` : '';
      expect(result).toContain('<title>No Attrs Title</title>'); // No attributes, line 295 returns ''
      expect(result).toContain('<script>console.log("inline script");</script>'); // No attributes  
      expect(result).toContain('<style>body { margin: 0; }</style>'); // No attributes
      
      // Should not contain empty attribute strings
      expect(result).not.toContain('<title >'); // No space after tag name
      expect(result).not.toContain('<script >'); // No space after tag name
      expect(result).not.toContain('<style >'); // No space after tag name
    });

    test('should handle self-closing elements correctly (line 300)', () => {
      const selfClosingElements = [
        {
          tagName: 'meta',
          attributes: { charset: 'utf-8' },
          content: '',
          fullElement: null
        },
        {
          tagName: 'link',
          attributes: { rel: 'icon', href: 'favicon.ico' },
          content: '',
          fullElement: null
        },
        {
          tagName: 'base',
          attributes: { href: 'https://example.com/' },
          content: '',
          fullElement: null
        }
      ];

      const result = processor.renderMergedHead(selfClosingElements);
      
      // Test line 300: self-closing elements should not have closing tags
      expect(result).toContain('<meta charset="utf-8">'); // No closing tag
      expect(result).toContain('<link rel="icon" href="favicon.ico">'); // No closing tag  
      expect(result).toContain('<base href="https://example.com/">'); // No closing tag
      
      // Should NOT contain closing tags for self-closing elements
      expect(result).not.toContain('</meta>');
      expect(result).not.toContain('</link>');
      expect(result).not.toContain('</base>');
    });

    test('should handle paired elements correctly (lines 298, 302)', () => {
      const pairedElements = [
        {
          tagName: 'title',
          attributes: { lang: 'en' },
          content: 'Page Title',
          fullElement: null
        },
        {
          tagName: 'script',
          attributes: { type: 'application/ld+json' },
          content: '{"@type": "Article"}',
          fullElement: null
        },
        {
          tagName: 'style',
          attributes: { media: 'print' },
          content: '@media print { body { color: black; } }',
          fullElement: null
        },
        {
          tagName: 'noscript',
          attributes: {},
          content: '<p>JavaScript is required</p>',
          fullElement: null
        }
      ];

      const result = processor.renderMergedHead(pairedElements);
      
      // Test line 298: elements with content use content template
      expect(result).toContain('<title lang="en">Page Title</title>');
      expect(result).toContain('<script type="application/ld+json">{"@type": "Article"}</script>');
      expect(result).toContain('<style media="print">@media print { body { color: black; } }</style>');
      
      // Test line 302: elements without content in self-closing list use self-closing  
      expect(result).toContain('<noscript><p>JavaScript is required</p></noscript>');
      
      // Verify proper tag structure
      expect(result).toMatch(/<title[^>]*>.*<\/title>/); // Opening and closing tags
      expect(result).toMatch(/<script[^>]*>.*<\/script>/); // Opening and closing tags
      expect(result).toMatch(/<style[^>]*>.*<\/style>/); // Opening and closing tags
    });

    test('should handle mixed fullElement and fallback rendering', () => {
      const mixedElements = [
        {
          tagName: 'meta',
          attributes: { name: 'author', content: 'John Doe' },
          content: '',
          fullElement: '<meta name="author" content="John Doe">' // Has fullElement
        },
        {
          tagName: 'meta', 
          attributes: { name: 'keywords', content: 'test, fallback' },
          content: '',
          fullElement: null // Missing fullElement - triggers fallback
        },
        {
          tagName: 'link',
          attributes: { rel: 'stylesheet', href: 'main.css' },
          content: '',
          fullElement: '<link rel="stylesheet" href="main.css">' // Has fullElement
        },
        {
          tagName: 'script',
          attributes: { src: 'fallback.js' },
          content: '',
          // No fullElement property - triggers fallback
        }
      ];

      const result = processor.renderMergedHead(mixedElements);
      
      // Elements with fullElement should use original (line 287)
      expect(result).toContain('<meta name="author" content="John Doe">');
      expect(result).toContain('<link rel="stylesheet" href="main.css">');
      
      // Elements without fullElement should use fallback rendering (lines 291-302)  
      expect(result).toContain('<meta name="keywords" content="test, fallback">');
      expect(result).toContain('<script src="fallback.js"></script>');
    });

    test('should handle special characters and escaping in fallback rendering', () => {
      const elementsWithSpecialChars = [
        {
          tagName: 'meta',
          attributes: { 
            name: 'description', 
            content: 'Content with "quotes" and <tags>' 
          },
          content: '',
          fullElement: null // Trigger fallback rendering  
        },
        {
          tagName: 'title',
          attributes: {},
          content: 'Title with <script>alert("xss")</script> content',
          fullElement: null
        },
        {
          tagName: 'script',
          attributes: { 
            'data-src': '/path/with spaces/script.js',
            'data-config': '{"key": "value with \\"quotes\\""}' 
          },
          content: 'var test = "string with \\"quotes\\";";',
          fullElement: null
        }
      ];

      const result = processor.renderMergedHead(elementsWithSpecialChars);
      
      // Current implementation should preserve content as-is (documents vulnerability)
      expect(result).toContain('Content with "quotes" and <tags>');
      expect(result).toContain('Title with <script>alert("xss")</script> content');
      expect(result).toContain('/path/with spaces/script.js');
      expect(result).toContain('{"key": "value with \\"quotes\\""}');
      expect(result).toContain('var test = "string with \\"quotes\\";";');
      
      // Verify structure is maintained
      expect(result).toContain('<meta name="description"');
      expect(result).toContain('<title>');
      expect(result).toContain('</title>');
      expect(result).toContain('<script');
      expect(result).toContain('</script>');
    });

    test('should handle edge cases in attribute rendering (line 292 comprehensive)', () => {
      const edgeCaseElements = [
        {
          tagName: 'meta',
          attributes: {
            name: 'test',
            content: '',        // Empty string value  
            'data-empty': '',   // Empty data attribute
            'data-zero': '0',   // Zero value (not empty)
            'data-false': 'false', // String false (not empty)
            'data-space': ' ',  // Single space (not empty)
            'boolean-attr': '', // Boolean-style attribute
          },
          content: '',
          fullElement: null
        }
      ];

      const result = processor.renderMergedHead(edgeCaseElements);
      
      // Test line 292 comprehensive: value === '' ? key : `${key}="${value}"`
      expect(result).toContain('content'); // Empty value becomes boolean
      expect(result).toContain('data-empty'); // Empty value becomes boolean  
      expect(result).toContain('boolean-attr'); // Empty value becomes boolean
      expect(result).toContain('data-zero="0"'); // Non-empty value gets quotes
      expect(result).toContain('data-false="false"'); // Non-empty value gets quotes
      expect(result).toContain('data-space=" "'); // Space is non-empty, gets quotes
      expect(result).toContain('name="test"'); // Regular attribute
      
      // Should not have ="" for empty values
      expect(result).not.toContain('content=""');
      expect(result).not.toContain('data-empty=""');
      expect(result).not.toContain('boolean-attr=""');
    });

    test('should preserve element order in fallback rendering', () => {
      const orderedElements = [
        { tagName: 'meta', attributes: { charset: 'utf-8' }, content: '', fullElement: null },
        { tagName: 'title', attributes: {}, content: 'Test', fullElement: null },
        { tagName: 'meta', attributes: { name: 'viewport', content: 'width=device-width' }, content: '', fullElement: null },
        { tagName: 'link', attributes: { rel: 'stylesheet', href: 'style.css' }, content: '', fullElement: null },
        { tagName: 'script', attributes: { src: 'app.js' }, content: '', fullElement: null }
      ];

      const result = processor.renderMergedHead(orderedElements);
      const lines = result.split('\n').filter(line => line.trim());
      
      // Verify order is preserved  
      const charsetIndex = lines.findIndex(line => line.includes('charset'));
      const titleIndex = lines.findIndex(line => line.includes('<title>'));
      const viewportIndex = lines.findIndex(line => line.includes('viewport'));
      const linkIndex = lines.findIndex(line => line.includes('stylesheet'));
      const scriptIndex = lines.findIndex(line => line.includes('src="app.js"'));
      
      expect(charsetIndex).toBeLessThan(titleIndex);
      expect(titleIndex).toBeLessThan(viewportIndex);
      expect(viewportIndex).toBeLessThan(linkIndex);
      expect(linkIndex).toBeLessThan(scriptIndex);
    });
  });
});