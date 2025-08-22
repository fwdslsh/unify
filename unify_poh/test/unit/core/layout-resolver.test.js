/**
 * Unit Tests for LayoutResolver
 * Tests integration of DefaultLayoutResolver with layout discovery
 * Implements US-019 integration with US-013
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { LayoutResolver } from '../../../src/core/layout-resolver.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('LayoutResolver', () => {
  let tempDir;
  let layoutResolver;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-${Date.now()}`;
    mkdirSync(tempDir, { recursive: true });
    layoutResolver = new LayoutResolver();
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Construction and Configuration', () => {
    test('should_create_resolver_without_default_layouts', () => {
      // Arrange & Act
      const resolver = new LayoutResolver();
      
      // Assert
      expect(resolver).toBeDefined();
      expect(resolver.getStats().explicitLayouts).toBe(0);
    });

    test('should_set_default_layout_rules', () => {
      // Arrange
      const rules = ['_base.html', 'blog/**=_post.html'];
      
      // Act
      layoutResolver.setDefaultLayouts(rules);
      
      // Assert
      const debugInfo = layoutResolver.getDebugInfo('test.html');
      expect(debugInfo.hasDefaultLayoutResolver).toBe(true);
      expect(debugInfo.defaultLayoutRules).toHaveLength(2);
    });

    test('should_handle_empty_default_layout_rules', () => {
      // Arrange & Act
      layoutResolver.setDefaultLayouts([]);
      
      // Assert
      const debugInfo = layoutResolver.getDebugInfo('test.html');
      expect(debugInfo.hasDefaultLayoutResolver).toBe(false);
    });
  });

  describe('Short Name Resolution (US-027)', () => {
    test('should_resolve_short_name_to_underscore_prefix_layout', () => {
      // Arrange
      mkdirSync(join(tempDir, 'blog'), { recursive: true });
      writeFileSync(join(tempDir, 'blog', '_post.html'), '<html><body>Post Layout</body></html>');
      
      const htmlContent = `
        <html data-unify="post">
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(tempDir, 'blog', 'article.html'), 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.source).toBe('explicit');
      expect(result.explicitLayout).toBe('post');
      expect(result.layoutPath).toBe(join(tempDir, 'blog', '_post.html'));
    });

    test('should_resolve_short_name_to_layout_suffix_pattern', () => {
      // Arrange
      mkdirSync(join(tempDir, 'docs'), { recursive: true });
      writeFileSync(join(tempDir, 'docs', '_guide.layout.html'), '<html><body>Guide Layout</body></html>');
      
      const htmlContent = `
        <html data-unify="guide">
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(tempDir, 'docs', 'tutorial.html'), 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.source).toBe('explicit');
      expect(result.explicitLayout).toBe('guide');
      expect(result.layoutPath).toBe(join(tempDir, 'docs', '_guide.layout.html'));
    });

    test('should_resolve_short_name_from_includes_directory', () => {
      // Arrange
      mkdirSync(join(tempDir, 'blog', 'posts'), { recursive: true });
      mkdirSync(join(tempDir, '_includes'), { recursive: true });
      writeFileSync(join(tempDir, '_includes', '_article.html'), '<html><body>Article Layout</body></html>');
      
      const htmlContent = `
        <html data-unify="article">
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(tempDir, 'blog', 'posts', 'my-post.html'), 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.source).toBe('explicit');
      expect(result.explicitLayout).toBe('article');
      expect(result.layoutPath).toBe(join(tempDir, '_includes', '_article.html'));
    });

    test('should_prioritize_exact_filename_over_short_name_patterns', () => {
      // Arrange
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', 'blog.html'), '<html><body>Exact Layout</body></html>');
      writeFileSync(join(tempDir, 'layouts', '_blog.html'), '<html><body>Prefix Layout</body></html>');
      
      const htmlContent = `
        <html data-unify="blog">
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(tempDir, 'layouts', 'page.html'), 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.source).toBe('explicit');
      expect(result.layoutPath).toBe(join(tempDir, 'layouts', 'blog.html'));
    });

    test('should_increment_short_name_resolution_stats', () => {
      // Arrange
      mkdirSync(join(tempDir, 'blog'), { recursive: true });
      writeFileSync(join(tempDir, 'blog', '_post.html'), '<html><body>Post Layout</body></html>');
      
      const htmlContent = `
        <html data-unify="post">
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      const initialStats = layoutResolver.getStats();
      
      // Act
      layoutResolver.resolveLayout(
        join(tempDir, 'blog', 'article.html'), 
        htmlContent, 
        tempDir
      );
      
      // Assert
      const finalStats = layoutResolver.getStats();
      expect(finalStats.shortNameResolutions).toBe(initialStats.shortNameResolutions + 1);
    });

    test('should_handle_short_name_resolution_failure_gracefully', () => {
      // Arrange
      const htmlContent = `
        <html data-unify="nonexistent">
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(tempDir, 'page.html'), 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.source).toBe('explicit');
      expect(result.explicitLayout).toBe('nonexistent');
      expect(result.layoutPath).toBe(join(tempDir, 'nonexistent')); // Falls back to original path
    });
  });

  describe('Layout Resolution Precedence', () => {
    test('should_respect_explicit_layout_highest_precedence', () => {
      // Arrange
      layoutResolver.setDefaultLayouts(['_base.html', 'blog/**=_post.html']);
      
      const htmlContent = `
        <html data-unify="_explicit.html">
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        'src/blog/post.html', 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.source).toBe('explicit');
      expect(result.explicitLayout).toBe('_explicit.html');
      expect(result.precedenceApplied).toBe('explicit');
      expect(result.reason).toContain('Explicit data-unify');
    });

    test('should_apply_default_pattern_when_no_explicit_layout', () => {
      // Arrange
      layoutResolver.setDefaultLayouts(['_base.html', 'blog/**=_post.html']);
      
      const htmlContent = `
        <html>
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        'src/blog/post.html', 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.source).toBe('default-pattern');
      expect(result.precedenceApplied).toBe('default-layout');
      expect(result.defaultLayoutMatch.layout).toBe('_post.html');
      expect(result.reason).toContain('Default pattern match: blog/**');
    });

    test('should_apply_default_filename_when_no_pattern_matches', () => {
      // Arrange
      layoutResolver.setDefaultLayouts(['_base.html', 'blog/**=_post.html']);
      
      const htmlContent = `
        <html>
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        'src/about.html', 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.source).toBe('default-filename');
      expect(result.precedenceApplied).toBe('default-layout');
      expect(result.defaultLayoutMatch.layout).toBe('_base.html');
      expect(result.reason).toContain('Default filename fallback');
    });

    test('should_fall_back_to_discovery_when_no_default_layouts', () => {
      // Arrange
      const sourceDir = join(tempDir, 'src');
      mkdirSync(sourceDir, { recursive: true });
      
      // Create discovered layout
      writeFileSync(join(sourceDir, '_layout.html'), '<html><body>Layout</body></html>');
      
      const htmlContent = `
        <html>
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(sourceDir, 'about.html'), 
        htmlContent, 
        sourceDir
      );
      
      // Assert
      expect(result.source).toBe('discovery');
      expect(result.precedenceApplied).toBe('discovery');
      expect(result.discoveredLayout).toBe('_layout.html');
      expect(result.reason).toContain('Layout discovery');
    });

    test('should_return_no_layout_when_nothing_found', () => {
      // Arrange
      const htmlContent = `
        <html>
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        'src/about.html', 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.source).toBe('none');
      expect(result.precedenceApplied).toBe('none');
      expect(result.layoutPath).toBeNull();
      expect(result.reason).toContain('No layout found');
    });
  });

  describe('Explicit Layout Detection', () => {
    test('should_detect_data_unify_on_html_element', () => {
      // Arrange
      const htmlContent = `
        <html data-unify="_layout.html">
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        'src/test.html', 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.explicitLayout).toBe('_layout.html');
      expect(result.source).toBe('explicit');
    });

    test('should_detect_data_unify_on_body_element', () => {
      // Arrange
      const htmlContent = `
        <html>
        <head><title>Test</title></head>
        <body data-unify="_layout.html"><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        'src/test.html', 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.explicitLayout).toBe('_layout.html');
      expect(result.source).toBe('explicit');
    });

    test('should_prefer_html_data_unify_over_body', () => {
      // Arrange
      const htmlContent = `
        <html data-unify="_html_layout.html">
        <head><title>Test</title></head>
        <body data-unify="_body_layout.html"><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        'src/test.html', 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.explicitLayout).toBe('_html_layout.html');
    });

    test('should_handle_single_and_double_quotes', () => {
      // Arrange
      const htmlContent1 = `<html data-unify='_layout.html'>`;
      const htmlContent2 = `<html data-unify="_layout.html">`;
      
      // Act
      const result1 = layoutResolver.resolveLayout('src/test1.html', htmlContent1, tempDir);
      const result2 = layoutResolver.resolveLayout('src/test2.html', htmlContent2, tempDir);
      
      // Assert
      expect(result1.explicitLayout).toBe('_layout.html');
      expect(result2.explicitLayout).toBe('_layout.html');
    });

    test('should_return_null_when_no_data_unify_found', () => {
      // Arrange
      const htmlContent = `
        <html>
        <head><title>Test</title></head>
        <body><p>Content</p></body>
        </html>
      `;
      
      // Act
      const result = layoutResolver.resolveLayout(
        'src/test.html', 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.explicitLayout).toBeNull();
    });
  });

  describe('Layout Discovery', () => {
    test('should_find_layout_in_same_directory', () => {
      // Arrange
      const sourceDir = join(tempDir, 'src');
      const blogDir = join(sourceDir, 'blog');
      mkdirSync(blogDir, { recursive: true });
      
      writeFileSync(join(blogDir, '_layout.html'), '<html><body>Blog Layout</body></html>');
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(blogDir, 'post.html'), 
        '<html><body>Content</body></html>', 
        sourceDir
      );
      
      // Assert
      expect(result.source).toBe('discovery');
      expect(result.discoveredLayout).toBe('blog/_layout.html');
    });

    test('should_climb_directory_tree_for_layout', () => {
      // Arrange
      const sourceDir = join(tempDir, 'src');
      const deepDir = join(sourceDir, 'blog', 'featured', 'special');
      mkdirSync(deepDir, { recursive: true });
      
      // Create layout in parent directory
      writeFileSync(join(sourceDir, 'blog', '_layout.html'), '<html><body>Blog Layout</body></html>');
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(deepDir, 'post.html'), 
        '<html><body>Content</body></html>', 
        sourceDir
      );
      
      // Assert
      expect(result.source).toBe('discovery');
      expect(result.discoveredLayout).toBe('blog/_layout.html');
    });

    test('should_use_root_layout_as_fallback', () => {
      // Arrange
      const sourceDir = join(tempDir, 'src');
      const subDir = join(sourceDir, 'pages');
      mkdirSync(subDir, { recursive: true });
      
      writeFileSync(join(sourceDir, '_layout.html'), '<html><body>Root Layout</body></html>');
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(subDir, 'about.html'), 
        '<html><body>Content</body></html>', 
        sourceDir
      );
      
      // Assert
      expect(result.source).toBe('discovery');
      expect(result.discoveredLayout).toBe('_layout.html');
    });

    test('should_use_includes_layout_as_final_fallback', () => {
      // Arrange
      const sourceDir = join(tempDir, 'src');
      const includesDir = join(sourceDir, '_includes');
      mkdirSync(includesDir, { recursive: true });
      
      writeFileSync(join(includesDir, 'layout.html'), '<html><body>Includes Layout</body></html>');
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(sourceDir, 'about.html'), 
        '<html><body>Content</body></html>', 
        sourceDir
      );
      
      // Assert
      expect(result.source).toBe('discovery');
      expect(result.discoveredLayout).toBe('_includes/layout.html');
    });

    test('should_cache_discovery_results', () => {
      // Arrange
      const sourceDir = join(tempDir, 'src');
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, '_layout.html'), '<html><body>Layout</body></html>');
      
      const filePath = join(sourceDir, 'test.html');
      const content = '<html><body>Content</body></html>';
      
      // Act
      const result1 = layoutResolver.resolveLayout(filePath, content, sourceDir);
      const result2 = layoutResolver.resolveLayout(filePath, content, sourceDir);
      
      // Assert
      expect(result1.discoveredLayout).toBe('_layout.html');
      expect(result2.discoveredLayout).toBe('_layout.html');
      
      const stats = layoutResolver.getStats();
      expect(stats.cacheHits).toBe(1);
      expect(stats.cacheMisses).toBe(1);
    });
  });

  describe('Resolution Chain Tracking', () => {
    test('should_track_complete_resolution_chain', () => {
      // Arrange
      layoutResolver.setDefaultLayouts(['_base.html', 'blog/**=_post.html']);
      
      const htmlContent = '<html><body>Content</body></html>';
      
      // Act
      const result = layoutResolver.resolveLayout(
        'src/about.html', 
        htmlContent, 
        tempDir
      );
      
      // Assert
      expect(result.resolutionChain).toHaveLength(3);
      expect(result.resolutionChain[0]).toEqual({
        step: 1,
        type: 'explicit',
        result: null,
        applied: false
      });
      expect(result.resolutionChain[1]).toEqual({
        step: 2,
        type: 'default-layout',
        subType: 'filename',
        result: '_base.html',
        pattern: null,
        applied: true
      });
      expect(result.resolutionChain[2]).toEqual({
        step: 3,
        type: 'discovery',
        result: null,
        applied: false
      });
    });

    test('should_track_pattern_match_details', () => {
      // Arrange
      layoutResolver.setDefaultLayouts(['blog/**=_post.html']);
      
      const htmlContent = '<html><body>Content</body></html>';
      
      // Act
      const result = layoutResolver.resolveLayout(
        'src/blog/featured/post.html', 
        htmlContent, 
        tempDir
      );
      
      // Assert
      const defaultStep = result.resolutionChain.find(step => step.type === 'default-layout');
      expect(defaultStep.subType).toBe('pattern');
      expect(defaultStep.pattern).toBe('blog/**');
      expect(defaultStep.result).toBe('_post.html');
      expect(defaultStep.applied).toBe(true);
    });
  });

  describe('Statistics and Debugging', () => {
    test('should_track_resolution_statistics', () => {
      // Arrange
      layoutResolver.setDefaultLayouts(['_base.html', 'blog/**=_post.html']);
      
      const htmlContent = '<html><body>Content</body></html>';
      const explicitContent = '<html data-unify="_explicit.html"><body>Content</body></html>';
      
      // Act
      layoutResolver.resolveLayout('src/blog/post.html', htmlContent, tempDir); // Pattern match
      layoutResolver.resolveLayout('src/about.html', htmlContent, tempDir);    // Filename match
      layoutResolver.resolveLayout('src/index.html', explicitContent, tempDir); // Explicit
      layoutResolver.resolveLayout('src/other.html', htmlContent, tempDir);     // Filename match
      
      // Assert
      const stats = layoutResolver.getStats();
      expect(stats.explicitLayouts).toBe(1);
      expect(stats.defaultPatternMatches).toBe(1);
      expect(stats.defaultFilenameMatches).toBe(2);
    });

    test('should_provide_debug_information', () => {
      // Arrange
      layoutResolver.setDefaultLayouts(['_base.html', 'blog/**=_post.html']);
      
      // Act
      const debugInfo = layoutResolver.getDebugInfo('src/test.html');
      
      // Assert
      expect(debugInfo.hasDefaultLayoutResolver).toBe(true);
      expect(debugInfo.defaultLayoutRules).toHaveLength(2);
      expect(debugInfo.stats).toBeDefined();
      expect(debugInfo.cacheSize).toBe(0);
    });

    test('should_reset_statistics', () => {
      // Arrange
      layoutResolver.setDefaultLayouts(['_base.html']);
      layoutResolver.resolveLayout('src/test.html', '<html><body>Content</body></html>', tempDir);
      
      // Act
      layoutResolver.resetStats();
      
      // Assert
      const stats = layoutResolver.getStats();
      expect(stats.defaultFilenameMatches).toBe(0);
      expect(stats.explicitLayouts).toBe(0);
    });

    test('should_clear_discovery_cache', () => {
      // Arrange
      const sourceDir = join(tempDir, 'src');
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, '_layout.html'), '<html><body>Layout</body></html>');
      
      layoutResolver.resolveLayout(
        join(sourceDir, 'test.html'), 
        '<html><body>Content</body></html>', 
        sourceDir
      );
      
      // Act
      layoutResolver.clearCache();
      
      // Assert
      const stats = layoutResolver.getStats();
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should_handle_empty_file_content', () => {
      // Arrange & Act
      const result = layoutResolver.resolveLayout('src/test.html', '', tempDir);
      
      // Assert
      expect(result.explicitLayout).toBeNull();
      expect(result.source).toBe('none');
    });

    test('should_handle_null_file_content', () => {
      // Arrange & Act
      const result = layoutResolver.resolveLayout('src/test.html', null, tempDir);
      
      // Assert
      expect(result.explicitLayout).toBeNull();
      expect(result.source).toBe('none');
    });

    test('should_handle_malformed_html_content', () => {
      // Arrange
      const malformedContent = '<html><body><unclosed-tag><p>Content</html>';
      
      // Act
      const result = layoutResolver.resolveLayout('src/test.html', malformedContent, tempDir);
      
      // Assert
      expect(result.explicitLayout).toBeNull();
      // Should not throw error
    });

    test('should_handle_nonexistent_source_directory', () => {
      // Arrange
      const nonexistentDir = '/nonexistent/directory';
      
      // Act
      const result = layoutResolver.resolveLayout(
        'src/test.html', 
        '<html><body>Content</body></html>', 
        nonexistentDir
      );
      
      // Assert
      expect(result.discoveredLayout).toBeNull();
      expect(result.source).toBe('none'); // Falls back gracefully
    });

    test('should_record_processing_time', () => {
      // Arrange
      const htmlContent = '<html><body>Content</body></html>';
      
      // Act
      const result = layoutResolver.resolveLayout('src/test.html', htmlContent, tempDir);
      
      // Assert
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTime).toBe('number');
    });
  });
});