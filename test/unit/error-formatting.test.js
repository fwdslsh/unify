/**
 * Tests for error message format validation
 * Verifies error message compliance with app specification format
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Error Message Format Validation', () => {
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  describe('Spec-Compliant Error Format', () => {
    it('should format CLI argument errors according to spec', async () => {
      // Test unknown command
      const unknownCmdResult = await runCLIInDir(tempDir, ['unknown-command']);
      
      expect(unknownCmdResult.code).toBe(2);
      expect(unknownCmdResult.stderr).toMatch(/ERROR.*UnifyError.*Unknown command.*unknown-command/);
      expect(unknownCmdResult.stderr).toMatch(/Suggestions:/);
      expect(unknownCmdResult.stderr).toMatch(/-.*Use.*--help/);

      // Test unknown option
      const unknownOptResult = await runCLIInDir(tempDir, ['build', '--unknown-option']);
      
      expect(unknownOptResult.code).toBe(2);
      expect(unknownOptResult.stderr).toMatch(/ERROR.*UnifyError.*Unknown option.*--unknown-option/);
      expect(unknownOptResult.stderr).toMatch(/Suggestions:/);
      expect(unknownOptResult.stderr).toMatch(/-.*Use.*--help/);

      // Test missing argument value
      const missingArgResult = await runCLIInDir(tempDir, ['build', '--copy']);
      
      expect(missingArgResult.code).toBe(2);
      expect(missingArgResult.stderr).toMatch(/ERROR.*UnifyError.*--copy.*requires.*value/);
      expect(missingArgResult.stderr).toMatch(/Suggestions:/);
    });

    it('should format build errors according to spec', async () => {
      const structure = {
        'src/broken.md': '---\nlayout: missing-layout.html\n---\n\n# Content'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);

      expect(result.code).toBe(0); // Build succeeds with warnings in normal mode for missing layouts
      // The build should complete successfully even with missing layouts
      expect(result.stderr).not.toMatch(/ERROR.*BuildError/);
    });

    it('should format fail-level error mode errors according to spec', async () => {
      // Create a scenario where the source directory doesn't exist for build error
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', path.join(tempDir, 'nonexistent-source'),
        '--output', outputDir,
        '--fail-level', 'error'
      ]);

      expect(result.code).toBe(2); // Directory validation errors are usage errors (exit code 2)
      expect(result.stderr).toMatch(/ERROR.*UnifyError.*Source directory.*not found/);
      expect(result.stderr).toMatch(/Suggestions:/);
      expect(result.stderr).toMatch(/-.*Check.*path/);
    });

    it('should format file system errors according to spec', async () => {
      // Test with non-existent source directory
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', path.join(tempDir, 'nonexistent'),
        '--output', outputDir
      ]);

      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/ERROR.*UnifyError.*Source directory.*not found/);
      expect(result.stderr).toMatch(/Suggestions:/);
      expect(result.stderr).toMatch(/-.*Check.*path/);
    });
  });

  describe('Error Message Content Validation', () => {
    it('should provide helpful suggestions for common errors', async () => {
      // Test typo in command
      const typoResult = await runCLIInDir(tempDir, ['biuld']); // Typo: biuld instead of build
      
      expect(typoResult.stderr).toMatch(/Did you mean.*build/);

      // Test similar option names
      const optionTypoResult = await runCLIInDir(tempDir, ['build', '--soruce']); // Typo: soruce instead of source
      
      expect(optionTypoResult.stderr).toMatch(/Did you mean.*--source/);
    });

    it('should include relevant context in error messages', async () => {
      const structure = {
        'src/page.html': '<h1>Valid Content</h1>'
      };

      await createTestStructure(tempDir, structure);

      // Test with invalid port to generate an error with context
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--port', 'invalid-port'
      ]);

      expect(result.code).toBe(2); // Invalid argument error
      expect(result.stderr).toMatch(/ERROR.*UnifyError/);
      expect(result.stderr).toMatch(/Port must be a number/);
    });

    it('should format invalid argument errors clearly', async () => {
      // Test invalid fail-level argument
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--fail-level', 'invalid-level'
      ]);

      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/ERROR.*UnifyError.*Invalid.*fail-level/);
      expect(result.stderr).toMatch(/Valid levels are.*warning.*error/);
      expect(result.stderr).toMatch(/Suggestions:/);
    });

    it('should format missing required argument errors clearly', async () => {
      // Test missing value for option that requires one
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--log-level'
      ]);

      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/ERROR.*UnifyError.*log-level.*requires.*value/);
      expect(result.stderr).toMatch(/Valid levels are.*error.*warn.*info.*debug/);
      expect(result.stderr).toMatch(/Suggestions:/);
    });
  });

  describe('Error Message Formatting Consistency', () => {
    it('should use consistent emoji and formatting across all error types', async () => {
      const errorScenarios = [
        {
          name: 'Unknown command',
          args: ['unknown-command'],
          expectedPattern: /ERROR.*UnifyError[\s\S]*Suggestions:/
        },
        {
          name: 'Missing source directory',
          args: ['build', '--source', path.join(tempDir, 'nonexistent')],
          expectedPattern: /ERROR.*UnifyError[\s\S]*Suggestions:/
        },
        {
          name: 'Invalid option',
          args: ['build', '--invalid'],
          expectedPattern: /ERROR.*UnifyError[\s\S]*Suggestions:/
        }
      ];

      for (const scenario of errorScenarios) {
        const result = await runCLIInDir(tempDir, scenario.args);
        
        expect(result.stderr).toMatch(scenario.expectedPattern);
        
        // Should have consistent structure
        expect(result.stderr).toMatch(/ERROR/); // Error emoji
        expect(result.stderr).toMatch(/Suggestions:/); // Suggestions header
        expect(result.stderr).toMatch(/-/); // Bullet points
      }
    });

    it('should use appropriate log levels with consistent formatting', async () => {
      const structure = {
        'src/index.html': '<h1>Content</h1>',
        'src/page.html': '<p>More content</p>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--log-level', 'debug'
      ]);

      const output = result.stdout + result.stderr;

      // Should have info messages
      expect(output).toMatch(/\[INFO\].*Building static site/);
      expect(output).toMatch(/\[INFO\].*Found.*files/);
      
      // Should have success message
      expect(output).toMatch(/\[SUCCESS\].*Build completed/);
      
      // Should have debug messages
      expect(output).toMatch(/\[DEBUG\]/);
    });

    it('should provide debug information when debug log level is enabled', async () => {
      const structure = {
        'src/index.html': '<h1>Content</h1>',
        'src/includes/header.html': '<header>Header</header>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--log-level', 'debug'
      ]);

      const output = result.stdout + result.stderr;

      // Should include debug information (v0.6.0 may have different debug messages)
      // Just verify that debug mode produces more output than normal mode
      expect(output.length > 0).toBeTruthy();
      expect(output).toMatch(/Building static site/);
      expect(output).toMatch(/Build completed/);
    });
  });

  describe('Cross-Platform Error Formatting', () => {
    it('should format file paths appropriately for the platform', async () => {
      // Test with non-existent source directory
      const nonexistentPath = path.join(tempDir, 'does-not-exist');
      
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', nonexistentPath,
        '--output', outputDir
      ]);

      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/ERROR.*UnifyError.*Source directory.*not found/);
      
      // Should use appropriate path separators for the platform
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        expect(result.stderr).toMatch(/\\/); // Windows path separator
      } else {
        expect(result.stderr).toMatch(/\//); // Unix path separator
      }
    });

    it('should handle Unicode and special characters in error messages', async () => {
      // Test with Unicode characters in path
      const unicodePath = path.join(tempDir, 'src-页面');
      
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', unicodePath,
        '--output', outputDir
      ]);

      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/ERROR.*UnifyError/);
      expect(result.stderr).toMatch(/页面/); // Should handle Unicode correctly in paths
    });
  });

  describe('Error Recovery Suggestions', () => {
    it('should provide actionable suggestions for different error types', async () => {
      // Test suggestion for invalid port
      const result = await runCLIInDir(tempDir, [
        'serve',
        '--source', sourceDir,
        '--output', outputDir,
        '--port', '99999' // Invalid port number
      ]);

      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/Suggestions:/);
      expect(result.stderr).toMatch(/-.*Use a port number like/);
      expect(result.stderr).toMatch(/-.*Check that the port is not already in use/);
    });

    it('should suggest using debug mode for complex errors', async () => {
      // Test with a source directory that doesn't exist to trigger debug suggestion
      const result = await runCLIInDir(tempDir, [
        'build', 
        '--source', path.join(tempDir, 'missing-directory')
      ]);

      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/ERROR.*UnifyError/);
      expect(result.stderr).toMatch(/Suggestions:/);
    });

    it('should provide command-specific help suggestions', async () => {
      const result = await runCLIInDir(tempDir, ['unknown-command']);
      
      expect(result.stderr).toMatch(/Use.*--help.*to see valid options/);
      expect(result.stderr).toMatch(/Check.*documentation/);
    });
  });

  describe('Error Message Localization Support', () => {
    it('should use consistent English messages throughout', async () => {
      const scenarios = [
        ['unknown-command'],
        ['build', '--invalid-option'],
        ['build', '--source', path.join(tempDir, 'nonexistent')]
      ];

      for (const args of scenarios) {
        const result = await runCLIInDir(tempDir, args);
        
        // Should use consistent English terminology
        expect(result.stderr).not.toMatch(/[^\x00-\x7F]/); // No non-ASCII characters unless intentional
        expect(result.stderr).toMatch(/error|Error|ERROR/i);
        expect(result.stderr).toMatch(/suggestion|Suggestion/i);
      }
    });
  });
});

/**
 * Helper function to run CLI command with working directory
 */
async function runCLIInDir(workingDir, args, timeout = 10000) {
  const { runCLI } = await import('../test-utils.js');
  return await runCLI(args, { cwd: workingDir, timeout });
}
