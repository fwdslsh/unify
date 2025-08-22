import { describe, test, expect, beforeEach } from 'bun:test';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('HtmlProcessor - Debug Repeating Warnings', () => {
  let processor;
  let pathValidator;
  let mockFileSystem;

  beforeEach(() => {
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
    mockFileSystem = {};
  });

  test('should_not_repeat_missing_file_warnings_in_nested_chains', async () => {
    // Arrange: Reproduce the exact scenario from user report
    // root.html exists and references site.html (missing)
    // site.html would reference nav.html (missing) and post.html (missing)
    mockFileSystem['_includes/layouts/root.html'] = `
      <html data-unify="_includes/layouts/site.html">
        <head><title>Root Layout</title></head>
        <body>
          <div class="unify-content">Root content</div>
        </body>
      </html>
    `;
    
    // All other files are missing:
    // - _includes/layouts/site.html (missing)
    // - _includes/components/nav.html (missing) 
    // - _includes/post.html (missing)

    const pageHtml = `
      <html data-unify="_includes/layouts/root.html">
        <head><title>Test Page</title></head>
        <body>
          <div class="unify-content">Test page content</div>
        </body>
      </html>
    `;

    // Capture warnings to check for repetition
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
      const message = args.join(' ');
      warnings.push(message);
      console.log(`[DEBUG] Warning: ${message}`); // For debugging
    };

    try {
      // Act: Process the page
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Should succeed but not repeat warnings
      expect(result.success).toBe(true);
      
      // Check for repeated warnings about the same file
      const siteLayoutWarnings = warnings.filter(w => w.includes('_includes/layouts/site.html'));
      console.log(`[DEBUG] Site layout warnings count: ${siteLayoutWarnings.length}`);
      console.log(`[DEBUG] All warnings:`, warnings);
      
      // Should only warn once per missing file, not repeatedly
      expect(siteLayoutWarnings.length).toBe(1);
      
      // Total warnings should be reasonable (not indicating infinite loops)
      expect(warnings.length).toBeLessThanOrEqual(3); // At most 3 unique missing files
      
    } finally {
      console.warn = originalWarn;
    }
  });

  test('should_handle_complex_missing_chain_scenario', async () => {
    // Arrange: Create a scenario that could cause repeated processing
    // Page → Root (exists) → Site (missing) 
    // Where Site would reference Nav (missing) and Post (missing)
    
    mockFileSystem['_includes/layouts/root.html'] = `
      <html data-unify="_includes/layouts/site.html">
        <head>
          <title>Root Layout</title>
          <link rel="stylesheet" href="/root.css">
        </head>
        <body>
          <header>
            <div data-unify="_includes/components/nav.html">Default nav</div>
          </header>
          <main class="unify-content">Root main content</main>
          <aside>
            <div data-unify="_includes/post.html">Default post</div>
          </aside>
        </body>
      </html>
    `;

    const pageHtml = `
      <html data-unify="_includes/layouts/root.html">
        <head><title>Page Title</title></head>
        <body>
          <main class="unify-content">Page content</main>
        </body>
      </html>
    `;

    // Track all warnings
    const allWarnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => allWarnings.push(args.join(' '));

    try {
      // Act: Process with complex missing file scenario
      const startTime = Date.now();
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );
      const elapsed = Date.now() - startTime;

      // Assert: Should complete quickly without repetition
      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(500); // Should be fast
      
      // Count warnings per file to detect repetition
      const warningsByFile = {};
      allWarnings.forEach(warning => {
        const match = warning.match(/Layout file not found: ([^.]+\.html)/);
        if (match) {
          const filename = match[1];
          warningsByFile[filename] = (warningsByFile[filename] || 0) + 1;
        }
      });

      console.log('[DEBUG] Warnings by file:', warningsByFile);
      
      // Each file should only be warned about once
      Object.values(warningsByFile).forEach(count => {
        expect(count).toBe(1);
      });
      
    } finally {
      console.warn = originalWarn;
    }
  });

  test('should_properly_handle_processing_stack_with_missing_files', async () => {
    // Arrange: Test processing stack management
    mockFileSystem['level1.html'] = `
      <html data-unify="level2.html">
        <head><title>Level 1</title></head>
        <body><div class="unify-content">Level 1</div></body>
      </html>
    `;
    
    mockFileSystem['level2.html'] = `
      <html data-unify="level3-missing.html">
        <head><title>Level 2</title></head>
        <body><div class="unify-content">Level 2</div></body>
      </html>
    `;
    
    // level3-missing.html is intentionally missing

    const pageHtml = `
      <html data-unify="level1.html">
        <head><title>Page</title></head>
        <body><div class="unify-content">Page content</div></body>
      </html>
    `;

    // Act: Process multi-level chain with missing file
    const result = await processor.processFile(
      'page.html',
      pageHtml,
      mockFileSystem,
      '/test',
      {}
    );

    // Assert: Should succeed and clean up processing stack
    expect(result.success).toBe(true);
    expect(processor.processingStack.size).toBe(0);
    
    // Verify content has expected composition up to the missing file
    expect(result.html).toContain('Page content');
  });
});

/**
 * This test file specifically debugs the issue where missing layout files
 * cause repeated warning messages, suggesting that the processing stack
 * or recursive calls are not being properly managed.
 */