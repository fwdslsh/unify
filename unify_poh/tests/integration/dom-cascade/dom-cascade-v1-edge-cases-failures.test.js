/**
 * DOM Cascade v1 Edge Cases and Advanced Scenarios Failing Test Suite
 * 
 * These tests focus on edge cases and advanced scenarios that should work
 * according to the DOM Cascade v1 specification but currently fail.
 * 
 * See: /home/founder3/code/github/fwdslsh/unify/unify_poh/specs/dom-spec.md
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TempProject } from '../../helpers/temp-project.js';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('DOM Cascade v1 Edge Cases Failures', () => {
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

  describe('Complex Layout Chain Failures', () => {
    test('should_fail_deep_layout_nesting_with_circular_detection', async () => {
      // Test deep nesting near the MAX_LAYOUT_DEPTH (10) limit
      const layouts = {};
      
      // Create a chain of 8 layouts (safely under the 10 limit)
      for (let i = 1; i <= 8; i++) {
        const nextLayout = i < 8 ? `_includes/layouts/level${i + 1}.html` : null;
        layouts[`_includes/layouts/level${i}.html`] = `<!doctype html>
<html>
<head>
  <title>Level ${i} Layout</title>
  <style>
    .level${i} { background: hsl(${i * 45}, 50%, 50%); }
  </style>
</head>
<body${nextLayout ? ` data-unify="${nextLayout}"` : ''}>
  <div class="unify-content level${i}">
    <h${i}>Level ${i} Content</h${i}>
    <div class="level${i}-specific">Level ${i} specific content</div>
  </div>
</body>
</html>`;
      }

      const pageHtml = `<!doctype html>
<html>
<head>
  <title>Deep Page</title>
  <style>
    .page-override { color: red; }
  </style>
</head>
<body data-unify="_includes/layouts/level1.html">
  <div class="unify-content page-override">
    <h1>Page Override Content</h1>
    <p>This should replace the content from all 8 layout levels</p>
  </div>
</body>
</html>`;

      const result = await htmlProcessor.processFile(
        'deep-test.html',
        pageHtml,
        layouts,
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Should process all 8 layouts in chain
      expect(result.layoutsProcessed).toBe(8);

      // FAILING ASSERTION: CSS cascade should include all layout levels
      for (let i = 1; i <= 8; i++) {
        expect(result.html).toContain(`.level${i}`);
        expect(result.html).toContain(`hsl(${i * 45}, 50%, 50%)`);
      }

      // FAILING ASSERTION: Final content should be page content
      expect(result.html).toContain('<h1>Page Override Content</h1>');
      expect(result.html).not.toContain('<h1>Level 1 Content</h1>');

      // FAILING ASSERTION: Title should be from page (last in cascade)
      expect(result.html).toContain('<title>Deep Page</title>');

      // FAILING ASSERTION: Page styles should come last in cascade
      const cssIndex = result.html.indexOf('.page-override { color: red; }');
      const level8Index = result.html.indexOf('.level8');
      expect(cssIndex).toBeGreaterThan(level8Index);
    });

    test('should_fail_layout_chain_with_missing_intermediate_layout', async () => {
      // Test graceful handling of missing layout in chain
      const level1Layout = `<!doctype html>
<html>
<head><title>Level 1</title></head>
<body data-unify="_includes/layouts/missing-level2.html">
  <div class="unify-content">
    <h1>Level 1 Content</h1>
  </div>
</body>
</html>`;

      const level3Layout = `<!doctype html>
<html>
<head><title>Level 3</title></head>
<body>
  <div class="unify-content">
    <h3>Level 3 Content</h3>
  </div>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<head><title>Page</title></head>
<body data-unify="_includes/layouts/level1.html">
  <div class="unify-content">
    <h1>Page Content</h1>
  </div>
</body>
</html>`;

      const fileSystem = {
        '_includes/layouts/level1.html': level1Layout,
        '_includes/layouts/level3.html': level3Layout
        // '_includes/layouts/missing-level2.html' is intentionally missing
      };

      const result = await htmlProcessor.processFile(
        'test.html',
        pageHtml,
        fileSystem,
        tempProject.path()
      );

      // FAILING ASSERTION: Should succeed with graceful fallback
      expect(result.success).toBe(true);

      // FAILING ASSERTION: Should have recoverable error for missing layout
      expect(result.recoverableErrors).toContain(
        expect.stringContaining('Layout file not found: _includes/layouts/missing-level2.html')
      );

      // FAILING ASSERTION: Should fallback to processing only the available layout
      expect(result.layoutsProcessed).toBe(1); // Only level1, level2 missing so chain stops

      // FAILING ASSERTION: Should still apply page composition to level1
      expect(result.html).toContain('<h1>Page Content</h1>');
      expect(result.html).not.toContain('<h1>Level 1 Content</h1>');
    });
  });

  describe('Area Class Matching Edge Cases', () => {
    test('should_fail_area_uniqueness_validation_within_scope', async () => {
      // Test that duplicate area classes in same scope are detected and handled
      const layoutHtml = `<!doctype html>
<html>
<head>
  <style data-unify-docs="v1">
    .unify-hero { }
  </style>
</head>
<body>
  <!-- INVALID: Multiple unify-hero in same scope -->
  <section class="unify-hero">
    <h1>First Hero</h1>
  </section>
  
  <div class="unify-hero">
    <h2>Second Hero</h2>
  </div>
  
  <article class="unify-hero">
    <h3>Third Hero</h3>
  </article>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <section class="unify-hero">
    <h1>Page Hero Override</h1>
  </section>
</body>
</html>`;

      const result = await htmlProcessor.processFile(
        'test.html',
        pageHtml,
        {},
        tempProject.path()
      );

      // FAILING ASSERTION: Should detect area uniqueness violation
      // Implementation should warn about duplicate area classes
      expect(result.success).toBe(true);
      // Note: This might generate warnings in a full implementation
      
      // FAILING ASSERTION: Should handle ambiguous matching gracefully
      // Only the first matching element should be replaced
      const heroMatches = (result.html.match(/unify-hero/g) || []).length;
      expect(heroMatches).toBe(3); // Should preserve all three in layout but warn

      // The first one should be replaced with page content
      expect(result.html).toContain('<h1>Page Hero Override</h1>');
      // The others should remain from layout
      expect(result.html).toContain('<h2>Second Hero</h2>');
      expect(result.html).toContain('<h3>Third Hero</h3>');
    });

    test('should_fail_complex_area_class_with_multiple_classes', async () => {
      // Test area matching with complex class combinations
      const layoutHtml = `<!doctype html>
<html>
<body>
  <section class="hero primary unify-hero featured" data-theme="dark">
    <h1>Layout Hero</h1>
  </section>
  
  <div class="sidebar secondary unify-sidebar" data-position="right">
    <p>Layout Sidebar</p>
  </div>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <section class="hero custom unify-hero spotlight" data-theme="light" data-animation="fade">
    <h1>Page Hero Override</h1>
  </section>
  
  <aside class="sidebar custom unify-sidebar" data-position="left">
    <p>Page Sidebar Override</p>
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

      // FAILING ASSERTION: Should match by unify-hero class regardless of other classes
      expect(result.html).toContain('<h1>Page Hero Override</h1>');
      expect(result.html).not.toContain('<h1>Layout Hero</h1>');

      // FAILING ASSERTION: Class union should preserve layout classes and add page classes
      expect(result.html).toContain('class="hero primary unify-hero featured custom spotlight"');

      // FAILING ASSERTION: Attribute merging should follow page-wins policy
      expect(result.html).toContain('data-theme="light"'); // Page wins
      expect(result.html).toContain('data-animation="fade"'); // Page only

      // FAILING ASSERTION: Sidebar should also be matched and merged
      expect(result.html).toContain('<p>Page Sidebar Override</p>');
      expect(result.html).toContain('data-position="left"'); // Page wins
    });

    test('should_fail_nested_area_matching_with_component_imports', async () => {
      // Test area matching when components are imported within areas
      const layoutHtml = `<!doctype html>
<html>
<body>
  <section class="unify-features">
    <h2>Layout Features</h2>
    <div data-unify="_includes/components/feature-card.html">
      <h3 class="unify-title">Layout Feature 1</h3>
      <p class="unify-body">Layout feature description</p>
    </div>
  </section>
</body>
</html>`;

      const featureCardComponent = `<!doctype html>
<html>
<head>
  <style data-unify-docs="v1">
    .unify-title { }
    .unify-body { }
    .unify-actions { }
  </style>
</head>
<body>
  <article class="card">
    <h3 class="unify-title">Default Title</h3>
    <p class="unify-body">Default description</p>
    <div class="unify-actions">
      <button class="btn">Default Action</button>
    </div>
  </article>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <section class="unify-features">
    <h2>Page Features Override</h2>
    <!-- This should replace the entire features section including the component import -->
    <div data-unify="_includes/components/feature-card.html">
      <h3 class="unify-title">Page Feature 1</h3>
      <p class="unify-body">Page feature description</p>
      <div class="unify-actions">
        <a href="/learn-more" class="btn">Learn More</a>
      </div>
    </div>
    <div class="manual-feature">
      <h3>Manual Feature</h3>
      <p>This is a manual feature without components</p>
    </div>
  </section>
</body>
</html>`;

      const fileSystem = {
        '_includes/components/feature-card.html': featureCardComponent
      };

      const result = await htmlProcessor.processFile(
        'test.html',
        pageHtml,
        fileSystem,
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Page should override layout's features section entirely
      expect(result.html).toContain('<h2>Page Features Override</h2>');
      expect(result.html).not.toContain('<h2>Layout Features</h2>');

      // FAILING ASSERTION: Component composition should work in page context
      expect(result.html).toContain('<h3 class="unify-title">Page Feature 1</h3>');
      expect(result.html).toContain('<p class="unify-body">Page feature description</p>');
      expect(result.html).toContain('<a href="/learn-more" class="btn">Learn More</a>');

      // FAILING ASSERTION: Manual content should also be preserved
      expect(result.html).toContain('<h3>Manual Feature</h3>');

      // Should not contain layout's component content
      expect(result.html).not.toContain('Layout feature description');
    });
  });

  describe('Attribute Merging Edge Cases', () => {
    test('should_fail_boolean_attributes_merging', async () => {
      // Test boolean attributes are present if either side has them
      const layoutHtml = `<!doctype html>
<html>
<body>
  <form class="unify-signup">
    <input class="unify-email" type="email" required autocomplete="email" />
    <button class="unify-submit" type="submit" disabled>Submit</button>
  </form>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <form class="unify-signup" novalidate>
    <input class="unify-email" type="email" readonly placeholder="Enter email" />
    <button class="unify-submit" type="submit">Submit Now</button>
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

      // FAILING ASSERTION: Boolean attributes should be present if either side has them
      expect(result.html).toContain('required'); // From layout
      expect(result.html).toContain('readonly'); // From page
      expect(result.html).toContain('novalidate'); // From page

      // FAILING ASSERTION: Other attributes follow page-wins policy
      expect(result.html).toContain('placeholder="Enter email"'); // Page wins
      expect(result.html).toContain('autocomplete="email"'); // Layout only

      // FAILING ASSERTION: Button should not be disabled (page doesn't have disabled)
      expect(result.html).not.toContain('disabled');
      expect(result.html).toContain('>Submit Now</button>'); // Page content wins
    });

    test('should_fail_data_attributes_merging_with_json_values', async () => {
      // Test complex data attributes with JSON values
      const layoutHtml = `<!doctype html>
<html>
<body>
  <div class="unify-widget" 
       data-config='{"theme": "dark", "size": "large"}' 
       data-analytics="layout-widget"
       data-features='["search", "filter"]'>
    <h3>Layout Widget</h3>
  </div>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <div class="unify-widget" 
       data-config='{"theme": "light", "animation": "fade"}' 
       data-user="user-123"
       data-features='["search", "sort", "export"]'>
    <h3>Page Widget Override</h3>
  </div>
</body>
</html>`;

      const result = await htmlProcessor.processFile(
        'test.html',
        pageHtml,
        {},
        tempProject.path()
      );

      expect(result.success).toBe(true);

      // FAILING ASSERTION: Page data attributes should win over layout
      expect(result.html).toContain('data-config=\'{"theme": "light", "animation": "fade"}\'');
      expect(result.html).not.toContain('data-config=\'{"theme": "dark", "size": "large"}\'');

      expect(result.html).toContain('data-features=\'["search", "sort", "export"]\'');
      expect(result.html).not.toContain('data-features=\'["search", "filter"]\'');

      // FAILING ASSERTION: Layout-only attributes should be preserved
      expect(result.html).toContain('data-analytics="layout-widget"');

      // FAILING ASSERTION: Page-only attributes should be added
      expect(result.html).toContain('data-user="user-123"');

      // FAILING ASSERTION: Content should be from page
      expect(result.html).toContain('<h3>Page Widget Override</h3>');
    });

    test('should_fail_aria_attributes_with_id_rewriting', async () => {
      // Test ARIA attributes with ID references that need rewriting
      const layoutHtml = `<!doctype html>
<html>
<body>
  <div class="unify-modal" 
       role="dialog" 
       aria-labelledby="layout-title" 
       aria-describedby="layout-desc"
       id="layout-modal">
    <h2 id="layout-title">Layout Modal Title</h2>
    <p id="layout-desc">Layout modal description</p>
    <button aria-controls="layout-modal">Close</button>
  </div>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<body>
  <div class="unify-modal" 
       role="dialog" 
       aria-labelledby="page-title" 
       aria-describedby="page-desc"
       aria-live="polite"
       id="page-modal">
    <h2 id="page-title">Page Modal Title</h2>
    <p id="page-desc">Page modal description with more details</p>
    <button aria-controls="page-modal" type="button">Close Modal</button>
  </div>
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
      expect(result.html).toContain('id="layout-modal"');
      expect(result.html).toContain('id="layout-title"');
      expect(result.html).toContain('id="layout-desc"');

      // FAILING ASSERTION: Page ARIA references should be rewritten to retained IDs
      expect(result.html).toContain('aria-labelledby="layout-title"');
      expect(result.html).toContain('aria-describedby="layout-desc"');
      expect(result.html).toContain('aria-controls="layout-modal"');

      // FAILING ASSERTION: Page-only ARIA attributes should be preserved
      expect(result.html).toContain('aria-live="polite"');

      // FAILING ASSERTION: Page content should be used with retained IDs
      expect(result.html).toContain('<h2 id="layout-title">Page Modal Title</h2>');
      expect(result.html).toContain('<p id="layout-desc">Page modal description with more details</p>');

      // Page IDs should not appear in final output
      expect(result.html).not.toContain('id="page-modal"');
      expect(result.html).not.toContain('id="page-title"');
      expect(result.html).not.toContain('id="page-desc"');
    });
  });

  describe('Head Merging Edge Cases', () => {
    test('should_fail_meta_deduplication_by_composite_keys', async () => {
      // Test meta tag deduplication by name/property/http-equiv keys
      const layoutHtml = `<!doctype html>
<html>
<head>
  <meta name="description" content="Layout description" />
  <meta name="keywords" content="layout, keywords" />
  <meta property="og:title" content="Layout OG Title" />
  <meta property="og:description" content="Layout OG Description" />
  <meta http-equiv="cache-control" content="no-cache" />
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <main class="unify-content">Layout content</main>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<head>
  <meta name="description" content="Page description override" />
  <meta name="author" content="Page Author" />
  <meta property="og:title" content="Page OG Title" />
  <meta property="og:image" content="/page-image.jpg" />
  <meta http-equiv="cache-control" content="max-age=3600" />
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
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

      // FAILING ASSERTION: Page meta should override matching layout meta
      expect(result.html).toContain('name="description" content="Page description override"');
      expect(result.html).not.toContain('content="Layout description"');

      expect(result.html).toContain('property="og:title" content="Page OG Title"');
      expect(result.html).not.toContain('content="Layout OG Title"');

      expect(result.html).toContain('http-equiv="cache-control" content="max-age=3600"');
      expect(result.html).not.toContain('content="no-cache"');

      expect(result.html).toContain('name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no"');

      // FAILING ASSERTION: Non-conflicting meta should be preserved from layout
      expect(result.html).toContain('name="keywords" content="layout, keywords"');
      expect(result.html).toContain('charset="utf-8"');

      // FAILING ASSERTION: Page-only meta should be added
      expect(result.html).toContain('name="author" content="Page Author"');
      expect(result.html).toContain('property="og:image" content="/page-image.jpg"');

      // FAILING ASSERTION: Should not have duplicate meta tags
      const descriptionMatches = (result.html.match(/name="description"/g) || []).length;
      const ogTitleMatches = (result.html.match(/property="og:title"/g) || []).length;
      const cacheControlMatches = (result.html.match(/http-equiv="cache-control"/g) || []).length;

      expect(descriptionMatches).toBe(1);
      expect(ogTitleMatches).toBe(1);
      expect(cacheControlMatches).toBe(1);
    });

    test('should_fail_link_deduplication_by_rel_and_href', async () => {
      // Test link tag deduplication
      const layoutHtml = `<!doctype html>
<html>
<head>
  <link rel="stylesheet" href="/css/normalize.css" />
  <link rel="stylesheet" href="/css/layout.css" />
  <link rel="icon" href="/favicon-layout.ico" />
  <link rel="canonical" href="https://example.com/layout" />
  <link rel="preload" href="/fonts/main.woff2" as="font" crossorigin />
</head>
<body>
  <main class="unify-content">Layout</main>
</body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<head>
  <link rel="stylesheet" href="/css/normalize.css" />
  <link rel="stylesheet" href="/css/page.css" />
  <link rel="icon" href="/favicon-page.ico" />
  <link rel="canonical" href="https://example.com/page" />
  <link rel="preload" href="/fonts/headings.woff2" as="font" crossorigin />
  <link rel="alternate" href="/feed.xml" type="application/rss+xml" />
</head>
<body data-unify="_includes/layouts/layout.html">
  <main class="unify-content">Page</main>
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

      // FAILING ASSERTION: Duplicate stylesheets should be deduplicated
      const normalizeMatches = (result.html.match(/href="\/css\/normalize\.css"/g) || []).length;
      expect(normalizeMatches).toBe(1); // Should appear only once

      // FAILING ASSERTION: Page should override conflicting links (icon, canonical)
      expect(result.html).toContain('rel="icon" href="/favicon-page.ico"');
      expect(result.html).not.toContain('href="/favicon-layout.ico"');

      expect(result.html).toContain('rel="canonical" href="https://example.com/page"');
      expect(result.html).not.toContain('href="https://example.com/layout"');

      // FAILING ASSERTION: Non-conflicting links should be preserved
      expect(result.html).toContain('href="/fonts/main.woff2"');
      expect(result.html).toContain('href="/fonts/headings.woff2"');

      // FAILING ASSERTION: Page-only links should be added
      expect(result.html).toContain('rel="alternate" href="/feed.xml"');

      // FAILING ASSERTION: CSS cascade order should be maintained
      const layoutCssIndex = result.html.indexOf('/css/layout.css');
      const pageCssIndex = result.html.indexOf('/css/page.css');
      expect(layoutCssIndex).toBeLessThan(pageCssIndex);
    });

    test('should_fail_script_deduplication_by_src_and_content_hash', async () => {
      // Test script deduplication by src for external and by content hash for inline
      const layoutHtml = `<!doctype html>
<html>
<head>
  <script src="/js/jquery.min.js"></script>
  <script src="/js/layout.js"></script>
  <script>
    // Common utility function
    function toggleClass(el, className) {
      el.classList.toggle(className);
    }
  </script>
  <script>
    // Layout-specific initialization
    document.addEventListener('DOMContentLoaded', function() {
      console.log('Layout initialized');
    });
  </script>
</head>
<body><main class="unify-content">Layout</main></body>
</html>`;

      const pageHtml = `<!doctype html>
<html>
<head>
  <script src="/js/jquery.min.js"></script>
  <script src="/js/page.js"></script>
  <script>
    // Same utility function - should be deduplicated
    function toggleClass(el, className) {
      el.classList.toggle(className);
    }
  </script>
  <script>
    // Page-specific initialization
    document.addEventListener('DOMContentLoaded', function() {
      console.log('Page initialized');
    });
  </script>
</head>
<body data-unify="_includes/layouts/layout.html">
  <main class="unify-content">Page</main>
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

      // FAILING ASSERTION: External scripts should be deduplicated by src
      const jqueryMatches = (result.html.match(/src="\/js\/jquery\.min\.js"/g) || []).length;
      expect(jqueryMatches).toBe(1);

      // FAILING ASSERTION: Different external scripts should both be included
      expect(result.html).toContain('src="/js/layout.js"');
      expect(result.html).toContain('src="/js/page.js"');

      // FAILING ASSERTION: Identical inline scripts should be deduplicated by content hash
      const toggleFunctionMatches = (result.html.match(/function toggleClass/g) || []).length;
      expect(toggleFunctionMatches).toBe(1);

      // FAILING ASSERTION: Different inline scripts should both be included
      expect(result.html).toContain('Layout initialized');
      expect(result.html).toContain('Page initialized');

      // FAILING ASSERTION: Script order should be maintained (layout → page)
      const layoutScriptIndex = result.html.indexOf('Layout initialized');
      const pageScriptIndex = result.html.indexOf('Page initialized');
      expect(layoutScriptIndex).toBeLessThan(pageScriptIndex);
    });
  });
});