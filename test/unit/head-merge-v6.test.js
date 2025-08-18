/**
 * Tests for Head Merge Algorithm v0.6.0
 * Tests sophisticated head content merging and deduplication
 */

import { test, expect } from 'bun:test';
import { HeadMergeProcessor } from '../../src/core/head-merge-processor.js';

test('HeadMergeProcessor should merge titles with last-wins', () => {
  const processor = new HeadMergeProcessor();
  
  const fragments = [
    { source: 'layout', headHtml: '<title>Site</title>' },
    { source: 'page', headHtml: '<title>Page Title</title>' }
  ];
  
  const result = processor.mergeHeadContent(fragments);
  expect(result).toContain('<title>Page Title</title>');
  expect(result).not.toContain('<title>Site</title>');
});

test('HeadMergeProcessor should deduplicate meta tags by name', () => {
  const processor = new HeadMergeProcessor();
  
  const fragments = [
    { 
      source: 'layout', 
      headHtml: '<meta name="description" content="Site description">' 
    },
    { 
      source: 'page', 
      headHtml: '<meta name="description" content="Page description">' 
    }
  ];
  
  const result = processor.mergeHeadContent(fragments);
  expect(result).toContain('Page description');
  expect(result).not.toContain('Site description');
});

test('HeadMergeProcessor should preserve scripts with data-allow-duplicate', () => {
  const processor = new HeadMergeProcessor();
  
  const fragments = [
    { 
      source: 'layout', 
      headHtml: '<script src="common.js"></script>' 
    },
    { 
      source: 'page', 
      headHtml: '<script src="common.js" data-allow-duplicate></script>' 
    }
  ];
  
  const result = processor.mergeHeadContent(fragments);
  expect((result.match(/src="common\.js"/g) || []).length).toBe(2);
});

test('HeadMergeProcessor should handle first-wins for link elements', () => {
  const processor = new HeadMergeProcessor();
  
  const fragments = [
    { 
      source: 'layout', 
      headHtml: '<link rel="stylesheet" href="base.css">' 
    },
    { 
      source: 'page', 
      headHtml: '<link rel="stylesheet" href="base.css">' 
    }
  ];
  
  const result = processor.mergeHeadContent(fragments);
  // Should only have one link tag
  expect((result.match(/<link/g) || []).length).toBe(1);
  expect(result).toContain('href="base.css"');
});

test('HeadMergeProcessor should deduplicate meta by property attribute', () => {
  const processor = new HeadMergeProcessor();
  
  const fragments = [
    { 
      source: 'layout', 
      headHtml: '<meta property="og:title" content="Site Title">' 
    },
    { 
      source: 'page', 
      headHtml: '<meta property="og:title" content="Page Title">' 
    }
  ];
  
  const result = processor.mergeHeadContent(fragments);
  expect(result).toContain('Page Title');
  expect(result).not.toContain('Site Title');
});

test('HeadMergeProcessor should preserve inline scripts and styles', () => {
  const processor = new HeadMergeProcessor();
  
  const fragments = [
    { 
      source: 'layout', 
      headHtml: '<script>console.log("layout");</script><style>body { margin: 0; }</style>' 
    },
    { 
      source: 'page', 
      headHtml: '<script>console.log("page");</script><style>h1 { color: red; }</style>' 
    }
  ];
  
  const result = processor.mergeHeadContent(fragments);
  expect(result).toContain('console.log("layout")');
  expect(result).toContain('console.log("page")');
  expect(result).toContain('margin: 0');
  expect(result).toContain('color: red');
});

test('HeadMergeProcessor should handle complex meta combinations', () => {
  const processor = new HeadMergeProcessor();
  
  const fragments = [
    { 
      source: 'layout', 
      headHtml: `
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width">
        <meta property="og:type" content="website">
      `
    },
    { 
      source: 'page', 
      headHtml: `
        <meta name="description" content="Page description">
        <meta property="og:type" content="article">
        <meta property="og:title" content="Page Title">
      `
    }
  ];
  
  const result = processor.mergeHeadContent(fragments);
  
  // Should have charset from layout
  expect(result).toContain('charset="utf-8"');
  // Should have viewport from layout
  expect(result).toContain('width=device-width');
  // Should have description from page
  expect(result).toContain('Page description');
  // og:type should be overridden by page (last wins)
  expect(result).toContain('content="article"');
  expect(result).not.toContain('content="website"');
  // og:title should be from page
  expect(result).toContain('og:title');
});

