/**
 * DOM Cascade v1 Specification Compliance Test Suite
 * 
 * This test suite contains FAILING tests that prove the current implementation
 * does NOT conform to the DOM Cascade v1 specification.
 * 
 * These tests are designed to FAIL with the current implementation to demonstrate
 * the gaps between current behavior and the specification requirements.
 * 
 * See: /home/founder3/code/github/fwdslsh/unify/unify_poh/specs/dom-spec.md
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TempProject } from '../../helpers/temp-project.js';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('DOM Cascade v1 Specification Failures', () => {
  let tempProject;
  let htmlProcessor;
  let pathValidator;

  beforeEach(async () => {
    tempProject = new TempProject();
    pathValidator = new PathValidator();
    htmlProcessor = new HtmlProcessor(pathValidator);
  });

  afterEach(async () => {
    await tempProject.cleanup();
  });

  describe('1. Layout Chain Composition Failures', () => {
    test('should_fail_nested_layout_chain_root_site_page_composition', async () => {
      // Setup: Root -> Site -> Page chain as per specification example
      const rootLayout = `<!doctype html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Root Layout</title>
  <style data-unify-docs="v1">
    .unify-header { }
    .unify-main-nav { }
    .unify-footer { }
  </style>
  <style>
    body { font-family: system-ui, sans-serif; }
    .container { max-width: 72rem; margin: 0 auto; }
  </style>
</head>
<body>
  <header class="unify-header">
    <div class="container">
      <div class="brand">ACME</div>
      <div class="unify-main-nav">
        <nav><a href="/">Home</a><a href="/docs">Docs</a></nav>
      </div>
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

      const siteLayout = `<!doctype html>
<html lang="en">
<head>
  <title>Site Layout</title>
  <style data-unify-docs="v1">
    .unify-hero { }
    .unify-features { }
    .unify-cta { }
  </style>
  <style>
    .hero { padding: 4rem 0; background: #0ea5e9; color: white; }
    .features { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
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
        <div>Default feature content</div>
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
    .hero .kicker { text-transform: uppercase; letter-spacing: .08em; }
    .unify-cta .btn { background: #22c55e; }
  </style>
</head>
<body data-unify="_includes/layouts/site.html">
  <!-- Override the root header area -->
  <header class="unify-header">
    <div class="container">
      <div class="brand">ACME • Product X</div>
      <div class="unify-main-nav">
        <nav>
          <a href="/">Home</a>
          <a href="/product" aria-current="page">Product</a>
          <a href="/pricing">Pricing</a>
        </nav>
      </div>
    </div>
  </header>

  <main>
    <!-- Replace site layout hero -->
    <section class="unify-hero hero">
      <div class="container">
        <p class="kicker">Now available</p>
        <h1>Meet Product X</h1>
        <p>Fast, friendly, and framework‑free by default.</p>
      </div>
    </section>

    <!-- Replace site layout CTA -->
    <section class="unify-cta cta">
      <div class="container">
        <h2>Ready to ship?</h2>
        <p>Start building in minutes.</p>
        <a class="btn" href="/signup">Sign up free</a>
      </div>
    </section>
  </main>

  <!-- Override the root footer area -->
  <footer class="unify-footer">
    <div class="container">
      <small>© 2025 ACME • <a href="/legal">Legal</a></small>
    </div>
  </footer>
</body>
</html>`;

      const fileSystem = {
        '_includes/layouts/root.html': rootLayout,
        '_includes/layouts/site.html': siteLayout
      };

      // Process the page
      const result = await htmlProcessor.processFile(
        'index.html', 
        pageHtml, 
        fileSystem, 
        tempProject.path()
      );

      // SPECIFICATION REQUIREMENT: Resolution order must be root → site → page
      // The final DOM should be the outermost layout (root) with nested compositions applied
      
      // This test WILL FAIL because current implementation doesn't properly chain layouts
      // Expected behavior: Page composes into site, then site+page compose into root
      // Current behavior: Page directly composes into root, skipping site intermediate step

      expect(result.success).toBe(true);
      
      // FAILING ASSERTION 1: Layout processing chain length should be 2 (site + root)
      // Current implementation only processes 1 layout directly
      expect(result.layoutsProcessed).toBe(2);

      // FAILING ASSERTION 2: Root layout structure should be preserved
      // The final output should have root's DOCTYPE, html, head structure
      expect(result.html).toContain('<!doctype html>');
      expect(result.html).toContain('<meta name="viewport"');
      
      // FAILING ASSERTION 3: Head elements should be ordered: root → site → page
      // CSS should appear in proper cascade order: root styles, then site styles, then page styles
      const headMatch = result.html.match(/<head[^>]*>(.*?)<\/head>/s);
      expect(headMatch).toBeTruthy();
      const headContent = headMatch[1];
      
      // Check CSS ordering: root CSS should come before site CSS should come before page CSS
      const rootStyleIndex = headContent.indexOf('font-family: system-ui');
      const siteStyleIndex = headContent.indexOf('background: #0ea5e9');
      const pageStyleIndex = headContent.indexOf('text-transform: uppercase');
      
      expect(rootStyleIndex).toBeGreaterThan(-1);
      expect(siteStyleIndex).toBeGreaterThan(-1);
      expect(pageStyleIndex).toBeGreaterThan(-1);
      // THIS WILL FAIL: Current implementation doesn't maintain CSS cascade order
      expect(rootStyleIndex).toBeLessThan(siteStyleIndex);
      expect(siteStyleIndex).toBeLessThan(pageStyleIndex);

      // FAILING ASSERTION 4: Page title should win over both root and site
      expect(result.html).toContain('<title>Product X — ACME</title>');

      // FAILING ASSERTION 5: Area composition should work correctly
      // Page header should override root header entirely
      expect(result.html).toContain('<div class="brand">ACME • Product X</div>');
      expect(result.html).not.toContain('<div class="brand">ACME</div>'); // Should be replaced, not merged

      // FAILING ASSERTION 6: Page should override site areas
      // Hero should be page content, not site default
      expect(result.html).toContain('<h1>Meet Product X</h1>');
      expect(result.html).not.toContain('<h1>Default Site Hero</h1>');

      // FAILING ASSERTION 7: Unmatched site areas should still be present
      // Features section from site should remain since page didn't override it
      expect(result.html).toContain('Default Features');
      expect(result.html).toContain('<h2>Default Features</h2>');
    });

    test('should_fail_component_composition_within_layout_chain', async () => {
      // Setup: Test component imports within a layout chain
      const rootLayout = `<!doctype html>
<html lang="en">
<head><title>Root</title></head>
<body>
  <header><div class="brand">ACME</div></header>
  <main><p>Root main</p></main>
  <footer><small>© ACME</small></footer>
</body>
</html>`;

      const siteLayout = `<!doctype html>
<html lang="en">
<head><title>Site</title></head>
<body data-unify="_includes/layouts/root.html">
  <main>
    <section class="unify-hero">
      <div class="container">
        <h1>Site Hero</h1>
      </div>
    </section>
    <section class="unify-features">
      <!-- Component composition within layout -->
      <div data-unify="_includes/components/card.html">
        <h3 class="unify-title">Feature 1</h3>
        <p class="unify-body">First feature description</p>
      </div>
      <div data-unify="_includes/components/card.html">
        <h3 class="unify-title">Feature 2</h3>
        <p class="unify-body">Second feature description</p>
      </div>
    </section>
  </main>
</body>
</html>`;

      const cardComponent = `<!doctype html>
<html lang="en">
<head>
  <style data-unify-docs="v1">
    .unify-title { }
    .unify-body { }
    .unify-actions { }
  </style>
  <style>
    .card { border: 1px solid #e5e7eb; padding: 1rem; }
  </style>
</head>
<body>
  <article class="card">
    <h3 class="unify-title">Default Title</h3>
    <p class="unify-body">Default body</p>
    <div class="unify-actions">
      <a href="#" class="btn">Default Action</a>
    </div>
  </article>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html lang="en">
<head>
  <title>Product Page</title>
</head>
<body data-unify="_includes/layouts/site.html">
  <main>
    <section class="unify-hero">
      <div class="container">
        <h1>Product Hero Override</h1>
      </div>
    </section>
  </main>
</body>
</html>`;

      const fileSystem = {
        '_includes/layouts/root.html': rootLayout,
        '_includes/layouts/site.html': siteLayout,
        '_includes/components/card.html': cardComponent
      };

      const result = await htmlProcessor.processFile(
        'product.html', 
        pageHtml, 
        fileSystem, 
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Component composition should work within layout chain
      // Components in site layout should be processed and composed correctly
      expect(result.html).toContain('<article class="card">');
      expect(result.html).toContain('<h3 class="unify-title">Feature 1</h3>');
      expect(result.html).toContain('<p class="unify-body">First feature description</p>');
      expect(result.html).toContain('<h3 class="unify-title">Feature 2</h3>');
      expect(result.html).toContain('<p class="unify-body">Second feature description</p>');

      // FAILING ASSERTION: Page should still override site areas even with components
      expect(result.html).toContain('<h1>Product Hero Override</h1>');
      expect(result.html).not.toContain('<h1>Site Hero</h1>');
    });
  });

  describe('2. Area Matching Precedence Failures', () => {
    test('should_fail_area_class_match_precedence_over_landmarks', async () => {
      // Test that area class matches take precedence over landmark fallback
      const layoutHtml = `<!doctype html>
<html>
<head>
  <style data-unify-docs="v1">
    .unify-hero { }
  </style>
</head>
<body>
  <!-- This header has BOTH landmark (header) AND area class (unify-hero) -->
  <header class="unify-hero">
    <h1>Layout Default Hero in Header</h1>
  </header>
  
  <!-- This is just a landmark without area class -->
  <main>
    <p>Layout main content</p>
  </main>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <!-- Page provides BOTH area class match AND landmark match -->
  <section class="unify-hero">
    <h1>Page Hero via Area Class</h1>
  </section>
  
  <header>
    <h1>Page Header via Landmark</h1>
  </header>
  
  <main>
    <p>Page main content</p>
  </main>
</body>
</html>`;

      const result = await htmlProcessor.processFile(
        'test.html', 
        pageHtml, 
        {}, 
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Area class match should win over landmark match
      // The layout's header.unify-hero should be replaced by page's section.unify-hero
      // NOT by page's header element (landmark match)
      expect(result.html).toContain('<header class="unify-hero">');
      expect(result.html).toContain('<h1>Page Hero via Area Class</h1>');
      expect(result.html).not.toContain('<h1>Page Header via Landmark</h1>');
      expect(result.html).not.toContain('<h1>Layout Default Hero in Header</h1>');

      // The standalone header in page should not replace anything (no matching layout header)
      // Main landmark should still work
      expect(result.html).toContain('<p>Page main content</p>');
    });

    test('should_fail_landmark_fallback_when_no_area_classes', async () => {
      // Test landmark fallback when no area classes are used
      const layoutHtml = `<!doctype html>
<html>
<body>
  <header>
    <h1>Layout Header</h1>
  </header>
  <nav>
    <a href="/">Home</a>
  </nav>
  <main>
    <p>Layout Main</p>
  </main>
  <aside>
    <p>Layout Sidebar</p>
  </aside>
  <footer>
    <p>Layout Footer</p>
  </footer>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <header>
    <h1>Page Header Override</h1>
  </header>
  <main>
    <p>Page Main Override</p>
  </main>
  <footer>
    <p>Page Footer Override</p>
  </footer>
</body>
</html>`;

      const result = await htmlProcessor.processFile(
        'test.html', 
        pageHtml, 
        {}, 
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Landmark matching should work when no area classes present
      expect(result.html).toContain('<h1>Page Header Override</h1>');
      expect(result.html).not.toContain('<h1>Layout Header</h1>');

      expect(result.html).toContain('<p>Page Main Override</p>');
      expect(result.html).not.toContain('<p>Layout Main</p>');

      expect(result.html).toContain('<p>Page Footer Override</p>');
      expect(result.html).not.toContain('<p>Layout Footer</p>');

      // Nav and aside should remain from layout (not overridden by page)
      expect(result.html).toContain('<a href="/">Home</a>');
      expect(result.html).toContain('<p>Layout Sidebar</p>');
    });

    test('should_fail_ordered_fill_fallback_when_no_landmarks_or_areas', async () => {
      // Test ordered fill as last resort
      const layoutHtml = `<!doctype html>
<html>
<body>
  <main>
    <section>Layout Section 1</section>
    <section>Layout Section 2</section>
    <section>Layout Section 3</section>
  </main>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <main>
    <section>Page Section 1 Override</section>
    <section>Page Section 2 Override</section>
    <section>Page Section 3 Override</section>
    <section>Page Section 4 Additional</section>
  </main>
</body>
</html>`;

      const result = await htmlProcessor.processFile(
        'test.html', 
        pageHtml, 
        {}, 
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Ordered fill should map section-by-section by index
      // Section 1→1, 2→2, 3→3, extras should append
      expect(result.html).toContain('Page Section 1 Override');
      expect(result.html).toContain('Page Section 2 Override');
      expect(result.html).toContain('Page Section 3 Override');
      expect(result.html).toContain('Page Section 4 Additional'); // Should be appended

      expect(result.html).not.toContain('Layout Section 1');
      expect(result.html).not.toContain('Layout Section 2');
      expect(result.html).not.toContain('Layout Section 3');
    });
  });

  describe('3. Attribute Merging Failures', () => {
    test('should_fail_attribute_merging_page_wins_except_id', async () => {
      // Test attribute merging rules per specification
      const layoutHtml = `<!doctype html>
<html>
<body>
  <section class="unify-hero layout-class" 
           id="layout-hero" 
           data-theme="dark" 
           aria-label="Main hero section"
           data-analytics="layout-track">
    <h1>Layout Hero</h1>
  </section>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body data-unify="layout.html">
  <section class="unify-hero page-class special" 
           id="page-hero" 
           data-theme="light" 
           aria-label="Product hero section"
           data-analytics="page-track"
           data-new="page-only">
    <h1>Page Hero Override</h1>
  </section>
</body>
</html>`;

      const fileSystem = {
        'layout.html': layoutHtml
      };

      const result = await htmlProcessor.processFile(
        'test.html', 
        pageHtml, 
        fileSystem, 
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: ID should be retained from layout (host) for stability
      expect(result.html).toContain('id="layout-hero"');
      expect(result.html).not.toContain('id="page-hero"');

      // FAILING ASSERTION: Classes should be union (layout + page)
      expect(result.html).toContain('class="unify-hero layout-class page-class special"');

      // FAILING ASSERTION: Page wins for conflicting attributes
      expect(result.html).toContain('data-theme="light"');
      expect(result.html).not.toContain('data-theme="dark"');

      expect(result.html).toContain('aria-label="Product hero section"');
      expect(result.html).not.toContain('aria-label="Main hero section"');

      expect(result.html).toContain('data-analytics="page-track"');
      expect(result.html).not.toContain('data-analytics="layout-track"');

      // FAILING ASSERTION: Page-only attributes should be added
      expect(result.html).toContain('data-new="page-only"');

      // FAILING ASSERTION: Content should be page content
      expect(result.html).toContain('<h1>Page Hero Override</h1>');
      expect(result.html).not.toContain('<h1>Layout Hero</h1>');
    });

    test('should_fail_multiple_page_elements_same_area_concatenation', async () => {
      // Test multiple page elements targeting same area class
      const layoutHtml = `<!doctype html>
<html>
<body>
  <section class="unify-features" data-layout="true">
    <h2>Layout Features</h2>
    <div>Layout feature content</div>
  </section>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <!-- Multiple page elements with same area class -->
  <div class="unify-features" data-priority="high">
    <h3>Page Feature 1</h3>
    <p>First feature description</p>
  </div>
  
  <article class="unify-features" data-priority="medium">
    <h3>Page Feature 2</h3>
    <p>Second feature description</p>
  </article>
  
  <aside class="unify-features" data-priority="low">
    <h3>Page Feature 3</h3>
    <p>Third feature description</p>
  </aside>
</body>
</html>`;

      const result = await htmlProcessor.processFile(
        'test.html', 
        pageHtml, 
        {}, 
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Multiple page sources should concatenate their children
      expect(result.html).toContain('<h3>Page Feature 1</h3>');
      expect(result.html).toContain('<h3>Page Feature 2</h3>');
      expect(result.html).toContain('<h3>Page Feature 3</h3>');

      // FAILING ASSERTION: Attribute merge should use last matching element's attributes
      // The section should have attributes from the aside element (last match)
      expect(result.html).toContain('data-priority="low"');
      expect(result.html).toContain('data-layout="true"'); // Layout attribute preserved

      // FAILING ASSERTION: Layout's original content should be replaced
      expect(result.html).not.toContain('<h2>Layout Features</h2>');
      expect(result.html).not.toContain('<div>Layout feature content</div>');
    });

    test('should_fail_id_reference_rewriting_for_accessibility', async () => {
      // Test ID reference rewriting per specification
      const layoutHtml = `<!doctype html>
<html>
<body>
  <form class="unify-signup" id="layout-signup-form">
    <label for="layout-email">Email Address</label>
    <input id="layout-email" name="email" type="email" />
    <button type="submit" aria-describedby="layout-help">Sign Up</button>
    <div id="layout-help">We'll never spam you</div>
  </form>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <form class="unify-signup" id="page-signup-form">
    <label for="page-email">Your Email</label>
    <input id="page-email" name="email" type="email" required />
    <button type="submit" aria-describedby="page-help">Join Now</button>
    <div id="page-help">Free trial included</div>
  </form>
</body>
</html>`;

      const result = await htmlProcessor.processFile(
        'test.html', 
        pageHtml, 
        {}, 
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Layout IDs should be retained for stability
      expect(result.html).toContain('id="layout-signup-form"');
      expect(result.html).toContain('id="layout-email"');
      expect(result.html).toContain('id="layout-help"');

      // FAILING ASSERTION: Page references should be rewritten to match retained IDs
      expect(result.html).toContain('for="layout-email"');
      expect(result.html).toContain('aria-describedby="layout-help"');

      // Page IDs should not appear in final output
      expect(result.html).not.toContain('id="page-signup-form"');
      expect(result.html).not.toContain('id="page-email"');
      expect(result.html).not.toContain('id="page-help"');
      expect(result.html).not.toContain('for="page-email"');
      expect(result.html).not.toContain('aria-describedby="page-help"');

      // Content should be from page
      expect(result.html).toContain('Your Email');
      expect(result.html).toContain('required');
      expect(result.html).toContain('Join Now');
      expect(result.html).toContain('Free trial included');
    });
  });

  describe('4. Head Merging Failures', () => {
    test('should_fail_head_element_cascade_ordering', async () => {
      // Test CSS cascade order: layout → components → page
      const layoutHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="description" content="Layout description" />
  <title>Layout Title</title>
  <link rel="stylesheet" href="/css/normalize.css" />
  <link rel="stylesheet" href="/css/layout.css" />
  <style>
    /* Layout styles - should come first */
    .hero { background: blue; }
    .btn { padding: 0.5rem; }
  </style>
  <script src="/js/analytics.js"></script>
