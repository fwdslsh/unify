/**
 * Tests for File Classification System v0.6.0
 * Tests the three-tier precedence system and new CLI options
 */

import { test, expect } from 'bun:test';
import { FileClassifier, FileClassification, PrecedenceTier } from '../../src/core/file-classifier.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper functions for temp directories
async function createTempDir() {
  const tempDir = path.join(__dirname, '../fixtures/unit-test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

async function writeTempFile(tempDir, filePath, content) {
  const fullPath = path.join(tempDir, filePath);
  const dirPath = path.dirname(fullPath);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

async function cleanupTempDir(tempDir) {
  try {
    await fs.rmdir(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

test('FileClassifier should implement three-tier precedence', async () => {
  const tempDir = await createTempDir();
  
  try {
    const classifier = new FileClassifier({
      sourceRoot: tempDir,
      ignore: ['blog/**'],
      render: ['blog/featured/**'],
      ignoreRender: ['blog/featured/draft.md']
    });

    // Tier 1: --render wins over --ignore
    const featured = await classifier.classifyFile('blog/featured/post.md');
    expect(featured.action).toBe(FileClassification.EMIT);
    expect(featured.tier).toBe(PrecedenceTier.EXPLICIT_OVERRIDES);
    expect(featured.reason).toBe('--render pattern match');

    // Tier 2: --ignore-render wins
    const draft = await classifier.classifyFile('blog/featured/draft.md');
    expect(draft.action).toBe(FileClassification.IGNORED);
    expect(draft.tier).toBe(PrecedenceTier.IGNORE_RULES);

    // Tier 2: --ignore wins
    const regular = await classifier.classifyFile('blog/other/post.md');
    expect(regular.action).toBe(FileClassification.IGNORED);
    expect(regular.tier).toBe(PrecedenceTier.IGNORE_RULES);
  } finally {
    await cleanupTempDir(tempDir);
  }
});

test('FileClassifier should handle glob patterns with negation', async () => {
  const classifier = new FileClassifier({
    copy: ['assets/**', '!assets/private/**']
  });

  const publicAsset = await classifier.classifyFile('assets/images/logo.png');
  expect(publicAsset.action).toBe(FileClassification.COPY);

  const privateAsset = await classifier.classifyFile('assets/private/secret.png');
  expect(privateAsset.action).toBe(FileClassification.SKIP);
});

test('FileClassifier should auto-ignore underscore files', async () => {
  const classifier = new FileClassifier({
    autoIgnore: true
  });

  const underscoreFile = await classifier.classifyFile('_layout.html');
  expect(underscoreFile.action).toBe(FileClassification.IGNORED);
  expect(underscoreFile.reason).toBe('auto-ignore (underscore prefix or directory)');

  const underscoreDir = await classifier.classifyFile('_includes/header.html');
  expect(underscoreDir.action).toBe(FileClassification.IGNORED);
  expect(underscoreDir.reason).toBe('auto-ignore (underscore prefix or directory)');
});

test('FileClassifier should respect auto-ignore=false', async () => {
  const classifier = new FileClassifier({
    autoIgnore: false
  });

  const underscoreFile = await classifier.classifyFile('_layout.html');
  expect(underscoreFile.action).toBe(FileClassification.EMIT);
  expect(underscoreFile.reason).toBe('renderable file (.html, .htm, .md)');
});

test('FileClassifier should classify renderable files correctly', async () => {
  const classifier = new FileClassifier();

  const htmlFile = await classifier.classifyFile('page.html');
  expect(htmlFile.action).toBe(FileClassification.EMIT);
  expect(htmlFile.reason).toBe('renderable file (.html, .htm, .md)');

  const markdownFile = await classifier.classifyFile('post.md');
  expect(markdownFile.action).toBe(FileClassification.EMIT);
  expect(markdownFile.reason).toBe('renderable file (.html, .htm, .md)');

  const htmFile = await classifier.classifyFile('page.htm');
  expect(htmFile.action).toBe(FileClassification.EMIT);
  expect(htmFile.reason).toBe('renderable file (.html, .htm, .md)');
});

test('FileClassifier should handle assets and copy patterns', async () => {
  const classifier = new FileClassifier({
    copy: ['docs/**/*.pdf']
  });

  // Implicit assets copy
  const assetFile = await classifier.classifyFile('assets/logo.png');
  expect(assetFile.action).toBe(FileClassification.COPY);
  expect(assetFile.reason).toBe('asset or copy pattern match');

  // Explicit copy pattern
  const pdfFile = await classifier.classifyFile('docs/manual.pdf');
  expect(pdfFile.action).toBe(FileClassification.COPY);
  expect(pdfFile.reason).toBe('asset or copy pattern match');

  // Non-matching file
  const randomFile = await classifier.classifyFile('random.txt');
  expect(randomFile.action).toBe(FileClassification.SKIP);
  expect(randomFile.reason).toBe('non-renderable, no copy rule');
});

test('FileClassifier should track layout and include files', async () => {
  const classifier = new FileClassifier({
    autoIgnore: true
  });

  // Add layout file
  classifier.addLayoutFile('_layout.html');
  const layoutFile = await classifier.classifyFile('_layout.html');
  expect(layoutFile.action).toBe(FileClassification.IGNORED);
  expect(layoutFile.reason).toBe('auto-ignore (layout/include file)');

  // Add include file
  classifier.addIncludeFile('header.html');
  const includeFile = await classifier.classifyFile('header.html');
  expect(includeFile.action).toBe(FileClassification.IGNORED);
  expect(includeFile.reason).toBe('auto-ignore (layout/include file)');
});

test('FileClassifier should generate dry-run report', async () => {
  const classifier = new FileClassifier();

  const classifications = [
    { action: FileClassification.EMIT, filePath: 'index.html', reason: 'renderable file', tier: 3 },
    { action: FileClassification.COPY, filePath: 'assets/logo.png', reason: 'asset match', tier: 3 },
    { action: FileClassification.IGNORED, filePath: '_layout.html', reason: 'auto-ignore', tier: 2 },
    { action: FileClassification.SKIP, filePath: 'readme.txt', reason: 'no rules match', tier: 3 }
  ];

  const report = classifier.generateDryRunReport(classifications);
  
  expect(report).toContain('EMIT (1 files)');
  expect(report).toContain('COPY (1 files)');
  expect(report).toContain('IGNORED (1 files)');
  expect(report).toContain('SKIP (1 files)');
  expect(report).toContain('index.html');
  expect(report).toContain('assets/logo.png');
});

test('FileClassifier should handle last pattern wins logic', async () => {
  const classifier = new FileClassifier({
    ignore: ['*.md'],
    render: ['important.md'] // Should override ignore
  });

  const ignoredFile = await classifier.classifyFile('regular.md');
  expect(ignoredFile.action).toBe(FileClassification.IGNORED);
  expect(ignoredFile.reason).toBe('--ignore pattern match');

  const renderedFile = await classifier.classifyFile('important.md');
  expect(renderedFile.action).toBe(FileClassification.EMIT);
  expect(renderedFile.reason).toBe('--render pattern match');
});

test('FileClassifier should separate ignore-render and ignore-copy', async () => {
  const classifier = new FileClassifier({
    ignoreRender: ['temp/*.html'],
    ignoreCopy: ['assets/temp/*']
  });

  // HTML file matching ignore-render should be ignored
  const htmlFile = await classifier.classifyFile('temp/page.html');
  expect(htmlFile.action).toBe(FileClassification.IGNORED);
  expect(htmlFile.reason).toBe('--ignore-render pattern match');

  // Asset matching ignore-copy should be ignored
  const assetFile = await classifier.classifyFile('assets/temp/file.png');
  expect(assetFile.action).toBe(FileClassification.IGNORED);
  expect(assetFile.reason).toBe('--ignore-copy pattern match');

  // HTML file NOT matching ignore-copy should still be processed
  const regularHtml = await classifier.classifyFile('page.html');
  expect(regularHtml.action).toBe(FileClassification.EMIT);

  // Asset NOT matching ignore-render should still be copied (if in copy pattern)
  const regularAsset = await classifier.classifyFile('assets/logo.png');
  expect(regularAsset.action).toBe(FileClassification.COPY);
});

test('FileClassifier should validate renderable files for render override', async () => {
  const classifier = new FileClassifier({
    render: ['**/*'] // Try to render everything
  });

  // Renderable file should be rendered
  const htmlFile = await classifier.classifyFile('page.html');
  expect(htmlFile.action).toBe(FileClassification.EMIT);
  expect(htmlFile.reason).toBe('--render pattern match');

  // Non-renderable file NOT in assets should be skipped
  const pngFile = await classifier.classifyFile('image.png');
  expect(pngFile.action).toBe(FileClassification.SKIP); // No copy rules match
  expect(pngFile.reason).toBe('non-renderable, no copy rule');
});

test('FileClassifier isRenderable should identify correct file types', () => {
  const classifier = new FileClassifier();

  expect(classifier.isRenderable('page.html')).toBe(true);
  expect(classifier.isRenderable('page.htm')).toBe(true);
  expect(classifier.isRenderable('post.md')).toBe(true);
  expect(classifier.isRenderable('image.png')).toBe(false);
  expect(classifier.isRenderable('style.css')).toBe(false);
  expect(classifier.isRenderable('script.js')).toBe(false);
  expect(classifier.isRenderable('data.json')).toBe(false);
});

test('FileClassifier matchesPattern should handle complex patterns', () => {
  const classifier = new FileClassifier();

  // Basic glob
  expect(classifier.matchesPattern('blog/post.md', ['blog/**'])).toBe(true);
  expect(classifier.matchesPattern('docs/page.md', ['blog/**'])).toBe(false);

  // Negation
  expect(classifier.matchesPattern('blog/draft.md', ['blog/**', '!blog/draft.md'])).toBe(false);
  expect(classifier.matchesPattern('blog/post.md', ['blog/**', '!blog/draft.md'])).toBe(true);

  // Last wins
  expect(classifier.matchesPattern('test.md', ['*.md', '!*.md', '*.md'])).toBe(true);
});

test('FileClassifier should work with cross-platform paths', async () => {
  const classifier = new FileClassifier({
    ignore: ['blog/**']
  });

  // Test with different path separators
  const windowsPath = 'blog\\post.md';
  const unixPath = 'blog/post.md';

  const windowsResult = await classifier.classifyFile(windowsPath);
  const unixResult = await classifier.classifyFile(unixPath);

  // Both should be ignored since we normalize to POSIX internally
  expect(windowsResult.action).toBe(FileClassification.IGNORED);
  expect(unixResult.action).toBe(FileClassification.IGNORED);
});