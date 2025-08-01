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
    const slotData = extractSlotDataFromHTML(pageContent);
    const layoutWithSlots = applySlots(layoutContent, slotData);
    
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
    
    // Process includes with the main include processor
    let processedContent = await processIncludesWithStringReplacement(
      htmlContent,
      filePath,
      sourceRoot,
      processingConfig,
      new Set() // Initialize call stack for circular dependency detection
    );
    
    // Handle layouts and slots if needed
    if (shouldUseDOMMode(processedContent)) {
      processedContent = await processDOMMode(
        processedContent,
        filePath,
        sourceRoot,
        processingConfig
      );
    } else if (
      hasDOMTemplating(processedContent) ||
      !processedContent.includes("<html")
    ) {
      processedContent = await processDOMTemplating(
        processedContent,
        filePath,
        sourceRoot,
        processingConfig
      );
    }
    
    // Apply HTML optimization if enabled
    if (processingConfig.optimize !== false) {
      logger.debug(`Optimizing HTML content, optimize=${processingConfig.optimize}`);
      processedContent = await optimizeHtmlContent(processedContent);
    } else {
      logger.debug(`Skipping HTML optimization, optimize=${processingConfig.optimize}`);
    }
    
    return processedContent;
  } catch (error) {
    logger.error(
      `Unified HTML processing failed for ${path.relative(
        sourceRoot,
        filePath
      )}: ${error.message}`
    );
    throw error; // Re-throw with original error details
  }
}

/**
 * Process includes using string replacement (more reliable for async operations)
 */
async function processIncludesWithStringReplacement(htmlContent, filePath, sourceRoot, config = {}, callStack = new Set()) {
  let processedContent = htmlContent;
  
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
      const nestedProcessedContent = await processIncludesWithStringReplacement(includeContent, resolvedPath, sourceRoot, config, newCallStack);
      
      // Replace all occurrences of this include
      processedContent = processedContent.replace(new RegExp(escapeRegExp(fullMatch), 'g'), nestedProcessedContent);
      logger.debug(`Processed include: ${includePath} -> ${resolvedPath}`);
    } catch (error) {
      // Convert file not found errors to IncludeNotFoundError with helpful suggestions
      if (error.code === 'ENOENT' && !error.formatForCLI) {
        const resolvedPath = resolveIncludePathInternal(type, includePath, filePath, sourceRoot);
        error = new IncludeNotFoundError(includePath, filePath, [resolvedPath]);
      }
      // In perfection mode, fail fast on any include error
      if (config.perfection) {
        if (error instanceof CircularDependencyError || error instanceof PathTraversalError || error instanceof IncludeNotFoundError) {
          throw error; // Re-throw errors with helpful suggestions as-is
        }
        throw new Error(`Include not found in perfection mode: ${includePath} in ${filePath}`);
      }
      logger.warn(`Include not found: ${includePath} in ${filePath}`);
      processedContent = processedContent.replace(new RegExp(escapeRegExp(fullMatch), 'g'), `<!-- Include not found: ${includePath} -->`);
    }
  }
  
  // Process modern DOM includes
  const domIncludeRegex = /<include\s+src="([^"]+)"[^>]*><\/include>/g;
  while ((match = domIncludeRegex.exec(htmlContent)) !== null) {
    const [fullMatch, src] = match;
    
    try {
      const resolvedPath = resolveIncludePathInternal('file', src, filePath, sourceRoot);
      const includeContent = await fs.readFile(resolvedPath, 'utf-8');
      
      // Recursively process nested includes
      const nestedProcessedContent = await processIncludesWithStringReplacement(includeContent, resolvedPath, sourceRoot, config, newCallStack);
      
      processedContent = processedContent.replace(fullMatch, nestedProcessedContent);
      logger.debug(`Processed include element: ${src} -> ${resolvedPath}`);
    } catch (error) {
      // Convert file not found errors to IncludeNotFoundError with helpful suggestions
      if (error.code === 'ENOENT' && !error.formatForCLI) {
        const resolvedPath = resolveIncludePathInternal('file', src, filePath, sourceRoot);
        error = new IncludeNotFoundError(src, filePath, [resolvedPath]);
      }
      // In perfection mode, fail fast on any include error
      if (config.perfection) {
        if (error instanceof CircularDependencyError || error instanceof PathTraversalError || error instanceof IncludeNotFoundError) {
          throw error; // Re-throw errors with helpful suggestions as-is
        }
        throw new Error(`Include element not found in perfection mode: ${src} in ${filePath}`);
      }
      logger.warn(`Include element not found: ${src} in ${filePath}`);
      processedContent = processedContent.replace(fullMatch, `<!-- Include not found: ${src} -->`);
    }
  }
  
  return processedContent;
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Process SSI include directive
 */
