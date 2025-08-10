#!/usr/bin/env bun

import { createTestStructure, createTempDirectory, cleanupTempDirectory } from './test/fixtures/temp-helper.js';
import { runCLI } from './test/test-utils.js';
import path from 'path';

async function debugCircularDependency() {
  const tempDir = await createTempDirectory();
  const sourceDir = path.join(tempDir, 'src');
  const outputDir = path.join(tempDir, 'dist');

  try {
    const structure = {
      "src/index.html":
        "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
      "src/circular1.html":
        '<!--#include file="circular2.html" --><p>Circular 1</p>',
      "src/circular2.html":
        '<!--#include file="circular1.html" --><p>Circular 2</p>',
      "src/good.html":
        "<!DOCTYPE html><html><body><h1>Good</h1></body></html>",
    };

    await createTestStructure(tempDir, structure);

    console.log('🔍 Running build with --perfection flag (circular dependency test)...');
    const result = await runCLI([
      'build',
      '--source', sourceDir,
      '--output', outputDir,
      '--perfection'
    ], { cwd: tempDir });

    console.log('\n📊 CLI Result:');
    console.log(`  Exit Code: ${result.code}`);
    console.log(`  Stdout:`, result.stdout);
    console.log(`  Stderr:`, result.stderr);

  } finally {
    await cleanupTempDirectory(tempDir);
  }
}

debugCircularDependency().catch(console.error);
