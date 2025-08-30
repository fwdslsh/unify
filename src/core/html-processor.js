/**
 * HTML File Processor
 * Clean implementation based on example.js reference
 * Implements the DOM Cascade specification for HTML composition
 */

import { FileSystemError } from "./errors.js";
import { SecurityScanner } from "./security-scanner.js";
import { SSIProcessor } from "./ssi-processor.js";
import { HTMLMinifier } from "./html-minifier.js";
import { ShortNameResolver } from "./short-name-resolver.js";
import { HeadMerger } from "./cascade/head-merger.js";
import { createLogger } from '../utils/logger.js';
import { PathValidator } from './path-validator.js';
import { dirname, resolve as pathResolve } from 'path';

/**
 * Maximum nesting depth for layout composition to prevent infinite recursion
 */
const MAX_LAYOUT_DEPTH = 10;

/**
 * HtmlProcessor implements DOM Cascade composition using clean reference architecture
 */
export class HtmlProcessor {
  constructor(pathValidatorOrOptions) {
    // Handle both old signature (pathValidator) and new signature (options)
    if (pathValidatorOrOptions && typeof pathValidatorOrOptions.validateAndResolve === 'function') {
      // Old signature: constructor(pathValidator)
      this.pathValidator = pathValidatorOrOptions;
      this.logger = createLogger('HTML-PROCESSOR');
    } else {
      // New signature: constructor(options)
      const options = pathValidatorOrOptions || {};
      this.pathValidator = options.pathValidator || new PathValidator();
      this.logger = options.logger || createLogger('HTML-PROCESSOR');
    }
    
    this.securityScanner = new SecurityScanner();
    this.htmlMinifier = new HTMLMinifier();
    
    try {
      this.headMerger = new HeadMerger(); // DOM Cascade v1 compliant head merging
      this.logger.debug('HeadMerger initialized successfully', { hasHeadMerger: !!this.headMerger });
    } catch (error) {
      this.logger.error('Failed to initialize HeadMerger', { error: error.message });
      this.headMerger = null;
    }
    
    this.ssiProcessor = null; // Initialize when needed
    this.processingStack = new Set(); // Circular import detection
    // Create logger adapter for ShortNameResolver
    const loggerAdapter = {
      logDebug: (msg, ctx) => this.logger.debug(msg, ctx),
      logInfo: (msg, ctx) => this.logger.info(msg, ctx)
    };
    this.shortNameResolver = new ShortNameResolver(loggerAdapter); // DOM Cascade short name resolution
  }

