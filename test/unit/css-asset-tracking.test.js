/**
 * Focused test to validate CSS asset tracking bug
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { build } from '../../src/core/file-processor.js';
import { createTempDirectory, cleanupTempDirectory } from '../fixtures/temp-helper.js';

describe('CSS Asset Tracking Bug', () => {
  const tempBase = '/tmp/unify-test-fixed';
  let tempDir, sourceDir, outputDir;

  beforeEach(async () => {
    tempDir = tempBase;
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
    // Clean up before each test
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    // Create required directories and files for tests
    await fs.mkdir(path.join(sourceDir, 'css'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'fonts'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'images'), { recursive: true });

    // Create placeholder files
    await fs.writeFile(path.join(sourceDir, 'css', 'main.css'), '@import url("secondary.css");');
    await fs.writeFile(path.join(sourceDir, 'css', 'secondary.css'), '@import url("main.css");');
    await fs.writeFile(path.join(sourceDir, 'css', 'complex.css'), '.test { background: url("../images/test.jpg"); }');
    await fs.writeFile(path.join(sourceDir, 'css', 'nested-fonts.css'), '@font-face { src: url("/fonts/test.woff2"); }');
    await fs.writeFile(path.join(sourceDir, 'fonts', 'test.woff2'), '');
    await fs.writeFile(path.join(sourceDir, 'images', 'test.jpg'), '');
  });

  afterEach(async () => {
    // Clean up after each test
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should copy font files referenced in CSS @font-face declarations', async () => {
    // Create HTML that references CSS
    await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <title>Font Test</title>
  <link rel="stylesheet" href="/css/fonts.css">
</head>
<body>
  <h1>Testing Font Loading</h1>
</body>
</html>`);

    // Create CSS file that references fonts
    await fs.mkdir(path.join(sourceDir, 'css'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'css', 'fonts.css'), `
@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/custom.woff2') format('woff2'),
       url('/fonts/custom.woff') format('woff');
}

@font-face {
  font-family: 'AnotherFont';
  src: url('../fonts/another.ttf') format('truetype');
}

body {
  font-family: 'CustomFont', sans-serif;
}
`);

    // Create font files
    await fs.mkdir(path.join(sourceDir, 'fonts'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'fonts', 'custom.woff2'), 'FAKE_WOFF2_DATA');
    await fs.writeFile(path.join(sourceDir, 'fonts', 'custom.woff'), 'FAKE_WOFF_DATA');
    await fs.writeFile(path.join(sourceDir, 'fonts', 'another.ttf'), 'FAKE_TTF_DATA');

    // Debug: print sourceDir and file existence
    console.log('sourceDir:', sourceDir);
    const filesToCheck = [
      path.join(sourceDir, 'index.html'),
      path.join(sourceDir, 'css', 'fonts.css'),
      path.join(sourceDir, 'fonts', 'custom.woff2'),
      path.join(sourceDir, 'fonts', 'custom.woff'),
      path.join(sourceDir, 'fonts', 'another.ttf')
    ];
    for (const file of filesToCheck) {
      const exists = await fs.access(file).then(() => true).catch(() => false);
      console.log('File exists:', file, exists);
      if (!exists) throw new Error(`Missing file before build: ${file}`);
    }

    // Build the site
    const result = await build({
      source: sourceDir,
      output: outputDir,
      clean: true
    });

    expect(result.errors.length).toBe(0); // Build should succeed

    // CSS file should be copied
    const cssExists = await fs.access(path.join(outputDir, 'css/fonts.css'))
      .then(() => true).catch(() => false);
    expect(cssExists).toBeTruthy();

    // Font files referenced in CSS should be copied
    const woff2Exists = await fs.access(path.join(outputDir, 'fonts/custom.woff2'))
      .then(() => true).catch(() => false);
    const woffExists = await fs.access(path.join(outputDir, 'fonts/custom.woff'))
      .then(() => true).catch(() => false);
    const ttfExists = await fs.access(path.join(outputDir, 'fonts/another.ttf'))
      .then(() => true).catch(() => false);

    expect(woff2Exists).toBeTruthy(); // WOFF2 font should be copied
    expect(woffExists).toBeTruthy(); // WOFF font should be copied  
    expect(ttfExists).toBeTruthy(); // TTF font should be copied
  });

  it('should copy background images referenced in CSS', async () => {
    // Create HTML that references CSS
    await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <title>Background Test</title>
  <link rel="stylesheet" href="/styles/bg.css">
</head>
<body>
  <div class="hero">Hero Section</div>
</body>
</html>`);

    // Create CSS file that references background images
    await fs.mkdir(path.join(sourceDir, 'styles'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'styles', 'bg.css'), `
.hero {
  background-image: url('/images/hero-bg.jpg');
  background-size: cover;
}

.section {
  background: url('../images/pattern.png') repeat;
}

.icon::before {
  content: '';
  background-image: url(/assets/icons/star.svg);
}
`);

    // Create image files
    await fs.mkdir(path.join(sourceDir, 'images'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'assets/icons'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'images', 'hero-bg.jpg'), 'FAKE_JPG_DATA');
    await fs.writeFile(path.join(sourceDir, 'images', 'pattern.png'), 'FAKE_PNG_DATA');
    await fs.writeFile(path.join(sourceDir, 'assets/icons/star.svg'), 'FAKE_SVG_DATA');

    // Build the site
    const result = await build({
      source: sourceDir,
      output: outputDir,
      clean: true
    });

    expect(result.errors.length).toBe(0); // Build should succeed

    // CSS file should be copied
    const cssExists = await fs.access(path.join(outputDir, 'styles/bg.css'))
      .then(() => true).catch(() => false);
    expect(cssExists).toBeTruthy();

    // Background images referenced in CSS should be copied
    const heroExists = await fs.access(path.join(outputDir, 'images/hero-bg.jpg'))
      .then(() => true).catch(() => false);
    const patternExists = await fs.access(path.join(outputDir, 'images/pattern.png'))
      .then(() => true).catch(() => false);
    const iconExists = await fs.access(path.join(outputDir, 'assets/icons/star.svg'))
      .then(() => true).catch(() => false);

    expect(heroExists).toBeTruthy(); // Hero background should be copied
    expect(patternExists).toBeTruthy(); // Pattern background should be copied
    expect(iconExists).toBeTruthy(); // Icon should be copied
  });

  it('should handle complex CSS url patterns', async () => {
    // Create HTML that references CSS
    await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <title>Complex URL Test</title>
  <link rel="stylesheet" href="/css/complex.css">
</head>
<body>
  <div class="complex">Complex CSS</div>
</body>
</html>`);

    // Create CSS with various URL patterns
    await fs.mkdir(path.join(sourceDir, 'css'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'css', 'complex.css'), `
/* Various URL formats */
.test1 { background: url("../images/quoted.jpg"); }
.test2 { background: url('../images/single-quoted.jpg'); }
.test3 { background: url(../images/unquoted.jpg); }
.test4 { background: url( "/images/absolute-with-spaces.jpg" ); }

