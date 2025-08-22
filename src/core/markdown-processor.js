/**
 * @returns {string} Complete HTML page
 */
export function wrapInLayout(html, metadata, layout) {
  logger.debug('[wrapInLayout] html:', html);
  logger.debug('[wrapInLayout] metadata:', metadata);
  // If content already has <html>, do not apply layout
  if (hasHtmlElement(html)) {
    return addAnchorLinks(html);
  }
  // Add anchor links to headings in content before layout injection
  const htmlWithAnchors = addAnchorLinks(html);
  // Use provided layout or default
  if (typeof layout === 'undefined' || layout === null) {
    layout = `<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>{{ title }}</title>\n{{ headHtml }}\n</head>\n<body>\n<main>\n<slot></slot>\n</main>\n</body>\n</html>`;
  }
  let result = layout;
  // Replace <slot> with content
  if (/<slot\s*><\/slot>/i.test(result)) {
    logger.debug('[wrapInLayout] replacing <slot> with:', htmlWithAnchors);
    result = result.replace(/<slot\s*><\/slot>/i, htmlWithAnchors);
  } else if (/\{\{\s*content\s*\}\}/i.test(result)) {
    // Replace {{ content }} placeholder
    result = result.replace(/\{\{\s*content\s*\}\}/gi, htmlWithAnchors);
  } else {
    result = result.replace(/(<main[^>]*>)/i, `$1${htmlWithAnchors}`);
  }
  // Replace {{ title }} and other placeholders
  result = result.replace(/\{\{\s*title\s*\}\}/g, metadata.title || 'Untitled');
  const allData = metadata.frontmatter ? { ...metadata.frontmatter, ...metadata } : { ...metadata };
  for (const [key, value] of Object.entries(allData)) {
    if (typeof value === 'string') {
      const regex = new RegExp(`\{\{\s*${key}\s*\}\}`, 'g');
      result = result.replace(regex, value);
    }
  }
  // Remove any remaining {{ ... }} placeholders
  result = result.replace(/\{\{[^}]*\}\}/g, '');
  // Add anchor links to headings
  result = addAnchorLinks(result);
  logger.debug('[wrapInLayout] final result:', result);
  return result;
}
import fsSync from 'fs';
import path from 'path';
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
 * Synthesize head elements from frontmatter
 * @param {Object} frontmatter - Frontmatter data
 * @returns {string} - HTML head elements
 */
