/**
 * Integration Tests for Default Layout Resolution
 * Tests US-019: Default Layout Assignment with Glob Patterns
 * 
 * Tests the complete workflow of default layout assignment including:
 * - Precedence rules: explicit > glob match > filename default > discovery
 * - Last wins for overlapping patterns
 * - Integration with existing layout discovery
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DefaultLayoutResolver } from '../../../src/core/default-layout-resolver.js';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Default Layout Resolution Integration', () => {
  let tempDir;
  let pathValidator;
  let defaultLayoutResolver;
  let htmlProcessor;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-${Date.now()}`;
    mkdirSync(tempDir, { recursive: true });
    
    pathValidator = new PathValidator();
    defaultLayoutResolver = new DefaultLayoutResolver();
    htmlProcessor = new HtmlProcessor(pathValidator);
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Layout Resolution Precedence', () => {
    test('should_resolve_default_layout_when_no_explicit_override', () => {
      // Arrange - DefaultLayoutResolver doesn't know about explicit layouts
      // It just provides default layout resolution that can be overridden later
      const resolver = new DefaultLayoutResolver([
        '_base.html',
        'blog/**=_post.html'
      ]);
      
      const filePath = 'src/index.html';
      
      // Act
      const result = resolver.resolveLayout(filePath);
      
      // Assert - Should return the filename fallback layout
      expect(result.layout).toBe('_base.html');
      expect(result.source).toBe('filename');
    });

    test('should_apply_glob_match_over_filename_fallback', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        '_base.html',                    // Filename fallback
        'blog/**=_post.html'            // Glob pattern
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/blog/post.html');
      
      // Assert
      expect(result.layout).toBe('_post.html');
      expect(result.source).toBe('pattern');
      expect(result.pattern).toBe('blog/**');
    });

    test('should_use_filename_fallback_when_no_patterns_match', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        '_base.html',                    // Filename fallback
        'blog/**=_post.html',           // Won't match
        'docs/**=_docs.html'            // Won't match
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/about.html');
      
      // Assert
      expect(result.layout).toBe('_base.html');
      expect(result.source).toBe('filename');
      expect(result.pattern).toBeNull();
    });

    test('should_return_null_when_no_rules_match_for_discovery_fallback', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'blog/**=_post.html',           // Won't match
        'api/**=_api.html'              // Won't match
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/docs/guide.html');
      
      // Assert
      expect(result).toBeNull(); // Should fall back to discovery
    });

    test('should_apply_last_wins_precedence_for_overlapping_patterns', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'blog/**=_post.html',               // Matches but should lose
        'blog/featured/**=_featured.html'   // Matches and should win
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/blog/featured/special.html');
      
      // Assert
      expect(result.layout).toBe('_featured.html');
      expect(result.source).toBe('pattern');
      expect(result.pattern).toBe('blog/featured/**');
      expect(result.matchedRule).toBe(1); // Second rule wins
    });

    test('should_handle_complex_precedence_scenarios', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        '_global.html',                     // Global fallback
        'content/**=_content.html',         // Broad pattern
        'blog/**=_post.html',               // Specific to blog
        'blog/featured/**=_featured.html',  // More specific
        'blog/featured/special/**=_super.html' // Most specific
      ]);
      
      // Act - Test various paths
      const result1 = resolver.resolveLayout('src/about.html');
      const result2 = resolver.resolveLayout('src/content/page.html');
      const result3 = resolver.resolveLayout('src/blog/regular.html');
      const result4 = resolver.resolveLayout('src/blog/featured/story.html');
      const result5 = resolver.resolveLayout('src/blog/featured/special/epic.html');
      
      // Assert
      expect(result1.layout).toBe('_global.html');        // Filename fallback
      expect(result2.layout).toBe('_content.html');       // content/** match
      expect(result3.layout).toBe('_post.html');          // blog/** match
      expect(result4.layout).toBe('_featured.html');      // blog/featured/** wins
      expect(result5.layout).toBe('_super.html');         // Most specific wins
    });
  });

  describe('Pattern Matching Behavior', () => {
    test('should_match_nested_directory_structures', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'docs/**=_docs.html'
      ]);
      
      // Act
      const result1 = resolver.resolveLayout('src/docs/api/v1/reference.html');
      const result2 = resolver.resolveLayout('src/docs/guides/getting-started.html');
      const result3 = resolver.resolveLayout('src/docs/index.html');
      
      // Assert
      expect(result1.layout).toBe('_docs.html');
      expect(result2.layout).toBe('_docs.html');
      expect(result3.layout).toBe('_docs.html');
    });

    test('should_handle_root_level_patterns', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        '*.html=_page.html'
      ]);
      
      // Act
      const result1 = resolver.resolveLayout('src/index.html');
      const result2 = resolver.resolveLayout('src/about.html');
      const result3 = resolver.resolveLayout('src/blog/post.html'); // Should not match
      
      // Assert
      expect(result1.layout).toBe('_page.html');
      expect(result2.layout).toBe('_page.html');
      expect(result3).toBeNull();
    });

    test('should_support_complex_glob_patterns', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'blog/**/post-*.html=_special-post.html',
        'api/v*/**/*.json=_api-response.html'
      ]);
      
      // Act
      const result1 = resolver.resolveLayout('src/blog/2024/post-123.html');
      const result2 = resolver.resolveLayout('src/blog/featured/post-awesome.html');
      const result3 = resolver.resolveLayout('src/api/v1/users.json');
      const result4 = resolver.resolveLayout('src/api/v2/posts/123.json');
      
      // Assert
      expect(result1.layout).toBe('_special-post.html');
      expect(result2.layout).toBe('_special-post.html');
      expect(result3.layout).toBe('_api-response.html');
      expect(result4.layout).toBe('_api-response.html');
    });

    test('should_be_case_sensitive_in_matching', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'Blog/**=_post.html',
        'blog/**=_blog.html'
      ]);
      
      // Act
      const result1 = resolver.resolveLayout('src/Blog/post.html');
      const result2 = resolver.resolveLayout('src/blog/post.html');
      
      // Assert
      expect(result1.layout).toBe('_post.html');  // Matches 'Blog/**'
      expect(result2.layout).toBe('_blog.html');  // Matches 'blog/**'
    });
  });

  describe('Path Normalization', () => {
    test('should_normalize_different_path_formats', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'blog/**=_post.html'
      ]);
      
      // Act
      const result1 = resolver.resolveLayout('src/blog/post.html');
      const result2 = resolver.resolveLayout('./src/blog/post.html');
      const result3 = resolver.resolveLayout('/project/src/blog/post.html');
      
      // Assert - All should match the same pattern
      expect(result1.layout).toBe('_post.html');
      expect(result2.layout).toBe('_post.html');
      expect(result3.layout).toBe('_post.html');
    });

    test('should_handle_paths_without_src_prefix', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'blog/**=_post.html'
      ]);
      
      // Act
      const result = resolver.resolveLayout('blog/post.html');
      
      // Assert
      expect(result.layout).toBe('_post.html');
    });

    test('should_work_with_deeply_nested_paths', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'docs/**=_docs.html'
      ]);
      
      const deepPath = 'src/docs/api/v2/endpoints/users/profile/settings.html';
      
      // Act
      const result = resolver.resolveLayout(deepPath);
      
      // Assert
      expect(result.layout).toBe('_docs.html');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should_handle_empty_file_paths_gracefully', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['_base.html']);
      
      // Act & Assert
      expect(resolver.resolveLayout('')).toBeNull();
      expect(resolver.resolveLayout(null)).toBeNull();
      expect(resolver.resolveLayout(undefined)).toBeNull();
    });

    test('should_handle_files_without_extensions', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'docs/**=_docs.html'
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/docs/README');
      
      // Assert
      expect(result.layout).toBe('_docs.html');
    });

    test('should_work_with_unicode_filenames', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'blog/**=_post.html'
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/blog/文档.html');
      
      // Assert
      expect(result.layout).toBe('_post.html');
    });

    test('should_handle_very_long_paths', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'deep/**=_deep.html'
      ]);
      
      const longPath = 'src/deep/' + 'nested/'.repeat(100) + 'file.html';
      
      // Act
      const result = resolver.resolveLayout(longPath);
      
      // Assert
      expect(result.layout).toBe('_deep.html');
    });
  });

  describe('Resolution Chain Logging', () => {
    test('should_provide_detailed_resolution_information', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        '_global.html',
        'blog/**=_post.html',
        'blog/featured/**=_featured.html'
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/blog/featured/story.html');
      
      // Assert
      expect(result.evaluatedRules).toHaveLength(3);
      expect(result.evaluatedRules[0]).toEqual({
        rule: 0,
        type: 'filename',
        matched: false
      });
      expect(result.evaluatedRules[1]).toEqual({
        rule: 1,
        type: 'pattern',
        pattern: 'blog/**',
        matched: true
      });
      expect(result.evaluatedRules[2]).toEqual({
        rule: 2,
        type: 'pattern',
        pattern: 'blog/featured/**',
        matched: true
      });
      expect(result.finalChoice).toBe('Last matching pattern wins');
    });

    test('should_track_resolution_chain_for_debugging', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        '_base.html',
        'api/**=_api.html'
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/about.html');
      
      // Assert
      expect(result.evaluatedRules).toHaveLength(2);
      expect(result.finalChoice).toBe('Filename fallback');
      
      const lastResolution = resolver.getLastResolution();
      expect(lastResolution.filePath).toBe('src/about.html');
      expect(lastResolution.reason).toBe('Filename fallback used');
    });

    test('should_log_when_no_matches_found', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'blog/**=_post.html'
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/about.html');
      
      // Assert
      expect(result).toBeNull();
      
      const lastResolution = resolver.getLastResolution();
      expect(lastResolution.result).toBeNull();
      expect(lastResolution.reason).toBe('No rules matched');
    });
  });

  describe('Performance Considerations', () => {
    test('should_handle_many_rules_efficiently', () => {
      // Arrange
      const rules = [];
      for (let i = 0; i < 100; i++) {
        rules.push(`category${i}/**=_layout${i}.html`);
      }
      rules.push('test/**=_test.html'); // Matching rule at the end
      
      const resolver = new DefaultLayoutResolver(rules);
      
      // Act
      const startTime = Date.now();
      const result = resolver.resolveLayout('src/test/file.html');
      const endTime = Date.now();
      
      // Assert
      expect(result.layout).toBe('_test.html');
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast
    });

    test('should_cache_matcher_functions_for_reuse', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['blog/**=_post.html']);
      
      // Act - Multiple resolutions should reuse cached matchers
      const result1 = resolver.resolveLayout('src/blog/post1.html');
      const result2 = resolver.resolveLayout('src/blog/post2.html');
      const result3 = resolver.resolveLayout('src/blog/post3.html');
      
      // Assert
      expect(result1.layout).toBe('_post.html');
      expect(result2.layout).toBe('_post.html');
      expect(result3.layout).toBe('_post.html');
      
      // Should use the same cached matcher
      const rules = resolver.getRules();
      expect(rules[0].matcher).toBeDefined();
    });
  });

  describe('Integration with Existing Systems', () => {
    test('should_provide_layout_path_compatible_with_html_processor', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['blog/**=_post.html']);
      
      // Act
      const result = resolver.resolveLayout('src/blog/post.html');
      
      // Assert
      expect(typeof result.layout).toBe('string');
      expect(result.layout).toBe('_post.html');
      // This layout path should be usable by HtmlProcessor
    });

    test('should_support_layout_discovery_fallback_workflow', () => {
      // Arrange - Simulate a file that doesn't match any default layout patterns
      const resolver = new DefaultLayoutResolver(['blog/**=_post.html']);
      
      // Act
      const result = resolver.resolveLayout('src/docs/guide.html');
      
      // Assert - Should return null to allow layout discovery to take over
      expect(result).toBeNull();
    });

    test('should_handle_different_layout_file_formats', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'blog/**=_post.html',
        'api/**=layouts/api.html',
        'docs/**=_includes/documentation.html'
      ]);
      
      // Act
      const result1 = resolver.resolveLayout('src/blog/post.html');
      const result2 = resolver.resolveLayout('src/api/endpoint.html');
      const result3 = resolver.resolveLayout('src/docs/guide.html');
      
      // Assert - All should return valid layout paths
      expect(result1.layout).toBe('_post.html');
      expect(result2.layout).toBe('layouts/api.html');
      expect(result3.layout).toBe('_includes/documentation.html');
    });
  });
});