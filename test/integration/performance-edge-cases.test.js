/**
 * Performance and Edge Cases Test Suite
 * Tests system limits, performance characteristics, and unusual scenarios
 */

import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { processIncludes } from "../../src/core/include-processor.js";
import { processHtmlUnified } from "../../src/core/unified-html-processor.js";
import { DependencyTracker } from "../../src/core/dependency-tracker.js";
import {
  createTempDirectory,
  cleanupTempDirectory,
  createTestStructure,
} from "../fixtures/temp-helper.js";

describe("Performance and Edge Cases", () => {
  let tempDir;
  let sourceDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, "src");
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  describe("Performance Tests", () => {
    it("should handle large HTML files efficiently", async () => {
      // Create a large HTML file (1MB+)
      const largeContent = `<!DOCTYPE html>
<html>
<head><title>Large File Test</title></head>
<body>
${"<p>This is paragraph content that repeats many times to create a large file. ".repeat(
  15000
)}
<!--#include virtual="/components/footer.html" -->
</body>
</html>`;

      const structure = {
        "large.html": largeContent,
        "components/footer.html": "<footer>Footer content</footer>",
      };

      await createTestStructure(sourceDir, structure);

      const startTime = Date.now();

      const result = await processIncludes(
        largeContent,
        path.join(sourceDir, "large.html"),
        sourceDir
      );

      const processingTime = Date.now() - startTime;

      expect(result.includes("<footer>Footer content</footer>")).toBeTruthy();
      expect(processingTime).toBeLessThan(5000);
      expect(result.length).toBeGreaterThan(1000000);
    });

    it("should handle many small includes efficiently", async () => {
      const structure = {
        "index.html": Array.from(
          { length: 100 },
          (_, i) => `<!--#include virtual="/components/item-${i}.html" -->`
        ).join("\n"),
      };

      // Create 100 small include files
      for (let i = 0; i < 100; i++) {
        structure[
          `components/item-${i}.html`
        ] = `<div class="item-${i}">Item ${i}</div>`;
      }

      await createTestStructure(sourceDir, structure);

      const startTime = Date.now();

      const result = await processIncludes(
        structure["index.html"],
        path.join(sourceDir, "index.html"),
        sourceDir
      );

      const processingTime = Date.now() - startTime;

      expect(result.includes('<div class="item-0">')).toBeTruthy();
      expect(result.includes('<div class="item-99">')).toBeTruthy();
      expect(processingTime).toBeLessThan(10000);
    });

    it("should handle deep nesting efficiently", async () => {
      const maxDepth = 8; // Stay within MAX_INCLUDE_DEPTH limit of 10
      const structure = {};

      // Create deep nesting chain
      for (let i = 0; i < maxDepth; i++) {
        const nextInclude =
          i < maxDepth - 1
            ? `<!--#include virtual="/components/level-${i + 1}.html" -->`
            : "<p>Final level reached</p>";

        structure[`components/level-${i}.html`] = `<div class="level-${i}">
  Level ${i}
  ${nextInclude}
</div>`;
      }

      structure["index.html"] =
        '<!--#include virtual="/components/level-0.html" -->';

      await createTestStructure(sourceDir, structure);

      const startTime = Date.now();

      const result = await processIncludes(
        structure["index.html"],
        path.join(sourceDir, "index.html"),
        sourceDir
      );

      const processingTime = Date.now() - startTime;

      expect(result.includes("Level 0")).toBeTruthy();
      expect(result.includes(`Level ${maxDepth - 1}`)).toBeTruthy();
      expect(result.includes("Final level reached")).toBeTruthy();
      expect(processingTime).toBeLessThan(5000);
    });

    it("should handle large dependency graphs efficiently", async () => {
      const structure = {};
      const numComponents = 200;

      // Create a complex dependency graph
      // Each page includes multiple components
      for (let page = 0; page < 10; page++) {
        const includes = Array.from({ length: 20 }, (_, i) => {
          const componentId = (page * 20 + i) % numComponents;
          return `<!--#include virtual="/components/comp-${componentId}.html" -->`;
        }).join("\n");

        structure[`page-${page}.html`] = `<h1>Page ${page}</h1>\n${includes}`;
      }

      // Create components
      for (let i = 0; i < numComponents; i++) {
        structure[
          `components/comp-${i}.html`
        ] = `<div class="component-${i}">Component ${i}</div>`;
      }

      await createTestStructure(sourceDir, structure);

      const dependencyTracker = new DependencyTracker();
      const startTime = Date.now();

      // Process all pages and track dependencies
      for (let page = 0; page < 10; page++) {
        const pageContent = structure[`page-${page}.html`];
        const pagePath = path.join(sourceDir, `page-${page}.html`);

        // First analyze the page to extract dependencies
        dependencyTracker.analyzePage(pagePath, pageContent, sourceDir);

        const result = await processIncludes(
          pageContent,
          pagePath,
          sourceDir,
          new Set(), // processedFiles
          0, // depth
          dependencyTracker // Pass the dependency tracker
        );

        expect(result.includes(`Page ${page}`)).toBeTruthy();
      }

      const processingTime = Date.now() - startTime;

      // Verify dependency tracking worked
      const dependencies = dependencyTracker.getPageDependencies(
        path.join(sourceDir, "page-0.html")
      );
      expect(dependencies.length).toBeGreaterThan(0);

      expect(processingTime).toBeLessThan(15000);
    });

    it("should handle memory efficiently with large numbers of files", async () => {
      const numFiles = 500;
      const structure = {};

      for (let i = 0; i < numFiles; i++) {
        structure[`page-${i}.html`] = `<h1>Page ${i}</h1>
<p>Content for page ${i} with some repeated text to make it larger.</p>
<!--#include virtual="/components/shared.html" -->`;
      }

      structure["components/shared.html"] =
        '<div class="shared">Shared component</div>';

      await createTestStructure(sourceDir, structure);

      const startTime = Date.now();
      const memBefore = process.memoryUsage().heapUsed;

      // Process a subset to test memory usage
      for (let i = 0; i < 50; i++) {
        const pageContent = structure[`page-${i}.html`];
        const result = await processIncludes(
          pageContent,
          path.join(sourceDir, `page-${i}.html`),
          sourceDir
        );

        expect(result.includes(`Page ${i}`)).toBeTruthy();
        expect(result.includes("Shared component")).toBeTruthy();
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memIncrease = memAfter - memBefore;
      const processingTime = Date.now() - startTime;

      // Memory increase should be reasonable (less than 100MB for 50 files)
      expect(memIncrease).toBeLessThan(100 * 1024 * 1024);
      expect(processingTime).toBeLessThan(10000);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty files gracefully", async () => {
      const structure = {
        "empty.html": "",
        "components/empty-component.html": "",
        "main.html":
          '<!--#include virtual="/components/empty-component.html" --><h1>After empty</h1>',
      };

      await createTestStructure(sourceDir, structure);

      const result = await processIncludes(
        structure["main.html"],
        path.join(sourceDir, "main.html"),
        sourceDir
      );

      expect(result.includes("<h1>After empty</h1>")).toBeTruthy();
    });

    it("should handle binary file includes gracefully", async () => {
      const structure = {
        "index.html":
          '<!--#include virtual="/assets/image.png" --><p>After binary</p>',
        "assets/image.png": "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", // Fake PNG header
      };

      await createTestStructure(sourceDir, structure);

      const result = await processIncludes(
        structure["index.html"],
        path.join(sourceDir, "index.html"),
        sourceDir
      );

      // Should handle binary gracefully (might include as-is or show error)
      expect(result.includes("<p>After binary</p>")).toBeTruthy();
    });

    it("should handle very long file paths", async () => {
      const longPath =
        "components/" + "very-long-directory-name-".repeat(10) + "/file.html";
      const structure = {
        "index.html": `<!--#include virtual="/${longPath}" -->`,
        [longPath]: "<div>Long path content</div>",
      };

      await createTestStructure(sourceDir, structure);

      const result = await processIncludes(
        structure["index.html"],
        path.join(sourceDir, "index.html"),
        sourceDir
      );

      expect(result.includes("Long path content")).toBeTruthy();
    });

    it("should handle files with unusual characters in names", async () => {
      const structure = {
        "index.html":
          '<!--#include virtual="/components/спасибо.html" --><!--#include virtual="/components/测试.html" -->',
        "components/спасибо.html": "<div>Russian content</div>",
        "components/测试.html": "<div>Chinese content</div>",
      };

      await createTestStructure(sourceDir, structure);

      const result = await processIncludes(
        structure["index.html"],
        path.join(sourceDir, "index.html"),
        sourceDir
      );

      expect(result.includes("Russian content")).toBeTruthy();
      expect(result.includes("Chinese content")).toBeTruthy();
    });

    it("should handle files with unicode content", async () => {
      const structure = {
        "index.html": '<!--#include virtual="/components/unicode.html" -->',
        "components/unicode.html": `<div>
          <p>Emojis: 🚀 🎉 💻 🌟</p>
          <p>Math: ∑ ∆ ∞ ≤ ≥</p>
          <p>Languages: Español, Français, Deutsch, Русский, 中文, 日本語</p>
          <p>Special: "Smart quotes" — em dash – en dash</p>
        </div>`,
      };

      await createTestStructure(sourceDir, structure);

      const result = await processIncludes(
        structure["index.html"],
        path.join(sourceDir, "index.html"),
        sourceDir
      );

      expect(result.includes("🚀")).toBeTruthy();
      expect(result.includes("∑")).toBeTruthy();
      expect(result.includes("Español")).toBeTruthy();
      expect(result.includes('"Smart quotes"')).toBeTruthy();
    });

    it("should handle malformed HTML gracefully", async () => {
      const structure = {
        "malformed.html": `<div><p>Unclosed paragraph
<span>Unclosed span
<div>Nested unclosed
<!--#include virtual="/components/good.html" -->
</div>`,
        "components/good.html": "<p>Good content</p>",
      };

      await createTestStructure(sourceDir, structure);

      const result = await processIncludes(
        structure["malformed.html"],
        path.join(sourceDir, "malformed.html"),
        sourceDir
      );

      expect(result.includes("Good content")).toBeTruthy();
      expect(result.includes("Unclosed paragraph")).toBeTruthy();
    });

    it("should handle concurrent processing safely", async () => {
      const structure = {
        "shared-component.html": '<div class="shared">Shared content</div>',
      };

      for (let i = 0; i < 20; i++) {
        structure[`page-${i}.html`] = `<h1>Page ${i}</h1>
<!--#include virtual="/shared-component.html" -->`;
      }

      await createTestStructure(sourceDir, structure);

      // Process multiple files concurrently
      const promises = [];
      for (let i = 0; i < 20; i++) {
        const promise = processIncludes(
          structure[`page-${i}.html`],
          path.join(sourceDir, `page-${i}.html`),
          sourceDir
        );
        promises.push(promise);
      }

      const results = await Promise.all(promises);

      // All should complete successfully
      expect(results.length).toBe(20);
      results.forEach((result, i) => {
        expect(result.includes(`Page ${i}`)).toBeTruthy();
        expect(result.includes("Shared content")).toBeTruthy();
      });
    });

    it("should throw an error for circular dependencies", async () => {
      const structure = {
        "components/circular-a.html":
          '<!--#include virtual="/components/circular-b.html" -->A',
        "components/circular-b.html":
          '<!--#include virtual="/components/circular-c.html" -->B',
        "components/circular-c.html":
          '<!--#include virtual="/components/circular-a.html" -->C',
        "index.html": '<!--#include virtual="/components/circular-a.html" -->',
      };

      await createTestStructure(sourceDir, structure);
      try {
        const result = await processIncludes(
          structure["index.html"],
          path.join(sourceDir, "index.html"),
          sourceDir
        );
        throw new Error("Should have thrown an error for circular dependency");
      } catch (error) {
        // Should detect circular dependency and stop processing
        expect(error.message.includes("Circular dependency detected")).toBeTruthy();
        return;
      }
    });

    it("should handle missing files in nested includes", async () => {
      const structure = {
        "components/existing.html": `<div>Existing content
<!--#include virtual="/components/missing.html" -->
<p>After missing</p>
</div>`,
        "index.html": '<!--#include virtual="/components/existing.html" -->',
      };

      await createTestStructure(sourceDir, structure);

      const result = await processIncludes(
        structure["index.html"],
        path.join(sourceDir, "index.html"),
        sourceDir
      );

      // Should continue processing with warning comment for missing file  
      expect(result.includes("Existing content")).toBeTruthy();
      expect(result.includes("After missing")).toBeTruthy();
      expect(result.includes("WARNING:") || result.includes("Include not found")).toBeTruthy();
    });

    it("should handle template processing with unusual slot configurations", async () => {
      const structure = {
        "layouts/unusual.html": `<!DOCTYPE html>
<html>
<body>
  <main data-slot="content">Default content</main>
  <div data-slot="default"><!-- Unnamed slot --></div>
  <div data-slot="empty"></div>
  <div data-slot="repeated">Default 1</div>
  <div data-slot="repeated">Default 2</div>
</body>
</html>`,
        "page.html": `<template extends="unusual.html">
  <template data-slot="content">Custom content</template>
  <template data-slot="repeated">Custom repeated</template>
  <div>Unnamed content goes here</div>
</template>`,
      };

      await createTestStructure(sourceDir, structure);

      const config = {
        sourceRoot: sourceDir,
        layoutsDir: "layouts",
        componentsDir: "components",
      };

      const dependencyTracker = new DependencyTracker();
      const result = await processHtmlUnified(
        structure["page.html"],
        path.join(sourceDir, "page.html"),
        sourceDir,
        dependencyTracker,
        config
      );

      expect(result.content.includes("Custom content")).toBeTruthy();
      expect(result.content.includes("Custom repeated")).toBeTruthy();
      expect(result.content.includes("Unnamed content")).toBeTruthy();
    });
  });

  describe("System Limits", () => {
    it("should handle maximum include depth gracefully", async () => {
      const maxDepth = 20; // Adjust based on system limits
      const structure = {};

      // Create deep nesting that exceeds reasonable limits
      for (let i = 0; i < maxDepth; i++) {
        const nextInclude =
          i < maxDepth - 1
            ? `<!--#include virtual="/components/deep-${i + 1}.html" -->`
            : "<p>Maximum depth reached</p>";

        structure[`components/deep-${i}.html`] = `Level ${i} ${nextInclude}`;
      }

      structure["index.html"] =
        '<!--#include virtual="/components/deep-0.html" -->';

      await createTestStructure(sourceDir, structure);

      const result = await processIncludes(
        structure["index.html"],
        path.join(sourceDir, "index.html"),
        sourceDir
      );

      // Should either complete or fail gracefully
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle files at filesystem limits", async () => {
      // Test with very large file (10MB content)
      const largeContent = "X".repeat(10 * 1024 * 1024);
      const structure = {
        "huge.html": `<html><body>${largeContent}<!--#include virtual="/components/small.html" --></body></html>`,
        "components/small.html": "<p>Small component</p>",
      };

      await createTestStructure(sourceDir, structure);

      try {
        const result = await processIncludes(
          structure["huge.html"],
          path.join(sourceDir, "huge.html"),
          sourceDir
        );

        // If it completes, verify it worked
        expect(result.includes("Small component")).toBeTruthy();
        expect(result.length).toBeGreaterThan(10 * 1024 * 1024);
      } catch (error) {
        // If it fails, should be a reasonable error
        expect(
          error.message.includes("size") ||
            error.message.includes("memory") ||
            error.message.includes("ENOMEM")
        ).toBeTruthy();
      }
    });
  });

  describe("Error Recovery", () => {
    it("should continue processing after errors", async () => {
      const structure = {
        "index.html": `
<!--#include virtual="/components/missing1.html" -->
<p>Content 1</p>
<!--#include virtual="/components/existing.html" -->
<p>Content 2</p>
<!--#include virtual="/components/missing2.html" -->
<p>Content 3</p>
`,
        "components/existing.html": "<div>Existing component</div>",
      };

      await createTestStructure(sourceDir, structure);

      const result = await processIncludes(
        structure["index.html"],
        path.join(sourceDir, "index.html"),
        sourceDir
      );

      // Should contain good content and error comments
      expect(result.includes("Content 1")).toBeTruthy();
      expect(result.includes("Existing component")).toBeTruthy();
      expect(result.includes("Content 2")).toBeTruthy();
      expect(result.includes("Content 3")).toBeTruthy();
    });

    it("should handle encoding errors gracefully", async () => {
      const structure = {
        "index.html":
          '<!--#include virtual="/components/encoded.html" --><p>After include</p>',
        // Create file with invalid UTF-8 sequence
        "components/encoded.html": Buffer.from([
          0xff, 0xfe, 0x48, 0x65, 0x6c, 0x6c, 0x6f,
        ]).toString("binary"),
      };

      await createTestStructure(sourceDir, structure);

      const result = await processIncludes(
        structure["index.html"],
        path.join(sourceDir, "index.html"),
        sourceDir
      );

      // Should handle encoding issue and continue
      expect(result.includes("After include")).toBeTruthy();
    });
  });
});
