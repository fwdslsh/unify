/**
 * Tests for missing CLI options: --host and --verbose
 * Completes CLI option test coverage per spec requirements
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { runCLI } from '../test-utils.js';
import { parseArgs } from '../../src/cli/args-parser.js';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('Complete CLI Options Coverage', () => {
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

  describe('--host Option', () => {
    it('should parse --host option correctly', () => {
      const args = parseArgs(['serve', '--host', '0.0.0.0']);
      expect(args.host).toBe('0.0.0.0');
    });

    it('should default to localhost when --host not specified', () => {
      const args = parseArgs(['serve']);
      expect(args.host).toBe('localhost');
    });

    it('should accept various host formats', () => {
      const localhostArgs = parseArgs(['serve', '--host', 'localhost']);
      expect(localhostArgs.host).toBe('localhost');

      const ipArgs = parseArgs(['serve', '--host', '192.168.1.100']);
      expect(ipArgs.host).toBe('192.168.1.100');

      const allInterfacesArgs = parseArgs(['serve', '--host', '0.0.0.0']);
      expect(allInterfacesArgs.host).toBe('0.0.0.0');

      const domainArgs = parseArgs(['serve', '--host', 'mysite.local']);
      expect(domainArgs.host).toBe('mysite.local');
    });

    it('should work with serve command and custom host', async () => {
      const structure = {
        'src/index.html': '<h1>Host Test</h1>'
      };

      await createTestStructure(tempDir, structure);
      
      // Build first
      await runCLIInDir(tempDir, ['build', '--source', sourceDir, '--output', outputDir]);

      // Test serve with custom host
      const result = await runCLIInDir(tempDir, [
        'serve',
        '--source', outputDir,
        '--host', '0.0.0.0',
        '--port', '9003'
      ], 2000);

      // Should start successfully and mention the host or be listening
      expect(result.code === 0 || 
             result.stdout.includes('0.0.0.0') || 
             result.stderr.includes('0.0.0.0') ||
             result.stdout.includes('9003') || 
             result.stderr.includes('9003')).toBeTruthy();
    });

    it('should combine --host with --port correctly', () => {
      const args = parseArgs(['serve', '--host', '192.168.1.100', '--port', '8080']);
      expect(args.host).toBe('192.168.1.100');
      expect(args.port).toBe(8080);
    });

    it('should work with IPv6 addresses', () => {
      const args = parseArgs(['serve', '--host', '::1']);
      expect(args.host).toBe('::1');
    });
  });

  describe('--verbose Option', () => {
    it('should parse --verbose option correctly', () => {
      const args = parseArgs(['build', '--verbose']);
      expect(args.verbose).toBe(true);
    });

    it('should default to false when --verbose not specified', () => {
      const args = parseArgs(['build']);
      expect(args.verbose).toBe(false);
    });

    it('should work with all commands', () => {
      const buildArgs = parseArgs(['build', '--verbose']);
      expect(buildArgs.verbose).toBe(true);

      const serveArgs = parseArgs(['serve', '--verbose']);
      expect(serveArgs.verbose).toBe(true);

      const watchArgs = parseArgs(['watch', '--verbose']);
      expect(watchArgs.verbose).toBe(true);
    });

    it('should enable debug logging when --verbose is used', async () => {
      const structure = {
        'src/index.html': '<h1>Verbose Test</h1>',
        'src/about.html': '<!--#include file="../includes/header.html" --><p>Content</p>',
        'src/includes/header.html': '<header>Header</header>'
      };

      await createTestStructure(tempDir, structure);

      // Build with verbose
      const verboseResult = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--verbose'
      ]);

      // Build without verbose
      await fs.rm(outputDir, { recursive: true, force: true });
      
      const normalResult = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);

      expect(verboseResult.code).toBe(0);
      expect(normalResult.code).toBe(0);

      // Verbose output should contain more debug information
      const verboseOutput = verboseResult.stdout + verboseResult.stderr;
      const normalOutput = normalResult.stdout + normalResult.stderr;

      // Verbose should have more output (debug messages)
      expect(verboseOutput.length > normalOutput.length).toBeTruthy();
    });

    it('should combine with other options correctly', () => {
      const args = parseArgs([
        'build', 
        '--verbose', 
        '--source', 'custom-src',
        '--output', 'custom-dist',
        '--clean',
        '--minify'
      ]);

      expect(args.verbose).toBe(true);
      expect(args.source).toBe('custom-src');
      expect(args.output).toBe('custom-dist');
      expect(args.clean).toBe(true);
      expect(args.minify).toBe(true);
    });

    it('should work with fail-on error flag', async () => {
      const structure = {
        'src/index.html': '<h1>Verbose + Fail on Error</h1>',
        'src/broken.html': '<!--#include file="missing.html" --><p>Content</p>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--verbose',
        '--fail-on', 'error'
      ]);

      expect(result.code).toBe(1); // Should fail due to missing include
      
      // Should have verbose error output
      const output = result.stdout + result.stderr;
      expect(output.length > 0).toBeTruthy();
    });
  });

  describe('Complete CLI Option Integration', () => {
    it('should handle all major options together', () => {
      const args = parseArgs([
        'serve',
        '--source', 'content',
        '--output', 'public',
        '--port', '3000',
        '--host', '0.0.0.0',
        '--base-url', 'https://example.com',
        '--verbose',
        '--clean',
        '--minify',
        '--pretty-urls'
      ]);

      expect(args.command).toBe('serve');
      expect(args.source).toBe('content');
      expect(args.output).toBe('public');
      expect(args.port).toBe(3000);
      expect(args.host).toBe('0.0.0.0');
      expect(args.baseUrl).toBe('https://example.com');
      expect(args.verbose).toBe(true);
      expect(args.clean).toBe(true);
      expect(args.minify).toBe(true);
      expect(args.prettyUrls).toBe(true);
    });

    it('should validate that all spec options are implemented', () => {
      // Test that all options from the spec are available
      const allOptionsArgs = parseArgs([
        'build',
        '--source', 'src',
        '--output', 'dist',
        '--port', '3000',
        '--host', 'localhost',
        '--pretty-urls',
        '--base-url', 'https://example.com',
        '--clean',
        '--no-sitemap',
        '--fail-on', 'error',
        '--minify',
        '--verbose'
      ]);

      // Verify all spec options are parsed
      expect(allOptionsArgs.source).toBe('src');
      expect(allOptionsArgs.output).toBe('dist');
      expect(allOptionsArgs.port).toBe(3000);
      expect(allOptionsArgs.host).toBe('localhost');
      expect(allOptionsArgs.prettyUrls).toBe(true);
      expect(allOptionsArgs.baseUrl).toBe('https://example.com');
      expect(allOptionsArgs.clean).toBe(true);
      expect(allOptionsArgs.sitemap).toBe(false); // --no-sitemap
      expect(allOptionsArgs.failOn).toBe('error');
      expect(allOptionsArgs.minify).toBe(true);
      expect(allOptionsArgs.verbose).toBe(true);
    });

    it('should handle short flags for new options', () => {
      // Test that existing short flags still work
      const args = parseArgs([
        'serve',
        '-s', 'src',
        '-o', 'dist',
        '-p', '8080',
        '--host', '0.0.0.0', // No short flag for host
        '--verbose' // No short flag for verbose
      ]);

      expect(args.source).toBe('src');
      expect(args.output).toBe('dist');
      expect(args.port).toBe(8080);
      expect(args.host).toBe('0.0.0.0');
      expect(args.verbose).toBe(true);
    });
  });

  describe('Error Handling for New Options', () => {
    it('should handle invalid host values gracefully', async () => {
      const structure = {
        'src/index.html': '<h1>Host Error Test</h1>'
      };

      await createTestStructure(tempDir, structure);
      
      await runCLIInDir(tempDir, ['build', '--source', sourceDir, '--output', outputDir]);

      // Test with obviously invalid host
      const result = await runCLIInDir(tempDir, [
        'serve',
        '--source', outputDir,
        '--host', 'invalid..host..name',
        '--port', '9004'
      ], 2000);

      // Should either start successfully or fail gracefully
      expect(result.code === 0 || result.code === 1).toBeTruthy();
    });

    it('should handle verbose flag with errors', async () => {
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', '/nonexistent',
        '--verbose'
      ]);

      expect(result.code).toBe(2); // Exit code 2 for CLI argument errors (nonexistent source)
      
      // Should have error output even with verbose
      const output = result.stdout + result.stderr;
      expect(output.includes('not found') || 
             output.includes('ENOENT') ||
             output.includes('directory')).toBeTruthy();
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
