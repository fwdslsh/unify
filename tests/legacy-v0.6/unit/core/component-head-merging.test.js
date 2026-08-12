/**
 * Component Head Merging Tests
 * Tests for the specific issue where component head elements are not being merged
 */

import { describe, test, expect } from 'bun:test';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('Component Head Merging', () => {
  const pathValidator = new PathValidator();
  const processor = new HtmlProcessor(pathValidator);

  test('should merge component meta elements into final output', async () => {
    const pageHtml = `<!DOCTYPE html>
<html lang="en" data-unify="_includes/layout.html">
<head>
    <title>Page Title Wins</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Page description overrides layout">
    <meta name="author" content="Page Author">
    <meta property="og:title" content="Page OG Title">
    <meta property="og:description" content="Page OG Description">
    <link rel="canonical" href="https://example.com/page">
    <link rel="icon" href="/page-favicon.ico">
    <link rel="stylesheet" href="/page.css">
    <link rel="stylesheet" href="/shared.css">
    <script src="/page.js"></script>
    <script src="/analytics.js"></script>
    <script>
        console.log('Page inline script');
        window.pageLoaded = true;
    </script>
    <script>
        console.log('Analytics component loaded');
        window.analyticsReady = true;
    </script>
</head>
<body>
    <!-- Page content targeting layout areas -->
    <section class="unify-content">
        <h2>Page Content</h2>
        <p>This replaces the default layout content.</p>
    </section>
    
    <!-- Page content targeting component areas -->
    <div class="unify-tracking-content">
        <p>Custom tracking content from page</p>
    </div>
</body>
</html>`;

    const layoutHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <title>Layout Title</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Layout description">
    <meta property="og:title" content="Layout OG Title">
    <meta property="og:type" content="website">
    <link rel="canonical" href="https://example.com/layout">
    <link rel="icon" href="/layout-favicon.ico">
    <link rel="stylesheet" href="/layout.css">
    <link rel="stylesheet" href="/shared.css">
    <script src="/layout.js"></script>
    <script>
        console.log('Layout inline script');
        window.layoutLoaded = true;
    </script>
</head>
<body>
    <header>
        <h1>Site Header</h1>
    </header>
    <main>
        <div data-unify="_components/analytics.html">
            <!-- Analytics component gets imported here -->
        </div>
        <section class="unify-content">
            <h2>Default Content</h2>
        </section>
    </main>
</body>
</html>`;

    const analyticsComponentHtml = `<head>
    <meta name="analytics-version" content="2.1.0">
    <meta property="og:type" content="article">
    <link rel="stylesheet" href="/analytics.css">
    <link rel="stylesheet" href="/shared.css">
    <script src="/analytics.js"></script>
    <script src="/layout.js"></script>
    <script>
        console.log('Analytics component loaded');
        window.analyticsReady = true;
    </script>
</head>
<div class="analytics-wrapper">
    <div class="unify-tracking-content">
        <p>Default tracking placeholder</p>
    </div>
</div>`;

    const fileSystem = {
      'index.html': pageHtml,
      '_includes/layout.html': layoutHtml,
      '_components/analytics.html': analyticsComponentHtml
    };

    const result = await processor.processFile('index.html', pageHtml, fileSystem, '.', {});
    
    expect(result.success).toBe(true);
    
    // The key assertion: component meta elements should be present in final output
    // Check for both possible attribute orders since HTML attributes can be in any order
    const hasAnalyticsVersion = result.html.includes('name="analytics-version" content="2.1.0"') || 
                                result.html.includes('content="2.1.0" name="analytics-version"');
    expect(hasAnalyticsVersion).toBe(true);
    
    const hasOgType = result.html.includes('property="og:type" content="article"') ||
                      result.html.includes('content="article" property="og:type"');
    expect(hasOgType).toBe(true);
    
    // Verify page wins for title
    expect(result.html).toContain('<title>Page Title Wins</title>');
    
    // Verify page wins for duplicate meta elements
    // Check for both possible attribute orders since HTML attributes can be in any order  
    const hasDescription = result.html.includes('name="description" content="Page description overrides layout"') ||
                          result.html.includes('content="Page description overrides layout" name="description"');
    expect(hasDescription).toBe(true);
    
    const hasOgTitle = result.html.includes('property="og:title" content="Page OG Title"') ||
                       result.html.includes('content="Page OG Title" property="og:title"');
    expect(hasOgTitle).toBe(true);
    
    const hasOgDescription = result.html.includes('property="og:description" content="Page OG Description"') ||
                             result.html.includes('content="Page OG Description" property="og:description"');
    expect(hasOgDescription).toBe(true);
    
    // Per DOM Cascade spec: Components are a separate scope, so page areas can't match into components
    // The component's default content should remain unchanged
    expect(result.html).toContain('<p>Default tracking placeholder</p>');
  });
  
  test('should NOT have component head block in body (component head should be extracted)', async () => {
    const pageHtml = `<!DOCTYPE html>
<html lang="en" data-unify="_includes/layout.html">
<head>
    <title>Page Title Wins</title>
    <meta name="description" content="Page description overrides layout">
</head>
<body>
    <section class="unify-content">
        <h2>Page Content</h2>
    </section>
</body>
</html>`;

    const layoutHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <title>Layout Title</title>
</head>
<body>
    <main>
        <div data-unify="_components/analytics.html">
            <!-- Analytics component gets imported here -->
        </div>
        <section class="unify-content">
            <h2>Default Content</h2>
        </section>
    </main>
</body>
</html>`;

    const analyticsComponentHtml = `<head>
    <meta name="analytics-version" content="2.1.0">
</head>
<div class="analytics-wrapper">
    <p>Component content</p>
</div>`;

    const fileSystem = {
      'index.html': pageHtml,
      '_includes/layout.html': layoutHtml,
      '_components/analytics.html': analyticsComponentHtml
    };

    const result = await processor.processFile('index.html', pageHtml, fileSystem, '.', {});
    
    expect(result.success).toBe(true);
    
    // Component head elements should NOT appear as separate head block in body
    expect(result.html).not.toContain('<head>\n    <meta name="analytics-version"');
    
    // Component head elements SHOULD be merged into main document head
    // Check for both possible attribute orders since HTML attributes can be in any order
    const hasAnalyticsVersion = result.html.includes('name="analytics-version" content="2.1.0"') || 
                                result.html.includes('content="2.1.0" name="analytics-version"');
    expect(hasAnalyticsVersion).toBe(true);
  });
});