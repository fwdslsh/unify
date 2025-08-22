/**
 * Custom assertions and test utilities
 * Provides reusable test assertions for common patterns
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { expect } from 'bun:test';

/**
 * Assert CLI command succeeded (exit code 0)
 * @param {Object} result - CLI result from runCLI
 */
export function expectBuildSuccess(result) {
  expect(result.code).toBe(0);
  expect(result.stderr).not.toContain('Error:');
  expect(result.stderr).not.toContain('Fatal:');
}

/**
 * Assert CLI command failed with specific exit code
 * @param {Object} result - CLI result from runCLI  
 * @param {number} expectedCode - Expected exit code (default: 1)
 */
export function expectBuildFailure(result, expectedCode = 1) {
  expect(result.code).toBe(expectedCode);
}

/**
 * Assert CLI output contains expected patterns
 * @param {Object} result - CLI result from runCLI
 * @param {string[]} patterns - Patterns that should appear in stdout
 */
export function expectOutputContains(result, patterns) {
  const output = result.stdout + '\n' + result.stderr;
  for (const pattern of patterns) {
    expect(output).toContain(pattern);
  }
}

/**
 * Assert CLI output does not contain patterns
 * @param {Object} result - CLI result from runCLI
 * @param {string[]} patterns - Patterns that should NOT appear in output
 */
export function expectOutputNotContains(result, patterns) {
  const output = result.stdout + '\n' + result.stderr;
  for (const pattern of patterns) {
    expect(output).not.toContain(pattern);
  }
}

/**
 * Assert file exists in output directory
 * @param {string} outputDir - Output directory path
 * @param {string} filePath - Relative file path to check
 */
