/**
 * Cascading Imports System for Unify v0.6.0
 * 
 * Implements the new data-import, <slot>, and data-target system
 * that replaces SSI-style includes as the primary composition mechanism.
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';
import { processMarkdown, isMarkdownFile } from './markdown-processor.js';
import { HeadMergeProcessor } from './head-merge-processor.js';

/**
 * Error thrown when circular imports are detected
 */
export class CircularImportError extends Error {
  constructor(importChain) {
    const chain = importChain.join(' → ');
    super(`Circular import detected: ${chain}`);
    this.name = 'CircularImportError';
    this.importChain = importChain;
  }
}

/**
 * Error thrown when a fragment cannot be found
 */
export class FragmentNotFoundError extends Error {
  constructor(fragmentPath, searchedPaths = []) {
    super(`Fragment not found: ${fragmentPath}`);
    this.name = 'FragmentNotFoundError';
    this.fragmentPath = fragmentPath;
    this.searchedPaths = searchedPaths;
  }
}

/**
 * Processes cascading imports using data-import, slots, and data-target elements
 */
export class CascadingImportsProcessor {
  constructor(sourceRoot, options = {}) {
    this.sourceRoot = sourceRoot;
    this.options = {
      maxDepth: 10,
      failFast: false,
      ...options
    };
    this.importStack = []; // Circular dependency detection
    this.depth = 0;
  }

  /**
   * Process all data-import elements in HTML content
   * @param {string} html - HTML content to process
   * @param {string} currentFile - Current file path for import resolution
   * @returns {Promise<string>} - Processed HTML with imports resolved
   */
  async processImports(html, currentFile) {
    // Protect against infinite recursion
    if (this.depth > this.options.maxDepth) {
      throw new Error(`Maximum import depth (${this.options.maxDepth}) exceeded`);
    }

    this.depth++;
    
    try {
      logger.debug(`Processing imports for: ${currentFile} (depth: ${this.depth})`);
      
      let processedHtml = html;
      let hasImports = true;

      // Keep processing until no more imports are found (handles nested imports)
      while (hasImports) {
        const imports = this.extractImports(processedHtml);
        
        if (imports.length === 0) {
          hasImports = false;
          break;
        }

        logger.debug(`Found ${imports.length} imports to process`);

        // Process imports in document order
        for (const importInfo of imports) {
          try {
            // Circular dependency check
            const importPath = await this.resolveImportPath(importInfo.src, currentFile);
            
            if (this.importStack.includes(importPath)) {
              const chain = [...this.importStack, importPath];
              throw new CircularImportError(chain);
            }

            this.importStack.push(importPath);
            
            try {
              // Load and process fragment
              const fragmentContent = await this.loadFragment(importPath);
              
              // Recursively process nested imports in the fragment
              const processedFragment = await this.processImports(fragmentContent, importPath);
              
              // Compose the fragment with slot content
              // Final composition happens when we're back at the root level (depth 1)
              const isFinalComposition = (this.depth === 1);
              const composedContent = this.composeFragments(processedFragment, importInfo.slotContent, isFinalComposition);
              
              // Replace the import element with the composed content
              processedHtml = this.replaceImport(processedHtml, importInfo, composedContent);
              
              logger.debug(`Successfully processed import: ${importInfo.src}`);
              
            } finally {
              this.importStack.pop();
            }
            
          } catch (error) {
            logger.error(`Error processing import ${importInfo.src}: ${error.message}`);
            
            // For certain critical errors, re-throw instead of replacing with comments
            if (error instanceof CircularImportError || 
                error.message.includes('Maximum import depth')) {
              throw error;
            }
            
            // In fail-fast mode, also re-throw FragmentNotFoundError
            if (this.options.failFast && error instanceof FragmentNotFoundError) {
              throw error;
            }
            
            // Replace with error comment for non-critical errors
            const errorComment = `<!-- Import Error: ${error.message} (${importInfo.src}) -->`;
            processedHtml = this.replaceImport(processedHtml, importInfo, errorComment);
          }
        }
      }
      
      return processedHtml;
      
    } finally {
      this.depth--;
    }
  }

