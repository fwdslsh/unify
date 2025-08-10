import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { runCLI } from '../test-utils.js';
import { createTempDirectory, cleanupTempDirectory } from '../fixtures/temp-helper.js';

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

  test('should show error for unknown template', async () => {
    const result = await runCLI(['init', 'nonexistent-template-xyz123'], {
      timeout: 30000 // Give it time to check GitHub
    });
    
    expect(result.code).toBe(2); // Usage error
    expect(result.stderr).toContain('Starter template \'nonexistent-template-xyz123\' not found');
  });

  test('should handle init command without template argument', async () => {
    // This test will actually try to download the default starter
    // but we'll expect it to fail due to network/rate limiting issues in CI
    const result = await runCLI(['init'], {
      timeout: 30000
    });
    
    // We expect either success (0) or failure (1/2) but not crash
    expect([0, 1, 2]).toContain(result.code);
    
    if (result.code === 0) {
      // If successful, check that files were created
      const files = await fs.readdir(tempDir);
      expect(files.length).toBeGreaterThan(0);
    } else {
      // If failed, should have error message
      expect(result.stderr.length).toBeGreaterThan(0);
    }
  });

  test('should validate template argument parsing', async () => {
    const result = await runCLI(['init', 'basic'], {
      timeout: 30000
    });
    
    // Should attempt to download the basic template
    expect([0, 1, 2]).toContain(result.code);
    
    if (result.code !== 0) {
      // Should mention the specific template name in error
      expect(result.stderr).toContain('basic');
    }
  });

  test('should show proper error message for network issues', async () => {
    // Test with a definitely non-existent template to trigger network error handling
    const result = await runCLI(['init', 'definitely-nonexistent-template-xyz123'], {
      timeout: 30000
    });
    
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('not found');
  });
});