/**
 * Tests for File Classification System v0.6.0
 * Tests the three-tier precedence system and new CLI options
 */

import { test, expect } from 'bun:test';
import { FileClassifier, FileClassification, PrecedenceTier } from '../../src/core/file-classifier.js';

test('FileClassifier should classify renderable files as EMIT by default', async () => {
  const classifier = new FileClassifier();

  const htmlResult = await classifier.classifyFile('index.html');
  expect(htmlResult.action).toBe(FileClassification.EMIT);
  expect(htmlResult.reason).toBe('renderable file (.html, .htm, .md)');
  expect(htmlResult.tier).toBe(PrecedenceTier.DEFAULT_BEHAVIOR);

  const markdownResult = await classifier.classifyFile('post.md');
  expect(markdownResult.action).toBe(FileClassification.EMIT);
  expect(markdownResult.reason).toBe('renderable file (.html, .htm, .md)');

  const htmResult = await classifier.classifyFile('page.htm');
  expect(htmResult.action).toBe(FileClassification.EMIT);
});

test('FileClassifier should classify assets in assets/ directory as COPY', async () => {
  const classifier = new FileClassifier();

  const cssResult = await classifier.classifyFile('assets/styles.css');
  expect(cssResult.action).toBe(FileClassification.COPY);
  expect(cssResult.reason).toBe('asset or copy pattern match');
  expect(cssResult.tier).toBe(PrecedenceTier.DEFAULT_BEHAVIOR);

  const imageResult = await classifier.classifyFile('assets/logo.png');
  expect(imageResult.action).toBe(FileClassification.COPY);

  const jsResult = await classifier.classifyFile('assets/script.js');
  expect(jsResult.action).toBe(FileClassification.COPY);
});

test('FileClassifier should classify non-assets as SKIP by default', async () => {
  const classifier = new FileClassifier();

  const cssResult = await classifier.classifyFile('styles.css');
  expect(cssResult.action).toBe(FileClassification.SKIP);
  expect(cssResult.reason).toBe('non-renderable, no copy rule');

  const txtResult = await classifier.classifyFile('readme.txt');
  expect(txtResult.action).toBe(FileClassification.SKIP);
});

test('FileClassifier should auto-ignore underscore files when enabled', async () => {
  const classifier = new FileClassifier({ autoIgnore: true });

  const underscoreFileResult = await classifier.classifyFile('_layout.html');
  expect(underscoreFileResult.action).toBe(FileClassification.IGNORED);
  expect(underscoreFileResult.reason).toBe('auto-ignore (underscore prefix or directory)');
  expect(underscoreFileResult.tier).toBe(PrecedenceTier.IGNORE_RULES);

  const underscoreDirResult = await classifier.classifyFile('_includes/header.html');
  expect(underscoreDirResult.action).toBe(FileClassification.IGNORED);
  expect(underscoreDirResult.reason).toBe('auto-ignore (underscore prefix or directory)');
});

test('FileClassifier should respect auto-ignore=false', async () => {
  const classifier = new FileClassifier({ autoIgnore: false });

  const underscoreFileResult = await classifier.classifyFile('_layout.html');
  expect(underscoreFileResult.action).toBe(FileClassification.EMIT);
  expect(underscoreFileResult.reason).toBe('renderable file (.html, .htm, .md)');
});

test('FileClassifier should handle three-tier precedence system', async () => {
  const classifier = new FileClassifier({
    ignore: ['blog/**'],
    render: ['blog/featured/**'],
    ignoreRender: ['blog/featured/draft.md']
  });

  // Tier 1: --render wins over --ignore
  const featuredResult = await classifier.classifyFile('blog/featured/post.md');
  expect(featuredResult.action).toBe(FileClassification.EMIT);
  expect(featuredResult.tier).toBe(PrecedenceTier.EXPLICIT_OVERRIDES);
  expect(featuredResult.reason).toBe('--render pattern match');

  // Tier 2: --ignore-render wins over --render
  const draftResult = await classifier.classifyFile('blog/featured/draft.md');
  expect(draftResult.action).toBe(FileClassification.IGNORED);
  expect(draftResult.tier).toBe(PrecedenceTier.IGNORE_RULES);
  expect(draftResult.reason).toBe('--ignore-render pattern match');

  // Tier 2: --ignore wins
  const regularResult = await classifier.classifyFile('blog/other/post.md');
  expect(regularResult.action).toBe(FileClassification.IGNORED);
  expect(regularResult.tier).toBe(PrecedenceTier.IGNORE_RULES);
  expect(regularResult.reason).toBe('--ignore pattern match');
});

