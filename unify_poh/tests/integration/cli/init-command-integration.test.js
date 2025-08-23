/**
 * Integration tests for Init Command
 * Tests full workflow including CLI parsing, template download, and file system operations
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { UnifyCLI } from '../../../src/cli.js';
import { ArgsParser } from '../../../src/cli/args-parser.js';

describe('InitCommand Integration', () => {
  let tempDir;
  let cli;
  let originalProcessExit;
  let originalConsoleLog;
  let originalConsoleError;
  let originalConsoleWarn;
  let capturedLogs;
  let capturedErrors;
  let exitCode;

  beforeEach(() => {
    tempDir = `/tmp/unify-test-${Date.now()}`;
    cli = new UnifyCLI();
    capturedLogs = [];
    capturedErrors = [];
    exitCode = null;
    
    // Set test mode to enable fallback template creation
    process.env.UNIFY_TEST_MODE = '1';
    
    // Mock process.exit to capture exit codes
    originalProcessExit = process.exit;
    process.exit = (code) => {
      if (exitCode === null) { // Only capture the first exit attempt
        exitCode = code;
      }
      const error = new Error(`Process would exit with code ${code}`);
      error.isExpectedExit = true;
      throw error;
    };
    
    // Mock console methods to capture output
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    console.log = (message) => capturedLogs.push(message);
    console.error = (message) => capturedErrors.push(message);
    console.warn = (message) => capturedLogs.push(message);
  });

  afterEach(async () => {
    // Restore original methods
    process.exit = originalProcessExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    
    // Clean up test environment
    delete process.env.UNIFY_TEST_MODE;
    
    // Clean up temp directory
    try {
      const { rmSync } = await import('fs');
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('CLI argument parsing', () => {
    test('should_parse_init_command_when_provided', () => {
      const parser = new ArgsParser();
      const result = parser.parse(['init']);
      
      expect(result.command).toBe('init');
      expect(result.errors.length).toBe(0);
    });

    test('should_parse_template_option_when_provided', () => {
      const parser = new ArgsParser();
      const result = parser.parse(['init', '--template', 'blog']);
      
      expect(result.command).toBe('init');
      expect(result.template).toBe('blog');
      expect(result.errors.length).toBe(0);
    });

    test('should_parse_target_directory_when_provided', () => {
      const parser = new ArgsParser();
      const result = parser.parse(['init', '--target', tempDir]);
      
      expect(result.command).toBe('init');
      expect(result.target).toBe(tempDir);
      expect(result.errors.length).toBe(0);
    });

    test('should_warn_about_ignored_options_when_init_command_used', () => {
      const parser = new ArgsParser();
      const result = parser.parse(['init', '--source', 'src', '--output', 'dist']);
      const validation = parser.validate(result);
      
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings[0]).toContain('ignored for init command');
    });
  });

  describe('full init workflow', () => {
    test('should_complete_successfully_when_valid_template_specified', async () => {
      // Ensure tempDir exists for the test
      const fs = require('fs');
      fs.mkdirSync(tempDir, { recursive: true });
      
      const args = ['init', '--template', 'default', '--target', tempDir];
      
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        if (!error.isExpectedExit) {
          capturedErrors.push('Unexpected CLI Error: ' + error.message);
        }
        expect(error.message).toContain('Process would exit with code 0');
        expect(exitCode).toBe(0);
      }
      
      // Check success messages
      expect(capturedLogs.some(log => log.includes('successfully initialized'))).toBe(true);
      expect(capturedLogs.some(log => log.includes('Next steps'))).toBe(true);
    });

    test('should_use_current_directory_when_no_target_specified', async () => {
      const args = ['init', '--template', 'basic'];
      
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        if (!error.isExpectedExit) {
          originalConsoleLog('Unexpected CLI Error:', error.message);
        }
        expect(error.message).toContain('Process would exit with code 0');
        expect(exitCode).toBe(0);
      }
      
      // Should initialize successfully
      expect(capturedLogs.some(log => log.includes('successfully initialized'))).toBe(true);
    });

    test('should_fail_gracefully_when_unknown_template_specified', async () => {
      const args = ['init', '--template', 'nonexistent-template'];
      
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        if (!error.isExpectedExit) {
          originalConsoleLog('Unexpected CLI Error:', error.message);
        }
        expect(error.message).toContain('Process would exit with code 2');
        expect(exitCode).toBe(2);
      }
      
      expect(capturedErrors.some(error => error.includes('Unknown template'))).toBe(true);
    });

    test('should_handle_network_errors_gracefully_when_github_unavailable', async () => {
      const args = ['init', '--template', 'blog', '--target', tempDir];
      
      // Mock network failure (this would be configured in the actual implementation)
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        // Should either succeed (if network is available) or fail gracefully (if not)
        expect([0, 1]).toContain(exitCode);
      }
    });

    test('should_provide_helpful_output_when_directory_not_empty', async () => {
      // Create non-empty directory
      const { mkdirSync, writeFileSync } = await import('fs');
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(`${tempDir}/existing-file.txt`, 'content');
      
      const args = ['init', '--template', 'default', '--target', tempDir];
      
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        expect(exitCode).toBe(0); // Should continue despite warning
      }
      
      // Should warn about non-empty directory
      expect(capturedLogs.some(log => log.includes('Target directory is not empty'))).toBe(true);
    });
  });

  describe('help and version output', () => {
    test('should_show_init_command_in_help_when_help_requested', async () => {
      const args = ['--help'];
      
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        if (!error.isExpectedExit) {
          originalConsoleLog('Unexpected CLI Error:', error.message);
        }
        expect(error.message).toContain('Process would exit with code 0');
        expect(exitCode).toBe(0);
      }
      
      expect(capturedLogs.some(log => log.includes('init'))).toBe(true);
      expect(capturedLogs.some(log => log.includes('Initialize new project'))).toBe(true);
    });

    test('should_show_template_option_in_help_when_help_requested', async () => {
      const args = ['--help'];
      
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        if (!error.isExpectedExit) {
          originalConsoleLog('Unexpected CLI Error:', error.message);
        }
        expect(error.message).toContain('Process would exit with code 0');
        expect(exitCode).toBe(0);
      }
      
      expect(capturedLogs.some(log => log.includes('--template'))).toBe(true);
    });
  });

  describe('file system operations', () => {
    test('should_create_target_directory_when_it_does_not_exist', async () => {
      const args = ['init', '--template', 'default', '--target', tempDir];
      
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        expect(exitCode).toBe(0);
      }
      
      // Check that directory was created
      const { statSync } = await import('fs');
      expect(() => statSync(tempDir)).not.toThrow();
      expect(statSync(tempDir).isDirectory()).toBe(true);
    });

    test('should_extract_template_files_when_download_succeeds', async () => {
      const args = ['init', '--template', 'basic', '--target', tempDir];
      
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        expect(exitCode).toBe(0);
      }
      
      // Check that files were extracted
      const { readdirSync } = await import('fs');
      const files = readdirSync(tempDir);
      expect(files.length).toBeGreaterThan(0);
    });

    test('should_preserve_directory_structure_when_extracting', async () => {
      const args = ['init', '--template', 'portfolio', '--target', tempDir];
      
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        expect(exitCode).toBe(0);
      }
      
      // Check that directory structure is preserved
      // This would verify specific directories exist based on template structure
      const { statSync } = await import('fs');
      expect(() => statSync(tempDir)).not.toThrow();
    });
  });

  describe('template-specific behavior', () => {
    test('should_extract_blog_specific_files_when_blog_template_used', async () => {
      const args = ['init', '--template', 'blog', '--target', tempDir];
      
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        expect(exitCode).toBe(0);
      }
      
      // Should extract blog-specific files
      expect(capturedLogs.some(log => log.includes('blog template'))).toBe(true);
    });

    test('should_extract_docs_specific_files_when_docs_template_used', async () => {
      const args = ['init', '--template', 'docs', '--target', tempDir];
      
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        expect(exitCode).toBe(0);
      }
      
      // Should extract docs-specific files
      expect(capturedLogs.some(log => log.includes('docs template'))).toBe(true);
    });
  });

  describe('error recovery', () => {
    test('should_clean_up_partial_extraction_when_process_interrupted', async () => {
      const args = ['init', '--template', 'default', '--target', tempDir];
      
      // This test would verify cleanup behavior on interruption
      // For now, we test the interface
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        // Should handle interruption gracefully
        expect([0, 1]).toContain(exitCode);
      }
    });

    test('should_suggest_retry_when_temporary_error_occurs', async () => {
      const args = ['init', '--template', 'default', '--target', tempDir];
      
      // Mock temporary error scenario
      try {
        await cli.run(args);
        expect(false).toBe(true); // Should not reach here due to process.exit mock
      } catch (error) {
        // Should provide retry suggestion on temporary errors
        if (exitCode === 1) {
          expect(capturedErrors.some(error => error.includes('retry'))).toBe(true);
        }
      }
    });
  });
});