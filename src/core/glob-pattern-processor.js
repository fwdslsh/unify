/**
 * Glob Pattern Processor for Unify
 * Implements US-016: Glob Pattern Processing for Copy/Ignore Rules
 * 
 * Handles comprehensive glob pattern processing with three-tier precedence:
 * - Tier 1: Explicit Overrides (--render, --auto-ignore=false)
 * - Tier 2: Ignore Rules (--ignore*, .gitignore) 
 * - Tier 3: Default Behavior (renderables emit, assets copy)
 */

import { minimatch } from 'minimatch';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Classification actions for files
 */
export const ACTIONS = {
  EMIT: 'EMIT',      // File should be rendered/processed
  COPY: 'COPY',      // File should be copied as-is
  IGNORED: 'IGNORED', // File should be ignored
  SKIP: 'SKIP'       // File should be skipped (not processed)
};

/**
 * Precedence tiers for pattern matching
 */
export const TIERS = {
  EXPLICIT: 1,  // Highest priority (--render, --auto-ignore=false)
  IGNORE: 2,    // Medium priority (--ignore*, .gitignore)
  DEFAULT: 3    // Lowest priority (default behaviors)
};

/**
 * GlobPatternProcessor handles file classification with glob patterns
 */
export class GlobPatternProcessor {
  constructor(options = {}) {
    this.options = {
      autoIgnore: true,
      caseSensitive: process.platform !== 'win32',
      ...options
    };

    // Pattern storage by type and tier
    this.patterns = {
      // Tier 1: Explicit overrides
      render: [],           // --render patterns
      
      // Tier 2: Ignore rules  
      ignore: [],           // --ignore patterns
      ignoreRender: [],     // --ignore-render patterns
      ignoreCopy: [],       // --ignore-copy patterns
      gitignore: [],        // .gitignore patterns
      
      // Tier 3: Copy rules
      copy: []              // --copy patterns
    };

    // Auto-ignored files (layouts, includes)
    this.autoIgnoredFiles = new Map(); // filepath -> reason
    
    // File type classification (can be overridden by options)
    this.renderableExtensions = options.renderableExtensions || ['.html', '.htm', '.md', '.markdown'];
    this.assetExtensions = options.assetExtensions || [
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
      '.woff', '.woff2', '.ttf', '.otf', '.eot',
      '.css', '.js', '.json', '.pdf', '.txt'
    ];

    // Warning callback
    this.onWarning = null;
    
    // Add implicit assets pattern
    this._addImplicitAssetsCopy();
  }

  /**
   * Add a render pattern (Tier 1 - highest priority)
   * @param {string} pattern - Glob pattern
   */
  addRenderPattern(pattern) {
    this._validatePattern(pattern);
    this.patterns.render.push(this._normalizePattern(pattern));
    this._checkForConflicts();
  }

  /**
   * Add an ignore pattern (Tier 2 - affects both render and copy)
   * @param {string} pattern - Glob pattern
   */
  addIgnorePattern(pattern) {
    this._validatePattern(pattern);
    this.patterns.ignore.push(this._normalizePattern(pattern));
    this._checkForConflicts();
  }

  /**
   * Add an ignore-render pattern (Tier 2 - affects only rendering)
   * @param {string} pattern - Glob pattern
   */
  addIgnoreRenderPattern(pattern) {
    this._validatePattern(pattern);
    this.patterns.ignoreRender.push(this._normalizePattern(pattern));
    this._checkForConflicts();
  }

  /**
   * Add an ignore-copy pattern (Tier 2 - affects only copying)
   * @param {string} pattern - Glob pattern
   */
  addIgnoreCopyPattern(pattern) {
    this._validatePattern(pattern);
    this.patterns.ignoreCopy.push(this._normalizePattern(pattern));
    this._checkForConflicts();
  }

  /**
   * Add a copy pattern (Tier 3)
   * @param {string} pattern - Glob pattern
   */
  addCopyPattern(pattern) {
    this._validatePattern(pattern);
    this.patterns.copy.push(this._normalizePattern(pattern));
    this._checkForConflicts();
  }

