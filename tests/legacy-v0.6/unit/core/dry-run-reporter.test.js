/**
 * Tests for DryRunReporter
 * Implements comprehensive test coverage for file classification reporting
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { DryRunReporter } from '../../../src/core/dry-run-reporter.js';

describe('DryRunReporter', () => {
  let reporter;

  beforeEach(() => {
    reporter = new DryRunReporter();
  });

  describe('constructor', () => {
    it('should initialize with default log level', () => {
      expect(reporter.logLevel).toBe('info');
    });
  });

  describe('formatFileClassification', () => {
    it('should format EMIT action with layout info', () => {
      const classification = {
        action: 'EMIT',
        reason: 'HTML file'
      };
      const layoutInfo = {
        layoutPath: '_layout.html',
        resolutionMethod: 'directory-based'
      };

      const result = reporter.formatFileClassification('/src/index.html', classification, layoutInfo);
      
      expect(result).toContain('[EMIT]');
      expect(result).toContain('/src/index.html');
      expect(result).toContain('reason: HTML file');
      expect(result).toContain('layout=_layout.html (directory-based)');
    });

    it('should format EMIT action without layout info', () => {
      const classification = {
        action: 'EMIT',
        reason: 'Markdown file'
      };

      const result = reporter.formatFileClassification('/src/about.md', classification, null);
      
      expect(result).toContain('[EMIT]');
      expect(result).toContain('/src/about.md');
      expect(result).toContain('reason: Markdown file; no layout');
    });

    it('should format EMIT action with multiple layout chain', () => {
      const classification = {
        action: 'EMIT',
        reason: 'HTML file'
      };
      const layoutInfo = {
        layoutPath: 'page-layout.html',
        resolutionMethod: 'frontmatter',
        resolutionChain: ['base-layout.html', 'page-layout.html', 'content.html']
      };

      const result = reporter.formatFileClassification('/src/page.html', classification, layoutInfo);
      
      expect(result).toContain('[EMIT]');
      expect(result).toContain('layout chain: base-layout.html -> page-layout.html -> content.html');
    });

    it('should format COPY action with implicit assets reason', () => {
      const classification = {
        action: 'COPY',
        reason: 'implicit assets/**'
      };

      const result = reporter.formatFileClassification('/src/assets/style.css', classification);
      
      expect(result).toContain('[COPY]');
      expect(result).toContain('/src/assets/style.css');
      expect(result).toContain('reason: implicit assets/** (not ignored)');
    });

    it('should format COPY action with copy pattern match', () => {
      const classification = {
        action: 'COPY',
        reason: 'matched --copy',
        matchedPattern: '**/*.pdf'
      };

      const result = reporter.formatFileClassification('/docs/manual.pdf', classification);
      
      expect(result).toContain('[COPY]');
      expect(result).toContain('/docs/manual.pdf');
      expect(result).toContain("reason: matched --copy '**/*.pdf'");
    });

    it('should format SKIP action', () => {
      const classification = {
        action: 'SKIP',
        reason: 'non-renderable file'
      };

      const result = reporter.formatFileClassification('/src/data.json', classification);
      
      expect(result).toContain('[SKIP]');
      expect(result).toContain('/src/data.json');
      expect(result).toContain('reason: non-renderable file');
    });

    it('should format IGNORED action with ignore pattern', () => {
      const classification = {
        action: 'IGNORED',
        reason: 'matched --ignore',
        matchedPattern: '*.tmp'
      };

      const result = reporter.formatFileClassification('/src/temp.tmp', classification);
      
      expect(result).toContain('[IGNORED]');
      expect(result).toContain('/src/temp.tmp');
      expect(result).toContain("reason: matched --ignore '*.tmp'");
    });

    it('should format IGNORED action with ignore-copy pattern', () => {
      const classification = {
        action: 'IGNORED',
        reason: 'matched --ignore-copy',
        matchedPattern: '**/*.bak'
      };

      const result = reporter.formatFileClassification('/src/backup.bak', classification);
      
      expect(result).toContain('[IGNORED]');
      expect(result).toContain("reason: matched --ignore-copy '**/*.bak'");
    });

    it('should format IGNORED action with ignore-render pattern', () => {
      const classification = {
        action: 'IGNORED',
        reason: 'matched --ignore-render',
        matchedPattern: '_draft*.md'
      };

      const result = reporter.formatFileClassification('/src/_draft-post.md', classification);
      
      expect(result).toContain('[IGNORED]');
      expect(result).toContain("reason: matched --ignore-render '_draft*.md'");
    });

    it('should format render override pattern', () => {
      const classification = {
        action: 'EMIT',
        reason: '--render override',
        matchedPattern: '*.draft'
      };

      const result = reporter.formatFileClassification('/src/post.draft', classification);
      
      expect(result).toContain('[EMIT]');
      expect(result).toContain("reason: --render '*.draft' overrides .gitignore");
    });

    it('should handle classification without reason', () => {
      const classification = {
        action: 'COPY'
        // No reason property
      };

      const result = reporter.formatFileClassification('/src/image.png', classification);
      
      expect(result).toContain('[COPY]');
      expect(result).toContain('/src/image.png');
      expect(result).toContain('reason: undefined');
    });

    it('should pad action labels consistently', () => {
      const shortAction = reporter.formatFileClassification('/test.html', { action: 'EMIT' });
      const longAction = reporter.formatFileClassification('/test.pdf', { action: 'IGNORED' });
      
      // Both should have consistent spacing after action label
      const shortSpacing = shortAction.split(']')[1];
      const longSpacing = longAction.split(']')[1];
      
      expect(shortSpacing.charAt(0)).toBe(' ');
      expect(longSpacing.charAt(0)).toBe(' ');
    });
  });

  describe('formatSummary', () => {
    it('should format summary with all file types', () => {
      const stats = {
        total: 15,
        emit: 8,
        copy: 4,
        skip: 2,
        ignored: 1
      };

      const result = reporter.formatSummary(stats);
      
      expect(result).toContain('Files classified: 15 total');
      expect(result).toContain('EMIT:    8 files (will be rendered)');
      expect(result).toContain('COPY:    4 files (will be copied)');
      expect(result).toContain('SKIP:    2 files (non-renderable)');
      expect(result).toContain('IGNORED: 1 file (explicitly ignored)');
      expect(result).toContain('No output files written (dry run mode).');
    });

    it('should handle singular vs plural forms correctly', () => {
      const stats = {
        total: 3,
        emit: 1,
        copy: 1,
        skip: 1,
        ignored: 0
      };

      const result = reporter.formatSummary(stats);
      
      expect(result).toContain('EMIT:    1 file (will be rendered)');
      expect(result).toContain('COPY:    1 file (will be copied)');
      expect(result).toContain('SKIP:    1 file (non-renderable)');
      expect(result).toContain('IGNORED: 0 files');
    });

    it('should handle zero counts gracefully', () => {
      const stats = {
        total: 2,
        emit: 2,
        copy: 0,
        skip: 0,
        ignored: 0
      };

      const result = reporter.formatSummary(stats);
      
      expect(result).toContain('Files classified: 2 total');
      expect(result).toContain('EMIT:    2 files (will be rendered)');
      expect(result).toContain('COPY:    0 files');
      expect(result).toContain('SKIP:    0 files');
      expect(result).toContain('IGNORED: 0 files');
      expect(result).not.toContain('(will be copied)');
      expect(result).not.toContain('(non-renderable)');
      expect(result).not.toContain('(explicitly ignored)');
    });
  });

  describe('shouldShowClassification', () => {
    it('should always show EMIT actions regardless of log level', () => {
      const emitClassification = { action: 'EMIT' };
      
      expect(reporter.shouldShowClassification(emitClassification, 'info')).toBe(true);
      expect(reporter.shouldShowClassification(emitClassification, 'debug')).toBe(true);
      expect(reporter.shouldShowClassification(emitClassification, 'warn')).toBe(true);
    });

    it('should always show COPY actions regardless of log level', () => {
      const copyClassification = { action: 'COPY' };
      
      expect(reporter.shouldShowClassification(copyClassification, 'info')).toBe(true);
      expect(reporter.shouldShowClassification(copyClassification, 'debug')).toBe(true);
      expect(reporter.shouldShowClassification(copyClassification, 'warn')).toBe(true);
    });

    it('should only show SKIP actions in debug mode', () => {
      const skipClassification = { action: 'SKIP' };
      
      expect(reporter.shouldShowClassification(skipClassification, 'info')).toBe(false);
      expect(reporter.shouldShowClassification(skipClassification, 'debug')).toBe(true);
      expect(reporter.shouldShowClassification(skipClassification, 'warn')).toBe(false);
    });

    it('should only show IGNORED actions in debug mode', () => {
      const ignoredClassification = { action: 'IGNORED' };
      
      expect(reporter.shouldShowClassification(ignoredClassification, 'info')).toBe(false);
      expect(reporter.shouldShowClassification(ignoredClassification, 'debug')).toBe(true);
      expect(reporter.shouldShowClassification(ignoredClassification, 'error')).toBe(false);
    });

    it('should handle unknown actions by showing them', () => {
      const unknownClassification = { action: 'UNKNOWN' };
      
      expect(reporter.shouldShowClassification(unknownClassification, 'info')).toBe(true);
      expect(reporter.shouldShowClassification(unknownClassification, 'debug')).toBe(true);
    });
  });

  describe('_formatReason', () => {
    it('should format copy pattern matches', () => {
      const classification = {
        action: 'COPY',
        reason: 'copy pattern match',
        matchedPattern: '**/*.pdf'
      };

      const result = reporter._formatReason(classification);
      expect(result).toBe("reason: matched --copy '**/*.pdf'");
    });

    it('should format ignore pattern matches', () => {
      const classification = {
        action: 'IGNORED',
        reason: 'matched --ignore',
        matchedPattern: '*.tmp'
      };

      const result = reporter._formatReason(classification);
      expect(result).toBe("reason: matched --ignore '*.tmp'");
    });

    it('should format ignore-copy pattern matches', () => {
      const classification = {
        action: 'IGNORED',
        reason: 'matched --ignore-copy',
        matchedPattern: '**/*.log'
      };

      const result = reporter._formatReason(classification);
      expect(result).toBe("reason: matched --ignore-copy '**/*.log'");
    });

    it('should format ignore-render pattern matches', () => {
      const classification = {
        action: 'IGNORED',
        reason: 'matched --ignore-render',
        matchedPattern: '_*.md'
      };

      const result = reporter._formatReason(classification);
      expect(result).toBe("reason: matched --ignore-render '_*.md'");
    });

    it('should format render override patterns', () => {
      const classification = {
        action: 'EMIT',
        reason: '--render override',
        matchedPattern: '*.draft'
      };

      const result = reporter._formatReason(classification);
      expect(result).toBe("reason: --render '*.draft' overrides .gitignore");
    });

    it('should format basic reason for non-pattern matches', () => {
      const classification = {
        action: 'SKIP',
        reason: 'non-renderable file'
      };

      const result = reporter._formatReason(classification);
      expect(result).toBe('reason: non-renderable file');
    });

    it('should format EMIT with layout information', () => {
      const classification = {
        action: 'EMIT',
        reason: 'HTML file'
      };
      const layoutInfo = {
        layoutPath: 'base.html',
        resolutionMethod: 'frontmatter'
      };

      const result = reporter._formatReason(classification, layoutInfo);
      expect(result).toBe('reason: HTML file; layout=base.html (frontmatter)');
    });

    it('should format EMIT without layout information', () => {
      const classification = {
        action: 'EMIT',
        reason: 'Markdown file'
      };

      const result = reporter._formatReason(classification, null);
      expect(result).toBe('reason: Markdown file; no layout');
    });

    it('should format implicit assets reason specifically', () => {
      const classification = {
        action: 'COPY',
        reason: 'implicit assets/**'
      };

      const result = reporter._formatReason(classification);
      expect(result).toBe('reason: implicit assets/** (not ignored)');
    });
  });

  describe('_pluralize', () => {
    it('should return singular form for count of 1', () => {
      expect(reporter._pluralize('file', 1)).toBe('file');
      expect(reporter._pluralize('item', 1)).toBe('item');
    });

    it('should return plural form for count of 0', () => {
      expect(reporter._pluralize('file', 0)).toBe('files');
      expect(reporter._pluralize('item', 0)).toBe('items');
    });

    it('should return plural form for count greater than 1', () => {
      expect(reporter._pluralize('file', 2)).toBe('files');
      expect(reporter._pluralize('file', 10)).toBe('files');
      expect(reporter._pluralize('item', 5)).toBe('items');
    });
  });

  describe('integration tests', () => {
    it('should handle complex classification with all fields', () => {
      const classification = {
        action: 'EMIT',
        reason: 'HTML file with layout',
        matchedPattern: null
      };
      const layoutInfo = {
        layoutPath: '_includes/base.html',
        resolutionMethod: 'directory-based',
        resolutionChain: ['_includes/base.html', '_includes/page.html']
      };

      const result = reporter.formatFileClassification('/src/complex.html', classification, layoutInfo);
      
      expect(result).toContain('[EMIT]    /src/complex.html');
      expect(result).toContain('reason: HTML file with layout; layout=_includes/base.html (directory-based)');
      expect(result).toContain('layout chain: _includes/base.html -> _includes/page.html');
    });

    it('should produce consistent formatting across different actions', () => {
      const testCases = [
        { action: 'EMIT', file: 'a.html' },
        { action: 'COPY', file: 'b.css' },
        { action: 'SKIP', file: 'c.json' },
        { action: 'IGNORED', file: 'd.tmp' }
      ];

      const results = testCases.map(({ action, file }) => 
        reporter.formatFileClassification(file, { action })
      );

      // All should start with consistent padding
      results.forEach(result => {
        const lines = result.split('\n');
        const firstLine = lines[0];
        // Should have action in brackets followed by consistent spacing
        expect(firstLine).toMatch(/^\[[A-Z]+\]\s+/);
      });
    });
  });
});