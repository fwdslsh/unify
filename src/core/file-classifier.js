import path from 'path';

/**
 * File classification system for convention-based architecture
 * Determines file types based on configurable naming conventions and location
 */
export class FileClassifier {
  constructor(buildConfig = null) {
    this.buildConfig = buildConfig;
  }

  /**
   * Set or update the build configuration
   * @param {BuildConfig} buildConfig - Build configuration instance
   */
  setBuildConfig(buildConfig) {
    this.buildConfig = buildConfig;
  }

  /**
   * Get the build configuration, falling back to global if not set
   * @returns {BuildConfig|null} Build configuration instance
   */
  getBuildConfig() {
    return this.buildConfig || globalThis.UNIFY_PATTERNS_CONFIG || null;
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
    
    const buildConfig = this.getBuildConfig();
    
    // Check if file matches non-emitting pattern
    if (buildConfig && buildConfig.isNonEmittingFile(fileName)) {
      return false;
    } else if (!buildConfig && fileName.startsWith('_')) {
      // Fallback to underscore convention
      return false;
    }
    
    // Check if in non-emitting directory
    if (buildConfig && buildConfig.isNonEmittingDirectory(relativePath)) {
      return false;
    } else if (!buildConfig) {
      // Fallback: Files in underscore directories are not pages
      const pathParts = relativePath.split(path.sep);
      for (const part of pathParts) {
        if (part.startsWith('_')) {
          return false;
        }
      }
    }
    
    // PATCH: Always treat markdown files as pages unless in non-emitting dir
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
    
    const buildConfig = this.getBuildConfig();
    
    // Check if file matches non-emitting pattern
    if (buildConfig && buildConfig.isNonEmittingFile(fileName)) {
      return true;
    } else if (!buildConfig && fileName.startsWith('_')) {
      // Fallback to underscore convention
      return true;
    }
    
    const relativePath = path.relative(sourceRoot, filePath);
    
    // Check if in non-emitting directory using build config
    if (buildConfig && buildConfig.isNonEmittingDirectory(relativePath)) {
      return true;
    } else if (!buildConfig) {
      // Fallback: Files in underscore-prefixed directories are partials
      const pathParts = relativePath.split(path.sep);
      if (pathParts.some(part => part.startsWith('_'))) {
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
    const buildConfig = this.getBuildConfig();
    
    if (buildConfig) {
      return buildConfig.isLayoutFile(fileName);
    }
    
    // Fallback to hardcoded underscore convention
    // Must start with underscore
    if (!fileName.startsWith('_')) {
      return false;
    }
    
    // Must end with layout.html or layout.htm
    if (fileName.endsWith('layout.html') || fileName.endsWith('layout.htm')) {
      return true;
    }
    
    // Also support the basic _layout.html and _layout.htm patterns
    if (fileName === '_layout.html' || fileName === '_layout.htm') {
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
    
    const buildConfig = this.getBuildConfig();
    
    // For other files (assets), check configured patterns
    if (buildConfig && buildConfig.isNonEmittingFile(fileName)) {
      return false; // Will be copied only if referenced
    } else if (!buildConfig && fileName.startsWith('_')) {
      // Fallback to underscore convention
      return false; // Will be copied only if referenced
    }
    
    // Files in non-emitting directories are non-emitting unless explicitly referenced
    const relativePath = path.relative(sourceRoot, filePath);
    if (buildConfig && buildConfig.isNonEmittingDirectory(relativePath)) {
      return false; // Will be copied only if referenced
    } else if (!buildConfig) {
      // Fallback: Files in underscore directories are non-emitting
      const pathParts = relativePath.split(path.sep);
      if (pathParts.some(part => part.startsWith('_'))) {
        return false; // Will be copied only if referenced
      }
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
   * Check if a directory is non-emitting (configurable convention)
   * @param {string} dirPath - Directory path relative to source
   * @returns {boolean} True if directory should not be emitted
   */
  isNonEmittingDirectory(dirPath) {
    const buildConfig = this.getBuildConfig();
    
    if (buildConfig) {
      return buildConfig.isNonEmittingDirectory(dirPath);
    }
    
    // Fallback to underscore convention
    const pathParts = dirPath.split(path.sep);
    return pathParts.some(part => part.startsWith('_'));
  }
}

// Export singleton instance
export const fileClassifier = new FileClassifier();