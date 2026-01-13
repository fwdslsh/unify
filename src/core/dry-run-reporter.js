/**
 * Dry Run Reporter
 * Implements US-021: Dry Run Mode with File Classification
 * 
 * Formats and displays file classification information during dry-run mode.
 * Shows what files would be processed without actually writing output files.
 */

/**
 * DryRunReporter handles formatting and display of file classification
 * information during dry-run mode execution.
 */
export class DryRunReporter {
  constructor() {
    this.logLevel = 'info';
  }

  /**
   * Format file classification for display
   * @param {string} filePath - Path to the file being classified
   * @param {Object} classification - Classification result from FileClassifier
   * @param {Object|null} layoutInfo - Layout resolution information (for EMIT files)
   * @returns {string} Formatted classification output
   */
  formatFileClassification(filePath, classification, layoutInfo = null) {
    const action = classification.action;
    const actionLabel = `[${action}]`;
    const paddedAction = actionLabel.padEnd(9); // Consistent width
    
    let output = `${paddedAction} ${filePath}`;
    
    // Add reason line with proper indentation
    const reason = this._formatReason(classification, layoutInfo);
    if (reason) {
      output += `\n          ${reason}`;
    }
    
    // Add layout chain for EMIT files with multiple layouts
    if (action === 'EMIT' && layoutInfo?.resolutionChain?.length > 1) {
      const chain = layoutInfo.resolutionChain.join(' -> ');
      output += `\n          layout chain: ${chain}`;
    }
    
    return output;
  }

  /**
   * Format the reason for classification
   * @param {Object} classification - Classification result
   * @param {Object|null} layoutInfo - Layout information
   * @returns {string} Formatted reason
   * @private
   */
  _formatReason(classification, layoutInfo) {
    const { action, reason, matchedPattern } = classification;
    
    // Handle pattern matches first - check for specific patterns in the reason
    if (matchedPattern) {
      if (reason.includes('copy pattern') || reason === 'matched --copy') {
        return `reason: matched --copy '${matchedPattern}'`;
      } else if (reason.includes('--ignore pattern') || reason === 'matched --ignore') {
        return `reason: matched --ignore '${matchedPattern}'`;
      } else if (reason.includes('--ignore-copy pattern') || reason === 'matched --ignore-copy') {
        return `reason: matched --ignore-copy '${matchedPattern}'`;
      } else if (reason.includes('--ignore-render pattern') || reason === 'matched --ignore-render') {
        return `reason: matched --ignore-render '${matchedPattern}'`;
      } else if (reason.includes('--render pattern') && reason.includes('override') || reason === '--render override') {
        return `reason: --render '${matchedPattern}' overrides .gitignore`;
      }
    }
    
    let reasonText = `reason: ${reason}`;
    
    if (action === 'EMIT') {
      if (layoutInfo && layoutInfo.layoutPath) {
        reasonText += `; layout=${layoutInfo.layoutPath} (${layoutInfo.resolutionMethod})`;
      } else {
        reasonText += '; no layout';
      }
    } else if (action === 'COPY' && reason === 'implicit assets/**') {
      reasonText = 'reason: implicit assets/** (not ignored)';
    }
    
    return reasonText;
  }

  /**
   * Format summary statistics for all classified files
   * @param {Object} stats - Classification statistics
   * @param {number} stats.total - Total files classified
   * @param {number} stats.emit - Files to be emitted
   * @param {number} stats.copy - Files to be copied
   * @param {number} stats.skip - Files to be skipped
   * @param {number} stats.ignored - Files ignored
   * @returns {string} Formatted summary
   */
  formatSummary(stats) {
    const { total, emit, copy, skip, ignored } = stats;
    
    const lines = [
      `Files classified: ${total} total`,
      `  EMIT:    ${emit} ${this._pluralize('file', emit)} (will be rendered)`,
      `  COPY:    ${copy} ${this._pluralize('file', copy)}${copy > 0 ? ' (will be copied)' : ''}`,
      `  SKIP:    ${skip} ${this._pluralize('file', skip)}${skip > 0 ? ' (non-renderable)' : ''}`,
      `  IGNORED: ${ignored} ${this._pluralize('file', ignored)}${ignored > 0 ? ' (explicitly ignored)' : ''}`,
      '',
      'No output files written (dry run mode).'
    ];
    
    return lines.join('\n');
  }

  /**
   * Determine if a classification should be shown based on log level
   * @param {Object} classification - Classification result
   * @param {string} logLevel - Current log level (info, debug, etc.)
   * @returns {boolean} True if classification should be displayed
   */
  shouldShowClassification(classification, logLevel) {
    const { action } = classification;
    
    // Always show EMIT and COPY actions
    if (action === 'EMIT' || action === 'COPY') {
      return true;
    }
    
    // Only show SKIP and IGNORED in debug mode
    if (action === 'SKIP' || action === 'IGNORED') {
      return logLevel === 'debug';
    }
    
    return true;
  }

  /**
   * Get the appropriate plural or singular form of a word
   * @param {string} word - Word to pluralize
   * @param {number} count - Count to determine singular/plural
   * @returns {string} Correct form of the word
   * @private
   */
  _pluralize(word, count) {
    return count === 1 ? word : `${word}s`;
  }
}