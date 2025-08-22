/**
 * Unified HTML processor using CascadingImportsProcessor
 * Replaces the old processLayoutAttribute approach
 */
export async function processHtmlUnified(
  pageContent,
  filePath,
  sourceRoot,
  dependencyTracker,
  config = {}
) {
  try {
    // Process cascading imports and slots using CascadingImportsProcessor
    const cascadingProcessor = new CascadingImportsProcessor(sourceRoot);
    let processed = await cascadingProcessor.processImports(pageContent, filePath);
    // Always run optimizeHtml to remove slot/template and strip attributes
    processed = await optimizeHtml(processed);
    return processed;
  } catch (error) {
    logger.warn(`CascadingImportsProcessor failed for ${path.relative(sourceRoot, filePath)}: ${error.message}`);
    return pageContent; // Fallback to original content
  }
}
// Removed jsdom import; using Bun HTMLRewriter instead
/**
 * Unified HTML Processor for unify
 * Handles both SSI-style includes (<!--#include -->) and DOM templating (data-import="some.html", <slot>)
 * using HTMLRewriter for high-performance processing.
 */

import fs from "fs/promises";
import path from "path";
// Include functionality removed - import removed
import { logger } from "../utils/logger.js";
import { 
  LayoutError
} from "../utils/errors.js";
import { processMarkdown, isMarkdownFile } from "./markdown-processor.js";
import { CascadingImportsProcessor } from "./cascading-imports-processor.js";

/**
 * Read an include file with sensible fallback locations.
 * Tries the resolvedPath first, then sourceRoot-relative and _includes/basename.
 */
export async function readIncludeWithFallback(resolvedPath, src, filePath, sourceRoot) {
  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');
    
    // Process markdown files if detected
    if (isMarkdownFile(resolvedPath)) {
      try {
  const markdownResult = await processMarkdown(content, resolvedPath);
        logger.debug(`Processed markdown include: ${src} -> ${resolvedPath}`);
        return { content: markdownResult.html, resolvedPath };
      } catch (error) {
        logger.error(`Failed to process markdown include ${src}: ${error.message}`);
        throw error;
      }
    }
    
    return { content, resolvedPath };
  } catch (err) {
    // Try sourceRoot relative and several fallbacks
    const candidates = [
      path.resolve(sourceRoot, src),
      path.resolve(sourceRoot, src.replace(/^\/+/, '')),
      path.resolve(sourceRoot, path.basename(src)),
      path.resolve(sourceRoot, '_includes', path.basename(src)),
      // Also try relative to the directory of the requesting file (common test layout)
      path.resolve(path.dirname(filePath), src),
      path.resolve(path.dirname(filePath), path.basename(src))
    ];

    // Log candidates for debugging when running tests (always print to console so test harness captures it)
    try {
      const fsSync = require('fs');
      const info = `readIncludeWithFallback: initialAttempt=${resolvedPath}, src=${src}, filePath=${filePath}, sourceRoot=${sourceRoot}`;
      logger.info(info);
      console.log(info);
      for (const c of candidates) {
        try {
          const exists = fsSync.existsSync(c);
          const line = `readIncludeWithFallback: checking candidate: ${c}, exists=${exists}`;
          logger.info(line);
          console.log(line);
        } catch (e) {
          const line = `readIncludeWithFallback: checking candidate: ${c}`;
          logger.info(line);
          console.log(line);
        }
      }
    } catch (e) {
      // ignore logging errors
    }

    for (const candidate of candidates) {
      try {
        const content = await fs.readFile(candidate, 'utf-8');
        logger.debug(`readIncludeWithFallback: found include at ${candidate}`);
        
        // Process markdown files if detected
        if (isMarkdownFile(candidate)) {
          try {
            const markdownResult = await processMarkdown(content, candidate);
            logger.debug(`Processed markdown include: ${src} -> ${candidate}`);
            return { content: markdownResult.html, resolvedPath: candidate };
          } catch (error) {
            logger.error(`Failed to process markdown include ${src}: ${error.message}`);
            throw error;
          }
        }
        
        return { content, resolvedPath: candidate };
      } catch (e) {
        // continue to next candidate
      }
    }

  // No candidate found; re-throw original error for upstream handling
  throw err;
  }