  /**
   * Add a .gitignore pattern (Tier 2)
   * @param {string} pattern - Glob pattern from .gitignore
   */
  addGitignorePattern(pattern) {
    if (this.options.autoIgnore) {
      this._validatePattern(pattern);
      let normalizedPattern = this._normalizePattern(pattern);
      
      // Handle gitignore-specific conventions
      normalizedPattern = this._normalizeGitignorePattern(normalizedPattern);
      
      this.patterns.gitignore.push(normalizedPattern);
    }
  }

  /**
   * Set auto-ignore behavior (Tier 1 override)
   * @param {boolean} enabled - Whether to enable auto-ignore
   */
  setAutoIgnore(enabled) {
    this.options.autoIgnore = enabled;
    if (!enabled) {
      // Clear auto-ignore patterns when disabled
      this.patterns.gitignore = [];
    }
  }

  /**
   * Add a file to be auto-ignored (layouts, includes)
   * @param {string} filePath - Path to auto-ignore
   * @param {string} reason - Reason for auto-ignoring
   */
  addAutoIgnoredFile(filePath, reason) {
    if (this.options.autoIgnore) {
      this.autoIgnoredFiles.set(this._normalizePath(filePath), reason);
    }
  }

  /**
   * Check if a file matches a specific pattern type
   * @param {string} filePath - File path to test
   * @param {string} patternType - Type of pattern ('copy', 'ignore', etc.)
   * @returns {boolean} Whether file matches patterns of this type
   */
  matchesPattern(filePath, patternType) {
    const normalizedPath = this._normalizePath(filePath);
    const patterns = this.patterns[patternType] || [];
    
    return !!this._findLastMatch(normalizedPath, patterns);
  }

  /**
   * Classify a file according to the three-tier precedence system
   * @param {string} filePath - File path to classify
   * @returns {Object} Classification result
   */
  classifyFile(filePath) {
    const normalizedPath = this._normalizePath(filePath);
    
    // Check Tier 1: Explicit overrides
    const tier1Result = this._checkTier1(normalizedPath);
    if (tier1Result) return tier1Result;
    
    // Check Tier 2: Ignore rules
    const tier2Result = this._checkTier2(normalizedPath);
    if (tier2Result && tier2Result.action) return tier2Result; // Complete ignore result
    
    // Check Tier 3: Default behavior with Tier 2 constraints
    return this._checkTier3(normalizedPath, tier2Result);
  }

  /**
   * Add patterns in bulk
   * @param {Object} patterns - Object with pattern arrays by type
   */
  addPatterns(patterns) {
    if (patterns.copy) patterns.copy.forEach(p => this.addCopyPattern(p));
    if (patterns.ignore) patterns.ignore.forEach(p => this.addIgnorePattern(p));
    if (patterns.ignoreRender) patterns.ignoreRender.forEach(p => this.addIgnoreRenderPattern(p));
    if (patterns.ignoreCopy) patterns.ignoreCopy.forEach(p => this.addIgnoreCopyPattern(p));
    if (patterns.render) patterns.render.forEach(p => this.addRenderPattern(p));
  }

  /**
   * Get copy patterns
   * @returns {string[]} Array of copy patterns
   */
  getCopyPatterns() {
    return [...this.patterns.copy];
  }

  /**
   * Get ignore patterns
   * @returns {string[]} Array of ignore patterns
   */
  getIgnorePatterns() {
    return [...this.patterns.ignore];
  }

  /**
   * Clear all patterns
   */
  clearPatterns() {
    this.patterns = {
      render: [],
      ignore: [],
      ignoreRender: [],
      ignoreCopy: [],
      gitignore: [],
      copy: []
    };
    this.autoIgnoredFiles.clear();
  }

  /**
   * Load and parse .gitignore file
   * @param {string} sourcePath - Path to source directory
   */
  loadGitignore(sourcePath) {
    if (!this.options.autoIgnore) return;
    
    try {
      const gitignorePath = join(sourcePath, '.gitignore');
      const content = readFileSync(gitignorePath, 'utf8');
      
      content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .forEach(pattern => this.addGitignorePattern(pattern));
    } catch (error) {
      // .gitignore not found or not readable - ignore silently
    }
  }

