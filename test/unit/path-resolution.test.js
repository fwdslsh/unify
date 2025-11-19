/**
 * Tests for unified path resolution (v2)
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolvePath,
  validatePath,
  resolveAndValidate,
  isPathWithinDirectory
} from '../../src/utils/path-resolver.js';
import { PathTraversalError } from '../../src/utils/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFixturesDir = path.join(__dirname, '../fixtures/path-resolution');

describe('Unified Path Resolution (v2)', () => {
  beforeEach(async () => {
    // Create test fixtures directory
    await fs.mkdir(testFixturesDir, { recursive: true });
    await fs.mkdir(path.join(testFixturesDir, 'layouts'), { recursive: true });
    await fs.mkdir(path.join(testFixturesDir, 'pages'), { recursive: true });

    // Create test files
    await fs.writeFile(
      path.join(testFixturesDir, 'layouts', 'main.html'),
      '<html><body><slot></slot></body></html>'
    );

    await fs.writeFile(
      path.join(testFixturesDir, 'pages', 'index.html'),
      '<h1>Home</h1>'
    );
  });

  afterEach(async () => {
    // Clean up test fixtures
    await fs.rm(testFixturesDir, { recursive: true, force: true });
  });

  describe('resolvePath()', () => {
    it('should resolve absolute paths from source root', () => {
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');
      const result = resolvePath('/layouts/main.html', currentFile, testFixturesDir);

      expect(result).toBe(path.join(testFixturesDir, 'layouts', 'main.html'));
    });

    it('should resolve relative paths from current file directory', () => {
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');
      const result = resolvePath('../layouts/main.html', currentFile, testFixturesDir);

      expect(result).toBe(path.join(testFixturesDir, 'layouts', 'main.html'));
    });

    it('should resolve same-directory relative paths', () => {
      const currentFile = path.join(testFixturesDir, 'layouts', 'main.html');
      const result = resolvePath('./other.html', currentFile, testFixturesDir);

      expect(result).toBe(path.join(testFixturesDir, 'layouts', 'other.html'));
    });

    it('should handle absolute paths with multiple leading slashes', () => {
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');
      const result = resolvePath('///layouts/main.html', currentFile, testFixturesDir);

      expect(result).toBe(path.join(testFixturesDir, 'layouts', 'main.html'));
    });

    it('should throw PathTraversalError for paths outside source root', () => {
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');

      expect(() => {
        resolvePath('../../outside.html', currentFile, testFixturesDir);
      }).toThrow(PathTraversalError);
    });

    it('should throw error for empty path', () => {
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');

      expect(() => {
        resolvePath('', currentFile, testFixturesDir);
      }).toThrow('Path must be a non-empty string');
    });

    it('should throw error for null path', () => {
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');

      expect(() => {
        resolvePath(null, currentFile, testFixturesDir);
      }).toThrow('Path must be a non-empty string');
    });
  });

  describe('isPathWithinDirectory()', () => {
    it('should return true for path within directory', () => {
      const filePath = path.join(testFixturesDir, 'pages', 'index.html');
      const result = isPathWithinDirectory(filePath, testFixturesDir);

      expect(result).toBe(true);
    });

    it('should return true for path equal to directory', () => {
      const result = isPathWithinDirectory(testFixturesDir, testFixturesDir);

      expect(result).toBe(true);
    });

    it('should return false for path outside directory', () => {
      const outsidePath = path.join(__dirname, '../../src/core');
      const result = isPathWithinDirectory(outsidePath, testFixturesDir);

      expect(result).toBe(false);
    });

    it('should handle relative paths correctly', () => {
      const filePath = path.join(testFixturesDir, 'pages', 'index.html');
      const result = isPathWithinDirectory(filePath, testFixturesDir);

      expect(result).toBe(true);
    });
  });

  describe('validatePath()', () => {
    it('should return true for valid paths', () => {
      const filePath = path.join(testFixturesDir, 'pages', 'index.html');
      const result = validatePath(filePath, testFixturesDir);

      expect(result).toBe(true);
    });

    it('should throw PathTraversalError for invalid paths', () => {
      const outsidePath = path.join(__dirname, '../../src/core');

      expect(() => {
        validatePath(outsidePath, testFixturesDir);
      }).toThrow(PathTraversalError);
    });
  });

  describe('resolveAndValidate()', () => {
    it('should resolve and validate in one call', () => {
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');
      const result = resolveAndValidate('/layouts/main.html', currentFile, testFixturesDir);

      expect(result).toBe(path.join(testFixturesDir, 'layouts', 'main.html'));
    });

    it('should throw PathTraversalError for paths outside source root', () => {
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');

      expect(() => {
        resolveAndValidate('../../outside.html', currentFile, testFixturesDir);
      }).toThrow(PathTraversalError);
    });
  });

  describe('v2 Path Resolution Rules', () => {
    it('should follow rule 1: paths starting with / are absolute from source root', () => {
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');
      const result = resolvePath('/layouts/main.html', currentFile, testFixturesDir);

      // Should resolve to sourceRoot + path (not relative to current file)
      expect(result).toBe(path.join(testFixturesDir, 'layouts', 'main.html'));
    });

    it('should follow rule 2: paths without / are relative to current file', () => {
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');
      const result = resolvePath('./header.html', currentFile, testFixturesDir);

      // Should resolve relative to pages directory, not source root
      expect(result).toBe(path.join(testFixturesDir, 'pages', 'header.html'));
    });

    it('should follow rule 3: all paths must be within source root', () => {
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');

      // Attempting to escape source root should throw
      expect(() => {
        resolvePath('../../../etc/passwd', currentFile, testFixturesDir);
      }).toThrow(PathTraversalError);
    });

    it('should not have special handling for file vs virtual (SSI removed)', () => {
      // In v2, there's no distinction between 'file' and 'virtual' types
      // All paths follow the same rules: / = absolute, otherwise relative
      const currentFile = path.join(testFixturesDir, 'pages', 'index.html');

      const absolutePath = resolvePath('/layouts/main.html', currentFile, testFixturesDir);
      const relativePath = resolvePath('../layouts/main.html', currentFile, testFixturesDir);

      // Both should resolve to the same location
      expect(absolutePath).toBe(relativePath);
    });
  });
});
