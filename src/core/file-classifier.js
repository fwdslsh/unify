/**
 * File Classification System for Unify v0.6.0
 * 
 * Implements the three-tier precedence system for determining file processing:
 * Tier 1: Explicit Overrides (--render, --auto-ignore=false)
 * Tier 2: Ignore Rules (--ignore*, .gitignore)
 * Tier 3: Default Behavior (renderables -> EMIT, assets -> COPY)
 */

import { minimatch } from 'minimatch';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger.js';

// Classification actions
export const FileClassification = {
  EMIT: 'emit',     // Render and output as page
  COPY: 'copy',     // Copy as-is
  SKIP: 'skip',     // Ignore completely
  IGNORED: 'ignored' // Explicitly ignored
};

// Precedence tiers
export const PrecedenceTier = {
  EXPLICIT_OVERRIDES: 1, // --render, --auto-ignore=false
  IGNORE_RULES: 2,       // --ignore*, .gitignore
  DEFAULT_BEHAVIOR: 3    // renderables -> EMIT, assets -> COPY
};

export class FileClassifier {
  constructor(options = {}) {
    this.options = {
      autoIgnore: true,
      copy: [],
      ignore: [],
      ignoreRender: [],
      ignoreCopy: [],
      render: [],
      sourceRoot: 'src',
      ...options
    };
    
    // Track layout and include files for auto-ignore
    this.layoutFiles = new Set();
    this.includeFiles = new Set();
    
    logger.debug(`FileClassifier initialized with options:`, this.options);
  }

  /**
   * Classify a file and determine its processing action
   * @param {string} filePath - Relative path from source root
   * @returns {Promise<Object>} Classification result
   */
  async classifyFile(filePath) {
    const classification = {
      action: null,
      reason: '',
      tier: null,
      filePath: filePath
    };

    // Convert to POSIX for cross-platform compatibility
    const posixPath = filePath.replace(/\\/g, '/');
    
    logger.debug(`Classifying file: ${posixPath}`);

    // Collect all matching patterns with their tiers and priorities
    const matches = [];

    // Check all patterns and collect matches
    if (this.matchesPattern(posixPath, this.options.ignore)) {
      matches.push({ 
        action: FileClassification.IGNORED, 
        reason: '--ignore pattern match', 
        tier: PrecedenceTier.IGNORE_RULES,
        priority: 1
      });
    }

    if (this.matchesPattern(posixPath, this.options.ignoreRender) && this.isRenderable(filePath)) {
      matches.push({ 
        action: FileClassification.IGNORED, 
        reason: '--ignore-render pattern match', 
        tier: PrecedenceTier.IGNORE_RULES,
        priority: 2  // More specific than general ignore
      });
    }

    if (this.matchesPattern(posixPath, this.options.ignoreCopy) && !this.isRenderable(filePath)) {
      matches.push({ 
        action: FileClassification.IGNORED, 
        reason: '--ignore-copy pattern match', 
        tier: PrecedenceTier.IGNORE_RULES,
        priority: 2  // More specific than general ignore
      });
    }

    if (this.matchesPattern(posixPath, this.options.render) && this.isRenderable(filePath)) {
      matches.push({ 
        action: FileClassification.EMIT, 
        reason: '--render pattern match', 
        tier: PrecedenceTier.EXPLICIT_OVERRIDES,
        priority: 1
      });
    }

    // Auto-ignore rules
    if (this.options.autoIgnore && (this.layoutFiles.has(filePath) || this.includeFiles.has(filePath))) {
      matches.push({ 
        action: FileClassification.IGNORED, 
        reason: 'auto-ignore (layout/include file)', 
        tier: PrecedenceTier.IGNORE_RULES,
        priority: 0
      });
    } else if (this.options.autoIgnore && await this.isAutoIgnoredFile(filePath)) {
      matches.push({ 
        action: FileClassification.IGNORED, 
        reason: 'auto-ignore (underscore prefix or directory)', 
        tier: PrecedenceTier.IGNORE_RULES,
        priority: 0
      });
    }

    // If we have matches, find the winner
    if (matches.length > 0) {
      // Sort by tier (higher tier = higher priority), then by priority within tier
      matches.sort((a, b) => {
        if (a.tier !== b.tier) {
          return a.tier - b.tier; // Lower tier number = higher priority (EXPLICIT_OVERRIDES = 1)
        }
        return b.priority - a.priority; // Higher priority within tier
      });

      // But specific ignore rules can override broader render rules
      const winningMatch = this.resolveConflicts(matches, posixPath);
      
      classification.action = winningMatch.action;
      classification.reason = winningMatch.reason;
      classification.tier = winningMatch.tier;
      
      logger.debug(`Matched: ${posixPath} -> ${winningMatch.action} (${winningMatch.reason})`);
      return classification;
    }

    // Tier 3: Default Behavior - no explicit patterns matched
    if (this.isRenderable(filePath)) {
      classification.action = FileClassification.EMIT;
      classification.reason = `renderable file (.html, .htm, .md)`;
      classification.tier = PrecedenceTier.DEFAULT_BEHAVIOR;
      logger.debug(`Tier 3: ${posixPath} -> EMIT (renderable)`);
    } else {
      // Check copy patterns (user patterns first, then implicit assets)
      const copyPatterns = [...this.options.copy];
      
      // Add implicit assets/** pattern if not already present
      if (!copyPatterns.some(pattern => pattern === 'assets/**' || pattern === '!assets/**')) {
        copyPatterns.push('assets/**');
      }
      
      if (this.matchesPattern(posixPath, copyPatterns)) {
        classification.action = FileClassification.COPY;
        classification.reason = `asset or copy pattern match`;
        classification.tier = PrecedenceTier.DEFAULT_BEHAVIOR;
        logger.debug(`Tier 3: ${posixPath} -> COPY (copy pattern)`);
      } else {
        classification.action = FileClassification.SKIP;
        classification.reason = `non-renderable, no copy rule`;
        classification.tier = PrecedenceTier.DEFAULT_BEHAVIOR;
        logger.debug(`Tier 3: ${posixPath} -> SKIP (no rules match)`);
      }
    }

    return classification;
  }