  /**
   * Extract all data-import elements from HTML
   * @param {string} html - HTML content to scan
   * @returns {Object[]} - Array of import information objects
   */
  extractImports(html) {
    const imports = [];
    
    // Use a simple regex to find data-import elements
    // This is not as robust as a full HTML parser, but sufficient for this use case
    const dataImportPattern = /<([^>]+)\s+data-import=["']([^"']+)["'][^>]*>/gi;
    
    let match;
    while ((match = dataImportPattern.exec(html)) !== null) {
      const [fullMatch, tagContent, src] = match;
      const startIndex = match.index;
      const tagName = tagContent.split(/\s+/)[0];
      
      // Find the balanced closing tag (handles nested elements correctly)
      const closingTagIndex = this.findBalancedClosingTag(html, startIndex + fullMatch.length, tagName);
      
      if (closingTagIndex !== -1) {
        const endIndex = closingTagIndex + `</${tagName}>`.length;
        const elementContent = html.slice(startIndex + fullMatch.length, closingTagIndex);
        
        imports.push({
          src,
          element: html.slice(startIndex, endIndex),
          startIndex,
          endIndex,
          slotContent: this.extractSlotContent(elementContent)
        });
      } else {
        // Self-closing or void element
        imports.push({
          src,
          element: fullMatch,
          startIndex,
          endIndex: startIndex + fullMatch.length,
          slotContent: { default: '', named: {} }
        });
      }
    }
    
    // Sort by start index in reverse order for safe replacement
    return imports.sort((a, b) => b.startIndex - a.startIndex);
  }

  /**
   * Find the balanced closing tag for a given tag name, handling nested elements
   * @param {string} html - HTML content to search
   * @param {number} startIndex - Index to start searching from
   * @param {string} tagName - Tag name to find closing tag for
   * @returns {number} - Index of the closing tag, or -1 if not found
   */
  findBalancedClosingTag(html, startIndex, tagName) {
    let depth = 1; // We're already inside one opening tag
    let index = startIndex;
    
    const openTagPattern = new RegExp(`<${tagName}(?:\\s+[^>]*)?>`, 'gi');
    const closeTagPattern = new RegExp(`</${tagName}>`, 'gi');
    
    while (index < html.length && depth > 0) {
      // Find next opening or closing tag
      openTagPattern.lastIndex = index;
      closeTagPattern.lastIndex = index;
      
      const nextOpen = openTagPattern.exec(html);
      const nextClose = closeTagPattern.exec(html);
      
      // Determine which comes first
      if (!nextOpen && !nextClose) {
        // No more tags found
        break;
      } else if (!nextOpen) {
        // Only closing tag found
        depth--;
        if (depth === 0) {
          return nextClose.index;
        }
        index = nextClose.index + nextClose[0].length;
      } else if (!nextClose) {
        // Only opening tag found
        depth++;
        index = nextOpen.index + nextOpen[0].length;
      } else {
        // Both found, take the earlier one
        if (nextOpen.index < nextClose.index) {
          depth++;
          index = nextOpen.index + nextOpen[0].length;
        } else {
          depth--;
          if (depth === 0) {
            return nextClose.index;
          }
          index = nextClose.index + nextClose[0].length;
        }
      }
    }
    
    return -1; // No balanced closing tag found
  }

