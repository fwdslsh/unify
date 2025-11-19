import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { build } from "../../src/core/file-processor.js";

describe("Link Normalization Edge Cases", () => {
  const testDir = "/tmp/link-norm-edge-test";
  const sourceDir = join(testDir, "src");
  const outputDir = join(testDir, "dist");

  beforeAll(async () => {
    await mkdir(sourceDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("Protocol Link Preservation", () => {
    test("should preserve tel: protocol links", async () => {
      await writeFile(
        join(sourceDir, "tel-test.html"),
        `<!DOCTYPE html>
<html>
<head><title>Tel Test</title></head>
<body>
  <a href="tel:+1234567890">Call us</a>
  <a href="tel:555-1234">Local number</a>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir, prettyUrls: true });

      const output = await Bun.file(join(outputDir, "tel-test/index.html")).text();

      expect(output).toContain('href="tel:+1234567890"');
      expect(output).toContain('href="tel:555-1234"');
    });

    test("should preserve ftp: protocol links", async () => {
      await writeFile(
        join(sourceDir, "ftp-test.html"),
        `<!DOCTYPE html>
<html>
<head><title>FTP Test</title></head>
<body>
  <a href="ftp://ftp.example.com/file.zip">Download</a>
  <a href="ftp://user@server.com/data">FTP Link</a>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir, prettyUrls: true });

      const output = await Bun.file(join(outputDir, "ftp-test/index.html")).text();

      expect(output).toContain('href="ftp://ftp.example.com/file.zip"');
      expect(output).toContain('href="ftp://user@server.com/data"');
    });

    test("should preserve other protocol links (sms, geo, etc)", async () => {
      await writeFile(
        join(sourceDir, "protocols-test.html"),
        `<!DOCTYPE html>
<html>
<head><title>Protocols Test</title></head>
<body>
  <a href="sms:+1234567890">Send SMS</a>
  <a href="geo:37.786971,-122.399677">Location</a>
  <a href="skype:username?call">Skype call</a>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir, prettyUrls: true });

      const output = await Bun.file(join(outputDir, "protocols-test/index.html")).text();

      expect(output).toContain('href="sms:+1234567890"');
      expect(output).toContain('href="geo:37.786971,-122.399677"');
      expect(output).toContain('href="skype:username?call"');
    });
  });

  describe("Data URL Preservation", () => {
    test("should preserve data: URLs in links", async () => {
      await writeFile(
        join(sourceDir, "data-url-test.html"),
        `<!DOCTYPE html>
<html>
<head><title>Data URL Test</title></head>
<body>
  <a href="data:text/plain;base64,SGVsbG8gV29ybGQ=">Download text</a>
  <a href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==">Image link</a>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir, prettyUrls: true });

      const output = await Bun.file(join(outputDir, "data-url-test/index.html")).text();

      expect(output).toContain('href="data:text/plain;base64,SGVsbG8gV29ybGQ="');
      expect(output).toContain('href="data:image/png;base64,');
    });

    test("should preserve data: URLs in img src attributes", async () => {
      await writeFile(
        join(sourceDir, "data-img-test.html"),
        `<!DOCTYPE html>
<html>
<head><title>Data IMG Test</title></head>
<body>
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E" alt="SVG">
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir, prettyUrls: true });

      const output = await Bun.file(join(outputDir, "data-img-test/index.html")).text();

      expect(output).toContain('src="data:image/svg+xml,');
    });
  });

  describe("Index.html Special Handling", () => {
    test("should transform index.html links to root /", async () => {
      await writeFile(
        join(sourceDir, "index-link-test.html"),
        `<!DOCTYPE html>
<html>
<head><title>Index Link Test</title></head>
<body>
  <a href="index.html">Home</a>
  <a href="./index.html">Home relative</a>
  <a href="/index.html">Home absolute</a>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir, prettyUrls: true });

      const output = await Bun.file(join(outputDir, "index-link-test/index.html")).text();

      // All index.html links should become /
      expect(output).toContain('href="/"');

      // Should not contain index.html in any link
      expect(output).not.toMatch(/href="[^"]*index\.html"/);
    });

    test("should handle nested index.html links", async () => {
      await mkdir(join(sourceDir, "blog"), { recursive: true });

      await writeFile(
        join(sourceDir, "nested-index-test.html"),
        `<!DOCTYPE html>
<html>
<head><title>Nested Index Test</title></head>
<body>
  <a href="blog/index.html">Blog home</a>
  <a href="/blog/index.html">Blog absolute</a>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir, prettyUrls: true });

      const output = await Bun.file(join(outputDir, "nested-index-test/index.html")).text();

      // Nested index.html should become directory path
      expect(output).toContain('href="/blog/"');
    });
  });

  describe("Complex Relative Paths", () => {
    test("should handle ../../ paths with pretty URLs", async () => {
      await mkdir(join(sourceDir, "blog/posts"), { recursive: true });

      await writeFile(
        join(sourceDir, "blog/posts/post1.html"),
        `<!DOCTYPE html>
<html>
<head><title>Post 1</title></head>
<body>
  <a href="../../about.html">About</a>
  <a href="../../index.html">Home</a>
  <a href="../archive.html">Archive</a>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir, prettyUrls: true });

      const output = await Bun.file(join(outputDir, "blog/posts/post1/index.html")).text();

      expect(output).toContain('href="/about/"');
      expect(output).toContain('href="/"');
      expect(output).toContain('href="/blog/archive/"');
    });
  });

  describe("Query Parameters and Fragments Combined", () => {
    test("should preserve both query params and fragments in pretty URLs", async () => {
      await writeFile(
        join(sourceDir, "query-fragment-test.html"),
        `<!DOCTYPE html>
<html>
<head><title>Query Fragment Test</title></head>
<body>
  <a href="page.html?tab=info#section">Info tab section</a>
  <a href="./about.html?lang=en&region=us#top">About with params</a>
  <a href="/contact.html?form=1#message">Contact form</a>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir, prettyUrls: true });

      const output = await Bun.file(join(outputDir, "query-fragment-test/index.html")).text();

      expect(output).toContain('href="/page/?tab=info#section"');
      expect(output).toContain('href="/about/?lang=en&region=us#top"');
      expect(output).toContain('href="/contact/?form=1#message"');
    });
  });

  describe("Mixed Content Types", () => {
    test("should handle page with various link types correctly", async () => {
      await writeFile(
        join(sourceDir, "mixed-links.html"),
        `<!DOCTYPE html>
<html>
<head><title>Mixed Links</title></head>
<body>
  <a href="page.html">HTML page</a>
  <a href="mailto:test@example.com">Email</a>
  <a href="tel:+123">Phone</a>
  <a href="https://external.com">External</a>
  <a href="/doc.pdf">PDF</a>
  <a href="data:text/plain,Hello">Data URL</a>
  <a href="#anchor">Anchor</a>
  <a href="ftp://files.com">FTP</a>
</body>
</html>`
      );

      await build({ source: sourceDir, output: outputDir, prettyUrls: true });

      const output = await Bun.file(join(outputDir, "mixed-links/index.html")).text();

      // Only HTML page should be transformed
      expect(output).toContain('href="/page/"');

      // All others should be preserved
      expect(output).toContain('href="mailto:test@example.com"');
      expect(output).toContain('href="tel:+123"');
      expect(output).toContain('href="https://external.com"');
      expect(output).toContain('href="/doc.pdf"');
      expect(output).toContain('href="data:text/plain,Hello"');
      expect(output).toContain('href="#anchor"');
      expect(output).toContain('href="ftp://files.com"');
    });
  });
});
