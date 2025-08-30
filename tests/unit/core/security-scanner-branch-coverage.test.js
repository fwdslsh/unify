/**
 * Security Scanner Branch Coverage Tests
 * 
 * ISSUE-005: Target specific uncovered lines in SecurityScanner
 * Target coverage: 100% function / 81.76% line coverage -> 95%+
 * 
 * Focuses on:
 * - Single-quote event handlers (lines 97-98, 100-110)
 * - Script content detection (lines 140-147, 150-157)  
 * - Meta tag XSS (lines 193-200)
 * - Content injection patterns (lines 279-286, 291-298)
 * - SQL injection patterns (lines 343-350, 355-362)
 * - Multiline script alerts (lines 514-521)
 * - Polyglot attack detection (lines 558-565)
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { SecurityScanner } from '../../../src/core/security-scanner.js';

describe('SecurityScanner Branch Coverage', () => {
  let scanner;

  beforeEach(() => {
    scanner = new SecurityScanner();
  });

  describe('Single-quote event handlers (lines 97-98, 100-110)', () => {
    test('should detect single-quoted event handlers', () => {
      const htmlContent = `<div onclick='alert("xss")'>Click me</div>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      
      expect(xssWarnings.length).toBe(1);
      expect(xssWarnings[0].context).toContain("onclick='alert(\"xss\")'");
      expect(xssWarnings[0].message).toContain('Event handler detected in <div> tag');
    });

    test('should detect data-on attributes with single quotes', () => {
      const htmlContent = `<span data-onclick='maliciousCode()'>Hover</span>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      
      expect(xssWarnings.length).toBe(1);
      expect(xssWarnings[0].context).toContain("data-onclick='maliciousCode()'");
    });

    test('should detect xml namespaced event handlers with single quotes', () => {
      const htmlContent = `<rect xml:onclick='dangerousFunction()' />`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      
      expect(xssWarnings.length).toBe(1);
      expect(xssWarnings[0].context).toContain("xml:onclick='dangerousFunction()'");
    });

    test('should identify safe single-quoted event handlers', () => {
      const htmlContent = `<button onclick='this.disabled = true'>Safe</button>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      // Should not generate warnings for safe patterns
      expect(warnings.length).toBe(0);
    });
  });

  describe('Script content detection (lines 140-147, 150-157)', () => {
    test('should detect document.write in single-line scripts', () => {
      const htmlContent = `<script>document.write('<div>Dynamic content</div>');</script>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      
      expect(xssWarnings.length).toBe(1);
      expect(xssWarnings[0].context).toBe('document.write');
      expect(xssWarnings[0].message).toBe('Potentially unsafe script content');
    });

    test('should detect eval in single-line scripts', () => {
      const htmlContent = `<script>eval('var x = 5');</script>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      
      expect(injectionWarnings.length).toBe(1);
      expect(injectionWarnings[0].context).toBe('eval()');
      expect(injectionWarnings[0].message).toBe('Potential content injection in script');
    });

    test('should detect alert in single-line scripts', () => {
      const htmlContent = `<script>alert('Hello world');</script>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      
      expect(xssWarnings.length).toBe(1);
      expect(xssWarnings[0].context).toBe('alert/prompt/confirm');
    });

    test('should detect prompt in single-line scripts', () => {
      const htmlContent = `<script>prompt('Enter value:', 'default');</script>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      
      expect(xssWarnings.length).toBe(1);
      expect(xssWarnings[0].context).toBe('alert/prompt/confirm');
    });

    test('should detect confirm in single-line scripts', () => {
      const htmlContent = `<script>confirm('Are you sure?');</script>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      
      expect(xssWarnings.length).toBe(1);
      expect(xssWarnings[0].context).toBe('alert/prompt/confirm');
    });
  });

  describe('Meta tag XSS detection (lines 193-200)', () => {
    test('should detect script tags in meta content (non-description)', () => {
      const htmlContent = `<meta name="keywords" content="test,<script>alert('xss')</script>,more">`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      
      // May detect multiple XSS patterns, just ensure meta tag detection is present
      expect(xssWarnings.length).toBeGreaterThan(0);
      const metaWarning = xssWarnings.find(w => w.message === 'Event handler detected in <meta> tag');
      expect(metaWarning).toBeDefined();
    });

    test('should not flag meta description with script tags (different detection path)', () => {
      const htmlContent = `<meta name="description" content="Learn about <script> tags in HTML">`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      // Should not match the meta XSS pattern since it has name="description"
      const metaXSSWarnings = warnings.filter(w => 
        w.type === 'XSS_RISK' && w.message.includes('Event handler detected in <meta> tag')
      );
      
      expect(metaXSSWarnings.length).toBe(0);
    });

    test('should detect meta tags with script and no description', () => {
      const htmlContent = `<meta property="og:title" content="<script>alert('meta-xss')</script>">`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => 
        w.type === 'XSS_RISK' && w.message.includes('Event handler detected in <meta> tag')
      );
      
      expect(xssWarnings.length).toBe(1);
    });
  });

  describe('Content injection patterns (lines 279-286, 291-298)', () => {
    test('should detect script injection in title tags', () => {
      const htmlContent = `<title>Page Title<script>alert('title-xss')</script></title>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      
      expect(injectionWarnings.length).toBe(1);
      expect(injectionWarnings[0].message).toBe('Unescaped content in <title> tag');
    });

    test('should detect script injection in meta description', () => {
      const htmlContent = `<meta name="description" content="Description with <script>alert('desc-xss')</script>">`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      
      expect(injectionWarnings.length).toBe(1);
      expect(injectionWarnings[0].message).toBe('Unescaped content in <meta> tag');
    });
  });

  describe('SQL injection patterns (lines 343-350, 355-362)', () => {
    test('should detect OR 1=1 SQL injection pattern', () => {
      const htmlContent = `<input value="' or '1'='1">`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      
      expect(injectionWarnings.length).toBe(1);
      expect(injectionWarnings[0].message).toBe('SQL injection pattern detected');
      expect(injectionWarnings[0].context).toContain('or');
    });

    test('should detect AND 1=1 SQL injection pattern', () => {
      const htmlContent = `<div>Search: admin' and '1'='1</div>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      
      expect(injectionWarnings.length).toBe(1);
      expect(injectionWarnings[0].message).toBe('SQL injection pattern detected');
      expect(injectionWarnings[0].context).toContain('and');
    });

    test('should detect HTML injection in attributes', () => {
      const htmlContent = `<div title="tooltip\\"><script>alert('attr-xss')</script>">Content</div>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      
      expect(injectionWarnings.length).toBe(1);
      expect(injectionWarnings[0].message).toBe('HTML injection detected in attribute');
    });
  });

  describe('Multiline script alerts (lines 514-521)', () => {
    test('should detect alert in multiline script', () => {
      const htmlContent = `<script>
        function showMessage() {
          alert('This is dangerous');
          return true;
        }
      </script>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      
      expect(injectionWarnings.length).toBe(1);
      expect(injectionWarnings[0].context).toBe('alert/prompt/confirm');
      expect(injectionWarnings[0].message).toBe('Potential content injection in script');
    });

    test('should detect prompt in multiline script', () => {
      const htmlContent = `<script>
        var userInput = prompt('Enter data:');
        processData(userInput);
      </script>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      
      expect(injectionWarnings.length).toBe(1);
      expect(injectionWarnings[0].context).toBe('alert/prompt/confirm');
    });

    test('should detect confirm in multiline script', () => {
      const htmlContent = `<script>
        if (confirm('Delete all data?')) {
          deleteAllData();
        }
      </script>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      
      expect(injectionWarnings.length).toBe(1);
      expect(injectionWarnings[0].context).toBe('alert/prompt/confirm');
    });
  });

  describe('Polyglot attack detection (lines 558-565)', () => {
    test('should detect polyglot attack pattern', () => {
      const htmlContent = `"/*"/*--></div><script>alert('polyglot-xss')</script><!--`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      
      expect(injectionWarnings.length).toBe(1);
      expect(injectionWarnings[0].message).toBe('Polyglot attack pattern detected');
      expect(injectionWarnings[0].context).toBe('polyglot pattern');
      expect(injectionWarnings[0].line).toBe(1);
    });

    test('should not flag non-polyglot content', () => {
      const htmlContent = `<script>alert('normal')</script>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const polyglotWarnings = warnings.filter(w => 
        w.message.includes('Polyglot attack pattern detected')
      );
      
      expect(polyglotWarnings.length).toBe(0);
    });
  });

  describe('Additional edge cases for complete coverage', () => {
    test('should handle mixed single and double quotes in events', () => {
      const htmlContent = `<button onclick='alert("mixed")' ondblclick="confirm('mixed')">Test</button>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      
      // Should detect both event handlers
      expect(xssWarnings.length).toBe(2);
    });

    test('should detect multiple patterns in same line', () => {
      const htmlContent = `<script>document.write('test'); eval('code'); alert('done');</script>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      
      // Should detect document.write (XSS_RISK), eval (CONTENT_INJECTION), and alert (XSS_RISK)
      expect(warnings.length).toBe(3);
    });

    test('should handle complex multiline script scenarios', () => {
      const htmlContent = `<script>
        // Line 1
        var data = userInput;
        // Line 3
        alert('Processing: ' + data);
        // Line 5
        document.write(data);
      </script>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      
      // Should detect both alert and document.write
      expect(injectionWarnings.length).toBe(2);
      
      // Check line numbers are calculated correctly (accounting for script start line)
      const alertWarning = injectionWarnings.find(w => w.context === 'alert/prompt/confirm');
      const docWriteWarning = injectionWarnings.find(w => w.context === 'document.write');
      
      expect(alertWarning.line).toBe(5); // Line with alert (script starts at line 1)
      expect(docWriteWarning.line).toBe(7); // Line with document.write
    });
  });
});