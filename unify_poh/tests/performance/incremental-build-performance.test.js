/**
 * Performance Tests for Incremental Build System
 * Implements US-014: Incremental Build System with Dependency Tracking
 * 
 * Validates that incremental builds meet the <1 second performance requirement
 * for single file changes, even on larger sites.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { IncrementalBuilder } from '../../src/core/incremental-builder.js';
import { DependencyTracker } from '../../src/core/dependency-tracker.js';
import { BuildCache } from '../../src/core/build-cache.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';

describe('Incremental Build Performance', () => {
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sourceDir = join(tempDir, 'src');
    outputDir = join(tempDir, 'dist');
    
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Core Performance Requirements', () => {
    test('should_meet_1_second_requirement_for_single_file_changes', async () => {
      // Arrange - Create a realistic site structure
      const builder = new IncrementalBuilder();
      
      // Create base layout
      const layoutPath = join(sourceDir, '_layout.html');
      writeFileSync(layoutPath, `
        <html>
          <head><title>Site Layout</title></head>
          <body>
            <header>Site Header</header>
            <div class="unify-content">Default content</div>
            <footer>Site Footer</footer>
          </body>
        </html>
      `);
      
      // Create 50 pages that use the layout
      const pages = [];
      for (let i = 1; i <= 50; i++) {
        const pagePath = join(sourceDir, `page${i}.html`);
        writeFileSync(pagePath, `
          <body data-unify="_layout.html">
            <div class="unify-content">
              <h1>Page ${i}</h1>
              <p>Content for page ${i}</p>
              <img src="assets/image${i}.jpg" alt="Image ${i}">
            </div>
          </body>
        `);
        pages.push(pagePath);
      }
      
      // Create assets directory with referenced files
      const assetsDir = join(sourceDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });
      for (let i = 1; i <= 50; i++) {
        writeFileSync(join(assetsDir, `image${i}.jpg`), `fake-image-data-${i}`);
      }
      
      // Perform initial build to establish baseline
      await builder.performInitialBuild(sourceDir, outputDir);
      
      // Track dependencies for faster lookups
      for (const page of pages) {
        const content = Bun.file(page);
        if (await content.exists()) {
          await builder.dependencyTracker.trackPageDependencies(
            page, 
            await content.text(), 
            sourceDir
          );
        }
      }

      // Act - Modify a single page and measure incremental build time
      const targetPage = pages[25]; // Middle page
      writeFileSync(targetPage, `
        <body data-unify="_layout.html">
          <div class="unify-content">
            <h1>Modified Page 26</h1>
            <p>This page has been updated</p>
            <img src="assets/image26.jpg" alt="Updated Image 26">
          </div>
        </body>
      `);

      const startTime = Date.now();
      const result = await builder.performIncrementalBuild(targetPage, sourceDir, outputDir);
      const endTime = Date.now();

      // Assert - Must complete in under 1 second
      const buildTime = endTime - startTime;
      expect(buildTime).toBeLessThan(1000);
      expect(result.success).toBe(true);
      expect(result.rebuiltFiles).toBe(1); // Only one page rebuilt
      
      console.log(`Single file incremental build completed in ${buildTime}ms`);
    });

    test('should_meet_memory_requirements_for_large_sites', async () => {
      // Arrange - Create large site with many dependencies
      const builder = new IncrementalBuilder();
      const tracker = new DependencyTracker();
      const cache = new BuildCache();
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create 500 pages with various dependency patterns
      for (let i = 1; i <= 500; i++) {
        const pagePath = join(sourceDir, `page${i}.html`);
        const content = `
          <html>
            <head>
              <link rel="stylesheet" href="styles/page${i}.css">
              <script src="scripts/page${i}.js"></script>
            </head>
            <body>
              <h1>Page ${i}</h1>
              <img src="images/hero${i}.jpg" alt="Hero">
              <img src="images/thumb${i}.jpg" alt="Thumbnail">
            </body>
          </html>
        `;
        writeFileSync(pagePath, content);
        
        // Track dependencies
        await tracker.trackPageDependencies(pagePath, content, sourceDir);
        
        // Add to cache
        await cache.storeFileHash(pagePath, content);
      }

      // Act & Assert - Memory usage should be reasonable
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024); // MB
      
      // Should use less than 50MB for 500 pages with dependencies
      expect(memoryIncrease).toBeLessThan(50);
      
      // Verify tracking is working
      expect(tracker.getStats().totalPages).toBe(500);
      expect(cache.getStats().totalFiles).toBe(500);
      
      console.log(`Memory usage for 500 pages: ${memoryIncrease.toFixed(2)}MB`);
    });

    test('should_meet_startup_time_requirements_for_initial_build', async () => {
      // Arrange - Create medium-sized site
      const builder = new IncrementalBuilder();
      
      // Create 100 pages with realistic complexity
      for (let i = 1; i <= 100; i++) {
        const pagePath = join(sourceDir, `page${i}.html`);
        writeFileSync(pagePath, `
          <html>
            <head>
              <title>Page ${i}</title>
              <meta name="description" content="Description for page ${i}">
              <link rel="stylesheet" href="../styles/main.css">
            </head>
            <body>
              <h1>Welcome to Page ${i}</h1>
              <nav>Navigation content</nav>
              <main>Main content for page ${i}</main>
              <footer>Footer content</footer>
            </body>
          </html>
        `);
      }

      // Act - Measure initial build time
      const startTime = Date.now();
      const result = await builder.performInitialBuild(sourceDir, outputDir);
      const endTime = Date.now();

      // Assert - Initial build should complete in reasonable time
      const buildTime = endTime - startTime;
      expect(buildTime).toBeLessThan(5000); // Under 5 seconds for 100 pages
      expect(result.success).toBe(true);
      
      console.log(`Initial build of 100 pages completed in ${buildTime}ms`);
    });
  });

  describe('Scalability Testing', () => {
    test('should_scale_linearly_with_dependency_count', async () => {
      // Arrange - Test with different dependency counts
      const builder = new IncrementalBuilder();
      const results = [];
      
      const dependencyCounts = [10, 50, 100, 200];
      
      for (const count of dependencyCounts) {
        // Clean up previous test
        rmSync(tempDir, { recursive: true, force: true });
        mkdirSync(sourceDir, { recursive: true });
        mkdirSync(outputDir, { recursive: true });
        
        // Create files with dependencies
        for (let i = 1; i <= count; i++) {
          const pagePath = join(sourceDir, `page${i}.html`);
          writeFileSync(pagePath, `
            <html>
              <body>
                <h1>Page ${i}</h1>
                <img src="image${i}.jpg">
                <link href="style${i}.css">
              </body>
            </html>
          `);
        }
        
        // Measure build time
        const startTime = Date.now();
        await builder.performInitialBuild(sourceDir, outputDir);
        const endTime = Date.now();
        
        const buildTime = endTime - startTime;
        results.push({ count, buildTime });
      }

      // Assert - Build time should scale roughly linearly
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1];
        const curr = results[i];
        
        // Build time per file should not increase dramatically
        const prevRatio = prev.buildTime / prev.count;
        const currRatio = curr.buildTime / curr.count;
        
        // Current ratio should not be more than 3x the previous ratio
        expect(currRatio).toBeLessThan(prevRatio * 3);
      }
      
      console.log('Scalability results:');
      results.forEach(r => {
        console.log(`  ${r.count} files: ${r.buildTime}ms (${(r.buildTime / r.count).toFixed(2)}ms/file)`);
      });
    });

    test('should_maintain_performance_with_deep_dependency_trees', async () => {
      // Arrange - Create deep dependency tree (layout -> layout -> layout)
      const builder = new IncrementalBuilder();
      
      // Create nested layouts (5 levels deep)
      const layouts = [];
      for (let i = 1; i <= 5; i++) {
        const layoutPath = join(sourceDir, `_layout${i}.html`);
        const nextLayout = i < 5 ? `_layout${i + 1}.html` : null;
        
        writeFileSync(layoutPath, `
          <html>
            <head><title>Layout ${i}</title></head>
            <body ${nextLayout ? `data-unify="${nextLayout}"` : ''}>
              <div class="layout-${i}">
                <h${i}>Layout Level ${i}</h${i}>
                <div class="unify-content">Content from level ${i}</div>
              </div>
            </body>
          </html>
        `);
        layouts.push(layoutPath);
      }
      
      // Create pages that use the deepest layout
      const pages = [];
      for (let i = 1; i <= 20; i++) {
        const pagePath = join(sourceDir, `page${i}.html`);
        writeFileSync(pagePath, `
          <body data-unify="_layout1.html">
            <div class="unify-content">
              <h1>Page ${i}</h1>
              <p>Deep nested content</p>
            </div>
          </body>
        `);
        pages.push(pagePath);
      }
      
      // Perform initial build
      await builder.performInitialBuild(sourceDir, outputDir);
      
      // Track dependencies for deep nesting
      for (const page of pages) {
        const content = await Bun.file(page).text();
        await builder.dependencyTracker.trackPageDependencies(page, content, sourceDir);
      }
      
      // Act - Modify deepest layout and measure impact
      const deepestLayout = layouts[4]; // _layout5.html
      writeFileSync(deepestLayout, `
        <html>
          <head><title>Modified Layout 5</title></head>
          <body>
            <div class="layout-5 modified">
              <h5>Modified Layout Level 5</h5>
              <div class="unify-content">Modified content from level 5</div>
            </div>
          </body>
        </html>
      `);

      const startTime = Date.now();
      const result = await builder.performIncrementalBuild(deepestLayout, sourceDir, outputDir);
      const endTime = Date.now();

      // Assert - Should still complete quickly despite deep dependencies
      const buildTime = endTime - startTime;
      expect(buildTime).toBeLessThan(2000); // Allow up to 2 seconds for deep dependencies
      expect(result.success).toBe(true);
      
      console.log(`Deep dependency rebuild completed in ${buildTime}ms`);
    });

    test('should_handle_wide_dependency_graphs_efficiently', async () => {
      // Arrange - Create wide dependency graph (many components used by many pages)
      const builder = new IncrementalBuilder();
      
      // Create 10 widely-used components
      const components = [];
      for (let i = 1; i <= 10; i++) {
        const componentPath = join(sourceDir, `_component${i}.html`);
        writeFileSync(componentPath, `
          <div class="component-${i}">
            <h3>Component ${i}</h3>
            <div class="unify-content">Component ${i} content</div>
          </div>
        `);
        components.push(componentPath);
      }
      
      // Create 100 pages that each use multiple components
      const pages = [];
      for (let i = 1; i <= 100; i++) {
        const pagePath = join(sourceDir, `page${i}.html`);
        const usedComponents = [];
        
        // Each page uses 3-5 random components
        const componentCount = 3 + (i % 3);
        for (let j = 0; j < componentCount; j++) {
          const componentIndex = (i + j) % 10;
          usedComponents.push(`_component${componentIndex + 1}.html`);
        }
        
        const componentImports = usedComponents.map(comp => 
          `<div data-unify="${comp}"></div>`
        ).join('\n        ');
        
        writeFileSync(pagePath, `
          <html>
            <body>
              <h1>Page ${i}</h1>
              ${componentImports}
            </body>
          </html>
        `);
        pages.push(pagePath);
      }
      
      // Perform initial build
      await builder.performInitialBuild(sourceDir, outputDir);
      
      // Track all dependencies
      for (const page of pages) {
        const content = await Bun.file(page).text();
        await builder.dependencyTracker.trackPageDependencies(page, content, sourceDir);
      }
      
      // Act - Modify a widely-used component
      const popularComponent = components[0]; // component1 used by many pages
      writeFileSync(popularComponent, `
        <div class="component-1 updated">
          <h3>Updated Component 1</h3>
          <div class="unify-content">Updated component 1 content</div>
        </div>
      `);

      const startTime = Date.now();
      const result = await builder.performIncrementalBuild(popularComponent, sourceDir, outputDir);
      const endTime = Date.now();

      // Assert - Should handle wide dependencies efficiently
      const buildTime = endTime - startTime;
      expect(buildTime).toBeLessThan(1500); // Allow up to 1.5 seconds for wide dependencies
      expect(result.success).toBe(true);
      
      // Should have rebuilt multiple pages
      const dependentPages = builder.dependencyTracker.getDependentPages(popularComponent);
      expect(dependentPages.length).toBeGreaterThan(10); // Many pages depend on this component
      
      console.log(`Wide dependency rebuild completed in ${buildTime}ms`);
      console.log(`Rebuilt ${dependentPages.length} dependent pages`);
    });
  });
});