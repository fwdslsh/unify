/**
 * Tests for cross-platform path utilities
 */

import { describe, it, expect } from 'bun:test';
import path from 'path';
import { crossPlatformPath } from '../test-utils.js';

describe('crossPlatformPath utilities', () => {
  describe('normalize', () => {
    it('should normalize backslashes to forward slashes', () => {
      const result = crossPlatformPath.normalize('path\\to\\file.html');
      expect(result).toBe('path/to/file.html');
    });

    it('should handle mixed slashes', () => {
      const result = crossPlatformPath.normalize('path/to\\file.html');
      expect(result).toBe('path/to/file.html');
    });

    it('should handle edge cases', () => {
      expect(crossPlatformPath.normalize('')).toBe('');
      expect(crossPlatformPath.normalize(null)).toBe(null);
      expect(crossPlatformPath.normalize(undefined)).toBe(undefined);
    });
  });

  describe('pathContains', () => {
    it('should detect path segments cross-platform', () => {
      const fullPath = process.platform === 'win32' 
        ? 'C:\\Users\\test\\project\\src\\components\\header.html'
        : '/home/test/project/src/components/header.html';
      
      expect(crossPlatformPath.pathContains(fullPath, 'components/header.html')).toBe(true);
      expect(crossPlatformPath.pathContains(fullPath, 'components\\header.html')).toBe(true);
      expect(crossPlatformPath.pathContains(fullPath, 'nonexistent')).toBe(false);
    });
  });

  describe('pathStartsWith', () => {
    it('should check path prefixes cross-platform', () => {
      const fullPath = process.platform === 'win32'
        ? 'C:\\Users\\test\\project\\src\\components'
        : '/home/test/project/src/components';
      const prefix = process.platform === 'win32'
        ? 'C:\\Users\\test\\project'
        : '/home/test/project';
      
      expect(crossPlatformPath.pathStartsWith(fullPath, prefix)).toBe(true);
    });
  });

  describe('pathEndsWith', () => {
    it('should check path suffixes cross-platform', () => {
      const fullPath = process.platform === 'win32'
        ? 'C:\\Users\\test\\project\\src\\components\\header.html'
        : '/home/test/project/src/components/header.html';
      
      expect(crossPlatformPath.pathEndsWith(fullPath, 'header.html')).toBe(true);
      expect(crossPlatformPath.pathEndsWith(fullPath, 'components/header.html')).toBe(true);
      expect(crossPlatformPath.pathEndsWith(fullPath, 'nonexistent')).toBe(false);
    });
  });

  describe('testPath', () => {
    it('should create platform-appropriate test paths', () => {
      const result = crossPlatformPath.testPath('test-dir', 'file.html');
      
      if (process.platform === 'win32') {
        expect(result.includes('unify-test-paths')).toBe(true);
        expect(result.includes('file.html')).toBe(true);
      } else {
        expect(result.startsWith('/tmp/unify-test-paths')).toBe(true);
        expect(result.endsWith('file.html')).toBe(true);
      }
    });
  });

  describe('createTestDirectories', () => {
    it('should create structured test directory paths', () => {
      const dirs = crossPlatformPath.createTestDirectories('test-project');
      
      expect(dirs.base).toBeTruthy();
      expect(dirs.source).toBeTruthy();
      expect(dirs.output).toBeTruthy();
      expect(dirs.components).toBeTruthy();
      expect(dirs.layouts).toBeTruthy();
      
      expect(path.basename(dirs.source)).toBe('src');
      expect(path.basename(dirs.output)).toBe('dist');
    });
  });

  describe('getSecurityTestPaths', () => {
    it('should return appropriate security test paths for the platform', () => {
      const paths = crossPlatformPath.getSecurityTestPaths();
      
      expect(paths.safeSource).toBeTruthy();
      expect(paths.safeFile).toBeTruthy();
      expect(paths.maliciousSystemPath).toBeTruthy();
      expect(paths.maliciousTraversalPath).toBeTruthy();
      expect(paths.encodedTraversalPath).toBeTruthy();
      
      if (process.platform === 'win32') {
        expect(paths.maliciousSystemPath.includes('Windows')).toBe(true);
        expect(paths.maliciousTraversalPath.includes('..\\')).toBe(true);
      } else {
        expect(paths.maliciousSystemPath.includes('etc')).toBe(true);
        expect(paths.maliciousTraversalPath.includes('../')).toBe(true);
      }
    });
  });
});