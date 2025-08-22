/**
 * Default Layout Resolver
 * Implements US-019: Default Layout Assignment with Glob Patterns
 * 
 * Resolves layouts based on --default-layout rules with glob pattern matching
 * and proper precedence handling.
 */

import { minimatch } from 'minimatch';
import { ValidationError } from './errors.js';
import { resolve, normalize, relative, sep } from 'path';

/**
 * DefaultLayoutResolver handles automatic layout assignment based on glob patterns
 */
export class DefaultLayoutResolver {
  constructor(rules = []) {
    this.rules = [];
    this.lastResolution = null;
    
    // Parse and validate rules during construction
    if (Array.isArray(rules)) {
      for (let i = 0; i < rules.length; i++) {
        this._parseAndAddRule(rules[i], i);
      }
    }
  }

  /**
   * Parse and add a single rule
   * @private
   * @param {string} rule - Rule string to parse
   * @param {number} index - Rule index for error reporting
   */
  _parseAndAddRule(rule, index) {
    if (!rule || typeof rule !== 'string' || rule.trim() === '') {
      throw new ValidationError(`Empty rule not allowed at index ${index}`);
    }

    const trimmedRule = rule.trim();
    
    if (trimmedRule.includes('=')) {
      // Pattern rule: "pattern=layout"
      const [pattern, layout] = trimmedRule.split('=', 2);
      
      if (!pattern || pattern.trim() === '') {
        throw new ValidationError(`Empty pattern not allowed in rule: ${rule}`);
      }
      
      if (!layout || layout.trim() === '') {
        throw new ValidationError(`Empty layout path not allowed in rule: ${rule}`);
      }
      
      this._validateGlobPattern(pattern.trim());
      this._validateLayoutPath(layout.trim());
      
      this.rules.push({
        type: 'pattern',
        layout: layout.trim(),
        pattern: pattern.trim(),
        matcher: this._createMatcher(pattern.trim())
      });
    } else {
      // Filename rule: just a layout filename
      this._validateLayoutPath(trimmedRule);
      
      this.rules.push({
        type: 'filename',
        layout: trimmedRule,
        pattern: null,
        matcher: null
      });
    }
  }

  /**
   * Validate glob pattern for security and correctness
   * @private
   * @param {string} pattern - Glob pattern to validate
   */
  _validateGlobPattern(pattern) {
    // Check for backslashes (should use forward slashes for cross-platform compatibility)
    if (pattern.includes('\\')) {
      throw new ValidationError('Invalid glob pattern: Use forward slashes for cross-platform compatibility');
    }
    
    // Basic validation - minimatch will handle most invalid patterns
    try {
      minimatch('test', pattern);
    } catch (error) {
      throw new ValidationError(`Invalid glob pattern "${pattern}": ${error.message}`);
    }
  }

  /**
   * Validate layout path for security
   * @private
   * @param {string} layoutPath - Layout path to validate
   */
  _validateLayoutPath(layoutPath) {
    // Check for path traversal attempts
    if (layoutPath.includes('..')) {
      throw new ValidationError(`Invalid layout path: Path traversal not allowed in "${layoutPath}"`);
    }
    
    // Check for absolute paths (should be relative to source)
    if (layoutPath.startsWith('/') || layoutPath.match(/^[A-Z]:\\/)) {
      throw new ValidationError(`Invalid layout path: Absolute paths not allowed in "${layoutPath}"`);
    }
  }

  /**
   * Create a matcher function for a glob pattern
   * @private
   * @param {string} pattern - Glob pattern
   * @returns {Function} Matcher function
   */
  _createMatcher(pattern) {
    // Cache compiled pattern for performance
    const compiledPattern = minimatch.filter(pattern);
    
    return (filePath) => {
      const normalizedPath = this._normalizePath(filePath);
      return compiledPattern(normalizedPath);
    };
  }

  /**
   * Normalize file path for consistent pattern matching
   * @private
   * @param {string} filePath - File path to normalize
   * @returns {string} Normalized path
   */
  _normalizePath(filePath) {
    if (!filePath) return '';
    
    // Convert to forward slashes for consistency
    let normalized = filePath.replace(/\\/g, '/');
    
    // Remove leading './' if present
    if (normalized.startsWith('./')) {
      normalized = normalized.substring(2);
    }
    
    // Handle absolute paths by extracting relative part
    if (normalized.startsWith('/')) {
      // For absolute paths, try to extract meaningful relative part
      const segments = normalized.split('/').filter(s => s.length > 0);
      if (segments.length > 0) {
        // Look for common root directories (src, content, etc.)
        const commonRoots = ['src', 'content', 'pages', 'docs'];
        const rootIndex = segments.findIndex(seg => commonRoots.includes(seg));
        if (rootIndex !== -1 && rootIndex < segments.length - 1) {
          normalized = segments.slice(rootIndex + 1).join('/');
        } else {
          // Use last few segments if no common root found
          normalized = segments.slice(-3).join('/');
        }
      }
    }
    
    // Remove 'src/' prefix if present (common pattern)
    if (normalized.startsWith('src/')) {
      normalized = normalized.substring(4);
    }
    
    return normalized;
  }