// End of asset injection logic
}

/**
 * Determine if processing should fail fast based on configuration
 * @param {Object} config - Configuration object
 * @param {string} errorType - Type of error ('warning', 'error', 'fatal')
 * @returns {boolean} True if processing should fail fast
 */
function shouldFailFast(config, errorType = 'error') {
  // New fail-on logic
  if (!config.failOn) {
    // Default: don't fail fast, let the build system handle errors
    return false;
  }
  
  if (config.failOn === 'warning') {
    // Fail on any warning or error
    return true;
  }
  
  if (config.failOn === 'error') {
    // Fail on errors (but not warnings)
    return errorType === 'error' || errorType === 'fatal';
  }
  
  return false;

}

/**
 * Apply extracted assets to HTML content
 * Styles go to head, scripts go to end of body
 */
function applyExtractedAssets(htmlContent, extractedAssets) {
  let processedContent = htmlContent;
  
  // Add styles to head (before </head>)
  if (extractedAssets.styles && extractedAssets.styles.length > 0) {
    const headEndRegex = /<\/head>/i;
    const dedupedStyles = [...new Set(extractedAssets.styles)]; // Remove duplicates
    const stylesHTML = dedupedStyles.join('\n');
    processedContent = processedContent.replace(headEndRegex, `${stylesHTML}\n</head>`);
  }

  // Separate JSON-LD scripts from other scripts
  let jsonLdScripts = [];
  let otherScripts = [];
  if (extractedAssets.scripts && extractedAssets.scripts.length > 0) {
    for (const script of extractedAssets.scripts) {
      if (/type=["']application\/ld\+json["']/i.test(script)) {
        jsonLdScripts.push(script);
      } else {
        otherScripts.push(script);
      }
    }
  }
  // Inject JSON-LD scripts into <head>
  if (jsonLdScripts.length > 0) {
    const headEndRegex = /<\/head>/i;
    processedContent = processedContent.replace(headEndRegex, `${jsonLdScripts.join('\n')}\n</head>`);
  }
  // Inject other scripts into <body>
  if (otherScripts.length > 0) {
    const bodyEndRegex = /<\/body>/i;
    processedContent = processedContent.replace(bodyEndRegex, `${otherScripts.join('\n')}\n</body>`);
  }
  
  return processedContent;
}

/**
 * Extract styles and scripts from component HTML content
 */
function extractComponentAssets(htmlContent) {
  const assets = {
    styles: [],
    scripts: []
  };

  // Extract style tags
  const styleRegex = /<style(?:\s[^>]*)?>[\s\S]*?<\/style>/gi;
  let styleMatch;
  while ((styleMatch = styleRegex.exec(htmlContent)) !== null) {
    assets.styles.push(styleMatch[0]);
  }

  // Extract script tags except JSON-LD
  const scriptRegex = /<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi;
  let scriptMatch;
  let scriptLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi;
  while ((scriptMatch = scriptRegex.exec(htmlContent)) !== null) {
    if (!/type=["']application\/ld\+json["']/i.test(scriptMatch[0])) {
      assets.scripts.push(scriptMatch[0]);
    }
  }

  // Remove extracted assets from content, but keep JSON-LD scripts
  let cleanContent = htmlContent;
  cleanContent = cleanContent.replace(styleRegex, '');
  cleanContent = cleanContent.replace(scriptRegex, (match) => {
    return /type=["']application\/ld\+json["']/i.test(match) ? match : '';
  });

  return {
    content: cleanContent,
    assets
  };
}




/**
 * Optimize HTML content with HTMLRewriter
 * @param {string} html - HTML content to optimize
 * @returns {string} Optimized HTML
 */
async function optimizeHtmlContent(html) {
  // HTMLRewriter is always available
  // Proceed with optimization
  
  const rewriter = new HTMLRewriter();

  // Remove unnecessary whitespace (basic optimization)
  rewriter.on('*', {
    text(text) {
      if (text.lastInTextNode) {
        // Collapse multiple whitespace into single space
        const optimized = text.text.replace(/\s+/g, ' ');
        if (optimized !== text.text) {
          text.replace(optimized);
        }
      }
    }
  });

  // Optimize attributes (remove empty ones)
  rewriter.on('*', {
    element(element) {
      // Remove empty class attributes
      const classAttr = element.getAttribute('class');
      if (classAttr === '') {
        element.removeAttribute('class');
      }
      
      // Remove empty id attributes
      const idAttr = element.getAttribute('id');
      if (idAttr === '') {
        element.removeAttribute('id');
      }
    }
  });

  const response = new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
  const transformedResponse = rewriter.transform(response);
  return await transformedResponse.text();
}



/**
 * Detect if HTML content is a full document or page fragment
 * @param {string} htmlContent - HTML content to analyze
 * @returns {Object} Analysis result with document type and structure info
 */
function analyzeHtmlStructure(htmlContent) {
  const hasDoctype = /<!DOCTYPE\s+html/i.test(htmlContent);
  const hasHtmlTag = /<html[^>]*>/i.test(htmlContent);
  const hasHeadTag = /<head[^>]*>/i.test(htmlContent);
  const hasBodyTag = /<body[^>]*>/i.test(htmlContent);
  
  const isFullDocument = hasDoctype && hasHtmlTag && hasHeadTag && hasBodyTag;
  
  return {
    isFullDocument,
    hasDoctype,
    hasHtmlTag,
    hasHeadTag,
    hasBodyTag
  };
}



/**
 * Detect which layout to use for a page using regex-based HTML parsing
 */
async function detectLayoutFromHTML(htmlContent, sourceRoot, config, pagePath) {
  // Use automatic layout discovery only
  const { LayoutDiscovery } = await import('./layout-discovery.js');
  const discovery = new LayoutDiscovery();
  return await discovery.findLayoutForPage(pagePath, sourceRoot);
}

/**
 * Process includes in HTML content (both SSI and <include> elements) - REMOVED
 */
async function processIncludesInHTML(htmlContent, layoutPath, sourceRoot, config) {
  // Include processing completely removed - return content as-is
  return htmlContent;
}


/**
 * Clean up DOM output by removing stray tags and artifacts
 */
function cleanupDOMOutput(html) {
  let result = html;
  
  // Remove stray closing include tags
  result = result.replace(/<\/include>/gi, '');
  
  // Remove stray closing slot tags
  result = result.replace(/<\/slot>/gi, '');
  
  // Remove any remaining self-closing include tags that weren't processed
  result = result.replace(/<include[^>]*\/>/gi, '');
  
  // Remove any remaining opening include tags that weren't processed
  result = result.replace(/<include[^>]*>/gi, '');
  
  // Clean up multiple consecutive empty lines
  result = result.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return result;
}




/**
 * Escape special regex characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Process DOM templating features (slot replacement and layout) - simplified version
 * @param {string} htmlContent - HTML content with DOM templating
 * @param {string} filePath - Path to the current file
 * @param {string} sourceRoot - Source root directory
 * @param {Object} config - Processing configuration
 * @returns {Promise<string>} Processed HTML with templates applied
 */
async function processDOMTemplating(htmlContent, filePath, sourceRoot, config, extractedAssets = { styles: [], scripts: [] }) {
  try {
    // Analyze HTML structure
    const htmlStructure = analyzeHtmlStructure(htmlContent);
    
    // Use layout discovery for ALL pages (not just fragments)
    const { LayoutDiscovery } = await import('./layout-discovery.js');
    const discovery = new LayoutDiscovery();
    const discoveredLayoutPath = await discovery.findLayoutForPage(filePath, sourceRoot);
    
    if (discoveredLayoutPath) {
      try {
        // Get the relative layout path from the discovered absolute path
        const relativeLayoutPath = path.relative(path.dirname(filePath), discoveredLayoutPath);
        return await processLayoutAttribute(
          htmlContent,
          relativeLayoutPath,
          filePath,
          sourceRoot,
          config,
          extractedAssets
        );
      } catch (error) {
        logger.warn(`Layout processing failed for ${path.relative(sourceRoot, filePath)}: ${error.message}`);
      }
    }
    // If assets need to be injected
    if (extractedAssets?.styles?.length > 0 || extractedAssets?.scripts?.length > 0) {
      return applyExtractedAssets(htmlContent, extractedAssets);
    }
    return htmlContent;
  } catch (error) {
    throw new Error(`DOM templating processing failed: ${error.message}`);
  }
}

/**
 * Extract document parts from full HTML document
 * @param {string} htmlContent - Full HTML document content
 * @returns {Object} Object with doctype, html attributes, head content, and body content
 */
function extractHtmlDocumentParts(htmlContent) {
  // Extract DOCTYPE
  const doctypeMatch = htmlContent.match(/<!DOCTYPE[^>]*>/i);
  const doctype = doctypeMatch ? doctypeMatch[0] : null;
  
  // Extract html tag with attributes
  const htmlMatch = htmlContent.match(/<html([^>]*)>/i);
  const htmlAttributes = htmlMatch ? htmlMatch[1].trim() : '';
  
  // Extract head content (everything inside <head>...</head>)
  const headMatch = htmlContent.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : '';
  
  // Extract body content (everything inside <body>...</body>)
  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : '';
  
  return {
    doctype,
    htmlAttributes,
    headContent,
    bodyContent
  };
}

/**
 * Merge full HTML document with layout
 * @param {string} pageContent - Full HTML document content
 * @param {string} layoutContent - Layout HTML content
 * @param {Object} config - Processing configuration
 * @returns {Object} Merged result with warnings
 */
function mergeHtmlDocumentWithLayout(pageContent, layoutContent, config) {
  const pageParts = extractHtmlDocumentParts(pageContent);
  const layoutParts = extractHtmlDocumentParts(layoutContent);
  
  // 1. DOCTYPE: Page's DOCTYPE wins if it exists, otherwise layout's
  const finalDoctype = pageParts.doctype || layoutParts.doctype || '<!DOCTYPE html>';
  
  // 2. HTML attributes: Layout's attributes preserved, page's added/overwrite on conflict
  let finalHtmlAttributes = layoutParts.htmlAttributes;
  if (pageParts.htmlAttributes) {
    // Parse attributes to handle conflicts
    const pageAttrs = parseHtmlAttributes(pageParts.htmlAttributes);
    const layoutAttrs = parseHtmlAttributes(layoutParts.htmlAttributes);
    
    // Merge: page attributes overwrite layout attributes
    const mergedAttrs = { ...layoutAttrs, ...pageAttrs };
    finalHtmlAttributes = Object.entries(mergedAttrs)
      .map(([key, value]) => value === true ? key : `${key}="${value}"`)
      .join(' ');
  }
  
  // 3. HEAD: Use existing head merge algorithm
  const mergedHeadContent = mergeHeadContent(layoutParts.headContent, pageParts.headContent);
  
  // 4. BODY: Insert page body content into layout (data-slot functionality removed)
  const layoutBodyMatch = layoutContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let layoutBodyContent = layoutBodyMatch ? layoutBodyMatch[1] : '';
  const layoutBodyTag = layoutBodyMatch ? layoutBodyMatch[0].match(/<body[^>]*>/i)?.[0] || '<body>' : '<body>';
  
  // Simple insertion: replace <main> element with page content or append to body
  const mainElementRegex = /(<main[^>]*>)([\s\S]*?)(<\/main>)/i;
  if (mainElementRegex.test(layoutBodyContent)) {
    layoutBodyContent = layoutBodyContent.replace(mainElementRegex, `$1${pageParts.bodyContent}$3`);
  } else {
    // No main element found, append page content to layout body content
    layoutBodyContent += '\n' + pageParts.bodyContent;
  }
  
  const slotApplication = { result: layoutBodyContent, warnings: [], usedSlots: [] };
  
  // Reconstruct full document
  const htmlTag = finalHtmlAttributes ? `<html ${finalHtmlAttributes}>` : '<html>';
  const reconstructedDocument = `${finalDoctype}
${htmlTag}
<head>
${mergedHeadContent}
</head>
${layoutBodyTag}
${slotApplication.result}
</body>
</html>`;
  
  return {
    result: reconstructedDocument,
    warnings: slotApplication.warnings
  };
}

/**
 * Parse HTML attributes string into object
 * @param {string} attributesStr - HTML attributes string
 * @returns {Object} Parsed attributes object
 */
function parseHtmlAttributes(attributesStr) {
  const attrs = {};
  if (!attributesStr) return attrs;
  
  // Simple regex to parse key="value" or key=value or standalone key
  // Allow hyphens in attribute names (for data-* attributes)
  const attrRegex = /([\w-]+)(?:=["']([^"']*)["']|=([^\s]+)|(?=\s|$))/g;
  let match;
  
  while ((match = attrRegex.exec(attributesStr)) !== null) {
    const [, key, quotedValue, unquotedValue] = match;
    attrs[key] = quotedValue || unquotedValue || true;
  }
  
  return attrs;
}

/**
 * Merge head content from layout and page (simplified version of head merge algorithm)
 * @param {string} layoutHead - Layout head content
 * @param {string} pageHead - Page head content
 * @returns {string} Merged head content
 */
function mergeHeadContent(layoutHead, pageHead) {
  // For now, simple approach: layout head + page head (page wins on conflicts)
  // This should eventually use the full head merge algorithm from the spec
  let merged = layoutHead;
  
  if (pageHead) {
    // Extract titles - page title wins
    const pageTitle = pageHead.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (pageTitle) {
      // Remove layout title if exists
      merged = merged.replace(/<title[^>]*>[^<]*<\/title>/i, '');
      merged += '\n' + pageTitle[0];
    }
    
    // Add other page head content
    const cleanPageHead = pageHead.replace(/<title[^>]*>[^<]*<\/title>/i, '');
    if (cleanPageHead.trim()) {
      merged += '\n' + cleanPageHead;
    }
  }
  
  return merged;
}

/**
 * Process layout attribute functionality
 * @param {string} pageContent - Page HTML content
 * @param {string} layoutPath - Layout file path
 * @param {string} filePath - Current file path
 * @param {string} sourceRoot - Source root directory
 * @param {Object} config - Processing configuration
 * @returns {Promise<string>} Processed HTML with layout applied
 */
export async function processLayoutAttribute(
  pageContent,
  layoutPath,
  filePath,
  sourceRoot,
  config,
  extractedAssets = { styles: [], scripts: [] }
) {
  // Use LayoutDiscovery system for both full paths and short names
  const { LayoutDiscovery } = await import('./layout-discovery.js');
  const discovery = new LayoutDiscovery();
  
  const resolvedLayoutPath = await discovery.resolveLayoutOverride(layoutPath, sourceRoot, filePath);
  if (!resolvedLayoutPath) {
    throw new LayoutError(
      filePath,
      `Layout not found: ${layoutPath}`,
      [sourceRoot]
    );
  }
  // Use CascadingImportsProcessor for slot/template processing
  let processed = pageContent;
  try {
    // Process cascading imports and slots using CascadingImportsProcessor
    const cascadingProcessor = new CascadingImportsProcessor(sourceRoot);
    processed = await cascadingProcessor.processImports(pageContent, filePath);
  } catch (error) {
    logger.warn(`CascadingImportsProcessor failed for ${path.relative(sourceRoot, filePath)}: ${error.message}`);
  }

  // CascadingImportsProcessor handles all layout and slot processing
  const htmlStructure = analyzeHtmlStructure(processed);
  if (!htmlStructure.isFullDocument) {
    logger.debug(`No layout found for fragment: ${path.relative(sourceRoot, filePath)}, wrapping in basic HTML structure`);
    let stylesHTML = '';
    let scriptsHTML = '';
    if (extractedAssets?.styles?.length > 0) {
      const dedupedStyles = [...new Set(extractedAssets.styles)];
      stylesHTML = '\n' + dedupedStyles.join('\n');
    }
    if (extractedAssets?.scripts?.length > 0) {
      const dedupedScripts = [...new Set(extractedAssets.scripts)];
      scriptsHTML = '\n' + dedupedScripts.join('\n');
    }
    // Asset injection for fragments
    let html = '<!DOCTYPE html>\n<html>\n<head>\n<title>Page</title>';
    if (stylesHTML) html += stylesHTML;
    html += '\n</head>\n<body>\n';
    html += processed;
    if (scriptsHTML) html += scriptsHTML;
    html += '\n</body>\n</html>';
    return html;
  }
  
  // Return the processed layout content for full documents
  return processed;
}

/**
 * Get default configuration for unified processing
 * @param {Object} userConfig - User-provided configuration
 * @returns {Object} Complete configuration object
 */
export function getUnifiedConfig(userConfig = {}) {
  let config = {
    ...userConfig,
  };
  
  return config;
}

/**
 * Check if content should use unified processing (always true now)
 * @param {string} htmlContent - HTML content to check
 * @returns {boolean} Always returns true for unified processing
 */
export function shouldUseUnifiedProcessing(htmlContent) {
  // Unified processor handles all HTML content
  return true;
}

/**
 * Optimize HTML content using HTMLRewriter
 * @param {string} htmlContent - HTML content to optimize
 * @returns {Promise<string>} Optimized HTML content
 */
export async function optimizeHtml(htmlContent) {
  // HTMLRewriter is always available
  // Proceed with optimization
  const rewriter = new HTMLRewriter();

  // Remove unnecessary whitespace (basic optimization)
  rewriter.on('*', {
    text(text) {
      if (text.lastInTextNode) {
        // Collapse multiple whitespace into single space
        const optimized = text.text.replace(/\s+/g, ' ');
        if (optimized !== text.text) {
          text.replace(optimized);
        }
      }
    }
  });

  // Optimize attributes (remove empty ones)
  rewriter.on('*', {
    element(element) {
      // Remove empty class attributes
      const classAttr = element.getAttribute('class');
      if (classAttr === '') {
        element.removeAttribute('class');
      }
      // Remove empty id attributes
      const idAttr = element.getAttribute('id');
      if (idAttr === '') {
        element.removeAttribute('id');
      }
    }
  });

  // Slot/template injection logic per app-spec
  // Collect <template target="..."> content
  const slotTemplates = {};
  const templateRewriter = new HTMLRewriter();
  templateRewriter.on('template', {
    element(element) {
      const target = element.getAttribute('target') || element.getAttribute('data-target') || '';
      if (target) {
        slotTemplates[target] = '';
        element.on('text', (text) => {
          slotTemplates[target] += text.text;
        });
      }
    }
  });
  await templateRewriter.transform(new Response(htmlContent)).text();

  // Replace <slot name="..."> with template content or fallback
  rewriter.on('slot', {
    element(element) {
      const name = element.getAttribute('name');
      if (name && slotTemplates[name]) {
        element.replace(slotTemplates[name]);
      } else {
        // Use fallback slot content if present
        let fallback = '';
        element.on('text', (text) => {
          fallback += text.text;
        });
        element.replace(fallback);
      }
    }
  });
  // Remove <template> elements after slot injection
  rewriter.on('template', {
    element(element) {
      element.remove();
    }
  });

  try {
    const optimized = await rewriter.transform(new Response(htmlContent)).text();
    return optimized;
  } catch (error) {
    logger.warn(`HTML optimization failed: ${error.message}`);
    return htmlContent; // Return original if optimization fails
  }
}

/**
 * Extract metadata from HTML using HTMLRewriter
 * @param {string} htmlContent - HTML content to analyze
 * @returns {Promise<Object>} Extracted metadata
 */
export async function extractHtmlMetadata(htmlContent) {
  const metadata = {
    title: '',
    description: '',
    keywords: [],
    openGraph: {}
  };

  // HTMLRewriter is always available
  // Proceed with metadata extraction
  const rewriter = new HTMLRewriter();

  // Extract title
  rewriter.on('title', {
    text(text) {
      metadata.title += text.text;
    }
  });

  // Extract meta tags
  rewriter.on('meta', {
    element(element) {
      const name = element.getAttribute('name');
      const property = element.getAttribute('property');
      const content = element.getAttribute('content');

      if (name === 'description' && content) {
        metadata.description = content;
      } else if (name === 'keywords' && content) {
        metadata.keywords = content.split(',').map(k => k.trim());
      } else if (property && property.startsWith('og:') && content) {
        const ogKey = property.replace('og:', '');
        metadata.openGraph[ogKey] = content;
      }
    }
  });

  // Transform to trigger handlers (we don't need the output)
  const response = new Response(htmlContent, {
    headers: { 'Content-Type': 'text/html' }
  });
  await rewriter.transform(response).text();
  return metadata;
}
