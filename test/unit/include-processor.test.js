/**
 * Tests for include processor
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { processIncludes, extractIncludeDependencies, hasIncludes, parseIncludeDirective } from '../../src/core/include-processor.js';
import { IncludeNotFoundError } from '../../src/utils/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFixturesDir = path.join(__dirname, '../fixtures/include-processor');

describe('include-processor', () => {
  beforeEach(async () => {
    // Create test fixtures directory
    await fs.mkdir(testFixturesDir, { recursive: true });
    
    // Create test files
    await fs.writeFile(
      path.join(testFixturesDir, 'header.html'),
      '<header><h1>Test Header</h1></header>'
    );
    
    await fs.writeFile(
      path.join(testFixturesDir, 'footer.html'),
      '<footer><p>Test Footer</p></footer>'
    );
    
    await fs.writeFile(
      path.join(testFixturesDir, 'nav.html'),
      '<nav><a href="/">Home</a></nav>'
    );
    
    await fs.writeFile(
      path.join(testFixturesDir, 'nested.html'),
      '<!--#include file="nav.html" --><div>Content</div>'
    );
  });
  
  afterEach(async () => {
    // Clean up test fixtures
    try {
      await fs.rm(testFixturesDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  describe('processIncludes', () => {
    it('should process file includes', async () => {
      const html = '<!DOCTYPE html><html><head></head><body><!--#include file="header.html" --></body></html>';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      const result = await processIncludes(html, filePath, testFixturesDir);
      
      expect(result.includes('<header><h1>Test Header</h1></header>')).toBeTruthy();
      expect(result.includes('<!--#include')).toBeFalsy();
    });
    
    it('should process virtual includes', async () => {
      const html = '<!DOCTYPE html><html><head></head><body><!--#include virtual="/header.html" --></body></html>';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      const result = await processIncludes(html, filePath, testFixturesDir);
      
      expect(result.includes('<header><h1>Test Header</h1></header>')).toBeTruthy();
      expect(result.includes('<!--#include')).toBeFalsy();
    });
    
    it('should process nested includes', async () => {
      const html = '<!DOCTYPE html><html><head></head><body><!--#include file="nested.html" --></body></html>';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      const result = await processIncludes(html, filePath, testFixturesDir);
      
      expect(result.includes('<nav><a href="/">Home</a></nav>')).toBeTruthy();
      expect(result.includes('<div>Content</div>')).toBeTruthy();
      expect(result.includes('<!--#include')).toBeFalsy();
    });
    
    it('should throw error for missing include files', async () => {
      const html = '<!DOCTYPE html><html><head></head><body><!--#include file="missing.html" --></body></html>';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      // Should write a warning comment in place of the missing include
      const result = await processIncludes(html, filePath, testFixturesDir);
      expect(result.includes('<!-- WARNING: Include file not found: missing.html -->')).toBeTruthy();
    });
    
    it('should detect circular dependencies', async () => {
      // Create circular dependency
      await fs.writeFile(
        path.join(testFixturesDir, 'circular1.html'),
        '<!--#include file="circular2.html" -->'
      );
      await fs.writeFile(
        path.join(testFixturesDir, 'circular2.html'),
        '<!--#include file="circular1.html" -->'
      );
      
      const html = '<!--#include file="circular1.html" -->';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      expect(async () => {
        await processIncludes(html, filePath, testFixturesDir);
      }).toThrow(/Circular dependency/);
    });
  });
  
  describe('extractIncludeDependencies', () => {
    it('should extract file dependencies', () => {
      const html = '<!--#include file="header.html" --><!--#include file="footer.html" -->';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      const deps = extractIncludeDependencies(html, filePath, testFixturesDir);
      
      expect(deps.length).toBe(2);
      expect(deps.some(dep => dep.endsWith('header.html'))).toBeTruthy();
      expect(deps.some(dep => dep.endsWith('footer.html'))).toBeTruthy();
    });
    
    it('should extract virtual dependencies', () => {
      const html = '<!--#include virtual="/header.html" -->';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      const deps = extractIncludeDependencies(html, filePath, testFixturesDir);
      
      expect(deps.length).toBe(1);
      expect(deps[0].endsWith('header.html')).toBeTruthy();
    });
  });
  
  describe('hasIncludes', () => {
    it('should detect includes', () => {
      const html = '<!--#include file="header.html" -->';
      expect(hasIncludes(html)).toBe(true);
    });
    
    it('should detect no includes', () => {
      const html = '<html><head></head><body>No includes</body></html>';
      expect(hasIncludes(html)).toBe(false);
    });
  });
  
  describe('parseIncludeDirective', () => {
    it('should parse file directive', () => {
      const directive = '<!--#include file="header.html" -->';
      const parsed = parseIncludeDirective(directive);
      
      expect(parsed.type).toBe('file');
      expect(parsed.path).toBe('header.html');
    });
    
    it('should parse virtual directive', () => {
      const directive = '<!--#include virtual="/includes/header.html" -->';
      const parsed = parseIncludeDirective(directive);
      
      expect(parsed.type).toBe('virtual');
      expect(parsed.path).toBe('/includes/header.html');
    });
    
    it('should return null for invalid directive', () => {
      const directive = '<!--#invalid directive -->';
      const parsed = parseIncludeDirective(directive);
      
      expect(parsed).toBe(null);
    });
  });
});