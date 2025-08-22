/**
 * DOM Cascade Composition Integration Tests
 * Tests the complete DOM Cascade composition pipeline using real-world examples
 * 
 * This test file specifically targets the issues where:
 * 1. data-unify attributes remain in the final output HTML
 * 2. Area matching and content replacement doesn't work correctly
 * 3. Layout hierarchy processing fails (root.html → site.html → page.html)
 * 
 * Expected behavior:
 * - When processing index.html with data-unify="_includes/layouts/site.html"
 * - Should load site.html layout 
 * - Should recursively load root.html (since site.html has data-unify="_includes/layouts/root.html")
 * - Should merge content using area classes like unify-header, unify-hero, unify-features
 * - Final output should have NO data-unify attributes anywhere
 * - Content should be properly composed from layout hierarchy
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { HtmlProcessor } from "../../src/core/html-processor.js";
import { PathValidator } from "../../src/core/path-validator.js";

describe("DOM Cascade Composition Integration", () => {
  let processor;
  let pathValidator;

  beforeEach(() => {
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
  });

  describe("Real-world example composition (CRITICAL)", () => {
    it("should_remove_all_data_unify_attributes_from_final_output", async () => {
      // Real example files from examples/input/
      const rootHtml = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Root Layout</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/normalize.css@8.0.1/normalize.css">
    <style>
        body { font-family: system-ui, sans-serif; }
        .container { max-width: 72rem; margin: 0 auto; padding: 1rem; }
    </style>
</head>
<body>
    <header class="unify-header">
        <div class="container">
            <div class="brand">ACME</div>
            <nav data-unify="_includes/components/nav.html"></nav>
        </div>
    </header>
    <main>
        <div class="container">
            <p>Root default main content…</p>
        </div>
    </main>
    <footer class="unify-footer">
        <div class="container">
            <small>© ACME Corp</small>
        </div>
    </footer>
</body>
</html>`;

      const siteHtml = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Site Layout</title>
    <style>
        .hero { padding: 4rem 0; background: #0ea5e9; color: white; }
        .features { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        .cta { background: #111827; color: #f9fafb; padding: 2rem; }
    </style>
</head>
<body data-unify="_includes/layouts/root.html">
    <main>
        <section class="unify-hero hero">
            <div class="container">
                <h1>Default Site Hero</h1>
                <p>Site-level default hero copy.</p>
            </div>
        </section>
        <section class="unify-features features">
            <div class="container">
                <h2>Default Features</h2>
                <div class="cards">
                    <article class="card">
                        <h3>Default Card A</h3>
                        <p>Placeholder content A</p>
                    </article>
                </div>
            </div>
        </section>
        <section class="unify-cta cta">
            <div class="container">
                <h2>Default CTA</h2>
                <p>Default call-to-action content.</p>
            </div>
        </section>
    </main>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Product X — ACME</title>
    <style>
        .hero .kicker { text-transform: uppercase; letter-spacing: .08em; opacity: .9; }
        .hero .actions { margin-top: 1rem; }
    </style>
</head>
<body data-unify="_includes/layouts/site.html">
    <header class="unify-header">
        <div class="container">
            <div class="brand">ACME • Product X</div>
            <div class="unify-main-nav">
                <nav class="nav">
                    <a href="/">Home</a>
                    <a href="/product" aria-current="page">Product</a>
                    <a href="/pricing">Pricing</a>
                    <a href="/contact">Contact</a>
                </nav>
            </div>
        </div>
    </header>
    <main>
        <section class="unify-hero hero">
            <div class="container">
                <p class="kicker">Now available</p>
                <h1>Meet Product X</h1>
                <p>Fast, friendly, and framework‑free by default.</p>
                <div class="actions">
                    <a class="btn" href="/pricing">Get Started</a>
                    <a class="btn" href="/docs">Read Docs</a>
                </div>
            </div>
        </section>
        <section class="unify-features features">
            <div class="container">
                <h2>Why you'll love it</h2>
                <div class="cards">
                    <div class="card">
                        <h3>Zero DSL</h3>
                        <p>Author with plain HTML/CSS. No new language.</p>
                    </div>
                    <div class="card">
                        <h3>Cascades like CSS</h3>
                        <p>Layouts → components → page, with safe scoping.</p>
                    </div>
                </div>
            </div>
        </section>
        <section class="unify-cta cta">
            <div class="container">
                <h2>Ready to ship?</h2>
                <p>Start building in minutes. Bring your own HTML.</p>
                <a class="btn" href="/signup">Sign up free</a>
            </div>
        </section>
    </main>
    <footer class="unify-footer">
        <div class="container">
            <small>© 2025 ACME • <a href="/legal">Legal</a> • <a href="/privacy">Privacy</a></small>
        </div>
    </footer>
</body>
</html>`;

      const navComponentHtml = `<nav class="nav">
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
</nav>`;

      const mockFiles = {
        '_includes/layouts/root.html': rootHtml,
        '_includes/layouts/site.html': siteHtml,
        '_includes/components/nav.html': navComponentHtml,
        'index.html': pageHtml
      };

      const result = await processor.processFile('index.html', pageHtml, mockFiles, '.');

      // CRITICAL: Final output should have NO data-unify attributes
      expect(result.html).not.toContain('data-unify=');
      expect(result.html).not.toContain('data-unify ="');
      expect(result.html).not.toContain("data-unify='");
      expect(result.html).not.toContain("data-unify ='");
      
      // Should be successful
      expect(result.success).toBe(true);
      expect(result.compositionApplied).toBe(true);
    });

    it("should_compose_full_layout_hierarchy_correctly", async () => {
      // Same setup as above test
      const rootHtml = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Root Layout</title>
</head>
<body>
    <header class="unify-header">
        <div class="container">
            <div class="brand">ACME</div>
        </div>
    </header>
    <main>
        <div class="container">
            <p>Root default main content</p>
        </div>
    </main>
    <footer class="unify-footer">
        <div class="container">
            <small>© ACME Corp</small>
        </div>
    </footer>
</body>
</html>`;

      const siteHtml = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Site Layout</title>
</head>
<body data-unify="_includes/layouts/root.html">
    <main>
        <section class="unify-hero hero">
            <div class="container">
                <h1>Default Site Hero</h1>
            </div>
        </section>
        <section class="unify-features features">
            <div class="container">
                <h2>Default Features</h2>
            </div>
        </section>
    </main>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Product X — ACME</title>
</head>
<body data-unify="_includes/layouts/site.html">
    <header class="unify-header">
        <div class="container">
            <div class="brand">ACME • Product X</div>
        </div>
    </header>
    <main>
        <section class="unify-hero hero">
            <div class="container">
                <h1>Meet Product X</h1>
                <p>Page-specific hero content</p>
            </div>
        </section>
        <section class="unify-features features">
            <div class="container">
                <h2>Why you'll love it</h2>
                <p>Page-specific features content</p>
            </div>
        </section>
    </main>
    <footer class="unify-footer">
        <div class="container">
            <small>© 2025 ACME</small>
        </div>
    </footer>
</body>
</html>`;

      const mockFiles = {
        '_includes/layouts/root.html': rootHtml,
        '_includes/layouts/site.html': siteHtml,
        'index.html': pageHtml
      };

      const result = await processor.processFile('index.html', pageHtml, mockFiles, '.');

      expect(result.success).toBe(true);
      expect(result.compositionApplied).toBe(true);

      // Should contain page content in proper areas
      expect(result.html).toContain('ACME • Product X'); // Page header override
      expect(result.html).toContain('Meet Product X'); // Page hero override
      expect(result.html).toContain('Why you\'ll love it'); // Page features override
      expect(result.html).toContain('© 2025 ACME'); // Page footer override

      // Should not contain default layout content that was replaced
      expect(result.html).not.toContain('Default Site Hero');
      expect(result.html).not.toContain('Default Features');
      expect(result.html).not.toContain('© ACME Corp');

      // Final check: No data-unify attributes
      expect(result.html).not.toContain('data-unify');
    });

    it("should_process_unify_area_classes_correctly", async () => {
      const layoutHtml = `<!doctype html>
<html>
<body>
    <header class="unify-header">Default Header</header>
    <main class="unify-content">Default Content</main>
    <aside class="unify-sidebar">Default Sidebar</aside>
    <footer class="unify-footer">Default Footer</footer>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="layout.html">
<body>
    <header class="unify-header">Page Header</header>
    <main class="unify-content">Page Content</main>
    <aside class="unify-sidebar">Page Sidebar</aside>
    <footer class="unify-footer">Page Footer</footer>
</body>
</html>`;

      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      expect(result.success).toBe(true);
      
      // Page content should replace layout content in matching areas
      expect(result.html).toContain('Page Header');
      expect(result.html).toContain('Page Content');
      expect(result.html).toContain('Page Sidebar');
      expect(result.html).toContain('Page Footer');
      
      // Should not contain default layout content
      expect(result.html).not.toContain('Default Header');
      expect(result.html).not.toContain('Default Content');
      expect(result.html).not.toContain('Default Sidebar');
      expect(result.html).not.toContain('Default Footer');

      // No data-unify attributes in final output
      expect(result.html).not.toContain('data-unify');
    });

    it("should_handle_nested_component_imports_within_areas", async () => {
      const rootHtml = `<!doctype html>
<html>
<body>
    <header class="unify-header">
        <div class="brand">ACME</div>
        <nav data-unify="_includes/components/nav.html"></nav>
    </header>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="root.html">
<body>
    <header class="unify-header">
        <div class="brand">ACME • Product</div>
        <div class="unify-main-nav">
            <nav class="nav">
                <a href="/">Home</a>
                <a href="/product">Product</a>
            </nav>
        </div>
    </header>
</body>
</html>`;

      const navComponentHtml = `<nav class="nav">
    <a href="/">Home</a>
    <a href="/about">About</a>
</nav>`;

      const mockFiles = {
        'root.html': rootHtml,
        '_includes/components/nav.html': navComponentHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      expect(result.success).toBe(true);
      
      // Should contain page header override
      expect(result.html).toContain('ACME • Product');
      
      // Should contain page navigation in the unify-main-nav area
      expect(result.html).toContain('/product');
      
      // No data-unify attributes should remain
      expect(result.html).not.toContain('data-unify');
    });

    it("should_preserve_non_unify_data_attributes", async () => {
      const layoutHtml = `<!doctype html>
<html>
<body>
    <div class="unify-content" data-layout="preserve" data-test="keep">Layout</div>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="layout.html">
<body>
    <div class="unify-content" data-page="preserve" data-custom="keep">Page</div>
</body>
</html>`;

      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      expect(result.success).toBe(true);
      
      // Should remove data-unify but preserve other data attributes
      expect(result.html).not.toContain('data-unify');
      expect(result.html).toContain('data-layout="preserve"');
      expect(result.html).toContain('data-test="keep"');
      expect(result.html).toContain('data-page="preserve"');
      expect(result.html).toContain('data-custom="keep"');
    });

    it("should_fail_gracefully_when_layout_missing", async () => {
      const pageHtml = `<!doctype html>
<html data-unify="missing-layout.html">
<body>
    <div class="unify-content">Page Content</div>
</body>
</html>`;

      const result = await processor.processFile('page.html', pageHtml, {}, '.');

      // HTML processor gracefully falls back when layouts are missing (per spec)
      expect(result.success).toBe(true);
      expect(result.html).toContain('Page Content'); // Fallback processing works
      expect(result.html).not.toContain('data-unify'); // data-unify removed in fallback
    });

    it("should_detect_and_prevent_circular_imports", async () => {
      const layoutAHtml = `<!doctype html>
<html data-unify="layout-b.html">
<body>Layout A</body>
</html>`;

      const layoutBHtml = `<!doctype html>
<html data-unify="layout-a.html">
<body>Layout B</body>
</html>`;

      const pageHtml = `<!doctype html>
<html data-unify="layout-a.html">
<body>Page</body>
</html>`;

      const mockFiles = {
        'layout-a.html': layoutAHtml,
        'layout-b.html': layoutBHtml,
        'page.html': pageHtml
      };

      const result = await processor.processFile('page.html', pageHtml, mockFiles, '.');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Circular');
    });
  });

  describe("Data attribute cleanup validation", () => {
    it("should_validate_complete_data_unify_removal", async () => {
      const complexPageHtml = `<!doctype html>
<html data-unify="layout.html" lang="en">
<head>
    <meta charset="utf-8" />
    <title>Test Page</title>
</head>
<body>
    <header class="unify-header" data-unify="header.html">Header</header>
    <main class="unify-content">
        <section data-unify="section.html" class="unify-hero">Hero</section>
        <section data-unify='sidebar.html' class="unify-sidebar">Sidebar</section>
    </main>
    <footer class="unify-footer" data-unify="_includes/footer.html">Footer</footer>
</body>
</html>`;

      const layoutHtml = `<!doctype html>
<html>
<body>
    <header class="unify-header">Layout Header</header>
    <main class="unify-content">Layout Content</main>
    <footer class="unify-footer">Layout Footer</footer>
</body>
</html>`;

      const mockFiles = {
        'layout.html': layoutHtml,
        'page.html': complexPageHtml
      };

      const result = await processor.processFile('page.html', complexPageHtml, mockFiles, '.');

      // This test is expected to FAIL initially because the current implementation
      // doesn't properly remove all data-unify attributes
      
      // Comprehensive check for any remaining data-unify attributes
      const dataUnifyMatches = result.html.match(/data-unify\s*=\s*["'][^"']*["']/g);
      expect(dataUnifyMatches).toBeNull(); // Should be null (no matches)
      
      // Alternative check with different quote styles
      expect(result.html).not.toMatch(/data-unify\s*=\s*"[^"]*"/);
      expect(result.html).not.toMatch(/data-unify\s*=\s*'[^']*'/);
      expect(result.html).not.toMatch(/data-unify\s*=\s*[^\s>]*/);
      
      // Validation method from processor should also catch this
      const validation = processor.validateComposition(result.html);
      expect(validation.warnings).not.toContain('data-unify attributes found in final output');
    });
  });
});

/**
 * Expected Test Results (TDD RED phase):
 * 
 * These tests are designed to FAIL with the current implementation because:
 * 1. data-unify attributes are not being completely removed from final output
 * 2. Area matching and content replacement may not work correctly
 * 3. Layout hierarchy processing may not handle the full chain correctly
 * 
 * Once the implementation is fixed, these tests should PASS and verify:
 * - Complete removal of all data-unify attributes from final HTML
 * - Proper area-based content composition using unify-* classes  
 * - Correct processing of layout hierarchy (root → site → page)
 * - Preservation of non-unify data attributes
 * - Graceful handling of missing layouts and circular imports
 */