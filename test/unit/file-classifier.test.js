import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from '../fixtures/temp-helper.js';
import { FileClassifier } from '../../src/core/file-classifier.js';
import path from 'path';

describe('FileClassifier', () => {
  let tempDir;
  let sourceDir;
  let classifier;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    classifier = new FileClassifier();
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  describe('isPage', () => {
    test('should identify regular HTML files as pages', async () => {
      await createTestStructure(sourceDir, {
        'index.html': '<h1>Home</h1>',
        'about.html': '<h1>About</h1>',
        'contact.htm': '<h1>Contact</h1>'
      });

      const indexPath = path.join(sourceDir, 'index.html');
      const aboutPath = path.join(sourceDir, 'about.html');
      const contactPath = path.join(sourceDir, 'contact.htm');

      expect(classifier.isPage(indexPath, sourceDir)).toBe(true);
      expect(classifier.isPage(aboutPath, sourceDir)).toBe(true);
      expect(classifier.isPage(contactPath, sourceDir)).toBe(true);
    });

    test('should identify Markdown files as pages', async () => {
      await createTestStructure(sourceDir, {
        'blog.md': '# Blog Post',
        'docs.md': '# Documentation'
      });

      const blogPath = path.join(sourceDir, 'blog.md');
      const docsPath = path.join(sourceDir, 'docs.md');

      expect(classifier.isPage(blogPath, sourceDir)).toBe(true);
      expect(classifier.isPage(docsPath, sourceDir)).toBe(true);
    });

    test('should NOT identify underscore-prefixed files as pages', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': '<html><body><slot></slot></body></html>',
        '_partial.html': '<div>Partial content</div>',
        '_component.md': '# Component docs'
      });

      const layoutPath = path.join(sourceDir, '_layout.html');
      const partialPath = path.join(sourceDir, '_partial.html');
      const componentPath = path.join(sourceDir, '_component.md');

      expect(classifier.isPage(layoutPath, sourceDir)).toBe(false);
      expect(classifier.isPage(partialPath, sourceDir)).toBe(false);
      expect(classifier.isPage(componentPath, sourceDir)).toBe(false);
    });

    test('should NOT identify files in underscore directories as pages', async () => {
      await createTestStructure(sourceDir, {
        '_includes/header.html': '<header>Site Header</header>',
        '_components/button.html': '<button>Click me</button>',
        'blog/_layout.html': '<html><body><slot></slot></body></html>',
        'blog/_sidebar.html': '<aside>Sidebar</aside>'
      });

      const headerPath = path.join(sourceDir, '_includes', 'header.html');
      const buttonPath = path.join(sourceDir, '_components', 'button.html');
      const blogLayoutPath = path.join(sourceDir, 'blog', '_layout.html');
      const sidebarPath = path.join(sourceDir, 'blog', '_sidebar.html');

      expect(classifier.isPage(headerPath, sourceDir)).toBe(false);
      expect(classifier.isPage(buttonPath, sourceDir)).toBe(false);
      expect(classifier.isPage(blogLayoutPath, sourceDir)).toBe(false);
      expect(classifier.isPage(sidebarPath, sourceDir)).toBe(false);
    });

    test('should NOT identify non-HTML/Markdown files as pages', async () => {
      await createTestStructure(sourceDir, {
        'style.css': 'body { margin: 0; }',
        'script.js': 'console.log("hello");',
        'image.png': 'fake-image-content'
      });

      const stylePath = path.join(sourceDir, 'style.css');
      const scriptPath = path.join(sourceDir, 'script.js');
      const imagePath = path.join(sourceDir, 'image.png');

      expect(classifier.isPage(stylePath, sourceDir)).toBe(false);
      expect(classifier.isPage(scriptPath, sourceDir)).toBe(false);
      expect(classifier.isPage(imagePath, sourceDir)).toBe(false);
    });
  });

  describe('isPartial', () => {
    test('should identify underscore-prefixed HTML files as partials', async () => {
      await createTestStructure(sourceDir, {
        '_header.html': '<header>Header</header>',
        '_footer.html': '<footer>Footer</footer>',
        '_layout.htm': '<html><body><slot></slot></body></html>'
      });

      const headerPath = path.join(sourceDir, '_header.html');
      const footerPath = path.join(sourceDir, '_footer.html');
      const layoutPath = path.join(sourceDir, '_layout.htm');

      expect(classifier.isPartial(headerPath, sourceDir)).toBe(true);
      expect(classifier.isPartial(footerPath, sourceDir)).toBe(true);
      expect(classifier.isPartial(layoutPath, sourceDir)).toBe(true);
    });

    test('should identify HTML files in underscore directories as partials', async () => {
      await createTestStructure(sourceDir, {
        '_includes/nav.html': '<nav>Navigation</nav>',
        '_components/modal.html': '<div class="modal">Modal</div>'
      });

      const navPath = path.join(sourceDir, '_includes', 'nav.html');
      const modalPath = path.join(sourceDir, '_components', 'modal.html');

      expect(classifier.isPartial(navPath, sourceDir)).toBe(true);
      expect(classifier.isPartial(modalPath, sourceDir)).toBe(true);
    });

    test('should NOT identify regular HTML files as partials', async () => {
      await createTestStructure(sourceDir, {
        'index.html': '<h1>Home</h1>',
        'about.html': '<h1>About</h1>'
      });

      const indexPath = path.join(sourceDir, 'index.html');
      const aboutPath = path.join(sourceDir, 'about.html');

      expect(classifier.isPartial(indexPath, sourceDir)).toBe(false);
      expect(classifier.isPartial(aboutPath, sourceDir)).toBe(false);
    });

    test('should NOT identify non-HTML files as partials', async () => {
      await createTestStructure(sourceDir, {
        '_style.css': 'body { margin: 0; }',
        '_config.json': '{"setting": true}'
      });

      const stylePath = path.join(sourceDir, '_style.css');
      const configPath = path.join(sourceDir, '_config.json');

      expect(classifier.isPartial(stylePath, sourceDir)).toBe(false);
      expect(classifier.isPartial(configPath, sourceDir)).toBe(false);
    });
  });

  describe('isLayout', () => {
    test('should identify _layout.html files as layouts', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': '<html><body><slot></slot></body></html>',
        'blog/_layout.html': '<html><body><h1>Blog</h1><slot></slot></body></html>',
        'docs/_layout.htm': '<html><body><h1>Docs</h1><slot></slot></body></html>'
      });

      const rootLayoutPath = path.join(sourceDir, '_layout.html');
      const blogLayoutPath = path.join(sourceDir, 'blog', '_layout.html');
      const docsLayoutPath = path.join(sourceDir, 'docs', '_layout.htm');

      expect(classifier.isLayout(rootLayoutPath, sourceDir)).toBe(true);
      expect(classifier.isLayout(blogLayoutPath, sourceDir)).toBe(true);
      expect(classifier.isLayout(docsLayoutPath, sourceDir)).toBe(true);
    });

    test('should identify fallback layout in _includes as layout', async () => {
      await createTestStructure(sourceDir, {
        '_includes/_layout.html': '<html><body><slot></slot></body></html>',
        '_includes/_layout.htm': '<html><body><slot></slot></body></html>'
      });

      const fallbackLayoutPath = path.join(sourceDir, '_includes', '_layout.html');
      const fallbackLayoutHtmPath = path.join(sourceDir, '_includes', '_layout.htm');

      expect(classifier.isLayout(fallbackLayoutPath, sourceDir)).toBe(true);
      expect(classifier.isLayout(fallbackLayoutHtmPath, sourceDir)).toBe(true);
    });

    test('should identify extended layout patterns as layouts', async () => {
      await createTestStructure(sourceDir, {
        '_custom.layout.html': '<html><body><h1>Custom</h1><slot></slot></body></html>',
        '_blog-post.layout.htm': '<html><body><h1>Blog</h1><slot></slot></body></html>',
        '_documentation.layout.html': '<html><body><nav>Docs</nav><slot></slot></body></html>'
      });

      const customLayoutPath = path.join(sourceDir, '_custom.layout.html');
      const blogLayoutPath = path.join(sourceDir, '_blog-post.layout.htm');
      const docsLayoutPath = path.join(sourceDir, '_documentation.layout.html');

      expect(classifier.isLayout(customLayoutPath, sourceDir)).toBe(true);
      expect(classifier.isLayout(blogLayoutPath, sourceDir)).toBe(true);
      expect(classifier.isLayout(docsLayoutPath, sourceDir)).toBe(true);
    });

    test('should NOT identify other underscore files as layouts', async () => {
      await createTestStructure(sourceDir, {
        '_header.html': '<header>Header</header>',
        '_partial.html': '<div>Partial</div>',
        '_includes/nav.html': '<nav>Navigation</nav>'
      });

      const headerPath = path.join(sourceDir, '_header.html');
      const partialPath = path.join(sourceDir, '_partial.html');
      const navPath = path.join(sourceDir, '_includes', 'nav.html');

      expect(classifier.isLayout(headerPath, sourceDir)).toBe(false);
      expect(classifier.isLayout(partialPath, sourceDir)).toBe(false);
      expect(classifier.isLayout(navPath, sourceDir)).toBe(false);
    });
  });

  describe('isLayoutFileName', () => {
    test('should recognize standard layout filenames', () => {
      expect(classifier.isLayoutFileName('_layout.html')).toBe(true);
      expect(classifier.isLayoutFileName('_layout.htm')).toBe(true);
    });

    test('should recognize extended layout patterns', () => {
      expect(classifier.isLayoutFileName('_custom.layout.html')).toBe(true);
      expect(classifier.isLayoutFileName('_blog-post.layout.htm')).toBe(true);
      expect(classifier.isLayoutFileName('_documentation.layout.html')).toBe(true);
      expect(classifier.isLayoutFileName('_admin.layout.htm')).toBe(true);
    });

    test('should reject non-layout files', () => {
      expect(classifier.isLayoutFileName('layout.html')).toBe(false);
      expect(classifier.isLayoutFileName('_component.html')).toBe(false);
      expect(classifier.isLayoutFileName('_custom.template.html')).toBe(false);
      expect(classifier.isLayoutFileName('custom.layout.html')).toBe(false);
      expect(classifier.isLayoutFileName('_partial.html')).toBe(false);
    });
  });

  describe('shouldEmit', () => {
    test('should emit pages', async () => {
      await createTestStructure(sourceDir, {
        'index.html': '<h1>Home</h1>',
        'about.md': '# About'
      });

      const indexPath = path.join(sourceDir, 'index.html');
      const aboutPath = path.join(sourceDir, 'about.md');

      expect(classifier.shouldEmit(indexPath, sourceDir)).toBe(true);
      expect(classifier.shouldEmit(aboutPath, sourceDir)).toBe(true);
    });

    test('should NOT emit partials and layouts', async () => {
      await createTestStructure(sourceDir, {
        '_layout.html': '<html><body><slot></slot></body></html>',
        '_header.html': '<header>Header</header>',
        '_includes/nav.html': '<nav>Navigation</nav>'
      });

      const layoutPath = path.join(sourceDir, '_layout.html');
      const headerPath = path.join(sourceDir, '_header.html');
      const navPath = path.join(sourceDir, '_includes', 'nav.html');

      expect(classifier.shouldEmit(layoutPath, sourceDir)).toBe(false);
      expect(classifier.shouldEmit(headerPath, sourceDir)).toBe(false);
      expect(classifier.shouldEmit(navPath, sourceDir)).toBe(false);
    });

    test('should emit regular assets', async () => {
      await createTestStructure(sourceDir, {
        'css/main.css': 'body { margin: 0; }',
        'js/script.js': 'console.log("hello");',
        'images/logo.png': 'fake-image-content'
      });

      const cssPath = path.join(sourceDir, 'css', 'main.css');
      const jsPath = path.join(sourceDir, 'js', 'script.js');
      const imagePath = path.join(sourceDir, 'images', 'logo.png');

      expect(classifier.shouldEmit(cssPath, sourceDir)).toBe(true);
      expect(classifier.shouldEmit(jsPath, sourceDir)).toBe(true);
      expect(classifier.shouldEmit(imagePath, sourceDir)).toBe(true);
    });

    test('should NOT emit underscore-prefixed assets by default', async () => {
      await createTestStructure(sourceDir, {
        '_private.css': 'body { margin: 0; }',
        'assets/_internal.js': 'console.log("internal");',
        '_assets/image.png': 'fake-image-content'
      });

      const privateCssPath = path.join(sourceDir, '_private.css');
      const internalJsPath = path.join(sourceDir, 'assets', '_internal.js');
      const imagePath = path.join(sourceDir, '_assets', 'image.png');

      expect(classifier.shouldEmit(privateCssPath, sourceDir)).toBe(false);
      expect(classifier.shouldEmit(internalJsPath, sourceDir)).toBe(false);
      expect(classifier.shouldEmit(imagePath, sourceDir)).toBe(false);
    });
  });

  describe('getFileType', () => {
    test('should correctly classify file types', async () => {
      await createTestStructure(sourceDir, {
        'index.html': '<h1>Home</h1>',
        '_layout.html': '<html><body><slot></slot></body></html>',
        '_header.html': '<header>Header</header>',
        'style.css': 'body { margin: 0; }'
      });

      const indexPath = path.join(sourceDir, 'index.html');
      const layoutPath = path.join(sourceDir, '_layout.html');
      const headerPath = path.join(sourceDir, '_header.html');
      const stylePath = path.join(sourceDir, 'style.css');

      expect(classifier.getFileType(indexPath, sourceDir)).toBe('page');
      expect(classifier.getFileType(layoutPath, sourceDir)).toBe('layout');
      expect(classifier.getFileType(headerPath, sourceDir)).toBe('partial');
      expect(classifier.getFileType(stylePath, sourceDir)).toBe('asset');
    });
  });

  describe('isNonEmittingDirectory', () => {
    test('should identify underscore directories as non-emitting', () => {
      expect(classifier.isNonEmittingDirectory('_includes')).toBe(true);
      expect(classifier.isNonEmittingDirectory('_components')).toBe(true);
      expect(classifier.isNonEmittingDirectory('blog/_includes')).toBe(true);
      expect(classifier.isNonEmittingDirectory('_assets/images')).toBe(true);
    });

    test('should identify regular directories as emitting', () => {
      expect(classifier.isNonEmittingDirectory('blog')).toBe(false);
      expect(classifier.isNonEmittingDirectory('docs')).toBe(false);
      expect(classifier.isNonEmittingDirectory('assets/images')).toBe(false);
      expect(classifier.isNonEmittingDirectory('css')).toBe(false);
    });
  });
});