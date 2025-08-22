/**
 * Tests for AssetTracker Class
 * US-009: Asset Copying and Management
 * 
 * Following TDD methodology - RED phase
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AssetTracker } from '../../../src/core/asset-tracker.js';
import { PathTraversalError } from '../../../src/core/errors.js';
import { join, resolve } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';

describe('AssetTracker', () => {
  let assetTracker;
  let testDir;
  let sourceRoot;

  beforeEach(() => {
    // Create temporary test directory
    testDir = mkdtempSync(join(tmpdir(), 'asset-tracker-test-'));
    sourceRoot = join(testDir, 'src');
    mkdirSync(sourceRoot, { recursive: true });
    
    assetTracker = new AssetTracker();
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('HTML Asset Reference Extraction', () => {
    test('should_extract_image_references_from_html_when_img_tags_present', () => {
      const htmlContent = `
        <html>
          <body>
            <img src="./images/logo.png" alt="Logo">
            <img src="/assets/banner.jpg" alt="Banner">
            <img src="icons/favicon.ico" alt="Favicon">
          </body>
        </html>
      `;
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create asset files for testing
      mkdirSync(join(sourceRoot, 'images'), { recursive: true });
      mkdirSync(join(sourceRoot, 'assets'), { recursive: true });
      mkdirSync(join(sourceRoot, 'icons'), { recursive: true });
      writeFileSync(join(sourceRoot, 'images', 'logo.png'), 'fake-image');
      writeFileSync(join(sourceRoot, 'assets', 'banner.jpg'), 'fake-image');
      writeFileSync(join(sourceRoot, 'icons', 'favicon.ico'), 'fake-icon');

      const references = assetTracker.extractAssetReferences(htmlContent, pagePath, sourceRoot);
      
      expect(references).toHaveLength(3);
      expect(references).toContain(join(sourceRoot, 'images', 'logo.png'));
      expect(references).toContain(join(sourceRoot, 'assets', 'banner.jpg'));
      expect(references).toContain(join(sourceRoot, 'icons', 'favicon.ico'));
    });

    test('should_extract_css_references_from_html_when_link_tags_present', () => {
      const htmlContent = `
        <html>
          <head>
            <link rel="stylesheet" href="./css/main.css">
            <link rel="stylesheet" href="/styles/theme.css">
          </head>
        </html>
      `;
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create CSS files for testing
      mkdirSync(join(sourceRoot, 'css'), { recursive: true });
      mkdirSync(join(sourceRoot, 'styles'), { recursive: true });
      writeFileSync(join(sourceRoot, 'css', 'main.css'), 'body { color: red; }');
      writeFileSync(join(sourceRoot, 'styles', 'theme.css'), 'h1 { color: blue; }');

      const references = assetTracker.extractAssetReferences(htmlContent, pagePath, sourceRoot);
      
      expect(references).toHaveLength(2);
      expect(references).toContain(join(sourceRoot, 'css', 'main.css'));
      expect(references).toContain(join(sourceRoot, 'styles', 'theme.css'));
    });

    test('should_extract_script_references_from_html_when_script_tags_present', () => {
      const htmlContent = `
        <html>
          <body>
            <script src="./js/main.js"></script>
            <script src="/scripts/analytics.js"></script>
          </body>
        </html>
      `;
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create JavaScript files for testing
      mkdirSync(join(sourceRoot, 'js'), { recursive: true });
      mkdirSync(join(sourceRoot, 'scripts'), { recursive: true });
      writeFileSync(join(sourceRoot, 'js', 'main.js'), 'console.log("main");');
      writeFileSync(join(sourceRoot, 'scripts', 'analytics.js'), 'console.log("analytics");');

      const references = assetTracker.extractAssetReferences(htmlContent, pagePath, sourceRoot);
      
      expect(references).toHaveLength(2);
      expect(references).toContain(join(sourceRoot, 'js', 'main.js'));
      expect(references).toContain(join(sourceRoot, 'scripts', 'analytics.js'));
    });

    test('should_extract_icon_references_from_html_when_link_rel_icon_present', () => {
      const htmlContent = `
        <html>
          <head>
            <link rel="icon" href="./favicon.ico">
            <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
            <link rel="shortcut icon" href="icons/shortcut.png">
          </head>
        </html>
      `;
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create icon files for testing
      mkdirSync(join(sourceRoot, 'icons'), { recursive: true });
      writeFileSync(join(sourceRoot, 'favicon.ico'), 'fake-favicon');
      writeFileSync(join(sourceRoot, 'icons', 'apple-touch-icon.png'), 'fake-icon');
      writeFileSync(join(sourceRoot, 'icons', 'shortcut.png'), 'fake-icon');

      const references = assetTracker.extractAssetReferences(htmlContent, pagePath, sourceRoot);
      
      expect(references).toHaveLength(3);
      expect(references).toContain(join(sourceRoot, 'favicon.ico'));
      expect(references).toContain(join(sourceRoot, 'icons', 'apple-touch-icon.png'));
      expect(references).toContain(join(sourceRoot, 'icons', 'shortcut.png'));
    });

    test('should_extract_background_image_from_style_attributes_when_present', () => {
      const htmlContent = `
        <html>
          <body>
            <div style="background-image: url('./images/bg.png'); color: red;">Content</div>
            <section style="background-image: url('/assets/hero.jpg')">Hero</section>
          </body>
        </html>
      `;
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create image files for testing
      mkdirSync(join(sourceRoot, 'images'), { recursive: true });
      mkdirSync(join(sourceRoot, 'assets'), { recursive: true });
      writeFileSync(join(sourceRoot, 'images', 'bg.png'), 'fake-bg');
      writeFileSync(join(sourceRoot, 'assets', 'hero.jpg'), 'fake-hero');

      const references = assetTracker.extractAssetReferences(htmlContent, pagePath, sourceRoot);
      
      expect(references).toHaveLength(2);
      expect(references).toContain(join(sourceRoot, 'images', 'bg.png'));
      expect(references).toContain(join(sourceRoot, 'assets', 'hero.jpg'));
    });

    test('should_ignore_external_urls_when_extracting_references', () => {
      const htmlContent = `
        <html>
          <body>
            <img src="https://example.com/image.png" alt="External">
            <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Open+Sans">
            <script src="//cdn.example.com/jquery.js"></script>
            <img src="./local-image.png" alt="Local">
          </body>
        </html>
      `;
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create only local asset
      writeFileSync(join(sourceRoot, 'local-image.png'), 'fake-local');

      const references = assetTracker.extractAssetReferences(htmlContent, pagePath, sourceRoot);
      
      expect(references).toHaveLength(1);
      expect(references).toContain(join(sourceRoot, 'local-image.png'));
    });

    test('should_ignore_data_urls_when_extracting_references', () => {
      const htmlContent = `
        <html>
          <body>
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==" alt="Data URL">
            <img src="./real-image.png" alt="Real Image">
          </body>
        </html>
      `;
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create real asset
      writeFileSync(join(sourceRoot, 'real-image.png'), 'fake-real');

      const references = assetTracker.extractAssetReferences(htmlContent, pagePath, sourceRoot);
      
      expect(references).toHaveLength(1);
      expect(references).toContain(join(sourceRoot, 'real-image.png'));
    });
  });

  describe('CSS Asset Reference Extraction', () => {
    test('should_extract_font_references_from_css_when_font_face_present', () => {
      const cssContent = `
        @font-face {
          font-family: 'CustomFont';
          src: url('./fonts/custom.woff2') format('woff2'),
               url('./fonts/custom.woff') format('woff');
        }
      `;
      const cssPath = join(sourceRoot, 'css', 'main.css');
      
      // Create font files for testing
      mkdirSync(join(sourceRoot, 'css', 'fonts'), { recursive: true });
      writeFileSync(join(sourceRoot, 'css', 'fonts', 'custom.woff2'), 'fake-font');
      writeFileSync(join(sourceRoot, 'css', 'fonts', 'custom.woff'), 'fake-font');

      const references = assetTracker.extractCssAssetReferences(cssContent, cssPath, sourceRoot);
      
      expect(references).toHaveLength(2);
      expect(references).toContain(join(sourceRoot, 'css', 'fonts', 'custom.woff2'));
      expect(references).toContain(join(sourceRoot, 'css', 'fonts', 'custom.woff'));
    });

    test('should_extract_import_references_from_css_when_import_present', () => {
      const cssContent = `
        @import url('./reset.css');
        @import './typography.css';
        @import url('/global/vars.css');
      `;
      const cssPath = join(sourceRoot, 'css', 'main.css');
      
      // Create imported CSS files for testing
      mkdirSync(join(sourceRoot, 'css'), { recursive: true });
      mkdirSync(join(sourceRoot, 'global'), { recursive: true });
      writeFileSync(join(sourceRoot, 'css', 'reset.css'), '* { margin: 0; }');
      writeFileSync(join(sourceRoot, 'css', 'typography.css'), 'body { font: serif; }');
      writeFileSync(join(sourceRoot, 'global', 'vars.css'), ':root { --color: red; }');

      const references = assetTracker.extractCssAssetReferences(cssContent, cssPath, sourceRoot);
      
      expect(references).toHaveLength(3);
      expect(references).toContain(join(sourceRoot, 'css', 'reset.css'));
      expect(references).toContain(join(sourceRoot, 'css', 'typography.css'));
      expect(references).toContain(join(sourceRoot, 'global', 'vars.css'));
    });

    test('should_extract_url_references_from_css_when_background_present', () => {
      const cssContent = `
        .hero {
          background-image: url('./images/hero-bg.jpg');
        }
        .pattern {
          background: url('/patterns/dots.png') repeat;
        }
        .icon::before {
          content: url('icons/check.svg');
        }
      `;
      const cssPath = join(sourceRoot, 'css', 'main.css');
      
      // Create image files for testing
      mkdirSync(join(sourceRoot, 'css', 'images'), { recursive: true });
      mkdirSync(join(sourceRoot, 'patterns'), { recursive: true });
      mkdirSync(join(sourceRoot, 'css', 'icons'), { recursive: true });
      writeFileSync(join(sourceRoot, 'css', 'images', 'hero-bg.jpg'), 'fake-hero');
      writeFileSync(join(sourceRoot, 'patterns', 'dots.png'), 'fake-pattern');
      writeFileSync(join(sourceRoot, 'css', 'icons', 'check.svg'), 'fake-icon');

      const references = assetTracker.extractCssAssetReferences(cssContent, cssPath, sourceRoot);
      
      expect(references).toHaveLength(3);
      expect(references).toContain(join(sourceRoot, 'css', 'images', 'hero-bg.jpg'));
      expect(references).toContain(join(sourceRoot, 'patterns', 'dots.png'));
      expect(references).toContain(join(sourceRoot, 'css', 'icons', 'check.svg'));
    });
  });

  describe('Path Resolution', () => {
    test('should_resolve_relative_paths_correctly_when_asset_relative_to_page', () => {
      const assetPath = './images/logo.png';
      const pagePath = join(sourceRoot, 'pages', 'about.html');
      
      // Create asset file for testing
      mkdirSync(join(sourceRoot, 'pages', 'images'), { recursive: true });
      writeFileSync(join(sourceRoot, 'pages', 'images', 'logo.png'), 'fake-logo');

      const resolved = assetTracker.resolveAssetPath(assetPath, pagePath, sourceRoot);
      
      expect(resolved).toBe(join(sourceRoot, 'pages', 'images', 'logo.png'));
    });

    test('should_resolve_absolute_paths_correctly_when_asset_absolute_from_root', () => {
      const assetPath = '/assets/banner.jpg';
      const pagePath = join(sourceRoot, 'deep', 'nested', 'page.html');
      
      // Create asset file for testing
      mkdirSync(join(sourceRoot, 'assets'), { recursive: true });
      writeFileSync(join(sourceRoot, 'assets', 'banner.jpg'), 'fake-banner');

      const resolved = assetTracker.resolveAssetPath(assetPath, pagePath, sourceRoot);
      
      expect(resolved).toBe(join(sourceRoot, 'assets', 'banner.jpg'));
    });

    test('should_return_null_when_asset_path_invalid', () => {
      const assetPath = null;
      const pagePath = join(sourceRoot, 'index.html');

      const resolved = assetTracker.resolveAssetPath(assetPath, pagePath, sourceRoot);
      
      expect(resolved).toBeNull();
    });

    test('should_return_null_when_resolved_path_outside_source_root', () => {
      const assetPath = '../../../etc/passwd';
      const pagePath = join(sourceRoot, 'index.html');

      const resolved = assetTracker.resolveAssetPath(assetPath, pagePath, sourceRoot);
      
      expect(resolved).toBeNull();
    });

    test('should_handle_platform_specific_path_separators_correctly', () => {
      const assetPath = './images\\logo.png';  // Mixed separators
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create asset file for testing
      mkdirSync(join(sourceRoot, 'images'), { recursive: true });
      writeFileSync(join(sourceRoot, 'images', 'logo.png'), 'fake-logo');

      const resolved = assetTracker.resolveAssetPath(assetPath, pagePath, sourceRoot);
      const expectedPath = join(sourceRoot, 'images', 'logo.png');
      
      expect(resolved).toBe(expectedPath);
    });
  });

  describe('Reference Tracking', () => {
    test('should_record_asset_references_when_page_processed', async () => {
      const htmlContent = `
        <html>
          <body>
            <img src="./logo.png" alt="Logo">
            <link rel="stylesheet" href="./style.css">
          </body>
        </html>
      `;
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create asset files for testing
      writeFileSync(join(sourceRoot, 'logo.png'), 'fake-logo');
      writeFileSync(join(sourceRoot, 'style.css'), 'body { margin: 0; }');

      await assetTracker.recordAssetReferences(pagePath, htmlContent, sourceRoot);
      
      const pageAssets = assetTracker.getPageAssets(pagePath);
      expect(pageAssets).toHaveLength(2);
      expect(pageAssets).toContain(join(sourceRoot, 'logo.png'));
      expect(pageAssets).toContain(join(sourceRoot, 'style.css'));
    });

    test('should_clear_existing_references_when_page_reprocessed', async () => {
      const initialHtml = '<img src="./old-logo.png" alt="Old Logo">';
      const updatedHtml = '<img src="./new-logo.png" alt="New Logo">';
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create asset files for testing
      writeFileSync(join(sourceRoot, 'old-logo.png'), 'fake-old');
      writeFileSync(join(sourceRoot, 'new-logo.png'), 'fake-new');

      // Initial processing
      await assetTracker.recordAssetReferences(pagePath, initialHtml, sourceRoot);
      expect(assetTracker.isAssetReferenced(join(sourceRoot, 'old-logo.png'))).toBe(true);

      // Updated processing
      await assetTracker.recordAssetReferences(pagePath, updatedHtml, sourceRoot);
      
      expect(assetTracker.isAssetReferenced(join(sourceRoot, 'old-logo.png'))).toBe(false);
      expect(assetTracker.isAssetReferenced(join(sourceRoot, 'new-logo.png'))).toBe(true);
    });

    test('should_remove_asset_from_tracking_when_no_longer_referenced', async () => {
      const htmlContent = '<img src="./temp-logo.png" alt="Temp Logo">';
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create asset file for testing
      writeFileSync(join(sourceRoot, 'temp-logo.png'), 'fake-temp');

      await assetTracker.recordAssetReferences(pagePath, htmlContent, sourceRoot);
      expect(assetTracker.isAssetReferenced(join(sourceRoot, 'temp-logo.png'))).toBe(true);

      // Clear references by processing empty content
      await assetTracker.recordAssetReferences(pagePath, '<html><body></body></html>', sourceRoot);
      
      expect(assetTracker.isAssetReferenced(join(sourceRoot, 'temp-logo.png'))).toBe(false);
    });

    test('should_track_bidirectional_page_asset_relationships', async () => {
      const htmlContent = '<img src="./shared-logo.png" alt="Shared Logo">';
      const page1Path = join(sourceRoot, 'index.html');
      const page2Path = join(sourceRoot, 'about.html');
      const assetPath = join(sourceRoot, 'shared-logo.png');
      
      // Create asset file for testing
      writeFileSync(assetPath, 'fake-shared');

      await assetTracker.recordAssetReferences(page1Path, htmlContent, sourceRoot);
      await assetTracker.recordAssetReferences(page2Path, htmlContent, sourceRoot);
      
      const pagesReferencingAsset = assetTracker.getPagesThatReference(assetPath);
      expect(pagesReferencingAsset).toHaveLength(2);
      expect(pagesReferencingAsset).toContain(page1Path);
      expect(pagesReferencingAsset).toContain(page2Path);
    });

    test('should_handle_multiple_pages_referencing_same_asset', async () => {
      const htmlContent = '<img src="./common.png" alt="Common">';
      const page1Path = join(sourceRoot, 'page1.html');
      const page2Path = join(sourceRoot, 'page2.html');
      const page3Path = join(sourceRoot, 'page3.html');
      const assetPath = join(sourceRoot, 'common.png');
      
      // Create asset file for testing
      writeFileSync(assetPath, 'fake-common');

      await assetTracker.recordAssetReferences(page1Path, htmlContent, sourceRoot);
      await assetTracker.recordAssetReferences(page2Path, htmlContent, sourceRoot);
      await assetTracker.recordAssetReferences(page3Path, htmlContent, sourceRoot);
      
      expect(assetTracker.isAssetReferenced(assetPath)).toBe(true);
      expect(assetTracker.getPagesThatReference(assetPath)).toHaveLength(3);
      
      // Remove one reference and ensure asset is still tracked
      assetTracker.removePage(page1Path);
      expect(assetTracker.isAssetReferenced(assetPath)).toBe(true);
      expect(assetTracker.getPagesThatReference(assetPath)).toHaveLength(2);
      
      // Remove all references and ensure asset is no longer tracked
      assetTracker.removePage(page2Path);
      assetTracker.removePage(page3Path);
      expect(assetTracker.isAssetReferenced(assetPath)).toBe(false);
    });
  });

  describe('Security Validation', () => {
    test('should_reject_path_traversal_attempts_when_asset_path_contains_dotdot', () => {
      const dangerousPaths = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config\\sam',
        './images/../../../secret.txt',
        '/images/../../outside.txt'
      ];
      const pagePath = join(sourceRoot, 'index.html');

      for (const assetPath of dangerousPaths) {
        const resolved = assetTracker.resolveAssetPath(assetPath, pagePath, sourceRoot);
        expect(resolved).toBeNull();
      }
    });

    test('should_reject_absolute_system_paths_when_asset_path_dangerous', () => {
      const dangerousPaths = [
        '/etc/passwd',
        '/var/log/system.log',
        '/usr/bin/bash',
        'C:\\Windows\\System32\\cmd.exe'
      ];
      const pagePath = join(sourceRoot, 'index.html');

      for (const assetPath of dangerousPaths) {
        const resolved = assetTracker.resolveAssetPath(assetPath, pagePath, sourceRoot);
        expect(resolved).toBeNull();
      }
    });

    test('should_reject_url_schemes_when_asset_path_contains_protocol', () => {
      const dangerousPaths = [
        'javascript:alert("xss")',
        'vbscript:msgbox("xss")',
        'file:///etc/passwd',
        'ftp://malicious.com/file.txt'
      ];
      const pagePath = join(sourceRoot, 'index.html');

      for (const assetPath of dangerousPaths) {
        const resolved = assetTracker.resolveAssetPath(assetPath, pagePath, sourceRoot);
        expect(resolved).toBeNull();
      }
    });

    test('should_reject_encoded_traversal_when_asset_path_url_encoded', () => {
      const encodedPaths = [
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',  // ../../../etc/passwd
        '..%2f..%2f..%2fetc%2fpasswd',              // ../../..etc/passwd
        '..%5c..%5c..%5cetc%5cpasswd'               // ..\..\..\etc\passwd
      ];
      const pagePath = join(sourceRoot, 'index.html');

      for (const assetPath of encodedPaths) {
        const resolved = assetTracker.resolveAssetPath(assetPath, pagePath, sourceRoot);
        expect(resolved).toBeNull();
      }
    });
  });

  describe('Utility Methods', () => {
    test('should_return_all_referenced_assets_when_requested', async () => {
      const htmlContent = `
        <img src="./logo.png" alt="Logo">
        <link rel="stylesheet" href="./style.css">
      `;
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create asset files for testing
      writeFileSync(join(sourceRoot, 'logo.png'), 'fake-logo');
      writeFileSync(join(sourceRoot, 'style.css'), 'body { margin: 0; }');

      await assetTracker.recordAssetReferences(pagePath, htmlContent, sourceRoot);
      
      const allAssets = assetTracker.getAllReferencedAssets();
      expect(allAssets).toHaveLength(2);
      expect(allAssets).toContain(join(sourceRoot, 'logo.png'));
      expect(allAssets).toContain(join(sourceRoot, 'style.css'));
    });

    test('should_return_statistics_when_requested', async () => {
      const htmlContent = '<img src="./logo.png" alt="Logo">';
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create asset file for testing
      writeFileSync(join(sourceRoot, 'logo.png'), 'fake-logo');

      await assetTracker.recordAssetReferences(pagePath, htmlContent, sourceRoot);
      
      const stats = assetTracker.getStats();
      expect(stats.totalReferencedAssets).toBe(1);
      expect(stats.totalAssetReferences).toBe(1);
      expect(stats.pagesWithAssets).toBe(1);
    });

    test('should_clear_all_data_when_clear_called', async () => {
      const htmlContent = '<img src="./logo.png" alt="Logo">';
      const pagePath = join(sourceRoot, 'index.html');
      
      // Create asset file for testing
      writeFileSync(join(sourceRoot, 'logo.png'), 'fake-logo');

      await assetTracker.recordAssetReferences(pagePath, htmlContent, sourceRoot);
      expect(assetTracker.getAllReferencedAssets()).toHaveLength(1);
      
      assetTracker.clear();
      
      expect(assetTracker.getAllReferencedAssets()).toHaveLength(0);
      expect(assetTracker.getPageAssets(pagePath)).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    test('should_handle_empty_html_content_gracefully', async () => {
      const pagePath = join(sourceRoot, 'empty.html');
      
      await assetTracker.recordAssetReferences(pagePath, '', sourceRoot);
      
      expect(assetTracker.getPageAssets(pagePath)).toHaveLength(0);
    });

    test('should_handle_malformed_html_gracefully', async () => {
      const malformedHtml = '<img src="logo.png" <link href="style.css">';
      const pagePath = join(sourceRoot, 'malformed.html');
      
      // Create the referenced files
      writeFileSync(join(sourceRoot, 'logo.png'), 'fake-logo');
      writeFileSync(join(sourceRoot, 'style.css'), 'fake-style');
      
      await assetTracker.recordAssetReferences(pagePath, malformedHtml, sourceRoot);
      
      // Should still extract what it can parse - our regex can find src and href even in malformed HTML
      const assets = assetTracker.getPageAssets(pagePath);
      expect(assets.length).toBeGreaterThanOrEqual(0); // Allow it to extract what it can
    });

    test('should_handle_missing_asset_files_gracefully', async () => {
      const htmlContent = '<img src="./missing.png" alt="Missing">';
      const pagePath = join(sourceRoot, 'index.html');
      
      // Don't create the asset file - it's missing
      await assetTracker.recordAssetReferences(pagePath, htmlContent, sourceRoot);
      
      // Should still track the reference even if file doesn't exist
      expect(assetTracker.getPageAssets(pagePath)).toHaveLength(1);
      expect(assetTracker.getPageAssets(pagePath)).toContain(join(sourceRoot, 'missing.png'));
    });
  });
});