export async function expectFileExists(outputDir, filePath) {
  const fullPath = join(outputDir, filePath);
  try {
    await stat(fullPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Expected file to exist: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Assert file does not exist in output directory
 * @param {string} outputDir - Output directory path
 * @param {string} filePath - Relative file path to check
 */
export async function expectFileNotExists(outputDir, filePath) {
  const fullPath = join(outputDir, filePath);
  try {
    await stat(fullPath);
    throw new Error(`Expected file to not exist: ${filePath}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, which is what we want
      return;
    }
    throw error;
  }
}

/**
 * Assert file content matches expected content
 * @param {string} outputDir - Output directory path
 * @param {string} filePath - Relative file path
 * @param {string} expectedContent - Expected content
 */
export async function expectFileContent(outputDir, filePath, expectedContent) {
  const fullPath = join(outputDir, filePath);
  const content = await readFile(fullPath, 'utf8');
  expect(content.trim()).toBe(expectedContent.trim());
}

/**
 * Assert file content contains specific patterns
 * @param {string} outputDir - Output directory path
 * @param {string} filePath - Relative file path
 * @param {string[]} patterns - Patterns that should appear in file
 */
export async function expectFileContentContains(outputDir, filePath, patterns) {
  const fullPath = join(outputDir, filePath);
  const content = await readFile(fullPath, 'utf8');
  
  for (const pattern of patterns) {
    expect(content).toContain(pattern);
  }
}

/**
 * Assert file content does not contain patterns
 * @param {string} outputDir - Output directory path
 * @param {string} filePath - Relative file path
 * @param {string[]} patterns - Patterns that should NOT appear in file
 */
export async function expectFileContentNotContains(outputDir, filePath, patterns) {
  const fullPath = join(outputDir, filePath);
  const content = await readFile(fullPath, 'utf8');
  
  for (const pattern of patterns) {
    expect(content).not.toContain(pattern);
  }
}

/**
 * Assert HTML is well-formed and valid
 * @param {string} html - HTML content to validate
 */
export function expectValidHtml(html) {
  // Basic HTML validation checks
  expect(html).toContain('<!DOCTYPE');
  expect(html).toContain('<html');
  expect(html).toContain('</html>');
  expect(html).toContain('<head');
  expect(html).toContain('</head>');
  expect(html).toContain('<body');
  expect(html).toContain('</body>');
  
  // Check for unclosed tags (basic check)
  const openTags = (html.match(/<[^/][^>]*>/g) || []).length;
  const closeTags = (html.match(/<\/[^>]*>/g) || []).length;
  const selfClosing = (html.match(/<[^>]*\/>/g) || []).length;
  
  // Allow for some variance in self-closing tags and void elements
  expect(Math.abs(openTags - closeTags - selfClosing)).toBeLessThanOrEqual(10);
}

/**
 * Assert HTML head contains specific elements
 * @param {string} html - HTML content
 * @param {Object} expectedElements - Expected head elements
 */
export function expectHeadContains(html, expectedElements) {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/);
  if (!headMatch) {
    throw new Error('No <head> element found in HTML');
  }
  
  const headContent = headMatch[1];
  
  if (expectedElements.title) {
    expect(headContent).toContain(`<title>${expectedElements.title}</title>`);
  }
  
  if (expectedElements.meta) {
    for (const meta of expectedElements.meta) {
      const metaPattern = `<meta[^>]*name="${meta.name}"[^>]*content="${meta.content}"`;
      expect(headContent).toMatch(new RegExp(metaPattern));
    }
  }
  
  if (expectedElements.links) {
    for (const link of expectedElements.links) {
      const linkPattern = `<link[^>]*rel="${link.rel}"[^>]*href="${link.href}"`;
      expect(headContent).toMatch(new RegExp(linkPattern));
    }
  }
}

/**
 * Assert directory structure matches expected structure
 * @param {string} baseDir - Base directory to check
 * @param {string[]} expectedFiles - Array of expected relative file paths
 */
export async function expectDirectoryStructure(baseDir, expectedFiles) {
  const actualFiles = await getFileList(baseDir);
  
  for (const expectedFile of expectedFiles) {
    expect(actualFiles).toContain(expectedFile);
  }
}

/**
 * Assert directory does not contain specific files
 * @param {string} baseDir - Base directory to check
 * @param {string[]} unexpectedFiles - Array of files that should not exist
 */
export async function expectDirectoryNotContains(baseDir, unexpectedFiles) {
  const actualFiles = await getFileList(baseDir);
  
  for (const unexpectedFile of unexpectedFiles) {
    expect(actualFiles).not.toContain(unexpectedFile);
  }
}

/**
 * Assert build performance is within acceptable bounds
 * @param {number} duration - Build duration in milliseconds
 * @param {number} maxDuration - Maximum acceptable duration in milliseconds
 */
export function expectPerformance(duration, maxDuration) {
  expect(duration).toBeLessThan(maxDuration);
}

/**
 * Assert memory usage is within bounds
 * @param {number} memoryUsed - Memory used in bytes
 * @param {number} maxMemory - Maximum acceptable memory in bytes
 */
export function expectMemoryUsage(memoryUsed, maxMemory) {
  expect(memoryUsed).toBeLessThan(maxMemory);
}

/**
 * Assert dry run output shows correct classification
 * @param {Object} result - CLI result from dry run
 * @param {Object} expectedClassifications - Expected file classifications
 */
export function expectDryRunClassification(result, expectedClassifications) {
  expectBuildSuccess(result);
  
  const output = result.stdout + '\n' + result.stderr;
  
  for (const [fileName, expectedDecision] of Object.entries(expectedClassifications)) {
    const pattern = new RegExp(`\\[${expectedDecision.toUpperCase()}\\].*${fileName}`);
    expect(output).toMatch(pattern);
  }
}

/**
 * Assert slot injection worked correctly
 * @param {string} html - Processed HTML
 * @param {Object} expectedSlots - Expected slot content
 */
export function expectSlotInjection(html, expectedSlots) {
  // Check that slot containers are removed
  expect(html).not.toContain('<slot');
  expect(html).not.toContain('data-target=');
  expect(html).not.toContain('data-import=');
  
  // Check that expected content is present
  for (const [slotName, expectedContent] of Object.entries(expectedSlots)) {
    expect(html).toContain(expectedContent);
  }
}

/**
 * Get recursive file list from directory
 * @param {string} dir - Directory to scan
 * @param {string} basePath - Base path for relative paths
 * @returns {Promise<string[]>} Array of relative file paths
 */
async function getFileList(dir, basePath = dir) {
  const files = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = fullPath.replace(basePath + '/', '');
      
      if (entry.isDirectory()) {
        const subFiles = await getFileList(fullPath, basePath);
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  
  return files;
}