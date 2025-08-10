/**
 * Unified HTML Processor for unify
 * Handles both SSI-style includes (<!--#include -->) and DOM templating (<template>, <slot>)
 * using HTMLRewriter for high-performance processing.
 */

import fs from "fs/promises";
import path from "path";
import { processIncludes } from "./include-processor.js";
import { logger } from "../utils/logger.js";
import { 
  BuildError,
  FileSystemError,
  CircularDependencyError,
  PathTraversalError,
  IncludeNotFoundError,
  LayoutError
} from "../utils/errors.js";
import { isPathWithinDirectory, resolveIncludePath, resolveResourcePath } from "../utils/path-resolver.js";
import { hasFeature } from "../utils/runtime-detector.js";

/**
 * Process HTML content with unified support for both SSI includes and DOM templating
 * Uses HTMLRewriter for high-performance processing
 * @param {string} htmlContent - Raw HTML content to process
   // Check if the layout itself has a data-layout attribute (nested layouts)
  const nestedLayoutMatch = layoutContent.match(/data-layout=["']([^"']+)["']/i);
  if (nestedLayoutMatch) {
    const nestedLayoutPath = nestedLayoutMatch[1];
    // Recursively process the nested layout, but pass the current slot data as page content
    const slotResult = extractSlotDataFromHTML(pageContent);
    const layoutWithSlots = applySlots(layoutContent, slotResult.slots);
    
    // Now process the nested layout with the slot-applied content as the page content
    return await processLayoutAttribute(
      layoutWithSlots,
      nestedLayoutPath,
      resolvedLayoutPath, // Use current layout as the source file for nested layout resolution
      sourceRoot,
      config
    );
  }filePath - Path to the HTML file being processed
 * @param {string} sourceRoot - Source root directory
 * @param {DependencyTracker} dependencyTracker - Dependency tracker instance
 * @param {Object} config - Processing configuration
 * @returns {Promise<string>} Processed HTML content
 */
