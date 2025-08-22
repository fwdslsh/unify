/**
 * Unit tests for cascading imports processor
 * Tests the v0.6.0 data-import, slot, and data-target composition system
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { 
  CascadingImportsProcessor, 
  CircularImportError, 
  FragmentNotFoundError 
} from '../../../src/core/cascading-imports-processor.js';
import { makeTempProjectFromStructure } from '../../helpers/temp-project.js';

const cleanupTasks = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
});

describe('Cascading Imports Processor', () => {

  describe('Error Classes', () => {
    test('should create CircularImportError with import chain', () => {
      const chain = ['page.html', 'layout.html', 'header.html', 'page.html'];
      const error = new CircularImportError(chain);
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('CircularImportError');
      expect(error.importChain).toEqual(chain);
      expect(error.message).toContain('page.html → layout.html → header.html → page.html');
    });

    test('should create FragmentNotFoundError with searched paths', () => {
      const fragmentPath = 'missing.html';
      const searchedPaths = ['/src/missing.html', '/src/_includes/missing.html'];
      const error = new FragmentNotFoundError(fragmentPath, searchedPaths);
      
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('FragmentNotFoundError');
      expect(error.fragmentPath).toBe(fragmentPath);
      expect(error.searchedPaths).toEqual(searchedPaths);
      expect(error.message).toContain('Fragment not found: missing.html');
    });

    test('should create FragmentNotFoundError without searched paths', () => {
      const error = new FragmentNotFoundError('missing.html');
      
      expect(error.fragmentPath).toBe('missing.html');
      expect(error.searchedPaths).toEqual([]);
    });
  });

  describe('Processor Initialization', () => {
    test('should initialize with default options', () => {
      const processor = new CascadingImportsProcessor('/src');
      
      expect(processor.sourceRoot).toBe('/src');
      expect(processor.options.maxDepth).toBe(10);
      expect(processor.options.failFast).toBe(false);
      expect(processor.importStack).toEqual([]);
      expect(processor.depth).toBe(0);
    });

    test('should initialize with custom options', () => {
      const options = { maxDepth: 5, failFast: true, customOption: 'value' };
      const processor = new CascadingImportsProcessor('/src', options);
      
      expect(processor.options.maxDepth).toBe(5);
      expect(processor.options.failFast).toBe(true);
      expect(processor.options.customOption).toBe('value');
    });
  });

  describe('Import Extraction', () => {
    test('should extract simple data-import element', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<div data-import="header.html">Default content</div>';
      
      const imports = processor.extractImports(html);
      
      expect(imports).toHaveLength(1);
      expect(imports[0].src).toBe('header.html');
      expect(imports[0].element).toBe('<div data-import="header.html">Default content</div>');
      expect(imports[0].slotContent.default).toBe('Default content');
    });

    test('should extract multiple data-import elements', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = `
        <header data-import="header.html">Header content</header>
        <main data-import="main.html">Main content</main>
        <footer data-import="footer.html">Footer content</footer>
      `;
      
      const imports = processor.extractImports(html);
      
      expect(imports).toHaveLength(3);
      expect(imports.map(i => i.src)).toEqual(['footer.html', 'main.html', 'header.html']); // Reversed for safe replacement
    });

    test('should extract nested data-import elements', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = `
        <div data-import="layout.html">
          <section data-import="content.html">Content</section>
          <aside>Sidebar</aside>
        </div>
      `;
      
      const imports = processor.extractImports(html);
      
      expect(imports).toHaveLength(2);
      // Should find both outer and inner imports
      expect(imports.map(i => i.src)).toEqual(['content.html', 'layout.html']); // Reversed order
    });

    test('should handle self-closing elements', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<img data-import="image.html" />';
      
      const imports = processor.extractImports(html);
      
      expect(imports).toHaveLength(1);
      expect(imports[0].src).toBe('image.html');
      expect(imports[0].element).toBe('<img data-import="image.html" />');
      expect(imports[0].slotContent.default).toBe('');
    });

    test('should handle complex attributes', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<section class="main" id="content" data-import="section.html" role="main">Content</section>';
      
      const imports = processor.extractImports(html);
      
      expect(imports).toHaveLength(1);
      expect(imports[0].src).toBe('section.html');
      expect(imports[0].element).toContain('class="main"');
      expect(imports[0].element).toContain('id="content"');
      expect(imports[0].element).toContain('role="main"');
    });

    test('should handle single and double quotes', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = `
        <div data-import='single-quotes.html'>Single</div>
        <div data-import="double-quotes.html">Double</div>
      `;
      
      const imports = processor.extractImports(html);
      
      expect(imports).toHaveLength(2);
      expect(imports.map(i => i.src)).toEqual(['double-quotes.html', 'single-quotes.html']);
    });

    test('should return empty array for no imports', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<div>No imports here</div>';
      
      const imports = processor.extractImports(html);
      
      expect(imports).toHaveLength(0);
    });
  });

  describe('Balanced Tag Finding', () => {
    test('should find simple closing tag', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<div>Content</div>';
      const closingIndex = processor.findBalancedClosingTag(html, 5, 'div'); // Start after opening tag
      
      expect(closingIndex).toBe(12); // Position of closing </div>
    });

    test('should handle nested elements correctly', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<div><div>Inner</div>Outer content</div>';
      const closingIndex = processor.findBalancedClosingTag(html, 5, 'div'); // Start after first opening tag
      
      expect(closingIndex).toBe(34); // Position of outer closing </div>
    });

    test('should handle deeply nested elements', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<div><div><div>Deep</div></div>Content</div>';
      const closingIndex = processor.findBalancedClosingTag(html, 5, 'div');
      
      expect(closingIndex).toBe(38); // Position of outermost closing </div>
    });

    test('should return -1 for unbalanced tags', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<div><div>Unclosed';
      const closingIndex = processor.findBalancedClosingTag(html, 5, 'div');
      
      expect(closingIndex).toBe(-1);
    });

    test('should handle different tag names', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<section><div>Content</div></section>';
      const closingIndex = processor.findBalancedClosingTag(html, 9, 'section');
      
      expect(closingIndex).toBe(27); // Position of </section>
    });
  });

  describe('Slot Content Extraction', () => {
    test('should extract default slot content', () => {
      const processor = new CascadingImportsProcessor('/src');
      const content = 'This is default content';
      
      const slotContent = processor.extractSlotContent(content);
      
      expect(slotContent.default).toBe('This is default content');
      expect(slotContent.named).toEqual({});
    });

    test('should extract template elements with data-target', () => {
      const processor = new CascadingImportsProcessor('/src');
      const content = `
        Default content
        <template data-target="header">Header content</template>
        <template data-target="footer">Footer content</template>
      `;
      
      const slotContent = processor.extractSlotContent(content);
      
      expect(slotContent.named.header).toBe('Header content');
      expect(slotContent.named.footer).toBe('Footer content');
      expect(slotContent.default.trim()).toBe('Default content');
    });

    test('should extract regular elements with data-target', () => {
      const processor = new CascadingImportsProcessor('/src');
      const content = `
        Default content
        <div data-target="sidebar">Sidebar content</div>
        <span data-target="note">Note content</span>
      `;
      
      const slotContent = processor.extractSlotContent(content);
      
      expect(slotContent.named.sidebar).toBe('<div>Sidebar content</div>');
      expect(slotContent.named.note).toBe('<span>Note content</span>');
      expect(slotContent.default.trim()).toBe('Default content');
    });

    test('should handle self-closing elements with data-target', () => {
      const processor = new CascadingImportsProcessor('/src');
      const content = `
        Default content
        <img src="image.jpg" data-target="hero" alt="Hero" />
        <hr data-target="divider" />
      `;
      
      const slotContent = processor.extractSlotContent(content);
      
      expect(slotContent.named.hero).toBe('<img src="image.jpg" alt="Hero"  />'); // Extra space from attribute cleanup
      expect(slotContent.named.divider).toBe('<hr  />'); // Extra space from attribute cleanup
      expect(slotContent.default.trim()).toBe('Default content');
    });

    test('should handle last writer wins for duplicate targets', () => {
      const processor = new CascadingImportsProcessor('/src');
      const content = `
        <template data-target="content">First content</template>
        <template data-target="content">Second content</template>
        <div data-target="content">Third content</div>
      `;
      
      const slotContent = processor.extractSlotContent(content);
      
      expect(slotContent.named.content).toBe('<div>Third content</div>'); // Last writer wins
    });

    test('should handle mixed template and element targets', () => {
      const processor = new CascadingImportsProcessor('/src');
      const content = `
        Default content
        <template data-target="meta">Meta template</template>
        <header data-target="header" class="main">Header element</header>
      `;
      
      const slotContent = processor.extractSlotContent(content);
      
      expect(slotContent.named.meta).toBe('Meta template');
      expect(slotContent.named.header).toBe('<header class="main">Header element</header>');
      expect(slotContent.default.trim()).toBe('Default content');
    });

    test('should handle empty content gracefully', () => {
      const processor = new CascadingImportsProcessor('/src');
      const slotContent = processor.extractSlotContent('');
      
      expect(slotContent.default).toBe('');
      expect(slotContent.named).toEqual({});
    });
  });

  describe('Path Resolution', () => {
    test('should resolve absolute path from source root', async () => {
      const structure = {
        'components/header.html': '<header>Header</header>',
        'page.html': '<div data-import="/components/header.html">Content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pagePath = `${project.sourceDir}/page.html`;
      const resolved = await processor.resolveImportPath('/components/header.html', pagePath);
      
      expect(resolved).toBe(`${project.sourceDir}/components/header.html`);
    });

    test('should resolve relative path from current file', async () => {
      const structure = {
        'blog/header.html': '<header>Blog Header</header>',
        'blog/post.html': '<div data-import="header.html">Content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const resolved = await processor.resolveImportPath('header.html', pagePath);
      
      expect(resolved).toBe(`${project.sourceDir}/blog/header.html`);
    });

    test('should resolve short name from current directory', async () => {
      const structure = {
        'blog/_header.html': '<header>Header</header>',
        'blog/post.html': '<div data-import="header">Content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const resolved = await processor.resolveImportPath('header', pagePath);
      
      expect(resolved).toBe(`${project.sourceDir}/blog/_header.html`);
    });

    test('should resolve short name from _includes directory', async () => {
      const structure = {
        '_includes/header.html': '<header>Includes Header</header>',
        'blog/post.html': '<div data-import="header">Content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pagePath = `${project.sourceDir}/blog/post.html`;
      const resolved = await processor.resolveImportPath('header', pagePath);
      
      expect(resolved).toBe(`${project.sourceDir}/_includes/header.html`);
    });

    test('should throw FragmentNotFoundError for missing file', async () => {
      const structure = {
        'page.html': '<div data-import="missing.html">Content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pagePath = `${project.sourceDir}/page.html`;
      
      await expect(processor.resolveImportPath('missing.html', pagePath))
        .rejects.toThrow(FragmentNotFoundError);
    });
  });

  describe('Short Name Candidate Generation', () => {
    test('should generate candidates for short name', () => {
      const processor = new CascadingImportsProcessor('/src');
      const candidates = processor.generateShortNameCandidates('header', '/src/blog/post.html');
      
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.some(c => c.includes('header.html'))).toBe(true);
      expect(candidates.some(c => c.includes('_header.html'))).toBe(true);
      expect(candidates.some(c => c.includes('header.layout.html'))).toBe(true);
      expect(candidates.some(c => c.includes('_includes'))).toBe(true);
    });

    test('should search up directory hierarchy', () => {
      const processor = new CascadingImportsProcessor('/src');
      const candidates = processor.generateShortNameCandidates('component', '/src/deep/nested/page.html');
      
      // Should include paths from nested directory up to source root
      expect(candidates.some(c => c.includes('/src/deep/nested/'))).toBe(true);
      expect(candidates.some(c => c.includes('/src/deep/'))).toBe(true);
      expect(candidates.some(c => c.includes('/src/'))).toBe(true);
      expect(candidates.some(c => c.includes('/src/_includes/'))).toBe(true);
    });

    test('should include both .html and .htm extensions', () => {
      const processor = new CascadingImportsProcessor('/src');
      const candidates = processor.generateShortNameCandidates('test', '/src/page.html');
      
      expect(candidates.some(c => c.endsWith('.html'))).toBe(true);
      expect(candidates.some(c => c.endsWith('.htm'))).toBe(true);
    });
  });

  describe('Fragment Loading', () => {
    test('should load HTML fragment', async () => {
      const structure = {
        'header.html': '<header>Site Header</header>',
        'page.html': '<div data-import="header.html">Content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const fragmentPath = `${project.sourceDir}/header.html`;
      const content = await processor.loadFragment(fragmentPath);
      
      expect(content).toBe('<header>Site Header</header>');
    });

    test('should process markdown fragment', async () => {
      const structure = {
        'content.md': '# Markdown Header\n\nThis is **bold** text.',
        'page.html': '<div data-import="content.md">Content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const fragmentPath = `${project.sourceDir}/content.md`;
      const content = await processor.loadFragment(fragmentPath);
      
      expect(content).toContain('<h1');
      expect(content).toContain('Markdown Header');
      expect(content).toContain('<strong>bold</strong>');
    });

    test('should throw error for non-existent fragment', async () => {
      const processor = new CascadingImportsProcessor('/src');
      
      await expect(processor.loadFragment('/src/missing.html'))
        .rejects.toThrow();
    });
  });

  describe('Fragment Composition', () => {
    test('should compose fragment with default slot', () => {
      const processor = new CascadingImportsProcessor('/src');
      const fragmentHtml = '<div class="wrapper"><slot>Default content</slot></div>';
      const slotContent = { default: 'Injected content', named: {} };
      
      const composed = processor.composeFragments(fragmentHtml, slotContent, true);
      
      expect(composed).toBe('<div class="wrapper">Injected content</div>');
    });

    test('should compose fragment with named slots', () => {
      const processor = new CascadingImportsProcessor('/src');
      const fragmentHtml = `
        <div class="layout">
          <slot name="header">Default header</slot>
          <main><slot>Default content</slot></main>
          <slot name="footer">Default footer</slot>
        </div>
      `;
      const slotContent = {
        default: 'Main content',
        named: {
          header: 'Custom header',
          footer: 'Custom footer'
        }
      };
      
      const composed = processor.composeFragments(fragmentHtml, slotContent, true);
      
      expect(composed).toContain('Custom header');
      expect(composed).toContain('Main content');
      expect(composed).toContain('Custom footer');
      expect(composed).not.toContain('Default header');
      expect(composed).not.toContain('Default footer');
    });

    test('should preserve fallback content for unfilled slots', () => {
      const processor = new CascadingImportsProcessor('/src');
      const fragmentHtml = `
        <div>
          <slot name="filled">Default filled</slot>
          <slot name="unfilled">Default unfilled</slot>
        </div>
      `;
      const slotContent = {
        default: '',
        named: {
          filled: 'Custom content'
        }
      };
      
      const composed = processor.composeFragments(fragmentHtml, slotContent, true);
      
      expect(composed).toContain('Custom content');
      expect(composed).toContain('Default unfilled'); // Fallback content preserved
    });

    test('should handle complex nested slot structures', () => {
      const processor = new CascadingImportsProcessor('/src');
      const fragmentHtml = `
        <article>
          <header>
            <slot name="title">Default Title</slot>
            <slot name="meta">Default Meta</slot>
          </header>
          <div class="content">
            <slot>Default article content</slot>
          </div>
        </article>
      `;
      const slotContent = {
        default: '<p>Article body content</p>',
        named: {
          title: '<h1>Custom Title</h1>',
          meta: '<time>2023-01-01</time>'
        }
      };
      
      const composed = processor.composeFragments(fragmentHtml, slotContent, true);
      
      expect(composed).toContain('<h1>Custom Title</h1>');
      expect(composed).toContain('<time>2023-01-01</time>');
      expect(composed).toContain('<p>Article body content</p>');
    });

    test('should handle slots with attributes and whitespace', () => {
      const processor = new CascadingImportsProcessor('/src');
      const fragmentHtml = '<div><slot name="content" class="slot-class">  Default  </slot></div>';
      const slotContent = { default: '', named: { content: 'Replaced' } };
      
      const composed = processor.composeFragments(fragmentHtml, slotContent, true);
      
      expect(composed).toBe('<div>Replaced</div>');
    });

    test('should not replace unfilled slots during intermediate composition', () => {
      const processor = new CascadingImportsProcessor('/src');
      const fragmentHtml = '<div><slot name="unfilled">Fallback</slot></div>';
      const slotContent = { default: '', named: {} };
      
      const composed = processor.composeFragments(fragmentHtml, slotContent, false); // Not final
      
      expect(composed).toContain('<slot name="unfilled">Fallback</slot>'); // Preserved for later
    });
  });

  describe('Import Processing', () => {
    test('should process simple import', async () => {
      const structure = {
        'header.html': '<header>Site Header</header>',
        'page.html': '<div data-import="header.html">Default content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('<header>Site Header</header>');
      expect(processed).not.toContain('data-import');
    });

    test('should process multiple imports', async () => {
      const structure = {
        'header.html': '<header>Header</header>',
        'footer.html': '<footer>Footer</footer>',
        'page.html': `
          <div data-import="header.html"></div>
          <main>Content</main>
          <div data-import="footer.html"></div>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('<header>Header</header>');
      expect(processed).toContain('<footer>Footer</footer>');
      expect(processed).toContain('<main>Content</main>');
    });

    test('should process nested imports', async () => {
      const structure = {
        'nav.html': '<nav>Navigation</nav>',
        'header.html': '<header><div data-import="nav.html"></div><h1>Title</h1></header>',
        'page.html': '<div data-import="header.html">Content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('<nav>Navigation</nav>');
      expect(processed).toContain('<h1>Title</h1>');
      expect(processed).not.toContain('data-import');
    });

    test('should detect circular imports', async () => {
      const structure = {
        'a.html': '<div data-import="b.html">A content</div>',
        'b.html': '<div data-import="c.html">B content</div>',
        'c.html': '<div data-import="a.html">C content</div>',
        'page.html': '<div data-import="a.html">Page content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      await expect(processor.processImports(pageContent, `${project.sourceDir}/page.html`))
        .rejects.toThrow(CircularImportError);
    });

    test('should respect maximum depth limit', async () => {
      const structure = {
        'deep1.html': '<div data-import="deep2.html">Level 1</div>',
        'deep2.html': '<div data-import="deep3.html">Level 2</div>',
        'deep3.html': '<div data-import="deep4.html">Level 3</div>',
        'deep4.html': '<div data-import="deep5.html">Level 4</div>',
        'deep5.html': '<div data-import="deep6.html">Level 5</div>',
        'deep6.html': 'Deep content',
        'page.html': '<div data-import="deep1.html">Page</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir, { maxDepth: 3 });
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      await expect(processor.processImports(pageContent, `${project.sourceDir}/page.html`))
        .rejects.toThrow('Maximum import depth (3) exceeded');
    });

    test('should handle import errors gracefully', async () => {
      const structure = {
        'page.html': '<div data-import="missing.html">Fallback content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir, { failFast: false });
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('<!-- Import Error:');
      expect(processed).toContain('Fragment not found: missing.html');
    });

    test('should fail fast when configured', async () => {
      const structure = {
        'page.html': '<div data-import="missing.html">Fallback content</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir, { failFast: true });
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      
      await expect(processor.processImports(pageContent, `${project.sourceDir}/page.html`))
        .rejects.toThrow(FragmentNotFoundError);
    });
  });

  describe('Slot Injection with Imports', () => {
    test('should inject slot content into imported fragment', async () => {
      const structure = {
        'layout.html': '<div class="layout"><slot name="content">Default</slot></div>',
        'page.html': `
          <div data-import="layout.html">
            <template data-target="content">Custom content</template>
          </div>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('<div class="layout">Custom content</div>');
      expect(processed).not.toContain('Default');
      expect(processed).not.toContain('<template');
    });

    test('should handle default slot content', async () => {
      const structure = {
        'wrapper.html': '<div class="wrapper"><slot>Wrapper default</slot></div>',
        'page.html': `
          <div data-import="wrapper.html">
            <p>This goes to default slot</p>
          </div>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('<div class="wrapper"><p>This goes to default slot</p></div>');
      expect(processed).not.toContain('Wrapper default');
    });

    test('should handle mixed named and default slots', async () => {
      const structure = {
        'card.html': `
          <div class="card">
            <header><slot name="title">Default Title</slot></header>
            <div class="content"><slot>Default content</slot></div>
            <footer><slot name="actions">Default actions</slot></footer>
          </div>
        `,
        'page.html': `
          <article data-import="card.html">
            <template data-target="title">Article Title</template>
            <p>This is the main article content</p>
            <div data-target="actions">
              <button>Save</button>
              <button>Cancel</button>
            </div>
          </article>
        `
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('Article Title');
      expect(processed).toContain('<p>This is the main article content</p>');
      expect(processed).toContain('<button>Save</button>');
      expect(processed).toContain('<button>Cancel</button>');
    });
  });

  describe('Head Content Extraction', () => {
    test('should extract head content from HTML', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = `
        <html>
          <head>
            <title>Test Page</title>
            <meta name="description" content="Test">
          </head>
          <body>Content</body>
        </html>
      `;
      
      const headContent = processor.extractHeadContent(html);
      
      expect(headContent).toContain('<title>Test Page</title>');
      expect(headContent).toContain('<meta name="description" content="Test">');
    });

    test('should return empty string for no head', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<div>No head tag here</div>';
      
      const headContent = processor.extractHeadContent(html);
      
      expect(headContent).toBe('');
    });

    test('should handle case-insensitive head tags', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<HTML><HEAD><title>Test</title></HEAD><body></body></HTML>';
      
      const headContent = processor.extractHeadContent(html);
      
      expect(headContent).toContain('<title>Test</title>');
    });
  });

  describe('Import Replacement', () => {
    test('should replace import element with content', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = 'Before <div data-import="test.html">Original</div> After';
      const importInfo = {
        startIndex: 7,
        endIndex: 50, // 7 + 43 (length of element)
        element: '<div data-import="test.html">Original</div>'
      };
      const replacement = '<div class="replaced">New content</div>';
      
      const result = processor.replaceImport(html, importInfo, replacement);
      
      expect(result).toBe('Before <div class="replaced">New content</div> After');
    });

    test('should handle multiple replacements correctly', () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<div data-import="a.html">A</div><div data-import="b.html">B</div>';
      
      // Test single replacement - should work correctly (first element is 33 chars)
      const importInfo1 = {
        startIndex: 0,
        endIndex: 33, // Correct length of first element
        element: '<div data-import="a.html">A</div>'
      };
      const result1 = processor.replaceImport(html, importInfo1, 'A-replaced');
      
      expect(result1).toBe('A-replaced<div data-import="b.html">B</div>');
      
      // Test second single replacement (second element also 33 chars, starts at 33)
      const importInfo2 = {
        startIndex: 33,
        endIndex: 66, // Full string length
        element: '<div data-import="b.html">B</div>'
      };
      const result2 = processor.replaceImport(html, importInfo2, 'B-replaced');
      
      expect(result2).toBe('<div data-import="a.html">A</div>B-replaced');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle empty HTML gracefully', async () => {
      const processor = new CascadingImportsProcessor('/src');
      const processed = await processor.processImports('', '/src/page.html');
      
      expect(processed).toBe('');
    });

    test('should handle HTML with no imports', async () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<div>No imports here</div>';
      const processed = await processor.processImports(html, '/src/page.html');
      
      expect(processed).toBe(html);
    });

    test('should handle malformed data-import attributes', async () => {
      const processor = new CascadingImportsProcessor('/src');
      const html = '<div data-import=>Malformed</div>';
      const processed = await processor.processImports(html, '/src/page.html');
      
      // Should not crash, might produce error comments
      expect(processed).toBeDefined();
    });

    test('should maintain state correctly across multiple calls', async () => {
      const structure = {
        'fragment.html': '<div>Fragment content</div>',
        'page1.html': '<div data-import="fragment.html">Page 1</div>',
        'page2.html': '<div data-import="fragment.html">Page 2</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      
      const page1Content = await fs.readFile(path.join(project.sourceDir, 'page1.html'), 'utf-8');
      const processed1 = await processor.processImports(page1Content, `${project.sourceDir}/page1.html`);
      
      const page2Content = await fs.readFile(path.join(project.sourceDir, 'page2.html'), 'utf-8');
      const processed2 = await processor.processImports(page2Content, `${project.sourceDir}/page2.html`);
      
      expect(processed1).toContain('Fragment content');
      expect(processed2).toContain('Fragment content');
      expect(processor.depth).toBe(0); // Should reset after each call
      expect(processor.importStack).toHaveLength(0);
    });

    test('should handle very deeply nested HTML structures', () => {
      const processor = new CascadingImportsProcessor('/src');
      const deepHtml = '<div>'.repeat(50) + 'Content' + '</div>'.repeat(50);
      const closingIndex = processor.findBalancedClosingTag(deepHtml, 5, 'div');
      
      expect(closingIndex).toBeGreaterThan(0);
    });

    test('should handle unicode characters in imports', async () => {
      const structure = {
        '文档.html': '<div>Unicode content</div>',
        'page.html': '<div data-import="文档.html">Default</div>'
      };
      
      const project = await makeTempProjectFromStructure(structure);
      cleanupTasks.push(project.cleanup);
      
      const processor = new CascadingImportsProcessor(project.sourceDir);
      const pageContent = await fs.readFile(path.join(project.sourceDir, 'page.html'), 'utf-8');
      const processed = await processor.processImports(pageContent, `${project.sourceDir}/page.html`);
      
      expect(processed).toContain('Unicode content');
    });
  });
});