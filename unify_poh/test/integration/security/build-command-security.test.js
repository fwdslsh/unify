/**
 * Build Command Security Integration Tests
 * Tests that --fail-on security option works correctly with build command
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { BuildCommand } from '../../../src/cli/commands/build-command.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('BuildCommand Security Integration', () => {
  let buildCommand;
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(async () => {
    buildCommand = new BuildCommand();
    
    // Create temporary directories for testing
    tempDir = await mkdtemp(join(tmpdir(), 'unify-security-test-'));
    sourceDir = join(tempDir, 'src');
    outputDir = join(tempDir, 'dist');
    
    // Create source directory
    await Bun.write(join(sourceDir, 'temp'), ''); // Create directory
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should_detect_security_issues_during_build', async () => {
    // Create HTML file with security issues
    const htmlContent = `
      <html>
        <head><title>Test</title></head>
        <body>
          <div onclick="alert('xss')">Click me</div>
          <a href="javascript:alert(1)">Link</a>
        </body>
      </html>
    `;
    
    await Bun.write(join(sourceDir, 'index.html'), htmlContent);

    const options = {
      source: sourceDir,
      output: outputDir,
      failOn: []
    };

    const result = await buildCommand.execute(options);

    expect(result.success).toBe(true);
    expect(result.securityWarnings).toHaveLength(2);
    
    const xssWarning = result.securityWarnings.find(w => w.type === 'XSS_RISK');
    const jsUrlWarning = result.securityWarnings.find(w => w.type === 'JAVASCRIPT_URL');
    
    expect(xssWarning).toBeDefined();
    expect(xssWarning.message).toContain('Event handler detected');
    
    expect(jsUrlWarning).toBeDefined();
    expect(jsUrlWarning.message).toContain('JavaScript URL');
  });

  test('should_fail_build_when_fail_on_security_enabled_and_issues_found', async () => {
    // Create HTML file with security issues
    const htmlContent = `
      <html>
        <body>
          <div onclick="alert('xss')">Dangerous</div>
        </body>
      </html>
    `;
    
    await Bun.write(join(sourceDir, 'dangerous.html'), htmlContent);

    const options = {
      source: sourceDir,
      output: outputDir,
      failOn: ['security']
    };

    const result = await buildCommand.execute(options);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('security issue');
    expect(result.securityWarnings).toHaveLength(1);
  });

  test('should_succeed_when_fail_on_security_enabled_but_no_issues_found', async () => {
    // Create HTML file without security issues
    const htmlContent = `
      <html>
        <head><title>Safe Page</title></head>
        <body>
          <div onclick="this.style.display='none'">Safe handler</div>
          <a href="/safe-link.html">Safe link</a>
        </body>
      </html>
    `;
    
    await Bun.write(join(sourceDir, 'safe.html'), htmlContent);

    const options = {
      source: sourceDir,
      output: outputDir,
      failOn: ['security']
    };

    const result = await buildCommand.execute(options);

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.securityWarnings).toHaveLength(0);
  });

  test('should_report_multiple_security_issues_correctly', async () => {
    // Create multiple HTML files with different security issues
    const xssFile = `<div onclick="alert('xss')">XSS</div>`;
    const jsUrlFile = `<a href="javascript:void(0)">JS URL</a>`;
    const injectionFile = `<meta name="description" content="<script>alert(1)</script>">`;
    
    await Bun.write(join(sourceDir, 'xss.html'), xssFile);
    await Bun.write(join(sourceDir, 'jsurl.html'), jsUrlFile);
    await Bun.write(join(sourceDir, 'injection.html'), injectionFile);

    const options = {
      source: sourceDir,
      output: outputDir,
      failOn: ['security']
    };

    const result = await buildCommand.execute(options);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.securityWarnings).toHaveLength(3);
    
    const types = result.securityWarnings.map(w => w.type);
    expect(types).toContain('XSS_RISK');
    expect(types).toContain('JAVASCRIPT_URL');
    expect(types).toContain('CONTENT_INJECTION');
    
    expect(result.error).toContain('3 security issues found');
  });

  test('should_format_security_warnings_correctly', async () => {
    // Create HTML file with security issue
    const htmlContent = `<div onclick="alert('test')">Test</div>`;
    
    await Bun.write(join(sourceDir, 'test.html'), htmlContent);

    const options = {
      source: sourceDir,
      output: outputDir,
      failOn: []
    };

    const result = await buildCommand.execute(options);
    
    expect(result.success).toBe(true);
    expect(result.securityWarnings).toHaveLength(1);

    const formattedWarnings = buildCommand.formatSecurityWarnings();
    expect(formattedWarnings).toHaveLength(1);
    expect(formattedWarnings[0]).toContain('[SECURITY]');
    expect(formattedWarnings[0]).toContain('XSS Risk');
    expect(formattedWarnings[0]).toContain('test.html:1');
  });

  test('should_provide_security_summary', async () => {
    // Create HTML file with multiple security issues
    const htmlContent = `
      <div onclick="alert('xss')">XSS</div>
      <a href="javascript:void(0)">JS URL</a>
    `;
    
    await Bun.write(join(sourceDir, 'multi.html'), htmlContent);

    const options = {
      source: sourceDir,
      output: outputDir,
      failOn: []
    };

    const result = await buildCommand.execute(options);
    
    expect(result.success).toBe(true);
    expect(result.securityWarnings).toHaveLength(2);

    const summary = buildCommand.getSecuritySummary();
    expect(summary.total).toBe(2);
    expect(summary.byType.XSS_RISK).toBe(1);
    expect(summary.byType.JAVASCRIPT_URL).toBe(1);
    expect(summary.bySeverity.warning).toBe(2);
  });

  test('should_handle_mixed_fail_on_options', async () => {
    // Create HTML file with security issue
    const htmlContent = `<div onclick="alert('test')">Test</div>`;
    
    await Bun.write(join(sourceDir, 'test.html'), htmlContent);

    const options = {
      source: sourceDir,
      output: outputDir,
      failOn: ['security', 'warning', 'U001'] // Mixed options
    };

    const result = await buildCommand.execute(options);

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('1 security issue found');
    expect(result.securityWarnings).toHaveLength(1);
  });

  test('should_not_fail_when_no_fail_on_options_specified', async () => {
    // Create HTML file with security issue
    const htmlContent = `<div onclick="alert('test')">Test</div>`;
    
    await Bun.write(join(sourceDir, 'test.html'), htmlContent);

    const options = {
      source: sourceDir,
      output: outputDir,
      failOn: [] // No fail-on options
    };

    const result = await buildCommand.execute(options);

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.securityWarnings).toHaveLength(1); // Issues detected but not failing
  });

  test('should_scan_html_with_security_issues_in_content', async () => {
    // Create page with dangerous content (skip layout composition for now)
    const pageContent = `
      <html>
        <head><title>Page</title></head>
        <body>
          <div onclick="alert('dangerous')">Dangerous content</div>
        </body>
      </html>
    `;

    await Bun.write(join(sourceDir, 'page.html'), pageContent);

    const options = {
      source: sourceDir,
      output: outputDir,
      failOn: ['security']
    };

    const result = await buildCommand.execute(options);

    expect(result.success).toBe(false);
    expect(result.securityWarnings).toHaveLength(1);
    expect(result.securityWarnings[0].type).toBe('XSS_RISK');
    expect(result.securityWarnings[0].message).toContain('Event handler detected');
  });
});