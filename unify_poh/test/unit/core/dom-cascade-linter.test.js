import { describe, test, expect, beforeEach } from 'bun:test';
import { DOMCascadeLinter } from '../../../src/core/dom-cascade-linter.js';

describe('DOMCascadeLinter', () => {
  let linter;

  beforeEach(() => {
    linter = new DOMCascadeLinter();
  });

  test('should_instantiate_with_default_configuration_when_no_config_provided', () => {
    expect(linter).toBeDefined();
    expect(linter.getConfiguration()).toEqual({
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
    });
  });

  test('should_accept_custom_configuration_when_provided', () => {
    const customConfig = {
      dom_cascade: {
        version: '1.0',
        area_prefix: 'custom-'
      },
      lint: {
        U001: 'error',
        U002: 'off',
        U003: 'info'
      }
    };

    const customLinter = new DOMCascadeLinter(customConfig);
    expect(customLinter.getConfiguration().dom_cascade.area_prefix).toBe('custom-');
    expect(customLinter.getConfiguration().lint.U001).toBe('error');
    expect(customLinter.getConfiguration().lint.U002).toBe('off');
  });

  test('should_lint_html_content_and_return_violations_when_content_provided', async () => {
    const htmlContent = `
      <html>
        <head>
          <style data-unify-docs="v1">
            .unify-hero { /* Hero section */ }
          </style>
        </head>
        <body>
          <section class="unify-hero">Hero content</section>
        </body>
      </html>
    `;

    const result = await linter.lintHTML(htmlContent, 'test.html');
    
    expect(result).toBeDefined();
    expect(result.filePath).toBe('test.html');
    expect(Array.isArray(result.violations)).toBe(true);
  });

  test('should_return_empty_violations_when_html_content_is_valid', async () => {
    const validHtmlContent = `
      <html>
        <head>
          <style data-unify-docs="v1">
            .unify-hero { /* Hero section */ }
          </style>
        </head>
        <body>
          <section class="unify-hero">Hero content</section>
        </body>
      </html>
    `;

    const result = await linter.lintHTML(validHtmlContent, 'valid.html');
    expect(result.violations).toHaveLength(0);
  });

  test('should_detect_missing_docs_block_when_u001_enabled', async () => {
    const htmlWithoutDocs = `
      <html>
        <head></head>
        <body>
          <section class="unify-hero">Hero content</section>
        </body>
      </html>
    `;

    const result = await linter.lintHTML(htmlWithoutDocs, 'no-docs.html');
    
    const u001Violations = result.violations.filter(v => v.rule === 'U001');
    expect(u001Violations).toHaveLength(1);
    expect(u001Violations[0].severity).toBe('warn');
    expect(u001Violations[0].message).toContain('documentation block');
  });

  test('should_detect_duplicate_areas_when_u002_enabled', async () => {
    const htmlWithDuplicateAreas = `
      <html>
        <head>
          <style data-unify-docs="v1">
            .unify-hero { /* Hero section */ }
          </style>
        </head>
        <body>
          <section class="unify-hero">First hero</section>
          <section class="unify-hero">Second hero</section>
        </body>
      </html>
    `;

    const result = await linter.lintHTML(htmlWithDuplicateAreas, 'duplicate.html');
    
    const u002Violations = result.violations.filter(v => v.rule === 'U002');
    expect(u002Violations).toHaveLength(1);
    expect(u002Violations[0].severity).toBe('error');
    expect(u002Violations[0].message).toContain('Duplicate area');
  });

  test('should_detect_high_specificity_selectors_when_u003_enabled', async () => {
    const htmlWithHighSpecificity = `
      <html>
        <head>
          <style data-unify-docs="v1">
            .unify-hero > .content { /* High specificity */ }
          </style>
        </head>
        <body>
          <section class="unify-hero">
            <div class="content">Hero content</div>
          </section>
        </body>
      </html>
    `;

    const result = await linter.lintHTML(htmlWithHighSpecificity, 'high-spec.html');
    
    const u003Violations = result.violations.filter(v => v.rule === 'U003');
    expect(u003Violations).toHaveLength(1);
    expect(u003Violations[0].severity).toBe('warn');
    expect(u003Violations[0].message).toContain('specificity');
  });

  test('should_detect_undocumented_areas_when_u004_enabled', async () => {
    const htmlWithUndocumentedArea = `
      <html>
        <head>
          <style data-unify-docs="v1">
            .unify-hero { /* Documented area */ }
          </style>
        </head>
        <body>
          <section class="unify-hero">Hero content</section>
          <section class="unify-sidebar">Undocumented area</section>
        </body>
      </html>
    `;

    const result = await linter.lintHTML(htmlWithUndocumentedArea, 'undocumented.html');
    
    const u004Violations = result.violations.filter(v => v.rule === 'U004');
    expect(u004Violations).toHaveLength(1);
    expect(u004Violations[0].severity).toBe('warn');
    expect(u004Violations[0].message).toContain('not documented');
  });

  test('should_detect_docs_drift_when_u005_enabled', async () => {
    const htmlWithDocsDrift = `
      <html>
        <head>
          <style data-unify-docs="v1">
            .unify-hero { /* Used area */ }
            .unify-sidebar { /* Unused area */ }
          </style>
        </head>
        <body>
          <section class="unify-hero">Hero content</section>
        </body>
      </html>
    `;

    const result = await linter.lintHTML(htmlWithDocsDrift, 'drift.html');
    
    const u005Violations = result.violations.filter(v => v.rule === 'U005');
    expect(u005Violations).toHaveLength(1);
    expect(u005Violations[0].severity).toBe('info');
    expect(u005Violations[0].message).toContain('not used');
  });

  test('should_detect_ambiguous_landmarks_when_u006_enabled', async () => {
    const htmlWithAmbiguousLandmarks = `
      <html>
        <head>
          <style data-unify-docs="v1"></style>
        </head>
        <body>
          <header>First header</header>
          <header>Second header</header>
          <main>Content</main>
        </body>
      </html>
    `;

    const result = await linter.lintHTML(htmlWithAmbiguousLandmarks, 'ambiguous.html');
    
    const u006Violations = result.violations.filter(v => v.rule === 'U006');
    expect(u006Violations).toHaveLength(1);
    expect(u006Violations[0].severity).toBe('warn');
    expect(u006Violations[0].message).toContain('Multiple');
  });

  test('should_skip_disabled_rules_when_rule_set_to_off', async () => {
    const configWithDisabledRules = {
      lint: {
        U001: 'off',
        U002: 'off',
        U003: 'warn'
      }
    };

    const customLinter = new DOMCascadeLinter(configWithDisabledRules);
    
    const htmlWithoutDocs = `
      <html>
        <head></head>
        <body>
          <section class="unify-hero">Hero content</section>
          <section class="unify-hero">Duplicate hero</section>
        </body>
      </html>
    `;

    const result = await customLinter.lintHTML(htmlWithoutDocs, 'disabled.html');
    
    // Should not find U001 or U002 violations since they're disabled
    const u001Violations = result.violations.filter(v => v.rule === 'U001');
    const u002Violations = result.violations.filter(v => v.rule === 'U002');
    
    expect(u001Violations).toHaveLength(0);
    expect(u002Violations).toHaveLength(0);
  });

  test('should_provide_line_numbers_and_column_info_when_violations_found', async () => {
    const htmlWithIssues = `<html>
<head>
  <style data-unify-docs="v1">
    .unify-hero { /* Hero section */ }
  </style>
</head>
<body>
  <section class="unify-hero">Hero</section>
  <section class="unify-sidebar">Undocumented</section>
</body>
</html>`;

    const result = await linter.lintHTML(htmlWithIssues, 'line-info.html');
    
    const u004Violations = result.violations.filter(v => v.rule === 'U004');
    expect(u004Violations).toHaveLength(1);
    expect(u004Violations[0].line).toBeDefined();
    expect(u004Violations[0].column).toBeDefined();
    expect(typeof u004Violations[0].line).toBe('number');
    expect(u004Violations[0].line).toBeGreaterThan(0);
  });

  test('should_handle_malformed_html_gracefully_when_invalid_content_provided', async () => {
    const malformedHtml = `<html><head><style data-unify-docs><body><section class="unify-hero">`;

    const result = await linter.lintHTML(malformedHtml, 'malformed.html');
    
    expect(result).toBeDefined();
    expect(result.filePath).toBe('malformed.html');
    expect(Array.isArray(result.violations)).toBe(true);
    // Should not throw an error, but may have parse-related violations
  });

  test('should_validate_configuration_when_invalid_config_provided', () => {
    const invalidConfig = {
      lint: {
        U001: 'invalid-severity',
        U999: 'warn' // Non-existent rule
      }
    };

    expect(() => {
      new DOMCascadeLinter(invalidConfig);
    }).toThrow('Invalid configuration');
  });

  test('should_support_custom_area_prefix_when_configured', async () => {
    const customConfig = {
      dom_cascade: {
        area_prefix: 'custom-'
      }
    };

    const customLinter = new DOMCascadeLinter(customConfig);
    
    const htmlWithCustomPrefix = `
      <html>
        <head></head>
        <body>
          <section class="custom-hero">Hero content</section>
        </body>
      </html>
    `;

    const result = await customLinter.lintHTML(htmlWithCustomPrefix, 'custom-prefix.html');
    
    // Should detect missing docs for custom prefix
    const u001Violations = result.violations.filter(v => v.rule === 'U001');
    expect(u001Violations).toHaveLength(1);
  });
});