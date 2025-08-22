/**
 * SecurityScanner - HTML Security Vulnerability Detection (Simplified Version)
 * Scans HTML content for potential security issues (XSS, JavaScript URLs, Content Injection)
 */

/**
 * SecurityScanner detects potential security vulnerabilities in HTML content
 */
export class SecurityScanner {
  constructor(options = {}) {
    this.options = {
      disableChecks: options.disableChecks || [],
      severityLevels: {
        XSS_RISK: 'warning',
        JAVASCRIPT_URL: 'warning',
        CONTENT_INJECTION: 'warning',
        PATH_TRAVERSAL: 'warning',
        ...options.severityLevels
      }
    };
  }

  /**
   * Scan HTML content for security issues
   * @param {string} htmlContent - HTML content to scan
   * @param {string} filePath - File path for reporting
   * @returns {Array<SecurityWarning>} Array of security warnings
   */
  scanForSecurityIssues(htmlContent, filePath) {
    if (!htmlContent || typeof htmlContent !== 'string') {
      return [];
    }

    const warnings = [];
    const lines = htmlContent.split('\n');

    // Scan each line for security issues
    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      // Skip disabled checks
      if (!this.options.disableChecks.includes('XSS_RISK')) {
        warnings.push(...this._detectXSSInLine(line, lineNumber, filePath));
      }

      if (!this.options.disableChecks.includes('JAVASCRIPT_URL')) {
        warnings.push(...this._detectJavaScriptUrlsInLine(line, lineNumber, filePath));
      }

      if (!this.options.disableChecks.includes('CONTENT_INJECTION')) {
        warnings.push(...this._detectContentInjectionInLine(line, lineNumber, filePath));
      }

      if (!this.options.disableChecks.includes('PATH_TRAVERSAL')) {
        warnings.push(...this._detectPathTraversalInLine(line, lineNumber, filePath));
      }
    });

    // Additional multiline detection for script blocks
    if (!this.options.disableChecks.includes('CONTENT_INJECTION')) {
      warnings.push(...this._detectMultilineScriptIssues(htmlContent, filePath));
    }

    return warnings;
  }

  /**
   * Detect XSS risks in a single line
   * @private
   */
  _detectXSSInLine(line, lineNumber, filePath) {
    const warnings = [];

    // Event handlers (including data-on* attributes)
    const eventHandlerRegex = /\s((?:data-)?on\w+)\s*=\s*"([^"]*)"/gi;
    let match;
    while ((match = eventHandlerRegex.exec(line)) !== null) {
      const handlerName = match[1];
      const handlerCode = match[2];
      
      if (!this._isSafeEventHandler(handlerCode)) {
        const tagName = this._extractTagName(line, match.index);
        warnings.push({
          type: 'XSS_RISK',
          severity: this.options.severityLevels.XSS_RISK,
          message: `Event handler detected in <${tagName}> tag`,
          filePath,
          line: lineNumber,
          context: `${handlerName}="${handlerCode}"`
        });
      }
    }

    // Single-quote event handlers (including data-on* attributes)
    const eventHandlerRegexSingle = /\s((?:data-)?on\w+)\s*=\s*'([^']*)'/gi;
    while ((match = eventHandlerRegexSingle.exec(line)) !== null) {
      const handlerName = match[1];
      const handlerCode = match[2];
      
      if (!this._isSafeEventHandler(handlerCode)) {
        const tagName = this._extractTagName(line, match.index);
        warnings.push({
          type: 'XSS_RISK',
          severity: this.options.severityLevels.XSS_RISK,
          message: `Event handler detected in <${tagName}> tag`,
          filePath,
          line: lineNumber,
          context: `${handlerName}='${handlerCode}'`
        });
      }
    }

    // Script content with dangerous functions (single-line only, multiline handled separately)
    if (line.includes('<script') && line.includes('</script>')) {
      if (line.includes('document.write')) {
        warnings.push({
          type: 'XSS_RISK',
          severity: this.options.severityLevels.XSS_RISK,
          message: 'Potentially unsafe script content',
          filePath,
          line: lineNumber,
          context: 'document.write'
        });
      }
      if (line.includes('eval(')) {
        warnings.push({
          type: 'CONTENT_INJECTION',
          severity: this.options.severityLevels.CONTENT_INJECTION,
          message: 'Potential content injection in script',
          filePath,
          line: lineNumber,
          context: 'eval()'
        });
      }
    }

    // XSS in meta tags (with script tags in content) - only if not already detected as content injection
    if (line.includes('<meta') && line.includes('<script>') && !line.includes('name="description"')) {
      warnings.push({
        type: 'XSS_RISK',
        severity: this.options.severityLevels.XSS_RISK,
        message: 'Event handler detected in <meta> tag',
        filePath,
        line: lineNumber,
        context: line.trim()
      });
    }

    return warnings;
  }

  /**
   * Detect JavaScript URLs in a single line
   * @private
   */
  _detectJavaScriptUrlsInLine(line, lineNumber, filePath) {
    const warnings = [];

    // JavaScript URLs in various attributes
    const jsUrlRegex = /\s(href|src|action)\s*=\s*["']\s*javascript\s*:/gi;
    let match;
    while ((match = jsUrlRegex.exec(line)) !== null) {
      const attribute = match[1];
      warnings.push({
        type: 'JAVASCRIPT_URL',
        severity: this.options.severityLevels.JAVASCRIPT_URL,
        message: `JavaScript URL: Potential XSS vector in ${attribute} attribute`,
        filePath,
        line: lineNumber,
        context: match[0]
      });
    }

    // JavaScript URLs in CSS
    if ((line.includes('<style') || line.includes('background:')) && line.includes('javascript:')) {
      warnings.push({
        type: 'JAVASCRIPT_URL',
        severity: this.options.severityLevels.JAVASCRIPT_URL,
        message: 'JavaScript URL detected in CSS',
        filePath,
        line: lineNumber,
        context: line.trim()
      });
    }

    return warnings;
  }

  /**
   * Detect content injection in a single line
   * @private
   */
  _detectContentInjectionInLine(line, lineNumber, filePath) {
    const warnings = [];

    // HTML injection in title tags
    if (line.includes('<title') && line.includes('<script>')) {
      warnings.push({
        type: 'CONTENT_INJECTION',
        severity: this.options.severityLevels.CONTENT_INJECTION,
        message: 'Unescaped content in <title> tag',
        filePath,
        line: lineNumber,
        context: line.trim()
      });
    }

    // HTML injection in meta description
    if (line.includes('name="description"') && line.includes('<script>')) {
      warnings.push({
        type: 'CONTENT_INJECTION',
        severity: this.options.severityLevels.CONTENT_INJECTION,
        message: 'Unescaped content in <meta> tag',
        filePath,
        line: lineNumber,
        context: line.trim()
      });
    }

    // SQL injection patterns
    const sqlInjectionRegex = /('|\s)(or|and)\s+['"]?1['"]?\s*=\s*['"]?1['"]?/gi;
    let match;
    while ((match = sqlInjectionRegex.exec(line)) !== null) {
      warnings.push({
        type: 'CONTENT_INJECTION',
        severity: this.options.severityLevels.CONTENT_INJECTION,
        message: 'SQL injection pattern detected',
        filePath,
        line: lineNumber,
        context: match[0]
      });
    }

    // HTML injection in attributes
    if (line.includes('title="') && line.includes('\\"><script>')) {
      warnings.push({
        type: 'CONTENT_INJECTION',
        severity: this.options.severityLevels.CONTENT_INJECTION,
        message: 'HTML injection detected in attribute',
        filePath,
        line: lineNumber,
        context: line.trim()
      });
    }

    return warnings;
  }

  /**
   * Detect path traversal attacks in a single line
   * @private
   */
  _detectPathTraversalInLine(line, lineNumber, filePath) {
    const warnings = [];

    // Path traversal patterns in various attributes
    const pathTraversalRegex = /\s(src|href|action|data-[\w-]+)\s*=\s*["']([^"']*\.\.[/\\][^"']*)["']/gi;
    let match;
    while ((match = pathTraversalRegex.exec(line)) !== null) {
      const attribute = match[1];
      const path = match[2];
      
      // Check for explicit path traversal sequences
      if (path.includes('../') || path.includes('..\\')) {
        const tagName = this._extractTagName(line, match.index);
        warnings.push({
          type: 'PATH_TRAVERSAL',
          severity: this.options.severityLevels.PATH_TRAVERSAL,
          message: `Path traversal attempt detected in <${tagName}> ${attribute} attribute`,
          filePath,
          line: lineNumber,
          context: `${attribute}="${path}"`
        });
      }
    }

    // Also check for absolute paths that might try to access system files
    const systemPathRegex = /\s(src|href|action|data-[\w-]+)\s*=\s*["']([^"']*(?:\/etc\/|\/var\/|\/usr\/|\/home\/|\/root\/|C:\\|D:\\)[^"']*)["']/gi;
    while ((match = systemPathRegex.exec(line)) !== null) {
      const attribute = match[1];
      const path = match[2];
      const tagName = this._extractTagName(line, match.index);
      warnings.push({
        type: 'PATH_TRAVERSAL',
        severity: this.options.severityLevels.PATH_TRAVERSAL,
        message: `Suspicious system path detected in <${tagName}> ${attribute} attribute`,
        filePath,
        line: lineNumber,
        context: `${attribute}="${path}"`
      });
    }

    return warnings;
  }

  /**
   * Detect dangerous content in multiline script blocks
   * @private
   */
  _detectMultilineScriptIssues(htmlContent, filePath) {
    const warnings = [];

    // Find script blocks that span multiple lines only
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = scriptRegex.exec(htmlContent)) !== null) {
      const scriptContent = match[1];
      const fullMatch = match[0];
      
      // Skip single-line scripts (already handled by line detection)
      if (!fullMatch.includes('\n')) {
        continue;
      }

      const scriptStartIndex = match.index;
      
      // Find the line number where the script content starts
      const beforeScript = htmlContent.substring(0, scriptStartIndex);
      const scriptTagLine = beforeScript.split('\n').length;
      
      // Check for dangerous patterns in script content
      const scriptLines = scriptContent.split('\n');
      scriptLines.forEach((scriptLine, index) => {
        if (scriptLine.trim() && scriptLine.includes('document.write')) {
          warnings.push({
            type: 'CONTENT_INJECTION',
            severity: this.options.severityLevels.CONTENT_INJECTION,
            message: 'Potential content injection in script',
            filePath,
            line: scriptTagLine + index,
            context: 'document.write'
          });
        }
      });
    }

    return warnings;
  }

  /**
   * Extract tag name from line at specific position
   * @private
   */
  _extractTagName(line, position) {
    // Find the start of the tag
    let tagStart = line.lastIndexOf('<', position);
    if (tagStart === -1) return 'unknown';

    // Extract tag name
    const tagMatch = line.substring(tagStart).match(/<(\w+)/);
    return tagMatch ? tagMatch[1] : 'unknown';
  }

  /**
   * Check if an event handler is considered safe
   * @private
   */
  _isSafeEventHandler(handlerCode) {
    if (!handlerCode) return false;
    
    // Simple property assignments are generally safe
    const safePatterns = [
      /^this\.style\.\w+\s*=\s*['"][^'"]*['"]$/,
      /^this\.className\s*=\s*['"][^'"]*['"]$/,
      /^this\.disabled\s*=\s*(true|false)$/
    ];

    return safePatterns.some(pattern => pattern.test(handlerCode));
  }

  /**
   * Format security warning for output
   * @param {SecurityWarning} warning - Security warning object
   * @returns {string} Formatted warning message
   */
  formatWarning(warning) {
    const typeMap = {
      XSS_RISK: 'XSS Risk',
      JAVASCRIPT_URL: 'JavaScript URL',
      CONTENT_INJECTION: 'Content Injection',
      PATH_TRAVERSAL: 'Path Traversal'
    };

    const typeLabel = typeMap[warning.type] || warning.type;
    return `[SECURITY] ${typeLabel}: ${warning.message} (${warning.filePath}:${warning.line})`;
  }

  /**
   * Get summary of security scan results
   * @param {Array<SecurityWarning>} warnings - Array of warnings
   * @returns {Object} Scan summary
   */
  getScanSummary(warnings) {
    const summary = {
      total: warnings.length,
      byType: {},
      bySeverity: {}
    };

    warnings.forEach(warning => {
      // Count by type
      summary.byType[warning.type] = (summary.byType[warning.type] || 0) + 1;
      
      // Count by severity
      summary.bySeverity[warning.severity] = (summary.bySeverity[warning.severity] || 0) + 1;
    });

    return summary;
  }
}