export async function processHtmlUnified(
  htmlContent,
  filePath,
  sourceRoot,
  dependencyTracker,
  config = {}
) {
  const processingConfig = {
    componentsDir: ".components",
    layoutsDir: ".layouts",
    defaultLayout: "default.html",
    optimize: config.minify || config.optimize,
    ...config,
  };

  try {
    logger.debug(
      `Using HTMLRewriter for: ${path.relative(sourceRoot, filePath)}`
    );
    
    // Track dependencies before processing
    if (dependencyTracker) {
      dependencyTracker.analyzePage(filePath, htmlContent, sourceRoot);
    }
    
    // Always process includes (SSI and DOM) first
    let includeResult = await processIncludesWithStringReplacement(
      htmlContent,
      filePath,
      sourceRoot,
      processingConfig,
      new Set() // Initialize call stack for circular dependency detection
    );
    
    // Handle both old string format and new object format
    let processedContent;
    let extractedAssets = { styles: [], scripts: [] };
    if (typeof includeResult === 'object' && includeResult.content !== undefined) {
      processedContent = includeResult.content;
      extractedAssets = includeResult;
    } else {
      processedContent = includeResult;
    }
    
    // Extract and relocate component assets (styles to head, scripts to end of body)
    processedContent = await extractAndRelocateComponentAssets(processedContent, extractedAssets);

    // Apply HTML optimization only after all includes are processed
    if (processingConfig.optimize !== false) {
      logger.debug(`Optimizing HTML content, optimize=${processingConfig.optimize}`);
      processedContent = await optimizeHtmlContent(processedContent);
    } else {
      logger.debug(`Skipping HTML optimization, optimize=${processingConfig.optimize}`);
    }

    // Handle layouts and slots if needed (after includes and optimization)
    if (shouldUseDOMMode(processedContent)) {
      processedContent = await processDOMMode(
        processedContent,
        filePath,
        sourceRoot,
        processingConfig,
        extractedAssets
      );
    } else if (
      hasDOMTemplating(processedContent) ||
      !processedContent.includes("<html")
    ) {
      processedContent = await processDOMTemplating(
        processedContent,
        filePath,
        sourceRoot,
        processingConfig,
        extractedAssets  // Pass extracted assets to DOM templating
      );
    }

  // Slot/template injection for HTML files (if layout contains <slot> or <template target="...">)
  // This is now handled in file-processor.js after layout chain is discovered and applied
  return {
    content: processedContent,
    extractedAssets: extractedAssets
  };
  } catch (error) {
    logger.error(
      `Unified HTML processing failed for ${path.relative(
        sourceRoot,
        filePath
      )}: ${error.message}`
    );
    throw error; // Re-throw with original error details
  }

/**
 * Process includes using string replacement (more reliable for async operations)
 * Returns an object with processed content and extracted assets
 */
async function processIncludesWithStringReplacement(htmlContent, filePath, sourceRoot, config = {}, callStack = new Set()) {
  let processedContent = typeof htmlContent === 'string' ? htmlContent : '';
  const extractedAssets = { styles: [], scripts: [] };

  // Defensive: always return a string, even if an error occurs
  try {
  
  // Check for circular dependency
  if (callStack.has(filePath)) {
    const chain = Array.from(callStack);
    throw new CircularDependencyError(filePath, chain);
  }
  
  // Add current file to call stack
  const newCallStack = new Set(callStack);
  newCallStack.add(filePath);
  
  // Process SSI-style includes
  const includeRegex = /<!--\s*#include\s+(virtual|file)="([^"]+)"\s*-->/g;
  let match;
  const processedIncludes = new Set();
  
  while ((match = includeRegex.exec(htmlContent)) !== null) {
    const [fullMatch, type, includePath] = match;
    const includeKey = `${type}:${includePath}`;
    
    if (processedIncludes.has(includeKey)) {
      continue; // Avoid processing the same include multiple times
    }
    processedIncludes.add(includeKey);
    
    try {
      const resolvedPath = resolveIncludePathInternal(type, includePath, filePath, sourceRoot);
      const includeContent = await fs.readFile(resolvedPath, 'utf-8');
      
      // Recursively process nested includes
      const nestedResult = await processIncludesWithStringReplacement(includeContent, resolvedPath, sourceRoot, config, newCallStack);
      // SSI includes: Do NOT extract assets, keep Apache SSI behavior (inline everything)
      const nestedProcessedContent = (typeof nestedResult === 'object' && nestedResult.content !== undefined) 
        ? nestedResult.content 
        : nestedResult;
      
      // Replace all occurrences of this include
      processedContent = (processedContent || '')
        .replace(new RegExp(escapeRegExp(fullMatch), 'g'), nestedProcessedContent || '');
      logger.debug(`Processed include: ${includePath} -> ${resolvedPath}`);
    } catch (error) {
      // Convert file not found errors to IncludeNotFoundError with helpful suggestions
      if (error.code === 'ENOENT' && !error.formatForCLI) {
        const resolvedPath = resolveIncludePathInternal(type, includePath, filePath, sourceRoot);
        error = new IncludeNotFoundError(includePath, filePath, [resolvedPath]);
      }
      // In perfection mode, fail fast on any include error
      if (config.perfection) {
        // Always throw BuildError for any include error in perfection mode
        let msg;
        if (error instanceof CircularDependencyError) {
          msg = `Include circular dependency: ${includePath} in ${filePath}`;
        } else if (error instanceof PathTraversalError) {
          msg = `Include path traversal: ${includePath} in ${filePath}`;
        } else if (error instanceof IncludeNotFoundError) {
          msg = `Include not found: ${includePath} in ${filePath}`;
        } else {
          msg = `Include error: ${includePath} in ${filePath}: ${error.message}`;
        }
        throw new BuildError(msg, [{ file: filePath, error: msg }]);
      }
      logger.warn(`Include not found: ${includePath} in ${filePath}`);
      processedContent = (processedContent || '')
        .replace(new RegExp(escapeRegExp(fullMatch), 'g'), `<!-- Include not found: ${includePath} -->`);
    }
  }
  
  // Recursively process DOM includes until none remain (up to max depth)
  const domIncludeRegex = /<include\s+src="([^"]+)"[^>]*>(?:<\/include>)?/g;
  let depth = 0;
  const maxDepth = 10;
  let hasDomIncludes = true;
  while (hasDomIncludes && depth < maxDepth) {
    domIncludeRegex.lastIndex = 0;
    let domMatches = [...processedContent.matchAll(domIncludeRegex)];
    hasDomIncludes = domMatches.length > 0;
    depth++;
    for (const domMatch of domMatches) {
      const [fullMatch, src] = domMatch;
      try {
        let resolvedPath;
        if (src.startsWith('/')) {
          // Absolute path from source root
          resolvedPath = path.resolve(sourceRoot, src.replace(/^\/+/,''));
        } else {
          // Relative path from current file
          resolvedPath = path.resolve(path.dirname(filePath), src);
        }
        // Security: ensure resolved path is within source root
        if (!isPathWithinDirectory(resolvedPath, sourceRoot)) {
          throw new PathTraversalError(src, sourceRoot);
        }
        
        // Check if this is a component (in components directory)
        // Support multiple component directory patterns: .components, custom_components, _components
        const isComponent = resolvedPath.includes(config.componentsDir) || 
                            resolvedPath.includes('.components') ||
                            resolvedPath.includes('custom_components') ||
                            resolvedPath.includes('_components');
        
        let includeContent;
        if (isComponent) {
          // Use component processing with asset extraction
          const componentContent = await fs.readFile(resolvedPath, 'utf-8');
          const component = extractComponentAssets(componentContent);
          // Collect extracted assets
          extractedAssets.styles.push(...component.assets.styles);
          extractedAssets.scripts.push(...component.assets.scripts);
          includeContent = component.content;
        } else {
          includeContent = await fs.readFile(resolvedPath, 'utf-8');
        }
        
        // Recursively process nested includes
        const nestedResult = await processIncludesWithStringReplacement(includeContent, resolvedPath, sourceRoot, config, newCallStack);
        // If the nested result is an object (with assets), extract them
        if (typeof nestedResult === 'object' && nestedResult.content !== undefined) {
          includeContent = nestedResult.content;
          extractedAssets.styles.push(...nestedResult.styles);
          extractedAssets.scripts.push(...nestedResult.scripts);
        } else {
          includeContent = nestedResult;
        }
        
        processedContent = (processedContent || '')
          .replace(fullMatch, includeContent || '');
        logger.debug(`Processed include element: ${src} -> ${resolvedPath}`);
      } catch (error) {
        let resolvedPath;
        if (src.startsWith('/')) {
          resolvedPath = path.resolve(sourceRoot, src.replace(/^\/+/,''));
        } else {
          resolvedPath = path.resolve(path.dirname(filePath), src);
        }
        const errorFilePath = resolvedPath || filePath;
        if (error.code === 'ENOENT' && !error.formatForCLI) {
          error = new IncludeNotFoundError(src, errorFilePath, [resolvedPath]);
        }
        if (config.perfection) {
          let msg;
          if (error instanceof CircularDependencyError) {
            msg = `Include circular dependency: ${src} in ${errorFilePath}`;
          } else if (error instanceof PathTraversalError) {
            msg = `Include path traversal: ${src} in ${errorFilePath}`;
          } else if (error instanceof IncludeNotFoundError) {
            msg = `Include not found: ${src} in ${errorFilePath}`;
          } else {
            msg = `Include element error: ${src} in ${errorFilePath}: ${error.message}`;
          }
          throw new BuildError(msg, [{ file: errorFilePath, error: msg }]);
        }
        logger.warn(`Include element not found: ${src} in ${errorFilePath}`);
        processedContent = (processedContent || '')
          .replace(fullMatch, `<!-- Include not found: ${src} -->`);
      }
    }
  }
  
  return {
    content: processedContent,
    styles: extractedAssets.styles,
    scripts: extractedAssets.scripts
  };
  } catch (err) {
    logger.error('processIncludesWithStringReplacement failed:', err);
    // In perfection mode, re-throw all build-stopping errors
    if (config.perfection && (
      err instanceof BuildError || 
      err instanceof CircularDependencyError ||
      err instanceof PathTraversalError ||
      err instanceof IncludeNotFoundError ||
      err.name === 'BuildError' ||
      err.name === 'CircularDependencyError' ||
      err.name === 'PathTraversalError' ||
      err.name === 'IncludeNotFoundError'
    )) {
      throw err;
    }
    return {
      content: '',
      styles: [],
      scripts: []
    };
  }
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  // Extract script tags
  const scriptRegex = /<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi;
  let scriptMatch;
  while ((scriptMatch = scriptRegex.exec(htmlContent)) !== null) {
    assets.scripts.push(scriptMatch[0]);
  }

  // Remove extracted assets from content
  let cleanContent = htmlContent;
  cleanContent = cleanContent.replace(styleRegex, '');
  cleanContent = cleanContent.replace(scriptRegex, '');

  return {
    content: cleanContent,
    assets
  };
}

