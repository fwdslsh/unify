/**
 * Integration test for US-008: Markdown Processing with Frontmatter
 * Tests the complete workflow from markdown processing to final output
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, writeFile, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { processMarkdown } from '../../src/core/markdown-processor.js';

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'unify-integration-test-'));
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe('Markdown Processing Integration (US-008)', () => {
  test('should_process_complete_markdown_workflow_with_layout', async () => {
    // Create a layout file
    const layoutContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Layout Title</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header>
    <h1>My Site</h1>
  </header>
  <main>
    <slot></slot>
  </main>
  <footer>
    <p>&copy; 2024 My Site</p>
  </footer>
</body>
</html>`;

    await writeFile(join(tempDir, 'layout.html'), layoutContent);

    // Create a markdown file with comprehensive frontmatter
    const markdownContent = `---
title: "Complete Integration Test"
description: "Testing the full markdown processing workflow"
author: "Test Author"
layout: "layout.html"
head:
  - name: "keywords"
    content: "markdown, test, integration"
  - property: "og:type"
    content: "article"
schema:
  "@context": "https://schema.org"
  "@type": "Article"
  "headline": "Complete Integration Test"
  "author": "Test Author"
---

# Welcome to Integration Testing

This is a **comprehensive test** of the markdown processing system.

## Features Tested

- YAML frontmatter extraction
- Markdown to HTML conversion
- Layout application
- Head element synthesis
- Security validation

### Code Example

\`\`\`javascript
console.log('Hello, World!');
\`\`\`

## Links and Lists

Visit [our website](https://example.com) for more information.

- Feature 1
- Feature 2
- Feature 3

> **Note**: This blockquote tests markdown formatting.

---

*Thank you for reading!*`;

    const result = await processMarkdown(markdownContent, join(tempDir, 'test.md'));

    // Verify complete HTML structure
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('<html lang="en">');
    
    // Verify title was replaced from frontmatter
    expect(result.html).toContain('<title>Complete Integration Test</title>');
    
    // Verify head elements were synthesized
    expect(result.html).toContain('<meta name="description" content="Testing the full markdown processing workflow">');
    expect(result.html).toContain('<meta name="author" content="Test Author">');
    expect(result.html).toContain('<meta name="keywords" content="markdown, test, integration">');
    expect(result.html).toContain('<meta property="og:type" content="article">');
    
    // Verify JSON-LD schema
    expect(result.html).toContain('<script type="application/ld+json">');
    expect(result.html).toContain('"@context":"https://schema.org"');
    expect(result.html).toContain('"@type":"Article"');
    
    // Verify layout structure
    expect(result.html).toContain('<header>');
    expect(result.html).toContain('<h1>My Site</h1>');
    expect(result.html).toContain('<footer>');
    expect(result.html).toContain('&copy; 2024 My Site');
    
    // Verify markdown content was processed
    expect(result.html).toContain('<h1 id="welcome-to-integration-testing">Welcome to Integration Testing</h1>');
    expect(result.html).toContain('<strong>comprehensive test</strong>');
    expect(result.html).toContain('<h2 id="features-tested">Features Tested</h2>');
    expect(result.html).toContain('<ul>');
    expect(result.html).toContain('<li>Feature 1</li>');
    expect(result.html).toContain('<blockquote>');
    expect(result.html).toContain('<a href="https://example.com">our website</a>');
    expect(result.html).toContain('<pre><code class="language-javascript">console.log');
    
    // Verify metadata was extracted correctly
    expect(result.title).toBe('Complete Integration Test');
    expect(result.excerpt).toBe('Testing the full markdown processing workflow');
    expect(result.frontmatter.author).toBe('Test Author');
    
    // Verify head HTML was synthesized
    expect(result.headHtml).toContain('<title>Complete Integration Test</title>');
    expect(result.headHtml).toContain('<script type="application/ld+json">');
  });

  test('should_handle_markdown_with_includes', async () => {
    // Create an include file
    const includeContent = `## Included Section

This content was included from another file.

- Included item 1
- Included item 2`;

    await writeFile(join(tempDir, 'include.md'), includeContent);

    // Create main markdown file
    const mainContent = `---
title: "Main Document"
---

# Main Document

Content before include.

<!--#include virtual="include.md" -->

Content after include.`;

    const result = await processMarkdown(mainContent, join(tempDir, 'main.md'));

    // Verify include was processed
    expect(result.html).toContain('<h1 id="main-document">Main Document</h1>');
    expect(result.html).toContain('<h2 id="included-section">Included Section</h2>');
    expect(result.html).toContain('This content was included from another file');
    expect(result.html).toContain('<li>Included item 1</li>');
    expect(result.html).toContain('Content before include');
    expect(result.html).toContain('Content after include');
  });

  test('should_generate_pretty_urls_correctly', async () => {
    const { generatePrettyUrl } = await import('../../src/core/markdown-processor.js');

    // Test various markdown file patterns
    expect(generatePrettyUrl('about.md')).toBe('about/index.html');
    expect(generatePrettyUrl('blog/post.md')).toBe('blog/post/index.html');
    expect(generatePrettyUrl('index.md')).toBe('index.html');
    expect(generatePrettyUrl('blog/index.md')).toBe('blog/index.html');
    
    // Test non-markdown files remain unchanged
    expect(generatePrettyUrl('style.css')).toBe('style.css');
    expect(generatePrettyUrl('script.js')).toBe('script.js');
  });

  test('should_provide_complete_api_surface', async () => {
    // Verify all required functions are exported
    const markdownProcessor = await import('../../src/core/markdown-processor.js');
    
    expect(typeof markdownProcessor.isMarkdownFile).toBe('function');
    expect(typeof markdownProcessor.processMarkdown).toBe('function');
    expect(typeof markdownProcessor.synthesizeHeadFromFrontmatter).toBe('function');
    expect(typeof markdownProcessor.generatePrettyUrl).toBe('function');
  });

  test('should_meet_performance_requirements', async () => {
    // Create a moderately large markdown file
    const largeContent = `---
title: "Performance Test"
description: "Testing processing speed"
---

# Performance Test

${'## Section\n\nContent paragraph with some **bold** and *italic* text.\n\n'.repeat(100)}

## Conclusion

This tests processing of larger content.`;

    const startTime = performance.now();
    const result = await processMarkdown(largeContent, join(tempDir, 'large.md'));
    const endTime = performance.now();
    
    const processingTime = endTime - startTime;
    
    // Should process within reasonable time (<100ms for this size)
    expect(processingTime).toBeLessThan(100);
    
    // Verify content was processed correctly
    expect(result.html).toContain('<h1 id="performance-test">Performance Test</h1>');
    expect(result.html).toContain('<h2 id="conclusion">Conclusion</h2>');
    expect(result.title).toBe('Performance Test');
  });
});