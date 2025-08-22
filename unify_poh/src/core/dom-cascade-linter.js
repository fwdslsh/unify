/**
 * DOM Cascade Linter
 * Implements U001-U008 linter rules for DOM Cascade composition
 */

import { DOMParser } from '../io/dom-parser.js';

/**
 * DOMCascadeLinter validates HTML content against DOM Cascade v1 rules
 */
export class DOMCascadeLinter {
  constructor(config = {}) {
    this.config = this._mergeConfiguration(config);
    this._validateConfiguration();
  }

  /**
   * Get the current configuration
   * @returns {Object} Configuration object
   */
  getConfiguration() {
    return this.config;
  }

  /**
   * Lint HTML content and return violations
   * @param {string} htmlContent - HTML content to lint
   * @param {string} filePath - Path to the file being linted
   * @returns {Promise<LintResult>} Lint result with violations
   */
  async lintHTML(htmlContent, filePath) {
    const result = {
      filePath,
      violations: []
    };

    try {
      const parser = new DOMParser();
      const document = parser.parse(htmlContent);

      // Run all enabled rules
      if (this._isRuleEnabled('U001')) {
        result.violations.push(...this._checkU001DocsPresent(document, filePath));
      }
      
      if (this._isRuleEnabled('U002')) {
        result.violations.push(...this._checkU002AreaUniqueInScope(document, filePath));
      }
      
      if (this._isRuleEnabled('U003')) {
        result.violations.push(...this._checkU003AreaLowSpecificity(document, filePath));
      }
      
      if (this._isRuleEnabled('U004')) {
        result.violations.push(...this._checkU004AreaDocumented(document, filePath));
      }
      
      if (this._isRuleEnabled('U005')) {
        result.violations.push(...this._checkU005DocsDrift(document, filePath));
      }
      
      if (this._isRuleEnabled('U006')) {
        result.violations.push(...this._checkU006LandmarkAmbiguous(document, filePath));
      }
      
      if (this._isRuleEnabled('U008')) {
        result.violations.push(...this._checkU008OrderedFillCollision(document, filePath));
      }

    } catch (error) {
      // Handle malformed HTML gracefully
      result.violations.push({
        rule: 'PARSE_ERROR',
        severity: 'error',
        message: `Failed to parse HTML: ${error.message}`,
        line: 1,
        column: 1
      });
    }

    return result;
  }

  /**
   * Merge user configuration with defaults
   * @private
   */
  _mergeConfiguration(userConfig) {
    const defaultConfig = {
      dom_cascade: {
        version: '1.0',
        area_prefix: 'unify-'
      },
      lint: {
        U001: 'warn',
        U002: 'error',
        U003: 'warn',
        U004: 'warn',
        U005: 'info',
        U006: 'warn',
        U008: 'warn'
      }
    };

    return {
      dom_cascade: { ...defaultConfig.dom_cascade, ...userConfig.dom_cascade },
      lint: { ...defaultConfig.lint, ...userConfig.lint }
    };
  }

  /**
   * Validate configuration
   * @private
   */
  _validateConfiguration() {
    const validSeverities = ['error', 'warn', 'info', 'off'];
    const validRules = ['U001', 'U002', 'U003', 'U004', 'U005', 'U006', 'U008'];

    for (const [rule, severity] of Object.entries(this.config.lint)) {
      if (!validRules.includes(rule)) {
        throw new Error(`Invalid configuration: unknown rule '${rule}'`);
      }
      if (!validSeverities.includes(severity)) {
        throw new Error(`Invalid configuration: invalid severity '${severity}' for rule '${rule}'`);
      }
    }
  }

  /**
   * Check if a rule is enabled (not 'off')
   * @private
   */
  _isRuleEnabled(rule) {
    return this.config.lint[rule] !== 'off';
  }

  /**
   * Get area prefix from configuration
   * @private
   */
  _getAreaPrefix() {
    return this.config.dom_cascade.area_prefix;
  }

  /**
   * U001: Check for presence of documentation block
   * @private
   */
  _checkU001DocsPresent(document, filePath) {
    const violations = [];
    const styleElements = document.getElementsByTagName('style');
    const docsBlock = styleElements.find(el => el.getAttribute('data-unify-docs'));
    
    if (!docsBlock) {
      violations.push({
        rule: 'U001',
        severity: this.config.lint.U001,
        message: 'Missing documentation block in layout/component',
        line: 1,
        column: 1
      });
    }

    return violations;
  }

  /**
   * U002: Check for duplicate area classes in scope
   * @private
   */
  _checkU002AreaUniqueInScope(document, filePath) {
    const violations = [];
    const areaPrefix = this._getAreaPrefix();
    const areaClasses = new Map();

    // Find all elements with area classes
    const elements = document.getAllElements().filter(el => 
      Array.from(el.classList).some(cls => cls.startsWith(areaPrefix))
    );
    
    for (const element of elements) {
      const classList = Array.from(element.classList);
      const areaClass = classList.find(cls => cls.startsWith(areaPrefix));
      
      if (areaClass) {
        if (areaClasses.has(areaClass)) {
          violations.push({
            rule: 'U002',
            severity: this.config.lint.U002,
            message: `Duplicate area class '${areaClass}' found in scope`,
            line: this._getLineNumber(element),
            column: 1
          });
        } else {
          areaClasses.set(areaClass, element);
        }
      }
    }

    return violations;
  }

