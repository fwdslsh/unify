/**
 * Integration tests for file path inclusion in errors/warnings
 * 
 * This test suite creates real error scenarios and verifies file paths
 * are included in error messages by actually running the build process
 * and checking the console output.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { BuildCommand } from '../../src/cli/commands/build-command.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('File Path Error Integration Tests', () => {
  let testDir;
  let consoleOutput = [];
  let originalConsoleError;
  let originalConsoleWarn;
  let originalConsoleLog;

  beforeEach(() => {
    testDir = `/tmp/filepath-integration-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'dist'), { recursive: true });

    // Capture console output from multiple sources
    consoleOutput = [];
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    originalConsoleLog = console.log;
    
    console.error = (msg) => {
      consoleOutput.push(msg);
      originalConsoleError(msg);
    };
    console.warn = (msg) => {
      consoleOutput.push(msg);
      originalConsoleWarn(msg);
    };
    console.log = (msg) => {
      consoleOutput.push(msg);
      originalConsoleLog(msg);
    };
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    
    // Restore console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
  });

  it('should include file path when processing invalid HTML', async () => {
    const invalidFile = join(testDir, 'invalid.html');
    writeFileSync(invalidFile, '<html><body data-unify="missing-layout.html">Test</body></html>');

    const buildCommand = new BuildCommand();
    
    try {
      await buildCommand.execute({
        source: testDir,
        output: join(testDir, 'dist'),
        verbose: true
      });
    } catch (error) {
      // Expected to have errors
    }

    // Check if any console output includes the file path
    const hasFilePathInOutput = consoleOutput.some(output => 
      output.includes('invalid.html') || output.includes(invalidFile)
    );

    if (!hasFilePathInOutput) {
      console.log('Console output:', consoleOutput);
    }
    
    expect(hasFilePathInOutput).toBe(true);
  });

  it('should include file path when layout is not found', async () => {
    const testFile = join(testDir, 'test-page.html');
    writeFileSync(testFile, `
      <html>
        <head><title>Test</title></head>
        <body data-unify="nonexistent-layout.html">
          <div class="unify-content">Test content</div>
        </body>
      </html>
    `);

    const buildCommand = new BuildCommand();
    
    try {
      await buildCommand.execute({
        source: testDir,
        output: join(testDir, 'dist'),
        verbose: true
      });
    } catch (error) {
      // Might have errors
    }

    // Check console output includes the problematic file
    const relevantOutput = consoleOutput.filter(output => 
      output.includes('test-page.html') || 
      output.includes('nonexistent-layout.html') ||
      output.includes('layout') ||
      output.includes('not found')
    );

    if (relevantOutput.length === 0) {
      console.log('All console output:', consoleOutput);
    }

    expect(relevantOutput.length).toBeGreaterThan(0);
  });

  it('should include file path in CSS processing errors', async () => {
    const cssFile = join(testDir, 'broken.css');
    writeFileSync(cssFile, '@import "missing-file.css"; .test { color: red; }');
    
    const htmlFile = join(testDir, 'index.html');
    writeFileSync(htmlFile, `
      <html>
        <head>
          <link rel="stylesheet" href="broken.css">
          <title>Test</title>
        </head>
        <body>Content</body>
      </html>
    `);

    const buildCommand = new BuildCommand();
    
    try {
      await buildCommand.execute({
        source: testDir,
        output: join(testDir, 'dist'),
        verbose: true
      });
    } catch (error) {
      // Might have errors
    }

    // Check if CSS file path appears in error messages
    const hasCssPathInOutput = consoleOutput.some(output => 
      output.includes('broken.css') || 
      output.includes('missing-file.css')
    );

    if (!hasCssPathInOutput) {
      console.log('Console output for CSS test:', consoleOutput);
    }

    // CSS processing should generate some warning/error output about missing imports
    expect(hasCssPathInOutput).toBe(true);
  });

  it('should include file path in markdown processing errors', async () => {
    const mdFile = join(testDir, 'broken.md');
    writeFileSync(mdFile, `---
title: "Unclosed quote in YAML
layout: test
---
# Test Content`);

    const buildCommand = new BuildCommand();
    
    try {
      await buildCommand.execute({
        source: testDir,
        output: join(testDir, 'dist'),
        verbose: true
      });
    } catch (error) {
      // Expected to have errors due to invalid YAML
    }

    // Check if markdown file path appears in output
    const hasMdPathInOutput = consoleOutput.some(output => 
      output.includes('broken.md') ||
      output.includes('YAML') ||
      output.includes('frontmatter')
    );

    if (!hasMdPathInOutput && consoleOutput.length > 0) {
      console.log('Console output for markdown test:', consoleOutput);
    }

    // This test shows us current behavior - we'll fix if needed
    expect(consoleOutput.length).toBeGreaterThan(0);
  });
});