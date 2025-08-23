import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

describe('Build Command Linter Integration', () => {
  let tempDir;
  let srcDir;
  let distDir;

  beforeEach(() => {
    tempDir = join(process.cwd(), 'test-linter-temp');
    srcDir = join(tempDir, 'src');
    distDir = join(tempDir, 'dist');
    
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(distDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should_run_linting_during_build_and_report_violations_when_html_has_issues', async () => {
    // Create a layout with missing docs
    const layoutContent = `
      <html>
        <head></head>
        <body>
          <section class="unify-hero">Default hero</section>
          <section class="unify-hero">Duplicate hero</section>
        </body>
      </html>
    `;
    
    writeFileSync(join(srcDir, '_layout.html'), layoutContent);
    
    // Create a page
    const pageContent = `
      <html data-unify="_layout.html">
        <head></head>
        <body>
          <section class="unify-hero">Custom hero</section>
        </body>
      </html>
    `;
    
    writeFileSync(join(srcDir, 'index.html'), pageContent);

    // Run build and capture output
    let output;
    let exitCode = 0;
    
    try {
      output = execSync(`bun src/cli.js build --source ${srcDir} --output ${distDir}`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (error) {
      output = error.stdout + error.stderr;
      exitCode = error.status;
    }

    // Should contain linter violations
    expect(output).toContain('[LINT:U001]'); // Missing docs
    expect(output).toContain('[LINT:U002]'); // Duplicate areas
    expect(exitCode).toBe(0); // Should not fail by default
  });

  test('should_fail_build_when_error_level_violations_found_and_fail_on_error_specified', async () => {
    // Create layout with duplicate areas (U002 is error level by default)
    const layoutContent = `
      <html>
        <head>
          <style data-unify-docs="v1">
            .unify-hero { /* Hero section */ }
          </style>
        </head>
        <body>
          <section class="unify-hero">First hero</section>
          <section class="unify-hero">Duplicate hero</section>
        </body>
      </html>
    `;
    
    writeFileSync(join(srcDir, '_layout.html'), layoutContent);
    writeFileSync(join(srcDir, 'index.html'), '<html data-unify="_layout.html"><body><section class="unify-hero">Page hero</section></body></html>');

    // Run build with --fail-on error
    let output;
    let exitCode = 0;
    
    try {
      output = execSync(`bun src/cli.js build --source ${srcDir} --output ${distDir} --fail-on error`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (error) {
      output = error.stdout + error.stderr;
      exitCode = error.status;
    }

    expect(output).toContain('[LINT:U002]');
    expect(exitCode).toBe(1); // Should fail
  });

  test('should_fail_build_when_specific_linter_rule_specified_in_fail_on_option', async () => {
    // Create layout without docs (U001 is warn by default)
    const layoutContent = `
      <html>
        <head></head>
        <body>
          <section class="unify-hero">Hero content</section>
        </body>
      </html>
    `;
    
    writeFileSync(join(srcDir, '_layout.html'), layoutContent);
    writeFileSync(join(srcDir, 'index.html'), '<html data-unify="_layout.html"><body><section class="unify-hero">Page hero</section></body></html>');

    // Run build with --fail-on U001
    let output;
    let exitCode = 0;
    
    try {
      output = execSync(`bun src/cli.js build --source ${srcDir} --output ${distDir} --fail-on U001`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (error) {
      output = error.stdout + error.stderr;
      exitCode = error.status;
    }

    expect(output).toContain('[LINT:U001]');
    expect(exitCode).toBe(1); // Should fail on U001 specifically
  });

  test('should_use_custom_linter_configuration_when_config_file_provided', async () => {
    // Create config file that disables U001 and makes U003 an error
    const configContent = `
unify:
  lint:
    U001: off
    U003: error
`;
    
    writeFileSync(join(tempDir, 'unify.config.yaml'), configContent);
    
    // Create layout with high-specificity selector and missing docs
    const layoutContent = `
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
    
    writeFileSync(join(srcDir, '_layout.html'), layoutContent);
    writeFileSync(join(srcDir, 'index.html'), '<html data-unify="_layout.html"><body><section class="unify-hero"><div class="content">Page content</div></section></body></html>');

    // Run build with config
    let output;
    let exitCode = 0;
    
    try {
      output = execSync(`bun src/cli.js build --source ${srcDir} --output ${distDir} --config ${join(tempDir, 'unify.config.yaml')} --fail-on error`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (error) {
      output = error.stdout + error.stderr;
      exitCode = error.status;
    }

    expect(output).not.toContain('[LINT:U001]'); // Should be disabled
    expect(output).toContain('[LINT:U003]'); // Should be error level
    expect(exitCode).toBe(1); // Should fail due to U003 error
  });

  test('should_provide_file_paths_and_line_numbers_in_linter_output_when_violations_found', async () => {
    const layoutContent = `
      <html>
        <head></head>
        <body>
          <section class="unify-hero">Hero content</section>
        </body>
      </html>
    `;
    
    writeFileSync(join(srcDir, '_layout.html'), layoutContent);
    writeFileSync(join(srcDir, 'index.html'), '<html data-unify="_layout.html"><body><section class="unify-hero">Page hero</section></body></html>');

    // Run build
    let output;
    
    try {
      output = execSync(`bun src/cli.js build --source ${srcDir} --output ${distDir}`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (error) {
      output = error.stdout + error.stderr;
    }

    expect(output).toContain('[LINT:U001]');
    expect(output).toContain('_layout.html'); // Should show file path
    // Note: Line numbers will be implemented in a later phase
  });

  test('should_lint_only_layout_and_component_files_when_processing_site', async () => {
    // Create a layout (should be linted)
    const layoutContent = `
      <html>
        <head></head>
        <body>
          <section class="unify-hero">Hero content</section>
        </body>
      </html>
    `;
    
    // Create a regular page (should not be linted for documentation)
    const pageContent = `
      <html>
        <head></head>
        <body>
          <section class="unify-hero">Page without layout</section>
        </body>
      </html>
    `;
    
    writeFileSync(join(srcDir, '_layout.html'), layoutContent);
    writeFileSync(join(srcDir, 'page.html'), pageContent);

    // Run build
    let output;
    
    try {
      output = execSync(`bun src/cli.js build --source ${srcDir} --output ${distDir}`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (error) {
      output = error.stdout + error.stderr;
    }

    // Should lint the layout file
    expect(output).toContain('[LINT:U001]');
    expect(output).toContain('_layout.html');
    
    // Should not report linting issues for regular pages
    expect(output).not.toMatch(/\[LINT:.*page\.html/i);
  });
});