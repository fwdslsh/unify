/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2).
 * Unit tests for src/cli/commands/init.js's own command behavior: target
 * resolution, §19.4's project-root placement and its refusal, template
 * selection, and §19.5's two content kinds written verbatim. Template
 * *content* conformance to conformance-spec §19 lives in templates.test.js,
 * and the authority for all of SCF-01..SCF-11 is
 * tests/conformance/scaffold.test.js — this file is about what `init()` does
 * with a template once it has one, not about what's in the templates.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "../../src/cli/commands/init.js";
import { Reporter, UsageError } from "../../src/core/diagnostics.js";
import { ROOT_FILES, SHARE_IMAGE } from "../../src/templates/shared.js";
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
    const code = await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: undefined, reporter: silentReporter() });
    expect(code).toBe(0);
    // about.md is unique to the default template (see templates.test.js).
    expect(existsSync(join(root, "src", "about.md"))).toBe(true);
  });

  test("scaffolds into <sourceRoot>/src when the source root defaulted to the working directory", async () => {
    const root = tempDir();
    const code = await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: silentReporter() });
    expect(code).toBe(0);
    expect(existsSync(join(root, "src", "index.html"))).toBe(true);
    expect(existsSync(join(root, "index.html"))).toBe(false);
  });

  test("scaffolds directly into sourceRoot when --source was explicit (sourceDefaulted: false)", async () => {
    // The source root is named and is NOT the project root, which is the only
    // arrangement §19.4 can satisfy both halves of: the scaffold goes exactly
    // where --source points, and the two project-root files stay outside it.
    const root = tempDir();
    const site = join(root, "site");
    mkdirSync(site, { recursive: true });
    const code = await init({ projectRoot: root, sourceRoot: site, sourceDefaulted: false, template: "basic", reporter: silentReporter() });
    expect(code).toBe(0);
    expect(existsSync(join(site, "index.html"))).toBe(true);
    expect(existsSync(join(site, "src"))).toBe(false);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
  });

  test("refuses (exit 2) when the project root IS the source root — the two files could only publish", async () => {
    // This case used to scaffold, and the tree it produced published AGENTS.md
    // and DEPLOY.md as pages: §19.4's placement rule and its "neither can
    // publish" property cannot both hold when the working directory and the
    // source root are one directory, and the section now says which way that
    // resolves. Changed here because the SPEC changed, not to match output.
    const root = tempDir();
    await expect(
      init({ projectRoot: root, sourceRoot: root, sourceDefaulted: false, template: "basic", reporter: silentReporter() }),
    ).rejects.toThrow(UsageError);
    expect(existsSync(join(root, "index.html"))).toBe(false);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(readdirSync(root)).toEqual([]);
  });

  test("refuses when the project root is INSIDE the source root (--source .. from a subdirectory)", async () => {
    const root = tempDir();
    const inner = join(root, "inner");
    mkdirSync(inner, { recursive: true });
    await expect(
      init({ projectRoot: inner, sourceRoot: root, sourceDefaulted: false, template: "basic", reporter: silentReporter() }),
    ).rejects.toThrow(UsageError);
    expect(readdirSync(inner)).toEqual([]);
    expect(readdirSync(root)).toEqual(["inner"]);
  });

  test("refuses, before writing anything, when a path the template needs as a directory is a file", async () => {
    // "init writes nothing when any file it would create already exists"
    // covered leaf paths only: `src/posts` as a plain file passed the check and
    // mkdirSync then failed mid-loop, leaving nine template files on disk that
    // the same check refused to complete on every later run.
    const root = tempDir();
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "posts"), "not a directory\n");
    await expect(
      init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "blog", reporter: silentReporter() }),
    ).rejects.toThrow(UsageError);
    expect(readdirSync(join(root, "src"))).toEqual(["posts"]);
    expect(readdirSync(root)).toEqual(["src"]);
  });

  test("an unknown template is a usage fault (exit 2), never a silent fallback", async () => {
    const root = tempDir();
    await expect(
      init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "not-a-real-template", reporter: silentReporter() }),
    ).rejects.toThrow(UsageError);
  });

  test("the unknown-template error names every valid choice", async () => {
    const root = tempDir();
    try {
      await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "nope", reporter: silentReporter() });
      throw new Error("expected init() to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(UsageError);
      for (const name of Object.keys(TEMPLATES)) expect(e.fixes.join(" ")).toContain(name);
    }
  });

  test("refuses to overwrite a target that already has scaffolded files", async () => {
    const root = tempDir();
    const first = await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: silentReporter() });
    expect(first).toBe(0);
    await expect(
      init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: silentReporter() }),
    ).rejects.toThrow(UsageError);
  });

  test("a collision refusal is a usage fault (exit 2), and the existing files are untouched", async () => {
    const root = tempDir();
    await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: silentReporter() });
    const before = readFileSync(join(root, "src", "index.html"), "utf8");
    try {
      await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "docs", reporter: silentReporter() });
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
    const code = await init({ projectRoot: root, sourceRoot: join(root, "src"), sourceDefaulted: false, template: "docs", reporter: silentReporter() });
    expect(code).toBe(0);
    expect(existsSync(join(root, "src", "_layout.html"))).toBe(true);
  });

  test("never writes unify.yaml, for any template", async () => {
    for (const name of Object.keys(TEMPLATES)) {
      const root = tempDir();
      await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: name, reporter: silentReporter() });
      expect(existsSync(join(root, "src", "unify.yaml"))).toBe(false);
    }
  });

  test("never creates a dist/ directory next to src/", async () => {
    const root = tempDir();
    await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "default", reporter: silentReporter() });
    expect(existsSync(join(root, "dist"))).toBe(false);
  });

  test("reports success as a plain summary, never as a diagnostic", async () => {
    const root = tempDir();
    const reporter = silentReporter();
    const summaryLines = [];
    const originalSummary = reporter.summary.bind(reporter);
    reporter.summary = (text) => { summaryLines.push(text); originalSummary(text); };
    const code = await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "blog", reporter });
    expect(code).toBe(0);
    expect(reporter.diagnostics).toEqual([]);
    expect(summaryLines.some((l) => l.includes("blog"))).toBe(true);
  });

  // ---- §19.4 — the two project-root files (SCF-09's unit half; the e2e
  // half, which drives the real CLI, lives in tests/conformance/scaffold.test.js)

  test("writes AGENTS.md and DEPLOY.md at the project root, outside the source root", async () => {
    for (const name of Object.keys(TEMPLATES)) {
      const root = tempDir();
      await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: name, reporter: silentReporter() });
      for (const rootFile of Object.keys(ROOT_FILES)) {
        expect(existsSync(join(root, rootFile))).toBe(true);
        // Outside the source root is the whole point: inside it, a .md file
        // is a page and would publish (§19.4).
        expect(existsSync(join(root, "src", rootFile))).toBe(false);
      }
    }
  });

  test("the project root is the working directory, never a parent inferred from an explicit --source", async () => {
    // §19.4: where --source names a directory, unify does not walk to its
    // parent — writing outside the tree the author named is the one thing a
    // scaffolding command must never do. Here the source root is a sibling of
    // the working directory, and the two files land in the working directory.
    const cwd = tempDir();
    const elsewhere = join(tempDir(), "site-source");
    mkdirSync(elsewhere, { recursive: true });
    await init({ projectRoot: cwd, sourceRoot: elsewhere, sourceDefaulted: false, template: "basic", reporter: silentReporter() });
    expect(existsSync(join(elsewhere, "index.html"))).toBe(true);
    for (const rootFile of Object.keys(ROOT_FILES)) {
      expect(existsSync(join(cwd, rootFile))).toBe(true);
      expect(existsSync(join(elsewhere, rootFile))).toBe(false);
      expect(existsSync(join(elsewhere, "..", rootFile))).toBe(false);
    }
  });

  test("an existing AGENTS.md refuses the whole scaffold, and nothing at all is written", async () => {
    const root = tempDir();
    writeFileSync(join(root, "AGENTS.md"), "# my own guidance\n");
    await expect(
      init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: silentReporter() }),
    ).rejects.toThrow(UsageError);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("# my own guidance\n");
    expect(existsSync(join(root, "src"))).toBe(false);
    expect(existsSync(join(root, "DEPLOY.md"))).toBe(false);
  });

  test("the scaffolded-file count includes the project-root files", async () => {
    const root = tempDir();
    const reporter = silentReporter();
    const summaryLines = [];
    reporter.summary = (line) => summaryLines.push(line);
    await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "basic", reporter });
    const total = Object.keys(TEMPLATES.basic).length + Object.keys(ROOT_FILES).length;
    expect(summaryLines.some((l) => l.includes(`(${total} files)`))).toBe(true);
    for (const rootFile of Object.keys(ROOT_FILES)) {
      expect(summaryLines.some((l) => l.includes(rootFile))).toBe(true);
    }
  });

  test("an explicit --source two levels down keeps the project-root files at the working directory", async () => {
    // §19.4's rule has one tempting wrong reading: infer the project root by
    // walking UP from the source root, because in the fresh-project case
    // `dirname(src/)` happens to be the right answer. It is the one thing a
    // scaffolding command must never do — it writes outside the tree the
    // author named — and it is only falsifiable when the source root is
    // deeper than one level, which is what this case is.
    const cwd = tempDir();
    const nested = join(cwd, "a", "b");
    mkdirSync(nested, { recursive: true });
    await init({ projectRoot: cwd, sourceRoot: nested, sourceDefaulted: false, template: "docs", reporter: silentReporter() });
    expect(existsSync(join(nested, "_layout.html"))).toBe(true);
    for (const rootFile of Object.keys(ROOT_FILES)) {
      expect(existsSync(join(cwd, rootFile))).toBe(true);
      expect(existsSync(join(nested, rootFile))).toBe(false);
      expect(existsSync(join(cwd, "a", rootFile))).toBe(false);
    }
  });

  test("an existing DEPLOY.md refuses too, even when the source root is somewhere else entirely", async () => {
    // The AGENTS.md case above uses a defaulted source root, where the
    // colliding path sits directly above the write target. This is the other
    // file and the other source mode: the collision is outside the directory
    // init was told to write into, which an implementation that only checked
    // its target would write straight past.
    const cwd = tempDir();
    const elsewhere = join(cwd, "site");
    mkdirSync(elsewhere, { recursive: true });
    writeFileSync(join(cwd, "DEPLOY.md"), "# how WE deploy\n");
    await expect(
      init({ projectRoot: cwd, sourceRoot: elsewhere, sourceDefaulted: false, template: "blog", reporter: silentReporter() }),
    ).rejects.toThrow(UsageError);
    expect(readFileSync(join(cwd, "DEPLOY.md"), "utf8")).toBe("# how WE deploy\n");
    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false);
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  // ---- §19.5 — a template file's content may be raw bytes (SCF-10)

  test("a template file whose content is bytes is written verbatim, not stringified", async () => {
    // No template ships a binary until the five template modules adopt
    // commonFiles(), so the write path is proved here on a probe registered in
    // the real registry — the same object init reads, not a stand-in for it.
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0d, 0x0a, 0x1a, 0x0a]);
    TEMPLATES["bytes-probe"] = { "assets/probe.bin": bytes, "index.html": "<!doctype html>\n" };
    try {
      const root = tempDir();
      await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "bytes-probe", reporter: silentReporter() });
      const written = readFileSync(join(root, "src", "assets", "probe.bin"));
      expect(written.equals(Buffer.from(bytes))).toBe(true);
    } finally {
      delete TEMPLATES["bytes-probe"];
    }
  });

  test("the share image's declared dimensions are the ones its own IHDR states (§19.2 item 4)", async () => {
    // A declared dimension that does not match the file is the invented claim
    // product-spec §6.1 forbids, in the one place nothing would ever catch it
    // — so the numbers templates write come from SHARE_IMAGE, and SHARE_IMAGE
    // is checked against the bytes it ships.
    const png = SHARE_IMAGE.bytes;
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(String.fromCharCode(...png.slice(12, 16))).toBe("IHDR");
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(SHARE_IMAGE.width);
    expect(view.getUint32(20)).toBe(SHARE_IMAGE.height);
  });
  test("every scaffolded file is byte-identical to the registry value it came from, for every template", async () => {
    // §19.5's write path, proved on the real templates rather than on a
    // synthetic probe: a string is written as UTF-8 and a Uint8Array
    // verbatim, so `init` needs no branch — only the documented type. A
    // writer that stringified the bytes, or that normalized line endings on
    // the strings, changes exactly one of these comparisons.
    for (const [name, files] of Object.entries(TEMPLATES)) {
      const root = tempDir();
      await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: name, reporter: silentReporter() });
      for (const [relPath, content] of Object.entries(files)) {
        const written = readFileSync(join(root, "src", ...relPath.split("/")));
        const expected = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
        expect(`${name}/${relPath}: ${written.equals(expected)}`).toBe(`${name}/${relPath}: true`);
      }
    }
  });
});