</head>
<body>
  <main class="unify-content">
    <div data-unify="_includes/components/card.html">
      <h3 class="unify-title">Test Card</h3>
    </div>
  </main>
</body>
</html>`;

      const componentHtml = `<!doctype html>
<html>
<head>
  <meta name="component" content="card" />
  <link rel="stylesheet" href="/css/components.css" />
  <style>
    /* Component styles - should come after layout, before page */
    .card { border: 1px solid gray; }
    .btn { border-radius: 4px; }
  </style>
  <script src="/js/card-interactions.js"></script>
</head>
<body>
  <article class="card">
    <h3 class="unify-title">Default Title</h3>
  </article>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="description" content="Page description override" />
  <meta name="keywords" content="page, keywords" />
  <title>Page Title Override</title>
  <link rel="stylesheet" href="/css/page.css" />
  <style>
    /* Page styles - should come last */
    .hero { background: green; }
    .btn { background: red; }
  </style>
  <script src="/js/page-specific.js"></script>
</head>
<body data-unify="_includes/layouts/layout.html">
  <main class="unify-content">
    <section class="hero">Page Hero</section>
  </main>
</body>
</html>`;

      const fileSystem = {
        '_includes/layouts/layout.html': layoutHtml,
        '_includes/components/card.html': componentHtml
      };

      const result = await htmlProcessor.processFile(
        'test.html', 
        pageHtml, 
        fileSystem, 
        tempProject.path()
      );

      expect(result.success).toBe(true);

      const headMatch = result.html.match(/<head[^>]*>(.*?)<\/head>/s);
      expect(headMatch).toBeTruthy();
      const headContent = headMatch[1];

      // FAILING ASSERTION: Page title should win
      expect(result.html).toContain('<title>Page Title Override</title>');
      expect(result.html).not.toContain('<title>Layout Title</title>');

      // FAILING ASSERTION: Meta deduplication - page should override matching meta
      expect(result.html).toContain('content="Page description override"');
      expect(result.html).not.toContain('content="Layout description"');
      // Non-conflicting meta should be preserved
      expect(result.html).toContain('content="card"');
      expect(result.html).toContain('content="page, keywords"');

      // FAILING ASSERTION: CSS order should be layout → component → page
      const layoutStyleIndex = headContent.indexOf('background: blue');
      const componentStyleIndex = headContent.indexOf('border: 1px solid gray');
      const pageStyleIndex = headContent.indexOf('background: green');

      expect(layoutStyleIndex).toBeGreaterThan(-1);
      expect(componentStyleIndex).toBeGreaterThan(-1);
      expect(pageStyleIndex).toBeGreaterThan(-1);
      expect(layoutStyleIndex).toBeLessThan(componentStyleIndex);
      expect(componentStyleIndex).toBeLessThan(pageStyleIndex);

      // FAILING ASSERTION: External CSS links should also follow cascade order
      const layoutCssIndex = headContent.indexOf('href="/css/layout.css"');
      const componentCssIndex = headContent.indexOf('href="/css/components.css"');
      const pageCssIndex = headContent.indexOf('href="/css/page.css"');

      expect(layoutCssIndex).toBeLessThan(componentCssIndex);
      expect(componentCssIndex).toBeLessThan(pageCssIndex);

      // FAILING ASSERTION: JavaScript should be deduplicated by src
      expect(result.html).toMatch(/src="\/js\/analytics\.js"/);
      expect(result.html).toMatch(/src="\/js\/card-interactions\.js"/);
      expect(result.html).toMatch(/src="\/js\/page-specific\.js"/);
      // Should not have duplicate script tags
      const scriptMatches = result.html.match(/src="\/js\/analytics\.js"/g);
      expect(scriptMatches?.length).toBe(1);
    });

    test('should_fail_head_merging_with_inline_scripts_deduplication', async () => {
      // Test inline script deduplication by hash
      const layoutHtml = `<!doctype html>
