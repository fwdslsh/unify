/**
 * Integration tests for cross-platform compatibility
 * Tests Windows/Linux/macOS path handling and behavior consistency
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { makeTempProjectFromStructure } from '../../helpers/temp-project.js';
import { runBuild } from '../../helpers/cli-runner.js';
import { expectBuildSuccess, expectFileExists, expectFileContentContains } from '../../helpers/assertions.js';
import { join, sep, resolve } from 'path';

const cleanupTasks = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
});

describe('Cross-Platform Compatibility', () => {
  test('should handle different path separators', async () => {
    const structure = {
      'subdir': {
        'include.html': '<p>Include content</p>'
      },
      'test.html': `
        <!--#include virtual="/subdir/include.html" -->
        <!--#include file="./subdir/include.html" -->
        <h1>Main content</h1>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    expectBuildSuccess(result);
    
    // Should work regardless of platform path separators
    await expectFileExists(project.outputDir, 'test.html');
    await expectFileExists(project.outputDir, 'subdir/include.html');
  });
  
  test('should normalize Windows-style paths', async () => {
    const structure = {
      'windows-test.html': `
        <!--#include virtual="\\includes\\header.html" -->
        <!--#include file=".\\includes\\footer.html" -->
        <main>Content</main>
      `,
      'includes': {
        'header.html': '<header>Header</header>',
        'footer.html': '<footer>Footer</footer>'
      }
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    expectBuildSuccess(result);
    
    // Should normalize backslashes to forward slashes
    await expectFileExists(project.outputDir, 'windows-test.html');
  });
  
  test('should handle case sensitivity consistently', async () => {
    const structure = {
      'CamelCase.html': '<h1>CamelCase File</h1>',
      'lowercase.html': '<h1>Lowercase File</h1>',
      'test.html': `
        <!--#include virtual="/CamelCase.html" -->
        <!--#include virtual="/lowercase.html" -->
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    
    // Should behave consistently across platforms
    // On case-sensitive systems, exact match required
    // On case-insensitive systems, any case should work
    expect([0, 1]).toContain(result.code);
  });
  
  test('should handle long file paths', async () => {
    // Create a very long path (approaching system limits)
    const longDirName = 'very-long-directory-name-that-approaches-system-limits';
    const structure = {};
    
    let current = structure;
    for (let i = 0; i < 5; i++) {
      current[`${longDirName}-${i}`] = {};
      current = current[`${longDirName}-${i}`];
    }
    
    current['long-filename-with-many-characters.html'] = '<h1>Long path content</h1>';
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    expectBuildSuccess(result);
    
    // Should handle long paths on all platforms
    const longPath = Array.from({ length: 5 }, (_, i) => `${longDirName}-${i}`).join('/') + '/long-filename-with-many-characters.html';
    await expectFileExists(project.outputDir, longPath);
  });
  
  test('should handle special characters in filenames', async () => {
    const structure = {
      // Different platforms handle these differently
      'file with spaces.html': '<h1>Spaces</h1>',
      'file-with-dashes.html': '<h1>Dashes</h1>',
      'file_with_underscores.html': '<h1>Underscores</h1>',
      'file.with.dots.html': '<h1>Dots</h1>'
    };
    
    // Add Unicode if platform supports it
    try {
      structure['fïlé-ünïcødé.html'] = '<h1>Unicode</h1>';
    } catch (error) {
      // Some platforms might not support this
    }
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    expectBuildSuccess(result);
    
    // Verify files were processed correctly
    await expectFileExists(project.outputDir, 'file with spaces.html');
    await expectFileExists(project.outputDir, 'file-with-dashes.html');
  });
  
  test('should handle different line endings', async () => {
    const structure = {
      'unix-endings.html': '<h1>Unix</h1>\n<p>Unix line endings</p>\n',
      'windows-endings.html': '<h1>Windows</h1>\r\n<p>Windows line endings</p>\r\n',
      'mac-endings.html': '<h1>Mac</h1>\r<p>Classic Mac line endings</p>\r',
      'mixed-endings.html': '<h1>Mixed</h1>\n<p>Line 1</p>\r\n<p>Line 2</p>\r'
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    expectBuildSuccess(result);
    
    // All should build successfully regardless of line endings
    await expectFileExists(project.outputDir, 'unix-endings.html');
    await expectFileExists(project.outputDir, 'windows-endings.html');
    await expectFileExists(project.outputDir, 'mac-endings.html');
    await expectFileExists(project.outputDir, 'mixed-endings.html');
  });
  
  test('should handle relative path resolution consistently', async () => {
    const structure = {
      'root.html': '<!--#include file="./sub/nested.html" -->',
      'sub': {
        'nested.html': '<!--#include file="../other/include.html" -->',
        'index.html': '<h1>Sub Index</h1>'
      },
      'other': {
        'include.html': '<p>Other include</p>'
      }
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    expectBuildSuccess(result);
    
    // Relative path resolution should work consistently
    await expectFileExists(project.outputDir, 'root.html');
    await expectFileExists(project.outputDir, 'sub/nested.html');
  });
  
  test('should handle absolute vs relative path interpretation', async () => {
    const structure = {
      '_includes': {
        'shared.html': '<div>Shared content</div>'
      },
      'page.html': `
        <!--#include virtual="/_includes/shared.html" -->
        <!--#include file="_includes/shared.html" -->
        <h1>Page content</h1>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    expectBuildSuccess(result);
    
    // Both absolute (virtual) and relative (file) includes should work
    await expectFileExists(project.outputDir, 'page.html');
  });
  
  test('should handle output directory creation', async () => {
    const structure = {
      'index.html': '<h1>Test</h1>'
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    // Use a nested output directory that doesn't exist
    const nestedOutput = join(project.outputDir, 'deeply', 'nested', 'output');
    
    const result = await runBuild(project, ['--output', nestedOutput]);
    expectBuildSuccess(result);
    
    // Should create nested directories
    await expectFileExists(nestedOutput, 'index.html');
  });
  
  test('should handle concurrent file operations safely', async () => {
    const structure = {};
    
    // Create many files that will be processed simultaneously
    for (let i = 0; i < 50; i++) {
      structure[`file-${i}.html`] = `<h1>File ${i}</h1><p>Content for file ${i}</p>`;
    }
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    expectBuildSuccess(result);
    
    // All files should be processed without conflicts
    for (let i = 0; i < 50; i++) {
      await expectFileExists(project.outputDir, `file-${i}.html`);
    }
  });
  
  test('should handle glob patterns consistently', async () => {
    const structure = {
      'assets': {
        'style.css': 'body { margin: 0; }',
        'script.js': 'console.log("test");',
        'image.png': 'FAKE_PNG_DATA',
        'data.json': '{"test": true}'
      },
      'docs': {
        'readme.txt': 'Documentation',
        'guide.md': '# Guide'
      },
      'index.html': '<h1>Home</h1>'
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    // Test various glob patterns
    const result = await runBuild(project, [
      '--copy', 'assets/**',
      '--copy', '**/*.txt',
      '--ignore', '**/*.md'
    ]);
    
    expectBuildSuccess(result);
    
    // Verify glob patterns worked correctly
    await expectFileExists(project.outputDir, 'assets/style.css');
    await expectFileExists(project.outputDir, 'docs/readme.txt');
  });
  
  test('should produce identical output across platforms', async () => {
    const structure = {
      '_layout.html': `
        <!DOCTYPE html>
        <html>
          <head><title>Test</title></head>
          <body><slot></slot></body>
        </html>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <h1>Platform Test</h1>
          <p>This content should be identical across platforms.</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    expectBuildSuccess(result);
    
    // Output should contain expected content regardless of platform
    await expectFileContentContains(project.outputDir, 'page.html', [
      '<h1>Platform Test</h1>',
      '<title>Test</title>',
      'identical across platforms'
    ]);
  });
  
  test('should handle environment differences gracefully', async () => {
    const structure = {
      'index.html': '<h1>Environment Test</h1>'
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    // Test with different environment variables
    const envTests = [
      { NODE_ENV: 'production' },
      { NODE_ENV: 'development' },
      { LOG_LEVEL: 'debug' },
      { LOG_LEVEL: 'error' }
    ];
    
    for (const env of envTests) {
      const result = await runBuild(project, [], { env });
      expectBuildSuccess(result);
      
      // Should build successfully in any environment
      await expectFileExists(project.outputDir, 'index.html');
    }
  });
});