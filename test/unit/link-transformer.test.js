/**
 * Test for link transformer utility functions
 */

import { describe, test, expect } from 'bun:test';
import path from 'path';
import {
  shouldTransformLink,
  parseHref,
  resolveLinkPath,
  transformToPrettyUrl,
  transformLink,
  transformLinksInHtml
} from '../../src/utils/link-transformer.js';

describe('Link Transformer Utilities', () => {
  describe('shouldTransformLink', () => {
    test('should return true for HTML links', () => {
      expect(shouldTransformLink('./about.html')).toBe(true);
      expect(shouldTransformLink('/blog.html')).toBe(true);
      expect(shouldTransformLink('docs/guide.htm')).toBe(true);
      expect(shouldTransformLink('../index.html')).toBe(true);
    });

    test('should return false for external URLs', () => {
      expect(shouldTransformLink('https://example.com')).toBe(false);
      expect(shouldTransformLink('http://localhost:3000')).toBe(false);
      expect(shouldTransformLink('ftp://files.example.com')).toBe(false);
    });

    test('should return false for protocol links', () => {
      expect(shouldTransformLink('mailto:test@example.com')).toBe(false);
      expect(shouldTransformLink('tel:+1234567890')).toBe(false);
      expect(shouldTransformLink('data:image/png;base64,abc')).toBe(false);
    });

    test('should return false for fragment-only links', () => {
      expect(shouldTransformLink('#section')).toBe(false);
      expect(shouldTransformLink('#top')).toBe(false);
    });

    test('should return false for non-HTML files', () => {
      expect(shouldTransformLink('/styles.css')).toBe(false);
      expect(shouldTransformLink('./script.js')).toBe(false);
      expect(shouldTransformLink('/assets/document.pdf')).toBe(false);
      expect(shouldTransformLink('/images/photo.jpg')).toBe(false);
    });

    test('should return false for empty or invalid inputs', () => {
      expect(shouldTransformLink('')).toBe(false);
      expect(shouldTransformLink(null)).toBe(false);
      expect(shouldTransformLink(undefined)).toBe(false);
      expect(shouldTransformLink('   ')).toBe(false);
    });
  });

  describe('parseHref', () => {
    test('should parse path only', () => {
      const result = parseHref('./about.html');
      expect(result).toEqual({
        path: './about.html',
        query: '',
        fragment: ''
      });
    });

    test('should parse path with query', () => {
      const result = parseHref('./contact.html?form=1');
      expect(result).toEqual({
        path: './contact.html',
        query: '?form=1',
        fragment: ''
      });
    });

    test('should parse path with fragment', () => {
      const result = parseHref('/blog.html#latest');
      expect(result).toEqual({
        path: '/blog.html',
        query: '',
        fragment: '#latest'
      });
    });

    test('should parse path with query and fragment', () => {
      const result = parseHref('./about.html?tab=info#section');
      expect(result).toEqual({
        path: './about.html',
        query: '?tab=info',
        fragment: '#section'
      });
    });

    test('should handle complex queries and fragments', () => {
      const result = parseHref('/search.html?q=test&sort=date#results');
      expect(result).toEqual({
        path: '/search.html',
        query: '?q=test&sort=date',
        fragment: '#results'
      });
    });
  });

  describe('resolveLinkPath', () => {
    const sourceRoot = '/project/src';
    
    test('should resolve absolute paths', () => {
      const result = resolveLinkPath('/about.html', '/project/src/index.html', sourceRoot);
      expect(result).toBe('/about.html');
    });

    test('should resolve relative paths from root', () => {
      const result = resolveLinkPath('./about.html', '/project/src/index.html', sourceRoot);
      expect(result).toBe('/about.html');
    });

    test('should resolve relative paths from subdirectory', () => {
      const result = resolveLinkPath('./guide.html', '/project/src/docs/index.html', sourceRoot);
      expect(result).toBe('/docs/guide.html');
    });

    test('should resolve parent directory paths', () => {
      const result = resolveLinkPath('../index.html', '/project/src/docs/guide.html', sourceRoot);
      expect(result).toBe('/index.html');
    });

    test('should resolve complex relative paths', () => {
      const result = resolveLinkPath('../../contact.html', '/project/src/docs/tutorials/advanced.html', sourceRoot);
      expect(result).toBe('/contact.html');
    });
  });

  describe('transformToPrettyUrl', () => {
    test('should transform regular HTML files', () => {
      expect(transformToPrettyUrl('/about.html')).toBe('/about/');
      expect(transformToPrettyUrl('/blog.html')).toBe('/blog/');
      expect(transformToPrettyUrl('/contact.htm')).toBe('/contact/');
    });

    test('should transform root index to /', () => {
      expect(transformToPrettyUrl('/index.html')).toBe('/');
      expect(transformToPrettyUrl('index.html')).toBe('/');
    });

    test('should transform nested index files', () => {
      expect(transformToPrettyUrl('/docs/index.html')).toBe('/docs/');
      expect(transformToPrettyUrl('/blog/index.html')).toBe('/blog/');
    });

    test('should transform nested HTML files', () => {
      expect(transformToPrettyUrl('/docs/guide.html')).toBe('/docs/guide/');
      expect(transformToPrettyUrl('/blog/posts/first.html')).toBe('/blog/posts/first/');
    });
  });

  describe('transformLink', () => {
    const sourceRoot = '/project/src';
    const currentPagePath = '/project/src/index.html';

    test('should transform relative HTML links', () => {
      const result = transformLink('./about.html', currentPagePath, sourceRoot);
      expect(result).toBe('/about/');
    });

    test('should transform absolute HTML links', () => {
      const result = transformLink('/blog.html', currentPagePath, sourceRoot);
      expect(result).toBe('/blog/');
    });

    test('should preserve query parameters and fragments', () => {
      expect(transformLink('./contact.html?form=1', currentPagePath, sourceRoot)).toBe('/contact/?form=1');
      expect(transformLink('/blog.html#latest', currentPagePath, sourceRoot)).toBe('/blog/#latest');
      expect(transformLink('./about.html?tab=info#section', currentPagePath, sourceRoot)).toBe('/about/?tab=info#section');
    });

    test('should not transform non-HTML links', () => {
      expect(transformLink('https://example.com', currentPagePath, sourceRoot)).toBe('https://example.com');
      expect(transformLink('mailto:test@example.com', currentPagePath, sourceRoot)).toBe('mailto:test@example.com');
      expect(transformLink('/styles.css', currentPagePath, sourceRoot)).toBe('/styles.css');
      expect(transformLink('#section', currentPagePath, sourceRoot)).toBe('#section');
    });

    test('should handle nested directory context', () => {
      const nestedPagePath = '/project/src/docs/guide.html';
      expect(transformLink('./api.html', nestedPagePath, sourceRoot)).toBe('/docs/api/');
      expect(transformLink('../index.html', nestedPagePath, sourceRoot)).toBe('/');
    });
  });

  describe('transformLinksInHtml', () => {
    const sourceRoot = '/project/src';
    const currentPagePath = '/project/src/index.html';

    test('should transform HTML links in content', () => {
      const html = `
        <nav>
          <a href="./about.html">About</a>
          <a href="/blog.html">Blog</a>
          <a href="./contact.html?form=1">Contact</a>
        </nav>
      `;
      
      const result = transformLinksInHtml(html, currentPagePath, sourceRoot);
      
      expect(result).toContain('href="/about/"');
      expect(result).toContain('href="/blog/"');
      expect(result).toContain('href="/contact/?form=1"');
      expect(result).not.toContain('href="./about.html"');
      expect(result).not.toContain('href="/blog.html"');
    });

    test('should preserve external and non-HTML links', () => {
      const html = `
        <nav>
          <a href="./about.html">About</a>
          <a href="https://example.com">External</a>
          <a href="mailto:test@example.com">Email</a>
          <a href="/styles.css">CSS</a>
          <a href="#section">Fragment</a>
        </nav>
      `;
      
      const result = transformLinksInHtml(html, currentPagePath, sourceRoot);
      
      expect(result).toContain('href="/about/"');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('href="mailto:test@example.com"');
      expect(result).toContain('href="/styles.css"');
      expect(result).toContain('href="#section"');
    });

    test('should handle both single and double quotes', () => {
      const html = `
        <nav>
          <a href='./about.html'>About</a>
          <a href="/blog.html">Blog</a>
        </nav>
      `;
      
      const result = transformLinksInHtml(html, currentPagePath, sourceRoot);
      
      expect(result).toContain("href='/about/'");
      expect(result).toContain('href="/blog/"');
    });

    test('should handle complex HTML structures', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test</title>
            <link rel="stylesheet" href="/styles.css">
          </head>
          <body>
            <nav class="navbar">
              <a href="./index.html" class="logo">Home</a>
              <a href="./about.html?section=team#members">About</a>
              <a href="/blog.html" target="_blank">Blog</a>
            </nav>
            <main>
              <p>Visit our <a href="./contact.html">contact page</a>.</p>
            </main>
          </body>
        </html>
      `;
      
      const result = transformLinksInHtml(html, currentPagePath, sourceRoot);
      
      expect(result).toContain('href="/"'); // ./index.html -> /
      expect(result).toContain('href="/about/?section=team#members"');
      expect(result).toContain('href="/blog/"');
      expect(result).toContain('href="/contact/"');
      expect(result).toContain('href="/styles.css"'); // CSS link unchanged
    });

    test('should return original content if no HTML links found', () => {
      const html = `
        <nav>
          <a href="https://example.com">External</a>
          <a href="#section">Fragment</a>
          <a href="/styles.css">CSS</a>
        </nav>
      `;
      
      const result = transformLinksInHtml(html, currentPagePath, sourceRoot);
      expect(result).toBe(html);
    });

    test('should handle empty or invalid input', () => {
      expect(transformLinksInHtml('', currentPagePath, sourceRoot)).toBe('');
      expect(transformLinksInHtml(null, currentPagePath, sourceRoot)).toBe(null);
      expect(transformLinksInHtml(undefined, currentPagePath, sourceRoot)).toBe(undefined);
    });
  });
});