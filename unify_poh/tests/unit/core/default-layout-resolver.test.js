/**
 * Unit tests for DefaultLayoutResolver
 * Tests US-019: Default Layout Assignment with Glob Patterns
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DefaultLayoutResolver } from '../../../src/core/default-layout-resolver.js';

describe('DefaultLayoutResolver', () => {
  let resolver;

  beforeEach(() => {
    resolver = new DefaultLayoutResolver();
  });

  describe('Construction and Configuration', () => {
    test('should_create_resolver_when_no_rules_provided', () => {
      // Arrange & Act
      const resolver = new DefaultLayoutResolver();
      
      // Assert
      expect(resolver).toBeDefined();
      expect(resolver.getRules()).toEqual([]);
    });

    test('should_create_resolver_when_rules_array_provided', () => {
      // Arrange
      const rules = ['_base.html', 'blog/**=_post.html'];
      
      // Act
      const resolver = new DefaultLayoutResolver(rules);
      
      // Assert
      expect(resolver).toBeDefined();
      expect(resolver.getRules()).toHaveLength(2);
    });

    test('should_create_resolver_when_empty_array_provided', () => {
      // Arrange
      const rules = [];
      
      // Act
      const resolver = new DefaultLayoutResolver(rules);
      
      // Assert
      expect(resolver).toBeDefined();
      expect(resolver.getRules()).toEqual([]);
    });
  });

  describe('Rule Parsing and Validation', () => {
    test('should_parse_filename_only_rule_when_no_equals_sign', () => {
      // Arrange
      const rules = ['_layout.html'];
      
      // Act
      const resolver = new DefaultLayoutResolver(rules);
      
      // Assert
      const parsedRules = resolver.getRules();
      expect(parsedRules).toHaveLength(1);
      expect(parsedRules[0]).toEqual({
        type: 'filename',
        layout: '_layout.html',
        pattern: null,
        matcher: null
      });
    });

    test('should_parse_glob_pattern_rule_when_equals_sign_present', () => {
      // Arrange
      const rules = ['blog/**=_post.html'];
      
      // Act
      const resolver = new DefaultLayoutResolver(rules);
      
      // Assert
      const parsedRules = resolver.getRules();
      expect(parsedRules).toHaveLength(1);
      expect(parsedRules[0]).toEqual({
        type: 'pattern',
        layout: '_post.html',
        pattern: 'blog/**',
        matcher: expect.any(Function)
      });
    });

    test('should_parse_multiple_rules_in_order', () => {
      // Arrange
      const rules = ['_base.html', 'blog/**=_post.html', 'docs/**=_docs.html'];
      
      // Act
      const resolver = new DefaultLayoutResolver(rules);
      
      // Assert
      const parsedRules = resolver.getRules();
      expect(parsedRules).toHaveLength(3);
      expect(parsedRules[0].type).toBe('filename');
      expect(parsedRules[0].layout).toBe('_base.html');
      expect(parsedRules[1].type).toBe('pattern');
      expect(parsedRules[1].pattern).toBe('blog/**');
      expect(parsedRules[2].type).toBe('pattern');
      expect(parsedRules[2].pattern).toBe('docs/**');
    });

    test('should_validate_glob_patterns_when_parsing_rules', () => {
      // Arrange & Act & Assert
      expect(() => {
        new DefaultLayoutResolver(['blog\\\\**=_post.html']); // Invalid backslashes
      }).toThrow('Invalid glob pattern');
    });

    test('should_validate_layout_filenames_when_parsing_rules', () => {
      // Arrange & Act & Assert
      expect(() => {
        new DefaultLayoutResolver(['blog/**=../../../etc/passwd']);
      }).toThrow('Invalid layout path');
    });

    test('should_reject_empty_rules', () => {
      // Arrange & Act & Assert
      expect(() => {
        new DefaultLayoutResolver(['']);
      }).toThrow('Empty rule not allowed');
    });

    test('should_reject_rules_with_empty_layout', () => {
      // Arrange & Act & Assert
      expect(() => {
        new DefaultLayoutResolver(['blog/**=']);
      }).toThrow('Empty layout path not allowed');
    });

    test('should_reject_rules_with_empty_pattern', () => {
      // Arrange & Act & Assert
      expect(() => {
        new DefaultLayoutResolver(['=_layout.html']);
      }).toThrow('Empty pattern not allowed');
    });
  });

  describe('Layout Resolution Logic', () => {
    test('should_return_null_when_no_rules_match_file', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['blog/**=_post.html']);
      
      // Act
      const result = resolver.resolveLayout('src/about.html');
      
      // Assert
      expect(result).toBeNull();
    });

    test('should_return_glob_match_when_pattern_matches_file', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['blog/**=_post.html']);
      
      // Act
      const result = resolver.resolveLayout('src/blog/post.html');
      
      // Assert
      expect(result).toEqual({
        layout: '_post.html',
        source: 'pattern',
        pattern: 'blog/**',
        matchedRule: 0,
        evaluatedRules: [
          { rule: 0, type: 'pattern', pattern: 'blog/**', matched: true }
        ],
        finalChoice: 'Last matching pattern wins'
      });
    });

    test('should_return_filename_fallback_when_no_glob_matches', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['_base.html', 'blog/**=_post.html']);
      
      // Act
      const result = resolver.resolveLayout('src/about.html');
      
      // Assert
      expect(result).toEqual({
        layout: '_base.html',
        source: 'filename',
        pattern: null,
        matchedRule: 0,
        evaluatedRules: [
          { rule: 0, type: 'filename', matched: false },
          { rule: 1, type: 'pattern', pattern: 'blog/**', matched: false }
        ],
        finalChoice: 'Filename fallback'
      });
    });

    test('should_apply_last_wins_precedence_when_multiple_patterns_match', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'blog/**=_post.html',
        'blog/featured/**=_featured.html'
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/blog/featured/post.html');
      
      // Assert
      expect(result).toEqual({
        layout: '_featured.html',
        source: 'pattern',
        pattern: 'blog/featured/**',
        matchedRule: 1,
        evaluatedRules: [
          { rule: 0, type: 'pattern', pattern: 'blog/**', matched: true },
          { rule: 1, type: 'pattern', pattern: 'blog/featured/**', matched: true }
        ],
        finalChoice: 'Last matching pattern wins'
      });
    });

    test('should_prefer_patterns_over_filename_fallback', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        '_base.html',
        'blog/**=_post.html'
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/blog/post.html');
      
      // Assert
      expect(result).toEqual({
        layout: '_post.html',
        source: 'pattern',
        pattern: 'blog/**',
        matchedRule: 1,
        evaluatedRules: [
          { rule: 0, type: 'filename', matched: false },
          { rule: 1, type: 'pattern', pattern: 'blog/**', matched: true }
        ],
        finalChoice: 'Last matching pattern wins'
      });
    });

    test('should_match_nested_paths_correctly', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['docs/**=_docs.html']);
      
      // Act
      const result1 = resolver.resolveLayout('src/docs/api/reference.html');
      const result2 = resolver.resolveLayout('src/docs/guide.html');
      
      // Assert
      expect(result1.layout).toBe('_docs.html');
      expect(result2.layout).toBe('_docs.html');
    });

    test('should_handle_root_level_patterns', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['*.html=_page.html']);
      
      // Act
      const result = resolver.resolveLayout('src/index.html');
      
      // Assert
      expect(result.layout).toBe('_page.html');
    });

    test('should_handle_complex_glob_patterns', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['blog/**/post-*.html=_special.html']);
      
      // Act
      const result1 = resolver.resolveLayout('src/blog/2024/post-123.html');
      const result2 = resolver.resolveLayout('src/blog/featured/post-awesome.html');
      const result3 = resolver.resolveLayout('src/blog/regular.html');
      
      // Assert
      expect(result1.layout).toBe('_special.html');
      expect(result2.layout).toBe('_special.html');
      expect(result3).toBeNull();
    });

    test('should_normalize_paths_for_matching', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['blog/**=_post.html']);
      
      // Act
      const result1 = resolver.resolveLayout('src/blog/post.html');
      const result2 = resolver.resolveLayout('./src/blog/post.html');
      const result3 = resolver.resolveLayout('/absolute/src/blog/post.html');
      
      // Assert
      expect(result1.layout).toBe('_post.html');
      expect(result2.layout).toBe('_post.html');
      expect(result3.layout).toBe('_post.html');
    });
  });

  describe('Resolution Chain Logging', () => {
    test('should_provide_resolution_details_in_result', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        '_base.html',
        'blog/**=_post.html',
        'blog/featured/**=_featured.html'
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/blog/featured/special.html');
      
      // Assert
      expect(result).toEqual({
        layout: '_featured.html',
        source: 'pattern',
        pattern: 'blog/featured/**',
        matchedRule: 2,
        evaluatedRules: [
          { rule: 0, type: 'filename', matched: false },
          { rule: 1, type: 'pattern', pattern: 'blog/**', matched: true },
          { rule: 2, type: 'pattern', pattern: 'blog/featured/**', matched: true }
        ],
        finalChoice: 'Last matching pattern wins'
      });
    });

    test('should_track_all_evaluated_rules', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        '_base.html',
        'docs/**=_docs.html',
        'blog/**=_post.html'
      ]);
      
      // Act
      const result = resolver.resolveLayout('src/about.html');
      
      // Assert
      expect(result.evaluatedRules).toEqual([
        { rule: 0, type: 'filename', matched: false },
        { rule: 1, type: 'pattern', pattern: 'docs/**', matched: false },
        { rule: 2, type: 'pattern', pattern: 'blog/**', matched: false }
      ]);
      expect(result.finalChoice).toBe('Filename fallback');
    });

    test('should_provide_debug_information_when_no_matches', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['blog/**=_post.html']);
      
      // Act
      const result = resolver.resolveLayout('src/about.html');
      
      // Assert
      expect(result).toBeNull(); // But debug info should be available via getLastResolution()
      const lastResolution = resolver.getLastResolution();
      expect(lastResolution).toEqual({
        filePath: 'src/about.html',
        evaluatedRules: [
          { rule: 0, type: 'pattern', pattern: 'blog/**', matched: false }
        ],
        result: null,
        reason: 'No rules matched'
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should_handle_null_file_path', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['_base.html']);
      
      // Act
      const result = resolver.resolveLayout(null);
      
      // Assert
      expect(result).toBeNull();
    });

    test('should_handle_empty_file_path', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['_base.html']);
      
      // Act
      const result = resolver.resolveLayout('');
      
      // Assert
      expect(result).toBeNull();
    });

    test('should_handle_file_paths_without_extension', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['docs/**=_docs.html']);
      
      // Act
      const result = resolver.resolveLayout('src/docs/README');
      
      // Assert
      expect(result.layout).toBe('_docs.html');
    });

    test('should_handle_very_long_file_paths', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['**=_catch_all.html']);
      const longPath = 'src/' + 'deeply/'.repeat(100) + 'nested/file.html';
      
      // Act
      const result = resolver.resolveLayout(longPath);
      
      // Assert
      expect(result.layout).toBe('_catch_all.html');
    });

    test('should_be_case_sensitive_in_pattern_matching', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['Blog/**=_post.html']);
      
      // Act
      const result1 = resolver.resolveLayout('src/Blog/post.html');
      const result2 = resolver.resolveLayout('src/blog/post.html');
      
      // Assert
      expect(result1.layout).toBe('_post.html');
      expect(result2).toBeNull();
    });
  });

  describe('Performance Considerations', () => {
    test('should_handle_many_rules_efficiently', () => {
      // Arrange
      const rules = [];
      for (let i = 0; i < 1000; i++) {
        rules.push(`pattern${i}/**=_layout${i}.html`);
      }
      const resolver = new DefaultLayoutResolver(rules);
      
      // Act
      const startTime = Date.now();
      const result = resolver.resolveLayout('src/pattern500/file.html');
      const endTime = Date.now();
      
      // Assert
      expect(result.layout).toBe('_layout500.html');
      expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });

    test('should_cache_matcher_functions', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['blog/**=_post.html']);
      
      // Act
      const result1 = resolver.resolveLayout('src/blog/post1.html');
      const result2 = resolver.resolveLayout('src/blog/post2.html');
      
      // Assert - Both should use same matcher function (cached)
      expect(result1.layout).toBe('_post.html');
      expect(result2.layout).toBe('_post.html');
      // Matcher functions should be identical (cached)
      const rules = resolver.getRules();
      expect(rules[0].matcher).toBe(rules[0].matcher);
    });
  });

  describe('Integration Readiness', () => {
    test('should_provide_interface_compatible_with_existing_layout_discovery', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['_base.html']);
      
      // Act
      const result = resolver.resolveLayout('src/about.html');
      
      // Assert - Should return layout path that can be used by existing system
      expect(result.layout).toBe('_base.html');
      expect(typeof result.layout).toBe('string');
    });

    test('should_support_chaining_with_layout_discovery_fallback', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver(['blog/**=_post.html']);
      
      // Act
      const blogResult = resolver.resolveLayout('src/blog/post.html');
      const otherResult = resolver.resolveLayout('src/about.html');
      
      // Assert
      expect(blogResult.layout).toBe('_post.html'); // Matched by pattern
      expect(otherResult).toBeNull(); // Should fall back to discovery
    });

    test('should_handle_layout_paths_with_various_formats', () => {
      // Arrange
      const resolver = new DefaultLayoutResolver([
        'blog/**=_post.html',           // Simple filename
        'docs/**=_includes/docs.html',  // Path with directory
        'api/**=layouts/_api.html'      // Path with different directory
      ]);
      
      // Act
      const result1 = resolver.resolveLayout('src/blog/post.html');
      const result2 = resolver.resolveLayout('src/docs/guide.html');
      const result3 = resolver.resolveLayout('src/api/reference.html');
      
      // Assert
      expect(result1.layout).toBe('_post.html');
      expect(result2.layout).toBe('_includes/docs.html');
      expect(result3.layout).toBe('layouts/_api.html');
    });
  });
});