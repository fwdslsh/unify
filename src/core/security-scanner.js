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

    // Event handlers (including data-on* attributes and XML namespaces)
    const eventHandlerRegex = /\s((?:data-|xml:)?on\w+)\s*=\s*"([^"]*)"/gi;
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

    // Single-quote event handlers (including data-on* attributes and XML namespaces)
    const eventHandlerRegexSingle = /\s((?:data-|xml:)?on\w+)\s*=\s*'([^']*)'/gi;
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

    // CSS expression() calls in style attributes or style blocks
    if (line.includes('expression(')) {
      warnings.push({
        type: 'XSS_RISK',
        severity: this.options.severityLevels.XSS_RISK,
        message: 'CSS expression() detected - potential XSS vector',
        filePath,
        line: lineNumber,
        context: 'expression()'
      });
    }

    // Data URL with JavaScript content
    if (line.includes('data:') && (line.includes('javascript') || line.includes('script') || line.includes('alert'))) {
      warnings.push({
        type: 'XSS_RISK',
        severity: this.options.severityLevels.XSS_RISK,
        message: 'Suspicious data URL detected',
        filePath,
        line: lineNumber,
        context: 'data: URL with script content'
      });
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
      if (line.includes('alert(') || line.includes('prompt(') || line.includes('confirm(')) {
        warnings.push({
          type: 'XSS_RISK',
          severity: this.options.severityLevels.XSS_RISK,
          message: 'Potentially unsafe script content',
          filePath,
          line: lineNumber,
          context: 'alert/prompt/confirm'
        });
      }
    }

    // Template injection patterns
    const templatePatterns = [
      /\$\{[^}]*\}/,  // ${} expressions
      /#\{[^}]*\}/,  // #{} expressions
      /<%[^%]*%>/,   // <% %> expressions
    ];
    
    for (const pattern of templatePatterns) {
      if (pattern.test(line)) {
        warnings.push({
          type: 'CONTENT_INJECTION',
          severity: this.options.severityLevels.CONTENT_INJECTION,
          message: 'Server-side template injection pattern detected',
          filePath,
          line: lineNumber,
          context: line.match(pattern)?.[0] || 'template expression'
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

    // JavaScript URLs in various attributes (including obfuscated)
    const jsUrlRegex = /\s(href|src|action|data)\s*=\s*["']\s*(?:javascript|jAvAsCrIpT|j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t)\s*:/gi;
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

    // Obfuscated JavaScript URLs with various encodings
    if (line.includes('jAvAsCrIpT:') || line.includes('j a v a s c r i p t :') ||
        line.includes('java\\u0073cript:') || line.includes('java\\x73cript:') ||
        line.includes('java&#115;cript:') || line.includes('java&#x73;cript:') ||
        line.includes('javascript&colon;') || line.includes('vbscript:')) {
      warnings.push({
        type: 'JAVASCRIPT_URL',
        severity: this.options.severityLevels.JAVASCRIPT_URL,
        message: 'Obfuscated JavaScript URL detected',
        filePath,
        line: lineNumber,
        context: line.trim()
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

    // Data URLs with HTML/JavaScript content
    if (line.includes('data:text/html') || (line.includes('data:') && line.includes('script'))) {
      warnings.push({
        type: 'JAVASCRIPT_URL',
        severity: this.options.severityLevels.JAVASCRIPT_URL,
        message: 'Suspicious data URI detected',
        filePath,
        line: lineNumber,
        context: 'data: URI with HTML/JavaScript'
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

    // Script injection in JSON contexts - look for script tags breaking out of JSON
    if (line.includes('"</script><script>') || 
        (line.includes('application/json') && line.includes('<script>')) ||
        (line.includes('window.location') && line.includes('='))) {
      warnings.push({
        type: 'CONTENT_INJECTION',
        severity: this.options.severityLevels.CONTENT_INJECTION,
        message: 'Script injection detected in JSON context',
        filePath,
        line: lineNumber,
        context: line.trim()
      });
    }

    // LDAP injection patterns
    if (line.includes('(&(') && line.includes('objectClass') && line.includes('|(')) {
      warnings.push({
        type: 'CONTENT_INJECTION',
        severity: this.options.severityLevels.CONTENT_INJECTION,
        message: 'LDAP injection pattern detected',
        filePath,
        line: lineNumber,
        context: line.trim()
      });
    }

    // NoSQL injection patterns
    if (line.includes('"$gt"') || line.includes('"$lt"') || line.includes('"$ne"')) {
      warnings.push({
        type: 'CONTENT_INJECTION',
        severity: this.options.severityLevels.CONTENT_INJECTION,
        message: 'NoSQL injection pattern detected',
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

    // Mutation XSS patterns (HTML entities)
    if (line.includes('&lt;') && line.includes('onerror') && line.includes('&gt;')) {
      warnings.push({
        type: 'CONTENT_INJECTION',
        severity: this.options.severityLevels.CONTENT_INJECTION,
        message: 'Mutation XSS pattern detected',
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

    // Path traversal patterns in various attributes (including URL-encoded)
    const pathTraversalRegex = /\s(src|href|action|data-[\w-]+)\s*=\s*["']([^"']*(?:\.\.|%2e%2e|%252e%252e)[/\\%][^"']*)["']/gi;
    let match;
    while ((match = pathTraversalRegex.exec(line)) !== null) {
      const attribute = match[1];
      const path = match[2];
      
      // Decode URL-encoded patterns for detection
      const decodedPath = decodeURIComponent(decodeURIComponent(path));
      
      // Check for explicit path traversal sequences
      if (path.includes('../') || path.includes('..\\') || 
          path.includes('%2e%2e') || path.includes('%252e%252e') ||
          decodedPath.includes('../') || decodedPath.includes('..\\')) {
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

    // Path traversal in CSS imports
    if (line.includes('@import') && (line.includes('../') || line.includes('%2e%2e'))) {
      warnings.push({
        type: 'PATH_TRAVERSAL',
        severity: this.options.severityLevels.PATH_TRAVERSAL,
        message: 'Path traversal detected in CSS import',
        filePath,
        line: lineNumber,
        context: line.trim()
      });
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
        const trimmedLine = scriptLine.trim();
        if (!trimmedLine) return;
        
        if (trimmedLine.includes('document.write')) {
          warnings.push({
            type: 'CONTENT_INJECTION',
            severity: this.options.severityLevels.CONTENT_INJECTION,
            message: 'Potential content injection in script',
            filePath,
            line: scriptTagLine + index,
            context: 'document.write'
          });
        }
        
        if (trimmedLine.includes('eval(')) {
          warnings.push({
            type: 'CONTENT_INJECTION',
            severity: this.options.severityLevels.CONTENT_INJECTION,
            message: 'Potential content injection in script',
            filePath,
            line: scriptTagLine + index,
            context: 'eval()'
          });
        }
        
        // DOM-based XSS patterns
        if (trimmedLine.includes('innerHTML') || trimmedLine.includes('outerHTML') || 
            (trimmedLine.includes('location.') && trimmedLine.includes('=')) ||
            (trimmedLine.includes('document.URL') && trimmedLine.includes('='))) {
          warnings.push({
            type: 'CONTENT_INJECTION',
            severity: this.options.severityLevels.CONTENT_INJECTION,
            message: 'Potential DOM-based XSS in script',
            filePath,
            line: scriptTagLine + index,
            context: 'DOM manipulation'
          });
        }
        
        // Additional dangerous patterns for multiline scripts
        if (trimmedLine.includes('alert(') || trimmedLine.includes('prompt(') || trimmedLine.includes('confirm(')) {
          warnings.push({
            type: 'CONTENT_INJECTION',
            severity: this.options.severityLevels.CONTENT_INJECTION,
            message: 'Potential content injection in script',
            filePath,
            line: scriptTagLine + index,
            context: 'alert/prompt/confirm'
          });
        }
      });
    }

    // Check for script injection in HTML comments (including IE conditional comments)
    const commentScriptRegex = /<!--[\s\S]*?<script[\s\S]*?<\/script>[\s\S]*?-->/gi;
    while ((match = commentScriptRegex.exec(htmlContent)) !== null) {
      const beforeMatch = htmlContent.substring(0, match.index);
      const matchLine = beforeMatch.split('\n').length;
      warnings.push({
        type: 'CONTENT_INJECTION',
        severity: this.options.severityLevels.CONTENT_INJECTION,
        message: 'Script injection detected in HTML comment',
        filePath,
        line: matchLine,
        context: 'script in comment'
      });
    }

    // Check for script injection in JSON contexts (multiline)
    const jsonScriptRegex = /<script[^>]*type=["']application\/json["'][^>]*>[\s\S]*?"[\s\S]*?<\/script><script>[\s\S]*?<\/script>/gi;
    while ((match = jsonScriptRegex.exec(htmlContent)) !== null) {
      const beforeMatch = htmlContent.substring(0, match.index);
      const matchLine = beforeMatch.split('\n').length;
      warnings.push({
        type: 'CONTENT_INJECTION',
        severity: this.options.severityLevels.CONTENT_INJECTION,
        message: 'Script injection detected breaking out of JSON context',
        filePath,
        line: matchLine,
        context: 'JSON script break-out'
      });
    }

    // Detect polyglot attacks (content that's valid in multiple contexts)
    if (htmlContent.includes('\"/*"/*') && htmlContent.includes('<script>')) {
      warnings.push({
        type: 'CONTENT_INJECTION',
        severity: this.options.severityLevels.CONTENT_INJECTION,
        message: 'Polyglot attack pattern detected',
        filePath,
        line: 1,
        context: 'polyglot pattern'
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