  /**
   * Resolve conflicts between matching patterns, allowing specific ignore rules to override broader render rules
   * @param {Object[]} matches - Array of matching patterns
   * @param {string} posixPath - File path being classified
   * @returns {Object} Winning match
   */
  resolveConflicts(matches, posixPath) {
    // Check if we have both ignore-render and render matches
    const ignoreRenderMatch = matches.find(m => m.reason.includes('--ignore-render'));
    const renderMatch = matches.find(m => m.reason.includes('--render'));
    
    // If we have both, prefer the more specific ignore-render
    if (ignoreRenderMatch && renderMatch) {
      // Get the actual patterns that matched to compare specificity
      const ignoreRenderPattern = this.findMatchingPattern(posixPath, this.options.ignoreRender);
      const renderPattern = this.findMatchingPattern(posixPath, this.options.render);
      
      // If ignore-render pattern is more specific or equal, it wins
      if (ignoreRenderPattern && renderPattern) {
        if (ignoreRenderPattern.length >= renderPattern.length) {
          return ignoreRenderMatch;
        }
      }
    }
    
    // Otherwise use standard tier-based precedence (first match after sorting)
    return matches[0];
  }

  /**
   * Find the actual pattern that matched a file path
   * @param {string} filePath - File path to test
   * @param {string[]} patterns - Array of glob patterns
   * @returns {string|null} The matching pattern or null
   */
  findMatchingPattern(filePath, patterns) {
    if (!patterns || patterns.length === 0) return null;
    
    // Process patterns in reverse order to get the last matching pattern
    for (let i = patterns.length - 1; i >= 0; i--) {
      const pattern = patterns[i];
      if (pattern.startsWith('!')) {
        // Negation pattern - if it matches, continue looking for positive matches
        if (minimatch(filePath, pattern.slice(1))) {
          continue;
        }
      } else {
        if (minimatch(filePath, pattern)) {
          return pattern;
        }
      }
    }
    
    return null;
  }

