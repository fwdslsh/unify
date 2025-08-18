/**
 * Tests for slot fallback content edge cases (v0.6.0 syntax)
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { CascadingImportsProcessor } from '../../src/core/cascading-imports-processor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper functions for temp directories
async function createTempDir() {
  const tempDir = path.join(__dirname, '../fixtures/slot-fallback-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

async function writeTempFile(tempDir, filePath, content) {
  const fullPath = path.join(tempDir, filePath);
  const dirPath = path.dirname(fullPath);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

async function cleanupTempDir(tempDir) {
  try {
    await fs.rm(tempDir, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('slot fallback edge cases', () => {
  let tempDir;
  let processor;
  
  beforeEach(async () => {
    tempDir = await createTempDir();
    processor = new CascadingImportsProcessor(tempDir);
  });
  
  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });
  
  it('should use fallback when page has only whitespace', async () => {
    const layoutContent = `<html><body><slot>Fallback content</slot></body></html>`;
    await writeTempFile(tempDir, '_layout.html', layoutContent);
    
    const pageContent = `<div data-import="_layout.html">   \n\t  </div>`;
    const pagePath = path.join(tempDir, 'whitespace.html');
    
    const result = await processor.processImports(pageContent, pagePath);
    expect(result).toContain('Fallback content');
  });
  
  it('should include comments as content (v0.6.0 behavior)', async () => {
    const layoutContent = `<html><body><slot>Fallback content</slot></body></html>`;
    await writeTempFile(tempDir, '_layout.html', layoutContent);
    
    const pageContent = `<div data-import="_layout.html"><!-- just a comment --></div>`;
    const pagePath = path.join(tempDir, 'comment.html');
    
    const result = await processor.processImports(pageContent, pagePath);
    expect(result).toContain('<!-- just a comment -->');
    expect(result).not.toContain('Fallback content');
  });
  
  it('should use page content when it has meaningful content', async () => {
    const layoutContent = `<html><body><slot>Fallback content</slot></body></html>`;
    await writeTempFile(tempDir, '_layout.html', layoutContent);
    
    const pageContent = `<div data-import="_layout.html"><p>Real content</p></div>`;
    const pagePath = path.join(tempDir, 'meaningful.html');
    
    const result = await processor.processImports(pageContent, pagePath);
    expect(result).toContain('<p>Real content</p>');
    expect(result).not.toContain('Fallback content');
  });
  
  it('should include mixed comments and whitespace as content', async () => {
    const layoutContent = `<html><body><slot>Fallback content</slot></body></html>`;
    await writeTempFile(tempDir, '_layout.html', layoutContent);
    
    const pageContent = `<div data-import="_layout.html">
      <!-- comment 1 -->
      \n\t   
      <!-- comment 2 -->
    </div>`;
    const pagePath = path.join(tempDir, 'mixed.html');
    
    const result = await processor.processImports(pageContent, pagePath);
    expect(result).toContain('<!-- comment 1 -->');
    expect(result).toContain('<!-- comment 2 -->');
    expect(result).not.toContain('Fallback content');
  });
});