  // Private methods

  /**
   * Add implicit assets copy pattern
   * @private
   */
  _addImplicitAssetsCopy() {
    this.patterns.copy.unshift('assets/**'); // Add at beginning for lower precedence
  }

  /**
   * Check Tier 1: Explicit overrides
   * @private
   */
  _checkTier1(filePath) {
    // Auto-ignore disabled overrides everything
    if (!this.options.autoIgnore) {
      const isRenderable = this._isRenderable(filePath);
      if (isRenderable) {
        return {
          action: ACTIONS.EMIT,
          tier: TIERS.EXPLICIT,
          reason: 'auto-ignore=false override, renderable file',
          matchedPattern: 'auto-ignore=false'
        };
      }
    }

    // Check render patterns (force emit even if ignored elsewhere)
    const renderMatch = this._findLastMatch(filePath, this.patterns.render);
    if (renderMatch && this._isRenderable(filePath)) {
      return {
        action: ACTIONS.EMIT,
        tier: TIERS.EXPLICIT,
        reason: `--render pattern '${renderMatch}' overrides ignore rules`,
        matchedPattern: renderMatch
      };
    }

    return null; // Continue to next tier
  }

  /**
   * Check Tier 2: Ignore rules
   * @private
   */
  _checkTier2(filePath) {
    // Check auto-ignored files first
    if (this.options.autoIgnore && this.autoIgnoredFiles.has(filePath)) {
      const reason = this.autoIgnoredFiles.get(filePath);
      return {
        action: ACTIONS.IGNORED,
        tier: TIERS.IGNORE,
        reason: `auto-ignored (${reason})`,
        matchedPattern: 'auto-ignore'
      };
    }

    // Check ignore patterns (affects both render and copy)
    const ignoreMatch = this._findLastMatch(filePath, this.patterns.ignore);
    if (ignoreMatch) {
      return {
        action: ACTIONS.IGNORED,
        tier: TIERS.IGNORE,
        reason: `--ignore pattern '${ignoreMatch}'`,
        matchedPattern: ignoreMatch
      };
    }

    // Check gitignore patterns
    const gitignoreMatch = this._findLastMatch(filePath, this.patterns.gitignore);
    if (gitignoreMatch) {
      return {
        action: ACTIONS.IGNORED,
        tier: TIERS.IGNORE,
        reason: `.gitignore pattern '${gitignoreMatch}'`,
        matchedPattern: gitignoreMatch
      };
    }

    // Check specific ignore rules but don't return action yet
    const ignoreRenderMatch = this._findLastMatch(filePath, this.patterns.ignoreRender);
    const ignoreCopyMatch = this._findLastMatch(filePath, this.patterns.ignoreCopy);

    if (ignoreRenderMatch || ignoreCopyMatch) {
      return {
        renderIgnored: !!ignoreRenderMatch,
        copyIgnored: !!ignoreCopyMatch,
        reason: [
          ignoreRenderMatch && `ignore-render '${ignoreRenderMatch}'`,
          ignoreCopyMatch && `ignore-copy '${ignoreCopyMatch}'`
        ].filter(Boolean).join(', ')
      };
    }

    return null; // No Tier 2 matches
  }

