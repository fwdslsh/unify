import { describe, test, expect, beforeEach } from 'bun:test';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('HtmlProcessor - Multiple Files Referencing Missing Layouts', () => {
  let processor;
  let pathValidator;
  let mockFileSystem;

  beforeEach(() => {
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
    mockFileSystem = {};
  });

  test('should_warn_per_file_when_multiple_files_reference_same_missing_layout', async () => {
    // Arrange: Multiple pages referencing the same missing layout (user's scenario)
    mockFileSystem['_includes/layouts/root.html'] = `
      <!doctype html>
      <html>
        <head><title>Root Layout</title></head>
        <body>
          <nav data-unify="_includes/components/nav.html">Default nav</nav>
          <main>Root content</main>
        </body>
      </html>
    `;

    // _includes/layouts/site.html is missing
    // _includes/components/nav.html is missing
    // _includes/post.html is missing

    const page1Html = `
      <html data-unify="_includes/layouts/root.html">
        <head><title>Page 1</title></head>
        <body><main>Page 1 content</main></body>
      </html>
    `;

    const page2Html = `
      <html data-unify="_includes/layouts/root.html">
        <head><title>Page 2</title></head>
        <body><main>Page 2 content</main></body>
      </html>
    `;

    const page3Html = `
      <html data-unify="_includes/layouts/root.html">
        <head><title>Page 3</title></head>
        <body><main>Page 3 content</main></body>
      </html>
    `;

    // Track warnings to see repetition pattern
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
      const message = args.join(' ');
      warnings.push(message);
    };

    try {
      // Act: Process multiple pages that reference the same missing components
      // This simulates a build process that processes multiple files
      await processor.processFile('page1.html', page1Html, mockFileSystem, '/test', {});
      await processor.processFile('page2.html', page2Html, mockFileSystem, '/test', {});
      await processor.processFile('page3.html', page3Html, mockFileSystem, '/test', {});

      // Assert: Each file processing should warn about missing nav.html
      const navWarnings = warnings.filter(w => w.includes('_includes/components/nav.html'));
      console.log(`[DEBUG] Total nav warnings: ${navWarnings.length}`);
      console.log(`[DEBUG] All warnings:`, warnings);
      
      // With warning deduplication, should only warn once per unique missing file
      // This improves user experience by reducing noise during builds
      expect(navWarnings.length).toBe(1); // Only one warning despite multiple files using the same layout
      
    } finally {
      console.warn = originalWarn;
    }
  });

  test('should_use_layout_cache_to_avoid_reprocessing_same_missing_files', async () => {
    // Arrange: Test if layout caching reduces repeated processing
    mockFileSystem['shared-layout.html'] = `
      <html data-unify="missing-dependency.html">
        <head><title>Shared Layout</title></head>
        <body><div class="unify-content">Shared content</div></body>
      </html>
    `;

    // missing-dependency.html is intentionally missing

    const page1Html = `
      <html data-unify="shared-layout.html">
        <head><title>Page 1</title></head>
        <body><div class="unify-content">Page 1</div></body>
      </html>
    `;

    const page2Html = `
      <html data-unify="shared-layout.html">
        <head><title>Page 2</title></head>
        <body><div class="unify-content">Page 2</div></body>
      </html>
    `;

    // Track warnings and cache stats
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      // Act: Process multiple files with shared layout
      await processor.processFile('page1.html', page1Html, mockFileSystem, '/test', {});
      await processor.processFile('page2.html', page2Html, mockFileSystem, '/test', {});

      // Assert: Layout should be cached, reducing redundant processing
      const stats = processor.getCacheStats();
      expect(stats.layoutCacheHits).toBeGreaterThan(0); // shared-layout.html should be cached
      
      // But missing dependency warnings will still appear per layout processing
      const missingWarnings = warnings.filter(w => w.includes('missing-dependency.html'));
      console.log(`[DEBUG] Missing dependency warnings: ${missingWarnings.length}`);
      
      // This shows the root cause - each layout processing will warn about its missing dependencies
      expect(missingWarnings.length).toBeGreaterThan(0);
      
    } finally {
      console.warn = originalWarn;
    }
  });

  test('should_demonstrate_user_reported_scenario', async () => {
    // Arrange: Exact scenario from user report
    mockFileSystem['_includes/layouts/root.html'] = `
      <!doctype html>
      <html>
        <body>
          <nav data-unify="_includes/components/nav.html">Nav</nav>
          <main>Root</main>
        </body>
      </html>
    `;

    mockFileSystem['_includes/layouts/site.html'] = `
      <!doctype html>
      <html>
        <body data-unify="_includes/layouts/root.html">
          <main>Site</main>
        </body>
      </html>
    `;

    // Missing files: nav.html, post.html

    // Multiple pages that all use the layout chain
    const pages = [
      `<html data-unify="_includes/layouts/site.html"><body>Page 1</body></html>`,
      `<html data-unify="_includes/layouts/site.html"><body>Page 2</body></html>`,
      `<html data-unify="_includes/layouts/root.html"><body>Page 3</body></html>`,
    ];

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      // Act: Process multiple pages (simulating build process)
      for (let i = 0; i < pages.length; i++) {
        await processor.processFile(`page${i + 1}.html`, pages[i], mockFileSystem, '/test', {});
      }

      // Assert: This demonstrates why user sees repeated warnings
      console.log(`[DEBUG] Total warnings: ${warnings.length}`);
      warnings.forEach((warning, index) => {
        console.log(`[DEBUG] Warning ${index + 1}: ${warning}`);
      });

      // Count warnings by file to show repetition pattern
      const warningsByFile = {};
      warnings.forEach(warning => {
        const match = warning.match(/Layout file not found: ([^.]+\.html)/);
        if (match) {
          const filename = match[1];
          warningsByFile[filename] = (warningsByFile[filename] || 0) + 1;
        }
      });

      console.log('[DEBUG] Warnings by missing file:', warningsByFile);
      
      // With deduplication, each missing file should only be warned about once
      // regardless of how many pages reference layouts that depend on it
      Object.values(warningsByFile).forEach(count => {
        expect(count).toBe(1); // Each missing file warned about only once
      });
      
    } finally {
      console.warn = originalWarn;
    }
  });
});

/**
 * This test demonstrates that "repeated" warnings are actually
 * legitimate per-file warnings when multiple pages reference
 * the same missing layout dependencies during a build process.
 */