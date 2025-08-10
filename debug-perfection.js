#!/usr/bin/env bun

import { createTestStructure, createTempDirectory, cleanupTempDirectory } from './test/fixtures/temp-helper.js';
import { runCLI } from './test/test-utils.js';
import path from 'path';

async function debugPerfectionFlag() {
  const tempDir = await createTempDirectory();
  const sourceDir = path.join(tempDir, 'src');
  const outputDir = path.join(tempDir, 'dist');

  try {
    const structure = {
      "src/index.html":
        "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
      "src/broken.html": '<!--#include file="missing.html" --><p>Content</p>',
      "src/good.html":
        "<!DOCTYPE html><html><body><h1>This file is fine</h1></body></html>",
    };

    await createTestStructure(tempDir, structure);

    console.log('🔍 Running build with --perfection flag...');
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

    console.log('\n📁 Output Directory (if exists):');
    try {
      const fs = await import('fs/promises');
      const exists = await fs.access(outputDir).then(() => true).catch(() => false);
      if (exists) {
        const items = await fs.readdir(outputDir);
        console.log('  Contents:', items);
      } else {
        console.log('  Directory does not exist');
      }
    } catch (error) {
      console.log('  Error reading directory:', error.message);
    }

  } finally {
    await cleanupTempDirectory(tempDir);
  }
}

debugPerfectionFlag().catch(console.error);
