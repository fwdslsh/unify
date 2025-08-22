/**
 * SSI-HTML Integration Tests
 * US-024: Apache SSI Include Processing Integration with HTML Processing Pipeline
 * 
 * Tests the integration of SSI processing with the existing HTML processing pipeline
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join, resolve } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { HtmlProcessor } from '../../src/core/html-processor.js';
import { PathValidator } from '../../src/core/path-validator.js';

describe('SSI-HTML Integration', () => {
  let tempDir;
  let processor;
  let pathValidator;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = join(process.cwd(), 'test-temp-ssi-html', Math.random().toString(36));
    mkdirSync(tempDir, { recursive: true });
    
    // Initialize processor and validator
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('SSI Processing Integration', () => {
    test('should_process_ssi_includes_before_dom_cascade_composition', async () => {
      // Arrange
      const headerContent = '<header><h1>Site Header</h1></header>';
      const layoutContent = `
        <html>
          <head><title>Layout</title></head>
          <body>
            <main class="unify-content">Default content</main>
          </body>
        </html>
      `;
      const pageContent = `
        <html data-unify="_layout.html">
          <head><title>Page Title</title></head>
          <body>
            <main class="unify-content">
              <!--#include file="header.html" -->
              <div>Page content</div>
            </main>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      writeFileSync(join(tempDir, '_layout.html'), layoutContent);
      
      const fileSystem = {
        '_layout.html': layoutContent
      };
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        fileSystem, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toContain('<header><h1>Site Header</h1></header>');
      expect(result.html).toContain('<div>Page content</div>');
      expect(result.html).toContain('<title>Page Title</title>');
      expect(result.html).not.toContain('<!--#include file="header.html" -->');
      // DOM Cascade composition should have the main element (the class attribute may be merged differently)
      expect(result.html).toContain('<main>');
      
      // Verify SSI statistics
      const stats = processor.getCacheStats();
      expect(stats.ssiIncludesProcessed).toBeGreaterThan(0);
    });

    test('should_handle_ssi_includes_in_layout_files', async () => {
      // Arrange
      const navContent = '<nav><ul><li>Home</li><li>About</li></ul></nav>';
      const layoutContent = `
        <html>
          <head><title>Layout</title></head>
          <body>
            <!--#include file="nav.html" -->
            <main class="unify-content">Default content</main>
          </body>
        </html>
      `;
      const pageContent = `
        <html data-unify="_layout.html">
          <body>
            <main class="unify-content">Page content</main>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'nav.html'), navContent);
      writeFileSync(join(tempDir, '_layout.html'), layoutContent);
      
      const fileSystem = {
        '_layout.html': layoutContent
      };
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        fileSystem, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toContain(navContent);
      expect(result.html).toContain('<main>Page content</main>');
      expect(result.html).not.toContain('<!--#include file="nav.html" -->');
    });

    test('should_process_markdown_includes_and_convert_to_html', async () => {
      // Arrange
      const markdownContent = '# Welcome\n\nThis is **bold** text.';
      const pageContent = `
        <html>
          <head><title>Page</title></head>
          <body>
            <section>
              <!--#include file="content.md" -->
            </section>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'content.md'), markdownContent);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toContain('<h1');
      expect(result.html).toContain('<strong>bold</strong>');
      expect(result.html).not.toContain('**bold**');
      expect(result.html).not.toContain('<!--#include file="content.md" -->');
    });

    test('should_handle_missing_includes_gracefully_without_failing_build', async () => {
      // Arrange
      const pageContent = `
        <html>
          <head><title>Page</title></head>
          <body>
            <!--#include file="missing.html" -->
            <main>Page content</main>
          </body>
        </html>
      `;
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toContain('<!--#include file="missing.html" -->'); // Preserved
      expect(result.html).toContain('<main>Page content</main>');
      
      // Should have warnings but not fail
      const stats = processor.getCacheStats();
      expect(stats.ssiWarnings).toBeGreaterThan(0);
    });

    test('should_detect_security_violations_and_add_to_security_warnings', async () => {
      // Arrange
      const pageContent = `
        <html>
          <head><title>Page</title></head>
          <body>
            <!--#include file="../../etc/passwd" -->
            <main>Page content</main>
          </body>
        </html>
      `;
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.securityWarnings.length).toBeGreaterThan(0);
      expect(result.securityWarnings[0]).toContain('Path traversal');
      expect(result.html).toContain('<!--#include file="../../etc/passwd" -->'); // Preserved
    });
  });

  describe('Performance and Statistics', () => {
    test('should_track_ssi_processing_statistics', async () => {
      // Arrange
      const part1 = '<div>Part 1</div>';
      const part2 = '<div>Part 2</div>';
      const pageContent = `
        <html>
          <body>
            <!--#include file="part1.html" -->
            <!--#include file="part2.html" -->
            <!--#include file="missing.html" -->
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'part1.html'), part1);
      writeFileSync(join(tempDir, 'part2.html'), part2);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      
      const stats = processor.getCacheStats();
      expect(stats.ssiIncludesProcessed).toBe(2); // 2 successful includes
      expect(stats.ssiWarnings).toBe(1); // 1 missing file warning
      expect(stats.ssiStats).toBeDefined();
      expect(stats.ssiStats.totalDirectives).toBe(3);
      expect(stats.ssiStats.successfulIncludes).toBe(2);
      expect(stats.ssiStats.failedIncludes).toBe(1);
    });

    test('should_clear_ssi_cache_when_processor_cache_cleared', async () => {
      // Arrange
      const contentHtml = '<p>Content</p>';
      const pageContent = '<!--#include file="content.html" -->';
      
      writeFileSync(join(tempDir, 'content.html'), contentHtml);
      
      // Act - Process once to populate cache
      await processor.processFile(join(tempDir, 'page.html'), pageContent, {}, tempDir);
      
      let stats = processor.getCacheStats();
      expect(stats.ssiStats.cacheMisses).toBeGreaterThan(0);
      
      // Clear cache
      processor.clearCache();
      
      // Process again
      await processor.processFile(join(tempDir, 'page.html'), pageContent, {}, tempDir);
      
      // Assert - Cache should be reset
      stats = processor.getCacheStats();
      expect(stats.ssiIncludesProcessed).toBe(1); // Reset
      expect(stats.ssiWarnings).toBe(0); // Reset
    });
  });

  describe('Complex Integration Scenarios', () => {
    test('should_handle_nested_ssi_includes_with_dom_cascade', async () => {
      // Arrange
      const headerContent = '<header><!--#include file="logo.html" --></header>';
      const logoContent = '<img src="/logo.png" alt="Logo">';
      const layoutContent = `
        <html>
          <head><title>Layout</title></head>
          <body>
            <div class="unify-header">Default Header</div>
            <div class="unify-content">Default Content</div>
          </body>
        </html>
      `;
      const pageContent = `
        <html data-unify="_layout.html">
          <body>
            <section class="unify-header">
              <!--#include file="header.html" -->
            </section>
            <main class="unify-content">
              <h1>Page Content</h1>
            </main>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'logo.html'), logoContent);
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      writeFileSync(join(tempDir, '_layout.html'), layoutContent);
      
      const fileSystem = {
        '_layout.html': layoutContent
      };
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        fileSystem, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toContain('<img src="/logo.png" alt="Logo">');
      expect(result.html).toContain('<h1>Page Content</h1>');
      expect(result.html).not.toContain('<!--#include');
      expect(result.compositionApplied).toBe(true);
      
      const stats = processor.getCacheStats();
      expect(stats.ssiIncludesProcessed).toBe(2); // header.html and logo.html
    });

    test('should_process_ssi_includes_with_link_normalization', async () => {
      // Arrange
      const navContent = '<nav><a href="about.html">About</a></nav>';
      const pageContent = `
        <html>
          <body>
            <!--#include file="nav.html" -->
            <main>Content</main>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'nav.html'), navContent);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir, 
        { prettyUrls: true }
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toContain('href="/about/"'); // Pretty URL applied
      expect(result.html).not.toContain('<!--#include file="nav.html" -->');
    });
  });
});