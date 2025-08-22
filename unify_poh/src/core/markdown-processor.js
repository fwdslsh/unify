/**
 * Markdown Processing System for Unify
 * Handles conversion of Markdown files to HTML with frontmatter support
 * 
 * US-008 Implementation: Markdown Processing with Frontmatter
 * 
 * Features:
 * - YAML frontmatter extraction and processing
 * - Markdown to HTML conversion with markdown-it
 * - Head element synthesis from frontmatter
 * - Layout application and DOM cascade integration
 * - Security validation and path traversal prevention
 * - Virtual includes processing with circular dependency detection
 * - Pretty URL generation
 * - Anchor link generation for headings
 */

import MarkdownIt from 'markdown-it';
import matter from 'gray-matter';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, basename, extname, join } from 'path';
import { ValidationError } from './errors.js';
import { PathValidator } from './path-validator.js';

// Initialize path validator for security
const pathValidator = new PathValidator();

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
 * Check if a file is a Markdown file based on its extension
 * @param {string} filePath - Path to check
 * @returns {boolean} True if the file has a .md extension
 */
export function isMarkdownFile(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }
  return filePath.toLowerCase().endsWith('.md');
}

/**
 * Synthesize head elements from frontmatter
 * @param {Object} frontmatter - Frontmatter data
 * @returns {string} - HTML head elements
 */
export function synthesizeHeadFromFrontmatter(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'object') {
    return '';
  }

  const headElements = [];

  // Generate basic meta tags
  addBasicMetaTags(frontmatter, headElements);
  
  // Generate Open Graph tags
  addOpenGraphTags(frontmatter, headElements);
  
  // Generate JSON-LD structured data
  addJsonLdScript(frontmatter, headElements);
  
  // Generate custom head elements
  addCustomHeadElements(frontmatter, headElements);

  return headElements.join('\n');
}

/**
 * Add basic meta tags to head elements
 * @private
 * @param {Object} frontmatter - Frontmatter data
 * @param {Array} headElements - Array to append elements to
 */
function addBasicMetaTags(frontmatter, headElements) {
  if (frontmatter.title) {
    headElements.push(`<title>${escapeHtml(frontmatter.title)}</title>`);
  }

  if (frontmatter.description) {
    headElements.push(`<meta name="description" content="${escapeHtml(frontmatter.description)}">`);
  }

  if (frontmatter.author) {
    headElements.push(`<meta name="author" content="${escapeHtml(frontmatter.author)}">`);
  }
}

/**
 * Add Open Graph meta tags
 * @private
 * @param {Object} frontmatter - Frontmatter data
 * @param {Array} headElements - Array to append elements to
 */
function addOpenGraphTags(frontmatter, headElements) {
  if (frontmatter.title) {
    headElements.push(`<meta property="og:title" content="${escapeHtml(frontmatter.title)}">`);
  }

  if (frontmatter.description) {
    headElements.push(`<meta property="og:description" content="${escapeHtml(frontmatter.description)}">`);
  }
}

/**
 * Add JSON-LD structured data script
 * @private
 * @param {Object} frontmatter - Frontmatter data
 * @param {Array} headElements - Array to append elements to
 */
function addJsonLdScript(frontmatter, headElements) {
  if (frontmatter.schema) {
    try {
      const jsonLd = JSON.stringify(frontmatter.schema);
      headElements.push(`<script type="application/ld+json">${jsonLd}</script>`);
    } catch (error) {
      // Log warning for malformed JSON-LD but continue processing
      console.warn(`Warning: Invalid JSON-LD schema in frontmatter: ${error.message}`);
    }
  }
}

/**
 * Add custom head elements from frontmatter array
 * @private
 * @param {Object} frontmatter - Frontmatter data
 * @param {Array} headElements - Array to append elements to
 */
function addCustomHeadElements(frontmatter, headElements) {
  if (frontmatter.head && Array.isArray(frontmatter.head)) {
    for (const headItem of frontmatter.head) {
      if (typeof headItem === 'object' && headItem !== null) {
        const attributes = [];
        for (const [key, value] of Object.entries(headItem)) {
          if (value !== undefined && value !== null) {
            attributes.push(`${escapeHtml(key)}="${escapeHtml(String(value))}"`);
          }
        }
        if (attributes.length > 0) {
          headElements.push(`<meta ${attributes.join(' ')}>`);
        }
      }
    }
  }
}

/**
 * Generate pretty URL from file path
 * @param {string} filePath - Original file path
 * @returns {string} - Pretty URL path
 */
export function generatePrettyUrl(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }

  // Return non-markdown files unchanged
  if (!isMarkdownFile(filePath)) {
    return filePath;
  }

  // Handle edge case for empty extension
  if (filePath === '.md') {
    return '/index.html';
  }

  // Remove .md extension
  const withoutExt = filePath.slice(0, -3);
  const fileName = basename(withoutExt);
  const dir = dirname(withoutExt);

  // Handle index files specially
  if (fileName === 'index') {
    return withoutExt + '.html';
  }

  // Convert to pretty URL structure
  if (dir === '.') {
    return `${fileName}/index.html`;
  } else {
    return `${dir}/${fileName}/index.html`;
  }
}

