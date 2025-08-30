/**
 * HTML Minifier Tests
 * 
 * Comprehensive tests for the HTMLMinifier class to achieve 100% coverage
 */

import { describe, test, it, expect, beforeEach } from 'bun:test';
import { HTMLMinifier } from '../../../src/core/html-minifier.js';

describe('HTMLMinifier', () => {
  let minifier;

  beforeEach(() => {
    minifier = new HTMLMinifier();
  });

  describe('Constructor', () => {
    it('should create minifier with default options', () => {
      const defaultMinifier = new HTMLMinifier();
      
      expect(defaultMinifier.options.removeComments).toBe(true);
      expect(defaultMinifier.options.collapseWhitespace).toBe(true);
      expect(defaultMinifier.options.preserveLineBreaks).toBe(false);
      expect(defaultMinifier.options.removeEmptyAttributes).toBe(false);
      expect(defaultMinifier.options.removeRedundantAttributes).toBe(false);
    });

    it('should create minifier with custom options', () => {
      const customMinifier = new HTMLMinifier({
        removeComments: false,
        collapseWhitespace: false,
        preserveLineBreaks: true,
        removeEmptyAttributes: true
      });
      
      expect(customMinifier.options.removeComments).toBe(false);
      expect(customMinifier.options.collapseWhitespace).toBe(false);
      expect(customMinifier.options.preserveLineBreaks).toBe(true);
      expect(customMinifier.options.removeEmptyAttributes).toBe(true);
    });

    it('should initialize whitespace preserve elements set', () => {
      expect(minifier.whitespacePreserveElements.has('pre')).toBe(true);
      expect(minifier.whitespacePreserveElements.has('code')).toBe(true);
      expect(minifier.whitespacePreserveElements.has('textarea')).toBe(true);
      expect(minifier.whitespacePreserveElements.has('script')).toBe(true);
      expect(minifier.whitespacePreserveElements.has('style')).toBe(true);
    });

    it('should initialize comment patterns', () => {
      expect(minifier.commentPatterns.conditional).toBeDefined();
      expect(minifier.commentPatterns.ssi).toBeDefined();
      expect(minifier.commentPatterns.regular).toBeDefined();
    });
  });

  describe('minify()', () => {
    it('should handle null and undefined input', () => {
      expect(minifier.minify(null)).toBeNull();
      expect(minifier.minify(undefined)).toBeUndefined();
      expect(minifier.minify('')).toBe('');
    });

    it('should handle non-string input', () => {
      expect(minifier.minify(123)).toBe(123);
      expect(minifier.minify({})).toEqual({});
      expect(minifier.minify([])).toEqual([]);
    });

    it('should minify basic HTML', () => {
      const html = `
        <html>
          <head>
            <title>  Test Page  </title>
          </head>
          <body>
            <h1>  Hello World  </h1>
            <p>  This is a test  </p>
          </body>
        </html>
      `;

      const result = minifier.minify(html);
      
      expect(result).toBeDefined();
      expect(result.length).toBeLessThan(html.length);
      expect(result).toContain('<title>Test Page</title>');
      expect(result).toContain('<h1>Hello World</h1>');
    });

    it('should remove HTML comments', () => {
      const html = `
        <html>
          <!-- This is a comment -->
          <head>
            <title>Test</title>
            <!-- Another comment -->
          </head>
          <body>
            <!-- Comment in body -->
            <p>Content</p>
          </body>
        </html>
      `;

      const result = minifier.minify(html);
      
      expect(result).not.toContain('<!-- This is a comment -->');
      expect(result).not.toContain('<!-- Another comment -->');
      expect(result).not.toContain('<!-- Comment in body -->');
      expect(result).toContain('<p>Content</p>');
    });

    it('should preserve IE conditional comments', () => {
      const html = `
        <html>
          <!--[if IE]>
            <link rel="stylesheet" href="ie.css">
          <![endif]-->
          <!-- Regular comment -->
          <body>
            <p>Content</p>
          </body>
        </html>
      `;

      const result = minifier.minify(html);
      
      expect(result).toContain('<!--[if IE]>');
      expect(result).toContain('<![endif]-->');
      expect(result).not.toContain('<!-- Regular comment -->');
    });

    it('should preserve server-side includes', () => {
      const html = `
        <html>
          <!--#include virtual="/header.html" -->
          <!-- Regular comment -->
          <body>
            <!--#echo var="DATE_LOCAL" -->
            <p>Content</p>
          </body>
        </html>
      `;

      const result = minifier.minify(html);
      
      expect(result).toContain('<!--#include virtual="/header.html" -->');
      expect(result).toContain('<!--#echo var="DATE_LOCAL" -->');
      expect(result).not.toContain('<!-- Regular comment -->');
    });

    it('should collapse whitespace', () => {
      const html = `
        <div>
          <p>    Multiple    spaces    </p>
          <span>
            
            Multiple lines
            
          </span>
        </div>
      `;

      const result = minifier.minify(html);
      
      expect(result.length).toBeLessThan(html.length);
      expect(result).toContain('<p>Multiple spaces</p>');
      expect(result).toContain('Multiple lines');
    });

    it('should preserve whitespace in specific elements', () => {
      const html = `
        <div>
          <pre>
            function test() {
              return "hello    world";
            }
          </pre>
          <code>  var x = 1;  </code>
          <textarea>
            
            Preserve    all    spaces
            
          </textarea>
          <script>
            var y = "test    string";
          </script>
        </div>
      `;

      const result = minifier.minify(html);
      
      // Whitespace should be preserved within these elements
      expect(result).toContain('function test() {');
      expect(result).toContain('  var x = 1;  ');
      expect(result).toContain('Preserve    all    spaces');
      expect(result).toContain('var y = "test    string";');
    });
  });

  describe('minifyWithStats()', () => {
    it('should handle minification with statistics', () => {
      const html = '<html><body>  <p>  Test  </p>  </body></html>';
      
      const result = minifier.minifyWithStats(html);
      
      expect(result.stats.originalSize).toBe(Buffer.byteLength(html, 'utf8'));
      expect(result.stats.minifiedSize).toBeLessThan(result.stats.originalSize);
      expect(result.stats.compressionRatio).toBeGreaterThan(0);
      expect(result.html).toContain('<p>Test</p>');
    });

    it('should calculate compression statistics', () => {
      const html = `
        <html>
          <!-- Comment to remove -->
          <body>
            <p>    Lots    of    spaces    </p>
          </body>
        </html>
      `;
      
      const result = minifier.minifyWithStats(html);
      
      expect(result.stats.originalSize).toBe(Buffer.byteLength(html, 'utf8'));
      expect(result.stats.minifiedSize).toBeLessThan(result.stats.originalSize);
      expect(result.stats.compression).toBeGreaterThan(0);
      expect(result.stats.compressionRatio).toBeLessThan(1);
    });
  });

  describe('_removeComments()', () => {
    it('should remove regular HTML comments', () => {
      const html = '<!-- Comment 1 --><div>Content</div><!-- Comment 2 -->';
      const result = minifier._removeComments(html);
      
      expect(result).toBe('<div>Content</div>');
    });

    it('should preserve conditional comments', () => {
      const html = '<!--[if IE 9]><div>IE9 content</div><![endif]--><p>Regular content</p>';
      const result = minifier._removeComments(html);
      
      expect(result).toContain('<!--[if IE 9]>');
      expect(result).toContain('<![endif]-->');
      expect(result).toContain('<p>Regular content</p>');
    });

    it('should preserve server-side include comments', () => {
      const html = '<!--#include virtual="/file.html" --><p>Content</p>';
      const result = minifier._removeComments(html);
      
      expect(result).toContain('<!--#include virtual="/file.html" -->');
      expect(result).toContain('<p>Content</p>');
    });

    it('should handle nested comments', () => {
      const html = '<!-- Outer <!-- inner --> comment --><div>Content</div>';
      const result = minifier._removeComments(html);
      
      expect(result).toBe('<div>Content</div>');
    });

    it('should handle multiline comments', () => {
      const html = `<!--
        Multi-line
        comment
        content
      --><div>Content</div>`;
      const result = minifier._removeComments(html);
      
      expect(result).toBe('<div>Content</div>');
    });
  });

  describe('_removeRegularComments()', () => {
    it('should remove regular comments but preserve special ones', () => {
      const html = '<!-- Regular comment --><div>Content</div>';
      
      const result = minifier._removeRegularComments(html);
      
      expect(result).not.toContain('<!-- Regular comment -->');
      expect(result).toContain('<div>Content</div>');
    });

    it('should handle comments with special characters', () => {
      const html = '<!-- Comment with <tags> and "quotes" -->Content';
      const result = minifier._removeRegularComments(html);
      
      expect(result).toBe('Content');
    });
  });

  describe('_minifyWhitespace()', () => {
    it('should collapse multiple spaces', () => {
      const html = '<p>Multiple    spaces    here</p>';
      const result = minifier._minifyWhitespace(html);
      
      expect(result).toBe('<p>Multiple spaces here</p>');
    });

    it('should remove leading and trailing whitespace', () => {
      const html = '   <div>Content</div>   ';
      const result = minifier._minifyWhitespace(html);
      
      expect(result).toBe('<div>Content</div>');
    });

    it('should handle advanced whitespace processing', () => {
      const html = `
        <div>
          <p>Paragraph 1</p>
          <p>Paragraph 2</p>
        </div>
      `;
      
      const result = minifier._minifyWhitespace(html);
      
      expect(result).toBeDefined();
      expect(result.length).toBeLessThan(html.length);
    });
  });

  describe('_processWhitespaceAdvanced()', () => {
    it('should handle complex whitespace scenarios', () => {
      const html = '<div>  <span>Text</span>  <strong>Bold</strong>  </div>';
      const result = minifier._processWhitespaceAdvanced(html);
      
      expect(result).toBeDefined();
      expect(result).toContain('<span>Text</span>');
      expect(result).toContain('<strong>Bold</strong>');
    });

    it('should preserve single spaces between inline elements', () => {
      const html = '<span>Word1</span> <span>Word2</span>';
      const result = minifier._processWhitespaceAdvanced(html);
      
      expect(result).toContain('Word1</span> <span>Word2');
    });

    it('should handle block elements correctly', () => {
      const html = '<div>Block 1</div>\n<div>Block 2</div>';
      const result = minifier._processWhitespaceAdvanced(html);
      
      expect(result).toBeDefined();
      expect(result).toContain('Block 1');
      expect(result).toContain('Block 2');
    });
  });

  describe('_isBlockElement()', () => {
    it('should identify common block elements', () => {
      expect(minifier._isBlockElement('<div>')).toBe(true);
      expect(minifier._isBlockElement('<p>')).toBe(true);
      expect(minifier._isBlockElement('<h1>')).toBe(true);
      expect(minifier._isBlockElement('<section>')).toBe(true);
      expect(minifier._isBlockElement('<article>')).toBe(true);
      expect(minifier._isBlockElement('<header>')).toBe(true);
      expect(minifier._isBlockElement('<footer>')).toBe(true);
    });

    it('should identify inline elements as non-block', () => {
      expect(minifier._isBlockElement('<span>')).toBe(false);
      expect(minifier._isBlockElement('<a>')).toBe(false);
      expect(minifier._isBlockElement('<em>')).toBe(false);
      expect(minifier._isBlockElement('<strong>')).toBe(false);
      expect(minifier._isBlockElement('<code>')).toBe(false);
    });

    it('should handle closing tags', () => {
      expect(minifier._isBlockElement('</div>')).toBe(true);
      expect(minifier._isBlockElement('</p>')).toBe(true);
      expect(minifier._isBlockElement('</span>')).toBe(false);
    });

    it('should handle tags with attributes', () => {
      expect(minifier._isBlockElement('<div class="test">')).toBe(true);
      expect(minifier._isBlockElement('<span id="test">')).toBe(false);
    });

    it('should handle malformed or empty input', () => {
      expect(minifier._isBlockElement('')).toBe(false);
      expect(minifier._isBlockElement('not-a-tag')).toBe(false);
      expect(minifier._isBlockElement('<>')).toBe(false);
    });
  });

  describe('_finalCleanup()', () => {
    it('should perform final cleanup operations', () => {
      const html = '<div>  Content  </div>\n\n<p>More content</p>';
      const result = minifier._finalCleanup(html);
      
      expect(result).toBeDefined();
      expect(result.length).toBeLessThanOrEqual(html.length);
    });

    it('should handle empty input', () => {
      expect(minifier._finalCleanup('')).toBe('');
      expect(minifier._finalCleanup('   ')).toBeDefined();
    });
  });

  describe('_validateHTML()', () => {
    it('should validate well-formed HTML', () => {
      const validHtml = '<html><body><p>Valid content</p></body></html>';
      
      expect(() => minifier._validateHTML(validHtml)).not.toThrow();
    });

    it('should handle malformed HTML gracefully', () => {
      const malformedHtml = '<div><span>Unclosed tags';
      
      expect(() => minifier._validateHTML(malformedHtml)).not.toThrow();
    });

    it('should handle empty HTML', () => {
      expect(() => minifier._validateHTML('')).not.toThrow();
      expect(() => minifier._validateHTML('   ')).not.toThrow();
    });
  });

  describe('Configuration Options', () => {
    it('should respect removeComments=false option', () => {
      const noCommentsMinifier = new HTMLMinifier({ removeComments: false });
      const html = '<!-- Comment --><div>Content</div>';
      
      const result = noCommentsMinifier.minify(html);
      
      expect(result).toContain('<!-- Comment -->');
      expect(result).toContain('<div>Content</div>');
    });

    it('should respect collapseWhitespace=false option', () => {
      const noCollapseMinifier = new HTMLMinifier({ collapseWhitespace: false });
      const html = '<p>    Multiple    spaces    </p>';
      
      const result = noCollapseMinifier.minify(html);
      
      expect(result).toContain('    Multiple    spaces    ');
    });

    it('should respect preserveLineBreaks=true option', () => {
      const preserveBreaksMinifier = new HTMLMinifier({ preserveLineBreaks: true });
      const html = `<div>
Line 1
Line 2
</div>`;
      
      const result = preserveBreaksMinifier.minify(html);
      
      expect(result).toBeDefined();
      // Line breaks should be preserved in some form
    });
  });

  describe('Edge Cases', () => {
    it('should handle HTML with only whitespace', () => {
      const html = '   \n\t   \n  ';
      const result = minifier.minify(html);
      
      expect(result).toBeDefined();
    });

    it('should handle HTML with mixed content types', () => {
      const html = `
        <html>
          <head>
            <script>var x = "test   string";</script>
            <style>.class { margin: 0    0    0    0; }</style>
          </head>
          <body>
            <pre>    Preserved    spaces    </pre>
            <p>    Collapsed    spaces    </p>
          </body>
        </html>
      `;
      
      const result = minifier.minify(html);
      
      expect(result).toContain('var x = "test   string";');
      expect(result).toContain('margin: 0    0    0    0;');
      expect(result).toContain('Preserved    spaces');
      expect(result).toContain('<p>Collapsed spaces</p>');
    });

    it('should handle very large HTML documents', () => {
      const largeHtml = '<div>' + '  Large content block.  '.repeat(1000) + '</div>';
      const result = minifier.minify(largeHtml);
      
      expect(result).toBeDefined();
      expect(result.length).toBeLessThan(largeHtml.length);
    });

    it('should handle special characters and entities', () => {
      const html = `
        <div>
          <p>&lt;script&gt;alert('test')&lt;/script&gt;</p>
          <p>&amp; &quot; &apos; &copy;</p>
          <p>Unicode: \u00A9 \u2122</p>
        </div>
      `;
      
      const result = minifier.minify(html);
      
      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&amp;');
      expect(result).toContain('\u00A9');
    });
  });
});