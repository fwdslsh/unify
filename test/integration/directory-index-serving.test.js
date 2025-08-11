/**
 * Tests for directory index serving behavior
 * Verifies that the development server correctly serves index.html files
 * for directory requests both with and without trailing slashes
 */

import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import fs from "fs/promises";
import path from "path";
import {
  createTempDirectory,
  cleanupTempDirectory,
  createTestStructure,
} from "../fixtures/temp-helper.js";
import { startDevServer, stopDevServer, cleanupAllServers } from "../fixtures/server-helper.js";

import { build } from "../../src/core/file-processor.js";

describe("Directory Index Serving", () => {
  let tempDir;
  let sourceDir;
  let outputDir;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    sourceDir = path.join(tempDir, "src");
    outputDir = path.join(tempDir, "dist");
  });

  afterEach(async () => {
    // Clean up any servers created in this test
    await cleanupAllServers();
    await cleanupTempDirectory(tempDir);
  });

  describe("Basic Directory Index Serving", () => {
    it("should serve index.html for directory requests with trailing slash", async () => {
      const structure = {
        "src/index.html": "<h1>Root Index</h1>",
        "src/blog.html": "<h1>Blog Page</h1>", // Added for /blog test
        "src/blog/index.html": "<h1>Blog Index</h1>",
        "src/about/index.html": "<h1>About Index</h1>",
        "src/docs/api/index.html": "<h1>API Docs Index</h1>",
      };

      await createTestStructure(tempDir, structure);

      // Build the site first
      await build({
        source: sourceDir,
        output: outputDir,
        clean: true,
      });

      const server = await startDevServer(sourceDir, outputDir);

      try {
        // Test root directory with trailing slash
        const rootResponse = await fetch(`http://localhost:${server.port}/`);
        expect(rootResponse.ok).toBeTruthy();
        expect(rootResponse.status).toBe(200);
        const rootContent = await rootResponse.text();
        expect(rootContent).toContain("<h1>Root Index</h1>");

        // Test subdirectories with trailing slash
        const blogResponse = await fetch(
          `http://localhost:${server.port}/blog/`
        );
        expect(blogResponse.ok).toBeTruthy();
        expect(blogResponse.status).toBe(200);
        const blogContent = await blogResponse.text();
        expect(blogContent).toContain("<h1>Blog Index</h1>");

        const aboutResponse = await fetch(
          `http://localhost:${server.port}/about/`
        );
        expect(aboutResponse.ok).toBeTruthy();
        expect(aboutResponse.status).toBe(200);
        const aboutContent = await aboutResponse.text();
        expect(aboutContent).toContain("<h1>About Index</h1>");

        // Test nested directories with trailing slash
        const apiResponse = await fetch(
          `http://localhost:${server.port}/docs/api/`
        );
        expect(apiResponse.ok).toBeTruthy();
        expect(apiResponse.status).toBe(200);
        const apiContent = await apiResponse.text();
        expect(apiContent).toContain("<h1>API Docs Index</h1>");
      } finally {
        await stopDevServer(server);
      }
    });

    it("should serve index.html for directory requests without trailing slash", async () => {
      const structure = {
        "src/index.html": "<h1>Root Index</h1>",
        "src/blog.html": "<h1>Blog Page</h1>", // Added for /blog test
        "src/blog/index.html": "<h1>Blog Index</h1>",
        "src/about/index.html": "<h1>About Index</h1>",
        "src/docs/api/index.html": "<h1>API Docs Index</h1>",
      };

      await createTestStructure(tempDir, structure);

      // Build the site first
      await build({
        source: sourceDir,
        output: outputDir,
        clean: true,
      });

      const server = await startDevServer(sourceDir, outputDir);

      try {
        // Test subdirectories without trailing slash
        const blogResponse = await fetch(
          `http://localhost:${server.port}/blog`
        );
        expect(blogResponse.ok).toBeTruthy();
        expect(blogResponse.status).toBe(200);
        const blogContent = await blogResponse.text();
        expect(blogContent).toContain("<h1>Blog Page</h1>"); // Expect blog.html for /blog

        const aboutResponse = await fetch(
          `http://localhost:${server.port}/about`
        );
        expect(aboutResponse.ok).toBeTruthy();
        expect(aboutResponse.status).toBe(200);
        const aboutContent = await aboutResponse.text();
        expect(aboutContent).toContain("<h1>About Index</h1>");

        // Test nested directories without trailing slash
        const docsResponse = await fetch(
          `http://localhost:${server.port}/docs`
        );
        expect(docsResponse.ok).toBeTruthy();
        expect(docsResponse.status).toBe(200);
        const docsContent = await docsResponse.text();
        // Since there's no /docs/index.html, this should fall back to root index
        expect(docsContent).toContain("<h1>Root Index</h1>");

        const apiResponse = await fetch(
          `http://localhost:${server.port}/docs/api`
        );
        expect(apiResponse.ok).toBeTruthy();
        expect(apiResponse.status).toBe(200);
        const apiContent = await apiResponse.text();
        expect(apiContent).toContain("<h1>API Docs Index</h1>");
      } finally {
        await stopDevServer(server);
      }
    });

    it("should handle mixed scenarios correctly", async () => {
      const structure = {
        "src/index.html": "<h1>Root Index</h1>",
        "src/blog.html": "<h1>Blog Page</h1>", // Added for /blog test
        "src/blog/index.html": "<h1>Blog Index</h1>",
        "src/blog/post1.html": "<h1>Blog Post 1</h1>",
        "src/products/list.html": "<h1>Product List</h1>", // No index.html in products
        "src/contact.html": "<h1>Contact Page</h1>", // Regular file, not directory
      };

      await createTestStructure(tempDir, structure);

      // Build the site first
      await build({
        source: sourceDir,
        output: outputDir,
        clean: true,
      });

      const server = await startDevServer(sourceDir, outputDir);

      try {
        // Test directory with index
        const blogResponse = await fetch(
          `http://localhost:${server.port}/blog`
        );
        expect(blogResponse.ok).toBeTruthy();
        const blogContent = await blogResponse.text();
        expect(blogContent).toContain("<h1>Blog Page</h1>"); // Expect blog.html for /blog

        // Test specific file in directory
        const postResponse = await fetch(
          `http://localhost:${server.port}/blog/post1.html`
        );
        expect(postResponse.ok).toBeTruthy();
        const postContent = await postResponse.text();
        expect(postContent).toContain("<h1>Blog Post 1</h1>");

        // Test directory without index (should fall back to SPA fallback)
        const productsResponse = await fetch(
          `http://localhost:${server.port}/products`
        );
        expect(productsResponse.ok).toBeTruthy();
        const productsContent = await productsResponse.text();
        expect(productsContent).toContain("<h1>Root Index</h1>"); // Fallback to root

        // Test specific file in directory without index
        const listResponse = await fetch(
          `http://localhost:${server.port}/products/list.html`
        );
        expect(listResponse.ok).toBeTruthy();
        const listContent = await listResponse.text();
        expect(listContent).toContain("<h1>Product List</h1>");

        // Test regular file
        const contactResponse = await fetch(
          `http://localhost:${server.port}/contact.html`
        );
        expect(contactResponse.ok).toBeTruthy();
        const contactContent = await contactResponse.text();
        expect(contactContent).toContain("<h1>Contact Page</h1>");
      } finally {
        await stopDevServer(server);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-existent directories correctly", async () => {
      const structure = {
        "src/index.html": "<h1>Root Index</h1>",
        "src/blog/index.html": "<h1>Blog Index</h1>",
      };

      await createTestStructure(tempDir, structure);

      // Build the site first
      await build({
        source: sourceDir,
        output: outputDir,
        clean: true,
      });

      const server = await startDevServer(sourceDir, outputDir);

      try {
        // Test non-existent directory - should fall back to root index (SPA behavior)
        const nonExistentResponse = await fetch(
          `http://localhost:${server.port}/nonexistent`
        );
        expect(nonExistentResponse.ok).toBeTruthy();
        expect(nonExistentResponse.status).toBe(200);
        const nonExistentContent = await nonExistentResponse.text();
        expect(nonExistentContent).toContain("<h1>Root Index</h1>"); // Should fall back

        // Test non-existent nested path - should also fall back
        const nestedNonExistentResponse = await fetch(
          `http://localhost:${server.port}/blog/nonexistent`
        );
        expect(nestedNonExistentResponse.ok).toBeTruthy();
        expect(nestedNonExistentResponse.status).toBe(200);
        const nestedContent = await nestedNonExistentResponse.text();
        expect(nestedContent).toContain("<h1>Root Index</h1>"); // Should fall back
        
        // Test non-existent file with extension - should return 404
        const nonExistentFileResponse = await fetch(
          `http://localhost:${server.port}/nonexistent.html`
        );
        expect(nonExistentFileResponse.status).toBe(404);
      } finally {
        await stopDevServer(server);
      }
    });

    it("should prioritize exact file matches over directory index", async () => {
      const structure = {
        "src/index.html": "<h1>Root Index</h1>",
        "src/blog.html": "<h1>Blog Page</h1>",
        "src/blog/index.html": "<h1>Blog Index</h1>",
      };

      await createTestStructure(tempDir, structure);

      // Build the site first
      await build({
        source: sourceDir,
        output: outputDir,
        clean: true,
      });

      const server = await startDevServer(sourceDir, outputDir);

      try {
        // When both blog.html and blog/index.html exist, requesting /blog should prefer blog.html
        const blogResponse = await fetch(
          `http://localhost:${server.port}/blog`
        );
        expect(blogResponse.ok).toBeTruthy();
        expect(blogResponse.status).toBe(200);
        const blogContent = await blogResponse.text();
        // The server should serve blog.html for exact match
        expect(blogContent).toContain("<h1>Blog Page</h1>");

        // But requesting /blog/ should definitely serve the directory index
        const blogDirResponse = await fetch(
          `http://localhost:${server.port}/blog/`
        );
        expect(blogDirResponse.ok).toBeTruthy();
        expect(blogDirResponse.status).toBe(200);
        const blogDirContent = await blogDirResponse.text();
        expect(blogDirContent).toContain("<h1>Blog Index</h1>");

        // And requesting the exact file should work
        const blogHtmlResponse = await fetch(
          `http://localhost:${server.port}/blog.html`
        );
        expect(blogHtmlResponse.ok).toBeTruthy();
        expect(blogHtmlResponse.status).toBe(200);
        const blogHtmlContent = await blogHtmlResponse.text();
        expect(blogHtmlContent).toContain("<h1>Blog Page</h1>");
      } finally {
        await stopDevServer(server);
      }
    });
  });
});