/**
 * Add anchor links to headings in HTML
 * @param {string} html - HTML content
 * @returns {string} HTML with anchor links added to headings
 */
function addAnchorLinks(html) {
  return html.replace(/<h([1-6])([^>]*)>(.*?)<\/h[1-6]>/gi, (match, level, attrs, text) => {
    // Remove HTML tags from heading text for ID
    const cleanText = text.replace(/<[^>]*>/g, '');
    // Create ID: lowercase, spaces to hyphens, remove non-word chars
    const id = generateIdFromText(cleanText);
    
    // Check if id attribute already exists
    const hasId = /\bid\s*=/.test(attrs);
    const idAttr = hasId ? '' : ` id="${escapeHtml(id)}"`;
    
    return `<h${level}${attrs}${idAttr}>${text}</h${level}>`;
  });
}

/**
 * Generate a URL-safe ID from text content
 * @private
 * @param {string} text - Text to convert to ID
 * @returns {string} URL-safe ID
 */
function generateIdFromText(text) {
  return text.trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Escape HTML special characters
 * @private
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    return String(text);
  }
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Process virtual includes in markdown content
 * @param {string} content - Markdown content
 * @param {string} filePath - Path to the current file
 * @param {Set} processedPaths - Set of already processed paths (circular detection)
 * @param {Object} options - Processing options
 * @returns {string} - Content with includes processed
 */
function processIncludes(content, filePath, processedPaths, options) {
  const includeRegex = /<!--#include\s+virtual="([^"]+)"\s*-->/g;
  let result = content;
  let match;

  while ((match = includeRegex.exec(content)) !== null) {
    const includePath = match[1];
    
    // Resolve include path relative to current file
    const resolvedPath = resolve(dirname(filePath), includePath);
    
    // Check for circular dependencies
    if (processedPaths.has(resolvedPath)) {
      throw new ValidationError(`Circular dependency detected: ${resolvedPath}`);
    }

    // Check depth before processing
    if (processedPaths.size >= options.maxDepth) {
      throw new ValidationError(`Maximum include depth exceeded (${options.maxDepth})`);
    }

    // Check if include file exists
    if (existsSync(resolvedPath)) {
      try {
        const includeContent = readFileSync(resolvedPath, 'utf-8');
        
        // Create new processed paths set for recursive call
        const newProcessedPaths = new Set(processedPaths);
        newProcessedPaths.add(resolvedPath);
        
        // Recursively process the included file
        const processed = processMarkdownContent(includeContent, resolvedPath, newProcessedPaths, options);
        
        // Replace include directive with processed content
        result = result.replace(match[0], processed.html);
      } catch (error) {
        // Re-throw validation errors
        if (error instanceof ValidationError) {
          throw error;
        }
        // If processing fails, leave include directive as-is
        continue;
      }
    }
    // If file doesn't exist, leave include directive as-is
  }

  return result;
}

/**
 * Process markdown content (internal helper)
 * @param {string} markdownContent - Raw markdown content
 * @param {string} filePath - Path to the markdown file
 * @param {Set} processedPaths - Set of already processed paths
 * @param {Object} options - Processing options
 * @returns {Object} Processed content data
 */
function processMarkdownContent(markdownContent, filePath, processedPaths, options = {}) {
  const { maxDepth = 10 } = options;

  // Parse frontmatter
  const { data: frontmatter, content: rawContent } = matter(markdownContent);

  // Process includes
  const contentWithIncludes = processIncludes(rawContent, filePath, processedPaths, options);

  // Convert markdown to HTML
  const html = md.render(contentWithIncludes);

  // Add anchor links
  const htmlWithAnchors = addAnchorLinks(html);

  return {
    html: htmlWithAnchors,
    frontmatter,
  };
}

/**
 * Process markdown content and return HTML with metadata
 * @param {string} markdownContent - Raw markdown content
 * @param {string} filePath - Path to the markdown file
 * @param {Object} options - Processing options
 * @returns {Object} Processed content with metadata
 */
