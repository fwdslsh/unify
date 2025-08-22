/**
 * Link Normalizer
 * Transforms HTML links to pretty URL structure when --pretty-urls is enabled
 * 
 * Implementation for US-018: Link Normalization for Pretty URLs
 */

/**
 * LinkNormalizer handles transformation of HTML links to pretty URL structure
 */
export class LinkNormalizer {
  constructor(options = {}) {
    this.options = {
      prettyUrls: false,
      ...options
    };
  }

  /**
   * Transform a link href to pretty URL format if conditions are met
   * @param {string} href - The link href to transform
   * @returns {string} The transformed href or original if no transformation needed
   */
  transformLink(href) {
    // Handle null, undefined, or empty strings
    if (!href || typeof href !== 'string') {
      return href || '';
    }

    // Clean whitespace and escape characters
    const cleanedHref = this._cleanWhitespace(href);
    if (!cleanedHref) {
      return '';
    }

    // Don't transform if pretty URLs are disabled
    if (!this.options.prettyUrls) {
      return cleanedHref;
    }

    // Check if this link should be transformed
    if (!this.shouldTransform(cleanedHref)) {
      return cleanedHref;
    }

    // Extract and normalize the path part
    const normalizedPath = this.normalizeToPath(cleanedHref);
    
    // Preserve query parameters and fragments
    return this.preserveParameters(cleanedHref, normalizedPath);
  }

  /**
   * Determine if a link should be transformed to pretty URL
   * @param {string} href - The link href to evaluate
   * @returns {boolean} True if link should be transformed
   */
  shouldTransform(href) {
    // Don't transform if pretty URLs are disabled
    if (!this.options.prettyUrls) {
      return false;
    }

    // Don't transform empty or invalid links
    if (!href || typeof href !== 'string' || !href.trim()) {
      return false;
    }

    const trimmedHref = href.trim();

    // Don't transform external links (with protocol)
    if (this._hasProtocol(trimmedHref)) {
      return false;
    }

    // Don't transform protocol-relative links (but allow multiple slashes in paths)
    if (trimmedHref.startsWith('//') && !this._isMultipleSlashPath(trimmedHref)) {
      return false;
    }

    // Don't transform anchor links
    if (trimmedHref.startsWith('#')) {
      return false;
    }

    // Only transform HTML files
    return this._isHtmlFile(trimmedHref);
  }

  /**
   * Convert HTML file path to pretty URL directory structure
   * @param {string} href - The HTML file href
   * @returns {string} The converted directory path
   */
  normalizeToPath(href) {
    const trimmedHref = href.trim();
    
    // Split href to get just the path part (remove query/fragment)
    const pathPart = this._getPathPart(trimmedHref);
    
    // Normalize multiple slashes
    const normalizedPath = this._normalizeSlashes(pathPart);
    
    // Handle index.html special case
    if (this._isIndexFile(normalizedPath)) {
      return this._convertIndexToDirectory(normalizedPath);
    }
    
    // Convert regular HTML files to directory structure
    return this._convertHtmlToDirectory(normalizedPath);
  }

  /**
   * Preserve query parameters and fragments from original href
   * @param {string} originalHref - Original href with possible query/fragment
   * @param {string} transformedPath - The transformed path
   * @returns {string} Combined transformed path with preserved parameters
   */
  preserveParameters(originalHref, transformedPath) {
    const queryIndex = originalHref.indexOf('?');
    const fragmentIndex = originalHref.indexOf('#');
    
    let result = transformedPath;
    
    // Add query parameters
    if (queryIndex !== -1) {
      const queryStart = queryIndex;
      const queryEnd = fragmentIndex !== -1 ? fragmentIndex : originalHref.length;
      const queryString = originalHref.substring(queryStart, queryEnd);
      result += queryString;
    }
    
    // Add fragment
    if (fragmentIndex !== -1) {
      const fragment = originalHref.substring(fragmentIndex);
      result += fragment;
    }
    
    return result;
  }

  /**
   * Check if href has a protocol (http, https, mailto, etc.)
   * @private
   * @param {string} href - The href to check
   * @returns {boolean} True if href has a protocol
   */
  _hasProtocol(href) {
    // Match common protocols: http, https, ftp, mailto, tel, javascript, data, etc.
    const protocolRegex = /^[a-z][a-z0-9+.-]*:/i;
    return protocolRegex.test(href);
  }

  /**
   * Check if href points to an HTML file
   * @private
   * @param {string} href - The href to check
   * @returns {boolean} True if href is an HTML file
   */
  _isHtmlFile(href) {
    // Get the path part without query parameters and fragments
    const pathPart = this._getPathPart(href);
    
    // Check for HTML extensions (case insensitive)
    const htmlExtensions = /\.(html|htm)$/i;
    return htmlExtensions.test(pathPart);
  }

