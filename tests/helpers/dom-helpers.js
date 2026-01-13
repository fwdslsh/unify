/**
 * DOM Test Helpers for DOM Cascade Testing
 * Provides utilities for creating and manipulating DOM elements in tests
 */

import { parseHTML } from 'linkedom';

export class DOMHelpers {
  /**
   * Create a DOM document from HTML string
   * @param {string} html - HTML content
   * @returns {Document} DOM document
   */
  static createDocument(html) {
    const { document } = parseHTML(html);
    return document;
  }

  /**
   * Create a simple layout document with unify areas
   * @param {Object} areas - Areas configuration
   * @returns {Document} Layout document
   */
  static createLayoutDocument(areas = {}) {
    const defaultAreas = {
      'unify-header': '<div class="unify-header"></div>',
      'unify-content': '<div class="unify-content"></div>',
      'unify-footer': '<div class="unify-footer"></div>'
    };

    const areasConfig = { ...defaultAreas, ...areas };
    const areasHtml = Object.entries(areasConfig)
      .map(([className, html]) => 
        html.includes('class=') ? html : html.replace('>', ` class="${className}">`)
      )
      .join('\n');

    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Layout</title></head>
        <body>
          ${areasHtml}
        </body>
      </html>
    `;

    return this.createDocument(html);
  }

  /**
   * Create a page document with content for unify areas
   * @param {Object} content - Content for areas
   * @returns {Document} Page document
   */
  static createPageDocument(content = {}) {
    const defaultContent = {
      'unify-header': '<h1>Page Title</h1>',
      'unify-content': '<p>Page content goes here.</p>',
      'unify-footer': '<p>&copy; 2025</p>'
    };

    const contentConfig = { ...defaultContent, ...content };
    const contentHtml = Object.entries(contentConfig)
      .map(([className, html]) => `<div class="${className}">${html}</div>`)
      .join('\n');

    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Page</title></head>
        <body>
          ${contentHtml}
        </body>
      </html>
    `;

    return this.createDocument(html);
  }

  /**
   * Assert that two HTML strings are equivalent
   * @param {string} actual - Actual HTML
   * @param {string} expected - Expected HTML
   */
  static assertHTMLEqual(actual, expected) {
    // Normalize whitespace and formatting
    const normalize = (html) => html
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();

    const normalizedActual = normalize(actual);
    const normalizedExpected = normalize(expected);

    if (normalizedActual !== normalizedExpected) {
      throw new Error(`HTML mismatch:\nActual: ${normalizedActual}\nExpected: ${normalizedExpected}`);
    }
  }

  /**
   * Get elements with unify classes from document
   * @param {Document} doc - Document to search
   * @returns {Element[]} Elements with unify- classes
   */
  static getUnifyElements(doc) {
    return Array.from(doc.querySelectorAll('[class*="unify-"]'));
  }

  /**
   * Create mock document for testing
   * @param {Object} options - Mock options
   * @returns {Object} Mock document
   */
  static createMockDocument(options = {}) {
    const elements = options.elements || [];
    
    return {
      querySelectorAll: (selector) => {
        if (selector === '[class*="unify-"]') {
          return elements.filter(el => 
            el.className && el.className.includes('unify-')
          );
        }
        return [];
      },
      getUnifyElements: () => elements.filter(el => 
        el.className && el.className.includes('unify-')
      )
    };
  }

  /**
   * Create mock element for testing
   * @param {Object} options - Element options
   * @returns {Object} Mock element
   */
  static createMockElement(options = {}) {
    const className = options.className || '';
    const innerHTML = options.innerHTML || '';
    const textContent = options.textContent || innerHTML.replace(/<[^>]*>/g, '');
    
    return {
      className,
      innerHTML,
      textContent,
      classList: {
        contains: (cls) => className.split(' ').includes(cls)
      },
      getAttribute: (attr) => {
        if (attr === 'class') return className;
        return null;
      }
    };
  }

  /**
   * Create DOM fixtures for testing
   * @param {string} name - Fixture name
   * @returns {Object} DOM fixture data
   */
  static createFixture(name) {
    const fixtures = {
      'simple-composition': {
        layout: this.createLayoutDocument(),
        page: this.createPageDocument()
      },
      
      'area-matching': {
        layout: this.createLayoutDocument({
          'unify-hero': '<section class="unify-hero hero-section"></section>',
          'unify-sidebar': '<aside class="unify-sidebar sidebar"></aside>',
          'unify-content': '<main class="unify-content main-content"></main>'
        }),
        page: this.createPageDocument({
          'unify-hero': '<div class="banner">Welcome to our site!</div>',
          'unify-sidebar': '<nav><ul><li>Home</li><li>About</li></ul></nav>',
          'unify-content': '<article>Main article content here.</article>'
        })
      },

      'nested-layouts': {
        layout: this.createDocument(`
          <!DOCTYPE html>
          <html data-unify="/layouts/base.html">
            <head><title>Nested Layout</title></head>
            <body>
              <div class="unify-wrapper">
                <div class="unify-content"></div>
              </div>
            </body>
          </html>
        `),
        page: this.createDocument(`
          <!DOCTYPE html>
          <html>
            <head><title>Nested Page</title></head>
            <body>
              <div class="unify-content">
                <h1>Nested content</h1>
                <p>Content inside nested structure.</p>
              </div>
            </body>
          </html>
        `)
      },

      'error-conditions': {
        layout: this.createDocument(`
          <!DOCTYPE html>
          <html>
            <head><title>Layout</title></head>
            <body>
              <div class="unify-invalid-area"></div>
            </body>
          </html>
        `),
        page: this.createDocument(`
          <!DOCTYPE html>
          <html>
            <head><title>Page</title></head>
            <body>
              <div class="unify-missing-match">No matching area</div>
            </body>
          </html>
        `)
      }
    };

    return fixtures[name] || fixtures['simple-composition'];
  }
}

/**
 * DOM Cascade test fixtures for common test scenarios
 */
export class DOMCascadeFixtures {
  static getSimpleComposition() {
    return DOMHelpers.createFixture('simple-composition');
  }

  static getAreaMatching() {
    return DOMHelpers.createFixture('area-matching');
  }

  static getNestedLayouts() {
    return DOMHelpers.createFixture('nested-layouts');
  }

  static getErrorConditions() {
    return DOMHelpers.createFixture('error-conditions');
  }
}