<html>
<head>
  <title>Layout</title>
  <script>
    // Analytics setup
    window.analytics = { track: function(event) { console.log(event); } };
  </script>
  <script>
    // Common utility
    function debounce(fn, ms) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => fn.apply(this, args), ms); }; }
  </script>
</head>
<body><main class="unify-content">Layout content</main></body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<head>
  <title>Page</title>
  <script>
    // Same analytics setup - should be deduplicated
    window.analytics = { track: function(event) { console.log(event); } };
  </script>
  <script>
    // Page-specific script
    document.addEventListener('DOMContentLoaded', function() { analytics.track('page_view'); });
  </script>
  <script>
    // Same utility function - should be deduplicated
    function debounce(fn, ms) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => fn.apply(this, args), ms); }; }
  </script>
</head>
<body data-unify="_includes/layouts/layout.html">
  <main class="unify-content">Page content</main>
</body>
</html>`;

      const fileSystem = {
        '_includes/layouts/layout.html': layoutHtml
      };

      const result = await htmlProcessor.processFile(
        'test.html', 
        pageHtml, 
        fileSystem, 
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Inline scripts should be deduplicated by content hash
      const scriptMatches = result.html.match(/<script[^>]*>(.*?)<\/script>/gs);
      expect(scriptMatches).toBeTruthy();

      // Should only have 3 unique scripts, not 5
      // 1. Analytics setup (once, not twice)
      // 2. Page-specific script
      // 3. Debounce utility (once, not twice)
      const analyticsMatches = result.html.match(/window\.analytics/g);
      const debounceMatches = result.html.match(/function debounce/g);
      const pageViewMatches = result.html.match(/page_view/g);

      expect(analyticsMatches?.length).toBe(1); // Should be deduplicated
      expect(debounceMatches?.length).toBe(1); // Should be deduplicated
      expect(pageViewMatches?.length).toBe(1); // Should appear once
    });
  });

  describe('5. Scoping Failures', () => {
    test('should_fail_scope_isolation_prevents_cross_scope_matching', async () => {
      // Test that matching is strictly local to each scope
      const layoutHtml = `<!doctype html>