  /**
   * Extract slot content from element content
   * @param {string} content - Content inside the data-import element
   * @returns {Object} - Object with default and named slot content
   */
  extractSlotContent(content) {
    const slotContent = {
      default: '',
      named: {}
    };

    logger.debug(`Extracting slot content from: ${content.substring(0, 200)}...`);
    let processedContent = content;
    
    // First, extract any element with data-target attributes (including <template>)
    const templatePattern = /<(\w+)\s+[^>]*data-target=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = templatePattern.exec(content)) !== null) {
      const [fullMatch, tagName, targetName, templateContent] = match;
      // For templates, last writer wins so we overwrite
      slotContent.named[targetName] = templateContent.trim();
      logger.debug(`Found template slot: ${targetName} with content: ${templateContent.trim().substring(0, 100)}...`);
      
      // Remove the template element from the content
      processedContent = processedContent.replace(fullMatch, '');
    }
    
    // Then, extract regular elements with data-target attributes
    // This captures any element (not just template) with data-target
    const elementPattern = /<(\w+)([^>]*)\s+data-target=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/\1>/gi;
    
    // Reset regex for new search
    let elementMatches = [];
    while ((match = elementPattern.exec(content)) !== null) {
      const [fullMatch, tagName, beforeAttr, targetName, afterAttr, elementContent] = match;
      
      // Skip template elements (already handled above)
      if (tagName.toLowerCase() === 'template') {
        continue;
      }
      
      elementMatches.push({
        fullMatch,
        tagName,
        beforeAttr,
        targetName,
        afterAttr,
        elementContent
      });
    }
    
    // Process regular elements with data-target
    for (const elem of elementMatches) {
      // For regular elements, we include the element itself (without data-target attribute)
      const cleanedElement = `<${elem.tagName}${elem.beforeAttr}${elem.afterAttr}>${elem.elementContent}</${elem.tagName}>`;
      
      // Last writer wins
      slotContent.named[elem.targetName] = cleanedElement.trim();
      
      // Remove the element from the default content
      processedContent = processedContent.replace(elem.fullMatch, '');
    }
    
    // Also handle self-closing elements with data-target
    const selfClosingPattern = /<(\w+)([^>]*)\s+data-target=["']([^"']+)["']([^>]*)\s*\/>/gi;
    while ((match = selfClosingPattern.exec(content)) !== null) {
      const [fullMatch, tagName, beforeAttr, targetName, afterAttr] = match;
      
      // For self-closing elements, include the element itself (without data-target attribute)
      const cleanedElement = `<${tagName}${beforeAttr}${afterAttr} />`;
      
      // Last writer wins
      slotContent.named[targetName] = cleanedElement.trim();
      
      // Remove from default content
      processedContent = processedContent.replace(fullMatch, '');
    }
    
    // Remaining content becomes the default slot
    slotContent.default = processedContent.trim();
    
    return slotContent;
  }

  /**
   * Resolve an import path to an absolute file path
   * @param {string} importPath - The import path from data-import attribute
   * @param {string} currentFile - Current file path for relative resolution
   * @returns {Promise<string>} - Resolved absolute file path
   */
  async resolveImportPath(importPath, currentFile) {
    const candidates = [];
    
    if (importPath.startsWith('/')) {
      // Absolute from source root
      candidates.push(path.resolve(this.sourceRoot, importPath.slice(1)));
    } else if (importPath.includes('/') || importPath.includes('.')) {
      // Relative path with directory or extension
      candidates.push(path.resolve(path.dirname(currentFile), importPath));
    } else {
      // Short name resolution
      const shortNameCandidates = this.generateShortNameCandidates(importPath, currentFile);
      candidates.push(...shortNameCandidates);
    }
    
    // Test each candidate
    const searchedPaths = [];
    for (const candidate of candidates) {
      searchedPaths.push(candidate);
      
      try {
        await fs.access(candidate);
        logger.debug(`Resolved import ${importPath} to ${candidate}`);
        return candidate;
      } catch {
        // Continue to next candidate
      }
    }
    
    throw new FragmentNotFoundError(importPath, searchedPaths);
  }

  /**
   * Generate candidate paths for short name resolution
   * @param {string} shortName - Short name to resolve
   * @param {string} currentFile - Current file path
   * @returns {string[]} - Array of candidate paths
   */
  generateShortNameCandidates(shortName, currentFile) {
    const candidates = [];
    const extensions = ['.html', '.htm'];
    const patterns = [
      shortName,
      `_${shortName}`,
      `${shortName}.layout`,
      `_${shortName}.layout`
    ];
    
    // Search from current directory up to source root
    let currentDir = path.dirname(currentFile);
    
    while (currentDir !== path.dirname(currentDir)) {
      for (const pattern of patterns) {
        for (const ext of extensions) {
          candidates.push(path.join(currentDir, pattern + ext));
        }
      }
      
      // Move up one directory
      currentDir = path.dirname(currentDir);
      
      // Stop at source root
      if (currentDir === this.sourceRoot || !currentDir.startsWith(this.sourceRoot)) {
        break;
      }
    }
    
    // Also check source root itself
    if (currentDir !== this.sourceRoot) {
      for (const pattern of patterns) {
        for (const ext of extensions) {
          candidates.push(path.join(this.sourceRoot, pattern + ext));
        }
      }
    }
    
    // Search in _includes directory
    for (const pattern of patterns) {
      for (const ext of extensions) {
        candidates.push(path.join(this.sourceRoot, '_includes', pattern + ext));
      }
    }
    
    return candidates;
  }

  /**
   * Load a fragment file and process if it's markdown
   * @param {string} fragmentPath - Absolute path to fragment file
   * @returns {Promise<string>} - Fragment content
   */
  async loadFragment(fragmentPath) {
    const content = await fs.readFile(fragmentPath, 'utf-8');
    
    // Process markdown files
    if (isMarkdownFile(fragmentPath)) {
      try {
  const markdownResult = await processMarkdown(content, fragmentPath);
        logger.debug(`Processed markdown fragment: ${fragmentPath}`);
        return markdownResult.html;
      } catch (error) {
        logger.error(`Failed to process markdown fragment ${fragmentPath}: ${error.message}`);
        throw error;
      }
    }
    
    return content;
  }

  /**
   * Compose fragment content with slot injections
   * @param {string} fragmentHtml - HTML content of the fragment
   * @param {Object} slotContent - Slot content to inject
   * @param {boolean} isFinalComposition - Whether this is the final composition level
   * @returns {string} - Composed HTML
   */
  composeFragments(fragmentHtml, slotContent, isFinalComposition = false) {
    let composed = fragmentHtml;
    
    logger.debug(`Composing fragments with slot content:`, slotContent);
    
    // Special handling for head slot - merge instead of replace
    if (slotContent.named && slotContent.named.head) {
      const headContent = slotContent.named.head;
      logger.info(`Processing special head slot with content: ${headContent}`);
      
      // Extract existing head content
      const headMatch = composed.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
      if (headMatch) {
        const existingHead = headMatch[1];
        
        // Use HeadMergeProcessor to merge head content
        const headMerger = new HeadMergeProcessor();
        
        // Create fragments for merging (layout first, then page)
        const fragments = [
          { source: 'layout', headHtml: existingHead },
          { source: 'page', headHtml: headContent }
        ];
        
        const mergedHead = headMerger.mergeHeadContent(fragments);
        
        // Replace the entire head section with merged content
        composed = composed.replace(
          /<head[^>]*>[\s\S]*?<\/head>/i,
          `<head>\n${mergedHead}\n</head>`
        );
        
        logger.debug(`Merged head content successfully`);
      }
      
      // Remove head from named slots so it's not processed as a regular slot
      delete slotContent.named.head;
    }
    
    // Process other named slots
    for (const [slotName, content] of Object.entries(slotContent.named || {})) {
      const slotPattern = new RegExp(
        `<slot\\s+name=["']${slotName}["'][^>]*>(.*?)</slot>`,
        'gis' // Added 's' flag to make . match newlines
      );
      
      const matches = composed.match(slotPattern);
      if (matches) {
        composed = composed.replace(slotPattern, content);
        logger.debug(`Injected named slot: ${slotName}`);
      } else {
        logger.warn(`No slot found for data-target="${slotName}". Check that the layout has <slot name="${slotName}">.`);
      }
    }
    
    // Process default slot (slots without name attribute)
    if (slotContent.default && slotContent.default.trim()) {
      // Match slots that don't have a name attribute
      const defaultSlotPattern = /<slot(?:\s+(?!name=)[^>]*)?>(.*?)<\/slot>/gis;
      
      const matches = composed.match(defaultSlotPattern);
      if (matches) {
        composed = composed.replace(defaultSlotPattern, slotContent.default);
        logger.debug(`Injected default slot content: ${slotContent.default.substring(0, 50)}...`);
      } else {
        logger.debug(`No default slot found`);
      }
    }
    
    // Replace any remaining unfilled slots with their fallback content
    // but only if this is the final composition level
    if (isFinalComposition) {
      const remainingSlotPattern = /<slot(?:\s+name=["']([^"']+)["'])?[^>]*>(.*?)<\/slot>/gis;
      composed = composed.replace(remainingSlotPattern, (match, slotName, fallbackContent) => {
        logger.debug(`Replacing unfilled slot ${slotName || 'default'} with fallback: ${fallbackContent.trim().substring(0, 50)}...`);
        return fallbackContent;
      });
    }
    
    return composed;
  }

  /**
   * Replace an import element with composed content
   * @param {string} html - Original HTML content
   * @param {Object} importInfo - Import information object
   * @param {string} replacement - Replacement content
   * @returns {string} - HTML with import replaced
   */
  replaceImport(html, importInfo, replacement) {
    const before = html.slice(0, importInfo.startIndex);
    const after = html.slice(importInfo.endIndex);
    return before + replacement + after;
  }

  /**
   * Extract head content from HTML for head merging
   * @param {string} html - HTML content
   * @returns {string} - Head content or empty string
   */
  extractHeadContent(html) {
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    return headMatch ? headMatch[1] : '';
  }
}