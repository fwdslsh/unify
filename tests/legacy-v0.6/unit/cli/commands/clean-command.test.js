/**
 * Simplified Unit Tests for CleanCommand
 * Focus: Core logic, validation, error handling without filesystem mocks
 * Strategy: Test the parts we can test without mocking filesystem operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { CleanCommand } from '../../../../src/cli/commands/clean-command.js';
import { ValidationError } from '../../../../src/core/errors.js';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';

let cleanCommand;
let testDir;

beforeEach(() => {
  cleanCommand = new CleanCommand();
  
  // Create temporary test directory within project for security validation
  testDir = './tmp-clean-test-' + Date.now();
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
});

describe('CleanCommand', () => {
  describe('constructor', () => {
    it('should initialize with required components', () => {
      expect(cleanCommand.pathValidator).toBeDefined();
      expect(cleanCommand.logger).toBeDefined();
      expect(Array.isArray(cleanCommand.deletedFiles)).toBe(true);
      expect(Array.isArray(cleanCommand.deletedDirs)).toBe(true);
      expect(cleanCommand.deletedFiles).toHaveLength(0);
      expect(cleanCommand.deletedDirs).toHaveLength(0);
    });
  });

  describe('validation logic', () => {
    describe('validateOptions', () => {
      it('should throw error for missing output directory', () => {
        const options = {};
        
        expect(() => {
          cleanCommand.validateOptions(options);
        }).toThrow(ValidationError);
        
        expect(() => {
          cleanCommand.validateOptions(options);
        }).toThrow('Output directory is required');
      });

      it('should validate with existing output directory', () => {
        const outputDir = testDir + '/output';
        mkdirSync(outputDir, { recursive: true });

        const options = { output: outputDir };
        
        // Should not throw
        expect(() => {
          cleanCommand.validateOptions(options);
        }).not.toThrow();
        
        // Cleanup
        rmSync(outputDir, { recursive: true, force: true });
      });

      it('should validate patterns array type', () => {
        const options = { 
          output: './dist', 
          patterns: 'not-an-array' 
        };
        
        expect(() => {
          cleanCommand.validateOptions(options);
        }).toThrow(ValidationError);
        
        expect(() => {
          cleanCommand.validateOptions(options);
        }).toThrow('Patterns must be an array');
      });

      it('should validate pattern string types', () => {
        const options = { 
          output: './dist', 
          patterns: ['valid-pattern', 123, 'another-valid'] 
        };
        
        expect(() => {
          cleanCommand.validateOptions(options);
        }).toThrow(ValidationError);
        
        expect(() => {
          cleanCommand.validateOptions(options);
        }).toThrow('All patterns must be strings');
      });

      it('should accept valid options', () => {
        const options = {
          output: './dist',
          dryRun: true,
          verbose: true,
          patterns: ['./cache/**/*', 'temp/*.log']
        };
        
        expect(() => {
          cleanCommand.validateOptions(options);
        }).not.toThrow();
      });
    });

    describe('dangerous pattern detection', () => {
      it('should reject system directory patterns', () => {
        const dangerousPatterns = [
          '/',
          '/bin',
          '/usr',
          '/etc',
          '/var',
          'C:\\',
          'C:\\Windows',
          '../..',
          '../../..'
        ];

        for (const pattern of dangerousPatterns) {
          const options = { 
            output: './dist', 
            patterns: [pattern] 
          };
          
          expect(() => {
            cleanCommand.validateOptions(options);
          }).toThrow(ValidationError);
          
          expect(() => {
            cleanCommand.validateOptions(options);
          }).toThrow(`Dangerous pattern rejected: ${pattern}`);
        }
      });

      it('should allow safe patterns', () => {
        const safePatterns = [
          './dist/**/*',
          'build/*.js',
          'temp/cache',
          '.cache/',
          'node_modules/.cache'
        ];

        for (const pattern of safePatterns) {
          const options = { 
            output: './dist', 
            patterns: [pattern] 
          };
          
          expect(() => {
            cleanCommand.validateOptions(options);
          }).not.toThrow();
        }
      });
    });
  });

  describe('helper methods', () => {
    describe('_isDangerousPattern', () => {
      it('should identify dangerous system paths', () => {
        const dangerousPaths = [
          '/',
          '/bin',
          '/usr',
          '/etc',
          '/var',
          '/sys',
          '/proc',
          'C:\\',
          'C:\\Windows',
          'C:\\Program Files',
          '../..',
          '../../..',
          '../../../..'
        ];

        for (const path of dangerousPaths) {
          expect(cleanCommand._isDangerousPattern(path)).toBe(true);
        }
      });

      it('should allow safe paths', () => {
        const safePaths = [
          './dist',
          'build',
          'cache',
          'temp/files',
          '.cache',
          'node_modules/.cache',
          'out/**/*'
        ];

        for (const path of safePaths) {
          expect(cleanCommand._isDangerousPattern(path)).toBe(false);
        }
      });

      it('should handle case insensitive matching', () => {
        expect(cleanCommand._isDangerousPattern('C:\\WINDOWS')).toBe(true);
        expect(cleanCommand._isDangerousPattern('/USR/bin')).toBe(true);
      });

      it('should handle path separator normalization', () => {
        expect(cleanCommand._isDangerousPattern('C:\\Windows\\System32')).toBe(true);
        expect(cleanCommand._isDangerousPattern('../..\\..\\etc')).toBe(true);
      });
    });

    describe('getStats', () => {
      it('should return current cleanup statistics', () => {
        // Simulate some deletions
        cleanCommand.deletedFiles = ['file1.txt', 'file2.html'];
        cleanCommand.deletedDirs = ['dir1', 'dir2', 'dir3'];

        const stats = cleanCommand.getStats();

        expect(stats).toEqual({
          deletedFiles: 2,
          deletedDirs: 3,
          totalDeleted: 5
        });
      });

      it('should return zero stats initially', () => {
        const stats = cleanCommand.getStats();

        expect(stats).toEqual({
          deletedFiles: 0,
          deletedDirs: 0,
          totalDeleted: 0
        });
      });
    });
  });

  describe('integration scenarios', () => {
    it('should successfully clean a real test directory', async () => {
      // Create a real directory structure to clean
      const targetDir = testDir + '/target-to-clean';
      const subDir = targetDir + '/subdir';
      mkdirSync(subDir, { recursive: true });
      
      // Create some files to clean
      writeFileSync(targetDir + '/file1.txt', 'test content 1');
      writeFileSync(targetDir + '/file2.html', '<html></html>');
      writeFileSync(subDir + '/nested.js', 'console.log("test");');

      const options = { 
        output: targetDir,
        force: true  // Force cleaning non-standard directory
      };

      const result = await cleanCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.outputCleaned).toBe(true);
      expect(result.deletedFiles).toBeGreaterThan(0);
      expect(result.deletedDirs).toBeGreaterThan(0);
      expect(typeof result.executionTime).toBe('number');
      
      // Directory should be cleaned but still exist (we don't remove the output dir itself)
      expect(existsSync(targetDir)).toBe(true);
      // But it should be empty
      const remainingEntries = require('fs').readdirSync(targetDir);
      expect(remainingEntries).toHaveLength(0);
    });

    it('should handle dry run mode without making changes', async () => {
      // Create a real directory structure
      const targetDir = testDir + '/dry-run-test';
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(targetDir + '/test-file.txt', 'test content');

      const options = { 
        output: targetDir,
        dryRun: true,
        force: true
      };

      const result = await cleanCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.outputCleaned).toBe(false);  // No actual cleaning in dry run
      expect(result.dryRun).toBe(true);
      
      // File should still exist after dry run
      expect(existsSync(targetDir + '/test-file.txt')).toBe(true);
      
      // But tracking arrays should show what would have been deleted
      expect(cleanCommand.deletedFiles.length).toBeGreaterThan(0);
      
      // Cleanup
      rmSync(targetDir, { recursive: true, force: true });
    });

    it('should handle non-existent directory gracefully', async () => {
      const options = { 
        output: './non-existent-directory-' + Date.now()
      };

      const result = await cleanCommand.execute(options);

      expect(result.success).toBe(true);
      expect(result.outputCleaned).toBe(false);
      expect(result.deletedFiles).toBe(0);
      expect(result.deletedDirs).toBe(0);
    });

    it('should require --force for non-standard directories', async () => {
      // Create a directory that exists but doesn't look like a build directory (avoid 'tmp' in name)
      const unusualDir = './some-random-directory-name-' + Date.now();
      mkdirSync(unusualDir, { recursive: true });
      writeFileSync(unusualDir + '/some-file.txt', 'content');

      const options = { 
        output: unusualDir  // No standard build directory indicators
      };

      const result = await cleanCommand.execute(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Use --force to clean anyway');
      
      // Cleanup
      rmSync(unusualDir, { recursive: true, force: true });
    });

    it('should handle validation errors gracefully', async () => {
      const options = {}; // Missing required output

      const result = await cleanCommand.execute(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Output directory is required');
      expect(result.deletedFiles).toBe(0);
      expect(result.deletedDirs).toBe(0);
      expect(typeof result.executionTime).toBe('number');
    });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});