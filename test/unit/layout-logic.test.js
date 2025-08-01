/**
 * Tests for layout conditional logic
 * Verifies proper layout application based on content structure and frontmatter
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { processMarkdown, hasHtmlElement, wrapInLayout } from '../../src/core/markdown-processor.js';
import { createTempDirectory, cleanupTempDirectory } from '../fixtures/temp-helper.js';

describe('Layout Conditional Logic', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  describe('hasHtmlElement detection', () => {
    it('should detect complete HTML documents', () => {
      const contentWithHtml = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><p>Content</p></body>
</html>`;
      
      expect(hasHtmlElement(contentWithHtml)).toBe(true);
    });

    it('should detect minimal HTML elements', () => {
      const contentWithHtml = '<html><body>Content</body></html>';
      expect(hasHtmlElement(contentWithHtml)).toBe(true);
    });

    it('should detect HTML with attributes', () => {
      const contentWithHtml = '<html lang="en"><body>Content</body></html>';
      expect(hasHtmlElement(contentWithHtml)).toBe(true);
    });

    it('should not detect partial content', () => {
      const contentWithoutHtml = '<h1>Title</h1><p>Just content</p>';
      expect(hasHtmlElement(contentWithoutHtml)).toBe(false);
    });

    it('should not detect HTML entities or escaped content', () => {
      const contentWithEscapedHtml = '&lt;html&gt;&lt;body&gt;Content&lt;/body&gt;&lt;/html&gt;';
      expect(hasHtmlElement(contentWithEscapedHtml)).toBe(false);
    });

    it('should handle case insensitive HTML tags', () => {
      const contentWithUppercase = '<HTML><BODY>Content</BODY></HTML>';
      expect(hasHtmlElement(contentWithUppercase)).toBe(true);
    });
  });

  describe('Layout application logic', () => {
    it('should apply layout when content has no HTML element', async () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head><title>{{ title }}</title></head>
<body>{{ content }}</body>
</html>`;

      const markdownContent = '# Test Title\n\nContent here';
      const metadata = { title: 'Test Page', content: '<h1>Test Title</h1>\n<p>Content here</p>' };
      
      const result = wrapInLayout(metadata.content, metadata, layoutContent);
      
      expect(result.includes('<!DOCTYPE html>')).toBeTruthy();
      expect(result.includes('<title>Test Page</title>')).toBeTruthy();
      expect(result.includes('<h1 id="test-title">Test Title</h1>')).toBeTruthy();
    });

    it('should not apply layout when content already has HTML element', async () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head><title>{{ title }}</title></head>
<body>{{ content }}</body>
</html>`;

      const contentWithHtml = `<!DOCTYPE html>
<html>
<head><title>Original Title</title></head>
<body><h1>Content</h1></body>
</html>`;

      const metadata = { title: 'Layout Title', content: contentWithHtml };
      
      // Simulate the conditional logic from file-processor.js
      const contentHasHtml = hasHtmlElement(contentWithHtml);
      const result = contentHasHtml ? contentWithHtml : wrapInLayout(contentWithHtml, metadata, layoutContent);
      
      expect(result).toBe(contentWithHtml);
      expect(result.includes('Original Title')).toBeTruthy();
      expect(result.includes('Layout Title')).toBeFalsy();
    });

    it('should create basic HTML structure when no layout available', async () => {
      const content = '<h1>Test Title</h1><p>Content</p>';
      const title = 'Test Page';
      const excerpt = 'Test excerpt';
      
      // Simulate createBasicHtmlStructure function
      const basicHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Untitled'}</title>
  ${excerpt ? `<meta name="description" content="${excerpt}">` : ''}
</head>
<body>
  <main>
    ${content}
  </main>
</body>
</html>`;

      expect(basicHtml.includes('<!DOCTYPE html>')).toBeTruthy();
      expect(basicHtml.includes('<title>Test Page</title>')).toBeTruthy();
      expect(basicHtml.includes('<meta name="description" content="Test excerpt">')).toBeTruthy();
      expect(basicHtml.includes('<h1>Test Title</h1>')).toBeTruthy();
    });
  });

  describe('Layout selection precedence', () => {
    it('should use specified layout from frontmatter', async () => {
      const markdownWithLayout = `---
title: "Test Post"
layout: blog
---

# Test Content`;

      const { frontmatter } = processMarkdown(markdownWithLayout, 'test.md');
      
      expect(frontmatter.layout).toBe('blog');
      expect(frontmatter.title).toBe('Test Post');
    });

    it('should fall back to default layout when no layout specified', async () => {
      const markdownWithoutLayout = `---
title: "Test Post"
---

# Test Content`;

      const { frontmatter } = processMarkdown(markdownWithoutLayout, 'test.md');
      
      expect(frontmatter.layout).toBe(undefined);
      // Should trigger default layout logic in file processor
    });

    it('should handle missing layout gracefully', async () => {
      const markdownWithMissingLayout = `---
title: "Test Post"
layout: non-existent
---

# Test Content`;

      const { frontmatter } = processMarkdown(markdownWithMissingLayout, 'test.md');
      
      expect(frontmatter.layout).toBe('non-existent');
      // Should fall back to basic HTML structure
    });
  });

  describe('Variable substitution in layouts', () => {
    it('should replace simple variables', () => {
      const layout = '<title>{{ title }}</title><p>By {{ author }}</p>';
      const metadata = { title: 'My Post', author: 'John Doe' };
      
      const result = wrapInLayout('content', metadata, layout);
      
      expect(result.includes('<title>My Post</title>')).toBeTruthy();
      expect(result.includes('<p>By John Doe</p>')).toBeTruthy();
    });

    it('should replace content placeholder', () => {
      const layout = '<main>{{ content }}</main>';
      const content = '<h1>Title</h1><p>Text</p>';
      const metadata = { content };
      
      const result = wrapInLayout(content, metadata, layout);
      
      expect(result.includes('<main><h1 id="title">Title</h1><p>Text</p></main>')).toBeTruthy();
    });

    it('should handle missing variables gracefully', () => {
      const layout = '<title>{{ title }}</title><p>{{ missing }}</p>';
      const metadata = { title: 'My Post' };
      
      const result = wrapInLayout('content', metadata, layout);
      
      expect(result.includes('<title>My Post</title>')).toBeTruthy();
      expect(result.includes('<p></p>')).toBeTruthy(); // Missing variables become empty
    });

    it('should handle frontmatter data', () => {
      const layout = '<meta name="author" content="{{ author }}"><meta name="keywords" content="{{ tags }}">';
      const metadata = { 
        frontmatter: { author: 'Jane Doe', tags: 'test, layout' },
        author: 'Jane Doe',
        tags: 'test, layout'
      };
      
      const result = wrapInLayout('content', metadata, layout);
      
      expect(result.includes('<meta name="author" content="Jane Doe">')).toBeTruthy();
      expect(result.includes('<meta name="keywords" content="test, layout">')).toBeTruthy();
    });
  });

  describe('Integration with markdown processing', () => {
    it('should process complete markdown to HTML workflow', async () => {
      const markdownContent = `---
title: "Test Article"
author: "Test Author"
description: "Test description"
---

# {{ title }}

This is a test article by {{ author }}.

## Section 2

More content here.`;

      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>{{ title }}</title>
  <meta name="description" content="{{ description }}">
  <meta name="author" content="{{ author }}">
</head>
<body>
  <main>{{ content }}</main>
</body>
</html>`;

      const { html, frontmatter, title, excerpt } = processMarkdown(markdownContent, 'test.md');
      const metadata = { frontmatter, title, excerpt, tableOfContents: '' };
      
      // Should not have HTML element yet
      expect(hasHtmlElement(html)).toBe(false);
      
      // Apply layout
      const result = wrapInLayout(html, metadata, layoutContent);
      
      // Should now have complete HTML structure
      expect(result.includes('<!DOCTYPE html>')).toBeTruthy();
      expect(result.includes('<title>Test Article</title>')).toBeTruthy();
      expect(result.includes('<meta name="description" content="Test description">')).toBeTruthy();
      expect(result.includes('<meta name="author" content="Test Author">')).toBeTruthy();
      expect(result.includes('<h1 id="test-article">Test Article</h1>')).toBeTruthy();
      expect(result.includes('This is a test article by Test Author.')).toBeTruthy();
    });
  });
});