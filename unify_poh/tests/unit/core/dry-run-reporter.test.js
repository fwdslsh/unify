/**
 * Tests for DryRunReporter
 * Implements US-021: Dry Run Mode with File Classification
 * 
 * Tests the formatting and display of file classification information
 * during dry-run mode execution.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DryRunReporter } from '../../../src/core/dry-run-reporter.js';

describe('DryRunReporter', () => {
  let reporter;
  
  beforeEach(() => {
    reporter = new DryRunReporter();
  });

  describe('File Classification Reporting', () => {
    test('should_format_emit_classification_with_reason', () => {
      const classification = {
        action: 'EMIT',
        reason: 'renderable(html)',
        tier: 3
      };
      
      const layoutInfo = {
        layoutPath: '_layout.html',
        resolutionMethod: 'discovery'
      };
      
      const result = reporter.formatFileClassification(
        'src/index.html', 
        classification, 
        layoutInfo
      );
      
      expect(result).toContain('[EMIT]    src/index.html');
      expect(result).toContain('reason: renderable(html); layout=_layout.html (discovery)');
    });

    test('should_format_copy_classification_with_glob_match', () => {
      const classification = {
        action: 'COPY',
        reason: 'implicit assets/**',
        tier: 3,
        matchedPattern: 'assets/**'
      };
      
      const result = reporter.formatFileClassification(
        'src/assets/style.css', 
        classification
      );
      
      expect(result).toContain('[COPY]    src/assets/style.css');
      expect(result).toContain('reason: implicit assets/** (not ignored)');
    });

    test('should_format_skip_classification_with_file_extension', () => {
      const classification = {
        action: 'SKIP',
        reason: 'non-renderable(.db)',
        tier: 3
      };
      
      const result = reporter.formatFileClassification(
        'src/data.db', 
        classification
      );
      
      expect(result).toContain('[SKIP]    src/data.db');
      expect(result).toContain('reason: non-renderable(.db)');
    });

    test('should_format_ignored_classification_with_pattern_match', () => {
      const classification = {
        action: 'IGNORED',
        reason: 'matched --ignore',
        tier: 2,
        matchedPattern: '**/temp/**'
      };
      
      const result = reporter.formatFileClassification(
        'src/temp/cache.tmp', 
        classification
      );
      
      expect(result).toContain('[IGNORED] src/temp/cache.tmp');
      expect(result).toContain("reason: matched --ignore '**/temp/**'");
    });
  });

  describe('Layout Resolution Chain Display', () => {
    test('should_display_layout_resolution_chain_for_emit_files', () => {
      const classification = {
        action: 'EMIT',
        reason: 'renderable(md)',
        tier: 3
      };
      
      const layoutInfo = {
        layoutPath: 'blog/_post.html',
        resolutionMethod: '--default-layout blog/**=_post.html',
        resolutionChain: ['_layout.html', 'blog/_post.html']
      };
      
      const result = reporter.formatFileClassification(
        'src/blog/article.md', 
        classification, 
        layoutInfo
      );
      
      expect(result).toContain('[EMIT]    src/blog/article.md');
      expect(result).toContain('layout=blog/_post.html (--default-layout blog/**=_post.html)');
      expect(result).toContain('layout chain: _layout.html -> blog/_post.html');
    });

    test('should_handle_single_layout_without_chain', () => {
      const classification = {
        action: 'EMIT',
        reason: 'renderable(html)',
        tier: 3
      };
      
      const layoutInfo = {
        layoutPath: '_layout.html',
        resolutionMethod: 'discovery',
        resolutionChain: ['_layout.html']
      };
      
      const result = reporter.formatFileClassification(
        'src/about.html', 
        classification, 
        layoutInfo
      );
      
      expect(result).toContain('layout=_layout.html (discovery)');
      expect(result).not.toContain('layout chain:');
    });

    test('should_handle_no_layout_for_emit_files', () => {
      const classification = {
        action: 'EMIT',
        reason: 'renderable(html)',
        tier: 3
      };
      
      const layoutInfo = null; // No layout found
      
      const result = reporter.formatFileClassification(
        'src/standalone.html', 
        classification, 
        layoutInfo
      );
      
      expect(result).toContain('[EMIT]    src/standalone.html');
      expect(result).toContain('reason: renderable(html); no layout');
    });
  });

  describe('Glob Pattern Match Transparency', () => {
    test('should_show_copy_pattern_matches', () => {
      const classification = {
        action: 'COPY',
        reason: 'matched --copy',
        tier: 2,
        matchedPattern: 'docs/**/*.pdf'
      };
      
      const result = reporter.formatFileClassification(
        'src/docs/guide.pdf', 
        classification
      );
      
      expect(result).toContain('[COPY]    src/docs/guide.pdf');
      expect(result).toContain("reason: matched --copy 'docs/**/*.pdf'");
    });

    test('should_show_render_pattern_overrides', () => {
      const classification = {
        action: 'EMIT',
        reason: '--render override',
        tier: 1,
        matchedPattern: 'experiments/**'
      };
      
      const result = reporter.formatFileClassification(
        'src/experiments/test.html', 
        classification
      );
      
      expect(result).toContain('[EMIT]    src/experiments/test.html');
      expect(result).toContain("reason: --render 'experiments/**' overrides .gitignore");
    });

    test('should_show_ignore_pattern_matches', () => {
      const classification = {
        action: 'IGNORED',
        reason: 'matched --ignore-copy',
        tier: 2,
        matchedPattern: 'assets/raw/**'
      };
      
      const result = reporter.formatFileClassification(
        'src/assets/raw/image.png', 
        classification
      );
      
      expect(result).toContain('[IGNORED] src/assets/raw/image.png');
      expect(result).toContain("reason: matched --ignore-copy 'assets/raw/**'");
    });
  });

  describe('Default Layout Pattern Display', () => {
    test('should_show_glob_pattern_layout_matches', () => {
      const classification = {
        action: 'EMIT',
        reason: 'renderable(md)',
        tier: 3
      };
      
      const layoutInfo = {
        layoutPath: '_post.html',
        resolutionMethod: '--default-layout blog/**=_post.html (last wins)',
        appliedPatterns: ['_base.html', 'blog/**=_post.html']
      };
      
      const result = reporter.formatFileClassification(
        'src/blog/post.md', 
        classification, 
        layoutInfo
      );
      
      expect(result).toContain('layout=_post.html (--default-layout blog/**=_post.html (last wins))');
    });

    test('should_show_global_fallback_layout', () => {
      const classification = {
        action: 'EMIT',
        reason: 'renderable(html)',
        tier: 3
      };
      
      const layoutInfo = {
        layoutPath: '_base.html',
        resolutionMethod: 'global fallback _base.html'
      };
      
      const result = reporter.formatFileClassification(
        'src/contact.html', 
        classification, 
        layoutInfo
      );
      
      expect(result).toContain('layout=_base.html (global fallback _base.html)');
    });
  });

  describe('Summary Statistics', () => {
    test('should_format_classification_summary', () => {
      const stats = {
        total: 10,
        emit: 4,
        copy: 3,
        skip: 2,
        ignored: 1
      };
      
      const summary = reporter.formatSummary(stats);
      
      expect(summary).toContain('Files classified: 10 total');
      expect(summary).toContain('EMIT:    4 files (will be rendered)');
      expect(summary).toContain('COPY:    3 files (will be copied)');
      expect(summary).toContain('SKIP:    2 files (non-renderable)');
      expect(summary).toContain('IGNORED: 1 file (explicitly ignored)');
      expect(summary).toContain('No output files written (dry run mode).');
    });

    test('should_handle_zero_counts_in_summary', () => {
      const stats = {
        total: 2,
        emit: 2,
        copy: 0,
        skip: 0,
        ignored: 0
      };
      
      const summary = reporter.formatSummary(stats);
      
      expect(summary).toContain('Files classified: 2 total');
      expect(summary).toContain('EMIT:    2 files (will be rendered)');
      expect(summary).toContain('COPY:    0 files');
      expect(summary).toContain('SKIP:    0 files');
      expect(summary).toContain('IGNORED: 0 files');
    });

    test('should_use_singular_forms_for_single_counts', () => {
      const stats = {
        total: 1,
        emit: 1,
        copy: 0,
        skip: 0,
        ignored: 0
      };
      
      const summary = reporter.formatSummary(stats);
      
      expect(summary).toContain('EMIT:    1 file (will be rendered)');
      expect(summary).toContain('COPY:    0 files');
    });
  });

  describe('Log Level Filtering', () => {
    test('should_filter_skip_and_ignored_messages_by_default', () => {
      const skipClassification = {
        action: 'SKIP',
        reason: 'non-renderable(.tmp)',
        tier: 3
      };
      
      const ignoredClassification = {
        action: 'IGNORED',
        reason: 'matched .gitignore',
        tier: 2
      };
      
      const skipResult = reporter.formatFileClassification(
        'src/temp.tmp', 
        skipClassification
      );
      
      const ignoredResult = reporter.formatFileClassification(
        'src/ignored.file', 
        ignoredClassification
      );
      
      // Should return null/empty for info log level
      expect(reporter.shouldShowClassification(skipClassification, 'info')).toBe(false);
      expect(reporter.shouldShowClassification(ignoredClassification, 'info')).toBe(false);
    });

    test('should_show_skip_and_ignored_messages_in_debug_mode', () => {
      const skipClassification = {
        action: 'SKIP',
        reason: 'non-renderable(.tmp)',
        tier: 3
      };
      
      const ignoredClassification = {
        action: 'IGNORED',
        reason: 'matched .gitignore',
        tier: 2
      };
      
      // Should return true for debug log level
      expect(reporter.shouldShowClassification(skipClassification, 'debug')).toBe(true);
      expect(reporter.shouldShowClassification(ignoredClassification, 'debug')).toBe(true);
    });

    test('should_always_show_emit_and_copy_messages', () => {
      const emitClassification = {
        action: 'EMIT',
        reason: 'renderable(html)',
        tier: 3
      };
      
      const copyClassification = {
        action: 'COPY',
        reason: 'implicit assets/**',
        tier: 3
      };
      
      // Should show regardless of log level
      expect(reporter.shouldShowClassification(emitClassification, 'info')).toBe(true);
      expect(reporter.shouldShowClassification(emitClassification, 'debug')).toBe(true);
      expect(reporter.shouldShowClassification(copyClassification, 'info')).toBe(true);
      expect(reporter.shouldShowClassification(copyClassification, 'debug')).toBe(true);
    });
  });

  describe('Output Formatting', () => {
    test('should_align_classification_actions_consistently', () => {
      const classifications = [
        { action: 'EMIT', reason: 'renderable(html)' },
        { action: 'COPY', reason: 'asset' },
        { action: 'SKIP', reason: 'non-renderable' },
        { action: 'IGNORED', reason: 'gitignore' }
      ];
      
      const results = classifications.map(c => 
        reporter.formatFileClassification('test.file', c)
      );
      
      // All should have consistent alignment
      results.forEach(result => {
        expect(result).toMatch(/^\[(EMIT|COPY|SKIP|IGNORED)\]\s+/);
      });
    });

    test('should_indent_reason_lines_consistently', () => {
      const classification = {
        action: 'EMIT',
        reason: 'renderable(md)',
        tier: 3
      };
      
      const layoutInfo = {
        layoutPath: '_layout.html',
        resolutionMethod: 'discovery'
      };
      
      const result = reporter.formatFileClassification(
        'src/page.md', 
        classification, 
        layoutInfo
      );
      
      const lines = result.split('\n');
      expect(lines[0]).toMatch(/^\[EMIT\]/); // Action line starts at column 0
      expect(lines[1]).toMatch(/^\s{10}/);   // Reason line indented
    });
  });
});