  /**
   * Check Tier 3: Default behavior
   * @private
   */
  _checkTier3(filePath, tier2Constraints = null) {
    const isRenderable = this._isRenderable(filePath);
    
    // Handle specific ignore results from Tier 2
    if (tier2Constraints && (tier2Constraints.renderIgnored || tier2Constraints.copyIgnored)) {
      if (isRenderable && tier2Constraints.renderIgnored) {
        // Check if can still copy
        const copyMatch = this._findLastMatch(filePath, this.patterns.copy);
        if (copyMatch && !tier2Constraints.copyIgnored) {
          return {
            action: ACTIONS.COPY,
            tier: TIERS.DEFAULT,
            reason: `render ignored but copy allowed via '${copyMatch}'`,
            matchedPattern: copyMatch
          };
        }
        return {
          action: ACTIONS.IGNORED,
          tier: TIERS.IGNORE,
          reason: tier2Constraints.reason,
          matchedPattern: 'ignore-render'
        };
      }
      
      if (tier2Constraints.copyIgnored) {
        if (isRenderable && !tier2Constraints.renderIgnored) {
          return {
            action: ACTIONS.EMIT,
            tier: TIERS.DEFAULT,
            reason: 'copy ignored but renderable, render wins over copy',
            matchedPattern: 'renderable'
          };
        }
        return {
          action: ACTIONS.IGNORED,
          tier: TIERS.IGNORE,
          reason: tier2Constraints.reason,
          matchedPattern: 'ignore-copy'
        };
      }
    }

    // Default behavior: renderables emit
    if (isRenderable) {
      return {
        action: ACTIONS.EMIT,
        tier: TIERS.DEFAULT,
        reason: 'renderable file, default behavior',
        matchedPattern: 'default-renderable'
      };
    }

    // Check copy patterns first (for both assets and non-assets)
    const copyMatch = this._findLastMatch(filePath, this.patterns.copy);
    if (copyMatch) {
      return {
        action: ACTIONS.COPY,
        tier: TIERS.DEFAULT,
        reason: `copy pattern '${copyMatch}'`,
        matchedPattern: copyMatch
      };
    }

    // If no explicit copy pattern match, check if it's a recognized asset type
    const isAsset = this._isAsset(filePath);
    if (isAsset) {
      // Check if it was explicitly excluded by copy patterns (findLastMatch returned null)
      // This happens when the last matching pattern was a negation
      const hasNegativeMatch = this._hasNegativeMatch(filePath, this.patterns.copy);
      if (hasNegativeMatch) {
        return {
          action: ACTIONS.SKIP,
          tier: TIERS.DEFAULT,
          reason: 'asset excluded by negation pattern',
          matchedPattern: 'excluded-asset'
        };
      }
      
      // Default behavior for assets: copy
      return {
        action: ACTIONS.COPY,
        tier: TIERS.DEFAULT,
        reason: 'asset file, default behavior',
        matchedPattern: 'default-asset'
      };
    }

    // Default: skip unknown files
    return {
      action: ACTIONS.SKIP,
      tier: TIERS.DEFAULT,
      reason: 'non-renderable, no copy rules match',
      matchedPattern: 'default-skip'
    };
  }

  /**
   * Normalize file path to POSIX format
   * @private
   */
  _normalizePath(filePath) {
    return filePath.replace(/\\/g, '/');
  }

  /**
   * Normalize pattern (handle relative paths, etc.)
   * @private
   */
  _normalizePattern(pattern) {
    let normalized = pattern.trim();
    
    // Handle negation patterns
    if (normalized.startsWith('!')) {
      const negatedPattern = normalized.substring(1);
      return '!' + this._normalizePattern(negatedPattern);
    }
    
    // Remove leading ./ 
    if (normalized.startsWith('./')) {
      normalized = normalized.substring(2);
    }
    
    // Handle ../
    if (normalized.startsWith('../')) {
      // Convert ../ to just the relative part for matching
      normalized = normalized.substring(3);
    }
    
    return normalized;
  }

  /**
   * Normalize gitignore-specific pattern conventions
   * @private
   */
  _normalizeGitignorePattern(pattern) {
    // Handle gitignore directory convention: "dir/" should match "dir/**"
    if (pattern.endsWith('/') && !pattern.endsWith('**/') && !pattern.endsWith('*/')) {
      return pattern + '**';
    }
    
    return pattern;
  }

  /**
   * Check if file path is renderable
   * @private
   */
  _isRenderable(filePath) {
    const ext = this._getExtension(filePath);
    return this.renderableExtensions.includes(ext);
  }

  /**
   * Check if file path is an asset
   * @private
   */
  _isAsset(filePath) {
    const ext = this._getExtension(filePath);
    return this.assetExtensions.includes(ext);
  }

