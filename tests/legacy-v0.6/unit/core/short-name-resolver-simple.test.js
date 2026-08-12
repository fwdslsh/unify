/**
 * Short Name Resolver Tests - Simplified
 * 
 * Focused tests for the ShortNameResolver class with correct API structure
 */

import { describe, test, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ShortNameResolver } from '../../../src/core/short-name-resolver.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('ShortNameResolver - Simplified', () => {
  let resolver;
  let testDir;
  let mockLogger;

  beforeEach(() => {
    testDir = `/tmp/short-name-test-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });
    
    mockLogger = {
      logDebug: mock(() => {}),
      logInfo: mock(() => {})
    };
    
    resolver = new ShortNameResolver(mockLogger);
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Constructor', () => {
    it('should create resolver with provided logger', () => {
      const customLogger = {
        logDebug: mock(() => {}),
        logInfo: mock(() => {})
      };
      
      const customResolver = new ShortNameResolver(customLogger);
      expect(customResolver.logger).toBe(customLogger);
    });

    it('should create resolver with default logger when none provided', () => {
      const defaultResolver = new ShortNameResolver();
      expect(defaultResolver.logger).toBeDefined();
    });

    it('should initialize extensions and patterns', () => {
      expect(resolver.extensions).toContain('.html');
      expect(resolver.extensions).toContain('.htm');
      expect(resolver.patterns).toHaveLength(3);
      expect(resolver.patterns[0].name).toBe('exact');
      expect(resolver.patterns[1].name).toBe('underscore-prefix');
      expect(resolver.patterns[2].name).toBe('layout-suffix');
    });
  });

  describe('Pattern Generation', () => {
    it('should generate correct filenames for each pattern', () => {
      const exactPattern = resolver.patterns[0];
      const prefixPattern = resolver.patterns[1];
      const layoutPattern = resolver.patterns[2];

      expect(exactPattern.generateFilename('blog')).toBe('blog');
      expect(prefixPattern.generateFilename('blog')).toBe('_blog');
      expect(layoutPattern.generateFilename('blog')).toBe('_blog.layout');
    });
  });

  describe('resolve() Method', () => {
    it('should resolve exact filename matches', () => {
      mkdirSync(join(testDir, 'pages'), { recursive: true });
      writeFileSync(join(testDir, 'pages', 'blog.html'), '<div>Blog layout</div>');

      const result = resolver.resolve('blog', join(testDir, 'pages'), testDir);
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(testDir, 'pages', 'blog.html'));
      expect(result.shortName).toBe('blog');
    });

    it('should resolve underscore prefix matches', () => {
      mkdirSync(join(testDir, 'pages'), { recursive: true });
      writeFileSync(join(testDir, 'pages', '_header.html'), '<header>Header</header>');

      const result = resolver.resolve('header', join(testDir, 'pages'), testDir);
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(testDir, 'pages', '_header.html'));
      expect(result.shortName).toBe('header');
    });

    it('should resolve layout suffix matches', () => {
      mkdirSync(join(testDir, 'pages'), { recursive: true });
      writeFileSync(join(testDir, 'pages', '_article.layout.html'), '<article>Layout</article>');

      const result = resolver.resolve('article', join(testDir, 'pages'), testDir);
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(testDir, 'pages', '_article.layout.html'));
      expect(result.shortName).toBe('article');
    });

    it('should prefer exact matches over other patterns', () => {
      mkdirSync(join(testDir, 'pages'), { recursive: true });
      writeFileSync(join(testDir, 'pages', 'nav.html'), '<nav>Exact match</nav>');
      writeFileSync(join(testDir, 'pages', '_nav.html'), '<nav>Prefix match</nav>');

      const result = resolver.resolve('nav', join(testDir, 'pages'), testDir);
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(testDir, 'pages', 'nav.html'));
    });

    it('should handle .htm extension files', () => {
      mkdirSync(join(testDir, 'pages'), { recursive: true });
      writeFileSync(join(testDir, 'pages', 'legacy.htm'), '<div>Legacy HTML</div>');

      const result = resolver.resolve('legacy', join(testDir, 'pages'), testDir);
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(testDir, 'pages', 'legacy.htm'));
    });

    it('should search parent directories', () => {
      mkdirSync(join(testDir, 'pages', 'subdir'), { recursive: true });
      writeFileSync(join(testDir, 'pages', '_parent.html'), '<div>Parent layout</div>');

      const result = resolver.resolve('parent', join(testDir, 'pages', 'subdir'), testDir);
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(testDir, 'pages', '_parent.html'));
    });

    it('should search _includes directory as fallback', () => {
      mkdirSync(join(testDir, '_includes'), { recursive: true });
      mkdirSync(join(testDir, 'pages'), { recursive: true });
      writeFileSync(join(testDir, '_includes', '_fallback.html'), '<div>Fallback layout</div>');

      const result = resolver.resolve('fallback', join(testDir, 'pages'), testDir);
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(testDir, '_includes', '_fallback.html'));
    });

    it('should return failure when no matches found', () => {
      mkdirSync(join(testDir, 'pages'), { recursive: true });

      const result = resolver.resolve('nonexistent', join(testDir, 'pages'), testDir);
      
      expect(result.found).toBe(false);
      expect(result.layoutPath).toBeNull();
      expect(result.reason).toContain('not found');
    });

    it('should log debug information', () => {
      mkdirSync(join(testDir, 'pages'), { recursive: true });
      writeFileSync(join(testDir, 'pages', '_test.html'), '<div>Test</div>');

      resolver.resolve('test', join(testDir, 'pages'), testDir);
      
      expect(mockLogger.logDebug).toHaveBeenCalled();
    });
  });

  describe('Input Validation', () => {
    it('should validate shortName input', () => {
      const result = resolver.resolve('', join(testDir, 'pages'), testDir);
      
      expect(result.found).toBe(false);
      expect(result.reason).toContain('short name');
    });

    it('should validate startDirectory input', () => {
      const result = resolver.resolve('test', '', testDir);
      
      expect(result.found).toBe(false);
      expect(result.reason).toContain('start directory');
    });

    it('should validate sourceRoot input', () => {
      const result = resolver.resolve('test', join(testDir, 'pages'), '');
      
      expect(result.found).toBe(false);
      expect(result.reason).toContain('source root');
    });

    it('should handle null and undefined inputs', () => {
      const nullResult = resolver.resolve(null, join(testDir, 'pages'), testDir);
      const undefinedResult = resolver.resolve('test', undefined, testDir);
      
      expect(nullResult.found).toBe(false);
      expect(undefinedResult.found).toBe(false);
    });
  });

  describe('_validateInputs() Method', () => {
    it('should validate correct inputs', () => {
      const result = {};
      const isValid = resolver._validateInputs('test', '/start', '/source', result);
      
      expect(isValid).toBe(false); // Paths don't exist on filesystem
    });

    it('should invalidate empty inputs', () => {
      const result1 = {};
      const result2 = {};
      const result3 = {};
      
      expect(resolver._validateInputs('', '/start', '/source', result1)).toBe(false);
      expect(resolver._validateInputs('test', '', '/source', result2)).toBe(false);
      expect(resolver._validateInputs('test', '/start', '', result3)).toBe(false);
    });
  });

  describe('_getSearchDirectories() Method', () => {
    it('should return search directories in correct order', () => {
      mkdirSync(join(testDir, 'pages', 'sub'), { recursive: true });
      mkdirSync(join(testDir, '_includes'), { recursive: true });

      const searchDirs = resolver._getSearchDirectories(
        join(testDir, 'pages', 'sub'), 
        testDir
      );
      
      expect(searchDirs.length).toBeGreaterThan(0);
      expect(searchDirs).toContain(join(testDir, 'pages', 'sub'));
      expect(searchDirs).toContain(join(testDir, '_includes'));
    });

    it('should handle start directory equal to source root', () => {
      mkdirSync(join(testDir, '_includes'), { recursive: true });

      const searchDirs = resolver._getSearchDirectories(testDir, testDir);
      
      expect(searchDirs).toContain(testDir);
      expect(searchDirs).toContain(join(testDir, '_includes'));
    });
  });

  describe('_searchDirectory() Method', () => {
    it('should find files in directory', () => {
      mkdirSync(join(testDir, 'search'), { recursive: true });
      writeFileSync(join(testDir, 'search', '_test.html'), '<div>Test</div>');

      const result = resolver._searchDirectory('test', join(testDir, 'search'));
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(testDir, 'search', '_test.html'));
    });

    it('should return not found for empty directory', () => {
      mkdirSync(join(testDir, 'empty'), { recursive: true });

      const result = resolver._searchDirectory('test', join(testDir, 'empty'));
      
      expect(result.found).toBe(false);
    });

    it('should handle non-existent directory', () => {
      const result = resolver._searchDirectory('test', join(testDir, 'nonexistent'));
      
      expect(result.found).toBe(false);
    });
  });

  describe('_checkPattern() Method', () => {
    it('should check pattern against directory', () => {
      mkdirSync(join(testDir, 'pattern-test'), { recursive: true });
      writeFileSync(join(testDir, 'pattern-test', '_blog.html'), '<article>Blog</article>');

      const pattern = resolver.patterns.find(p => p.name === 'underscore-prefix');
      const result = resolver._checkPattern('blog', join(testDir, 'pattern-test'), pattern);
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(testDir, 'pattern-test', '_blog.html'));
    });

    it('should return not found when pattern does not match', () => {
      mkdirSync(join(testDir, 'pattern-test'), { recursive: true });

      const pattern = resolver.patterns.find(p => p.name === 'exact');
      const result = resolver._checkPattern('nonexistent', join(testDir, 'pattern-test'), pattern);
      
      expect(result.found).toBe(false);
    });

    it('should prefer .html over .htm extension', () => {
      mkdirSync(join(testDir, 'ext-test'), { recursive: true });
      writeFileSync(join(testDir, 'ext-test', 'test.html'), '<div>HTML</div>');
      writeFileSync(join(testDir, 'ext-test', 'test.htm'), '<div>HTM</div>');

      const pattern = resolver.patterns.find(p => p.name === 'exact');
      const result = resolver._checkPattern('test', join(testDir, 'ext-test'), pattern);
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(testDir, 'ext-test', 'test.html'));
    });
  });

  describe('_createMockResult() Method', () => {
    it('should create default mock result', () => {
      const result = resolver._createMockResult();
      
      expect(result.found).toBe(false);
      expect(result.layoutPath).toBeNull();
      expect(result.reason).toBe('Mock result');
    });

    it('should create mock result with overrides', () => {
      const overrides = {
        found: true,
        layoutPath: '/test/path.html',
        reason: null
      };
      
      const result = resolver._createMockResult(overrides);
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe('/test/path.html');
      expect(result.reason).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in names', () => {
      mkdirSync(join(testDir, 'special'), { recursive: true });
      writeFileSync(join(testDir, 'special', '_test-name.html'), '<div>Special</div>');

      const result = resolver.resolve('test-name', join(testDir, 'special'), testDir);
      
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(testDir, 'special', '_test-name.html'));
    });

    it('should handle concurrent resolution calls', () => {
      mkdirSync(join(testDir, 'concurrent'), { recursive: true });
      writeFileSync(join(testDir, 'concurrent', '_test1.html'), '<div>Test1</div>');
      writeFileSync(join(testDir, 'concurrent', '_test2.html'), '<div>Test2</div>');

      const result1 = resolver.resolve('test1', join(testDir, 'concurrent'), testDir);
      const result2 = resolver.resolve('test2', join(testDir, 'concurrent'), testDir);

      expect(result1.found).toBe(true);
      expect(result2.found).toBe(true);
      expect(result1.layoutPath).toContain('_test1.html');
      expect(result2.layoutPath).toContain('_test2.html');
    });

    it('should handle very long paths', () => {
      const longPath = 'very-long-directory-name-that-exceeds-normal-limits';
      mkdirSync(join(testDir, longPath), { recursive: true });
      writeFileSync(join(testDir, longPath, '_long.html'), '<div>Long</div>');

      const result = resolver.resolve('long', join(testDir, longPath), testDir);
      
      expect(result.found).toBe(true);
    });
  });

  describe('Pattern Descriptions', () => {
    it('should have descriptions for all patterns', () => {
      resolver.patterns.forEach(pattern => {
        expect(pattern.description).toBeDefined();
        expect(typeof pattern.description).toBe('string');
        expect(pattern.description.length).toBeGreaterThan(0);
      });
    });
  });
});