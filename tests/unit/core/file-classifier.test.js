/**
 * Unit Tests for FileClassifier
 * Tests file classification logic including basic and enhanced glob pattern processing
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { FileClassifier } from '../../../src/core/file-classifier.js';

describe('FileClassifier', () => {
  let classifier;

  beforeEach(() => {
    classifier = new FileClassifier();
  });

  describe('constructor', () => {
    it('should initialize with default file extensions', () => {
      expect(classifier.pageExtensions).toEqual(['.html', '.htm']);
      expect(classifier.markdownExtensions).toEqual(['.md', '.markdown']);
      expect(classifier.assetExtensions).toContain('.png');
      expect(classifier.assetExtensions).toContain('.css');
      expect(classifier.assetExtensions).toContain('.js');
    });

    it('should initialize without glob processor', () => {
      expect(classifier._globProcessor).toBe(null);
      expect(classifier.onWarning).toBe(null);
    });

    it('should have comprehensive asset extensions', () => {
      // Test that various asset types are included
      const assets = classifier.assetExtensions;
      
      // Images
      expect(assets).toContain('.png');
      expect(assets).toContain('.jpg');
      expect(assets).toContain('.svg');
      
      // Fonts
      expect(assets).toContain('.woff');
      expect(assets).toContain('.ttf');
      
      // Styles/Scripts
      expect(assets).toContain('.css');
      expect(assets).toContain('.js');
      
      // Documents
      expect(assets).toContain('.pdf');
      expect(assets).toContain('.json');
    });
  });

  describe('_basicClassifyFile', () => {
    describe('fragment detection', () => {
      it('should classify underscore-prefixed files as fragments', () => {
        const result = classifier._basicClassifyFile('_header.html');
        
        expect(result.type).toBe('fragment');
        expect(result.isFragment).toBe(true);
        expect(result.shouldEmit).toBe(false);
        expect(result.processingStrategy).toBe('fragment');
      });

      it('should classify files in underscore directories as fragments', () => {
        const result = classifier._basicClassifyFile('_includes/header.html');
        
        expect(result.type).toBe('fragment');
        expect(result.isFragment).toBe(true);
        expect(result.shouldEmit).toBe(false);
        expect(result.processingStrategy).toBe('fragment');
      });

      it('should classify nested fragment directory files as fragments', () => {
        const result = classifier._basicClassifyFile('components/_partials/nav.html');
        
        expect(result.type).toBe('fragment');
        expect(result.isFragment).toBe(true);
        expect(result.shouldEmit).toBe(false);
        expect(result.processingStrategy).toBe('fragment');
      });
    });

    describe('page file detection', () => {
      it('should classify .html files as pages', () => {
        const result = classifier._basicClassifyFile('index.html');
        
        expect(result.type).toBe('page');
        expect(result.isPage).toBe(true);
        expect(result.shouldEmit).toBe(true);
        expect(result.processingStrategy).toBe('html');
      });

      it('should classify .htm files as pages', () => {
        const result = classifier._basicClassifyFile('about.htm');
        
        expect(result.type).toBe('page');
        expect(result.isPage).toBe(true);
        expect(result.shouldEmit).toBe(true);
        expect(result.processingStrategy).toBe('html');
      });

      it('should classify .md files as pages', () => {
        const result = classifier._basicClassifyFile('post.md');
        
        expect(result.type).toBe('page');
        expect(result.isPage).toBe(true);
        expect(result.shouldEmit).toBe(true);
        expect(result.processingStrategy).toBe('markdown');
      });

      it('should classify .markdown files as pages', () => {
        const result = classifier._basicClassifyFile('article.markdown');
        
        expect(result.type).toBe('page');
        expect(result.isPage).toBe(true);
        expect(result.shouldEmit).toBe(true);
        expect(result.processingStrategy).toBe('markdown');
      });
    });

    describe('asset file detection', () => {
      it('should classify image files as assets', () => {
        const result = classifier._basicClassifyFile('logo.png');
        
        expect(result.type).toBe('asset');
        expect(result.isAsset).toBe(true);
        expect(result.shouldCopy).toBe(true);
        expect(result.processingStrategy).toBe('asset');
      });

      it('should classify CSS files as assets', () => {
        const result = classifier._basicClassifyFile('styles.css');
        
        expect(result.type).toBe('asset');
        expect(result.isAsset).toBe(true);
        expect(result.shouldCopy).toBe(true);
        expect(result.processingStrategy).toBe('asset');
      });

      it('should classify JavaScript files as assets', () => {
        const result = classifier._basicClassifyFile('app.js');
        
        expect(result.type).toBe('asset');
        expect(result.isAsset).toBe(true);
        expect(result.shouldCopy).toBe(true);
        expect(result.processingStrategy).toBe('asset');
      });

      it('should classify font files as assets', () => {
        const result = classifier._basicClassifyFile('font.woff2');
        
        expect(result.type).toBe('asset');
        expect(result.isAsset).toBe(true);
        expect(result.shouldCopy).toBe(true);
        expect(result.processingStrategy).toBe('asset');
      });
    });

    describe('unknown file handling', () => {
      it('should classify unknown extensions as unknown', () => {
        const result = classifier._basicClassifyFile('unknown.xyz');
        
        expect(result.type).toBe('unknown');
        expect(result.shouldCopy).toBe(false);
        expect(result.processingStrategy).toBe('skip');
      });

      it('should classify files without extensions as unknown', () => {
        const result = classifier._basicClassifyFile('README');
        
        expect(result.type).toBe('unknown');
        expect(result.shouldCopy).toBe(false);
        expect(result.processingStrategy).toBe('skip');
      });
    });

    describe('case insensitivity', () => {
      it('should handle uppercase extensions', () => {
        const result = classifier._basicClassifyFile('image.PNG');
        
        expect(result.type).toBe('asset');
        expect(result.isAsset).toBe(true);
      });

      it('should handle mixed case extensions', () => {
        const result = classifier._basicClassifyFile('page.HTML');
        
        expect(result.type).toBe('page');
        expect(result.isPage).toBe(true);
      });
    });

    describe('path handling', () => {
      it('should handle Windows path separators', () => {
        const result = classifier._basicClassifyFile('folder\\file.html');
        
        expect(result.type).toBe('page');
        expect(result.isPage).toBe(true);
      });

      it('should handle nested paths', () => {
        const result = classifier._basicClassifyFile('deep/nested/path/file.css');
        
        expect(result.type).toBe('asset');
        expect(result.isAsset).toBe(true);
      });
    });
  });

  describe('classifyFile (basic mode)', () => {
    it('should use basic classification when no glob processor configured', () => {
      const result = classifier.classifyFile('index.html');
      
      expect(result.type).toBe('page');
      expect(result.isPage).toBe(true);
      expect(result.shouldEmit).toBe(true);
      expect(result.processingStrategy).toBe('html');
    });

    it('should include all basic classification properties', () => {
      const result = classifier.classifyFile('image.png');
      
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('shouldEmit');
      expect(result).toHaveProperty('shouldCopy');
      expect(result).toHaveProperty('isFragment');
      expect(result).toHaveProperty('isAsset');
      expect(result).toHaveProperty('isPage');
      expect(result).toHaveProperty('extension');
      expect(result).toHaveProperty('processingStrategy');
    });
  });

  describe('configureGlobPatterns', () => {
    it('should configure glob processor with provided options', () => {
      const options = {
        autoIgnore: false,
        copy: ['*.pdf'],
        ignore: ['*.tmp'],
        ignoreRender: ['*.draft'],
        ignoreCopy: ['*.src'],
        render: ['*.special']
      };
      
      classifier.configureGlobPatterns(options);
      
      expect(classifier._globProcessor).not.toBe(null);
      expect(classifier._globProcessor.options.autoIgnore).toBe(false);
    });

    it('should pass asset and renderable extensions to glob processor', () => {
      classifier.configureGlobPatterns({});
      
      expect(classifier._globProcessor).not.toBe(null);
      // The glob processor should have received the extensions
    });

    it('should forward warnings from glob processor', () => {
      const warnings = [];
      classifier.onWarning = (message) => warnings.push(message);
      
      classifier.configureGlobPatterns({});
      
      // Should have set up warning forwarding
      expect(classifier._globProcessor.onWarning).toBeTruthy();
    });

    it('should add patterns when provided', () => {
      const options = {
        copy: ['assets/**'],
        ignore: ['*.tmp', '*.log'],
        ignoreRender: ['*.draft'],
        ignoreCopy: ['*.src'],
        render: ['*.force']
      };
      
      classifier.configureGlobPatterns(options);
      
      expect(classifier._globProcessor.patterns.copy).toContain('assets/**');
      expect(classifier._globProcessor.patterns.ignore).toContain('*.tmp');
      expect(classifier._globProcessor.patterns.ignore).toContain('*.log');
      expect(classifier._globProcessor.patterns.ignoreRender).toContain('*.draft');
      expect(classifier._globProcessor.patterns.ignoreCopy).toContain('*.src');
      expect(classifier._globProcessor.patterns.render).toContain('*.force');
    });
  });

  describe('classifyFile (enhanced mode)', () => {
    beforeEach(() => {
      classifier.configureGlobPatterns({
        autoIgnore: true
      });
    });

    it('should use enhanced classification when glob processor configured', () => {
      const result = classifier.classifyFile('index.html');
      
      // Should have enhanced properties
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('matchedPattern');
      
      // Should still have backward compatibility properties
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('shouldEmit');
      expect(result).toHaveProperty('shouldCopy');
    });

    it('should emit HTML pages by default', () => {
      const result = classifier.classifyFile('page.html');
      
      expect(result.action).toBe('EMIT');
      expect(result.shouldEmit).toBe(true);
      expect(result.isPage).toBe(true);
    });

    it('should copy assets by default', () => {
      const result = classifier.classifyFile('image.png');
      
      expect(result.action).toBe('COPY');
      expect(result.shouldCopy).toBe(true);
      expect(result.isAsset).toBe(true);
    });

    it('should auto-ignore fragments', () => {
      const result = classifier.classifyFile('_header.html');
      
      expect(result.action).toBe('IGNORED');
      expect(result.shouldEmit).toBe(false);
      expect(result.isFragment).toBe(true);
    });

    it('should handle fragment override for render patterns', () => {
      classifier._globProcessor.addRenderPattern('_special.html');
      
      const result = classifier.classifyFile('_special.html');
      
      expect(result.action).toBe('EMIT');
      expect(result.shouldEmit).toBe(true);
      expect(result.isFragment).toBe(false); // Fragment override
      expect(result.isPage).toBe(true);
    });

    it('should fallback to basic classification on error', () => {
      // Mock glob processor to throw error
      classifier._globProcessor.classifyFile = mock(() => {
        throw new Error('Glob processing error');
      });
      
      const warnings = [];
      classifier.onWarning = (message) => warnings.push(message);
      
      const result = classifier.classifyFile('index.html');
      
      expect(result.type).toBe('page');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('Glob processing failed');
    });
  });

  describe('_mapActionToType', () => {
    it('should map EMIT to page', () => {
      expect(classifier._mapActionToType('EMIT', 'original')).toBe('page');
    });

    it('should map COPY to asset', () => {
      expect(classifier._mapActionToType('COPY', 'original')).toBe('asset');
    });

    it('should map IGNORED to ignored', () => {
      expect(classifier._mapActionToType('IGNORED', 'original')).toBe('ignored');
    });

    it('should map SKIP to unknown', () => {
      expect(classifier._mapActionToType('SKIP', 'original')).toBe('unknown');
    });

    it('should return original type for unknown action', () => {
      expect(classifier._mapActionToType('UNKNOWN', 'original')).toBe('original');
    });
  });

  describe('_mapActionToProcessingStrategy', () => {
    it('should map EMIT to html for non-markdown', () => {
      expect(classifier._mapActionToProcessingStrategy('EMIT', 'html')).toBe('html');
    });

    it('should preserve markdown strategy for EMIT', () => {
      expect(classifier._mapActionToProcessingStrategy('EMIT', 'markdown')).toBe('markdown');
    });

    it('should map COPY to copy', () => {
      expect(classifier._mapActionToProcessingStrategy('COPY', 'asset')).toBe('copy');
    });

    it('should map IGNORED to ignore', () => {
      expect(classifier._mapActionToProcessingStrategy('IGNORED', 'html')).toBe('ignore');
    });

    it('should map SKIP to skip', () => {
      expect(classifier._mapActionToProcessingStrategy('SKIP', 'asset')).toBe('skip');
    });

    it('should return original strategy for unknown action', () => {
      expect(classifier._mapActionToProcessingStrategy('UNKNOWN', 'original')).toBe('original');
    });
  });

  describe('addAutoIgnoredLayout', () => {
    it('should add layout to auto-ignored when glob processor configured', () => {
      classifier.configureGlobPatterns({});
      classifier.addAutoIgnoredLayout('_layout.html');
      
      expect(classifier._globProcessor.autoIgnoredFiles.has('_layout.html')).toBe(true);
      expect(classifier._globProcessor.autoIgnoredFiles.get('_layout.html')).toBe('layout');
    });

    it('should do nothing when no glob processor configured', () => {
      // Should not throw error
      classifier.addAutoIgnoredLayout('_layout.html');
      expect(true).toBe(true);
    });
  });

  describe('loadGitignorePatterns', () => {
    it('should load patterns when glob processor configured', () => {
      classifier.configureGlobPatterns({});
      classifier.loadGitignorePatterns(['*.log', 'node_modules/']);
      
      expect(classifier._globProcessor.patterns.gitignore).toContain('*.log');
      expect(classifier._globProcessor.patterns.gitignore).toContain('node_modules/**');
    });

    it('should do nothing when no glob processor configured', () => {
      // Should not throw error
      classifier.loadGitignorePatterns(['*.log']);
      expect(true).toBe(true);
    });
  });

  describe('isPageFile', () => {
    it('should return true for HTML files', () => {
      expect(classifier.isPageFile('index.html')).toBe(true);
    });

    it('should return true for Markdown files', () => {
      expect(classifier.isPageFile('post.md')).toBe(true);
    });

    it('should return false for assets', () => {
      expect(classifier.isPageFile('image.png')).toBe(false);
    });

    it('should return false for fragments by default', () => {
      expect(classifier.isPageFile('_header.html')).toBe(false);
    });

    it('should use enhanced classification when configured', () => {
      classifier.configureGlobPatterns({});
      classifier._globProcessor.addRenderPattern('_special.html');
      
      expect(classifier.isPageFile('_special.html')).toBe(true);
    });
  });

  describe('isAssetFile', () => {
    it('should return true for image files', () => {
      expect(classifier.isAssetFile('logo.png')).toBe(true);
    });

    it('should return true for CSS files', () => {
      expect(classifier.isAssetFile('styles.css')).toBe(true);
    });

    it('should return false for HTML files', () => {
      expect(classifier.isAssetFile('index.html')).toBe(false);
    });

    it('should return false for unknown files', () => {
      expect(classifier.isAssetFile('unknown.xyz')).toBe(false);
    });

    it('should use enhanced classification when configured', () => {
      classifier.configureGlobPatterns({});
      classifier._globProcessor.addIgnorePattern('*.png');
      
      expect(classifier.isAssetFile('ignored.png')).toBe(false);
    });
  });

  describe('isFragmentFile', () => {
    it('should return true for underscore-prefixed files', () => {
      expect(classifier.isFragmentFile('_header.html')).toBe(true);
    });

    it('should return true for files in underscore directories', () => {
      expect(classifier.isFragmentFile('_includes/nav.html')).toBe(true);
    });

    it('should return false for regular pages', () => {
      expect(classifier.isFragmentFile('index.html')).toBe(false);
    });

    it('should handle fragment overrides in enhanced mode', () => {
      classifier.configureGlobPatterns({});
      classifier._globProcessor.addRenderPattern('_special.html');
      
      expect(classifier.isFragmentFile('_special.html')).toBe(false);
    });
  });

  describe('getProcessingStrategy', () => {
    it('should return html for HTML files', () => {
      expect(classifier.getProcessingStrategy('index.html')).toBe('html');
    });

    it('should return markdown for Markdown files', () => {
      expect(classifier.getProcessingStrategy('post.md')).toBe('markdown');
    });

    it('should return asset for asset files', () => {
      expect(classifier.getProcessingStrategy('image.png')).toBe('asset');
    });

    it('should return fragment for fragment files', () => {
      expect(classifier.getProcessingStrategy('_header.html')).toBe('fragment');
    });

    it('should return skip for unknown files', () => {
      expect(classifier.getProcessingStrategy('unknown.xyz')).toBe('skip');
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return all supported extensions', () => {
      const extensions = classifier.getSupportedExtensions();
      
      expect(extensions.pages).toEqual(['.html', '.htm']);
      expect(extensions.markdown).toEqual(['.md', '.markdown']);
      expect(extensions.assets).toContain('.png');
      expect(extensions.assets).toContain('.css');
    });

    it('should return copies of arrays', () => {
      const extensions = classifier.getSupportedExtensions();
      extensions.pages.push('.test');
      
      expect(classifier.pageExtensions).not.toContain('.test');
    });
  });

  describe('addAssetExtension', () => {
    it('should add new asset extension', () => {
      classifier.addAssetExtension('.xyz');
      
      expect(classifier.assetExtensions).toContain('.xyz');
      
      const result = classifier.classifyFile('file.xyz');
      expect(result.isAsset).toBe(true);
    });

    it('should convert to lowercase', () => {
      classifier.addAssetExtension('.XYZ');
      
      expect(classifier.assetExtensions).toContain('.xyz');
    });

    it('should not add duplicates', () => {
      const originalLength = classifier.assetExtensions.length;
      classifier.addAssetExtension('.png'); // Already exists
      
      expect(classifier.assetExtensions.length).toBe(originalLength);
    });
  });

  describe('addPageExtension', () => {
    it('should add new page extension', () => {
      classifier.addPageExtension('.page');
      
      expect(classifier.pageExtensions).toContain('.page');
      
      const result = classifier.classifyFile('test.page');
      expect(result.isPage).toBe(true);
    });

    it('should convert to lowercase', () => {
      classifier.addPageExtension('.PAGE');
      
      expect(classifier.pageExtensions).toContain('.page');
    });

    it('should not add duplicates', () => {
      const originalLength = classifier.pageExtensions.length;
      classifier.addPageExtension('.html'); // Already exists
      
      expect(classifier.pageExtensions.length).toBe(originalLength);
    });
  });

  describe('warning handling', () => {
    it('should call warning callback when set', () => {
      const warnings = [];
      classifier.onWarning = (message) => warnings.push(message);
      
      classifier._warn('Test warning');
      
      expect(warnings).toContain('Test warning');
    });

    it('should not throw when no warning callback set', () => {
      expect(() => {
        classifier._warn('Test warning');
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty file path', () => {
      const result = classifier.classifyFile('');
      
      expect(result.type).toBe('unknown');
      expect(result.processingStrategy).toBe('skip');
    });

    it('should handle file path with only extension as unknown', () => {
      const result = classifier.classifyFile('.html');
      
      expect(result.type).toBe('unknown');
      expect(result.extension).toBe('');
      expect(result.processingStrategy).toBe('skip');
    });

    it('should handle multiple dots in filename', () => {
      const result = classifier.classifyFile('file.min.js');
      
      expect(result.isAsset).toBe(true);
      expect(result.extension).toBe('.js');
    });

    it('should handle complex nested paths', () => {
      const result = classifier.classifyFile('deep/_nested/path/_fragment.html');
      
      expect(result.isFragment).toBe(true);
    });
  });
});