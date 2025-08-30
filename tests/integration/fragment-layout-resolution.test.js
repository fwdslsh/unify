/**
 * Integration test to verify fragment vs layout resolution
 * 
 * This test specifically validates that:
 * 1. Fragment imports like base/nav resolve correctly to _includes/base/nav.html
 * 2. Layout references work correctly
 * 3. The DOM Cascade properly distinguishes between fragments and layouts
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { HtmlProcessor } from '../../src/core/html-processor.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('Fragment vs Layout Resolution', () => {
  let testDir;

  beforeEach(() => {
    testDir = `/tmp/fragment-layout-test-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, '_includes/base'), { recursive: true });
    mkdirSync(join(testDir, 'dist'), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should resolve fragment imports with .html extension', async () => {
    // Create a navigation fragment
    const navContent = `<nav class="main-nav">
  <ul class="unify-nav-links">
    <li><a href="/">Home</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</nav>`;

    writeFileSync(join(testDir, '_includes/base/nav.html'), navContent);

    // Create a layout that imports the nav fragment
    const layoutContent = `<!DOCTYPE html>
<html>
<head><title>Test Layout</title></head>
<body>
  <header class="unify-header">
    <nav data-unify="base/nav">
      <!-- Default nav content -->
    </nav>
  </header>
  <main class="unify-content">
    <!-- Page content goes here -->
  </main>
</body>
</html>`;

    writeFileSync(join(testDir, '_includes/layout.html'), layoutContent);

    // Create a page that uses the layout
    const pageContent = `<html data-unify="_includes/layout.html">
<head><title>Test Page</title></head>
<body>
  <div class="unify-content">
    <h1>Test Page Content</h1>
    <p>This page uses a layout with fragment imports.</p>
  </div>
</body>
</html>`;

    const processor = new HtmlProcessor({
      sourceDir: testDir,
      outputDir: join(testDir, 'dist')
    });

    // Build a simple fileSystem map
    const fileSystem = {
      '_includes/layout.html': layoutContent,
      '_includes/base/nav.html': navContent
    };

    const result = await processor.processFile(
      join(testDir, 'test.html'), 
      pageContent, 
      fileSystem,
      testDir
    );

    expect(result.success).toBe(true);
    expect(result.html).toContain('class="main-nav"');
    expect(result.html).toContain('unify-nav-links');
    expect(result.html).toContain('<a href="/">Home</a>');
    expect(result.compositionApplied).toBe(true);
  });

  it('should handle fragment imports without extensions', async () => {
    // Create footer fragment
    const footerContent = `<footer class="site-footer">
  <div class="unify-footer-content">
    <p>&copy; 2024 Test Site</p>
  </div>
</footer>`;

    writeFileSync(join(testDir, '_includes/base/footer.html'), footerContent);

    // Create layout with fragment import (no .html extension)
    const layoutContent = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <main class="unify-content">
    <!-- Content -->
  </main>
  <div class="unify-footer">
    <div data-unify="base/footer">
      <!-- Default footer -->
    </div>
  </div>
</body>
</html>`;

    writeFileSync(join(testDir, '_includes/test-layout.html'), layoutContent);

    const pageContent = `<html data-unify="_includes/test-layout.html">
<head><title>Footer Test</title></head>
<body>
  <div class="unify-content">
    <h1>Page with Footer Fragment</h1>
  </div>
</body>
</html>`;

    const processor = new HtmlProcessor({
      sourceDir: testDir,
      outputDir: join(testDir, 'dist')
    });

    const fileSystem = {
      '_includes/test-layout.html': layoutContent,
      '_includes/base/footer.html': footerContent
    };

    const result = await processor.processFile(
      join(testDir, 'footer-test.html'),
      pageContent,
      fileSystem,
      testDir
    );

    expect(result.success).toBe(true);
    expect(result.html).toContain('class="site-footer"');
    expect(result.html).toContain('unify-footer-content');
    expect(result.html).toContain('© 2024 Test Site');
  });

  it('should properly distinguish layouts from fragments', async () => {
    // Create both a layout and a fragment with similar names
    const layoutContent = `<!DOCTYPE html>
<html>
<head><title>Master Layout</title></head>
<body>
  <div class="layout-wrapper">
    <main class="unify-content">
      <!-- Page content -->
    </main>
  </div>
</body>
</html>`;

    const navFragment = `<nav class="fragment-nav">
  <a href="/">Fragment Nav Link</a>
</nav>`;

    writeFileSync(join(testDir, '_includes/master.html'), layoutContent);
    writeFileSync(join(testDir, '_includes/base/nav.html'), navFragment);

    // Page uses layout AND imports fragment
    const pageContent = `<html data-unify="_includes/master.html">
<head><title>Test Page</title></head>
<body>
  <div class="unify-content">
    <header data-unify="base/nav">
      <!-- Default nav -->
    </header>
    <h1>Main Content</h1>
  </div>
</body>
</html>`;

    const processor = new HtmlProcessor({
      sourceDir: testDir,
      outputDir: join(testDir, 'dist')
    });

    const fileSystem = {
      '_includes/master.html': layoutContent,
      '_includes/base/nav.html': navFragment
    };

    const result = await processor.processFile(
      join(testDir, 'mixed-test.html'),
      pageContent,
      fileSystem,
      testDir
    );

    expect(result.success).toBe(true);
    expect(result.html).toContain('layout-wrapper'); // From layout
    expect(result.html).toContain('fragment-nav'); // From fragment
    expect(result.html).toContain('Fragment Nav Link'); // From fragment
    expect(result.compositionApplied).toBe(true);
  });

  it('should provide clear error messages for missing fragments', async () => {
    const layoutContent = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <nav data-unify="missing/fragment">
    <!-- This fragment doesn't exist -->
  </nav>
</body>
</html>`;

    writeFileSync(join(testDir, '_includes/test-layout.html'), layoutContent);

    const pageContent = `<html data-unify="_includes/test-layout.html">
<head><title>Error Test</title></head>
<body><div class="unify-content">Content</div></body>
</html>`;

    const processor = new HtmlProcessor({
      sourceDir: testDir,
      outputDir: join(testDir, 'dist')
    });

    const fileSystem = {
      '_includes/test-layout.html': layoutContent
      // Missing: '_includes/missing/fragment.html'
    };

    const result = await processor.processFile(
      join(testDir, 'error-test.html'),
      pageContent,
      fileSystem,
      testDir
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Layout file not found: missing/fragment');
  });
});