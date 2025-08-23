/**
 * Integration Tests: End-to-End Link Normalization
 * Tests for US-018: Complete CLI to output link normalization flow
 * 
 * Tests the complete workflow from CLI argument parsing through HTML processing
 * to final output with pretty URLs enabled/disabled
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ArgsParser } from '../../src/cli/args-parser.js';
import { HtmlProcessor } from '../../src/core/html-processor.js';
import { PathValidator } from '../../src/core/path-validator.js';

describe('Link Normalization - End-to-End Integration', () => {
  let tempDir;
  let sourceDir;
  let outputDir;
  let parser;
  let processor;

  beforeEach(() => {
    // Create temporary directories for testing
    tempDir = join(tmpdir(), `unify-link-test-${Date.now()}`);
    sourceDir = join(tempDir, 'src');
    outputDir = join(tempDir, 'dist');
    
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(sourceDir, { recursive: true });
    
    parser = new ArgsParser();
    const pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('CLI to HTML Processing Flow', () => {
    test('should_parse_pretty_urls_and_apply_to_html_processing', async () => {
      // Create test HTML file
      const htmlContent = `
        <html>
          <head>
            <title>Test Page</title>
          </head>
          <body>
            <nav>
              <a href="index.html">Home</a>
              <a href="about.html">About</a>
              <a href="blog/post.html">Blog</a>
            </nav>
            <main>
              <p>Visit <a href="contact.html">our contact page</a>.</p>
            </main>
          </body>
        </html>
      `;
      
      const testFilePath = join(sourceDir, 'test.html');
      writeFileSync(testFilePath, htmlContent);

      // Parse CLI arguments with pretty URLs enabled
      const parsed = parser.parse(['build', '--source', sourceDir, '--pretty-urls']);
      expect(parsed.prettyUrls).toBe(true);
      expect(parsed.source).toBe(sourceDir);

      // Process HTML file with options from CLI parsing
      const result = await processor.processFile(
        testFilePath,
        htmlContent,
        {},
        sourceDir,
        { prettyUrls: parsed.prettyUrls }
      );

      expect(result.success).toBe(true);
      expect(result.html).toContain('href="/"'); // index.html
      expect(result.html).toContain('href="/about/"'); // about.html
      expect(result.html).toContain('href="/blog/post/"'); // blog/post.html
      expect(result.html).toContain('href="/contact/"'); // contact.html
    });

    test('should_not_transform_links_when_pretty_urls_disabled', async () => {
      const htmlContent = `
        <html>
          <body>
            <nav>
              <a href="index.html">Home</a>
              <a href="about.html">About</a>
            </nav>
          </body>
        </html>
      `;
      
      const testFilePath = join(sourceDir, 'test.html');
      writeFileSync(testFilePath, htmlContent);

      // Parse CLI arguments without pretty URLs
      const parsed = parser.parse(['build', '--source', sourceDir]);
      expect(parsed.prettyUrls).toBe(false);

      // Process HTML file
      const result = await processor.processFile(
        testFilePath,
        htmlContent,
        {},
        sourceDir,
        { prettyUrls: parsed.prettyUrls }
      );

      expect(result.success).toBe(true);
      expect(result.html).toContain('href="index.html"');
      expect(result.html).toContain('href="about.html"');
    });

    test('should_handle_layout_composition_with_link_normalization', async () => {
      // Create layout file
      const layoutContent = `
        <html>
          <head>
            <title>Site Layout</title>
          </head>
          <body>
            <header>
              <nav>
                <a href="index.html">Home</a>
                <a href="about.html">About</a>
              </nav>
            </header>
            <main class="unify-content"></main>
            <footer>
              <a href="contact.html">Contact</a>
            </footer>
          </body>
        </html>
      `;

      const pageContent = `
        <html data-unify="_layout.html">
          <head>
            <title>Page Title</title>
          </head>
          <body>
            <div class="unify-content">
              <h1>Page Content</h1>
              <p>Check out our <a href="services.html">services</a>.</p>
              <p>Read our <a href="blog/index.html">blog</a>.</p>
            </div>
          </body>
        </html>
      `;

      writeFileSync(join(sourceDir, '_layout.html'), layoutContent);
      writeFileSync(join(sourceDir, 'page.html'), pageContent);

      // Parse CLI with pretty URLs
      const parsed = parser.parse(['build', '--source', sourceDir, '--pretty-urls']);

      // Process page with layout
      const result = await processor.processFile(
        join(sourceDir, 'page.html'),
        pageContent,
        { '_layout.html': layoutContent },
        sourceDir,
        { prettyUrls: parsed.prettyUrls }
      );

      expect(result.success).toBe(true);
      expect(result.compositionApplied).toBe(true);

      // Layout links should be transformed
      expect(result.html).toContain('href="/"'); // index.html
      expect(result.html).toContain('href="/about/"'); // about.html
      expect(result.html).toContain('href="/contact/"'); // contact.html

      // Page content links should be transformed
      expect(result.html).toContain('href="/services/"'); // services.html
      expect(result.html).toContain('href="/blog/"'); // blog/index.html
    });
  });

  describe('Complex Link Scenarios', () => {
    test('should_preserve_external_and_special_links_in_e2e_flow', async () => {
      const htmlContent = `
        <html>
          <body>
            <nav>
              <a href="about.html">About</a>
              <a href="https://external.com/page.html">External</a>
              <a href="mailto:test@example.com">Email</a>
              <a href="document.pdf">PDF</a>
              <a href="#section">Anchor</a>
            </nav>
          </body>
        </html>
      `;

      writeFileSync(join(sourceDir, 'test.html'), htmlContent);

      const parsed = parser.parse(['build', '--source', sourceDir, '--pretty-urls']);
      const result = await processor.processFile(
        join(sourceDir, 'test.html'),
        htmlContent,
        {},
        sourceDir,
        { prettyUrls: parsed.prettyUrls }
      );

      expect(result.success).toBe(true);

      // HTML files should be transformed
      expect(result.html).toContain('href="/about/"');

      // Special links should be preserved
      expect(result.html).toContain('href="https://external.com/page.html"');
      expect(result.html).toContain('href="mailto:test@example.com"');
      expect(result.html).toContain('href="document.pdf"');
      expect(result.html).toContain('href="#section"');
    });

    test('should_preserve_query_parameters_and_fragments_in_e2e_flow', async () => {
      const htmlContent = `
        <html>
          <body>
            <nav>
              <a href="search.html?q=test">Search</a>
              <a href="docs.html#getting-started">Docs</a>
              <a href="api.html?format=json#endpoints">API</a>
            </nav>
          </body>
        </html>
      `;

      writeFileSync(join(sourceDir, 'test.html'), htmlContent);

      const parsed = parser.parse(['build', '--source', sourceDir, '--pretty-urls']);
      const result = await processor.processFile(
        join(sourceDir, 'test.html'),
        htmlContent,
        {},
        sourceDir,
        { prettyUrls: parsed.prettyUrls }
      );

      expect(result.success).toBe(true);
      expect(result.html).toContain('href="/search/?q=test"');
      expect(result.html).toContain('href="/docs/#getting-started"');
      expect(result.html).toContain('href="/api/?format=json#endpoints"');
    });
  });

  describe('CLI Option Validation', () => {
    test('should_validate_pretty_urls_option_correctly', () => {
      const result1 = parser.parse(['build', '--pretty-urls']);
      const validation1 = parser.validate(result1);
      expect(validation1.isValid).toBe(true);
      expect(result1.prettyUrls).toBe(true);

      const result2 = parser.parse(['build']);
      const validation2 = parser.validate(result2);
      expect(validation2.isValid).toBe(true);
      expect(result2.prettyUrls).toBe(false);
    });

    test('should_work_with_all_command_types', () => {
      const commands = ['build', 'serve', 'watch', 'init'];
      
      commands.forEach(command => {
        const result = parser.parse([command, '--pretty-urls']);
        expect(result.command).toBe(command);
        expect(result.prettyUrls).toBe(true);
        
        const validation = parser.validate(result);
        expect(validation.isValid).toBe(true);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should_handle_processing_errors_gracefully', async () => {
      const htmlContent = '<html><body><a href="about.html">About</a></body></html>';
      
      // Test with missing source root (should still work with fallback)
      const result = await processor.processFile(
        'test.html',
        htmlContent,
        {},
        '', // empty source root
        { prettyUrls: true }
      );

      expect(result.success).toBe(true);
      expect(result.html).toContain('href="/about/"');
    });

    test('should_handle_empty_html_content', async () => {
      const result = await processor.processFile(
        'test.html',
        '',
        {},
        sourceDir,
        { prettyUrls: true }
      );

      expect(result.success).toBe(true);
      expect(result.html).toBe('');
    });

    test('should_handle_html_without_links', async () => {
      const htmlContent = `
        <html>
          <body>
            <h1>No Links Here</h1>
            <p>Just some text content.</p>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'test.html',
        htmlContent,
        {},
        sourceDir,
        { prettyUrls: true }
      );

      expect(result.success).toBe(true);
      expect(result.html).toBe(htmlContent); // Should be unchanged
    });
  });

  describe('Performance Validation', () => {
    test('should_process_medium_sized_files_quickly', async () => {
      // Generate HTML with 100 links
      const links = Array.from({ length: 100 }, (_, i) => 
        `<a href="page${i}.html">Page ${i}</a>`
      ).join('\\n        ');

      const htmlContent = `
        <html>
          <body>
            <nav>
              ${links}
            </nav>
          </body>
        </html>
      `;

      const startTime = Date.now();
      const result = await processor.processFile(
        'test.html',
        htmlContent,
        {},
        sourceDir,
        { prettyUrls: true }
      );
      const processingTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(500); // Should be very fast
      
      // Verify some transformations worked
      expect(result.html).toContain('href="/page0/"');
      expect(result.html).toContain('href="/page50/"');
      expect(result.html).toContain('href="/page99/"');
    });
  });
});