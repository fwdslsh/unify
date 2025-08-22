/**
 * Tests for HtmlProcessor minification integration
 */

import { describe, test, expect } from 'bun:test';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('HtmlProcessor Minification', () => {
  test('should_minify_html_when_minify_option_enabled', async () => {
    const pathValidator = new PathValidator();
    const processor = new HtmlProcessor(pathValidator);
    
    const html = `<!DOCTYPE html>
<html>
  <head>
    <title>  Test  </title>
  </head>
  <body>
    <h1>  Hello  </h1>
  </body>
</html>`;

    const options = { minify: true };
    const result = await processor.processFile('test.html', html, {}, '.', options);
    
    expect(result.success).toBe(true);
    expect(result.html).toContain('<title>Test</title>');
    expect(result.html).toContain('<h1>Hello</h1>');
    expect(result.html).not.toContain('  Test  ');
    expect(result.html).not.toContain('  Hello  ');
  });

  test('should_not_minify_html_when_minify_option_disabled', async () => {
    const pathValidator = new PathValidator();
    const processor = new HtmlProcessor(pathValidator);
    
    const html = `<!DOCTYPE html>
<html>
  <head>
    <title>  Test  </title>
  </head>
  <body>
    <h1>  Hello  </h1>
  </body>
</html>`;

    const options = { minify: false };
    const result = await processor.processFile('test.html', html, {}, '.', options);
    
    expect(result.success).toBe(true);
    expect(result.html).toContain('  Test  ');
    expect(result.html).toContain('  Hello  ');
  });
});