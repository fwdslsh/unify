import { describe, test, expect, beforeEach } from 'bun:test';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('HtmlProcessor - Warning Deduplication', () => {
  let processor;
  let pathValidator;
  let mockFileSystem;

  beforeEach(() => {
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
    mockFileSystem = {};
  });

  test('should_deduplicate_warnings_for_same_missing_file_across_multiple_processes', async () => {
    // Arrange: Multiple files referencing the same missing layout
    const pageHtml1 = `
      <html data-unify="missing-shared.html">
        <head><title>Page 1</title></head>
        <body><main>Page 1 content</main></body>
      </html>
    `;

    const pageHtml2 = `
      <html data-unify="missing-shared.html">
        <head><title>Page 2</title></head>
        <body><main>Page 2 content</main></body>
      </html>
    `;

    const pageHtml3 = `
      <html data-unify="missing-shared.html">
        <head><title>Page 3</title></head>
        <body><main>Page 3 content</main></body>
      </html>
    `;

    // Track warnings
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      // Act: Process multiple files with same missing dependency
      await processor.processFile('page1.html', pageHtml1, mockFileSystem, '/test', {});
      await processor.processFile('page2.html', pageHtml2, mockFileSystem, '/test', {});
      await processor.processFile('page3.html', pageHtml3, mockFileSystem, '/test', {});

      // Assert: Should only warn once despite 3 files using the same missing layout
      const missingWarnings = warnings.filter(w => w.includes('missing-shared.html'));
      expect(missingWarnings.length).toBe(1);

      // Verify statistics tracking
      const stats = processor.getCacheStats();
      expect(stats.layoutMissing).toBe(3); // Total attempts to load missing file
      expect(stats.uniqueMissingFiles).toBe(1); // Only one unique missing file

    } finally {
      console.warn = originalWarn;
    }
  });

  test('should_track_different_missing_files_separately', async () => {
    // Arrange: Different pages referencing different missing files
    const page1Html = `
      <html data-unify="missing-layout-a.html">
        <head><title>Page 1</title></head>
        <body><main>Page 1</main></body>
      </html>
    `;

    const page2Html = `
      <html data-unify="missing-layout-b.html">
        <head><title>Page 2</title></head>
        <body><main>Page 2</main></body>
      </html>
    `;

    const page3Html = `
      <html data-unify="missing-layout-a.html">
        <head><title>Page 3</title></head>
        <body><main>Page 3</main></body>
      </html>
    `;

    // Track warnings
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      // Act: Process files with different missing dependencies
      await processor.processFile('page1.html', page1Html, mockFileSystem, '/test', {});
      await processor.processFile('page2.html', page2Html, mockFileSystem, '/test', {});
      await processor.processFile('page3.html', page3Html, mockFileSystem, '/test', {});

      // Assert: Should warn once per unique missing file
      const layoutAWarnings = warnings.filter(w => w.includes('missing-layout-a.html'));
      const layoutBWarnings = warnings.filter(w => w.includes('missing-layout-b.html'));
      
      expect(layoutAWarnings.length).toBe(1); // Only one warning for layout A
      expect(layoutBWarnings.length).toBe(1); // Only one warning for layout B

      // Verify statistics
      const stats = processor.getCacheStats();
      expect(stats.layoutMissing).toBe(3); // Total missing attempts
      expect(stats.uniqueMissingFiles).toBe(2); // Two unique missing files

    } finally {
      console.warn = originalWarn;
    }
  });

  test('should_reset_warning_deduplication_when_cache_cleared', async () => {
    // Arrange: Process file with missing layout, clear cache, process again
    const pageHtml = `
      <html data-unify="missing-reset-test.html">
        <head><title>Page</title></head>
        <body><main>Page content</main></body>
      </html>
    `;

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      // Act: Process, clear cache, process again
      await processor.processFile('page.html', pageHtml, mockFileSystem, '/test', {});
      
      processor.clearCache(); // This should reset warning deduplication
      
      await processor.processFile('page.html', pageHtml, mockFileSystem, '/test', {});

      // Assert: Should warn twice (once before clear, once after)
      const missingWarnings = warnings.filter(w => w.includes('missing-reset-test.html'));
      expect(missingWarnings.length).toBe(2);

      // Stats should also reset
      const stats = processor.getCacheStats();
      expect(stats.layoutMissing).toBe(1); // Only counts since last clear
      expect(stats.uniqueMissingFiles).toBe(1); // Only counts since last clear

    } finally {
      console.warn = originalWarn;
    }
  });

  test('should_handle_warning_deduplication_with_valid_and_missing_layouts', async () => {
    // Arrange: Mix of valid and missing layouts
    mockFileSystem['valid-layout.html'] = `
      <html>
        <head><title>Valid Layout</title></head>
        <body><div class="unify-content">Valid content</div></body>
      </html>
    `;

    const validPageHtml = `
      <html data-unify="valid-layout.html">
        <head><title>Valid Page</title></head>
        <body><div class="unify-content">Valid page</div></body>
      </html>
    `;

    const missingPageHtml = `
      <html data-unify="missing-layout.html">
        <head><title>Missing Page</title></head>
        <body><div class="unify-content">Missing page</div></body>
      </html>
    `;

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      // Act: Process valid, missing, valid, missing pattern
      await processor.processFile('valid1.html', validPageHtml, mockFileSystem, '/test', {});
      await processor.processFile('missing1.html', missingPageHtml, mockFileSystem, '/test', {});
      await processor.processFile('valid2.html', validPageHtml, mockFileSystem, '/test', {});
      await processor.processFile('missing2.html', missingPageHtml, mockFileSystem, '/test', {});

      // Assert: Should only warn once for missing layout
      const missingWarnings = warnings.filter(w => w.includes('missing-layout.html'));
      expect(missingWarnings.length).toBe(1);

      // Statistics should reflect the processing
      const stats = processor.getCacheStats();
      expect(stats.layoutCacheHits).toBeGreaterThan(0); // Valid layout cached and reused
      expect(stats.layoutMissing).toBe(2); // Two attempts to load missing layout
      expect(stats.uniqueMissingFiles).toBe(1); // One unique missing file

    } finally {
      console.warn = originalWarn;
    }
  });
});

/**
 * This test file verifies that the warning deduplication feature
 * works correctly to reduce noise during builds while still
 * maintaining accurate statistics and proper cache behavior.
 */