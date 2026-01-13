/**
 * Markdown Test Helpers
 * Shared utilities for markdown processing tests
 */

import { TempProject } from './temp-project.js';

export class MarkdownTestHelpers {
  /**
   * Create a basic layout file for testing
   * @param {TempProject} project - Temp project instance
   * @param {string} layoutName - Layout filename
   * @param {Object} options - Layout options
   */
  static async createBasicLayout(project, layoutName = '_layout.html', options = {}) {
    const {
      title = 'Layout Title',
      additionalHead = '',
      bodyClass = '',
      areas = ['unify-content']
    } = options;

    const areaElements = areas.map(area => 
      `<div class="${area}">Default ${area}</div>`
    ).join('\n          ');

    const layoutContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${title}</title>
          ${additionalHead}
        </head>
        <body${bodyClass ? ` class="${bodyClass}"` : ''}>
          ${areaElements}
        </body>
        </html>
    `.trim();

    await project.writeFile(layoutName, layoutContent);
  }

  /**
   * Create a markdown file with frontmatter
   * @param {TempProject} project - Temp project instance
   * @param {string} filename - Markdown filename
   * @param {Object} frontmatter - Frontmatter object
   * @param {string} content - Markdown content
   */
  static async createMarkdownFile(project, filename, frontmatter = {}, content = '# Default Content') {
    const frontmatterStr = Object.keys(frontmatter).length > 0
      ? '---\n' + Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`).join('\n') + '\n---\n\n'
      : '';

    const markdownContent = frontmatterStr + content;
    await project.writeFile(filename, markdownContent);
  }

  /**
   * Create a component file for testing
   * @param {TempProject} project - Temp project instance
   * @param {string} componentPath - Component file path
   * @param {string} content - Component HTML content
   */
  static async createComponent(project, componentPath, content) {
    await project.writeFile(componentPath, content);
  }

  /**
   * Assert HTML contains DOM Cascade composition results
   * @param {string} html - HTML content to check
   * @param {Object} expectations - Expected content
   */
  static assertDOMCascadeComposition(html, expectations) {
    const {
      hasLayoutStructure = false,
      pageContentIncluded = false,
      areasReplaced = [],
      headMerged = false,
      componentsImported = false
    } = expectations;

    if (hasLayoutStructure && expectations.layoutIndicator) {
      expect(html).toContain(expectations.layoutIndicator);
    }

    if (pageContentIncluded && expectations.pageContentIndicator) {
      expect(html).toContain(expectations.pageContentIndicator);
    }

    if (areasReplaced.length > 0) {
      areasReplaced.forEach(area => {
        expect(html).not.toContain(`class="${area}"`);
      });
    }

    if (headMerged && expectations.mergedHeadElements) {
      expectations.mergedHeadElements.forEach(element => {
        expect(html).toContain(element);
      });
    }

    if (componentsImported && expectations.componentIndicators) {
      expectations.componentIndicators.forEach(indicator => {
        expect(html).toContain(indicator);
      });
    }
  }

  /**
   * Generate performance test markdown content
   * @param {number} sections - Number of sections to generate
   * @returns {string} Large markdown content
   */
  static generateLargeMarkdownContent(sections = 100) {
    const sectionContent = `
## Section Header

This is a section with **bold text**, *italic text*, and [links](http://example.com).

\`\`\`javascript
function example() {
  return "This is code";
}
\`\`\`

Lists:
- Item 1
- Item 2
- Item 3

> This is a blockquote with important information.

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |
    `.trim();

    return Array(sections).fill(sectionContent).join('\n\n');
  }

  /**
   * Create a complex site structure for testing
   * @param {TempProject} project - Temp project instance
   */
  static async createComplexSiteStructure(project) {
    // Base layout
    await this.createBasicLayout(project, '_layouts/base.html', {
      title: 'Base Layout',
      areas: ['unify-content'],
      additionalHead: '<meta name="base-layout" content="true">'
    });

    // Page layout
    await project.writeFile('_layouts/page.html', `
      <div data-unify="_layouts/base.html">
        <div class="unify-content">
          <header class="page-header">Page Layout Header</header>
          <div class="unify-main">Page Content Area</div>
          <footer class="page-footer">Page Layout Footer</footer>
        </div>
      </div>
    `);

    // Components
    await this.createComponent(project, '_includes/button.html', `
      <button class="btn btn-primary">Click Me</button>
    `);

    await this.createComponent(project, '_includes/card.html', `
      <div class="card">
        <div class="card-body">
          <p>Card content</p>
          <div data-unify="_includes/button.html"></div>
        </div>
      </div>
    `);

    // Sample pages
    await this.createMarkdownFile(project, 'index.md', {
      'layout': '_layouts/page.html',
      'title': 'Home Page'
    }, `
# Welcome

<div class="unify-main">
  <h2>Home Content</h2>
  <div data-unify="_includes/card.html"></div>
</div>
    `);

    await this.createMarkdownFile(project, 'about.md', {
      'layout': '_layouts/base.html',
      'title': 'About Us',
      'description': 'About our company'
    }, `
# About Us

This is the about page content.
    `);

    await this.createMarkdownFile(project, 'blog/post.md', {
      'layout': '_layouts/page.html',
      'title': 'Blog Post',
      'author': 'John Doe'
    }, `
# Blog Post Title

<div class="unify-main">
  <p>This is a blog post with custom content placement.</p>
</div>
    `);
  }
}