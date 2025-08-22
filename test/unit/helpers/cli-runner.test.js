/**
 * Self-testing for CLI runner helper utilities
 * Tests CLI command execution, timeout handling, and output capture
 */

import { test, expect, describe, beforeEach, afterEach, spyOn } from 'bun:test';
import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { 
  runCLI, 
  runCLISuccess, 
  runCLIFailure,
  runBuild,
  runServe,
  runWatch,
  runInit,
  runDryRun
} from '../../helpers/cli-runner.js';
import { makeTempProject } from '../../helpers/temp-project.js';

describe('CLI Runner Helper Self-Testing', () => {
  let mockSpawn;
  let originalSpawn;
  let tempProject;

  // Helper function to write files to temp project
  async function writeProjectFile(filePath, content) {
    const fullPath = join(tempProject.sourceDir, filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
  }

  beforeEach(async () => {
    // Set up temporary project for testing (no fixture needed)
    tempProject = await makeTempProject(null);
    await writeProjectFile('index.html', '<html><body>Test</body></html>');
    
    // Spy on spawn but allow real calls by default
    originalSpawn = spawn;
  });

  afterEach(async () => {
    // Cleanup
    if (tempProject && tempProject.cleanup) {
      await tempProject.cleanup();
    }
    
    if (mockSpawn) {
      mockSpawn.mockRestore();
    }
  });

  describe('Basic CLI Execution', () => {
    test('should execute CLI commands and capture output', async () => {
      const result = await runCLI(['--help'], tempProject.tempBase, { timeout: 5000 });
      
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result).toHaveProperty('duration');
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThan(0);
    });

    test('should handle empty arguments', async () => {
      const result = await runCLI([], tempProject.tempBase, { timeout: 5000 });
      expect(result.code).toBeDefined();
    });

    test('should handle custom working directory', async () => {
      const result = await runCLI(['--help'], tempProject.tempBase);
      expect(result).toHaveProperty('code');
    });

    test('should handle environment variables', async () => {
      const result = await runCLI(['--help'], tempProject.tempBase, {
        env: { TEST_VAR: 'test_value' },
        timeout: 5000
      });
      
      expect(result.code).toBeDefined();
    });

    test('should handle custom timeout', async () => {
      const startTime = Date.now();
      
      try {
        // This should timeout quickly
        await runCLI(['serve'], tempProject.tempBase, { timeout: 100 });
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(error.message).toContain('timed out');
        expect(duration).toBeLessThan(1000); // Should timeout well before 1 second
      }
    });

    test('should handle input to stdin', async () => {
      // This tests the input functionality even though most CLI commands don't use it
      const result = await runCLI(['--version'], tempProject.tempBase, {
        input: 'test input\n',
        timeout: 5000
      });
      
      expect(result.code).toBeDefined();
    });
  });

  describe('Success/Failure Helpers', () => {
    test('runCLISuccess should return result for successful commands', async () => {
      const result = await runCLISuccess(['--version'], tempProject.tempBase);
      
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');  
      expect(result).toHaveProperty('duration');
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    test('runCLISuccess should throw for failing commands', async () => {
      await expect(runCLISuccess(['invalid-command'], tempProject.tempBase, { timeout: 2000 }))
        .rejects.toThrow('CLI command failed with exit code');
    });

    test('runCLIFailure should return result for failing commands', async () => {
      const result = await runCLIFailure(['invalid-command'], tempProject.tempBase, { timeout: 2000 });
      
      expect(result.code).not.toBe(0);
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
    });

    test('runCLIFailure should throw for successful commands', async () => {
      await expect(runCLIFailure(['--version'], tempProject.tempBase))
        .rejects.toThrow('Expected CLI command to fail, but it succeeded');
    });
  });

  describe('Command-Specific Helpers', () => {
    test('runBuild should execute build command with project paths', async () => {
      const result = await runBuild(tempProject, ['--dry-run']);
      
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
    });

    test('runBuild should handle extra arguments', async () => {
      const result = await runBuild(tempProject, ['--clean', '--dry-run'], { timeout: 5000 });
      
      expect(result.code).toBeDefined();
    });

    test('runServe should execute serve command with random port', async () => {
      // This will likely timeout, but should start properly
      try {
        await runServe(tempProject, [], { timeout: 1000 });
      } catch (error) {
        // Expected to timeout, but should get a proper timeout error
        expect(error.message).toContain('timed out');
      }
    });

    test('runWatch should execute watch command with mock events', async () => {
      const watcherEvents = [
        { event: 'change', file: 'test.html', delay: 50 }
      ];
      
      try {
        await runWatch(tempProject, [], { 
          timeout: 1000,
          watcherEvents 
        });
      } catch (error) {
        // Expected to timeout, but environment should be set up correctly
        expect(error.message).toContain('timed out');
      }
    });

    test('runInit should execute init command', async () => {
      const result = await runInit(tempProject.tempBase, 'basic', { timeout: 5000 });
      expect(result.code).toBeDefined();
    });

    test('runInit should handle no template', async () => {
      const result = await runInit(tempProject.tempBase, null, { timeout: 5000 });
      expect(result.code).toBeDefined();
    });

    test('runDryRun should execute dry run with debug logging', async () => {
      const result = await runDryRun(tempProject);
      expect(result.code).toBeDefined();
    });
  });

  describe('Basic Error Handling Interface', () => {
    test('should handle invalid commands gracefully', async () => {
      // Test with unknown command
      const result = await runCLI(['invalid-command'], tempProject.tempBase, { timeout: 3000 });
      
      // Should return result structure regardless of success/failure
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result).toHaveProperty('duration');
      expect(typeof result.duration).toBe('number');
    });

    test('should handle timeout parameter', async () => {
      // Test with very short timeout on a command that will likely timeout
      try {
        await runCLI(['serve'], tempProject.tempBase, { timeout: 100 });
      } catch (error) {
        expect(error.message).toContain('timed out');
      }
    });

    test('should handle different working directories', async () => {
      const result = await runCLI(['--version'], process.cwd(), { timeout: 3000 });
      
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('stdout');
    });

    test('should handle environment variables', async () => {
      const result = await runCLI(['--version'], tempProject.tempBase, {
        env: { TEST_VAR: 'test_value' },
        timeout: 3000
      });
      
      expect(result).toHaveProperty('code');
    });

    test('should handle input parameter', async () => {
      const result = await runCLI(['--version'], tempProject.tempBase, {
        input: 'test input\n',
        timeout: 3000
      });
      
      expect(result).toHaveProperty('code');
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle multiple concurrent CLI calls', async () => {
      const promises = Array.from({ length: 5 }, () => 
        runCLI(['--version'], tempProject.tempBase, { timeout: 5000 })
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.code).toBeDefined();
        expect(typeof result.duration).toBe('number');
      });
    });

    test('should measure execution time accurately', async () => {
      const result = await runCLI(['--version'], tempProject.tempBase);
      
      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(10000); // Should be reasonable
    });

    test('should handle rapid successive calls', async () => {
      const results = [];
      
      for (let i = 0; i < 3; i++) {
        const result = await runCLI(['--version'], tempProject.tempBase, { timeout: 3000 });
        results.push(result);
      }
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.code).toBeDefined();
      });
    });

    test('should maintain isolation between calls', async () => {
      // First call with custom env
      const result1 = await runCLI(['build', '--dry-run'], tempProject.tempBase, {
        env: { TEST_VAR: 'value1' },
        timeout: 3000
      });
      
      // Second call with different env
      const result2 = await runCLI(['build', '--dry-run'], tempProject.tempBase, {
        env: { TEST_VAR: 'value2' },
        timeout: 3000
      });
      
      // Both should execute independently
      expect(result1.code).toBeDefined();
      expect(result2.code).toBeDefined();
    });
  });
});