  /**
   * Main entry point - processes HTML according to DOM Cascade spec
   */
  async processFile(filePath, htmlContent, fileSystem = {}, sourceRoot = '.', options = {}, processingStack = null) {
    try {
      // Initialize SSI processor with source root if not already done
      if (!this.ssiProcessor) {
        this.ssiProcessor = new SSIProcessor(sourceRoot);
      }

      // Create file resolver function for this context
      const htmlProcessor = this; // Capture 'this' for use in closure
      const fileResolver = async (path) => {
        // Try exact path first
        if (fileSystem[path]) {
          return fileSystem[path];
        }
        
        // Handle absolute paths by removing leading slash
        if (path.startsWith('/')) {
          const relativePath = path.substring(1);
          if (fileSystem[relativePath]) {
            return fileSystem[relativePath];
          }
        }
        
        // Handle short name resolution according to DOM Cascade spec
        // Try short name resolution if it doesn't look like a full path
        if (!path.includes('/') && !path.includes('.')) {
          try {
            const currentDir = dirname(filePath);
            const shortNameResult = htmlProcessor.shortNameResolver.resolve(path, currentDir, sourceRoot);
            
            if (shortNameResult.found) {
              // Convert absolute path back to relative path for fileSystem lookup
              const absoluteSourceRoot = pathResolve(sourceRoot);
              const relativePath = shortNameResult.layoutPath.replace(absoluteSourceRoot + '/', '');
              
              // Try various path formats for fileSystem lookup
              const pathsToTry = [
                relativePath,
                shortNameResult.layoutPath,
                relativePath.replace(/^\.\//, ''),
                relativePath.replace(/^\//, '')
              ];
              
              for (const tryPath of pathsToTry) {
                if (fileSystem[tryPath]) {
                  return fileSystem[tryPath];
                }
              }
            }
          } catch (error) {
            // Short name resolution failed, continue with other resolution methods
            htmlProcessor.logger.debug(`Short name resolution failed for "${path}": ${error.message}`);
          }
        }
        
        // Handle relative path resolution from _includes context
        // e.g., base/head.html -> _includes/base/head.html
        // Also try adding .html extension for paths like base/nav -> _includes/base/nav.html
        if (!path.startsWith('_includes/') && !path.startsWith('/')) {
          const includesPath = `_includes/${path}`;
          
          // Try the path as-is first
          if (fileSystem[includesPath]) {
            return fileSystem[includesPath];
          }
          
          // If that fails and path doesn't have extension, try adding .html
          if (!path.includes('.')) {
            const includesPathWithHtml = `_includes/${path}.html`;
            if (fileSystem[includesPathWithHtml]) {
              return fileSystem[includesPathWithHtml];
            }
          }
        }
        
        // Legacy shortname mappings for backward compatibility
        // TODO: Remove once all sites migrate to proper short name resolution
        const legacyMappings = {
          'head-content': '_includes/base/head.html'
        };
        
        if (legacyMappings[path] && fileSystem[legacyMappings[path]]) {
          return fileSystem[legacyMappings[path]];
        }
        
        // Log error with file context before throwing
        htmlProcessor.logger.error(`Layout file not found: ${path}`, { 
          filePath: filePath,
          requestedLayout: path,
          sourceFile: filePath
        });
        throw new FileSystemError(`Layout file not found: ${path}`);
      };

      // Set up processor with context - share processing stack for circular dependency detection
      const processor = new UnifyProcessor({
        baseDir: sourceRoot,
        fileResolver,
        pathValidator: this.pathValidator,
        processingStack: processingStack || this.processingStack
      });

      // Process the HTML
      let result = await processor.process(htmlContent, filePath);

      // Apply post-processing
      if (options.minify) {
        result = this.htmlMinifier.minify(result);
      }

      // Process SSI includes
      let ssiWarnings = [];
      if (result.includes('<!--#include')) {
        const ssiResult = await this.ssiProcessor.processIncludes(result, filePath);
        result = ssiResult.content;
        ssiWarnings = ssiResult.warnings || [];
      }

      // Clean up data-unify attributes
      result = this.cleanupDataUnifyAttributes(result);

      // Security scanning
      const securityWarnings = this.securityScanner.scanForSecurityIssues(result, filePath);
      const allWarnings = [...securityWarnings, ...ssiWarnings];

      return {
        success: true,
        html: result,
        compositionApplied: result !== htmlContent, // True if content was modified
        dependencies: [], // TODO: Extract dependencies
        layoutsProcessed: [], // TODO: Track layouts
        warnings: allWarnings || [],
        securityWarnings: allWarnings || [],
        stats: {
          processingTimeMs: 0,
          layoutCacheHits: 0,
          layoutCacheMisses: 0
        }
      };
    } catch (error) {
      this.logger.error('HTML processing failed', { 
        filePath,
        error: error.message 
      });
      
      // Re-throw security errors (like circular dependency detection) instead of swallowing them
      if (error.message.includes('Circular dependency detected')) {
        throw error;
      }
      
      return {
        success: false,
        error: error.message,
        html: htmlContent, // Return original on error
        dependencies: [],
        layoutsProcessed: [],
        warnings: [],
        stats: {}
      };
    }
  }


  /**
   * Clean up data-unify attributes from final output
   */
  cleanupDataUnifyAttributes(html) {
    // Remove data-unify attributes with both double and single quotes
    return html.replace(/\s*data-unify\s*=\s*["'][^"']*["']/g, '');
  }

  /**
   * Validate composition result for completeness
   */
  validateComposition(html) {
    const issues = [];
    
    // Check for remaining data-unify attributes
    const dataUnifyMatches = html.match(/data-unify\s*=\s*["'][^"']*["']/g);
    if (dataUnifyMatches) {
      issues.push({
        type: 'data-unify-cleanup',
        message: 'Found remaining data-unify attributes in output',
        count: dataUnifyMatches.length
      });
    }
    
    // Check for unresolved component imports
    const componentPlaceholders = html.match(/<[^>]+data-unify[^>]*>/g);
    if (componentPlaceholders) {
      issues.push({
        type: 'unresolved-imports',
        message: 'Found unresolved component import placeholders',
        count: componentPlaceholders.length
      });
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Get cache statistics (for backward compatibility)
   */
  getCacheStats() {
    return {
      cacheHits: 0,
      cacheMisses: 0,
      cacheSize: 0,
      ssiCacheHits: this.ssiProcessor?.stats?.cacheHits || 0,
      ssiCacheMisses: this.ssiProcessor?.stats?.cacheMisses || 0,
      ssiIncludesProcessed: this.ssiProcessor?.stats?.successfulIncludes || 0,
      ssiWarnings: this.ssiProcessor?.stats?.warningsCount || 0,
      ssiStats: {
        cacheHits: this.ssiProcessor?.stats?.cacheHits || 0,
        cacheMisses: this.ssiProcessor?.stats?.cacheMisses || 0,
        totalDirectives: this.ssiProcessor?.stats?.totalDirectives || 0,
        successfulIncludes: this.ssiProcessor?.stats?.successfulIncludes || 0,
        failedIncludes: this.ssiProcessor?.stats?.failedIncludes || 0
      }
    };
  }

  /**
   * Clear all caches (for backward compatibility)
   */
  clearCache() {
    if (this.ssiProcessor) {
      this.ssiProcessor.clearCache?.();
    }
  }
}

/**
 * DOM Cascade Processor - Clean implementation from reference
 */
export class UnifyProcessor {
  constructor(options = {}) {
    this.baseDir = options.baseDir || '/';
    this.sourceRoot = options.sourceRoot || this.baseDir;
    this.fileResolver = options.fileResolver || this.defaultFileResolver;
    this.pathValidator = options.pathValidator;
    this.lintRules = options.lintRules || {};
    this.processingStack = options.processingStack || new Set(); // Track circular imports - shared if provided
    
    // Initialize ShortNameResolver with logger
    this.logger = createLogger('HTML-PROCESSOR');
    this.shortNameResolver = new ShortNameResolver(this.logger);
  }

  /**
   * Main entry point - processes HTML according to Unify spec
   */
  async process(htmlString, filePath = '') {
    // Use HTMLRewriter for quick analysis
    const analysis = await this.analyzeUnifyElements(htmlString);
    
    if (!analysis.hasUnifyElement) {
      return htmlString; // No Unify processing needed
    }

    const usesLayout = analysis.usesLayout;
    const hasComponentImports = analysis.componentImports.length > 0;
    
    if (usesLayout) {
      // This page uses a layout - process layout composition first
      return await this.processLayout(htmlString, filePath);
    } else if (hasComponentImports) {
      // Page/fragment with only component imports (no layout)
      return await this.processComponentImports(htmlString);
    } else {
      // This shouldn't happen - hasUnifyElement but no layout or components?
      return htmlString;
    }
  }

  /**
   * Analyze HTML for Unify elements using HTMLRewriter
   */
  async analyzeUnifyElements(htmlString) {
    let hasUnifyElement = false;
    let usesLayout = false;
    const componentImports = [];
    
    const analyzer = new HTMLRewriter()
      .on('[data-unify]', {
        element(element) {
          hasUnifyElement = true;
          const tagName = element.tagName.toLowerCase();
          const path = element.getAttribute('data-unify');
          
          if (tagName === 'html' || tagName === 'body') {
            // This page USES a layout
            usesLayout = true;
          } else {
            // This is a component import
            componentImports.push({ path, tagName });
          }
        }
      });
    
    await analyzer.transform(new Response(htmlString)).text();
    
    return { hasUnifyElement, usesLayout, componentImports };
  }

  /**
   * Process layout chain (outermost first)
   */
  async processLayout(pageHtml, pagePath) {
    // Step 1: Merge page into site layout
    const pageDoc = this.parseHTML(pageHtml);
    const pageUnifyElement = this.querySelector(pageDoc, '[data-unify]');
    
    if (!pageUnifyElement) {
      return pageHtml;
    }
    
    const siteLayoutPath = this.getAttribute(pageUnifyElement, 'data-unify');
    
    // Check for circular imports
    this.logger.debug(`Checking circular dependency for site layout`, { 
      siteLayoutPath, 
      currentStack: Array.from(this.processingStack) 
    });
    if (this.processingStack.has(siteLayoutPath)) {
      throw new Error(`Circular dependency detected: ${siteLayoutPath}`);
    }
    
    this.processingStack.add(siteLayoutPath);
    const siteLayoutHtml = await this.fileResolver(siteLayoutPath);
    let result = await this.mergeIntoLayout(siteLayoutHtml, pageHtml);
    this.logger.debug('Step 1 merge result:', { 
      resultLength: result.length, 
      preview: result.substring(0, 500),
      hasPageHeader: result.includes('page-header')
    });
    // Don't remove from processing stack yet - need to check for nested layouts
    
    // Step 2: Check if site layout has a parent layout
    const siteDoc = this.parseHTML(siteLayoutHtml);
    const siteUnifyElement = this.querySelector(siteDoc, 'html[data-unify], body[data-unify]');
    
    if (siteUnifyElement) {
      const rootLayoutPath = this.getAttribute(siteUnifyElement, 'data-unify');
      
      // Check for circular imports
      this.logger.debug(`Checking circular dependency for root layout`, { 
        rootLayoutPath, 
        currentStack: Array.from(this.processingStack) 
      });
      if (this.processingStack.has(rootLayoutPath)) {
        throw new Error(`Circular dependency detected: ${rootLayoutPath}`);
      }
      
      this.processingStack.add(rootLayoutPath);
      const rootLayoutHtml = await this.fileResolver(rootLayoutPath);
      
      // Merge site layout head into root layout first
      const rootDoc = this.parseHTML(rootLayoutHtml);
      const siteHead = this.querySelector(siteDoc, 'head');
      if (siteHead) {
        const siteHeadData = this.extractHeadData(siteHead);
        this.mergeHead(rootDoc, siteHeadData);
      }
      
      const modifiedRootHtml = this.serializeHTML(rootDoc);
      
      // For the root merge, merge the intermediate result (page + page layout) into root layout
      result = await this.mergeIntoLayout(modifiedRootHtml, result);
      
      // Check for further nesting - process recursively
      const rootUnifyElement = this.querySelector(rootDoc, 'html[data-unify], body[data-unify]');
      if (rootUnifyElement) {
        // Root layout has another parent - process recursively
        result = await this.processLayout(result, pagePath);
      }
      
      // Clean up processing stack for nested layout
      this.processingStack.delete(rootLayoutPath);
    }
    
    // Clean up processing stack for main layout
    this.processingStack.delete(siteLayoutPath);
    
    return result;
  }

  /**
   * Process component imports
   */
  async processComponent(hostHtml, hostPath) {
    let result = hostHtml;
    
    // Get component imports using analysis
    const analysis = await this.analyzeUnifyElements(hostHtml);
    
    for (const importInfo of analysis.componentImports) {
      // Check for circular imports
      if (this.processingStack.has(importInfo.path)) {
        throw new Error(`Circular dependency detected: ${importInfo.path}`);
      }
      
      this.processingStack.add(importInfo.path);
      const componentHtml = await this.fileResolver(importInfo.path);
      result = await this.mergeComponent(result, componentHtml, importInfo.path);
      this.processingStack.delete(importInfo.path);
    }
    
    return result;
  }

  /**
   * Merge page content into layout
   */
  async mergeIntoLayout(layoutHtml, pageHtml, siteContentHtml = null) {
    const layoutDoc = this.parseHTML(layoutHtml);
    const pageDoc = this.parseHTML(pageHtml);
    
    const pageBody = this.querySelector(pageDoc, 'body');
    const pageHead = this.querySelector(pageDoc, 'head');
    
    // Debug: Log page body content to see if landmarks are present
    if (pageBody) {
      const bodyInnerHTML = pageBody.innerHTML || '';
      if (bodyInnerHTML.includes('<header>') || bodyInnerHTML.includes('<nav>') || 
          bodyInnerHTML.includes('<aside>') || bodyInnerHTML.includes('<footer>')) {
        this.logger.debug('Page body contains landmark elements', { 
          preview: bodyInnerHTML.substring(0, 300) 
        });
      }
    }
    
    if (!pageBody) return layoutHtml;
    
    // Extract page structure
    const pageStructure = this.extractPageStructure(pageBody, pageHead);
    
    // Merge HTML and body element attributes (page wins per DOM Cascade v1)
    this.mergeRootElementAttributes(layoutDoc, pageStructure);
    
    // Apply merging rules
    this.applyAreaMatching(layoutDoc, pageStructure);
    this.applyLandmarkMatching(layoutDoc, pageStructure);
    this.applyOrderedFill(layoutDoc, pageStructure);
    this.mergeHead(layoutDoc, pageStructure.head);
    
    // If we have site content, merge main content from it
    if (siteContentHtml) {
      const siteDoc = this.parseHTML(siteContentHtml);
      const siteBody = this.querySelector(siteDoc, 'body');
      const siteMain = this.querySelector(siteBody, 'main');
      const layoutMain = this.querySelector(layoutDoc, 'main');
      
      if (siteMain && layoutMain) {
        // Replace layout main with site main content
        this.clearChildren(layoutMain);
        const children = Array.from(siteMain.childNodes);
        for (const child of children) {
          if (child && typeof child.cloneNode === 'function') {
            layoutMain.appendChild(child.cloneNode(true));
          }
        }
      }
    }
    
    // Process any component imports in the merged result
    let result = this.serializeHTML(layoutDoc);
    
    result = await this.processComponentImports(result);
    
    return result;
  }

  /**
   * Process component imports in HTML
   */
   async processComponentImports(htmlString) {
    let result = htmlString;
    let allComponentHeads = [];
    let iterationCount = 0;
    
    // Keep processing until no more component imports are found
    while (true) {
      iterationCount++;
      if (iterationCount > 100) {
        throw new Error(`Infinite loop detected in component processing after ${iterationCount} iterations`);
      }
      
      const analysis = await this.analyzeUnifyElements(result);
      if (analysis.componentImports.length === 0) break;
      
      // Process first component import found
      const importInfo = analysis.componentImports[0];
      
      // Check for circular imports
      if (this.processingStack.has(importInfo.path)) {
        throw new Error(`Circular dependency detected: ${importInfo.path}`);
      }
      
      this.processingStack.add(importInfo.path);
      const componentHtml = await this.fileResolver(importInfo.path);
      this.processingStack.delete(importInfo.path);
      
      // Extract component head data before merging
      const componentDoc = this.parseHTML(componentHtml);
      
      // Components can have head elements in their <head> or as direct children
      let componentHeadData = null;
      const componentHead = this.querySelector(componentDoc, 'head');
      
      if (componentHead) {
        // Component has proper <head> element
        componentHeadData = this.extractHeadData(componentHead);
      } else {
        // Component may have head elements (link, style, script) as direct children
        // This is common for fragments that don't have full HTML structure
        componentHeadData = this.extractHeadData(componentDoc.documentElement || componentDoc);
      }
      
      if (componentHeadData && (componentHeadData.styles?.length > 0 || componentHeadData.scripts?.length > 0 || componentHeadData.metas?.length > 0)) {
        this.logger.debug('Component head data extracted', { 
          componentPath: importInfo.path,
          headData: componentHeadData,
          stylesCount: componentHeadData.styles?.length || 0
        });
        allComponentHeads.push(componentHeadData);
      }
      
      result = await this.mergeComponent(result, componentHtml, importInfo.path);
    }
    
    // Merge all component heads using DOM Cascade v1 compliant head merging
    // Note: This handles components but layout+page merge happens in mergeIntoLayout
    // TODO: Refactor to collect all heads (layout, components, page) and merge once
    if (allComponentHeads.length > 0) {
      const finalDoc = this.parseHTML(result);
      const currentHead = this.querySelector(finalDoc, 'head');
      const currentHeadData = currentHead ? this.extractHeadData(currentHead) : null;
      
      if (currentHeadData) {
        this.logger.debug('Merging component heads using DOM Cascade v1', {
          currentHeadStylesCount: currentHeadData.styles?.length || 0,
          componentHeadsCount: allComponentHeads.length,
          totalComponentStyles: allComponentHeads.reduce((sum, head) => sum + (head.styles?.length || 0), 0),
          hasHeadMerger: !!this.headMerger,
          headMergerType: typeof this.headMerger,
          hasMethod: this.headMerger && typeof this.headMerger.mergeWithComponents === 'function'
        });
        
        // Use proper DOM Cascade v1 head merging: current (layout+page) + components
        // This is a partial fix - proper fix would collect layout, components, page separately
        let merged;
        // HOTFIX: Reinitialize HeadMerger if it becomes null (likely due to test environment issues)
        if (!this.headMerger) {
          try {
            this.headMerger = new HeadMerger();
            this.logger.debug('HeadMerger reinitialized during processing');
          } catch (error) {
            this.logger.error('Failed to reinitialize HeadMerger', { error: error.message });
            this.headMerger = null;
          }
        }
        
        if (this.headMerger && typeof this.headMerger.mergeWithComponents === 'function') {
          merged = this.headMerger.mergeWithComponents(
            currentHeadData, // Current head (already contains layout+page merge)
            allComponentHeads, // Component heads
            {} // No additional page head at this point
          );
        } else {
          // Fallback to basic merging if HeadMerger is not available
          this.logger.warn('HeadMerger not available, falling back to basic component head merging with deduplication');
          merged = { ...currentHeadData };
          
          // Deduplicate styles by href attribute
          const seenHrefs = new Set();
          const allStyles = [...(merged.styles || [])];
          
          // Add current styles to seen hrefs
          for (const style of merged.styles || []) {
            const href = this._extractHrefFromStyle(style);
            if (href) {
              seenHrefs.add(href);
              this.logger.debug('Added existing style to dedup set', { href });
            }
          }
          
          // Add component styles with deduplication
          for (const componentHead of allComponentHeads) {
            if (componentHead.styles && componentHead.styles.length > 0) {
              for (const style of componentHead.styles) {
                const href = this._extractHrefFromStyle(style);
                if (href && !seenHrefs.has(href)) {
                  seenHrefs.add(href);
                  allStyles.push(style);
                  this.logger.debug('Added new component style', { href });
                } else if (href && seenHrefs.has(href)) {
                  this.logger.debug('Skipped duplicate component style', { href });
                } else if (!href) {
                  // Include non-link styles (like inline <style> tags) without deduplication for now
                  allStyles.push(style);
                  this.logger.debug('Added non-link component style', { stylePreview: style });
                }
              }
            }
          }
          
          merged.styles = allStyles;
        }
        
        this.logger.debug('Head merge completed', {
          mergedStylesCount: merged.styles?.length || 0,
          mergedLinksCount: merged.links?.length || 0,
          mergedStructure: {
            title: merged.title,
            hasStyles: !!merged.styles,
            stylesType: typeof merged.styles,
            stylesPreview: merged.styles ? merged.styles.slice(0, 2) : null
          }
        });
        
        // Replace head content with properly merged result
        this.replaceHeadContent(finalDoc, merged);
        result = this.serializeHTML(finalDoc);
      }
    }
    
    return result;
  }

  /**
   * Merge component into host
   */
  async mergeComponent(hostHtml, componentHtml, componentPath) {
    const hostDoc = this.parseHTML(hostHtml);
    const componentDoc = this.parseHTML(componentHtml);
    
    // Find host element with data-unify attribute pointing to this component
    const hostElement = this.querySelector(hostDoc, `[data-unify="${componentPath}"]`);
    if (!hostElement) {
      return hostHtml;
    }
    
    
    // Extract host areas for merging
    const hostAreas = this.extractAreas(hostElement);
    
    // Handle component fragments (with or without body wrapper)
    let componentElements = [];
    const componentBody = this.querySelector(componentDoc, 'body');
    
    if (componentBody) {
      // Component has body wrapper - get all children
      componentElements = Array.from(componentBody.children);
    } else {
      // Component is a fragment - get all root elements
      // For fragments, we need to get all direct children of the document
      const docElement = componentDoc.documentElement || componentDoc;
      if (docElement.children && docElement.children.length > 0) {
        componentElements = Array.from(docElement.children);
      } else {
        // Fallback: get all top-level elements
        componentElements = Array.from(componentDoc.querySelectorAll('body > *, html > head > *, html > body > *')).filter(el => el.parentNode === componentDoc.documentElement || el.parentNode === componentDoc.body || el.parentNode === componentDoc.head);
        
        // If still no elements, try getting all direct children
        if (componentElements.length === 0) {
          componentElements = Array.from(componentDoc.childNodes).filter(node => node.nodeType === 1); // Element nodes only
        }
      }
    }
    
    if (componentElements.length === 0) {
      return hostHtml;
    }

    // DOM Cascade specification: Use component as base structure, only replace matching areas
    const parent = hostElement.parentNode;
    
    // Find appropriate component element based on context
    let baseElement;
    
    // If host is in body context, filter out head elements from component
    const isInBodyContext = this.isElementInBodyContext(hostElement);
    if (isInBodyContext) {
      // Filter out head elements from component elements
      const bodyElements = componentElements.filter(el => 
        el.tagName && el.tagName.toLowerCase() !== 'head'
      );
      baseElement = bodyElements[0] || componentElements[0];
    } else {
      // Use first element as fallback
      baseElement = componentElements[0];
    }
    
    if (!baseElement || typeof baseElement.cloneNode !== 'function') {
      return hostHtml;
    }
    
    const clonedBase = baseElement.cloneNode(true);
    // Strip HTML comments from component imports per DOM Cascade spec
    this.stripCommentsFromComponent(clonedBase);
    
    // Apply area matching: replace areas in the component base with host areas
    this.applyComponentAreaMatching(clonedBase, hostAreas);
    
    // Replace the host element with the modified component base
    parent.insertBefore(clonedBase, hostElement);
    
    // If there are additional component elements, insert them too (but not the base element)
    // This handles cases where components have multiple root elements
    for (const element of componentElements) {
      if (element !== baseElement && element && typeof element.cloneNode === 'function') {
        const clonedElement = element.cloneNode(true);
        this.stripCommentsFromComponent(clonedElement);
        this.applyComponentAreaMatching(clonedElement, hostAreas);
        parent.insertBefore(clonedElement, hostElement);
      }
    }
    
    // Remove the original host element
    hostElement.remove();
    
    return this.serializeHTML(hostDoc);
  }

  /**
   * Extract page structure for merging
   */
  extractPageStructure(pageBody, pageHead) {
    // Also extract HTML and body element attributes for merging
    const pageDoc = pageBody.ownerDocument || pageBody;
    const htmlElement = this.querySelector(pageDoc, 'html');
    const bodyElement = pageBody;
    
    const htmlAttributes = htmlElement ? this.getAttributes(htmlElement) : new Map();
    const bodyAttributes = bodyElement ? this.getAttributes(bodyElement) : new Map();
    
    // Debug logging for attribute extraction
    if (htmlAttributes.size > 0 || bodyAttributes.size > 0) {
      this.logger.debug('Extracted page element attributes', {
        htmlAttributes: Object.fromEntries(htmlAttributes),
        bodyAttributes: Object.fromEntries(bodyAttributes)
      });
    }
    
    const areas = this.extractAreas(pageBody);
    const landmarks = this.extractLandmarks(pageBody);
    
    // Debug: Log page structure extraction results (only for complex cases)
    // if (landmarks.size > 0) {
    //   this.logger.debug('Page structure extraction results', {
    //     areasFound: areas.size,
    //     areaNames: Array.from(areas.keys()),
    //     landmarksFound: landmarks.size,
    //     landmarkNames: Array.from(landmarks.keys())
    //   });
    // }
    
    const structure = {
      areas,
      landmarks,
      orderedSections: this.extractOrderedSections(pageBody),
      head: this.extractHeadData(pageHead),
      htmlAttributes,
      bodyAttributes
    };
    
    return structure;
  }

  /**
   * Extract area elements (class-based matching)
   * Per DOM Cascade v1: Area elements are extracted from main content to prevent duplication
   */
  extractAreas(container) {
    const areas = new Map();
    const elements = this.querySelectorAll(container, '[class*="unify-"]');
    const elementsToRemove = [];
    
    // Debug: Log area class detection
    if (elements.length > 0) {
      this.logger.debug('Found elements with unify- classes', {
        count: elements.length,
        classes: elements.map(el => this.getAttribute(el, 'class'))
      });
    }
    
    for (const el of elements) {
      const classes = (this.getAttribute(el, 'class') || '').split(' ');
      const areaClass = classes.find(cls => cls.startsWith('unify-'));
      
      if (areaClass) {
        this.logger.debug('Found area class', { areaClass });
        if (areas.has(areaClass)) {
          // Multiple elements with same area class - combine them
          const existing = areas.get(areaClass);
          this.logger.debug('Combining area elements', {
            areaClass,
            existingHTML: existing.innerHTML?.substring(0, 100) || '',
            newHTML: el.innerHTML?.substring(0, 100) || ''
          });
          const combined = this.combineElements(existing, el);
          this.logger.debug('Combined result', {
            combinedHTML: combined.innerHTML?.substring(0, 100) || ''
          });
          areas.set(areaClass, combined);
        } else {
          // Clone the element to preserve content for merging
          const clonedElement = el.cloneNode(true);
          areas.set(areaClass, clonedElement);
        }
        
        // Mark element for removal from main content to prevent duplication
        elementsToRemove.push(el);
      }
    }
    
    // Remove area elements from container to prevent content duplication
    // This ensures area content appears only in matched layout areas, not in main content
    for (const el of elementsToRemove) {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
    
    // Collect remaining content after area extraction and create synthetic unify-content area
    // This handles the case where page has area elements plus additional content
    // Skip synthetic area creation if landmarks are present (to allow landmark matching)
    const hasLandmarks = this.extractLandmarks(container).size > 0;
    const remainingChildren = Array.from(container.childNodes).filter(child => 
      child.nodeType === 1 || // Element nodes
      (child.nodeType === 3 && child.textContent.trim()) // Non-empty text nodes
    );
    
    if (remainingChildren.length > 0 && !areas.has('unify-content') && !hasLandmarks) {
      // Create synthetic container for remaining content (only when no landmarks present)
      const syntheticContentElement = container.ownerDocument.createElement('div');
      syntheticContentElement.setAttribute('class', 'unify-content');
      
      // Move remaining content to synthetic element
      for (const child of remainingChildren) {
        syntheticContentElement.appendChild(child.cloneNode(true));
      }
      
      areas.set('unify-content', syntheticContentElement);
    }
    
    return areas;
  }

  /**
   * Extract landmark elements
   */
  extractLandmarks(container) {
    const landmarks = new Map();
    const landmarkTags = ['header', 'nav', 'main', 'aside', 'footer'];
    
    // Debug: Log container HTML to see what we're searching in
    if (container && (container.innerHTML || '').includes('<header>')) {
      this.logger.debug('extractLandmarks called with container containing header', {
        containerHTML: (container.innerHTML || '').substring(0, 500)
      });
    }
    
    for (const tag of landmarkTags) {
      const elements = this.querySelectorAll(container, tag);
      // Debug: Log landmark detection
      this.logger.debug(`Searching for ${tag} elements`, {
        found: elements.length,
        containerHasTag: (container.innerHTML || '').includes(`<${tag}`)
      });
      if (elements.length > 0) {
        this.logger.debug(`Found ${elements.length} ${tag} elements in page body`, {
          hasAreaClass: elements.map(el => this.hasAreaClass(el))
        });
      }
      // Only use if unique and doesn't have area class
      if (elements.length === 1 && !this.hasAreaClass(elements[0])) {
        landmarks.set(tag, elements[0]);
        this.logger.debug(`Added landmark ${tag} to page structure`);
      }
    }
    
    this.logger.debug(`Extracted landmarks from page body`, { count: landmarks.size, tags: Array.from(landmarks.keys()) });
    return landmarks;
  }
  
  /**
   * Extract area elements debug
   */
  extractAreasDebug(container) {
    this.logger.debug('=== DEBUG extractAreas called ===');
    const areas = this.extractAreas(container);
    this.logger.debug('=== Final areas found ===', { 
      count: areas.size, 
      areaNames: Array.from(areas.keys()) 
    });
    return areas;
  }

  /**
   * Extract ordered sections from main
   */
  extractOrderedSections(container) {
    const main = this.querySelector(container, 'main');
    if (!main) return [];
    
    const sections = this.querySelectorAll(main, ':scope > section')
      .filter(section => !this.hasAreaClass(section));
    
    return sections;
  }

  /**
   * Extract head data
   */
  extractHeadData(head) {
    if (!head) return { title: null, metas: [], styles: [], scripts: [], components: [] };
    
    const title = this.querySelector(head, 'title');
    const metas = this.querySelectorAll(head, 'meta');
    const styles = this.querySelectorAll(head, 'style, link[rel="stylesheet"]')
      .filter(el => !this.getAttribute(el, 'data-unify-docs'));
    const scripts = this.querySelectorAll(head, 'script');
    
    // Extract component imports (elements with data-unify attributes)
    const components = this.querySelectorAll(head, '[data-unify]')
      .filter(el => 
        // Exclude elements already handled by other categories
        !['meta', 'link', 'style', 'script', 'title'].includes(el.tagName?.toLowerCase())
      );
    
    return {
      title: title ? this.getTextContent(title) : null,
      metas: metas.filter(meta => 
        this.getAttribute(meta, 'name') || 
        this.getAttribute(meta, 'property') || 
        this.getAttribute(meta, 'http-equiv')
      ).map(meta => ({
        element: meta,
        key: this.getAttribute(meta, 'name') || 
             this.getAttribute(meta, 'property') || 
             this.getAttribute(meta, 'http-equiv')
      })),
      styles,
      scripts,
      components
    };
  }

  /**
   * Apply area-based matching
   */
  applyAreaMatching(layoutDoc, pageStructure) {
    this.logger.debug('applyAreaMatching called', {
      areaCount: pageStructure.areas.size,
      areaClasses: Array.from(pageStructure.areas.keys())
    });
    
    for (const [areaClass, pageElement] of pageStructure.areas) {
      const hostElement = this.querySelector(layoutDoc, `.${areaClass}`);
      this.logger.debug('Area matching attempt', {
        areaClass,
        hostElementFound: !!hostElement,
        pageElementExists: !!pageElement
      });
      
      if (hostElement) {
        this.logger.debug('Merging area elements', {
          areaClass,
          hostInnerHTML: hostElement.innerHTML?.substring(0, 100) || '',
          pageInnerHTML: pageElement.innerHTML?.substring(0, 100) || ''
        });
        this.mergeElements(hostElement, pageElement);
      } else {
        this.logger.debug('No host element found for area', { areaClass });
      }
    }
  }

  /**
   * Apply landmark-based matching
   */
  applyLandmarkMatching(layoutDoc, pageStructure) {
    // Debug: Log landmark matching attempt
    this.logger.debug('applyLandmarkMatching called', {
      pageLandmarkCount: pageStructure.landmarks.size,
      pageLandmarkTags: Array.from(pageStructure.landmarks.keys()),
      pageAreasCount: pageStructure.areas.size
    });
    
    // Always check for main landmark matching when main elements exist
    if (pageStructure.landmarks.has('main')) {
      const pageMain = pageStructure.landmarks.get('main');
      const layoutMain = this.querySelector(layoutDoc, 'main');
      this.logger.debug('main landmark matching', { 
        hasPageMain: !!pageMain, 
        hasLayoutMain: !!layoutMain, 
        layoutMainHasAreaClass: layoutMain ? this.hasAreaClass(layoutMain) : false 
      });
      if (layoutMain && pageMain && !this.hasAreaClass(layoutMain)) {
        // Replace the entire content of main with page main content
        this.logger.debug('Replacing main landmark content');
        this.clearChildren(layoutMain);
        const children = this.getChildren(pageMain);
        for (const child of children) {
          this.appendWithFormatting(layoutMain, child);
        }
      }
    }
    
    // Handle other landmarks only when no area matching occurred
    if (pageStructure.areas.size === 0) {
      this.logger.debug('Applying landmark matching - no area classes present');
      for (const [tagName, pageElement] of pageStructure.landmarks) {
        if (tagName === 'main') continue; // Already handled above
        const hostElements = this.querySelectorAll(layoutDoc, tagName);
        this.logger.debug(`Processing ${tagName} landmark`, {
          hostElementsFound: hostElements.length,
          hostElementsWithoutAreaClass: hostElements.filter(e => !this.hasAreaClass(e)).length
        });
        // Find unique landmark without area class
        const hostElement = hostElements.find(el => 
          !this.hasAreaClass(el) && 
          hostElements.filter(e => !this.hasAreaClass(e)).length === 1
        );
        
        if (hostElement) {
          this.logger.debug(`Merging ${tagName} landmark from page to layout`);
          this.mergeElements(hostElement, pageElement);
        } else {
          this.logger.debug(`No suitable host element found for ${tagName} landmark`);
        }
      }
    } else {
      this.logger.debug('Skipping landmark matching - area classes present', { areaCount: pageStructure.areas.size });
    }
  }

  /**
   * Apply ordered fill
   */
  applyOrderedFill(layoutDoc, pageStructure) {
    if (pageStructure.areas.size > 0 || pageStructure.landmarks.size > 0) return;
    
    const layoutMain = this.querySelector(layoutDoc, 'main');
    if (!layoutMain) return;
    
    const layoutSections = this.querySelectorAll(layoutMain, ':scope > section')
      .filter(section => !this.hasAreaClass(section));
    
    // Map sections by index
    for (let i = 0; i < pageStructure.orderedSections.length; i++) {
      if (layoutSections[i]) {
        this.mergeElements(layoutSections[i], pageStructure.orderedSections[i]);
      } else {
        // Append extra sections with proper formatting
        this.appendWithFormatting(layoutMain, pageStructure.orderedSections[i]);
      }
    }
  }

  /**
   * Apply component area matching
   */
  applyComponentAreaMatching(componentRoot, hostAreas) {
    for (const [areaClass, hostElement] of hostAreas) {
      const componentElement = this.querySelector(componentRoot, `.${areaClass}`);
      if (componentElement) {
        // Replace the component area with the host area content
        this.mergeElements(componentElement, hostElement);
      }
    }
  }

  /**
   * Check if element is in body context (not in head)
   */
  isElementInBodyContext(element) {
    let current = element;
    while (current && current.parentNode) {
      if (current.parentNode.tagName && current.parentNode.tagName.toLowerCase() === 'head') {
        return false;
      }
      if (current.parentNode.tagName && current.parentNode.tagName.toLowerCase() === 'body') {
        return true;
      }
      current = current.parentNode;
    }
    return true; // Default to body context if uncertain
  }

  /**
   * Merge head content
   */
  mergeHead(layoutDoc, pageHeadData) {
    const layoutHead = this.querySelector(layoutDoc, 'head');
    if (!layoutHead || !pageHeadData) return;

    // --- Title: page wins ---
    if (pageHeadData.title) {
      let titleEl = this.querySelector(layoutHead, 'title');
      if (!titleEl) {
        titleEl = this.createElement('title');
        this.appendChild(layoutHead, titleEl);
      }
      this.setTextContent(titleEl, pageHeadData.title);
    }

    // --- Meta tags: page overrides matching entries ---
    for (const meta of pageHeadData.metas) {
      const key = meta.key;
      const nameAttr = this.getAttribute(meta.element, 'name');
      const propertyAttr = this.getAttribute(meta.element, 'property');
      const httpEquivAttr = this.getAttribute(meta.element, 'http-equiv');
      
      const selector =
        nameAttr ? `meta[name="${key}"]` :
        propertyAttr ? `meta[property="${key}"]` :
        httpEquivAttr ? `meta[http-equiv="${key}"]` : null;
        
      if (selector) {
        const existing = this.querySelector(layoutHead, selector);
        if (existing) {
          this.replaceElement(existing, meta.element);
        } else {
          this.appendChild(layoutHead, meta.element);
        }
      }
    }

    // --- Styles: append page styles (skip docs styles) ---
    for (const style of pageHeadData.styles) {
      // Deduplicate by href for <link>
      if (style.tagName === 'LINK') {
        const href = this.getAttribute(style, 'href');
        if (href && this.querySelector(layoutHead, `link[href="${href}"]`)) continue;
      } else if (style.tagName === 'STYLE') {
        // Deduplicate by content for <style>
        const styleContent = this.getTextContent(style);
        const existing = Array.from(this.querySelectorAll(layoutHead, 'style')).find(existingStyle => 
          this.getTextContent(existingStyle).trim() === styleContent.trim()
        );
        if (existing) continue;
      }
      this.appendChild(layoutHead, style);
    }

    // --- Scripts: append page scripts (dedupe by src and content hash) ---
    for (const script of pageHeadData.scripts) {
      const src = this.getAttribute(script, 'src');
      
      // External script: deduplicate by src attribute
      if (src) {
        if (this.querySelector(layoutHead, `script[src="${src}"]`)) continue;
      } else {
        // Inline script: deduplicate by content hash per DOM Cascade v1 spec
        const pageScriptContent = this.getTextContent(script);
        if (pageScriptContent.trim()) {
          // Check if any layout script has the same content
          const existingScripts = this.querySelectorAll(layoutHead, 'script:not([src])');
          const isDuplicate = existingScripts.some(existingScript => {
            const existingContent = this.getTextContent(existingScript);
            return existingContent.trim() === pageScriptContent.trim();
          });
          
          if (isDuplicate) continue; // Skip duplicate inline script
        }
      }
      
      this.appendChild(layoutHead, script);
    }
    
    // --- Components: append component import elements (elements with data-unify attributes) ---
    for (const component of pageHeadData.components || []) {
      // Component imports should be preserved in the head for later processing
      this.appendChild(layoutHead, component);
    }
  }

  /**
   * Merge HTML and body element attributes from page to layout (page wins per DOM Cascade v1)
   */
  mergeRootElementAttributes(layoutDoc, pageStructure) {
    this.logger.debug('Merging root element attributes', {
      htmlAttributeCount: pageStructure.htmlAttributes?.size || 0,
      bodyAttributeCount: pageStructure.bodyAttributes?.size || 0,
      htmlAttributes: pageStructure.htmlAttributes ? Object.fromEntries(pageStructure.htmlAttributes) : {},
      bodyAttributes: pageStructure.bodyAttributes ? Object.fromEntries(pageStructure.bodyAttributes) : {}
    });
    // Merge HTML element attributes
    if (pageStructure.htmlAttributes.size > 0) {
      const layoutHtml = this.querySelector(layoutDoc, 'html');
      if (layoutHtml) {
        for (const [name, value] of pageStructure.htmlAttributes) {
          if (name === 'data-unify') {
            // Skip data-unify attributes - these are processing directives
            continue;
          } else if (name === 'id') {
            // Keep layout id if it exists, use page id only if layout lacks one
            if (!this.getAttribute(layoutHtml, 'id')) {
              this.setAttribute(layoutHtml, 'id', value);
            }
          } else if (name === 'class') {
            // Union of classes
            const layoutClasses = (this.getAttribute(layoutHtml, 'class') || '').split(' ').filter(Boolean);
            const pageClasses = value.split(' ').filter(Boolean);
            const mergedClasses = [...new Set([...layoutClasses, ...pageClasses])];
            this.setAttribute(layoutHtml, 'class', mergedClasses.join(' '));
          } else {
            // Page wins for other attributes
            this.setAttribute(layoutHtml, name, value);
          }
        }
      }
    }

    // Merge body element attributes
    if (pageStructure.bodyAttributes.size > 0) {
      const layoutBody = this.querySelector(layoutDoc, 'body');
      if (layoutBody) {
        for (const [name, value] of pageStructure.bodyAttributes) {
          if (name === 'data-unify') {
            // Skip data-unify attributes - these are processing directives
            continue;
          } else if (name === 'id') {
            // Keep layout id if it exists, use page id only if layout lacks one
            if (!this.getAttribute(layoutBody, 'id')) {
              this.setAttribute(layoutBody, 'id', value);
            }
          } else if (name === 'class') {
            // Union of classes
            const layoutClasses = (this.getAttribute(layoutBody, 'class') || '').split(' ').filter(Boolean);
            const pageClasses = value.split(' ').filter(Boolean);
            const mergedClasses = [...new Set([...layoutClasses, ...pageClasses])];
            this.setAttribute(layoutBody, 'class', mergedClasses.join(' '));
          } else {
            // Page wins for other attributes
            this.setAttribute(layoutBody, name, value);
          }
        }
      }
    }
  }

  /**
   * Merge two elements according to spec
   */
  mergeElements(hostElement, pageElement) {
    // Collect ID mappings for reference rewriting
    const idMappings = this.collectIdMappings(hostElement, pageElement);
    
    // Merge attributes (page wins except id)
    this.mergeAttributes(hostElement, pageElement);
    
    // Replace children - use childNodes to include text nodes
    this.clearChildren(hostElement);
    const childNodes = Array.from(pageElement.childNodes);
    for (const child of childNodes) {
      if (child && typeof child.cloneNode === 'function') {
        const clonedChild = child.cloneNode(true);
        // Rewrite any ID references in the cloned content
        this.rewriteIdReferences(clonedChild, idMappings);
        hostElement.appendChild(clonedChild);
      }
    }
  }

  /**
   * Collect ID mappings between page and host elements
   */
  collectIdMappings(hostElement, pageElement) {
    const mappings = new Map();
    const hostId = this.getAttribute(hostElement, 'id');
    const pageId = this.getAttribute(pageElement, 'id');
    
    // If both elements have IDs, map page ID to host ID
    if (hostId && pageId && hostId !== pageId) {
      mappings.set(pageId, hostId);
    }
    
    // Recursively collect ID mappings from children
    // This handles cases where nested elements also have IDs that need mapping
    const hostChildren = this.getChildren(hostElement);
    const pageChildren = this.getChildren(pageElement);
    
    for (let i = 0; i < Math.min(hostChildren.length, pageChildren.length); i++) {
      const childMappings = this.collectIdMappings(hostChildren[i], pageChildren[i]);
      for (const [pageId, hostId] of childMappings) {
        mappings.set(pageId, hostId);
      }
    }
    
    return mappings;
  }

  /**
   * Rewrite ID references in content based on mappings
   */
  rewriteIdReferences(element, idMappings) {
    if (element.nodeType !== 1) return; // Only process element nodes
    
    // Rewrite 'for' attribute references
    const forAttr = this.getAttribute(element, 'for');
    if (forAttr && idMappings.has(forAttr)) {
      this.setAttribute(element, 'for', idMappings.get(forAttr));
    }
    
    // Rewrite aria-* attribute references  
    const attributes = this.getAttributes(element);
    for (const [attrName, attrValue] of attributes) {
      if (attrName.startsWith('aria-') && idMappings.has(attrValue)) {
        this.setAttribute(element, attrName, idMappings.get(attrValue));
      }
    }
    
    // Recursively process children
    const children = this.getChildren(element);
    for (const child of children) {
      this.rewriteIdReferences(child, idMappings);
    }
  }

  /**
   * Merge attributes between elements
   */
  mergeAttributes(hostElement, pageElement) {
    const pageAttrs = this.getAttributes(pageElement);
    
    for (const [name, value] of pageAttrs) {
      if (name === 'id') {
        // Keep host id if it exists
        if (!this.getAttribute(hostElement, 'id')) {
          this.setAttribute(hostElement, 'id', value);
        }
      } else if (name === 'class') {
        // Union of classes
        const hostClasses = (this.getAttribute(hostElement, 'class') || '').split(' ').filter(Boolean);
        const pageClasses = value.split(' ').filter(Boolean);
        const mergedClasses = [...new Set([...hostClasses, ...pageClasses])];
        this.setAttribute(hostElement, 'class', mergedClasses.join(' '));
      } else {
        // Page wins for other attributes
        this.setAttribute(hostElement, name, value);
      }
    }
  }

  /**
   * Helper methods for DOM manipulation
   * These abstract the actual DOM implementation
   */
  
  parseHTML(htmlString) {
    // Debug log HTML that contains the failing test attributes
    if (htmlString.includes('lang="es"') || htmlString.includes('html_lang')) {
      this.logger.debug('Parsing HTML with es lang attributes', {
        htmlPreview: htmlString.substring(0, 300)
      });
    }
    
    // Use linkedom for real DOM parsing
    try {
      const { parseHTML } = require("linkedom");
      
      // Check if this looks like a fragment (no <html> or <body> wrapper)
      const isFragment = !htmlString.includes('<html') && !htmlString.includes('<body');
      
      if (isFragment) {
        // Wrap fragments in a body to ensure proper parsing
        const wrappedHtml = `<body>${htmlString}</body>`;
        const { document } = parseHTML(wrappedHtml);
        return document;
      } else {
        const { document } = parseHTML(htmlString);
        return document;
      }
    } catch (error) {
      // Fallback to simple DOM parser if linkedom not available
      return this._createSimpleDOM(htmlString);
    }
  }

  _createSimpleDOM(htmlString) {
    // Simple DOM-like object for basic operations
    const doc = {
      querySelector: () => null,
      querySelectorAll: () => [],
      toString: () => htmlString
    };
    return doc;
  }

  serializeHTML(doc) {
    // Remove all data-unify-docs style blocks before serialization
    const docsBlocks = this.querySelectorAll(doc, 'style[data-unify-docs]');
    for (const block of docsBlocks) {
      block.remove();
    }
    
    // Note: data-unify attributes are NOT removed here anymore
    // They are removed after all component processing is complete
    
    // Use linkedom's serialization
    return doc.toString();
  }

  querySelector(parent, selector) {
    return parent.querySelector(selector);
  }

  querySelectorAll(parent, selector) {
    return Array.from(parent.querySelectorAll(selector));
  }

  getAttribute(element, name) {
    return element.getAttribute(name);
  }

  setAttribute(element, name, value) {
    element.setAttribute(name, value);
  }

  getAttributes(element) {
    const attrs = new Map();
    for (const attr of element.attributes) {
      attrs.set(attr.name, attr.value);
    }
    return attrs;
  }

  hasAreaClass(element) {
    const classAttr = this.getAttribute(element, 'class');
    if (!classAttr) return false;
    const classes = classAttr.split(' ');
    return classes.some(cls => cls.startsWith('unify-'));
  }

  createElement(tagName) {
    return this.parseHTML(`<${tagName}></${tagName}>`).body.firstElementChild;
  }

  appendChild(parent, child) {
    if (child && typeof child.cloneNode === 'function') {
      parent.appendChild(child.cloneNode(true));
    }
  }

  // Helper to append with proper whitespace for block elements
  appendWithFormatting(parent, child) {
    if (!child || typeof child.cloneNode !== 'function') {
      return;
    }
    // Add newline before block elements for proper formatting
    if (child.tagName && ['SECTION', 'DIV', 'ARTICLE', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'MAIN'].includes(child.tagName)) {
      const textNode = parent.ownerDocument.createTextNode('\n    ');
      parent.appendChild(textNode);
    }
    parent.appendChild(child.cloneNode(true));
  }

  // Remove HTML comments from component content
  stripCommentsFromComponent(element) {
    // Recursively find and remove comment nodes
    const removeCommentsRecursive = (node) => {
      const childNodes = Array.from(node.childNodes);
      for (const child of childNodes) {
        if (child.nodeType === 8) { // Comment node
          child.remove();
        } else if (child.nodeType === 1) { // Element node
          removeCommentsRecursive(child);
        }
      }
    };
    
    removeCommentsRecursive(element);
  }

  replaceElement(oldElement, newElement) {
    if (newElement && typeof newElement.cloneNode === 'function') {
      oldElement.replaceWith(newElement.cloneNode(true));
    }
  }

  clearChildren(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  getChildren(element) {
    return Array.from(element.children);
  }

  getTextContent(element) {
    return element && element.textContent ? element.textContent : '';
  }

  setTextContent(element, text) {
    if (element && typeof element === 'object') {
      element.textContent = text;
    }
  }

  combineElements(el1, el2) {
    if (!el1 || typeof el1.cloneNode !== 'function') {
      return el2;
    }
    if (!el2 || typeof el2.cloneNode !== 'function') {
      return el1;
    }
    
    // Clone the first element with all its content as the base
    const combined = el1.cloneNode(true);
    
    // Add all children from the second element
    const el2Children = Array.from(el2.childNodes || []);
    for (const child of el2Children) {
      if (child && typeof child.cloneNode === 'function') {
        combined.appendChild(child.cloneNode(true));
      }
    }
    
    return combined;
  }

  /**
   * Replace head content with merged result from HeadMerger
   * @param {Document} doc - The document to update
   * @param {Object} mergedHead - Merged head data from HeadMerger
   */
  replaceHeadContent(doc, mergedHead) {
    const head = this.querySelector(doc, 'head');
    if (!head) return;
    
    this.logger.debug('replaceHeadContent called', {
      hasHead: !!head,
      hasTitle: !!mergedHead.title,
      stylesCount: mergedHead.styles?.length || 0,
      firstStyleType: mergedHead.styles?.length > 0 ? typeof mergedHead.styles[0] : 'none',
      firstStylePreview: mergedHead.styles?.length > 0 ? mergedHead.styles[0] : 'none'
    });
    
    // Clear current head content
    this.clearChildren(head);
    
    // Add title
    if (mergedHead.title) {
      const titleEl = this.createElement('title');
      this.setTextContent(titleEl, mergedHead.title);
      this.appendChild(head, titleEl);
    }
    
    // Add meta tags
    for (const meta of mergedHead.meta || []) {
      if (meta.element) {
        this.appendChild(head, meta.element);
      }
    }
    
    // Add links (CSS and other)
    for (const link of mergedHead.links || []) {
      if (link.element) {
        this.appendChild(head, link.element);
      } else if (link.tagName && link.tagName === 'LINK') {
        this.appendChild(head, link);
      }
    }
    
    // Add styles - handle both DOM elements and linkedom array format
    for (const style of mergedHead.styles || []) {
      if (style.element) {
        this.appendChild(head, style.element);
      } else if (style.tagName && style.tagName === 'STYLE') {
        this.appendChild(head, style);
      } else if (style.tagName && style.tagName === 'LINK') {
        this.appendChild(head, style);
      } else if (Array.isArray(style)) {
        // Handle linkedom array format: [nodeType, tagName, attributeCount, ...attributes]
        // For link elements: [1, "link", 2, "rel", "stylesheet", 2, "href", "/assets/style.css", -1]
        this._reconstructElementFromArray(head, style);
      } else {
        // Try to append directly - might be a DOM element in disguise
        this.appendChild(head, style);
      }
    }
    
    // Add scripts
    for (const script of mergedHead.scripts || []) {
      if (script.element) {
        this.appendChild(head, script.element);
      } else if (script.tagName && script.tagName === 'SCRIPT') {
        this.appendChild(head, script);
      }
    }
  }

  /**
   * Reconstruct a DOM element from linkedom array format and append to parent
   * Array format: [nodeType, tagName, attributeCount, ...attributes, -1]
   */
  _reconstructElementFromArray(parent, array) {
    if (!Array.isArray(array) || array.length < 3) return;
    
    const [nodeType, tagName] = array;
    if (nodeType !== 1 || !tagName) return; // Only handle element nodes
    
    // Create the element
    const element = this.createElement(tagName.toLowerCase());
    
    // Parse attributes from array
    let i = 2; // Start after nodeType and tagName
    while (i < array.length - 1) { // -1 is the terminator
      const attrCount = array[i];
      if (typeof attrCount !== 'number' || attrCount <= 0) break;
      
      i++; // Move to first attribute name
      for (let j = 0; j < attrCount && i < array.length - 1; j++) {
        const attrName = array[i];
        const attrValue = array[i + 1];
        if (typeof attrName === 'string' && typeof attrValue === 'string') {
          this.setAttribute(element, attrName, attrValue);
        }
        i += 2; // Move to next attribute pair
      }
      
      break; // Only process first attribute group for now
    }
    
    this.logger.debug('Reconstructed element from array', {
      tagName: tagName.toLowerCase(),
      attributes: Array.from(element.attributes || []).map(attr => `${attr.name}="${attr.value}"`),
      arrayPreview: array.slice(0, 8)
    });
    
    this.appendChild(parent, element);
  }

  /**
   * Extract href attribute from a style element (DOM element or array format)
   */
  _extractHrefFromStyle(style) {
    if (!style) return null;
    
    // Handle DOM elements
    if (style.tagName === 'LINK' && style.getAttribute) {
      return style.getAttribute('href');
    }
    
    // Handle linkedom array format: [1, "link", 2, "rel", "stylesheet", 2, "href", "/assets/style.css", -1]
    if (Array.isArray(style)) {
      const [nodeType, tagName] = style;
      if (nodeType === 1 && tagName && tagName.toLowerCase() === 'link') {
        // Find href in the array - scan for "href" string followed by value
        for (let i = 0; i < style.length - 1; i++) {
          if (style[i] === 'href' && typeof style[i + 1] === 'string') {
            return style[i + 1];
          }
        }
      }
    }
    
    return null;
  }

  // Default file resolver - override for custom file loading
  async defaultFileResolver(path) {
    // In a real implementation, this would load from filesystem
    return '<html><head></head><body></body></html>';
  }
}