/* Multiple URLs in one declaration */
.multi {
  background: url(/images/layer1.png), url(/images/layer2.png);
}

/* URL with format specification */
@font-face {
  font-family: 'Test';
  src: url('/fonts/test.woff2') format('woff2'),
       url('/fonts/test.woff') format('woff');
}
`);

    // Create referenced files
    await fs.mkdir(path.join(sourceDir, 'images'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'fonts'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'images', 'quoted.jpg'), 'QUOTED');
    await fs.writeFile(path.join(sourceDir, 'images', 'single-quoted.jpg'), 'SINGLE_QUOTED');
    await fs.writeFile(path.join(sourceDir, 'images', 'unquoted.jpg'), 'UNQUOTED');
    await fs.writeFile(path.join(sourceDir, 'images', 'absolute-with-spaces.jpg'), 'ABSOLUTE_SPACES');
    await fs.writeFile(path.join(sourceDir, 'images', 'layer1.png'), 'LAYER1');
    await fs.writeFile(path.join(sourceDir, 'images', 'layer2.png'), 'LAYER2');
    await fs.writeFile(path.join(sourceDir, 'fonts', 'test.woff2'), 'TEST_WOFF2');
    await fs.writeFile(path.join(sourceDir, 'fonts', 'test.woff'), 'TEST_WOFF');

    // Build the site
    const result = await build({
      source: sourceDir,
      output: outputDir,
      clean: true
    });

    expect(result.errors.length).toBe(0); // Build should succeed

    // All referenced assets should be copied
    const quotedExists = await fs.access(path.join(outputDir, 'images/quoted.jpg'))
      .then(() => true).catch(() => false);
    const singleQuotedExists = await fs.access(path.join(outputDir, 'images/single-quoted.jpg'))
      .then(() => true).catch(() => false);
    const unquotedExists = await fs.access(path.join(outputDir, 'images/unquoted.jpg'))
      .then(() => true).catch(() => false);
    const absoluteExists = await fs.access(path.join(outputDir, 'images/absolute-with-spaces.jpg'))
      .then(() => true).catch(() => false);
    const layer1Exists = await fs.access(path.join(outputDir, 'images/layer1.png'))
      .then(() => true).catch(() => false);
    const layer2Exists = await fs.access(path.join(outputDir, 'images/layer2.png'))
      .then(() => true).catch(() => false);
    const woff2Exists = await fs.access(path.join(outputDir, 'fonts/test.woff2'))
      .then(() => true).catch(() => false);
    const woffExists = await fs.access(path.join(outputDir, 'fonts/test.woff'))
      .then(() => true).catch(() => false);

    expect(quotedExists).toBeTruthy();
    expect(singleQuotedExists).toBeTruthy();
    expect(unquotedExists).toBeTruthy();
    expect(absoluteExists).toBeTruthy();
    expect(layer1Exists).toBeTruthy();
    expect(layer2Exists).toBeTruthy();
    expect(woff2Exists).toBeTruthy();
    expect(woffExists).toBeTruthy();
  });

  it('should handle deep CSS @import chains and extract assets from all levels', async () => {
    // Create HTML that references a main CSS file
    await fs.writeFile(path.join(sourceDir, 'index.html'), `<!DOCTYPE html>
