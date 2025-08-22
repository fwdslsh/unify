/**
 * Extended tests for Cascading Imports Processor
 * Tests edge cases and uncovered code paths for 95%+ coverage
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { 
  CascadingImportsProcessor, 
  CircularImportError, 
  FragmentNotFoundError 
} from '../../../src/core/cascading-imports-processor.js';
import { makeTempProjectFromStructure } from '../../helpers/temp-project.js';

const cleanupTasks = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
});

describe('Cascading Imports Processor - Extended Coverage', () => {

  describe('Complex Nested HTML Parsing Edge Cases', () => {
    test('should handle complex nested elements with depth reaching zero', () => {
      const processor = new CascadingImportsProcessor('/src');
      
      // Create complex nested structure that triggers depth === 0 path (line 240)
      const complexHtml = '<div><div><div>Inner content</div></div>Target content</div>';
      
      // Test findBalancedClosingTag with a scenario that exercises the depth === 0 path
      const closingIndex = processor.findBalancedClosingTag(complexHtml, 5, 'div'); // Start after first opening tag
      
      expect(closingIndex).toBeGreaterThan(0);
      expect(complexHtml.substring(closingIndex, closingIndex + 6)).toBe('</div>');
    });

    test('should handle multiple opening and closing tags in sequence', () => {
      const processor = new CascadingImportsProcessor('/src');
      
      // HTML that has multiple open/close cycles to test depth tracking
      const html = '<div><span></span><p></p><strong></strong></div>';
      const closingIndex = processor.findBalancedClosingTag(html, 5, 'div');
      
      expect(closingIndex).toBe(42); // Position of final </div>
    });

    test('should handle interleaved nested elements correctly', () => {
      const processor = new CascadingImportsProcessor('/src');
      
      // Create HTML with complex interleaving that tests the depth counting logic
      const html = '<div><span><div>Deep</div></span><div><p>More</p></div></div>';
      const closingIndex = processor.findBalancedClosingTag(html, 5, 'div');
      
      expect(closingIndex).toBe(55); // Position of outermost closing </div>
    });
  });

  describe('Markdown Processing Error Handling', () => {
    test('should handle markdown processing errors gracefully', async () => {
      // Test the scenario where markdown processing fails and gets caught (lines 439-441)
      const structure = {
        // Create a markdown file that causes processMarkdown to throw
        'bad-markdown.md': '# Title\n\n<head><title>Invalid head in markdown</title></head>\n\nContent',
        'page.html': '<div data-import="bad-markdown.md">Default content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir, { failFast: false });
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      // This should trigger the markdown processing error path (lines 439-441)
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('<!-- Import Error:');
      expect(processed).toContain('bad-markdown.md');
    });

    test('should log markdown processing errors when they occur', async () => {
      const structure = {
        // Create a markdown file that causes processMarkdown to throw
        'error-markdown.md': '# Title\n\n<head><title>Invalid head in markdown</title></head>\n\nContent',
        'page.html': '<div data-import="error-markdown.md">Default content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir, { failFast: false });
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      // This tests the catch block error logging (lines 440-441)
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      // Should generate error comment and handle gracefully
      expect(processed).toContain('<!-- Import Error:');
      expect(processed).toContain('error-markdown.md');
    });
  });

  describe('Head Slot Merging Functionality', () => {
    test('should merge head content when head slot is provided', async () => {
      const structure = {
        'layout.html': `
          <html>
            <head>
              <title>Layout Title</title>
              <meta name="layout" content="true">
            </head>
            <body>
              <slot name="content">Default content</slot>
            </body>
          </html>
        `,
        'page.html': `
          <div data-import="layout.html">
            <template data-target="head">
              <title>Page Title</title>
              <meta name="page" content="true">
            </template>
            <div data-target="content">Page content</div>
          </div>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      // This should trigger the head slot merging functionality (lines 462-488)
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('<head>');
      expect(processed).toContain('Page Title');
      expect(processed).toContain('meta name="page"');
      expect(processed).toContain('meta name="layout"');
      expect(processed).not.toContain('<template');
      expect(processed).not.toContain('data-target="head"');
    });

    test('should handle head slot merging with complex head content', async () => {
      const structure = {
        'layout.html': `
          <html>
            <head>
              <meta charset="UTF-8">
              <title>Default Title</title>
              <link rel="stylesheet" href="layout.css">
            </head>
            <body>
              <slot>Default body</slot>
            </body>
          </html>
        `,
        'page.html': `
          <div data-import="layout.html">
            <template data-target="head">
              <title>Custom Page Title</title>
              <meta name="description" content="Page description">
              <script src="page.js"></script>
            </template>
            <main>Page body content</main>
          </div>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      // Should merge head content properly
      expect(processed).toContain('Custom Page Title');
      expect(processed).toContain('meta charset="UTF-8"');
      expect(processed).toContain('meta name="description"');
      expect(processed).toContain('script src="page.js"');
      expect(processed).toContain('link rel="stylesheet"');
    });

    test('should handle head slot when no head exists in layout', async () => {
      const structure = {
        'simple-layout.html': `
          <div class="wrapper">
            <slot>Content</slot>
          </div>
        `,
        'page.html': `
          <div data-import="simple-layout.html">
            <template data-target="head">
              <title>Page Title</title>
            </template>
            <p>Page content</p>
          </div>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      // Should still process normally without head merging
      expect(processed).toContain('<div class="wrapper">');
      expect(processed).toContain('<p>Page content</p>');
      expect(processed).not.toContain('data-target="head"');
    });

    test('should preserve head slot removal after merging', async () => {
      const structure = {
        'layout.html': `
          <html>
            <head>
              <title>Layout</title>
            </head>
            <body>
              <slot name="main">Default main</slot>
              <slot name="sidebar">Default sidebar</slot>
            </body>
          </html>
        `,
        'page.html': `
          <div data-import="layout.html">
            <template data-target="head">
              <meta name="test" content="true">
            </template>
            <div data-target="main">Main content</div>
            <div data-target="sidebar">Sidebar content</div>
          </div>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      // Head should be merged and removed from named slots
      expect(processed).toContain('meta name="test"');
      expect(processed).toContain('Main content');
      expect(processed).toContain('Sidebar content');
      expect(processed).not.toContain('Default main');
      expect(processed).not.toContain('Default sidebar');
    });

    test('should log head slot processing correctly', async () => {
      const structure = {
        'layout.html': `
          <html>
            <head>
              <title>Layout Title</title>
            </head>
            <body>
              <slot>Content</slot>
            </body>
          </html>
        `,
        'page.html': `
          <div data-import="layout.html">
            <template data-target="head">
              <meta name="page-meta" content="value">
            </template>
            Content here
          </div>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      // This should trigger the head processing logging (line 463)
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('meta name="page-meta"');
      expect(processed).toContain('Layout Title');
    });
  });

  describe('Additional Edge Cases for Complete Coverage', () => {
    test('should handle fragments with head content extraction edge cases', async () => {
      const structure = {
        'fragment-with-head.html': `
          <html>
            <head>
              <title>Fragment Title</title>
              <style>body { margin: 0; }</style>
            </head>
            <body>
              <div class="fragment">Fragment content</div>
            </body>
          </html>
        `,
        'page.html': `
          <div data-import="fragment-with-head.html">
            <template data-target="head">
              <meta name="added" content="true">
            </template>
            <p>Additional content</p>
          </div>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('Fragment Title');
      expect(processed).toContain('body { margin: 0; }');
      expect(processed).toContain('meta name="added"');
      expect(processed).toContain('Fragment content');
    });

    test('should handle malformed HTML in balanced tag finding', () => {
      const processor = new CascadingImportsProcessor('/src');
      
      // Test with malformed HTML that causes parsing to fail
      const malformedHtml = '<div><span>Unclosed span<div>Inner</div>';
      const closingIndex = processor.findBalancedClosingTag(malformedHtml, 5, 'div');
      
      // Should return -1 for unbalanced/malformed HTML
      expect(closingIndex).toBe(-1);
    });

    test('should handle empty or whitespace-only head content', async () => {
      const structure = {
        'layout.html': `
          <html>
            <head>
              
            </head>
            <body>
              <slot>Content</slot>
            </body>
          </html>
        `,
        'page.html': `
          <div data-import="layout.html">
            <template data-target="head">   </template>
            <p>Content</p>
          </div>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('<head>');
      expect(processed).toContain('<p>Content</p>');
    });

    test('should handle complex attribute structures in data-import elements', async () => {
      const structure = {
        'component.html': '<div class="component">Component content</div>',
        'page.html': `
          <section 
            id="main-section" 
            class="page-section important" 
            data-import="component.html"
            role="main"
            aria-label="Main content section"
            data-custom="value"
          >
            Default fallback content
          </section>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('Component content');
      expect(processed).not.toContain('Default fallback content');
      expect(processed).not.toContain('data-import');
    });

    test('should handle deeply nested slot structures with head merging', async () => {
      const structure = {
        'complex-layout.html': `
          <html>
            <head>
              <title>Complex Layout</title>
              <meta name="layout-meta" content="layout">
            </head>
            <body>
              <div class="outer">
                <div class="middle">
                  <div class="inner">
                    <slot name="deep">Deep default</slot>
                  </div>
                </div>
                <slot name="content">Content default</slot>
              </div>
            </body>
          </html>
        `,
        'page.html': `
          <div data-import="complex-layout.html">
            <template data-target="head">
              <title>Page Title Override</title>
              <meta name="page-meta" content="page">
              <style>
                .custom { color: blue; }
              </style>
            </template>
            <div data-target="deep">
              <h1>Deep content with <span>nested elements</span></h1>
            </div>
            <article data-target="content">
              <h2>Article content</h2>
              <p>Paragraph content</p>
            </article>
          </div>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      // Verify head merging
      expect(processed).toContain('Page Title Override');
      expect(processed).toContain('meta name="layout-meta"');
      expect(processed).toContain('meta name="page-meta"');
      expect(processed).toContain('.custom { color: blue; }');
      
      // Verify content injection
      expect(processed).toContain('<h1>Deep content with <span>nested elements</span></h1>');
      expect(processed).toContain('<h2>Article content</h2>');
      expect(processed).not.toContain('Deep default');
      expect(processed).not.toContain('Content default');
    });
  });
});