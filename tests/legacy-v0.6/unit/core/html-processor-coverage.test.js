/**
 * HTML Processor Coverage Tests - Cleaned Version
 * 
 * Tests for UnifyProcessor methods that actually exist
 */

import { describe, test, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { UnifyProcessor } from '../../../src/core/html-processor.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('UnifyProcessor Coverage Tests', () => {
  let testDir;
  let processor;
  let mockLogger;

  beforeEach(() => {
    testDir = `/tmp/unify-processor-coverage-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, '_includes'), { recursive: true });
    
    mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {})
    };
  });

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Constructor Coverage', () => {
    it('should handle UnifyProcessor constructor with options', () => {
      const options = {
        logger: mockLogger,
        baseDir: testDir
      };
      const processor = new UnifyProcessor(options);
      
      expect(processor.logger).toBeDefined();
      expect(typeof processor.logger.info).toBe('function');
    });

    it('should handle minimal UnifyProcessor options', () => {
      const processor = new UnifyProcessor({ logger: mockLogger, baseDir: testDir });
      
      expect(processor.logger).toBeDefined();
    });
  });

  describe('analyzeUnifyElements Method Coverage', () => {
    it('should analyze HTML for unify elements and return object with properties', async () => {
      processor = new UnifyProcessor({ logger: mockLogger, baseDir: testDir });
      
      const htmlWithUnify = `
        <html data-unify="layout.html">
          <body>
            <div data-unify="header.html">Header</div>
            <main>Content</main>
          </body>
        </html>
      `;
      
      const result = await processor.analyzeUnifyElements(htmlWithUnify);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.hasUnifyElement).toBe(true);
    });

    it('should detect layout usage in HTML', async () => {
      processor = new UnifyProcessor({ logger: mockLogger, baseDir: testDir });
      
      const htmlWithLayout = '<html data-unify="layout.html"><body>Content</body></html>';
      
      const result = await processor.analyzeUnifyElements(htmlWithLayout);
      
      expect(result).toBeDefined();
      expect(result.usesLayout).toBe(true);
    });

    it('should handle HTML without unify elements', async () => {
      processor = new UnifyProcessor({ logger: mockLogger, baseDir: testDir });
      
      const regularHtml = '<html><body><h1>Regular HTML</h1></body></html>';
      
      const result = await processor.analyzeUnifyElements(regularHtml);
      
      expect(result).toBeDefined();
      expect(result.hasUnifyElement).toBe(false);
    });
  });

  describe('processLayout Method Coverage', () => {
    it('should process layout with basic HTML', async () => {
      processor = new UnifyProcessor({ logger: mockLogger, baseDir: testDir });
      
      const html = '<html><body>Simple content</body></html>';
      
      const result = await processor.processLayout(html, join(testDir, 'test.html'));
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('Simple content');
    });

    it('should handle empty HTML gracefully', async () => {
      processor = new UnifyProcessor({ logger: mockLogger, baseDir: testDir });
      
      const result = await processor.processLayout('', join(testDir, 'empty.html'));
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('mergeIntoLayout Method Coverage', () => {
    it('should handle layout merging with various content types', async () => {
      processor = new UnifyProcessor({ logger: mockLogger, baseDir: testDir });
      
      const layoutHtml = `
        <html>
          <head><title>Layout Title</title></head>
          <body>
            <header class="unify-header">Layout Header</header>
            <main class="unify-content">CONTENT_PLACEHOLDER</main>
            <footer class="unify-footer">Layout Footer</footer>
          </body>
        </html>
      `;
      
      const pageHtml = `
        <html>
          <head><title>Page Title</title></head>
          <body>
            <div class="unify-content">Page content here</div>
          </body>
        </html>
      `;
      
      const result = await processor.mergeIntoLayout(layoutHtml, pageHtml);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('Page content here');
    });

    it('should handle merging with site content', async () => {
      processor = new UnifyProcessor({ logger: mockLogger, baseDir: testDir });
      
      const layoutHtml = '<html><body><main class="unify-content">CONTENT</main></body></html>';
      const pageHtml = '<div class="unify-content">Page</div>';
      const siteContentHtml = '<div class="site-info">Site content</div>';
      
      const result = await processor.mergeIntoLayout(layoutHtml, pageHtml, siteContentHtml);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('processComponentImports Method Coverage', () => {
    it('should return input HTML when no components to process', async () => {
      processor = new UnifyProcessor({ logger: mockLogger, baseDir: testDir });
      
      const htmlWithoutImports = '<html><body><h1>No imports</h1></body></html>';
      
      const result = await processor.processComponentImports(htmlWithoutImports);
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('No imports');
    });
  });
});