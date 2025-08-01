/**
 * Asset Handling Unit Tests
 * Tests for proper copying of assets and exclusion of layout/component files
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { build } from '../../src/core/file-processor.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Asset Handling', () => {
  let tempDir, sourceDir, outputDir;

  beforeEach(async () => {
    const uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    tempDir = path.join(__dirname, '../test-temp/asset-test-' + uniqueId);
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
    await fs.mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Asset Copying', () => {
    it('should copy referenced image files to output', async () => {
      // Create test files directly
      await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <img src="/assets/logo.png" alt="Logo">
  <img src="/images/photo.jpg" alt="Photo">
</body>
</html>`);

      await fs.mkdir(path.join(sourceDir, 'assets'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'images'), { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'assets', 'logo.png'), 'FAKE_PNG_DATA');
      await fs.writeFile(path.join(sourceDir, 'images', 'photo.jpg'), 'FAKE_JPG_DATA');
      await fs.writeFile(path.join(sourceDir, 'images', 'unused.gif'), 'UNUSED_IMAGE_DATA');

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      expect(result.errors.length).toBe(0); // Build should succeed

      // Referenced images should be copied
      const logoExists = await fs.access(path.join(outputDir, 'assets/logo.png'))
        .then(() => true).catch(() => false);
      const photoExists = await fs.access(path.join(outputDir, 'images/photo.jpg'))
        .then(() => true).catch(() => false);
      
      expect(logoExists).toBeTruthy(); // Referenced logo.png should be copied
      expect(photoExists).toBeTruthy(); // Referenced photo.jpg should be copied

      // Unreferenced images should NOT be copied (asset tracking should work)
      const unusedExists = await fs.access(path.join(outputDir, 'images/unused.gif'))
        .then(() => true).catch(() => false);
      expect(unusedExists).toBeFalsy(); // Unreferenced unused.gif should NOT be copied
    });

    it('should copy CSS files referenced in HTML', async () => {
      // Create test files directly
      await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/styles/main.css">
  <link rel="stylesheet" href="/css/theme.css">
</head>
<body><h1>Test</h1></body>
</html>`);

      await fs.mkdir(path.join(sourceDir, 'styles'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'css'), { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'styles', 'main.css'), 'body { margin: 0; }');
      await fs.writeFile(path.join(sourceDir, 'css', 'theme.css'), '.theme { color: blue; }');
      await fs.writeFile(path.join(sourceDir, 'css', 'unused.css'), '.unused { display: none; }');

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      expect(result.errors.length).toBe(0); // Build should succeed

      // Referenced CSS should be copied
      const mainCssExists = await fs.access(path.join(outputDir, 'styles/main.css'))
        .then(() => true).catch(() => false);
      const themeCssExists = await fs.access(path.join(outputDir, 'css/theme.css'))
        .then(() => true).catch(() => false);
      
      expect(mainCssExists).toBeTruthy(); // Referenced main.css should be copied
      expect(themeCssExists).toBeTruthy(); // Referenced theme.css should be copied

      // Unreferenced CSS should NOT be copied
      const unusedCssExists = await fs.access(path.join(outputDir, 'css/unused.css'))
        .then(() => true).catch(() => false);
      expect(unusedCssExists).toBeFalsy(); // Unreferenced unused.css should NOT be copied
    });

    it('should copy JavaScript files referenced in HTML', async () => {
      // Create test files directly
      await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <script src="/js/main.js"></script>
  <script src="/scripts/app.js"></script>
</head>
<body><h1>Test</h1></body>
</html>`);

      await fs.mkdir(path.join(sourceDir, 'js'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'scripts'), { recursive: true });
      await fs.writeFile(path.join(sourceDir, 'js', 'main.js'), 'console.log("main");');
      await fs.writeFile(path.join(sourceDir, 'scripts', 'app.js'), 'console.log("app");');
      await fs.writeFile(path.join(sourceDir, 'js', 'unused.js'), 'console.log("unused");');

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      expect(result.errors.length).toBe(0); // Build should succeed

      // Referenced JS should be copied
      const mainJsExists = await fs.access(path.join(outputDir, 'js/main.js'))
        .then(() => true).catch(() => false);
      const appJsExists = await fs.access(path.join(outputDir, 'scripts/app.js'))
        .then(() => true).catch(() => false);
      
      expect(mainJsExists).toBeTruthy(); // Referenced main.js should be copied
      expect(appJsExists).toBeTruthy(); // Referenced app.js should be copied

      // Unreferenced JS should NOT be copied
      const unusedJsExists = await fs.access(path.join(outputDir, 'js/unused.js'))
        .then(() => true).catch(() => false);
      expect(unusedJsExists).toBeFalsy(); // Unreferenced unused.js should NOT be copied
    });

    it('should handle various asset file types', async () => {
      // Create test files directly
      await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="icon" href="/favicon.ico">
</head>
<body>
  <img src="/images/photo.jpg" alt="Photo">
  <video src="/videos/demo.mp4" controls></video>
  <audio src="/audio/music.mp3" controls></audio>
</body>
</html>`);

      await fs.mkdir(path.join(sourceDir, 'css'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'images'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'videos'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'audio'), { recursive: true });
      
      await fs.writeFile(path.join(sourceDir, 'css', 'style.css'), 'body { margin: 0; }');
      await fs.writeFile(path.join(sourceDir, 'favicon.ico'), 'FAKE_ICO_DATA');
      await fs.writeFile(path.join(sourceDir, 'images', 'photo.jpg'), 'FAKE_JPG_DATA');
      await fs.writeFile(path.join(sourceDir, 'videos', 'demo.mp4'), 'FAKE_MP4_DATA');
      await fs.writeFile(path.join(sourceDir, 'audio', 'music.mp3'), 'FAKE_MP3_DATA');

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      expect(result.errors.length).toBe(0); // Build should succeed

      // All referenced assets should be copied
      const cssExists = await fs.access(path.join(outputDir, 'css/style.css'))
        .then(() => true).catch(() => false);
      const icoExists = await fs.access(path.join(outputDir, 'favicon.ico'))
        .then(() => true).catch(() => false);
      const jpgExists = await fs.access(path.join(outputDir, 'images/photo.jpg'))
        .then(() => true).catch(() => false);
      const mp4Exists = await fs.access(path.join(outputDir, 'videos/demo.mp4'))
        .then(() => true).catch(() => false);
      const mp3Exists = await fs.access(path.join(outputDir, 'audio/music.mp3'))
        .then(() => true).catch(() => false);
      
      expect(cssExists).toBeTruthy(); // CSS file should be copied
      expect(icoExists).toBeTruthy(); // ICO file should be copied
      expect(jpgExists).toBeTruthy(); // JPG file should be copied
      expect(mp4Exists).toBeTruthy(); // MP4 file should be copied
      expect(mp3Exists).toBeTruthy(); // MP3 file should be copied
    });

    it('should copy assets referenced in CSS files', async () => {
      // Create test files directly
      await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body><h1>Test</h1></body>
</html>`);

      await fs.mkdir(path.join(sourceDir, 'css'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'images'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'fonts'), { recursive: true });
      
      await fs.writeFile(path.join(sourceDir, 'css', 'style.css'), `
body {
  background-image: url('/images/bg.jpg');
  font-family: 'Custom';
}
@font-face {
  font-family: 'Custom';
  src: url('/fonts/custom.woff2');
}
`);
      
      await fs.writeFile(path.join(sourceDir, 'images', 'bg.jpg'), 'FAKE_BG_DATA');
      await fs.writeFile(path.join(sourceDir, 'fonts', 'custom.woff2'), 'FAKE_FONT_DATA');
      await fs.writeFile(path.join(sourceDir, 'images', 'unused.png'), 'UNUSED_IMAGE');

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      expect(result.errors.length).toBe(0); // Build should succeed

      // Assets referenced in CSS should be copied
      const bgExists = await fs.access(path.join(outputDir, 'images/bg.jpg'))
        .then(() => true).catch(() => false);
      const fontExists = await fs.access(path.join(outputDir, 'fonts/custom.woff2'))
        .then(() => true).catch(() => false);
      
      expect(bgExists).toBeTruthy(); // Background image should be copied
      expect(fontExists).toBeTruthy(); // Font file should be copied

      // Unreferenced assets should NOT be copied
      const unusedExists = await fs.access(path.join(outputDir, 'images/unused.png'))
        .then(() => true).catch(() => false);
      expect(unusedExists).toBeFalsy(); // Unreferenced image should NOT be copied
    });
  });

  describe('Layout and Component Exclusion', () => {
    it('should NOT copy layout directories to output', async () => {
      // Create test files directly
      await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body><h1>Test</h1></body>
</html>`);

      await fs.mkdir(path.join(sourceDir, 'layouts'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'components'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'assets'), { recursive: true });
      
      await fs.writeFile(path.join(sourceDir, 'layouts', 'default.html'), '<html><body>{{ content }}</body></html>');
      await fs.writeFile(path.join(sourceDir, 'components', 'header.html'), '<header>Header</header>');
      await fs.writeFile(path.join(sourceDir, 'assets', 'style.css'), 'body { margin: 0; }');

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      expect(result.errors.length).toBe(0); // Build should succeed

      // Layout and component directories should NOT be copied
      const layoutExists = await fs.access(path.join(outputDir, 'layouts'))
        .then(() => true).catch(() => false);
      const componentExists = await fs.access(path.join(outputDir, 'components'))
        .then(() => true).catch(() => false);
      
      expect(layoutExists).toBeFalsy(); // Layout directory should NOT be copied
      expect(componentExists).toBeFalsy(); // Component directory should NOT be copied

      // Regular assets should be copied
      const assetExists = await fs.access(path.join(outputDir, 'assets'))
        .then(() => true).catch(() => false);
      expect(assetExists).toBeTruthy(); // Asset directory should be copied
    });

    it('should NOT copy component directories to output', async () => {
      // Create test files directly
      await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <link rel="stylesheet" href="/css/main.css">
</head>
<body><h1>Test</h1></body>
</html>`);

      await fs.mkdir(path.join(sourceDir, '.components'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'includes'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'css'), { recursive: true });
      
      await fs.writeFile(path.join(sourceDir, '.components', 'nav.html'), '<nav>Navigation</nav>');
      await fs.writeFile(path.join(sourceDir, 'includes', 'footer.html'), '<footer>Footer</footer>');
      await fs.writeFile(path.join(sourceDir, 'css', 'main.css'), 'body { padding: 0; }');

      const result = await build({
        source: sourceDir,
        output: outputDir,
        components: '.components',
        clean: true
      });

      expect(result.errors.length).toBe(0); // Build should succeed

      // Component directories should NOT be copied
      const compExists = await fs.access(path.join(outputDir, '.components'))
        .then(() => true).catch(() => false);
      const includesExists = await fs.access(path.join(outputDir, 'includes'))
        .then(() => true).catch(() => false);
      
      expect(compExists).toBeFalsy(); // Components directory should NOT be copied
      expect(includesExists).toBeFalsy(); // Includes directory should NOT be copied

      // Regular assets should be copied
      const cssExists = await fs.access(path.join(outputDir, 'css'))
        .then(() => true).catch(() => false);
      expect(cssExists).toBeTruthy(); // CSS directory should be copied
    });

    it('should handle alternative layout/component directory names', async () => {
      // Create test files directly
      await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
  <h1>Test</h1>
  <script src="/public/app.js"></script>
</body>
</html>`);

      await fs.mkdir(path.join(sourceDir, 'templates'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'partials'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'public'), { recursive: true });
      
      await fs.writeFile(path.join(sourceDir, 'templates', 'base.html'), '<html><body>{{ content }}</body></html>');
      await fs.writeFile(path.join(sourceDir, 'partials', 'menu.html'), '<nav>Menu</nav>');
      await fs.writeFile(path.join(sourceDir, 'public', 'app.js'), 'console.log("app");');

      const result = await build({
        source: sourceDir,
        output: outputDir,
        layouts: 'templates',
        components: 'partials',
        clean: true
      });

      expect(result.errors.length).toBe(0); // Build should succeed

      // Custom layout/component directories should NOT be copied
      const templatesExists = await fs.access(path.join(outputDir, 'templates'))
        .then(() => true).catch(() => false);
      const partialsExists = await fs.access(path.join(outputDir, 'partials'))
        .then(() => true).catch(() => false);
      
      expect(templatesExists).toBeFalsy(); // Templates directory should NOT be copied
      expect(partialsExists).toBeFalsy(); // Partials directory should NOT be copied

      // Public assets should be copied
      const publicExists = await fs.access(path.join(outputDir, 'public'))
        .then(() => true).catch(() => false);
      expect(publicExists).toBeTruthy(); // Public directory should be copied
    });
  });

  describe('Build Statistics', () => {
    it('should report correct statistics for processed, copied, and skipped files', async () => {
      // Create test files directly
      await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <title>Home</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <h1>Home Page</h1>
  <img src="/images/logo.png" alt="Logo">
</body>
</html>`);

      await fs.writeFile(path.join(sourceDir, 'about.html'), `<!DOCTYPE html>
<html>
<head><title>About</title></head>
<body><h1>About Page</h1></body>
</html>`);

      await fs.mkdir(path.join(sourceDir, 'css'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'images'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'components'), { recursive: true });
      await fs.mkdir(path.join(sourceDir, 'layouts'), { recursive: true });
      
      await fs.writeFile(path.join(sourceDir, 'css', 'style.css'), 'body { margin: 0; }');
      await fs.writeFile(path.join(sourceDir, 'images', 'logo.png'), 'FAKE_PNG_DATA');
      await fs.writeFile(path.join(sourceDir, 'components', 'header.html'), '<header>Header</header>');
      await fs.writeFile(path.join(sourceDir, 'components', 'footer.html'), '<footer>Footer</footer>');
      await fs.writeFile(path.join(sourceDir, 'layouts', 'default.html'), '<html><body>{{ content }}</body></html>');

      const result = await build({
        source: sourceDir,
        output: outputDir,
        clean: true
      });

      expect(result.errors.length).toBe(0); // Build should succeed
      
      // Should process 2 HTML pages
      expect(result.processed).toBe(2); // Should process 2 pages
      
      // Should copy 2 assets (CSS and image)
      expect(result.copied).toBe(2); // Should copy 2 assets
      
      // Should skip 3 component/layout files (2 components + 1 layout)
      expect(result.skipped).toBe(3); // Should skip 3 layout/component files
    });
  });
});
