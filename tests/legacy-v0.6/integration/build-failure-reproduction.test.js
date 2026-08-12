/**
 * Integration test to reproduce build failure issues
 * 
 * This test aims to identify why the examples/src build fails even though
 * individual file processing appears to succeed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { BuildCommand } from '../../src/cli/commands/build-command.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Build Failure Reproduction', () => {
  let testDir;

  beforeEach(() => {
    testDir = `/tmp/build-failure-test-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should identify why builds fail even when files process successfully', async () => {
    // Create a minimal reproduction of the examples structure
    mkdirSync(join(testDir, '_includes/base'), { recursive: true });
    mkdirSync(join(testDir, 'assets'), { recursive: true });
    
    // Create navigation fragment
    writeFileSync(join(testDir, '_includes/base/nav.html'), `
<nav class="main-nav">
  <ul class="nav-links">
    <li><a href="/">Home</a></li>
  </ul>
</nav>
    `);

    // Create footer fragment
    writeFileSync(join(testDir, '_includes/base/footer.html'), `
<footer class="site-footer">
  <p>&copy; 2024 Test Site</p>
</footer>
    `);

    // Create layout that uses fragments
    writeFileSync(join(testDir, '_includes/layout.html'), `
<!DOCTYPE html>
<html>
<head>
  <title>Test Layout</title>
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <header class="unify-header">
    <nav data-unify="base/nav">
      <!-- Default nav -->
    </nav>
  </header>
  <main class="unify-content">
    <!-- Page content -->
  </main>
  <footer class="unify-footer">
    <div data-unify="base/footer">
      <!-- Default footer -->
    </div>
  </footer>
</body>
</html>
    `);

    // Create a CSS file that references assets
    writeFileSync(join(testDir, 'assets/styles.css'), `
body { 
  font-family: Arial, sans-serif; 
  background-image: url('bg-image.jpg'); /* This asset doesn't exist */
}
    `);

    // Create main page that uses layout
    writeFileSync(join(testDir, 'index.html'), `
<html data-unify="_includes/layout.html">
<head>
  <title>Home Page</title>
</head>
<body>
  <div class="unify-content">
    <h1>Welcome Home</h1>
    <p>This is the main content.</p>
  </div>
</body>
</html>
    `);

    // Create another page to make it more realistic
    writeFileSync(join(testDir, 'about.html'), `
<html data-unify="_includes/layout.html">
<head>
  <title>About Page</title>
</head>
<body>
  <div class="unify-content">
    <h1>About Us</h1>
    <p>This is the about page.</p>
  </div>
</body>
</html>
    `);

    const buildCommand = new BuildCommand();
    const result = await buildCommand.execute({
      source: testDir,
      output: join(testDir, 'dist'),
      clean: true
    });

    // Check the result and log detailed information for debugging
    console.log('Build Result:', {
      success: result.success,
      processedFiles: result.processedFiles,
      htmlFilesProcessed: result.htmlFilesProcessed,
      assetsCopied: result.assetsCopied,
      error: result.error,
      warnings: result.warnings,
      securityWarnings: result.securityWarnings?.length || 0
    });

    // Check if output files were created
    const outputFiles = [
      join(testDir, 'dist/index.html'),
      join(testDir, 'dist/about.html'),
      join(testDir, 'dist/assets/styles.css')
    ];

    for (const outputFile of outputFiles) {
      console.log(`Output exists: ${outputFile} = ${existsSync(outputFile)}`);
    }

    // This test documents the current behavior - we expect it to show why the build fails
    if (!result.success) {
      console.log('Build failed with error:', result.error);
      console.log('Warnings:', result.warnings);
    }

    expect(result).toBeDefined();
    expect(result.processedFiles).toBeGreaterThan(0);
  });

  it('should show what happens with missing referenced assets', async () => {
    // Create a simple test case with missing asset references
    mkdirSync(join(testDir, 'assets'), { recursive: true });
    
    writeFileSync(join(testDir, 'assets/styles.css'), `
body { 
  background: url('missing-image.jpg');
  font-face: url('missing-font.woff');
}
    `);

    writeFileSync(join(testDir, 'index.html'), `
<!DOCTYPE html>
<html>
<head>
  <title>Asset Test</title>
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <h1>Asset Reference Test</h1>
  <img src="assets/missing-image.jpg" alt="Missing">
</body>
</html>
    `);

    const buildCommand = new BuildCommand();
    const result = await buildCommand.execute({
      source: testDir,
      output: join(testDir, 'dist'),
      clean: true
    });

    console.log('Asset Test Result:', {
      success: result.success,
      error: result.error,
      warnings: result.warnings,
      assetsCopied: result.assetsCopied
    });

    expect(result).toBeDefined();
  });

  it('should show behavior with different fail-on settings', async () => {
    // Create a minimal valid structure
    writeFileSync(join(testDir, 'index.html'), `
<!DOCTYPE html>
<html>
<head><title>Simple Test</title></head>
<body><h1>Hello World</h1></body>
</html>
    `);

    const buildCommand = new BuildCommand();

    // Test with different fail-on settings
    const testCases = [
      { failOn: [], name: 'default (no fail-on)' },
      { failOn: ['error'], name: 'fail-on error' },
      { failOn: ['warning'], name: 'fail-on warning' },
      { failOn: ['security'], name: 'fail-on security' }
    ];

    for (const testCase of testCases) {
      const result = await buildCommand.execute({
        source: testDir,
        output: join(testDir, `dist-${testCase.failOn.join('-') || 'default'}`),
        clean: true,
        failOn: testCase.failOn
      });

      console.log(`${testCase.name} result:`, {
        success: result.success,
        error: result.error,
        failOn: testCase.failOn
      });
    }

    expect(true).toBe(true); // Just document behavior
  });
});