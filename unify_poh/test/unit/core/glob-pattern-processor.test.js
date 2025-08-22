/**
 * Unit Tests for GlobPatternProcessor
 * Tests US-016: Glob Pattern Processing for Copy/Ignore Rules
 * 
 * Tests the core functionality of glob pattern processing with precedence rules
 * following the three-tier system: Tier 1 > Tier 2 > Tier 3
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { GlobPatternProcessor } from '../../../src/core/glob-pattern-processor.js';

describe('GlobPatternProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new GlobPatternProcessor();
  });

  describe('Basic Pattern Matching', () => {
    test('should_match_simple_file_patterns', () => {
      // Arrange
      processor.addCopyPattern('*.html');
      processor.addCopyPattern('*.md');

      // Act & Assert
      expect(processor.matchesPattern('index.html', 'copy')).toBe(true);
      expect(processor.matchesPattern('about.md', 'copy')).toBe(true);
      expect(processor.matchesPattern('script.js', 'copy')).toBe(false);
    });

    test('should_match_directory_patterns', () => {
      // Arrange
      processor.addCopyPattern('assets/**');
      processor.addCopyPattern('docs/*');

      // Act & Assert
      expect(processor.matchesPattern('assets/css/style.css', 'copy')).toBe(true);
      expect(processor.matchesPattern('docs/guide.html', 'copy')).toBe(true);
      expect(processor.matchesPattern('src/index.html', 'copy')).toBe(false);
    });

    test('should_handle_negation_patterns', () => {
      // Arrange
      processor.addCopyPattern('assets/**');
      processor.addCopyPattern('!assets/temp/**');

      // Act & Assert
      expect(processor.matchesPattern('assets/css/style.css', 'copy')).toBe(true);
      expect(processor.matchesPattern('assets/temp/cache.dat', 'copy')).toBe(false);
    });
  });

  describe('Cross-Platform Path Handling', () => {
    test('should_normalize_paths_to_posix', () => {
      // Arrange
      const windowsPath = 'assets\\css\\style.css';

      // Act
      const normalizedPath = processor._normalizePath(windowsPath);

      // Assert
      expect(normalizedPath).toBe('assets/css/style.css');
    });

    test('should_handle_relative_path_patterns', () => {
      // Arrange
      processor.addCopyPattern('./assets/**');
      processor.addCopyPattern('../shared/**');

      // Act & Assert
      expect(processor.matchesPattern('assets/style.css', 'copy')).toBe(true);
      expect(processor.matchesPattern('shared/component.html', 'copy')).toBe(true);
    });
  });

  describe('Three-Tier Precedence System', () => {
    describe('Tier 1: Explicit Overrides (Highest Priority)', () => {
      test('should_prioritize_render_over_ignore', () => {
        // Arrange
        processor.addIgnorePattern('blog/**');  // Tier 2
        processor.addRenderPattern('blog/featured/**');  // Tier 1

        // Act
        const result = processor.classifyFile('blog/featured/post.md');

        // Assert
        expect(result.action).toBe('EMIT');
        expect(result.reason).toContain('--render');
        expect(result.tier).toBe(1);
      });

      test('should_respect_auto_ignore_false_override', () => {
        // Arrange
        processor.setAutoIgnore(false);  // Tier 1 override
        processor.addGitignorePattern('temp/**');  // Would normally be Tier 2

        // Act
        const result = processor.classifyFile('temp/file.html');

        // Assert
        expect(result.action).not.toBe('IGNORED');
        expect(result.reason).toContain('auto-ignore=false');
      });
    });

    describe('Tier 2: Ignore Rules (Medium Priority)', () => {
      test('should_apply_ignore_to_both_render_and_copy', () => {
        // Arrange
        processor.addIgnorePattern('drafts/**');

        // Act
        const htmlResult = processor.classifyFile('drafts/post.html');
        const assetResult = processor.classifyFile('drafts/image.png');

        // Assert
        expect(htmlResult.action).toBe('IGNORED');
        expect(assetResult.action).toBe('IGNORED');
        expect(htmlResult.tier).toBe(2);
      });

      test('should_apply_ignore_render_only_to_rendering', () => {
        // Arrange
        processor.addIgnoreRenderPattern('raw/**');
        processor.addCopyPattern('raw/**/*.json');  // Still allow copying

        // Act
        const result = processor.classifyFile('raw/data.json');

        // Assert
        expect(result.action).toBe('COPY');  // Should be copied, not rendered
        expect(result.reason).toContain('copy pattern');
      });

      test('should_apply_ignore_copy_only_to_copying', () => {
        // Arrange
        processor.addIgnoreCopyPattern('src/**/*.psd');

        // Act
        const result = processor.classifyFile('src/design.psd');

        // Assert
        expect(result.action).toBe('IGNORED');  // Ignored from copying
        expect(result.reason).toContain('ignore-copy');
      });
    });

    describe('Tier 3: Default Behavior (Lowest Priority)', () => {
      test('should_emit_renderables_by_default', () => {
        // Arrange - no specific rules

        // Act
        const htmlResult = processor.classifyFile('index.html');
        const mdResult = processor.classifyFile('about.md');

        // Assert
        expect(htmlResult.action).toBe('EMIT');
        expect(mdResult.action).toBe('EMIT');
        expect(htmlResult.tier).toBe(3);
        expect(htmlResult.reason).toContain('renderable');
      });

      test('should_copy_assets_by_default', () => {
        // Arrange - implicit assets/** pattern
        processor._addImplicitAssetsCopy();

        // Act
        const result = processor.classifyFile('assets/style.css');

        // Assert
        expect(result.action).toBe('COPY');
        expect(result.tier).toBe(3);
        expect(result.reason).toContain('assets/**');
      });

      test('should_skip_unknown_files_by_default', () => {
        // Arrange - no specific rules

        // Act
        const result = processor.classifyFile('unknown.xyz');

        // Assert
        expect(result.action).toBe('SKIP');
        expect(result.tier).toBe(3);
        expect(result.reason).toContain('non-renderable');
      });
    });
  });

  describe('Last Pattern Wins (Ripgrep-style)', () => {
    test('should_apply_last_pattern_in_same_tier', () => {
      // Arrange
      processor.addIgnorePattern('blog/**');
      processor.addIgnorePattern('!blog/featured/**');  // Later pattern

      // Act
      const result = processor.classifyFile('blog/featured/post.md');

      // Assert
      expect(result.action).toBe('EMIT'); // Not ignored, so goes to default behavior
      expect(result.reason).toContain('renderable file');
    });

    test('should_override_earlier_copy_patterns', () => {
      // Arrange
      processor.addCopyPattern('assets/**');
      processor.addCopyPattern('!assets/temp/**');  // Later negation

      // Act
      const result = processor.classifyFile('assets/temp/file.jpg');

      // Assert
      expect(result.action).toBe('SKIP'); // Not copied due to negation
      expect(result.reason).toContain('excluded by negation');
    });

    test('should_enforce_tier_precedence_over_order', () => {
      // Arrange - Order: Tier 2 first, then Tier 1
      processor.addIgnorePattern('experiments/**');  // Tier 2
      processor.addRenderPattern('experiments/public/**');  // Tier 1

      // Act
      const result = processor.classifyFile('experiments/public/demo.html');

      // Assert
      expect(result.action).toBe('EMIT');
      expect(result.tier).toBe(1);
      expect(result.reason).toContain('--render');
    });
  });

  describe('Auto-Ignore Functionality', () => {
    test('should_auto_ignore_layout_files_by_default', () => {
      // Arrange
      processor.addAutoIgnoredFile('_base.html', 'layout');

      // Act
      const result = processor.classifyFile('_base.html');

      // Assert
      expect(result.action).toBe('IGNORED');
      expect(result.reason).toContain('auto-ignored (layout)');
    });

    test('should_auto_ignore_include_files_by_default', () => {
      // Arrange
      processor.addAutoIgnoredFile('_header.html', 'include');

      // Act
      const result = processor.classifyFile('_header.html');

      // Assert
      expect(result.action).toBe('IGNORED');
      expect(result.reason).toContain('auto-ignored (include)');
    });

    test('should_allow_override_of_auto_ignore', () => {
      // Arrange
      processor.setAutoIgnore(false);
      processor.addAutoIgnoredFile('_base.html', 'layout');

      // Act
      const result = processor.classifyFile('_base.html');

      // Assert
      expect(result.action).not.toBe('IGNORED');
      expect(result.reason).toContain('auto-ignore=false');
    });
  });

  describe('Error Handling and Validation', () => {
    test('should_error_on_invalid_glob_syntax', () => {
      // Arrange & Act & Assert
      expect(() => {
        processor.addCopyPattern('');
      }).toThrow('Empty pattern not allowed');
    });

    test('should_warn_on_performance_problematic_patterns', () => {
      // Arrange
      const warnings = [];
      processor.onWarning = (warning) => warnings.push(warning);

      // Act
      processor.addCopyPattern('**/*');

      // Assert
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('performance impact');
    });

    test('should_warn_on_conflicting_rules', () => {
      // Arrange
      const warnings = [];
      processor.onWarning = (warning) => warnings.push(warning);

      // Act
      processor.addCopyPattern('src/**');
      processor.addIgnoreCopyPattern('src/**');

      // Assert
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Conflicting patterns');
    });

    test('should_handle_empty_patterns_gracefully', () => {
      // Arrange & Act & Assert
      expect(() => {
        processor.addCopyPattern('');
      }).toThrow('Empty pattern not allowed');
    });
  });

  describe('File Classification Results', () => {
    test('should_provide_detailed_classification_reasons', () => {
      // Arrange
      processor.addRenderPattern('blog/**');

      // Act
      const result = processor.classifyFile('blog/post.md');

      // Assert
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('matchedPattern');
      expect(result.reason).toContain('blog/**');
      expect(result.matchedPattern).toBe('blog/**');
    });

    test('should_classify_render_vs_copy_priority', () => {
      // Arrange
      processor.addCopyPattern('src/**');
      processor.addRenderPattern('src/**/*.html');  // More specific

      // Act
      const result = processor.classifyFile('src/page.html');

      // Assert
      expect(result.action).toBe('EMIT');  // Render wins
      expect(result.reason).toContain('--render pattern');
    });
  });

  describe('Integration Support Methods', () => {
    test('should_support_bulk_pattern_addition', () => {
      // Arrange
      const patterns = {
        copy: ['assets/**', 'docs/*.pdf'],
        ignore: ['temp/**', '*.tmp'],
        render: ['experiments/**']
      };

      // Act
      processor.addPatterns(patterns);

      // Assert
      expect(processor.matchesPattern('assets/style.css', 'copy')).toBe(true);
      expect(processor.matchesPattern('temp/file.html', 'ignore')).toBe(true);
      expect(processor.classifyFile('experiments/test.html').action).toBe('EMIT');
    });

    test('should_provide_pattern_inspection_methods', () => {
      // Arrange
      processor.addCopyPattern('*.css');
      processor.addIgnorePattern('temp/**');

      // Act
      const copyPatterns = processor.getCopyPatterns();
      const ignorePatterns = processor.getIgnorePatterns();

      // Assert
      expect(copyPatterns).toContain('*.css');
      expect(ignorePatterns).toContain('temp/**');
    });

    test('should_support_pattern_clearing', () => {
      // Arrange
      processor.addCopyPattern('*.css');
      processor.addIgnorePattern('temp/**');

      // Act
      processor.clearPatterns();

      // Assert
      expect(processor.getCopyPatterns()).toHaveLength(0);
      expect(processor.getIgnorePatterns()).toHaveLength(0);
    });
  });
});