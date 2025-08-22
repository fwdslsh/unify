/**
 * Test helper for creating temporary projects from fixtures
 * Manages isolated test environments with cleanup
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, cp, rm, readdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures');

/**
 * Creates a temporary project from a fixture
 * @param {string} fixtureName - Name of fixture directory to copy
 * @param {Object} overrides - Files to override/add in format { 'path/file.ext': 'content' }
 * @returns {Promise<{sourceDir: string, outputDir: string, cleanup: Function}>}
 */
export async function makeTempProject(fixtureName, overrides = {}) {
  // Create unique temporary directory
  const tempBase = await createTempDir();
  const sourceDir = join(tempBase, 'src');
  const outputDir = join(tempBase, 'dist');
  
  // Copy fixture if it exists and is specified
  try {
    await mkdir(sourceDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    
    // Check if fixture is specified and copy it
    if (fixtureName) {
      try {
        const fixtureDir = join(FIXTURES_DIR, fixtureName);
        const fixtureSrcDir = join(fixtureDir, 'src');
        await cp(fixtureSrcDir, sourceDir, { recursive: true });
      } catch (error) {
        // Fixture doesn't exist or doesn't have src dir - start with empty project
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
    
    // Apply overrides
    for (const [filePath, content] of Object.entries(overrides)) {
      const fullPath = join(sourceDir, filePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf8');
    }
    
  } catch (error) {
    // Clean up on failure
    await rm(tempBase, { recursive: true, force: true });
    throw error;
  }
  
  return {
    sourceDir,
    outputDir,
    tempBase,
    async cleanup() {
      await rm(tempBase, { recursive: true, force: true });
    }
  };
}

/**
 * Creates unique temporary directory
 * @returns {Promise<string>} Path to temp directory
 */
async function createTempDir() {
  const prefix = 'unify-test-';
  const suffix = Math.random().toString(36).substring(2, 15);
  const tempPath = join(tmpdir(), `${prefix}${suffix}`);
  await mkdir(tempPath, { recursive: true });
  return tempPath;
}

/**
 * Lists available fixtures
 * @returns {Promise<string[]>} Array of fixture names
 */
export async function listFixtures() {
  try {
    const fixtures = await readdir(FIXTURES_DIR, { withFileTypes: true });
    return fixtures
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .filter(name => name !== 'expected'); // Exclude expected directory
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Creates a temporary project with specific directory structure
 * @param {Object} structure - Directory structure in nested object format
 * @returns {Promise<{sourceDir: string, outputDir: string, cleanup: Function}>}
 */
export async function makeTempProjectFromStructure(structure) {
  const tempBase = await createTempDir();
  const sourceDir = join(tempBase, 'src');
  const outputDir = join(tempBase, 'dist');
  
  await mkdir(sourceDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
  
  // Create structure recursively
  await createStructure(sourceDir, structure);
  
  return {
    sourceDir,
    outputDir,
    tempBase,
    async cleanup() {
      await rm(tempBase, { recursive: true, force: true });
    }
  };
}

/**
 * Recursively creates directory structure
 * @param {string} basePath - Base directory path
 * @param {Object} structure - Nested structure object
 */
async function createStructure(basePath, structure) {
  for (const [name, content] of Object.entries(structure)) {
    const fullPath = join(basePath, name);
    
    if (typeof content === 'string') {
      // File content
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf8');
    } else if (typeof content === 'object' && content !== null) {
      // Directory with nested content
      await mkdir(fullPath, { recursive: true });
      await createStructure(fullPath, content);
    }
  }
}