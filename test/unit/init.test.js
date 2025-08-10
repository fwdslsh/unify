import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { init } from '../../src/cli/init.js';
import { createTempDirectory, cleanupTempDirectory } from '../fixtures/temp-helper.js';

describe('Init Command', () => {
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

  test('should parse init command with template argument', async () => {
    const { parseArgs } = await import('../../src/cli/args-parser.js');
    
    const args = parseArgs(['init', 'basic']);
    expect(args.command).toBe('init');
    expect(args.template).toBe('basic');
  });

  test('should parse init command without template argument', async () => {
    const { parseArgs } = await import('../../src/cli/args-parser.js');
    
    const args = parseArgs(['init']);
    expect(args.command).toBe('init');
    expect(args.template).toBeNull();
  });

  test('should throw error for non-existent template', async () => {
    const args = { 
      command: 'init', 
      template: 'nonexistent-template-xyz123' 
    };
    
    await expect(init(args)).rejects.toThrow('Starter template \'nonexistent-template-xyz123\' not found');
  });

  test('should handle network errors gracefully', async () => {
    // Mock fetch to simulate network error
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Network error');
    };
    
    try {
      const args = { command: 'init', template: null };
      await expect(init(args)).rejects.toThrow('Failed to download starter template');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('should handle 404 repository not found', async () => {
    // Mock fetch to simulate 404 response
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.includes('nonexistent-repo')) {
        return new Response(null, { status: 404 });
      }
      return originalFetch(url);
    };
    
    try {
      const args = { command: 'init', template: 'nonexistent-repo' };
      await expect(init(args)).rejects.toThrow('Starter template');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('should handle empty directory check', async () => {
    // Create some files in the directory
    await fs.writeFile(path.join(tempDir, 'existing-file.txt'), 'test content');
    
    // Mock successful download to test directory check logic
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      // Return empty tarball for testing
      return new Response(new ArrayBuffer(0), { 
        status: 200,
        headers: { 'content-type': 'application/gzip' }
      });
    };
    
    try {
      const args = { command: 'init', template: null };
      // Should not throw error for non-empty directory, just warn
      // We expect this to fail at extraction stage, but not at directory check
      await expect(init(args)).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});