/**
 * Unit Tests for GlobPatternProcessor
 * Tests comprehensive glob pattern processing with three-tier precedence system
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { GlobPatternProcessor, ACTIONS, TIERS } from '../../../src/core/glob-pattern-processor.js';
import { join } from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';

describe('GlobPatternProcessor', () => {
  let processor;
  let tempDir;

  beforeEach(() => {
    processor = new GlobPatternProcessor();
    
    // Create temporary directory for .gitignore tests
    tempDir = `/tmp/glob-test-${Date.now()}`;
    try {
      mkdirSync(tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(processor.options.autoIgnore).toBe(true);
      expect(processor.options.caseSensitive).toBe(process.platform !== 'win32');
    });

    it('should accept custom options', () => {
      const customProcessor = new GlobPatternProcessor({
        autoIgnore: false,
        caseSensitive: true,
        renderableExtensions: ['.html', '.md'],
        assetExtensions: ['.png', '.css']
      });

      expect(customProcessor.options.autoIgnore).toBe(false);
      expect(customProcessor.options.caseSensitive).toBe(true);
      expect(customProcessor.renderableExtensions).toEqual(['.html', '.md']);
      expect(customProcessor.assetExtensions).toEqual(['.png', '.css']);
    });

    it('should initialize with implicit assets copy pattern', () => {
      expect(processor.patterns.copy).toContain('assets/**');
    });

    it('should initialize empty pattern arrays', () => {
      expect(processor.patterns.render).toEqual([]);
      expect(processor.patterns.ignore).toEqual([]);
      expect(processor.patterns.ignoreRender).toEqual([]);
      expect(processor.patterns.ignoreCopy).toEqual([]);
      expect(processor.patterns.gitignore).toEqual([]);
    });

    it('should initialize empty auto-ignored files map', () => {
      expect(processor.autoIgnoredFiles.size).toBe(0);
    });
  });

  describe('addRenderPattern', () => {
    it('should add valid render pattern', () => {
      processor.addRenderPattern('*.html');
      expect(processor.patterns.render).toContain('*.html');
    });

    it('should normalize pattern before adding', () => {
      processor.addRenderPattern('./pages/*.html');
      expect(processor.patterns.render).toContain('pages/*.html');
    });

    it('should throw error for invalid pattern', () => {
      expect(() => {
        processor.addRenderPattern('');
      }).toThrow('Empty pattern not allowed');
    });

    it('should warn about performance issues for broad patterns', () => {
      const warnings = [];
      processor.onWarning = (message) => warnings.push(message);
      
      processor.addRenderPattern('**/*');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('performance impact');
    });
  });

  describe('addIgnorePattern', () => {
    it('should add valid ignore pattern', () => {
      processor.addIgnorePattern('*.tmp');
      expect(processor.patterns.ignore).toContain('*.tmp');
    });

    it('should normalize pattern before adding', () => {
      processor.addIgnorePattern('./temp/*.log');
      expect(processor.patterns.ignore).toContain('temp/*.log');
    });
  });

  describe('addIgnoreRenderPattern', () => {
    it('should add valid ignore-render pattern', () => {
      processor.addIgnoreRenderPattern('*.draft');
      expect(processor.patterns.ignoreRender).toContain('*.draft');
    });
  });

  describe('addIgnoreCopyPattern', () => {
    it('should add valid ignore-copy pattern', () => {
      processor.addIgnoreCopyPattern('*.src');
      expect(processor.patterns.ignoreCopy).toContain('*.src');
    });
  });

  describe('addCopyPattern', () => {
    it('should add valid copy pattern', () => {
      processor.addCopyPattern('docs/**/*.pdf');
      expect(processor.patterns.copy).toContain('docs/**/*.pdf');
    });
  });

  describe('addGitignorePattern', () => {
    it('should add gitignore pattern when auto-ignore enabled', () => {
      processor.addGitignorePattern('node_modules/');
      expect(processor.patterns.gitignore).toContain('node_modules/**');
    });

    it('should normalize gitignore directory pattern', () => {
      processor.addGitignorePattern('dist/');
      expect(processor.patterns.gitignore).toContain('dist/**');
    });

    it('should not add gitignore pattern when auto-ignore disabled', () => {
      processor.setAutoIgnore(false);
      processor.addGitignorePattern('node_modules/');
      expect(processor.patterns.gitignore).not.toContain('node_modules/**');
    });

    it('should handle non-directory gitignore patterns', () => {
      processor.addGitignorePattern('*.log');
      expect(processor.patterns.gitignore).toContain('*.log');
    });
  });

  describe('setAutoIgnore', () => {
    it('should enable auto-ignore', () => {
      processor.setAutoIgnore(true);
      expect(processor.options.autoIgnore).toBe(true);
    });

    it('should disable auto-ignore and clear gitignore patterns', () => {
      processor.addGitignorePattern('*.tmp');
      processor.setAutoIgnore(false);
      
      expect(processor.options.autoIgnore).toBe(false);
      expect(processor.patterns.gitignore).toEqual([]);
    });
  });

  describe('addAutoIgnoredFile', () => {
    it('should add file to auto-ignored when auto-ignore enabled', () => {
      processor.addAutoIgnoredFile('_layout.html', 'layout file');
      expect(processor.autoIgnoredFiles.has('_layout.html')).toBe(true);
      expect(processor.autoIgnoredFiles.get('_layout.html')).toBe('layout file');
    });

    it('should not add file when auto-ignore disabled', () => {
      processor.setAutoIgnore(false);
      processor.addAutoIgnoredFile('_layout.html', 'layout file');
      expect(processor.autoIgnoredFiles.has('_layout.html')).toBe(false);
    });

    it('should normalize file path', () => {
      processor.addAutoIgnoredFile('path\\to\\_layout.html', 'layout file');
      expect(processor.autoIgnoredFiles.has('path/to/_layout.html')).toBe(true);
    });
  });

  describe('matchesPattern', () => {
    beforeEach(() => {
      processor.addCopyPattern('assets/**/*.png');
      processor.addIgnorePattern('*.tmp');
    });

    it('should return true for matching copy pattern', () => {
      expect(processor.matchesPattern('assets/img/logo.png', 'copy')).toBe(true);
    });

    it('should return false for non-matching copy pattern', () => {
      expect(processor.matchesPattern('docs/readme.md', 'copy')).toBe(false);
    });

    it('should return true for matching ignore pattern', () => {
      expect(processor.matchesPattern('temp.tmp', 'ignore')).toBe(true);
    });

    it('should return false for invalid pattern type', () => {
      expect(processor.matchesPattern('test.html', 'invalid')).toBe(false);
    });
  });

  describe('classifyFile - Tier 1 (Explicit overrides)', () => {
    it('should classify renderable as EMIT when auto-ignore disabled', () => {
      processor.setAutoIgnore(false);
      const result = processor.classifyFile('page.html');
      
      expect(result.action).toBe(ACTIONS.EMIT);
      expect(result.tier).toBe(TIERS.EXPLICIT);
      expect(result.reason).toBe('auto-ignore=false override, renderable file');
    });

    it('should classify non-renderable as default when auto-ignore disabled', () => {
      processor.setAutoIgnore(false);
      const result = processor.classifyFile('image.png');
      
      expect(result.action).toBe(ACTIONS.COPY);
      expect(result.tier).toBe(TIERS.DEFAULT);
    });

    it('should override ignore with render pattern', () => {
      processor.addIgnorePattern('*.html');
      processor.addRenderPattern('important.html');
      
      const result = processor.classifyFile('important.html');
      
      expect(result.action).toBe(ACTIONS.EMIT);
      expect(result.tier).toBe(TIERS.EXPLICIT);
      expect(result.reason).toContain('--render pattern');
    });

    it('should not override for non-renderable file with render pattern', () => {
      processor.addRenderPattern('*.png');
      
      const result = processor.classifyFile('image.png');
      
      expect(result.action).not.toBe(ACTIONS.EMIT);
      expect(result.tier).not.toBe(TIERS.EXPLICIT);
    });
  });

  describe('classifyFile - Tier 2 (Ignore rules)', () => {
    it('should ignore auto-ignored file', () => {
      processor.addAutoIgnoredFile('_layout.html', 'layout file');
      
      const result = processor.classifyFile('_layout.html');
      
      expect(result.action).toBe(ACTIONS.IGNORED);
      expect(result.tier).toBe(TIERS.IGNORE);
      expect(result.reason).toContain('auto-ignored');
    });

    it('should ignore file matching ignore pattern', () => {
      processor.addIgnorePattern('*.tmp');
      
      const result = processor.classifyFile('temp.tmp');
      
      expect(result.action).toBe(ACTIONS.IGNORED);
      expect(result.tier).toBe(TIERS.IGNORE);
      expect(result.reason).toContain('--ignore pattern');
    });

    it('should ignore file matching gitignore pattern', () => {
      processor.addGitignorePattern('*.log');
      
      const result = processor.classifyFile('debug.log');
      
      expect(result.action).toBe(ACTIONS.IGNORED);
      expect(result.tier).toBe(TIERS.IGNORE);
      expect(result.reason).toContain('.gitignore pattern');
    });

    it('should handle ignore-render pattern', () => {
      processor.addIgnoreRenderPattern('*.html');
      
      const result = processor.classifyFile('draft.html');
      
      expect(result.action).toBe(ACTIONS.IGNORED);
      expect(result.tier).toBe(TIERS.IGNORE);
    });

    it('should handle ignore-copy pattern for renderable', () => {
      processor.addIgnoreCopyPattern('*.html');
      
      const result = processor.classifyFile('page.html');
      
      expect(result.action).toBe(ACTIONS.EMIT);
      expect(result.tier).toBe(TIERS.DEFAULT);
      expect(result.reason).toBe('copy ignored but renderable, render wins over copy');
    });

    it('should handle ignore-copy pattern for non-renderable', () => {
      processor.addIgnoreCopyPattern('*.png');
      
      const result = processor.classifyFile('image.png');
      
      expect(result.action).toBe(ACTIONS.IGNORED);
      expect(result.tier).toBe(TIERS.IGNORE);
    });
  });

  describe('classifyFile - Tier 3 (Default behavior)', () => {
    it('should emit renderable files by default', () => {
      const result = processor.classifyFile('page.html');
      
      expect(result.action).toBe(ACTIONS.EMIT);
      expect(result.tier).toBe(TIERS.DEFAULT);
      expect(result.reason).toBe('renderable file, default behavior');
    });

    it('should copy assets by default', () => {
      const result = processor.classifyFile('image.png');
      
      expect(result.action).toBe(ACTIONS.COPY);
      expect(result.tier).toBe(TIERS.DEFAULT);
      expect(result.reason).toBe('asset file, default behavior');
    });

    it('should copy files matching copy pattern', () => {
      processor.addCopyPattern('docs/**/*.pdf');
      
      const result = processor.classifyFile('docs/manual.pdf');
      
      expect(result.action).toBe(ACTIONS.COPY);
      expect(result.tier).toBe(TIERS.DEFAULT);
      expect(result.reason).toContain('copy pattern');
    });

    it('should skip unknown file types', () => {
      const result = processor.classifyFile('unknown.xyz');
      
      expect(result.action).toBe(ACTIONS.SKIP);
      expect(result.tier).toBe(TIERS.DEFAULT);
      expect(result.reason).toBe('non-renderable, no copy rules match');
    });

    it('should skip assets excluded by negation pattern', () => {
      processor.addCopyPattern('assets/**');
      processor.addCopyPattern('!assets/**/*.png');
      
      const result = processor.classifyFile('assets/temp.png');
      
      expect(result.action).toBe(ACTIONS.SKIP);
      expect(result.tier).toBe(TIERS.DEFAULT);
      expect(result.reason).toBe('asset excluded by negation pattern');
    });
  });

  describe('pattern normalization', () => {
    it('should remove leading ./ from patterns', () => {
      processor.addCopyPattern('./assets/**');
      expect(processor.patterns.copy).toContain('assets/**');
    });

    it('should handle ../ in patterns', () => {
      processor.addIgnorePattern('../temp/**');
      expect(processor.patterns.ignore).toContain('temp/**');
    });

    it('should handle negation patterns', () => {
      processor.addCopyPattern('!*.tmp');
      expect(processor.patterns.copy).toContain('!*.tmp');
    });

    it('should normalize nested negation patterns', () => {
      processor.addIgnorePattern('!./docs/**/*.md');
      expect(processor.patterns.ignore).toContain('!docs/**/*.md');
    });
  });

  describe('addPatterns', () => {
    it('should add patterns in bulk', () => {
      processor.addPatterns({
        copy: ['*.pdf', '*.doc'],
        ignore: ['*.tmp', '*.log'],
        ignoreRender: ['*.draft'],
        ignoreCopy: ['*.src'],
        render: ['*.html']
      });

      expect(processor.patterns.copy).toContain('*.pdf');
      expect(processor.patterns.copy).toContain('*.doc');
      expect(processor.patterns.ignore).toContain('*.tmp');
      expect(processor.patterns.ignore).toContain('*.log');
      expect(processor.patterns.ignoreRender).toContain('*.draft');
      expect(processor.patterns.ignoreCopy).toContain('*.src');
      expect(processor.patterns.render).toContain('*.html');
    });

    it('should handle empty pattern arrays', () => {
      processor.addPatterns({});
      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('getCopyPatterns', () => {
    it('should return copy patterns array', () => {
      processor.addCopyPattern('*.pdf');
      processor.addCopyPattern('docs/**');
      
      const patterns = processor.getCopyPatterns();
      expect(patterns).toContain('*.pdf');
      expect(patterns).toContain('docs/**');
    });

    it('should return copy of patterns array', () => {
      const patterns = processor.getCopyPatterns();
      patterns.push('modified');
      
      expect(processor.patterns.copy).not.toContain('modified');
    });
  });

  describe('getIgnorePatterns', () => {
    it('should return ignore patterns array', () => {
      processor.addIgnorePattern('*.tmp');
      processor.addIgnorePattern('cache/**');
      
      const patterns = processor.getIgnorePatterns();
      expect(patterns).toContain('*.tmp');
      expect(patterns).toContain('cache/**');
    });
  });

  describe('clearPatterns', () => {
    it('should clear all patterns', () => {
      processor.addRenderPattern('*.html');
      processor.addIgnorePattern('*.tmp');
      processor.addAutoIgnoredFile('_layout.html', 'layout');
      
      processor.clearPatterns();
      
      expect(processor.patterns.render).toEqual([]);
      expect(processor.patterns.ignore).toEqual([]);
      expect(processor.autoIgnoredFiles.size).toBe(0);
    });

    it('should re-add implicit assets pattern', () => {
      processor.clearPatterns();
      processor._addImplicitAssetsCopy();
      expect(processor.patterns.copy).toContain('assets/**');
    });
  });

  describe('loadGitignore', () => {
    it('should load .gitignore file when it exists', () => {
      const gitignoreContent = [
        '# Comments should be ignored',
        'node_modules/',
        '*.log',
        '',
        'dist/'
      ].join('\n');
      
      writeFileSync(join(tempDir, '.gitignore'), gitignoreContent);
      processor.loadGitignore(tempDir);
      
      expect(processor.patterns.gitignore).toContain('node_modules/**');
      expect(processor.patterns.gitignore).toContain('*.log');
      expect(processor.patterns.gitignore).toContain('dist/**');
      expect(processor.patterns.gitignore).not.toContain('#');
      expect(processor.patterns.gitignore).not.toContain('');
    });

    it('should ignore missing .gitignore file silently', () => {
      processor.loadGitignore('/nonexistent/path');
      // Should not throw error
      expect(processor.patterns.gitignore).toEqual([]);
    });

    it('should not load .gitignore when auto-ignore disabled', () => {
      const gitignoreContent = 'node_modules/\n*.log';
      writeFileSync(join(tempDir, '.gitignore'), gitignoreContent);
      
      processor.setAutoIgnore(false);
      processor.loadGitignore(tempDir);
      
      expect(processor.patterns.gitignore).toEqual([]);
    });
  });

  describe('pattern matching', () => {
    it('should handle case sensitivity based on platform', () => {
      const caseSensitiveProcessor = new GlobPatternProcessor({ caseSensitive: true });
      const caseInsensitiveProcessor = new GlobPatternProcessor({ caseSensitive: false });
      
      caseSensitiveProcessor.addCopyPattern('*.PNG');
      caseInsensitiveProcessor.addCopyPattern('*.PNG');
      
      expect(caseSensitiveProcessor.matchesPattern('image.png', 'copy')).toBe(false);
      expect(caseInsensitiveProcessor.matchesPattern('image.png', 'copy')).toBe(true);
    });

    it('should handle dot files', () => {
      processor.addIgnorePattern('.*');
      
      const result = processor.classifyFile('.hidden');
      expect(result.action).toBe(ACTIONS.IGNORED);
    });

    it('should handle complex glob patterns', () => {
      processor.addCopyPattern('**/*.{jpg,png,gif}');
      
      expect(processor.matchesPattern('images/photo.jpg', 'copy')).toBe(true);
      expect(processor.matchesPattern('assets/icons/logo.png', 'copy')).toBe(true);
      expect(processor.matchesPattern('docs/readme.md', 'copy')).toBe(false);
    });
  });

  describe('precedence system', () => {
    it('should prioritize Tier 1 over Tier 2', () => {
      processor.addIgnorePattern('*.html');
      processor.addRenderPattern('important.html');
      
      const result = processor.classifyFile('important.html');
      expect(result.tier).toBe(TIERS.EXPLICIT);
      expect(result.action).toBe(ACTIONS.EMIT);
    });

    it('should prioritize Tier 2 over Tier 3', () => {
      processor.addIgnorePattern('*.png');
      
      const result = processor.classifyFile('image.png');
      expect(result.tier).toBe(TIERS.IGNORE);
      expect(result.action).toBe(ACTIONS.IGNORED);
    });

    it('should use last matching pattern (ripgrep-style)', () => {
      processor.addCopyPattern('*.txt');
      processor.addCopyPattern('!temp.txt');
      processor.addCopyPattern('temp.txt');
      
      const result = processor.classifyFile('temp.txt');
      expect(result.action).toBe(ACTIONS.COPY);
    });
  });

  describe('warning handling', () => {
    it('should call warning callback when set', () => {
      const warnings = [];
      processor.onWarning = (message) => warnings.push(message);
      
      processor.addRenderPattern('**/*');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('performance impact');
    });

    it('should not throw when no warning callback set', () => {
      expect(() => {
        processor.addRenderPattern('**/*');
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty file path', () => {
      const result = processor.classifyFile('');
      expect(result.action).toBe(ACTIONS.SKIP);
    });

    it('should handle file path with no extension', () => {
      const result = processor.classifyFile('README');
      expect(result.action).toBe(ACTIONS.SKIP);
    });

    it('should handle path with multiple dots', () => {
      const result = processor.classifyFile('file.name.with.dots.html');
      expect(result.action).toBe(ACTIONS.EMIT);
    });

    it('should handle Windows-style patterns with forward slashes', () => {
      processor.addIgnorePattern('temp/*.html');
      const result = processor.classifyFile('temp\\debug.html');
      expect(result.action).toBe(ACTIONS.IGNORED);
    });
  });

  // Cleanup
  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Cleanup failed, ignore
    }
  });
});