// Clean copy of file-processor.js to remove any hidden characters or encoding issues
// All imports and top-level declarations
import { DependencyTracker } from './dependency-tracker.js';
import { AssetTracker } from './asset-tracker.js';
import { FileClassifier } from './file-classifier.js';
import { LayoutDiscovery } from './layout-discovery.js';
import { processMarkdown, isMarkdownFile, wrapInLayout, generateTableOfContents, addAnchorLinks, hasHtmlElement } from './markdown-processor.js';
import { isHtmlFile, isPartialFile, getOutputPath, getFileExtension } from '../utils/path-resolver.js';
import { generateSitemap, extractPageInfo, enhanceWithFrontmatter, writeSitemap } from '../utils/path-resolver.js';

// Main build function
export async function build(config = {}) {
  // ...existing code...
}

// Incremental build function
export async function incrementalBuild(options = {}, dependencyTracker = null, assetTracker = null, changedFile = null) {
  // ...existing code...
}

// Modification cache
export async function initializeModificationCache(sourceRoot) {
  // ...existing code...
}

// All other functions and exports