test('HeadMergeProcessor should handle base tag deduplication', () => {
  const processor = new HeadMergeProcessor();
  
  const fragments = [
    { 
      source: 'layout', 
      headHtml: '<base href="/">' 
    },
    { 
      source: 'page', 
      headHtml: '<base href="/blog/">' 
    }
  ];
  
  const result = processor.mergeHeadContent(fragments);
  expect(result).toContain('href="/blog/"');
  expect(result).not.toContain('href="/"');
  // Should only have one base tag
  expect((result.match(/<base/g) || []).length).toBe(1);
});

test('HeadMergeProcessor should parse attributes correctly', () => {
  const processor = new HeadMergeProcessor();
  
  const fragments = [
    { 
      source: 'test', 
      headHtml: `
        <meta name="robots" content="index,follow">
        <meta property='og:image' content='https://example.com/image.jpg'>
        <meta http-equiv=refresh content=30>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
      `
    }
  ];
  
  const result = processor.mergeHeadContent(fragments);
  expect(result).toContain('name="robots"');
  expect(result).toContain('content="index,follow"');
  expect(result).toContain("property='og:image'");
  expect(result).toContain('http-equiv=refresh');
  expect(result).toContain('sizes="32x32"');
});

test('HeadMergeProcessor should handle empty and malformed input', () => {
  const processor = new HeadMergeProcessor();
  
  const fragments = [
    { source: 'empty', headHtml: '' },
    { source: 'whitespace', headHtml: '   \n\t  ' },
    { source: 'null', headHtml: null },
    { source: 'undefined', headHtml: undefined },
    { source: 'valid', headHtml: '<title>Valid Title</title>' }
  ];
  
  const result = processor.mergeHeadContent(fragments);
  expect(result).toContain('<title>Valid Title</title>');
  expect(result).not.toContain('null');
  expect(result).not.toContain('undefined');
});

test('HeadMergeProcessor should extract head content from HTML', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test Page</title>
        <meta name="description" content="Test description">
      </head>
      <body>
        <h1>Content</h1>
      </body>
    </html>
  `;
  
  const headContent = HeadMergeProcessor.extractHeadContent(html);
  expect(headContent).toContain('<title>Test Page</title>');
  expect(headContent).toContain('meta name="description"');
  expect(headContent).not.toContain('<body>');
  expect(headContent).not.toContain('<h1>');
});

test('HeadMergeProcessor should inject head content into HTML', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Original Title</title>
      </head>
      <body>
        <h1>Content</h1>
      </body>
    </html>
  `;
  
  const newHeadContent = `
    <title>New Title</title>
    <meta name="description" content="New description">
  `;
  
  const result = HeadMergeProcessor.injectHeadContent(html, newHeadContent);
  expect(result).toContain('<title>New Title</title>');
  expect(result).toContain('meta name="description"');
  expect(result).not.toContain('Original Title');
  expect(result).toContain('<h1>Content</h1>'); // Body should be preserved
});

test('HeadMergeProcessor should handle HTML without existing head tag', () => {
  const html = `
    <html>
      <body>
        <h1>Content</h1>
      </body>
    </html>
  `;
  
  const headContent = '<title>Injected Title</title>';
  
  const result = HeadMergeProcessor.injectHeadContent(html, headContent);
  expect(result).toContain('<head>');
  expect(result).toContain('<title>Injected Title</title>');
  expect(result).toContain('<h1>Content</h1>');
});

test('HeadMergeProcessor should handle processing order correctly', () => {
  const processor = new HeadMergeProcessor();
  
  const fragments = [
    { source: 'layout', headHtml: '<meta name="author" content="Layout Author">' },
    { source: 'fragment1', headHtml: '<meta name="keywords" content="Fragment Keywords">' },
    { source: 'fragment2', headHtml: '<meta name="author" content="Fragment Author">' },
    { source: 'page', headHtml: '<meta name="author" content="Page Author">' }
  ];
  
  const result = processor.mergeHeadContent(fragments);
  
  // Page should win for author (last wins)
  expect(result).toContain('Page Author');
  expect(result).not.toContain('Layout Author');
  expect(result).not.toContain('Fragment Author');
  
  // Keywords should be preserved from fragment1
  expect(result).toContain('Fragment Keywords');
});