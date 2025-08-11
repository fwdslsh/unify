/**
 * Tests for live reload functionality - include file changes
 * This test ensures that when an include file changes, a reload event is broadcast
 */

import { describe, it, beforeEach, afterEach, expect } from "bun:test";
import fs from "fs/promises";
import path from "path";
import {
  createTempDirectory,
  cleanupTempDirectory,
  createTestStructure,
} from "../fixtures/temp-helper.js";
import {
  startDevServer,
  stopDevServer,
  listenForReloadEvent,
  waitForBuild,
  cleanupAllServers,
} from "../fixtures/server-helper.js";

describe("Live Reload - Include File Changes", () => {
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

  it("should trigger rebuild when include file changes", async () => {
    const structure = {
      "src/index.html":
        '<!--#include virtual="/includes/header.html" --><p>Main content</p>',
      "src/includes/header.html": "<h1>Original Header</h1>",
    };

    await createTestStructure(tempDir, structure);

    const server = await startDevServer(sourceDir, outputDir, {
      workingDir: tempDir,
    });

    try {
      // Wait for initial build
      await waitForBuild(outputDir);

      // Check initial content
      let content = await fs.readFile(
        path.join(outputDir, "index.html"),
        "utf-8"
      );
      expect(content).toContain("Original Header");

      // Modify include file
      await fs.writeFile(
        path.join(sourceDir, "includes", "header.html"),
        "<h1>Updated Header</h1>"
      );

      // Wait for rebuild (includes should trigger rebuild)
      await waitForBuild(outputDir);

      // Check updated content
      content = await fs.readFile(path.join(outputDir, "index.html"), "utf-8");
      expect(content).toContain("Updated Header");
    } finally {
      await stopDevServer(server);
    }
  });

  it("should broadcast reload event when include file changes", async () => {
    const structure = {
      "src/index.html":
        '<!--#include virtual="/includes/nav.html" --><main>Content</main>',
      "src/includes/nav.html": "<nav>Original Navigation</nav>",
    };

    await createTestStructure(tempDir, structure);

    const server = await startDevServer(sourceDir, outputDir, {
      workingDir: tempDir,
    });

    try {
      // Wait for initial build
      await waitForBuild(outputDir);

      // Start monitoring SSE endpoint for reload events
      const reloadPromise = listenForReloadEvent(server.port);

      // Modify include file to trigger reload
      await fs.writeFile(
        path.join(sourceDir, "includes", "nav.html"),
        "<nav>Updated Navigation Menu</nav>"
      );

      // Wait for reload event (with timeout)
      const reloadReceived = await Promise.race([
        reloadPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Reload event timeout")), 8000)
        ),
      ]);

      expect(reloadReceived).toBe(true);

      // Verify the content was also updated
      await waitForBuild(outputDir);
      const content = await fs.readFile(
        path.join(outputDir, "index.html"),
        "utf-8"
      );
      expect(content).toContain("Updated Navigation Menu");
    } finally {
      await stopDevServer(server);
    }
  });
});
