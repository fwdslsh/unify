/**
 * HTML Minifier
 * Minifies HTML content for production builds while preserving functionality
 */

/**
 * HTMLMinifier handles HTML minification with configurable options
 */
export class HTMLMinifier {
  constructor(options = {}) {
    this.options = {
      removeComments: true,
      collapseWhitespace: true,
      preserveLineBreaks: false,
      removeEmptyAttributes: false,
      removeRedundantAttributes: false,
      ...options
    };
    
    // Elements where whitespace is significant and should be preserved
    this.whitespacePreserveElements = new Set([
      'pre', 'code', 'textarea', 'script', 'style', 'samp', 'kbd'
    ]);
    
    // Regex patterns for different types of comments
    this.commentPatterns = {
      // IE conditional comments
      conditional: /<!--\[if[^>]*\]>[\s\S]*?<!\[endif\]-->/gi,
      // Server-side includes
      ssi: /<!--#[^>]*-->/gi,
      // Regular HTML comments (greedy approach to handle nested comments)
      regular: /<!--(?!\[if)(?!#)[\s\S]*?-->/gi
    };
  }

  /**
   * Minify HTML content
   * @param {string} html - HTML content to minify
   * @returns {string} Minified HTML
   */
  minify(html) {
    if (!html || typeof html !== 'string') {
      return html;
    }

    let result = html;

    // Step 1: Remove comments (while preserving conditional comments and SSI)
    result = this._removeComments(result);

    // Step 2: Collapse whitespace (using a more refined approach)
    result = this._minifyWhitespace(result);

    return result;
  }

  /**
   * Minify HTML content and return statistics
   * @param {string} html - HTML content to minify
   * @returns {Object} Object with minified html and compression stats
   */
  minifyWithStats(html) {
    const originalSize = Buffer.byteLength(html, 'utf8');
    const minifiedHtml = this.minify(html);
    const minifiedSize = Buffer.byteLength(minifiedHtml, 'utf8');
    const compression = originalSize > 0 ? ((originalSize - minifiedSize) / originalSize * 100) : 0;

    return {
      html: minifiedHtml,
      stats: {
        originalSize,
        minifiedSize,
        compression: Math.round(compression * 100) / 100,
        compressionRatio: originalSize > 0 ? (minifiedSize / originalSize) : 1
      }
    };
  }

  /**
   * Remove HTML comments while preserving conditional comments and SSI
   * @private
   * @param {string} html - HTML content
   * @returns {string} HTML with comments removed
   */
  _removeComments(html) {
    if (!this.options.removeComments) {
      return html;
    }

    let result = html;

    // First, preserve conditional comments and SSI, but minify whitespace inside them
    const preservedComments = [];
    
    // Preserve conditional comments, but minify whitespace inside them
    result = result.replace(/<!--\[if[\s\S]*?\[endif\]-->/g, (match) => {
      const placeholder = `__PRESERVE_${preservedComments.length}__`;
      // Minify whitespace inside the conditional comment
      const minifiedComment = match.replace(/\s+/g, ' ').replace(/>\s+</g, '><');
      preservedComments.push(minifiedComment);
      return placeholder;
    });
    
    // Preserve SSI comments, but minify whitespace inside them  
    result = result.replace(/<!--#[^>]*-->/g, (match) => {
      const placeholder = `__PRESERVE_${preservedComments.length}__`;
      // Minify whitespace inside the SSI comment
      const minifiedComment = match.replace(/\s+/g, ' ');
      preservedComments.push(minifiedComment);
      return placeholder;
    });

    // Remove remaining regular comments using a more sophisticated approach
    result = this._removeRegularComments(result);
    
    // Restore preserved comments
    preservedComments.forEach((comment, index) => {
      const placeholder = `__PRESERVE_${index}__`;
      result = result.replace(placeholder, comment);
    });

    // Final cleanup: remove any remaining spaces between consecutive comments
    result = result.replace(/-->\s+<!--/g, '--><!--');
    
    // Also remove spaces between comments and adjacent content
    result = result.replace(/-->\s+([^<\s])/g, '-->$1');

    return result;
  }

  /**
   * Remove regular HTML comments, handling nested comment structures
   * @private
   * @param {string} html - HTML content
   * @returns {string} HTML with regular comments removed
   */
  _removeRegularComments(html) {
    let result = html;
    
    // Handle nested comments by finding proper comment boundaries
    while (true) {
      const startMatch = result.match(/<!--/);
      if (!startMatch) {
        break; // No more comments
      }
      
      const startIndex = startMatch.index;
      
      // Find all --> sequences after this start
      const afterStart = result.substring(startIndex + 4);
      const endMatches = [...afterStart.matchAll(/-->/g)];
      
      if (endMatches.length === 0) {
        // Malformed comment - remove from start to end
        result = result.substring(0, startIndex);
        break;
      }
      
      // For proper nested comment handling, we need the last --> that closes this comment
      // Count comment starts and ends to find the matching close
      let depth = 1;
      let endIndex = -1;
      
      for (const endMatch of endMatches) {
        const currentEndPos = startIndex + 4 + endMatch.index;
        const betweenText = result.substring(startIndex + 4, currentEndPos);
        const innerStarts = (betweenText.match(/<!--/g) || []).length;
        
        // This end closes (innerStarts + 1) comments
        depth = innerStarts + 1;
        
        // If depth is 1, this is our matching end
        if (depth === 1) {
          endIndex = currentEndPos + 3;
          break;
        }
      }
      
      if (endIndex === -1) {
        // Use the last --> as fallback
        const lastEnd = endMatches[endMatches.length - 1];
        endIndex = startIndex + 4 + lastEnd.index + 3;
      }
      
      // Remove the comment
      result = result.substring(0, startIndex) + result.substring(endIndex);
    }
    
    return result;
  }

  /**
   * Minify whitespace in HTML while preserving critical whitespace
   * @private
   * @param {string} html - HTML content
   * @returns {string} HTML with minified whitespace
   */
  _minifyWhitespace(html) {
    if (!this.options.collapseWhitespace) {
      return html;
    }

    // Track preserved elements to restore them later
    const preservedElements = [];
    let result = html;

    // First, preserve whitespace-sensitive elements
    for (const elementName of this.whitespacePreserveElements) {
      const regex = new RegExp(`(<${elementName}(?:\\s[^>]*)?>)(.*?)(</${elementName}>)`, 'gis');
      result = result.replace(regex, (match, openTag, content, closeTag) => {
        const placeholder = `__PRESERVE_${preservedElements.length}__`;
        preservedElements.push(openTag + content + closeTag);
        return placeholder;
      });
    }

    // Advanced whitespace minification
    result = this._processWhitespaceAdvanced(result);

    // Restore preserved elements
    preservedElements.forEach((element, index) => {
      const placeholder = `__PRESERVE_${index}__`;
      result = result.replace(placeholder, element);
    });

    return result;
  }

  /**
   * Advanced whitespace processing that handles different HTML contexts
   * @private
   * @param {string} html - HTML content with preserved elements replaced
   * @returns {string} HTML with properly minified whitespace
   */
  _processWhitespaceAdvanced(html) {
    let result = html;
    
    // First, minify whitespace inside HTML tags (attributes)
    result = result.replace(/(<[^>]*>)/g, (tag) => {
      return tag.replace(/\s+/g, ' ').replace(/\s*=\s*/g, '=').trim();
    });
    
    // Then process text content and whitespace between elements
    const parts = result.split(/(<[^>]*>)/);
    result = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (part.startsWith('<') && part.endsWith('>')) {
        // This is an HTML tag - already processed above
        result += part;
      } else if (part) {
        // This is text content
        let processedText = part;
        
        // Collapse all whitespace to single spaces
        processedText = processedText.replace(/\s+/g, ' ');
        
        // Remove whitespace at start/end if adjacent to block elements
        const prevIsTag = i > 0 && parts[i - 1].startsWith('<');
        const nextIsTag = i < parts.length - 1 && parts[i + 1].startsWith('<');
        
        if (prevIsTag && this._isBlockElement(parts[i - 1])) {
          processedText = processedText.replace(/^\s+/, '');
        }
        
        if (nextIsTag && this._isBlockElement(parts[i + 1])) {
          processedText = processedText.replace(/\s+$/, '');
        }
        
        result += processedText;
      }
    }

    return result.trim();
  }

  /**
   * Check if an HTML tag represents a block element
   * @private
   * @param {string} tag - HTML tag string
   * @returns {boolean} True if it's a block element
   */
  _isBlockElement(tag) {
    const blockElements = [
      'address', 'article', 'aside', 'blockquote', 'body', 'div', 'footer', 'form',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'html', 'main', 'nav', 'p',
      'section', 'table', 'tbody', 'thead', 'tr', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'head', 'title'
    ];
    
    const tagMatch = tag.match(/^<\/?(\w+)/);
    if (!tagMatch) return false;
    
    const tagName = tagMatch[1].toLowerCase();
    return blockElements.includes(tagName);
  }

  /**
   * Final cleanup operations
   * @private
   * @param {string} html - HTML content
   * @returns {string} HTML with final cleanup applied
   */
  _finalCleanup(html) {
    return html
      // Remove any remaining extra spaces between attributes
      .replace(/\s+/g, ' ')
      // Clean up any remaining whitespace issues
      .trim();
  }

  /**
   * Validate that the minified HTML is still valid
   * @private
   * @param {string} html - HTML content to validate
   * @returns {boolean} True if HTML appears valid
   */
  _validateHTML(html) {
    // Basic validation checks
    const checks = [
      // Should have matching opening/closing tags for common elements
      html.includes('<html') && html.includes('</html>'),
      // Should not have malformed tag structures
      !/<<|>>/.test(html),
      // Should not have unescaped special characters in text content
      !/<script[^>]*>[^<]*<(?!\/script>)/i.test(html)
    ];

    return checks.every(Boolean);
  }
}