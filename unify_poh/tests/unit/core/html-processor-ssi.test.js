/**
 * HTML Processor SSI Integration Tests
 * US-024: Apache SSI Include Processing Integration
 * 
 * Focused tests for SSI integration with HTML processor
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join, resolve } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('HtmlProcessor SSI Integration', () => {
  let tempDir;
  let processor;
  let pathValidator;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = join(process.cwd(), 'test-temp-html-ssi', Math.random().toString(36));
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

  describe('Basic SSI Integration', () => {
    test('should_process_ssi_includes_in_standalone_html', async () => {
      // Arrange
      const headerContent = '<header><h1>Site Header</h1></header>';
      const pageContent = `
        <html>
          <head><title>Page</title></head>
          <body>
            <!--#include file="header.html" -->
            <main>Page content</main>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, // No fileSystem mock needed for standalone
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toContain('<header><h1>Site Header</h1></header>');
      expect(result.html).not.toContain('<!--#include file="header.html" -->');
      
      // Verify SSI statistics
      const stats = processor.getCacheStats();
      expect(stats.ssiIncludesProcessed).toBe(1);
    });

    test('should_handle_missing_ssi_includes_gracefully', async () => {
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
      
      // Should have warnings
      const stats = processor.getCacheStats();
      expect(stats.ssiWarnings).toBe(1);
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

    test('should_handle_security_violations_and_add_warnings', async () => {
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
      expect(result.securityWarnings.some(w => w.includes('Path traversal'))).toBe(true);
      expect(result.html).toContain('<!--#include file="../../etc/passwd" -->'); // Preserved
    });
  });

  describe('SSI Processing Order', () => {
    test('should_process_ssi_includes_before_processing_html', async () => {
      // Arrange - Include that adds HTML elements that could affect processing
      const includeContent = '<nav><a href="test.html">Test</a></nav>';
      const pageContent = `
        <html>
          <head><title>Page</title></head>
          <body>
            <!--#include file="nav.html" -->
            <main>Content</main>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'nav.html'), includeContent);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir, 
        { prettyUrls: true } // This should affect the included link
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toContain('<nav><a href="/test/">Test</a></nav>'); // Pretty URL applied to included content
      expect(result.html).not.toContain('<!--#include file="nav.html" -->');
    });

    test('should_track_processing_statistics_correctly', async () => {
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

    test('should_clear_ssi_cache_when_html_processor_cache_cleared', async () => {
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
      
      // Assert - Statistics should be reset
      stats = processor.getCacheStats();
      expect(stats.ssiIncludesProcessed).toBe(1); // Reset after clearCache
      expect(stats.ssiWarnings).toBe(0); // Reset after clearCache
    });
  });

  describe('Complex SSI Scenarios', () => {
    test('should_handle_nested_ssi_includes', async () => {
      // Arrange
      const logoContent = '<img src="/logo.png" alt="Logo">';
      const headerContent = '<header><!--#include file="logo.html" --></header>';
      const pageContent = `
        <html>
          <body>
            <!--#include file="header.html" -->
            <main>Content</main>
          </body>
        </html>
      `;
      
      writeFileSync(join(tempDir, 'logo.html'), logoContent);
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      
      // Act
      const result = await processor.processFile(
        join(tempDir, 'page.html'), 
        pageContent, 
        {}, 
        tempDir
      );
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toContain('<header><img src="/logo.png" alt="Logo"></header>');
      expect(result.html).not.toContain('<!--#include');
      
      const stats = processor.getCacheStats();
      expect(stats.ssiIncludesProcessed).toBe(2); // header.html and logo.html
    });

    test('should_handle_mixed_file_and_virtual_includes', async () => {
      // Arrange
      const headerContent = '<header>Header</header>';
      const footerContent = '<footer>Footer</footer>';
      
      mkdirSync(join(tempDir, 'shared'), { recursive: true });
      writeFileSync(join(tempDir, 'header.html'), headerContent);
      writeFileSync(join(tempDir, 'shared', 'footer.html'), footerContent);
      
      const pageContent = `
        <html>
          <body>
            <!--#include file="header.html" -->
            <main>Content</main>
            <!--#include virtual="/shared/footer.html" -->
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
      expect(result.html).toContain('<header>Header</header>');
      expect(result.html).toContain('<footer>Footer</footer>');
      expect(result.html).not.toContain('<!--#include');
      
      const stats = processor.getCacheStats();
      expect(stats.ssiIncludesProcessed).toBe(2);
    });
  });
});