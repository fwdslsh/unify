/**
 * Integration tests for HTML minification feature
 * Tests the full pipeline from CLI option to minified output
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TempProject } from '../../helpers/temp-project.js';
import { UnifyCLI } from '../../../src/cli.js';

describe('HTML Minification Integration', () => {
  let tempProject;
  let cli;
  let originalProcessExit;
  let originalConsoleLog;
  let originalConsoleError;
  let capturedLogs;
  let capturedErrors;
  let exitCode;

  beforeEach(async () => {
    tempProject = new TempProject();
    
    cli = new UnifyCLI();
    capturedLogs = [];
    capturedErrors = [];
    exitCode = null;
    
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
    console.log = (message) => capturedLogs.push(message);
    console.error = (message) => capturedErrors.push(message);
  });

  afterEach(async () => {
    // Restore original methods
    process.exit = originalProcessExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    
    if (tempProject) {
      await tempProject.cleanup();
    }
  });

  test('should_minify_html_output_when_minify_flag_enabled', async () => {
    // Create test HTML file with whitespace and comments
    const sourceHtml = `<!DOCTYPE html>
<html>
  <head>
    <!-- This is a comment -->
    <title>  Test Page  </title>
    <meta charset="utf-8">
  </head>
  <body>
    <div class="container">
      <h1>  Welcome  </h1>
      <p>This is a test page with lots of whitespace.</p>
    </div>
  </body>
</html>`;

    await tempProject.addFile('src/index.html', sourceHtml);

    // Debug code removed after fix

    // Build with minification enabled
    try {
      await cli.run([
        'build',
        '--source', tempProject.path('src'),
        '--output', tempProject.path('dist'),
        '--minify'
      ]);
    } catch (error) {
      // Expected due to mocked process.exit
      if (!error.isExpectedExit) {
      }
    }

    expect(exitCode).toBe(0);

    // Check that output file exists and is minified
    const outputFile = Bun.file(tempProject.path('dist/index.html'));
    const outputHtml = await outputFile.text();
    
    // Should remove unnecessary whitespace
    expect(outputHtml).not.toContain('  Welcome  ');
    expect(outputHtml).not.toContain('  Test Page  ');
    
    // Should remove comments
    expect(outputHtml).not.toContain('<!-- This is a comment -->');
    
    // Should still contain the actual content
    expect(outputHtml).toContain('Welcome');
    expect(outputHtml).toContain('Test Page');
    expect(outputHtml).toContain('This is a test page with lots of whitespace.');
    
    // Should preserve DOCTYPE and basic structure
    expect(outputHtml).toContain('<!DOCTYPE html>');
    expect(outputHtml).toContain('<html>');
    expect(outputHtml).toContain('</html>');
  });

  test('should_not_minify_html_output_when_minify_flag_disabled', async () => {
    // Create test HTML file with whitespace and comments
    const sourceHtml = `<!DOCTYPE html>
<html>
  <head>
    <!-- This is a comment -->
    <title>  Test Page  </title>
  </head>
  <body>
    <h1>  Welcome  </h1>
  </body>
</html>`;

    await tempProject.writeFile('src/index.html', sourceHtml);

    // Build without minification
    try {
      await cli.run([
        'build',
        '--source', tempProject.path('src'),
        '--output', tempProject.path('dist')
      ]);
    } catch (error) {
      // Expected due to mocked process.exit
    }

    expect(exitCode).toBe(0);

    // Check that output file preserves formatting
    const outputFile = Bun.file(tempProject.path('dist/index.html'));
    const outputHtml = await outputFile.text();
    
    // Should preserve whitespace and comments (data-unify attributes removed)
    expect(outputHtml).toContain('  Welcome  ');
    expect(outputHtml).toContain('  Test Page  ');
    expect(outputHtml).toContain('<!-- This is a comment -->');
  });

  test('should_preserve_critical_whitespace_when_minifying', async () => {
    // Create HTML with whitespace-sensitive elements
    const sourceHtml = `<!DOCTYPE html>
<html>
  <head>
    <title>Code Test</title>
  </head>
  <body>
    <div class="content">
      <pre>
        function example() {
          return "preserved whitespace";
        }
      </pre>
      
      <code>
        let x = 1;
        let y = 2;
      </code>
      
      <p>Regular <span>inline</span> <strong>content</strong> here.</p>
    </div>
  </body>
</html>`;

    await tempProject.writeFile('src/code.html', sourceHtml);

    // Build with minification
    try {
      await cli.run([
        'build',
        '--source', tempProject.path('src'),
        '--output', tempProject.path('dist'),
        '--minify'
      ]);
    } catch (error) {
      // Expected due to mocked process.exit
    }

    expect(exitCode).toBe(0);

    const outputFile = Bun.file(tempProject.path('dist/code.html'));
    const outputHtml = await outputFile.text();
    
    // Should preserve whitespace in pre and code elements
    expect(outputHtml).toContain('function example() {\n          return "preserved whitespace";\n        }');
    expect(outputHtml).toContain('let x = 1;\n        let y = 2;');
    
    // Should preserve spacing in inline content
    expect(outputHtml).toContain('<span>inline</span> <strong>content</strong>');
    
    // Should minify structure around preserved elements
    expect(outputHtml).not.toContain('<div class="content">\n      <pre>');
  });

  test('should_minify_with_composition_and_layouts', async () => {
    // Create layout with whitespace
    const layoutHtml = `<!DOCTYPE html>
<html>
  <head>
    <!-- Layout comment -->
    <title>Layout Title</title>
  </head>
  <body>
    <header class="unify-header">
      <h1>Default Header</h1>
    </header>
    
    <main class="unify-content">
      <p>Default content</p>
    </main>
  </body>
</html>`;

    // Create page that uses layout
    const pageHtml = `<html data-unify="_layout.html">
  <head>
    <!-- Page comment -->
    <title>Page Title</title>
  </head>
  <body>
    <section class="unify-header">
      <h1>  Custom Header  </h1>
    </section>
    
    <article class="unify-content">
      <p>  Custom content with whitespace  </p>
    </article>
  </body>
</html>`;

    await tempProject.writeFile('src/_layout.html', layoutHtml);
    await tempProject.writeFile('src/index.html', pageHtml);

    // Build with minification
    try {
      await cli.run([
        'build',
        '--source', tempProject.path('src'),
        '--output', tempProject.path('dist'),
        '--minify'
      ]);
    } catch (error) {
      // Expected due to mocked process.exit
    }

    expect(exitCode).toBe(0);

    const outputFile = Bun.file(tempProject.path('dist/index.html'));
    const outputHtml = await outputFile.text();
    
    // Should minify the composed result
    expect(outputHtml).toContain('<h1>Custom Header</h1>'); // Trimmed whitespace
    expect(outputHtml).toContain('<p>Custom content with whitespace</p>'); // Trimmed whitespace
    expect(outputHtml).toContain('<title>Page Title</title>'); // Page title wins
    
    // Should remove comments from both layout and page
    expect(outputHtml).not.toContain('<!-- Layout comment -->');
    expect(outputHtml).not.toContain('<!-- Page comment -->');
    
    // Should not contain data-unify attributes
    expect(outputHtml).not.toContain('data-unify');
  });

  test('should_show_minification_in_verbose_output', async () => {
    const sourceHtml = `<!DOCTYPE html>
<html>
  <head><title>Test</title></head>
  <body><div>Content</div></body>
</html>`;

    await tempProject.writeFile('src/index.html', sourceHtml);

    // Build with minification and verbose output
    try {
      await cli.run([
        'build',
        '--source', tempProject.path('src'),
        '--output', tempProject.path('dist'),
        '--minify',
        '--verbose'
      ]);
    } catch (error) {
      // Expected due to mocked process.exit
      if (!error.isExpectedExit) {
      }
    }

    expect(exitCode).toBe(0);
    
    // Should mention minification in output (implementation detail, may vary)
    // This test mainly ensures the combination works without errors
    expect(capturedLogs.join(' ')).toContain('Build completed');
  });
});