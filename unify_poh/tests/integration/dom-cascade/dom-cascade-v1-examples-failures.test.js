/**
 * DOM Cascade v1 Specification Examples Failing Test Suite
 * 
 * These tests implement the exact examples from the DOM Cascade v1 specification
 * and are designed to FAIL with the current implementation, proving that the
 * specification requirements are not being met.
 * 
 * Based on examples from: /home/founder3/code/github/fwdslsh/unify/unify_poh/specs/dom-spec.md
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TempProject } from '../../helpers/temp-project.js';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('DOM Cascade v1 Specification Examples Failures', () => {
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

  describe('Specification Example: Replace a Hero (No Attributes)', () => {
    test('should_fail_basic_hero_replacement_example', async () => {
      // Exact example from specification Section 129: Replace a hero (no attributes anywhere)
      
      const layoutHtml = `<main>
  <section class="unify-hero" data-some-attr="merged">
    <h1>Default</h1>
  </section>
  <section class="unify-features">...</section>
</main>`;

      const pageHtml = `<section class="unify-hero">
  <h1>Product X</h1>
  <p>Now shipping</p>
</section>`;

      const result = await htmlProcessor.processFile(
        'test.html',
        `<!doctype html>
<html>
<body>
${pageHtml}
</body>
</html>`,
        {},
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Expected output should match specification exactly
      const expectedOutput = `<main>
  <section class="unify-hero" data-some-attr="merged">
    <h1>Product X</h1>
    <p>Now shipping</p>
  </section>
  <section class="unify-features">…</section>
</main>`;

      // The .unify-hero element should keep its tag and attributes (including data-some-attr="merged")
      expect(result.html).toContain('class="unify-hero"');
      expect(result.html).toContain('data-some-attr="merged"');

      // Children should be replaced with page content
      expect(result.html).toContain('<h1>Product X</h1>');
      expect(result.html).toContain('<p>Now shipping</p>');
      expect(result.html).not.toContain('<h1>Default</h1>');

      // Other layout elements should remain unchanged
      expect(result.html).toContain('<section class="unify-features">');
    });
  });

  describe('Specification Example: Component Composition (Class-Only)', () => {
    test('should_fail_component_composition_example', async () => {
      // Exact example from specification Section 178: Component composition (class-only)

      const componentHtml = `<article class="card">
  <h3 class="unify-title">Title</h3>
  <p class="unify-body">Copy</p>
  <div class="unify-actions"><button>Buy</button></div>
</article>`;

      const hostHtml = `<div data-unify="/components/card.html">
  <h3 class="unify-title">Starter</h3>
  <p class="unify-body">Best for trying things out.</p>
  <div class="unify-actions"><a class="btn">Get started</a></div>
</div>`;

      const result = await htmlProcessor.processFile(
        'test.html',
        `<!doctype html>
<html>
<body>
${hostHtml}
</body>
</html>`,
        {
          '/components/card.html': `<!doctype html>
<html>
<head>
  <style data-unify-docs="v1">
    .unify-title { }
    .unify-body { }
    .unify-actions { }
  </style>
</head>
<body>
${componentHtml}
</body>
</html>`
        },
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Expected output should match specification exactly
      const expectedOutput = `<article class="card">
  <h3 class="unify-title">Starter</h3>
  <p class="unify-body">Best for trying things out.</p>
  <div class="unify-actions"><a class="btn">Get started</a></div>
</article>`;

      // Host element should be replaced by component root element
      expect(result.html).toContain('<article class="card">');
      expect(result.html).not.toContain('<div data-unify='));

      // Each area class should match; children should be replaced
      expect(result.html).toContain('<h3 class="unify-title">Starter</h3>');
      expect(result.html).toContain('<p class="unify-body">Best for trying things out.</p>');
      expect(result.html).toContain('<div class="unify-actions"><a class="btn">Get started</a></div>');

      // Component defaults should be replaced, not preserved
      expect(result.html).not.toContain('Title');
      expect(result.html).not.toContain('Copy');
      expect(result.html).not.toContain('<button>Buy</button>');
    });
  });

  describe('Specification Example: Nested Layouts', () => {
    test('should_fail_nested_layouts_example', async () => {
      // Exact example from specification Section 215: Nested layouts

      const rootLayout = `<!-- /layouts/root.html -->
<body>
  <header class="unify-header">…</header>
  <main>
    ...
    <section class="unify-hero">Example Hero</section>
    ...
  </main>
</body>`;

      const siteLayout = `<!-- /layouts/site.html -->
<body data-unify="/layouts/root.html">
  <header class="unify-header">…</header>
  <main>
    ...
    <section class="unify-hero">Example Hero</section>
    ...
  </main>
</body>`;

      const pageHtml = `<!-- page.html -->
<body data-unify="/layouts/site.html">
  <main>
    <section class="unify-hero">Landing Page</section>
  </main>
</body>`;

      const fileSystem = {
        '/layouts/root.html': `<!doctype html>
<html>
<head><title>Root</title></head>
${rootLayout}
</html>`,
        '/layouts/site.html': `<!doctype html>
<html>
<head><title>Site</title></head>
${siteLayout}
</html>`
      };

      const result = await htmlProcessor.processFile(
        'page.html',
        `<!doctype html>
<html>
<head><title>Page</title></head>
${pageHtml}
</html>`,
        fileSystem,
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Resolution order should be root → site → page
      // The final DOM should be the outer layout with page merges applied
      expect(result.layoutsProcessed).toBe(2); // site, then root

      // FAILING ASSERTION: Final output should have root layout structure
      expect(result.html).toContain('<header class="unify-header">');
      
      // FAILING ASSERTION: Page content should override both site and root hero
      expect(result.html).toContain('<section class="unify-hero">Landing Page</section>');
      expect(result.html).not.toContain('<section class="unify-hero">Example Hero</section>');

      // Comment from spec: "The final DOM is the outer layout with page merges applied"
      // This means the root layout is the base, not the page
    });
  });

  describe('Specification Example: ID Stability and Landmark Usage', () => {
    test('should_fail_id_stability_example', async () => {
      // Exact example from specification Section 289: ID Stability and Landmark Usage

      const layoutHtml = `<main>
<form id="signup-form">
  <label for="signup-email">Email</label>
  <input id="signup-email" name="email" />
  <button>Sign Up</button>
</form>
</main>`;

      const pageHtml = `<form id="custom-form">
  <label for="custom-email">Your Email</label>
  <input id="custom-email" name="email" />
  <button>Join</button>
</form>`;

      const result = await htmlProcessor.processFile(
        'test.html',
        `<!doctype html>
<html>
<body>
${pageHtml}
</body>
</html>`,
        {},
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Expected output should match specification exactly
      const expectedOutput = `<main>
  <form id="signup-form">
    <label for="signup-email">Your Email</label>
    <input id="signup-email" name="email" />
    <button>Join</button>
  </form>
</main>`;

      // Host IDs should be retained for stability
      expect(result.html).toContain('id="signup-form"');
      expect(result.html).toContain('id="signup-email"');

      // Page references should be rewritten to match retained host IDs
      expect(result.html).toContain('for="signup-email"');

      // Page IDs should not appear in final output
      expect(result.html).not.toContain('id="custom-form"');
      expect(result.html).not.toContain('id="custom-email"');
      expect(result.html).not.toContain('for="custom-email"');

      // Page content should be used
      expect(result.html).toContain('<label for="signup-email">Your Email</label>');
      expect(result.html).toContain('<button>Join</button>');
      expect(result.html).not.toContain('<button>Sign Up</button>');
    });
  });

  describe('Real-World Example: Complete Product Page', () => {
    test('should_fail_complete_product_page_example_from_examples_input', async () => {
      // Use the actual example files from examples/input/
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
    .container { max-width: 72rem; margin: 0 auto; padding: 1rem; }
    footer { border-top: 1px solid #e5e7eb; margin-top: 3rem; }
  </style>
</head>
<body>
  <header class="unify-header">
    <div class="container">
      <div class="brand">ACME</div>
      <div class="unify-main-nav">
        <nav><a href="/">Home</a><a href="/docs">Docs</a><a href="/blog">Blog</a></nav>
      </div>
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
    .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    .card { border: 1px solid #e5e7eb; border-radius: .5rem; padding: 1rem; }
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
    .card { border: 1px solid #e5e7eb; border-radius: .5rem; padding: 1rem; }
    .actions { margin-top: .75rem; display: flex; gap: .5rem; }
    .btn { display: inline-flex; align-items: center; gap: .5rem; padding: .5rem .75rem; 
           border-radius: .375rem; background: #0ea5e9; color: #fff; text-decoration: none; }
  </style>
</head>
<body>
  <article class="card">
    <h3 class="unify-title">Default Title</h3>
    <p class="unify-body">Default body copy</p>
    <div class="unify-actions actions">
      <a class="btn" href="#"><i class="bi bi-check2"></i> Default</a>
    </div>
  </article>
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
          <a href="/contact">Contact</a>
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
        <div class="actions">
          <a class="btn" href="/pricing">Get Started</a>
          <a class="btn" href="/docs">Read Docs</a>
        </div>
      </div>
    </section>

    <!-- Replace site layout features with components -->
    <section class="unify-features features">
      <div class="container">
        <h2>Why you'll love it</h2>
        <div class="cards">
          <!-- Card 1 -->
          <div data-unify="_includes/components/card.html">
            <h3 class="unify-title">Zero DSL</h3>
            <p class="unify-body">Author with plain HTML/CSS. No new language.</p>
            <div class="unify-actions actions">
              <a class="btn" href="/docs">Learn more</a>
            </div>
          </div>

          <!-- Card 2 -->
          <div data-unify="_includes/components/card.html">
            <h3 class="unify-title">Cascades like CSS</h3>
            <p class="unify-body">Layouts → components → page, with safe scoping.</p>
            <div class="unify-actions actions">
              <a class="btn" href="/blog">See it in action</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Replace site layout CTA -->
    <section class="unify-cta cta">
      <div class="container">
        <h2>Ready to ship?</h2>
        <p>Start building in minutes. Bring your own HTML.</p>
        <a class="btn" href="/signup">Sign up free</a>
      </div>
    </section>
  </main>

  <!-- Override the root footer area -->
  <footer class="unify-footer">
    <div class="container">
      <small>© 2025 ACME • <a href="/legal">Legal</a> • <a href="/privacy">Privacy</a></small>
    </div>
  </footer>
</body>
</html>`;

      const fileSystem = {
        '_includes/layouts/root.html': rootLayout,
        '_includes/layouts/site.html': siteLayout,
        '_includes/components/card.html': cardComponent
      };

      const result = await htmlProcessor.processFile(
        'index.html',
        pageHtml,
        fileSystem,
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Should process full layout chain (site + root = 2)
      expect(result.layoutsProcessed).toBe(2);

      // FAILING ASSERTION: Should have root layout's DOCTYPE and structure
      expect(result.html).toContain('<!doctype html>');
      expect(result.html).toContain('<meta name="viewport"');

      // FAILING ASSERTION: Page title should win over both site and root
      expect(result.html).toContain('<title>Product X — ACME</title>');
      expect(result.html).not.toContain('<title>Site Layout</title>');
      expect(result.html).not.toContain('<title>Root Layout</title>');

      // FAILING ASSERTION: CSS cascade order should be root → site → page
      const headMatch = result.html.match(/<head[^>]*>(.*?)<\/head>/s);
      expect(headMatch).toBeTruthy();
      const headContent = headMatch[1];
      
      const rootStyleIndex = headContent.indexOf('font-family: system-ui');
      const siteStyleIndex = headContent.indexOf('background: #0ea5e9');
      const pageStyleIndex = headContent.indexOf('text-transform: uppercase');
      
      expect(rootStyleIndex).toBeLessThan(siteStyleIndex);
      expect(siteStyleIndex).toBeLessThan(pageStyleIndex);

      // FAILING ASSERTION: Page should override root header
      expect(result.html).toContain('<div class="brand">ACME • Product X</div>');
      expect(result.html).not.toContain('<div class="brand">ACME</div>');
      expect(result.html).toContain('aria-current="page"');

      // FAILING ASSERTION: Page should override site hero
      expect(result.html).toContain('<h1>Meet Product X</h1>');
      expect(result.html).toContain('<p class="kicker">Now available</p>');
      expect(result.html).not.toContain('<h1>Default Site Hero</h1>');

      // FAILING ASSERTION: Component composition should work
      expect(result.html).toContain('<h3 class="unify-title">Zero DSL</h3>');
      expect(result.html).toContain('<h3 class="unify-title">Cascades like CSS</h3>');
      expect(result.html).toContain('<p class="unify-body">Author with plain HTML/CSS');
      expect(result.html).not.toContain('Default Title');
      expect(result.html).not.toContain('Default body copy');

      // FAILING ASSERTION: Page should override CTA
      expect(result.html).toContain('<h2>Ready to ship?</h2>');
      expect(result.html).not.toContain('<h2>Default CTA</h2>');

      // FAILING ASSERTION: Page should override root footer
      expect(result.html).toContain('© 2025 ACME •');
      expect(result.html).toContain('<a href="/legal">Legal</a>');
      expect(result.html).not.toContain('© ACME Corp');

      // FAILING ASSERTION: No data-unify attributes should remain in final output
      expect(result.html).not.toContain('data-unify=');
    });
  });

  describe('Ordered Fill Fallback Example', () => {
    test('should_fail_ordered_fill_fallback_specification_example', async () => {
      // Test the ordered fill fallback mentioned in specification Section 171
      // If no .unify-* classes are used: Page main > section #1 replaces host #1, etc.

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

      // FAILING ASSERTION: Ordered fill should map section by index
      // Section 1→1, 2→2, 3→3, extras should append
      expect(result.html).toContain('Page Section 1 Override');
      expect(result.html).toContain('Page Section 2 Override');
      expect(result.html).toContain('Page Section 3 Override');
      expect(result.html).toContain('Page Section 4 Additional');

      expect(result.html).not.toContain('Layout Section 1');
      expect(result.html).not.toContain('Layout Section 2');
      expect(result.html).not.toContain('Layout Section 3');

      // Should have 4 sections total (3 replacements + 1 extra)
      const sectionMatches = (result.html.match(/<section>/g) || []).length;
      expect(sectionMatches).toBe(4);
    });
  });
});