export function synthesizeHeadFromFrontmatter(frontmatter) {
  if (frontmatter.head) {
    logger.debug('[synthesizeHeadFromFrontmatter] frontmatter.head:', JSON.stringify(frontmatter.head));
  }
  const headElements = [];
  // JSON-LD minification support
  if (frontmatter.schema) {
    try {
      const jsonLd = JSON.stringify(frontmatter.schema);
      headElements.push(`<script type="application/ld+json">${jsonLd}</script>`);
    } catch (e) {
      logger.warn('Invalid JSON-LD schema in frontmatter');
    }
  }
  
  // Handle basic meta tags
  if (frontmatter.title) {
    headElements.push(`<title>${frontmatter.title}</title>`);
  }
  
  if (frontmatter.description) {
    headElements.push(`<meta name="description" content="${frontmatter.description}">`);
  }
  
  if (frontmatter.author) {
    headElements.push(`<meta name="author" content="${frontmatter.author}">`);
  }
  
  // Handle Open Graph tags from basic properties
  if (frontmatter.title) {
    headElements.push(`<meta property="og:title" content="${frontmatter.title}">`);
  }
  
  if (frontmatter.description) {
    headElements.push(`<meta property="og:description" content="${frontmatter.description}">`);
  }
  
  // Handle custom head elements from head array
  if (frontmatter.head && Array.isArray(frontmatter.head)) {
    for (const headItem of frontmatter.head) {
      logger.debug('[synthesizeHeadFromFrontmatter] headItem:', typeof headItem, headItem);
      if (typeof headItem === 'object' && headItem !== null) {
        // Normalize tag name by removing quotes and converting to lowercase
        const tagName = (headItem.tag || '').toString().replace(/['"]/g, '').toLowerCase().trim();
        
        // If tag is script and content exists, output as <script ...>...</script>
        if (tagName === 'script' && headItem.content !== undefined && headItem.content !== null) {
          const attributes = Object.entries(headItem)
            .filter(([key]) => key !== 'content' && key !== 'tag')
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
          let minified = headItem.content;
          try {
            minified = JSON.stringify(JSON.parse(headItem.content));
          } catch (e) {
            minified = headItem.content;
          }
          headElements.push(`<script ${attributes}>${minified}</script>`);
        } else if (tagName && tagName !== 'script') {
          // Handle other HTML tags (not script or meta)
          const attributes = Object.entries(headItem)
            .filter(([key]) => key !== 'content' && key !== 'tag')
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
          const content = headItem.content || '';
          headElements.push(`<${tagName} ${attributes}>${content}</${tagName}>`);
        } else {
          // Otherwise, output as <meta ...>
          const attributes = [];
          for (const [key, value] of Object.entries(headItem)) {
            // Exclude 'tag' and 'content' properties from meta attributes  
            if (key !== 'tag' && key !== 'content' && value !== undefined && value !== null) {
              attributes.push(`${key}="${value}"`);
            }
          }
          if (attributes.length > 0) {
            headElements.push(`<meta ${attributes.join(' ')}>`);
          }
        }
      }
    }
  }
  
  return headElements.join('\n');
}

/**
 * Process markdown content and return HTML with metadata
 * @param {string} markdownContent - Raw markdown content
 * @param {string} filePath - Path to the markdown file
 * @returns {Object} Processed content with metadata
 * @returns {string} returns.html - Generated HTML content
 * @returns {Object} returns.frontmatter - Frontmatter data
 * @returns {string} returns.title - Document title (from frontmatter or first heading)
 * @returns {string} returns.excerpt - Document excerpt (from frontmatter or first paragraph)
 * @returns {string} returns.headHtml - Synthesized head HTML from frontmatter
 */
export async function processMarkdown(markdownContent, filePath) {
  // Validate frontmatter schema
  function validateFrontmatter(frontmatter, filePath) {
    if (filePath.endsWith('.html') && frontmatter && Object.keys(frontmatter).length > 0) {
      throw new Error(`Frontmatter is not allowed in HTML file: ${filePath}`);
    }
    if (frontmatter.layout) {
      const layoutPath = path.resolve(path.dirname(filePath), frontmatter.layout);
      if (!fsSync.existsSync(layoutPath)) {
        throw new Error(`Layout not found: ${frontmatter.layout} in ${filePath}`);
      }
    }
    // Add more schema checks as needed
  }
  try {
    // Parse frontmatter
    const { data: frontmatter, content: rawContent } = matter(markdownContent);
    validateFrontmatter(frontmatter, filePath);
    // Error if <head> tag is present in markdown body
    if (/<head>/i.test(rawContent)) {
      throw new Error('Markdown body must not contain <head> tag');
    }
    // Recursively process markdown includes before conversion
    let content = rawContent;
    // Simple SSI-style include: <!--#include virtual="..." -->
    const includeRegex = /<!--#include\s+virtual="([^"]+)"\s*-->/g;
    let includeMatch;
    while ((includeMatch = includeRegex.exec(content)) !== null) {
      const includePath = includeMatch[1];
      // Resolve include path relative to filePath
      const resolvedIncludePath = path.resolve(path.dirname(filePath), includePath.replace(/^\//, ''));
      if (fsSync.existsSync(resolvedIncludePath)) {
        const includeContent = fsSync.readFileSync(resolvedIncludePath, 'utf-8');
        // Recursively process included markdown
        const included = await processMarkdown(includeContent, resolvedIncludePath);
        // Replace include directive with rendered HTML
        content = content.replace(includeMatch[0], included.html);
      }
    }
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

    // Synthesize head elements from frontmatter
    const headHtml = synthesizeHeadFromFrontmatter(frontmatter);

    // Enhanced layout discovery for markdown
    let layoutHtml = null;
    if (frontmatter.layout) {
      const layoutPath = path.resolve(path.dirname(filePath), frontmatter.layout);
      if (fsSync.existsSync(layoutPath)) {
        layoutHtml = fsSync.readFileSync(layoutPath, 'utf-8');
      }
    }

    // Compose metadata for layout
    const metadata = {
      ...frontmatter,
      title,
      excerpt,
      headHtml,
      layoutHtml,
    };
  // Wrap content in layout

    // Always wrap markdown content in <article> if not already present
    let htmlToInject = html;
    if (!/^<article[\s>]/i.test(html.trim())) {
      htmlToInject = `<article>\n${html}\n</article>`;
    }

    // Use layout if available, else default
    let layout = layoutHtml;
    if (!layout) {
      layout = `<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>{{ title }}</title>\n{{ headHtml }}\n</head>\n<body>\n<main>\n<slot></slot>\n</main>\n</body>\n</html>`;
    } else {
      // Inject synthesized headHtml only if not already present
      if (/<head>[\s\S]*{{ headHtml }}[\s\S]*<\/head>/i.test(layout)) {
        // Already present, do nothing
      } else if (/<head>/i.test(layout)) {
        layout = layout.replace(/<head>([\s\S]*?)<\/head>/i, (m, inner) => `<head>${headHtml}\n${inner}</head>`);
      } else {
        layout = layout.replace(/<html[^>]*>/i, match => `${match}\n<head>${headHtml}</head>`);
      }
    }

    // Wrap content in layout
    let result = layout;
    // Replace <slot> with content
    if (/<slot\s*><\/slot>/i.test(result)) {
      result = result.replace(/<slot\s*><\/slot>/i, htmlToInject);
    } else if (/\{\{\s*content\s*\}\}/i.test(result)) {
      result = result.replace(/\{\{\s*content\s*\}\}/gi, htmlToInject);
    } else {
      result = result.replace(/(<main[^>]*>)/i, `$1${htmlToInject}`);
    }
    // Replace {{ title }} and other placeholders
    result = result.replace(/\{\{\s*title\s*\}\}/g, title || 'Untitled');
    const allData = frontmatter ? { ...frontmatter, ...metadata } : { ...metadata };
    for (const [key, value] of Object.entries(allData)) {
      if (typeof value === 'string') {
        const regex = new RegExp(`\{\{\s*${key}\s*\}\}`, 'g');
        result = result.replace(regex, value);
      }
    }
    // Remove any remaining {{ ... }} placeholders
    result = result.replace(/\{\{[^}]*\}\}/g, '');
    // Add anchor links to headings
    result = addAnchorLinks(result);
    logger.debug(`[processMarkdown] final result for ${filePath}:`, result);
    return {
      html: result,
      frontmatter,
      title,
      excerpt,
      headHtml,
      layoutHtml
    };
  } catch (error) {
    logger.error(error.formatForCLI ? error.formatForCLI() : `Error processing markdown file ${filePath}: ${error.message}`);
    throw error;
  }
}
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
    // Remove HTML tags from heading text for ID
    const cleanText = text.replace(/<[^>]*>/g, '');
    // Match test expectations: lowercase, spaces to hyphens, remove non-word chars
    const id = cleanText.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    // Add id attribute if not already present
    const hasId = /\bid\s*=/.test(attrs);
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

/**
 * Check if a file is a Markdown file based on its extension
 * @param {string} filePath - Path to check
 * @returns {boolean} True if the file has a .md extension
 */
export function isMarkdownFile(filePath) {
  return filePath.toLowerCase().endsWith('.md');
}

/**
 * Check if HTML content contains an <html> element
 * @param {string} html - HTML content to check
 * @returns {boolean} True if the content contains an <html> element
 */
export function hasHtmlElement(html) {
  if (!html || typeof html !== 'string') {
    return false;
  }
  return /<html[^>]*>/i.test(html);
}