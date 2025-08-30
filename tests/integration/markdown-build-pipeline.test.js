/**
 * TDD Integration Tests for Markdown Build Pipeline
 * RED PHASE: All tests designed to FAIL until implementation
 * 
 * Tests BuildCommand integration with markdown processing:
 * - Routing .md files through MarkdownProcessor instead of copying
 * - HTML output generation instead of .md file copying
 * - Asset tracking in markdown-generated content
 * - Pretty URL generation for markdown files
 * - End-to-end build pipeline with DOM Cascade
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { BuildCommand } from '../../src/cli/commands/build-command.js';
import { TempProject } from '../helpers/temp-project.js';
import { existsSync, readFileSync } from 'fs';

describe('Markdown Build Pipeline Integration', () => {
  let tempProject;
  let buildCommand;

  beforeEach(async () => {
    tempProject = new TempProject();
    buildCommand = new BuildCommand();
  });

  afterEach(async () => {
    if (tempProject) {
      await tempProject.cleanup();
    }
  });

  describe('Build Pipeline Routing', () => {
    test('should_route_markdown_files_through_markdown_processor', async () => {
      // RED PHASE: This test will FAIL - .md files are currently copied as-is
      
      // Arrange: Create markdown file with frontmatter
      await tempProject.writeFile('page.md', `---
title: Test Page
description: Test description
---

# Page Title

This is markdown content that should be converted to HTML.
      `);

      // Act: Run build command
      const outputDir = tempProject.path('dist');
      await buildCommand.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true
      });

      // Assert: Should generate HTML file, not copy .md file
      const outputHtmlPath = `${outputDir}/page.html`;
      const outputMdPath = `${outputDir}/page.md`;

      expect(existsSync(outputHtmlPath)).toBe(true); // HTML file should exist
      expect(existsSync(outputMdPath)).toBe(false); // .md file should NOT be copied

      // Verify HTML content was generated from markdown
      const htmlContent = readFileSync(outputHtmlPath, 'utf8');
      expect(htmlContent).toContain('<h1 id="page-title">Page Title</h1>'); // Markdown converted
      expect(htmlContent).toContain('<title>Test Page</title>'); // Frontmatter processed
      expect(htmlContent).toContain('name="description" content="Test description"'); // Meta tag generated
      expect(htmlContent).toContain('This is markdown content'); // Content preserved
    });

    test('should_apply_dom_cascade_to_markdown_generated_html', async () => {
      // RED PHASE: This test will FAIL - DOM Cascade not applied to markdown
      
      // Arrange: Create layout and markdown file
      await tempProject.writeFile('_layout.html', `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Layout Title</title>
        </head>
        <body>
          <header>Site Header</header>
          <main class="unify-content"><!-- Content --></main>
          <footer>Site Footer</footer>
        </body>
        </html>
      `);

      await tempProject.writeFile('page.md', `---
layout: _layout.html
title: Page Title
---

# Markdown Heading

This content should be placed in the unify-content area.
      `);

      // Act: Build with DOM Cascade composition
      const outputDir = tempProject.path('dist');
      await buildCommand.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true
      });

      // Assert: DOM Cascade applied to markdown-generated HTML
      const htmlContent = readFileSync(`${outputDir}/page.html`, 'utf8');

      // Layout structure should be present
      expect(htmlContent).toContain('<header>Site Header</header>');
      expect(htmlContent).toContain('<footer>Site Footer</footer>');

      // Page content should be in layout
      expect(htmlContent).toContain('<title>Page Title</title>'); // Page wins precedence
      expect(htmlContent).toContain('<h1 id="markdown-heading">Markdown Heading</h1>'); // Markdown processed
      expect(htmlContent).toContain('This content should be placed'); // Content placed

      // Area matching should have occurred - content placed in main with unify-content class
      expect(htmlContent).toContain('class="unify-content"'); // Content wrapper has the class
      expect(htmlContent).not.toContain('<!-- Content -->'); // Placeholder removed
    });

    test('should_generate_html_output_instead_of_copying_md_files', async () => {
      // RED PHASE: This test will FAIL - currently copies .md files directly
      
      // Arrange: Create multiple markdown files
      await tempProject.writeFile('index.md', `---
title: Home Page
---

# Welcome

This is the home page.
      `);

      await tempProject.writeFile('about.md', `---
title: About Us
---

# About

This is the about page.
      `);

      await tempProject.writeFile('blog/post.md', `---
title: Blog Post
---

# Blog Post

This is a blog post.
      `);

      // Act: Build all markdown files
      const outputDir = tempProject.path('dist');
      await buildCommand.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true
      });

      // Assert: All .md files converted to .html
      expect(existsSync(`${outputDir}/index.html`)).toBe(true);
      expect(existsSync(`${outputDir}/about.html`)).toBe(true);
      expect(existsSync(`${outputDir}/blog/post.html`)).toBe(true);

      // No .md files should be copied
      expect(existsSync(`${outputDir}/index.md`)).toBe(false);
      expect(existsSync(`${outputDir}/about.md`)).toBe(false);
      expect(existsSync(`${outputDir}/blog/post.md`)).toBe(false);

      // Verify HTML content generated
      const indexHtml = readFileSync(`${outputDir}/index.html`, 'utf8');
      const aboutHtml = readFileSync(`${outputDir}/about.html`, 'utf8');
      const postHtml = readFileSync(`${outputDir}/blog/post.html`, 'utf8');

      expect(indexHtml).toContain('<h1 id="welcome">Welcome</h1>');
      expect(aboutHtml).toContain('<h1 id="about">About</h1>');
      expect(postHtml).toContain('<h1 id="blog-post">Blog Post</h1>');
    });

    test('should_track_assets_in_markdown_generated_content', async () => {
      // RED PHASE: This test will FAIL - asset tracking not integrated with markdown
      
      // Arrange: Create markdown with asset references
      await tempProject.writeFile('assets/image.jpg', 'fake-image-content');
      await tempProject.writeFile('assets/style.css', 'body { color: blue; }');

      await tempProject.writeFile('page.md', `---
title: Page with Assets
---

# Page with Assets

This page references assets:

![Image](assets/image.jpg)

<link rel="stylesheet" href="assets/style.css">
      `);

      // Act: Build with asset tracking
      const outputDir = tempProject.path('dist');
      await buildCommand.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true
      });

      // Assert: Assets should be copied and references updated
      expect(existsSync(`${outputDir}/assets/image.jpg`)).toBe(true);
      expect(existsSync(`${outputDir}/assets/style.css`)).toBe(true);

      const htmlContent = readFileSync(`${outputDir}/page.html`, 'utf8');
      expect(htmlContent).toContain('<img src="assets/image.jpg"'); // Image reference preserved
      expect(htmlContent).toContain('href="assets/style.css"'); // CSS reference preserved
    });

    test('should_generate_pretty_urls_for_markdown_files', async () => {
      // RED PHASE: This test will FAIL - pretty URLs not implemented for markdown
      
      // Arrange: Create markdown files
      await tempProject.writeFile('about.md', `---
title: About
---

# About Us
      `);

      await tempProject.writeFile('blog/first-post.md', `---
title: First Post
---

# First Post
      `);

      // Act: Build with pretty URLs enabled
      const outputDir = tempProject.path('dist');
      await buildCommand.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true,
        prettyUrls: true
      });

      // Assert: Pretty URLs generated for markdown files
      expect(existsSync(`${outputDir}/about/index.html`)).toBe(true); // about.md -> about/index.html
      expect(existsSync(`${outputDir}/blog/first-post/index.html`)).toBe(true); // first-post.md -> first-post/index.html

      // Original structure should not exist
      expect(existsSync(`${outputDir}/about.html`)).toBe(false);
      expect(existsSync(`${outputDir}/blog/first-post.html`)).toBe(false);

      // Special case: index.md should remain index.html
      await tempProject.writeFile('index.md', `---
title: Home
---

# Home
      `);

      await buildCommand.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true,
        prettyUrls: true
      });

      expect(existsSync(`${outputDir}/index.html`)).toBe(true); // index.md -> index.html (not index/index.html)
    });
  });

  describe('Build Command Integration', () => {
    test('should_process_markdown_files_through_build_command', async () => {
      // Test that BuildCommand can process markdown files
      
      // Arrange: Create a simple markdown file
      await tempProject.writeFile('test.md', `---
title: Test
---

# Test Content
      `);

      // Act: Process through BuildCommand
      const buildCmd = new BuildCommand();
      const outputDir = tempProject.path('dist');
      await buildCmd.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true
      });

      // Assert: Markdown was processed to HTML
      expect(existsSync(`${outputDir}/test.html`)).toBe(true);
      const content = readFileSync(`${outputDir}/test.html`, 'utf8');
      expect(content).toContain('<h1 id="test-content">Test Content</h1>');
    });

    test('should_process_mixed_html_and_markdown_files', async () => {
      // Test processing both HTML and markdown files in same build
      
      // Arrange: Create both HTML and markdown files with different names
      await tempProject.writeFile('htmlpage.html', `
        <!DOCTYPE html>
        <html>
        <head><title>HTML Page</title></head>
        <body><h1>HTML Content</h1></body>
        </html>
      `);

      await tempProject.writeFile('mdpage.md', `---
title: Markdown Page
---

# Markdown Content
      `);

      // Act: Build both types
      const outputDir = tempProject.path('dist');
      await buildCommand.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true
      });

      // Assert: Both processed correctly
      const htmlContent = readFileSync(`${outputDir}/htmlpage.html`, 'utf8');
      const mdContent = readFileSync(`${outputDir}/mdpage.html`, 'utf8'); // .md becomes .html

      expect(htmlContent).toContain('<h1>HTML Content</h1>');
      expect(mdContent).toContain('<h1 id="markdown-content">Markdown Content</h1>');
      expect(mdContent).toContain('<title>Markdown Page</title>');
    });

    test('should_maintain_build_performance_with_markdown_processing', async () => {
      // RED PHASE: This test will FAIL - performance benchmarking not established
      
      // Arrange: Create multiple files for performance testing
      const fileCount = 20;
      for (let i = 0; i < fileCount; i++) {
        await tempProject.writeFile(`page${i}.md`, `---
title: Page ${i}
description: Description for page ${i}
---

# Page ${i}

This is content for page ${i}.
        `);
      }

      // Act: Measure build performance
      const startTime = Date.now();
      const outputDir = tempProject.path('dist');
      await buildCommand.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true
      });
      const endTime = Date.now();
      const buildTime = endTime - startTime;

      // Assert: Build should complete within reasonable time
      // Benchmark: Should process 20 markdown files in under 1 second
      expect(buildTime).toBeLessThan(1000);

      // Verify all files processed correctly
      for (let i = 0; i < fileCount; i++) {
        expect(existsSync(`${outputDir}/page${i}.html`)).toBe(true);
        expect(existsSync(`${outputDir}/page${i}.md`)).toBe(false);
      }
    });

    test('should_handle_build_errors_in_markdown_processing_gracefully', async () => {
      // RED PHASE: This test will FAIL - error handling not implemented
      
      // Arrange: Create markdown with invalid layout reference
      await tempProject.writeFile('invalid-page.md', `---
layout: non-existent-layout.html
title: Invalid Page
---

# Invalid Page
      `);

      await tempProject.writeFile('valid-page.md', `---
title: Valid Page
---

# Valid Page
      `);

      // Act & Assert: Should handle errors without stopping entire build
      const outputDir = tempProject.path('dist');
      
      // Build should complete but report errors
      const result = await buildCommand.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true
      });
      
      // Build should fail due to missing layout
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/layout.*not.*found|missing.*layout/i);

      // Valid page should still be processed
      expect(existsSync(`${outputDir}/valid-page.html`)).toBe(true);
      
      const validContent = readFileSync(`${outputDir}/valid-page.html`, 'utf8');
      expect(validContent).toContain('<h1 id="valid-page">Valid Page</h1>');
    });
  });

  describe('File System Integration', () => {
    test('should_respect_file_classification_for_markdown_files', async () => {
      // RED PHASE: This test will FAIL - FileClassifier integration not implemented
      
      // Arrange: Create various file types
      await tempProject.writeFile('_partial.md', `# Partial Markdown`);
      await tempProject.writeFile('_layout.html', `<html><body class="unify-content">Layout</body></html>`);
      await tempProject.writeFile('page.md', `---
title: Page
---

# Page
      `);
      await tempProject.writeFile('regular.html', `<html><body>Regular HTML</body></html>`);

      // Act: Build with file classification
      const outputDir = tempProject.path('dist');
      await buildCommand.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true
      });

      // Assert: File classification respected
      expect(existsSync(`${outputDir}/page.html`)).toBe(true); // Page processed
      expect(existsSync(`${outputDir}/regular.html`)).toBe(true); // HTML copied
      expect(existsSync(`${outputDir}/_partial.html`)).toBe(false); // Partial not emitted
      expect(existsSync(`${outputDir}/_layout.html`)).toBe(false); // Layout not emitted
      expect(existsSync(`${outputDir}/_partial.md`)).toBe(false); // Partial markdown not copied
    });

    test('should_create_output_directory_structure_for_markdown_files', async () => {
      // RED PHASE: This test will FAIL - directory structure handling not implemented
      
      // Arrange: Create nested markdown structure
      await tempProject.writeFile('docs/guide/getting-started.md', `---
title: Getting Started
---

# Getting Started Guide
      `);

      await tempProject.writeFile('blog/2023/first-post.md', `---
title: First Post
date: 2023-01-01
---

# My First Post
      `);

      // Act: Build with nested structure
      const outputDir = tempProject.path('dist');
      await buildCommand.execute({
        source: tempProject.path(),
        output: outputDir,
        clean: true
      });

      // Assert: Directory structure preserved
      expect(existsSync(`${outputDir}/docs/guide/getting-started.html`)).toBe(true);
      expect(existsSync(`${outputDir}/blog/2023/first-post.html`)).toBe(true);

      // Verify content processed correctly
      const guideContent = readFileSync(`${outputDir}/docs/guide/getting-started.html`, 'utf8');
      const postContent = readFileSync(`${outputDir}/blog/2023/first-post.html`, 'utf8');

      expect(guideContent).toContain('<h1 id="getting-started-guide">Getting Started Guide</h1>');
      expect(postContent).toContain('<h1 id="my-first-post">My First Post</h1>');
      expect(postContent).toContain('<title>First Post</title>');
    });
  });
});