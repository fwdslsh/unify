/**
 * Unit tests for markdown processor - US-008 Implementation
 * Following TDD methodology: RED-GREEN-REFACTOR
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'unify-markdown-test-'));
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe('Markdown Processor - TDD Implementation', () => {
  
  describe('isMarkdownFile - File Type Detection', () => {
    test('should_return_true_when_file_has_md_extension', async () => {
      const { isMarkdownFile } = await import('../../../src/core/markdown-processor.js');
      
      expect(isMarkdownFile('test.md')).toBe(true);
      expect(isMarkdownFile('/path/to/file.md')).toBe(true);
      expect(isMarkdownFile('complex-name.with-dashes.md')).toBe(true);
    });

    test('should_return_false_when_file_has_non_md_extension', async () => {
      const { isMarkdownFile } = await import('../../../src/core/markdown-processor.js');
      
      expect(isMarkdownFile('test.html')).toBe(false);
      expect(isMarkdownFile('test.txt')).toBe(false);
      expect(isMarkdownFile('test.js')).toBe(false);
      expect(isMarkdownFile('test')).toBe(false);
    });

    test('should_handle_case_insensitive_extensions', async () => {
      const { isMarkdownFile } = await import('../../../src/core/markdown-processor.js');
      
      expect(isMarkdownFile('test.MD')).toBe(true);
      expect(isMarkdownFile('test.Md')).toBe(true);
      expect(isMarkdownFile('test.mD')).toBe(true);
    });

    test('should_handle_edge_cases', async () => {
      const { isMarkdownFile } = await import('../../../src/core/markdown-processor.js');
      
      expect(isMarkdownFile('')).toBe(false);
      expect(isMarkdownFile('.md')).toBe(true);
      expect(isMarkdownFile('test.md.backup')).toBe(false);
    });
  });

  describe('processMarkdown - Core Processing', () => {
    test('should_convert_simple_markdown_to_html', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `# Test Title

This is a **bold** test with *italic* text.

- List item 1
- List item 2

[Link](https://example.com)`;

      const result = await processMarkdown(markdownContent, join(tempDir, 'test.md'));
      
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('Test Title');
      expect(result.html).toContain('<strong>bold</strong>');
      expect(result.html).toContain('<em>italic</em>');
      expect(result.html).toContain('<ul>');
      expect(result.html).toContain('<li>List item 1</li>');
      expect(result.html).toContain('<a href="https://example.com">Link</a>');
    });

    test('should_extract_yaml_frontmatter', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `---
title: "Test Post"
description: "A test description"
author: "Test Author"
tags:
  - tag1
  - tag2
---

# Content

This is the content.`;

      const result = await processMarkdown(markdownContent, join(tempDir, 'test.md'));
      
      expect(result.frontmatter.title).toBe('Test Post');
      expect(result.frontmatter.description).toBe('A test description');
      expect(result.frontmatter.author).toBe('Test Author');
      expect(result.frontmatter.tags).toEqual(['tag1', 'tag2']);
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('Content');
    });

    test('should_handle_empty_frontmatter', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `---
---

# Content Only

Just content here.`;

      const result = await processMarkdown(markdownContent, join(tempDir, 'test.md'));
      
      expect(result.frontmatter).toEqual({});
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('Content Only');
    });

    test('should_handle_no_frontmatter', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `# Content Only

Just content here.`;

      const result = await processMarkdown(markdownContent, join(tempDir, 'test.md'));
      
      expect(result.frontmatter).toEqual({});
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('Content Only');
    });

    test('should_generate_anchor_links_for_headings', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `# Main Title

## Section One

### Subsection with Special Characters!`;

      const result = await processMarkdown(markdownContent, join(tempDir, 'test.md'));
      
      expect(result.html).toContain('id="main-title"');
      expect(result.html).toContain('id="section-one"');
      expect(result.html).toContain('id="subsection-with-special-characters"');
    });

    test('should_extract_title_from_frontmatter_or_first_heading', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      // Test frontmatter title
      const withFrontmatterTitle = `---
title: "Frontmatter Title"
---

# Heading Title`;

      const result1 = await processMarkdown(withFrontmatterTitle, join(tempDir, 'test1.md'));
      expect(result1.title).toBe('Frontmatter Title');

      // Test extracted title from heading
      const withoutFrontmatterTitle = `# Extracted Title

Content here.`;

      const result2 = await processMarkdown(withoutFrontmatterTitle, join(tempDir, 'test2.md'));
      expect(result2.title).toBe('Extracted Title');
    });

    test('should_extract_excerpt_from_frontmatter_or_first_paragraph', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      // Test frontmatter excerpt
      const withFrontmatterExcerpt = `---
excerpt: "Custom excerpt"
---

# Title

First paragraph.`;

      const result1 = await processMarkdown(withFrontmatterExcerpt, join(tempDir, 'test1.md'));
      expect(result1.excerpt).toBe('Custom excerpt');

      // Test extracted excerpt from first paragraph
      const withoutFrontmatterExcerpt = `# Title

This is the first paragraph for excerpt.

Second paragraph.`;

      const result2 = await processMarkdown(withoutFrontmatterExcerpt, join(tempDir, 'test2.md'));
      expect(result2.excerpt).toBe('This is the first paragraph for excerpt.');
    });
  });

  describe('synthesizeHeadFromFrontmatter - Head Generation', () => {
    test('should_generate_basic_meta_tags', async () => {
      const { synthesizeHeadFromFrontmatter } = await import('../../../src/core/markdown-processor.js');
      
      const frontmatter = {
        title: 'Test Title',
        description: 'Test description',
        author: 'Test Author'
      };

      const headHtml = synthesizeHeadFromFrontmatter(frontmatter);
      
      expect(headHtml).toContain('<title>Test Title</title>');
      expect(headHtml).toContain('<meta name="description" content="Test description">');
      expect(headHtml).toContain('<meta name="author" content="Test Author">');
    });

    test('should_generate_open_graph_tags', async () => {
      const { synthesizeHeadFromFrontmatter } = await import('../../../src/core/markdown-processor.js');
      
      const frontmatter = {
        title: 'OG Title',
        description: 'OG Description'
      };

      const headHtml = synthesizeHeadFromFrontmatter(frontmatter);
      
      expect(headHtml).toContain('<meta property="og:title" content="OG Title">');
      expect(headHtml).toContain('<meta property="og:description" content="OG Description">');
    });

    test('should_handle_custom_head_elements', async () => {
      const { synthesizeHeadFromFrontmatter } = await import('../../../src/core/markdown-processor.js');
      
      const frontmatter = {
        title: 'Test',
        head: [
          { name: 'keywords', content: 'test, keywords' },
          { property: 'og:type', content: 'article' },
          { rel: 'canonical', href: 'https://example.com/test' }
        ]
      };

      const headHtml = synthesizeHeadFromFrontmatter(frontmatter);
      
      expect(headHtml).toContain('<meta name="keywords" content="test, keywords">');
      expect(headHtml).toContain('<meta property="og:type" content="article">');
      expect(headHtml).toContain('<meta rel="canonical" href="https://example.com/test">');
    });

    test('should_handle_json_ld_structured_data', async () => {
      const { synthesizeHeadFromFrontmatter } = await import('../../../src/core/markdown-processor.js');
      
      const frontmatter = {
        title: 'Test',
        schema: {
          '@context': 'https://schema.org',
          '@type': 'Article',
          'headline': 'Test Article'
        }
      };

      const headHtml = synthesizeHeadFromFrontmatter(frontmatter);
      
      expect(headHtml).toContain('<script type="application/ld+json">');
      expect(headHtml).toContain('"@context":"https://schema.org"');
      expect(headHtml).toContain('"@type":"Article"');
    });

    test('should_handle_malformed_json_ld_gracefully', async () => {
      const { synthesizeHeadFromFrontmatter } = await import('../../../src/core/markdown-processor.js');
      
      // Create circular reference to trigger JSON.stringify error
      const circularSchema = { test: 'value' };
      circularSchema.circular = circularSchema;
      
      const frontmatter = {
        title: 'Test',
        schema: circularSchema
      };

      const headHtml = synthesizeHeadFromFrontmatter(frontmatter);
      
      // Should contain title but no JSON-LD script
      expect(headHtml).toContain('<title>Test</title>');
      expect(headHtml).not.toContain('<script type="application/ld+json">');
    });

    test('should_handle_empty_frontmatter', async () => {
      const { synthesizeHeadFromFrontmatter } = await import('../../../src/core/markdown-processor.js');
      
      const headHtml = synthesizeHeadFromFrontmatter({});
      
      expect(headHtml).toBe('');
    });
  });

  describe('generatePrettyUrl - URL Generation', () => {
    test('should_convert_md_files_to_pretty_urls', async () => {
      const { generatePrettyUrl } = await import('../../../src/core/markdown-processor.js');
      
      expect(generatePrettyUrl('about.md')).toBe('about/index.html');
      expect(generatePrettyUrl('blog/post.md')).toBe('blog/post/index.html');
      expect(generatePrettyUrl('/path/to/file.md')).toBe('/path/to/file/index.html');
    });

    test('should_handle_index_files_specially', async () => {
      const { generatePrettyUrl } = await import('../../../src/core/markdown-processor.js');
      
      expect(generatePrettyUrl('index.md')).toBe('index.html');
      expect(generatePrettyUrl('blog/index.md')).toBe('blog/index.html');
    });

    test('should_preserve_non_md_files', async () => {
      const { generatePrettyUrl } = await import('../../../src/core/markdown-processor.js');
      
      expect(generatePrettyUrl('about.html')).toBe('about.html');
      expect(generatePrettyUrl('script.js')).toBe('script.js');
    });

    test('should_handle_edge_cases', async () => {
      const { generatePrettyUrl } = await import('../../../src/core/markdown-processor.js');
      
      expect(generatePrettyUrl('.md')).toBe('/index.html');
      expect(generatePrettyUrl('')).toBe('');
    });
  });

  describe('Validation and Security', () => {
    test('should_error_on_html_files_with_frontmatter', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const htmlContent = `---
title: "Invalid"
---
<h1>HTML content</h1>`;

      await expect(processMarkdown(htmlContent, join(tempDir, 'test.html')))
        .rejects.toThrow('Frontmatter is not allowed in HTML files');
    });

    test('should_error_on_markdown_with_head_tag_in_body', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `---
title: "Test"
---

# My Post

<head>
  <title>This should error</title>
</head>

Content here.`;

      await expect(processMarkdown(markdownContent, join(tempDir, 'test.md')))
        .rejects.toThrow('Markdown body must not contain <head> tag');
    });

    test('should_prevent_path_traversal_in_layout_paths', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `---
layout: "../../../etc/passwd"
title: "Path Traversal Test"
---

# Test Content`;

      await expect(processMarkdown(markdownContent, join(tempDir, 'test.md')))
        .rejects.toThrow('Invalid layout path');
    });

    test('should_handle_circular_dependencies', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      // Create circular dependency by having the same file include itself
      const markdownContent = `---
title: "Test"
---

# Test

<!--#include virtual="test.md" -->`;

      await expect(processMarkdown(markdownContent, join(tempDir, 'test.md')))
        .rejects.toThrow('Circular dependency detected');
    });

    test('should_respect_max_depth_limits', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      // Test with depth limit of 2
      const options = { maxDepth: 2 };
      
      // Create deep nesting that exceeds limit
      await writeFile(join(tempDir, 'level1.md'), '<!--#include virtual="level2.md" -->');
      await writeFile(join(tempDir, 'level2.md'), '<!--#include virtual="level3.md" -->');
      await writeFile(join(tempDir, 'level3.md'), '<!--#include virtual="level4.md" -->');
      await writeFile(join(tempDir, 'level4.md'), '# Deep content');
      
      await expect(processMarkdown('<!--#include virtual="level1.md" -->', join(tempDir, 'test.md'), options))
        .rejects.toThrow('Maximum include depth exceeded');
    });
  });

  describe('Layout Integration', () => {
    test('should_apply_layout_from_frontmatter', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      // Create layout file
      const layoutContent = `<html>
<head><title>Layout Title</title></head>
<body><slot></slot></body>
</html>`;
      await writeFile(join(tempDir, 'layout.html'), layoutContent);
      
      const markdownContent = `---
layout: "layout.html"
title: "Page Title"
---

# Content

Test content.`;

      const result = await processMarkdown(markdownContent, join(tempDir, 'test.md'));
      
      expect(result.html).toContain('<html>');
      expect(result.html).toContain('<title>Page Title</title>'); // Should use page title
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('Content');
    });

    test('should_handle_missing_layout_gracefully', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `---
layout: "nonexistent.html"
title: "Test"
---

# Content`;

      await expect(processMarkdown(markdownContent, join(tempDir, 'test.md')))
        .rejects.toThrow('Layout not found');
    });

    test('should_use_default_layout_when_none_specified', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `---
title: "Test"
---

# Content

Test content.`;

      const result = await processMarkdown(markdownContent, join(tempDir, 'test.md'));
      
      expect(result.html).toContain('<!DOCTYPE html>');
      expect(result.html).toContain('<html');
      expect(result.html).toContain('<head>');
      expect(result.html).toContain('<body>');
      expect(result.html).toContain('<title>Test</title>');
    });
  });

  describe('Include Processing', () => {
    test('should_process_virtual_includes', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      // Create include file
      await writeFile(join(tempDir, 'note.md'), '> **Note**: This is included content.');
      
      const markdownContent = `# Main Content

<!--#include virtual="note.md" -->

More content after include.`;

      const result = await processMarkdown(markdownContent, join(tempDir, 'test.md'));
      
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('Main Content');
      expect(result.html).toContain('<blockquote>');
      expect(result.html).toContain('<strong>Note</strong>');
      expect(result.html).toContain('More content after include');
    });

    test('should_handle_missing_includes_gracefully', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `# Main Content

<!--#include virtual="nonexistent.md" -->

More content.`;

      const result = await processMarkdown(markdownContent, join(tempDir, 'test.md'));
      
      // Should process successfully, leaving include directive as-is
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('Main Content');
      expect(result.html).toContain('<!--#include virtual="nonexistent.md" -->');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should_handle_malformed_yaml_frontmatter', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `---
title: "Test
description: invalid yaml [
---

# Content`;

      await expect(processMarkdown(markdownContent, join(tempDir, 'test.md')))
        .rejects.toThrow(); // Should throw YAML parsing error
    });

    test('should_handle_large_files', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      // Create large markdown content (but not too large for test performance)
      const largeContent = '# Large File\n\n' + 'Content line.\n'.repeat(1000);
      
      const result = await processMarkdown(largeContent, join(tempDir, 'large.md'));
      
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('Large File');
      expect(result.html.split('Content line').length).toBeGreaterThan(1000);
    });

    test('should_handle_special_characters_in_content', async () => {
      const { processMarkdown } = await import('../../../src/core/markdown-processor.js');
      
      const markdownContent = `# Title with 特殊字符 and émojis 🚀

Content with "quotes" and <special> characters & ampersands.

- Unicode: αβγδε
- Math: x² + y² = z²`;

      const result = await processMarkdown(markdownContent, join(tempDir, 'test.md'));
      
      expect(result.html).toContain('特殊字符');
      expect(result.html).toContain('🚀');
      expect(result.html).toContain('quotes'); // Contains the word quotes with smart quotes
      expect(result.html).toContain('&amp;'); // Should be properly escaped
      expect(result.html).toContain('αβγδε');
    });
  });
});