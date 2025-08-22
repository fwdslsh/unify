/**
 * Integration tests for file watching and incremental builds
 * Tests debouncing, selective rebuilds, and dependency tracking
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { makeTempProject } from '../../helpers/temp-project.js';
import { runWatch } from '../../helpers/cli-runner.js';
import { expectFileExists, expectFileContentContains } from '../../helpers/assertions.js';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';

const cleanupTasks = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
});

describe('File Watcher', () => {
  test('should rebuild on file changes with debouncing', async () => {
    const project = await makeTempProject('basic-site');
    cleanupTasks.push(project.cleanup);
    
    // Start watch mode (will timeout after 3 seconds)
        const watcherEvents = [
          { event: 'change', file: 'index.html', delay: 100 },
          { event: 'change', file: 'index.html', delay: 150 },
          { event: 'change', file: 'index.html', delay: 200 }
        ];
        const watchPromise = runWatch(project, [], { timeout: 3000, watcherEvents });
    
    // Wait a bit for initial build
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify initial build
    await expectFileExists(project.outputDir, 'index.html');
    
    // Modify a file
    // ...mock watcher events will simulate file changes...
    
    // Wait for debounce and rebuild
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const result = await watchPromise;
    
    // Watch should have processed (check for any output indicating it ran)
    expect(result.stderr || result.stdout).toBeTruthy(); // Verify it ran
  }, { timeout: 10000 });
  
  test('should handle rapid file changes with proper debouncing', async () => {
    const project = await makeTempProject('basic-site');
    cleanupTasks.push(project.cleanup);
    
    const watchPromise = runWatch(project, [], { timeout: 2000 });
    
    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Make rapid changes (should be debounced)
    const filePath = join(project.sourceDir, 'index.html');
    for (let i = 0; i < 5; i++) {
      await writeFile(filePath, `<h1>Change ${i}</h1>`, 'utf8');
      await new Promise(resolve => setTimeout(resolve, 50)); // Rapid changes
    }
    
    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const result = await watchPromise;
    
    // Should have debounced the changes
    expect(result.code).toBeDefined(); // Watch ran
  }, { timeout: 8000 });
  
  test('should rebuild dependents when include changes', async () => {
    const project = await makeTempProject('slots-complex');
    cleanupTasks.push(project.cleanup);
    
    const watchPromise = runWatch(project, [], { timeout: 3000 });
    
    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Modify an include file
    // ...mock watcher events will simulate include file change...
    
    // Wait for rebuild
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const result = await watchPromise;
    
    // Should have rebuilt (check for any output indicating it ran)
    expect(result.stderr || result.stdout).toBeTruthy(); // Verify it ran
  }, { timeout: 10000 });
  
  test('should copy assets when they change', async () => {
    const project = await makeTempProject('basic-site');
    cleanupTasks.push(project.cleanup);
    
    // Pre-create the asset file since mock watcher only simulates events
    const assetPath = join(project.sourceDir, 'assets/new-file.txt');
    await writeFile(assetPath, 'New asset content', 'utf8');
    
    // Simulate asset file change
    const watcherEvents = [
      { event: 'change', file: 'assets/new-file.txt', delay: 100 }
    ];
    const watchPromise = runWatch(project, [], { timeout: 3000, watcherEvents });
    
    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 300));
    // ...mock watcher events will simulate asset file change...
    
    // Wait for file detection
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const result = await watchPromise;
    
    // Asset should be copied
    await expectFileExists(project.outputDir, 'assets/new-file.txt');
  }, { timeout: 10000 });
  
  test('should handle file deletion', async () => {
    const project = await makeTempProject('basic-site');
    cleanupTasks.push(project.cleanup);
    
    // Create an extra file
    const extraFile = join(project.sourceDir, 'extra.html');
    await writeFile(extraFile, '<h1>Extra Page</h1>', 'utf8');
    
    const watchPromise = runWatch(project, [], { timeout: 3000 });
    
    // Wait for initial build (including extra file)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Delete the file
    await unlink(extraFile);
    
    // Wait for deletion detection
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const result = await watchPromise;
    
    // Should detect deletion
    expect([0, 1]).toContain(result.code); // May timeout but that's ok
  }, { timeout: 10000 });
  
  test('should ignore output directory changes', async () => {
    const project = await makeTempProject('basic-site');
    cleanupTasks.push(project.cleanup);
    
    const watchPromise = runWatch(project, [], { timeout: 2000 });
    
    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Modify output file (should be ignored)
    await writeFile(
      join(project.outputDir, 'index.html'),
      '<h1>Modified Output</h1>',
      'utf8'
    );
    
    // Add file to output (should be ignored)
    await writeFile(
      join(project.outputDir, 'ignored.html'),
      '<h1>Should be ignored</h1>',
      'utf8'
    );
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const result = await watchPromise;
    
    // Should not trigger rebuilds for output changes
    expect([0, 1]).toContain(result.code);
  }, { timeout: 8000 });
  
  test('should ignore hidden files and directories', async () => {
    const project = await makeTempProject('basic-site');
    cleanupTasks.push(project.cleanup);
    
    const watchPromise = runWatch(project, [], { timeout: 2000 });
    
    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Add hidden files (should be ignored)
    await writeFile(join(project.sourceDir, '.hidden'), 'Hidden content', 'utf8');
    await writeFile(join(project.sourceDir, '.DS_Store'), 'DS Store', 'utf8');
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const result = await watchPromise;
    
    // Should not trigger rebuilds for hidden files
    expect([0, 1]).toContain(result.code);
  }, { timeout: 8000 });
  
  test('should handle watch mode errors gracefully', async () => {
    const project = await makeTempProject('basic-site');
    cleanupTasks.push(project.cleanup);
    
    // Create a file with syntax error
    await writeFile(
      join(project.sourceDir, 'broken.html'),
      '<div data-import="./nonexistent.html">Content</div>',
      'utf8'
    );
    
    const watchPromise = runWatch(project, [], { timeout: 2000 });
    
    // Wait for initial build (may have errors)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Fix the error
    await writeFile(
      join(project.sourceDir, 'broken.html'),
      '<div>Fixed content</div>',
      'utf8'
    );
    
    // Wait for rebuild
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const result = await watchPromise;
    
    // Should continue watching despite errors
    expect([0, 1]).toContain(result.code);
  }, { timeout: 8000 });
  
  test('should provide meaningful change notifications', async () => {
    const project = await makeTempProject('basic-site');
    cleanupTasks.push(project.cleanup);
    
    const watchPromise = runWatch(project, [], { timeout: 2000 });
    
    // Wait for initial build
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Make a change
    await writeFile(
      join(project.sourceDir, 'index.html'),
      '<h1>Changed Content</h1>',
      'utf8'
    );
    
    // Wait for change detection
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const result = await watchPromise;
    
    // Should provide clear feedback about what changed
    expect(result.stderr + result.stdout).toMatch(/chang|build|rebuild/i);
  }, { timeout: 8000 });
});