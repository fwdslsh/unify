/**
 * Tests for HTMLMinifier class
 * Tests HTML minification functionality following TDD methodology
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { HTMLMinifier } from '../../../src/core/html-minifier.js';

describe('HTMLMinifier', () => {
  let minifier;

  beforeEach(() => {
    minifier = new HTMLMinifier();
  });

  describe('Core Minification', () => {
    test('should_remove_unnecessary_whitespace_when_minifying', () => {
      const input = `<html>
  <body>
    <div>   Content   </div>
  </body>
</html>`;
      const expected = '<html><body><div>Content</div></body></html>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_remove_html_comments_when_minifying', () => {
      const input = `<html>
  <!-- This is a comment -->
  <body>
    <div>Content</div>
    <!-- Another comment -->
  </body>
</html>`;
      const expected = '<html><body><div>Content</div></body></html>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_conditional_comments_when_minifying', () => {
      const input = `<html>
  <head>
    <!-- Regular comment -->
    <!--[if IE]>
      <link rel="stylesheet" href="ie.css">
    <![endif]-->
    <title>Test</title>
  </head>
</html>`;
      const expected = '<html><head><!--[if IE]><link rel="stylesheet" href="ie.css"><![endif]--><title>Test</title></head></html>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_script_content_when_minifying', () => {
      const input = `<html>
  <script>
    function test() {
      return "hello world";
    }
  </script>
</html>`;
      const expected = '<html><script>\n    function test() {\n      return "hello world";\n    }\n  </script></html>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_style_content_when_minifying', () => {
      const input = `<html>
  <style>
    .test {
      color: red;
    }
  </style>
</html>`;
      const expected = '<html><style>\n    .test {\n      color: red;\n    }\n  </style></html>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_pre_whitespace_when_minifying', () => {
      const input = `<html>
  <body>
    <pre>
      function example() {
        return "preserved whitespace";
      }
    </pre>
  </body>
</html>`;
      const expected = '<html><body><pre>\n      function example() {\n        return "preserved whitespace";\n      }\n    </pre></body></html>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_code_whitespace_when_minifying', () => {
      const input = `<html>
  <body>
    <code>
      let x = 1;
      let y = 2;
    </code>
  </body>
</html>`;
      const expected = '<html><body><code>\n      let x = 1;\n      let y = 2;\n    </code></body></html>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_textarea_whitespace_when_minifying', () => {
      const input = `<html>
  <body>
    <textarea>
      This is
      multiline text
      with spaces
    </textarea>
  </body>
</html>`;
      const expected = '<html><body><textarea>\n      This is\n      multiline text\n      with spaces\n    </textarea></body></html>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_collapse_multiple_spaces_when_minifying', () => {
      const input = '<div>Multiple     spaces     here</div>';
      const expected = '<div>Multiple spaces here</div>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_remove_newlines_between_elements_when_minifying', () => {
      const input = `<div>
Content
</div>
<p>
Paragraph
</p>`;
      const expected = '<div>Content</div><p>Paragraph</p>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });
  });

  describe('Edge Cases', () => {
    test('should_handle_empty_html_when_minifying', () => {
      const input = '';
      const expected = '';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_handle_malformed_html_when_minifying', () => {
      const input = '<div><p>Unclosed tags';
      const expected = '<div><p>Unclosed tags';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_attributes_when_minifying', () => {
      const input = `<div 
        class="test" 
        data-value="something"
        id="main">
        Content
      </div>`;
      const expected = '<div class="test" data-value="something" id="main">Content</div>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_handle_mixed_whitespace_types_when_minifying', () => {
      const input = `<div>\t\n  \r\n  Content  \t\n</div>`;
      const expected = '<div>Content</div>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_inline_whitespace_significant_elements_when_minifying', () => {
      const input = `<p>This <span>is a</span> <strong>test</strong> sentence.</p>`;
      const expected = '<p>This <span>is a</span> <strong>test</strong> sentence.</p>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });
  });

  describe('Whitespace-Sensitive Elements', () => {
    test('should_preserve_whitespace_in_samp_elements_when_minifying', () => {
      const input = `<samp>
  Computer output
  with formatting
</samp>`;
      const expected = '<samp>\n  Computer output\n  with formatting\n</samp>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_whitespace_in_kbd_elements_when_minifying', () => {
      const input = `<kbd>
  Ctrl + C
</kbd>`;
      const expected = '<kbd>\n  Ctrl + C\n</kbd>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_whitespace_in_nested_sensitive_elements_when_minifying', () => {
      const input = `<div>
  <pre>
    nested
    content
  </pre>
  <p>Regular content</p>
</div>`;
      const expected = '<div><pre>\n    nested\n    content\n  </pre><p>Regular content</p></div>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });
  });

  describe('Comment Handling', () => {
    test('should_remove_regular_html_comments_when_minifying', () => {
      const input = `<!-- Start of page -->
<html>
  <!-- Head section -->
  <head><title>Test</title></head>
  <!-- Body section -->
  <body>Content</body>
</html>
<!-- End of page -->`;
      const expected = '<html><head><title>Test</title></head><body>Content</body></html>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_ie_conditional_comments_when_minifying', () => {
      const input = `<!--[if lt IE 9]>
  <script src="html5shiv.js"></script>
<![endif]-->
<!--[if IE]>
  <link rel="stylesheet" href="ie.css">
<![endif]-->`;
      const expected = '<!--[if lt IE 9]><script src="html5shiv.js"></script><![endif]--><!--[if IE]><link rel="stylesheet" href="ie.css"><![endif]-->';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_preserve_server_side_includes_when_minifying', () => {
      const input = `<html>
  <!--#include file="header.html" -->
  <body>
    <!--#include virtual="/nav.html" -->
    Content
  </body>
</html>`;
      const expected = '<html><!--#include file="header.html" --><body><!--#include virtual="/nav.html" -->Content</body></html>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });

    test('should_handle_nested_comments_when_minifying', () => {
      const input = `<!-- Outer comment
  <div>Content</div>
  <!-- Inner comment -->
  More content
-->
<div>Real content</div>`;
      const expected = '<div>Real content</div>';
      
      const result = minifier.minify(input);
      expect(result).toBe(expected);
    });
  });

  describe('Performance and Validation', () => {
    test('should_maintain_html_validity_when_minifying', () => {
      const input = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Test Page</title>
  </head>
  <body>
    <header>Header</header>
    <main>Main content</main>
    <footer>Footer</footer>
  </body>
</html>`;
      
      const result = minifier.minify(input);
      
      // Should maintain basic HTML structure
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html lang="en">');
      expect(result).toContain('<meta charset="UTF-8">');
      expect(result).toContain('</html>');
    });

    test('should_return_minification_stats_when_requested', () => {
      const input = `<html>
  <!-- Comment -->
  <body>
    <div>   Content   </div>
  </body>
</html>`;
      
      const result = minifier.minifyWithStats(input);
      
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('stats');
      expect(result.stats).toHaveProperty('originalSize');
      expect(result.stats).toHaveProperty('minifiedSize');
      expect(result.stats).toHaveProperty('compression');
      expect(result.stats.originalSize).toBeGreaterThan(result.stats.minifiedSize);
    });
  });

  describe('Configuration Options', () => {
    test('should_respect_removeComments_option_when_configured', () => {
      const miniferWithOptions = new HTMLMinifier({
        removeComments: false
      });
      
      const input = `<html>
  <!-- Keep this comment -->
  <body>Content</body>
</html>`;
      
      const result = miniferWithOptions.minify(input);
      expect(result).toContain('<!-- Keep this comment -->');
    });

    test('should_respect_collapseWhitespace_option_when_configured', () => {
      const miniferWithOptions = new HTMLMinifier({
        collapseWhitespace: false
      });
      
      const input = `<html>
  <body>
    <div>Content</div>
  </body>
</html>`;
      
      const result = miniferWithOptions.minify(input);
      // Should preserve some whitespace structure
      expect(result).toContain('\n');
    });
  });
});