  /**
   * Resolve layout for a given file path
   * @param {string} filePath - File path to resolve layout for
   * @returns {Object|null} Resolution result or null if no match
   */
  resolveLayout(filePath) {
    // Clear previous resolution tracking
    this.lastResolution = {
      filePath: filePath,
      evaluatedRules: [],
      result: null,
      reason: 'No rules to evaluate'
    };
    
    if (!filePath || typeof filePath !== 'string' || filePath.trim() === '') {
      this.lastResolution.reason = 'Invalid file path';
      return null;
    }
    
    if (this.rules.length === 0) {
      this.lastResolution.reason = 'No rules defined';
      return null;
    }

    const normalizedPath = this._normalizePath(filePath);
    const evaluatedRules = [];
    let lastMatchingRule = null;
    let lastMatchingIndex = -1;
    let filenameRule = null;
    let filenameIndex = -1;

    // Evaluate all rules to find matches and track evaluation
    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i];
      let matched = false;
      
      if (rule.type === 'pattern') {
        matched = rule.matcher(normalizedPath);
        evaluatedRules.push({
          rule: i,
          type: 'pattern',
          pattern: rule.pattern,
          matched: matched
        });
        
        if (matched) {
          lastMatchingRule = rule;
          lastMatchingIndex = i;
        }
      } else if (rule.type === 'filename') {
        // Filename rules don't match - they are fallbacks
        evaluatedRules.push({
          rule: i,
          type: 'filename',
          matched: false
        });
        
        // Store the first filename rule as fallback
        if (filenameRule === null) {
          filenameRule = rule;
          filenameIndex = i;
        }
      }
    }

    // Update resolution tracking
    this.lastResolution.evaluatedRules = evaluatedRules;

    // Apply precedence: pattern matches win over filename fallbacks
    let result = null;
    
    if (lastMatchingRule) {
      // Pattern match found - use last matching rule (last wins)
      result = {
        layout: lastMatchingRule.layout,
        source: 'pattern',
        pattern: lastMatchingRule.pattern,
        matchedRule: lastMatchingIndex,
        evaluatedRules: evaluatedRules,
        finalChoice: 'Last matching pattern wins'
      };
      this.lastResolution.result = result;
      this.lastResolution.reason = `Matched pattern: ${lastMatchingRule.pattern}`;
    } else if (filenameRule) {
      // No pattern matches, use filename fallback
      result = {
        layout: filenameRule.layout,
        source: 'filename',
        pattern: null,
        matchedRule: filenameIndex,
        evaluatedRules: evaluatedRules,
        finalChoice: 'Filename fallback'
      };
      this.lastResolution.result = result;
      this.lastResolution.reason = 'Filename fallback used';
    } else {
      // No matches at all
      this.lastResolution.reason = 'No rules matched';
    }

    return result;
  }

  /**
   * Get parsed rules (for testing and debugging)
   * @returns {Array} Array of parsed rules
   */
  getRules() {
    return [...this.rules];
  }

  /**
   * Get last resolution details (for debugging)
   * @returns {Object} Last resolution details
   */
  getLastResolution() {
    return this.lastResolution ? { ...this.lastResolution } : null;
  }

  /**
   * Add a rule dynamically (mainly for testing)
   * @param {string} rule - Rule string to add
   */
  addRule(rule) {
    this._parseAndAddRule(rule, this.rules.length);
  }

  /**
   * Clear all rules
   */
  clearRules() {
    this.rules = [];
    this.lastResolution = null;
  }

  /**
   * Get statistics about the resolver
   * @returns {Object} Statistics object
   */
  getStats() {
    const patternRules = this.rules.filter(r => r.type === 'pattern').length;
    const filenameRules = this.rules.filter(r => r.type === 'filename').length;
    
    return {
      totalRules: this.rules.length,
      patternRules: patternRules,
      filenameRules: filenameRules,
      hasRules: this.rules.length > 0
    };
  }
}