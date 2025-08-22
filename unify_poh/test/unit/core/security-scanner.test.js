/**
 * SecurityScanner Unit Tests
 * Tests security vulnerability detection in HTML content
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { SecurityScanner } from '../../../src/core/security-scanner.js';

describe('SecurityScanner', () => {
  let scanner;

  beforeEach(() => {
    scanner = new SecurityScanner();
  });

  describe('XSS Detection', () => {
    test('should_detect_xss_in_onclick_handler', () => {
      const html = `
        <div onclick="alert('xss')">Click me</div>
      `;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('XSS_RISK');
      expect(warnings[0].message).toContain('Event handler detected');
      expect(warnings[0].line).toBe(2);
      expect(warnings[0].filePath).toBe('test.html');
    });

    test('should_detect_xss_in_onload_handler', () => {
      const html = `<body onload="maliciousCode()">Content</body>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('XSS_RISK');
      expect(warnings[0].message).toContain('Event handler detected in <body> tag');
    });

    test('should_detect_xss_in_onmouseover_handler', () => {
      const html = `<span onmouseover="stealCookies()">Hover me</span>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('XSS_RISK');
    });

    test('should_detect_xss_in_data_attributes_with_handlers', () => {
      const html = `<div data-onclick="eval(userInput)">Content</div>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('XSS_RISK');
      expect(warnings[0].message).toContain('Event handler detected');
    });

    test('should_not_detect_xss_in_safe_onclick_handlers', () => {
      const html = `<button onclick="this.style.display='none'">Hide</button>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(0);
    });

    test('should_detect_xss_in_meta_tag_content', () => {
      const html = `<meta name="description" content="<script>alert('xss')</script>">`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('CONTENT_INJECTION');
      expect(warnings[0].message).toContain('Unescaped content in <meta>');
    });

    test('should_detect_xss_in_script_tag_content', () => {
      const html = `<script>document.write(untrustedData)</script>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('XSS_RISK');
      expect(warnings[0].message).toContain('Potentially unsafe script content');
    });

    test('should_detect_xss_in_style_tag_content', () => {
      const html = `<style>body { background: url('javascript:alert(1)'); }</style>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('JAVASCRIPT_URL');
    });
  });

  describe('JavaScript URL Detection', () => {
    test('should_detect_javascript_url_in_href', () => {
      const html = `<a href="javascript:alert('xss')">Click me</a>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('JAVASCRIPT_URL');
      expect(warnings[0].message).toContain('JavaScript URL');
      expect(warnings[0].message).toContain('href');
    });

    test('should_detect_javascript_url_in_src', () => {
      const html = `<img src="javascript:maliciousCode()">`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('JAVASCRIPT_URL');
      expect(warnings[0].message).toContain('src');
    });

    test('should_detect_javascript_url_in_action', () => {
      const html = `<form action="javascript:submitHack()">`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('JAVASCRIPT_URL');
      expect(warnings[0].message).toContain('action');
    });

    test('should_detect_javascript_url_case_insensitive', () => {
      const html = `<a href="JAVASCRIPT:alert(1)">Link</a>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('JAVASCRIPT_URL');
    });

    test('should_detect_javascript_url_with_whitespace', () => {
      const html = `<a href="  javascript:  alert(1)">Link</a>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('JAVASCRIPT_URL');
    });

    test('should_not_detect_legitimate_javascript_files', () => {
      const html = `<script src="/js/app.js"></script>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(0);
    });

    test('should_detect_javascript_url_in_iframe_src', () => {
      const html = `<iframe src="javascript:alert('xss')"></iframe>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('JAVASCRIPT_URL');
    });
  });

  describe('Content Injection Detection', () => {
    test('should_detect_unescaped_content_in_title', () => {
      const html = `<title>User: <script>alert('xss')</script></title>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('CONTENT_INJECTION');
      expect(warnings[0].message).toContain('Unescaped content in <title>');
    });

    test('should_detect_unescaped_content_in_meta_description', () => {
      const html = `<meta name="description" content="Description with <script> tags">`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('CONTENT_INJECTION');
      expect(warnings[0].message).toContain('Unescaped content in <meta>');
    });

    test('should_detect_unescaped_content_in_script_tags', () => {
      const html = '<script>eval(userInput)</script>';
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('CONTENT_INJECTION');
      expect(warnings[0].message).toContain('Potential content injection in script');
    });

    test('should_detect_html_injection_in_attributes', () => {
      const html = `<div title="User input: \\"><script>alert(1)</script>">Content</div>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('CONTENT_INJECTION');
    });

    test('should_detect_sql_injection_patterns', () => {
      const html = `<div data-query="SELECT * FROM users WHERE id = ' OR '1'='1">Content</div>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('CONTENT_INJECTION');
      expect(warnings[0].message).toContain('SQL injection pattern');
    });

    test('should_not_flag_properly_escaped_content', () => {
      const html = `<div title="User &lt;script&gt;alert(1)&lt;/script&gt;">Content</div>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(0);
    });
  });

  describe('Line Number and Path Reporting', () => {
    test('should_report_accurate_line_numbers', () => {
      const html = `<html>
<head><title>Test</title></head>
<body>
  <div onclick="alert('xss')">Click</div>
  <p>Safe content</p>
  <a href="javascript:alert(1)">Link</a>
</body>
</html>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(2);
      expect(warnings[0].line).toBe(4); // onclick handler
      expect(warnings[1].line).toBe(6); // javascript URL
    });

    test('should_report_correct_file_paths', () => {
      const html = `<div onclick="alert(1)">Test</div>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'src/pages/contact.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].filePath).toBe('src/pages/contact.html');
    });

    test('should_handle_multiline_content_correctly', () => {
      const html = `<script>
function dangerous() {
  document.write(userInput);
}
</script>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].line).toBe(3); // Line with document.write
    });

    test('should_report_multiple_issues_in_same_file', () => {
      const html = `
<div onclick="alert(1)">Click</div>
<a href="javascript:void(0)">Link</a>
<script>eval(userInput)</script>
`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(3);
      expect(warnings.every(w => w.filePath === 'test.html')).toBe(true);
      expect(warnings.map(w => w.line)).toEqual([2, 3, 4]);
    });
  });

  describe('Warning Formatting', () => {
    test('should_format_warning_messages_correctly', () => {
      const html = `<div onclick="alert(1)">Test</div>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'src/test.html');
      
      expect(warnings).toHaveLength(1);
      const warning = warnings[0];
      
      expect(warning.type).toBe('XSS_RISK');
      expect(warning.filePath).toBe('src/test.html');
      expect(warning.line).toBe(1);
      expect(warning.message).toContain('Event handler detected');
      expect(warning.severity).toBe('warning');
    });

    test('should_include_context_in_warnings', () => {
      const html = `<button onclick="handleClick(userInput)">Submit</button>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].context).toContain('onclick="handleClick(userInput)"');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should_handle_malformed_html_gracefully', () => {
      const html = `<div onclick="alert(1)"><p>Unclosed paragraph<div>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('XSS_RISK');
    });

    test('should_handle_incomplete_tags', () => {
      const html = `<div onclick="alert(1)">Incomplete`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('XSS_RISK');
    });

    test('should_handle_empty_content', () => {
      const warnings = scanner.scanForSecurityIssues('', 'test.html');
      
      expect(warnings).toHaveLength(0);
    });

    test('should_handle_very_large_html_files', () => {
      const largeContent = '<div>Safe content</div>'.repeat(10000);
      const html = largeContent + '<div onclick="alert(1)">Unsafe</div>';
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('XSS_RISK');
    });
  });

  describe('Configuration and Options', () => {
    test('should_support_disabling_specific_checks', () => {
      const scanner = new SecurityScanner({ 
        disableChecks: ['JAVASCRIPT_URL'] 
      });
      
      const html = `
        <div onclick="alert(1)">XSS</div>
        <a href="javascript:void(0)">JS URL</a>
      `;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('XSS_RISK');
    });

    test('should_support_custom_severity_levels', () => {
      const scanner = new SecurityScanner({
        severityLevels: {
          XSS_RISK: 'error',
          JAVASCRIPT_URL: 'info'
        }
      });
      
      const html = `<a href="javascript:void(0)">Link</a>`;
      
      const warnings = scanner.scanForSecurityIssues(html, 'test.html');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].severity).toBe('info');
    });
  });
});