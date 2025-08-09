import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createTempDirectory, cleanupTempDirectory, createTestStructure } from './fixtures/temp-helper.js';
import { build } from '../src/core/file-processor.js';
import path from 'path';
import fs from 'fs/promises';

describe('Debug Convention System', () => {
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, 'src');
    outputDir = path.join(tempDir, 'dist');
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  test('debug simple build', async () => {
    // Create simple test structure
    await createTestStructure(sourceDir, {
      'index.html': '<h1>Home Page</h1>',
    });

    console.log('Source dir:', sourceDir);
    console.log('Output dir:', outputDir);

    const result = await build({
      source: sourceDir,
      output: outputDir,
      clean: true
    });

    console.log('Build result:', result);

    // Check what files exist in source
    const sourceFiles = await fs.readdir(sourceDir, { recursive: true });
    console.log('Source files:', sourceFiles);

    // Check what files exist in output
    try {
      const outputFiles = await fs.readdir(outputDir, { recursive: true });
      console.log('Output files:', outputFiles);
    } catch (e) {
      console.log('Output directory does not exist or is empty:', e.message);
    }

    // Try to check if the output file exists
    try {
      await fs.access(path.join(outputDir, 'index.html'));
      console.log('index.html exists');
    } catch (e) {
      console.log('index.html does not exist:', e.message);
    }
  });
});