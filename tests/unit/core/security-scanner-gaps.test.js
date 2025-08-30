/**
 * Security Scanner Gap Coverage Tests
 * Comprehensive tests for uncovered security validation scenarios
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SecurityScanner } from '../../../src/core/security-scanner.js';

describe('SecurityScanner - Coverage Gaps', () => {
  let scanner;

  beforeEach(() => {
    scanner = new SecurityScanner();
  });

  describe('Advanced XSS Detection', () => {
    it('should detect XSS in base64 encoded content', () => {
      const htmlContent = `
        <div data-content="amF2YXNjcmlwdDphbGVydCgieHNzIik="></div>
        <script>
          var encoded = "PHNjcmlwdD5hbGVydCgneHNzJyk8L3NjcmlwdD4=";
          document.write(atob(encoded));
        </script>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK' || w.type === 'CONTENT_INJECTION');
      expect(xssWarnings.length).toBeGreaterThan(0);
      expect(xssWarnings.some(w => w.context.includes('document.write'))).toBe(true);
    });

    it('should detect XSS in unicode encoded scripts', () => {
      const htmlContent = `<div onclick="\\u0061\\u006c\\u0065\\u0072\\u0074('xss')">Click me</div>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      expect(xssWarnings.length).toBeGreaterThan(0);
      expect(xssWarnings[0].message).toContain('Event handler detected');
    });

    it('should detect XSS in CSS expression() calls', () => {
      const htmlContent = `
        <style>
          .malicious { 
            background: expression(alert('xss')); 
            width: expression(document.location='http://evil.com');
          }
        </style>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
      // Should detect JavaScript in CSS context
      expect(warnings.some(w => w.message.includes('CSS'))).toBe(true);
    });

    it('should detect XSS in data URLs', () => {
      const htmlContent = `<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgneHNzJyk8L3NjcmlwdD4=" />`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      // Should detect suspicious data URL patterns
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should detect DOM-based XSS vectors', () => {
      const htmlContent = `
        <script>
          document.getElementById('content').innerHTML = location.hash;
          document.querySelector('#output').outerHTML = document.URL;
          eval(document.cookie);
        </script>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      expect(injectionWarnings.length).toBeGreaterThan(0);
      expect(injectionWarnings.some(w => w.context.includes('eval'))).toBe(true);
    });

    it('should detect XSS in SVG content', () => {
      const htmlContent = `
        <svg onload="alert('xss')">
          <script>alert('svg-xss')</script>
        </svg>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      expect(xssWarnings.length).toBeGreaterThan(0);
      expect(xssWarnings.some(w => w.context.includes('onload'))).toBe(true);
    });
  });

  describe('Advanced Path Traversal Detection', () => {
    it('should detect URL-encoded path traversal', () => {
      const htmlContent = `<img src="%2e%2e%2f%2e%2e%2fetc%2fpasswd" />`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      // Should decode and detect traversal patterns
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should detect double-encoded path traversal', () => {
      const htmlContent = `<a href="%252e%252e%252f%252e%252e%252fetc%252fpasswd">Link</a>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should detect path traversal in CSS imports', () => {
      const htmlContent = `
        <style>
          @import url("../../../etc/passwd");
          background: url("../../sensitive/file.txt");
        </style>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const pathWarnings = warnings.filter(w => w.type === 'PATH_TRAVERSAL');
      expect(pathWarnings.length).toBeGreaterThan(0);
    });

    it('should detect Windows path traversal patterns', () => {
      const htmlContent = `
        <img src="..\\..\\Windows\\System32\\config\\sam" />
        <a href="..\\..\\..\\boot.ini">Boot</a>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const pathWarnings = warnings.filter(w => w.type === 'PATH_TRAVERSAL');
      expect(pathWarnings.length).toBeGreaterThan(0);
      expect(pathWarnings.some(w => w.context.includes('Windows'))).toBe(true);
    });

    it('should detect null byte injection attempts', () => {
      const htmlContent = `<img src="../../../etc/passwd%00.jpg" />`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Content Injection Detection', () => {
    it('should detect script injection in JSON contexts', () => {
      const htmlContent = `
        <script type="application/json" id="data">
          {"user": "</script><script>alert('xss')</script>"}
        </script>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      expect(injectionWarnings.length).toBeGreaterThan(0);
    });

    it('should detect template injection patterns', () => {
      const htmlContent = `
        <div>{{constructor.constructor('alert(1)')()}}</div>
        <span>#{7*7}</span>
        <p>${'alert(1)'}</p>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should detect LDAP injection patterns', () => {
      const htmlContent = `
        <form action="/search">
          <input name="query" value="*)(uid=*" />
          <input name="filter" value="(&(objectClass=*)(|(cn=*)(sn=*" />
        </form>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should detect NoSQL injection patterns', () => {
      const htmlContent = `
        <script>
          var query = {"$where": "this.credits == this.debits"};
          var malicious = {"$gt": ""};
        </script>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('JavaScript URL Detection', () => {
    it('should detect obfuscated JavaScript URLs', () => {
      const testCases = [
        `<a href="java\\u0073cript:alert('xss')">Link</a>`,
        `<a href="java\\x73cript:alert('xss')">Link</a>`,
        `<a href="java&#115;cript:alert('xss')">Link</a>`,
        `<a href="java&#x73;cript:alert('xss')">Link</a>`,
        `<img src="javascript&colon;alert('xss')" />`,
        `<iframe src="vbscript:msgbox('xss')"></iframe>`
      ];

      for (const htmlContent of testCases) {
        const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
        const jsWarnings = warnings.filter(w => w.type === 'JAVASCRIPT_URL');
        expect(jsWarnings.length).toBeGreaterThan(0);
      }
    });

    it('should detect JavaScript in CSS url() functions', () => {
      const htmlContent = `
        <div style="background: url('javascript:alert(1)');">Test</div>
        <style>
          .test { background-image: url("javascript:void(0)"); }
        </style>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const jsWarnings = warnings.filter(w => w.type === 'JAVASCRIPT_URL');
      expect(jsWarnings.length).toBeGreaterThan(0);
    });

    it('should detect data URIs with JavaScript', () => {
      const htmlContent = `
        <iframe src="data:text/html,<script>alert('xss')</script>"></iframe>
        <object data="data:text/html;base64,PHNjcmlwdD5hbGVydCgneHNzJyk8L3NjcmlwdD4="></object>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Advanced Event Handler Detection', () => {
    it('should detect all HTML5 event handlers', () => {
      const html5Events = [
        'onafterprint', 'onbeforeprint', 'onbeforeunload', 'onerror', 'onhashchange',
        'onload', 'onmessage', 'onoffline', 'ononline', 'onpagehide', 'onpageshow',
        'onpopstate', 'onresize', 'onstorage', 'onunload', 'onblur', 'onchange',
        'oncontextmenu', 'onfocus', 'oninput', 'oninvalid', 'onreset', 'onsearch',
        'onselect', 'onsubmit', 'onkeydown', 'onkeypress', 'onkeyup', 'onclick',
        'ondblclick', 'onmousedown', 'onmousemove', 'onmouseout', 'onmouseover',
        'onmouseup', 'onmousewheel', 'onwheel', 'ondrag', 'ondragend', 'ondragenter',
        'ondragleave', 'ondragover', 'ondragstart', 'ondrop', 'onscroll'
      ];

      for (const event of html5Events) {
        const htmlContent = `<div ${event}="alert('${event}')">Test</div>`;
        const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
        const eventWarnings = warnings.filter(w => w.type === 'XSS_RISK');
        expect(eventWarnings.length).toBeGreaterThan(0);
      }
    });

    it('should detect custom data-on* event handlers', () => {
      const htmlContent = `
        <div data-onclick="maliciousFunction()">Click</div>
        <span data-onhover="stealCookies()">Hover</span>
        <button data-onsubmit="sendToEvil()">Submit</button>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const xssWarnings = warnings.filter(w => w.type === 'XSS_RISK');
      expect(xssWarnings.length).toBe(3);
      expect(xssWarnings.every(w => w.context.includes('data-on'))).toBe(true);
    });

    it('should detect event handlers in XML namespaced attributes', () => {
      const htmlContent = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <rect xml:onclick="alert('xss')" />
        </svg>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Multiline Script Detection', () => {
    it('should detect dangerous functions in multiline scripts', () => {
      const htmlContent = `
        <script>
          function processUserInput(input) {
            // Dangerous: direct DOM manipulation
            document.getElementById('output').innerHTML = input;
            
            // Dangerous: eval usage
            eval('var result = ' + input);
            
            // Dangerous: document.write
            document.write('<div>' + input + '</div>');
            
            return result;
          }
        </script>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      expect(injectionWarnings.length).toBeGreaterThan(0);
      expect(injectionWarnings.some(w => w.context.includes('document.write'))).toBe(true);
    });

    it('should detect dangerous patterns across multiple script blocks', () => {
      const htmlContent = `
        <script>
          var userInput = location.search;
        </script>
        
        <script>
          document.write(userInput);
        </script>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const injectionWarnings = warnings.filter(w => w.type === 'CONTENT_INJECTION');
      expect(injectionWarnings.length).toBeGreaterThan(0);
    });

    it('should detect script injection in HTML comments', () => {
      const htmlContent = `
        <!-- <script>alert('xss')</script> -->
        <!--[if IE]><script>alert('ie-xss')</script><![endif]-->
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration and Edge Cases', () => {
    it('should respect disabled check configuration', () => {
      const scannerWithDisabledChecks = new SecurityScanner({
        disableChecks: ['XSS_RISK', 'JAVASCRIPT_URL']
      });

      const htmlContent = `
        <div onclick="alert('xss')">Click</div>
        <a href="javascript:alert('xss')">Link</a>
        <img src="../../../etc/passwd" />
      `;
      
      const warnings = scannerWithDisabledChecks.scanForSecurityIssues(htmlContent, 'test.html');
      
      // Should only detect PATH_TRAVERSAL, not XSS_RISK or JAVASCRIPT_URL
      expect(warnings.some(w => w.type === 'XSS_RISK')).toBe(false);
      expect(warnings.some(w => w.type === 'JAVASCRIPT_URL')).toBe(false);
      expect(warnings.some(w => w.type === 'PATH_TRAVERSAL')).toBe(true);
    });

    it('should handle custom severity levels', () => {
      const scannerWithCustomSeverity = new SecurityScanner({
        severityLevels: {
          XSS_RISK: 'critical',
          PATH_TRAVERSAL: 'high',
          JAVASCRIPT_URL: 'medium'
        }
      });

      const htmlContent = `<div onclick="alert('xss')">Click</div>`;
      const warnings = scannerWithCustomSeverity.scanForSecurityIssues(htmlContent, 'test.html');
      
      expect(warnings[0].severity).toBe('critical');
    });

    it('should handle empty or null content gracefully', () => {
      expect(scanner.scanForSecurityIssues('', 'test.html')).toEqual([]);
      expect(scanner.scanForSecurityIssues(null, 'test.html')).toEqual([]);
      expect(scanner.scanForSecurityIssues(undefined, 'test.html')).toEqual([]);
    });

    it('should handle non-string input gracefully', () => {
      expect(scanner.scanForSecurityIssues(123, 'test.html')).toEqual([]);
      expect(scanner.scanForSecurityIssues({}, 'test.html')).toEqual([]);
      expect(scanner.scanForSecurityIssues([], 'test.html')).toEqual([]);
    });

    it('should handle very large HTML content', () => {
      // Create large HTML content
      const largeHtml = '<div>' + 'safe content '.repeat(10000) + '</div>\n<script>alert("xss")</script>';
      
      const warnings = scanner.scanForSecurityIssues(largeHtml, 'large.html');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.type === 'XSS_RISK')).toBe(true);
    });

    it('should provide accurate line numbers for warnings', () => {
      const htmlContent = `Line 1: Safe content
Line 2: More safe content
Line 3: <div onclick="alert('xss')">Dangerous</div>
Line 4: Safe again
Line 5: <a href="javascript:void(0)">Also dangerous</a>`;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      
      const xssWarning = warnings.find(w => w.type === 'XSS_RISK');
      const jsWarning = warnings.find(w => w.type === 'JAVASCRIPT_URL');
      
      expect(xssWarning.line).toBe(3);
      expect(jsWarning.line).toBe(5);
    });
  });

  describe('Utility Functions', () => {
    it('should format warnings correctly', () => {
      const warning = {
        type: 'XSS_RISK',
        message: 'Event handler detected',
        filePath: 'test.html',
        line: 5
      };
      
      const formatted = scanner.formatWarning(warning);
      expect(formatted).toBe('[SECURITY] XSS Risk: Event handler detected (test.html:5)');
    });

    it('should generate accurate scan summaries', () => {
      const warnings = [
        { type: 'XSS_RISK', severity: 'warning' },
        { type: 'XSS_RISK', severity: 'critical' },
        { type: 'PATH_TRAVERSAL', severity: 'warning' },
        { type: 'JAVASCRIPT_URL', severity: 'warning' }
      ];
      
      const summary = scanner.getScanSummary(warnings);
      
      expect(summary.total).toBe(4);
      expect(summary.byType.XSS_RISK).toBe(2);
      expect(summary.byType.PATH_TRAVERSAL).toBe(1);
      expect(summary.byType.JAVASCRIPT_URL).toBe(1);
      expect(summary.bySeverity.warning).toBe(3);
      expect(summary.bySeverity.critical).toBe(1);
    });

    it('should handle unknown warning types in formatting', () => {
      const warning = {
        type: 'UNKNOWN_TYPE',
        message: 'Unknown issue',
        filePath: 'test.html',
        line: 1
      };
      
      const formatted = scanner.formatWarning(warning);
      expect(formatted).toBe('[SECURITY] UNKNOWN_TYPE: Unknown issue (test.html:1)');
    });
  });

  describe('Real-world Attack Patterns', () => {
    it('should detect polyglot attacks', () => {
      const htmlContent = `
        <!--'/*"/*--></div>
        <script>alert('polyglot')</script>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should detect mutation XSS patterns', () => {
      const htmlContent = `
        <div id="container">
          &lt;img src=x onerror=alert('mutation-xss')&gt;
        </div>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should detect CSS injection attacks', () => {
      const htmlContent = `
        <style>
          @import "data:text/css;charset=utf-8,body{background:red;}/*";
          body { background: url("javascript:alert('css-xss')"); }
        </style>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      const jsWarnings = warnings.filter(w => w.type === 'JAVASCRIPT_URL');
      expect(jsWarnings.length).toBeGreaterThan(0);
    });

    it('should detect server-side template injection', () => {
      const htmlContent = `
        <div>{{7*7}}</div>
        <span>${'alert(1)'}</span>
        <p>#{7*7}</p>
        <div><%=7*7%></div>
      `;
      
      const warnings = scanner.scanForSecurityIssues(htmlContent, 'test.html');
      expect(warnings.length).toBeGreaterThan(0);
    });
  });
});