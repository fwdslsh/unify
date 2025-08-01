/**
 * Markdown Processing System for Unify
 * Handles conversion of Markdown files to HTML with frontmatter support
 */

import MarkdownIt from 'markdown-it';
import matter from 'gray-matter';
import { logger } from '../utils/logger.js';

/**
 * Configure markdown-it instance with plugins and options
 */
const md = new MarkdownIt({
  html: true,          // Enable HTML tags in source
  xhtmlOut: false,     // Use '>' for single tags (<br>)
  breaks: false,       // Convert '\n' in paragraphs into <br>
  langPrefix: 'language-',  // CSS language prefix for fenced blocks
  linkify: true,       // Autoconvert URL-like text to links
  typographer: true,   // Enable some language-neutral replacement + quotes beautification
});

/**
 * Process markdown content and return HTML with metadata
 * @param {string} markdownContent - Raw markdown content
 * @param {string} filePath - Path to the markdown file
 * @returns {Object} Processed content with metadata
 * @returns {string} returns.html - Generated HTML content
 * @returns {Object} returns.frontmatter - Frontmatter data
 * @returns {string} returns.title - Document title (from frontmatter or first heading)
 * @returns {string} returns.excerpt - Document excerpt (from frontmatter or first paragraph)
 */
export function processMarkdown(markdownContent, filePath) {
  try {
    // Parse frontmatter
    const { data: frontmatter, content } = matter(markdownContent);
    
    // Convert markdown to HTML
    const html = md.render(content);
    
    // Extract title if not in frontmatter
    let title = frontmatter.title;
    if (!title) {
      // Try to extract from first heading
      const headingMatch = content.match(/^#\s+(.+)$/m);
      if (headingMatch) {
        title = headingMatch[1].trim();
      }
    }
    
    // Extract excerpt if not in frontmatter
    let excerpt = frontmatter.excerpt || frontmatter.description;
    if (!excerpt) {
      // Extract first paragraph
      const paragraphMatch = content.match(/^(?!#)(.+?)(?:\n\n|\n$|$)/m);
      if (paragraphMatch) {
        excerpt = paragraphMatch[1].trim().replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Remove markdown links
      }
    }
    
    logger.debug(`Processed markdown: ${filePath}, title: ${title || 'untitled'}`);
    
    return {
      html,
      frontmatter,
      title: title || '',
      excerpt: excerpt || ''
    };
    
  } catch (error) {
    logger.error(error.formatForCLI ? error.formatForCLI() : `Error processing markdown file ${filePath}: ${error.message}`);
    throw error;
  }
}

/**
 * Check if a file is a markdown file
 * @param {string} filePath - File path to check
 * @returns {boolean} True if file is markdown
 */
export function isMarkdownFile(filePath) {
  return /\.md$/i.test(filePath);
}

/**
 * Check if content contains an HTML element
 * @param {string} content - Content to check
 * @returns {boolean} True if content contains an <html> element
 */
export function hasHtmlElement(content) {
  return /<html[^>]*>/i.test(content);
}

/**
 * Wrap markdown HTML in a layout template
 * @param {string} html - Generated HTML content
 * @param {Object} metadata - Frontmatter and extracted metadata
 * @param {string} layout - Layout template (HTML with placeholders)
 * @returns {string} Complete HTML page
 */
export function wrapInLayout(html, metadata, layout) {
  if (!layout) {
    // Default layout if none provided
    layout = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  {{#if description}}<meta name="description" content="{{ description }}">{{/if}}
</head>
<body>
  <main>
    {{ content }}
  </main>
</body>
</html>`;
  }
  
  // Simple template replacement
  let result = layout;
  
  // Replace content placeholder
  result = result.replace(/\{\{\s*content\s*\}\}/g, html);
  
  // Replace title
  result = result.replace(/\{\{\s*title\s*\}\}/g, metadata.title || 'Untitled');
  
  // Replace frontmatter variables
  const allData = { ...metadata.frontmatter, ...metadata };
  for (const [key, value] of Object.entries(allData)) {
    if (typeof value === 'string') {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(regex, value);
    }
  }
  
  // Clean up unused placeholders
  result = result.replace(/\{\{[^}]*\}\}/g, '');
  
  // Re-process anchor links after template variable replacement
  result = addAnchorLinks(result);
  
  return result;
}

/**
 * Generate table of contents from HTML content
 * @param {string} html - HTML content
 * @returns {string} Table of contents HTML
 */
export function generateTableOfContents(html) {
  const headings = [];
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
  let match;
  
  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const text = match[2].replace(/<[^>]*>/g, ''); // Strip HTML tags
    const id = text.toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-')     // Replace spaces with hyphens
      .trim();
    
    headings.push({ level, text, id });
  }
  
  if (headings.length === 0) {
    return '';
  }
  
  // Generate nested HTML structure
  let toc = '<nav class="table-of-contents">\n<ol>\n';
  let currentLevel = 0;
  
  for (const heading of headings) {
    if (heading.level > currentLevel) {
      // Open new level(s)
      while (currentLevel < heading.level) {
        if (currentLevel > 0) {
          toc += '<ol>\n';
        }
        currentLevel++;
      }
    } else if (heading.level < currentLevel) {
      // Close level(s)
      while (currentLevel > heading.level) {
        toc += '</ol>\n</li>\n';
        currentLevel--;
      }
      toc += '</li>\n';
    } else if (currentLevel > 0) {
      // Same level, close previous item
      toc += '</li>\n';
    }
    
    toc += `<li><a href="#${heading.id}">${heading.text}</a>`;
  }
  
  // Close remaining levels
  while (currentLevel > 0) {
    toc += '</li>\n';
    if (currentLevel > 1) {
      toc += '</ol>\n';
    }
    currentLevel--;
  }
  
  toc += '</ol>\n</nav>';
  
  return toc;
}

/**
 * Add anchor links to headings in HTML
 * @param {string} html - HTML content
 * @returns {string} HTML with anchor links added to headings
 */
export function addAnchorLinks(html) {
  return html.replace(/<h([1-6])([^>]*)>(.*?)<\/h[1-6]>/gi, (match, level, attrs, text) => {
    const cleanText = text.replace(/<[^>]*>/g, ''); // Strip HTML tags
    const id = cleanText.toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-')     // Replace spaces with hyphens
      .trim();
    
    // Add id attribute if not already present
    const hasId = /\bid\s*=/i.test(attrs);
    const idAttr = hasId ? '' : ` id="${id}"`;
    
    return `<h${level}${attrs}${idAttr}>${text}</h${level}>`;
  });
}

/**
 * Configure markdown-it with additional plugins
 * @param {Array} plugins - Array of markdown-it plugins to use
 */
export function configureMarkdown(plugins = []) {
  for (const plugin of plugins) {
    md.use(plugin);
  }
}

/**
 * Get current markdown-it instance (for advanced customization)
 * @returns {MarkdownIt} The markdown-it instance
 */
export function getMarkdownInstance() {
  return md;
}