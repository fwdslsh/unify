/**
 * HTML Processor ID Stability Tests - DOM Cascade v1 Compliance
 * 
 * Tests that inner element IDs from layout are preserved when merging content
 * per DOM Cascade v1 ID stability requirements.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { UnifyProcessor } from '../../../src/core/html-processor.js';

describe('UnifyProcessor ID Stability', () => {
  let htmlProcessor;

  beforeEach(() => {
    // Create minimal logger mock
    const logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };
    
    htmlProcessor = new UnifyProcessor({ logger });
  });

  /**
   * Test for Issue 1: ID Stability violation
   * 
   * When merging content, layout IDs should be preserved for inner elements
   * while page content replaces layout content.
   */
  test('should_preserve_layout_inner_element_ids_during_area_merging', async () => {
    // Layout with inner elements having IDs
    const layoutHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Layout</title></head>
        <body>
          <section class="unify-hero" id="hero-section" data-theme="dark">
            <h2 id="hero-title">Default Hero</h2>
            <p class="hero-subtitle">Default subtitle</p>
          </section>
        </body>
      </html>
    `;

    // Page with different content and IDs
    const pageHtml = `
      <!DOCTYPE html>
      <html data-unify="_includes/layout.html">
        <head><title>Page Title</title></head>
        <body>
          <section class="unify-hero" data-theme="light" data-custom="page-value">
            <h2 id="page-title">Page Hero Content</h2>
            <p>Page hero paragraph</p>
          </section>
        </body>
      </html>
    `;

    const result = await htmlProcessor.mergeIntoLayout(layoutHtml, pageHtml);

    // Parse result to check structure
    const doc = htmlProcessor.parseHTML(result);
    const heroSection = htmlProcessor.querySelector(doc, '.unify-hero');
    const heroTitle = htmlProcessor.querySelector(heroSection, 'h2');

    expect(heroSection).toBeTruthy();
    expect(heroTitle).toBeTruthy();

    // ID Stability: Layout ID should be preserved for inner elements
    expect(htmlProcessor.getAttribute(heroTitle, 'id')).toBe('hero-title');
    
    // Content should come from page
    expect(htmlProcessor.getTextContent(heroTitle)).toBe('Page Hero Content');

    // Outer element attributes should merge correctly (page wins except ID)
    expect(htmlProcessor.getAttribute(heroSection, 'id')).toBe('hero-section'); // Layout ID preserved
    expect(htmlProcessor.getAttribute(heroSection, 'data-theme')).toBe('light'); // Page wins
    expect(htmlProcessor.getAttribute(heroSection, 'data-custom')).toBe('page-value'); // Page added
  });

  /**
   * Test for multiple elements with same area class - attribute merging order
   */
  test('should_merge_multiple_page_elements_with_correct_attribute_precedence', async () => {
    // Layout with single area element
    const layoutHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Layout</title></head>
        <body>
          <section class="unify-hero" id="hero-section" data-theme="dark" data-priority="0">
            <h2 id="hero-title">Default Hero</h2>
          </section>
        </body>
      </html>
    `;

    // Page with multiple elements targeting same area (like area-merging-complex fixture)
    const pageHtml = `
      <!DOCTYPE html>
      <html data-unify="_includes/layout.html">
        <head><title>Page Title</title></head>
        <body>
          <section class="unify-hero" data-theme="light" data-priority="1" data-custom="first">
            <h2>First Element</h2>
          </section>
          <div class="unify-hero" data-priority="2" data-custom="second">
            <h3>Second Element</h3>
          </div>
          <article class="unify-hero" data-custom="third">
            <blockquote>Third Element</blockquote>
          </article>
        </body>
      </html>
    `;

    const result = await htmlProcessor.mergeIntoLayout(layoutHtml, pageHtml);

    // Parse result to check structure
    const doc = htmlProcessor.parseHTML(result);
    const heroSection = htmlProcessor.querySelector(doc, '.unify-hero');

    expect(heroSection).toBeTruthy();

    // Should use last element's attribute values for conflicts (last-wins precedence)
    expect(htmlProcessor.getAttribute(heroSection, 'data-priority')).toBe('2'); // From second element (last with priority)
    expect(htmlProcessor.getAttribute(heroSection, 'data-custom')).toBe('third'); // From third element (last)
    expect(htmlProcessor.getAttribute(heroSection, 'data-theme')).toBe('light'); // From first element (only one with theme)

    // All content should be concatenated
    const content = heroSection.innerHTML;
    expect(content).toContain('First Element');
    expect(content).toContain('Second Element'); 
    expect(content).toContain('Third Element');
  });

  /**
   * Test that content merging preserves layout structure when page has no matching elements
   */
  test('should_preserve_layout_inner_elements_when_page_has_no_matching_content', async () => {
    const layoutHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Layout</title></head>
        <body>
          <section class="unify-hero" id="hero-section">
            <h2 id="hero-title">Default Hero</h2>
            <p id="hero-subtitle">Default subtitle</p>
          </section>
        </body>
      </html>
    `;

    // Page without matching area content
    const pageHtml = `
      <!DOCTYPE html>
      <html data-unify="_includes/layout.html">
        <head><title>Page Title</title></head>
        <body>
          <div class="other-content">
            <p>Other page content</p>
          </div>
        </body>
      </html>
    `;

    const result = await htmlProcessor.mergeIntoLayout(layoutHtml, pageHtml);
    
    // Parse result to check structure
    const doc = htmlProcessor.parseHTML(result);
    const heroSection = htmlProcessor.querySelector(doc, '.unify-hero');
    const heroTitle = htmlProcessor.querySelector(heroSection, '#hero-title');
    const heroSubtitle = htmlProcessor.querySelector(heroSection, '#hero-subtitle');

    expect(heroSection).toBeTruthy();
    expect(heroTitle).toBeTruthy();
    expect(heroSubtitle).toBeTruthy();

    // Layout content should be preserved when no page content matches
    expect(htmlProcessor.getTextContent(heroTitle)).toBe('Default Hero');
    expect(htmlProcessor.getTextContent(heroSubtitle)).toBe('Default subtitle');
  });
});