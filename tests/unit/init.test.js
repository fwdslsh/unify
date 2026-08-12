/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2).
 * Unit tests for src/cli/commands/init.js's own command behavior: target
 * resolution, collision refusal, template selection. Template *content*
 * conformance to conformance-spec §19 (SCF-01/02/04) lives in
 * templates.test.js — this file is about what `init()` does with a template
 * once it has one, not about what's in the templates themselves.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "../../src/cli/commands/init.js";
import { Reporter, UsageError } from "../../src/core/diagnostics.js";
import { TEMPLATES } from "../../src/templates/index.js";

const dirs = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "unify-init-test-"));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function silentReporter() {
  return new Reporter({ strict: false, stderr: { write() {} }, stdout: { write() {} } });
}

describe("init()", () => {
  test('defaults to the "default" template when none is given', async () => {
    const root = tempDir();
    const code = await init({ sourceRoot: root, sourceDefaulted: true, template: undefined, reporter: silentReporter() });
    expect(code).toBe(0);
    // about.md is unique to the default template (see templates.test.js).
    expect(existsSync(join(root, "src", "about.md"))).toBe(true);
  });

  test("scaffolds into <sourceRoot>/src when the source root defaulted to the working directory", async () => {
    const root = tempDir();
    const code = await init({ sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: silentReporter() });
    expect(code).toBe(0);
    expect(existsSync(join(root, "src", "index.html"))).toBe(true);
    expect(existsSync(join(root, "index.html"))).toBe(false);
  });

  test("scaffolds directly into sourceRoot when --source was explicit (sourceDefaulted: false)", async () => {
    const root = tempDir();
    const code = await init({ sourceRoot: root, sourceDefaulted: false, template: "basic", reporter: silentReporter() });
    expect(code).toBe(0);
    expect(existsSync(join(root, "index.html"))).toBe(true);
    expect(existsSync(join(root, "src"))).toBe(false);
  });

  test("an unknown template is a usage fault (exit 2), never a silent fallback", async () => {
    const root = tempDir();
    await expect(
      init({ sourceRoot: root, sourceDefaulted: true, template: "not-a-real-template", reporter: silentReporter() }),
    ).rejects.toThrow(UsageError);
  });

  test("the unknown-template error names every valid choice", async () => {
    const root = tempDir();
    try {
      await init({ sourceRoot: root, sourceDefaulted: true, template: "nope", reporter: silentReporter() });
      throw new Error("expected init() to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(UsageError);
      for (const name of Object.keys(TEMPLATES)) expect(e.fixes.join(" ")).toContain(name);
    }
  });

  test("refuses to overwrite a target that already has scaffolded files", async () => {
    const root = tempDir();
    const first = await init({ sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: silentReporter() });
    expect(first).toBe(0);
    await expect(
      init({ sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: silentReporter() }),
    ).rejects.toThrow(UsageError);
  });

  test("a collision refusal is a usage fault (exit 2), and the existing files are untouched", async () => {
    const root = tempDir();
    await init({ sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: silentReporter() });
    const before = readFileSync(join(root, "src", "index.html"), "utf8");
    try {
      await init({ sourceRoot: root, sourceDefaulted: true, template: "docs", reporter: silentReporter() });
    } catch (e) {
      expect(e).toBeInstanceOf(UsageError);
      expect(e.exitCode).toBe(2);
    }
    const after = readFileSync(join(root, "src", "index.html"), "utf8");
    expect(after).toBe(before);
  });

  test("scaffolding into an existing but empty src/ succeeds (sourceDefaulted is false once src/ exists)", async () => {
    const root = tempDir();
    mkdirSync(join(root, "src"), { recursive: true });
    const code = await init({ sourceRoot: join(root, "src"), sourceDefaulted: false, template: "docs", reporter: silentReporter() });
    expect(code).toBe(0);
    expect(existsSync(join(root, "src", "_layout.html"))).toBe(true);
  });

  test("never writes unify.yaml, for any template", async () => {
    for (const name of Object.keys(TEMPLATES)) {
      const root = tempDir();
      await init({ sourceRoot: root, sourceDefaulted: true, template: name, reporter: silentReporter() });
      expect(existsSync(join(root, "src", "unify.yaml"))).toBe(false);
    }
  });

  test("never creates a dist/ directory next to src/", async () => {
    const root = tempDir();
    await init({ sourceRoot: root, sourceDefaulted: true, template: "default", reporter: silentReporter() });
    expect(existsSync(join(root, "dist"))).toBe(false);
  });

  test("reports success as a plain summary, never as a diagnostic", async () => {
    const root = tempDir();
    const reporter = silentReporter();
    const summaryLines = [];
    const originalSummary = reporter.summary.bind(reporter);
    reporter.summary = (text) => { summaryLines.push(text); originalSummary(text); };
    const code = await init({ sourceRoot: root, sourceDefaulted: true, template: "blog", reporter });
    expect(code).toBe(0);
    expect(reporter.diagnostics).toEqual([]);
    expect(summaryLines.some((l) => l.includes("blog"))).toBe(true);
  });
});
