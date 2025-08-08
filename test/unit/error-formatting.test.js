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
      const missingArgResult = await runCLIInDir(tempDir, ['build', '--source']);
      
      expect(missingArgResult.code).toBe(2);
      expect(missingArgResult.stderr).toMatch(/ERROR.*UnifyError/);
      expect(missingArgResult.stderr).toMatch(/Suggestions:/);
    });

    it('should format build errors according to spec', async () => {
      const structure = {
        'src/broken.html': '<!--#include file="missing.html" --><p>Content</p>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);

      expect(result.code).toBe(0); // Build succeeds with warnings in normal mode
      expect(result.stderr).toMatch(/\[WARN\].*Include not found.*missing\.html/);
    });

    it('should format perfection mode errors according to spec', async () => {
      const structure = {
        'src/broken.html': '<!--#include file="missing.html" --><p>Content</p>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--perfection'
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/ERROR.*BuildError.*Build failed/);
      expect(result.stderr).toMatch(/Suggestions:/);
      expect(result.stderr).toMatch(/-.*Fix the.*error\(s\)/);
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
        'src/page.html': '<div data-layout="missing-layout.html"><h1>Content</h1></div>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--perfection'
      ]);

      expect(result.code).toBe(1);
      // Should include file name and path in error
      expect(result.stderr).toMatch(/page\.html/);
      expect(result.stderr).toMatch(/missing-layout\.html/);
    });

    it('should format circular dependency errors clearly', async () => {
      const structure = {
        'src/circular.html': '<!--#include file="includes/a.html" -->',
        'src/includes/a.html': '<!--#include file="b.html" -->',
        'src/includes/b.html': '<!--#include file="a.html" -->' // Circular!
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--perfection'
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/circular.*dependency/i);
      expect(result.stderr).toMatch(/a\.html.*b\.html/);
    });

    it('should format path traversal errors clearly', async () => {
      const structure = {
        'src/dangerous.html': '<!--#include file="../../../etc/passwd" -->'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--perfection'
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/path.*traversal|security/i);
      expect(result.stderr).toMatch(/\.\.\/\.\.\//);
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
        'src/warning.html': '<!--#include file="missing.html" --><p>Content</p>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--verbose'
      ]);

      const output = result.stdout + result.stderr;

      // Should have info messages
      expect(output).toMatch(/\[INFO\].*Building static site/);
      expect(output).toMatch(/\[INFO\].*Found.*files/);
      
      // Should have warning messages  
      expect(output).toMatch(/\[WARN\].*Include not found/);
      
      // Should have success message
      expect(output).toMatch(/\[SUCCESS\].*Build completed/);
    });

    it('should provide debug information when verbose mode is enabled', async () => {
      const structure = {
        'src/index.html': '<h1>Content</h1>',
        'src/includes/header.html': '<header>Header</header>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--verbose'
      ]);

      const output = result.stdout + result.stderr;

      // Should include debug information
      expect(output).toMatch(/\[DEBUG\].*Build cache/);
      expect(output).toMatch(/\[DEBUG\].*Processed.*index\.html/);
    });
  });

  describe('Cross-Platform Error Formatting', () => {
    it('should format file paths appropriately for the platform', async () => {
      const structure = {
        'src/broken.html': '<!--#include file="missing.html" -->'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--perfection'
      ]);

      expect(result.code).toBe(1);
      
      // Should use appropriate path separators for the platform
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        expect(result.stderr).toMatch(/\\/); // Windows path separator
      } else {
        expect(result.stderr).toMatch(/\//); // Unix path separator
      }
    });

    it('should handle Unicode and special characters in error messages', async () => {
      const structure = {
        'src/页面.html': '<!--#include file="missing.html" -->' // Chinese characters
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--perfection'
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/页面\.html/); // Should handle Unicode correctly
    });
  });

  describe('Error Recovery Suggestions', () => {
    it('should provide actionable suggestions for different error types', async () => {
      // Test suggestion for missing include
      const structure = {
        'src/page.html': '<!--#include file="missing.html" -->'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--perfection'
      ]);

      expect(result.stderr).toMatch(/Suggestions:/);
      expect(result.stderr).toMatch(/-.*create.*missing\.html/i);
      expect(result.stderr).toMatch(/-.*check.*path/i);
    });

    it('should suggest using debug mode for complex errors', async () => {
      const structure = {
        'src/complex-error.html': '<!--#include file="missing.html" -->'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--perfection'
      ]);

      expect(result.stderr).toMatch(/Run with.*DEBUG.*for more detailed/);
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
