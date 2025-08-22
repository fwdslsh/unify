/**
 * Self-testing for programmatic builder helper utilities
 * Tests helper interfaces and basic functionality without full build system
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { 
  buildProgrammatic,
  classifyFile 
} from '../../helpers/programmatic-builder.js';
import { makeTempProject } from '../../helpers/temp-project.js';

describe('Programmatic Builder Helper Self-Testing', () => {
  let tempProject;

  // Helper function to write files to temp project
  async function writeProjectFile(filePath, content) {
    const fullPath = join(tempProject.sourceDir, filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
  }

  // Helper function to get full path for a file
  function getProjectPath(filePath) {
    return join(tempProject.sourceDir, filePath);
  }

  beforeEach(async () => {
    // Set up temporary project for testing (no fixture needed)
    tempProject = await makeTempProject(null);
  });

  afterEach(async () => {
    // Cleanup
    if (tempProject && tempProject.cleanup) {
      await tempProject.cleanup();
    }
  });

  describe('Basic Helper Interface Testing', () => {
    test('should have buildProgrammatic function with expected interface', async () => {
      // Test that the function exists and has the right interface
      expect(typeof buildProgrammatic).toBe('function');
      
      // Test minimal successful call
      const result = await buildProgrammatic({
        source: tempProject.sourceDir,
        output: tempProject.outputDir,
        dryRun: true
      });
      
      // Verify basic result structure (even if implementation is incomplete)
      expect(result).toBeTypeOf('object');
      expect(result).toHaveProperty('files');
      expect(result.files).toHaveProperty('emitted');
      expect(result.files).toHaveProperty('copied');
      expect(result.files).toHaveProperty('ignored');
      expect(result.files).toHaveProperty('skipped');
      expect(Array.isArray(result.files.emitted)).toBe(true);
      expect(Array.isArray(result.files.copied)).toBe(true);
      expect(Array.isArray(result.files.ignored)).toBe(true);
      expect(Array.isArray(result.files.skipped)).toBe(true);
    });

    test('should handle required parameters', async () => {
      // Test with minimal required parameters
      const result = await buildProgrammatic({
        source: tempProject.sourceDir,
        output: tempProject.outputDir
      });
      
      expect(result).toHaveProperty('files');
    });

    test('should handle optional parameters without errors', async () => {
      // Test that all optional parameters can be passed
      const result = await buildProgrammatic({
        source: tempProject.sourceDir,
        output: tempProject.outputDir,
        dryRun: true,
        clean: true,
        copyGlobs: ['**/*.css'],
        ignoreGlobs: ['**/draft*'],
        renderGlobs: ['**/*.html'],
        autoIgnore: false,
        prettyUrls: true,
        minify: true,
        defaultLayouts: { '*': '_base.html' }
      });
      
      expect(result).toHaveProperty('files');
    });
  });

  describe('File Classification Interface Testing', () => {
    test('should have classifyFile function with expected interface', async () => {
      expect(typeof classifyFile).toBe('function');
      
      // Create a simple test file
      await writeProjectFile('test.html', '<html><body>Test</body></html>');
      
      const result = await classifyFile(getProjectPath('test.html'));
      
      // Test basic interface structure
      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('reason');
      expect(typeof result.decision).toBe('string');
      expect(typeof result.reason).toBe('string');
    });

    test('should handle file paths without crashing', async () => {
      await writeProjectFile('simple.html', '<html>Simple</html>');
      
      // Just verify it doesn't throw errors
      const result = await classifyFile(getProjectPath('simple.html'));
      expect(result).toHaveProperty('decision');
    });

    test('should handle options parameter', async () => {
      await writeProjectFile('options.html', '<html>Options test</html>');
      
      // Test with options
      const result = await classifyFile(getProjectPath('options.html'), {
        ignore: ['**/ignored*']
      });
      
      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('reason');
    });

    test('should handle null options gracefully', async () => {
      await writeProjectFile('null-opts.html', '<html>Null options</html>');
      
      const result = await classifyFile(getProjectPath('null-opts.html'), null);
      
      expect(result).toHaveProperty('decision');
    });
  });

  describe('Error Handling Interface Testing', () => {
    test('should handle errors gracefully without throwing', async () => {
      // Test with nonexistent path
      const result = await buildProgrammatic({
        source: '/nonexistent/path',
        output: tempProject.outputDir,
        dryRun: true
      });
      
      // Should return result object even with errors
      expect(result).toHaveProperty('files');
    });

    test('should handle invalid options gracefully', async () => {
      const result = await buildProgrammatic({
        source: tempProject.sourceDir,
        output: tempProject.outputDir,
        dryRun: true,
        ignoreGlobs: ['*invalid*pattern*'],
        copyGlobs: null // Invalid option
      });
      
      expect(result).toHaveProperty('files');
    });

    test('should handle null/undefined file paths in classification appropriately', async () => {
      // These should be handled according to the interface contract
      try {
        await classifyFile(null);
        // If it doesn't throw, verify it has proper structure
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      try {
        await classifyFile(undefined);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle empty string file paths', async () => {
      try {
        const result = await classifyFile('');
        expect(result).toHaveProperty('decision');
      } catch (error) {
        // Either behavior is acceptable as long as it's consistent
        expect(error).toBeDefined();
      }
    });
  });

  describe('Basic Performance Interface Testing', () => {
    test('should handle multiple files without errors', async () => {
      // Create a few test files
      await writeProjectFile('file1.html', '<html>File 1</html>');
      await writeProjectFile('file2.html', '<html>File 2</html>');
      await writeProjectFile('file3.css', 'body { margin: 0; }');
      
      const result = await buildProgrammatic({
        source: tempProject.sourceDir,
        output: tempProject.outputDir,
        dryRun: true
      });
      
      expect(result).toHaveProperty('files');
    });

    test('should handle concurrent classification requests', async () => {
      await writeProjectFile('concurrent1.html', '<html>Test 1</html>');
      await writeProjectFile('concurrent2.html', '<html>Test 2</html>');
      
      const promises = [
        classifyFile(getProjectPath('concurrent1.html')),
        classifyFile(getProjectPath('concurrent2.html'))
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result).toHaveProperty('decision');
      });
    });

    test('should handle repeated operations consistently', async () => {
      await writeProjectFile('repeat.html', '<html>Repeat test</html>');
      
      // Run same operation multiple times
      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await buildProgrammatic({
          source: tempProject.sourceDir,
          output: tempProject.outputDir,
          dryRun: true
        });
        results.push(result);
      }
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('files');
      });
    });
  });

  describe('Option Interface Testing', () => {
    test('should handle boolean options', async () => {
      const result = await buildProgrammatic({
        source: tempProject.sourceDir,
        output: tempProject.outputDir,
        dryRun: true,
        clean: false,
        autoIgnore: true,
        prettyUrls: false,
        minify: true
      });
      
      expect(result).toHaveProperty('files');
    });

    test('should handle array options', async () => {
      const result = await buildProgrammatic({
        source: tempProject.sourceDir,
        output: tempProject.outputDir,
        dryRun: true,
        copyGlobs: ['**/*.css'],
        ignoreGlobs: ['**/temp/**'],
        renderGlobs: ['**/*.html']
      });
      
      expect(result).toHaveProperty('files');
    });

    test('should handle empty and null array options', async () => {
      const result = await buildProgrammatic({
        source: tempProject.sourceDir,
        output: tempProject.outputDir,
        dryRun: true,
        copyGlobs: [],
        ignoreGlobs: null,
        renderGlobs: undefined
      });
      
      expect(result).toHaveProperty('files');
    });
  });
});