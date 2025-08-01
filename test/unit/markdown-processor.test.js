/**
 * Tests for markdown processor functions
 */

import { describe, it, expect } from 'bun:test';
import { hasHtmlElement } from '../../src/core/markdown-processor.js';

describe('markdown processor', () => {
  describe('hasHtmlElement', () => {
    it('should detect html element in content', () => {
      const contentWithHtml = '<html><head><title>Test</title></head><body><p>Content</p></body></html>';
      expect(hasHtmlElement(contentWithHtml)).toBe(true);
    });
    
    it('should detect html element with attributes', () => {
      const contentWithHtml = '<html lang="en" class="theme-dark"><head><title>Test</title></head><body><p>Content</p></body></html>';
      expect(hasHtmlElement(contentWithHtml)).toBe(true);
    });
    
    it('should detect html element case insensitive', () => {
      const contentWithHtml = '<HTML><HEAD><TITLE>Test</TITLE></HEAD><BODY><P>Content</P></BODY></HTML>';
      expect(hasHtmlElement(contentWithHtml)).toBe(true);
    });
    
    it('should not detect html element when not present', () => {
      const contentWithoutHtml = '<div><h1>Title</h1><p>Some content</p></div>';
      expect(hasHtmlElement(contentWithoutHtml)).toBe(false);
    });
    
    it('should not detect html element in plain text', () => {
      const plainText = 'This is just plain text with no HTML elements';
      expect(hasHtmlElement(plainText)).toBe(false);
    });
    
    it('should not detect partial html matches', () => {
      const partialMatch = '<h1>html is mentioned here</h1>';
      expect(hasHtmlElement(partialMatch)).toBe(false);
    });
    
    it('should handle empty content', () => {
      expect(hasHtmlElement('')).toBe(false);
    });
  });
});