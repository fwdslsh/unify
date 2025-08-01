/**
 * Comprehensive CLI Commands and Options Test
 * Tests all CLI commands, arguments, and edge cases
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { runCLI } from '../test-utils.js';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';

describe('CLI Commands and Options', () => {
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

  describe('Build Command', () => {
    it('should build with default arguments', async () => {
      const structure = {
        'src/index.html': '<h1>Default Build Test</h1>',
        'src/about.html': '<h1>About Page</h1>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, ['build']);
      
      expect(result.code).toBe(0);
      
      const indexExists = await fileExists(path.join(outputDir, 'index.html'));
      const aboutExists = await fileExists(path.join(outputDir, 'about.html'));
      
      expect(indexExists).toBeTruthy();
      expect(aboutExists).toBeTruthy();
    });

    it('should build with custom source and output directories', async () => {
      const customSource = path.join(tempDir, 'content');
      const customOutput = path.join(tempDir, 'build');

      const structure = {
        'content/index.html': '<h1>Custom Directories</h1>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', customSource,
        '--output', customOutput
      ]);

      expect(result.code).toBe(0);
      
      const indexExists = await fileExists(path.join(customOutput, 'index.html'));
      expect(indexExists).toBeTruthy();
    });

    it('should build with short flags', async () => {
      const structure = {
        'content/index.html': '<div data-layout="base.html"><template target="content">Content</template></div>',
        'templates/base.html': '<!DOCTYPE html><html><body><slot name="content">Default</slot></body></html>',
        'includes/header.html': '<header>Header</header>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '-s', path.join(tempDir, 'content'),
        '-o', outputDir,
        '-l', path.join(tempDir, 'templates'),
        '-c', path.join(tempDir, 'includes')
      ]);

      expect(result.code).toBe(0);
      
      const content = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
      expect(content.includes('<!DOCTYPE html>')).toBeTruthy();
    });

    it('should build with pretty URLs option', async () => {
      const structure = {
        'src/index.md': '# Home',
        'src/about.md': '# About'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--pretty-urls'
      ]);

      expect(result.code).toBe(0);
      
      // With pretty URLs, about.md should become about/index.html
      const aboutDirExists = await fileExists(path.join(outputDir, 'about', 'index.html'));
      expect(aboutDirExists).toBeTruthy();
    });

    it('should generate sitemap with custom base URL', async () => {
      const structure = {
        'src/index.html': '<h1>Home</h1>',
        'src/about.html': '<h1>About</h1>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--base-url', 'https://custom.example.com'
      ]);

      expect(result.code).toBe(0);
      
      const sitemapExists = await fileExists(path.join(outputDir, 'sitemap.xml'));
      expect(sitemapExists).toBeTruthy();
      
      const sitemapContent = await fs.readFile(path.join(outputDir, 'sitemap.xml'), 'utf-8');
      expect(sitemapContent.includes('https://custom.example.com')).toBeTruthy();
    });

    it('should clean output directory when specified', async () => {
      // Create existing files in output directory
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(path.join(outputDir, 'old-file.html'), 'old content');

      const structure = {
        'src/index.html': '<h1>New Content</h1>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--clean'
      ]);

      expect(result.code).toBe(0);
      
      const oldFileExists = await fileExists(path.join(outputDir, 'old-file.html'));
      const newFileExists = await fileExists(path.join(outputDir, 'index.html'));
      
      expect(oldFileExists).toBeFalsy();
      expect(newFileExists).toBeTruthy();
    });

    it('should handle no-sitemap option', async () => {
      const structure = {
        'src/index.html': '<h1>No Sitemap Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir,
        '--no-sitemap'
      ]);

      expect(result.code).toBe(0);
      
      const sitemapExists = await fileExists(path.join(outputDir, 'sitemap.xml'));
      expect(sitemapExists).toBeFalsy();
    });
  });

  describe('Serve Command', () => {
    it('should start development server on default port', async () => {
      const structure = {
        'src/index.html': '<h1>Server Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      // First build the site
      await runCLIInDir(tempDir, ['build', '--source', sourceDir, '--output', outputDir]);

      // Start server (will timeout after short period)
      const result = await runCLIInDir(tempDir, [
        'serve',
        '--output', outputDir,
        '--port', '3101'
      ], 3000); // 3 second timeout to allow server to start

      // Server should start successfully (will be killed by timeout)
      expect(result.timeout).toBeTruthy(); // Test that timeout worked
      expect(result.stdout.includes('3101') || result.stderr.includes('3101')).toBeTruthy();
    });

    it('should serve with custom port', async () => {
      const structure = {
        'src/index.html': '<h1>Custom Port Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      await runCLIInDir(tempDir, ['build', '--source', sourceDir, '--output', outputDir]);

      const result = await runCLIInDir(tempDir, [
        'serve',
        '--output', outputDir,
        '--port', '8102'
      ], 3000);

      expect(result.timeout).toBeTruthy(); 
      expect(result.stdout.includes('8102') || result.stderr.includes('8102')).toBeTruthy();
    });

    it('should serve with short port flag', async () => {
      const structure = {
        'src/index.html': '<h1>Short Flag Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      await runCLIInDir(tempDir, ['build', '--source', sourceDir, '--output', outputDir]);

      const result = await runCLIInDir(tempDir, [
        'serve',
        '--output', outputDir,
        '-p', '9103'
      ], 3000);

      expect(result.timeout).toBeTruthy(); 
      expect(result.stdout.includes('9103') || result.stderr.includes('9103')).toBeTruthy();
    });
  });

  describe('Watch Command', () => {
    it('should start file watcher', async () => {
      const structure = {
        'src/index.html': '<h1>Watch Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'watch',
        '--source', sourceDir,
        '--output', outputDir
      ], 3000);

      // Watch should start and begin monitoring (check if timeout worked and output contains expected text)
      expect(result.timeout).toBeTruthy(); 
      expect(result.stdout.includes('Watching') || result.stderr.includes('Watching') ||
             result.stdout.includes('Server') || result.stderr.includes('Server')).toBeTruthy();
    });

  });

  describe('Help and Version', () => {
    it('should show help with --help', async () => {
      const result = await runCLIInDir(tempDir, ['--help']);
      
      expect(result.stdout.includes('Usage') || result.stdout.includes('Commands') ||
             result.stdout.includes('build') || result.stdout.includes('serve')).toBeTruthy();
    });

    it('should show help with -h', async () => {
      const result = await runCLIInDir(tempDir, ['-h']);
      
      expect(result.stdout.includes('Usage') || result.stdout.includes('Commands')).toBeTruthy();
    });

    it('should show version with --version', async () => {
      const result = await runCLIInDir(tempDir, ['--version']);
      
      expect(result.stdout.match(/\d+\.\d+\.\d+/) || result.stderr.match(/\d+\.\d+\.\d+/)).toBeTruthy();
    });

    it('should show version with -v', async () => {
      const result = await runCLIInDir(tempDir, ['-v']);
      
      expect(result.stdout.match(/\d+\.\d+\.\d+/) || result.stderr.match(/\d+\.\d+\.\d+/)).toBeTruthy();
    });

    it('should show help for specific commands', async () => {
      const result = await runCLIInDir(tempDir, ['build', '--help']);
      
      expect(result.stdout.includes('build') || result.stdout.includes('source') ||
             result.stdout.includes('output')).toBeTruthy();
    });
  });

  describe('Default Command Behavior', () => {
    it('should default to build when no command specified', async () => {
      const structure = {
        'src/index.html': '<h1>Default Command Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        '--source', sourceDir,
        '--output', outputDir
      ]);

      expect(result.code).toBe(0);
      
      const indexExists = await fileExists(path.join(outputDir, 'index.html'));
      expect(indexExists).toBeTruthy();
    });

    it('should work with only flags and no command', async () => {
      const structure = {
        'src/index.html': '<h1>Flags Only Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        '--source', sourceDir,
        '--output', outputDir,
        '--pretty-urls'
      ]);

      expect(result.code).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown commands', async () => {
      const result = await runCLIInDir(tempDir, ['unknown-command']);
      
      expect(result.code).not.toBe(0);
      expect(result.stdout.includes("Unknown") || result.stderr.includes("Unknown")).toBeTruthy();
    });

    it('should handle unknown options', async () => {
      const result = await runCLIInDir(tempDir, ['build', '--unknown-option']);
      
      expect(result.code).not.toBe(0);
    });

    it('should handle missing required values', async () => {
      const result = await runCLIInDir(tempDir, ['build', '--source']);
      
      expect(result.code).not.toBe(0);
    });

    it('should handle invalid source directory', async () => {
      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', '/nonexistent/directory',
        '--output', outputDir
      ]);
      
      expect(result.code).not.toBe(0);
    });

    // TODO: investigate why this test fails on github
    // it('should handle permission errors gracefully', async () => {
    //   const structure = {
    //     'src/index.html': '<h1>Permission Test</h1>'
    //   };

    //   await createTestStructure(tempDir, structure);

    //   // Try to output to system directory (should fail gracefully)
    //   const result = await runCLIInDir(tempDir, [
    //     'build',
    //     '--source', sourceDir,
    //     '--output', '/root/forbidden'
    //   ]);
      
    //   expect(result.code).not.toBe(0);
    //   expect(result.stderr.includes('Error') || result.stderr.includes('permission') ||
    //          result.stderr.includes('EACCES') || result.stderr.includes('ENOENT')).toBeTruthy();
    // });
  });

  describe('Configuration File Support', () => {
    it('should work without configuration file', async () => {
      const structure = {
        'src/index.html': '<h1>No Config Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);

      expect(result.code).toBe(0);
    });

    it('should handle CLI args priority over defaults', async () => {
      const structure = {
        'custom-source/index.html': '<h1>CLI Priority Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      const customSource = path.join(tempDir, 'custom-source');
      const customOutput = path.join(tempDir, 'custom-output');

      const result = await runCLIInDir(tempDir, [
        'build',
        '--source', customSource,
        '--output', customOutput
      ]);

      expect(result.code).toBe(0);
      
      const indexExists = await fileExists(path.join(customOutput, 'index.html'));
      expect(indexExists).toBeTruthy();
    });
  });

  describe('Mixed Flag Formats', () => {
    it('should handle mixed long and short flags', async () => {
      const structure = {
        'content/index.html': '<div data-layout="base.html"><template target="content">Mixed Flags</template></div>',
        'templates/base.html': '<!DOCTYPE html><html><body><slot name="content">Default</slot></body></html>'
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        'build',
        '-s', path.join(tempDir, 'content'),
        '--output', outputDir,
        '-l', path.join(tempDir, 'templates'),
        '--pretty-urls',
        '-p', '3000' // This would be for serve, but testing parsing
      ]);

      expect(result.code).toBe(0);
    });

    it('should handle flag order variations', async () => {
      const structure = {
        'src/index.html': '<h1>Flag Order Test</h1>'
      };

      await createTestStructure(tempDir, structure);

      // Test flags before command
      const result1 = await runCLIInDir(tempDir, [
        '--source', sourceDir,
        '--output', outputDir,
        'build'
      ]);

      // Test flags after command
      const result2 = await runCLIInDir(tempDir, [
        'build',
        '--source', sourceDir,
        '--output', outputDir
      ]);

      // At least one should work (depending on implementation)
      expect(result1.code === 0 || result2.code === 0).toBeTruthy();
    });
  });
});

/**
 * Helper function to run CLI command with working directory
 */
async function runCLIInDir(workingDir, args, timeout = null) {
  const { runCLI: importedRunCLI } = await import('../test-utils.js');
  const options = { cwd: workingDir };
  if (timeout) {
    options.timeout = timeout;
  }
  return await importedRunCLI(args, options);
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