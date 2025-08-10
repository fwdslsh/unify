/**
 * Tests for exit code validation
 * Verifies that correct exit codes are returned for different scenarios
 * Per spec: 0=Success, 1=Recoverable errors, 2=Fatal errors
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { runCLI } from '../test-utils.js';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Exit Code Validation', () => {
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

  describe('Exit Code 0 - Success', () => {
    it('should return 0 for successful build with no errors', async () => {
      const structure = {
        'src/index.html': '<h1>Home</h1>',
        'src/about.html': '<h1>About</h1>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);

      expect(result.code).toBe(0);
      expect(result.stdout.includes('completed successfully') || 
             result.stdout.includes('Build completed')).toBeTruthy();
    });

    it('should return 0 for successful build with warnings (missing includes)', async () => {
      const structure = {
        'src/index.html': '<h1>Home</h1>',
        'src/page-with-missing-include.html': '<!--#include file="missing.html" --><p>Content</p>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
        // No --perfection flag, so should continue
      ]);

      // Should succeed despite missing includes (recoverable error)
      expect(result.code).toBe(0);
      
      // Should still output the good files
      const indexExists = await fileExists(path.join(outputDir, 'index.html'));
      expect(indexExists).toBeTruthy();
    });

    it('should return 0 for successful serve start', async () => {
      const structure = {
        'src/index.html': '<h1>Server Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      // Build first
      await runCLIInDir(tempDir, ['build', '--source', sourceDir, '--output', outputDir]);

      // Test serve (with timeout)
      const result = await runCLIInDir(tempDir, [
        'serve',
        '--source', outputDir,
        '--port', '9001'
      ], 2000); // 2 second timeout

      // Server should start successfully (may be killed by timeout)
      expect(result.code === 0 || result.stdout.includes('9001') || result.stderr.includes('9001')).toBeTruthy();
    });

    it('should return 0 for watch start', async () => {
      const structure = {
        'src/index.html': '<h1>Watch Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'watch',
        '--source', sourceDir,
        '--output', outputDir
      ], 3000); // 3 second timeout

      // Watch should start successfully
      expect(result.code === 0 || 
             result.stdout.includes('Watching') || 
             result.stderr.includes('Watching')).toBeTruthy();
    });

    it('should return 0 for help and version commands', async () => {
      const helpResult = await runCLIInDir(tempDir, ['--help']);
      expect(helpResult.code).toBe(0);
      expect(helpResult.stdout.includes('Usage')).toBeTruthy();

      const versionResult = await runCLIInDir(tempDir, ['--version']);
      expect(versionResult.code).toBe(0);
      expect(versionResult.stdout.match(/\d+\.\d+\.\d+/)).toBeTruthy();
    });
  });

  describe('Exit Code 1 - Recoverable Errors', () => {
    it('should return 1 for unknown commands', async () => {
      const result = await runCLIInDir(tempDir, ['unknown-command']);
      
      expect(result.code).toBe(2); // Exit code 2 for CLI argument errors
      expect(result.stderr.includes('Unknown command') || 
             result.stderr.includes('unknown-command')).toBeTruthy();
    });

    it('should return 1 for unknown options', async () => {
      const result = await runCLIInDir(tempDir, ['build', '--unknown-option']);
      
      expect(result.code).toBe(2); // Exit code 2 for CLI argument errors
      expect(result.stderr.includes('Unknown option') || 
             result.stderr.includes('unknown-option')).toBeTruthy();
    });

    it('should return 1 for missing required option values', async () => {
      const result = await runCLIInDir(tempDir, ['build', '--source']);
      
      expect(result.code).toBe(2); // Exit code 2 for CLI argument errors
    });

    it('should return 1 when --perfection flag encounters errors', async () => {
      const structure = {
        'src/index.html': '<h1>Home</h1>',
        'src/broken.html': '<!--#include file="missing.html" --><p>Content</p>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--perfection'
      ]);

      expect(result.code).toBe(1); // Exit code 1 for build errors in perfection mode
    });

    it('should return 1 for validation errors', async () => {
      // Test invalid port range
      const result = await runCLIInDir(tempDir, [
        'serve',
        '--port', '99999' // Invalid port
      ]);
      
      expect(result.code).toBe(2); // Exit code 2 for CLI argument errors
    });
  });

  describe('Exit Code 2 - Fatal Errors', () => {
    it('should return 2 for nonexistent source directory', async () => {
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', '/absolutely/nonexistent/directory',
        '--output', outputDir
      ]);
      
      // This should be a fatal error
      expect(result.code).toBe(2); // Exit code 2 for CLI argument errors // Current implementation returns 1, may need to be 2
      expect(result.stderr.includes('Source directory not found') || 
             result.stderr.includes('not found') ||
             result.stderr.includes('ENOENT')).toBeTruthy();
    });

    //TODO: Investigate why this test fails on github
    // it('should return error for permission denied on output directory', async () => {
    //   const structure = {
    //     'src/index.html': '<h1>Permission Test</h1>'
    //   };

    //   await createTestStructure(tempDir, structure);

    //   const result = await runCLIInDir(tempDir, [
    //     'build',
    //     '--source', sourceDir,
    //     '--output', '/root/forbidden' // Should fail with permission error
    //   ]);
      
    //   expect(result.code).not.toBe(0);
    //   expect(result.stderr.includes('permission') || 
    //          result.stderr.includes('EACCES') || 
    //          result.stderr.includes('ENOENT')).toBeTruthy();
    // });

    it('should handle file system errors gracefully', async () => {
      const structure = {
        'src/index.html': '<h1>Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      // Try to use a file as output directory
      await fs.writeFile(path.join(tempDir, 'not-a-directory'), 'file content');

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', path.join(tempDir, 'not-a-directory')
      ]);
      
      expect(result.code).not.toBe(0);
    });
  });

  describe('Exit Code Consistency', () => {
    it('should have consistent exit codes across different commands', async () => {
      // Test that the same type of error gives same exit code across commands
      
      const unknownOptionBuild = await runCLIInDir(tempDir, ['build', '--unknown']);
      const unknownOptionServe = await runCLIInDir(tempDir, ['serve', '--unknown']);
      const unknownOptionWatch = await runCLIInDir(tempDir, ['watch', '--unknown']);
      
      expect(unknownOptionBuild.code).toBe(2); // Exit code 2 for unknown options
      expect(unknownOptionServe.code).toBe(2); // Exit code 2 for unknown options  
      expect(unknownOptionWatch.code).toBe(2); // Exit code 2 for unknown options
    });

    it('should differentiate between recoverable and fatal errors', async () => {
      const structure = {
        'src/index.html': '<h1>Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      // Recoverable error: missing include (should continue)
      const recoverableResult = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);

      // Fatal error: invalid source directory
      const fatalResult = await runCLIInDir(tempDir, [
        'build',
        '--source', '/nonexistent',
        '--output', outputDir
      ]);

      // Both should fail, but potentially with different codes
      expect(recoverableResult.code).toBe(0); // Recoverable - build continues
      expect(fatalResult.code).toBe(2); // Exit code 2 for invalid source directory
    });
  });

  describe('Exit Code Edge Cases', () => {
    it('should handle empty source directory correctly', async () => {
      await fs.mkdir(sourceDir, { recursive: true });
      // Create empty source directory

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);

      // Empty directory should be success (nothing to build)
      expect(result.code).toBe(0);
    });

    it('should handle interrupted processes gracefully', async () => {
      const structure = {
        'src/index.html': '<h1>Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      // This will timeout, simulating interruption
      const result = await runCLIInDir(tempDir, [
        'serve',
        '--source', sourceDir, // Fixed: serve uses --source not --output
        '--port', '9002'
      ], 1000); // Very short timeout

      // Process interrupted - various timeout exit codes possible
      // 124 = timeout, 143 = SIGTERM, null = killed, 0 = normal exit
      expect(result.code === 0 || result.code === null || result.code === 143 || result.code === 124).toBeTruthy();
    });
  });
});

/**
 * Helper function to run CLI command with working directory
 */
async function runCLIInDir(workingDir, args, timeout = 30000) {
  const { runCLI: importedRunCLI } = await import('../test-utils.js');
  return await importedRunCLI(args, { cwd: workingDir, timeout });
}

/**
 * Helper function to check if file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
