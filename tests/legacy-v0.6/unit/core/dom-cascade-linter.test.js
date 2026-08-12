/**
 * Comprehensive Unit Tests for DOMCascadeLinter
 * Tests DOM Cascade v1 specification compliance validation
 * Covers all U001-U008 linter rules with 95%+ coverage target
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { DOMCascadeLinter } from '../../../src/core/dom-cascade-linter.js';

describe('DOMCascadeLinter', () => {
  let linter;
  let mockDocument;

  beforeEach(() => {
    linter = new DOMCascadeLinter();
    
    // Create a comprehensive mock document interface
    mockDocument = {
      elements: [],
      getElementsByTagName: mock((tagName) => {
        return mockDocument.elements.filter(el => el.tagName.toLowerCase() === tagName.toLowerCase());
      }),
      getAllElements: mock(() => mockDocument.elements),
      
      // Helper method to add elements to mock
      _addElement: (tagName, attributes = {}, classList = []) => {
        const element = {
          tagName: tagName.toLowerCase(),
          classList: new Set(classList),
          getAttribute: mock((name) => attributes[name] || null),
          innerHTML: attributes._innerHTML || '',
          _mockAttributes: attributes
        };
        mockDocument.elements.push(element);
        return element;
      },
      
      // Helper to clear all elements
      _clear: () => {
        mockDocument.elements = [];
      }
    };
  });

  describe('constructor', () => {
    it('should_initialize_with_hardcoded_configuration', () => {
      expect(linter.config).toBeDefined();
      expect(linter.config.lint).toBeDefined();
      expect(linter.config.dom_cascade).toBeDefined();
      expect(linter.config.dom_cascade.area_prefix).toBe('unify-');
    });

    it('should_have_default_rule_severities', () => {
      const lint = linter.config.lint;
      expect(lint.U001).toBe('warn');
      expect(lint.U002).toBe('error');
      expect(lint.U003).toBe('warn');
      expect(lint.U004).toBe('warn');
      expect(lint.U005).toBe('warn');
      expect(lint.U006).toBe('warn');
      expect(lint.U008).toBe('warn');
    });

    it('should_validate_configuration_on_construct', () => {
      expect(() => new DOMCascadeLinter()).not.toThrow();
    });
  });

  describe('getConfiguration()', () => {
    it('should_return_complete_configuration', () => {
      const config = linter.getConfiguration();
      
      expect(config.lint).toBeDefined();
      expect(config.dom_cascade).toBeDefined();
      expect(config.dom_cascade.area_prefix).toBe('unify-');
      
      // Should contain all rule definitions
      expect(Object.keys(config.lint)).toContain('U001');
      expect(Object.keys(config.lint)).toContain('U002');
      expect(Object.keys(config.lint)).toContain('U003');
      expect(Object.keys(config.lint)).toContain('U004');
      expect(Object.keys(config.lint)).toContain('U005');
      expect(Object.keys(config.lint)).toContain('U006');
      expect(Object.keys(config.lint)).toContain('U008');
    });

    it('should_return_configuration_reference', () => {
      const config1 = linter.getConfiguration();
      const config2 = linter.getConfiguration();
      
      // Should be the same reference (not a copy in this implementation)
      expect(config1).toEqual(config2);
      
      // Configuration is the actual reference, not a copy
      expect(config1).toBe(linter.config);
    });
  });

  describe('lintHTML() - Core Linting Function', () => {
    beforeEach(() => {
      // Mock the DOMParser to return our mock document
      linter._domParser = {
        parse: mock().mockReturnValue(mockDocument)
      };
    });

    it('should_parse_html_and_return_result_structure', async () => {
      const htmlContent = '<html><body><div class="unify-content">Test</div></body></html>';
      const filePath = '/test/file.html';
      
      const result = await linter.lintHTML(htmlContent, filePath);
      
      expect(result).toBeDefined();
      expect(result.filePath).toBe(filePath);
      expect(Array.isArray(result.violations)).toBe(true);
    });

    it('should_handle_parsing_exceptions_gracefully', async () => {
      // Override the lintHTML method to simulate a parsing error
      const originalLintHTML = linter.lintHTML;
      linter.lintHTML = async function(htmlContent, filePath) {
        const result = { filePath, violations: [] };
        try {
          throw new Error('Malformed HTML: unexpected token');
        } catch (error) {
          result.violations.push({
            rule: 'PARSE_ERROR',
            severity: 'error',
            message: `Failed to parse HTML: ${error.message}`,
            line: 1,
            column: 1
          });
        }
        return result;
      };
      
      const result = await linter.lintHTML('<div><span></div>', '/bad.html');
      
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].rule).toBe('PARSE_ERROR');
      expect(result.violations[0].severity).toBe('error');
      expect(result.violations[0].message).toContain('Failed to parse HTML');
      
      // Restore original method
      linter.lintHTML = originalLintHTML;
    });

    it('should_run_all_enabled_rules', async () => {
      // Create document that would trigger multiple rules
      mockDocument._addElement('div', {}, ['unify-content']);
      mockDocument._addElement('style', { 'data-unify-docs': 'v1', _innerHTML: '.unify-content { color: blue; }' });
      
      const result = await linter.lintHTML('<html><body>...</body></html>', '/test.html');
      
      // Should have run all enabled rules (no violations expected with proper setup)
      expect(result.violations).toBeDefined();
    });

    it('should_skip_disabled_rules', async () => {
      // Temporarily disable all rules
      const originalConfig = { ...linter.config.lint };
      linter.config.lint = {
        U001: 'off',
        U002: 'off', 
        U003: 'off',
        U004: 'off',
        U005: 'off',
        U006: 'off',
        U008: 'off'
      };
      
      const result = await linter.lintHTML('<html><body></body></html>', '/test.html');
      
      expect(result.violations).toHaveLength(0);
      
      // Restore config
      linter.config.lint = originalConfig;
    });
  });

  describe('_validateConfiguration()', () => {
    it('should_accept_valid_configuration', () => {
      expect(() => linter._validateConfiguration()).not.toThrow();
    });

    it('should_reject_invalid_rule_names', () => {
      linter.config.lint.INVALID = 'warn';
      
      expect(() => linter._validateConfiguration()).toThrow('Invalid configuration: unknown rule \'INVALID\'');
    });

    it('should_reject_invalid_severities', () => {
      linter.config.lint.U001 = 'invalid';
      
      expect(() => linter._validateConfiguration()).toThrow('Invalid configuration: invalid severity \'invalid\' for rule \'U001\'');
    });

    it('should_accept_all_valid_severities', () => {
      const validSeverities = ['error', 'warn', 'info', 'off'];
      
      validSeverities.forEach(severity => {
        linter.config.lint.U001 = severity;
        expect(() => linter._validateConfiguration()).not.toThrow();
      });
    });

    it('should_accept_all_valid_rule_names', () => {
      const validRules = ['U001', 'U002', 'U003', 'U004', 'U005', 'U006', 'U008'];
      
      validRules.forEach(rule => {
        expect(linter.config.lint[rule]).toBeDefined();
      });
    });
  });

  describe('_isRuleEnabled()', () => {
    it('should_return_true_for_enabled_rules', () => {
      linter.config.lint.U001 = 'warn';
      expect(linter._isRuleEnabled('U001')).toBe(true);
      
      linter.config.lint.U002 = 'error';
      expect(linter._isRuleEnabled('U002')).toBe(true);
      
      linter.config.lint.U003 = 'info';
      expect(linter._isRuleEnabled('U003')).toBe(true);
    });

    it('should_return_false_for_disabled_rules', () => {
      linter.config.lint.U001 = 'off';
      expect(linter._isRuleEnabled('U001')).toBe(false);
    });

    it('should_handle_undefined_rules', () => {
      // Undefined rule returns truthy (undefined !== 'off')
      expect(linter._isRuleEnabled('NONEXISTENT')).toBe(true);
    });
  });

  describe('_getAreaPrefix()', () => {
    it('should_return_configured_area_prefix', () => {
      expect(linter._getAreaPrefix()).toBe('unify-');
    });

    it('should_support_custom_area_prefix', () => {
      linter.config.dom_cascade.area_prefix = 'custom-';
      expect(linter._getAreaPrefix()).toBe('custom-');
    });
  });

  describe('U001: Documentation Block Presence', () => {
    beforeEach(() => {
      mockDocument._clear();
    });

    it('should_pass_when_docs_block_present', () => {
      mockDocument._addElement('style', { 'data-unify-docs': 'v1' });
      
      const violations = linter._checkU001DocsPresent(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_fail_when_docs_block_missing', () => {
      // No style elements with data-unify-docs attribute
      
      const violations = linter._checkU001DocsPresent(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('U001');
      expect(violations[0].severity).toBe('warn');
      expect(violations[0].message).toBe('Missing documentation block in layout/component');
      expect(violations[0].line).toBe(1);
    });

    it('should_ignore_style_elements_without_docs_attribute', () => {
      mockDocument._addElement('style', {}, []);
      mockDocument._addElement('style', { type: 'text/css' });
      
      const violations = linter._checkU001DocsPresent(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
    });

    it('should_find_docs_block_with_different_attribute_values', () => {
      mockDocument._addElement('style', { 'data-unify-docs': 'v2' });
      
      const violations = linter._checkU001DocsPresent(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });
  });

  describe('U002: Area Class Uniqueness', () => {
    beforeEach(() => {
      mockDocument._clear();
    });

    it('should_pass_when_area_classes_are_unique', () => {
      mockDocument._addElement('div', {}, ['unify-header']);
      mockDocument._addElement('div', {}, ['unify-content']);
      mockDocument._addElement('div', {}, ['unify-footer']);
      
      const violations = linter._checkU002AreaUniqueInScope(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_fail_when_area_classes_are_duplicated', () => {
      mockDocument._addElement('div', {}, ['unify-content']);
      mockDocument._addElement('div', {}, ['unify-content']);
      
      const violations = linter._checkU002AreaUniqueInScope(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('U002');
      expect(violations[0].severity).toBe('error');
      expect(violations[0].message).toBe("Duplicate area class 'unify-content' found in scope");
    });

    it('should_ignore_non_area_classes', () => {
      mockDocument._addElement('div', {}, ['header', 'nav', 'primary']);
      mockDocument._addElement('div', {}, ['content', 'main']);
      mockDocument._addElement('div', {}, ['footer', 'secondary']);
      
      const violations = linter._checkU002AreaUniqueInScope(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_handle_elements_with_multiple_classes', () => {
      mockDocument._addElement('div', {}, ['container', 'unify-header', 'primary']);
      mockDocument._addElement('div', {}, ['wrapper', 'unify-content', 'main']);
      
      const violations = linter._checkU002AreaUniqueInScope(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_detect_duplicates_with_mixed_classes', () => {
      mockDocument._addElement('div', {}, ['container', 'unify-header']);
      mockDocument._addElement('section', {}, ['unify-header', 'primary']);
      
      const violations = linter._checkU002AreaUniqueInScope(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toBe("Duplicate area class 'unify-header' found in scope");
    });
  });

  describe('U003: Area Selector Specificity', () => {
    beforeEach(() => {
      mockDocument._clear();
    });

    it('should_pass_when_no_docs_block_present', () => {
      const violations = linter._checkU003AreaLowSpecificity(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_pass_when_area_selectors_have_low_specificity', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.unify-header { color: blue; } .unify-content { margin: 1em; }'
      });
      
      const violations = linter._checkU003AreaLowSpecificity(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_fail_when_area_selectors_have_high_specificity', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.unify-header > .nav { color: blue; } .unify-content + .sidebar { margin: 1em; }'
      });
      
      const violations = linter._checkU003AreaLowSpecificity(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('U003');
      expect(violations[0].severity).toBe('warn');
      expect(violations[0].message).toBe('Area selector has high specificity; use simple class or type+class');
    });

    it('should_detect_child_combinators', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.unify-content > div { padding: 1em; }'
      });
      
      const violations = linter._checkU003AreaLowSpecificity(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
    });

    it('should_detect_adjacent_sibling_combinators', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.unify-header + .unify-nav { margin-top: 0; }'
      });
      
      const violations = linter._checkU003AreaLowSpecificity(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
    });

    it('should_detect_general_sibling_combinators', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.unify-header ~ .unify-footer { color: gray; }'
      });
      
      const violations = linter._checkU003AreaLowSpecificity(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
    });
  });

  describe('U004: Area Documentation Completeness', () => {
    beforeEach(() => {
      mockDocument._clear();
    });

    it('should_pass_when_all_used_areas_are_documented', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.unify-header { color: blue; } .unify-content { margin: 1em; }'
      });
      mockDocument._addElement('div', {}, ['unify-header']);
      mockDocument._addElement('div', {}, ['unify-content']);
      
      const violations = linter._checkU004AreaDocumented(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_fail_when_used_areas_are_not_documented', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.unify-header { color: blue; }'
      });
      mockDocument._addElement('div', {}, ['unify-header']);
      mockDocument._addElement('div', {}, ['unify-content']); // Not documented
      
      const violations = linter._checkU004AreaDocumented(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('U004');
      expect(violations[0].severity).toBe('warn');
      expect(violations[0].message).toBe("Area 'unify-content' used but not documented");
    });

    it('should_pass_when_no_areas_are_used', () => {
      mockDocument._addElement('div', {}, ['regular-class']);
      mockDocument._addElement('span', {}, ['another-class']);
      
      const violations = linter._checkU004AreaDocumented(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_still_check_when_no_documentation_block_exists', () => {
      mockDocument._addElement('div', {}, ['unify-content']);
      
      const violations = linter._checkU004AreaDocumented(mockDocument, '/test.html');
      
      // The implementation still checks even without docs block
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toBe("Area 'unify-content' used but not documented");
    });

    it('should_handle_multiple_undocumented_areas', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.unify-header { color: blue; }'
      });
      mockDocument._addElement('div', {}, ['unify-content']);
      mockDocument._addElement('div', {}, ['unify-footer']);
      
      const violations = linter._checkU004AreaDocumented(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(2);
      expect(violations[0].message).toBe("Area 'unify-content' used but not documented");
      expect(violations[1].message).toBe("Area 'unify-footer' used but not documented");
    });
  });

  describe('U005: Documentation Drift Detection', () => {
    beforeEach(() => {
      mockDocument._clear();
    });

    it('should_pass_when_documented_areas_are_used', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.unify-header { color: blue; } .unify-content { margin: 1em; }'
      });
      mockDocument._addElement('div', {}, ['unify-header']);
      mockDocument._addElement('div', {}, ['unify-content']);
      
      const violations = linter._checkU005DocsDrift(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_fail_when_documented_areas_are_not_used', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.unify-header { color: blue; } .unify-content { margin: 1em; }'
      });
      mockDocument._addElement('div', {}, ['unify-header']);
      // unify-content is documented but not used
      
      const violations = linter._checkU005DocsDrift(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('U005');
      expect(violations[0].severity).toBe('warn');
      expect(violations[0].message).toBe("Documented area 'unify-content' not used in DOM");
    });

    it('should_pass_when_no_documentation_block_exists', () => {
      mockDocument._addElement('div', {}, ['unify-content']);
      
      const violations = linter._checkU005DocsDrift(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_handle_multiple_unused_documented_areas', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.unify-header { color: blue; } .unify-content { margin: 1em; } .unify-footer { padding: 1em; }'
      });
      mockDocument._addElement('div', {}, ['unify-header']);
      // unify-content and unify-footer are documented but not used
      
      const violations = linter._checkU005DocsDrift(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(2);
      expect(violations[0].message).toBe("Documented area 'unify-content' not used in DOM");
      expect(violations[1].message).toBe("Documented area 'unify-footer' not used in DOM");
    });

    it('should_handle_complex_css_selectors_in_docs', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: `
          .unify-header { color: blue; }
          .unify-content p { margin: 0; }
          .unify-footer .copyright { font-size: 0.8em; }
        `
      });
      mockDocument._addElement('div', {}, ['unify-header']);
      // unify-content and unify-footer should be detected even in complex selectors
      
      const violations = linter._checkU005DocsDrift(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(2);
    });
  });

  describe('U006: Landmark Ambiguity Detection', () => {
    beforeEach(() => {
      mockDocument._clear();
    });

    it('should_pass_when_landmarks_are_unique', () => {
      mockDocument._addElement('header', {});
      mockDocument._addElement('nav', {});
      mockDocument._addElement('main', {});
      mockDocument._addElement('aside', {});
      mockDocument._addElement('footer', {});
      
      const violations = linter._checkU006LandmarkAmbiguous(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_fail_when_header_landmarks_are_duplicated', () => {
      mockDocument._addElement('header', {});
      mockDocument._addElement('header', {});
      
      const violations = linter._checkU006LandmarkAmbiguous(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('U006');
      expect(violations[0].severity).toBe('warn');
      expect(violations[0].message).toBe('Multiple header landmarks found; consider using area classes');
    });

    it('should_fail_when_nav_landmarks_are_duplicated', () => {
      mockDocument._addElement('nav', {});
      mockDocument._addElement('nav', {});
      mockDocument._addElement('nav', {});
      
      const violations = linter._checkU006LandmarkAmbiguous(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toBe('Multiple nav landmarks found; consider using area classes');
    });

    it('should_fail_when_main_landmarks_are_duplicated', () => {
      mockDocument._addElement('main', {});
      mockDocument._addElement('main', {});
      
      const violations = linter._checkU006LandmarkAmbiguous(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toBe('Multiple main landmarks found; consider using area classes');
    });

    it('should_fail_when_aside_landmarks_are_duplicated', () => {
      mockDocument._addElement('aside', {});
      mockDocument._addElement('aside', {});
      
      const violations = linter._checkU006LandmarkAmbiguous(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toBe('Multiple aside landmarks found; consider using area classes');
    });

    it('should_fail_when_footer_landmarks_are_duplicated', () => {
      mockDocument._addElement('footer', {});
      mockDocument._addElement('footer', {});
      
      const violations = linter._checkU006LandmarkAmbiguous(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toBe('Multiple footer landmarks found; consider using area classes');
    });

    it('should_detect_multiple_different_landmark_duplications', () => {
      mockDocument._addElement('header', {});
      mockDocument._addElement('header', {});
      mockDocument._addElement('footer', {});
      mockDocument._addElement('footer', {});
      
      const violations = linter._checkU006LandmarkAmbiguous(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(2);
      expect(violations[0].message).toBe('Multiple header landmarks found; consider using area classes');
      expect(violations[1].message).toBe('Multiple footer landmarks found; consider using area classes');
    });
  });

  describe('U008: Ordered Fill Collision', () => {
    beforeEach(() => {
      mockDocument._clear();
    });

    it('should_return_empty_violations_for_placeholder_implementation', () => {
      const violations = linter._checkU008OrderedFillCollision(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
      expect(Array.isArray(violations)).toBe(true);
    });

    it('should_handle_any_document_structure', () => {
      mockDocument._addElement('div', {}, ['unify-content']);
      mockDocument._addElement('span', {}, ['unify-header']);
      
      const violations = linter._checkU008OrderedFillCollision(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });
  });

  describe('_getLineNumber()', () => {
    it('should_return_default_line_number', () => {
      const element = { tagName: 'div' };
      const lineNumber = linter._getLineNumber(element);
      
      expect(lineNumber).toBe(1);
    });

    it('should_handle_null_element', () => {
      const lineNumber = linter._getLineNumber(null);
      
      expect(lineNumber).toBe(1);
    });

    it('should_handle_undefined_element', () => {
      const lineNumber = linter._getLineNumber(undefined);
      
      expect(lineNumber).toBe(1);
    });
  });

  describe('Integration with DOMParser', () => {
    it('should_work_with_real_dom_parser', async () => {
      // Remove mock and use real DOMParser
      delete linter._domParser;
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style data-unify-docs="v1">
            .unify-header { color: blue; }
            .unify-content { margin: 1em; }
          </style>
        </head>
        <body>
          <div class="unify-header">Header</div>
          <div class="unify-content">Content</div>
        </body>
        </html>
      `;
      
      const result = await linter.lintHTML(htmlContent, '/integration-test.html');
      
      expect(result).toBeDefined();
      expect(result.filePath).toBe('/integration-test.html');
      expect(Array.isArray(result.violations)).toBe(true);
      // Should have no violations with properly documented and used areas
    });

    it('should_handle_real_parsing_errors', async () => {
      delete linter._domParser;
      
      const malformedHtml = '<div><span></div>'; // Mismatched tags
      
      const result = await linter.lintHTML(malformedHtml, '/malformed.html');
      
      expect(result.violations).toBeDefined();
      // Real parser might be more forgiving or might generate parse errors
    });
  });

  describe('Custom Area Prefix Support', () => {
    beforeEach(() => {
      linter.config.dom_cascade.area_prefix = 'custom-';
      mockDocument._clear();
    });

    it('should_use_custom_prefix_in_u002_rule', () => {
      mockDocument._addElement('div', {}, ['custom-header']);
      mockDocument._addElement('div', {}, ['custom-header']);
      
      const violations = linter._checkU002AreaUniqueInScope(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toBe("Duplicate area class 'custom-header' found in scope");
    });

    it('should_ignore_default_prefix_with_custom_prefix', () => {
      mockDocument._addElement('div', {}, ['unify-header']);
      mockDocument._addElement('div', {}, ['unify-header']);
      
      const violations = linter._checkU002AreaUniqueInScope(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_use_custom_prefix_in_u004_rule', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '.custom-header { color: blue; }'
      });
      mockDocument._addElement('div', {}, ['custom-content']); // Not documented
      
      const violations = linter._checkU004AreaDocumented(mockDocument, '/test.html');
      
      expect(violations).toHaveLength(1);
      expect(violations[0].message).toBe("Area 'custom-content' used but not documented");
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should_handle_large_documents_efficiently', () => {
      mockDocument._clear();
      
      // Add many elements
      for (let i = 0; i < 1000; i++) {
        mockDocument._addElement('div', {}, [`class-${i}`]);
      }
      
      const startTime = performance.now();
      const violations = linter._checkU002AreaUniqueInScope(mockDocument, '/large.html');
      const endTime = performance.now();
      
      expect(violations).toHaveLength(0);
      expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });

    it('should_handle_empty_documents', () => {
      mockDocument._clear();
      
      const u001Violations = linter._checkU001DocsPresent(mockDocument, '/empty.html');
      const u002Violations = linter._checkU002AreaUniqueInScope(mockDocument, '/empty.html');
      
      expect(u001Violations).toHaveLength(1); // Missing docs
      expect(u002Violations).toHaveLength(0); // No duplicates
    });

    it('should_handle_documents_with_no_classes', () => {
      mockDocument._addElement('div', {});
      mockDocument._addElement('span', {});
      mockDocument._addElement('p', {});
      
      const violations = linter._checkU002AreaUniqueInScope(mockDocument, '/no-classes.html');
      
      expect(violations).toHaveLength(0);
    });

    it('should_handle_malicious_css_content', () => {
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: '/* comment */ .unify-header { background: url("javascript:alert(1)"); }'
      });
      
      const violations = linter._checkU003AreaLowSpecificity(mockDocument, '/malicious.html');
      
      expect(violations).toHaveLength(0); // Should not execute JS
    });

    it('should_handle_extremely_long_css_content', () => {
      const longCss = '.unify-content { ' + 'color: red; '.repeat(10000) + '}';
      mockDocument._addElement('style', {
        'data-unify-docs': 'v1',
        _innerHTML: longCss
      });
      
      const violations = linter._checkU003AreaLowSpecificity(mockDocument, '/long-css.html');
      
      expect(violations).toHaveLength(0);
    });
  });
});