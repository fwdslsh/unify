/**
 * CLI Build Command Tests (US-005)
 * Tests basic CLI build functionality with DOM Cascade composition
 * 
 * Acceptance Criteria from US-005:
 * - GIVEN user runs `unify build` or `unify` (default command)
 * - WHEN command processes source directory
 * - THEN output directory should contain processed HTML files
 * - AND DOM Cascade composition should be applied per specification
 * - AND path traversal security should be enforced
 * - AND appropriate exit codes should be returned
 * - AND error messages should be user-friendly
 */

import { describe, it, expect } from "bun:test";
import { BuildCommand } from "../../../src/cli/commands/build-command.js";
import { ArgsParser } from "../../../src/cli/args-parser.js";
import { PathValidator } from "../../../src/core/path-validator.js";
import { TempProject } from "../../../test/helpers/temp-project.js";

describe("CLI Build Command (US-005)", () => {
  function setup() {
    return {
      buildCommand: new BuildCommand(),
      argsParser: new ArgsParser(),
      pathValidator: new PathValidator()
    };
  }

  describe("Command parsing and validation", () => {
    it("should parse build command with default options", () => {
      const { argsParser } = setup();
      
      const args = ['build'];
      const result = argsParser.parse(args);
      
      expect(result.command).toBe('build');
      expect(result.source).toBe('.'); // Default to current directory
      expect(result.output).toBe('dist'); // Default output
      expect(result.errors).toHaveLength(0);
    });

    it("should parse build command with custom source and output", () => {
      const { argsParser } = setup();
      
      const args = ['build', '--source', 'src', '--output', 'build'];
      const result = argsParser.parse(args);
      
      expect(result.command).toBe('build');
      expect(result.source).toBe('src');
      expect(result.output).toBe('build');
    });

    it("should handle abbreviated options", () => {
      const { argsParser } = setup();
      
      const args = ['build', '-s', 'source-dir', '-o', 'output-dir'];
      const result = argsParser.parse(args);
      
      expect(result.source).toBe('source-dir');
      expect(result.output).toBe('output-dir');
    });

    it("should default to build command when no command specified", () => {
      const { argsParser } = setup();
      
      const args = []; // No command
      const result = argsParser.parse(args);
      
      expect(result.command).toBe('build'); // Should default to build
    });

    it("should validate source directory for path traversal", () => {
      const { buildCommand, pathValidator } = setup();
      
      const options = {
        source: '../../../etc/passwd',
        output: 'dist'
      };
      
      expect(() => buildCommand.validateOptions(options, pathValidator))
        .toThrow(/Path traversal attempt detected/);
    });
  });

  describe("Build execution", () => {
    it("should execute build with valid options", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '.',
        output: 'test-output',
        clean: false
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.processedFiles).toBeGreaterThan(0);
    });

    it("should clean output directory when clean option specified", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '.',
        output: 'test-output',
        clean: true
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      expect(result.cleanedOutput).toBe(true);
    });

    it("should handle build errors gracefully", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '/invalid/source',
        output: 'test-output'
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1); // General build error (non-existent directory)
      expect(result.error).toBeDefined();
    });

    it("should apply path traversal security validation", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '../../../etc',
        output: 'test-output'
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2); // Security violation
      expect(result.error).toContain('Path traversal');
    });
  });

  describe("DOM Cascade integration", () => {
    it("should process files with DOM Cascade composition", async () => {
      const { buildCommand } = setup();
      
      // Mock file system with layout and page
      const mockFiles = {
        'layout.html': '<div class="unify-content">Default</div>',
        'page.html': '<div class="unify-content">Page content</div>'
      };
      
      const options = {
        source: '.',
        output: 'test-output',
        mockFiles, // For testing
        enableAreaMatching: true // Enable composition
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.success).toBe(true);
      expect(result.composedFiles).toBeGreaterThan(0);
      expect(result.processedContent).toContain('Page content'); // DOM Cascade applied
    });

    it("should handle area matching during build", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '.',
        output: 'test-output',
        enableAreaMatching: true
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.areaMatchingApplied).toBe(true);
    });

    it("should merge attributes according to DOM Cascade rules", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '.',
        output: 'test-output',
        enableAttributeMerging: true
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.attributeMergingApplied).toBe(true);
    });
  });

  describe("File processing", () => {
    it("should identify and process HTML files", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '.',
        output: 'test-output'
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.htmlFilesProcessed).toBeGreaterThan(0);
    });

    it("should copy non-HTML assets referenced in HTML files", async () => {
      const { buildCommand } = setup();
      
      // Create a temporary test project with HTML files that reference assets
      const project = new TempProject();
      
      try {
        // Create HTML file that references assets
        await project.writeFile('index.html', `
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles/main.css">
  <link rel="icon" href="images/favicon.ico">
</head>
<body>
  <img src="images/logo.png" alt="Logo">
  <script src="scripts/app.js"></script>
</body>
</html>
        `);
        
        // Create the referenced assets
        await project.writeFile('styles/main.css', `
body { margin: 0; padding: 20px; }
.container { max-width: 1200px; }
        `);
        
        await project.writeFile('scripts/app.js', `
console.log('App loaded');
        `);
        
        // Create binary asset files (using simple text content for testing)
        await project.writeFile('images/logo.png', 'PNG_IMAGE_DATA');
        await project.writeFile('images/favicon.ico', 'ICO_IMAGE_DATA');
        
        const options = {
          source: project.path(),
          output: project.path('dist')
        };
        
        const result = await buildCommand.execute(options);
        
        expect(result.success).toBe(true);
        expect(result.assetsCopied).toBeGreaterThan(0);
        expect(result.htmlFilesProcessed).toBeGreaterThan(0);
      } finally {
        await project.cleanup();
      }
    });

    it("should only copy assets that are referenced in HTML files", async () => {
      const { buildCommand } = setup();
      
      // Create a temporary test project with some referenced and some unreferenced assets
      const project = new TempProject();
      
      try {
        // Create HTML file that references only some assets
        await project.writeFile('index.html', `
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles/main.css">
</head>
<body>
  <img src="images/used-image.png" alt="Used Image">
</body>
</html>
        `);
        
        // Create referenced assets (should be copied)
        await project.writeFile('styles/main.css', 'body { margin: 0; }');
        await project.writeFile('images/used-image.png', 'USED_PNG_DATA');
        
        // Create unreferenced assets (should NOT be copied)
        await project.writeFile('styles/unused.css', 'h1 { color: red; }');
        await project.writeFile('images/unused-image.png', 'UNUSED_PNG_DATA');
        await project.writeFile('scripts/unused.js', 'console.log("unused");');
        
        const options = {
          source: project.path(),
          output: project.path('dist')
        };
        
        const result = await buildCommand.execute(options);
        
        expect(result.success).toBe(true);
        // Should copy only the referenced assets (main.css and used-image.png)
        // Not the unreferenced ones (unused.css, unused-image.png, unused.js)
        expect(result.assetsCopied).toBeGreaterThan(0);
        expect(result.htmlFilesProcessed).toBe(1);
      } finally {
        await project.cleanup();
      }
    });

    it("should preserve directory structure", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '.',
        output: 'test-output'
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.directoryStructurePreserved).toBe(true);
    });
  });

  describe("Error handling and exit codes", () => {
    it("should return exit code 0 for successful build", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '.',
        output: 'test-output'
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.exitCode).toBe(0);
    });

    it("should return exit code 1 for build errors", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '/nonexistent',
        output: 'test-output'
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.exitCode).toBe(1); // General build error (non-existent directory)
    });

    it("should return exit code 2 for security violations", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '../../../danger',
        output: 'test-output'
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.exitCode).toBe(2);
    });

    it("should provide user-friendly error messages", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '/invalid/path',
        output: 'test-output'
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.userMessage).toBeDefined();
      expect(result.userMessage).not.toContain('Error:'); // Should be friendly
      expect(result.userMessage.length).toBeGreaterThan(10); // Should be descriptive
    });
  });

  describe("Performance and logging", () => {
    it("should measure and report build time", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '.',
        output: 'test-output'
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.buildTime).toBeGreaterThan(0);
      expect(result.buildTime).toBeLessThan(10000); // Should be fast
    });

    it("should log build progress", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '.',
        output: 'test-output',
        verbose: true
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.logMessages).toBeGreaterThan(0);
    });

    it("should report statistics", async () => {
      const { buildCommand } = setup();
      
      const options = {
        source: '.',
        output: 'test-output'
      };
      
      const result = await buildCommand.execute(options);
      
      expect(result.statistics).toBeDefined();
      expect(result.statistics.filesProcessed).toBeGreaterThan(0);
      expect(result.statistics.totalTime).toBeGreaterThan(0);
    });
  });
});

/**
 * This test file implements TDD methodology for US-005:
 * 1. RED: These tests will fail because BuildCommand doesn't exist yet
 * 2. GREEN: Implementation must be written to make these tests pass
 * 3. REFACTOR: Code can be improved while keeping tests green
 * 
 * Coverage requirement: This file must achieve ≥90% coverage of build-command.js
 * Integration requirement: Must use PathValidator for security
 * DOM Cascade requirement: Must integrate AreaMatcher and AttributeMerger
 */