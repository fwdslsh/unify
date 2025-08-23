/**
 * Integration Tests for Dry Run Mode
 * Implements US-021: Dry Run Mode with File Classification
 * 
 * Tests the complete dry-run workflow from CLI arguments through
 * file classification and reporting, ensuring no output files are created.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { BuildCommand } from '../../../src/cli/commands/build-command.js';
import { FileClassifier } from '../../../src/core/file-classifier.js';
import { DryRunReporter } from '../../../src/core/dry-run-reporter.js';
import { TempProject } from '../../helpers/temp-project.js';

describe('Dry Run Mode Integration', () => {
  let tempProject;
  let buildCommand;
  let fileClassifier;
  
  beforeEach(async () => {
    tempProject = new TempProject();
    buildCommand = new BuildCommand();
    fileClassifier = new FileClassifier();
  });
  
  afterEach(async () => {
    if (tempProject) {
      await tempProject.cleanup();
    }
  });

  describe('Basic Dry Run Functionality', () => {
    test('should_display_file_classifications_without_writing_output', async () => {
      // Setup test files
      await tempProject.addFile('src/index.html', '<html><body>Home</body></html>');
      await tempProject.addFile('src/about.md', '# About\n\nContent here');
      await tempProject.addFile('src/_layout.html', '<html><head><title>Layout</title></head><body><slot></slot></body></html>');
      await tempProject.addFile('src/assets/style.css', 'body { margin: 0; }');
      await tempProject.addFile('src/temp.tmp', 'temporary file');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        dryRun: true
      });
      
      // Verify no output directory created
      expect(await tempProject.directoryExists('dist')).toBe(false);
      
      // Verify success (dry run should not fail for classification)
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      
      // Verify dry run output contains classifications
      expect(result.dryRunOutput).toBeDefined();
      expect(result.dryRunOutput).toContain('[EMIT]');
      expect(result.dryRunOutput).toContain('[COPY]');
      expect(result.dryRunOutput).toContain('No output files written (dry run mode)');
    });

    test('should_explain_classification_reasons_in_detail', async () => {
      await tempProject.addFile('src/page.html', '<html><body>Page</body></html>');
      await tempProject.addFile('src/post.md', '---\ntitle: Post\n---\n# Content');
      await tempProject.addFile('src/assets/image.png', 'fake-png-data');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        dryRun: true
      });
      
      // Verify detailed reasons are shown
      expect(result.dryRunOutput).toContain('reason: renderable file, default behavior');
      expect(result.dryRunOutput).toContain('[EMIT]'); 
      expect(result.dryRunOutput).toContain('[COPY]');
    });
  });

  describe('Layout Resolution Display', () => {
    test('should_display_layout_resolution_chain_for_emit_files', async () => {
      // Setup layout hierarchy
      await tempProject.addFile('src/_layout.html', '<html><head><title>Base</title></head><body><main><slot></slot></main></body></html>');
      await tempProject.addFile('src/blog/_post.html', '<article><slot></slot></article>');
      await tempProject.addFile('src/blog/article.md', '# Article Title\n\nContent here');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        defaultLayout: ['blog/**=_post.html'],
        dryRun: true
      });
      
      // Verify layout information is displayed
      expect(result.dryRunOutput).toMatch(/layout=.*_post\.html.*--default-layout/);
      
      // If multiple layouts are in the chain, verify the chain is shown
      if (result.dryRunOutput.includes('layout chain:')) {
        expect(result.dryRunOutput).toMatch(/layout chain:.*_layout\.html.*->.*_post\.html/);
      }
    });

    test('should_handle_no_layout_for_emit_files', async () => {
      await tempProject.addFile('src/standalone.html', '<html><body>Standalone</body></html>');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        dryRun: true
      });
      
      // Should show no layout information
      expect(result.dryRunOutput).toContain('reason: renderable file, default behavior; no layout');
    });
  });

  describe('Glob Pattern Transparency', () => {
    test('should_show_copy_pattern_matches', async () => {
      await tempProject.addFile('src/docs/guide.pdf', 'fake-pdf-content');
      await tempProject.addFile('src/docs/manual.pdf', 'fake-pdf-content');
      await tempProject.addFile('src/docs/readme.txt', 'text content');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        copy: ['docs/**/*.pdf'],
        dryRun: true
      });
      
      // Verify copy pattern matches are shown
      expect(result.dryRunOutput).toContain("reason: matched --copy 'docs/**/*.pdf'");
      
      // Verify non-matching files are handled appropriately
      expect(result.dryRunOutput).not.toMatch(/\.txt.*matched --copy/);
    });

    test('should_show_ignore_pattern_matches', async () => {
      await tempProject.addFile('src/temp/cache.tmp', 'cache data');
      await tempProject.addFile('src/temp/logs.log', 'log data');
      await tempProject.addFile('src/content.html', '<html><body>Content</body></html>');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        ignore: ['**/temp/**'],
        dryRun: true,
        logLevel: 'debug' // Enable debug to see IGNORED messages
      });
      
      // Verify ignore pattern matches are shown (only in debug mode)
      expect(result.dryRunOutput).toContain("reason: matched --ignore '**/temp/**'");
      
      // Verify non-ignored files are shown as normal
      expect(result.dryRunOutput).toMatch(/\[EMIT\].*content\.html/);
    });

    test('should_show_render_pattern_overrides', async () => {
      // Create a file that would normally be ignored by .gitignore
      await tempProject.addFile('src/experiments/test.html', '<html><body>Experimental</body></html>');
      await tempProject.addFile('src/.gitignore', 'experiments/**');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        render: ['experiments/**'],
        dryRun: true
      });
      
      // Verify render pattern is applied (specific reason depends on gitignore integration)
      expect(result.dryRunOutput).toContain('[EMIT]');
    });
  });

  describe('Log Level Filtering', () => {
    test('should_hide_skip_and_ignored_messages_by_default', async () => {
      await tempProject.addFile('src/page.html', '<html><body>Page</body></html>');
      await tempProject.addFile('src/data.db', 'binary data');
      await tempProject.addFile('src/temp/cache.tmp', 'cache');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        ignore: ['**/temp/**'],
        dryRun: true,
        logLevel: 'info' // Default level
      });
      
      // Should show EMIT and COPY messages
      expect(result.dryRunOutput).toMatch(/\[EMIT\]/);
      
      // Should NOT show SKIP and IGNORED messages
      expect(result.dryRunOutput).not.toMatch(/\[SKIP\]/);
      expect(result.dryRunOutput).not.toMatch(/\[IGNORED\]/);
    });

    test('should_show_skip_and_ignored_messages_in_debug_mode', async () => {
      await tempProject.addFile('src/page.html', '<html><body>Page</body></html>');
      await tempProject.addFile('src/data.db', 'binary data');
      await tempProject.addFile('src/temp/cache.tmp', 'cache');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        ignore: ['**/temp/**'],
        dryRun: true,
        logLevel: 'debug'
      });
      
      // Should show all message types in debug mode
      expect(result.dryRunOutput).toMatch(/\[EMIT\]/);
      expect(result.dryRunOutput).toMatch(/\[SKIP\]/);
      expect(result.dryRunOutput).toMatch(/\[IGNORED\]/);
    });
  });

  describe('Default Layout Assignment', () => {
    test('should_show_default_layout_assignment_in_output', async () => {
      await tempProject.addFile('src/blog/post1.md', '# Post 1');
      await tempProject.addFile('src/blog/post2.md', '# Post 2');
      await tempProject.addFile('src/page.html', '<html><body>Page</body></html>');
      await tempProject.addFile('src/_base.html', '<html><body><slot></slot></body></html>');
      await tempProject.addFile('src/blog/_post.html', '<article><slot></slot></article>');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        defaultLayout: ['_base.html', 'blog/**=_post.html'],
        dryRun: true
      });
      
      // Verify specific layout assignments
      expect(result.dryRunOutput).toContain('layout=_post.html (--default-layout blog/**=_post.html (last wins))');
      
      // Verify global fallback
      expect(result.dryRunOutput).toContain('layout=_base.html (global fallback _base.html)');
    });
  });

  describe('Summary Statistics', () => {
    test('should_display_classification_summary', async () => {
      await tempProject.addFile('src/index.html', '<html><body>Home</body></html>');
      await tempProject.addFile('src/about.md', '# About');
      await tempProject.addFile('src/assets/style.css', 'body {}');
      await tempProject.addFile('src/assets/image.png', 'fake-png');
      await tempProject.addFile('src/data.db', 'binary');
      await tempProject.addFile('src/temp/cache.tmp', 'cache');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        ignore: ['**/temp/**'],
        dryRun: true,
        logLevel: 'debug' // Show all classifications for complete count
      });
      
      // Verify summary statistics are shown
      expect(result.dryRunOutput).toMatch(/Files classified:\s+\d+\s+total/);
      expect(result.dryRunOutput).toMatch(/EMIT:\s+\d+\s+(file|files)/);
      expect(result.dryRunOutput).toMatch(/COPY:\s+\d+\s+(file|files)/);
      expect(result.dryRunOutput).toMatch(/SKIP:\s+\d+\s+(file|files)/);
      expect(result.dryRunOutput).toMatch(/IGNORED:\s+\d+\s+(file|files)/);
      expect(result.dryRunOutput).toContain('No output files written (dry run mode)');
    });

    test('should_handle_zero_counts_gracefully', async () => {
      // Only create renderable files, no assets or ignored files
      await tempProject.addFile('src/index.html', '<html><body>Home</body></html>');
      await tempProject.addFile('src/about.md', '# About');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        dryRun: true
      });
      
      // Should handle zero counts properly
      expect(result.dryRunOutput).toMatch(/EMIT:\s+2\s+files/);
      expect(result.dryRunOutput).toMatch(/COPY:\s+0\s+files/);
      expect(result.dryRunOutput).toMatch(/SKIP:\s+0\s+files/);
      expect(result.dryRunOutput).toMatch(/IGNORED:\s+0\s+files/);
    });
  });

  describe('Error Handling in Dry Run', () => {
    test('should_handle_source_directory_not_found', async () => {
      const result = await buildCommand.execute({
        source: tempProject.path('nonexistent'),
        output: tempProject.path('dist'),
        dryRun: true
      });
      
      // Dry run should still fail for invalid source directory
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should_handle_invalid_glob_patterns_gracefully', async () => {
      await tempProject.addFile('src/index.html', '<html><body>Home</body></html>');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        copy: ['[invalid-pattern'],
        dryRun: true
      });
      
      // Should complete without crashing, even with invalid patterns
      expect(result.success).toBe(true);
      expect(result.dryRunOutput).toContain('[EMIT]');
    });
  });

  describe('Dry Run Output Format', () => {
    test('should_format_output_consistently', async () => {
      await tempProject.addFile('src/short.html', '<html><body>Short</body></html>');
      await tempProject.addFile('src/very-long-filename-that-tests-alignment.md', '# Long filename');
      await tempProject.addFile('src/assets/file.css', 'body {}');
      
      const result = await buildCommand.execute({
        source: tempProject.path('src'),
        output: tempProject.path('dist'),
        dryRun: true
      });
      
      // Verify consistent formatting
      const lines = result.dryRunOutput.split('\n').filter(line => line.match(/^\[/));
      
      // All action labels should be consistently aligned
      lines.forEach(line => {
        expect(line).toMatch(/^\[(EMIT|COPY|SKIP|IGNORED)\]\s+/);
      });
      
      // Reason lines should be consistently indented
      const reasonLines = result.dryRunOutput.split('\n').filter(line => line.includes('reason:'));
      reasonLines.forEach(line => {
        expect(line).toMatch(/^\s{10}reason:/);
      });
    });
  });
});