<html>
<body>
  <!-- Scope 1: Main layout -->
  <main data-scope="main">
    <section class="unify-hero">Main Layout Hero</section>
  </main>
  
  <!-- Scope 2: Sidebar -->
  <aside data-scope="sidebar" class="unify-sidebar">
    <div class="unify-hero">Sidebar Layout Hero</div>
  </aside>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <!-- Page content for main scope -->
  <main data-scope="main">
    <section class="unify-hero">Page Main Hero</section>
  </main>
  
  <!-- Page content for sidebar scope -->
  <aside data-scope="sidebar">
    <div class="unify-hero">Page Sidebar Hero</div>
  </aside>
</body>
</html>`;

      const result = await htmlProcessor.processFile(
        'test.html', 
        pageHtml, 
        {}, 
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Each scope should be processed independently
      // Main scope's unify-hero should only match with main scope page content
      expect(result.html).toContain('Page Main Hero');
      expect(result.html).not.toContain('Main Layout Hero');

      // Sidebar scope's unify-hero should only match with sidebar scope page content
      expect(result.html).toContain('Page Sidebar Hero');
      expect(result.html).not.toContain('Sidebar Layout Hero');

      // Cross-scope matching should NOT occur
      // The main layout's unify-hero should not be replaced by sidebar page content
      const mainScopeMatch = result.html.match(/<main[^>]*data-scope="main"[^>]*>.*?<\/main>/s);
      expect(mainScopeMatch).toBeTruthy();
      expect(mainScopeMatch[0]).toContain('Page Main Hero');
      expect(mainScopeMatch[0]).not.toContain('Page Sidebar Hero');

      const asideScopeMatch = result.html.match(/<aside[^>]*data-scope="sidebar"[^>]*>.*?<\/aside>/s);
      expect(asideScopeMatch).toBeTruthy();
      expect(asideScopeMatch[0]).toContain('Page Sidebar Hero');
      expect(asideScopeMatch[0]).not.toContain('Page Main Hero');
    });

    test('should_fail_component_scope_isolation', async () => {
      // Test component imports maintain their own scope
      const layoutHtml = `<!doctype html>
