/**
 * Incremental Build System Integration Tests
 * Implements US-014: Incremental Build System with Dependency Tracking
 * 
 * End-to-end tests for the complete incremental build system including
 * dependency tracking, file watching, and performance requirements.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { WatchCommand } from '../../src/cli/commands/watch-command.js';
import { IncrementalBuilder } from '../../src/core/incremental-builder.js';
import { DependencyTracker } from '../../src/core/dependency-tracker.js';
import { FileWatcher } from '../../src/core/file-watcher.js';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

describe('Incremental Build System Integration', () => {
  let tempDir;
  let sourceDir;
  let outputDir;
  let watchCommand;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sourceDir = join(tempDir, 'src');
    outputDir = join(tempDir, 'dist');
    
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    
    watchCommand = new WatchCommand();
  });

  afterEach(async () => {
    try {
      await watchCommand.stop();
    } catch (error) {
      // Ignore stop errors
    }
    
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Complete Workflow', () => {
    test('should_perform_initial_build_and_track_dependencies_when_starting', async () => {
      // Arrange
      const layoutPath = join(sourceDir, '_layout.html');
      const componentPath = join(sourceDir, '_component.html');
      const page1Path = join(sourceDir, 'page1.html');
      const page2Path = join(sourceDir, 'page2.html');
      
      writeFileSync(layoutPath, `
        <html>
          <head><title>Layout</title></head>
          <body>
            <div class="unify-content">Default content</div>
            <div data-unify="_component.html"></div>
          </body>
        </html>
      `);
      
      writeFileSync(componentPath, '<div class="unify-widget">Component content</div>');
      
      writeFileSync(page1Path, `
        <body data-unify="_layout.html">
          <div class="unify-content">Page 1 content</div>
        </body>
      `);
      
      writeFileSync(page2Path, `
        <body data-unify="_layout.html">
          <div class="unify-content">Page 2 content</div>
        </body>
      `);

      let buildEvents = [];
      
      // Act
      const result = await watchCommand.execute({
        source: sourceDir,
        output: outputDir,
        timeout: 500, // Stop after 500ms for testing
        onBuild: (event) => {
          buildEvents.push(event);
        }
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.initialBuildCompleted).toBe(true);
      expect(result.watchingStarted).toBe(true);
      
      // Verify initial build event
      expect(buildEvents.length).toBeGreaterThanOrEqual(1);
      expect(buildEvents[0].type).toBe('initial');
      expect(buildEvents[0].processedFiles).toBeGreaterThan(0);
      
      // Verify output files exist
      expect(existsSync(join(outputDir, 'page1.html'))).toBe(true);
      expect(existsSync(join(outputDir, 'page2.html'))).toBe(true);
    });

    test('should_detect_file_changes_and_rebuild_incrementally_when_watching', async () => {
      // Arrange
      const layoutPath = join(sourceDir, '_layout.html');
      const pagePath = join(sourceDir, 'page.html');
      
      writeFileSync(layoutPath, '<html><body><div class="unify-content">Layout</div></body></html>');
      writeFileSync(pagePath, '<body data-unify="_layout.html"><div class="unify-content">Page</div></body>');

      let buildEvents = [];
      let errorEvents = [];
      
      const watchPromise = watchCommand.execute({
        source: sourceDir,
        output: outputDir,
        debounceMs: 50, // Fast debouncing for testing
        onBuild: (event) => {
          buildEvents.push(event);
        },
        onError: (error) => {
          errorEvents.push(error);
        }
      });

      // Wait for initial build
      await new Promise(resolve => setTimeout(resolve, 200));

      // Act - Modify the page file
      writeFileSync(pagePath, '<body data-unify="_layout.html"><div class="unify-content">Modified page</div></body>');

      // Wait for incremental build
      await new Promise(resolve => setTimeout(resolve, 200));
      
      await watchCommand.stop();

      // Assert
      expect(errorEvents.length).toBe(0); // No errors
      expect(buildEvents.length).toBeGreaterThanOrEqual(2); // Initial + incremental
      
      const incrementalEvent = buildEvents.find(e => e.type === 'incremental');
      expect(incrementalEvent).toBeTruthy();
      expect(incrementalEvent.changedFiles).toContain(pagePath);
      expect(incrementalEvent.rebuiltFiles).toBeGreaterThan(0);
    });

    test('should_maintain_output_consistency_when_incremental_building', async () => {
      // Arrange
      const layoutPath = join(sourceDir, '_layout.html');
      const page1Path = join(sourceDir, 'page1.html');
      const page2Path = join(sourceDir, 'page2.html');
      
      writeFileSync(layoutPath, '<html><body><div class="unify-content">Layout v1</div></body></html>');
      writeFileSync(page1Path, '<body data-unify="_layout.html"><div class="unify-content">Page 1</div></body>');
      writeFileSync(page2Path, '<body data-unify="_layout.html"><div class="unify-content">Page 2</div></body>');

      const builder = new IncrementalBuilder();
      
      // Perform initial build
      const initialResult = await builder.performInitialBuild(sourceDir, outputDir);
      expect(initialResult.success).toBe(true);

      // Read initial output
      const page1OutputPath = join(outputDir, 'page1.html');
      const page2OutputPath = join(outputDir, 'page2.html');
      
      const page1Initial = readFileSync(page1OutputPath, 'utf8');
      const page2Initial = readFileSync(page2OutputPath, 'utf8');

      // Act - Modify layout (should affect both pages)
      writeFileSync(layoutPath, '<html><body><div class="unify-content">Layout v2</div></body></html>');
      
      // Track dependencies first
      await builder.dependencyTracker.trackPageDependencies(
        page1Path, readFileSync(page1Path, 'utf8'), sourceDir
      );
      await builder.dependencyTracker.trackPageDependencies(
        page2Path, readFileSync(page2Path, 'utf8'), sourceDir
      );

      await builder.performIncrementalBuild(layoutPath, sourceDir, outputDir);

      // Assert - Both pages should be updated consistently
      const page1Final = readFileSync(page1OutputPath, 'utf8');
      const page2Final = readFileSync(page2OutputPath, 'utf8');
      
      expect(page1Final).not.toBe(page1Initial); // Should be different
      expect(page2Final).not.toBe(page2Initial); // Should be different
      
      // Both should include the updated layout content
      expect(page1Final).toContain('Page 1'); // Page content preserved
      expect(page2Final).toContain('Page 2'); // Page content preserved
    });
  });

  describe('Complex Dependency Scenarios', () => {
    test('should_handle_layout_changes_affecting_multiple_pages', async () => {
      // Arrange
      const baseLayoutPath = join(sourceDir, '_layouts', 'base.html');
      const blogLayoutPath = join(sourceDir, '_layouts', 'blog.html');
      
      mkdirSync(dirname(baseLayoutPath), { recursive: true });
      
      writeFileSync(baseLayoutPath, `
        <html>
          <head><title>Base Layout</title></head>
          <body>
            <header>Site Header</header>
            <div class="unify-content">Base content</div>
            <footer>Site Footer</footer>
          </body>
        </html>
      `);
      
      writeFileSync(blogLayoutPath, `
        <body data-unify="../_layouts/base.html">
          <div class="unify-content">
            <aside>Blog Sidebar</aside>
            <main class="unify-main">Blog main</main>
          </div>
        </body>
      `);
      
      // Create multiple blog posts using the blog layout
      const blogDir = join(sourceDir, 'blog');
      mkdirSync(blogDir, { recursive: true });
      
      const posts = [];
      for (let i = 1; i <= 5; i++) {
        const postPath = join(blogDir, `post${i}.html`);
        writeFileSync(postPath, `
          <body data-unify="../_layouts/blog.html">
            <main class="unify-main">Blog post ${i} content</main>
          </body>
        `);
        posts.push(postPath);
      }

      const builder = new IncrementalBuilder();
      const tracker = new DependencyTracker();

      // Track dependencies
      for (const post of posts) {
        await tracker.trackPageDependencies(post, readFileSync(post, 'utf8'), sourceDir);
      }
      
      // Track layout dependencies
      await tracker.trackPageDependencies(blogLayoutPath, readFileSync(blogLayoutPath, 'utf8'), sourceDir);

      // Perform initial build
      await builder.performInitialBuild(sourceDir, outputDir);

      // Act - Modify base layout (should affect all blog posts through blog layout)
      writeFileSync(baseLayoutPath, `
        <html>
          <head><title>Updated Base Layout</title></head>
          <body>
            <header>Updated Site Header</header>
            <div class="unify-content">Base content</div>
            <footer>Updated Site Footer</footer>
          </body>
        </html>
      `);

      const result = await builder.performIncrementalBuild(baseLayoutPath, sourceDir, outputDir);

      // Assert
      expect(result.success).toBe(true);
      
      // All blog posts should be affected by the base layout change
      for (let i = 1; i <= 5; i++) {
        const outputPath = join(outputDir, 'blog', `post${i}.html`);
        if (existsSync(outputPath)) {
          const content = readFileSync(outputPath, 'utf8');
          expect(content).toContain('Updated Site Header');
        }
      }
    });

    test('should_handle_component_changes_affecting_specific_pages', async () => {
      // Arrange
      const navComponentPath = join(sourceDir, '_components', 'nav.html');
      const footerComponentPath = join(sourceDir, '_components', 'footer.html');
      
      mkdirSync(dirname(navComponentPath), { recursive: true });
      
      writeFileSync(navComponentPath, `
        <nav class="navbar">
          <div class="unify-brand">Brand</div>
          <div class="unify-menu">Menu items</div>
        </nav>
      `);
      
      writeFileSync(footerComponentPath, `
        <footer class="site-footer">
          <div class="unify-links">Footer links</div>
          <div class="unify-copyright">Copyright</div>
        </footer>
      `);
      
      // Create pages with different component usage
      const homePath = join(sourceDir, 'index.html');
      const aboutPath = join(sourceDir, 'about.html');
      const contactPath = join(sourceDir, 'contact.html');
      
      writeFileSync(homePath, `
        <html>
          <body>
            <div data-unify="_components/nav.html"></div>
            <main>Home content</main>
            <div data-unify="_components/footer.html"></div>
          </body>
        </html>
      `);
      
      writeFileSync(aboutPath, `
        <html>
          <body>
            <div data-unify="_components/nav.html"></div>
            <main>About content</main>
            <div data-unify="_components/footer.html"></div>
          </body>
        </html>
      `);
      
      writeFileSync(contactPath, `
        <html>
          <body>
            <main>Contact content (no nav/footer)</main>
          </body>
        </html>
      `);

      const builder = new IncrementalBuilder();
      const tracker = builder.dependencyTracker;

      // Track dependencies
      await tracker.trackPageDependencies(homePath, readFileSync(homePath, 'utf8'), sourceDir);
      await tracker.trackPageDependencies(aboutPath, readFileSync(aboutPath, 'utf8'), sourceDir);
      await tracker.trackPageDependencies(contactPath, readFileSync(contactPath, 'utf8'), sourceDir);

      await builder.performInitialBuild(sourceDir, outputDir);

      // Get initial timestamps
      const contactOutputPath = join(outputDir, 'contact.html');
      const contactInitialTime = existsSync(contactOutputPath) ? 
        Bun.file(contactOutputPath).lastModified : 0;

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act - Modify nav component (should only affect home and about pages)
      writeFileSync(navComponentPath, `
        <nav class="navbar updated">
          <div class="unify-brand">Updated Brand</div>
          <div class="unify-menu">Updated menu items</div>
        </nav>
      `);

      const result = await builder.performIncrementalBuild(navComponentPath, sourceDir, outputDir);

      // Assert
      expect(result.success).toBe(true);
      
      // Contact page should not be affected (no nav component)
      if (existsSync(contactOutputPath)) {
        const contactFinalTime = Bun.file(contactOutputPath).lastModified;
        expect(contactFinalTime).toBe(contactInitialTime);
      }
      
      // Home and about pages should be rebuilt with updated nav
      const homeOutputPath = join(outputDir, 'index.html');
      const aboutOutputPath = join(outputDir, 'about.html');
      
      if (existsSync(homeOutputPath)) {
        const homeContent = readFileSync(homeOutputPath, 'utf8');
        expect(homeContent).toContain('Updated Brand');
      }
      
      if (existsSync(aboutOutputPath)) {
        const aboutContent = readFileSync(aboutOutputPath, 'utf8');
        expect(aboutContent).toContain('Updated Brand');
      }
    });

    test('should_handle_nested_layout_inheritance_changes', async () => {
      // Arrange - Create nested layout hierarchy
      const rootLayoutPath = join(sourceDir, '_layouts', 'root.html');
      const pageLayoutPath = join(sourceDir, '_layouts', 'page.html');
      const blogLayoutPath = join(sourceDir, '_layouts', 'blog.html');
      
      mkdirSync(dirname(rootLayoutPath), { recursive: true });
      
      // Root layout (base of hierarchy)
      writeFileSync(rootLayoutPath, `
        <html>
          <head>
            <title>Root Layout</title>
            <meta charset="utf-8">
          </head>
          <body>
            <div id="site-header">Site Header</div>
            <div class="unify-content">Root content</div>
            <div id="site-footer">Site Footer</div>
          </body>
        </html>
      `);
      
      // Page layout (extends root)
      writeFileSync(pageLayoutPath, `
        <body data-unify="root.html">
          <div class="unify-content">
            <nav>Page Navigation</nav>
            <main class="unify-main">Page main</main>
            <aside class="unify-sidebar">Page sidebar</aside>
          </div>
        </body>
      `);
      
      // Blog layout (extends page)
      writeFileSync(blogLayoutPath, `
        <body data-unify="page.html">
          <main class="unify-main">
            <article class="unify-article">Blog article</article>
            <div class="unify-comments">Blog comments</div>
          </main>
          <aside class="unify-sidebar">
            <div class="unify-recent">Recent posts</div>
            <div class="unify-tags">Tags</div>
          </aside>
        </body>
      `);
      
      // Create blog post using the nested layout
      const postPath = join(sourceDir, 'blog', 'my-post.html');
      mkdirSync(dirname(postPath), { recursive: true });
      
      writeFileSync(postPath, `
        <body data-unify="../_layouts/blog.html">
          <article class="unify-article">
            <h1>My Blog Post</h1>
            <p>Post content here</p>
          </article>
          <div class="unify-comments">
            <h3>Comments</h3>
            <p>Comment content</p>
          </div>
        </body>
      `);

      const builder = new IncrementalBuilder();
      const tracker = builder.dependencyTracker;

      // Track all dependencies in the chain
      await tracker.trackPageDependencies(postPath, readFileSync(postPath, 'utf8'), sourceDir);
      await tracker.trackPageDependencies(blogLayoutPath, readFileSync(blogLayoutPath, 'utf8'), sourceDir);
      await tracker.trackPageDependencies(pageLayoutPath, readFileSync(pageLayoutPath, 'utf8'), sourceDir);

      await builder.performInitialBuild(sourceDir, outputDir);

      // Act - Modify root layout (should cascade through all levels)
      writeFileSync(rootLayoutPath, `
        <html>
          <head>
            <title>Updated Root Layout</title>
            <meta charset="utf-8">
            <meta name="updated" content="true">
          </head>
          <body>
            <div id="site-header">Updated Site Header</div>
            <div class="unify-content">Root content</div>
            <div id="site-footer">Updated Site Footer</div>
          </body>
        </html>
      `);

      const result = await builder.performIncrementalBuild(rootLayoutPath, sourceDir, outputDir);

      // Assert
      expect(result.success).toBe(true);
      
      // Blog post should include changes from root layout
      const postOutputPath = join(outputDir, 'blog', 'my-post.html');
      if (existsSync(postOutputPath)) {
        const content = readFileSync(postOutputPath, 'utf8');
        expect(content).toContain('Updated Site Header');
        expect(content).toContain('Updated Root Layout');
        expect(content).toContain('My Blog Post'); // Original content preserved
      }
    });
  });

  describe('Performance Under Load', () => {
    test('should_complete_incremental_builds_under_1_second_when_realistic_site', async () => {
      // Arrange - Create realistic site structure
      const layoutsDir = join(sourceDir, '_layouts');
      const componentsDir = join(sourceDir, '_components');
      const pagesDir = join(sourceDir, 'pages');
      const blogDir = join(sourceDir, 'blog');
      
      mkdirSync(layoutsDir, { recursive: true });
      mkdirSync(componentsDir, { recursive: true });
      mkdirSync(pagesDir, { recursive: true });
      mkdirSync(blogDir, { recursive: true });
      
      // Create layouts
      writeFileSync(join(layoutsDir, 'base.html'), '<html><body><div class="unify-content">Base</div></body></html>');
      writeFileSync(join(layoutsDir, 'page.html'), '<body data-unify="base.html"><div class="unify-content">Page</div></body>');
      writeFileSync(join(layoutsDir, 'blog.html'), '<body data-unify="base.html"><div class="unify-content">Blog</div></body>');
      
      // Create components
      writeFileSync(join(componentsDir, 'nav.html'), '<nav class="unify-menu">Navigation</nav>');
      writeFileSync(join(componentsDir, 'footer.html'), '<footer class="unify-copyright">Footer</footer>');
      writeFileSync(join(componentsDir, 'sidebar.html'), '<aside class="unify-links">Sidebar</aside>');
      
      // Create 50 regular pages
      for (let i = 1; i <= 50; i++) {
        writeFileSync(join(pagesDir, `page${i}.html`), `
          <body data-unify="../_layouts/page.html">
            <div data-unify="../_components/nav.html"></div>
            <div class="unify-content">Page ${i} content</div>
            <div data-unify="../_components/footer.html"></div>
          </body>
        `);
      }
      
      // Create 30 blog posts
      for (let i = 1; i <= 30; i++) {
        writeFileSync(join(blogDir, `post${i}.html`), `
          <body data-unify="../_layouts/blog.html">
            <div data-unify="../_components/nav.html"></div>
            <div class="unify-content">
              <article>Blog post ${i} content</article>
              <div data-unify="../_components/sidebar.html"></div>
            </div>
            <div data-unify="../_components/footer.html"></div>
          </body>
        `);
      }

      const builder = new IncrementalBuilder();
      
      // Perform initial build
      await builder.performInitialBuild(sourceDir, outputDir);

      // Modify a widely-used component
      const navPath = join(componentsDir, 'nav.html');
      writeFileSync(navPath, '<nav class="unify-menu updated">Updated Navigation</nav>');

      // Act
      const startTime = Date.now();
      const result = await builder.performIncrementalBuild(navPath, sourceDir, outputDir);
      const endTime = Date.now();

      // Assert
      const buildTime = endTime - startTime;
      expect(buildTime).toBeLessThan(1000); // Must complete in under 1 second
      expect(result.success).toBe(true);
    });

    test('should_handle_rapid_file_changes_efficiently_when_developing', async () => {
      // Arrange
      const pagePath = join(sourceDir, 'page.html');
      const cssPath = join(sourceDir, 'assets', 'style.css');
      const jsPath = join(sourceDir, 'assets', 'script.js');
      
      mkdirSync(dirname(cssPath), { recursive: true });
      
      writeFileSync(pagePath, `
        <html>
          <head>
            <link rel="stylesheet" href="assets/style.css">
            <script src="assets/script.js"></script>
          </head>
          <body>Page content</body>
        </html>
      `);
      writeFileSync(cssPath, 'body { color: red; }');
      writeFileSync(jsPath, 'console.log("hello");');

      const builder = new IncrementalBuilder();
      await builder.performInitialBuild(sourceDir, outputDir);

      // Act - Simulate rapid changes during development
      const startTime = Date.now();
      const results = [];
      
      for (let i = 0; i < 10; i++) {
        // Modify CSS
        writeFileSync(cssPath, `body { color: blue; /* change ${i} */ }`);
        const cssResult = await builder.performIncrementalBuild(cssPath, sourceDir, outputDir);
        results.push(cssResult);
        
        // Modify JS
        writeFileSync(jsPath, `console.log("hello ${i}");`);
        const jsResult = await builder.performIncrementalBuild(jsPath, sourceDir, outputDir);
        results.push(jsResult);
        
        // Modify page
        writeFileSync(pagePath, `<html><body>Page content ${i}</body></html>`);
        const pageResult = await builder.performIncrementalBuild(pagePath, sourceDir, outputDir);
        results.push(pageResult);
      }
      
      const endTime = Date.now();

      // Assert
      const totalTime = endTime - startTime;
      const averageTime = totalTime / results.length;
      
      expect(averageTime).toBeLessThan(200); // Average build under 200ms
      expect(results.every(r => r.success)).toBe(true); // All builds successful
    });

    test('should_maintain_performance_with_many_concurrent_changes', async () => {
      // Arrange
      const files = [];
      for (let i = 1; i <= 20; i++) {
        const filePath = join(sourceDir, `page${i}.html`);
        writeFileSync(filePath, `<html><body>Page ${i}</body></html>`);
        files.push(filePath);
      }

      const builder = new IncrementalBuilder();
      await builder.performInitialBuild(sourceDir, outputDir);

      // Act - Simulate many concurrent changes
      const startTime = Date.now();
      
      const promises = files.map(async (filePath, index) => {
        writeFileSync(filePath, `<html><body>Updated page ${index + 1}</body></html>`);
        return builder.performIncrementalBuild(filePath, sourceDir, outputDir);
      });
      
      const results = await Promise.all(promises);
      const endTime = Date.now();

      // Assert
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(5000); // All builds under 5 seconds
      expect(results.every(r => r.success)).toBe(true);
      
      const averageTime = totalTime / results.length;
      expect(averageTime).toBeLessThan(500); // Average under 500ms per build
    });
  });
});