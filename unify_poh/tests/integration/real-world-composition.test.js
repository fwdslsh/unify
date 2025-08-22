/**
 * Real-World DOM Cascade Composition Test
 * Tests the complete real-world scenario from examples/input/ to verify
 * end-to-end DOM Cascade composition with realistic file structure
 * 
 * This test uses the exact file structure and content from examples/input/
 * to validate that the DOM Cascade implementation works correctly with
 * real-world HTML templates.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { HtmlProcessor } from "../../src/core/html-processor.js";
import { PathValidator } from "../../src/core/path-validator.js";

describe("Real-World DOM Cascade Composition", () => {
  let processor;
  let pathValidator;
  let realWorldFiles;

  beforeEach(() => {
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
    
    // Real file content from examples/input/ directory
    realWorldFiles = {
      '_includes/layouts/root.html': `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Root Layout</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/normalize.css@8.0.1/normalize.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    <style data-unify-docs>
        .unify-header {} /* Global header (contains brand + nav) */
        .unify-footer {} /* Global footer */
    </style>
    <style>
        body { font-family: system-ui, sans-serif; }
        .brand { font-weight: 700; }
        .container { max-width: 72rem; margin: 0 auto; padding: 1rem; }
        footer { border-top: 1px solid #e5e7eb; margin-top: 3rem; padding-top: 1.5rem; }
    </style>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
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
</html>`,

      '_includes/layouts/site.html': `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Site Layout</title>
    <style>
        .hero { padding: 4rem 0; background: #0ea5e9; color: white; }
        .features { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        .cta { background: #111827; color: #f9fafb; padding: 2rem; border-radius: .75rem; }
        .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        .card { border: 1px solid #e5e7eb; border-radius: .5rem; padding: 1rem; }
    </style>
    <style data-unify-docs>
        .unify-hero {} /* Above-the-fold hero section */
        .unify-features {} /* Feature section under hero */
        .unify-cta {} /* Global call-to-action section */
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
                    <article class="card">
                        <h3>Default Card B</h3>
                        <p>Placeholder content B</p>
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
</html>`,

      '_includes/components/nav.html': `<nav class="nav">
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
</nav>`,

      '_includes/components/card.html': `<article class="card">
    <h3 class="unify-title">Default Title</h3>
    <p class="unify-body">Default card body content.</p>
    <div class="unify-actions actions">
        <a class="btn" href="#default">Default Action</a>
    </div>
</article>`,

      'index.html': `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Product X — ACME</title>
    <style>
        .hero .kicker { text-transform: uppercase; letter-spacing: .08em; opacity: .9; }
        .hero .actions { margin-top: 1rem; }
        .unify-cta .btn { background: #22c55e; }
    </style>
</head>
<body data-unify="_includes/layouts/site.html">
    <header class="unify-header">
        <div class="container">
            <div class="brand">ACME • Product X</div>
            <div class="unify-main-nav">
                <button class="nav-toggle" aria-controls="primary-nav" aria-expanded="false">
                    <i class="bi bi-list"></i>
                </button>
                <nav id="primary-nav" class="nav" aria-expanded="false">
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
                    <a class="btn" href="/pricing"><i class="bi bi-lightning"></i> Get Started</a>
                    <a class="btn" href="/docs"><i class="bi bi-journal-text"></i> Read Docs</a>
                </div>
            </div>
        </section>
        <section class="unify-features features">
            <div class="container">
                <h2>Why you'll love it</h2>
                <div class="cards">
                    <div data-unify="_includes/components/card.html">
                        <h3 class="unify-title">Zero DSL</h3>
                        <p class="unify-body">Author with plain HTML/CSS. No new language.</p>
                        <div class="unify-actions actions">
                            <a class="btn" href="/docs"><i class="bi bi-book"></i> Learn more</a>
                        </div>
                    </div>
                    <div data-unify="_includes/components/card.html">
                        <h3 class="unify-title">Cascades like CSS</h3>
                        <p class="unify-body">Layouts → components → page, with safe scoping.</p>
                        <div class="unify-actions actions">
                            <a class="btn" href="/blog"><i class="bi bi-rss"></i> See it in action</a>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        <section class="unify-cta cta">
            <div class="container">
                <h2>Ready to ship?</h2>
                <p>Start building in minutes. Bring your own HTML.</p>
                <a class="btn" href="/signup"><i class="bi bi-rocket"></i> Sign up free</a>
            </div>
        </section>
    </main>
    <footer class="unify-footer">
        <div class="container">
            <small>© 2025 ACME • <a href="/legal">Legal</a> • <a href="/privacy">Privacy</a></small>
        </div>
    </footer>
</body>
</html>`
    };
  });

  describe("Complete real-world composition pipeline", () => {
    it("should_process_complete_real_world_example_successfully", async () => {
      const result = await processor.processFile(
        'index.html',
        realWorldFiles['index.html'],
        realWorldFiles,
        '.'
      );

      expect(result.success).toBe(true);
      expect(result.compositionApplied).toBe(true);
      expect(result.layoutsProcessed).toBeGreaterThan(0);
    });

    it("should_completely_remove_all_data_unify_attributes_CRITICAL", async () => {
      const result = await processor.processFile(
        'index.html',
        realWorldFiles['index.html'],
        realWorldFiles,
        '.'
      );

      // CRITICAL: This is the main issue - data-unify attributes remain in output
      // This test MUST FAIL initially to demonstrate the bug
      
      // Check for any data-unify attributes in various formats
      expect(result.html).not.toMatch(/data-unify\s*=\s*["'][^"']*["']/);
      expect(result.html).not.toContain('data-unify=');
      
      // Additional comprehensive checks
      const dataUnifyMatches = [
        ...result.html.matchAll(/data-unify\s*=\s*["'][^"']*["']/g),
        ...result.html.matchAll(/data-unify\s*=\s*[^\s>]*/g)
      ];
      
      expect(dataUnifyMatches).toHaveLength(0);
      
      // Use the processor's own validation
      const validation = processor.validateComposition(result.html);
      expect(validation.warnings).not.toContain('data-unify attributes found in final output');
    });

    it("should_compose_three_layer_hierarchy_correctly", async () => {
      const result = await processor.processFile(
        'index.html',
        realWorldFiles['index.html'],
        realWorldFiles,
        '.'
      );

      expect(result.success).toBe(true);

      // Page-level content should override site and root defaults
      expect(result.html).toContain('ACME • Product X'); // Page header brand override
      expect(result.html).toContain('Meet Product X'); // Page hero override
      expect(result.html).toContain('Why you\'ll love it'); // Page features override
      expect(result.html).toContain('Ready to ship?'); // Page CTA override
      expect(result.html).toContain('© 2025 ACME'); // Page footer override

      // Should NOT contain default content that was replaced
      expect(result.html).not.toContain('Default Site Hero');
      expect(result.html).not.toContain('Default Features');
      expect(result.html).not.toContain('Default CTA');
      expect(result.html).not.toContain('© ACME Corp');
      expect(result.html).not.toContain('Root default main content');
    });

    it("should_merge_head_elements_from_all_layers", async () => {
      const result = await processor.processFile(
        'index.html',
        realWorldFiles['index.html'],
        realWorldFiles,
        '.'
      );

      expect(result.success).toBe(true);

      // Should contain page title (page wins)
      expect(result.html).toContain('<title>Product X — ACME</title>');

      // Should contain root layout external resources
      expect(result.html).toContain('normalize.css');
      expect(result.html).toContain('bootstrap-icons');
      expect(result.html).toContain('alpinejs');

      // Should contain viewport meta from root
      expect(result.html).toContain('viewport');

      // Should contain styles from all layers
      expect(result.html).toContain('font-family: system-ui'); // Root styles
      expect(result.html).toContain('background: #0ea5e9'); // Site styles
      expect(result.html).toContain('text-transform: uppercase'); // Page styles
    });

    it("should_handle_component_composition_within_areas", async () => {
      const result = await processor.processFile(
        'index.html',
        realWorldFiles['index.html'],
        realWorldFiles,
        '.'
      );

      expect(result.success).toBe(true);

      // Should include custom navigation from page
      expect(result.html).toContain('/product');
      expect(result.html).toContain('aria-current="page"');

      // Should include composed cards with custom content
      expect(result.html).toContain('Zero DSL');
      expect(result.html).toContain('Cascades like CSS');
      expect(result.html).toContain('Learn more');
      expect(result.html).toContain('See it in action');

      // Should NOT contain default card content
      expect(result.html).not.toContain('Default Title');
      expect(result.html).not.toContain('Default card body content');
      expect(result.html).not.toContain('Default Action');
    });

    it("should_preserve_semantic_html_structure", async () => {
      const result = await processor.processFile(
        'index.html',
        realWorldFiles['index.html'],
        realWorldFiles,
        '.'
      );

      expect(result.success).toBe(true);

      // Should maintain proper HTML document structure
      expect(result.html).toMatch(/<!doctype html>/i);
      expect(result.html).toContain('<html lang="en">');
      expect(result.html).toContain('<head>');
      expect(result.html).toContain('</head>');
      expect(result.html).toContain('<body>');
      expect(result.html).toContain('</body>');
      expect(result.html).toContain('</html>');

      // Should maintain semantic HTML5 elements
      expect(result.html).toContain('<header');
      expect(result.html).toContain('<main>');
      expect(result.html).toContain('<section');
      expect(result.html).toContain('<footer');
      expect(result.html).toContain('<nav');
    });

    it("should_maintain_accessibility_attributes", async () => {
      const result = await processor.processFile(
        'index.html',
        realWorldFiles['index.html'],
        realWorldFiles,
        '.'
      );

      expect(result.success).toBe(true);

      // Should preserve accessibility attributes from page
      expect(result.html).toContain('aria-controls="primary-nav"');
      expect(result.html).toContain('aria-expanded="false"');
      expect(result.html).toContain('aria-current="page"');

      // Should maintain lang attribute
      expect(result.html).toContain('lang="en"');
    });

    it("should_handle_css_class_merging_correctly", async () => {
      const result = await processor.processFile(
        'index.html',
        realWorldFiles['index.html'],
        realWorldFiles,
        '.'
      );

      expect(result.success).toBe(true);

      // Should merge classes properly for unify areas
      // Layout classes + page classes should be combined
      expect(result.html).toContain('class="');
      
      // Verify that unify-* classes are preserved in merged elements
      expect(result.html).toContain('unify-header');
      expect(result.html).toContain('unify-hero');
      expect(result.html).toContain('unify-features');
      expect(result.html).toContain('unify-cta');
      expect(result.html).toContain('unify-footer');
    });

    it("should_process_efficiently_within_performance_budget", async () => {
      const startTime = Date.now();

      const result = await processor.processFile(
        'index.html',
        realWorldFiles['index.html'],
        realWorldFiles,
        '.'
      );

      const processingTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(1000); // Should complete within 1 second
      expect(result.processingTime).toBeDefined();
    });
  });

  describe("Edge cases and error handling", () => {
    it("should_handle_missing_component_files_gracefully", async () => {
      const pageWithMissingComponent = realWorldFiles['index.html'].replace(
        '_includes/components/card.html',
        '_includes/components/missing-card.html'
      );

      const result = await processor.processFile(
        'index.html',
        pageWithMissingComponent,
        realWorldFiles,
        '.'
      );

      // Should handle missing components gracefully
      // The behavior may vary - either fail or continue with warning
      expect(result).toBeDefined();
      expect(result.fallbackHtml).toBe(pageWithMissingComponent);
    });

    it("should_detect_circular_imports_in_real_layouts", async () => {
      const circularSiteHtml = realWorldFiles['_includes/layouts/site.html'].replace(
        'data-unify="_includes/layouts/root.html"',
        'data-unify="index.html"'
      );

      const filesWithCircular = {
        ...realWorldFiles,
        '_includes/layouts/site.html': circularSiteHtml
      };

      const result = await processor.processFile(
        'index.html',
        realWorldFiles['index.html'],
        filesWithCircular,
        '.'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Circular');
    });

    it("should_validate_final_output_structure", async () => {
      const result = await processor.processFile(
        'index.html',
        realWorldFiles['index.html'],
        realWorldFiles,
        '.'
      );

      expect(result.success).toBe(true);

      const validation = processor.validateComposition(result.html);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});

/**
 * Expected Test Results (TDD RED phase):
 * 
 * This test file is designed to FAIL initially because it tests the real-world
 * scenario that is currently broken. Key failures expected:
 * 
 * 1. "should_completely_remove_all_data_unify_attributes_CRITICAL" - WILL FAIL
 *    because data-unify attributes remain in the final output
 * 
 * 2. "should_compose_three_layer_hierarchy_correctly" - MAY FAIL
 *    if the composition pipeline doesn't properly handle root → site → page
 * 
 * 3. "should_handle_component_composition_within_areas" - MAY FAIL
 *    if nested data-unify attributes in components aren't processed
 * 
 * Once the DOM Cascade implementation is fixed, all tests should PASS and
 * demonstrate that the real-world example works correctly with:
 * - Complete data-unify attribute removal
 * - Proper area-based composition
 * - Correct layout hierarchy processing
 * - Component composition within areas
 * - Head merging from all layers
 * - Performance within acceptable limits
 */