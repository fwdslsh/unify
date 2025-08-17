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
import { transformLinksInHtml } from "../utils/link-transformer.js";
import { resolveIncludePath, isPathWithinDirectory } from "../utils/path-resolver.js";

/**
 * Read an include file with sensible fallback locations.
 * Tries the resolvedPath first, then sourceRoot-relative and _includes/basename.
 */
async function readIncludeWithFallback(resolvedPath, src, filePath, sourceRoot) {
  try {
    return { content: await fs.readFile(resolvedPath, 'utf-8'), resolvedPath };
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
        return { content, resolvedPath: candidate };
      } catch (e) {
        // continue to next candidate
      }
    }

    // No candidate found; re-throw original error for upstream handling
    throw err;
  }
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
 * Process HTML content with unified support for both SSI includes and DOM templating
 * Uses HTMLRewriter for high-performance processing
 * @param {string} htmlContent - Raw HTML content to process
   // Check if the layout itself has a data-layout attribute (nested layouts)
  const nestedLayoutMatch = layoutContent.match(/data-layout=["']([^"']+)["']/i);
  if (nestedLayoutMatch) {
    const nestedLayoutPath = nestedLayoutMatch[1];
    // Recursively process the nested layout, but pass the current slot data as page content
    const slotResult = extractSlotDataFromHTML(pageContent);
    const slotApplication = applySlots(layoutContent, slotResult.slots, config);
    const layoutWithSlots = slotApplication.result;
    
    // Log any slot warnings
    if (slotApplication.warnings.length > 0) {
      slotApplication.warnings.forEach(warning => {
        logger.warn(`Slot validation: ${warning.message}`);
      });
    }
    
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
    layoutsDir: ".layouts", // Deprecated but kept for compatibility
    optimize: config.minify || config.optimize,
    ...config,
  };

  try {
    logger.debug(
      `Using HTMLRewriter for: ${path.relative(sourceRoot, filePath)}`
    );
    
    // Track dependencies before processing
    if (dependencyTracker) {
      await dependencyTracker.analyzePage(filePath, htmlContent, sourceRoot);
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
    } else if (extractedAssets && (extractedAssets.styles?.length > 0 || extractedAssets.scripts?.length > 0)) {
      // Apply extracted assets to complete HTML documents even without layouts/templating
      processedContent = applyExtractedAssets(processedContent, extractedAssets);
    }

    // Apply link normalization if pretty URLs are enabled
    if (processingConfig.prettyUrls) {
      logger.debug(`Normalizing links for pretty URLs in ${path.relative(sourceRoot, filePath)}`);
      processedContent = transformLinksInHtml(processedContent, filePath, sourceRoot);
    }

  // Slot/template injection for HTML files (if layout contains <slot> or <template slot="...">)
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
      // In fail-fast mode, fail fast on any include error
      if (shouldFailFast(config, 'error')) {
        // Always throw BuildError for any include error in fail-fast mode
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
  const domIncludeRegex = /<include\s+src="([^"]+)"[^>]*>([\s\S]*?)<\/include>/g;
  const selfClosingIncludeRegex = /<include\s+src="([^"]+)"[^>]*\/>/g;
  let depth = 0;
  const maxDepth = 10;
  let hasDomIncludes = true;
  while (hasDomIncludes && depth < maxDepth) {
    domIncludeRegex.lastIndex = 0;
    selfClosingIncludeRegex.lastIndex = 0;
    
    // Process includes with children (slot injection)
    let domMatches = [...processedContent.matchAll(domIncludeRegex)];
    // Process self-closing includes (no slot injection)
    let selfClosingMatches = [...processedContent.matchAll(selfClosingIncludeRegex)];
    
    hasDomIncludes = domMatches.length > 0 || selfClosingMatches.length > 0;
    depth++;
    
    // Process includes with slot content
    for (const domMatch of domMatches) {
      const [fullMatch, src, slotContent] = domMatch;
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
        
        // Read the include content using fallback resolver
        try {
          const fsSync = require('fs');
          logger.info(`Include (with slots) attempt: resolvedPath=${resolvedPath}, exists=${fsSync.existsSync(resolvedPath)}, sourceRoot=${sourceRoot}`);
        } catch (e) {}
        const { content: includeContentRaw, resolvedPath: actualResolved } = await readIncludeWithFallback(resolvedPath, src, filePath, sourceRoot);
        let includeContent = includeContentRaw;
        resolvedPath = actualResolved;
        
        // Extract assets from the component content for DOM includes
        const componentAssets = extractComponentAssets(includeContent);
        includeContent = componentAssets.content;
        extractedAssets.styles.push(...componentAssets.assets.styles);
        extractedAssets.scripts.push(...componentAssets.assets.scripts);
        
        // Process slot injection if slot content is provided
        if (slotContent && slotContent.trim()) {
          includeContent = applySlotInjectionToInclude(includeContent, slotContent);
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
        logger.debug(`Processed include element with slots: ${src} -> ${resolvedPath}`);
      } catch (error) {
        // Log error details for debugging
        try {
          console.error('DOM include (with slots) error:', error && error.stack ? error.stack : error);
        } catch (e) {}
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
        if (shouldFailFast(config, 'error')) {
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
    
    // Process self-closing includes (no slot injection)
    for (const selfClosingMatch of selfClosingMatches) {
      const [fullMatch, src] = selfClosingMatch;
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
        
        // Read the include content using fallback resolver
        try {
          const fsSync = require('fs');
          logger.info(`Self-closing include attempt: resolvedPath=${resolvedPath}, exists=${fsSync.existsSync(resolvedPath)}, sourceRoot=${sourceRoot}`);
        } catch (e) {}
        const { content: includeContentRaw, resolvedPath: actualResolved } = await readIncludeWithFallback(resolvedPath, src, filePath, sourceRoot);
        let includeContent = includeContentRaw;
        resolvedPath = actualResolved;
        
        // Extract assets from the component content for DOM includes
        const componentAssets = extractComponentAssets(includeContent);
        includeContent = componentAssets.content;
        extractedAssets.styles.push(...componentAssets.assets.styles);
        extractedAssets.scripts.push(...componentAssets.assets.scripts);
        
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
        logger.debug(`Processed self-closing include element: ${src} -> ${resolvedPath}`);
      } catch (error) {
        // Log error details for debugging
        try {
          console.error('Self-closing include error:', error && error.stack ? error.stack : error);
        } catch (e) {}
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
        if (shouldFailFast(config, 'error')) {
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
        logger.warn(`Self-closing include element not found: ${src} in ${errorFilePath}`);
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
    // In fail-fast mode, re-throw all build-stopping errors
    if (shouldFailFast(config, 'error') && (
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
 * Apply slot injection to included component content
 * @param {string} componentContent - The component HTML content with data-slot targets
 * @param {string} slotContent - The slot content provided within the include element
 * @returns {string} Component content with slots injected
 */
function applySlotInjectionToInclude(componentContent, slotContent) {
  // Extract slot providers from the include element's children
  const slotProviders = {};
  
  // Match elements with data-slot attributes
  const slotElementRegex = /<(\w+)([^>]*\s+data-slot=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;
  let hasExplicitSlots = false;
  
  while ((match = slotElementRegex.exec(slotContent)) !== null) {
    hasExplicitSlots = true;
    const [fullElement, tagName, attributes, slotName, innerContent] = match;
    // Store the full element content (with the wrapping element but without data-slot)
    const cleanedElement = fullElement.replace(/\s+data-slot=["'][^"']+["']/, '');
    slotProviders[slotName] = cleanedElement;
  }
  
  // If no explicit slot targeting was found, treat the entire content as default slot content
  if (!hasExplicitSlots && slotContent.trim()) {
    slotProviders['default'] = slotContent.trim();
  }
  
  // Apply slots to the component content
  let result = componentContent;
  
  // For each slot provider, find and replace the corresponding slot target in the component
  for (const [slotName, slotHtml] of Object.entries(slotProviders)) {
    // Find elements with data-slot="slotName" in the component and replace their entire element
    const targetSlotRegex = new RegExp(
      `<(\\w+)([^>]*\\s+data-slot=["']${escapeRegExp(slotName)}["'][^>]*)>[\\s\\S]*?<\\/\\1>`,
      'gi'
    );
    
    result = result.replace(targetSlotRegex, slotHtml);
  }
  
  // Final cleanup: Remove any remaining data-slot attributes from unused slots in the component
  result = result.replace(/\s+data-slot=["'][^"']+["']/g, '');
  
  return result;
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  
  // Add scripts to end of body (before </body>)
  if (extractedAssets.scripts && extractedAssets.scripts.length > 0) {
    const bodyEndRegex = /<\/body>/i;
    const dedupedScripts = [...new Set(extractedAssets.scripts)]; // Remove duplicates
    const scriptsHTML = dedupedScripts.join('\n');
    processedContent = processedContent.replace(bodyEndRegex, `${scriptsHTML}\n</body>`);
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
    // In fail-fast mode, fail fast on any include error
    if (shouldFailFast(config, 'error')) {
      throw new Error(`Include not found in fail-fast mode: ${src} in ${filePath}`);
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
 * Check if content should use DOM mode processing
 * @param {string} content - HTML content to check
 * @returns {boolean} True if content has DOM mode features
 */
function shouldUseDOMMode(content) {
  return content.includes('<include ') || 
         content.includes('data-slot=') || 
         content.includes('data-layout=') ||
         content.includes('rel="layout"');
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
    layoutsDir: '.layouts', // Deprecated but kept for compatibility
    componentsDir: '.components', 
    sourceRoot, 
    ...config 
  };

  // Analyze HTML structure
  const htmlStructure = analyzeHtmlStructure(pageContent);
  
  // Validate data-layout attributes for fragments early
  validateDataLayoutAttributes(pageContent, htmlStructure.isFullDocument);
  
  // Check for explicit layout indicators
  const layoutMatch = pageContent.match(/data-layout=["']([^"']+)["']/i);
  const linkLayoutHref = htmlStructure.isFullDocument ? extractLinkLayoutHref(pageContent) : null;
  const hasExplicitLayout = !!layoutMatch || !!linkLayoutHref;

  // For complete HTML documents without explicit layout, don't apply any layout
  if (htmlStructure.isFullDocument && !hasExplicitLayout) {
    logger.debug(`Skipping layout for complete HTML document: ${path.relative(sourceRoot, pagePath)}`);
    return pageContent;
  }

  // Use the same layout processing logic as processDOMTemplating
  const layoutSpec = linkLayoutHref || (layoutMatch ? layoutMatch[1] : null);
  
  if (layoutSpec) {
    try {
      return await processLayoutAttribute(
        pageContent,
        layoutSpec,
        pagePath,
        sourceRoot,
        domConfig,
        extractedAssets
      );
    } catch (error) {
      // In fail-fast mode, fail fast on layout detection errors
      if (shouldFailFast(domConfig, 'error')) {
        throw new Error(`Layout not found in fail-fast mode for ${path.relative(sourceRoot, pagePath)}: ${error.message}`);
      }
      // Graceful degradation: if specific layout is missing, log warning and continue with discovery
      logger.warn(`Layout not found for ${path.relative(sourceRoot, pagePath)}: ${error.message}`);
    }
  }

  // Fall back to layout discovery
  let layoutPath;
  try {
    layoutPath = await detectLayoutFromHTML(pageContent, sourceRoot, domConfig, pagePath);
    logger.debug(`Using discovered layout: ${layoutPath}`);
    
    // Use processLayoutAttribute for consistent processing
    const relativeLayoutPath = path.relative(path.dirname(pagePath), layoutPath);
    return await processLayoutAttribute(
      pageContent,
      relativeLayoutPath,
      pagePath,
      sourceRoot,
      domConfig,
      extractedAssets
    );
    
  } catch (error) {
    // Use shouldFailFast to determine whether to throw or warn
    if (shouldFailFast(domConfig, 'error')) {
      throw new Error(`Layout not found for ${path.relative(sourceRoot, pagePath)}: ${error.message}`);
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
 * Extract link rel=layout from HTML head element
 * @param {string} htmlContent - HTML content to search
 * @returns {string|null} Layout href value or null if not found
 */
function extractLinkLayoutHref(htmlContent) {
  // Only look in head section for link rel=layout
  const headMatch = htmlContent.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) {
    return null;
  }
  
  const headContent = headMatch[1];
  const linkMatch = headContent.match(/<link[^>]+rel=["']layout["'][^>]*>/i);
  if (!linkMatch) {
    return null;
  }
  
  const hrefMatch = linkMatch[0].match(/href=["']([^"']+)["']/i);
  return hrefMatch ? hrefMatch[1] : null;
}

/**
 * Validate data-layout attributes in fragments
 * @param {string} htmlContent - HTML content to validate
 * @param {boolean} isFullDocument - Whether this is a full HTML document
 * @throws {Error} If multiple data-layout attributes found in fragment
 */
function validateDataLayoutAttributes(htmlContent, isFullDocument) {
  if (isFullDocument) {
    return; // Full documents can have data-layout in any element
  }
  
  // For fragments, count data-layout attributes
  const dataLayoutMatches = htmlContent.match(/data-layout=["'][^"']*["']/gi);
  if (dataLayoutMatches && dataLayoutMatches.length > 1) {
    throw new BuildError(
      'Fragment pages cannot have multiple data-layout attributes',
      [{ error: `Found ${dataLayoutMatches.length} data-layout attributes in fragment` }]
    );
  }
}

/**
 * Detect which layout to use for a page using regex-based HTML parsing
 */
async function detectLayoutFromHTML(htmlContent, sourceRoot, config, pagePath) {
  const htmlStructure = analyzeHtmlStructure(htmlContent);
  
  // For full HTML documents, check link rel=layout first (highest priority)
  if (htmlStructure.isFullDocument) {
    const linkLayoutHref = extractLinkLayoutHref(htmlContent);
    if (linkLayoutHref) {
      logger.debug(`Found link rel=layout: ${linkLayoutHref}`);
      
      const { LayoutDiscovery } = await import('./layout-discovery.js');
      const discovery = new LayoutDiscovery();
      
      const resolvedLayoutPath = await discovery.resolveLayoutOverride(linkLayoutHref, sourceRoot, pagePath);
      if (resolvedLayoutPath) {
        return resolvedLayoutPath;
      }
      
      throw new LayoutError(
        pagePath,
        `Layout not found via link rel=layout: ${linkLayoutHref}`,
        [sourceRoot]
      );
    }
  }
  
  // Look for data-layout attribute in HTML content (lower priority)
  const layoutMatch = htmlContent.match(/data-layout=["']([^"']+)["']/i);
  
  if (layoutMatch) {
    const layoutAttr = layoutMatch[1];
    
    // Use LayoutDiscovery system for both full paths and short names
    const { LayoutDiscovery } = await import('./layout-discovery.js');
    const discovery = new LayoutDiscovery();
    
    const resolvedLayoutPath = await discovery.resolveLayoutOverride(layoutAttr, sourceRoot, pagePath);
    if (resolvedLayoutPath) {
      return resolvedLayoutPath;
    }
    
    // If layout override resolution failed, throw error
    throw new LayoutError(
      pagePath,
      `Layout not found: ${layoutAttr}`,
      [sourceRoot]
    );
  }
  
  // Fall back to discovered layout using LayoutDiscovery
  const { LayoutDiscovery } = await import('./layout-discovery.js');
  const discovery = new LayoutDiscovery();
  return await discovery.findLayoutForPage(pagePath, sourceRoot);
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
    shouldFailFast(config)
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
        if (shouldFailFast(config, 'error')) {
          if (error instanceof CircularDependencyError || error instanceof PathTraversalError || error instanceof IncludeNotFoundError) {
            throw error;
          }
          throw new Error('Include element not found in fail-fast mode: ' + src + ' in ' + layoutPath);
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
  // Check for data-slot attributes, template elements, or layout attributes
  return (
    content.includes("data-slot=") ||
    content.includes("<template") ||
    content.includes("data-layout=") ||
    content.includes('rel="layout"')
  );
}

/**
 * Extract slot content from HTML using regex-based parsing (v0.5.0 spec-compliant)
 * Supports both <template data-slot="name"> and regular elements with data-slot="name" attribute
 * @param {string} htmlContent - HTML content to extract slots from
 * @returns {Object} Object with slots, styles, scripts, and slot metadata
 */
function extractSlotDataFromHTML(htmlContent) {
  const slots = {};
  const slotOrder = {}; // Track document order for multiple assignments
  const extractedStyles = [];
  const extractedScripts = [];
  
  let match;
  let orderIndex = 0;

  // Extract named slots with data-slot attribute on template elements
  const templateSlotRegex = /<template[^>]+data-slot=["']([^"']+)["'][^>]*>([\s\S]*?)<\/template>/gi;
  while ((match = templateSlotRegex.exec(htmlContent)) !== null) {
    const slotName = match[1];
    const content = match[2];
    if (!slots[slotName]) {
      slots[slotName] = [];
      slotOrder[slotName] = [];
    }
    slots[slotName].push(content);
    slotOrder[slotName].push(orderIndex++);
  }
  
  // Extract named slots with data-slot attribute on regular elements
  // Use a more robust regex that handles data-slot attribute anywhere in the tag
  const elementSlotRegex = /<(\w+)([^>]*\s+data-slot=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1>/gi;
  while ((match = elementSlotRegex.exec(htmlContent)) !== null) {
    const tagName = match[1];
    const slotName = match[3]; // slot name is now in group 3
    const fullElement = match[0];
    
    // Skip template elements (already handled above)
    if (tagName.toLowerCase() === 'template') continue;
    
    if (!slots[slotName]) {
      slots[slotName] = [];
      slotOrder[slotName] = [];
    }
    // Remove the data-slot attribute from the element when adding to slot
    const cleanedElement = fullElement.replace(/\s+data-slot=["'][^"']+["']/, '');
    slots[slotName].push(cleanedElement);
    slotOrder[slotName].push(orderIndex++);
  }
  
  // Extract default slot content from template without data-slot attributes
  const defaultTemplateRegex = /<template(?!\s+data-slot=)[^>]*>([\s\S]*?)<\/template>/gi;
  match = defaultTemplateRegex.exec(htmlContent);
  if (match) {
    if (!slots['default']) {
      slots['default'] = [];
      slotOrder['default'] = [];
    }
    slots['default'].push(match[1]);
    slotOrder['default'].push(orderIndex++);
  } else {
    // Extract default slot content (everything not in a template or with data-slot attribute)
    let defaultContent = htmlContent;
    
    // Remove all template elements
    defaultContent = defaultContent.replace(/<template[^>]*>[\s\S]*?<\/template>/gi, '');
    
    // Remove all elements with data-slot attribute
    defaultContent = defaultContent.replace(/<(\w+)([^>]*\s+data-slot=["'][^"']+["'][^>]*)>([\s\S]*?)<\/\1>/gi, '');
    
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
      if (!slots['default']) {
        slots['default'] = [];
        slotOrder['default'] = [];
      }
      slots['default'].push(defaultContent);
      slotOrder['default'].push(orderIndex++);
    }
  }
  
  // Convert slot arrays to strings, preserving document order
  const consolidatedSlots = {};
  for (const [slotName, contents] of Object.entries(slots)) {
    if (contents.length === 1) {
      consolidatedSlots[slotName] = contents[0];
    } else if (contents.length > 1) {
      // Multiple assignments to same slot - preserve document order
      const orderedContents = contents
        .map((content, idx) => ({ content, order: slotOrder[slotName][idx] }))
        .sort((a, b) => a.order - b.order)
        .map(item => item.content);
      consolidatedSlots[slotName] = orderedContents.join('\n');
    }
  }
  
  return {
    slots: consolidatedSlots,
    styles: extractedStyles,
    scripts: extractedScripts,
    hasMultipleAssignments: Object.values(slots).some(arr => arr.length > 1)
  };
}

/**
 * Apply slot content to layout using string replacement (v0.5.0 spec-compliant)
 * Properly handles fallback content and validation warnings
 * @param {string} layoutContent - Layout HTML content
 * @param {Object} slotData - Slot data to apply
 * @param {Object} config - Configuration for validation
 * @returns {Object} Object with result HTML and validation warnings
 */
function applySlots(layoutContent, slotData, config = {}) {
  let result = layoutContent;
  const warnings = [];
  const usedSlots = new Set();
  
  // Find all data-slot names in the layout for validation
  const layoutSlotNames = new Set();
  const slotNameRegex = /data-slot=["']([^"']+)["']/gi;
  let match;
  while ((match = slotNameRegex.exec(layoutContent)) !== null) {
    layoutSlotNames.add(match[1]);
  }
  
  // Check for unmatched slot names in page content
  for (const slotName of Object.keys(slotData)) {
    if (slotName !== 'default' && !layoutSlotNames.has(slotName)) {
      warnings.push({
        type: 'unmatched-slot',
        message: `Page defines slot "${slotName}" but layout has no matching data-slot="${slotName}"`
      });
    }
  }
  
  // Replace named slots with content or fallback
  for (const [slotName, content] of Object.entries(slotData)) {
    if (slotName === 'default') continue;
    
    // Find elements with data-slot="slotName" and replace their content
    // Use a more precise regex that matches the specific opening tag and its corresponding closing tag
    const namedSlotRegex = new RegExp(`(<(\\w+)([^>]*\\s+data-slot=["']${escapeRegex(slotName)}["'][^>]*)>)([\\s\\S]*?)(<\\/\\2>)`, 'gi');
    
    if (namedSlotRegex.test(result)) {
      usedSlots.add(slotName);
      // Reset regex lastIndex
      namedSlotRegex.lastIndex = 0;
      
      // Replace the content between opening and closing tags and remove data-slot attribute
      result = result.replace(namedSlotRegex, (match, openingTag, tagName, attributes, oldContent, closingTag) => {
        // Remove the data-slot attribute from the opening tag
        const cleanedAttributes = attributes.replace(/\s+data-slot=["'][^"']+["']/, '');
        const cleanedOpeningTag = `<${tagName}${cleanedAttributes}>`;
        return `${cleanedOpeningTag}${content}${closingTag}`;
      });
    }
  }
  
  // Replace default slot with content or fallback
  // Check if default content is meaningful (not just whitespace/comments)
  const hasMeaningfulDefaultContent = slotData.default && 
    slotData.default.replace(/<!--[\s\S]*?-->/g, '').trim().length > 0;
  
  // Look for data-slot="default" first
  const defaultSlotRegex = /(<(\w+)([^>]*\s+data-slot=["']default["'][^>]*)>)([\s\S]*?)(<\/\2>)/gi;
  const hasDefaultSlot = defaultSlotRegex.test(result);
  
  if (hasDefaultSlot && hasMeaningfulDefaultContent) {
    // Page has meaningful default content, replace default slot content
    defaultSlotRegex.lastIndex = 0;
    result = result.replace(defaultSlotRegex, (match, openingTag, tagName, attributes, oldContent, closingTag) => {
      // Remove the data-slot attribute from the opening tag
      const cleanedAttributes = attributes.replace(/\s+data-slot=["'][^"']+["']/, '');
      const cleanedOpeningTag = `<${tagName}${cleanedAttributes}>`;
      return `${cleanedOpeningTag}${slotData.default}${closingTag}`;
    });
  } else if (!hasDefaultSlot && hasMeaningfulDefaultContent) {
    // No data-slot="default" found, look for first <main> element as fallback
    const mainElementRegex = /(<main[^>]*>)([\s\S]*?)(<\/main>)/i;
    const hasMainElement = mainElementRegex.test(result);
    
    if (hasMainElement) {
      result = result.replace(mainElementRegex, `$1${slotData.default}$3`);
    } else {
      // No default slot or main element found
      warnings.push({
        type: 'missing-default-slot',
        message: 'Page has default content but layout has no data-slot="default" or <main> element'
      });
    }
  }
  
  // Final cleanup: Remove any remaining data-slot attributes from unused slots
  // This handles fallback content slots that were not replaced
  result = result.replace(/\s+data-slot=["'][^"']+["']/g, '');
  
  return {
    result,
    warnings,
    usedSlots: Array.from(usedSlots)
  };
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
    
    // Validate data-layout attributes for fragments early
    validateDataLayoutAttributes(htmlContent, htmlStructure.isFullDocument);
    
    // Check for layout indicators (link rel=layout has higher priority than data-layout)
    const linkLayoutHref = htmlStructure.isFullDocument ? extractLinkLayoutHref(htmlContent) : null;
    const layoutMatch = htmlContent.match(/data-layout=["']([^"']+)["']/i);
    
    const layoutSpec = linkLayoutHref || (layoutMatch ? layoutMatch[1] : null);
    
    if (layoutSpec) {
      try {
        return await processLayoutAttribute(
          htmlContent,
          layoutSpec,
          filePath,
          sourceRoot,
          config,
          extractedAssets  // Pass extracted assets
        );
      } catch (error) {
        // In fail-fast mode, fail fast on layout detection errors
        if (shouldFailFast(config, 'error')) {
          throw new Error(`Layout not found in fail-fast mode for ${path.relative(sourceRoot, filePath)}: ${error.message}`);
        }
        // Graceful degradation: if specific layout is missing, log warning and return original content
        logger.warn(`Layout not found for ${path.relative(sourceRoot, filePath)}: ${error.message}`);
        // Remove layout attributes from content to avoid reprocessing
        let contentWithoutLayout = htmlContent.replace(/\s*data-layout=["'][^"']*["']/gi, '');
        if (linkLayoutHref) {
          contentWithoutLayout = contentWithoutLayout.replace(/<link[^>]+rel=["']layout["'][^>]*>/gi, '');
        }
        return contentWithoutLayout;
      }
    }

    // Check if this is a fragment (no html tag), use layout discovery to find appropriate layout
    if (!htmlStructure.isFullDocument) {
      // Use the layout discovery system to find the best layout for this page
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
          // Fall through to basic HTML wrapper
        }
      }
      
      // No layout found, wrap in basic HTML structure and inject assets
      
      // Inject assets into basic HTML structure
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
      
      return `<!DOCTYPE html>
<html>
<head>
  <title>Page</title>${stylesHTML}
</head>
<body>
${htmlContent}${scriptsHTML}
</body>
</html>`;
    }

    // If no layout, process any standalone data-slot attributes
    if (htmlContent.includes("data-slot=")) {
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
  
  // 4. BODY: Extract slots from page body content and apply to layout
  const pageBodySlotResult = extractSlotDataFromHTML(pageParts.bodyContent);
  const bodySlots = { default: pageBodySlotResult.slots.default || pageParts.bodyContent, ...pageBodySlotResult.slots };
  
  // Extract layout body content and apply slots to it
  const layoutBodyMatch = layoutContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const layoutBodyContent = layoutBodyMatch ? layoutBodyMatch[1] : '';
  const layoutBodyTag = layoutBodyMatch ? layoutBodyMatch[0].match(/<body[^>]*>/i)?.[0] || '<body>' : '<body>';
  
  const slotApplication = applySlots(layoutBodyContent, bodySlots, config);
  
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
  const layoutIncludeResult = await processIncludesWithStringReplacement(
    layoutContent,
    resolvedLayoutPath,
    sourceRoot,
    config
  );
  
  // Extract layout content and any additional assets
  if (typeof layoutIncludeResult === 'object' && layoutIncludeResult.content !== undefined) {
    layoutContent = layoutIncludeResult.content;
    extractedAssets.styles.push(...layoutIncludeResult.styles);
    extractedAssets.scripts.push(...layoutIncludeResult.scripts);
  } else {
    layoutContent = layoutIncludeResult;
  }

  // Check if page is a full HTML document
  const pageStructure = analyzeHtmlStructure(pageContent);
  
  
  if (pageStructure.isFullDocument) {
    // Use HTML document merging for full documents
    const mergeResult = mergeHtmlDocumentWithLayout(pageContent, layoutContent, config);
    
    // Log any warnings
    if (mergeResult.warnings.length > 0) {
      mergeResult.warnings.forEach(warning => {
        logger.warn(`HTML document merge: ${warning.message}`);
      });
    }
    
    // Apply extracted assets
    let finalResult = mergeResult.result;
    if (extractedAssets && (extractedAssets.styles?.length > 0 || extractedAssets.scripts?.length > 0)) {
      finalResult = applyExtractedAssets(finalResult, extractedAssets);
    }
    
    return finalResult;
  }

  // Fragment processing (existing logic)
  // Check if the layout itself has a data-layout attribute (nested layouts)
  const nestedLayoutMatch = layoutContent.match(/data-layout=["']([^"']+)["']/i);
  if (nestedLayoutMatch) {
    const nestedLayoutPath = nestedLayoutMatch[1];
    logger.debug(`Found nested layout in ${layoutPath}: ${nestedLayoutPath}`);
    // Recursively process the nested layout, but pass the current slot data as page content
    const slotResult = extractSlotDataFromHTML(pageContent);
    const slotApplication = applySlots(layoutContent, slotResult.slots, config);
    const layoutWithSlots = slotApplication.result;
    
    // Log any slot warnings
    if (slotApplication.warnings.length > 0) {
      slotApplication.warnings.forEach(warning => {
        logger.warn(`Slot validation: ${warning.message}`);
      });
    }
    
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
  
  const slotApplication = applySlots(finalLayout, slotResult.slots, config);
  
  // Log any slot warnings
  if (slotApplication.warnings.length > 0) {
    slotApplication.warnings.forEach(warning => {
      logger.warn(`Slot validation: ${warning.message}`);
    });
  }
  
  return slotApplication.result;
}

/**
 * Process standalone slots (slots without template extends)
 * @param {string} htmlContent - HTML content with slots
 * @returns {string} Processed HTML
 */
function processStandaloneSlots(htmlContent) {
  // For standalone data-slot attributes, no processing needed in the new system
  // The data-slot system doesn't require removing elements like the old <slot> system
  return htmlContent;
}
}

/**
 * Get default configuration for unified processing
 * @param {Object} userConfig - User-provided configuration
 * @returns {Object} Complete configuration object
 */
export function getUnifiedConfig(userConfig = {}) {
  let config = {
    layoutsDir: userConfig.layouts || ".layouts", // Deprecated but kept for compatibility
    ...userConfig,
  };
  
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
