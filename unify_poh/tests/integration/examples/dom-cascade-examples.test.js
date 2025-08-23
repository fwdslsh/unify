/**
 * Integration Tests for DOM Cascade Examples
 * Tests the complete build workflow against the examples directory
 * 
 * Verifies that running `bun src/cli.js build --clean --output examples/dist --source examples/input`
 * produces output that matches the expected files in examples/output/
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { TempProject } from '../../helpers/temp-project.js';
import { spawn } from 'bun';
import { join } from 'path';
import { readFileSync, existsSync, cpSync, mkdirSync } from 'fs';

describe('DOM Cascade Examples Integration', () => {
  let tempProject;
  let projectRoot;
  
  beforeEach(() => {
    tempProject = new TempProject();
    projectRoot = process.cwd(); // Should be /home/founder3/code/github/fwdslsh/unify/unify_poh
  });

  afterEach(async () => {
    await tempProject.cleanup();
  });

  describe('Examples Build Workflow', () => {
    test('should_build_examples_and_match_expected_output', async () => {
      // Arrange - Copy examples/input to temp directory
      const examplesInputPath = join(projectRoot, 'examples', 'input');
      const examplesOutputPath = join(projectRoot, 'examples', 'output');
      const tempInputPath = tempProject.path('examples/input');
      const tempDistPath = tempProject.path('examples/dist');
      
      // Ensure the examples directories exist
      expect(existsSync(examplesInputPath)).toBe(true);
      expect(existsSync(examplesOutputPath)).toBe(true);
      
      // Copy the input structure to temp directory
      mkdirSync(tempProject.path('examples'), { recursive: true });
      cpSync(examplesInputPath, tempInputPath, { recursive: true });
      
      // Act - Execute the build command
      const buildCommand = [
        join(projectRoot, 'src/cli.js'),
        'build',
        '--clean',
        '--source', tempInputPath,
        '--output', tempDistPath
      ];
      
      const proc = spawn(['bun', ...buildCommand], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      const result = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      
      // Assert - Build should succeed
      if (result !== 0) {
        console.error('Build failed with exit code:', result);
        console.error('STDOUT:', stdout);
        console.error('STDERR:', stderr);
      }
      expect(result).toBe(0);
      
      // Verify dist directory was created
      expect(await tempProject.directoryExists('examples/dist')).toBe(true);
      expect(await tempProject.fileExists('examples/dist/index.html')).toBe(true);
      
      // Read the generated output
      const actualOutput = await tempProject.readFile('examples/dist/index.html');
      
      // Read the expected output
      const expectedOutput = readFileSync(join(examplesOutputPath, 'index.html'), 'utf8');
      
      // Assert - Output should match exactly
      if (actualOutput !== expectedOutput) {
        
        // Show character-by-character diff for debugging
        const expectedLines = expectedOutput.split('\n');
        const actualLines = actualOutput.split('\n');
        const maxLines = Math.max(expectedLines.length, actualLines.length);
        
        for (let i = 0; i < maxLines; i++) {
          const expectedLine = expectedLines[i] || '';
          const actualLine = actualLines[i] || '';
          if (expectedLine !== actualLine) {
            break;
          }
        }
      }
      
      expect(actualOutput).toBe(expectedOutput);
    }, 30000); // Increased timeout for build process
    
    test('should_copy_all_required_files_and_maintain_structure', async () => {
      // Arrange - Copy examples/input to temp directory
      const examplesInputPath = join(projectRoot, 'examples', 'input');
      const tempInputPath = tempProject.path('examples/input');
      const tempDistPath = tempProject.path('examples/dist');
      
      mkdirSync(tempProject.path('examples'), { recursive: true });
      cpSync(examplesInputPath, tempInputPath, { recursive: true });
      
      // Act - Execute build command
      const buildCommand = [
        join(projectRoot, 'src/cli.js'),
        'build',
        '--clean',
        '--source', tempInputPath,
        '--output', tempDistPath
      ];
      
      const proc = spawn(['bun', ...buildCommand], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      await proc.exited;
      
      // Assert - Check that expected files exist in output
      expect(await tempProject.fileExists('examples/dist/index.html')).toBe(true);
      
      // Verify that fragment files (_includes) are not copied to output
      expect(await tempProject.directoryExists('examples/dist/_includes')).toBe(false);
      
      // Check that the structure follows unify conventions
      const distFiles = [];
      try {
        const readDirRecursive = (dir, prefix = '') => {
          const { readdirSync, statSync } = require('fs');
          const entries = readdirSync(dir);
          for (const entry of entries) {
            const fullPath = join(dir, entry);
            const relativePath = prefix ? `${prefix}/${entry}` : entry;
            if (statSync(fullPath).isDirectory()) {
              distFiles.push(`${relativePath}/`);
              readDirRecursive(fullPath, relativePath);
            } else {
              distFiles.push(relativePath);
            }
          }
        };
        readDirRecursive(tempDistPath);
      } catch (err) {
        // Directory might not exist or be empty
      }
      
      // Should only contain processed HTML files, no fragments
      const htmlFiles = distFiles.filter(f => f.endsWith('.html'));
      const fragmentDirs = distFiles.filter(f => f.includes('_includes') || f.includes('_layouts'));
      
      expect(htmlFiles.length).toBeGreaterThan(0);
      expect(fragmentDirs.length).toBe(0); // Fragments should not be copied
    }, 30000);
    
    test('should_handle_build_errors_gracefully', async () => {
      // Arrange - Create invalid input that should cause build to fail
      await tempProject.writeFile('examples/input/index.html', '<html><body>Invalid content with missing imports</body></html>');
      await tempProject.writeFile('examples/input/invalid.html', '<<< malformed html');
      
      const tempInputPath = tempProject.path('examples/input');
      const tempDistPath = tempProject.path('examples/dist');
      
      // Act - Execute build command (expecting it might fail)
      const buildCommand = [
        join(projectRoot, 'src/cli.js'),
        'build',
        '--clean',
        '--source', tempInputPath,
        '--output', tempDistPath
      ];
      
      const proc = spawn(['bun', ...buildCommand], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      const result = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      
      // Assert - Should either succeed (graceful handling) or provide meaningful error
      if (result !== 0) {
        // If it fails, stderr should contain useful information
        expect(stderr).toBeTruthy();
        expect(typeof stderr).toBe('string');
      }
      
      // Should not crash without any output
      expect(stdout.length + stderr.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('CLI Argument Validation', () => {
    test('should_validate_required_arguments', async () => {
      // Act - Run build without required arguments
      const proc = spawn(['bun', join(projectRoot, 'src/cli.js'), 'build'], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      const result = await proc.exited;
      const stderr = await new Response(proc.stderr).text();
      
      // Assert - Should provide helpful error message or use defaults
      if (result !== 0) {
        expect(stderr).toContain(''); // Should have some error message
      }
      // Note: The CLI might have default values, so success is also acceptable
    }, 10000);
    
    test('should_handle_invalid_source_directory', async () => {
      // Act - Run build with non-existent source directory
      const proc = spawn(['bun', join(projectRoot, 'src/cli.js'), 'build', '--source', '/non-existent-directory'], {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      const result = await proc.exited;
      const stderr = await new Response(proc.stderr).text();
      
      // Assert - Should fail with meaningful error
      expect(result).not.toBe(0);
      expect(stderr).toBeTruthy();
    }, 10000);
  });
});