/**
 * Process SSI include directive
 */
async function processIncludeDirective(comment, type, includePath, filePath, sourceRoot, config, callStack = new Set()) {
  try {
    const resolvedPath = resolveIncludePathInternal(type, includePath, filePath, sourceRoot);
    const includeContent = await fs.readFile(resolvedPath, 'utf-8');
    
    // Recursively process nested includes in the included content
    const includeResult = await processIncludesWithStringReplacement(includeContent, resolvedPath, sourceRoot, config, callStack);
    
    // Handle both old string format and new object format
    const processedContent = (typeof includeResult === 'object' && includeResult.content !== undefined) 
      ? includeResult.content 
      : includeResult;
    
    comment.replace(processedContent, { html: true });
    logger.debug(`Processed include: ${includePath} -> ${resolvedPath}`);
  } catch (error) {
    logger.warn(`Include not found: ${includePath} in ${filePath}`);
    comment.replace(`<!-- Include not found: ${includePath} -->`, { html: true });
  }
}

/**
 * Process modern include element
 */
async function processIncludeElement(element, src, filePath, sourceRoot, config, callStack = new Set()) {
  try {
    const resolvedPath = resolveIncludePathInternal('file', src, filePath, sourceRoot);
    const includeContent = await fs.readFile(resolvedPath, 'utf-8');
    
    // Recursively process nested includes in the included content
    const includeResult = await processIncludesWithStringReplacement(includeContent, resolvedPath, sourceRoot, config, callStack);
    
    // Handle both old string format and new object format
    const processedContent = (typeof includeResult === 'object' && includeResult.content !== undefined) 
      ? includeResult.content 
      : includeResult;
    
    element.setInnerContent(processedContent, { html: true });
    logger.debug(`Processed include element: ${src} -> ${resolvedPath}`);
  } catch (error) {
    // In perfection mode, fail fast on any include error
    if (config.perfection) {
      throw new Error(`Include not found in perfection mode: ${src} in ${filePath}`);
    }
    logger.warn(`Include element not found: ${src} in ${filePath}`);
    element.setInnerContent(`<!-- Include not found: ${src} -->`, { html: true });
  }
}

/**
 * Resolve include path based on type
 */
function resolveIncludePathInternal(type, includePath, currentFile, sourceRoot) {
  return resolveIncludePath(type, includePath, currentFile, sourceRoot);
}

/**
 * Optimize HTML content with HTMLRewriter
 * @param {string} html - HTML content to optimize
 * @returns {string} Optimized HTML
 */
