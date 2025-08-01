/**
 * Security tests for path traversal prevention
 */

import { describe, it, expect } from 'bun:test';
import { resolveIncludePath, isPathWithinDirectory } from '../../src/utils/path-resolver.js';
import { PathTraversalError } from '../../src/utils/errors.js';

describe('path-traversal security', () => {
  const sourceRoot = '/safe/source';
  const currentFile = '/safe/source/index.html';
  
  describe('resolveIncludePath', () => {
    it('should prevent file include path traversal with ../', () => {
      expect(() => {
        resolveIncludePath('file', '../../../etc/passwd', currentFile, sourceRoot);
      }).toThrow(PathTraversalError);
    });
    
    it('should prevent virtual include path traversal with ../', () => {
      expect(() => {
        resolveIncludePath('virtual', '/../../../etc/passwd', currentFile, sourceRoot);
      }).toThrow(PathTraversalError);
    });
    
    it('should prevent Windows-style path traversal', () => {
      // On Unix systems, backslashes are treated as literal characters, not path separators
      // But we should still prevent obvious traversal attempts
      const result = resolveIncludePath('file', '..\\..\\..\\windows\\system32\\config', currentFile, sourceRoot);
      // This should resolve to a safe path within source root
      expect(result.startsWith(sourceRoot)).toBeTruthy();
    });
    
    it('should prevent encoded path traversal attempts', () => {
      // URL encoding should be treated as literal characters, not decoded
      const result = resolveIncludePath('file', '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd', currentFile, sourceRoot);
      // This should resolve to a safe path within source root
      expect(result.startsWith(sourceRoot)).toBeTruthy();
    });
    
    it('should allow safe relative paths', () => {
      const result = resolveIncludePath('file', 'safe/header.html', currentFile, sourceRoot);
      expect(result.includes('safe/header.html')).toBeTruthy();
      expect(result.startsWith(sourceRoot)).toBeTruthy();
    });
    
    it('should allow safe virtual paths', () => {
      const result = resolveIncludePath('virtual', '/includes/header.html', currentFile, sourceRoot);
      expect(result.includes('includes/header.html')).toBeTruthy();
      expect(result.startsWith(sourceRoot)).toBeTruthy();
    });
  });
  
  describe('isPathWithinDirectory', () => {
    it('should return true for paths within directory', () => {
      expect(isPathWithinDirectory('/safe/source/file.html', '/safe/source')).toBe(true);
      expect(isPathWithinDirectory('/safe/source/sub/file.html', '/safe/source')).toBe(true);
    });
    
    it('should return false for paths outside directory', () => {
      expect(isPathWithinDirectory('/etc/passwd', '/safe/source')).toBe(false);
      expect(isPathWithinDirectory('/safe/other/file.html', '/safe/source')).toBe(false);
    });
    
    it('should return true for exact directory match', () => {
      expect(isPathWithinDirectory('/safe/source', '/safe/source')).toBe(true);
    });
    
    it('should handle relative paths correctly', () => {
      const result = isPathWithinDirectory('./src/file.html', './src');
      expect(result).toBe(true);
    });
    
    it('should prevent path traversal in directory check', () => {
      expect(isPathWithinDirectory('/safe/source/../../../etc/passwd', '/safe/source')).toBe(false);
    });
  });
  
  describe('edge cases', () => {
    it('should handle empty paths', () => {
      expect(() => {
        resolveIncludePath('file', '', currentFile, sourceRoot);
      }).toThrow();
    });
    
    it('should handle null/undefined paths', () => {
      expect(() => {
        resolveIncludePath('file', null, currentFile, sourceRoot);
      }).toThrow();
    });
    
    it('should handle paths with multiple slashes', () => {
      const result = resolveIncludePath('virtual', '//includes///header.html', currentFile, sourceRoot);
      expect(result.startsWith(sourceRoot)).toBeTruthy();
      expect(result.includes('includes/header.html')).toBeTruthy(); // Should normalize to single slashes
    });
    
    it('should handle Windows and Unix path separators', () => {
      // This should work on both systems
      const result = resolveIncludePath('file', 'includes/header.html', currentFile, sourceRoot);
      expect(result.includes('header.html')).toBeTruthy();
    });
  });
  
  describe('include type validation', () => {
    it('should reject invalid include types', () => {
      expect(() => {
        resolveIncludePath('invalid', 'header.html', currentFile, sourceRoot);
      }).toThrow(/Invalid include type/);
    });
    
    it('should only accept file and virtual types', () => {
      // These should work
      const fileResult = resolveIncludePath('file', 'header.html', currentFile, sourceRoot);
      const virtualResult = resolveIncludePath('virtual', '/header.html', currentFile, sourceRoot);
      
      expect(fileResult.includes('header.html')).toBeTruthy();
      expect(virtualResult.includes('header.html')).toBeTruthy();
    });
  });
});