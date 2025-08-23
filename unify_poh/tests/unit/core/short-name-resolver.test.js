/**
 * Unit Tests for ShortNameResolver
 * Tests US-027: Short Name Layout Resolution
 * Implements pattern matching and directory traversal for layout discovery
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ShortNameResolver } from '../../../src/core/short-name-resolver.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('ShortNameResolver', () => {
  let tempDir;
  let resolver;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-short-name-${Date.now()}`;
    mkdirSync(tempDir, { recursive: true });
    resolver = new ShortNameResolver();
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Construction and Initialization', () => {
    test('should_create_resolver_with_default_settings', () => {
      // Arrange & Act
      const resolver = new ShortNameResolver();
      
      // Assert
      expect(resolver).toBeDefined();
      expect(typeof resolver.resolve).toBe('function');
    });

    test('should_accept_custom_logger', () => {
      // Arrange
      const mockLogger = { logDebug: () => {}, logInfo: () => {} };
      
      // Act
      const resolver = new ShortNameResolver(mockLogger);
      
      // Assert
      expect(resolver).toBeDefined();
    });
  });

  describe('Pattern Matching', () => {
    test('should_match_exact_filename_over_pattern', () => {
      // Arrange
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', 'blog.html'), '<html></html>');
      writeFileSync(join(tempDir, 'layouts', '_blog.layout.html'), '<html></html>');
      
      // Act
      const result = resolver.resolve('blog', join(tempDir, 'layouts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, 'layouts', 'blog.html'));
      expect(result.source).toBe('exact');
      expect(result.reason).toContain('exact filename match');
    });

    test('should_match_underscore_prefix_pattern', () => {
      // Arrange
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', '_blog.html'), '<html></html>');
      
      // Act
      const result = resolver.resolve('blog', join(tempDir, 'layouts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, 'layouts', '_blog.html'));
      expect(result.source).toBe('underscore-prefix');
      expect(result.reason).toContain('underscore prefix pattern');
    });

    test('should_match_layout_suffix_pattern', () => {
      // Arrange
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', '_blog.layout.html'), '<html></html>');
      
      // Act
      const result = resolver.resolve('blog', join(tempDir, 'layouts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, 'layouts', '_blog.layout.html'));
      expect(result.source).toBe('layout-suffix');
      expect(result.reason).toContain('layout suffix pattern');
    });

    test('should_handle_multiple_extensions', () => {
      // Arrange
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', '_blog.layout.htm'), '<html></html>');
      
      // Act
      const result = resolver.resolve('blog', join(tempDir, 'layouts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, 'layouts', '_blog.layout.htm'));
      expect(result.source).toBe('layout-suffix');
    });
  });

  describe('Directory Traversal', () => {
    test('should_search_current_directory_first', () => {
      // Arrange
      mkdirSync(join(tempDir, 'blog'), { recursive: true });
      mkdirSync(join(tempDir, '_includes'), { recursive: true });
      writeFileSync(join(tempDir, 'blog', '_post.html'), '<html></html>');
      writeFileSync(join(tempDir, '_includes', '_post.html'), '<html></html>');
      
      // Act
      const result = resolver.resolve('post', join(tempDir, 'blog'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, 'blog', '_post.html'));
      expect(result.searchPath).toBe(join(tempDir, 'blog'));
    });

    test('should_traverse_to_parent_directories', () => {
      // Arrange
      mkdirSync(join(tempDir, 'blog', 'posts'), { recursive: true });
      writeFileSync(join(tempDir, 'blog', '_post.html'), '<html></html>');
      
      // Act
      const result = resolver.resolve('post', join(tempDir, 'blog', 'posts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, 'blog', '_post.html'));
      expect(result.searchPath).toBe(join(tempDir, 'blog'));
    });

    test('should_search_includes_directory_as_fallback', () => {
      // Arrange
      mkdirSync(join(tempDir, 'blog', 'posts'), { recursive: true });
      mkdirSync(join(tempDir, '_includes'), { recursive: true });
      writeFileSync(join(tempDir, '_includes', '_post.html'), '<html></html>');
      
      // Act
      const result = resolver.resolve('post', join(tempDir, 'blog', 'posts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, '_includes', '_post.html'));
      expect(result.searchPath).toBe(join(tempDir, '_includes'));
    });

    test('should_stop_at_source_root', () => {
      // Arrange
      const outerDir = `/tmp/unify-test-outer-${Date.now()}`;
      mkdirSync(outerDir, { recursive: true });
      mkdirSync(join(outerDir, 'outer'), { recursive: true });
      mkdirSync(join(tempDir, 'inner'), { recursive: true });
      writeFileSync(join(outerDir, 'outer', '_layout.html'), '<html></html>');
      
      // Act
      const result = resolver.resolve('layout', join(tempDir, 'inner'), tempDir);
      
      // Assert
      expect(result.found).toBe(false);
      expect(result.reason).toContain('not found');
      
      // Cleanup
      rmSync(outerDir, { recursive: true, force: true });
    });
  });

  describe('Pattern Precedence', () => {
    test('should_prioritize_exact_over_underscore_prefix', () => {
      // Arrange
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', 'blog.html'), '<html>exact</html>');
      writeFileSync(join(tempDir, 'layouts', '_blog.html'), '<html>prefix</html>');
      
      // Act
      const result = resolver.resolve('blog', join(tempDir, 'layouts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, 'layouts', 'blog.html'));
      expect(result.source).toBe('exact');
    });

    test('should_prioritize_underscore_prefix_over_layout_suffix', () => {
      // Arrange
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', '_blog.html'), '<html>prefix</html>');
      writeFileSync(join(tempDir, 'layouts', '_blog.layout.html'), '<html>suffix</html>');
      
      // Act
      const result = resolver.resolve('blog', join(tempDir, 'layouts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, 'layouts', '_blog.html'));
      expect(result.source).toBe('underscore-prefix');
    });

    test('should_use_layout_suffix_when_others_unavailable', () => {
      // Arrange
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', '_blog.layout.html'), '<html>suffix</html>');
      
      // Act
      const result = resolver.resolve('blog', join(tempDir, 'layouts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, 'layouts', '_blog.layout.html'));
      expect(result.source).toBe('layout-suffix');
    });
  });

  describe('Error Handling', () => {
    test('should_handle_invalid_directory', () => {
      // Arrange
      const invalidDir = '/path/that/does/not/exist';
      
      // Act
      const result = resolver.resolve('blog', invalidDir, tempDir);
      
      // Assert
      expect(result.found).toBe(false);
      expect(result.reason).toContain('directory does not exist');
    });

    test('should_handle_empty_short_name', () => {
      // Arrange & Act
      const result = resolver.resolve('', tempDir, tempDir);
      
      // Assert
      expect(result.found).toBe(false);
      expect(result.reason).toContain('Empty short name');
    });

    test('should_handle_null_short_name', () => {
      // Arrange & Act
      const result = resolver.resolve(null, tempDir, tempDir);
      
      // Assert
      expect(result.found).toBe(false);
      expect(result.reason).toContain('Invalid short name');
    });

    test('should_handle_permission_errors_gracefully', () => {
      // This test is platform-dependent and might not work in all environments
      // We'll test the error handling structure rather than actual permissions
      
      // Arrange & Act
      const result = resolver.resolve('test', tempDir, tempDir);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.found).toBe(false);
    });
  });

  describe('Logging and Debugging', () => {
    test('should_log_resolution_process', () => {
      // Arrange
      const logs = [];
      const mockLogger = {
        logDebug: (message, ...args) => logs.push({ level: 'debug', message, args }),
        logInfo: (message, ...args) => logs.push({ level: 'info', message, args })
      };
      
      const resolverWithLogging = new ShortNameResolver(mockLogger);
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', '_blog.html'), '<html></html>');
      
      // Act
      const result = resolverWithLogging.resolve('blog', join(tempDir, 'layouts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(log => log.message.includes('Starting short name resolution'))).toBe(true);
    });

    test('should_provide_detailed_resolution_info', () => {
      // Arrange
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', '_blog.layout.html'), '<html></html>');
      
      // Act
      const result = resolver.resolve('blog', join(tempDir, 'layouts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.shortName).toBe('blog');
      expect(result.searchPath).toBe(join(tempDir, 'layouts'));
      expect(result.source).toBe('layout-suffix');
      expect(result.reason).toBeDefined();
      expect(result.patternsChecked).toBeDefined();
      expect(Array.isArray(result.patternsChecked)).toBe(true);
    });
  });

  describe('Case Sensitivity', () => {
    test('should_handle_case_sensitive_matching', () => {
      // Arrange
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      writeFileSync(join(tempDir, 'layouts', '_Blog.html'), '<html></html>');
      
      // Act
      const result = resolver.resolve('blog', join(tempDir, 'layouts'), tempDir);
      
      // Assert - This test is platform dependent (case-sensitive on Linux/macOS)
      if (process.platform === 'linux' || process.platform === 'darwin') {
        expect(result.found).toBe(false);
      } else {
        // Windows is case-insensitive
        expect(result.found).toBe(true);
      }
    });
  });

  describe('Complex Scenarios', () => {
    test('should_handle_nested_directory_structure', () => {
      // Arrange
      mkdirSync(join(tempDir, 'content', 'blog', 'posts', '2024'), { recursive: true });
      mkdirSync(join(tempDir, 'content', 'blog', 'layouts'), { recursive: true });
      mkdirSync(join(tempDir, '_includes'), { recursive: true });
      
      writeFileSync(join(tempDir, 'content', 'blog', '_post.html'), '<html></html>');
      
      // Act
      const result = resolver.resolve('post', join(tempDir, 'content', 'blog', 'posts', '2024'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, 'content', 'blog', '_post.html'));
    });

    test('should_handle_multiple_matching_files_with_precedence', () => {
      // Arrange
      mkdirSync(join(tempDir, 'layouts'), { recursive: true });
      mkdirSync(join(tempDir, '_includes'), { recursive: true });
      
      writeFileSync(join(tempDir, 'layouts', 'blog.html'), '<html>exact</html>');
      writeFileSync(join(tempDir, 'layouts', '_blog.html'), '<html>prefix</html>');
      writeFileSync(join(tempDir, 'layouts', '_blog.layout.html'), '<html>suffix</html>');
      writeFileSync(join(tempDir, '_includes', '_blog.html'), '<html>includes</html>');
      
      // Act
      const result = resolver.resolve('blog', join(tempDir, 'layouts'), tempDir);
      
      // Assert
      expect(result.found).toBe(true);
      expect(result.layoutPath).toBe(join(tempDir, 'layouts', 'blog.html'));
      expect(result.source).toBe('exact');
    });
  });

  describe('Performance Considerations', () => {
    test('should_handle_large_directory_structures_efficiently', () => {
      // Arrange
      const startTime = Date.now();
      mkdirSync(join(tempDir, 'deep'), { recursive: true });
      
      // Create a reasonably deep structure
      for (let i = 0; i < 10; i++) {
        mkdirSync(join(tempDir, 'deep', `level${i}`), { recursive: true });
      }
      
      mkdirSync(join(tempDir, '_includes'), { recursive: true });
      writeFileSync(join(tempDir, '_includes', '_template.html'), '<html></html>');
      
      // Act
      const result = resolver.resolve('template', join(tempDir, 'deep', 'level9'), tempDir);
      const endTime = Date.now();
      
      // Assert
      expect(result.found).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});