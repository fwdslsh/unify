/**
 * Unit Tests for Markdown Processor Validation
 * Tests validation logic for <head> tags in markdown content
 * 
 * Ensures that:
 * - <head> tags in code blocks are allowed (documentation use case)
 * - Real <head> tags outside code blocks are rejected (security)
 * - Various code block formats are properly handled
 */

import { describe, test, expect } from 'bun:test';
import { processMarkdownForDOMCascade } from '../../../src/core/markdown-processor.js';
import { ValidationError } from '../../../src/core/errors.js';

describe('Markdown Processor Validation', () => {
  describe('Head Tag Validation', () => {
    test('should allow <head> tags inside fenced code blocks', async () => {
      const markdownWithCodeBlock = `---
title: Documentation Page
---

# HTML Structure Example

Here's how to structure an HTML document:

\`\`\`html
<!DOCTYPE html>
<html>
<head>
    <title>Example Page</title>
    <meta name="description" content="Example">
</head>
<body>
    <h1>Content</h1>
</body>
</html>
\`\`\`

This example shows proper HTML structure.
`;

      // Should NOT throw ValidationError
      const result = await processMarkdownForDOMCascade(
        markdownWithCodeBlock, 
        '/test/doc.md'
      );
      
      expect(result).toBeDefined();
      expect(result.html).toBeDefined();
      expect(result.frontmatter.title).toBe('Documentation Page');
      // Verify the head tag was properly escaped in output
      expect(result.html).toContain('&lt;head&gt;');
      expect(result.html).toContain('&lt;/head&gt;');
    });

    test('should allow <head> tags in inline code', async () => {
      const markdownWithInlineCode = `---
title: Inline Code Example
---

# Documentation

The \`<head>\` tag should contain metadata. You can also use \`</head>\` to close it.

Multiple inline codes: \`<head>\`, \`<HEAD>\`, and \`</HEAD>\` should all be allowed.
`;

      // Should NOT throw ValidationError
      const result = await processMarkdownForDOMCascade(
        markdownWithInlineCode,
        '/test/inline.md'
      );
      
      expect(result).toBeDefined();
      expect(result.html).toBeDefined();
      // Verify inline code is properly escaped
      expect(result.html).toContain('<code>&lt;head&gt;</code>');
      expect(result.html).toContain('<code>&lt;/head&gt;</code>');
    });

    test('should allow <head> tags in indented code blocks', async () => {
      const markdownWithIndentedCode = `---
title: Indented Code Example
---

# Example with Indented Code

Here's an HTML example using indentation:

    <!DOCTYPE html>
    <html>
    <head>
        <title>Indented Example</title>
    </head>
    <body>
        Content here
    </body>
    </html>

This uses 4-space indentation for code blocks.
`;

      // Should NOT throw ValidationError
      const result = await processMarkdownForDOMCascade(
        markdownWithIndentedCode,
        '/test/indented.md'
      );
      
      expect(result).toBeDefined();
      expect(result.html).toBeDefined();
      expect(result.frontmatter.title).toBe('Indented Code Example');
    });

    test('should allow multiple code blocks with <head> tags', async () => {
      const markdownWithMultipleBlocks = `---
title: Multiple Examples
---

# Multiple Code Examples

First example:

\`\`\`html
<head>
    <title>First</title>
</head>
\`\`\`

Second example:

\`\`\`xml
<document>
    <head>
        <meta>XML head is also allowed</meta>
    </head>
</document>
\`\`\`

And inline: \`<head>\` plus indented:

    <head>Indented head</head>

All these should be allowed.
`;

      // Should NOT throw ValidationError
      const result = await processMarkdownForDOMCascade(
        markdownWithMultipleBlocks,
        '/test/multiple.md'
      );
      
      expect(result).toBeDefined();
      expect(result.html).toBeDefined();
      expect(result.frontmatter.title).toBe('Multiple Examples');
    });

    test('should reject actual <head> tags outside code blocks', async () => {
      const markdownWithRealHeadTag = `---
title: Invalid Content
---

# This Should Fail

<head>
    <title>This is not in a code block</title>
    <meta name="description" content="Should be rejected">
</head>

This has a real head tag that should trigger validation error.
`;

      // Should throw ValidationError
      await expect(
        processMarkdownForDOMCascade(markdownWithRealHeadTag, '/test/invalid.md')
      ).rejects.toThrow(ValidationError);
      
      await expect(
        processMarkdownForDOMCascade(markdownWithRealHeadTag, '/test/invalid.md')
      ).rejects.toThrow('Markdown body must not contain <head> tag');
    });

    test('should reject <head> tag with various capitalizations outside code blocks', async () => {
      const testCases = [
        '<head>content</head>',
        '<HEAD>content</HEAD>',
        '<Head>content</Head>',
        '<heAD>content</heAD>',
      ];

      for (const headTag of testCases) {
        const markdown = `---
title: Test
---

# Content

${headTag}

This should fail.
`;

        await expect(
          processMarkdownForDOMCascade(markdown, '/test/case.md')
        ).rejects.toThrow(ValidationError);
      }
    });

    test('should handle edge cases correctly', async () => {
      // Test 1: Head tag split across lines in code block (should be allowed)
      const splitInCodeBlock = `---
title: Split Example
---

\`\`\`html
<head
    class="test">
    <title>Split attributes</title>
</head>
\`\`\`
`;

      const result1 = await processMarkdownForDOMCascade(
        splitInCodeBlock,
        '/test/split.md'
      );
      expect(result1).toBeDefined();

      // Test 2: Head tag in HTML comment (should still reject if outside code block)
      const inComment = `---
title: Comment Test
---

<!-- <head>This is in a comment</head> -->

This should fail because HTML comments are still parsed.
`;

      await expect(
        processMarkdownForDOMCascade(inComment, '/test/comment.md')
      ).rejects.toThrow(ValidationError);

      // Test 3: Escaped head tag outside code block (should be allowed)
      const escaped = `---
title: Escaped Test
---

# Documentation

The \\<head\\> tag when escaped should be fine.

Also \\\`<head>\\\` with escaped backticks should work.
`;

      const result3 = await processMarkdownForDOMCascade(
        escaped,
        '/test/escaped.md'
      );
      expect(result3).toBeDefined();
    });

    test('should handle complex nested code blocks', async () => {
      // Note: Markdown doesn't actually support nested fenced code blocks
      // The inner ``` are treated as literal text, not code block delimiters
      // This test demonstrates showing markdown examples with escaped backticks
      const complexNesting = `---
title: Complex Nesting
---

# Nested Code Examples

Here's how to show HTML in markdown documentation:

\`\`\`markdown
# Documentation

Example HTML (use escaped backticks):

\\\`\\\`\\\`html
<head>
    <title>Nested</title>
</head>
\\\`\\\`\\\`

End of nested example.
\`\`\`

Or use indentation inside the code block:

\`\`\`markdown
Example HTML:

    <head>
        <title>Indented in code block</title>
    </head>
\`\`\`

The above shows markdown containing HTML examples.
`;

      // Should NOT throw - the <head> is inside code blocks
      const result = await processMarkdownForDOMCascade(
        complexNesting,
        '/test/nested.md'
      );
      
      expect(result).toBeDefined();
      expect(result.html).toBeDefined();
      expect(result.frontmatter.title).toBe('Complex Nesting');
    });

    test('should allow <head> in code blocks within lists and blockquotes', async () => {
      const inListsAndQuotes = `---
title: Lists and Quotes
---

# Examples in Lists

1. First item
2. Code example:
   \`\`\`html
   <head>
       <title>In list</title>
   </head>
   \`\`\`
3. Third item

> Blockquote with code:
> 
> \`\`\`html
> <head>
>     <title>In blockquote</title>
> </head>
> \`\`\`
> 
> End quote.

- Bullet with inline: \`<head>\`
- Another bullet
`;

      const result = await processMarkdownForDOMCascade(
        inListsAndQuotes,
        '/test/lists.md'
      );
      
      expect(result).toBeDefined();
      expect(result.html).toBeDefined();
      expect(result.frontmatter.title).toBe('Lists and Quotes');
    });

    test('should process real-world documentation example', async () => {
      // This is based on the actual components.md file that was failing
      const realWorldExample = `---
title: Components - unify Documentation
description: Learn how to create, organize, and use reusable components in unify with DOM Cascade composition patterns and best practices.
---

# Components

Components are reusable HTML fragments that can be imported and composed into pages and layouts.

## Creating Components

### Basic Component Structure

A simple component follows this pattern:

\`\`\`html
<!-- _includes/button.html -->
<!-- Contract documentation -->
<head>
    <style data-unify-docs="v1">
        /* Public areas */
        .unify-label {
            /* Button text content */
        }
    </style>
</head>

<button class="custom-button">
    <span class="unify-label">Click me</span>
</button>
\`\`\`

### Complex Component Example

Here's a more sophisticated card component:

\`\`\`html
<!-- _includes/card.html -->
<head>
    <style data-unify-docs="v1">
        /* Public areas */
        .unify-image {
            /* Card hero image */
        }
        .unify-title {
            /* Card title text */
        }
        .unify-content {
            /* Card body content */
        }
    </style>
</head>

<article class="card">
    <div class="unify-image">
        <!-- Hero image -->
    </div>
    <h3 class="unify-title">Card Title</h3>
    <div class="unify-content">
        <!-- Card content -->
    </div>
</article>
\`\`\`

This demonstrates proper component structure with documentation.
`;

      // Should process without errors
      const result = await processMarkdownForDOMCascade(
        realWorldExample,
        '/test/components.md'
      );
      
      expect(result).toBeDefined();
      expect(result.html).toBeDefined();
      expect(result.frontmatter.title).toBe('Components - unify Documentation');
      expect(result.frontmatter.description).toContain('Learn how to create');
      
      // Verify code blocks are properly converted
      expect(result.html).toContain('&lt;head&gt;');
      expect(result.html).toContain('&lt;/head&gt;');
      expect(result.html).toContain('data-unify-docs');
      expect(result.html).toContain('class="language-html"');
    });
  });
});