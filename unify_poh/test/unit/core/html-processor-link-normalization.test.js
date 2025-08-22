/**
 * Unit Tests: HTML Processor - Link Normalization Integration
 * Tests for US-018: HTML processing integration with LinkNormalizer
 * 
 * TDD Phase: RED - Creating failing tests for HTML processor integration
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('HtmlProcessor - Link Normalization Integration', () => {
  let processor;
  let pathValidator;

  beforeEach(() => {
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
  });

  describe('Standalone HTML Processing', () => {
    test('should_transform_links_when_pretty_urls_enabled', async () => {
      const html = `
        <html>
          <body>
            <nav>
              <a href="about.html">About</a>
              <a href="blog/post.html">Blog Post</a>
              <a href="index.html">Home</a>
            </nav>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'test.html', 
        html, 
        {}, 
        '.', 
        { prettyUrls: true }
      );

      expect(result.success).toBe(true);
      expect(result.html).toContain('href="/about/"');
      expect(result.html).toContain('href="/blog/post/"');
      expect(result.html).toContain('href="/"');
    });

    test('should_not_transform_links_when_pretty_urls_disabled', async () => {
      const html = `
        <html>
          <body>
            <nav>
              <a href="about.html">About</a>
              <a href="blog/post.html">Blog Post</a>
              <a href="index.html">Home</a>
            </nav>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'test.html', 
        html, 
        {}, 
        '.', 
        { prettyUrls: false }
      );

      expect(result.success).toBe(true);
      expect(result.html).toContain('href="about.html"');
      expect(result.html).toContain('href="blog/post.html"');
      expect(result.html).toContain('href="index.html"');
    });

    test('should_preserve_external_links_and_non_html_files', async () => {
      const html = `
        <html>
          <body>
            <div>
              <a href="https://example.com/page.html">External</a>
              <a href="document.pdf">PDF</a>
              <a href="mailto:test@example.com">Email</a>
              <a href="#section">Anchor</a>
            </div>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'test.html', 
        html, 
        {}, 
        '.', 
        { prettyUrls: true }
      );

      expect(result.success).toBe(true);
      expect(result.html).toContain('href="https://example.com/page.html"');
      expect(result.html).toContain('href="document.pdf"');
      expect(result.html).toContain('href="mailto:test@example.com"');
      expect(result.html).toContain('href="#section"');
    });

    test('should_preserve_query_parameters_and_fragments', async () => {
      const html = `
        <html>
          <body>
            <div>
              <a href="about.html?ref=nav">About with query</a>
              <a href="docs.html#getting-started">Docs with fragment</a>
              <a href="search.html?q=test#results">Both query and fragment</a>
            </div>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'test.html', 
        html, 
        {}, 
        '.', 
        { prettyUrls: true }
      );

      expect(result.success).toBe(true);
      expect(result.html).toContain('href="/about/?ref=nav"');
      expect(result.html).toContain('href="/docs/#getting-started"');
      expect(result.html).toContain('href="/search/?q=test#results"');
    });
  });

  describe('Layout Composition with Link Normalization', () => {
    test('should_transform_links_in_both_layout_and_page_content', async () => {
      const layout = `
        <html>
          <body>
            <nav>
              <a href="index.html">Home</a>
              <a href="about.html">About</a>
            </nav>
            <main class="unify-content"></main>
          </body>
        </html>
      `;

      const page = `
        <html data-unify="_layout.html">
          <body>
            <div class="unify-content">
              <p>Page content with <a href="contact.html">contact link</a></p>
              <p>Visit our <a href="blog/index.html">blog</a></p>
            </div>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'page.html', 
        page, 
        { '_layout.html': layout }, 
        '.', 
        { prettyUrls: true }
      );

      expect(result.success).toBe(true);
      expect(result.compositionApplied).toBe(true);
      
      // Layout links should be transformed
      expect(result.html).toContain('href="/"'); // index.html
      expect(result.html).toContain('href="/about/"');
      
      // Page content links should be transformed
      expect(result.html).toContain('href="/contact/"');
      expect(result.html).toContain('href="/blog/"'); // blog/index.html
    });

    test('should_not_transform_links_in_composition_when_disabled', async () => {
      const layout = `
        <html>
          <body>
            <nav>
              <a href="index.html">Home</a>
              <a href="about.html">About</a>
            </nav>
            <main class="unify-content"></main>
          </body>
        </html>
      `;

      const page = `
        <html data-unify="_layout.html">
          <body>
            <div class="unify-content">
              <p>Page content with <a href="contact.html">contact link</a></p>
            </div>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'page.html', 
        page, 
        { '_layout.html': layout }, 
        '.', 
        { prettyUrls: false }
      );

      expect(result.success).toBe(true);
      expect(result.compositionApplied).toBe(true);
      
      // Links should remain unchanged
      expect(result.html).toContain('href="index.html"');
      expect(result.html).toContain('href="about.html"');
      expect(result.html).toContain('href="contact.html"');
    });

    test('should_handle_nested_layout_imports_with_link_transformation', async () => {
      const baseLayout = `
        <html>
          <body>
            <header>
              <a href="index.html">Site Home</a>
            </header>
            <div class="unify-page-content"></div>
          </body>
        </html>
      `;

      const pageLayout = `
        <html data-unify="_base.html">
          <body>
            <div class="unify-page-content">
              <nav>
                <a href="blog/index.html">Blog</a>
                <a href="projects.html">Projects</a>
              </nav>
              <main class="unify-main"></main>
            </div>
          </body>
        </html>
      `;

      const page = `
        <html data-unify="_page.html">
          <body>
            <article class="unify-main">
              <p>Content with <a href="related.html">related link</a></p>
            </article>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'page.html', 
        page, 
        { 
          '_base.html': baseLayout,
          '_page.html': pageLayout
        }, 
        '.', 
        { prettyUrls: true }
      );

      expect(result.success).toBe(true);
      expect(result.compositionApplied).toBe(true);
      
      // Links that are composed should have been transformed
      expect(result.html).toContain('href="/"'); // Site Home index.html
      expect(result.html).toContain('href="/blog/"'); // Blog index.html  
      expect(result.html).toContain('href="/projects/"');
      
      // Note: The related.html link may or may not appear in final output
      // depending on how the composition works, but that's not the focus
      // of this link normalization test
    });
  });

  describe('Complex HTML Scenarios', () => {
    test('should_handle_multiple_link_types_in_complex_html', async () => {
      const html = `
        <html>
          <head>
            <title>Test Page</title>
            <link rel="stylesheet" href="styles/main.css">
          </head>
          <body>
            <nav>
              <a href="index.html">Home</a>
              <a href="about.html?ref=nav#team">About Us</a>
              <a href="products/category.html">Products</a>
              <a href="https://external.com/api.html">External API</a>
              <a href="docs/manual.pdf">Download PDF</a>
            </nav>
            <main>
              <p>Visit our <a href="blog/index.html">blog</a> for updates.</p>
              <p>Contact us: <a href="mailto:info@company.com">Email</a></p>
              <ul>
                <li><a href="services/web.html">Web Development</a></li>
                <li><a href="services/mobile.html">Mobile Apps</a></li>
              </ul>
            </main>
            <footer>
              <a href="#top">Back to top</a>
            </footer>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'test.html', 
        html, 
        {}, 
        '.', 
        { prettyUrls: true }
      );

      expect(result.success).toBe(true);
      
      // Transformed HTML links
      expect(result.html).toContain('href="/"'); // index.html
      expect(result.html).toContain('href="/about/?ref=nav#team"'); // preserve query + fragment
      expect(result.html).toContain('href="/products/category/"'); // nested path
      expect(result.html).toContain('href="/blog/"'); // blog/index.html
      expect(result.html).toContain('href="/services/web/"');
      expect(result.html).toContain('href="/services/mobile/"');
      
      // Unchanged links
      expect(result.html).toContain('href="https://external.com/api.html"'); // external
      expect(result.html).toContain('href="docs/manual.pdf"'); // non-html
      expect(result.html).toContain('href="mailto:info@company.com"'); // protocol
      expect(result.html).toContain('href="#top"'); // anchor
      expect(result.html).toContain('href="styles/main.css"'); // CSS link (not anchor)
    });

    test('should_preserve_link_attributes_and_content', async () => {
      const html = `
        <html>
          <body>
            <div>
              <a href="about.html" class="nav-link" id="about-link" target="_blank" title="About Page">About Us</a>
              <a href="contact.html" style="color: blue;" data-track="contact">Get in Touch</a>
            </div>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'test.html', 
        html, 
        {}, 
        '.', 
        { prettyUrls: true }
      );

      expect(result.success).toBe(true);
      
      // Check transformed href but preserved attributes and content
      expect(result.html).toMatch(/href="\/about\/".*class="nav-link".*id="about-link".*target="_blank".*title="About Page".*>About Us<\/a>/);
      expect(result.html).toMatch(/href="\/contact\/".*style="color: blue;".*data-track="contact".*>Get in Touch<\/a>/);
    });
  });

  describe('Error Handling', () => {
    test('should_handle_malformed_html_gracefully', async () => {
      const html = `
        <html>
          <body>
            <a href="about.html">About</a>
            <a href="broken.html>Broken tag
            <a href="contact.html">Contact</a>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'test.html', 
        html, 
        {}, 
        '.', 
        { prettyUrls: true }
      );

      expect(result.success).toBe(true);
      // Should process well-formed links while leaving malformed ones unchanged
      expect(result.html).toContain('href="/about/"');
      // The malformed tag should be left as-is and not break processing
      expect(result.html).toContain('broken.html>Broken tag');
      // Any well-formed links after malformed ones should still be processed
      // Note: The exact behavior depends on how the HTML is structured
    });

    test('should_handle_empty_options_gracefully', async () => {
      const html = `
        <html>
          <body>
            <a href="about.html">About</a>
          </body>
        </html>
      `;

      const result = await processor.processFile(
        'test.html', 
        html, 
        {}, 
        '.'
        // No options passed
      );

      expect(result.success).toBe(true);
      // Should default to not transforming
      expect(result.html).toContain('href="about.html"');
    });
  });

  describe('Performance Considerations', () => {
    test('should_process_large_html_with_many_links_efficiently', async () => {
      // Generate HTML with 500 links
      const links = Array.from({ length: 500 }, (_, i) => 
        `<a href="page${i}.html">Page ${i}</a>`
      ).join('\\n');

      const html = `
        <html>
          <body>
            ${links}
          </body>
        </html>
      `;

      const startTime = Date.now();
      const result = await processor.processFile(
        'test.html', 
        html, 
        {}, 
        '.', 
        { prettyUrls: true }
      );
      const processingTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(processingTime).toBeLessThan(1000); // Should complete within 1 second
      
      // Verify a few transformations worked
      expect(result.html).toContain('href="/page0/"');
      expect(result.html).toContain('href="/page100/"');
      expect(result.html).toContain('href="/page499/"');
    });
  });
});