async function optimizeHtmlContent(html) {
  // Check if HTMLRewriter is available
  if (!hasFeature('htmlRewriter')) {
    logger.debug('HTMLRewriter not available, skipping HTML optimization');
    return html;
  }
  
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
 * Check if content should use DOM mode processing
 * @param {string} content - HTML content to check
 * @returns {boolean} True if content has DOM mode features
 */
function shouldUseDOMMode(content) {
  return content.includes('<include ') || 
         content.includes('<slot') || 
         content.includes('target=') ||
         content.includes('data-layout=');
}

/**
 * Integrated DOM mode processing - handles <include> elements, layouts, and slots
 * @param {string} pageContent - Raw HTML content of the page
 * @param {string} pagePath - Path to the page file
 * @param {string} sourceRoot - Source root directory
 * @param {Object} config - DOM processor configuration
 * @returns {Promise<string>} Processed HTML content
 */
async function processDOMMode(pageContent, pagePath, sourceRoot, config = {}, extractedAssets = null) {
  const domConfig = { 
    layoutsDir: '.layouts',
    componentsDir: '.components', 
    defaultLayout: 'default.html',
    sourceRoot, 
    ...config 
  };

  // Check if this is a complete HTML document (has <html> tag)
  const isCompleteHtml = pageContent.includes('<html');
  // Check for explicit data-layout attribute
  const layoutMatch = pageContent.match(/data-layout=["']([^"']+)["']/i);
  const hasExplicitLayout = !!layoutMatch;

  // For complete HTML documents without explicit layout, don't apply any layout
  if (isCompleteHtml && !hasExplicitLayout) {
    logger.debug(`Skipping layout for complete HTML document: ${path.relative(sourceRoot, pagePath)}`);
    return pageContent;
  }

  // Detect layout from HTML content using regex-based parsing
  let layoutPath;
  try {
    layoutPath = await detectLayoutFromHTML(pageContent, sourceRoot, domConfig);
    logger.debug(`Using layout: ${layoutPath}`);
    let layoutContent = await fs.readFile(layoutPath, 'utf-8');

    // Extract slot content from page HTML using regex-based parsing
    const slotResult = extractSlotDataFromHTML(pageContent);

    // Apply slots to layout using string replacement
    let processedHTML = applySlots(layoutContent, slotResult.slots);

    // Inject extracted assets from component processing into the layout
    if (extractedAssets && (extractedAssets.styles?.length > 0 || extractedAssets.scripts?.length > 0)) {
      // Inject styles into head (before </head>)
      if (extractedAssets.styles.length > 0) {
        const headEndRegex = /<\/head>/i;
        const dedupedStyles = [...new Set(extractedAssets.styles)]; // Remove duplicates
        const stylesHTML = dedupedStyles.join('\n');
        processedHTML = processedHTML.replace(headEndRegex, `${stylesHTML}\n</head>`);
      }
      
      // Inject scripts into end of body (before </body>)
      if (extractedAssets.scripts.length > 0) {
        const bodyEndRegex = /<\/body>/i;
        const dedupedScripts = [...new Set(extractedAssets.scripts)]; // Remove duplicates
        const scriptsHTML = dedupedScripts.join('\n');
        processedHTML = processedHTML.replace(bodyEndRegex, `${scriptsHTML}\n</body>`);
      }
    }

    // Check if the layout itself has a data-layout attribute (nested layouts)
    const nestedLayoutMatch = layoutContent.match(/data-layout=["']([^"']+)["']/i);
    if (nestedLayoutMatch) {
      const nestedLayoutPath = nestedLayoutMatch[1];
      // Recursively process the nested layout using DOM mode
      return await processDOMMode(processedHTML, layoutPath, sourceRoot, domConfig, extractedAssets);
    }

    // Process any remaining includes in the result (shouldn't be many since includes were processed earlier)
    processedHTML = await processIncludesInHTML(processedHTML, layoutPath, sourceRoot, domConfig);

    return processedHTML;
    
  } catch (error) {
    // In perfection mode, fail fast on layout detection errors
    if (domConfig.perfection) {
      throw new Error(`Layout not found in perfection mode for ${path.relative(sourceRoot, pagePath)}: ${error.message}`);
    }
    
    logger.warn(`Layout not found for ${path.relative(sourceRoot, pagePath)}: ${error.message}`);
    return `<!DOCTYPE html>
<html>
<head>
  <title>Page</title>
</head>
<body>
${pageContent}
</body>
</html>`;
  }
}

/**
 * Detect which layout to use for a page using regex-based HTML parsing
 */
async function detectLayoutFromHTML(htmlContent, sourceRoot, config) {
  // Look for data-layout attribute in HTML content
  const layoutMatch = htmlContent.match(/data-layout=["']([^"']+)["']/i);
  
  if (layoutMatch) {
    const layoutAttr = layoutMatch[1];
    return resolveResourcePath(layoutAttr, sourceRoot, config.layoutsDir, 'layout');
  }
  
  // Fall back to default layout
  let defaultLayoutPath;
  if (path.isAbsolute(config.layoutsDir)) {
    // If layoutsDir is an absolute path (from CLI), use it directly
    defaultLayoutPath = path.join(config.layoutsDir, config.defaultLayout);
  } else {
    // If layoutsDir is relative, join with sourceRoot
    defaultLayoutPath = path.join(sourceRoot, config.layoutsDir, config.defaultLayout);
  }
  return defaultLayoutPath;
}

/**
 * Process includes in HTML content (both SSI and <include> elements)
 */
async function processIncludesInHTML(htmlContent, layoutPath, sourceRoot, config) {
  // Process SSI includes first (already done in main flow, but handle any in layout)
  let result = await processIncludes(
    htmlContent,
    layoutPath, // Use layout path for proper include resolution 
    sourceRoot,
    new Set(),
    0,
    null, // No dependency tracker needed
    config && config.perfection ? true : false
  );

  // Then process <include> elements if any remain
  const includeRegex = /<include\s+([^>]+)\/??\s*>/gi;
  const allStyles = [];
  const allScripts = [];

  // Process includes recursively until no more are found
  let hasIncludes = true;
  while (hasIncludes) {
    hasIncludes = false;
    let match;
    while ((match = includeRegex.exec(result)) !== null) {
      hasIncludes = true;
      const fullMatch = match[0];
      const attrs = match[1];
      const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
      if (!srcMatch) continue;
      const src = srcMatch[1];
      let resolvedPath;
      try {
        if (src.startsWith('/')) {
          resolvedPath = path.resolve(sourceRoot, src.replace(/^\/+/,''));
        } else {
          resolvedPath = path.resolve(path.dirname(layoutPath), src);
        }
        logger.debug('[UNIFY] Attempting to resolve DOM include:', { src, fromFile: layoutPath, resolvedPath });
        if (!isPathWithinDirectory(resolvedPath, sourceRoot)) {
          throw new PathTraversalError(src, sourceRoot);
        }
        
        // Check if this is a component (in components directory)
        const isComponent = resolvedPath.includes(config.componentsDir) || resolvedPath.includes('.components');
        console.log('[DEBUG] Processing DOM include:', { src, resolvedPath, isComponent, componentsDir: config.componentsDir });
        console.log('[DEBUG] Component check:', { 
          includesComponentsDir: resolvedPath.includes(config.componentsDir),
          includesDotComponents: resolvedPath.includes('.components'),
          resolvedPath,
          componentsDir: config.componentsDir 
        });
        
        if (isComponent) {
          console.log('[DEBUG] Processing as component with asset extraction');
          // Use component processing with asset extraction
          const component = await loadAndProcessComponent(src, {}, sourceRoot, config);
          console.log('[DEBUG] Component processed, styles:', component.styles.length, 'scripts:', component.scripts.length);
          // Recursively process any nested includes in the component content
          const componentResult = await processIncludesWithStringReplacement(component.content, resolvedPath, sourceRoot, config, new Set());
          const componentContent = (typeof componentResult === 'object' && componentResult.content !== undefined) 
            ? componentResult.content 
            : componentResult;
          result = result.replace(fullMatch, componentContent);
          // Collect extracted assets
          allStyles.push(...component.styles);
          allScripts.push(...component.scripts);
          console.log('[DEBUG] Total styles collected:', allStyles.length, 'scripts:', allScripts.length);
        } else {
          // Regular include processing for non-components
          let includeContent = await fs.readFile(resolvedPath, 'utf-8');
          const includeResult = await processIncludesWithStringReplacement(includeContent, resolvedPath, sourceRoot, config, new Set());
          const processedIncludeContent = (typeof includeResult === 'object' && includeResult.content !== undefined) 
            ? includeResult.content 
            : includeResult;
          result = result.replace(fullMatch, processedIncludeContent);
        }
        
        logger.debug('[UNIFY] Successfully processed DOM include:', src, '->', resolvedPath);
      } catch (error) {
        if (src.startsWith('/')) {
          resolvedPath = path.resolve(sourceRoot, src.replace(/^\/+/,''));
        } else {
          resolvedPath = path.resolve(path.dirname(layoutPath), src);
        }
        logger.error('[UNIFY] Failed to resolve DOM include:', { src, fromFile: layoutPath, resolvedPath, error: error.message });
        if (error.code === 'ENOENT' && !error.formatForCLI) {
          error = new IncludeNotFoundError(src, layoutPath, [resolvedPath]);
        }
        if (config.perfection) {
          if (error instanceof CircularDependencyError || error instanceof PathTraversalError || error instanceof IncludeNotFoundError) {
            throw error;
          }
          throw new Error('Include element not found in perfection mode: ' + src + ' in ' + layoutPath);
        }
        logger.warn('[UNIFY] Include element not found:', src, 'in', layoutPath);
        result = result.replace(fullMatch, '<!-- Include not found: ' + src + ' -->');
      }
    }
    // Reset regex to find new includes in the updated content
    includeRegex.lastIndex = 0;
  }

  // Clean up any remaining artifacts
  result = cleanupDOMOutput(result);

  // Move styles to head and scripts to end of body
  if (allStyles.length > 0) {
    const headEndRegex = /<\/head>/i;
    const dedupedStyles = [...new Set(allStyles)]; // Remove duplicates
    const stylesHTML = dedupedStyles.join('\n');
    result = result.replace(headEndRegex, `${stylesHTML}\n</head>`);
  }
  
  if (allScripts.length > 0) {
    const bodyEndRegex = /<\/body>/i;
    const dedupedScripts = [...new Set(allScripts)]; // Remove duplicates  
    const scriptsHTML = dedupedScripts.join('\n');
    result = result.replace(bodyEndRegex, `${scriptsHTML}\n</body>`);
  }
  
  return result;
}

/**
 * Load and process a component
 */
async function loadAndProcessComponent(src, unused, sourceRoot, config) {
  // Resolve component path
  const componentPath = resolveResourcePath(src, sourceRoot, config.componentsDir, 'component');
  
  // Load component
  const componentContent = await fs.readFile(componentPath, 'utf-8');
  
  // Just return the component content as-is, without token replacement
  let processedContent = componentContent;
  
  // Extract and remove styles and scripts
  const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi;
  const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>/gi;
  
  const styles = [...processedContent.matchAll(styleRegex)].map(match => match[0]);
  const scripts = [...processedContent.matchAll(scriptRegex)].map(match => match[0]);
  
  // Remove styles and scripts from component content
  processedContent = processedContent.replace(styleRegex, '');
  processedContent = processedContent.replace(scriptRegex, '');
  
  return {
    content: processedContent,
    styles,
    scripts
  };
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
 * Check if content contains DOM templating syntax
 * @param {string} content - HTML content to check
 * @returns {boolean} True if content has DOM templating
 */
function hasDOMTemplating(content) {
  // Check for slot elements or layout attributes
  return (
    content.includes("<slot") ||
    content.includes("<template") ||
    content.includes("data-layout=")
  );
}

/**
 * Extract slot content from HTML using regex-based parsing (consolidated from both processors)
 * @param {string} htmlContent - HTML content to extract slots from
 * @returns {Object} Object with slot names as keys and content as values
 */
function extractSlotDataFromHTML(htmlContent) {
  const slots = {};
  const extractedStyles = [];
  const extractedScripts = [];
  
  let match;

  
  // Extract named slots with target attribute (spec-compliant)
  const targetRegex = /<template[^>]+target=["']([^"']+)["'][^>]*>([\s\S]*?)<\/template>/gi;
  while ((match = targetRegex.exec(htmlContent)) !== null) {
    const targetName = match[1];
    const content = match[2];
    slots[targetName] = content;
  }
  
  // Extract default slot content from template without target attributes
  const defaultTemplateRegex = /<template(?!\s+(?:target)=)[^>]*>([\s\S]*?)<\/template>/gi;
  match = defaultTemplateRegex.exec(htmlContent);
  if (match) {
    slots['default'] = match[1];
  } else {
    // Extract default slot content (everything not in a template)
    let defaultContent = htmlContent;
    
    // Remove all template elements
    defaultContent = defaultContent.replace(/<template[^>]*>[\s\S]*?<\/template>/gi, '');
    
    // Extract and preserve script and style elements instead of removing them
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    while ((match = styleRegex.exec(defaultContent)) !== null) {
      extractedStyles.push(match[0]); // Keep the full <style>...</style> tag
    }
    
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    while ((match = scriptRegex.exec(defaultContent)) !== null) {
      extractedScripts.push(match[0]); // Keep the full <script>...</script> tag
    }
    
    // Now remove them from the content (but they're preserved above)
    defaultContent = defaultContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    defaultContent = defaultContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Remove data-layout attribute
    defaultContent = defaultContent.replace(/\s*data-layout=["'][^"']*["']/gi, '');
    
    // Remove html, head, body tags if present to extract just content
    defaultContent = defaultContent.replace(/<\/?(?:html|head|body)[^>]*>/gi, '');
    
    // Remove the outer wrapper div/element if it exists (e.g., <div data-layout="...">)
    const wrapperMatch = defaultContent.match(/^<[^>]*>([\s\S]*)<\/[^>]*>$/);
    if (wrapperMatch) {
      defaultContent = wrapperMatch[1];
    }
    
    defaultContent = defaultContent.trim();
    if (defaultContent) {
      slots['default'] = defaultContent;
    }
  }
  
  return {
    slots,
    styles: extractedStyles,
    scripts: extractedScripts
  };
}

/**
 * Apply slot content to layout using string replacement (consolidated implementation)
 * @param {string} layoutContent - Layout HTML content
 * @param {Object} slotData - Slot data to apply
 * @returns {string} Layout with slots replaced
 */
function applySlots(layoutContent, slotData) {
  let result = layoutContent;
  
  // Replace named slots
  for (const [slotName, content] of Object.entries(slotData)) {
    if (slotName === 'default') continue;
    
    const slotRegex = new RegExp(`<slot\\s+name=["']${slotName}["'][^>]*>.*?</slot>`, 'gi');
    const simpleSlotRegex = new RegExp(`<slot\\s+name=["']${slotName}["'][^>]*\\s*/?>`, 'gi');
    
    result = result.replace(slotRegex, content);
    result = result.replace(simpleSlotRegex, content);
  }
  
  // Replace default slot
  const defaultSlotRegex = /<slot(?:\s+[^>]*)?>(.*?)<\/slot>/gi;
  const defaultSlotSelfClosing = /<slot(?:\s+[^>]*)?\/>/gi;
  
  result = result.replace(defaultSlotRegex, slotData.default || '$1');
  result = result.replace(defaultSlotSelfClosing, slotData.default || '');
  
  // Replace any remaining named slots with their default content
  result = result.replace(
    /<slot\s+name=["'][^"']*["'][^>]*>(.*?)<\/slot>/gs,
    '$1' // Replace with the default content (everything between slot tags)
  );
  
  // Replace any remaining self-closing named slots (remove them since no default content)
  result = result.replace(
    /<slot\s+name=["'][^"']*["'][^>]*\/>/g,
    '' // Remove self-closing slots with no content
  );

  // Replace any remaining unnamed default slots with their content or remove them
  result = result.replace(
    /<slot(?!\s+name)(?:\s[^>]*)?>([^<]*(?:<(?!\/slot>)[^<]*)*)<\/slot>/gs,
    '$1' // Replace with default content
  );
  
  result = result.replace(
    /<slot(?!\s+name)(?:\s[^>]*)?\/>/g,
    '' // Remove self-closing default slots with no content
  );
  
  return result;
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
    // Check for layout attribute using regex parsing
    const layoutMatch = htmlContent.match(/data-layout=["']([^"']+)["']/i);
    if (layoutMatch) {
      const layoutAttr = layoutMatch[1];
      try {
        return await processLayoutAttribute(
          htmlContent,
          layoutAttr,
          filePath,
          sourceRoot,
          config,
          extractedAssets  // Pass extracted assets
        );
      } catch (error) {
        // In perfection mode, fail fast on layout errors
        if (config.perfection) {
          throw new Error(`Layout not found in perfection mode for ${path.relative(sourceRoot, filePath)}: ${error.message}`);
        }
        // Graceful degradation: if specific layout is missing, log warning and return original content
        logger.warn(`Layout not found for ${path.relative(sourceRoot, filePath)}: ${error.message}`);
        // Remove data-layout attribute from content to avoid reprocessing
        const contentWithoutLayout = htmlContent.replace(/\s*data-layout=["'][^"']*["']/gi, '');
        return contentWithoutLayout;
      }
    }

    // Check if no html tag exists, apply the default layout
    if (!htmlContent.includes("<html")) {
      // If no html tag, we assume a default layout is needed
      try {
        return await processLayoutAttribute(
          htmlContent,
          config.defaultLayout,  // Just pass the filename, not the full path
          filePath,
          sourceRoot,
          config,
          extractedAssets  // Pass extracted assets
        );
      } catch (error) {
        // For default layouts, always gracefully degrade (even in perfection mode)
        // since they are implicit/automatic, not explicitly requested by the user
        logger.warn(`Default layout not found for ${path.relative(sourceRoot, filePath)}: ${error.message}`);
        return `<!DOCTYPE html>
<html>
<head>
  <title>Page</title>
</head>
<body>
${htmlContent}
</body>
</html>`;
      }
    }

    // If no layout, process any standalone slots
    if (htmlContent.includes("<slot")) {
      return processStandaloneSlots(htmlContent);
    }

    return htmlContent;
  } catch (error) {
    throw new ComponentError(
      filePath,
      `DOM templating processing failed: ${error.message}`,
      filePath
    );
  }
}

/**
 * Process layout attribute functionality
 * @param {string} pageContent - Page HTML content
 * @param {string} layoutPath - Layout file path from data-layout attribute
 * @param {string} filePath - Current file path
 * @param {string} sourceRoot - Source root directory
 * @param {Object} config - Processing configuration
 * @returns {Promise<string>} Processed HTML with layout applied
 */
async function processLayoutAttribute(
  pageContent,
  layoutPath,
  filePath,
  sourceRoot,
  config,
  extractedAssets = { styles: [], scripts: [] }
) {
  // Resolve layout path
  let resolvedLayoutPath;
  
  if (layoutPath.startsWith("/")) {
    // Absolute path from source root
    resolvedLayoutPath = path.join(sourceRoot, layoutPath.substring(1));
  } else if (layoutPath.includes('/')) {
    // Path with directory structure, relative to source root
    resolvedLayoutPath = path.join(sourceRoot, layoutPath);
  } else {
    // Bare filename, relative to layouts directory
    if (path.isAbsolute(config.layoutsDir)) {
      // layoutsDir is absolute path (from CLI)
      resolvedLayoutPath = path.join(config.layoutsDir, layoutPath);
    } else {
      // layoutsDir is relative path (default or relative)
      resolvedLayoutPath = path.join(sourceRoot, config.layoutsDir, layoutPath);
    }
  }

  // Security check - allow layouts in configured layouts directory or within source root
  const layoutsBaseDir = path.isAbsolute(config.layoutsDir) 
    ? config.layoutsDir 
    : path.join(sourceRoot, config.layoutsDir);
    
  if (!isPathWithinDirectory(resolvedLayoutPath, sourceRoot) && 
      !isPathWithinDirectory(resolvedLayoutPath, layoutsBaseDir)) {
    throw new LayoutError(
      resolvedLayoutPath,
      `Layout path outside allowed directories: ${layoutPath}`,
      [layoutsBaseDir, path.join(sourceRoot, config.layoutsDir)]
    );
  }

  // Load layout content
  let layoutContent;
  try {
    layoutContent = await fs.readFile(resolvedLayoutPath, "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new LayoutError(
        resolvedLayoutPath,
        `Layout file not found: ${layoutPath}`,
        [path.join(sourceRoot, config.layoutsDir)]
      );
    }
    throw new FileSystemError("read", resolvedLayoutPath, error);
  }

  // Process includes in the layout content first
  layoutContent = await processIncludes(
    layoutContent,
    resolvedLayoutPath,
    sourceRoot,
    new Set(),
    0,
    null // No dependency tracker needed for layout processing
  );

  // Check if the layout itself has a data-layout attribute (nested layouts)
  // Process this BEFORE applying slots to avoid content overwriting layout attributes
  const nestedLayoutMatch = layoutContent.match(/data-layout=["']([^"']+)["']/i);
  if (nestedLayoutMatch) {
    const nestedLayoutPath = nestedLayoutMatch[1];
    console.log(`DEBUG: Found nested layout in ${layoutPath}: ${nestedLayoutPath}`);
    // Recursively process the nested layout, but pass the current slot data as page content
    const slotResult = extractSlotDataFromHTML(pageContent);
    const layoutWithSlots = applySlots(layoutContent, slotResult.slots);
    
    // Now process the nested layout with the slot-applied content as the page content
    return await processLayoutAttribute(
      layoutWithSlots,
      nestedLayoutPath,
      resolvedLayoutPath, // Use current layout as the source file for nested layout resolution
      sourceRoot,
      config,
      extractedAssets  // Pass assets to nested layout
    );
  }

  // Extract slot data from page content using regex-based parsing and apply to layout
  const slotResult = extractSlotDataFromHTML(pageContent);
  
  // Combine extracted assets from component and page
  const allExtractedAssets = {
    styles: [...(extractedAssets?.styles || []), ...slotResult.styles],
    scripts: [...(extractedAssets?.scripts || []), ...slotResult.scripts]
  };
  
  // Inject extracted assets into layout before applying slots
  let finalLayout = layoutContent;
  if (allExtractedAssets.styles.length > 0 || allExtractedAssets.scripts.length > 0) {
    // Inject styles into head (before </head>)
    if (allExtractedAssets.styles.length > 0) {
      const headEndRegex = /<\/head>/i;
      const dedupedStyles = [...new Set(allExtractedAssets.styles)]; // Remove duplicates
      const stylesHTML = dedupedStyles.join('\n');
      finalLayout = finalLayout.replace(headEndRegex, `${stylesHTML}\n</head>`);
    }
    
    // Inject scripts into end of body (before </body>)
    if (allExtractedAssets.scripts.length > 0) {
      const bodyEndRegex = /<\/body>/i;
      const dedupedScripts = [...new Set(allExtractedAssets.scripts)]; // Remove duplicates
      const scriptsHTML = dedupedScripts.join('\n');
      finalLayout = finalLayout.replace(bodyEndRegex, `${scriptsHTML}\n</body>`);
    }
  }
  
  return applySlots(finalLayout, slotResult.slots);
}

