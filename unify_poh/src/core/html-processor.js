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
import { LayoutResolver } from "./layout-resolver.js";
import { PathTraversalError, FileSystemError } from "./errors.js";
import { join } from "path";
import { createLogger } from '../utils/logger.js';

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
    this.layoutResolver = new LayoutResolver(pathValidator);
    this.logger = createLogger('HTML-PROCESSOR');
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
      this.logger.debug('SSI processing result', {
        filePath,
        sourceRoot,
        success: ssiResult.success,
        includesProcessed: ssiResult.includesProcessed,
        error: ssiResult.error,
        contentLengthBefore: htmlContent.length,
        contentLengthAfter: ssiResult.content.length
      });
      
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
      this.logger.debug('Extracted data-unify attribute', { dataUnify: dataUnifyAttr, filePath });
      if (dataUnifyAttr) {
        // Validate path security
        try {
          this.pathValidator.validatePath(dataUnifyAttr, sourceRoot);
        } catch (error) {
          if (error instanceof PathTraversalError) {
            // Even on path traversal error, clean up data-unify attributes from the original content
            result.html = this._removeDataUnifyAttributes(processedHtml);
            result.error = error.message;
            result.exitCode = 2;
            return result;
          }
          throw error;
        }

        // Process with layout composition (using SSI-processed HTML)
        try {
          // CRITICAL FIX: For mock files (testing), use original path; for filesystem, resolve path
          let layoutPathToUse = dataUnifyAttr;
          
          // Only resolve path if we're not using mock files (fileSystem is empty or doesn't contain the key)
          if (Object.keys(fileSystem).length === 0 || !fileSystem[dataUnifyAttr]) {
            layoutPathToUse = this.layoutResolver._resolveLayoutPath(dataUnifyAttr, filePath, sourceRoot);
            this.logger.debug('Resolved layout path', { original: dataUnifyAttr, resolved: layoutPathToUse });
          } else {
            this.logger.debug('Using mock layout path', { mockPath: dataUnifyAttr });
          }
          
          // CRITICAL FIX: Process components in PAGE HTML first before layout composition
          // Components are imported in page HTML, not layout HTML
          this.logger.debug('Processing page components before layout composition', { 
            filePath, 
            htmlLength: processedHtml.length 
          });
          
          const pageWithComponents = await this._processNestedComponents(
            processedHtml,
            fileSystem, 
            sourceRoot, 
            options, 
            0 // depth 0 for page-level processing
          );
          
          const layoutResult = await this._processWithLayout(
            filePath, 
            pageWithComponents,  // Use processed page HTML with components resolved
            layoutPathToUse, 
            fileSystem, 
            sourceRoot,
            options
          );
          
          // DEBUG: Log layout processing results
          this.logger.debug('Layout processing completed', {
            originalHtmlLength: processedHtml.length,
            processedHtmlLength: layoutResult.html.length,
            layoutsProcessed: layoutResult.layoutsProcessed,
            htmlChanged: processedHtml !== layoutResult.html,
            contentPreview: layoutResult.html.substring(0, 200)
          });
          
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
      this.logger.debug('HTML processing error', {
        message: error.message,
        stack: error.stack
      });
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
      // Try multiple path formats to find the layout file
      layoutHtml = fileSystem[layoutPath];
      
      if (!layoutHtml) {
        // Try relative path from source root
        const { relative } = require('path');
        const relativePath = relative(sourceRoot, layoutPath);
        layoutHtml = fileSystem[relativePath];
      }
      
      if (!layoutHtml) {
        // Try just the filename for files in source root
        const { basename } = require('path');
        const filename = basename(layoutPath);
        layoutHtml = fileSystem[filename];
      }
      
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
      
      // CRITICAL FIX: For mock files (testing), use original path; for filesystem, resolve path
      let nestedLayoutPathToUse = layoutDataUnify;
      
      // Only resolve path if we're not using mock files (fileSystem is empty or doesn't contain the key)
      if (Object.keys(fileSystem).length === 0 || !fileSystem[layoutDataUnify]) {
        nestedLayoutPathToUse = this.layoutResolver._resolveLayoutPath(layoutDataUnify, layoutPath, sourceRoot);
        this.logger.debug('Nested layout resolved', {
          original: layoutDataUnify,
          resolved: nestedLayoutPathToUse,
          fromLayout: layoutPath
        });
      } else {
        this.logger.debug('Using nested mock layout path', {
          mockPath: layoutDataUnify,
          fromLayout: layoutPath
        });
      }
      
      // Recursively process layout-level import (with incremented depth)
      try {
        const nestedLayoutResult = await this._processWithLayout(
          layoutPath,
          layoutHtml,
          nestedLayoutPathToUse,
          fileSystem,
          sourceRoot,
          options,
          depth + 1
        );
        layoutHtml = nestedLayoutResult.html;
        // Accumulate layout count from recursive processing
        layoutsProcessedCount += nestedLayoutResult.layoutsProcessed;
      } catch (error) {
        if (error.name === 'RecoverableError' && error.isRecoverable) {
          // Handle missing nested layout gracefully - continue with current layout
          // The nested layout is missing, but we can still use this layout
          this.logger.debug('Nested layout missing, continuing', { layoutPath });
          // layoutHtml remains unchanged (current layout without nested layout applied)
        } else {
          // Re-throw non-recoverable errors (like circular imports, etc.)
          throw error;
        }
      }
    }

    // FIXED: Use proper DOM cascade components per DOM Cascade v1 specification
    let composedHtml = layoutHtml; // Initialize with layout as fallback
    
    try {
      // Parse documents for proper DOM manipulation
      const layoutDoc = this.domParser.parse(layoutHtml);
      const pageDoc = this.domParser.parse(pageHtml);
      
      // Use proper AreaMatcher component for DOM Cascade v1 compliance
      const areaMatchResult = this.areaMatcher.matchAreas(layoutDoc, pageDoc);
      
      this.logger.debug('Area match results', {
        matchCount: areaMatchResult.matches.length,
        warningCount: areaMatchResult.warnings.length,
        errorCount: areaMatchResult.errors.length
      });
      
      // Apply area matches by string replacement (working with current DOM parser limitations)
      composedHtml = layoutHtml;
      for (const match of areaMatchResult.matches) {
        if (match.matchType === 'area-class') {
          // Extract the actual class name from the match
          const targetClass = match.targetClass;
          
          this.logger.debug('Processing area match', {
            targetClass,
            pageElementCount: match.pageElements.length,
            contentPreview: match.combinedContent.substring(0, 100)
          });
          
          // Use AttributeMerger for proper DOM Cascade v1 attribute merging
          const mergedAttributes = this.attributeMerger.mergeAttributes(
            match.layoutElement,
            match.pageElements[0] // Take first matching page element for now
          );
          
          // Replace layout area with page content using proper attribute merging
          const layoutElement = match.layoutElement;
          const layoutTagName = layoutElement.tagName;
          
          // Build merged attribute string
          const attrString = Object.entries(mergedAttributes)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');
          
          // DEBUG: Log attribute merging for ID retention verification
          this.logger.debug('Attribute merging result', {
            targetClass,
            layoutId: match.layoutElement.attributes?.id,
            pageId: match.pageElements[0]?.attributes?.id,
            mergedId: mergedAttributes.id,
            attrString
          });
          
          
          // Replace in HTML string with proper attribute merging and content replacement
          const layoutElementRegex = new RegExp(
            `<${layoutTagName}[^>]*class="[^"]*${targetClass}[^"]*"[^>]*>.*?<\\/${layoutTagName}>`, 
            's'
          );
          
          this.logger.debug('Area replacement debug', {
            targetClass,
            layoutTagName,
            regexPattern: layoutElementRegex.toString(),
            attrString,
            combinedContent: match.combinedContent.substring(0, 100),
            composedHtmlBefore: composedHtml.substring(0, 500),
            regexMatches: layoutElementRegex.test(composedHtml)
          });
          
          const beforeReplacement = composedHtml;
          composedHtml = composedHtml.replace(
            layoutElementRegex,
            `<${layoutTagName} ${attrString}>${match.combinedContent}</${layoutTagName}>`
          );
          
          this.logger.debug('Area replacement result', {
            changed: beforeReplacement !== composedHtml,
            composedHtmlAfter: composedHtml.substring(0, 500)
          });
        }
      }
      
      // Fallback to landmark matching if no area matches found
      if (areaMatchResult.matches.length === 0) {
        this.logger.debug('No area matches found, trying landmark matching');
        
        const landmarkResult = this.areaMatcher.landmarkMatcher.matchLandmarks(layoutDoc, pageDoc);
        
        // Apply landmark matches
        for (const match of landmarkResult.matches) {
          if (match.matchType === 'landmark') {
            const tagName = match.layoutElement.tagName;
            composedHtml = composedHtml.replace(
              new RegExp(`<${tagName}[^>]*>.*?<\\/${tagName}>`, 's'),
              `<${tagName}>${match.pageContent}</${tagName}>`
            );
          }
        }
      }
      
      // CRITICAL FIX: Only skip landmarks that were ACTUALLY matched by area classes
      // Build set of landmarks that were specifically handled by area matching
      const areaMatchedElements = new Set();
      for (const match of areaMatchResult.matches) {
        if (match.layoutElement && match.layoutElement.tagName) {
          const tagName = match.layoutElement.tagName.toLowerCase();
          if (['header', 'nav', 'main', 'aside', 'footer'].includes(tagName)) {
            areaMatchedElements.add(tagName);
            this.logger.debug('Area match handled landmark, skipping landmark fallback', { tagName, targetClass: match.targetClass });
          }
        }
      }
      
      // IMPROVED FIX: Use intelligent landmark replacement that preserves unmatched areas
      // Apply landmark fallback strategically:
      // 1. Always allow for layout-to-layout composition (depth > 0)
      // 2. For page-level composition (depth = 0), be selective about which landmarks to replace
      const hasAreaMatches = areaMatchResult.matches.length > 0;
      const isPageLevelComposition = depth === 0; // Page is processed at depth 0
      
      if (hasAreaMatches && isPageLevelComposition) {
        // When page uses area matching, only allow specific landmark fallbacks that don't destroy unmatched areas
        // Allow header/footer/nav/aside but skip main which would destroy unmatched sections
        this.logger.debug('Using selective landmark fallback for page-level composition with area matching', {
          areaMatchCount: areaMatchResult.matches.length,
          depth
        });
        
        const selectiveLandmarks = ['header', 'nav', 'aside', 'footer'];
        for (const landmark of selectiveLandmarks) {
          // Skip if this landmark was already handled by area matching
          if (areaMatchedElements.has(landmark)) {
            this.logger.debug('Skipping landmark fallback for already area-matched element', { landmark });
            continue;
          }
          
          const pageMatch = pageHtml.match(new RegExp(`<${landmark}[^>]*>(.*?)<\\/${landmark}>`, 's'));
          if (pageMatch) {
            const pageContent = pageMatch[1];
            composedHtml = composedHtml.replace(
              new RegExp(`<${landmark}[^>]*>.*?<\\/${landmark}>`, 's'),
              `<${landmark}>${pageContent}</${landmark}>`
            );
            this.logger.debug('Applied selective landmark fallback replacement', { landmark });
          }
        }
      } else {
        // Apply landmark fallback for layout-to-layout composition or when no area matching
        // CRITICAL FIX: Exclude 'body' from landmark fallback to prevent destroying unmatched areas
        // Body replacement is too aggressive and destroys header/footer when intermediate layouts don't have them
        const landmarks = ['header', 'nav', 'main', 'aside', 'footer'];
        for (const landmark of landmarks) {
          // Skip if this landmark was already handled by area matching
          if (areaMatchedElements.has(landmark)) {
            this.logger.debug('Skipping landmark fallback for already area-matched element', { landmark });
            continue;
          }
          
          const pageMatch = pageHtml.match(new RegExp(`<${landmark}[^>]*>(.*?)<\\/${landmark}>`, 's'));
          if (pageMatch) {
            const pageContent = pageMatch[1];
            composedHtml = composedHtml.replace(
              new RegExp(`<${landmark}[^>]*>.*?<\\/${landmark}>`, 's'),
              `<${landmark}>${pageContent}</${landmark}>`
            );
            this.logger.debug('Applied landmark fallback replacement', { landmark });
          }
        }
      }
      
    } catch (error) {
      // Fallback to simple string-based composition if DOM parsing fails
      console.warn(`[HtmlProcessor] DOM cascade composition failed, falling back to simple composition: ${error.message}`);
      composedHtml = layoutHtml;
      
      // Basic fallback area matching
      const unifyClassRegex = /<(\w+)[^>]*class="[^"]*unify-([^"\s]*)[^"]*"[^>]*>/g;
      let match;
      const processedAreas = new Set();
      
      while ((match = unifyClassRegex.exec(layoutHtml)) !== null) {
        const [fullMatch, tagName, areaName] = match;
        const areaClass = `unify-${areaName}`;
        
        if (processedAreas.has(areaClass)) continue;
        processedAreas.add(areaClass);
        
        const pageAreaMatch = pageHtml.match(
          new RegExp(`<(\\w+)[^>]*class="[^"]*${areaClass}[^"]*"[^>]*>(.*?)<\\/\\1>`, 's')
        );
        
        if (pageAreaMatch) {
          const [, pageTagName, pageContent] = pageAreaMatch;
          composedHtml = composedHtml.replace(
            new RegExp(`<${tagName}[^>]*class="[^"]*${areaClass}[^"]*"[^>]*>.*?<\\/${tagName}>`, 's'),
            `<${tagName} class="${areaClass}">${pageContent}</${tagName}>`
          );
        }
      }
    }

    // FIXED: Use proper HeadMerger component for DOM Cascade v1 compliance
    try {
      const pageHeadMatch = pageHtml.match(/<head[^>]*>(.*?)<\/head>/s);
      const layoutHeadMatch = composedHtml.match(/<head[^>]*>(.*?)<\/head>/s);
      
      if (pageHeadMatch && layoutHeadMatch) {
        const pageHeadContent = pageHeadMatch[1];
        const layoutHeadContent = layoutHeadMatch[1];
        
        // Extract head elements using HeadMerger
        const layoutDoc = this.domParser.parse(`<html><head>${layoutHeadContent}</head><body></body></html>`);
        const pageDoc = this.domParser.parse(`<html><head>${pageHeadContent}</head><body></body></html>`);
        
        const layoutHead = this.headMerger.extractHead(layoutDoc);
        const pageHead = this.headMerger.extractHead(pageDoc);
        
        // Use proper HeadMerger for specification-compliant head merging
        const mergedHead = this.headMerger.merge(layoutHead, pageHead);
        
        this.logger.debug('Head merge operation', {
          layoutHeadElements: layoutHead,
          pageHeadElements: pageHead,
          mergedHeadElements: mergedHead
        });
        
        // Generate merged head HTML
        const mergedHeadHtml = this.headMerger.generateHeadHtml(mergedHead);
        
        // Replace head content with properly merged result
        composedHtml = composedHtml.replace(
          /<head[^>]*>.*?<\/head>/s,
          `<head>${mergedHeadHtml}</head>`
        );
      }
    } catch (error) {
      console.warn(`[HtmlProcessor] Head merging failed, using simple fallback: ${error.message}`);
      
      // Fallback to simple head merging
      const pageHeadMatch = pageHtml.match(/<head[^>]*>(.*?)<\/head>/s);
      const layoutHeadMatch = composedHtml.match(/<head[^>]*>(.*?)<\/head>/s);
      
      if (pageHeadMatch && layoutHeadMatch) {
        const pageHeadContent = pageHeadMatch[1];
        const layoutHeadContent = layoutHeadMatch[1];
        
        // Simple head merging fallback
        let mergedHeadContent = layoutHeadContent;
        const pageMetaMatches = pageHeadContent.match(/<meta[^>]*>/g) || [];
        const pageLinkMatches = pageHeadContent.match(/<link[^>]*>/g) || [];
        const pageStyleMatches = pageHeadContent.match(/<style[^>]*>.*?<\/style>/gs) || [];
        const pageScriptMatches = pageHeadContent.match(/<script[^>]*>.*?<\/script>/gs) || [];
        
        for (const meta of pageMetaMatches) {
          if (!mergedHeadContent.includes(meta)) {
            mergedHeadContent += '\n' + meta;
          }
        }
        
        for (const link of pageLinkMatches) {
          if (!mergedHeadContent.includes(link)) {
            mergedHeadContent += '\n' + link;
          }
        }
        
        for (const style of pageStyleMatches) {
          if (!mergedHeadContent.includes(style)) {
            mergedHeadContent += '\n' + style;
          }
        }
        
        for (const script of pageScriptMatches) {
          if (!mergedHeadContent.includes(script)) {
            mergedHeadContent += '\n' + script;
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
    
    this.logger.debug('Processing nested components', {
      htmlLength: html.length,
      depth,
      htmlPreview: html.substring(0, 200)
    });
    
    let match;
    let componentCount = 0;
    while ((match = componentRegex.exec(html)) !== null) {
      const [fullMatch, tagName, attributes, componentPath, content] = match;
      componentCount++;
      
      this.logger.debug('Found component to process', {
        componentCount,
        tagName,
        componentPath,
        contentPreview: content.substring(0, 100)
      });
      
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
          
          // CRITICAL FIX: Apply DOM Cascade composition between page content and component
          // Page content should compose INTO component areas (unify-title, unify-body, etc.)
          this.logger.debug('Applying component-level DOM Cascade composition', {
            componentPath,
            pageContentPreview: content.substring(0, 100),
            componentContentLength: processedComponent.length
          });
          
          try {
            // Parse component and page content for area matching
            const componentDoc = this.domParser.parse(processedComponent);
            
            // Create a minimal HTML document containing the page element content
            const pageElementHtml = `<html><body>${content}</body></html>`;
            const pageDoc = this.domParser.parse(pageElementHtml);
            
            // Apply area matching between page content and component
            const areaMatchResult = this.areaMatcher.matchAreas(componentDoc, pageDoc);
            
            this.logger.debug('Component area matching result', {
              matchCount: areaMatchResult.matches.length,
              warningCount: areaMatchResult.warnings.length
            });
            
            // Apply area replacements to component HTML
            let composedComponent = processedComponent;
            for (const match of areaMatchResult.matches) {
              if (match.matchType === 'area-class') {
                const targetClass = match.targetClass;
                
                // Use AttributeMerger for proper attribute merging
                const mergedAttributes = this.attributeMerger.mergeAttributes(
                  match.layoutElement,
                  match.pageElements[0]
                );
                
                // Build merged attribute string
                const attrString = Object.entries(mergedAttributes)
                  .map(([key, value]) => `${key}="${value}"`)
                  .join(' ');
                
                // Replace component area with page content
                const layoutTagName = match.layoutElement.tagName;
                const areaRegex = new RegExp(
                  `<${layoutTagName}[^>]*class="[^"]*${targetClass}[^"]*"[^>]*>.*?<\\/${layoutTagName}>`, 
                  's'
                );
                
                composedComponent = composedComponent.replace(
                  areaRegex,
                  `<${layoutTagName} ${attrString}>${match.combinedContent}</${layoutTagName}>`
                );
                
                this.logger.debug('Applied component area replacement', {
                  targetClass,
                  layoutTagName
                });
              }
            }
            
            // Extract body content from composed component
            const componentBodyContent = this._extractBodyContent(composedComponent);
            
            // Extract and merge component head content (CSS, scripts, etc.)
            const componentHeadContent = this._extractHeadContent(composedComponent);
            if (componentHeadContent.trim()) {
              // Inject component head content into the main document head
              processedHtml = this._injectHeadContent(processedHtml, componentHeadContent);
            }
            
            // Replace the element with the composed component body content
            processedHtml = processedHtml.replace(fullMatch, componentBodyContent);
            
          } catch (error) {
            // Fallback to simple replacement if component composition fails
            this.logger.warn('Component composition failed, using simple replacement', {
              error: error.message,
              componentPath
            });
            
            const componentBodyContent = this._extractBodyContent(processedComponent);
            const componentHeadContent = this._extractHeadContent(processedComponent);
            if (componentHeadContent.trim()) {
              processedHtml = this._injectHeadContent(processedHtml, componentHeadContent);
            }
            processedHtml = processedHtml.replace(fullMatch, componentBodyContent);
          }
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
   * Per DOM Cascade v1 Specification Section 2.2: All data-unify attributes MUST be removed from final output
   * @private
   */
  _removeDataUnifyAttributes(html) {
    // CRITICAL FIX: Comprehensive data-unify attribute removal
    // Must handle all possible HTML formatting variations
    const originalHtml = html;
    let result = html;
    
    // Check if there are actually data-unify attributes to remove
    const hasDataUnifyAttributes = /data-unify\s*=/.test(html) || /data-layer\s*=/.test(html);
    
    if (hasDataUnifyAttributes) {
      // Remove data-unify attributes with any quote style and surrounding whitespace
      // Pattern explanation: \s* = optional whitespace, [^"'/\s>]* = value without quotes/spaces/closing bracket
      result = result
        // Remove data-unify with double quotes (most common case)
        .replace(/\s*data-unify\s*=\s*"[^"]*"/g, '')
        // Remove data-unify with single quotes
        .replace(/\s*data-unify\s*=\s*'[^']*'/g, '')
        // Remove data-unify without quotes (edge case)
        .replace(/\s*data-unify\s*=\s*[^"'\s>]+/g, '')
        // Remove data-layer attributes (legacy support)
        .replace(/\s*data-layer\s*=\s*"[^"]*"/g, '')
        .replace(/\s*data-layer\s*=\s*'[^']*'/g, '')
        .replace(/\s*data-layer\s*=\s*[^"'\s>]+/g, '');
      
      // Only apply whitespace cleanup if we actually modified the HTML
      if (result !== originalHtml) {
        // Clean up specific whitespace issues that may have been introduced by attribute removal
        result = result
          // Fix space before closing bracket (only where attributes were removed)
          .replace(/\s+>/g, '>')
          // Fix opening tags with only whitespace (only where attributes were removed)
          .replace(/<(\w+)\s+>/g, '<$1>');
      }
    }
    
    // Log attribute removal for verification
    const hadDataUnify = originalHtml.includes('data-unify') || originalHtml.includes('data-layer');
    const stillHasDataUnify = result.includes('data-unify') || result.includes('data-layer');
    if (hadDataUnify) {
      this.logger.debug('Data-unify attribute removal', {
        hadDataUnify,
        stillHasDataUnify,
        beforePreview: originalHtml.substring(0, 200),
        afterPreview: result.substring(0, 200)
      });
      if (stillHasDataUnify) {
        this.logger.warn('Failed to remove all data-unify attributes');
      }
    }
    
    return result;
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
   * Extract body content from a component HTML document
   * Components are full HTML documents but we only want the body content for composition
   * @private
   * @param {string} componentHtml - Full HTML document from component file
   * @returns {string} Extracted body content
   */
  _extractBodyContent(componentHtml) {
    // Extract content within <body> tags
    const bodyMatch = componentHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      return bodyMatch[1].trim();
    }
    
    // If no body tag found, return the component as-is (might be a fragment)
    // Remove any standalone head elements that might be at the root
    return componentHtml
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/^\s*<!doctype[^>]*>/i, '')
      .replace(/^\s*<html[^>]*>/i, '')
      .replace(/<\/html>\s*$/i, '')
      .trim();
  }

  /**
   * Extract head content from a component HTML document
   * @private
   * @param {string} componentHtml - Full HTML document from component file
   * @returns {string} Extracted head content
   */
  _extractHeadContent(componentHtml) {
    const headMatch = componentHtml.match(/<head[^>]*>([\s\S]*)<\/head>/i);
    if (headMatch) {
      return headMatch[1].trim();
    }
    return '';
  }

  /**
   * Inject head content into the main document
   * @private
   * @param {string} mainHtml - Main HTML document
   * @param {string} headContent - Head content to inject
   * @returns {string} HTML with injected head content
   */
  _injectHeadContent(mainHtml, headContent) {
    // Find the closing </head> tag and insert content before it
    return mainHtml.replace(/<\/head>/i, `${headContent}\n</head>`);
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