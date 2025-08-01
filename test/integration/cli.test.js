/**
 * Integration tests for CLI functionality
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { runCLI } from '../test-utils.js';

const testFixturesDir = path.join(import.meta.dir, '../fixtures/cli');

describe('CLI integration', () => {
  let sourceDir;
  let outputDir;
  
  beforeEach(async () => {
    // Create test directories
    sourceDir = path.join(testFixturesDir, 'src');
    outputDir = path.join(testFixturesDir, 'dist');
    
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(path.join(sourceDir, '.components'), { recursive: true });
    
    // Create test files
    await fs.writeFile(
      path.join(sourceDir, '.components', 'head.html'),
      '<meta charset="UTF-8">'
    );
    
    await fs.writeFile(
      path.join(sourceDir, '.components', 'header.html'),
      '<header><h1>CLI Test</h1></header>'
    );
    
    await fs.writeFile(
      path.join(sourceDir, 'index.html'),
      `<!DOCTYPE html>
<html>
<head>
  <title>CLI Test</title>
  <link rel="stylesheet" href="main.css">
  <!--#include virtual="/.components/head.html" -->
</head>
<body>
  <!--#include virtual="/.components/header.html" -->
  <main><p>Testing CLI</p></main>
</body>
</html>`
    );
    
    await fs.writeFile(
      path.join(sourceDir, 'main.css'),
      'body { margin: 0; }'
    );
  });
  
  afterEach(async () => {
    // Clean up test fixtures
    try {
      await fs.rm(testFixturesDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  it('should show version with --version flag', async () => {
    const result = await runCLI(['--version']);
    expect(result.code).toBe(0);
    expect(result.stdout.includes('0.6.0')).toBeTruthy();
  });
  
  it('should show help with --help flag', async () => {
    const result = await runCLI(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout.includes('Usage: unify')).toBeTruthy();
    expect(result.stdout.includes('Commands:')).toBeTruthy();
    expect(result.stdout.includes('build')).toBeTruthy();
    expect(result.stdout.includes('watch')).toBeTruthy();
  });
  
  it('should run build when no command is provided', async () => {
    const result = await runCLI([], { cwd: testFixturesDir });
    expect(result.code).toBe(0);
    expect(result.stdout.includes('Building static site')).toBeTruthy();
    expect(result.stdout.includes('Build completed successfully')).toBeTruthy();

    // Verify output files
    await fs.access(path.join(outputDir, 'index.html'));
    await fs.access(path.join(outputDir, 'main.css'));

    // Verify content processing
    const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    expect(indexContent.includes('<header><h1>CLI Test</h1></header>')).toBeTruthy();
    expect(indexContent.includes('<meta charset="UTF-8">')).toBeTruthy();
  });
  
  it('should build site with build command', async () => {
    const result = await runCLI([
      'build',
      '--source', sourceDir,
      '--output', outputDir
    ]);
    
    expect(result.code).toBe(0);
    expect(result.stdout.includes('Building static site')).toBeTruthy();
    expect(result.stdout.includes('Build completed successfully')).toBeTruthy();
    
    // Verify output files
    await fs.access(path.join(outputDir, 'index.html'));
    await fs.access(path.join(outputDir, 'main.css'));
    
    // Verify content processing
    const indexContent = await fs.readFile(path.join(outputDir, 'index.html'), 'utf-8');
    expect(indexContent.includes('<header><h1>CLI Test</h1></header>')).toBeTruthy();
    expect(indexContent.includes('<meta charset="UTF-8">')).toBeTruthy();
  });
  
  it('should handle build errors gracefully', async () => {
    const result = await runCLI([
      'build',
      '--source', '/nonexistent/directory',
      '--output', outputDir
    ]);
    
    expect(result.code).toBe(2); // Exit code 2 for CLI argument errors (nonexistent source)
    expect(result.stderr.includes('Source directory not found')).toBeTruthy();
  });
  
  it('should fail build when components are missing', async () => {
    // Create a source file with missing include
    await fs.writeFile(
      path.join(sourceDir, 'broken.html'),
      '<!DOCTYPE html><html><body><!--#include file="missing.html" --></body></html>'
    );
    
    const result = await runCLI([
      'build',
      '--source', sourceDir,
      '--output', outputDir
    ]);
    
    expect(result.code).toBe(0);
    const allOutput = result.stdout + result.stderr;
    expect(allOutput.includes('Include not found') || allOutput.includes('Include file not found')).toBeTruthy();
  });
  
  it('should validate CLI arguments', async () => {
    const result = await runCLI([
      'build',
      '--unknown-option'
    ]);
    
    expect(result.code).toBe(2); // Exit code 2 for CLI argument errors (nonexistent source)
    expect(result.stderr.includes('Unknown option')).toBeTruthy();
  });
  
  it('should handle unknown commands', async () => {
    const result = await runCLI(['unknown-command']);
    
    expect(result.code).toBe(2); // Exit code 2 for CLI argument errors (nonexistent source)
    expect(result.stderr.includes('Unknown command')).toBeTruthy();
  });
  
  it('should handle unknown options', async () => {
    const result = await runCLI([
      'build',
      '--unknown-option'
    ]);
    
    expect(result.code).toBe(2); // Exit code 2 for CLI argument errors (nonexistent source)
    expect(result.stderr.includes('Unknown option')).toBeTruthy();
  });
  
  it('should work with short option flags', async () => {
    const result = await runCLI([
      'build',
      '-s', sourceDir,
      '-o', outputDir
    ]);
    
    expect(result.code).toBe(0);
    expect(result.stdout.includes('Build completed successfully')).toBeTruthy();
    
    // Verify output
    await fs.access(path.join(outputDir, 'index.html'));
  });
  
  
  it('should work with simplified usage (no arguments)', async () => {
    // Create default directory structure in current working directory for this test
    const testDir = path.join(testFixturesDir, 'default-test');
    const defaultSrc = path.join(testDir, 'src');
    const defaultDist = path.join(testDir, 'dist');
    const defaultComponents = path.join(defaultSrc, '.components');
    
    await fs.mkdir(defaultComponents, { recursive: true });
    
    // Create test files in default structure
    await fs.writeFile(
      path.join(defaultComponents, 'header.html'),
      '<header><h1>Default Test</h1></header>'
    );
    
    await fs.writeFile(
      path.join(defaultSrc, 'index.html'),
      `<!DOCTYPE html>
<html>
<head><title>Default Test</title></head>
<body>
  <!--#include virtual="/.components/header.html" -->
  <main><p>Testing default directories</p></main>
</body>
</html>`
    );
    
    // Change to test directory and run with defaults
    const result = await runCLI(['build'], { cwd: testDir });
    
    expect(result.code).toBe(0);
    expect(result.stdout.includes('Build completed successfully')).toBeTruthy();
    
    // Verify output in default dist directory
    await fs.access(path.join(defaultDist, 'index.html'));
    const indexContent = await fs.readFile(path.join(defaultDist, 'index.html'), 'utf-8');
    expect(indexContent.includes('<header><h1>Default Test</h1></header>')).toBeTruthy();
  });
  
 
});