/**
 * Process standalone slots (slots without template extends)
 * @param {string} htmlContent - HTML content with slots
 * @returns {string} Processed HTML
 */
function processStandaloneSlots(htmlContent) {
  // For standalone slots, we just remove empty slot elements
  // This handles cases where slots exist but no template is extending
  return htmlContent
    .replace(/<slot[^>]*><\/slot>/gs, "")
    .replace(/<slot[^>]*\/>/g, "");
}
}

/**
 * Get default configuration for unified processing
 * @param {Object} userConfig - User-provided configuration
 * @returns {Object} Complete configuration object
 */
export function getUnifiedConfig(userConfig = {}) {
  let config = {
    componentsDir: userConfig.components || ".components",
    layoutsDir: userConfig.layouts || ".layouts", 
    defaultLayout: "default.html",
    ...userConfig,
  };
  
  // Ensure componentsDir and layoutsDir are absolute paths if they don't start with '.'
  if (config.componentsDir && !path.isAbsolute(config.componentsDir) && !config.componentsDir.startsWith('.')) {
    config.componentsDir = path.resolve(config.componentsDir);
  }
  
  if (config.layoutsDir && !path.isAbsolute(config.layoutsDir) && !config.layoutsDir.startsWith('.')) {
    config.layoutsDir = path.resolve(config.layoutsDir);
  }
  
  // Also set components and layouts for compatibility with isPartialFile
  config.components = config.componentsDir;
  config.layouts = config.layoutsDir;
  
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
  return await optimizeHtmlContent(htmlContent);
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

  // Check if HTMLRewriter is available
  if (!hasFeature('htmlRewriter')) {
    logger.debug('HTMLRewriter not available, skipping HTML metadata extraction');
    return metadata;
  }

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
  rewriter.transform(response);
  
  return metadata;
}

