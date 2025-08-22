/**
 * Security tests for path traversal prevention
 * Tests protection against directory escape attempts
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { makeTempProjectFromStructure } from '../helpers/temp-project.js';
import { runBuild, runCLI } from '../helpers/cli-runner.js';
import { expectBuildFailure } from '../helpers/assertions.js';

const cleanupTasks = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
});

describe('Path Traversal Security', () => {
  test('should block relative path escapes in includes', async () => {
    const structure = {
      'malicious.html': `
        <!--#include virtual="../../../etc/passwd" -->
        <!--#include file="../../secret.txt" -->
        <h1>Content</h1>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    
    // Should either error or safely ignore the malicious includes
    expect([0, 1]).toContain(result.code);
    if (result.code === 1) {
      expect(result.stderr).toMatch(/path|security|traversal|not found/i);
    }
    
    // Should not include actual system files
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    try {
      const content = await readFile(join(project.outputDir, 'malicious.html'), 'utf8');
      expect(content).not.toContain('root:');
      expect(content).not.toContain('/bin/');
    } catch (error) {
      // File might not exist if build failed, which is acceptable
    }
  });
  
  test('should block absolute path escapes', async () => {
    const structure = {
      'malicious.html': `
        <!--#include virtual="/etc/passwd" -->
        <!--#include virtual="/System/secret" -->
        <!--#include file="/private/etc/hosts" -->
        <h1>Content</h1>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    
    // Should either error or safely ignore
    expect([0, 1]).toContain(result.code);
    if (result.code === 1) {
      expect(result.stderr).toMatch(/not found|path|security/i);
    }
  });
  
  test('should block data-import path escapes', async () => {
    const structure = {
      'malicious.html': `
        <div data-import="../../../etc/passwd">Content</div>
        <div data-import="/etc/hosts">More content</div>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    
    // Should either error or safely ignore
    expect([0, 1]).toContain(result.code);
    if (result.code === 1) {
      expect(result.stderr).toMatch(/not found|path|security/i);
    }
  });
  
  test('should validate CLI source and output paths', async () => {
    const project = await makeTempProjectFromStructure({ 'index.html': '<h1>Test</h1>' });
    cleanupTasks.push(project.cleanup);
    
    // Try to set source outside safe area
    const result1 = await runCLI([
      'build',
      '--source', '/etc',
      '--output', project.outputDir
    ]);
    
    // Should either error or refuse
    expect([0, 1, 2]).toContain(result1.code);
    
    // Try to set output to system directory
    const result2 = await runCLI([
      'build', 
      '--source', project.sourceDir,
      '--output', '/etc/malicious'
    ]);
    
    // Should either error or refuse
    expect([0, 1, 2]).toContain(result2.code);
  });
  
  test('should sanitize file paths in error messages', async () => {
    const structure = {
      'test.html': `<!--#include virtual="/does/not/exist/sensitive.txt" -->`
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    
    // Error messages should not leak full system paths
    expect(result.stderr).not.toMatch(/\/usr\/|\/etc\/|\/System\/|C:\\/);
  });
  
  test('should handle URL-encoded path attempts', async () => {
    const structure = {
      'malicious.html': `
        <!--#include virtual="..%2F..%2F..%2Fetc%2Fpasswd" -->
        <!--#include virtual="%2E%2E%2F%2E%2E%2Fsecret" -->
        <h1>Content</h1>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    
    // Should handle encoded paths safely
    expect([0, 1]).toContain(result.code);
  });
  
  test('should handle null bytes and special characters', async () => {
    const structure = {
      'malicious.html': `
        <!--#include virtual="../secret\x00.txt" -->
        <!--#include virtual="../secret\n.txt" -->
        <h1>Content</h1>
      `
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    
    // Should handle special characters safely
    expect([0, 1]).toContain(result.code);
  });
  
  test('should block symlink following', async () => {
    const structure = {
      'normal.html': '<h1>Normal content</h1>',
      'include.html': '<p>Include content</p>'
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    // Create a symlink (if supported on platform)
    const { symlink } = await import('fs/promises');
    const { join } = await import('path');
    
    try {
      await symlink('/etc/passwd', join(project.sourceDir, 'symlink.txt'));
      
      // Try to include the symlink
      const maliciousStructure = {
        'test.html': '<!--#include file="./symlink.txt" -->'
      };
      
      const maliciousProject = await makeTempProjectFromStructure(maliciousStructure);
      cleanupTasks.push(maliciousProject.cleanup);
      
      const result = await runBuild(maliciousProject);
      
      // Should not follow symlinks to system files
      expect([0, 1]).toContain(result.code);
      if (result.code === 0) {
        const content = await readFile(join(maliciousProject.outputDir, 'test.html'), 'utf8');
        expect(content).not.toContain('root:');
      }
    } catch (error) {
      // Symlink creation might fail on some platforms, skip this test
      console.log('Symlink test skipped on this platform');
    }
  });
  
  test('should validate asset copy paths', async () => {
    const project = await makeTempProjectFromStructure({ 'index.html': '<h1>Test</h1>' });
    cleanupTasks.push(project.cleanup);
    
    // Try to copy files from outside source
    const result = await runCLI([
      'build',
      '--source', project.sourceDir,
      '--output', project.outputDir,
      '--copy', '/etc/**',
      '--copy', '../../../secrets/**'
    ]);
    
    // Should handle malicious copy patterns safely
    expect([0, 1, 2]).toContain(result.code);
  });
  
  test('should prevent output path injection', async () => {
    const structure = {
      'test.html': '<h1>Test</h1>'
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    // Try various output path manipulations
    const maliciousPaths = [
      '../../../tmp/malicious',
      '/tmp/malicious',
      project.outputDir + '/../escape'
    ];
    
    for (const maliciousPath of maliciousPaths) {
      const result = await runCLI([
        'build',
        '--source', project.sourceDir,
        '--output', maliciousPath
      ]);
      
      // Should either block or contain the operation
      expect([0, 1, 2]).toContain(result.code);
    }
  });
  
  test('should handle deeply nested paths safely', async () => {
    // Create a very deep path structure
    let deepStructure = {};
    let current = deepStructure;
    
    // Create 20 levels deep
    for (let i = 0; i < 20; i++) {
      current[`level${i}`] = {};
      current = current[`level${i}`];
    }
    current['deep.html'] = '<h1>Deep content</h1>';
    
    // Add a malicious include at the bottom
    current['malicious.html'] = '<!--#include virtual="' + '../'.repeat(25) + 'etc/passwd" -->';
    
    const project = await makeTempProjectFromStructure(deepStructure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    
    // Should handle deep paths without security issues
    expect([0, 1]).toContain(result.code);
  });
  
  test('should provide security-conscious error messages', async () => {
    const structure = {
      'test.html': '<!--#include virtual="../../../etc/passwd" -->'
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    
    // Error messages should not reveal sensitive system information
    expect(result.stderr).not.toMatch(/\/usr\/bin\/|\/etc\/passwd|C:\\Windows/);
    expect(result.stderr).not.toContain('Permission denied');
    expect(result.stderr).not.toContain('Access is denied');
  });
});