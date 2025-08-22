/**
 * HTML File Processor
 * Integrates all DOM Cascade components for complete HTML processing
 */

import { AreaMatcher } from "./cascade/area-matcher.js";
import { AttributeMerger } from "./cascade/attribute-merger.js";
import { HeadMerger } from "./cascade/head-merger.js";
import { LinkNormalizer } from "./link-normalizer.js";
import { DOMParser } from "../io/dom-parser.js";
import { SecurityScanner } from "./security-scanner.js";
import { SSIProcessor } from "./ssi-processor.js";
import { HTMLMinifier } from "./html-minifier.js";
import { PathTraversalError, FileSystemError } from "./errors.js";
import { join } from "path";

/**
 * Maximum nesting depth for layout composition to prevent infinite recursion
 */
const MAX_LAYOUT_DEPTH = 10;

/**
 * HtmlProcessor orchestrates DOM Cascade composition pipeline
 */
export class HtmlProcessor {
  constructor(pathValidator) {
    this.pathValidator = pathValidator;
    this.areaMatcher = new AreaMatcher();
    this.attributeMerger = new AttributeMerger();
    this.headMerger = new HeadMerger();
    this.domParser = new DOMParser();
    this.securityScanner = new SecurityScanner();
    this.htmlMinifier = new HTMLMinifier();
    this.ssiProcessor = null; // Initialize when needed with source root
    this.layoutCache = new Map();
    this.processingStack = new Set(); // Circular import detection
    this.warnedMissingFiles = new Set(); // Track warned missing files to avoid repetition
    this.stats = {
      layoutCacheHits: 0,
      layoutCacheMisses: 0,
      layoutMissing: 0,
      uniqueMissingFiles: 0,
      circularImportsPrevented: 0,
      ssiIncludesProcessed: 0,
      ssiWarnings: 0
    };
  }

