/**
 * Integration test for test infrastructure
 * Validates that test helpers work correctly
 */

import { test, expect, describe, afterEach } from 'bun:test';
import { makeTempProject, makeTempProjectFromStructure } from '../../helpers/temp-project.js';
import { runCLI, runBuild } from '../../helpers/cli-runner.js';
import { expectBuildSuccess, expectFileExists, expectFileContent } from '../../helpers/assertions.js';

const cleanupTasks = [];

afterEach(async () => {
  // Clean up any temp projects created during tests
  for (const cleanup of cleanupTasks) {
    await cleanup();
  }
  cleanupTasks.length = 0;
});

describe('Test Infrastructure Validation', () => {
  test('makeTempProject creates isolated environment', async () => {
    const project = await makeTempProject('basic-site');
    cleanupTasks.push(project.cleanup);
    
    // Verify directories exist
    expect(project.sourceDir).toBeDefined();
    expect(project.outputDir).toBeDefined();
    
    // Verify fixture was copied
    await expectFileExists(project.sourceDir, 'index.html');
    await expectFileExists(project.sourceDir, '_layout.html');
    await expectFileExists(project.sourceDir, 'assets/style.css');
  });
  
  test('makeTempProject applies overrides correctly', async () => {
    const overrides = {
      'test.html': '<h1>Test Override</h1>',
      'nested/file.txt': 'Nested content'
    };
    
    const project = await makeTempProject('basic-site', overrides);
    cleanupTasks.push(project.cleanup);
    
    // Verify overrides were applied
    await expectFileContent(project.sourceDir, 'test.html', '<h1>Test Override</h1>');
    await expectFileContent(project.sourceDir, 'nested/file.txt', 'Nested content');
  });
  
  test('makeTempProjectFromStructure creates custom structure', async () => {
    const structure = {
      'index.html': '<h1>Test Page</h1>',
      'sub': {
        'page.html': '<p>Sub page</p>',
        'data.json': '{"test": true}'
      },
      'assets': {
        'style.css': 'body { margin: 0; }'
      }
    };
    
    const project = await makeTempProjectFromStructure(structure);
    cleanupTasks.push(project.cleanup);
    
    // Verify structure was created
    await expectFileContent(project.sourceDir, 'index.html', '<h1>Test Page</h1>');
    await expectFileContent(project.sourceDir, 'sub/page.html', '<p>Sub page</p>');
    await expectFileContent(project.sourceDir, 'sub/data.json', '{"test": true}');
    await expectFileContent(project.sourceDir, 'assets/style.css', 'body { margin: 0; }');
  });
  
  test('runCLI executes commands correctly', async () => {
    const result = await runCLI(['--help']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage');
    expect(result.duration).toBeGreaterThan(0);
  });
  
  test('runBuild helper works with basic site', async () => {
    const project = await makeTempProject('basic-site');
    cleanupTasks.push(project.cleanup);
    
    const result = await runBuild(project);
    
    expectBuildSuccess(result);
    expect(result.duration).toBeGreaterThan(0);
  }, { timeout: 10000 });
  
  test('cleanup removes temporary directories', async () => {
    const project = await makeTempProject('basic-site');
    
    // Verify project exists
    await expectFileExists(project.sourceDir, 'index.html');
    
    // Clean up
    await project.cleanup();
    
    // Verify cleanup worked (this should not throw)
    const { stat } = await import('fs/promises');
    let exists = true;
    try {
      await stat(project.tempBase);
    } catch (error) {
      if (error.code === 'ENOENT') {
        exists = false;
      }
    }
    expect(exists).toBe(false);
  });
});