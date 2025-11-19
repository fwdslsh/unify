/**
 * Comprehensive E2E test for v2 specification
 *
 * This test validates the complete build process against known good output
 * based solely on the v2 specification. Any differences indicate bugs.
 */

import { describe, it, beforeAll, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from '../../src/core/file-processor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures/comprehensive-v2');
const inputDir = path.join(fixturesDir, 'input');
const expectedDir = path.join(fixturesDir, 'expected');
const actualDir = path.join(fixturesDir, 'actual');

/**
 * Normalize HTML/text content for comparison
 * - Normalizes whitespace (multiple spaces/newlines to single space)
 * - Trims lines
 * - Removes empty lines
 */
function normalizeContent(content) {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(dir, baseDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getAllFiles(fullPath, baseDir));
    } else {
      files.push(path.relative(baseDir, fullPath));
    }
  }

  return files;
}

describe('Comprehensive V2 E2E Test', () => {
  beforeAll(async () => {
    // Clean actual directory if it exists
    try {
      await fs.rm(actualDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore if doesn't exist
    }

    // Build the input directory
    console.log('[E2E] Building input directory...');
    await build({
      source: inputDir,
      output: actualDir,
      clean: true
    });
    console.log('[E2E] Build complete. Comparing output...');
  });

  it('should produce correct output for all test cases', async () => {
    // Get all expected files
    const expectedFiles = await getAllFiles(expectedDir);
    console.log(`[E2E] Found ${expectedFiles.length} expected output files`);

    // Track failures for detailed reporting
    const failures = [];

    for (const relativePath of expectedFiles) {
      const expectedPath = path.join(expectedDir, relativePath);
      const actualPath = path.join(actualDir, relativePath);

      // Check if actual file exists
      let actualExists = true;
      try {
        await fs.access(actualPath);
      } catch {
        actualExists = false;
      }

      if (!actualExists) {
        failures.push({
          file: relativePath,
          error: 'File missing in actual output',
          expected: 'File should exist',
          actual: 'File does not exist'
        });
        continue;
      }

      // Read both files
      const expectedContent = await fs.readFile(expectedPath, 'utf-8');
      const actualContent = await fs.readFile(actualPath, 'utf-8');

      // Compare content
      // For HTML/text files, normalize whitespace for comparison
      const isTextFile = /\.(html|css|txt|js|json)$/.test(relativePath);

      if (isTextFile) {
        const normalizedExpected = normalizeContent(expectedContent);
        const normalizedActual = normalizeContent(actualContent);

        if (normalizedExpected !== normalizedActual) {
          failures.push({
            file: relativePath,
            error: 'Content mismatch',
            expected: normalizedExpected,
            actual: normalizedActual
          });
        }
      } else {
        // Binary files - exact comparison
        if (expectedContent !== actualContent) {
          failures.push({
            file: relativePath,
            error: 'Binary content mismatch',
            expected: `${expectedContent.length} bytes`,
            actual: `${actualContent.length} bytes`
          });
        }
      }
    }

    // Check for extra files in actual output
    const actualFiles = await getAllFiles(actualDir);
    const extraFiles = actualFiles.filter(f => !expectedFiles.includes(f));

    for (const extraFile of extraFiles) {
      failures.push({
        file: extraFile,
        error: 'Unexpected file in output',
        expected: 'File should not exist',
        actual: 'File exists'
      });
    }

    // Report failures
    if (failures.length > 0) {
      console.error(`\n[E2E] ❌ ${failures.length} file(s) failed validation:\n`);

      for (const failure of failures) {
        console.error(`File: ${failure.file}`);
        console.error(`Error: ${failure.error}`);

        if (failure.expected.length < 500 && failure.actual.length < 500) {
          console.error(`Expected:\n${failure.expected}`);
          console.error(`Actual:\n${failure.actual}`);
        } else {
          console.error(`Expected length: ${failure.expected.length}`);
          console.error(`Actual length: ${failure.actual.length}`);

          // Show first difference
          const expectedLines = failure.expected.split('\n');
          const actualLines = failure.actual.split('\n');
          for (let i = 0; i < Math.max(expectedLines.length, actualLines.length); i++) {
            if (expectedLines[i] !== actualLines[i]) {
              console.error(`First difference at line ${i + 1}:`);
              console.error(`  Expected: ${expectedLines[i]}`);
              console.error(`  Actual:   ${actualLines[i]}`);
              break;
            }
          }
        }
        console.error('---\n');
      }

      expect(failures.length).toBe(0);
    } else {
      console.log(`[E2E] ✅ All ${expectedFiles.length} files match expected output`);
    }
  });

  it('should not emit files/directories starting with underscore', async () => {
    const actualFiles = await getAllFiles(actualDir);

    const underscoreFiles = actualFiles.filter(f => {
      const parts = f.split(path.sep);
      return parts.some(part => part.startsWith('_'));
    });

    if (underscoreFiles.length > 0) {
      console.error('[E2E] Found files/directories starting with underscore:');
      underscoreFiles.forEach(f => console.error(`  - ${f}`));
    }

    expect(underscoreFiles.length).toBe(0);
  });

  it('should copy assets to output', async () => {
    const cssPath = path.join(actualDir, 'assets/css/style.css');
    const txtPath = path.join(actualDir, 'assets/test.txt');

    // Check CSS file exists
    let cssExists = true;
    try {
      await fs.access(cssPath);
    } catch {
      cssExists = false;
    }
    expect(cssExists).toBe(true);

    // Check text file exists
    let txtExists = true;
    try {
      await fs.access(txtPath);
    } catch {
      txtExists = false;
    }
    expect(txtExists).toBe(true);
  });
});
