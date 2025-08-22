import { describe, test, expect, beforeEach } from 'bun:test';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('HtmlProcessor - Multiple data-unify Attributes', () => {
  let processor;
  let pathValidator;
  let mockFileSystem;

  beforeEach(() => {
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
    mockFileSystem = {};
  });

  test('should_handle_multiple_data_unify_attributes_in_same_document', async () => {
    // Arrange: HTML with multiple data-unify attributes (reproducing real scenario)
    mockFileSystem['_includes/layouts/root.html'] = `
      <!doctype html>
      <html>
        <head><title>Root Layout</title></head>
        <body>
          <header>
            <!-- This nav component is missing - should warn once -->
            <nav data-unify="_includes/components/nav.html">Default nav</nav>
          </header>
          <main>Default main content</main>
        </body>
      </html>
    `;

    const siteHtml = `
      <!doctype html>
      <html>
        <head><title>Site Layout</title></head>
        <body data-unify="_includes/layouts/root.html">
          <main>
            <section>Site content</section>
          </main>
        </body>
      </html>
    `;

    // nav.html is missing - should only warn once total
    
    // Track warnings to detect repetition
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
      const message = args.join(' ');
      warnings.push(message);
      console.log(`[DEBUG] Warning: ${message}`);
    };

    try {
      // Act: Process site layout (which references root, which references missing nav)
      const result = await processor.processFile(
        'site.html',
        siteHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Should succeed but warn only once per missing file
      expect(result.success).toBe(true);
      
      // Check for repeated warnings about nav.html
      const navWarnings = warnings.filter(w => w.includes('_includes/components/nav.html'));
      console.log(`[DEBUG] Nav warnings count: ${navWarnings.length}`);
      console.log(`[DEBUG] All warnings:`, warnings);
      
      // Should only warn once about nav.html, not repeatedly
      expect(navWarnings.length).toBeLessThanOrEqual(1);
      
    } finally {
      console.warn = originalWarn;
    }
  });

  test('should_handle_circular_reference_with_missing_components', async () => {
    // Arrange: Reproduce the exact user scenario
    mockFileSystem['_includes/layouts/root.html'] = `
      <!doctype html>
      <html>
        <head><title>Root</title></head>
        <body>
          <header>
            <nav data-unify="_includes/components/nav.html">Default nav</nav>
          </header>
          <main>Root main</main>
          <aside>
            <div data-unify="_includes/post.html">Default post</div>
          </aside>
        </body>
      </html>
    `;

    mockFileSystem['_includes/layouts/site.html'] = `
      <!doctype html>
      <html>
        <head><title>Site</title></head>
        <body data-unify="_includes/layouts/root.html">
          <main>Site main</main>
        </body>
      </html>
    `;

    const pageHtml = `
      <html data-unify="_includes/layouts/site.html">
        <head><title>Page</title></head>
        <body>
          <main>Page content</main>
        </body>
      </html>
    `;

    // _includes/components/nav.html is missing
    // _includes/post.html is missing

    // Track warnings
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      // Act: Process complex chain with multiple missing components
      const startTime = Date.now();
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );
      const elapsed = Date.now() - startTime;

      // Assert: Should complete quickly without infinite loops
      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(1000);
      
      // Count warnings per missing file
      const warningCounts = {};
      warnings.forEach(warning => {
        const match = warning.match(/Layout file not found: ([^.]+\.html)/);
        if (match) {
          const filename = match[1];
          warningCounts[filename] = (warningCounts[filename] || 0) + 1;
        }
      });

      console.log('[DEBUG] Warning counts by file:', warningCounts);
      
      // Each missing file should only be warned about once
      Object.entries(warningCounts).forEach(([filename, count]) => {
        expect(count).toBe(1); // No file should be warned about more than once
      });
      
    } finally {
      console.warn = originalWarn;
    }
  });

  test('should_extract_only_first_data_unify_attribute', async () => {
    // Arrange: HTML with multiple data-unify attributes
    const htmlWithMultipleDataUnify = `
      <html data-unify="layout1.html">
        <body>
          <div data-unify="component1.html">Component 1</div>
          <div data-unify="component2.html">Component 2</div>
        </body>
      </html>
    `;

    // Act: Extract data-unify attribute
    const dataUnifyValue = processor._extractDataUnifyAttribute(htmlWithMultipleDataUnify);

    // Assert: Should only extract the first one
    expect(dataUnifyValue).toBe('layout1.html');
  });

  test('should_handle_document_with_mixed_valid_and_missing_data_unify', async () => {
    // Arrange: Document with multiple data-unify where some files exist, some don't
    mockFileSystem['valid-component.html'] = `
      <div>Valid component content</div>
    `;
    
    // missing-component.html is intentionally missing

    const pageHtml = `
      <html data-unify="missing-layout.html">
        <head><title>Page</title></head>
        <body>
          <div data-unify="valid-component.html">Default component</div>
          <div data-unify="missing-component.html">Another component</div>
          <main>Page content</main>
        </body>
      </html>
    `;

    // Track warnings
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      // Act: Process document with mixed valid/missing references
      const result = await processor.processFile(
        'page.html',
        pageHtml,
        mockFileSystem,
        '/test',
        {}
      );

      // Assert: Should handle gracefully
      expect(result.success).toBe(true);
      
      // Should warn about missing files but not repeat
      const missingLayoutWarnings = warnings.filter(w => w.includes('missing-layout.html'));
      expect(missingLayoutWarnings.length).toBe(1);
      
    } finally {
      console.warn = originalWarn;
    }
  });
});

/**
 * This test investigates whether the HTML processor properly handles
 * documents with multiple data-unify attributes, which could be causing
 * repeated processing and warning messages.
 */