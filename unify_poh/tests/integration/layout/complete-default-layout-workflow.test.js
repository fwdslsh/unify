/**
 * Integration Tests for Complete Default Layout Workflow
 * Tests US-019: Default Layout Assignment with Glob Patterns - End-to-End
 * 
 * Tests the complete workflow from CLI parsing through layout resolution
 * to final HTML processing with default layout assignment.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ArgsParser } from '../../../src/cli/args-parser.js';
import { LayoutResolver } from '../../../src/core/layout-resolver.js';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';
import { LayoutLogger } from '../../../src/utils/layout-logger.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Complete Default Layout Workflow Integration', () => {
  let tempDir;
  let sourceDir;
  let argsParser;
  let layoutResolver;
  let htmlProcessor;
  let pathValidator;
  let logger;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-${Date.now()}`;
    sourceDir = join(tempDir, 'src');
    mkdirSync(sourceDir, { recursive: true });
    
    argsParser = new ArgsParser();
    pathValidator = new PathValidator();
    logger = new LayoutLogger({ enabled: false }); // Disable logging for tests
    layoutResolver = new LayoutResolver(pathValidator, logger);
    htmlProcessor = new HtmlProcessor(pathValidator);
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('CLI to Layout Resolution Integration', () => {
    test('should_parse_cli_and_configure_layout_resolver', () => {
      // Arrange
      const cliArgs = [
        'build',
        '--default-layout', '_base.html',
        '--default-layout', 'blog/**=_post.html',
        '--default-layout', 'docs/**=_docs.html'
      ];
      
      // Act
      const parsed = argsParser.parse(cliArgs);
      const validation = argsParser.validate(parsed);
      
      // Configure layout resolver from CLI
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      // Assert
      expect(validation.isValid).toBe(true);
      expect(parsed.defaultLayout).toEqual([
        '_base.html',
        'blog/**=_post.html', 
        'docs/**=_docs.html'
      ]);
      
      const debugInfo = layoutResolver.getDebugInfo('test.html');
      expect(debugInfo.hasDefaultLayoutResolver).toBe(true);
      expect(debugInfo.defaultLayoutRules).toHaveLength(3);
    });

    test('should_handle_invalid_cli_patterns_gracefully', () => {
      // Arrange
      const cliArgs = [
        'build',
        '--default-layout', 'blog\\\\**=_post.html' // Invalid backslashes
      ];
      
      // Act
      const parsed = argsParser.parse(cliArgs);
      const validation = argsParser.validate(parsed);
      
      // Assert
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Use forward slashes in glob patterns for cross-platform compatibility');
    });
  });

  describe('Complete Layout Resolution Workflow', () => {
    test('should_resolve_layouts_based_on_cli_patterns', () => {
      // Arrange
      const cliArgs = [
        'build', 
        '--default-layout', '_global.html',
        '--default-layout', 'blog/**=_post.html',
        '--default-layout', 'blog/featured/**=_featured.html'
      ];
      
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      // Test files
      const testFiles = [
        { path: 'src/index.html', content: '<html><body>Home</body></html>' },
        { path: 'src/blog/post.html', content: '<html><body>Blog post</body></html>' },
        { path: 'src/blog/featured/special.html', content: '<html><body>Featured</body></html>' },
        { path: 'src/about.html', content: '<html><body>About</body></html>' }
      ];
      
      // Act & Assert
      const results = testFiles.map(file => {
        return layoutResolver.resolveLayout(file.path, file.content, sourceDir);
      });
      
      // Verify resolution results
      expect(results[0].source).toBe('default-filename'); // index.html → _global.html
      expect(results[0].defaultLayoutMatch.layout).toBe('_global.html');
      
      expect(results[1].source).toBe('default-pattern'); // blog/post.html → _post.html
      expect(results[1].defaultLayoutMatch.layout).toBe('_post.html');
      expect(results[1].defaultLayoutMatch.pattern).toBe('blog/**');
      
      expect(results[2].source).toBe('default-pattern'); // blog/featured/special.html → _featured.html (last wins)
      expect(results[2].defaultLayoutMatch.layout).toBe('_featured.html');
      expect(results[2].defaultLayoutMatch.pattern).toBe('blog/featured/**');
      
      expect(results[3].source).toBe('default-filename'); // about.html → _global.html
      expect(results[3].defaultLayoutMatch.layout).toBe('_global.html');
    });

    test('should_respect_explicit_layouts_over_defaults', () => {
      // Arrange
      const cliArgs = ['build', '--default-layout', 'blog/**=_post.html'];
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      const explicitContent = '<html data-unify="_explicit.html"><body>Content</body></html>';
      const defaultContent = '<html><body>Content</body></html>';
      
      // Act
      const explicitResult = layoutResolver.resolveLayout('src/blog/post.html', explicitContent, sourceDir);
      const defaultResult = layoutResolver.resolveLayout('src/blog/post.html', defaultContent, sourceDir);
      
      // Assert
      expect(explicitResult.source).toBe('explicit');
      expect(explicitResult.explicitLayout).toBe('_explicit.html');
      
      expect(defaultResult.source).toBe('default-pattern');
      expect(defaultResult.defaultLayoutMatch.layout).toBe('_post.html');
    });

    test('should_fall_back_to_discovery_when_no_defaults_match', () => {
      // Arrange
      const cliArgs = ['build', '--default-layout', 'blog/**=_post.html'];
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      // Create discovered layout
      const layoutDir = join(sourceDir, 'docs');
      mkdirSync(layoutDir, { recursive: true });
      writeFileSync(join(layoutDir, '_layout.html'), '<html><body>Docs Layout</body></html>');
      
      const content = '<html><body>Documentation</body></html>';
      
      // Act
      const result = layoutResolver.resolveLayout(
        join(layoutDir, 'guide.html'), 
        content, 
        sourceDir
      );
      
      // Assert
      expect(result.source).toBe('discovery');
      expect(result.discoveredLayout).toBe('docs/_layout.html');
    });

    test('should_handle_no_layout_found_gracefully', () => {
      // Arrange
      const cliArgs = ['build', '--default-layout', 'blog/**=_post.html'];
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      const content = '<html><body>Standalone content</body></html>';
      
      // Act
      const result = layoutResolver.resolveLayout('src/standalone.html', content, sourceDir);
      
      // Assert
      expect(result.source).toBe('none');
      expect(result.precedenceApplied).toBe('none');
      expect(result.layoutPath).toBeNull();
    });
  });

  describe('Complex Pattern Scenarios', () => {
    test('should_handle_overlapping_patterns_with_last_wins', () => {
      // Arrange
      const cliArgs = [
        'build',
        '--default-layout', '_global.html',
        '--default-layout', 'content/**=_content.html',
        '--default-layout', 'content/blog/**=_blog.html',
        '--default-layout', 'content/blog/featured/**=_featured.html',
        '--default-layout', 'content/blog/featured/special/**=_special.html'
      ];
      
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      const testPaths = [
        'src/about.html',                                    // → _global.html (filename)
        'src/content/page.html',                            // → _content.html
        'src/content/blog/post.html',                       // → _blog.html  
        'src/content/blog/featured/story.html',             // → _featured.html
        'src/content/blog/featured/special/epic.html'       // → _special.html
      ];
      
      // Act
      const results = testPaths.map(path => {
        return layoutResolver.resolveLayout(path, '<html><body>Content</body></html>', sourceDir);
      });
      
      // Assert
      expect(results[0].defaultLayoutMatch.layout).toBe('_global.html');
      expect(results[1].defaultLayoutMatch.layout).toBe('_content.html');
      expect(results[2].defaultLayoutMatch.layout).toBe('_blog.html');
      expect(results[3].defaultLayoutMatch.layout).toBe('_featured.html');
      expect(results[4].defaultLayoutMatch.layout).toBe('_special.html');
    });

    test('should_handle_complex_glob_patterns', () => {
      // Arrange
      const cliArgs = [
        'build',
        '--default-layout', 'blog/**/post-*.html=_special-post.html',
        '--default-layout', 'api/v*/**/*.json=_api.html',
        '--default-layout', '*.{md,txt}=_text.html'
      ];
      
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      const testCases = [
        { path: 'src/blog/2024/post-123.html', expected: '_special-post.html' },
        { path: 'src/blog/featured/post-awesome.html', expected: '_special-post.html' },
        { path: 'src/api/v1/users/list.json', expected: '_api.html' },
        { path: 'src/api/v2/posts/123.json', expected: '_api.html' },
        { path: 'src/README.md', expected: '_text.html' },
        { path: 'src/notes.txt', expected: '_text.html' }
      ];
      
      // Act & Assert
      for (const testCase of testCases) {
        const result = layoutResolver.resolveLayout(
          testCase.path, 
          '<html><body>Content</body></html>', 
          sourceDir
        );
        
        expect(result.defaultLayoutMatch?.layout).toBe(testCase.expected);
        expect(result.source).toBe('default-pattern');
      }
    });

    test('should_provide_comprehensive_resolution_chain_logging', () => {
      // Arrange
      const debugLogger = new LayoutLogger({ enabled: true, logLevel: 3, colors: false });
      const debugResolver = new LayoutResolver(pathValidator, debugLogger);
      
      const cliArgs = [
        'build',
        '--default-layout', '_base.html',
        '--default-layout', 'blog/**=_post.html'
      ];
      
      const parsed = argsParser.parse(cliArgs);
      debugResolver.setDefaultLayouts(parsed.defaultLayout);
      
      // Capture console output
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args[0]);
      
      try {
        // Act - Configure resolver (this logs the rules)
        debugResolver.setDefaultLayouts(parsed.defaultLayout);
        
        const result = debugResolver.resolveLayout(
          'src/blog/featured/post.html',
          '<html><body>Blog post</body></html>',
          sourceDir
        );
        
        // Assert
        expect(result.resolutionChain).toHaveLength(3);
        expect(result.resolutionChain[0].type).toBe('explicit');
        expect(result.resolutionChain[0].applied).toBe(false);
        expect(result.resolutionChain[1].type).toBe('default-layout');
        expect(result.resolutionChain[1].applied).toBe(true);
        expect(result.resolutionChain[1].subType).toBe('pattern');
        expect(result.resolutionChain[2].type).toBe('discovery');
        expect(result.resolutionChain[2].applied).toBe(false);
        
        // Check that logging occurred
        const logText = logs.join(' ');
        expect(logText).toContain('Layout resolution for');
        expect(logText).toContain('Default layout rules configured');
        
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should_handle_malformed_html_gracefully', () => {
      // Arrange
      const cliArgs = ['build', '--default-layout', '_base.html'];
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      const malformedContent = '<html><body><unclosed-tag><p>Content</html>';
      
      // Act
      const result = layoutResolver.resolveLayout('src/test.html', malformedContent, sourceDir);
      
      // Assert
      expect(result.source).toBe('default-filename');
      expect(result.defaultLayoutMatch.layout).toBe('_base.html');
      expect(result.error).toBeUndefined();
    });

    test('should_handle_empty_content_appropriately', () => {
      // Arrange
      const cliArgs = ['build', '--default-layout', '_base.html'];
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      // Act
      const result1 = layoutResolver.resolveLayout('src/test.html', '', sourceDir);
      const result2 = layoutResolver.resolveLayout('src/test.html', null, sourceDir);
      
      // Assert
      expect(result1.explicitLayout).toBeNull();
      expect(result1.defaultLayoutMatch.layout).toBe('_base.html');
      expect(result2.explicitLayout).toBeNull();
      expect(result2.defaultLayoutMatch.layout).toBe('_base.html');
    });

    test('should_validate_layout_file_existence', () => {
      // Arrange
      const cliArgs = ['build', '--default-layout', '_base.html'];
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      // Create layout file
      writeFileSync(join(sourceDir, '_base.html'), '<html><body>Base Layout</body></html>');
      
      // Act
      const existsResult = layoutResolver.validateLayoutExists('_base.html', sourceDir);
      const missingResult = layoutResolver.validateLayoutExists('_missing.html', sourceDir);
      
      // Assert
      expect(existsResult).toBe(true);
      expect(missingResult).toBe(false);
    });

    test('should_track_resolution_statistics', () => {
      // Arrange
      const cliArgs = [
        'build',
        '--default-layout', '_base.html',
        '--default-layout', 'blog/**=_post.html'
      ];
      
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      // Act - Process various file types
      layoutResolver.resolveLayout('src/index.html', '<html data-unify="_explicit.html"><body>Home</body></html>', sourceDir);
      layoutResolver.resolveLayout('src/blog/post.html', '<html><body>Blog</body></html>', sourceDir);
      layoutResolver.resolveLayout('src/about.html', '<html><body>About</body></html>', sourceDir);
      layoutResolver.resolveLayout('src/contact.html', '<html><body>Contact</body></html>', sourceDir);
      
      // Assert
      const stats = layoutResolver.getStats();
      expect(stats.explicitLayouts).toBe(1);
      expect(stats.defaultPatternMatches).toBe(1);
      expect(stats.defaultFilenameMatches).toBe(2);
      expect(stats.noLayoutFiles).toBe(0);
    });
  });

  describe('Performance and Caching', () => {
    test('should_cache_discovery_results_for_performance', () => {
      // Arrange
      const cliArgs = ['build'];
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      // Create layout for discovery
      writeFileSync(join(sourceDir, '_layout.html'), '<html><body>Layout</body></html>');
      
      // Act - Resolve same file multiple times
      const filePath = join(sourceDir, 'test.html');
      const content = '<html><body>Content</body></html>';
      
      layoutResolver.resolveLayout(filePath, content, sourceDir);
      layoutResolver.resolveLayout(filePath, content, sourceDir);
      layoutResolver.resolveLayout(filePath, content, sourceDir);
      
      // Assert
      const stats = layoutResolver.getStats();
      expect(stats.cacheHits).toBe(2); // First is miss, next two are hits
      expect(stats.cacheMisses).toBe(1);
    });

    test('should_handle_large_number_of_patterns_efficiently', () => {
      // Arrange - Create many patterns
      const cliArgs = ['build'];
      for (let i = 0; i < 100; i++) {
        cliArgs.push('--default-layout', `category${i}/**=_layout${i}.html`);
      }
      cliArgs.push('--default-layout', 'test/**=_test.html');
      
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      // Act
      const startTime = Date.now();
      const result = layoutResolver.resolveLayout('src/test/file.html', '<html><body>Test</body></html>', sourceDir);
      const endTime = Date.now();
      
      // Assert
      expect(result.defaultLayoutMatch.layout).toBe('_test.html');
      expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });
  });

  describe('Integration with Existing Systems', () => {
    test('should_provide_layout_paths_compatible_with_html_processor', () => {
      // Arrange
      const cliArgs = ['build', '--default-layout', 'blog/**=_post.html'];
      const parsed = argsParser.parse(cliArgs);
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      // Create layout file for HtmlProcessor
      writeFileSync(join(sourceDir, '_post.html'), `
        <html>
        <head><title>Post Layout</title></head>
        <body>
          <header class="unify-header">Blog Header</header>
          <main class="unify-content">Default content</main>
        </body>
        </html>
      `);
      
      const pageContent = `
        <html>
        <head><title>My Post</title></head>
        <body>
          <section class="unify-header">
            <h1>My Blog Post</h1>
          </section>
          <article class="unify-content">
            <p>This is my blog post content.</p>
          </article>
        </body>
        </html>
      `;
      
      // Act
      const resolution = layoutResolver.resolveLayout('src/blog/post.html', pageContent, sourceDir);
      
      // Create mock file system for HtmlProcessor
      const mockFileSystem = {};
      mockFileSystem[resolution.layoutPath] = Bun.file(join(sourceDir, '_post.html')).text();
      
      // Process with HtmlProcessor would work with the resolved layout path
      expect(resolution.layoutPath).toBe(join(sourceDir, '_post.html'));
      expect(typeof resolution.layoutPath).toBe('string');
    });

    test('should_support_chaining_with_build_command_workflow', () => {
      // Arrange - Simulate build command workflow
      const cliArgs = [
        'build',
        '--source', sourceDir,
        '--output', join(tempDir, 'dist'),
        '--default-layout', '_base.html',
        '--default-layout', 'blog/**=_post.html'
      ];
      
      // Act - Parse CLI like BuildCommand would
      const parsed = argsParser.parse(cliArgs);
      const validation = argsParser.validate(parsed);
      
      // Configure LayoutResolver like BuildCommand would
      layoutResolver.setDefaultLayouts(parsed.defaultLayout);
      
      // Simulate file processing
      const testFile = 'src/blog/post.html';
      const testContent = '<html><body>Blog post content</body></html>';
      const resolution = layoutResolver.resolveLayout(testFile, testContent, parsed.source);
      
      // Assert
      expect(validation.isValid).toBe(true);
      expect(resolution.source).toBe('default-pattern');
      expect(resolution.defaultLayoutMatch.layout).toBe('_post.html');
      expect(resolution.defaultLayoutMatch.pattern).toBe('blog/**');
    });
  });
});