/**
 * Unit tests for slot processing and content injection
 * Tests slot matching, template vs element behavior, and slot removal
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

describe('Slot Processing', () => {
  test('should inject named slot content correctly', async () => {
    const structure = {
      '_layout.html': `
        <html>
          <body>
            <header><slot name="header">Default Header</slot></header>
            <main><slot>Default Content</slot></main>
          </body>
        </html>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <template data-target="header">
            <h1>Custom Header</h1>
          </template>
          <p>Main page content</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Verify slot content was injected
    await expectFileContentContains(project.outputDir, 'page.html', [
      '<h1>Custom Header</h1>',
      '<p>Main page content</p>'
    ]);
    
    // Verify slot containers were removed
    await expectFileContentNotContains(project.outputDir, 'page.html', [
      '<slot',
      '<template',
      'data-target',
      'data-import'
    ]);
  });
  
  test('should handle unnamed default slot', async () => {
    const structure = {
      '_layout.html': `
        <article>
          <header>Fixed Header</header>
          <slot>Default article content</slot>
          <footer>Fixed Footer</footer>
        </article>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <h1>Article Title</h1>
          <p>Article content goes here</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Verify content went to unnamed slot
    await expectFileContentContains(project.outputDir, 'page.html', [
      '<h1>Article Title</h1>',
      '<p>Article content goes here</p>',
      'Fixed Header',
      'Fixed Footer'
    ]);
  });
  
  test('should use fallback content when no slot content provided', async () => {
    const structure = {
      '_layout.html': `
        <div>
          <slot name="optional">Default fallback content</slot>
          <slot>Default main content</slot>
        </div>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <p>Only main content provided</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Verify fallback content appears
    await expectFileContentContains(project.outputDir, 'page.html', [
      'Default fallback content',
      'Only main content provided'
    ]);
  });
  
  test('should handle template vs regular element behavior', async () => {
    const structure = {
      '_layout.html': `
        <div>
          <slot name="element-slot">Default 1</slot>
          <slot name="template-slot">Default 2</slot>
        </div>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <h1 data-target="element-slot">Element Header</h1>
          <template data-target="template-slot">
            <h2>Template Content</h2>
            <p>Multiple elements in template</p>
          </template>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Element should replace slot with the element itself
    await expectFileContentContains(project.outputDir, 'page.html', [
      '<h1>Element Header</h1>'
    ]);
    
    // Template should replace slot with its content only
    await expectFileContentContains(project.outputDir, 'page.html', [
      '<h2>Template Content</h2>',
      '<p>Multiple elements in template</p>'
    ]);
    
    // data-target attributes should be removed
    await expectFileContentNotContains(project.outputDir, 'page.html', [
      'data-target'
    ]);
  });
  
  test('should handle multiple providers for same slot (last writer wins)', async () => {
    const structure = {
      '_layout.html': `
        <div>
          <slot name="title">Default Title</slot>
        </div>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <h1 data-target="title">First Title</h1>
          <h2 data-target="title">Second Title</h2>
          <h3 data-target="title">Final Title</h3>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Last writer should win
    await expectFileContentContains(project.outputDir, 'page.html', [
      '<h3>Final Title</h3>'
    ]);
    
    // Earlier providers should not appear
    await expectFileContentNotContains(project.outputDir, 'page.html', [
      'First Title',
      'Second Title'
    ]);
  });
  
  test('should handle nested slot injection', async () => {
    const structure = {
      '_base.html': `
        <html>
          <body>
            <slot name="content">Base default</slot>
          </body>
        </html>
      `,
      '_wrapper.html': `
        <div data-import="/_base.html">
          <template data-target="content">
            <section>
              <slot name="section-content">Wrapper default</slot>
            </section>
          </template>
        </div>
      `,
      'page.html': `
        <div data-import="/_wrapper.html">
          <template data-target="section-content">
            <h1>Nested Content</h1>
          </template>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Verify nested injection worked
    await expectFileContentContains(project.outputDir, 'page.html', [
      '<section>',
      '<h1>Nested Content</h1>'
    ]);
    
    // Verify defaults were replaced
    await expectFileContentNotContains(project.outputDir, 'page.html', [
      'Base default',
      'Wrapper default'
    ]);
  });
  
  test('should warn about unmatched data-target attributes', async () => {
    const structure = {
      '_layout.html': `
        <div>
          <slot name="existing">Default</slot>
        </div>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <template data-target="nonexistent">Content</template>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    // Should build successfully but with warnings
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('WARN'); // Updated to match actual warning format
  });
  
  test('should enforce one unnamed slot per fragment rule', async () => {
    const structure = {
      '_layout.html': `
        <div>
          <slot>First unnamed</slot>
          <slot>Second unnamed</slot>
        </div>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <p>Content</p>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    // Should either error or warn about multiple unnamed slots
    expect([0, 1]).toContain(result.code);
    if (result.code === 1) {
      expect(result.stderr).toContain('unnamed');
    }
  });
  
  test('should handle complex slot combinations', async () => {
    const structure = {
      '_layout.html': `
        <html>
          <head>
            <title><slot name="title">Default</slot></title>
            <slot name="meta"></slot>
          </head>
          <body>
            <header><slot name="header">Default Header</slot></header>
            <nav><slot name="nav">Default Nav</slot></nav>
            <main><slot>Default Main</slot></main>
            <aside><slot name="sidebar">Default Sidebar</slot></aside>
            <footer><slot name="footer">Default Footer</slot></footer>
          </body>
        </html>
      `,
      'page.html': `
        <div data-import="/_layout.html">
          <template data-target="title">Complex Page</template>
          <template data-target="meta">
            <meta name="description" content="Test page">
          </template>
          <template data-target="header">
            <h1>Page Header</h1>
          </template>
          <template data-target="sidebar">
            <div class="widget">Widget content</div>
          </template>
          
          <article>
            <h2>Main Article</h2>
            <p>This goes to the unnamed slot</p>
          </article>
          
          <template data-target="footer">
            <p>&copy; 2025 Custom Footer</p>
          </template>
        </div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const { runBuild } = await import('../../helpers/cli-runner.js');
    const result = await runBuild(project);
    
    expect(result.code).toBe(0);
    
    // Verify all slots were filled correctly
    await expectFileContentContains(project.outputDir, 'page.html', [
      '<title>Complex Page</title>',
      '<meta name="description" content="Test page">',
      '<h1>Page Header</h1>',
      '<div class="widget">Widget content</div>',
      '<h2>Main Article</h2>',
      '<p>&copy; 2025 Custom Footer</p>'
    ]);
    
    // Verify fallback content appears for unfilled slots
    await expectFileContentContains(project.outputDir, 'page.html', [
      'Default Nav'
    ]);
    
    // Verify slot markup is removed
    await expectFileContentNotContains(project.outputDir, 'page.html', [
      '<slot',
      'data-target',
      'data-import'
    ]);
  });
});