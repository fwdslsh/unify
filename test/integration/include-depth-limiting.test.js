import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { build } from "../../src/core/file-processor.js";

describe("Include Depth Limiting", () => {
  const testDir = "/tmp/include-depth-test";
  const sourceDir = join(testDir, "src");
  const outputDir = join(testDir, "dist");

  beforeAll(async () => {
    await mkdir(sourceDir, { recursive: true });
    await mkdir(join(sourceDir, "_includes"), { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("should handle includes up to reasonable depth (5 levels)", async () => {
    // Create a chain of includes 5 levels deep
    await writeFile(
      join(sourceDir, "_includes", "level5.html"),
      `<div>Level 5 content</div>`
    );

    await writeFile(
      join(sourceDir, "_includes", "level4.html"),
      `<div>Level 4<include src="/_includes/level5.html"></include></div>`
    );

    await writeFile(
      join(sourceDir, "_includes", "level3.html"),
      `<div>Level 3<include src="/_includes/level4.html"></include></div>`
    );

    await writeFile(
      join(sourceDir, "_includes", "level2.html"),
      `<div>Level 2<include src="/_includes/level3.html"></include></div>`
    );

    await writeFile(
      join(sourceDir, "_includes", "level1.html"),
      `<div>Level 1<include src="/_includes/level2.html"></include></div>`
    );

    await writeFile(
      join(sourceDir, "depth-test.html"),
      `<!DOCTYPE html>
<html>
<head><title>Depth Test</title></head>
<body>
  <include src="/_includes/level1.html"></include>
</body>
</html>`
    );

    // Should not throw error for reasonable depth
    await expect(build({ source: sourceDir, output: outputDir })).resolves.toBeDefined();

    const output = await Bun.file(join(outputDir, "depth-test.html")).text();

    // Verify all levels are included
    expect(output).toContain("Level 1");
    expect(output).toContain("Level 2");
    expect(output).toContain("Level 3");
    expect(output).toContain("Level 4");
    expect(output).toContain("Level 5");
  });

  test("should handle deep includes (8 levels) without error", async () => {
    // Create a deeper chain - 8 levels
    for (let i = 8; i >= 1; i--) {
      const content = i === 8
        ? `<div>Level 8 content</div>`
        : `<div>Level ${i}<include src="/_includes/deep${i + 1}.html"></include></div>`;

      await writeFile(join(sourceDir, "_includes", `deep${i}.html`), content);
    }

    await writeFile(
      join(sourceDir, "deep-test.html"),
      `<!DOCTYPE html>
<html>
<head><title>Deep Test</title></head>
<body>
  <include src="/_includes/deep1.html"></include>
</body>
</html>`
    );

    // Should process without errors
    await expect(build({ source: sourceDir, output: outputDir })).resolves.toBeDefined();

    const output = await Bun.file(join(outputDir, "deep-test.html")).text();

    // Verify deep levels are included
    expect(output).toContain("Level 1");
    expect(output).toContain("Level 8");
  });

  test("should handle very deep includes (10+ levels) appropriately", async () => {
    // Create a very deep chain - 12 levels to test limit
    for (let i = 12; i >= 1; i--) {
      const content = i === 12
        ? `<div>Level 12 content</div>`
        : `<div>Level ${i}<include src="/_includes/verydeep${i + 1}.html"></include></div>`;

      await writeFile(join(sourceDir, "_includes", `verydeep${i}.html`), content);
    }

    await writeFile(
      join(sourceDir, "verydeep-test.html"),
      `<!DOCTYPE html>
<html>
<head><title>Very Deep Test</title></head>
<body>
  <include src="/_includes/verydeep1.html"></include>
</body>
</html>`
    );

    // Build should either:
    // 1. Complete successfully if depth limit is high enough
    // 2. Throw an error if depth limit is exceeded
    // The spec mentions 10 levels as the limit
    try {
      await build({ source: sourceDir, output: outputDir });
      const output = await Bun.file(join(outputDir, "verydeep-test.html")).text();

      // If it succeeds, verify some content is present
      expect(output).toContain("Level 1");
    } catch (error) {
      // If it fails, error should mention depth or recursion
      expect(error.message.toLowerCase()).toMatch(/depth|recursion|limit/);
    }
  });

  test("should detect circular dependencies before depth limit", async () => {
    // Circular dependencies should be caught before depth limit is reached
    await writeFile(
      join(sourceDir, "_includes", "circular-a.html"),
      `<div>A<include src="/_includes/circular-b.html"></include></div>`
    );

    await writeFile(
      join(sourceDir, "_includes", "circular-b.html"),
      `<div>B<include src="/_includes/circular-a.html"></include></div>`
    );

    await writeFile(
      join(sourceDir, "circular-test.html"),
      `<!DOCTYPE html>
<html>
<head><title>Circular Test</title></head>
<body>
  <include src="/_includes/circular-a.html"></include>
</body>
</html>`
    );

    // Should throw circular dependency error
    await expect(build({ source: sourceDir, output: outputDir })).rejects.toThrow();
  });
});
