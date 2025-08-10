#!/usr/bin/env bun

import { build } from './src/core/file-processor.js';
import { createTestStructure, createTempDirectory, cleanupTempDirectory } from './test/fixtures/temp-helper.js';
import path from 'path';

async function debugAssetTracking() {
  const tempDir = await createTempDirectory();
  const sourceDir = path.join(tempDir, 'src');
  const outputDir = path.join(tempDir, 'dist');

  try {
    await createTestStructure(sourceDir, {
      'index.html': `
        <html>
        <head>
          <link rel="stylesheet" href="css/main.css">
        </head>
        <body>
          <img src="images/logo.png" alt="Logo">
        </body>
        </html>
      `,
      'css/main.css': 'body { margin: 0; }',
      'css/_internal.css': 'body { padding: 0; }', // Not referenced, should not be copied
      'images/logo.png': 'fake-png-content',
      '_assets/private-image.png': 'private-content', // Should not be copied
      'js/unused.js': 'console.log("unused");' // Not referenced, should not be copied
    });

    console.log('🔍 Starting build with debug...');
    const result = await build({
      source: sourceDir,
      output: outputDir,
      clean: true
    });

    console.log('\n📊 Build Results:');
    console.log(`  Processed: ${result.processed}`);
    console.log(`  Copied: ${result.copied}`);
    console.log(`  Skipped: ${result.skipped}`);
    console.log(`  Errors: ${result.errors.length}`);

    console.log('\n🎯 Asset Tracker State:');
    console.log('  Referenced Assets:', result.assetTracker.getAllReferencedAssets());
    console.log('  Asset References Map:', Object.fromEntries(result.assetTracker.assetReferences));
    
    // Add debug info about dependency tracker
    console.log('\n🔗 Dependency Tracker State:');
    console.log('  Known Files:', Array.from(result.dependencyTracker.knownFiles));
    console.log('  Main Pages:', result.dependencyTracker.getMainPages());
    console.log('  Include Files:', result.dependencyTracker.getIncludeFiles());
    
    // Check what files were found and classified
    console.log('\n📂 Source Files Found:');
    const fs2 = await import('fs/promises');
    async function findAllFiles(dir, prefix = '') {
      const items = await fs2.default.readdir(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stats = await fs2.default.stat(fullPath);
        if (stats.isDirectory()) {
          console.log(`${prefix}📁 ${item}/`);
          await findAllFiles(fullPath, prefix + '  ');
        } else {
          console.log(`${prefix}📄 ${item}`);
        }
      }
    }
    console.log('Source directory:');
    await findAllFiles(sourceDir);
    
    console.log('\n📁 Output Directory Contents:');
    async function listDir(dir, prefix = '') {
      const items = await fs2.default.readdir(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stats = await fs2.default.stat(fullPath);
        if (stats.isDirectory()) {
          console.log(`${prefix}📁 ${item}/`);
          await listDir(fullPath, prefix + '  ');
        } else {
          console.log(`${prefix}📄 ${item}`);
        }
      }
    }
    await listDir(outputDir);

  } finally {
    await cleanupTempDirectory(tempDir);
  }
}

debugAssetTracking().catch(console.error);
