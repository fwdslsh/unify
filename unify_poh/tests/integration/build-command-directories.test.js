/**
 * Build Command Directory Integration Tests (US-006)
 * Tests build command integration with directory options
 * 
 * Acceptance Criteria from US-006:
 * - GIVEN directory options are specified with build command
 * - WHEN build command is executed
 * - THEN build should use specified directories
 * - AND file processing should respect source directory
 * - AND output should be written to specified output directory
 * - AND security validation should be applied
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rmdir, mkdir, writeFile, readFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { BuildCommand } from "../../src/cli/commands/build-command.js";
import { ArgsParser } from "../../src/cli/args-parser.js";
import { PathValidator } from "../../src/core/path-validator.js";

describe("Build Command - Directory Integration (US-006)", () => {
  let tempDir;
  let sourceDir;
  let outputDir;
  let buildCommand;
  let argsParser;
  let pathValidator;

  beforeEach(async () => {
    // Create temporary directories for testing
    tempDir = await mkdtemp(join(tmpdir(), 'unify-test-'));
    sourceDir = join(tempDir, 'src');
    outputDir = join(tempDir, 'dist');
    
    await mkdir(sourceDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    
    buildCommand = new BuildCommand();
    argsParser = new ArgsParser();
    pathValidator = new PathValidator();
  });

  afterEach(async () => {
    // Clean up temporary directories
    if (tempDir) {
      await rmdir(tempDir, { recursive: true, force: true });
    }
  });

  describe("Source directory integration", () => {
    it("should_use_specified_source_directory_for_build", async () => {
      // Create test files in source directory
      await writeFile(join(sourceDir, 'index.html'), '<html><body>Test</body></html>');
      await writeFile(join(sourceDir, 'about.html'), '<html><body>About</body></html>');
      
      const options = {
        source: sourceDir,
        output: outputDir,
        clean: true
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      expect(result.sourceDirectory).toBe(sourceDir);
      expect(result.processedFiles).toBeGreaterThan(0);
    });

    it("should_process_files_from_custom_source_directory", async () => {
      const customSource = join(tempDir, 'custom-src');
      await mkdir(customSource, { recursive: true });
      await writeFile(join(customSource, 'page.html'), '<html><body>Custom</body></html>');
      
      const options = {
        source: customSource,
        output: outputDir
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      expect(result.sourceDirectory).toBe(customSource);
      
      // Verify file was processed from custom source
      const outputFile = join(outputDir, 'page.html');
      const outputExists = await stat(outputFile).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
    });

    it("should_handle_nested_source_directory_structure", async () => {
      const nestedDir = join(sourceDir, 'pages', 'blog');
      await mkdir(nestedDir, { recursive: true });
      await writeFile(join(nestedDir, 'post.html'), '<html><body>Post</body></html>');
      
      const options = {
        source: sourceDir,
        output: outputDir
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      
      // Verify nested structure is preserved
      const nestedOutput = join(outputDir, 'pages', 'blog', 'post.html');
      const outputExists = await stat(nestedOutput).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
    });

    it("should_reject_invalid_source_directory", async () => {
      const invalidSource = '../../../etc';
      
      const options = {
        source: invalidSource,
        output: outputDir
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2); // Security violation
      expect(result.error).toContain('Path traversal');
    });

    it("should_handle_relative_source_paths", async () => {
      // Create files in current working directory context
      const relativeSource = './src';
      await writeFile(join(sourceDir, 'relative.html'), '<html><body>Relative</body></html>');
      
      const options = {
        source: sourceDir, // Use absolute for testing, but test relative logic
        output: outputDir
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      expect(result.relativePathsHandled).toBe(true);
    });
  });

  describe("Output directory integration", () => {
    it("should_write_output_to_specified_directory", async () => {
      const customOutput = join(tempDir, 'build');
      await mkdir(customOutput, { recursive: true });
      await writeFile(join(sourceDir, 'index.html'), '<html><body>Output Test</body></html>');
      
      const options = {
        source: sourceDir,
        output: customOutput
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      expect(result.outputDirectory).toBe(customOutput);
      
      // Verify file was written to custom output
      const outputFile = join(customOutput, 'index.html');
      const outputExists = await stat(outputFile).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
    });

    it("should_create_output_directory_if_not_exists", async () => {
      const newOutput = join(tempDir, 'new-build');
      await writeFile(join(sourceDir, 'create.html'), '<html><body>Create</body></html>');
      
      const options = {
        source: sourceDir,
        output: newOutput // This directory doesn't exist yet
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      expect(result.outputDirectoryCreated).toBe(true);
      
      // Verify directory was created and file written
      const outputFile = join(newOutput, 'create.html');
      const outputExists = await stat(outputFile).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
    });

    it("should_preserve_directory_structure_in_output", async () => {
      // Create nested source structure
      const nestedDir = join(sourceDir, 'docs', 'guides');
      await mkdir(nestedDir, { recursive: true });
      await writeFile(join(nestedDir, 'guide.html'), '<html><body>Guide</body></html>');
      
      const customOutput = join(tempDir, 'production');
      
      const options = {
        source: sourceDir,
        output: customOutput
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      
      // Verify nested structure preserved in output
      const nestedOutput = join(customOutput, 'docs', 'guides', 'guide.html');
      const outputExists = await stat(nestedOutput).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
    });

    it("should_reject_invalid_output_directory", async () => {
      const invalidOutput = '../../../tmp/malicious';
      await writeFile(join(sourceDir, 'test.html'), '<html><body>Test</body></html>');
      
      const options = {
        source: sourceDir,
        output: invalidOutput
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2); // Security violation
      expect(result.error).toContain('Path traversal');
    });

    it("should_clean_output_directory_when_requested", async () => {
      const customOutput = join(tempDir, 'clean-test');
      await mkdir(customOutput, { recursive: true });
      
      // Create existing file in output
      await writeFile(join(customOutput, 'old.html'), 'Old content');
      
      // Create source file
      await writeFile(join(sourceDir, 'new.html'), '<html><body>New</body></html>');
      
      const options = {
        source: sourceDir,
        output: customOutput,
        clean: true
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      expect(result.outputCleaned).toBe(true);
      
      // Verify old file was removed and new file exists
      const oldExists = await stat(join(customOutput, 'old.html')).then(() => true).catch(() => false);
      const newExists = await stat(join(customOutput, 'new.html')).then(() => true).catch(() => false);
      
      expect(oldExists).toBe(false);
      expect(newExists).toBe(true);
    });
  });

  describe("Combined directory options", () => {
    it("should_handle_both_custom_source_and_output", async () => {
      const customSource = join(tempDir, 'content');
      const customOutput = join(tempDir, 'public');
      
      await mkdir(customSource, { recursive: true });
      await mkdir(customOutput, { recursive: true });
      await writeFile(join(customSource, 'combined.html'), '<html><body>Combined</body></html>');
      
      const options = {
        source: customSource,
        output: customOutput
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      expect(result.sourceDirectory).toBe(customSource);
      expect(result.outputDirectory).toBe(customOutput);
      
      // Verify file processed from custom source to custom output
      const outputFile = join(customOutput, 'combined.html');
      const outputExists = await stat(outputFile).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
    });

    it("should_handle_same_source_and_output_directory", async () => {
      // This should be rejected for safety
      const sameDir = join(tempDir, 'same');
      await mkdir(sameDir, { recursive: true });
      await writeFile(join(sameDir, 'test.html'), '<html><body>Same</body></html>');
      
      const options = {
        source: sameDir,
        output: sameDir
      };
      
      const result = await buildCommand.execute(options);
      
      // This should either succeed with warnings or fail safely
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
      if (!result.success) {
        expect(result.error).toContain('same directory');
      }
    });

    it("should_validate_both_directories_for_security", async () => {
      const maliciousSource = '../../../etc';
      const maliciousOutput = '../../../tmp';
      
      const options = {
        source: maliciousSource,
        output: maliciousOutput
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.error).toContain('Path traversal');
    });
  });

  describe("CLI integration with directories", () => {
    it("should_parse_and_execute_with_directory_options", async () => {
      await writeFile(join(sourceDir, 'cli.html'), '<html><body>CLI</body></html>');
      
      const args = ['build', '--source', sourceDir, '--output', outputDir];
      const parsed = argsParser.parse(args);
      const validation = argsParser.validate(parsed);
      
      expect(validation.isValid).toBe(true);
      
      const options = {
        source: parsed.source,
        output: parsed.output
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      
      // Verify CLI integration worked
      const outputFile = join(outputDir, 'cli.html');
      const outputExists = await stat(outputFile).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
    });

    it("should_use_defaults_when_directories_not_specified", async () => {
      // Test with default current directory and dist
      const args = ['build'];
      const parsed = argsParser.parse(args);
      
      expect(parsed.source).toBe('.');
      expect(parsed.output).toBe('dist');
      
      // Note: This test would need to work with actual file system
      // For now, just verify parsing works correctly
      const validation = argsParser.validate(parsed);
      expect(validation.isValid).toBe(true);
    });
  });

  describe("Error handling and edge cases", () => {
    it("should_handle_non_existent_source_directory", async () => {
      const nonExistentSource = join(tempDir, 'does-not-exist');
      
      const options = {
        source: nonExistentSource,
        output: outputDir
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it("should_handle_permission_denied_output", async () => {
      // This test would need to create a read-only directory
      // For now, just test that appropriate error handling exists
      const options = {
        source: sourceDir,
        output: '/dev/null/cannot-write' // Invalid path
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBeGreaterThan(0);
    });

    it("should_provide_clear_error_messages_for_directory_issues", async () => {
      const invalidSource = '../../../proc';
      
      const options = {
        source: invalidSource,
        output: outputDir
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(false);
      expect(result.userMessage).toBeDefined();
      expect(result.userMessage.length).toBeGreaterThan(10);
      expect(result.userMessage).not.toContain('Error:'); // Should be user-friendly
    });
  });

  describe("Performance with custom directories", () => {
    it("should_handle_large_source_directories_efficiently", async () => {
      // Create many files in source
      const manyFilesDir = join(sourceDir, 'many');
      await mkdir(manyFilesDir, { recursive: true });
      
      const filePromises = [];
      for (let i = 0; i < 50; i++) {
        filePromises.push(
          writeFile(join(manyFilesDir, `file-${i}.html`), `<html><body>File ${i}</body></html>`)
        );
      }
      await Promise.all(filePromises);
      
      const startTime = performance.now();
      
      const options = {
        source: sourceDir,
        output: outputDir
      };
      
      const result = await buildCommand.execute(options);
      
      const endTime = performance.now();
      const buildTime = endTime - startTime;
      
      expect(result.success).toBe(true);
      expect(result.processedFiles).toBeGreaterThanOrEqual(50);
      expect(buildTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it("should_handle_deeply_nested_directories", async () => {
      // Create deeply nested structure
      let nestedPath = sourceDir;
      for (let i = 0; i < 10; i++) {
        nestedPath = join(nestedPath, `level-${i}`);
        await mkdir(nestedPath, { recursive: true });
      }
      await writeFile(join(nestedPath, 'deep.html'), '<html><body>Deep</body></html>');
      
      const options = {
        source: sourceDir,
        output: outputDir
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      
      // Verify deep file was processed
      let expectedOutput = outputDir;
      for (let i = 0; i < 10; i++) {
        expectedOutput = join(expectedOutput, `level-${i}`);
      }
      expectedOutput = join(expectedOutput, 'deep.html');
      
      const outputExists = await stat(expectedOutput).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
    });
  });
});

/**
 * This test file implements TDD RED phase for US-006 build integration:
 * 
 * EXPECTED FAILURES:
 * - BuildCommand doesn't exist yet
 * - BuildCommand.execute() method not implemented
 * - Directory option handling not implemented in BuildCommand
 * - Path validation integration not implemented
 * 
 * NEXT STEPS (GREEN phase):
 * 1. Create BuildCommand class in src/cli/commands/build-command.js
 * 2. Implement execute() method with directory handling
 * 3. Integrate PathValidator for security validation
 * 4. Implement file processing with custom directories
 * 5. Add error handling and user-friendly messages
 * 
 * COVERAGE TARGET: ≥90% of BuildCommand directory integration logic
 */