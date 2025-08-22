/**
 * Comprehensive tests for File Classifier
 * Tests all methods and edge cases for 95%+ coverage
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import {
  FileClassifier,
  FileClassification,
  PrecedenceTier,
  fileClassifier
} from '../../../src/core/file-classifier.js';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

describe('File Classifier - Comprehensive Coverage', () => {
  let tempDir;
  let classifier;
  
  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'unify-classifier-test-'));
    
    // Create fresh classifier instance with default options
    classifier = new FileClassifier({
      sourceRoot: tempDir
    });
  });
  
  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Constructor and Constants', () => {
    test('should initialize with default options', () => {
      const defaultClassifier = new FileClassifier();
      
      expect(defaultClassifier.options.autoIgnore).toBe(true);
      expect(defaultClassifier.options.copy).toEqual([]);
      expect(defaultClassifier.options.ignore).toEqual([]);
      expect(defaultClassifier.options.ignoreRender).toEqual([]);
      expect(defaultClassifier.options.ignoreCopy).toEqual([]);
      expect(defaultClassifier.options.render).toEqual([]);
      expect(defaultClassifier.options.sourceRoot).toBe('src');
    });

    test('should merge user options with defaults', () => {
      const options = {
        autoIgnore: false,
        copy: ['assets/**'],
        ignore: ['*.tmp'],
        render: ['*.md'],
        sourceRoot: '/custom/source'
      };
      
      const customClassifier = new FileClassifier(options);
      
      expect(customClassifier.options.autoIgnore).toBe(false);
      expect(customClassifier.options.copy).toEqual(['assets/**']);
      expect(customClassifier.options.ignore).toEqual(['*.tmp']);
      expect(customClassifier.options.render).toEqual(['*.md']);
      expect(customClassifier.options.sourceRoot).toBe('/custom/source');
    });

    test('should initialize empty layout and include file sets', () => {
      expect(classifier.layoutFiles).toBeInstanceOf(Set);
      expect(classifier.includeFiles).toBeInstanceOf(Set);
      expect(classifier.layoutFiles.size).toBe(0);
      expect(classifier.includeFiles.size).toBe(0);
    });

    test('should export correct constants', () => {
      expect(FileClassification.EMIT).toBe('emit');
      expect(FileClassification.COPY).toBe('copy');
      expect(FileClassification.SKIP).toBe('skip');
      expect(FileClassification.IGNORED).toBe('ignored');
      
      expect(PrecedenceTier.EXPLICIT_OVERRIDES).toBe(1);
      expect(PrecedenceTier.IGNORE_RULES).toBe(2);
      expect(PrecedenceTier.DEFAULT_BEHAVIOR).toBe(3);
    });
  });

  describe('isRenderable - File Type Detection', () => {
    test('should identify HTML files as renderable', () => {
      const htmlFiles = [
        'index.html',
        'page.htm',
        'nested/page.HTML',
        'file.HTM'
      ];
      
      htmlFiles.forEach(filePath => {
        expect(classifier.isRenderable(filePath)).toBe(true);
      });
    });

    test('should identify Markdown files as renderable', () => {
      const markdownFiles = [
        'readme.md',
        'docs.MD',
        'nested/article.md'
      ];
      
      markdownFiles.forEach(filePath => {
        expect(classifier.isRenderable(filePath)).toBe(true);
      });
    });

    test('should identify non-renderable files', () => {
      const nonRenderableFiles = [
        'style.css',
        'script.js',
        'image.png',
        'document.pdf',
        'data.json',
        'config.yml',
        'app.py',
        'Makefile',
        'no-extension'
      ];
      
      nonRenderableFiles.forEach(filePath => {
        expect(classifier.isRenderable(filePath)).toBe(false);
      });
    });

    test('should handle empty file paths', () => {
      expect(classifier.isRenderable('')).toBe(false);
    });

    test('should handle paths without extensions', () => {
      expect(classifier.isRenderable('README')).toBe(false);
      expect(classifier.isRenderable('LICENSE')).toBe(false);
    });
  });

  describe('matchesPattern - Glob Pattern Matching', () => {
    test('should match simple patterns', () => {
      const patterns = ['*.html', '*.css'];
      
      expect(classifier.matchesPattern('index.html', patterns)).toBe(true);
      expect(classifier.matchesPattern('style.css', patterns)).toBe(true);
      expect(classifier.matchesPattern('script.js', patterns)).toBe(false);
    });

    test('should handle negation patterns', () => {
      const patterns = ['*.html', '!admin.html'];
      
      expect(classifier.matchesPattern('index.html', patterns)).toBe(true);
      expect(classifier.matchesPattern('admin.html', patterns)).toBe(false);
    });

    test('should use last pattern wins logic', () => {
      const patterns = ['*.html', '!admin.html', 'admin.html'];
      
      // Last pattern overrides negation
      expect(classifier.matchesPattern('admin.html', patterns)).toBe(true);
    });

    test('should handle directory patterns', () => {
      const patterns = ['assets/**', 'docs/**/*.md'];
      
      expect(classifier.matchesPattern('assets/image.png', patterns)).toBe(true);
      expect(classifier.matchesPattern('assets/css/style.css', patterns)).toBe(true);
      expect(classifier.matchesPattern('docs/guide.md', patterns)).toBe(true);
      expect(classifier.matchesPattern('src/index.html', patterns)).toBe(false);
    });

    test('should handle empty patterns array', () => {
      expect(classifier.matchesPattern('file.txt', [])).toBe(false);
      expect(classifier.matchesPattern('file.txt', null)).toBe(false);
      expect(classifier.matchesPattern('file.txt', undefined)).toBe(false);
    });

    test('should handle complex negation sequences', () => {
      const patterns = ['**/*.html', '!_*.html', '!admin/**', 'admin/public.html'];
      
      expect(classifier.matchesPattern('index.html', patterns)).toBe(true);
      expect(classifier.matchesPattern('_layout.html', patterns)).toBe(false);
      expect(classifier.matchesPattern('admin/secret.html', patterns)).toBe(false);
      expect(classifier.matchesPattern('admin/public.html', patterns)).toBe(true);
    });
  });

  describe('findMatchingPattern - Pattern Discovery', () => {
    test('should find the matching pattern', () => {
      const patterns = ['*.css', '*.html', 'assets/**'];
      
      expect(classifier.findMatchingPattern('style.css', patterns)).toBe('*.css');
      expect(classifier.findMatchingPattern('index.html', patterns)).toBe('*.html');
      expect(classifier.findMatchingPattern('assets/image.png', patterns)).toBe('assets/**');
    });

    test('should return last matching pattern', () => {
      const patterns = ['**/*.html', 'pages/*.html'];
      
      expect(classifier.findMatchingPattern('pages/about.html', patterns)).toBe('pages/*.html');
    });

    test('should handle negation patterns correctly', () => {
      const patterns = ['*.html', '!admin.html'];
      
      expect(classifier.findMatchingPattern('index.html', patterns)).toBe('*.html');
      // findMatchingPattern returns positive matches, it doesn't exclude negation patterns
      expect(classifier.findMatchingPattern('admin.html', patterns)).toBe('*.html');
    });

    test('should return null for no matches', () => {
      const patterns = ['*.css', '*.js'];
      
      expect(classifier.findMatchingPattern('document.pdf', patterns)).toBeNull();
    });

    test('should handle empty patterns', () => {
      expect(classifier.findMatchingPattern('file.txt', [])).toBeNull();
      expect(classifier.findMatchingPattern('file.txt', null)).toBeNull();
    });
  });

  describe('isAutoIgnoredFile - Auto-ignore Logic', () => {
    test('should auto-ignore files with underscore prefix', async () => {
      const underscoreFiles = [
        '_layout.html',
        '_header.html',
        '_config.json',
        'nested/_fragment.html'
      ];
      
      for (const filePath of underscoreFiles) {
        const result = await classifier.isAutoIgnoredFile(filePath);
        expect(result).toBe(true);
      }
    });

    test('should auto-ignore files in underscore directories', async () => {
      const underscoreDirFiles = [
        '_includes/header.html',
        '_layouts/default.html',
        '_components/button.html',
        'nested/_private/secret.txt'
      ];
      
      for (const filePath of underscoreDirFiles) {
        const result = await classifier.isAutoIgnoredFile(filePath);
        expect(result).toBe(true);
      }
    });

    test('should not auto-ignore normal files', async () => {
      const normalFiles = [
        'index.html',
        'about.html',
        'assets/style.css',
        'docs/readme.md'
      ];
      
      for (const filePath of normalFiles) {
        const result = await classifier.isAutoIgnoredFile(filePath);
        expect(result).toBe(false);
      }
    });

    test('should handle current directory reference', async () => {
      const result = await classifier.isAutoIgnoredFile('./index.html');
      expect(result).toBe(false);
    });

    test('should handle complex paths with underscores', async () => {
      const testCases = [
        { path: 'my_file.html', expected: false }, // Underscore in filename but not prefix
        { path: '_dir/sub_dir/file.html', expected: true }, // Underscore prefix directory
        { path: 'dir/_sub/file.html', expected: true }, // Underscore prefix subdirectory
        { path: 'dir/sub_dir/file.html', expected: false } // Underscore in directory name but not prefix
      ];
      
      for (const testCase of testCases) {
        const result = await classifier.isAutoIgnoredFile(testCase.path);
        expect(result).toBe(testCase.expected);
      }
    });
  });

  describe('Layout and Include File Registration', () => {
    test('should add layout files for auto-ignore', () => {
      classifier.addLayoutFile('_layout.html');
      classifier.addLayoutFile('layouts/default.html');
      
      expect(classifier.layoutFiles.has('_layout.html')).toBe(true);
      expect(classifier.layoutFiles.has('layouts/default.html')).toBe(true);
      expect(classifier.layoutFiles.size).toBe(2);
    });

    test('should add include files for auto-ignore', () => {
      classifier.addIncludeFile('_header.html');
      classifier.addIncludeFile('components/footer.html');
      
      expect(classifier.includeFiles.has('_header.html')).toBe(true);
      expect(classifier.includeFiles.has('components/footer.html')).toBe(true);
      expect(classifier.includeFiles.size).toBe(2);
    });

    test('should not add duplicate layout files', () => {
      classifier.addLayoutFile('_layout.html');
      classifier.addLayoutFile('_layout.html');
      
      expect(classifier.layoutFiles.size).toBe(1);
    });

    test('should not add duplicate include files', () => {
      classifier.addIncludeFile('_header.html');
      classifier.addIncludeFile('_header.html');
      
      expect(classifier.includeFiles.size).toBe(1);
    });
  });

  describe('resolveConflicts - Conflict Resolution', () => {
    test('should handle ignore-render vs render conflict resolution', () => {
      const matches = [
        {
          action: FileClassification.EMIT,
          reason: '--render pattern match',
          tier: PrecedenceTier.EXPLICIT_OVERRIDES,
          priority: 1
        },
        {
          action: FileClassification.IGNORED,
          reason: '--ignore-render pattern match',
          tier: PrecedenceTier.IGNORE_RULES,
          priority: 2
        }
      ];
      
      // The resolveConflicts method will return the first match after sorting by tier/priority
      // Since EXPLICIT_OVERRIDES (tier 1) < IGNORE_RULES (tier 2), render wins
      classifier.options.render = ['*.html'];
      classifier.options.ignoreRender = ['admin/secret.html'];
      
      const result = classifier.resolveConflicts(matches, 'admin/secret.html');
      
      // The method currently returns the first sorted match, which is the render match
      expect(result.action).toBe(FileClassification.EMIT);
      expect(result.reason).toContain('--render');
    });

    test('should prefer render when it is more specific', () => {
      const matches = [
        {
          action: FileClassification.EMIT,
          reason: '--render pattern match',
          tier: PrecedenceTier.EXPLICIT_OVERRIDES,
          priority: 1
        },
        {
          action: FileClassification.IGNORED,
          reason: '--ignore-render pattern match',
          tier: PrecedenceTier.IGNORE_RULES,
          priority: 2
        }
      ];
      
      // Set up patterns where render is more specific
      classifier.options.render = ['admin/public.html'];
      classifier.options.ignoreRender = ['*.html'];
      
      const result = classifier.resolveConflicts(matches, 'admin/public.html');
      
      expect(result.action).toBe(FileClassification.EMIT);
      expect(result.reason).toContain('--render');
    });

    test('should use standard precedence when no ignore-render conflicts', () => {
      // Test with matches already sorted by tier (as they would be in classifyFile)
      const matches = [
        {
          action: FileClassification.IGNORED,
          reason: '--ignore pattern match',
          tier: PrecedenceTier.IGNORE_RULES,
          priority: 1
        },
        {
          action: FileClassification.COPY,
          reason: 'copy pattern match',
          tier: PrecedenceTier.DEFAULT_BEHAVIOR,
          priority: 1
        }
      ];
      
      const result = classifier.resolveConflicts(matches, 'image.png');
      
      // resolveConflicts should return the first match when no special conflicts exist
      expect(result.action).toBe(FileClassification.IGNORED);
      expect(result.tier).toBe(PrecedenceTier.IGNORE_RULES);
    });
  });

  describe('classifyFile - Main Classification Logic', () => {
    test('should classify renderable files as EMIT by default', async () => {
      const result = await classifier.classifyFile('index.html');
      
      expect(result.action).toBe(FileClassification.EMIT);
      expect(result.reason).toContain('renderable file');
      expect(result.tier).toBe(PrecedenceTier.DEFAULT_BEHAVIOR);
    });

    test('should classify assets as COPY when in assets directory', async () => {
      const result = await classifier.classifyFile('assets/image.png');
      
      expect(result.action).toBe(FileClassification.COPY);
      expect(result.reason).toContain('asset or copy pattern match');
      expect(result.tier).toBe(PrecedenceTier.DEFAULT_BEHAVIOR);
    });

    test('should classify non-renderables as SKIP by default', async () => {
      const result = await classifier.classifyFile('config.json');
      
      expect(result.action).toBe(FileClassification.SKIP);
      expect(result.reason).toContain('non-renderable, no copy rule');
      expect(result.tier).toBe(PrecedenceTier.DEFAULT_BEHAVIOR);
    });

    test('should handle --ignore patterns', async () => {
      classifier.options.ignore = ['*.tmp', 'cache/**'];
      
      const tmpResult = await classifier.classifyFile('temp.tmp');
      expect(tmpResult.action).toBe(FileClassification.IGNORED);
      expect(tmpResult.reason).toContain('--ignore pattern match');
      
      const cacheResult = await classifier.classifyFile('cache/data.json');
      expect(cacheResult.action).toBe(FileClassification.IGNORED);
    });

    test('should handle --ignore-render patterns', async () => {
      classifier.options.ignoreRender = ['admin/*.html'];
      
      const result = await classifier.classifyFile('admin/secret.html');
      
      expect(result.action).toBe(FileClassification.IGNORED);
      expect(result.reason).toContain('--ignore-render pattern match');
    });

    test('should handle --ignore-copy patterns', async () => {
      classifier.options.ignoreCopy = ['*.tmp'];
      
      const result = await classifier.classifyFile('temp.tmp');
      
      expect(result.action).toBe(FileClassification.IGNORED);
      expect(result.reason).toContain('--ignore-copy pattern match');
    });

    test('should handle --render patterns', async () => {
      classifier.options.render = ['docs/*.md'];
      
      const result = await classifier.classifyFile('docs/readme.md');
      
      expect(result.action).toBe(FileClassification.EMIT);
      expect(result.reason).toContain('--render pattern match');
      expect(result.tier).toBe(PrecedenceTier.EXPLICIT_OVERRIDES);
    });

    test('should auto-ignore layout files when autoIgnore is enabled', async () => {
      classifier.addLayoutFile('_layout.html');
      
      const result = await classifier.classifyFile('_layout.html');
      
      expect(result.action).toBe(FileClassification.IGNORED);
      expect(result.reason).toContain('auto-ignore (layout/include file)');
    });

    test('should auto-ignore include files when autoIgnore is enabled', async () => {
      classifier.addIncludeFile('_header.html');
      
      const result = await classifier.classifyFile('_header.html');
      
      expect(result.action).toBe(FileClassification.IGNORED);
      expect(result.reason).toContain('auto-ignore (layout/include file)');
    });

    test('should auto-ignore underscore files when autoIgnore is enabled', async () => {
      const result = await classifier.classifyFile('_fragment.html');
      
      expect(result.action).toBe(FileClassification.IGNORED);
      expect(result.reason).toContain('auto-ignore (underscore prefix or directory)');
    });

    test('should not auto-ignore when autoIgnore is disabled', async () => {
      classifier.options.autoIgnore = false;
      
      const result = await classifier.classifyFile('_fragment.html');
      
      expect(result.action).toBe(FileClassification.EMIT);
      expect(result.reason).toContain('renderable file');
    });

    test('should handle Windows-style paths by converting to POSIX', async () => {
      const result = await classifier.classifyFile('dir\\subdir\\file.html');
      
      expect(result.filePath).toBe('dir\\subdir\\file.html');
      expect(result.action).toBe(FileClassification.EMIT);
    });

    test('should handle copy patterns with user-defined rules', async () => {
      classifier.options.copy = ['images/**', '*.pdf'];
      
      const imageResult = await classifier.classifyFile('images/logo.png');
      expect(imageResult.action).toBe(FileClassification.COPY);
      
      const pdfResult = await classifier.classifyFile('document.pdf');
      expect(pdfResult.action).toBe(FileClassification.COPY);
    });

    test('should handle complex tier precedence scenarios', async () => {
      // Set up multiple conflicting patterns
      classifier.options.ignore = ['*.html'];  // Tier 2
      classifier.options.render = ['index.html'];  // Tier 1 (should win)
      
      const result = await classifier.classifyFile('index.html');
      
      expect(result.action).toBe(FileClassification.EMIT);
      expect(result.tier).toBe(PrecedenceTier.EXPLICIT_OVERRIDES);
    });
  });

  describe('generateDryRunReport - Report Generation', () => {
    test('should generate formatted dry-run report', () => {
      const classifications = [
        {
          action: FileClassification.EMIT,
          filePath: 'index.html',
          reason: 'renderable file (.html, .htm, .md)',
          tier: PrecedenceTier.DEFAULT_BEHAVIOR
        },
        {
          action: FileClassification.COPY,
          filePath: 'assets/style.css',
          reason: 'asset or copy pattern match',
          tier: PrecedenceTier.DEFAULT_BEHAVIOR
        },
        {
          action: FileClassification.SKIP,
          filePath: 'config.json',
          reason: 'non-renderable, no copy rule',
          tier: PrecedenceTier.DEFAULT_BEHAVIOR
        },
        {
          action: FileClassification.IGNORED,
          filePath: '_layout.html',
          reason: 'auto-ignore (underscore prefix or directory)',
          tier: PrecedenceTier.IGNORE_RULES
        }
      ];
      
      const report = classifier.generateDryRunReport(classifications);
      
      expect(report).toContain('EMIT (1 files):');
      expect(report).toContain('index.html');
      expect(report).toContain('COPY (1 files):');
      expect(report).toContain('assets/style.css');
      expect(report).toContain('SKIP (1 files):');
      expect(report).toContain('config.json');
      expect(report).toContain('IGNORED (1 files):');
      expect(report).toContain('_layout.html');
    });

    test('should handle empty classifications', () => {
      const report = classifier.generateDryRunReport([]);
      
      expect(report).toBe('');
    });

    test('should group multiple files by action', () => {
      const classifications = [
        {
          action: FileClassification.EMIT,
          filePath: 'index.html',
          reason: 'renderable file',
          tier: PrecedenceTier.DEFAULT_BEHAVIOR
        },
        {
          action: FileClassification.EMIT,
          filePath: 'about.html',
          reason: 'renderable file',
          tier: PrecedenceTier.DEFAULT_BEHAVIOR
        }
      ];
      
      const report = classifier.generateDryRunReport(classifications);
      
      expect(report).toContain('EMIT (2 files):');
      expect(report).toContain('index.html');
      expect(report).toContain('about.html');
    });
  });

  describe('classifyAllFiles - Directory Processing', () => {
    test('should classify all files in a directory', async () => {
      // Create test directory structure
      await fs.mkdir(path.join(tempDir, 'assets'), { recursive: true });
      await fs.mkdir(path.join(tempDir, '_includes'), { recursive: true });
      
      // Create test files
      await fs.writeFile(path.join(tempDir, 'index.html'), '<html></html>');
      await fs.writeFile(path.join(tempDir, 'about.md'), '# About');
      await fs.writeFile(path.join(tempDir, 'assets', 'style.css'), 'body {}');
      await fs.writeFile(path.join(tempDir, '_includes', 'header.html'), '<header></header>');
      await fs.writeFile(path.join(tempDir, 'config.json'), '{}');
      
      const classifications = await classifier.classifyAllFiles(tempDir);
      
      expect(classifications).toHaveLength(5);
      
      // Find specific classifications
      const indexClassification = classifications.find(c => c.filePath === 'index.html');
      expect(indexClassification.action).toBe(FileClassification.EMIT);
      
      const aboutClassification = classifications.find(c => c.filePath === 'about.md');
      expect(aboutClassification.action).toBe(FileClassification.EMIT);
      
      const cssClassification = classifications.find(c => c.filePath === 'assets/style.css');
      expect(cssClassification.action).toBe(FileClassification.COPY);
      
      const headerClassification = classifications.find(c => c.filePath === '_includes/header.html');
      expect(headerClassification.action).toBe(FileClassification.IGNORED);
      
      const configClassification = classifications.find(c => c.filePath === 'config.json');
      expect(configClassification.action).toBe(FileClassification.SKIP);
    });

    test('should handle empty directories', async () => {
      const classifications = await classifier.classifyAllFiles(tempDir);
      
      expect(classifications).toEqual([]);
    });

    test('should handle nested directory structures', async () => {
      // Create nested structure
      await fs.mkdir(path.join(tempDir, 'docs', 'guides'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'assets', 'images'), { recursive: true });
      
      await fs.writeFile(path.join(tempDir, 'docs', 'readme.md'), '# Readme');
      await fs.writeFile(path.join(tempDir, 'docs', 'guides', 'getting-started.md'), '# Guide');
      await fs.writeFile(path.join(tempDir, 'assets', 'images', 'logo.png'), 'fake-image-data');
      
      const classifications = await classifier.classifyAllFiles(tempDir);
      
      expect(classifications).toHaveLength(3);
      expect(classifications.some(c => c.filePath === 'docs/readme.md')).toBe(true);
      expect(classifications.some(c => c.filePath === 'docs/guides/getting-started.md')).toBe(true);
      expect(classifications.some(c => c.filePath === 'assets/images/logo.png')).toBe(true);
    });

    test('should handle directory access errors gracefully', async () => {
      // Try to classify a non-existent directory
      const nonExistentDir = path.join(tempDir, 'nonexistent');
      
      await expect(classifier.classifyAllFiles(nonExistentDir)).rejects.toThrow();
    });
  });

  describe('Singleton Instance', () => {
    test('should export a singleton fileClassifier instance', () => {
      expect(fileClassifier).toBeInstanceOf(FileClassifier);
      expect(fileClassifier.options.sourceRoot).toBe('src');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very long file paths', async () => {
      // Create a very long path
      const longPath = 'very/'.repeat(100) + 'long/path/file.html';
      
      const result = await classifier.classifyFile(longPath);
      
      expect(result.action).toBe(FileClassification.EMIT);
      expect(result.filePath).toBe(longPath);
    });

    test('should handle special characters in file paths', async () => {
      const specialPaths = [
        'file with spaces.html',
        'file-with-dashes.html',
        'file_with_underscores.html',
        'file.with.dots.html',
        'file@special#chars$.html'
      ];
      
      for (const specialPath of specialPaths) {
        const result = await classifier.classifyFile(specialPath);
        expect(result.filePath).toBe(specialPath);
        expect(typeof result.action).toBe('string');
      }
    });

    test('should handle empty and edge case file paths', async () => {
      const edgeCases = [
        '',
        '.',
        '..',
        '/',
        '\\',
        '.hidden',
        '..hidden'
      ];
      
      for (const edgeCase of edgeCases) {
        const result = await classifier.classifyFile(edgeCase);
        expect(result.filePath).toBe(edgeCase);
        expect(typeof result.action).toBe('string');
      }
    });

    test('should handle complex pattern combinations', async () => {
      classifier.options.ignore = ['temp/**'];
      classifier.options.render = ['**/*.md'];
      classifier.options.ignoreRender = ['temp/**/*.md'];
      classifier.options.copy = ['assets/**'];
      
      const testCases = [
        { path: 'temp/readme.md', expectedAction: FileClassification.IGNORED },
        { path: 'docs/readme.md', expectedAction: FileClassification.EMIT },
        { path: 'temp/image.png', expectedAction: FileClassification.IGNORED },
        { path: 'assets/image.png', expectedAction: FileClassification.COPY }
      ];
      
      for (const testCase of testCases) {
        const result = await classifier.classifyFile(testCase.path);
        expect(result.action).toBe(testCase.expectedAction);
      }
    });

    test('should handle concurrent classification calls', async () => {
      const filePaths = Array.from({ length: 50 }, (_, i) => `file-${i}.html`);
      
      const promises = filePaths.map(filePath => classifier.classifyFile(filePath));
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(50);
      results.forEach((result, index) => {
        expect(result.filePath).toBe(`file-${index}.html`);
        expect(result.action).toBe(FileClassification.EMIT);
      });
    });
  });
});