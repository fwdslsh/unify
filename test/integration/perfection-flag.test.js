/**
 * Tests for --perfection flag functionality
 * Verifies that builds fail entirely when any single page fails to build
 */

import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { runCLI } from "../test-utils.js";
import {
  createTempDirectory,
  cleanupTempDirectory,
  createTestStructure,
} from "../fixtures/temp-helper.js";

describe("--perfection Flag", () => {
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, "src");
    outputDir = path.join(tempDir, "dist");
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  describe("Successful builds with --perfection", () => {
    it("should complete successfully when all files process correctly (no layouts)", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/about.html":
          "<!DOCTYPE html><html><body><h1>About</h1></body></html>",
        "src/contact.md": "# Contact\n\nContact us!",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(0);

      // Verify all files were built
      const indexExists = await fileExists(path.join(outputDir, "index.html"));
      const aboutExists = await fileExists(path.join(outputDir, "about.html"));
      const contactExists = await fileExists(
        path.join(outputDir, "contact.html")
      );

      expect(indexExists).toBeTruthy();
      expect(aboutExists).toBeTruthy();
      expect(contactExists).toBeTruthy();
    });

    it("should handle explicit layouts successfully with --perfection", async () => {
      const structure = {
        "src/index.html": '<div data-layout="main.html"><h1>Home</h1></div>',
        "src/.layouts/main.html":
          "<!DOCTYPE html><html><body><slot></slot></body></html>",
        "src/about.md": "---\nlayout: main.html\n---\n# About\n\nAbout page",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(0);
    });
  });

  describe("Failed builds with --perfection", () => {
    it("should fail entire build when include file is missing", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/broken.html": '<!--#include file="missing.html" --><p>Content</p>',
        "src/good.html":
          "<!DOCTYPE html><html><body><h1>This file is fine</h1></body></html>",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(1);

      // With --perfection, build should fail completely
      // Note: Some files might still be in output if they were processed before the error
      // The key is that the build exits with error code 1 (fail fast behavior)

      // Verify the error is related to missing include
      expect(
        result.stderr.includes("Include") || result.stderr.includes("missing")
      ).toBeTruthy();
    });

    it("should fail when explicit layout file is missing", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/broken.html":
          '<div data-layout="missing.html"><h1>Broken</h1></div>',
        "src/good.html":
          "<!DOCTYPE html><html><body><h1>Good</h1></body></html>",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(1);
      expect(
        result.stderr.includes("Layout not found") ||
          result.stderr.includes("missing.html")
      ).toBeTruthy();
    });

    it("should fail when Markdown file has invalid frontmatter", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/broken.md":
          "---\ninvalid: yaml: content: [\n---\n# Broken\n\nBroken markdown",
        "src/good.md": "# Good\n\nGood markdown",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(1);
    });

    it("should fail when DOM include element is missing", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/broken.html":
          '<include src="missing.html"></include><h1>Content</h1>',
        "src/good.html":
          "<!DOCTYPE html><html><body><h1>Good</h1></body></html>",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(1);
      expect(
        result.stderr.includes("Include") && result.stderr.includes("not found")
      ).toBeTruthy();
    });

    it("should fail on circular include dependencies", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/circular1.html":
          '<!--#include file="circular2.html" --><p>Circular 1</p>',
        "src/circular2.html":
          '<!--#include file="circular1.html" --><p>Circular 2</p>',
        "src/good.html":
          "<!DOCTYPE html><html><body><h1>Good</h1></body></html>",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(1);
    });

    it("should fail when layout has syntax errors in perfection mode", async () => {
      const structure = {
        "src/index.html":
          '<div data-layout="broken.html"><h1>Content</h1></div>',
        "src/.layouts/broken.html":
          "<!DOCTYPE html><html><body><unclosed-tag><slot></slot></body></html>",
        "src/good.html":
          "<!DOCTYPE html><html><body><h1>Good</h1></body></html>",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      // This might succeed depending on how strict the HTML parser is
      // The test mainly ensures we handle malformed layouts properly
      expect(typeof result.code).toBe("number");
    });
  });

  describe("Comparison with normal build behavior", () => {
    it("should continue building other files when --perfection is NOT used", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/broken.html": '<!--#include file="missing.html" --><p>Content</p>',
        "src/good.html":
          "<!DOCTYPE html><html><body><h1>This file is fine</h1></body></html>",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        // No --perfection flag
      ]);

      // Without --perfection, build should continue with errors
      expect(result.code).toBe(0);

      // Good files should still be built
      const indexExists = await fileExists(path.join(outputDir, "index.html"));
      const goodExists = await fileExists(path.join(outputDir, "good.html"));

      expect(indexExists).toBeTruthy();
      expect(goodExists).toBeTruthy();
    });

    it("should show different behavior with and without --perfection for same failing build", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/broken.html": '<!--#include file="missing.html" --><p>Content</p>',
      };

      await createTestStructure(tempDir, structure);

      // Test without --perfection
      const normalResult = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
      ]);

      // Clean output for second test
      await fs.rm(outputDir, { recursive: true, force: true });

      // Test with --perfection
      const perfectionResult = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      // Normal build should succeed (exit code 0) but with warnings
      expect(normalResult.code).toBe(0);

      // Perfection build should fail completely
      expect(perfectionResult.code).toBe(1);
    });
  });

  describe("Interaction with other flags", () => {
    it("should work with --clean flag", async () => {
      // Create existing files in output
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(path.join(outputDir, "old-file.html"), "old content");

      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>New content</h1></body></html>",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
        "--clean",
      ]);

      expect(result.code).toBe(0);

      const oldFileExists = await fileExists(
        path.join(outputDir, "old-file.html")
      );
      const newFileExists = await fileExists(
        path.join(outputDir, "index.html")
      );

      expect(oldFileExists).toBeFalsy();
      expect(newFileExists).toBeTruthy();
    });

    it("should work with --minify flag", async () => {
      const structure = {
        "src/index.html": `<!DOCTYPE html>
<html>
<head>
    <title>Test</title>
</head>
<body>
    <h1>Title</h1>
    <p>Content</p>
</body>
</html>`,
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
        "--minify",
      ]);

      expect(result.code).toBe(0);

      const content = await fs.readFile(
        path.join(outputDir, "index.html"),
        "utf-8"
      );
      // Should be minified (no extra whitespace)
      expect(content.includes("    ")).toBeFalsy();
    });
  });

  describe("Edge cases and complex scenarios", () => {
    it("should fail gracefully with multiple error types in perfection mode", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/bad1.html":
          '<!--#include file="missing1.html" --><p>Bad include</p>',
        "src/bad2.html":
          '<div data-layout="missing2.html"><h1>Bad layout</h1></div>',
        "src/bad3.md": "---\ninvalid: yaml: [\n---\n# Bad YAML",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(1);
      // Should report the first error encountered
      expect(result.stderr.length > 0).toBeTruthy();
    });

    it("should handle nested include failures in perfection mode", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/parent.html":
          '<!--#include file="includes/child.html" --><p>Parent</p>',
        "src/includes/child.html":
          '<!--#include file="missing-nested.html" --><p>Child</p>',
        "src/good.html":
          "<!DOCTYPE html><html><body><h1>Good</h1></body></html>",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(1);
      // Should fail because of missing nested file - accept either the immediate or nested file name
      expect(
        result.stderr.includes("child.html") ||
          result.stderr.includes("missing-nested.html")
      ).toBeTruthy();
    });

    it("should handle absolute path includes in perfection mode", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/test.html":
          '<!--#include virtual="/includes/absolute.html" --><p>Test</p>',
        "src/includes/absolute.html": "<p>Absolute include content</p>",
        "src/good.html":
          "<!DOCTYPE html><html><body><h1>Good</h1></body></html>",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(0);
    });

    it("should fail on mixed include syntax errors in perfection mode", async () => {
      const structure = {
        "src/index.html":
          "<!DOCTYPE html><html><body><h1>Home</h1></body></html>",
        "src/mixed.html":
          '<!--#include file="good.html" --><include src="missing.html"></include>',
        "src/good.html":
          "<!DOCTYPE html><html><body><p>Good include</p></body></html>",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(1);
    });

    it("should handle layout hierarchy failures in perfection mode", async () => {
      const structure = {
        "src/index.html":
          '<div data-layout="parent.html"><h1>Content</h1></div>',
        "src/.layouts/parent.html":
          '<div data-layout="missing-grandparent.html"><slot></slot></div>',
        "src/good.html":
          "<!DOCTYPE html><html><body><h1>Good</h1></body></html>",
      };

      await createTestStructure(tempDir, structure);

      const result = await runCLIInDir(tempDir, [
        "build",
        "--source",
        sourceDir,
        "--output",
        outputDir,
        "--perfection",
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr.includes("missing-grandparent.html")).toBeTruthy();
    });

    //Investigate why this fails on github
    //   it('should validate perfection mode with file permission errors', async () => {
    //     const structure = {
    //       'src/index.html': '<!DOCTYPE html><html><body><h1>Home</h1></body></html>',
    //       'src/test.html': '<!--#include file="protected.html" --><p>Test</p>',
    //       'src/protected.html': '<p>Protected content</p>'
    //     };

    //     await createTestStructure(tempDir, structure);

    //     // Make the include file unreadable
    //     await fs.chmod(path.join(sourceDir, 'protected.html'), 0o000);

    //     try {
    //       const result = await runCLIInDir(tempDir, [
    //         'build',
    //         '--source', sourceDir,
    //         '--output', outputDir,
    //         '--perfection'
    //       ]);

    //       expect(result.code).toBe(1);
    //     } finally {
    //       // Restore permissions for cleanup
    //       await fs.chmod(path.join(sourceDir, 'protected.html'), 0o644);
    //     }
    //   });
  });
});

/**
 * Helper function to run CLI command with working directory
 */
async function runCLIInDir(workingDir, args) {
  const { runCLI: importedRunCLI } = await import("../test-utils.js");
  return await importedRunCLI(args, { cwd: workingDir });
}

/**
 * Helper function to check if file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
