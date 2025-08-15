/**
 * Tests for slot fallback content edge cases
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { processHtmlUnified } from '../../src/core/unified-html-processor.js';
import { DependencyTracker } from '../../src/core/dependency-tracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFixturesDir = path.join(__dirname, '../fixtures/slot-fallback-edge-cases');

describe('slot fallback edge cases', () => {
  let sourceDir;
  let layoutsDir;
  let dependencyTracker;
  
  beforeEach(async () => {
    sourceDir = path.join(testFixturesDir, 'src');
    layoutsDir = path.join(sourceDir, '.layouts');
    
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(layoutsDir, { recursive: true });
    
    dependencyTracker = new DependencyTracker();
  });
  
  afterEach(async () => {
    try {
      await fs.rm(testFixturesDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  it('should use fallback when page has only whitespace', async () => {
    const layoutContent = `<html><body><slot>Fallback content</slot></body></html>`;
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    const pageContent = `<div data-layout="_layout.html">   \n\t  </div>`;
    const pagePath = path.join(sourceDir, 'whitespace.html');
    await fs.writeFile(pagePath, pageContent);
    
    const result = await processHtmlUnified(pageContent, pagePath, sourceDir, dependencyTracker, {});
    expect(result.content).toContain('Fallback content');
    expect(result.content).not.toContain('<slot>');
  });
  
  it('should use fallback when page has only comments', async () => {
    const layoutContent = `<html><body><slot>Fallback content</slot></body></html>`;
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    const pageContent = `<div data-layout="_layout.html"><!-- just a comment --></div>`;
    const pagePath = path.join(sourceDir, 'comment.html');
    await fs.writeFile(pagePath, pageContent);
    
    const result = await processHtmlUnified(pageContent, pagePath, sourceDir, dependencyTracker, {});
    expect(result.content).toContain('Fallback content');
    expect(result.content).not.toContain('<slot>');
  });
  
  it('should use page content when it has meaningful content', async () => {
    const layoutContent = `<html><body><slot>Fallback content</slot></body></html>`;
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    const pageContent = `<div data-layout="_layout.html"><p>Real content</p></div>`;
    const pagePath = path.join(sourceDir, 'meaningful.html');
    await fs.writeFile(pagePath, pageContent);
    
    const result = await processHtmlUnified(pageContent, pagePath, sourceDir, dependencyTracker, {});
    expect(result.content).toContain('<p>Real content</p>');
    expect(result.content).not.toContain('Fallback content');
  });
  
  it('should handle mixed comments and whitespace correctly', async () => {
    const layoutContent = `<html><body><slot>Fallback content</slot></body></html>`;
    await fs.writeFile(path.join(layoutsDir, '_layout.html'), layoutContent);
    
    const pageContent = `<div data-layout="_layout.html">
      <!-- comment 1 -->
      \n\t   
      <!-- comment 2 -->
    </div>`;
    const pagePath = path.join(sourceDir, 'mixed.html');
    await fs.writeFile(pagePath, pageContent);
    
    const result = await processHtmlUnified(pageContent, pagePath, sourceDir, dependencyTracker, {});
    expect(result.content).toContain('Fallback content');
    expect(result.content).not.toContain('<slot>');
  });
});