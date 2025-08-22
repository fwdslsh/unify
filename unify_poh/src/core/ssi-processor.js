/**
 * SSI (Server-Side Include) Processor
 * US-024: Apache SSI Include Processing (Legacy Support)
 * 
 * Implements Apache Server-Side Include processing for backward compatibility
 * with existing projects using SSI directives.
 * 
 * Features:
 * - Processes <!--#include file="..." --> and <!--#include virtual="..." --> directives
 * - File includes resolve relative to current file
 * - Virtual includes resolve from source root
 * - Markdown include processing with frontmatter stripping
 * - Security validation and path traversal prevention
 * - Circular dependency detection
 * - Performance optimizations through caching
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join, relative, isAbsolute } from 'path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { PathValidator } from './path-validator.js';
import { ValidationError, FileSystemError } from './errors.js';

/**
 * SSI Processor for handling Server-Side Include directives
 */
export class SSIProcessor {
  constructor(sourceRoot, options = {}) {
    this.sourceRoot = resolve(sourceRoot);
    this.options = {
      maxDepth: 10,
      cacheIncludes: true,
      ...options
    };
    
    this.pathValidator = new PathValidator();
    this.includeCache = new Map();
    this.markdown = new MarkdownIt({
      html: true,
      xhtmlOut: false,
      breaks: false,
      linkify: true,
      typographer: true
    });
    
    // Statistics tracking
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      totalDirectives: 0,
      successfulIncludes: 0,
      failedIncludes: 0
    };
  }

  /**
   * Process SSI include directives in content
   * @param {string} content - Content to process
   * @param {string} filePath - Path to the file being processed
   * @returns {Promise<ProcessResult>} Processing results
   */
  async processIncludes(content, filePath) {
    const startTime = Date.now();
    const result = {
      success: true,
      content: content,
      error: null,
      warnings: [],
      dependencies: [],
      includesProcessed: 0,
      statistics: {
        totalDirectives: 0,
        successfulIncludes: 0,
        failedIncludes: 0,
        processingTime: 0,
        cacheHits: this.stats.cacheHits,
        cacheMisses: this.stats.cacheMisses
      }
    };

    try {
      // Track processed paths for circular dependency detection
      const processedPaths = new Set([resolve(filePath)]);
      
      // Process includes recursively
      const processedContent = await this._processIncludesRecursive(
        content, 
        filePath, 
        processedPaths, 
        0, 
        result
      );
      
      // If the main file is markdown, process it after includes are resolved
      const finalContent = filePath.toLowerCase().endsWith('.md') 
        ? this._processMarkdownInclude(processedContent)
        : processedContent;
      
      result.content = finalContent;
      result.statistics.processingTime = Math.max(1, Date.now() - startTime); // Ensure at least 1ms
      result.statistics.cacheHits = this.stats.cacheHits;
      result.statistics.cacheMisses = this.stats.cacheMisses;
      
    } catch (error) {
      result.success = false;
      result.error = error.message;
      result.content = content; // Return original content on error
    }

    return result;
  }

  /**
   * Recursive include processing with depth and circular dependency tracking
   * @private
   */
  async _processIncludesRecursive(content, filePath, processedPaths, depth, result) {
    // Check maximum depth
    if (depth >= this.options.maxDepth) {
      throw new ValidationError(`Maximum include depth exceeded (${this.options.maxDepth})`);
    }

    // SSI include directive patterns (case insensitive, flexible whitespace)
    const includeRegex = /<!--#\s*include\s+(file|virtual)\s*=\s*["']([^"']+)["']\s*-->/gi;
    
    let processedContent = content;
    let match;
    
    // Reset regex lastIndex for fresh start
    includeRegex.lastIndex = 0;
    
    while ((match = includeRegex.exec(content)) !== null) {
      const [fullMatch, includeType, includePath] = match;
      result.statistics.totalDirectives++;
      this.stats.totalDirectives++;
      
      try {
        // Resolve include path based on type
        const resolvedPath = this._resolveIncludePath(includeType, includePath, filePath);
        
        // Security validation
        this._validateIncludePath(resolvedPath);
        
        // Check for circular dependencies
        if (processedPaths.has(resolvedPath)) {
          const pathArray = Array.from(processedPaths);
          const circularPath = [...pathArray, resolvedPath].map(p => relative(this.sourceRoot, p)).join(' → ');
          throw new ValidationError(`Circular dependency detected: ${circularPath}`);
        }
        
        // Check if file exists
        if (!existsSync(resolvedPath)) {
          const warning = `File not found: ${includePath} (resolved to: ${relative(this.sourceRoot, resolvedPath)})`;
          result.warnings.push(warning);
          result.statistics.failedIncludes++;
          this.stats.failedIncludes++;
          continue; // Leave directive unchanged
        }
        
        // Load include content (with caching)
        const includeContent = this._loadIncludeContent(resolvedPath);
        
        // Process markdown if needed
        const finalContent = this._processIncludeContent(includeContent, resolvedPath);
        
        // Track dependency
        result.dependencies.push(resolvedPath);
        
        // Recursively process the included content
        const newProcessedPaths = new Set(processedPaths);
        newProcessedPaths.add(resolvedPath);
        
        const recursiveContent = await this._processIncludesRecursive(
          finalContent,
          resolvedPath,
          newProcessedPaths,
          depth + 1,
          result
        );
        
        // Replace the directive with processed content
        processedContent = processedContent.replace(fullMatch, recursiveContent);
        
        result.includesProcessed++;
        result.statistics.successfulIncludes++;
        this.stats.successfulIncludes++;
        
      } catch (error) {
        if (error instanceof ValidationError) {
          // Handle security and validation errors
          if (error.message.includes('Path traversal') || error.message.includes('outside source root')) {
            const securityWarning = error.message.includes('outside source root') 
              ? `Include path outside source root: ${includePath}`
              : `Path traversal detected in include path: ${includePath}`;
            result.warnings.push(securityWarning);
            result.statistics.failedIncludes++;
            this.stats.failedIncludes++;
            continue; // Leave directive unchanged
          }
          throw error; // Re-throw other validation errors (like circular deps)
        }
        throw error; // Re-throw unexpected errors
      }
    }
    
    return processedContent;
  }

  /**
   * Resolve include path based on type (file or virtual)
   * @private
   */
  _resolveIncludePath(includeType, includePath, currentFilePath) {
    // Check for absolute paths that should be rejected immediately
    if (isAbsolute(includePath) && !includePath.startsWith('/')) {
      throw new ValidationError(`Include path outside source root: ${includePath}`);
    }
    
    if (includeType.toLowerCase() === 'file') {
      // Check for absolute file paths that are clearly outside project
      if (isAbsolute(includePath) && (includePath.startsWith('/etc/') || includePath.startsWith('/usr/') || includePath.startsWith('/var/'))) {
        throw new ValidationError(`Include path outside source root: ${includePath}`);
      }
      // File includes are relative to current file
      return resolve(dirname(currentFilePath), includePath);
    } else if (includeType.toLowerCase() === 'virtual') {
      // Virtual includes are relative to source root
      const cleanPath = includePath.startsWith('/') ? includePath.slice(1) : includePath;
      return resolve(this.sourceRoot, cleanPath);
    } else {
      throw new ValidationError(`Unknown include type: ${includeType}`);
    }
  }

  /**
   * Validate include path for security
   * @private
   */
  _validateIncludePath(resolvedPath) {
    try {
      this.pathValidator.validatePath(resolvedPath, this.sourceRoot);
    } catch (error) {
      if (error.name === 'PathTraversalError') {
        throw new ValidationError('Path traversal detected in include path');
      }
      throw error;
    }
    
    // Additional check: ensure path is within source root
    const relativePath = relative(this.sourceRoot, resolvedPath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new ValidationError(`Include path outside source root: ${resolvedPath}`);
    }
  }

  /**
   * Load include content with caching
   * @private
   */
  _loadIncludeContent(filePath) {
    if (this.options.cacheIncludes && this.includeCache.has(filePath)) {
      this.stats.cacheHits++;
      return this.includeCache.get(filePath);
    }
    
    try {
      const content = readFileSync(filePath, 'utf-8');
      
      if (this.options.cacheIncludes) {
        this.includeCache.set(filePath, content);
      }
      
      this.stats.cacheMisses++;
      return content;
      
    } catch (error) {
      throw new FileSystemError('read', filePath, error.message);
    }
  }

  /**
   * Process include content (handle markdown conversion)
   * @private
   */
  _processIncludeContent(content, filePath) {
    // Check if file is markdown
    if (filePath.toLowerCase().endsWith('.md')) {
      return this._processMarkdownInclude(content);
    }
    
    return content;
  }

  /**
   * Process markdown include content
   * @private
   */
  _processMarkdownInclude(markdownContent) {
    try {
      // Parse frontmatter and content
      const { content } = matter(markdownContent);
      
      // Convert markdown to HTML
      const html = this.markdown.render(content);
      
      // Add anchor links to headings
      return this._addAnchorLinks(html);
      
    } catch (error) {
      // If markdown processing fails, return original content
      console.warn(`Warning: Failed to process markdown include: ${error.message}`);
      return markdownContent;
    }
  }

  /**
   * Add anchor links to headings
   * @private
   */
  _addAnchorLinks(html) {
    return html.replace(/<h([1-6])([^>]*)>(.*?)<\/h[1-6]>/gi, (match, level, attrs, text) => {
      // Check if id attribute already exists
      const hasId = /\bid\s*=/.test(attrs);
      if (hasId) {
        return match; // Don't modify if ID already exists
      }
      
      // Remove HTML tags from heading text for ID
      const cleanText = text.replace(/<[^>]*>/g, '');
      // Create ID: lowercase, spaces to hyphens, remove non-word chars
      const id = this._generateIdFromText(cleanText);
      
      return `<h${level}${attrs} id="${this._escapeHtml(id)}">${text}</h${level}>`;
    });
  }

  /**
   * Generate a URL-safe ID from text content
   * @private
   */
  _generateIdFromText(text) {
    return text.trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Escape HTML special characters
   * @private
   */
  _escapeHtml(text) {
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
   * Clear include cache
   */
  clearCache() {
    this.includeCache.clear();
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      totalDirectives: 0,
      successfulIncludes: 0,
      failedIncludes: 0
    };
  }

  /**
   * Get processing statistics
   */
  getStatistics() {
    return { ...this.stats };
  }
}