test('FileClassifier should handle copy patterns', async () => {
  const classifier = new FileClassifier({
    copy: ['docs/**/*.pdf', 'config/*.json']
  });

  const pdfResult = await classifier.classifyFile('docs/manual.pdf');
  expect(pdfResult.action).toBe(FileClassification.COPY);
  expect(pdfResult.reason).toBe('asset or copy pattern match');

  const configResult = await classifier.classifyFile('config/settings.json');
  expect(configResult.action).toBe(FileClassification.COPY);
  expect(configResult.reason).toBe('asset or copy pattern match');

  const otherResult = await classifier.classifyFile('random.txt');
  expect(otherResult.action).toBe(FileClassification.SKIP);
  expect(otherResult.reason).toBe('non-renderable, no copy rule');
});

test('FileClassifier should handle ignore-render and ignore-copy separately', async () => {
  const classifier = new FileClassifier({
    ignoreRender: ['temp/*.html'],
    ignoreCopy: ['assets/temp/*']
  });

  const htmlResult = await classifier.classifyFile('temp/page.html');
  expect(htmlResult.action).toBe(FileClassification.IGNORED);
  expect(htmlResult.reason).toBe('--ignore-render pattern match');

  const assetResult = await classifier.classifyFile('assets/temp/file.png');
  expect(assetResult.action).toBe(FileClassification.IGNORED);
  expect(assetResult.reason).toBe('--ignore-copy pattern match');

  // HTML file NOT matching ignore-copy should still be processed
  const regularHtmlResult = await classifier.classifyFile('page.html');
  expect(regularHtmlResult.action).toBe(FileClassification.EMIT);

  // Asset NOT matching ignore-render should still be copied
  const regularAssetResult = await classifier.classifyFile('assets/logo.png');
  expect(regularAssetResult.action).toBe(FileClassification.COPY);
});

test('FileClassifier should handle glob patterns with negation', async () => {
  const classifier = new FileClassifier({
    copy: ['assets/**', '!assets/private/**']
  });

  const publicAssetResult = await classifier.classifyFile('assets/images/logo.png');
  expect(publicAssetResult.action).toBe(FileClassification.COPY);

  const privateAssetResult = await classifier.classifyFile('assets/private/secret.png');
  expect(privateAssetResult.action).toBe(FileClassification.SKIP);
});

test('FileClassifier should use last-pattern-wins logic', async () => {
  const classifier = new FileClassifier({
    ignore: ['*.md'],
    render: ['important.md']
  });

  const ignoredResult = await classifier.classifyFile('regular.md');
  expect(ignoredResult.action).toBe(FileClassification.IGNORED);
  expect(ignoredResult.reason).toBe('--ignore pattern match');

  const renderedResult = await classifier.classifyFile('important.md');
  expect(renderedResult.action).toBe(FileClassification.EMIT);
  expect(renderedResult.reason).toBe('--render pattern match');
});

test('FileClassifier should track layout and include files', async () => {
  const classifier = new FileClassifier({ autoIgnore: true });

  classifier.addLayoutFile('_layout.html');
  const layoutResult = await classifier.classifyFile('_layout.html');
  expect(layoutResult.action).toBe(FileClassification.IGNORED);
  expect(layoutResult.reason).toBe('auto-ignore (layout/include file)');

  classifier.addIncludeFile('header.html');
  const includeResult = await classifier.classifyFile('header.html');
  expect(includeResult.action).toBe(FileClassification.IGNORED);
  expect(includeResult.reason).toBe('auto-ignore (layout/include file)');
});

test('FileClassifier should generate dry-run reports', async () => {
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

test('FileClassifier isRenderable should identify correct file types', () => {
  const classifier = new FileClassifier();

  expect(classifier.isRenderable('page.html')).toBe(true);
  expect(classifier.isRenderable('page.htm')).toBe(true);
  expect(classifier.isRenderable('post.md')).toBe(true);
  expect(classifier.isRenderable('image.png')).toBe(false);
  expect(classifier.isRenderable('style.css')).toBe(false);
  expect(classifier.isRenderable('script.js')).toBe(false);
});

test('FileClassifier should handle cross-platform paths', async () => {
  const classifier = new FileClassifier({
    ignore: ['blog/**']
  });

  const windowsPathResult = await classifier.classifyFile('blog\\\\post.md');
  const unixPathResult = await classifier.classifyFile('blog/post.md');

  // Both should be ignored since we normalize to POSIX internally
  expect(windowsPathResult.action).toBe(FileClassification.IGNORED);
  expect(unixPathResult.action).toBe(FileClassification.IGNORED);
});

test('FileClassifier should validate render overrides only work on renderable files', async () => {
  const classifier = new FileClassifier({
    render: ['**/*']
  });

  const htmlResult = await classifier.classifyFile('page.html');
  expect(htmlResult.action).toBe(FileClassification.EMIT);
  expect(htmlResult.reason).toBe('--render pattern match');

  // Non-renderable files should not be affected by render patterns
  const pngResult = await classifier.classifyFile('image.png');
  expect(pngResult.action).toBe(FileClassification.SKIP);
  expect(pngResult.reason).toBe('non-renderable, no copy rule');
});