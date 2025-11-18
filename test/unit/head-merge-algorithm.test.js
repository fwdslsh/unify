import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { build } from "../../src/core/file-processor.js";

describe("Head Merge Algorithm", () => {
  const testDir = "/tmp/head-merge-test";
  const sourceDir = join(testDir, "src");
  const outputDir = join(testDir, "dist");

  beforeAll(async () => {
    await mkdir(sourceDir, { recursive: true });
    await mkdir(join(sourceDir, "_includes"), { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("Title Deduplication", () => {
    test("should use page title over layout title", async () => {
      // Create layout with title
      await writeFile(
        join(sourceDir, "_includes", "layout.html"),
        `<!DOCTYPE html>
<html>
<head>
  <title>Layout Title</title>
  <meta charset="UTF-8">
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`
      );

      // Create page with title
      await writeFile(
        join(sourceDir, "index.html"),
        `<!DOCTYPE html>
<html>
<head>
  <link rel="layout" href="/_includes/layout.html">
  <title>Page Title</title>
</head>
<body>
  <h1>Content</h1>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "index.html")).text();

      expect(output).toContain("<title>Page Title</title>");
      expect(output).not.toContain("Layout Title");
    });
  });

  describe("Meta Tag Deduplication", () => {
    test("should deduplicate meta tags by name attribute", async () => {
      await writeFile(
        join(sourceDir, "_includes", "layout.html"),
        `<!DOCTYPE html>
<html>
<head>
  <meta name="description" content="Layout description">
  <meta name="keywords" content="layout, test">
  <meta name="author" content="Layout Author">
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`
      );

      await writeFile(
        join(sourceDir, "meta-test.html"),
        `<!DOCTYPE html>
<html>
<head>
  <link rel="layout" href="/_includes/layout.html">
  <meta name="description" content="Page description">
  <meta name="robots" content="index,follow">
</head>
<body>
  <h1>Content</h1>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "meta-test.html")).text();

      // Page description should win
      expect(output).toContain('content="Page description"');
      expect(output).not.toContain('content="Layout description"');

      // Layout keywords should be preserved
      expect(output).toContain('name="keywords"');

      // Page robots should be added
      expect(output).toContain('name="robots"');
      expect(output).toContain('content="index,follow"');
    });

    test("should deduplicate meta tags by property attribute (Open Graph)", async () => {
      await writeFile(
        join(sourceDir, "_includes", "layout.html"),
        `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Layout OG Title">
  <meta property="og:type" content="website">
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`
      );

      await writeFile(
        join(sourceDir, "og-test.html"),
        `<!DOCTYPE html>
<html>
<head>
  <link rel="layout" href="/_includes/layout.html">
  <meta property="og:title" content="Page OG Title">
  <meta property="og:description" content="Page OG Description">
</head>
<body>
  <h1>Content</h1>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "og-test.html")).text();

      // Page og:title should win
      expect(output).toContain('content="Page OG Title"');
      expect(output).not.toContain('content="Layout OG Title"');

      // Layout og:type should be preserved
      expect(output).toContain('property="og:type"');

      // Page og:description should be added
      expect(output).toContain('property="og:description"');
    });
  });

  describe("Link Canonical Deduplication", () => {
    test("should deduplicate canonical links with page winning", async () => {
      await writeFile(
        join(sourceDir, "_includes", "layout.html"),
        `<!DOCTYPE html>
<html>
<head>
  <link rel="canonical" href="https://example.com/layout">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`
      );

      await writeFile(
        join(sourceDir, "canonical-test.html"),
        `<!DOCTYPE html>
<html>
<head>
  <link rel="layout" href="/_includes/layout.html">
  <link rel="canonical" href="https://example.com/page">
</head>
<body>
  <h1>Content</h1>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "canonical-test.html")).text();

      // Page canonical should win
      expect(output).toContain('href="https://example.com/page"');
      expect(output).not.toContain('href="https://example.com/layout"');

      // Stylesheet should be preserved
      expect(output).toContain('href="/styles.css"');
    });

    test("should deduplicate other links by (rel, href) pair", async () => {
      await writeFile(
        join(sourceDir, "_includes", "layout.html"),
        `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/common.css">
  <link rel="preload" as="image" href="/logo.png">
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`
      );

      await writeFile(
        join(sourceDir, "link-test.html"),
        `<!DOCTYPE html>
<html>
<head>
  <link rel="layout" href="/_includes/layout.html">
  <link rel="stylesheet" href="/common.css">
  <link rel="stylesheet" href="/page.css">
</head>
<body>
  <h1>Content</h1>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "link-test.html")).text();

      // Should only have one common.css
      const commonCssMatches = output.match(/href="\/common\.css"/g);
      expect(commonCssMatches?.length).toBe(1);

      // Should have page.css
      expect(output).toContain('href="/page.css"');

      // Should have preload
      expect(output).toContain('rel="preload"');
    });
  });

  describe("Script Deduplication", () => {
    test("should deduplicate external scripts by src attribute", async () => {
      await writeFile(
        join(sourceDir, "_includes", "layout.html"),
        `<!DOCTYPE html>
<html>
<head>
  <script src="/common.js"></script>
  <script src="/analytics.js" defer></script>
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`
      );

      await writeFile(
        join(sourceDir, "script-test.html"),
        `<!DOCTYPE html>
<html>
<head>
  <link rel="layout" href="/_includes/layout.html">
  <script src="/common.js"></script>
  <script src="/page.js"></script>
</head>
<body>
  <h1>Content</h1>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "script-test.html")).text();

      // Should only have one common.js
      const commonJsMatches = output.match(/src="\/common\.js"/g);
      expect(commonJsMatches?.length).toBe(1);

      // Should have page.js
      expect(output).toContain('src="/page.js"');

      // Should have analytics.js
      expect(output).toContain('src="/analytics.js"');
    });

    test("should NOT deduplicate inline scripts", async () => {
      await writeFile(
        join(sourceDir, "_includes", "layout.html"),
        `<!DOCTYPE html>
<html>
<head>
  <script>console.log('layout');</script>
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`
      );

      await writeFile(
        join(sourceDir, "inline-script-test.html"),
        `<!DOCTYPE html>
<html>
<head>
  <link rel="layout" href="/_includes/layout.html">
  <script>console.log('page');</script>
  <script>console.log('another page script');</script>
</head>
<body>
  <h1>Content</h1>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "inline-script-test.html")).text();

      // All inline scripts should be present
      expect(output).toContain("console.log('layout')");
      expect(output).toContain("console.log('page')");
      expect(output).toContain("console.log('another page script')");

      // Should have 3 script blocks
      const scriptMatches = output.match(/<script>/g);
      expect(scriptMatches?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Style Deduplication", () => {
    test("should NOT deduplicate inline styles", async () => {
      await writeFile(
        join(sourceDir, "_includes", "layout.html"),
        `<!DOCTYPE html>
<html>
<head>
  <style>body { margin: 0; }</style>
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`
      );

      await writeFile(
        join(sourceDir, "inline-style-test.html"),
        `<!DOCTYPE html>
<html>
<head>
  <link rel="layout" href="/_includes/layout.html">
  <style>.page { color: blue; }</style>
  <style>.another { color: red; }</style>
</head>
<body>
  <h1>Content</h1>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "inline-style-test.html")).text();

      // All inline styles should be present
      expect(output).toContain("body { margin: 0; }");
      expect(output).toContain(".page { color: blue; }");
      expect(output).toContain(".another { color: red; }");
    });
  });

  describe("Head Merge Order", () => {
    test("should maintain base order: layout nodes first, then page nodes", async () => {
      await writeFile(
        join(sourceDir, "_includes", "layout.html"),
        `<!DOCTYPE html>
<html>
<head>
  <meta name="layout-1" content="first">
  <meta name="layout-2" content="second">
</head>
<body>
  <main data-slot="default"></main>
</body>
</html>`
      );

      await writeFile(
        join(sourceDir, "order-test.html"),
        `<!DOCTYPE html>
<html>
<head>
  <link rel="layout" href="/_includes/layout.html">
  <meta name="page-1" content="first">
  <meta name="page-2" content="second">
</head>
<body>
  <h1>Content</h1>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir });

      const output = await Bun.file(join(outputDir, "order-test.html")).text();

      // Find positions of each meta tag
      const layout1Pos = output.indexOf('name="layout-1"');
      const layout2Pos = output.indexOf('name="layout-2"');
      const page1Pos = output.indexOf('name="page-1"');
      const page2Pos = output.indexOf('name="page-2"');

      // Layout tags should come before page tags
      expect(layout1Pos).toBeLessThan(page1Pos);
      expect(layout2Pos).toBeLessThan(page2Pos);

      // Order within each should be preserved
      expect(layout1Pos).toBeLessThan(layout2Pos);
      expect(page1Pos).toBeLessThan(page2Pos);
    });
  });
});