  /**
   * Extract the path part of href (without query parameters and fragments)
   * @private
   * @param {string} href - The full href
   * @returns {string} The path part only
   */
  _getPathPart(href) {
    const queryIndex = href.indexOf('?');
    const fragmentIndex = href.indexOf('#');
    
    let endIndex = href.length;
    if (queryIndex !== -1) endIndex = Math.min(endIndex, queryIndex);
    if (fragmentIndex !== -1) endIndex = Math.min(endIndex, fragmentIndex);
    
    return href.substring(0, endIndex);
  }

  /**
   * Normalize multiple slashes in a path
   * @private
   * @param {string} path - The path to normalize
   * @returns {string} Path with normalized slashes
   */
  _normalizeSlashes(path) {
    return path.replace(/\/+/g, '/');
  }

  /**
   * Check if path represents an index file
   * @private
   * @param {string} path - The path to check
   * @returns {boolean} True if path is an index file
   */
  _isIndexFile(path) {
    const indexRegex = /(^|\/)index\.(html|htm)$/i;
    return indexRegex.test(path);
  }

  /**
   * Convert index.html paths to directory structure
   * @private
   * @param {string} path - Path containing index.html
   * @returns {string} Directory path
   */
  _convertIndexToDirectory(path) {
    // Remove index.html and get directory path
    const indexRegex = /(.*\/)?index\.(html|htm)$/i;
    const match = path.match(indexRegex);
    
    if (match) {
      const directoryPath = match[1] || '/';
      // Ensure it starts with / for absolute paths
      return directoryPath === '/' ? '/' : this._ensureLeadingSlash(directoryPath);
    }
    
    return '/';
  }

  /**
   * Convert HTML file paths to directory structure  
   * @private
   * @param {string} path - HTML file path
   * @returns {string} Directory path
   */
  _convertHtmlToDirectory(path) {
    // Remove .html/.htm extension and add trailing slash
    const htmlRegex = /^(.*)\.html?$/i;
    const match = path.match(htmlRegex);
    
    if (match) {
      const pathWithoutExtension = match[1];
      
      // Handle special case of just ".html"
      if (!pathWithoutExtension || pathWithoutExtension === '') {
        return '/';
      }
      
      // Ensure leading slash and add trailing slash
      const normalizedPath = this._ensureLeadingSlash(pathWithoutExtension);
      return normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/';
    }
    
    return path;
  }

  /**
   * Ensure path starts with a leading slash
   * @private
   * @param {string} path - The path to check
   * @returns {string} Path with leading slash
   */
  _ensureLeadingSlash(path) {
    // Handle relative paths (starting with ./ or ../)
    if (path.startsWith('./') || path.startsWith('../')) {
      return path;
    }
    
    // Add leading slash if not present
    return path.startsWith('/') ? path : '/' + path;
  }

  /**
   * Clean whitespace and escape characters from href
   * @private
   * @param {string} href - The href to clean
   * @returns {string} Cleaned href
   */
  _cleanWhitespace(href) {
    return href
      .trim() // Remove leading/trailing whitespace
      .replace(/\\t/g, '') // Remove literal \t
      .replace(/\\n/g, '') // Remove literal \n
      .replace(/\t/g, '') // Remove actual tab characters
      .replace(/\n/g, '') // Remove actual newlines
      .replace(/\r/g, ''); // Remove carriage returns
  }

  /**
   * Check if href with multiple slashes is a path (not protocol-relative)
   * @private
   * @param {string} href - The href to check
   * @returns {boolean} True if it's a path with multiple slashes, not protocol-relative
   */
  _isMultipleSlashPath(href) {
    // Protocol-relative URLs have format //domain.com/path
    // Check if it looks like a domain after the //
    const domainAfterSlashes = href.substring(2); // Remove leading //
    const firstSlashIndex = domainAfterSlashes.indexOf('/');
    
    if (firstSlashIndex === -1) {
      // No slash after //, could be just //domain or //docs
      // If it contains a dot, likely a domain
      return !domainAfterSlashes.includes('.');
    }
    
    const possibleDomain = domainAfterSlashes.substring(0, firstSlashIndex);
    
    // If it contains a dot and looks like a domain, it's protocol-relative
    if (possibleDomain.includes('.') && possibleDomain.length > 2) {
      return false; // It's protocol-relative
    }
    
    // Otherwise, treat as multiple slashes in path
    return true;
  }
}