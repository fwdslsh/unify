/**
 * Security tests for path traversal prevention
 */

import { describe, it, expect } from 'bun:test';
import path from 'path';
import { resolveIncludePath, isPathWithinDirectory } from '../../src/utils/path-resolver.js';
import { PathTraversalError } from '../../src/utils/errors.js';
import { crossPlatformPath } from '../test-utils.js';

describe('path-traversal security', () => {
  const testPaths = crossPlatformPath.getSecurityTestPaths();
  const sourceRoot = testPaths.safeSource;
  const currentFile = testPaths.safeFile;
  
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
      // Use platform-appropriate malicious paths - should throw an error
      const maliciousPath = process.platform === 'win32' ? '..\\..\\..\\Windows\\System32\\config' : '../../../etc/passwd';
      expect(() => {
        resolveIncludePath('file', maliciousPath, currentFile, sourceRoot);
      }).toThrow(PathTraversalError);
    });
    
    it('should prevent encoded path traversal attempts', () => {
      // URL encoding should be treated as literal characters, not decoded
      // Since the encoded path contains literal %2e characters, it should resolve safely
      const result = resolveIncludePath('file', testPaths.encodedTraversalPath, currentFile, sourceRoot);
      // This should resolve to a safe path within source root
      expect(crossPlatformPath.pathStartsWith(result, sourceRoot)).toBeTruthy();
    });
    
    it('should allow safe relative paths', () => {
      const result = resolveIncludePath('file', 'safe/header.html', currentFile, sourceRoot);
      expect(crossPlatformPath.pathContains(result, 'safe/header.html')).toBeTruthy();
      expect(crossPlatformPath.pathStartsWith(result, sourceRoot)).toBeTruthy();
    });
    
    it('should allow safe virtual paths', () => {
      const result = resolveIncludePath('virtual', '/includes/header.html', currentFile, sourceRoot);
      expect(crossPlatformPath.pathContains(result, 'includes/header.html')).toBeTruthy();
      expect(crossPlatformPath.pathStartsWith(result, sourceRoot)).toBeTruthy();
    });
  });
  
  describe('isPathWithinDirectory', () => {
    it('should return true for paths within directory', () => {
      const testFile1 = crossPlatformPath.testPath('safe', 'source', 'file.html');
      const testFile2 = crossPlatformPath.testPath('safe', 'source', 'sub', 'file.html');
      const testDir = crossPlatformPath.testPath('safe', 'source');
      expect(isPathWithinDirectory(testFile1, testDir)).toBe(true);
      expect(isPathWithinDirectory(testFile2, testDir)).toBe(true);
    });
    
    it('should return false for paths outside directory', () => {
      const outsideFile1 = testPaths.maliciousSystemPath;
      const outsideFile2 = crossPlatformPath.testPath('safe', 'other', 'file.html');
      const testDir = crossPlatformPath.testPath('safe', 'source');
      expect(isPathWithinDirectory(outsideFile1, testDir)).toBe(false);
      expect(isPathWithinDirectory(outsideFile2, testDir)).toBe(false);
    });
    
    it('should return true for exact directory match', () => {
      const testDir = crossPlatformPath.testPath('safe', 'source');
      expect(isPathWithinDirectory(testDir, testDir)).toBe(true);
    });
    
    it('should handle relative paths correctly', () => {
      const result = isPathWithinDirectory('./src/file.html', './src');
      expect(result).toBe(true);
    });
    
    it('should prevent path traversal in directory check', () => {
      // Create a path that uses .. to try to escape the directory
      const testDir = crossPlatformPath.testPath('safe', 'source');
      const maliciousPath = path.join(testDir, '..', '..', '..', 'etc', 'passwd');
      expect(isPathWithinDirectory(maliciousPath, testDir)).toBe(false);
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
      expect(crossPlatformPath.pathStartsWith(result, sourceRoot)).toBeTruthy();
      expect(crossPlatformPath.pathContains(result, 'includes/header.html')).toBeTruthy(); // Should normalize to single slashes
    });
    
    it('should handle Windows and Unix path separators', () => {
      // This should work on both systems
      const result = resolveIncludePath('file', 'includes/header.html', currentFile, sourceRoot);
      expect(crossPlatformPath.pathContains(result, 'header.html')).toBeTruthy();
    });
  });

  // v2: Removed 'include type validation' tests - type parameter deprecated in v2
  // v2 uses unified path resolution - no distinction between 'file' and 'virtual' types
});