export async function processMarkdown(markdownContent, filePath, options = {}) {
  try {
    // Validate input
    if (!markdownContent || typeof markdownContent !== 'string') {
      throw new ValidationError('Invalid markdown content');
    }

    if (!filePath || typeof filePath !== 'string') {
      throw new ValidationError('Invalid file path');
    }

    // Security validation for HTML files with frontmatter
    if (filePath.endsWith('.html')) {
      const { data } = matter(markdownContent);
      if (data && Object.keys(data).length > 0) {
        throw new ValidationError('Frontmatter is not allowed in HTML files');
      }
    }

    // Parse frontmatter first to check for layout
    const { data: frontmatter, content: rawContent } = matter(markdownContent);

    // Check for <head> tag in markdown body
    if (/<head>/i.test(rawContent)) {
      throw new ValidationError('Markdown body must not contain <head> tag');
    }

    // Validate layout path if specified
    if (frontmatter.layout) {
      try {
        const layoutPath = pathValidator.validateAndResolve(frontmatter.layout, dirname(filePath));
        
        if (!existsSync(layoutPath)) {
          throw new ValidationError(`Layout not found: ${frontmatter.layout}`);
        }
      } catch (error) {
        if (error.name === 'PathTraversalError') {
          throw new ValidationError('Invalid layout path: path traversal detected');
        }
        throw error;
      }
    }

    // Process markdown content
    const processedPaths = new Set([resolve(filePath)]);
    const processed = processMarkdownContent(markdownContent, filePath, processedPaths, options);

    // Extract title if not in frontmatter
    let title = frontmatter.title;
    if (!title) {
      // Try to extract from first heading
      const headingMatch = processed.html.match(/<h1[^>]*>(.*?)<\/h1>/i);
      if (headingMatch) {
        title = headingMatch[1].replace(/<[^>]*>/g, '').trim();
      }
    }

    // Extract excerpt if not in frontmatter
    let excerpt = frontmatter.excerpt || frontmatter.description;
    if (!excerpt) {
      // Extract first paragraph from HTML
      const paragraphMatch = processed.html.match(/<p[^>]*>(.*?)<\/p>/i);
      if (paragraphMatch) {
        excerpt = paragraphMatch[1].replace(/<[^>]*>/g, '').trim();
      }
    }

    // Synthesize head elements from frontmatter
    const headHtml = synthesizeHeadFromFrontmatter(frontmatter);

    // Apply layout if specified, otherwise use default layout
    const finalHtml = frontmatter.layout 
      ? applyCustomLayout(frontmatter.layout, filePath, processed.html, title, headHtml)
      : applyDefaultLayout(processed.html, title, headHtml);

    return {
      html: finalHtml,
      frontmatter,
      title,
      excerpt,
      headHtml,
    };

  } catch (error) {
    // Re-throw ValidationError as-is, wrap others
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Error processing markdown: ${error.message}`);
  }
}

/**
 * Apply custom layout to processed content
 * @private
 * @param {string} layoutFile - Layout file path
 * @param {string} filePath - Current file path
 * @param {string} content - Processed HTML content
 * @param {string} title - Page title
 * @param {string} headHtml - Synthesized head HTML
 * @returns {string} Final HTML with layout applied
 */
function applyCustomLayout(layoutFile, filePath, content, title, headHtml) {
  try {
    const layoutPath = pathValidator.validateAndResolve(layoutFile, dirname(filePath));
    const layoutContent = readFileSync(layoutPath, 'utf-8');
    
    let finalHtml = layoutContent;
    
    // Apply content replacement strategies (DOM Cascade v1 compliant)
    if (layoutContent.includes('{{ content }}')) {
      // Template variable replacement (legacy support)
      finalHtml = finalHtml.replace(/\{\{\s*content\s*\}\}/gi, content);
    } else {
      // Modern approach: Wrap content in unify-content area for DOM Cascade composition
      // This ensures compatibility with DOM Cascade v1 area-based composition
      const wrappedContent = `<main class="unify-content">${content}</main>`;
      
      // Check if layout has unify-content area, otherwise fallback to body injection
      if (layoutContent.includes('unify-content')) {
        // Layout will handle area-based composition
        finalHtml = layoutContent; // Let DOM Cascade handle this
      } else {
        // Fallback: inject after body tag
        finalHtml = finalHtml.replace('<body>', `<body>${wrappedContent}`);
      }
    }
    
    // Replace title if specified
    if (title && finalHtml.includes('<title>')) {
      finalHtml = finalHtml.replace(/<title>.*?<\/title>/gi, `<title>${escapeHtml(title)}</title>`);
    }
    
    // Inject head HTML if not already present
    if (headHtml && !finalHtml.includes('{{ headHtml }}')) {
      finalHtml = finalHtml.replace(/<\/head>/i, `${headHtml}\n</head>`);
    }
    
    return finalHtml;
  } catch (error) {
    throw new ValidationError(`Error applying layout ${layoutFile}: ${error.message}`);
  }
}

/**
 * Apply default layout wrapper to content
 * @private
 * @param {string} content - Processed HTML content
 * @param {string} title - Page title
 * @param {string} headHtml - Synthesized head HTML
 * @returns {string} HTML with default layout applied
 */
function applyDefaultLayout(content, title, headHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title || 'Untitled')}</title>
${headHtml}
</head>
<body>
<main>
${content}
</main>
</body>
</html>`;
}