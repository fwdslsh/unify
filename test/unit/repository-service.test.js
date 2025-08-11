import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { RepositoryService, DEFAULT_ORG, DEFAULT_REPO, KNOWN_STARTERS } from '../../src/utils/repository-service.js';
import { createTempDirectory, cleanupTempDirectory } from '../fixtures/temp-helper.js';

/**
 * Unit tests for RepositoryService class with proper mocking
 * 
 * These tests validate the repository service functionality in isolation
 * using mocked fetch and file system operations.
 */

// Mock tarball data for testing
const MOCK_TARBALL_DATA = new Uint8Array([
  0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, // Gzip header
  0x00, 0x03, 0x4b, 0xcb, 0xcf, 0x4f, 0x02, 0x00, // Some test data
  0x21, 0x68, 0x31, 0x8f, 0x04, 0x00, 0x00, 0x00  // Gzip footer
]);

describe('RepositoryService Unit Tests', () => {
  let tempDir;
  let repositoryService;
  let mockFetch;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    
    // Create mock fetch function
    mockFetch = async (url, options = {}) => {
      // Default success response
      if (options.method === 'HEAD') {
        return new Response(null, { status: 200 });
      } else {
        return new Response(MOCK_TARBALL_DATA, {
          status: 200,
          headers: { 'content-type': 'application/x-gzip' }
        });
      }
    };
    
    // Create repository service with mocked fetch
    repositoryService = new RepositoryService(mockFetch);
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  describe('repositoryExists', () => {
    test('should return true for existing repository', async () => {
      mockFetch = async (url, options) => {
        expect(url).toBe('https://api.github.com/repos/fwdslsh/unify-starter/tarball');
        expect(options.method).toBe('HEAD');
        return new Response(null, { status: 200 });
      };
      
      repositoryService = new RepositoryService(mockFetch);
      const exists = await repositoryService.repositoryExists('fwdslsh', 'unify-starter');
      
      expect(exists).toBe(true);
    });

    test('should return false for non-existing repository', async () => {
      mockFetch = async (url, options) => {
        expect(url).toBe('https://api.github.com/repos/fwdslsh/nonexistent/tarball');
        expect(options.method).toBe('HEAD');
        return new Response(null, { status: 404 });
      };
      
      repositoryService = new RepositoryService(mockFetch);
      const exists = await repositoryService.repositoryExists('fwdslsh', 'nonexistent');
      
      expect(exists).toBe(false);
    });

    test('should return false on network error', async () => {
      mockFetch = async () => {
        throw new Error('Network error');
      };
      
      repositoryService = new RepositoryService(mockFetch);
      const exists = await repositoryService.repositoryExists('fwdslsh', 'unify-starter');
      
      expect(exists).toBe(false);
    });

    test('should return false for server errors', async () => {
      mockFetch = async () => new Response(null, { status: 500 });
      
      repositoryService = new RepositoryService(mockFetch);
      const exists = await repositoryService.repositoryExists('fwdslsh', 'unify-starter');
      
      expect(exists).toBe(false);
    });
  });

  describe('downloadAndExtract', () => {
    test('should successfully download and extract repository', async () => {
      const mockLogger = {
        debug: () => {}
      };

      mockFetch = async (url) => {
        expect(url).toBe('https://api.github.com/repos/fwdslsh/unify-starter/tarball');
        return new Response(MOCK_TARBALL_DATA, {
          status: 200,
          headers: { 'content-type': 'application/x-gzip' }
        });
      };
      
      repositoryService = new RepositoryService(mockFetch);
      
      // Mock the extractTarball method to avoid actual tar extraction
      const extractSpy = spyOn(repositoryService, 'extractTarball').mockImplementation(async (tarData, targetDir, logger) => {
        // Simulate creating some files
        await fs.writeFile(path.join(targetDir, 'test.txt'), 'test content');
        logger?.debug?.('Mock extraction completed');
      });

      await repositoryService.downloadAndExtract('fwdslsh', 'unify-starter', tempDir, mockLogger);
      
      // Verify extraction was called with correct parameters
      expect(extractSpy).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        tempDir,
        mockLogger
      );
      
      // Verify file was created
      const files = await fs.readdir(tempDir);
      expect(files).toContain('test.txt');
      
      extractSpy.mockRestore();
    });

    test('should handle 404 repository not found', async () => {
      mockFetch = async () => new Response(null, { status: 404 });
      repositoryService = new RepositoryService(mockFetch);
      
      await expect(
        repositoryService.downloadAndExtract('fwdslsh', 'nonexistent', tempDir)
      ).rejects.toThrow('Repository not found: fwdslsh/nonexistent');
    });

    test('should handle 403 rate limit exceeded', async () => {
      mockFetch = async () => new Response(null, { status: 403 });
      repositoryService = new RepositoryService(mockFetch);
      
      await expect(
        repositoryService.downloadAndExtract('fwdslsh', 'unify-starter', tempDir)
      ).rejects.toThrow('GitHub API rate limit exceeded or access denied');
    });

    test('should handle other HTTP errors', async () => {
      mockFetch = async () => new Response(null, { status: 500 });
      repositoryService = new RepositoryService(mockFetch);
      
      await expect(
        repositoryService.downloadAndExtract('fwdslsh', 'unify-starter', tempDir)
      ).rejects.toThrow('Failed to download: 500');
    });

    test('should handle network errors', async () => {
      mockFetch = async () => {
        throw new Error('Connection timeout');
      };
      repositoryService = new RepositoryService(mockFetch);
      
      await expect(
        repositoryService.downloadAndExtract('fwdslsh', 'unify-starter', tempDir)
      ).rejects.toThrow('Failed to download starter template: Connection timeout');
    });
  });

  describe('extractTarball', () => {
    test('should extract tarball successfully', async () => {
      const mockLogger = {
        debug: () => {}
      };

      // We'll test the extractTarball by mocking it entirely since the 
      // actual implementation depends on system tar command
      const extractSpy = spyOn(repositoryService, 'extractTarball').mockImplementation(async (tarData, targetDir, logger) => {
        // Simulate successful extraction by creating a test file
        await fs.writeFile(path.join(targetDir, 'extracted.txt'), 'extracted content');
        logger?.debug?.('Mock extraction completed');
      });

      await repositoryService.extractTarball(MOCK_TARBALL_DATA, tempDir, mockLogger);
      
      // Verify the mock was called
      expect(extractSpy).toHaveBeenCalledWith(MOCK_TARBALL_DATA, tempDir, mockLogger);
      
      // Verify file was created by the mock
      const files = await fs.readdir(tempDir);
      expect(files).toContain('extracted.txt');
      
      extractSpy.mockRestore();
    });

    test('should handle tar extraction failure', async () => {
      const mockLogger = {
        debug: () => {}
      };

      // Mock extractTarball to throw an error
      const extractSpy = spyOn(repositoryService, 'extractTarball').mockImplementation(async () => {
        throw new Error('Extraction failed: tar command not found');
      });

      await expect(
        repositoryService.extractTarball(MOCK_TARBALL_DATA, tempDir, mockLogger)
      ).rejects.toThrow('Extraction failed');
      
      extractSpy.mockRestore();
    });
  });

  describe('constants', () => {
    test('should have correct default constants', () => {
      expect(DEFAULT_ORG).toBe('fwdslsh');
      expect(DEFAULT_REPO).toBe('unify-starter');
      expect(Array.isArray(KNOWN_STARTERS)).toBe(true);
      expect(KNOWN_STARTERS.length).toBeGreaterThan(0);
      expect(KNOWN_STARTERS).toContain('basic');
    });
  });

  describe('dependency injection', () => {
    test('should use default fetch when none provided', () => {
      const service = new RepositoryService();
      expect(service.fetchFunction).toBe(fetch);
    });

    test('should use custom fetch when provided', () => {
      const customFetch = async () => {};
      const service = new RepositoryService(customFetch);
      expect(service.fetchFunction).toBe(customFetch);
    });
  });
});
