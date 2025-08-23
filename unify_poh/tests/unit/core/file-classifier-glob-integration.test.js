/**
 * Integration Tests for FileClassifier with GlobPatternProcessor
 * Tests the integration between existing FileClassifier and new glob pattern processing
 * 
 * Ensures that both systems work together harmoniously while maintaining backward compatibility
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { FileClassifier } from '../../../src/core/file-classifier.js';

describe('FileClassifier with GlobPatternProcessor Integration', () => {
  let classifier;

  beforeEach(() => {
    classifier = new FileClassifier();
  });

  describe('Enhanced Classification with Glob Patterns', () => {
    test('should_maintain_backward_compatibility_for_basic_classification', () => {
      // Act - Test existing functionality still works
      const htmlResult = classifier.classifyFile('index.html');
      const mdResult = classifier.classifyFile('about.md');
      const cssResult = classifier.classifyFile('style.css');
      const fragmentResult = classifier.classifyFile('_layout.html');

      // Assert - Existing behavior preserved
      expect(htmlResult.shouldEmit).toBe(true);
      expect(mdResult.shouldEmit).toBe(true);
      expect(cssResult.shouldCopy).toBe(true);
      expect(fragmentResult.shouldEmit).toBe(false);
    });

    test('should_integrate_glob_pattern_processor_when_configured', () => {
      // Arrange
      const globOptions = {
        copy: ['docs/**/*.pdf'],
        ignore: ['temp/**'],
        render: ['experiments/**']
      };
      
      classifier.configureGlobPatterns(globOptions);

      // Act
      const pdfResult = classifier.classifyFile('docs/guide.pdf');
      const tempResult = classifier.classifyFile('temp/cache.html');
      const expResult = classifier.classifyFile('experiments/test.html');

      // Assert
      expect(pdfResult.action).toBe('COPY');
      expect(tempResult.action).toBe('IGNORED');
      expect(expResult.action).toBe('EMIT');
    });

    test('should_handle_conflicting_basic_and_glob_classifications', () => {
      // Arrange - HTML file that would normally emit but is in ignore pattern
      const globOptions = {
        ignore: ['drafts/**']
      };
      
      classifier.configureGlobPatterns(globOptions);

      // Act
      const result = classifier.classifyFile('drafts/post.html');

      // Assert
      expect(result.action).toBe('IGNORED'); // Glob rules win over basic classification
      expect(result.tier).toBe(2);
    });

    test('should_allow_render_override_of_fragment_classification', () => {
      // Arrange - Fragment that would normally not emit but is forced to render
      const globOptions = {
        render: ['_special/**']
      };
      
      classifier.configureGlobPatterns(globOptions);

      // Act
      const result = classifier.classifyFile('_special/component.html');

      // Assert
      expect(result.action).toBe('EMIT'); // Render override wins
      expect(result.tier).toBe(1);
    });

    test('should_provide_enhanced_classification_result_format', () => {
      // Arrange
      const globOptions = {
        copy: ['assets/**'],
        ignore: ['temp/**']
      };
      
      classifier.configureGlobPatterns(globOptions);

      // Act
      const result = classifier.classifyFile('assets/image.png');

      // Assert - Enhanced result format
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('matchedPattern');
      
      // Backward compatibility properties also present
      expect(result).toHaveProperty('shouldCopy');
      expect(result).toHaveProperty('shouldEmit');
      expect(result).toHaveProperty('type');
    });
  });

  describe('Processing Strategy Integration', () => {
    test('should_update_processing_strategy_based_on_glob_classification', () => {
      // Arrange
      const globOptions = {
        copy: ['data/**/*.json'],
        ignore: ['build/**']
      };
      
      classifier.configureGlobPatterns(globOptions);

      // Act
      const jsonResult = classifier.classifyFile('data/config.json');
      const buildResult = classifier.classifyFile('build/output.html');

      // Assert
      expect(jsonResult.processingStrategy).toBe('copy');
      expect(buildResult.processingStrategy).toBe('ignore');
    });

    test('should_maintain_existing_processing_strategies_when_no_glob_match', () => {
      // Arrange
      const globOptions = {
        copy: ['docs/**']
      };
      
      classifier.configureGlobPatterns(globOptions);

      // Act - Files not matching any glob patterns
      const htmlResult = classifier.classifyFile('pages/index.html');
      const mdResult = classifier.classifyFile('content/about.md');

      // Assert - Falls back to basic classification
      expect(htmlResult.processingStrategy).toBe('html');
      expect(mdResult.processingStrategy).toBe('markdown');
    });
  });

  describe('Auto-Ignore Integration', () => {
    test('should_auto_ignore_layout_files_by_default', () => {
      // Arrange
      const globOptions = { autoIgnore: true };
      classifier.configureGlobPatterns(globOptions);
      classifier.addAutoIgnoredLayout('_base.html');

      // Act
      const result = classifier.classifyFile('_base.html');

      // Assert
      expect(result.action).toBe('IGNORED');
      expect(result.reason).toContain('auto-ignored');
    });

    test('should_allow_auto_ignore_override', () => {
      // Arrange
      const globOptions = { autoIgnore: false };
      classifier.configureGlobPatterns(globOptions);

      // Act
      const result = classifier.classifyFile('_layout.html');

      // Assert
      expect(result.action).not.toBe('IGNORED'); // Should not be auto-ignored
    });
  });

  describe('GitIgnore Integration', () => {
    test('should_respect_gitignore_patterns_when_enabled', () => {
      // Arrange
      const globOptions = { autoIgnore: true };
      classifier.configureGlobPatterns(globOptions);
      classifier.loadGitignorePatterns(['node_modules/**', '*.log']);

      // Act
      const nodeModulesResult = classifier.classifyFile('node_modules/package/index.js');
      const logResult = classifier.classifyFile('app.log');

      // Assert
      expect(nodeModulesResult.action).toBe('IGNORED');
      expect(logResult.action).toBe('IGNORED');
    });

    test('should_ignore_gitignore_when_auto_ignore_disabled', () => {
      // Arrange
      const globOptions = { autoIgnore: false };
      classifier.configureGlobPatterns(globOptions);
      classifier.loadGitignorePatterns(['temp/**']);

      // Act
      const result = classifier.classifyFile('temp/cache.html');

      // Assert
      expect(result.action).toBe('EMIT'); // Not ignored despite gitignore
    });
  });

  describe('Error Handling and Validation', () => {
    test('should_handle_invalid_glob_patterns_gracefully', () => {
      // Arrange & Act & Assert
      expect(() => {
        classifier.configureGlobPatterns({
          copy: ['']  // Empty pattern
        });
      }).toThrow('Empty pattern not allowed');
    });

    test('should_provide_helpful_warnings_for_conflicting_patterns', () => {
      // Arrange
      const warnings = [];
      classifier.onWarning = (warning) => warnings.push(warning);

      // Act
      classifier.configureGlobPatterns({
        copy: ['assets/**'],
        ignoreCopy: ['assets/**']
      });

      // Assert
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings[0]).toContain('Conflicting patterns');
    });

    test('should_fallback_gracefully_when_glob_processor_fails', () => {
      // Arrange - Configure with valid patterns first
      classifier.configureGlobPatterns({
        copy: ['assets/**']
      });

      // Simulate internal error by corrupting the glob processor
      classifier._globProcessor = null;

      // Act - Should fallback to basic classification
      const result = classifier.classifyFile('index.html');

      // Assert
      expect(result.shouldEmit).toBe(true); // Basic classification still works
      expect(result.processingStrategy).toBe('html');
    });
  });

  describe('Performance Considerations', () => {
    test('should_not_impact_performance_for_basic_classification', () => {
      // Arrange
      const startTime = performance.now();
      
      // Act - Classify many files without glob patterns (should be fast)
      for (let i = 0; i < 1000; i++) {
        classifier.classifyFile(`file${i}.html`);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Assert - Should complete quickly (under 100ms for 1000 files)
      expect(duration).toBeLessThan(100);
    });

    test('should_efficiently_handle_complex_glob_patterns', () => {
      // Arrange
      const complexGlobOptions = {
        copy: ['assets/**/*.{png,jpg,gif}', 'docs/**/*.pdf'],
        ignore: ['**/temp/**', '**/cache/**', '**/*.tmp'],
        render: ['experiments/**/*.html'],
        ignoreCopy: ['assets/private/**']
      };
      
      classifier.configureGlobPatterns(complexGlobOptions);
      const startTime = performance.now();

      // Act - Classify files with complex patterns
      const testFiles = [
        'assets/images/photo.jpg',
        'docs/manual.pdf',
        'temp/cache/file.html',
        'experiments/new/feature.html',
        'assets/private/secret.png'
      ];

      const results = testFiles.map(file => classifier.classifyFile(file));
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Assert - Should complete reasonably quickly and produce correct results
      expect(duration).toBeLessThan(10);
      expect(results[0].action).toBe('COPY');      // assets image
      expect(results[1].action).toBe('COPY');      // docs PDF
      expect(results[2].action).toBe('IGNORED');   // temp file
      expect(results[3].action).toBe('EMIT');      // experiments HTML
      expect(results[4].action).toBe('IGNORED');   // private asset
    });
  });

  describe('Legacy Method Compatibility', () => {
    test('should_maintain_isPageFile_method_behavior', () => {
      // Arrange
      const globOptions = {
        ignore: ['drafts/**']
      };
      classifier.configureGlobPatterns(globOptions);

      // Act & Assert
      expect(classifier.isPageFile('index.html')).toBe(true);
      expect(classifier.isPageFile('about.md')).toBe(true);
      expect(classifier.isPageFile('drafts/post.html')).toBe(false); // Ignored by glob
      expect(classifier.isPageFile('style.css')).toBe(false);
    });

    test('should_maintain_isAssetFile_method_behavior', () => {
      // Arrange
      const globOptions = {
        ignoreCopy: ['assets/temp/**']
      };
      classifier.configureGlobPatterns(globOptions);

      // Act & Assert
      expect(classifier.isAssetFile('image.png')).toBe(true);
      expect(classifier.isAssetFile('style.css')).toBe(true);
      expect(classifier.isAssetFile('assets/temp/cache.png')).toBe(false); // Ignored by glob
      expect(classifier.isAssetFile('index.html')).toBe(false);
    });

    test('should_maintain_isFragmentFile_method_behavior', () => {
      // Arrange
      const globOptions = {
        render: ['_special/**'] // Force render some fragments
      };
      classifier.configureGlobPatterns(globOptions);

      // Act & Assert
      expect(classifier.isFragmentFile('_layout.html')).toBe(true);
      expect(classifier.isFragmentFile('_special/component.html')).toBe(false); // Forced to render
      expect(classifier.isFragmentFile('index.html')).toBe(false);
    });
  });
});