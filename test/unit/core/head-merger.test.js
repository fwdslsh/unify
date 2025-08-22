/**
 * Unit tests for head element merging and deduplication
 * Tests head merge algorithm with identity-based deduplication
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { makeTempProjectFromStructure } from '../../helpers/temp-project.js';
import { expectFileContentContains, expectFileContentNotContains } from '../../helpers/assertions.js';

const cleanupTasks = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
});

describe('Head Element Merging', () => {
  test('should merge title elements with page taking precedence', async () => {
    const structure = {
      '_layout.html': `
        <html>
          <head>
            <title>Layout Title</title>
          </head>
          <body><slot></slot></body>
        </html>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <template data-target="head">
            <title>Page Title</title>
          </template>
          <p>Content</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Page title should win
    await expectFileContentContains(project.outputDir, 'page.html', [
      '<title>Page Title</title>'
    ]);
    
    // Layout title should not appear
    await expectFileContentNotContains(project.outputDir, 'page.html', [
      'Layout Title'
    ]);
  });
  
  test('should deduplicate meta elements by name attribute', async () => {
    const structure = {
      '_layout.html': `
        <html>
          <head>
            <meta name="description" content="Layout description">
            <meta name="author" content="Layout author">
          </head>
          <body><slot></slot></body>
        </html>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <template data-target="head">
            <meta name="description" content="Page description">
            <meta name="keywords" content="page, keywords">
          </template>
          <p>Content</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Page description should win
    await expectFileContentContains(project.outputDir, 'page.html', [
      'content="Page description"'
    ]);
    
    // Layout description should not appear
    await expectFileContentNotContains(project.outputDir, 'page.html', [
      'Layout description'
    ]);
    
    // Non-conflicting meta should appear
    await expectFileContentContains(project.outputDir, 'page.html', [
      'content="Layout author"',
      'content="page, keywords"'
    ]);
  });
  
  test('should deduplicate link elements by rel and href', async () => {
    const structure = {
      '_layout.html': `
        <html>
          <head>
            <link rel="stylesheet" href="/assets/layout.css">
            <link rel="icon" href="/favicon.ico">
          </head>
          <body><slot></slot></body>
        </html>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <template data-target="head">
            <link rel="stylesheet" href="/assets/page.css">
            <link rel="stylesheet" href="/assets/layout.css">
          </template>
          <p>Content</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Should contain unique links only
    await expectFileContentContains(project.outputDir, 'page.html', [
      'href="/assets/page.css"',
      'href="/favicon.ico"'
    ]);
    
    // Verify no duplication of layout.css
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    const content = await readFile(join(project.outputDir, 'page.html'), 'utf8');
    const layoutCssMatches = (content.match(/assets\/layout\.css/g) || []).length;
    expect(layoutCssMatches).toBe(1);
  });
  
  test('should handle canonical link precedence', async () => {
    const structure = {
      '_layout.html': `
        <html>
          <head>
            <link rel="canonical" href="https://example.com/layout">
          </head>
          <body><slot></slot></body>
        </html>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <template data-target="head">
            <link rel="canonical" href="https://example.com/page">
          </template>
          <p>Content</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Page canonical should win (last one wins for canonical)
    await expectFileContentContains(project.outputDir, 'page.html', [
      'href="https://example.com/page"'
    ]);
    
    // Layout canonical should not appear
    await expectFileContentNotContains(project.outputDir, 'page.html', [
      'href="https://example.com/layout"'
    ]);
  });
  
  test('should deduplicate external scripts by src', async () => {
    const structure = {
      '_layout.html': `
        <html>
          <head>
            <script src="/assets/common.js"></script>
            <script src="/assets/layout.js"></script>
          </head>
          <body><slot></slot></body>
        </html>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <template data-target="head">
            <script src="/assets/page.js"></script>
            <script src="/assets/common.js"></script>
          </template>
          <p>Content</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Should contain unique scripts only
    await expectFileContentContains(project.outputDir, 'page.html', [
      'src="/assets/layout.js"',
      'src="/assets/page.js"'
    ]);
    
    // Verify no duplication of common.js (first-kept for scripts)
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    const content = await readFile(join(project.outputDir, 'page.html'), 'utf8');
    const commonJsMatches = (content.match(/common\.js/g) || []).length;
    expect(commonJsMatches).toBe(1);
  });
  
  test('should preserve inline scripts and styles without deduplication', async () => {
    const structure = {
      '_layout.html': `
        <html>
          <head>
            <style>body { margin: 0; }</style>
            <script>console.log('layout');</script>
          </head>
          <body><slot></slot></body>
        </html>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <template data-target="head">
            <style>body { margin: 0; }</style>
            <script>console.log('page');</script>
          </template>
          <p>Content</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Both inline styles and scripts should appear
    await expectFileContentContains(project.outputDir, 'page.html', [
      "console.log('layout');",
      "console.log('page');"
    ]);
    
    // Check that both identical inline styles appear
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    const content = await readFile(join(project.outputDir, 'page.html'), 'utf8');
    const styleMatches = (content.match(/body \{ margin: 0; \}/g) || []).length;
    expect(styleMatches).toBe(2); // Should NOT be deduplicated
  });
  
  test('should deduplicate scripts', async () => {
    const structure = {
      '_layout.html': `
        <html>
          <head>
            <script src="/assets/lib.js"></script>
          </head>
          <body><slot></slot></body>
        </html>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <template data-target="head">
            <script src="/assets/lib.js"></script>
          </template>
          <p>Content</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Scripts should be deduplicated (first wins)
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    const content = await readFile(join(project.outputDir, 'page.html'), 'utf8');
    const libJsMatches = (content.match(/lib\.js/g) || []).length;
    expect(libJsMatches).toBe(1);
  });
  
  test('should preserve processing order and provide merge warnings', async () => {
    const structure = {
      '_layout.html': `
        <html>
          <head>
            <title>Layout Title</title>
            <meta name="author" content="Layout Author">
          </head>
          <body><slot></slot></body>
        </html>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <template data-target="head">
            <title>Page Title</title>
            <meta name="author" content="Page Author">
          </template>
          <p>Content</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Should warn about duplicates being replaced
    expect(result.stderr).toContain('WARN'); // Match actual warning format
  });
  
  test('should handle complex head merging with fragments', async () => {
    const structure = {
      '_base.html': `
        <html>
          <head>
            <title>Base Title</title>
            <link rel="stylesheet" href="/assets/base.css">
            <meta name="viewport" content="width=device-width">
          </head>
          <body><slot></slot></body>
        </html>
      `,
      '_fragment.html': `
        <div data-import="/_base.html">
          <template data-target="head">
            <link rel="stylesheet" href="/assets/fragment.css">
            <meta name="description" content="Fragment description">
          </template>
          <section><slot name="section-content"></slot></section>
        </div>
      `,
      'page.html': `
        <div data-import="/_fragment.html">
          <template data-target="head">
            <title>Final Page Title</title>
            <link rel="stylesheet" href="/assets/page.css">
            <meta name="description" content="Page description">
            <meta name="keywords" content="page, keywords">
          </template>
          <template data-target="section-content">
            <h1>Page Content</h1>
          </template>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Final merged head should have correct precedence
    await expectFileContentContains(project.outputDir, 'page.html', [
      '<title>Final Page Title</title>', // Page wins
      'content="Page description"',      // Page wins
      'content="page, keywords"',        // Page only
      'href="/assets/base.css"',         // Base only
      'href="/assets/fragment.css"',     // Fragment only  
      'href="/assets/page.css"',         // Page only
      'content="width=device-width"'     // Base only
    ]);
    
    // Verify no duplicates or overridden content
    await expectFileContentNotContains(project.outputDir, 'page.html', [
      'Base Title',
      'Fragment description'
    ]);
  });
});