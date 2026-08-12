/**
 * Unit tests for src/core/publish.js (Tier 3 — no conformance authority;
 * testing-strategy §2). `planPublish` and `formatDryRunReport` are pure and
 * tested against in-memory maps only; `applyPublishPlan`/`snapshotDirectory`/
 * `performClean`/`publish` perform real filesystem I/O and are tested
 * against real temporary directories (node:fs, `os.tmpdir()` — the same
 * convention tests/conformance/harness.test.js already uses for its own
 * per-case temp dirs), never mocked (this project's own H1 discipline for
 * *behavior* tests; Tier 3 unit tests may mock, but there is no need to
 * here — real small directories are cheap and exercise the real code path).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyPublishPlan, assertCleanIsSafe, emptyDirectory, formatDryRunReport,
  performClean, planPublish, publish, snapshotDirectory,
} from "../../../src/core/publish.js";
import { UsageError } from "../../../src/core/diagnostics.js";

function silentReporter(canPublish) {
  return { canPublish, diagnostics: [], problemCount: canPublish ? 0 : 1 };
}

let tmp;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "unify-publish-test-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ==================================================================== plan

describe("planPublish (pure)", () => {
  test("a fresh (empty) output: every temp file is a write", () => {
    const plan = planPublish({
      tempFiles: new Map([["index.html", "a"], ["assets/x.css", "b"]]),
      outputFiles: new Map(),
    });
    expect(plan.write).toEqual(["assets/x.css", "index.html"]);
    expect(plan.unchanged).toEqual([]);
    expect(plan.delete).toEqual([]);
  });

  test("identical content is unchanged (PUB-02: not rewritten)", () => {
    const plan = planPublish({
      tempFiles: new Map([["index.html", "same"]]),
      outputFiles: new Map([["index.html", "same"]]),
    });
    expect(plan.write).toEqual([]);
    expect(plan.unchanged).toEqual(["index.html"]);
  });

  test("changed content is a write", () => {
    const plan = planPublish({
      tempFiles: new Map([["index.html", "new"]]),
      outputFiles: new Map([["index.html", "old"]]),
    });
    expect(plan.write).toEqual(["index.html"]);
    expect(plan.unchanged).toEqual([]);
  });

  test("a file no longer produced is deleted", () => {
    const plan = planPublish({
      tempFiles: new Map([["index.html", "a"]]),
      outputFiles: new Map([["index.html", "a"], ["stale.html", "gone"]]),
    });
    expect(plan.delete).toEqual(["stale.html"]);
    expect(plan.unchanged).toEqual(["index.html"]);
  });

  test("Buffer and string content compare correctly when mixed", () => {
    const plan = planPublish({
      tempFiles: new Map([["a.txt", Buffer.from("hi")]]),
      outputFiles: new Map([["a.txt", "hi"]]),
    });
    expect(plan.unchanged).toEqual(["a.txt"]);
  });

  test("results are sorted (deterministic — DIA-05)", () => {
    const plan = planPublish({
      tempFiles: new Map([["z.html", "1"], ["a.html", "2"], ["m.html", "3"]]),
      outputFiles: new Map(),
    });
    expect(plan.write).toEqual(["a.html", "m.html", "z.html"]);
  });
});

// ============================================================== real I/O

describe("snapshotDirectory / applyPublishPlan (real filesystem)", () => {
  test("snapshotDirectory reads a real tree into relative-path -> Buffer, recursively", async () => {
    mkdirSync(join(tmp, "assets"), { recursive: true });
    writeFileSync(join(tmp, "index.html"), "hi");
    writeFileSync(join(tmp, "assets", "x.css"), "body{}");
    const snap = await snapshotDirectory(tmp);
    expect([...snap.keys()].sort()).toEqual(["assets/x.css", "index.html"]);
    expect(snap.get("index.html").toString()).toBe("hi");
  });

  test("snapshotDirectory returns an empty map for a directory that does not exist", async () => {
    const snap = await snapshotDirectory(join(tmp, "does-not-exist"));
    expect(snap.size).toBe(0);
  });

  test("applyPublishPlan writes new/changed files (nested dirs created) and deletes stale ones", async () => {
    writeFileSync(join(tmp, "stale.html"), "old");
    const tempFiles = new Map([
      ["index.html", "hello"],
      ["assets/deep/x.css", "body{}"],
    ]);
    const plan = planPublish({ tempFiles, outputFiles: await snapshotDirectory(tmp) });
    await applyPublishPlan({ outputDir: tmp, tempFiles, plan });

    expect(readFileSync(join(tmp, "index.html"), "utf8")).toBe("hello");
    expect(readFileSync(join(tmp, "assets", "deep", "x.css"), "utf8")).toBe("body{}");
    expect(existsSync(join(tmp, "stale.html"))).toBe(false);
  });

  test("an unchanged file is left byte-identical and is not part of the write set", async () => {
    writeFileSync(join(tmp, "index.html"), "same");
    const tempFiles = new Map([["index.html", "same"]]);
    const plan = planPublish({ tempFiles, outputFiles: await snapshotDirectory(tmp) });
    expect(plan.write).toEqual([]);
    await applyPublishPlan({ outputDir: tmp, tempFiles, plan }); // no-op; must not throw
    expect(readFileSync(join(tmp, "index.html"), "utf8")).toBe("same");
  });
});

describe("publish() — the transactional gate (PUB-01)", () => {
  test("problems present: nothing is written, previous output is byte-untouched", async () => {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, "sentinel.html"), "SENTINEL previous publish");
    const result = await publish({
      tempFiles: new Map([["index.html", "new content"]]),
      outputDir: tmp,
      reporter: silentReporter(false),
    });
    expect(result).toBeNull();
    expect(existsSync(join(tmp, "index.html"))).toBe(false);
    expect(readFileSync(join(tmp, "sentinel.html"), "utf8")).toBe("SENTINEL previous publish");
  });

  test("zero problems: publishes and returns the applied plan", async () => {
    const outDir = join(tmp, "dist"); // does not exist yet
    const result = await publish({
      tempFiles: new Map([["index.html", "hi"]]),
      outputDir: outDir,
      reporter: silentReporter(true),
    });
    expect(result.write).toEqual(["index.html"]);
    expect(readFileSync(join(outDir, "index.html"), "utf8")).toBe("hi");
  });
});

// ============================================================ --clean gate

describe("assertCleanIsSafe / performClean (§15 --clean containment)", () => {
  test("refuses when output IS the source root", () => {
    const src = join(tmp, "src");
    mkdirSync(src, { recursive: true });
    expect(() => assertCleanIsSafe({ output: src, source: src, cwd: tmp })).toThrow(UsageError);
  });

  test("refuses when output CONTAINS the source root", () => {
    const src = join(tmp, "src");
    mkdirSync(src, { recursive: true });
    expect(() => assertCleanIsSafe({ output: tmp, source: src, cwd: tmp })).toThrow(UsageError);
  });

  test("refuses when output IS CONTAINED BY the source root", () => {
    const src = join(tmp, "src");
    mkdirSync(join(src, "dist"), { recursive: true });
    expect(() => assertCleanIsSafe({ output: join(src, "dist"), source: src, cwd: tmp })).toThrow(UsageError);
  });

  test("refuses when output IS the working directory (-o . --clean)", () => {
    const src = join(tmp, "src");
    mkdirSync(src, { recursive: true });
    expect(() => assertCleanIsSafe({ output: tmp, source: src, cwd: tmp })).toThrow(UsageError);
  });

  test("the thrown error carries exit code 2 (usage/environment, §14.1), not 1", () => {
    const src = join(tmp, "src");
    mkdirSync(src, { recursive: true });
    try {
      assertCleanIsSafe({ output: src, source: src, cwd: tmp });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UsageError);
      expect(e.exitCode).toBe(2);
    }
  });

  test("an output directory outside both source root and cwd does not refuse, and performClean empties only that directory", async () => {
    const src = join(tmp, "src");
    const out = mkdtempSync(join(tmpdir(), "unify-publish-test-out-")); // NOT nested under tmp/cwd at all
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "index.html"), "keep me");
    writeFileSync(join(out, "stale.html"), "delete me");
    try {
      expect(() => assertCleanIsSafe({ output: out, source: src, cwd: tmp })).not.toThrow();
      await performClean({ output: out, source: src, cwd: tmp });

      expect(existsSync(join(out, "stale.html"))).toBe(false);
      expect(existsSync(out)).toBe(true); // the directory itself survives, only its contents are removed
      expect(readFileSync(join(src, "index.html"), "utf8")).toBe("keep me"); // source untouched
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test("performClean refuses (and deletes nothing) for an unsafe pair", async () => {
    const src = join(tmp, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "index.html"), "keep me");
    await expect(performClean({ output: src, source: src, cwd: tmp })).rejects.toBeInstanceOf(UsageError);
    expect(readFileSync(join(src, "index.html"), "utf8")).toBe("keep me");
  });

  // --- SPEC DEFECT (found while testing, reported in full in this task's
  // report): §15's containment rule reads "[output] is, contains, or is
  // contained by the source root OR THE WORKING DIRECTORY" — applying ALL
  // THREE relations symmetrically to both anchors. Applied literally, "is
  // contained by ... the working directory" refuses the single most common
  // real invocation: `unify build -s src -o dist --clean` run from a
  // project root, because "dist" is trivially contained by cwd. This test
  // pins the CURRENT (spec-faithful, almost certainly unintended) behavior
  // rather than hiding it — paths.js's cleanRefusalReason is off limits to
  // this task and is a correct implementation of what §15 currently says;
  // the fix belongs in the spec text (narrowing the working-directory leg
  // to "is" only, matching the `-o .` case the one checked-in test for this
  // rule — runtime-cases.mjs's clean-containment — actually exercises) and
  // is out of this module's authority to make.
  test("SPEC DEFECT: an ordinary nested -o dist --clean from a project root currently refuses, because output is 'contained by' cwd", () => {
    const src = join(tmp, "src");
    const out = join(tmp, "dist"); // the completely ordinary, everyday case
    mkdirSync(src, { recursive: true });
    mkdirSync(out, { recursive: true });
    expect(() => assertCleanIsSafe({ output: out, source: src, cwd: tmp })).toThrow(UsageError);
    let reason = "";
    try {
      assertCleanIsSafe({ output: out, source: src, cwd: tmp });
    } catch (e) {
      reason = e.message;
    }
    expect(reason).toContain("the working directory");
  });
});

describe("emptyDirectory", () => {
  test("removes files and subdirectories, keeps the directory itself", async () => {
    mkdirSync(join(tmp, "nested"), { recursive: true });
    writeFileSync(join(tmp, "a.txt"), "a");
    writeFileSync(join(tmp, "nested", "b.txt"), "b");
    await emptyDirectory(tmp);
    expect(existsSync(tmp)).toBe(true);
    expect(existsSync(join(tmp, "a.txt"))).toBe(false);
    expect(existsSync(join(tmp, "nested"))).toBe(false);
  });

  test("a missing directory is a silent no-op", async () => {
    await expect(emptyDirectory(join(tmp, "nope"))).resolves.toBeUndefined();
  });
});

// ========================================================= §17 dry-run report

describe("formatDryRunReport (§17)", () => {
  test("reproduces the spec's own worked example exactly", () => {
    const rows = [
      { action: "write", outputPath: "dist/404.html", from: "404.html (no layout)" },
      { action: "write", outputPath: "dist/about/index.html", from: "about.md + _layout.html" },
      { action: "copy", outputPath: "dist/assets/style.css", from: "assets/style.css" },
      { action: "write", outputPath: "dist/blog/post/index.html", from: "blog/post.html + blog/_layout.html" },
      { action: "delete", outputPath: "dist/stale.html" },
    ];
    const expected = [
      "write dist/404.html ← 404.html (no layout)",
      "write dist/about/index.html ← about.md + _layout.html",
      "copy dist/assets/style.css ← assets/style.css",
      "write dist/blog/post/index.html ← blog/post.html + blog/_layout.html",
      "delete dist/stale.html",
    ].join("\n");
    expect(formatDryRunReport(rows)).toBe(expected);
  });

  test("ordered by output path regardless of verb, even when given out of order", () => {
    const rows = [
      { action: "delete", outputPath: "dist/stale.html" },
      { action: "write", outputPath: "dist/404.html", from: "404.html (no layout)" },
      { action: "copy", outputPath: "dist/assets/style.css", from: "assets/style.css" },
    ];
    const out = formatDryRunReport(rows);
    const lines = out.split("\n");
    expect(lines[0]).toContain("dist/404.html");
    expect(lines[1]).toContain("dist/assets/style.css");
    expect(lines[2]).toContain("dist/stale.html");
  });
});
