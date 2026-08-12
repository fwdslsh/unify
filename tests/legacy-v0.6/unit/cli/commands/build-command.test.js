/**
 * Simplified Unit Tests for BuildCommand
 * Focus: Core logic, validation, error handling without filesystem mocks
 * Strategy: Test the parts we can test without mocking filesystem operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { BuildCommand } from '../../../../src/cli/commands/build-command.js';
import { PathTraversalError } from '../../../../src/core/errors.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';

let buildCommand;
let testDir;

beforeEach(() => {
  buildCommand = new BuildCommand();
  
  // Create temporary test directory for tests that need real filesystem  
  testDir = '/tmp/unify-simple-test-' + Date.now();
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
});

describe('BuildCommand', () => {
  describe('constructor', () => {
    it('should initialize with required components', () => {
      expect(buildCommand.areaMatcher).toBeDefined();
      expect(buildCommand.attributeMerger).toBeDefined();
      expect(buildCommand.domParser).toBeDefined();
      expect(buildCommand.pathValidator).toBeDefined();
      expect(buildCommand.assetTracker).toBeDefined();
      expect(buildCommand.assetCopier).toBeDefined();
      expect(buildCommand.htmlProcessor).toBeDefined();
      expect(buildCommand.fileClassifier).toBeDefined();
      expect(buildCommand.dryRunReporter).toBeDefined();
      expect(buildCommand.logger).toBeDefined();
    });

    it('should initialize failure tracking arrays', () => {
      expect(Array.isArray(buildCommand._failOnTypes)).toBe(true);
      expect(Array.isArray(buildCommand._securityWarnings)).toBe(true);
      expect(Array.isArray(buildCommand._recoverableErrors)).toBe(true);
    });
  });

  describe('validation logic', () => {
    describe('validateOptions', () => {
      it('should throw error for missing source', () => {
        const options = { output: './dist' };
        
        expect(() => {
          buildCommand.validateOptions(options, buildCommand.pathValidator);
        }).toThrow('Source directory is required');
      });

      it('should throw error for missing output', () => {
        const options = { source: './src' };
        
        expect(() => {
          buildCommand.validateOptions(options, buildCommand.pathValidator);
        }).toThrow('Output directory is required');
      });

      it('should validate with existing directories', () => {
        // Use real temp directories
        const srcDir = testDir + '/src';
        const distDir = testDir + '/dist';
        
        mkdirSync(srcDir, { recursive: true });
        mkdirSync(distDir, { recursive: true });

        const options = { source: srcDir, output: distDir };
        
        // Should not throw
        expect(() => {
          buildCommand.validateOptions(options, buildCommand.pathValidator);
        }).not.toThrow();
        
        // Cleanup
        rmSync(srcDir, { recursive: true, force: true });
        rmSync(distDir, { recursive: true, force: true });
      });
    });

    describe('security validation', () => {
      it('should detect system directory traversal in source', () => {
        const options = { source: '../../../etc', output: './dist' };
        
        expect(() => {
          buildCommand.validateOptions(options, buildCommand.pathValidator);
        }).toThrow(PathTraversalError);
      });

      it('should detect system directory access in source', () => {
        const options = { source: '/etc/passwd', output: './dist' };
        
        expect(() => {
          buildCommand.validateOptions(options, buildCommand.pathValidator);
        }).toThrow(PathTraversalError);
      });

      it('should detect dangerous output paths', () => {
        const srcDir = testDir + '/src';
        mkdirSync(srcDir, { recursive: true });

        const options = { source: srcDir, output: '../../../tmp/malicious' };
        
        expect(() => {
          buildCommand.validateOptions(options, buildCommand.pathValidator);
        }).toThrow(PathTraversalError);
        
        // Cleanup
        rmSync(srcDir, { recursive: true, force: true });
      });
    });
  });

  describe('helper methods', () => {
    describe('_getUserFriendlyErrorMessage', () => {
      it('should convert ENOENT errors to user-friendly messages', () => {
        const result = buildCommand._getUserFriendlyErrorMessage('Source directory not found');
        expect(result).toBe('Build failed: Source directory not found');
      });

      it('should handle same directory errors', () => {
        const result = buildCommand._getUserFriendlyErrorMessage('Source and output cannot be the same directory');
        expect(result).toBe('Build failed: Source and output cannot be the same directory');
      });

      it('should handle output creation errors', () => {
        const result = buildCommand._getUserFriendlyErrorMessage('Cannot create output directory');
        expect(result).toBe('Build failed: Cannot create output directory');
      });

      it('should provide generic fallback for unknown errors', () => {
        const result = buildCommand._getUserFriendlyErrorMessage('Unknown error occurred');
        expect(result).toBe('Build failed due to an unexpected error');
      });
    });

    describe('_checkFailureConditions', () => {
      it('should return null when no failure conditions are met', () => {
        buildCommand._failOnTypes = [];
        buildCommand._securityWarnings = [];
        
        const result = buildCommand._checkFailureConditions();
        expect(result).toBeNull();
      });

      it('should detect security failures when configured', () => {
        buildCommand._failOnTypes = ['security'];
        buildCommand._securityWarnings = [{ type: 'security', message: 'Security issue found' }];
        
        const result = buildCommand._checkFailureConditions();
        expect(result).toBe('1 security issue found');
      });

      it('should handle multiple security warnings', () => {
        buildCommand._failOnTypes = ['security'];
        buildCommand._securityWarnings = [
          { type: 'security', message: 'Issue 1' },
          { type: 'security', message: 'Issue 2' }
        ];
        
        const result = buildCommand._checkFailureConditions();
        expect(result).toBe('2 security issues found');
      });

      it('should ignore security warnings when not configured to fail on them', () => {
        buildCommand._failOnTypes = ['warning']; // Not 'security'
        buildCommand._securityWarnings = [{ type: 'security', message: 'Security issue found' }];
        
        const result = buildCommand._checkFailureConditions();
        expect(result).toBeNull();
      });
    });

    describe('_extractHtmlAttributes', () => {
      it('should extract html attributes from frontmatter', () => {
        const frontmatter = {
          html_lang: 'en',
          html_class: 'dark-theme',
          html_data_theme: 'dark'
        };
        
        const result = buildCommand._extractHtmlAttributes(frontmatter, 'html');
        expect(result).toContain('lang="en"');
        expect(result).toContain('class="dark-theme"');
        expect(result).toContain('data-theme="dark"');
      });

      it('should extract body attributes from frontmatter', () => {
        const frontmatter = {
          body_class: 'page-home',
          body_data_loaded: 'true'
        };
        
        const result = buildCommand._extractHtmlAttributes(frontmatter, 'body');
        expect(result).toContain('class="page-home"');
        expect(result).toContain('data-loaded="true"');
      });

      it('should return empty string for no matching attributes', () => {
        const frontmatter = { title: 'Test Page' };
        
        const result = buildCommand._extractHtmlAttributes(frontmatter, 'html');
        expect(result).toBe('');
      });

      it('should handle null frontmatter', () => {
        const result = buildCommand._extractHtmlAttributes(null, 'html');
        expect(result).toBe('');
      });

      it('should escape attribute values', () => {
        const frontmatter = {
          html_title: 'A "quoted" & <tagged> title'
        };
        
        const result = buildCommand._extractHtmlAttributes(frontmatter, 'html');
        expect(result).toContain('title="A &quot;quoted&quot; &amp; &lt;tagged&gt; title"');
      });
    });

    describe('_extractLandmarksFromHtml', () => {
      it('should extract header landmarks', () => {
        const html = '<header>Site header</header><p>Content</p>';
        
        const result = buildCommand._extractLandmarksFromHtml(html);
        expect(result.landmarks).toHaveLength(1);
        expect(result.landmarks[0]).toBe('<header>Site header</header>');
        expect(result.content).toBe('<p>Content</p>');
      });

      it('should extract multiple landmarks', () => {
        const html = '<header>Header</header><nav>Navigation</nav><main>Main content</main><footer>Footer</footer>';
        
        const result = buildCommand._extractLandmarksFromHtml(html);
        expect(result.landmarks).toHaveLength(4);
        expect(result.landmarks).toContain('<header>Header</header>');
        expect(result.landmarks).toContain('<nav>Navigation</nav>');
        expect(result.landmarks).toContain('<main>Main content</main>');
        expect(result.landmarks).toContain('<footer>Footer</footer>');
      });

      it('should return empty landmarks for no landmark elements', () => {
        const html = '<div>Regular content</div><p>Paragraph</p>';
        
        const result = buildCommand._extractLandmarksFromHtml(html);
        expect(result.landmarks).toHaveLength(0);
        expect(result.content).toContain('<div>Regular content</div>');
      });

      it('should handle empty input', () => {
        const result = buildCommand._extractLandmarksFromHtml('');
        expect(result.landmarks).toHaveLength(0);
        expect(result.content).toBe('');
      });

      it('should handle null input', () => {
        const result = buildCommand._extractLandmarksFromHtml(null);
        expect(result.landmarks).toHaveLength(0);
        expect(result.content).toBe('');
      });
    });
  });

  describe('error handling', () => {
    it('should handle PathTraversalError with correct exit code', async () => {
      const options = { source: '../../../etc', output: './dist' };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2); // Security violation
      expect(result.userMessage).toMatch(/Security violation|access outside project directory not allowed/);
    });

    it('should handle general build errors with exit code 1', async () => {
      const options = { source: '/nonexistent/directory', output: './dist' };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1); // General build error
      expect(result.userMessage).toContain('Build failed');
    });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});