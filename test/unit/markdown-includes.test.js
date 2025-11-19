/**
 * Tests for markdown includes support
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { processIncludes } from '../../src/core/include-processor.js';
import { processHtmlUnified } from '../../src/core/unified-html-processor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFixturesDir = path.join(__dirname, '../fixtures/markdown-includes');

describe('markdown-includes', () => {
  beforeEach(async () => {
    // Create test fixtures directory
    await fs.mkdir(testFixturesDir, { recursive: true });
    
    // Create test markdown files
    await fs.writeFile(
      path.join(testFixturesDir, 'toc.md'),
      `# Table of Contents

- [Home](/index.html)
- [About](/about.html)
- [Contact](/contact.html)

This is a simple TOC.`
    );
    
    await fs.writeFile(
      path.join(testFixturesDir, 'menu.md'),
      `---
title: "Navigation Menu"
description: "Site navigation"
---

## Navigation

* [Docs](/docs/)
* [Blog](/blog/)
* [Help](/help/)`
    );
    
    // Create a subdirectory for virtual includes
    await fs.mkdir(path.join(testFixturesDir, 'includes'), { recursive: true });
    await fs.writeFile(
      path.join(testFixturesDir, 'includes', 'sidebar.md'),
      `## Quick Links

- [Download](#download)
- [Documentation](#docs)
- [Support](#support)`
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
  
  describe('SSI-style markdown includes', () => {
    it('should process file include of markdown file', async () => {
      const html = '<!DOCTYPE html><html><head></head><body><include src="toc.md" /></body></html>';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      const result = await processIncludes(html, filePath, testFixturesDir);
      
      // Should include processed markdown as HTML
      expect(result.includes('<h1>Table of Contents</h1>')).toBeTruthy();
      expect(result.includes('<li><a href="/index.html">Home</a></li>')).toBeTruthy();
      expect(result.includes('<li><a href="/about.html">About</a></li>')).toBeTruthy();
      expect(result.includes('<p>This is a simple TOC.</p>')).toBeTruthy();
      expect(result.includes('<!--#include')).toBeFalsy();
    });
    
    it('should process virtual include of markdown file', async () => {
      const html = '<!DOCTYPE html><html><head></head><body><include src="/includes/sidebar.md" /></body></html>';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      const result = await processIncludes(html, filePath, testFixturesDir);
      
      // Should include processed markdown as HTML
      expect(result.includes('<h2>Quick Links</h2>')).toBeTruthy();
      expect(result.includes('<li><a href="#download">Download</a></li>')).toBeTruthy();
      expect(result.includes('<li><a href="#docs">Documentation</a></li>')).toBeTruthy();
      expect(result.includes('<li><a href="#support">Support</a></li>')).toBeTruthy();
      expect(result.includes('<!--#include')).toBeFalsy();
    });
    
    it('should process markdown with frontmatter correctly', async () => {
      const html = '<!DOCTYPE html><html><head></head><body><include src="menu.md" /></body></html>';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      const result = await processIncludes(html, filePath, testFixturesDir);
      
      // Should include processed markdown as HTML (without frontmatter)
      expect(result.includes('<h2>Navigation</h2>')).toBeTruthy();
      expect(result.includes('<li><a href="/docs/">Docs</a></li>')).toBeTruthy();
      expect(result.includes('<li><a href="/blog/">Blog</a></li>')).toBeTruthy();
      expect(result.includes('<li><a href="/help/">Help</a></li>')).toBeTruthy();
      
      // Should not include frontmatter in output
      expect(result.includes('title:')).toBeFalsy();
      expect(result.includes('description:')).toBeFalsy();
      expect(result.includes('---')).toBeFalsy();
      expect(result.includes('<!--#include')).toBeFalsy();
    });
  });
  
  describe('DOM-style markdown includes', () => {
    it('should process self-closing include of markdown file', async () => {
      const html = '<!DOCTYPE html><html><head></head><body><include src="toc.md" /></body></html>';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      const config = { failFast: false };
      const result = await processHtmlUnified(html, filePath, testFixturesDir, null, config);
      
      const processedContent = result.content || result;
      
      // Should include processed markdown as HTML
      expect(processedContent.includes('<h1>Table of Contents</h1>')).toBeTruthy();
      expect(processedContent.includes('<li><a href="/index.html">Home</a></li>')).toBeTruthy();
      expect(processedContent.includes('<li><a href="/about.html">About</a></li>')).toBeTruthy();
      expect(processedContent.includes('<p>This is a simple TOC.</p>')).toBeTruthy();
      expect(processedContent.includes('<include')).toBeFalsy();
    });
    
    it('should process include element with markdown file', async () => {
      const html = '<!DOCTYPE html><html><head></head><body><include src="/includes/sidebar.md"></include></body></html>';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      const config = { failFast: false };
      const result = await processHtmlUnified(html, filePath, testFixturesDir, null, config);
      
      const processedContent = result.content || result;
      
      // Should include processed markdown as HTML
      expect(processedContent.includes('<h2>Quick Links</h2>')).toBeTruthy();
      expect(processedContent.includes('<li><a href="#download">Download</a></li>')).toBeTruthy();
      expect(processedContent.includes('<li><a href="#docs">Documentation</a></li>')).toBeTruthy();
      expect(processedContent.includes('<li><a href="#support">Support</a></li>')).toBeTruthy();
      expect(processedContent.includes('<include')).toBeFalsy();
    });
    
    it('should process markdown with frontmatter in DOM include', async () => {
      const html = '<!DOCTYPE html><html><head></head><body><include src="menu.md"></include></body></html>';
      const filePath = path.join(testFixturesDir, 'test.html');
      
      const config = { failFast: false };
      const result = await processHtmlUnified(html, filePath, testFixturesDir, null, config);
      
      const processedContent = result.content || result;
      
      // Should include processed markdown as HTML (without frontmatter)
      expect(processedContent.includes('<h2>Navigation</h2>')).toBeTruthy();
      expect(processedContent.includes('<li><a href="/docs/">Docs</a></li>')).toBeTruthy();
      expect(processedContent.includes('<li><a href="/blog/">Blog</a></li>')).toBeTruthy();
      expect(processedContent.includes('<li><a href="/help/">Help</a></li>')).toBeTruthy();
      
      // Should not include frontmatter in output
      expect(processedContent.includes('title:')).toBeFalsy();
      expect(processedContent.includes('description:')).toBeFalsy();
      expect(processedContent.includes('---')).toBeFalsy();
      expect(processedContent.includes('<include')).toBeFalsy();
    });
  });
});