<html>
<head>
  <title>Deep Import Chain Test</title>
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <h1>Testing Deep CSS Import Chains</h1>
</body>
</html>`);

    // Create directory structure
    await fs.mkdir(path.join(sourceDir, 'css'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'fonts'), { recursive: true });
    await fs.mkdir(path.join(sourceDir, 'images'), { recursive: true });

    // Create main CSS file that imports other CSS files
    await fs.writeFile(path.join(sourceDir, 'css', 'main.css'), `
/* Main CSS file */
@import url('/css/typography.css');
@import url('/css/layout.css');

body {
  margin: 0;
  font-family: 'MainFont', sans-serif;
}
`);

    // Create typography CSS file with font references
    await fs.writeFile(path.join(sourceDir, 'css', 'typography.css'), `
/* Typography CSS file */
@font-face {
  font-family: 'MainFont';
  src: url('/fonts/main-font.woff2') format('woff2'),
       url('/fonts/main-font.woff') format('woff');
}

@font-face {
  font-family: 'HeadingFont';
  src: url('/fonts/headings.ttf') format('truetype');
}

h1 {
  font-family: 'HeadingFont', serif;
}
`);

    // Create layout CSS file that imports yet another CSS file
    await fs.writeFile(path.join(sourceDir, 'css', 'layout.css'), `
/* Layout CSS file */
@import url('/css/components.css');

.container {
  max-width: 1200px;
  margin: 0 auto;
}

.hero {
  background-image: url('/images/hero-bg.jpg');
  background-size: cover;
}
`);

    // Create components CSS file with more asset references
    await fs.writeFile(path.join(sourceDir, 'css', 'components.css'), `
/* Components CSS file */
.button {
  background-image: url('/images/button-bg.png');
  border-image: url('/images/button-border.svg') 1;
}

.icon::before {
  content: '';
  background-image: url('/images/icons/star.svg');
}

