/**
 * Focused test to validate CSS asset tracking bug
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { build } from '../../src/core/file-processor.js';
import { createTempDirectory, cleanupTempDirectory } from '../fixtures/temp-helper.js';

describe('CSS Asset Tracking Bug', () => {
  let tempDir, sourceDir, outputDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
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
});