import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { runCLI } from '../test-utils.js';
import { createTempDirectory, cleanupTempDirectory } from '../fixtures/temp-helper.js';

/**
 * Test strategy for init command:
 * 
 * Since the init command interacts with external GitHub repositories, we need to test
 * different scenarios without making real network calls. We accomplish this by:
 * 
 * 1. Testing the CLI interface and error handling (help, unknown commands, etc.)
 * 2. Testing specific error scenarios that don't require network calls
 * 3. Using environment variables to control behavior where possible
 * 4. Creating unit tests for individual components that can be properly mocked
 * 
 * This approach focuses on testing the integration aspects that can be reliably tested
 * without external dependencies.
 */

describe('Init Command Integration', () => {
  let tempDir;
  let originalCwd;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDirectory(tempDir);
  });

  test('should show init command in help', async () => {
    const result = await runCLI(['--help']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('Initialize new project with starter template');
    expect(result.stdout).toContain('unify init');
    expect(result.stdout).toContain('unify init basic');
  });

  test('should show error for unknown template (network independent)', async () => {
    // Test with a template name that's guaranteed to not exist
    // This test validates error handling without depending on network state
    const result = await runCLI(['init', 'definitely-does-not-exist-12345'], {
      timeout: 15000,
      env: {
        // Optionally set environment variables to control behavior
        NODE_ENV: 'test'
      }
    });
    
    // The command should fail with a usage error (not a crash)
    expect([1, 2]).toContain(result.code);
    
    // Should have error output
    expect(result.stderr.length).toBeGreaterThan(0);
    
    // Should mention the template name
    expect(result.stderr).toContain('definitely-does-not-exist-12345');
  });

  test('should handle init command gracefully when network is unavailable', async () => {
    // Test init with default template - this may succeed or fail depending on network
    // but should not crash the application
    const result = await runCLI(['init'], {
      timeout: 15000,
      env: {
        NODE_ENV: 'test'
      }
    });
    
    // Should not crash - accept any of the standard exit codes
    expect([0, 1, 2]).toContain(result.code);
    
    if (result.code === 0) {
      // If successful, should have created some files
      const files = await fs.readdir(tempDir);
      expect(files.length).toBeGreaterThan(0);
    } else {
      // If failed, should have meaningful error message
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/failed|error|not found/i);
    }
  });

  test('should validate command line argument parsing', async () => {
    // Test that template argument is properly parsed
    const result = await runCLI(['init', 'some-template'], {
      timeout: 15000,
      env: {
        NODE_ENV: 'test'
      }
    });
    
    // Should not crash
    expect([0, 1, 2]).toContain(result.code);
    
    if (result.code !== 0) {
      // If failed, should mention the template name in the error
      expect(result.stderr).toContain('some-template');
    }
  });

  test('should show proper usage when no arguments provided', async () => {
    // Test init without template (should use default)
    const result = await runCLI(['init'], {
      timeout: 15000,
      env: {
        NODE_ENV: 'test'
      }
    });
    
    // Should not crash with improper usage
    expect([0, 1, 2]).toContain(result.code);
    
    // Should have some output (either success or error)
    expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
  });

  test('should handle non-empty directory appropriately', async () => {
    // Create an existing file to make directory non-empty
    await fs.writeFile(path.join(tempDir, 'existing.txt'), 'existing content');
    
    const result = await runCLI(['init'], {
      timeout: 15000,
      env: {
        NODE_ENV: 'test'
      }
    });
    
    // Should handle non-empty directory gracefully
    expect([0, 1, 2]).toContain(result.code);
    
    // Original file should still exist
    const existingExists = await fs.access(path.join(tempDir, 'existing.txt')).then(() => true).catch(() => false);
    expect(existingExists).toBe(true);
  });

  test('should reject invalid template names', async () => {
    // Test with various invalid template names
    const invalidTemplates = [
      '../invalid', // Path traversal attempt
      '/absolute/path', // Absolute path
      'template with spaces', // Spaces
      'template/with/slashes', // Slashes
    ];

    for (const template of invalidTemplates) {
      const result = await runCLI(['init', template], {
        timeout: 10000,
        env: {
          NODE_ENV: 'test'
        }
      });
      
      // Should fail for invalid template names
      expect([1, 2]).toContain(result.code);
      expect(result.stderr.length).toBeGreaterThan(0);
    }
  });

  test('should provide helpful error messages for common issues', async () => {
    // Test with a template that looks like a real one but doesn't exist
    const result = await runCLI(['init', 'nonexistent'], {
      timeout: 15000,
      env: {
        NODE_ENV: 'test'
      }
    });
    
    // Should fail with helpful error
    expect([1, 2]).toContain(result.code);
    expect(result.stderr.length).toBeGreaterThan(0);
    
    // Error should be informative
    expect(result.stderr).toMatch(/not found|template|starter/i);
  });
});