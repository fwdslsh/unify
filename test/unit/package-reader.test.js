/**
 * Tests for package.json reading and baseUrl resolution
 * Verifies package.json homepage extraction for sitemap generation
 */

import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { readPackageJson, findPackageJson, getBaseUrlFromPackage } from '../../src/utils/package-reader.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Package.json Reading', () => {
  let tempDir = null;

  beforeEach(async () => {
    // Create an isolated temp directory far from project root to avoid finding project package.json
    tempDir = path.join('/tmp', 'dompile-test-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9));
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
      tempDir = null;
    }
  });

  describe('readPackageJson', () => {
    it('should read valid package.json', async () => {
      const packageContent = {
        name: 'test-project',
        version: '1.0.0',
        homepage: 'https://example.com'
      };
      
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageContent, null, 2));
      
      const result = await readPackageJson(tempDir);
      
      expect(result.name).toBe('test-project');
      expect(result.homepage).toBe('https://example.com');
    });

    it('should return null for missing package.json', async () => {
      const result = await readPackageJson(tempDir);
      expect(result).toBe(null);
    });

    it('should return null for invalid JSON', async () => {
      await fs.writeFile(path.join(tempDir, 'package.json'), '{ invalid json }');
      
      const result = await readPackageJson(tempDir);
      expect(result).toBe(null);
    });

    it('should handle package.json with no homepage', async () => {
      const packageContent = {
        name: 'test-project',
        version: '1.0.0'
      };
      
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageContent));
      
      const result = await readPackageJson(tempDir);
      
      expect(result.name).toBe('test-project');
      expect(result.homepage).toBe(undefined);
    });
  });

  describe('findPackageJson', () => {
    it('should find package.json in current directory', async () => {
      const packageContent = { name: 'current-dir', homepage: 'https://current.com' };
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageContent));
      
      const result = await findPackageJson(tempDir);
      
      expect(result.name).toBe('current-dir');
      expect(result.homepage).toBe('https://current.com');
    });

    it('should find package.json in parent directory', async () => {
      const subDir = path.join(tempDir, 'subdir');
      await fs.mkdir(subDir, { recursive: true });
      
      const packageContent = { name: 'parent-dir', homepage: 'https://parent.com' };
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageContent));
      
      const result = await findPackageJson(subDir);
      
      expect(result.name).toBe('parent-dir');
      expect(result.homepage).toBe('https://parent.com');
    });

    it('should find closest package.json', async () => {
      // Create nested structure with multiple package.json files
      const subDir = path.join(tempDir, 'sub', 'nested');
      await fs.mkdir(subDir, { recursive: true });
      
      const rootPackage = { name: 'root', homepage: 'https://root.com' };
      const subPackage = { name: 'sub', homepage: 'https://sub.com' };
      
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(rootPackage));
      await fs.mkdir(path.join(tempDir, 'sub'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'sub', 'package.json'), JSON.stringify(subPackage));
      
      const result = await findPackageJson(subDir);
      
      // Should find the closer one
      expect(result.name).toBe('sub');
      expect(result.homepage).toBe('https://sub.com');
    });

    it('should return null when no package.json found', async () => {
      const deepDir = path.join(tempDir, 'very', 'deep', 'nested', 'dir');
      await fs.mkdir(deepDir, { recursive: true });
      
      const result = await findPackageJson(deepDir);
      expect(result).toBe(null);
    });
  });

  describe('getBaseUrlFromPackage', () => {
    it('should use homepage from package.json', async () => {
      const packageContent = {
        name: 'test-site',
        homepage: 'https://mysite.com'
      };
      
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageContent));
      
      const baseUrl = await getBaseUrlFromPackage(tempDir);
      
      expect(baseUrl).toBe('https://mysite.com');
    });

    it('should use fallback when no package.json', async () => {
      const baseUrl = await getBaseUrlFromPackage(tempDir, 'https://fallback.com');
      
      expect(baseUrl).toBe('https://fallback.com');
    });

    it('should use fallback when no homepage field', async () => {
      const packageContent = {
        name: 'test-site',
        version: '1.0.0'
      };
      
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageContent));
      
      const baseUrl = await getBaseUrlFromPackage(tempDir, 'https://fallback.com');
      
      expect(baseUrl).toBe('https://fallback.com');
    });

    it('should use default fallback', async () => {
      const baseUrl = await getBaseUrlFromPackage(tempDir);
      
      expect(baseUrl).toBe('https://example.com');
    });

    it('should handle various homepage URL formats', async () => {
      const testCases = [
        'https://example.com',
        'https://example.com/',
        'http://example.com',
        'https://subdomain.example.com/path',
        'https://user.github.io/repo'
      ];

      for (const homepage of testCases) {
        const packageContent = { name: 'test', homepage };
        await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageContent));
        
        const baseUrl = await getBaseUrlFromPackage(tempDir);
        expect(baseUrl).toBe(homepage);
        
        // Clean up for next iteration
        const packagePath = path.join(tempDir, 'package.json');
        try {
          await fs.unlink(packagePath);
        } catch (err) {
          // Ignore if file doesn't exist
        }
      }
    });
  });

  describe('Integration with build process', () => {
    it('should resolve baseUrl precedence correctly', async () => {
      const packageContent = {
        name: 'test-site',
        homepage: 'https://package.example.com'
      };
      
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageContent));
      
      // Test precedence: CLI arg > package.json > default
      
      // 1. No CLI arg provided, should use package.json
      const fromPackage = await getBaseUrlFromPackage(tempDir, 'https://example.com');
      expect(fromPackage).toBe('https://package.example.com');
      
      // 2. Different fallback provided, should still use package.json
      const withFallback = await getBaseUrlFromPackage(tempDir, 'https://different.com');
      expect(withFallback).toBe('https://package.example.com');
    });

    it('should work with monorepo structure', async () => {
      // Simulate monorepo: project/packages/site/
      const packagesDir = path.join(tempDir, 'packages');
      const siteDir = path.join(packagesDir, 'site');
      await fs.mkdir(siteDir, { recursive: true });
      
      // Root package.json
      const rootPackage = { name: 'monorepo-root', homepage: 'https://root.com' };
      await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(rootPackage));
      
      // Site package.json
      const sitePackage = { name: 'site', homepage: 'https://site.com' };
      await fs.writeFile(path.join(siteDir, 'package.json'), JSON.stringify(sitePackage));
      
      // Should find site-specific homepage
      const baseUrl = await getBaseUrlFromPackage(siteDir);
      expect(baseUrl).toBe('https://site.com');
    });
  });
});
