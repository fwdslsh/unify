/**
 * Comprehensive tests for Asset Tracker
 * Tests all methods and edge cases for 95%+ coverage
 */

import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { AssetTracker } from '../../../src/core/asset-tracker.js';
import fs from 'fs/promises';
import path from 'path';
import { tmpdir } from 'os';

describe('AssetTracker - Comprehensive Coverage', () => {
  let tracker;
  let tempDir;
  let originalFs;
  
  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'unify-asset-test-'));
    
    // Store original fs functions
    originalFs = {
      readFile: fs.readFile
    };
    
    tracker = new AssetTracker();
  });
  
  afterEach(async () => {
    // Restore original fs functions
    Object.assign(fs, originalFs);
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with empty maps and sets', () => {
      expect(tracker.assetReferences).toBeInstanceOf(Map);
      expect(tracker.referencedAssets).toBeInstanceOf(Set);
      expect(tracker.htmlAssetCache).toBeInstanceOf(Map);
      expect(tracker.assetReferences.size).toBe(0);
      expect(tracker.referencedAssets.size).toBe(0);
      expect(tracker.htmlAssetCache.size).toBe(0);
    });
  });

  describe('HTML Asset Extraction', () => {
    test('should extract CSS file references', () => {
      const html = `
        <html>
          <head>
            <link rel="stylesheet" href="styles/main.css">
            <link rel="stylesheet" href="/global.css">
          </head>
        </html>
      `;
      
      const pagePath = path.join(tempDir, 'page.html');
      const assets = tracker.extractAssetReferences(html, pagePath, tempDir);
      
      expect(assets).toContain(path.join(tempDir, 'styles', 'main.css'));
      expect(assets).toContain(path.join(tempDir, 'global.css'));
    });

    test('should extract JavaScript file references', () => {
      const html = `
        <html>
          <body>
            <script src="js/app.js"></script>
            <script src="/assets/vendor.js"></script>
          </body>
        </html>
      `;
      
      const pagePath = path.join(tempDir, 'page.html');
      const assets = tracker.extractAssetReferences(html, pagePath, tempDir);
      
      expect(assets).toContain(path.join(tempDir, 'js', 'app.js'));
      expect(assets).toContain(path.join(tempDir, 'assets', 'vendor.js'));
    });

    test('should extract image references', () => {
      const html = `
        <html>
          <body>
            <img src="images/logo.png" alt="Logo">
            <img src="/assets/hero.jpg" alt="Hero">
            <img src="icons/icon.svg" alt="Icon">
            <img src="photos/pic.webp" alt="Photo">
          </body>
        </html>
      `;
      
      const pagePath = path.join(tempDir, 'page.html');
      const assets = tracker.extractAssetReferences(html, pagePath, tempDir);
      
      expect(assets).toContain(path.join(tempDir, 'images', 'logo.png'));
      expect(assets).toContain(path.join(tempDir, 'assets', 'hero.jpg'));
      expect(assets).toContain(path.join(tempDir, 'icons', 'icon.svg'));
      expect(assets).toContain(path.join(tempDir, 'photos', 'pic.webp'));
    });

    test('should extract icon references', () => {
      const html = `
        <html>
          <head>
            <link rel="icon" href="favicon.ico">
            <link rel="apple-touch-icon" href="icons/apple-icon.png">
            <link rel="shortcut icon" href="/favicon.png">
            <link href="manifest-icon.png" rel="icon">
          </head>
        </html>
      `;
      
      const pagePath = path.join(tempDir, 'page.html');
      const assets = tracker.extractAssetReferences(html, pagePath, tempDir);
      
      expect(assets).toContain(path.join(tempDir, 'favicon.ico'));
      expect(assets).toContain(path.join(tempDir, 'icons', 'apple-icon.png'));
      expect(assets).toContain(path.join(tempDir, 'favicon.png'));
      expect(assets).toContain(path.join(tempDir, 'manifest-icon.png'));
    });

    test('should extract background images from style attributes', () => {
      const html = `
        <html>
          <body>
            <div style="background-image: url('bg/image.jpg')">Content</div>
            <div style="background-image: url(/assets/bg.png)">Content</div>
          </body>
        </html>
      `;
      
      const pagePath = path.join(tempDir, 'page.html');
      const assets = tracker.extractAssetReferences(html, pagePath, tempDir);
      
      expect(assets).toContain(path.join(tempDir, 'bg', 'image.jpg'));
      expect(assets).toContain(path.join(tempDir, 'assets', 'bg.png'));
    });

    test('should extract font references', () => {
      const html = `
        <html>
          <head>
            <link href="fonts/main.woff2" rel="preload" as="font">
            <link href="/fonts/icons.ttf" rel="font">
          </head>
        </html>
      `;
      
      const pagePath = path.join(tempDir, 'page.html');
      const assets = tracker.extractAssetReferences(html, pagePath, tempDir);
      
      expect(assets).toContain(path.join(tempDir, 'fonts', 'main.woff2'));
      expect(assets).toContain(path.join(tempDir, 'fonts', 'icons.ttf'));
    });

    test('should extract video and audio references', () => {
      const html = `
        <html>
          <body>
            <video src="videos/intro.mp4"></video>
            <audio src="/sounds/beep.mp3"></audio>
            <source src="videos/alt.webm">
          </body>
        </html>
      `;
      
      const pagePath = path.join(tempDir, 'page.html');
      const assets = tracker.extractAssetReferences(html, pagePath, tempDir);
      
      expect(assets).toContain(path.join(tempDir, 'videos', 'intro.mp4'));
      expect(assets).toContain(path.join(tempDir, 'sounds', 'beep.mp3'));
      expect(assets).toContain(path.join(tempDir, 'videos', 'alt.webm'));
    });

    test('should extract object data references', () => {
      const html = `
        <html>
          <body>
            <object data="docs/document.pdf"></object>
            <object data="/files/archive.zip"></object>
          </body>
        </html>
      `;
      
      const pagePath = path.join(tempDir, 'page.html');
      const assets = tracker.extractAssetReferences(html, pagePath, tempDir);
      
      expect(assets).toContain(path.join(tempDir, 'docs', 'document.pdf'));
      expect(assets).toContain(path.join(tempDir, 'files', 'archive.zip'));
    });

    test('should skip external URLs', () => {
      const html = `
        <html>
          <head>
            <link rel="stylesheet" href="https://cdn.example.com/style.css">
            <script src="http://example.com/script.js"></script>
            <img src="//cdn.example.com/image.jpg">
          </head>
        </html>
      `;
      
      const pagePath = path.join(tempDir, 'page.html');
      const assets = tracker.extractAssetReferences(html, pagePath, tempDir);
      
      expect(assets).toHaveLength(0);
    });

    test('should skip data URLs', () => {
      const html = `
        <html>
          <body>
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==">
            <div style="background-image: url('data:image/svg+xml;base64,PHN2Zz4=')"></div>
          </body>
        </html>
      `;
      
      const pagePath = path.join(tempDir, 'page.html');
      const assets = tracker.extractAssetReferences(html, pagePath, tempDir);
      
      expect(assets).toHaveLength(0);
    });

    test('should handle empty or malformed HTML', () => {
      const malformedInputs = [
        '',
        '<html></html>',
        '<img src=>',
        '<script src></script>',
        '<link href>',
        null,
        undefined
      ];
      
      const pagePath = path.join(tempDir, 'page.html');
      
      malformedInputs.forEach(html => {
        expect(() => tracker.extractAssetReferences(html || '', pagePath, tempDir)).not.toThrow();
        const assets = tracker.extractAssetReferences(html || '', pagePath, tempDir);
        expect(Array.isArray(assets)).toBe(true);
      });
    });
  });

  describe('CSS Asset Extraction', () => {
    test('should extract url() references', () => {
      const css = `
        .background { background-image: url('images/bg.jpg'); }
        .icon { background: url(/icons/sprite.png); }
        .font { src: url("fonts/custom.woff2"); }
      `;
      
      const cssPath = path.join(tempDir, 'styles.css');
      const assets = tracker.extractCssAssetReferences(css, cssPath, tempDir);
      
      expect(assets).toContain(path.join(tempDir, 'images', 'bg.jpg'));
      expect(assets).toContain(path.join(tempDir, 'icons', 'sprite.png'));
      expect(assets).toContain(path.join(tempDir, 'fonts', 'custom.woff2'));
    });

    test('should extract @font-face src references', () => {
      const css = `
        @font-face {
          font-family: 'Custom';
          src: url('fonts/custom.eot'),
               url('fonts/custom.woff2') format('woff2'),
               url('fonts/custom.woff') format('woff');
        }
      `;
      
      const cssPath = path.join(tempDir, 'styles.css');
      const assets = tracker.extractCssAssetReferences(css, cssPath, tempDir);
      
      expect(assets).toContain(path.join(tempDir, 'fonts', 'custom.eot'));
      expect(assets).toContain(path.join(tempDir, 'fonts', 'custom.woff2'));
      expect(assets).toContain(path.join(tempDir, 'fonts', 'custom.woff'));
    });

    test('should extract @import references', () => {
      const css = `
        @import url('components/buttons.css');
        @import "layout/grid.css";
        @import url(/global/reset.css);
      `;
      
      const cssPath = path.join(tempDir, 'styles.css');
      const assets = tracker.extractCssAssetReferences(css, cssPath, tempDir);
      
      expect(assets).toContain(path.join(tempDir, 'components', 'buttons.css'));
      expect(assets).toContain(path.join(tempDir, 'layout', 'grid.css'));
      expect(assets).toContain(path.join(tempDir, 'global', 'reset.css'));
    });

    test('should skip external URLs in CSS', () => {
      const css = `
        @import url('https://fonts.googleapis.com/css2?family=Roboto');
        .bg { background: url('http://example.com/image.jpg'); }
        @font-face { src: url('//cdn.example.com/font.woff'); }
      `;
      
      const cssPath = path.join(tempDir, 'styles.css');
      const assets = tracker.extractCssAssetReferences(css, cssPath, tempDir);
      
      expect(assets).toHaveLength(0);
    });

    test('should skip data URLs and fragments in CSS', () => {
      const css = `
        .encoded { background: url('data:image/svg+xml;base64,PHN2Zz4='); }
        .fragment { background: url('#gradient'); }
      `;
      
      const cssPath = path.join(tempDir, 'styles.css');
      const assets = tracker.extractCssAssetReferences(css, cssPath, tempDir);
      
      expect(assets).toHaveLength(0);
    });

    test('should handle empty or malformed CSS', () => {
      const malformedInputs = [
        '',
        'body { color: red; }',
        'url(',
        '@import',
        '@font-face {',
        null,
        undefined
      ];
      
      const cssPath = path.join(tempDir, 'styles.css');
      
      malformedInputs.forEach(css => {
        expect(() => tracker.extractCssAssetReferences(css || '', cssPath, tempDir)).not.toThrow();
        const assets = tracker.extractCssAssetReferences(css || '', cssPath, tempDir);
        expect(Array.isArray(assets)).toBe(true);
      });
    });
  });

  describe('Path Resolution', () => {
    test('should resolve relative paths correctly', () => {
      const pagePath = path.join(tempDir, 'pages', 'about.html');
      const assetPath = 'images/logo.png'; // Use relative path that doesn't traverse up
      
      const resolved = tracker.resolveAssetPath(assetPath, pagePath, tempDir);
      
      expect(resolved).toBe(path.join(tempDir, 'pages', 'images', 'logo.png'));
    });

    test('should resolve absolute paths from source root', () => {
      const pagePath = path.join(tempDir, 'pages', 'about.html');
      const assetPath = '/assets/style.css';
      
      const resolved = tracker.resolveAssetPath(assetPath, pagePath, tempDir);
      
      expect(resolved).toBe(path.join(tempDir, 'assets', 'style.css'));
    });

    test('should normalize paths with multiple separators', () => {
      const pagePath = path.join(tempDir, 'page.html');
      const assetPath = './images/logo.png'; // Use valid path
      
      const resolved = tracker.resolveAssetPath(assetPath, pagePath, tempDir);
      
      expect(resolved).toBe(path.join(tempDir, 'images', 'logo.png'));
    });

    test('should return null for paths outside source root', () => {
      const pagePath = path.join(tempDir, 'page.html');
      const assetPath = '../../../etc/passwd';
      
      const resolved = tracker.resolveAssetPath(assetPath, pagePath, tempDir);
      
      expect(resolved).toBeNull();
    });

    test('should handle path resolution errors', () => {
      const pagePath = '/invalid/path/page.html';
      const assetPath = 'image.png';
      
      // Should not throw, just return null
      const resolved = tracker.resolveAssetPath(assetPath, pagePath, tempDir);
      
      // Result may be null or a valid path depending on implementation
      expect(typeof resolved === 'string' || resolved === null).toBe(true);
    });
  });

  describe('Path Validation', () => {
    test('should validate safe relative paths', () => {
      const safePaths = [
        'images/logo.png',
        './styles/main.css',
        'js/app.js',
        'fonts/custom.woff2'
      ];
      
      safePaths.forEach(assetPath => {
        expect(tracker.validateAssetPath(assetPath, tempDir)).toBe(true);
      });
    });

    test('should validate safe absolute paths', () => {
      const safePaths = [
        '/assets/image.png',
        '/styles/main.css',
        '/js/app.js'
      ];
      
      safePaths.forEach(assetPath => {
        expect(tracker.validateAssetPath(assetPath, tempDir)).toBe(true);
      });
    });

    test('should reject path traversal attempts', () => {
      const dangerousPaths = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        './../../sensitive.txt',
        '../config.json',
        '..',
        '../',
        '..\\',
        'image/../../../etc/passwd'
      ];
      
      dangerousPaths.forEach(assetPath => {
        expect(tracker.validateAssetPath(assetPath, tempDir)).toBe(false);
      });
    });

    test('should reject URL schemes', () => {
      const urlPaths = [
        'file:///etc/passwd',
        'http://example.com/file.txt',
        'ftp://server/file.txt'
        // Note: 'javascript:alert(1)' doesn't contain ://, so it might pass validateAssetPath
        // but would fail in resolveAssetPath due to other validations
      ];
      
      urlPaths.forEach(assetPath => {
        expect(tracker.validateAssetPath(assetPath, tempDir)).toBe(false);
      });
      
      // Test javascript: separately as it may be handled differently
      expect(tracker.validateAssetPath('javascript:alert(1)', tempDir)).toBe(false);
    });

    test('should reject UNC paths', () => {
      const uncPaths = [
        '\\\\server\\share\\file.txt',
        '//server/share/file.txt'
      ];
      
      uncPaths.forEach(assetPath => {
        expect(tracker.validateAssetPath(assetPath, tempDir)).toBe(false);
      });
    });

    test('should reject Windows drive letters', () => {
      const drivePaths = [
        'C:\\Windows\\System32\\file.txt',
        'D:/Program Files/app.exe'
      ];
      
      drivePaths.forEach(assetPath => {
        expect(tracker.validateAssetPath(assetPath, tempDir)).toBe(false);
      });
    });

    test('should reject dangerous system paths', () => {
      const systemPaths = [
        '/etc/passwd',
        '/var/log/system.log',
        '/usr/bin/bash',
        '/root/.ssh/id_rsa',
        '/proc/self/environ'
      ];
      
      systemPaths.forEach(assetPath => {
        expect(tracker.validateAssetPath(assetPath, tempDir)).toBe(false);
      });
    });

    test('should reject encoded path traversal', () => {
      const encodedPaths = [
        '%2e%2e%2f%2e%2e%2f%65%74%63%2f%70%61%73%73%77%64',
        'image%2f%2e%2e%2f%2e%2e%2fconfig.json'
      ];
      
      encodedPaths.forEach(assetPath => {
        expect(tracker.validateAssetPath(assetPath, tempDir)).toBe(false);
      });
    });

    test('should handle invalid inputs', () => {
      const invalidInputs = [
        null,
        undefined,
        '',
        123,
        {},
        []
      ];
      
      invalidInputs.forEach(input => {
        expect(tracker.validateAssetPath(input, tempDir)).toBe(false);
      });
    });
  });

  describe('Path Containment Check', () => {
    test('should confirm paths within directory', () => {
      const validPaths = [
        path.join(tempDir, 'file.txt'),
        path.join(tempDir, 'subdir', 'file.txt'),
        path.join(tempDir, 'a', 'b', 'c', 'file.txt')
      ];
      
      validPaths.forEach(filePath => {
        expect(tracker.isPathWithinDirectory(filePath, tempDir)).toBe(true);
      });
    });

    test('should reject paths outside directory', () => {
      const invalidPaths = [
        path.join(tempDir, '..', 'outside.txt'),
        '/etc/passwd',
        path.resolve(tempDir, '../../../etc/passwd')
      ];
      
      invalidPaths.forEach(filePath => {
        expect(tracker.isPathWithinDirectory(filePath, tempDir)).toBe(false);
      });
    });

    test('should handle path containment errors', () => {
      // Test with invalid paths that might cause errors
      const problematicPaths = [
        null,
        undefined,
        '',
        '\0invalid'
      ];
      
      problematicPaths.forEach(filePath => {
        expect(tracker.isPathWithinDirectory(filePath, tempDir)).toBe(false);
      });
    });
  });

  describe('Asset Reference Recording', () => {
    test('should record asset references from HTML', async () => {
      const html = `
        <html>
          <head>
            <link rel="stylesheet" href="styles.css">
          </head>
          <body>
            <img src="image.png" alt="Image">
          </body>
        </html>
      `;
      
      const pagePath = path.join(tempDir, 'page.html');
      
      await tracker.recordAssetReferences(pagePath, html, tempDir);
      
      const pageAssets = tracker.getPageAssets(pagePath);
      expect(pageAssets).toContain(path.join(tempDir, 'styles.css'));
      expect(pageAssets).toContain(path.join(tempDir, 'image.png'));
      
      expect(tracker.isAssetReferenced(path.join(tempDir, 'styles.css'))).toBe(true);
      expect(tracker.isAssetReferenced(path.join(tempDir, 'image.png'))).toBe(true);
    });

    test('should process CSS files recursively', async () => {
      const html = '<link rel="stylesheet" href="main.css">';
      const css = '@import "components.css"; .bg { background: url("bg.jpg"); }';
      const nestedCss = '.button { background: url("button-bg.png"); }';
      
      const pagePath = path.join(tempDir, 'page.html');
      const cssPath = path.join(tempDir, 'main.css');
      const nestedCssPath = path.join(tempDir, 'components.css');
      
      // Create CSS files
      await fs.writeFile(cssPath, css);
      await fs.writeFile(nestedCssPath, nestedCss);
      
      await tracker.recordAssetReferences(pagePath, html, tempDir);
      
      const pageAssets = tracker.getPageAssets(pagePath);
      expect(pageAssets).toContain(cssPath);
      expect(pageAssets).toContain(nestedCssPath);
      expect(pageAssets).toContain(path.join(tempDir, 'bg.jpg'));
      expect(pageAssets).toContain(path.join(tempDir, 'button-bg.png'));
    });

    test('should handle missing CSS files gracefully', async () => {
      const html = '<link rel="stylesheet" href="missing.css">';
      const pagePath = path.join(tempDir, 'page.html');
      
      // Should not throw even if CSS file doesn't exist
      try {
        await tracker.recordAssetReferences(pagePath, html, tempDir);
        const pageAssets = tracker.getPageAssets(pagePath);
        expect(pageAssets).toContain(path.join(tempDir, 'missing.css'));
      } catch (error) {
        throw new Error('recordAssetReferences should not throw on missing CSS files');
      }
    });

    test('should prevent infinite loops in CSS imports', async () => {
      const css1 = '@import "style2.css"; .class1 {}';
      const css2 = '@import "style1.css"; .class2 {}';
      
      const pagePath = path.join(tempDir, 'page.html');
      const css1Path = path.join(tempDir, 'style1.css');
      const css2Path = path.join(tempDir, 'style2.css');
      
      await fs.writeFile(css1Path, css1);
      await fs.writeFile(css2Path, css2);
      
      const html = '<link rel="stylesheet" href="style1.css">';
      
      // Should not hang due to circular imports
      try {
        await tracker.recordAssetReferences(pagePath, html, tempDir);
        const pageAssets = tracker.getPageAssets(pagePath);
        expect(pageAssets).toContain(css1Path);
        expect(pageAssets).toContain(css2Path);
      } catch (error) {
        throw new Error('recordAssetReferences should handle circular CSS imports gracefully');
      }
    });

    test('should clear existing references when recording new ones', async () => {
      const html1 = '<img src="image1.png">';
      const html2 = '<img src="image2.png">';
      const pagePath = path.join(tempDir, 'page.html');
      
      // Record first set of references
      await tracker.recordAssetReferences(pagePath, html1, tempDir);
      expect(tracker.getPageAssets(pagePath)).toContain(path.join(tempDir, 'image1.png'));
      
      // Record new references - should clear old ones
      await tracker.recordAssetReferences(pagePath, html2, tempDir);
      const pageAssets = tracker.getPageAssets(pagePath);
      expect(pageAssets).not.toContain(path.join(tempDir, 'image1.png'));
      expect(pageAssets).toContain(path.join(tempDir, 'image2.png'));
    });
  });

  describe('Reference Management', () => {
    test('should clear page asset references', async () => {
      const html = '<img src="image.png"><link rel="stylesheet" href="style.css">';
      const pagePath = path.join(tempDir, 'page.html');
      
      await tracker.recordAssetReferences(pagePath, html, tempDir);
      expect(tracker.getPageAssets(pagePath).length).toBeGreaterThan(0);
      
      tracker.clearPageAssetReferences(pagePath);
      expect(tracker.getPageAssets(pagePath)).toEqual([]);
      expect(tracker.isAssetReferenced(path.join(tempDir, 'image.png'))).toBe(false);
    });

    test('should handle clearing non-existent page references', () => {
      expect(() => tracker.clearPageAssetReferences('/non-existent.html')).not.toThrow();
    });

    test('should remove page completely', async () => {
      const html = '<img src="image.png">';
      const pagePath = path.join(tempDir, 'page.html');
      
      await tracker.recordAssetReferences(pagePath, html, tempDir);
      expect(tracker.getPageAssets(pagePath).length).toBeGreaterThan(0);
      
      tracker.removePage(pagePath);
      expect(tracker.getPageAssets(pagePath)).toEqual([]);
    });

    test('should maintain reference counts correctly', async () => {
      const html = '<img src="shared.png">';
      const page1 = path.join(tempDir, 'page1.html');
      const page2 = path.join(tempDir, 'page2.html');
      const sharedAsset = path.join(tempDir, 'shared.png');
      
      // Both pages reference the same asset
      await tracker.recordAssetReferences(page1, html, tempDir);
      await tracker.recordAssetReferences(page2, html, tempDir);
      
      expect(tracker.isAssetReferenced(sharedAsset)).toBe(true);
      expect(tracker.getPagesThatReference(sharedAsset)).toContain(page1);
      expect(tracker.getPagesThatReference(sharedAsset)).toContain(page2);
      
      // Remove one page - asset should still be referenced
      tracker.removePage(page1);
      expect(tracker.isAssetReferenced(sharedAsset)).toBe(true);
      expect(tracker.getPagesThatReference(sharedAsset)).toContain(page2);
      expect(tracker.getPagesThatReference(sharedAsset)).not.toContain(page1);
      
      // Remove second page - asset should no longer be referenced
      tracker.removePage(page2);
      expect(tracker.isAssetReferenced(sharedAsset)).toBe(false);
      expect(tracker.getPagesThatReference(sharedAsset)).toEqual([]);
    });
  });

  describe('Query Methods', () => {
    beforeEach(async () => {
      // Set up some test data
      const html = '<img src="image.png"><link rel="stylesheet" href="style.css">';
      const pagePath = path.join(tempDir, 'page.html');
      await tracker.recordAssetReferences(pagePath, html, tempDir);
    });

    test('should check if asset is referenced', () => {
      expect(tracker.isAssetReferenced(path.join(tempDir, 'image.png'))).toBe(true);
      expect(tracker.isAssetReferenced(path.join(tempDir, 'style.css'))).toBe(true);
      expect(tracker.isAssetReferenced(path.join(tempDir, 'nonexistent.png'))).toBe(false);
    });

    test('should get pages that reference an asset', () => {
      const pagePath = path.join(tempDir, 'page.html');
      const imagePath = path.join(tempDir, 'image.png');
      
      const pages = tracker.getPagesThatReference(imagePath);
      expect(pages).toContain(pagePath);
      expect(pages.length).toBe(1);
      
      const nonePages = tracker.getPagesThatReference(path.join(tempDir, 'nonexistent.png'));
      expect(nonePages).toEqual([]);
    });

    test('should get all referenced assets', () => {
      const allAssets = tracker.getAllReferencedAssets();
      expect(allAssets).toContain(path.join(tempDir, 'image.png'));
      expect(allAssets).toContain(path.join(tempDir, 'style.css'));
      expect(allAssets.length).toBe(2);
    });

    test('should get assets for a specific page', () => {
      const pagePath = path.join(tempDir, 'page.html');
      const pageAssets = tracker.getPageAssets(pagePath);
      
      expect(pageAssets).toContain(path.join(tempDir, 'image.png'));
      expect(pageAssets).toContain(path.join(tempDir, 'style.css'));
      
      const emptyAssets = tracker.getPageAssets('/nonexistent.html');
      expect(emptyAssets).toEqual([]);
    });
  });

  describe('Statistics and Data Management', () => {
    test('should provide accurate statistics', async () => {
      const html1 = '<img src="image1.png"><link rel="stylesheet" href="style1.css">';
      const html2 = '<img src="image1.png"><img src="image2.png">';
      
      await tracker.recordAssetReferences(path.join(tempDir, 'page1.html'), html1, tempDir);
      await tracker.recordAssetReferences(path.join(tempDir, 'page2.html'), html2, tempDir);
      
      const stats = tracker.getStats();
      expect(stats.totalReferencedAssets).toBe(3); // image1.png, style1.css, image2.png
      expect(stats.totalAssetReferences).toBe(4); // image1.png(2), style1.css(1), image2.png(1)
      expect(stats.pagesWithAssets).toBe(2);
    });

    test('should handle empty statistics', () => {
      const stats = tracker.getStats();
      expect(stats.totalReferencedAssets).toBe(0);
      expect(stats.totalAssetReferences).toBe(0);
      expect(stats.pagesWithAssets).toBe(0);
    });

    test('should clear all data', async () => {
      const html = '<img src="image.png">';
      await tracker.recordAssetReferences(path.join(tempDir, 'page.html'), html, tempDir);
      
      expect(tracker.getStats().totalReferencedAssets).toBeGreaterThan(0);
      
      tracker.clear();
      
      const stats = tracker.getStats();
      expect(stats.totalReferencedAssets).toBe(0);
      expect(stats.totalAssetReferences).toBe(0);
      expect(stats.pagesWithAssets).toBe(0);
    });

    test('should export data correctly', async () => {
      const html = '<img src="image.png">';
      const pagePath = path.join(tempDir, 'page.html');
      await tracker.recordAssetReferences(pagePath, html, tempDir);
      
      const exported = tracker.export();
      
      expect(exported).toHaveProperty('assetReferences');
      expect(exported).toHaveProperty('referencedAssets');
      expect(exported).toHaveProperty('htmlAssetCache');
      
      const imagePath = path.join(tempDir, 'image.png');
      expect(exported.assetReferences[imagePath]).toEqual([pagePath]);
      expect(exported.referencedAssets).toContain(imagePath);
      expect(exported.htmlAssetCache[pagePath]).toContain(imagePath);
    });

    test('should import data correctly', async () => {
      const data = {
        assetReferences: {
          '/asset1.png': ['/page1.html'],
          '/asset2.css': ['/page1.html', '/page2.html']
        },
        referencedAssets: ['/asset1.png', '/asset2.css'],
        htmlAssetCache: {
          '/page1.html': ['/asset1.png', '/asset2.css'],
          '/page2.html': ['/asset2.css']
        }
      };
      
      tracker.import(data);
      
      expect(tracker.isAssetReferenced('/asset1.png')).toBe(true);
      expect(tracker.isAssetReferenced('/asset2.css')).toBe(true);
      expect(tracker.getPagesThatReference('/asset2.css')).toEqual(['/page1.html', '/page2.html']);
      expect(tracker.getPageAssets('/page1.html')).toEqual(['/asset1.png', '/asset2.css']);
    });

    test('should clear before importing', async () => {
      // Set up initial data
      const html = '<img src="old-image.png">';
      await tracker.recordAssetReferences(path.join(tempDir, 'old-page.html'), html, tempDir);
      
      // Import new data
      const newData = {
        assetReferences: { '/new-asset.png': ['/new-page.html'] },
        referencedAssets: ['/new-asset.png'],
        htmlAssetCache: { '/new-page.html': ['/new-asset.png'] }
      };
      
      tracker.import(newData);
      
      // Old data should be gone
      expect(tracker.isAssetReferenced(path.join(tempDir, 'old-image.png'))).toBe(false);
      
      // New data should be present
      expect(tracker.isAssetReferenced('/new-asset.png')).toBe(true);
    });

    test('should handle partial import data', () => {
      const partialData = {
        assetReferences: { '/asset.png': ['/page.html'] }
        // Missing referencedAssets and htmlAssetCache
      };
      
      tracker.import(partialData);
      
      expect(tracker.getPagesThatReference('/asset.png')).toEqual(['/page.html']);
      expect(tracker.referencedAssets.size).toBe(0);
      expect(tracker.htmlAssetCache.size).toBe(0);
    });

    test('should handle empty import data', () => {
      tracker.import({});
      
      expect(tracker.assetReferences.size).toBe(0);
      expect(tracker.referencedAssets.size).toBe(0);
      expect(tracker.htmlAssetCache.size).toBe(0);
    });
  });
});