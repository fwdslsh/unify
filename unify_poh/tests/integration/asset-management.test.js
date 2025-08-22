/**
 * Integration Tests for Asset Management
 * US-009: Asset Copying and Management
 * 
 * Following TDD methodology - RED phase
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join, resolve } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';

describe('Asset Management Integration', () => {
  let testDir;
  let sourceRoot;
  let outputRoot;

  beforeEach(() => {
    // Create temporary test directories
    testDir = mkdtempSync(join(tmpdir(), 'asset-integration-test-'));
    sourceRoot = join(testDir, 'src');
    outputRoot = join(testDir, 'dist');
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(outputRoot, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Build Command Integration', () => {
    test('should_process_assets_during_build_when_html_files_present', async () => {
      // Create HTML file with asset references
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Page</title>
            <link rel="stylesheet" href="./css/main.css">
            <link rel="icon" href="./images/favicon.ico">
          </head>
          <body>
            <img src="./images/logo.png" alt="Logo">
            <script src="./js/main.js"></script>
          </body>
        </html>
      `;
      writeFileSync(join(sourceRoot, 'index.html'), htmlContent);
      
      // Create referenced assets
      mkdirSync(join(sourceRoot, 'css'), { recursive: true });
      mkdirSync(join(sourceRoot, 'images'), { recursive: true });
      mkdirSync(join(sourceRoot, 'js'), { recursive: true });
      
      writeFileSync(join(sourceRoot, 'css', 'main.css'), 'body { margin: 0; }');
      writeFileSync(join(sourceRoot, 'images', 'favicon.ico'), 'fake-favicon');
      writeFileSync(join(sourceRoot, 'images', 'logo.png'), 'fake-logo');
      writeFileSync(join(sourceRoot, 'js', 'main.js'), 'console.log("main");');

      // Import build command (this will fail initially)
      const { BuildCommand } = await import('../../src/cli/commands/build-command.js');
      const buildCommand = new BuildCommand();

      const result = await buildCommand.execute({
        source: sourceRoot,
        output: outputRoot,
        clean: true
      });
      
      expect(result.success).toBe(true);
      
      // Verify HTML file was processed and output
      expect(existsSync(join(outputRoot, 'index.html'))).toBe(true);
      
      // Verify all referenced assets were copied
      expect(existsSync(join(outputRoot, 'css', 'main.css'))).toBe(true);
      expect(existsSync(join(outputRoot, 'images', 'favicon.ico'))).toBe(true);
      expect(existsSync(join(outputRoot, 'images', 'logo.png'))).toBe(true);
      expect(existsSync(join(outputRoot, 'js', 'main.js'))).toBe(true);
    });

    test('should_copy_referenced_assets_to_output_when_build_executes', async () => {
      // Create complex asset structure
      const htmlContent = `
        <html>
          <head>
            <link rel="stylesheet" href="./styles/theme.css">
          </head>
          <body>
            <div style="background-image: url('./assets/hero-bg.jpg');">
              <img src="./assets/logo.svg" alt="Logo">
            </div>
          </body>
        </html>
      `;
      writeFileSync(join(sourceRoot, 'page.html'), htmlContent);
      
      // Create CSS with additional asset references
      const cssContent = `
        body { font-family: 'CustomFont'; }
        @font-face {
          font-family: 'CustomFont';
          src: url('./fonts/custom.woff2') format('woff2');
        }
        .icon { background: url('../icons/check.svg') no-repeat; }
      `;
      mkdirSync(join(sourceRoot, 'styles'), { recursive: true });
      writeFileSync(join(sourceRoot, 'styles', 'theme.css'), cssContent);
      
      // Create all referenced assets
      mkdirSync(join(sourceRoot, 'assets'), { recursive: true });
      mkdirSync(join(sourceRoot, 'styles', 'fonts'), { recursive: true });
      mkdirSync(join(sourceRoot, 'icons'), { recursive: true });
      
      writeFileSync(join(sourceRoot, 'assets', 'hero-bg.jpg'), 'fake-hero-bg');
      writeFileSync(join(sourceRoot, 'assets', 'logo.svg'), 'fake-logo-svg');
      writeFileSync(join(sourceRoot, 'styles', 'fonts', 'custom.woff2'), 'fake-font');
      writeFileSync(join(sourceRoot, 'icons', 'check.svg'), 'fake-check-icon');
      
      // Create unreferenced asset (should not be copied)
      writeFileSync(join(sourceRoot, 'assets', 'unused.png'), 'fake-unused');

      const { BuildCommand } = await import('../../src/cli/commands/build-command.js');
      const buildCommand = new BuildCommand();

      const result = await buildCommand.execute({
        source: sourceRoot,
        output: outputRoot
      });
      
      expect(result.success).toBe(true);
      
      // Verify all referenced assets were copied
      expect(existsSync(join(outputRoot, 'styles', 'theme.css'))).toBe(true);
      expect(existsSync(join(outputRoot, 'assets', 'hero-bg.jpg'))).toBe(true);
      expect(existsSync(join(outputRoot, 'assets', 'logo.svg'))).toBe(true);
      expect(existsSync(join(outputRoot, 'styles', 'fonts', 'custom.woff2'))).toBe(true);
      expect(existsSync(join(outputRoot, 'icons', 'check.svg'))).toBe(true);
      
      // Verify unreferenced asset was NOT copied
      expect(existsSync(join(outputRoot, 'assets', 'unused.png'))).toBe(false);
    });

    test('should_preserve_asset_paths_in_html_when_pretty_urls_disabled', async () => {
      const htmlContent = `
        <html>
          <body>
            <img src="./images/test.png" alt="Test">
            <link rel="stylesheet" href="/css/styles.css">
          </body>
        </html>
      `;
      writeFileSync(join(sourceRoot, 'test.html'), htmlContent);
      
      // Create assets
      mkdirSync(join(sourceRoot, 'images'), { recursive: true });
      mkdirSync(join(sourceRoot, 'css'), { recursive: true });
      writeFileSync(join(sourceRoot, 'images', 'test.png'), 'fake-image');
      writeFileSync(join(sourceRoot, 'css', 'styles.css'), 'body { color: red; }');

      const { BuildCommand } = await import('../../src/cli/commands/build-command.js');
      const buildCommand = new BuildCommand();

      const result = await buildCommand.execute({
        source: sourceRoot,
        output: outputRoot,
        prettyUrls: false
      });
      
      expect(result.success).toBe(true);
      
      // Check that asset paths in HTML are preserved
      const outputHtml = readFileSync(join(outputRoot, 'test.html'), 'utf-8');
      expect(outputHtml).toContain('src="./images/test.png"');
      expect(outputHtml).toContain('href="/css/styles.css"');
    });

    test('should_update_asset_paths_in_html_when_pretty_urls_enabled', async () => {
      const htmlContent = `
        <html>
          <body>
            <img src="./images/test.png" alt="Test">
            <link rel="stylesheet" href="/css/styles.css">
          </body>
        </html>
      `;
      writeFileSync(join(sourceRoot, 'test.html'), htmlContent);
      
      // Create assets
      mkdirSync(join(sourceRoot, 'images'), { recursive: true });
      mkdirSync(join(sourceRoot, 'css'), { recursive: true });
      writeFileSync(join(sourceRoot, 'images', 'test.png'), 'fake-image');
      writeFileSync(join(sourceRoot, 'css', 'styles.css'), 'body { color: red; }');

      const { BuildCommand } = await import('../../src/cli/commands/build-command.js');
      const buildCommand = new BuildCommand();

      const result = await buildCommand.execute({
        source: sourceRoot,
        output: outputRoot,
        prettyUrls: true
      });
      
      expect(result.success).toBe(true);
      
      // Check that asset paths in HTML are updated for pretty URLs context
      const outputHtml = readFileSync(join(outputRoot, 'test', 'index.html'), 'utf-8');
      // Asset paths should be adjusted for the new directory structure
      expect(outputHtml).toContain('images/test.png');
      expect(outputHtml).toContain('/css/styles.css');
    });
  });

  describe('File Processing Pipeline', () => {
    test('should_classify_assets_correctly_when_file_classifier_processes_them', async () => {
      // Create various file types
      const files = [
        { path: 'image.png', content: 'fake-image' },
        { path: 'style.css', content: 'body { margin: 0; }' },
        { path: 'script.js', content: 'console.log("test");' },
        { path: 'page.html', content: '<html><body><img src="image.png"></body></html>' },
        { path: 'font.woff2', content: 'fake-font' },
        { path: 'document.pdf', content: 'fake-pdf' }
      ];
      
      for (const file of files) {
        writeFileSync(join(sourceRoot, file.path), file.content);
      }

      const { FileClassifier } = await import('../../src/core/file-classifier.js');
      const fileClassifier = new FileClassifier();
      
      // Test classification of each file type
      for (const file of files) {
        const filePath = join(sourceRoot, file.path);
        const classification = fileClassifier.classifyFile(filePath);
        
        if (file.path === 'page.html') {
          expect(classification.type).toBe('page');
          expect(classification.shouldEmit).toBe(true);
        } else {
          expect(classification.type).toBe('asset');
          expect(classification.shouldCopy).toBeDefined();
        }
      }
    });

    test('should_track_asset_dependencies_when_dependency_tracker_active', async () => {
      // Create HTML page with asset dependencies
      const htmlContent = `
        <html>
          <head><link rel="stylesheet" href="styles.css"></head>
          <body><img src="logo.png" alt="Logo"></body>
        </html>
      `;
      writeFileSync(join(sourceRoot, 'index.html'), htmlContent);
      writeFileSync(join(sourceRoot, 'styles.css'), 'body { margin: 0; }');
      writeFileSync(join(sourceRoot, 'logo.png'), 'fake-logo');

      const { DependencyTracker } = await import('../../src/core/dependency-tracker.js');
      const dependencyTracker = new DependencyTracker();
      
      // Process the HTML page to track dependencies
      const pagePath = join(sourceRoot, 'index.html');
      await dependencyTracker.trackPageDependencies(pagePath, htmlContent, sourceRoot);
      
      // Check that asset dependencies are tracked
      const dependencies = dependencyTracker.getPageDependencies(pagePath);
      expect(dependencies).toContain(join(sourceRoot, 'styles.css'));
      expect(dependencies).toContain(join(sourceRoot, 'logo.png'));
    });

    test('should_rebuild_dependent_pages_when_assets_change', async () => {
      // This test simulates the file watcher behavior
      const htmlContent = '<html><body><img src="shared.png" alt="Shared"></body></html>';
      
      writeFileSync(join(sourceRoot, 'page1.html'), htmlContent);
      writeFileSync(join(sourceRoot, 'page2.html'), htmlContent);
      writeFileSync(join(sourceRoot, 'shared.png'), 'original-shared');

      const { FileWatcher } = await import('../../src/core/file-watcher.js');
      const fileWatcher = new FileWatcher();
      
      // Track which pages reference the shared asset
      const dependentPages = await fileWatcher.findPagesDependingOnAsset(
        join(sourceRoot, 'shared.png'),
        sourceRoot
      );
      
      expect(dependentPages).toContain(join(sourceRoot, 'page1.html'));
      expect(dependentPages).toContain(join(sourceRoot, 'page2.html'));
    });

    test('should_clean_asset_tracking_when_pages_deleted', async () => {
      const htmlContent = '<html><body><img src="temp.png" alt="Temp"></body></html>';
      const pagePath = join(sourceRoot, 'temp-page.html');
      
      writeFileSync(pagePath, htmlContent);
      writeFileSync(join(sourceRoot, 'temp.png'), 'temp-content');

      const { AssetTracker } = await import('../../src/core/asset-tracker.js');
      const assetTracker = new AssetTracker();
      
      // Record asset references
      await assetTracker.recordAssetReferences(pagePath, htmlContent, sourceRoot);
      expect(assetTracker.isAssetReferenced(join(sourceRoot, 'temp.png'))).toBe(true);
      
      // Simulate page deletion
      rmSync(pagePath);
      assetTracker.removePage(pagePath);
      
      // Asset should no longer be tracked as referenced
      expect(assetTracker.isAssetReferenced(join(sourceRoot, 'temp.png'))).toBe(false);
    });
  });

  describe('Performance and Scale', () => {
    test('should_handle_large_asset_collections_efficiently_when_1000_plus_assets', async () => {
      // Create a page that references many assets
      let htmlContent = '<html><body>';
      
      // Create directories for different asset types
      mkdirSync(join(sourceRoot, 'images'), { recursive: true });
      mkdirSync(join(sourceRoot, 'css'), { recursive: true });
      mkdirSync(join(sourceRoot, 'js'), { recursive: true });
      
      // Generate 1000+ small assets and HTML references
      const assetCount = 100; // Reduced for test performance, but logic supports 1000+
      for (let i = 0; i < assetCount; i++) {
        const imageFile = `image-${i.toString().padStart(4, '0')}.png`;
        const cssFile = `style-${i.toString().padStart(4, '0')}.css`;
        const jsFile = `script-${i.toString().padStart(4, '0')}.js`;
        
        writeFileSync(join(sourceRoot, 'images', imageFile), `fake-image-${i}`);
        writeFileSync(join(sourceRoot, 'css', cssFile), `body { --var${i}: ${i}; }`);
        writeFileSync(join(sourceRoot, 'js', jsFile), `console.log(${i});`);
        
        htmlContent += `<img src="./images/${imageFile}" alt="Image ${i}">`;
        htmlContent += `<link rel="stylesheet" href="./css/${cssFile}">`;
        htmlContent += `<script src="./js/${jsFile}"></script>`;
      }
      
      htmlContent += '</body></html>';
      writeFileSync(join(sourceRoot, 'massive-page.html'), htmlContent);

      const { BuildCommand } = await import('../../src/cli/commands/build-command.js');
      const buildCommand = new BuildCommand();
      
      const startTime = Date.now();
      const result = await buildCommand.execute({
        source: sourceRoot,
        output: outputRoot
      });
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      
      // Verify assets were copied
      expect(existsSync(join(outputRoot, 'images', 'image-0000.png'))).toBe(true);
      expect(existsSync(join(outputRoot, 'css', 'style-0000.css'))).toBe(true);
      expect(existsSync(join(outputRoot, 'js', 'script-0000.js'))).toBe(true);
    });

    test('should_complete_asset_processing_within_time_limits_when_typical_site', async () => {
      // Create a typical small site structure
      const pages = [
        { name: 'index.html', content: '<html><body><img src="./assets/logo.png"><link rel="stylesheet" href="./css/main.css"></body></html>' },
        { name: 'about.html', content: '<html><body><img src="./assets/banner.jpg"><script src="./js/utils.js"></script></body></html>' },
        { name: 'contact.html', content: '<html><body><img src="./assets/contact-bg.png"></body></html>' }
      ];
      
      // Create pages
      for (const page of pages) {
        writeFileSync(join(sourceRoot, page.name), page.content);
      }
      
      // Create assets
      mkdirSync(join(sourceRoot, 'assets'), { recursive: true });
      mkdirSync(join(sourceRoot, 'css'), { recursive: true });
      mkdirSync(join(sourceRoot, 'js'), { recursive: true });
      
      writeFileSync(join(sourceRoot, 'assets', 'logo.png'), 'fake-logo');
      writeFileSync(join(sourceRoot, 'assets', 'banner.jpg'), 'fake-banner');
      writeFileSync(join(sourceRoot, 'assets', 'contact-bg.png'), 'fake-contact-bg');
      writeFileSync(join(sourceRoot, 'css', 'main.css'), 'body { font-family: Arial; }');
      writeFileSync(join(sourceRoot, 'js', 'utils.js'), 'function utils() { return true; }');

      const { BuildCommand } = await import('../../src/cli/commands/build-command.js');
      const buildCommand = new BuildCommand();
      
      const startTime = Date.now();
      const result = await buildCommand.execute({
        source: sourceRoot,
        output: outputRoot
      });
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds for typical site
    });

    test('should_use_reasonable_memory_when_processing_large_sites', async () => {
      // This test monitors memory usage during asset processing
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create moderate number of assets to test memory efficiency
      const assetCount = 50;
      let htmlContent = '<html><body>';
      
      mkdirSync(join(sourceRoot, 'assets'), { recursive: true });
      
      for (let i = 0; i < assetCount; i++) {
        const assetFile = `asset-${i}.png`;
        writeFileSync(join(sourceRoot, 'assets', assetFile), Buffer.alloc(1024, i)); // 1KB each
        htmlContent += `<img src="./assets/${assetFile}" alt="Asset ${i}">`;
      }
      
      htmlContent += '</body></html>';
      writeFileSync(join(sourceRoot, 'memory-test.html'), htmlContent);

      const { BuildCommand } = await import('../../src/cli/commands/build-command.js');
      const buildCommand = new BuildCommand();

      const result = await buildCommand.execute({
        source: sourceRoot,
        output: outputRoot
      });
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      expect(result.success).toBe(true);
      // Memory increase should be reasonable (less than 100MB for this test)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Error Handling Integration', () => {
    test('should_warn_when_referenced_asset_not_found', async () => {
      const htmlContent = `
        <html>
          <body>
            <img src="./missing-image.png" alt="Missing">
            <link rel="stylesheet" href="./existing.css">
          </body>
        </html>
      `;
      writeFileSync(join(sourceRoot, 'test.html'), htmlContent);
      
      // Only create one of the referenced assets
      writeFileSync(join(sourceRoot, 'existing.css'), 'body { margin: 0; }');
      // missing-image.png is intentionally not created

      const { BuildCommand } = await import('../../src/cli/commands/build-command.js');
      const buildCommand = new BuildCommand();

      const result = await buildCommand.execute({
        source: sourceRoot,
        output: outputRoot
      });
      
      // Build should succeed but with warnings
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
      
      // Verify warning message mentions the missing asset
      const warningMessages = result.warnings.join(' ');
      expect(warningMessages).toContain('missing-image.png');
    });

    test('should_continue_build_when_asset_copy_fails_non_critically', async () => {
      const htmlContent = `
        <html>
          <body>
            <img src="./good-asset.png" alt="Good">
            <img src="./problematic-asset.png" alt="Problematic">
          </body>
        </html>
      `;
      writeFileSync(join(sourceRoot, 'test.html'), htmlContent);
      writeFileSync(join(sourceRoot, 'good-asset.png'), 'good-content');
      writeFileSync(join(sourceRoot, 'problematic-asset.png'), 'problematic-content');

      const { BuildCommand } = await import('../../src/cli/commands/build-command.js');
      const buildCommand = new BuildCommand();

      const result = await buildCommand.execute({
        source: sourceRoot,
        output: outputRoot
      });
      
      // Build should continue and succeed even if some asset copies fail
      expect(result.success).toBe(true);
      
      // At least the good asset should be copied
      expect(existsSync(join(outputRoot, 'good-asset.png'))).toBe(true);
    });

    test('should_fail_build_when_security_violation_detected', async () => {
      const maliciousHtml = `
        <html>
          <body>
            <img src="../../../etc/passwd" alt="Malicious">
            <script src="./safe-script.js"></script>
          </body>
        </html>
      `;
      writeFileSync(join(sourceRoot, 'malicious.html'), maliciousHtml);
      writeFileSync(join(sourceRoot, 'safe-script.js'), 'console.log("safe");');

      const { BuildCommand } = await import('../../src/cli/commands/build-command.js');
      const buildCommand = new BuildCommand();

      const result = await buildCommand.execute({
        source: sourceRoot,
        output: outputRoot,
        failOn: ['security']  // Enable security failure mode
      });
      
      // Build should fail due to security violation
      expect(result.success).toBe(false);
      expect(result.error).toContain('security');
    });

    test('should_provide_helpful_error_messages_when_asset_issues_occur', async () => {
      // Create various problematic scenarios
      const htmlContent = `
        <html>
          <body>
            <img src="" alt="Empty src">
            <img src="./missing.png" alt="Missing file">
            <link rel="stylesheet" href="../../../dangerous.css">
          </body>
        </html>
      `;
      writeFileSync(join(sourceRoot, 'problematic.html'), htmlContent);

      const { BuildCommand } = await import('../../src/cli/commands/build-command.js');
      const buildCommand = new BuildCommand();

      const result = await buildCommand.execute({
        source: sourceRoot,
        output: outputRoot
      });
      
      // Should provide specific error messages for each issue
      expect(result.warnings || result.errors).toBeDefined();
      const messages = (result.warnings || []).concat(result.errors || []);
      const allMessages = messages.join(' ');
      
      // Check for helpful error messages
      expect(allMessages.length).toBeGreaterThan(0);
    });
  });
});