.logo {
  background: url('../images/logo.png') no-repeat;
}
`);

    // Create all the referenced asset files
    await fs.writeFile(path.join(sourceDir, 'fonts', 'main-font.woff2'), 'MAIN_FONT_WOFF2');
    await fs.writeFile(path.join(sourceDir, 'fonts', 'main-font.woff'), 'MAIN_FONT_WOFF');
    await fs.writeFile(path.join(sourceDir, 'fonts', 'headings.ttf'), 'HEADINGS_TTF');
    await fs.writeFile(path.join(sourceDir, 'images', 'hero-bg.jpg'), 'HERO_BG');
    await fs.writeFile(path.join(sourceDir, 'images', 'button-bg.png'), 'BUTTON_BG');
    await fs.writeFile(path.join(sourceDir, 'images', 'button-border.svg'), 'BUTTON_BORDER');
    await fs.writeFile(path.join(sourceDir, 'images', 'logo.png'), 'LOGO');
    
    // Create icons directory and file
    await fs.mkdir(path.join(sourceDir, 'images', 'icons'), { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'images', 'icons', 'star.svg'), 'STAR_ICON');

    // Build the site
    const result = await build({
      source: sourceDir,
      output: outputDir,
      clean: true
    });

    expect(result.errors.length).toBe(0); // Build should succeed

    // All CSS files should be copied (main.css -> typography.css, layout.css -> components.css)
    const mainCssExists = await fs.access(path.join(outputDir, 'css/main.css'))
      .then(() => true).catch(() => false);
    const typographyCssExists = await fs.access(path.join(outputDir, 'css/typography.css'))
      .then(() => true).catch(() => false);
    const layoutCssExists = await fs.access(path.join(outputDir, 'css/layout.css'))
      .then(() => true).catch(() => false);
    const componentsCssExists = await fs.access(path.join(outputDir, 'css/components.css'))
      .then(() => true).catch(() => false);

    expect(mainCssExists).toBeTruthy();
    expect(typographyCssExists).toBeTruthy();
    expect(layoutCssExists).toBeTruthy(); 
    expect(componentsCssExists).toBeTruthy();

    // All fonts referenced in imported CSS should be copied
    const mainFontWoff2Exists = await fs.access(path.join(outputDir, 'fonts/main-font.woff2'))
      .then(() => true).catch(() => false);
    const mainFontWoffExists = await fs.access(path.join(outputDir, 'fonts/main-font.woff'))
      .then(() => true).catch(() => false);
    const headingsFontExists = await fs.access(path.join(outputDir, 'fonts/headings.ttf'))
      .then(() => true).catch(() => false);

    expect(mainFontWoff2Exists).toBeTruthy();
    expect(mainFontWoffExists).toBeTruthy();
    expect(headingsFontExists).toBeTruthy();

    // All images referenced in deeply imported CSS should be copied
    const heroBgExists = await fs.access(path.join(outputDir, 'images/hero-bg.jpg'))
      .then(() => true).catch(() => false);
    const buttonBgExists = await fs.access(path.join(outputDir, 'images/button-bg.png'))
      .then(() => true).catch(() => false);
    const buttonBorderExists = await fs.access(path.join(outputDir, 'images/button-border.svg'))
      .then(() => true).catch(() => false);
    const logoExists = await fs.access(path.join(outputDir, 'images/logo.png'))
      .then(() => true).catch(() => false);
    const starIconExists = await fs.access(path.join(outputDir, 'images/icons/star.svg'))
      .then(() => true).catch(() => false);

    expect(heroBgExists).toBeTruthy();
    expect(buttonBgExists).toBeTruthy();
    expect(buttonBorderExists).toBeTruthy();
    expect(logoExists).toBeTruthy();
    expect(starIconExists).toBeTruthy();
  });

  it('should handle circular @import chains gracefully', async () => {
    // Create CSS files with circular imports
    await fs.writeFile(path.join(sourceDir, 'css', 'main.css'), `@import url('secondary.css');`);
    await fs.writeFile(path.join(sourceDir, 'css', 'secondary.css'), `@import url('main.css');`);

    // Run the build process
    const result = await build(sourceDir, outputDir);

    // Ensure no infinite loops occur
    expect(result.errors.length).toBe(0);
  });

  it('should process complex url() paths with spaces and special characters', async () => {
    // Create CSS file with complex url() paths
    await fs.writeFile(path.join(sourceDir, 'css', 'complex.css'), `
.test1 { background: url("../images/quoted with spaces.jpg"); }
.test2 { background: url('../images/single-quoted.jpg'); }
.test3 { background: url(../images/unquoted.jpg); }
.test4 { background: url( "/images/absolute-with-spaces.jpg" ); }
`);

    // Run the build process
    const result = await build(sourceDir, outputDir);

    // Ensure all assets are resolved correctly
    expect(result.errors.length).toBe(0);
  });

  it('should handle nested @font-face declarations with multiple src values', async () => {
    // Create CSS file with nested @font-face declarations
    await fs.writeFile(path.join(sourceDir, 'css', 'nested-fonts.css'), `
@font-face {
  font-family: 'NestedFont';
  src: url('/fonts/nested1.woff2') format('woff2'),
       url('/fonts/nested2.woff') format('woff');
}

@font-face {
  font-family: 'DeepNestedFont';
  src: url('../fonts/deep-nested.ttf') format('truetype');
}
`);

    // Run the build process
    const result = await build(sourceDir, outputDir);

    // Ensure all font files are copied correctly
    expect(result.errors.length).toBe(0);
  });
});