async function processIncludeDirective(comment, type, includePath, filePath, sourceRoot, config, callStack = new Set()) {
  try {
    const resolvedPath = resolveIncludePathInternal(type, includePath, filePath, sourceRoot);
    const includeContent = await fs.readFile(resolvedPath, 'utf-8');
    
    // Recursively process nested includes in the included content
    const processedContent = await processIncludesWithStringReplacement(includeContent, resolvedPath, sourceRoot, config, callStack);
    
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
    const processedContent = await processIncludesWithStringReplacement(includeContent, resolvedPath, sourceRoot, config, callStack);
    
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
async function processDOMMode(pageContent, pagePath, sourceRoot, config = {}) {
  const domConfig = { 
    layoutsDir: '.layouts',
    componentsDir: '.components', 
    defaultLayout: 'default.html',
    sourceRoot, 
    ...config 
  };
  
  try {
    // Detect layout from HTML content using regex-based parsing
    let layoutPath;
    try {
      layoutPath = await detectLayoutFromHTML(pageContent, sourceRoot, domConfig);
      logger.debug(`Using layout: ${layoutPath}`);
    } catch (error) {
      // In perfection mode, fail fast on layout detection errors
      if (domConfig.perfection) {
        throw new Error(`Layout not found in perfection mode for ${path.relative(sourceRoot, pagePath)}: ${error.message}`);
      }
      // Graceful degradation: if layout cannot be found, return content wrapped in basic HTML
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
    
    // Load layout content as string
    let layoutContent;
    try {
      layoutContent = await fs.readFile(layoutPath, 'utf-8');
    } catch (error) {
      // In perfection mode, fail fast on layout file read errors
      if (domConfig.perfection) {
        throw new Error(`Layout file not found in perfection mode: ${layoutPath} - ${error.message}`);
      }
      // Graceful degradation: if layout file cannot be read, return content wrapped in basic HTML
      logger.warn(`Could not read layout file ${layoutPath}: ${error.message}`);
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
    
    // Extract slot content from page HTML using regex-based parsing
    const slotData = extractSlotDataFromHTML(pageContent);
    
    // Apply slots to layout using string replacement
    let processedHTML = applySlots(layoutContent, slotData);
    
    // Check if the layout itself has a data-layout attribute (nested layouts)
    const nestedLayoutMatch = layoutContent.match(/data-layout=["']([^"']+)["']/i);
    if (nestedLayoutMatch) {
      const nestedLayoutPath = nestedLayoutMatch[1];
      // Recursively process the nested layout using DOM mode
      return await processDOMMode(processedHTML, layoutPath, sourceRoot, domConfig);
    }
    
    // Process includes in the result
    processedHTML = await processIncludesInHTML(processedHTML, layoutPath, sourceRoot, domConfig);
    
    return processedHTML;
    
  } catch (error) {
    if (error.formatForCLI) {
      logger.error(error.formatForCLI());
    } else {
      logger.error(`DOM processing failed for ${pagePath}: ${error.message}`);
    }
    throw new FileSystemError('dom-process', pagePath, error);
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
    null // No dependency tracker needed
  );
  
  // Then process <include> elements if any remain
  const includeRegex = /<include\s+([^>]+)\/?\s*>/gi;
  const allStyles = [];
  const allScripts = [];
  
  // Process includes recursively until no more are found
  let hasIncludes = true;
  let depth = 0;
  const maxDepth = 10; // Prevent infinite recursion
  
  while (hasIncludes && depth < maxDepth) {
    const matches = [...result.matchAll(includeRegex)];
    hasIncludes = matches.length > 0;
    depth++;
    
    for (const match of matches) {
      try {
        const includeTag = match[0];
        const attributes = match[1];
        
        // Parse src attribute
        const srcMatch = attributes.match(/src=["']([^"']+)["']/);
        if (!srcMatch) continue;
        
        const src = srcMatch[1];
        
        // Load and process component
        const componentResult = await loadAndProcessComponent(src, {}, sourceRoot, config);
        
        // Collect styles and scripts
        allStyles.push(...componentResult.styles);
        allScripts.push(...componentResult.scripts);
        
        // Replace include tag with component content
        result = result.replace(includeTag, componentResult.content);
        
      } catch (error) {
        if (error.formatForCLI) {
          logger.error(error.formatForCLI());
        } else {
          logger.error(`Failed to process include: ${error.message}`);
        }
        result = result.replace(match[0], `<!-- Error: ${error.message} -->`);
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
    
    // Remove script and style elements
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
  
  return slots;
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
async function processDOMTemplating(htmlContent, filePath, sourceRoot, config) {
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
          config
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
          config
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
  config
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
    const slotData = extractSlotDataFromHTML(pageContent);
    const layoutWithSlots = applySlots(layoutContent, slotData);
    
    // Now process the nested layout with the slot-applied content as the page content
    return await processLayoutAttribute(
      layoutWithSlots,
      nestedLayoutPath,
      resolvedLayoutPath, // Use current layout as the source file for nested layout resolution
      sourceRoot,
      config
    );
  }

  // Extract slot data from page content using regex-based parsing and apply to layout
  const slotData = extractSlotDataFromHTML(pageContent);
  return applySlots(layoutContent, slotData);
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
