/**
 * Enhanced Incremental Builder Tests
 * Implements US-014: Incremental Build System with Dependency Tracking
 * 
 * Tests for enhanced incremental builder that meets <1 second performance
 * requirements and integrates with dependency tracking and build cache.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { IncrementalBuilder } from '../../../src/core/incremental-builder.js';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

describe('Enhanced IncrementalBuilder', () => {
  let builder;
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sourceDir = join(tempDir, 'src');
    outputDir = join(tempDir, 'dist');
    
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    
    builder = new IncrementalBuilder();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Single File Change Performance', () => {
    test('should_rebuild_in_under_1_second_when_single_page_changes', async () => {
      // Arrange
      const pagePath = join(sourceDir, 'page.html');
      const layoutPath = join(sourceDir, '_layout.html');
      
      writeFileSync(layoutPath, '<html><body><div class="unify-content">Layout content</div></body></html>');
      writeFileSync(pagePath, '<body data-unify="_layout.html"><div class="unify-content">Page content</div></body>');

      // Perform initial build
      await builder.performInitialBuild(sourceDir, outputDir);

      // Modify page content
      const modifiedContent = '<body data-unify="_layout.html"><div class="unify-content">Modified page content</div></body>';
      writeFileSync(pagePath, modifiedContent);

      // Act
      const startTime = Date.now();
      const result = await builder.performIncrementalBuild(pagePath, sourceDir, outputDir);
      const endTime = Date.now();

      // Assert
      const buildTime = endTime - startTime;
      expect(buildTime).toBeLessThan(1000); // Must be under 1 second
      expect(result.success).toBe(true);
      expect(result.rebuiltFiles).toBe(1);
      expect(result.buildTime).toBeLessThan(1000);
    });

    test('should_rebuild_dependencies_in_under_1_second_when_fragment_changes', async () => {
      // Arrange
      const page1Path = join(sourceDir, 'page1.html');
      const page2Path = join(sourceDir, 'page2.html');
      const fragmentPath = join(sourceDir, '_fragment.html');
      
      writeFileSync(fragmentPath, '<div class="unify-widget">Fragment content</div>');
      writeFileSync(page1Path, '<body><div data-unify="_fragment.html"></div></body>');
      writeFileSync(page2Path, '<body><div data-unify="_fragment.html"></div></body>');

      // Perform initial build to establish dependencies
      await builder.performInitialBuild(sourceDir, outputDir);

      // Track dependencies manually for testing
      await builder.dependencyTracker.trackPageDependencies(
        page1Path, 
        readFileSync(page1Path, 'utf8'), 
        sourceDir
      );
      await builder.dependencyTracker.trackPageDependencies(
        page2Path, 
        readFileSync(page2Path, 'utf8'), 
        sourceDir
      );

      // Modify fragment
      const modifiedFragment = '<div class="unify-widget">Modified fragment content</div>';
      writeFileSync(fragmentPath, modifiedFragment);

      // Act
      const startTime = Date.now();
      const result = await builder.performIncrementalBuild(fragmentPath, sourceDir, outputDir);
      const endTime = Date.now();

      // Assert
      const buildTime = endTime - startTime;
      expect(buildTime).toBeLessThan(1000); // Must be under 1 second
      expect(result.success).toBe(true);
      expect(result.rebuiltFiles).toBeGreaterThanOrEqual(2); // Both dependent pages
    });

    test('should_copy_assets_in_under_1_second_when_asset_changes', async () => {
      // Arrange
      const pagePath = join(sourceDir, 'page.html');
      const cssPath = join(sourceDir, 'assets', 'style.css');
      const imagePath = join(sourceDir, 'assets', 'image.jpg');
      
      mkdirSync(dirname(cssPath), { recursive: true });
      mkdirSync(dirname(imagePath), { recursive: true });
      
      writeFileSync(cssPath, 'body { color: red; }');
      writeFileSync(imagePath, 'fake-image-data');
      writeFileSync(pagePath, `
        <html>
          <head><link rel="stylesheet" href="assets/style.css"></head>
          <body><img src="assets/image.jpg" alt="Test"></body>
        </html>
      `);

      // Perform initial build
      await builder.performInitialBuild(sourceDir, outputDir);

      // Modify CSS file
      writeFileSync(cssPath, 'body { color: blue; }');

      // Act
      const startTime = Date.now();
      const result = await builder.performIncrementalBuild(cssPath, sourceDir, outputDir);
      const endTime = Date.now();

      // Assert
      const buildTime = endTime - startTime;
      expect(buildTime).toBeLessThan(1000); // Must be under 1 second
      expect(result.success).toBe(true);
      expect(result.copiedAssets).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Selective Rebuilding', () => {
    test('should_rebuild_only_dependent_pages_when_fragment_changes', async () => {
      // Arrange
      const page1Path = join(sourceDir, 'page1.html');
      const page2Path = join(sourceDir, 'page2.html');
      const page3Path = join(sourceDir, 'page3.html');
      const fragmentPath = join(sourceDir, '_fragment.html');
      
      writeFileSync(fragmentPath, '<div class="unify-widget">Fragment content</div>');
      writeFileSync(page1Path, '<body><div data-unify="_fragment.html"></div></body>');
      writeFileSync(page2Path, '<body><div data-unify="_fragment.html"></div></body>');
      writeFileSync(page3Path, '<body><div>Independent content</div></body>'); // No dependency
      
      // Perform initial build
      await builder.performInitialBuild(sourceDir, outputDir);

      // Track dependencies manually for testing
      await builder.dependencyTracker.trackPageDependencies(
        page1Path, 
        readFileSync(page1Path, 'utf8'), 
        sourceDir
      );
      await builder.dependencyTracker.trackPageDependencies(
        page2Path, 
        readFileSync(page2Path, 'utf8'), 
        sourceDir
      );
      await builder.dependencyTracker.trackPageDependencies(
        page3Path, 
        readFileSync(page3Path, 'utf8'), 
        sourceDir
      );

      // Get initial file timestamps
      const page3OutputPath = join(outputDir, 'page3.html');
      const page3InitialTime = existsSync(page3OutputPath) ? 
        Bun.file(page3OutputPath).lastModified : 0;

      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // Modify fragment
      writeFileSync(fragmentPath, '<div class="unify-widget">Modified fragment</div>');

      // Act
      const result = await builder.performIncrementalBuild(fragmentPath, sourceDir, outputDir);

      // Assert
      expect(result.success).toBe(true);
      expect(result.rebuiltFiles).toBe(2); // Only page1 and page2, not page3
      
      // Verify page3 was not rebuilt (timestamp unchanged)
      if (existsSync(page3OutputPath)) {
        const page3FinalTime = Bun.file(page3OutputPath).lastModified;
        expect(page3FinalTime).toBe(page3InitialTime);
      }
    });

    test('should_rebuild_only_changed_page_when_page_changes', async () => {
      // Arrange
      const page1Path = join(sourceDir, 'page1.html');
      const page2Path = join(sourceDir, 'page2.html');
      
      writeFileSync(page1Path, '<html><body>Page 1 content</body></html>');
      writeFileSync(page2Path, '<html><body>Page 2 content</body></html>');
      
      // Perform initial build
      await builder.performInitialBuild(sourceDir, outputDir);

      // Get initial timestamp for page2
      const page2OutputPath = join(outputDir, 'page2.html');
      const page2InitialTime = existsSync(page2OutputPath) ? 
        Bun.file(page2OutputPath).lastModified : 0;

      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      // Modify only page1
      writeFileSync(page1Path, '<html><body>Modified page 1 content</body></html>');

      // Act
      const result = await builder.performIncrementalBuild(page1Path, sourceDir, outputDir);

      // Assert
      expect(result.success).toBe(true);
      expect(result.rebuiltFiles).toBe(1); // Only page1
      
      // Verify page2 was not rebuilt
      if (existsSync(page2OutputPath)) {
        const page2FinalTime = Bun.file(page2OutputPath).lastModified;
        expect(page2FinalTime).toBe(page2InitialTime);
      }
    });

    test('should_not_rebuild_unrelated_pages_when_isolated_change', async () => {
      // Arrange
      const blogDir = join(sourceDir, 'blog');
      const docsDir = join(sourceDir, 'docs');
      mkdirSync(blogDir, { recursive: true });
      mkdirSync(docsDir, { recursive: true });
      
      const blogPostPath = join(blogDir, 'post.html');
      const docsPagePath = join(docsDir, 'guide.html');
      const blogLayoutPath = join(blogDir, '_layout.html');
      
      writeFileSync(blogLayoutPath, '<html><body><div class="unify-content">Blog layout</div></body></html>');
      writeFileSync(blogPostPath, '<body data-unify="_layout.html"><div class="unify-content">Blog post</div></body>');
      writeFileSync(docsPagePath, '<html><body>Documentation page</body></html>');
      
      // Perform initial build
      await builder.performInitialBuild(sourceDir, outputDir);

      // Track dependencies
      await builder.dependencyTracker.trackPageDependencies(
        blogPostPath, 
        readFileSync(blogPostPath, 'utf8'), 
        sourceDir
      );
      await builder.dependencyTracker.trackPageDependencies(
        docsPagePath, 
        readFileSync(docsPagePath, 'utf8'), 
        sourceDir
      );

      // Get initial timestamp for docs page
      const docsOutputPath = join(outputDir, 'docs', 'guide.html');
      const docsInitialTime = existsSync(docsOutputPath) ? 
        Bun.file(docsOutputPath).lastModified : 0;

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 10));

      // Modify blog layout (should not affect docs)
      writeFileSync(blogLayoutPath, '<html><body><div class="unify-content">Modified blog layout</div></body></html>');

      // Act
      const result = await builder.performIncrementalBuild(blogLayoutPath, sourceDir, outputDir);

      // Assert
      expect(result.success).toBe(true);
      
      // Verify docs page was not affected
      if (existsSync(docsOutputPath)) {
        const docsFinalTime = Bun.file(docsOutputPath).lastModified;
        expect(docsFinalTime).toBe(docsInitialTime);
      }
    });
  });

  describe('Large Site Performance', () => {
    test('should_handle_100_page_site_efficiently_when_single_change', async () => {
      // Arrange
      const layoutPath = join(sourceDir, '_layout.html');
      writeFileSync(layoutPath, '<html><body><div class="unify-content">Layout</div></body></html>');
      
      // Create 100 pages
      const pages = [];
      for (let i = 0; i < 100; i++) {
        const pagePath = join(sourceDir, `page${i}.html`);
        writeFileSync(pagePath, `<body data-unify="_layout.html"><div class="unify-content">Page ${i}</div></body>`);
        pages.push(pagePath);
      }

      // Perform initial build
      const initialResult = await builder.performInitialBuild(sourceDir, outputDir);
      expect(initialResult.success).toBe(true);

      // Track dependencies for all pages
      for (const page of pages) {
        await builder.dependencyTracker.trackPageDependencies(
          page, 
          readFileSync(page, 'utf8'), 
          sourceDir
        );
      }

      // Modify just one page
      const targetPage = pages[50];
      writeFileSync(targetPage, '<body data-unify="_layout.html"><div class="unify-content">Modified page 50</div></body>');

      // Act
      const startTime = Date.now();
      const result = await builder.performIncrementalBuild(targetPage, sourceDir, outputDir);
      const endTime = Date.now();

      // Assert
      const buildTime = endTime - startTime;
      expect(buildTime).toBeLessThan(1000); // Must complete in under 1 second
      expect(result.success).toBe(true);
      expect(result.rebuiltFiles).toBe(1); // Only the changed page
    });

    test('should_handle_1000_dependency_relationships_when_tracking', async () => {
      // Arrange
      const layoutPath = join(sourceDir, '_layout.html');
      const componentPath = join(sourceDir, '_component.html');
      
      writeFileSync(layoutPath, '<html><body><div class="unify-content">Layout</div></body></html>');
      writeFileSync(componentPath, '<div class="unify-widget">Component</div>');
      
      // Create pages with various dependency patterns
      const pages = [];
      for (let i = 0; i < 500; i++) {
        const pagePath = join(sourceDir, `page${i}.html`);
        let content;
        
        if (i % 3 === 0) {
          // Use layout
          content = `<body data-unify="_layout.html"><div class="unify-content">Page ${i}</div></body>`;
        } else if (i % 3 === 1) {
          // Use component
          content = `<body><div data-unify="_component.html"></div><p>Page ${i}</p></body>`;
        } else {
          // Use both
          content = `<body data-unify="_layout.html"><div data-unify="_component.html"></div><div class="unify-content">Page ${i}</div></body>`;
        }
        
        writeFileSync(pagePath, content);
        pages.push({ path: pagePath, content });
      }

      // Act - Track all dependencies
      const startTime = Date.now();
      
      for (const page of pages) {
        await builder.dependencyTracker.trackPageDependencies(
          page.path, 
          page.content, 
          sourceDir
        );
      }
      
      const endTime = Date.now();

      // Assert
      const trackingTime = endTime - startTime;
      expect(trackingTime).toBeLessThan(5000); // Should complete in under 5 seconds
      
      // Verify dependency tracking is working
      const stats = builder.dependencyTracker.getStats();
      expect(stats.totalPages).toBe(500);
      expect(stats.totalDependencies).toBeGreaterThan(500); // Many dependencies tracked
    });

    test('should_minimize_memory_usage_when_processing_large_sites', async () => {
      // Arrange
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create many files
      for (let i = 0; i < 200; i++) {
        const pagePath = join(sourceDir, `page${i}.html`);
        const content = `<html><body>Page ${i} with some content</body></html>`;
        writeFileSync(pagePath, content);
      }

      // Act - Perform initial build
      await builder.performInitialBuild(sourceDir, outputDir);

      // Perform several incremental builds
      for (let i = 0; i < 10; i++) {
        const pagePath = join(sourceDir, `page${i * 10}.html`);
        writeFileSync(pagePath, `<html><body>Modified page ${i * 10}</body></html>`);
        await builder.performIncrementalBuild(pagePath, sourceDir, outputDir);
      }

      // Assert
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024); // MB
      
      // Should use less than 100MB for 200 pages
      expect(memoryIncrease).toBeLessThan(100);
    });
  });

  describe('Build Cache Integration', () => {
    test('should_use_cache_to_skip_unchanged_files', async () => {
      // Arrange
      const page1Path = join(sourceDir, 'page1.html');
      const page2Path = join(sourceDir, 'page2.html');
      
      writeFileSync(page1Path, '<html><body>Page 1</body></html>');
      writeFileSync(page2Path, '<html><body>Page 2</body></html>');
      
      // Perform initial build
      const initialResult = await builder.performInitialBuild(sourceDir, outputDir);
      expect(initialResult.success).toBe(true);

      // Modify only one file
      writeFileSync(page1Path, '<html><body>Modified Page 1</body></html>');

      // Act - Perform incremental build
      const result = await builder.performIncrementalBuild(page1Path, sourceDir, outputDir);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cacheInvalidations).toBeLessThanOrEqual(1); // Only one file invalidated
    });

    test('should_persist_cache_across_build_sessions', async () => {
      // Arrange
      const pagePath = join(sourceDir, 'page.html');
      writeFileSync(pagePath, '<html><body>Page content</body></html>');
      
      // First build session
      const firstBuilder = new IncrementalBuilder();
      await firstBuilder.performInitialBuild(sourceDir, outputDir);

      // Act - Second build session (new builder instance)
      const secondBuilder = new IncrementalBuilder();
      const result = await secondBuilder.performInitialBuild(sourceDir, outputDir);

      // Assert - Should use cache from previous session
      expect(result.success).toBe(true);
      expect(result.cacheHits).toBeGreaterThan(0); // Should have cache hits
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should_handle_missing_dependencies_gracefully', async () => {
      // Arrange
      const pagePath = join(sourceDir, 'page.html');
      writeFileSync(pagePath, '<body data-unify="missing-fragment.html">Content</body>');

      // Act & Assert - Should not crash
      const result = await builder.performIncrementalBuild(pagePath, sourceDir, outputDir);
      
      // Should handle gracefully (may succeed or fail, but not crash)
      expect(typeof result.success).toBe('boolean');
      expect(result).toHaveProperty('buildTime');
    });

    test('should_recover_from_filesystem_errors', async () => {
      // Arrange
      const pagePath = join(sourceDir, 'page.html');
      writeFileSync(pagePath, '<html><body>Page content</body></html>');

      // Create read-only output directory to simulate permission error
      const restrictedOutputDir = join(tempDir, 'restricted');
      mkdirSync(restrictedOutputDir, { mode: 0o444 }); // Read-only

      // Act
      const result = await builder.performIncrementalBuild(pagePath, sourceDir, restrictedOutputDir);

      // Assert - Should handle error gracefully
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('error');
      expect(result.buildTime).toBeGreaterThan(0);
    });

    test('should_maintain_consistency_after_build_errors', async () => {
      // Arrange
      const page1Path = join(sourceDir, 'page1.html');
      const page2Path = join(sourceDir, 'page2.html');
      
      writeFileSync(page1Path, '<html><body>Page 1</body></html>');
      writeFileSync(page2Path, '<html><body>Page 2</body></html>');
      
      // Perform successful initial build
      await builder.performInitialBuild(sourceDir, outputDir);

      // Create a problematic file
      writeFileSync(page1Path, '<invalid-html'); // Malformed HTML

      // Act - Try to build problematic file
      const result1 = await builder.performIncrementalBuild(page1Path, sourceDir, outputDir);

      // Fix the file and try again
      writeFileSync(page1Path, '<html><body>Fixed Page 1</body></html>');
      const result2 = await builder.performIncrementalBuild(page1Path, sourceDir, outputDir);

      // Assert - Should recover and work normally
      expect(result2.success).toBe(true);
      
      // Other files should still work normally
      const result3 = await builder.performIncrementalBuild(page2Path, sourceDir, outputDir);
      expect(result3.success).toBe(true);
    });
  });
});