<html>
<body>
  <section class="unify-hero">Layout Hero</section>
  
  <div data-unify="_includes/components/feature-card.html">
    <h3 class="unify-title">Feature 1</h3>
    <p class="unify-body">Feature description</p>
  </div>
  
  <div data-unify="_includes/components/feature-card.html">
    <h3 class="unify-title">Feature 2</h3>
    <p class="unify-body">Another description</p>
  </div>
</body>
</html>`;

      const featureCardComponent = `<!doctype html>
<html>
<head>
  <style data-unify-docs="v1">
    .unify-title { }
    .unify-body { }
    .unify-hero { }
  </style>
</head>
<body>
  <article class="card">
    <div class="unify-hero">Card Hero Section</div>
    <h3 class="unify-title">Default Title</h3>
    <p class="unify-body">Default body text</p>
  </article>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <!-- This should only match layout's unify-hero, not component's unify-hero -->
  <section class="unify-hero">Page Hero Override</section>
</body>
</html>`;

      const fileSystem = {
        '_includes/layouts/layout.html': layoutHtml,
        '_includes/components/feature-card.html': featureCardComponent
      };

      const result = await htmlProcessor.processFile(
        'test.html', 
        pageHtml, 
        { '_includes/layouts/layout.html': layoutHtml, '_includes/components/feature-card.html': featureCardComponent }, 
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Page unify-hero should only replace layout's unify-hero
      expect(result.html).toContain('Page Hero Override');
      expect(result.html).not.toContain('Layout Hero');

      // FAILING ASSERTION: Component's unify-hero should remain unchanged
      // Page's unify-hero should NOT cross into component scope
      expect(result.html).toContain('Card Hero Section');

      // Component composition should still work within its own scope
      expect(result.html).toContain('<h3 class="unify-title">Feature 1</h3>');
      expect(result.html).toContain('<h3 class="unify-title">Feature 2</h3>');
    });
  });
});