  /**
   * U003: Check for high-specificity area selectors
   * @private
   */
  _checkU003AreaLowSpecificity(document, filePath) {
    const violations = [];
    const styleElements = document.getElementsByTagName('style');
    const docsBlock = styleElements.find(el => el.getAttribute('data-unify-docs'));
    
    if (docsBlock) {
      const cssText = docsBlock.innerHTML;
      const areaPrefix = this._getAreaPrefix();
      
      // Simple regex to find area selectors with high specificity
      const highSpecRegex = new RegExp(`\\.${areaPrefix}[a-zA-Z0-9-]+\\s*[>+~]`, 'g');
      const matches = cssText.match(highSpecRegex);
      
      if (matches) {
        violations.push({
          rule: 'U003',
          severity: this.config.lint.U003,
          message: 'Area selector has high specificity; use simple class or type+class',
          line: this._getLineNumber(docsBlock),
          column: 1
        });
      }
    }

    return violations;
  }

  /**
   * U004: Check that used areas are documented
   * @private
   */
  _checkU004AreaDocumented(document, filePath) {
    const violations = [];
    const areaPrefix = this._getAreaPrefix();
    const styleElements = document.getElementsByTagName('style');
    const docsBlock = styleElements.find(el => el.getAttribute('data-unify-docs'));
    
    // Get documented areas
    const documentedAreas = new Set();
    if (docsBlock) {
      const cssText = docsBlock.innerHTML;
      const areaRegex = new RegExp(`\\.${areaPrefix}[a-zA-Z0-9-]+`, 'g');
      const matches = cssText.match(areaRegex);
      if (matches) {
        matches.forEach(match => documentedAreas.add(match));
      }
    }

    // Check used areas
    const elements = document.getAllElements().filter(el => 
      Array.from(el.classList).some(cls => cls.startsWith(areaPrefix))
    );
    
    for (const element of elements) {
      const classList = Array.from(element.classList);
      const areaClass = classList.find(cls => cls.startsWith(areaPrefix));
      
      if (areaClass && !documentedAreas.has(`.${areaClass}`)) {
        violations.push({
          rule: 'U004',
          severity: this.config.lint.U004,
          message: `Area '${areaClass}' used but not documented`,
          line: this._getLineNumber(element),
          column: 1
        });
      }
    }

    return violations;
  }

  /**
   * U005: Check for documented areas not used in DOM
   * @private
   */
  _checkU005DocsDrift(document, filePath) {
    const violations = [];
    const areaPrefix = this._getAreaPrefix();
    const styleElements = document.getElementsByTagName('style');
    const docsBlock = styleElements.find(el => el.getAttribute('data-unify-docs'));
    
    if (!docsBlock) return violations;

    // Get documented areas
    const documentedAreas = new Set();
    const cssText = docsBlock.innerHTML;
    const areaRegex = new RegExp(`\\.${areaPrefix}[a-zA-Z0-9-]+`, 'g');
    const matches = cssText.match(areaRegex);
    if (matches) {
      matches.forEach(match => documentedAreas.add(match.substring(1))); // Remove leading dot
    }

    // Get used areas
    const usedAreas = new Set();
    const elements = document.getAllElements().filter(el => 
      Array.from(el.classList).some(cls => cls.startsWith(areaPrefix))
    );
    
    for (const element of elements) {
      const classList = Array.from(element.classList);
      const areaClass = classList.find(cls => cls.startsWith(areaPrefix));
      if (areaClass) {
        usedAreas.add(areaClass);
      }
    }

    // Check for documented but unused areas
    for (const documentedArea of documentedAreas) {
      if (!usedAreas.has(documentedArea)) {
        violations.push({
          rule: 'U005',
          severity: this.config.lint.U005,
          message: `Documented area '${documentedArea}' not used in DOM`,
          line: this._getLineNumber(docsBlock),
          column: 1
        });
      }
    }

    return violations;
  }

  /**
   * U006: Check for multiple same landmarks in sectioning root
   * @private
   */
  _checkU006LandmarkAmbiguous(document, filePath) {
    const violations = [];
    const landmarks = ['header', 'nav', 'main', 'aside', 'footer'];
    
    for (const landmark of landmarks) {
      const elements = document.getElementsByTagName(landmark);
      if (elements.length > 1) {
        violations.push({
          rule: 'U006',
          severity: this.config.lint.U006,
          message: `Multiple ${landmark} landmarks found; consider using area classes`,
          line: this._getLineNumber(elements[1]), // Report second occurrence
          column: 1
        });
      }
    }

    return violations;
  }

  /**
   * U008: Check for ordered fill collision (placeholder implementation)
   * @private
   */
  _checkU008OrderedFillCollision(document, filePath) {
    const violations = [];
    // This rule requires knowledge of page-layout interaction
    // For now, return empty violations (will be implemented in integration phase)
    return violations;
  }

  /**
   * Get line number for an element (simplified implementation)
   * @private
   */
  _getLineNumber(element) {
    // For now, return a simple line number
    // In a real implementation, this would use line counting from the original HTML
    return 1;
  }
}