  /**
   * Process HTML file with full DOM Cascade composition
   * @param {string} filePath - Path to HTML file being processed
   * @param {string} htmlContent - HTML content to process
   * @param {Object} fileSystem - Mock file system for testing/resolved files
   * @param {string} sourceRoot - Source root directory for path validation
   * @param {Object} options - Processing options (e.g., prettyUrls)
   * @returns {Promise<ProcessResult>} Processing results
   */
  async processFile(filePath, htmlContent, fileSystem = {}, sourceRoot = '.', options = {}) {
    const result = {
      success: false,
      html: htmlContent,
      fallbackHtml: htmlContent,
      error: null,
      exitCode: 0,
      processingTime: 0,
      layoutsProcessed: 0,
      compositionApplied: false,
      securityWarnings: [],
      dependencies: [], // Track all dependencies including SSI includes
      recoverableErrors: [] // Track recoverable errors (e.g., missing layouts)
    };

    const startTime = Date.now();
    
    // Initialize recoverable errors collection for this file
    this.recoverableErrorsForCurrentFile = [];

    try {
      // Check for circular imports
      if (this.processingStack.has(filePath)) {
        const stackArray = Array.from(this.processingStack);
        const circularPath = [...stackArray, filePath].join(' → ');
        throw new Error(`Circular import detected: ${circularPath}`);
      }

      this.processingStack.add(filePath);

      // Initialize SSI processor if not already done
      if (!this.ssiProcessor) {
        this.ssiProcessor = new SSIProcessor(sourceRoot);
      }

      // Step 1: Process SSI includes (Legacy support)
      let processedHtml = htmlContent;
      const ssiResult = await this.ssiProcessor.processIncludes(htmlContent, filePath);
      
      // DEBUG: Log SSI processing results
      if (process.env.DEBUG) {
        console.log(`[SSI DEBUG] Processing ${filePath}`);
        console.log(`[SSI DEBUG] Source root: ${sourceRoot}`);
        console.log(`[SSI DEBUG] SSI success: ${ssiResult.success}`);
        console.log(`[SSI DEBUG] SSI includes processed: ${ssiResult.includesProcessed}`);
        console.log(`[SSI DEBUG] SSI error: ${ssiResult.error}`);
        console.log(`[SSI DEBUG] Content length before: ${htmlContent.length}`);
        console.log(`[SSI DEBUG] Content length after: ${ssiResult.content.length}`);
      }
      
      if (ssiResult.success) {
        processedHtml = ssiResult.content;
        this.stats.ssiIncludesProcessed += ssiResult.includesProcessed;
        this.stats.ssiWarnings += ssiResult.warnings.length;
        
        // Add SSI dependencies to result
        result.dependencies.push(...ssiResult.dependencies);
        
        // Add SSI warnings to security warnings
        const filteredWarnings = ssiResult.warnings.filter(w => 
          w.includes('Path traversal') || w.includes('outside source root')
        );
        
        result.securityWarnings.push(...filteredWarnings);
      } else {
        // If SSI processing fails, log warning but continue with original content
        console.warn(`SSI processing failed for ${filePath}: ${ssiResult.error}`);
      }

      // Parse HTML document (now with SSI includes processed)
      const doc = this.domParser.parse(processedHtml);
      
      // Check for data-unify attribute
      const dataUnifyAttr = this._extractDataUnifyAttribute(processedHtml);
      if (dataUnifyAttr) {
        // Validate path security
        try {
          this.pathValidator.validatePath(dataUnifyAttr, sourceRoot);
        } catch (error) {
          if (error instanceof PathTraversalError) {
            result.error = error.message;
            result.exitCode = 2;
            return result;
          }
          throw error;
        }

        // Process with layout composition (using SSI-processed HTML)
        try {
          const layoutResult = await this._processWithLayout(
            filePath, 
            processedHtml, 
            dataUnifyAttr, 
            fileSystem, 
            sourceRoot,
            options
          );
          
          // CRITICAL FIX: Remove ALL data-unify attributes from final result
          result.html = this._removeDataUnifyAttributes(layoutResult.html);
          result.compositionApplied = true;
          result.layoutsProcessed = layoutResult.layoutsProcessed;
          result.ssiIncludesProcessed = ssiResult.includesProcessed;
        } catch (error) {
          if (error.name === 'RecoverableError' && error.isRecoverable) {
            // Handle recoverable error with fallback
            result.html = error.fallbackHtml;
            result.compositionApplied = false;
            result.layoutsProcessed = 0;
            result.ssiIncludesProcessed = ssiResult.includesProcessed;
            result.recoverableErrors.push(error.message);
            // Don't re-throw - continue processing with fallback
          } else {
            // Re-throw non-recoverable errors
            throw error;
          }
        }
      } else {
        // Process standalone HTML (no layout, but with SSI processing)
        result.html = this._processStandalone(processedHtml);
        result.ssiIncludesProcessed = ssiResult.includesProcessed;
      }

      // Apply link normalization if enabled
      if (options.prettyUrls) {
        result.html = this._applyLinkNormalization(result.html, options);
      }

      // Perform security scanning
      const additionalSecurityWarnings = this.securityScanner.scanForSecurityIssues(result.html, filePath);
      result.securityWarnings.push(...additionalSecurityWarnings);
      
      // Apply HTML minification if enabled
      if (options.minify) {
        result.html = this.htmlMinifier.minify(result.html);
      }
      
      // Transfer recoverable errors to result
      result.recoverableErrors = this.recoverableErrorsForCurrentFile || [];

      result.success = true;
      
    } catch (error) {
      result.success = false;
      result.error = error.message;
      result.exitCode = 1;
      
      if (error.message.includes('not found')) {
        result.exitCode = 1;
      } else if (error.message.includes('Circular')) {
        result.exitCode = 1;
        this.stats.circularImportsPrevented++;
      } else if (error.message.includes('Maximum call stack')) {
        result.error = 'Circular import detected: Maximum call stack size exceeded';
        result.exitCode = 1;
        this.stats.circularImportsPrevented++;
      }
      
      // Debug logging for failures
      if (process.env.DEBUG || process.env.CLAUDECODE) {
        console.error('[HtmlProcessor] Error:', error.message);
        console.error('[HtmlProcessor] Stack:', error.stack);
      }
    } finally {
      this.processingStack.delete(filePath);
      result.processingTime = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Process HTML with layout composition
   * @private
   */
  async _processWithLayout(filePath, pageHtml, layoutPath, fileSystem, sourceRoot, options = {}, depth = 0) {
    // Initialize layout count for this processing call
    let layoutsProcessedCount = 1; // Count this layout
    
    // Check depth first to prevent stack overflow
    if (depth > MAX_LAYOUT_DEPTH) {
      throw new Error(`Maximum depth exceeded: layout nesting too deep (>${MAX_LAYOUT_DEPTH})`);
    }
    
    // Create composite key for circular detection in layout chains
    const compositeKey = `${filePath}→${layoutPath}`;
    
    // Check for circular imports in layout chains
    this._validateNonCircularImport(compositeKey);
    
    // Add to processing stack for circular detection
    this.processingStack.add(compositeKey);
    
    try {
      // Validate layout path first
      try {
        this.pathValidator.validatePath(layoutPath, sourceRoot);
      } catch (error) {
        if (error instanceof PathTraversalError) {
          throw error;
        }
      }

    // Load layout (with caching)
    let layoutHtml;
    if (this.layoutCache.has(layoutPath)) {
      layoutHtml = this.layoutCache.get(layoutPath);
      this.stats.layoutCacheHits++;
    } else {
      layoutHtml = fileSystem[layoutPath];
      if (!layoutHtml) {
        // Graceful fallback for missing layout files
        // Only warn once per missing file to avoid repetitive messages during builds
        if (!this.warnedMissingFiles.has(layoutPath)) {
          console.warn(`[HtmlProcessor] Layout file not found: ${layoutPath}. Falling back to standalone processing.`);
          this.warnedMissingFiles.add(layoutPath);
          this.stats.uniqueMissingFiles++;
        }
        this.stats.layoutMissing++;
        
        // Add this as a recoverable error (per specification: "recoverable error + fallback")
        if (!this.recoverableErrorsForCurrentFile) {
          this.recoverableErrorsForCurrentFile = [];
        }
        this.recoverableErrorsForCurrentFile.push(`Layout file not found: ${layoutPath}`);
        
        // Create a RecoverableError to signal to the build system
        const fallbackHtml = this._removeDataUnifyAttributes(pageHtml);
        const recoverableError = new Error(`Layout file not found: ${layoutPath}. Falling back to standalone processing.`);
        recoverableError.name = 'RecoverableError';
        recoverableError.fallbackHtml = fallbackHtml;
        recoverableError.isRecoverable = true;
        throw recoverableError;
      }
      
      // Process SSI includes in layout files (layouts can also contain SSI directives)
      if (this.ssiProcessor) {
        // Use sourceRoot + layoutPath to get the full path for SSI processing
        const fullLayoutPath = layoutPath.startsWith('/') ? layoutPath : join(sourceRoot, layoutPath);
        const layoutSsiResult = await this.ssiProcessor.processIncludes(layoutHtml, fullLayoutPath);
        if (layoutSsiResult.success) {
          layoutHtml = layoutSsiResult.content;
          this.stats.ssiIncludesProcessed += layoutSsiResult.includesProcessed;
        }
      }
      
      this.layoutCache.set(layoutPath, layoutHtml);
      this.stats.layoutCacheMisses++;
    }

    // Process nested data-unify components within the layout
    // This handles component imports (data-unify on non-html/body elements)
    layoutHtml = await this._processNestedComponents(layoutHtml, fileSystem, sourceRoot, options, depth);
    
    // Check for layout-level data-unify (only on html/body elements)
    const layoutDataUnify = this._extractLayoutDataUnifyAttribute(layoutHtml);
    if (layoutDataUnify) {
      // Validate layout's import path
      try {
        this.pathValidator.validatePath(layoutDataUnify, sourceRoot);
      } catch (error) {
        if (error instanceof PathTraversalError) {
          throw error;
        }
      }
      
      // Recursively process layout-level import (with incremented depth)
      const nestedLayoutResult = await this._processWithLayout(
        layoutPath,
        layoutHtml,
        layoutDataUnify,
        fileSystem,
        sourceRoot,
        options,
        depth + 1
      );
      layoutHtml = nestedLayoutResult.html;
      // Accumulate layout count from recursive processing
      layoutsProcessedCount += nestedLayoutResult.layoutsProcessed;
    }

    // Simple composition approach - HTML string matching
    // TODO: Integrate full DOM cascade components when DOM parser supports nested elements
    let composedHtml = layoutHtml;
    
    
    // Area class matching - look for any elements with unify- prefix classes
    const unifyClassRegex = /<(\w+)[^>]*class="[^"]*unify-([^"\s]*)[^"]*"[^>]*>/g;
    let match;
    const processedAreas = new Set();
    
    // Find all unify-* areas in layout and match with page
    while ((match = unifyClassRegex.exec(layoutHtml)) !== null) {
      const [fullMatch, tagName, areaName] = match;
      const areaClass = `unify-${areaName}`;
      
      if (processedAreas.has(areaClass)) continue;
      processedAreas.add(areaClass);
      
      // Look for matching page element with same unify- class (any tag name)
      const pageAreaMatch = pageHtml.match(
        new RegExp(`<(\\w+)[^>]*class="[^"]*${areaClass}[^"]*"[^>]*>(.*?)<\\/\\1>`, 's')
      );
      
      if (pageAreaMatch) {
        const [, pageTagName, pageContent] = pageAreaMatch;
        const pageElementMatch = pageHtml.match(
          new RegExp(`(<${pageTagName}[^>]*class="[^"]*${areaClass}[^"]*"[^>]*>)`)
        );
        
        if (pageElementMatch) {
          const pageElementTag = pageElementMatch[1];
          const pageAttrs = this._extractAttributes(pageElementTag);
          
          // Replace matching layout area
          composedHtml = composedHtml.replace(
            new RegExp(`<${tagName}[^>]*class="[^"]*${areaClass}[^"]*"[^>]*>.*?<\\/${tagName}>`, 's'),
            (layoutMatch) => {
              const layoutAttrs = this._extractAttributes(layoutMatch);
              const mergedAttrs = this._mergeElementAttributes(layoutAttrs, pageAttrs);
              
              const attrString = Object.entries(mergedAttrs)
                .map(([key, value]) => `${key}="${value}"`)
                .join(' ');
              
              return `<${tagName} ${attrString}>${pageContent}</${tagName}>`;
            }
          );
        }
      }
    }

    // Simple landmark replacement for fallback
    const landmarks = ['header', 'nav', 'main', 'aside', 'footer'];
    for (const landmark of landmarks) {
      const pageMatch = pageHtml.match(new RegExp(`<${landmark}[^>]*>(.*?)<\\/${landmark}>`, 's'));
      if (pageMatch) {
        const pageContent = pageMatch[1];
        composedHtml = composedHtml.replace(
          new RegExp(`<${landmark}[^>]*>.*?<\\/${landmark}>`, 's'),
          `<${landmark}>${pageContent}</${landmark}>`
        );
      }
    }

    // Simple head merging for now (TODO: integrate proper HeadMerger)
    const pageHeadMatch = pageHtml.match(/<head[^>]*>(.*?)<\/head>/s);
    const layoutHeadMatch = composedHtml.match(/<head[^>]*>(.*?)<\/head>/s);
    
    if (pageHeadMatch && layoutHeadMatch) {
      const pageHeadContent = pageHeadMatch[1];
      const layoutHeadContent = layoutHeadMatch[1];
      
      // Simple head merging - add page meta to layout head
      const pageMetaMatches = pageHeadContent.match(/<meta[^>]*>/g) || [];
      const pageLinkMatches = pageHeadContent.match(/<link[^>]*>/g) || [];
      
      let mergedHeadContent = layoutHeadContent;
      
      // Add page meta tags
      for (const meta of pageMetaMatches) {
        if (!mergedHeadContent.includes(meta)) {
          mergedHeadContent += '\n' + meta;
        }
      }
      
      // Add page link tags  
      for (const link of pageLinkMatches) {
        if (!mergedHeadContent.includes(link)) {
          mergedHeadContent += '\n' + link;
        }
      }
      
      composedHtml = composedHtml.replace(
        /<head[^>]*>.*?<\/head>/s,
        `<head>${mergedHeadContent}</head>`
      );
    }

      // Handle page title override
      const pageTitleMatch = pageHtml.match(/<title[^>]*>(.*?)<\/title>/i);
      if (pageTitleMatch) {
        composedHtml = composedHtml.replace(/<title[^>]*>.*?<\/title>/i, `<title>${pageTitleMatch[1]}</title>`);
      }

      // Remove data-unify attributes
      composedHtml = this._removeDataUnifyAttributes(composedHtml);

      return {
        html: composedHtml,
        layoutsProcessed: layoutsProcessedCount
      };
    } finally {
      // Clean up processing stack
      this.processingStack.delete(compositeKey);
    }
  }

  /**
   * Process standalone HTML (no layout)
   * @private
   */
  _processStandalone(htmlContent) {
    // Remove data-unify attributes and return
    return this._removeDataUnifyAttributes(htmlContent);
  }

  /**
   * Extract data-unify attribute value from HTML
   * @private
   */
  _extractDataUnifyAttribute(html) {
    const match = html.match(/data-unify=["']([^"']+)["']/);
    return match ? match[1] : null;
  }

  /**
   * Extract data-unify attribute only from html or body elements (layout mode)
   * @private
   */
  _extractLayoutDataUnifyAttribute(html) {
    // Check for data-unify on html element
    const htmlMatch = html.match(/<html[^>]*data-unify=["']([^"']+)["'][^>]*>/);
    if (htmlMatch) return htmlMatch[1];
    
    // Check for data-unify on body element
    const bodyMatch = html.match(/<body[^>]*data-unify=["']([^"']+)["'][^>]*>/);
    if (bodyMatch) return bodyMatch[1];
    
    return null;
  }

  /**
   * Process nested data-unify components within HTML (non-html/body elements)
   * @private
   */
  async _processNestedComponents(html, fileSystem, sourceRoot, options, depth) {
    let processedHtml = html;
    
    // Find all elements with data-unify that are NOT html or body
    const componentRegex = /<(?!html|body)(\w+)([^>]*data-unify=["']([^"']+)["'][^>]*)>(.*?)<\/\1>/gs;
    
    let match;
    while ((match = componentRegex.exec(html)) !== null) {
      const [fullMatch, tagName, attributes, componentPath, content] = match;
      
      try {
        // Validate component path
        this.pathValidator.validatePath(componentPath, sourceRoot);
        
        // Load component
        const componentHtml = fileSystem[componentPath];
        if (componentHtml) {
          // Recursively process the component if it has nested data-unify
          const processedComponent = await this._processNestedComponents(
            componentHtml, 
            fileSystem, 
            sourceRoot, 
            options, 
            depth + 1
          );
          
          // Replace the element with the processed component
          processedHtml = processedHtml.replace(fullMatch, processedComponent);
        } else {
          // Component not found, warn and remove data-unify attribute
          if (!this.warnedMissingFiles.has(componentPath)) {
            console.warn(`[HtmlProcessor] Component file not found: ${componentPath}. Falling back to standalone processing.`);
            this.warnedMissingFiles.add(componentPath);
          }
          // Remove data-unify attribute from element
          const cleanAttributes = attributes.replace(/data-unify=["'][^"']*["']\s*/g, '');
          const cleanElement = `<${tagName}${cleanAttributes}>${content}</${tagName}>`;
          processedHtml = processedHtml.replace(fullMatch, cleanElement);
        }
      } catch (error) {
        if (error instanceof PathTraversalError) {
          throw error;
        }
        // For other errors, remove data-unify and continue
        const cleanAttributes = attributes.replace(/data-unify=["'][^"']*["']\s*/g, '');
        const cleanElement = `<${tagName}${cleanAttributes}>${content}</${tagName}>`;
        processedHtml = processedHtml.replace(fullMatch, cleanElement);
      }
    }
    
    return processedHtml;
  }

  /**
   * Replace head content in HTML
   * @private
   */
  _replaceHead(html, newHeadContent) {
    return html.replace(
      /<head[^>]*>.*?<\/head>/is,
      `<head>\n${newHeadContent}\n</head>`
    );
  }

  /**
   * Remove data-unify and data-layer attributes from HTML
   * @private
   */
  _removeDataUnifyAttributes(html) {
    // Remove data-unify attributes with any quote style and surrounding whitespace
    return html
      .replace(/\s+data-unify="[^"]*"/g, '')
      .replace(/\s+data-unify='[^']*'/g, '')
      .replace(/data-unify="[^"]*"\s*/g, '')
      .replace(/data-unify='[^']*'\s*/g, '')
      .replace(/\s*data-layer=[^\s>]*/g, '');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const ssiStats = this.ssiProcessor ? this.ssiProcessor.getStatistics() : {};
    return { 
      ...this.stats,
      ssiStats 
    };
  }

  /**
   * Clear processing cache
   */
  clearCache() {
    this.layoutCache.clear();
    this.warnedMissingFiles.clear(); // Clear warning deduplication set
    if (this.ssiProcessor) {
      this.ssiProcessor.clearCache();
    }
    this.stats = {
      layoutCacheHits: 0,
      layoutCacheMisses: 0,
      layoutMissing: 0,
      uniqueMissingFiles: 0,
      circularImportsPrevented: 0,
      ssiIncludesProcessed: 0,
      ssiWarnings: 0
    };
  }

  /**
   * Validate composition result
   * @param {string} html - Composed HTML
   * @returns {ValidationResult} Validation results
   */
  validateComposition(html) {
    const validation = {
      isValid: true,
      warnings: [],
      errors: []
    };

    // Check for remaining data-unify attributes
    if (html.includes('data-unify=')) {
      validation.warnings.push('data-unify attributes found in final output');
    }

    // Check for basic HTML structure
    if (!html.includes('<html') || !html.includes('</html>')) {
      validation.errors.push('Invalid HTML structure - missing html tags');
      validation.isValid = false;
    }

    return validation;
  }

  /**
   * Build merged element with combined attributes and content
   * @private
   * @param {Element} layoutElement - Layout element
   * @param {Element} pageElement - Page element  
   * @param {Object} mergedAttributes - Merged attributes
   * @returns {string} Merged element HTML
   */
  _buildMergedElement(layoutElement, pageElement, mergedAttributes) {
    const tagName = layoutElement.tagName;
    
    // Build attribute string from merged attributes
    const attrString = Object.entries(mergedAttributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');
    
    // Use page content, preserving layout structure if no page content
    const content = pageElement.innerHTML || layoutElement.innerHTML;
    
    return `<${tagName} ${attrString}>${content}</${tagName}>`;
  }

  /**
   * Extract attributes from HTML element string
   * @private
   * @param {string} elementHtml - HTML element string
   * @returns {Object} Attribute key-value pairs
   */
  _extractAttributes(elementHtml) {
    const attrs = {};
    
    // Handle both quoted and unquoted attributes
    const attrRegex = /([\w-]+)=['"]([^'"]*)['"]/g;
    let match;

    while ((match = attrRegex.exec(elementHtml)) !== null) {
      attrs[match[1]] = match[2];
    }

    return attrs;
  }

  /**
   * Merge element attributes with page-wins policy and class union
   * @private  
   * @param {Object} layoutAttrs - Layout element attributes
   * @param {Object} pageAttrs - Page element attributes
   * @returns {Object} Merged attributes
   */
  _mergeElementAttributes(layoutAttrs, pageAttrs) {
    const merged = { ...layoutAttrs };

    for (const [key, value] of Object.entries(pageAttrs)) {
      if (key === 'class') {
        // Union classes
        const layoutClasses = layoutAttrs.class ? layoutAttrs.class.split(/\s+/) : [];
        const pageClasses = value.split(/\s+/);
        const unionClasses = [...new Set([...layoutClasses, ...pageClasses])];
        merged.class = unionClasses.join(' ');
      } else if (key === 'id') {
        // Layout ID wins for stability
        merged.id = layoutAttrs.id || value;
      } else {
        // Page wins for other attributes
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * Extract metadata from processed HTML
   * @param {string} html - Processed HTML
   * @returns {Object} Extracted metadata
   */
  extractMetadata(html) {
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    
    return {
      title: titleMatch ? titleMatch[1] : null,
      description: descMatch ? descMatch[1] : null,
      hasLayout: html.includes('data-unify') || this.stats.layoutsProcessed > 0,
      processingTime: this.stats.processingTime || 0
    };
  }

  /**
   * Apply link normalization to HTML content
   * @private
   * @param {string} html - HTML content to process
   * @param {Object} options - Processing options
   * @returns {string} HTML with normalized links
   */
  _applyLinkNormalization(html, options) {
    const linkNormalizer = new LinkNormalizer(options);
    
    // Replace all href attributes in well-formed anchor tags
    // This regex is more conservative to avoid malformed HTML
    return html.replace(/<a\s+([^>]*?)href=(["'])([^"']*?)\2([^>]*?)>/gi, (match, beforeHref = '', quote, href, afterHref = '') => {
      const normalizedHref = linkNormalizer.transformLink(href);
      return `<a ${beforeHref}href=${quote}${normalizedHref}${quote}${afterHref}>`;
    });
  }

  /**
   * Validate that a layout import doesn't create a circular dependency
   * @private
   * @param {string} compositeKey - Layout import chain key
   * @throws {Error} If circular import is detected
   */
  _validateNonCircularImport(compositeKey) {
    if (this.processingStack.has(compositeKey)) {
      const stackArray = Array.from(this.processingStack);
      const circularPath = [...stackArray, compositeKey].join(' → ');
      throw new Error(`Circular import detected in layout chain: ${circularPath}`);
    }
  }
}