  /**
   * Check if a file can be rendered (HTML or Markdown)
   * @param {string} filePath - File path to check
   * @returns {boolean} True if renderable
   */
  isRenderable(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.html', '.htm', '.md'].includes(ext);
  }

  /**
   * Check if path matches any of the given glob patterns
   * Uses "last pattern wins" logic (ripgrep-style)
   * @param {string} filePath - File path to test
   * @param {string[]} patterns - Array of glob patterns
   * @returns {boolean} True if matches
   */
  matchesPattern(filePath, patterns) {
    if (!patterns || patterns.length === 0) return false;
    
    let result = false;
    
    // Process patterns in order, last matching pattern wins
    for (const pattern of patterns) {
      if (pattern.startsWith('!')) {
        // Negation pattern
        if (minimatch(filePath, pattern.slice(1))) {
          result = false;
          logger.debug(`Pattern negation: ${filePath} matches !${pattern.slice(1)} -> false`);
        }
      } else {
        if (minimatch(filePath, pattern)) {
          result = true;
          logger.debug(`Pattern match: ${filePath} matches ${pattern} -> true`);
        }
      }
    }
    
    return result;
  }

  /**
   * Check if file should be auto-ignored due to underscore prefix
   * @param {string} filePath - File path to check
   * @returns {Promise<boolean>} True if should be auto-ignored
   */
  async isAutoIgnoredFile(filePath) {
    // Check if file starts with underscore
    const basename = path.basename(filePath);
    if (basename.startsWith('_')) {
      logger.debug(`Auto-ignore: ${filePath} has underscore prefix`);
      return true;
    }
    
    // Check if in underscore directory
    const parts = filePath.split(path.sep);
    const hasUnderscoreDir = parts.some(part => part.startsWith('_') && part !== '.');
    if (hasUnderscoreDir) {
      logger.debug(`Auto-ignore: ${filePath} is in underscore directory`);
      return true;
    }
    
    return false;
  }

  /**
   * Register a file as a layout file for auto-ignore
   * @param {string} filePath - Layout file path
   */
  addLayoutFile(filePath) {
    this.layoutFiles.add(filePath);
    logger.debug(`Added layout file for auto-ignore: ${filePath}`);
  }

  /**
   * Register a file as an include file for auto-ignore
   * @param {string} filePath - Include file path
   */
  addIncludeFile(filePath) {
    this.includeFiles.add(filePath);
    logger.debug(`Added include file for auto-ignore: ${filePath}`);
  }

  /**
   * Generate dry-run report for file classifications
   * @param {Object[]} classifications - Array of classification results
   * @returns {string} Formatted dry-run report
   */
  generateDryRunReport(classifications) {
    const lines = [];
    
    // Group by action
    const groups = {
      [FileClassification.EMIT]: [],
      [FileClassification.COPY]: [],
      [FileClassification.SKIP]: [],
      [FileClassification.IGNORED]: []
    };
    
    for (const classification of classifications) {
      groups[classification.action].push(classification);
    }
    
    // Generate report
    for (const [action, items] of Object.entries(groups)) {
      if (items.length === 0) continue;
      
      lines.push(`\n${action.toUpperCase()} (${items.length} files):`);
      
      for (const item of items) {
        lines.push(`  ${item.filePath}`);
        lines.push(`    reason: ${item.reason}`);
        if (logger.level === 'DEBUG') {
          lines.push(`    tier: ${item.tier}`);
        }
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Classify all files in a directory
   * @param {string} sourceDir - Source directory path
   * @returns {Promise<Object[]>} Array of classification results
   */
  async classifyAllFiles(sourceDir) {
    const classifications = [];
    
    const walkDir = async (dir, relativePath = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name).replace(/\\/g, '/');
        
        if (entry.isDirectory()) {
          await walkDir(fullPath, relPath);
        } else if (entry.isFile()) {
          const classification = await this.classifyFile(relPath);
          classifications.push(classification);
        }
      }
    };
    
    await walkDir(sourceDir);
    return classifications;
  }

}

// Export singleton instance (legacy compatibility)
export const fileClassifier = new FileClassifier();