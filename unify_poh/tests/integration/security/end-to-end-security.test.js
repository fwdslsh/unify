/**
 * End-to-End Security Integration Test
 * Demonstrates the complete US-020 implementation working together:
 * CLI parsing, SecurityScanner, HTML processing, and build failure
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ArgsParser } from '../../../src/cli/args-parser.js';
import { BuildCommand } from '../../../src/cli/commands/build-command.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('US-020: Security Warning Detection and Reporting (End-to-End)', () => {
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(async () => {
    // Create temporary directories for testing
    tempDir = await mkdtemp(join(tmpdir(), 'unify-e2e-security-test-'));
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

  test('should_complete_full_security_workflow_from_cli_to_build_failure', async () => {
    // Step 1: Parse CLI arguments with --fail-on security
    const parser = new ArgsParser();
    const parsed = parser.parse(['build', '--fail-on', 'security', '--source', sourceDir, '--output', outputDir]);
    const validation = parser.validate(parsed);

    expect(validation.isValid).toBe(true);
    expect(parsed.failOn).toEqual(['security']);

    // Step 2: Create HTML files with various security issues
    const xssFile = `
      <html>
        <head><title>XSS Test</title></head>
        <body>
          <div onclick="alert('XSS vulnerability')">Click me</div>
        </body>
      </html>
    `;

    const jsUrlFile = `
      <html>
        <head><title>JS URL Test</title></head>
        <body>
          <a href="javascript:maliciousFunction()">Dangerous link</a>
        </body>
      </html>
    `;

    const contentInjectionFile = `
      <html>
        <head>
          <title>Content Injection Test</title>
          <meta name="description" content="Description with <script>alert('injection')</script>">
        </head>
        <body>Content</body>
      </html>
    `;

    const safeFile = `
      <html>
        <head><title>Safe Test</title></head>
        <body>
          <div onclick="this.style.display='none'">Safe handler</div>
          <a href="/safe-page.html">Safe link</a>
        </body>
      </html>
    `;

    await Bun.write(join(sourceDir, 'xss.html'), xssFile);
    await Bun.write(join(sourceDir, 'jsurl.html'), jsUrlFile);
    await Bun.write(join(sourceDir, 'injection.html'), contentInjectionFile);
    await Bun.write(join(sourceDir, 'safe.html'), safeFile);

    // Step 3: Execute build command with security scanning enabled
    const buildCommand = new BuildCommand();
    const buildResult = await buildCommand.execute({
      source: sourceDir,
      output: outputDir,
      failOn: parsed.failOn
    });

    // Step 4: Verify build fails due to security issues
    expect(buildResult.success).toBe(false);
    expect(buildResult.exitCode).toBe(1);
    expect(buildResult.error).toContain('security issue');

    // Step 5: Verify security warnings are collected correctly
    expect(buildResult.securityWarnings).toHaveLength(3); // XSS, JS URL, Content Injection
    
    // Verify each type of security issue is detected
    const warningTypes = buildResult.securityWarnings.map(w => w.type);
    expect(warningTypes).toContain('XSS_RISK');
    expect(warningTypes).toContain('JAVASCRIPT_URL');
    expect(warningTypes).toContain('CONTENT_INJECTION');

    // Step 6: Verify warning formatting works correctly
    const formattedWarnings = buildCommand.formatSecurityWarnings();
    expect(formattedWarnings).toHaveLength(3);
    
    // All warnings should be prefixed with [SECURITY]
    formattedWarnings.forEach(warning => {
      expect(warning).toMatch(/^\[SECURITY\]/);
      expect(warning).toMatch(/\w+\.html:\d+\)$/); // File path and line number at end
    });

    // Step 7: Verify security summary provides correct statistics
    const summary = buildCommand.getSecuritySummary();
    expect(summary.total).toBe(3);
    expect(summary.byType).toEqual({
      XSS_RISK: 1,
      JAVASCRIPT_URL: 1,
      CONTENT_INJECTION: 1
    });
    expect(summary.bySeverity).toEqual({
      warning: 3
    });

    // Step 8: Verify that each warning has proper file path and line information
    buildResult.securityWarnings.forEach(warning => {
      expect(warning.filePath).toMatch(/\w+\.html$/);
      expect(warning.line).toBeGreaterThan(0);
      expect(warning.severity).toBe('warning');
      expect(warning.context).toBeDefined();
      expect(warning.message).toBeDefined();
    });
  });

  test('should_succeed_when_no_security_issues_found', async () => {
    // Step 1: Parse CLI arguments with --fail-on security
    const parser = new ArgsParser();
    const parsed = parser.parse(['build', '--fail-on', 'security', '--source', sourceDir, '--output', outputDir]);

    // Step 2: Create only safe HTML files
    const safeFile1 = `
      <html>
        <head><title>Safe Page 1</title></head>
        <body>
          <div onclick="this.style.display='none'">Safe handler</div>
          <a href="/another-page.html">Safe link</a>
        </body>
      </html>
    `;

    const safeFile2 = `
      <html>
        <head>
          <title>Safe Page 2</title>
          <meta name="description" content="This is a safe description">
        </head>
        <body>
          <script src="/js/safe-script.js"></script>
        </body>
      </html>
    `;

    await Bun.write(join(sourceDir, 'page1.html'), safeFile1);
    await Bun.write(join(sourceDir, 'page2.html'), safeFile2);

    // Step 3: Execute build command
    const buildCommand = new BuildCommand();
    const buildResult = await buildCommand.execute({
      source: sourceDir,
      output: outputDir,
      failOn: parsed.failOn
    });

    // Step 4: Verify build succeeds with no security issues
    expect(buildResult.success).toBe(true);
    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.securityWarnings).toHaveLength(0);

    // Step 5: Verify summary shows no issues
    const summary = buildCommand.getSecuritySummary();
    expect(summary.total).toBe(0);
    expect(Object.keys(summary.byType)).toHaveLength(0);
    expect(Object.keys(summary.bySeverity)).toHaveLength(0);
  });

  test('should_display_helpful_formatted_warnings', async () => {
    // Create a single HTML file with a clear security issue
    const htmlContent = `<html>
<head><title>Test Page</title></head>
<body>
  <div onclick="alert('Click me!')">Dangerous button</div>
</body>
</html>`;

    await Bun.write(join(sourceDir, 'test-page.html'), htmlContent);

    // Execute build
    const buildCommand = new BuildCommand();
    const buildResult = await buildCommand.execute({
      source: sourceDir,
      output: outputDir,
      failOn: ['security']
    });

    // Verify failure
    expect(buildResult.success).toBe(false);
    expect(buildResult.securityWarnings).toHaveLength(1);

    // Verify formatted warning is helpful
    const formattedWarnings = buildCommand.formatSecurityWarnings();
    const warning = formattedWarnings[0];
    
    expect(warning).toContain('[SECURITY]');
    expect(warning).toContain('XSS Risk');
    expect(warning).toContain('Event handler detected');
    expect(warning).toContain('test-page.html:4'); // Correct line number
  });
});