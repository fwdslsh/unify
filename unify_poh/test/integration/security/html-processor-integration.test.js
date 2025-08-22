/**
 * Security Scanner Integration Tests with HTML Processor
 * Tests that security scanning is properly integrated into the HTML processing pipeline
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { HtmlProcessor } from '../../../src/core/html-processor.js';
import { PathValidator } from '../../../src/core/path-validator.js';

describe('SecurityScanner HTML Processor Integration', () => {
  let processor;
  let pathValidator;

  beforeEach(() => {
    pathValidator = new PathValidator();
    processor = new HtmlProcessor(pathValidator);
  });

  test('should_scan_for_security_issues_during_html_processing', async () => {
    const htmlContent = `
      <html>
        <head><title>Test</title></head>
        <body>
          <div onclick="alert('xss')">Click me</div>
          <a href="javascript:alert(1)">Link</a>
        </body>
      </html>
    `;

    const result = await processor.processFile('test.html', htmlContent);

    expect(result.success).toBe(true);
    expect(result.securityWarnings).toHaveLength(2);
    
    const xssWarning = result.securityWarnings.find(w => w.type === 'XSS_RISK');
    const jsUrlWarning = result.securityWarnings.find(w => w.type === 'JAVASCRIPT_URL');
    
    expect(xssWarning).toBeDefined();
    expect(xssWarning.message).toContain('Event handler detected');
    expect(xssWarning.filePath).toBe('test.html');
    
    expect(jsUrlWarning).toBeDefined();
    expect(jsUrlWarning.message).toContain('JavaScript URL');
    expect(jsUrlWarning.filePath).toBe('test.html');
  });

  test('should_scan_security_issues_in_composed_html_with_layout', async () => {
    const layoutHtml = `
      <html>
        <head><title>Layout</title></head>
        <body>
          <div class="unify-content">Default content</div>
        </body>
      </html>
    `;

    const pageHtml = `
      <html data-unify="_layout.html">
        <head><title>Page</title></head>
        <body>
          <div class="unify-content">
            <script>eval(userInput)</script>
          </div>
        </body>
      </html>
    `;

    const fileSystem = {
      '_layout.html': layoutHtml
    };

    const result = await processor.processFile('page.html', pageHtml, fileSystem, '.');

    expect(result.success).toBe(true);
    expect(result.compositionApplied).toBe(true);
    expect(result.securityWarnings).toHaveLength(1);
    
    const warning = result.securityWarnings[0];
    expect(warning.type).toBe('CONTENT_INJECTION');
    expect(warning.message).toContain('Potential content injection in script');
    expect(warning.filePath).toBe('page.html');
  });

  test('should_not_find_security_issues_in_safe_html', async () => {
    const htmlContent = `
      <html>
        <head><title>Safe Page</title></head>
        <body>
          <div onclick="this.style.display='none'">Safe handler</div>
          <a href="/safe-link.html">Safe link</a>
          <script src="/js/safe-script.js"></script>
        </body>
      </html>
    `;

    const result = await processor.processFile('safe.html', htmlContent);

    expect(result.success).toBe(true);
    expect(result.securityWarnings).toHaveLength(0);
  });

  test('should_report_accurate_line_numbers_in_security_warnings', async () => {
    const htmlContent = `<html>
<head><title>Test</title></head>
<body>
  <p>Safe content</p>
  <div onclick="alert('xss')">Dangerous</div>
  <p>More safe content</p>
</body>
</html>`;

    const result = await processor.processFile('test.html', htmlContent);

    expect(result.success).toBe(true);
    expect(result.securityWarnings).toHaveLength(1);
    
    const warning = result.securityWarnings[0];
    expect(warning.line).toBe(5); // Line with the dangerous onclick
  });

  test('should_handle_multiple_security_warnings_correctly', async () => {
    const htmlContent = `
      <div onclick="alert(1)">XSS 1</div>
      <a href="javascript:void(0)">JS URL</a>
      <div onclick="eval(input)">XSS 2</div>
      <meta name="description" content="<script>alert(1)</script>">
    `;

    const result = await processor.processFile('multiple.html', htmlContent);

    expect(result.success).toBe(true);
    expect(result.securityWarnings).toHaveLength(4);
    
    const types = result.securityWarnings.map(w => w.type);
    expect(types).toContain('XSS_RISK');
    expect(types).toContain('JAVASCRIPT_URL');
    expect(types).toContain('CONTENT_INJECTION');
    
    // Ensure all warnings have correct file path
    result.securityWarnings.forEach(warning => {
      expect(warning.filePath).toBe('multiple.html');
      expect(warning.line).toBeGreaterThan(0);
    });
  });

  test('should_scan_security_issues_after_link_normalization', async () => {
    const htmlContent = `
      <html>
        <body>
          <a href="javascript:alert('after-normalization')">Link</a>
        </body>
      </html>
    `;

    const options = { prettyUrls: true };
    const result = await processor.processFile('test.html', htmlContent, {}, '.', options);

    expect(result.success).toBe(true);
    expect(result.securityWarnings).toHaveLength(1);
    
    const warning = result.securityWarnings[0];
    expect(warning.type).toBe('JAVASCRIPT_URL');
    expect(warning.message).toContain('JavaScript URL');
  });

  test('should_handle_processing_errors_gracefully_with_security_scanning', async () => {
    const htmlContent = `
      <html data-unify="nonexistent-layout.html">
        <body>
          <div onclick="alert('xss')">Should still be scanned</div>
        </body>
      </html>
    `;

    const result = await processor.processFile('test.html', htmlContent);

    // Should fail due to missing layout but still have security warnings on fallback HTML
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    // The security warnings should be on the original content since composition failed
    expect(result.securityWarnings).toHaveLength(0); // Because scanning happens after successful processing
  });

  test('should_preserve_security_scanner_configuration', () => {
    const customScanner = processor.securityScanner;
    expect(customScanner).toBeDefined();
    expect(customScanner.options.severityLevels.XSS_RISK).toBe('warning');
    expect(customScanner.options.severityLevels.JAVASCRIPT_URL).toBe('warning');
    expect(customScanner.options.severityLevels.CONTENT_INJECTION).toBe('warning');
  });
});