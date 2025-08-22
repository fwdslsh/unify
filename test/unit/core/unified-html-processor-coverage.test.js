// Coverage-focused tests for Unified HTML Processor
import {
  processHtmlUnified,
  processLayoutAttribute,
  getUnifiedConfig,
  shouldUseUnifiedProcessing,
  optimizeHtml,
  extractHtmlMetadata
} from '../../../src/core/unified-html-processor.js';
import { test, expect } from 'bun:test';

test('should remove <slot> and <template> elements and inject content', async () => {
  const html = `<div><slot name="header">Default</slot><template data-target="header">Injected</template></div>`;
  const result = await processHtmlUnified(html, '/fake/path.html', '/fake', {});
  expect(result).not.toContain('<slot');
  expect(result).not.toContain('<template');
  expect(result).toContain('Injected');
  expect(result).not.toContain('data-target');
});

test('should remove data-import, data-target, data-layer attributes', async () => {
  const html = `<div data-import="frag.html" data-target="main" data-layer="foo">Content</div>`;
  const result = await processHtmlUnified(html, '/fake/path.html', '/fake', {});
  expect(result).not.toContain('data-import');
  expect(result).not.toContain('data-target');
  expect(result).not.toContain('data-layer');
});

test('should merge <head> and <body> content with class merging', async () => {
  const layout = `<!DOCTYPE html><html><head><title>Layout</title></head><body class="a b">LayoutBody</body></html>`;
  const page = `<!DOCTYPE html><html><head><title>Page</title></head><body class="b c">PageBody</body></html>`;
  const result = await processLayoutAttribute(page, layout, '/fake', {});
  expect(result).toContain('<title>Page</title>');
  expect(result).toContain('class="a b c"');
  expect(result).toContain('PageBody');
});

test('should deduplicate <meta> tags by name/property/http-equiv', async () => {
  const layout = `<head><meta name="desc" content="layout"><meta property="og:title" content="layout"><meta http-equiv="refresh" content="layout"></head>`;
  const page = `<head><meta name="desc" content="page"><meta property="og:title" content="page"><meta http-equiv="refresh" content="page"></head>`;
  const result = await processLayoutAttribute(`<html>${page}<body></body></html>`, `<html>${layout}<body></body></html>`, '/fake', {});
  expect((result.match(/<meta name="desc"/g) || []).length).toBe(1);
  expect((result.match(/<meta property="og:title"/g) || []).length).toBe(1);
  expect((result.match(/<meta http-equiv="refresh"/g) || []).length).toBe(1);
});

test('should trigger security warning and fail build with --fail-on security', async () => {
  const html = `<meta name="evil" onerror="alert(1)">`;
  let threw = false;
  try {
    await processHtmlUnified(html, '/fake/path.html', '/fake', { failOn: 'security' });
  } catch (e) {
    threw = true;
  }
  expect(threw).toBe(true);
});

test('should extract and inject styles/scripts into head/body', async () => {
  const html = `<head></head><body></body><style>.x{}</style><script>console.log(1)</script>`;
  const result = await processHtmlUnified(html, '/fake/path.html', '/fake', {});
  expect(result).toContain('.x{}');
  expect(result).toContain('console.log(1)');
});

test('should handle missing layout gracefully', async () => {
  let threw = false;
  try {
    await processLayoutAttribute('<html><body>Page</body></html>', null, '/fake', {});
  } catch (e) {
    threw = true;
  }
  expect(threw).toBe(true);
});

test('should handle pretty URLs, minify, clean, ignore, render options', async () => {
  const html = `<a href="about.html">About</a>`;
  const result = await processHtmlUnified(html, '/fake/path.html', '/fake', { prettyUrls: true, minify: true, clean: true, ignore: [], render: ['about.html'] });
  expect(result).toContain('href="/about/"');
});

test('should optimize HTML and remove empty class attributes', async () => {
  const html = `<div class="">NoClass</div>`;
  const result = await optimizeHtml(html);
  expect(result).not.toContain('class=""');
});

test('should extract metadata from HTML', async () => {
  const html = `<head><title>MetaTest</title><meta name="desc" content="meta"></head>`;
  const meta = await extractHtmlMetadata(html);
  expect(meta.title).toBe('MetaTest');
  expect(meta.meta.desc).toBe('meta');
});