/**
 * Extract component assets (styles and scripts) and relocate them appropriately
 * Styles go to head, scripts go to end of body
 * @param {string} htmlContent - HTML content to process
 * @param {Object} extractedAssets - Assets extracted during include processing
 * @returns {string} HTML content with assets relocated
 */
async function extractAndRelocateComponentAssets(htmlContent, extractedAssets = { styles: [], scripts: [] }) {
  // Check if this is a complete HTML document or just a fragment
  const hasHtmlStructure = htmlContent.includes('<html') && htmlContent.includes('<head') && htmlContent.includes('<body');
  
  if (!hasHtmlStructure) {
    // Fragment - just return as-is (layouts will handle asset relocation)
    return htmlContent;
  }

  // Only extract content assets if we have extracted assets from DOM includes
  // This preserves SSI behavior (inline assets) while supporting DOM include asset relocation
  let contentStyles = [];
  let contentScripts = [];
  
  if (extractedAssets.styles.length > 0 || extractedAssets.scripts.length > 0) {
    // We have DOM include assets, so also extract content assets
    const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi;
    const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>/gi;
    
    contentStyles = [...htmlContent.matchAll(styleRegex)].map(match => match[0]);
    contentScripts = [...htmlContent.matchAll(scriptRegex)].map(match => match[0]);
  }
  
  // Combine content assets with extracted assets from includes
  const allStyles = [...extractedAssets.styles, ...contentStyles];
  const allScripts = [...extractedAssets.scripts, ...contentScripts];
  
  // If no styles or scripts to relocate, return as-is
  if (allStyles.length === 0 && allScripts.length === 0) {
    return htmlContent;
  }
  
  // Remove styles and scripts from their current locations in content (only if we extracted them)
  let processedContent = htmlContent;
  if (contentStyles.length > 0) {
    const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi;
    processedContent = processedContent.replace(styleRegex, '');
  }
  if (contentScripts.length > 0) {
    const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>/gi;
    processedContent = processedContent.replace(scriptRegex, '');
  }
  
  // Add styles to head (before </head>)
  if (allStyles.length > 0) {
    const headEndRegex = /<\/head>/i;
    const dedupedStyles = [...new Set(allStyles)]; // Remove duplicates
    const stylesHTML = dedupedStyles.join('\n');
    processedContent = processedContent.replace(headEndRegex, `${stylesHTML}\n</head>`);
  }
  
  // Add scripts to end of body (before </body>)
  if (allScripts.length > 0) {
    const bodyEndRegex = /<\/body>/i;
    const dedupedScripts = [...new Set(allScripts)]; // Remove duplicates  
    const scriptsHTML = dedupedScripts.join('\n');
    processedContent = processedContent.replace(bodyEndRegex, `${scriptsHTML}\n</body>`);
  }
  
  return processedContent;
}