  /**
   * Get file extension
   * @private
   */
  _getExtension(filePath) {
    const match = filePath.match(/\.([^./\\]+)$/);
    return match ? `.${match[1].toLowerCase()}` : '';
  }

  /**
   * Find last matching pattern (ripgrep-style last wins)
   * @private
   */
  _findLastMatch(filePath, patterns) {
    let isMatched = false;
    let lastMatchingPattern = null;
    
    for (const pattern of patterns) {
      if (pattern.startsWith('!')) {
        // Negation pattern
        const positivePattern = pattern.substring(1);
        if (minimatch(filePath, positivePattern, {
          dot: true,
          nocase: !this.options.caseSensitive
        })) {
          isMatched = false;
          lastMatchingPattern = pattern;
        }
      } else {
        // Positive pattern
        if (minimatch(filePath, pattern, {
          dot: true,
          nocase: !this.options.caseSensitive
        })) {
          isMatched = true;
          lastMatchingPattern = pattern;
        }
      }
    }
    
    return isMatched ? lastMatchingPattern : null;
  }

  /**
   * Check if file has a negative match (was excluded by negation)
   * @private
   */
  _hasNegativeMatch(filePath, patterns) {
    let lastMatchingPattern = null;
    
    for (const pattern of patterns) {
      if (pattern.startsWith('!')) {
        // Negation pattern
        const positivePattern = pattern.substring(1);
        if (minimatch(filePath, positivePattern, {
          dot: true,
          nocase: !this.options.caseSensitive
        })) {
          lastMatchingPattern = pattern;
        }
      } else {
        // Positive pattern
        if (minimatch(filePath, pattern, {
          dot: true,
          nocase: !this.options.caseSensitive
        })) {
          lastMatchingPattern = pattern;
        }
      }
    }
    
    return lastMatchingPattern && lastMatchingPattern.startsWith('!');
  }

  /**
   * Test if file matches any pattern in array
   * @private
   */
  _matchesAnyPattern(filePath, patterns) {
    return patterns.some(pattern => this._testPattern(filePath, pattern));
  }

  /**
   * Test if file matches a single pattern
   * @private
   */
  _testPattern(filePath, pattern) {
    try {
      // Handle negation patterns
      if (pattern.startsWith('!')) {
        const positivePattern = pattern.substring(1);
        return !minimatch(filePath, positivePattern, {
          dot: true,
          nocase: !this.options.caseSensitive
        });
      }
      
      return minimatch(filePath, pattern, {
        dot: true,
        nocase: !this.options.caseSensitive
      });
    } catch (error) {
      this._warn(`Error matching pattern '${pattern}': ${error.message}`);
      return false;
    }
  }

  /**
   * Validate glob pattern
   * @private
   */
  _validatePattern(pattern) {
    if (!pattern || typeof pattern !== 'string' || pattern.trim() === '') {
      throw new Error('Empty pattern not allowed');
    }

    // Test pattern compilation - handle negation patterns
    const testPattern = pattern.startsWith('!') ? pattern.substring(1) : pattern;
    try {
      minimatch('test', testPattern);
    } catch (error) {
      throw new Error(`Invalid glob pattern '${pattern}': ${error.message}`);
    }

    // Warn about performance issues
    if (pattern === '**/*' || pattern === '**') {
      this._warn(`Pattern '${pattern}' may have performance impact on large file sets`);
    }
  }

  /**
   * Check for conflicting patterns and warn
   * @private
   */
  _checkForConflicts() {
    // Check for direct conflicts between copy and ignore-copy
    const copyPatterns = this.patterns.copy;
    const ignoreCopyPatterns = this.patterns.ignoreCopy;
    
    for (const copyPattern of copyPatterns) {
      for (const ignorePattern of ignoreCopyPatterns) {
        if (copyPattern === ignorePattern) {
          this._warn(`Conflicting patterns: --copy '${copyPattern}' and --ignore-copy '${ignorePattern}'`);
        }
      }
    }
  }

  /**
   * Emit warning
   * @private
   */
  _warn(message) {
    if (this.onWarning) {
      this.onWarning(message);
    }
  }
}