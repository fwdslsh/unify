import path from 'path';

/**
 * File classification system for convention-based architecture
 * Determines file types based on naming conventions and location
 */
export class FileClassifier {
  constructor(config = {}) {
    this.excludePattern = config.excludePattern || "_.*";
    this.defaultLayout = config.defaultLayout || "layout";
    // Convert glob pattern to regex for matching
    this.excludeRegex = new RegExp(this.excludePattern.replace('*', '.*'));
  }

  /**
   * Check if a filename or path part matches the exclude pattern
   * @param {string} name - File or directory name to check
   * @returns {boolean} True if matches exclude pattern
   */
  matchesExcludePattern(name) {
    return this.excludeRegex.test(name);
  }

  /**
   * Determine if a file is a page (should be emitted to output)
   * @param {string} filePath - Absolute path to the file
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {boolean} True if file is a page
   */
  isPage(filePath, sourceRoot) {
    const relativePath = path.relative(sourceRoot, filePath);
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    // Must be HTML or Markdown file
    if (!['.html', '.htm', '.md'].includes(extension)) {
      return false;
    }
    
    // Files matching exclude pattern are partials, not pages
    if (this.matchesExcludePattern(fileName)) {
      return false;
    }
    
    // Files in directories matching exclude pattern are not pages
    const pathParts = relativePath.split(path.sep);
    for (const part of pathParts) {
      if (this.matchesExcludePattern(part)) {
        return false;
      }
    }
    
    // PATCH: Always treat markdown files as pages unless in excluded dir
    if (extension === '.md') {
      return true;
    }
    
    return true;
  }
  
  /**
   * Determine if a file is a partial (non-emitting)
   * @param {string} filePath - Absolute path to the file
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {boolean} True if file is a partial
   */
  isPartial(filePath, sourceRoot) {
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    // Must be HTML file
    if (!['.html', '.htm'].includes(extension)) {
      return false;
    }
    
    // Files matching exclude pattern are partials
    if (this.matchesExcludePattern(fileName)) {
      return true;
    }
    
    // Check if in any directory that should be treated as partials
    const relativePath = path.relative(sourceRoot, filePath);
    const pathParts = relativePath.split(path.sep);
    
    // Files in directories matching exclude pattern are partials
    if (pathParts.some(part => this.matchesExcludePattern(part))) {
      return true;
    }
    
    // Also check for common standard directory names that should be treated as partials
    const commonPartialDirs = [
      'layouts', '.layouts',
      'includes', 'partials', 'templates',
      'site_layouts'  // Support custom naming conventions
    ];
    
    for (const dirName of commonPartialDirs) {
      if (pathParts.includes(dirName)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Determine if a file is a layout
   * @param {string} filePath - Absolute path to the file
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {boolean} True if file is a layout
   */
  isLayout(filePath, sourceRoot) {
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    // Must be HTML file
    if (!['.html', '.htm'].includes(extension)) {
      return false;
    }
    
    // Check if filename matches layout pattern
    if (this.isLayoutFileName(fileName)) {
      return true;
    }
    
    // Check for fallback layout in _includes
    const relativePath = path.relative(sourceRoot, filePath);
    if (relativePath === path.join('_includes', '_layout.html') ||
        relativePath === path.join('_includes', '_layout.htm')) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if a filename matches the layout naming convention
   * @param {string} fileName - Name of the file to check
   * @returns {boolean} True if matches layout pattern
   */
  isLayoutFileName(fileName) {
    // Check if matches the configured default layout pattern
    if (fileName === `_${this.defaultLayout}.html` || fileName === `_${this.defaultLayout}.htm`) {
      return true;
    }
    
    // Must start with underscore for traditional layout patterns
    if (!fileName.startsWith('_')) {
      return false;
    }
    
    // Must end with layout.html or layout.htm
    if (fileName.endsWith('layout.html') || fileName.endsWith('layout.htm')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if file should be emitted to output directory
   * @param {string} filePath - Absolute path to the file
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {boolean} True if file should be emitted
   */
  shouldEmit(filePath, sourceRoot) {
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    // Pages are always emitted
    if (this.isPage(filePath, sourceRoot)) {
      return true;
    }
    
    // Partials and layouts are never emitted
    if (this.isPartial(filePath, sourceRoot) || this.isLayout(filePath, sourceRoot)) {
      return false;
    }
    
    // For other files (assets), check exclude pattern
    // Files matching exclude pattern are non-emitting unless explicitly referenced
    if (this.matchesExcludePattern(fileName)) {
      return false; // Will be copied only if referenced
    }
    
    // Files in directories matching exclude pattern are non-emitting unless explicitly referenced
    const relativePath = path.relative(sourceRoot, filePath);
    const pathParts = relativePath.split(path.sep);
    if (pathParts.some(part => this.matchesExcludePattern(part))) {
      return false; // Will be copied only if referenced
    }
    
    // Regular assets are emitted if they're static files
    return true;
  }
  
  /**
   * Get file type classification
   * @param {string} filePath - Absolute path to the file
   * @param {string} sourceRoot - Absolute path to source directory
   * @returns {string} File type: 'page', 'partial', 'layout', 'asset'
   */
  getFileType(filePath, sourceRoot) {
    if (this.isLayout(filePath, sourceRoot)) {
      return 'layout';
    }
    
    if (this.isPage(filePath, sourceRoot)) {
      return 'page';
    }
    
    if (this.isPartial(filePath, sourceRoot)) {
      return 'partial';
    }
    
    return 'asset';
  }
  
  /**
   * Check if a directory is non-emitting (matches exclude pattern)
   * @param {string} dirPath - Directory path relative to source
   * @returns {boolean} True if directory should not be emitted
   */
  isNonEmittingDirectory(dirPath) {
    const pathParts = dirPath.split(path.sep);
    return pathParts.some(part => this.matchesExcludePattern(part));
  }
}