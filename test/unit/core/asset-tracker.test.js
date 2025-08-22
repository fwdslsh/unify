import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { AssetTracker } from '../../../src/core/asset-tracker.js';
import { makeTempProject } from '../../helpers/temp-project.js';
import { join, dirname } from 'path';
import path from 'path';
import { writeFile, mkdir } from 'fs/promises';

describe('AssetTracker - Security & Performance', () => {
  let tracker;
  let project;

  beforeEach(async () => {
    tracker = new AssetTracker();
    project = await makeTempProject('basic-site');
  });

  afterEach(async () => {
    if (project) await project.cleanup();
  });

  describe('Path Traversal Prevention', () => {
    const maliciousPaths = [
      '../../etc/passwd',
      '../../../windows/system32/config/sam',
      '..\\..\\..\\windows\\system32',
      '../../../../../../../../etc/passwd',
      '/etc/passwd',
      'C:\\Windows\\System32\\config\\SAM',
      '//server/share/file',
      'file:///etc/passwd',
      '\\\\server\\share\\file',
      '....//....//....//etc/passwd',
      '../../../../../../../../../../../etc/passwd',
      '..%2F..%2F..%2Fetc%2Fpasswd',
      '..%252F..%252F..%252Fetc%252Fpasswd'
    ];

    it.each(maliciousPaths)('blocks malicious path: %s', async (maliciousPath) => {
      const resolved = tracker.resolveAssetPath(
        maliciousPath, 
        join(project.sourceDir, 'index.html'),
        project.sourceDir
      );
      expect(resolved).toBeNull();
    });

    it('allows legitimate relative paths', async () => {
      const legitimatePaths = [
        'assets/style.css',
        './images/logo.png',
        'js/main.js',
        'fonts/font.woff2',
        'css/styles.css',
        'images/hero.jpg',
        'docs/readme.txt',
        'data/config.json'
      ];

      for (const path of legitimatePaths) {
        const resolved = tracker.resolveAssetPath(
          path,
          join(project.sourceDir, 'index.html'),
          project.sourceDir
        );
        expect(resolved).toBeTruthy();
        expect(resolved).toContain(project.sourceDir);
      }
    });

    it('blocks absolute paths outside source root', async () => {
      const maliciousAbsolutePaths = [
        '/etc/passwd',
        '/var/log/system.log',
        '/root/.ssh/id_rsa',
        '/home/user/.bashrc',
        'C:/Windows/System32/config/SAM'
      ];

      for (const path of maliciousAbsolutePaths) {
        const resolved = tracker.resolveAssetPath(
          path,
          join(project.sourceDir, 'index.html'),
          project.sourceDir
        );
        expect(resolved).toBeNull();
      }
    });

    it('handles mixed path separators safely', async () => {
      const mixedPaths = [
        '../\\..\\..\\windows\\system32',
        '..\\/../../../etc/passwd',
        '..\\\\..\\\\..\\\\etc\\\\passwd'
      ];

      for (const path of mixedPaths) {
        const resolved = tracker.resolveAssetPath(
          path,
          join(project.sourceDir, 'index.html'),
          project.sourceDir
        );
        expect(resolved).toBeNull();
      }
    });
  });

  describe('HTML Asset Extraction Security', () => {
    it('safely handles malicious HTML content', async () => {
      const maliciousHtml = `
        <html>
          <head>
            <link rel="stylesheet" href="../../etc/passwd">
            <script src="../../../windows/system32/calc.exe"></script>
            <link rel="icon" href="//malicious.com/steal-data">
          </head>
          <body>
            <img src="javascript:alert('xss')" alt="malicious">
            <img src="data:text/html,<script>alert('xss')</script>" alt="data-url">
            <div style="background-image: url('../../etc/passwd')">Evil</div>
            <object data="file:///etc/passwd"></object>
          </body>
        </html>
      `;

      await tracker.recordAssetReferences(
        join(project.sourceDir, 'malicious.html'),
        maliciousHtml,
        project.sourceDir
      );

      const assets = tracker.getAllReferencedAssets();
      
      // Should not contain any malicious paths
      expect(assets).not.toContain(expect.stringContaining('etc/passwd'));
      expect(assets).not.toContain(expect.stringContaining('windows/system32'));
      expect(assets).not.toContain(expect.stringContaining('malicious.com'));
    });

    it('skips external URLs correctly', async () => {
      const htmlContent = `
        <html>
          <head>
            <link rel="stylesheet" href="https://cdn.example.com/style.css">
            <script src="http://evil.com/malicious.js"></script>
            <link rel="icon" href="//another-domain.com/favicon.ico">
          </head>
          <body>
            <img src="https://images.example.com/logo.png" alt="external">
            <video src="http://videos.com/movie.mp4">
          </body>
        </html>
      `;

      await tracker.recordAssetReferences(
        join(project.sourceDir, 'external.html'),
        htmlContent,
        project.sourceDir
      );

      const assets = tracker.getAllReferencedAssets();
      
      // Should not contain any external URLs
      expect(assets).not.toContain(expect.stringContaining('cdn.example.com'));
      expect(assets).not.toContain(expect.stringContaining('evil.com'));
      expect(assets).not.toContain(expect.stringContaining('another-domain.com'));
    });

    it('skips data URLs correctly', async () => {
      const htmlContent = `
        <html>
          <body>
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==" alt="data">
            <div style="background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCI+PC9zdmc+')">Data URL</div>
          </body>
        </html>
      `;

      await tracker.recordAssetReferences(
        join(project.sourceDir, 'data-urls.html'),
        htmlContent,
        project.sourceDir
      );

      const assets = tracker.getAllReferencedAssets();
      
      // Should not contain data URLs
      expect(assets).not.toContain(expect.stringContaining('data:'));
    });
  });

  describe('CSS Asset Extraction Security', () => {
    it('safely handles malicious CSS imports', async () => {
      const maliciousCss = `
        @import url('../../etc/passwd');
        @import url('../../../windows/system32/drivers/etc/hosts');
        @import "//malicious.com/steal.css";
        @import url('file:///etc/passwd');
        
        .background {
          background-image: url('../../etc/passwd');
          background: url('../../../sensitive/file.txt');
        }
        
        @font-face {
          font-family: 'Evil';
          src: url('../../etc/passwd') format('truetype'),
               url('../../../system/config') format('woff');
        }
      `;

      const maliciousCssPath = join(project.sourceDir, 'css/malicious.css');
      await mkdir(dirname(maliciousCssPath), { recursive: true });
      await writeFile(maliciousCssPath, maliciousCss);
      
      const htmlContent = '<html><head><link rel="stylesheet" href="css/malicious.css"></head></html>';
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'index.html'),
        htmlContent,
        project.sourceDir
      );

      const assets = tracker.getAllReferencedAssets();
      
      // Should not contain malicious paths
      expect(assets).not.toContain(expect.stringContaining('etc/passwd'));
      expect(assets).not.toContain(expect.stringContaining('windows/system32'));
      expect(assets).not.toContain(expect.stringContaining('malicious.com'));
      expect(assets).not.toContain(expect.stringContaining('file:///'));
    });

    it('prevents CSS path traversal in url() functions', async () => {
      const traversalCss = `
        .test1 { background: url('../../../../etc/passwd'); }
        .test2 { background-image: url("../../../windows/system32/config/sam"); }
        .test3 { content: url('../../sensitive/data.txt'); }
        .test4 { cursor: url('../../../system/cursor.cur'), auto; }
      `;

      const traversalCssPath = join(project.sourceDir, 'css/traversal.css');
      await mkdir(dirname(traversalCssPath), { recursive: true });
      await writeFile(traversalCssPath, traversalCss);
      
      const htmlContent = '<html><head><link rel="stylesheet" href="css/traversal.css"></head></html>';
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'index.html'),
        htmlContent,
        project.sourceDir
      );

      const assets = tracker.getAllReferencedAssets();
      
      // Should only contain the CSS file itself, not the malicious references
      expect(assets).toHaveLength(1);
      expect(assets[0]).toContain('traversal.css');
    });
  });

  describe('Performance at Scale', () => {
    it('processes 1000+ assets under 5 seconds', async () => {
      const assetCount = 1000;
      const htmlChunks = [];
      
      // Generate test HTML with many asset references
      for (let i = 0; i < assetCount; i++) {
        htmlChunks.push(`<link rel="stylesheet" href="assets/style-${i}.css">`);
        htmlChunks.push(`<img src="images/img-${i}.png" alt="test">`);
      }
      
      const htmlContent = `
        <html>
          <head>${htmlChunks.slice(0, assetCount).join('\n')}</head>
          <body>${htmlChunks.slice(assetCount).join('\n')}</body>
        </html>
      `;

      const startTime = performance.now();
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'test.html'),
        htmlContent,
        project.sourceDir
      );
      
      const duration = performance.now() - startTime;
      
      expect(duration).toBeLessThan(5000);
      expect(tracker.getAllReferencedAssets().length).toBe(assetCount * 2);
    });

    it('handles deep CSS import chains efficiently', async () => {
      // Create CSS chain: main.css -> level1.css -> level2.css -> ... -> level10.css
      const cssChain = [];
      
      for (let i = 0; i < 10; i++) {
        const cssContent = i < 9 
          ? `@import url("level${i + 1}.css");\n.level-${i} { color: red; }`
          : `.level-${i} { color: blue; }`;
        
        const cssPath = join(project.sourceDir, `css/level${i}.css`);
        await mkdir(dirname(cssPath), { recursive: true });
        await writeFile(cssPath, cssContent);
        cssChain.push(`css/level${i}.css`);
      }

      const htmlContent = '<html><head><link rel="stylesheet" href="css/level0.css"></head></html>';
      
      const startTime = performance.now();
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'index.html'),
        htmlContent,
        project.sourceDir
      );
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should handle chain in under 1 second
      expect(tracker.getAllReferencedAssets().length).toBeGreaterThan(5); // Should find multiple CSS files
    });

    it('handles large individual CSS files efficiently', async () => {
      // Create large CSS file with many url() references
      const cssLines = [];
      for (let i = 0; i < 1000; i++) {
        cssLines.push(`.class-${i} { background-image: url('images/bg-${i}.png'); }`);
        cssLines.push(`.icon-${i} { background: url('icons/icon-${i}.svg'); }`);
      }
      
      const largeCss = cssLines.join('\n');
      const largeCssPath = join(project.sourceDir, 'css/large.css');
      await mkdir(dirname(largeCssPath), { recursive: true });
      await writeFile(largeCssPath, largeCss);

      const htmlContent = '<html><head><link rel="stylesheet" href="css/large.css"></head></html>';
      
      const startTime = performance.now();
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'index.html'),
        htmlContent,
        project.sourceDir
      );
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(2000); // Should process large CSS under 2 seconds
      expect(tracker.getAllReferencedAssets().length).toBeGreaterThan(1000);
    });
  });

  describe('Circular Import Handling', () => {
    it('detects and handles circular CSS imports', async () => {
      // Create circular import: a.css -> b.css -> c.css -> a.css
      const cssDir = join(project.sourceDir, 'css');
      await mkdir(cssDir, { recursive: true });
      await writeFile(join(cssDir, 'a.css'), '@import url("b.css");\n.a { color: red; }');
      await writeFile(join(cssDir, 'b.css'), '@import url("c.css");\n.b { color: blue; }');
      await writeFile(join(cssDir, 'c.css'), '@import url("a.css");\n.c { color: green; }');

      const htmlContent = '<html><head><link rel="stylesheet" href="css/a.css"></head></html>';
      
      // Should not hang or crash
      await expect(
        tracker.recordAssetReferences(
          join(project.sourceDir, 'index.html'),
          htmlContent,
          project.sourceDir
        )
      ).resolves.toBeUndefined();

      // Should track assets despite circular reference
      const assets = tracker.getAllReferencedAssets();
      expect(assets.length).toBeGreaterThan(0);
      expect(assets).toEqual(expect.arrayContaining([
        expect.stringContaining('a.css'),
        expect.stringContaining('b.css'),
        expect.stringContaining('c.css')
      ]));
    });

    it('handles self-referencing CSS files', async () => {
      // Create CSS file that imports itself
      const selfImportCss = `
        @import url("self.css");
        .self { color: blue; }
      `;
      
      const selfCssPath = join(project.sourceDir, 'css/self.css');
      await mkdir(dirname(selfCssPath), { recursive: true });
      await writeFile(selfCssPath, selfImportCss);
      const htmlContent = '<html><head><link rel="stylesheet" href="css/self.css"></head></html>';
      
      await expect(
        tracker.recordAssetReferences(
          join(project.sourceDir, 'index.html'),
          htmlContent,
          project.sourceDir
        )
      ).resolves.toBeUndefined();

      const assets = tracker.getAllReferencedAssets();
      expect(assets.some(asset => asset.includes('self.css'))).toBe(true);
    });

    it('handles complex circular chains without stack overflow', async () => {
      // Create complex circular chain with multiple entry points
      const files = ['main', 'header', 'footer', 'layout', 'theme'];
      
      for (let i = 0; i < files.length; i++) {
        const nextFile = files[(i + 1) % files.length];
        const css = `
          @import url("${nextFile}.css");
          .${files[i]} { color: hsl(${i * 72}, 50%, 50%); }
        `;
        const cssPath = join(project.sourceDir, `css/${files[i]}.css`);
        await mkdir(dirname(cssPath), { recursive: true });
        await writeFile(cssPath, css);
      }

      const htmlContent = `
        <html>
          <head>
            <link rel="stylesheet" href="css/main.css">
            <link rel="stylesheet" href="css/header.css">
            <link rel="stylesheet" href="css/footer.css">
          </head>
        </html>
      `;
      
      await expect(
        tracker.recordAssetReferences(
          join(project.sourceDir, 'index.html'),
          htmlContent,
          project.sourceDir
        )
      ).resolves.toBeUndefined();

      const assets = tracker.getAllReferencedAssets();
      expect(assets.length).toBeGreaterThan(0);
      
      // Should include all CSS files
      for (const file of files) {
        expect(assets.some(asset => asset.includes(`${file}.css`))).toBe(true);
      }
    });
  });

  describe('Edge Cases & Error Handling', () => {
    it('handles malformed CSS gracefully', async () => {
      const malformedCss = `
        .class { color: red
        @import url("missing.css"
        background: url('broken-url'
        /* unterminated comment
        @font-face {
          src: url('incomplete.woff'
        } /* missing closing brace
      `;
      
      const brokenCssPath = join(project.sourceDir, 'css/broken.css');
      await mkdir(dirname(brokenCssPath), { recursive: true });
      await writeFile(brokenCssPath, malformedCss);
      const htmlContent = '<html><head><link rel="stylesheet" href="css/broken.css"></head></html>';
      
      await expect(
        tracker.recordAssetReferences(
          join(project.sourceDir, 'index.html'),
          htmlContent,
          project.sourceDir
        )
      ).resolves.toBeUndefined();

      // Should at least track the CSS file itself
      const assets = tracker.getAllReferencedAssets();
      expect(assets.some(asset => asset.includes('broken.css'))).toBe(true);
    });

    it('handles non-existent CSS files gracefully', async () => {
      const htmlContent = '<html><head><link rel="stylesheet" href="css/missing.css"></head></html>';
      
      await expect(
        tracker.recordAssetReferences(
          join(project.sourceDir, 'index.html'),
          htmlContent,
          project.sourceDir
        )
      ).resolves.toBeUndefined();

      // Should track the reference even if file doesn't exist
      const assets = tracker.getAllReferencedAssets();
      expect(assets.some(asset => asset.includes('missing.css'))).toBe(true);
    });

    it('handles empty CSS files', async () => {
      const emptyCssPath = join(project.sourceDir, 'css/empty.css');
      await mkdir(dirname(emptyCssPath), { recursive: true });
      await writeFile(emptyCssPath, '');
      const htmlContent = '<html><head><link rel="stylesheet" href="css/empty.css"></head></html>';
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'index.html'),
        htmlContent,
        project.sourceDir
      );

      const assets = tracker.getAllReferencedAssets();
      expect(assets).toEqual([expect.stringContaining('empty.css')]);
    });

    it('handles binary files mixed with assets', async () => {
      // Create binary file
      const binaryData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG header
      const binaryPath = join(project.sourceDir, 'images/binary.jpg');
      await mkdir(dirname(binaryPath), { recursive: true });
      await writeFile(binaryPath, binaryData);
      
      const htmlContent = '<html><body><img src="images/binary.jpg" alt="binary"></body></html>';
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'index.html'),
        htmlContent,
        project.sourceDir
      );

      const assets = tracker.getAllReferencedAssets();
      expect(assets).toHaveLength(1);
      expect(assets[0]).toContain('binary.jpg');
    });

    it('handles very long asset paths', async () => {
      const longPath = 'assets/' + 'very-long-directory-name/'.repeat(10) + 'file.css';
      const htmlContent = `<html><head><link rel="stylesheet" href="${longPath}"></head></html>`;
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'index.html'),
        htmlContent,
        project.sourceDir
      );

      const assets = tracker.getAllReferencedAssets();
      expect(assets).toHaveLength(1);
      expect(assets[0]).toContain(longPath);
    });
  });

  describe('Cross-platform Path Compatibility', () => {
    it('handles Windows-style paths on Unix systems', async () => {
      const windowsPaths = [
        'assets\\style.css',
        'images\\logo.png',
        'js\\main.js'
      ];

      for (const winPath of windowsPaths) {
        const resolved = tracker.resolveAssetPath(
          winPath,
          join(project.sourceDir, 'index.html'),
          project.sourceDir
        );
        
        // Should either resolve correctly or be null (but not throw)
        expect(typeof resolved === 'string' || resolved === null).toBe(true);
      }
    });

    it('normalizes path separators consistently', async () => {
      const paths = [
        'assets/style.css',
        'assets\\style.css',
        './assets/style.css',
        '.\\assets\\style.css'
      ];

      const resolvedPaths = paths.map(path => 
        tracker.resolveAssetPath(
          path,
          join(project.sourceDir, 'index.html'),
          project.sourceDir
        )
      ).filter(Boolean);

      // All valid paths should resolve successfully
      expect(resolvedPaths.length).toBeGreaterThan(0);
      
      // All resolved paths should be within source directory
      resolvedPaths.forEach(resolved => {
        expect(resolved).toContain(project.sourceDir);
        expect(resolved).toContain('style.css');
      });
    });
  });

  describe('Memory Management', () => {
    it('clears references properly when removing pages', async () => {
      const htmlContent = `
        <html>
          <head>
            <link rel="stylesheet" href="css/style.css">
          </head>
          <body>
            <img src="images/logo.png" alt="logo">
          </body>
        </html>
      `;

      const pagePath = join(project.sourceDir, 'test.html');
      
      await tracker.recordAssetReferences(pagePath, htmlContent, project.sourceDir);
      
      expect(tracker.getAllReferencedAssets().length).toBe(2);
      expect(tracker.getPageAssets(pagePath).length).toBe(2);
      
      tracker.removePage(pagePath);
      
      expect(tracker.getAllReferencedAssets().length).toBe(0);
      expect(tracker.getPageAssets(pagePath).length).toBe(0);
    });

    it('manages memory efficiently with many pages', async () => {
      const pageCount = 100;
      const promises = [];

      for (let i = 0; i < pageCount; i++) {
        const htmlContent = `<html><head><link rel="stylesheet" href="css/style-${i}.css"></head></html>`;
        const pagePath = join(project.sourceDir, `page-${i}.html`);
        
        promises.push(
          tracker.recordAssetReferences(pagePath, htmlContent, project.sourceDir)
        );
      }

      await Promise.all(promises);

      expect(tracker.getAllReferencedAssets().length).toBe(pageCount);
      expect(tracker.getStats().pagesWithAssets).toBe(pageCount);

      // Clear half the pages
      for (let i = 0; i < pageCount / 2; i++) {
        const pagePath = join(project.sourceDir, `page-${i}.html`);
        tracker.removePage(pagePath);
      }

      expect(tracker.getAllReferencedAssets().length).toBe(pageCount / 2);
      expect(tracker.getStats().pagesWithAssets).toBe(pageCount / 2);
    });
  });

  describe('Asset Reference Statistics', () => {
    it('provides accurate statistics', async () => {
      const htmlContent1 = '<html><head><link rel="stylesheet" href="css/style.css"></head></html>';
      const htmlContent2 = '<html><head><link rel="stylesheet" href="css/style.css"><link rel="stylesheet" href="css/other.css"></head></html>';
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'page1.html'),
        htmlContent1,
        project.sourceDir
      );
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'page2.html'),
        htmlContent2,
        project.sourceDir
      );

      const stats = tracker.getStats();
      
      expect(stats.totalReferencedAssets).toBe(2); // style.css and other.css
      expect(stats.totalAssetReferences).toBe(3); // style.css referenced twice + other.css once
      expect(stats.pagesWithAssets).toBe(2); // page1.html and page2.html
    });

    it('tracks asset references per page correctly', async () => {
      const htmlContent = `
        <html>
          <head>
            <link rel="stylesheet" href="css/style.css">
            <link rel="icon" href="images/favicon.ico">
          </head>
          <body>
            <img src="images/logo.png" alt="logo">
            <script src="js/main.js"></script>
          </body>
        </html>
      `;

      const pagePath = join(project.sourceDir, 'test.html');
      await tracker.recordAssetReferences(pagePath, htmlContent, project.sourceDir);

      const pageAssets = tracker.getPageAssets(pagePath);
      expect(pageAssets).toHaveLength(4);
      expect(pageAssets).toEqual(expect.arrayContaining([
        expect.stringContaining('style.css'),
        expect.stringContaining('favicon.ico'),
        expect.stringContaining('logo.png'),
        expect.stringContaining('main.js')
      ]));
    });
  });

  describe('Missing Coverage: Font-Face URL Extraction', () => {
    it('extracts font-face URLs from CSS (lines 130-131)', async () => {
      const cssWithFontFace = `
        @font-face {
          font-family: 'CustomFont';
          src: url('fonts/custom.woff2') format('woff2'),
               url('fonts/custom.woff') format('woff');
        }
        @font-face {
          font-family: 'AnotherFont';
          src: url('fonts/another.ttf') format('truetype');
        }
      `;

      const cssPath = join(project.sourceDir, 'css/fonts.css');
      await mkdir(dirname(cssPath), { recursive: true });
      await writeFile(cssPath, cssWithFontFace);
      
      const htmlContent = '<html><head><link rel="stylesheet" href="css/fonts.css"></head></html>';
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'index.html'),
        htmlContent,
        project.sourceDir
      );

      const assets = tracker.getAllReferencedAssets();
      
      // Should extract font files from @font-face declarations
      expect(assets.some(asset => asset.includes('custom.woff2'))).toBe(true);
      expect(assets.some(asset => asset.includes('custom.woff'))).toBe(true);
      expect(assets.some(asset => asset.includes('another.ttf'))).toBe(true);
      expect(assets.some(asset => asset.includes('fonts.css'))).toBe(true);
    });
  });

  describe('Missing Coverage: Absolute Path Handling', () => {
    it('handles absolute paths correctly (line 174)', async () => {
      const htmlContent = '<html><head><link rel="stylesheet" href="/assets/absolute.css"></head></html>';
      
      // Create the asset in the expected absolute location
      const absoluteAssetPath = join(project.sourceDir, 'assets/absolute.css');
      await mkdir(dirname(absoluteAssetPath), { recursive: true });
      await writeFile(absoluteAssetPath, '.test { color: red; }');

      await tracker.recordAssetReferences(
        join(project.sourceDir, 'subdir/page.html'),
        htmlContent,
        project.sourceDir
      );

      const assets = tracker.getAllReferencedAssets();
      expect(assets.some(asset => asset.includes('absolute.css'))).toBe(true);
    });

    it('blocks dangerous absolute paths (lines 263, 266-269)', async () => {
      const dangerousPaths = [
        '/etc/passwd',
        '/var/log/system.log',
        '/usr/bin/python',
        '/home/user/.bashrc',
        '/root/.ssh/id_rsa'
      ];

      for (const dangerousPath of dangerousPaths) {
        const resolved = tracker.resolveAssetPath(
          dangerousPath,
          join(project.sourceDir, 'index.html'),
          project.sourceDir
        );
        expect(resolved).toBeNull();
      }
    });
  });

  describe('Missing Coverage: Error Handling', () => {
    it('handles path resolution errors gracefully (lines 191-192)', async () => {
      // Create an invalid path scenario that causes path.resolve to throw
      const originalResolve = path.resolve;
      path.resolve = () => { throw new Error('Path resolution failed'); };
      
      try {
        const resolved = tracker.resolveAssetPath(
          'test.css',
          join(project.sourceDir, 'index.html'),
          project.sourceDir
        );
        expect(resolved).toBeNull();
      } finally {
        path.resolve = originalResolve;
      }
    });

    it('handles invalid asset paths (line 205)', async () => {
      const invalidPaths = [
        null,
        undefined,
        123,
        {},
        [],
        '',
        false
      ];

      for (const invalidPath of invalidPaths) {
        const resolved = tracker.resolveAssetPath(
          invalidPath,
          join(project.sourceDir, 'index.html'),
          project.sourceDir
        );
        expect(resolved).toBeNull();
      }
    });

    it('handles containment check errors (line 290)', async () => {
      // Mock path operations to force an error
      const originalNormalize = path.normalize;
      path.normalize = () => { throw new Error('Normalize failed'); };
      
      try {
        const isWithin = tracker.isPathWithinDirectory(
          join(project.sourceDir, 'test.css'),
          project.sourceDir
        );
        expect(isWithin).toBe(false);
      } finally {
        path.normalize = originalNormalize;
      }
    });
  });

  describe('Missing Coverage: Utility Methods', () => {
    it('checks if asset is referenced (line 400)', async () => {
      const htmlContent = '<html><head><link rel="stylesheet" href="css/test.css"></head></html>';
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'index.html'),
        htmlContent,
        project.sourceDir
      );

      const testAssetPath = join(project.sourceDir, 'css/test.css');
      expect(tracker.isAssetReferenced(testAssetPath)).toBe(true);
      expect(tracker.isAssetReferenced('/non/existent/path.css')).toBe(false);
    });

    it('gets pages that reference an asset (line 409)', async () => {
      const htmlContent = '<html><head><link rel="stylesheet" href="css/shared.css"></head></html>';
      const page1 = join(project.sourceDir, 'page1.html');
      const page2 = join(project.sourceDir, 'page2.html');
      
      await tracker.recordAssetReferences(page1, htmlContent, project.sourceDir);
      await tracker.recordAssetReferences(page2, htmlContent, project.sourceDir);

      const sharedAssetPath = join(project.sourceDir, 'css/shared.css');
      const referencingPages = tracker.getPagesThatReference(sharedAssetPath);
      
      expect(referencingPages).toHaveLength(2);
      expect(referencingPages).toContain(page1);
      expect(referencingPages).toContain(page2);
      
      // Test non-existent asset
      expect(tracker.getPagesThatReference('/non/existent.css')).toEqual([]);
    });

    it('clears all asset data (lines 455-458)', async () => {
      const htmlContent = '<html><head><link rel="stylesheet" href="css/test.css"></head></html>';
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'index.html'),
        htmlContent,
        project.sourceDir
      );

      expect(tracker.getAllReferencedAssets().length).toBeGreaterThan(0);
      expect(tracker.getStats().totalReferencedAssets).toBeGreaterThan(0);

      tracker.clear();

      expect(tracker.getAllReferencedAssets()).toHaveLength(0);
      expect(tracker.getStats().totalReferencedAssets).toBe(0);
      expect(tracker.getStats().pagesWithAssets).toBe(0);
    });

    it('exports and imports asset data (lines 466-490)', async () => {
      const htmlContent = '<html><head><link rel="stylesheet" href="css/test.css"></head></html>';
      const pagePath = join(project.sourceDir, 'test.html');
      
      await tracker.recordAssetReferences(pagePath, htmlContent, project.sourceDir);

      // Export data
      const exportedData = tracker.export();
      
      expect(exportedData).toHaveProperty('assetReferences');
      expect(exportedData).toHaveProperty('referencedAssets');
      expect(exportedData).toHaveProperty('htmlAssetCache');
      expect(exportedData.referencedAssets.length).toBeGreaterThan(0);

      // Clear and import
      tracker.clear();
      expect(tracker.getAllReferencedAssets()).toHaveLength(0);

      tracker.import(exportedData);
      
      expect(tracker.getAllReferencedAssets().length).toBeGreaterThan(0);
      expect(tracker.getPageAssets(pagePath).length).toBeGreaterThan(0);

      // Test importing empty/invalid data
      tracker.import({});
      tracker.import({ assetReferences: null, referencedAssets: null, htmlAssetCache: null });
    });
  });

  describe('Missing Coverage: Path Containment Edge Cases', () => {
    it('handles path containment check failures (lines 186-187)', async () => {
      // Test path that appears to escape source root  
      const escapingPath = '../../../etc/passwd';
      
      const resolved = tracker.resolveAssetPath(
        escapingPath,
        join(project.sourceDir, 'deep/nested/page.html'),
        project.sourceDir
      );

      // Should be null due to containment check failure
      expect(resolved).toBeNull();
    });

    it('validates complex path traversal patterns', async () => {
      const complexPatterns = [
        '../../../../../../../etc/passwd',
        '....//....//....//etc/passwd',
        '../\\\\../\\\\../\\\\etc/passwd',
        '..%2F..%2F..%2Fetc%2Fpasswd',
        '..%252F..%252F..%252Fetc%252Fpasswd'
      ];

      for (const pattern of complexPatterns) {
        const resolved = tracker.resolveAssetPath(
          pattern,
          join(project.sourceDir, 'index.html'),
          project.sourceDir
        );
        expect(resolved).toBeNull();
      }
    });
  });

  describe('Missing Coverage: CSS Import Chain Edge Cases', () => {
    it('handles deep CSS import chains with missing files', async () => {
      // Create a CSS file that imports a non-existent file
      const cssWithMissingImport = `
        @import url('missing-file.css');
        @import url('fonts/missing-font.css');
        .test { color: blue; }
      `;

      const cssPath = join(project.sourceDir, 'css/with-missing.css');
      await mkdir(dirname(cssPath), { recursive: true });
      await writeFile(cssPath, cssWithMissingImport);
      
      const htmlContent = '<html><head><link rel="stylesheet" href="css/with-missing.css"></head></html>';
      
      await tracker.recordAssetReferences(
        join(project.sourceDir, 'index.html'),
        htmlContent,
        project.sourceDir
      );

      // Should track the main CSS file even if imports are missing
      const assets = tracker.getAllReferencedAssets();
      expect(assets.some(asset => asset.includes('with-missing.css'))).toBe(true);
      
      // Should also track the attempted imports (they become asset references)
      expect(assets.some(asset => asset.includes('missing-file.css'))).toBe(true);
      expect(assets.some(asset => asset.includes('missing-font.css'))).toBe(true);
    });
  });
});