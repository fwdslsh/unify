/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2).
 * Unit tests for src/cli/commands/update.js and src/cli/template-record.js:
 * §19.10's three-way table row by row, the `owned` list, --dry-run, --adopt,
 * the missing-record error, and the refusals (symlink, a directory outside
 * the project). Every case scaffolds a real directory template with init()
 * and then changes the template, the site, or both — no mocks. The e2e half
 * (real CLI, real git, SCF-15/UPD-01..03) lives in
 * tests/conformance/scaffold.test.js.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "../../src/cli/commands/init.js";
import { update } from "../../src/cli/commands/update.js";
import { Reporter, UsageError } from "../../src/core/diagnostics.js";
import { RECORD_FILE, readRecord } from "../../src/cli/template-record.js";

const dirs = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "unify-update-test-"));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A reporter whose stdout lines are collected. */
function collecting() {
  const lines = [];
  const reporter = new Reporter({ strict: false, stderr: { write() {} }, stdout: { write: (s) => lines.push(s.trimEnd()) } });
  return { reporter, lines };
}

/** Write `{rel: text}` under `dir`. */
function write(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
}

const V1 = {
  "site/_layout.html": '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>T</title></head><body><main></main></body></html>\n',
  "site/index.html": "<title>Home</title><main><h1>v1</h1></main>\n",
  "site/config.json": '{"lab": "CHANGE ME"}\n',
  "site/reports/seed.md": "# seed report\n",
  "AGENTS.md": "# agents v1\n",
  "unify.yaml": "# all commented\n",
  "unify.template.json": '{"owned": ["site/config.json", "site/reports/**"]}\n',
};

/** A fresh template directory at v1 and a project scaffolded from it. */
async function scaffold() {
  const tpl = tempDir();
  write(tpl, V1);
  const root = tempDir();
  const r = await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: tpl, reporter: collecting().reporter });
  expect(r).toBe(0);
  return { tpl, root, site: join(root, "site") };
}

/** Run update() against `root`. */
async function run(root, { template, dryRun = false, adopt = false } = {}) {
  const { reporter, lines } = collecting();
  const code = await update({ projectRoot: root, sourceRoot: join(root, "site"), settings: { dryRun }, template, adopt, reporter });
  return { code, lines, text: lines.join("\n") };
}

describe("the record init writes (§19.10)", () => {
  test("names the source, the revision, the source directory, the owned list and a hash per template file; the manifest itself is not copied", async () => {
    const { tpl, root } = await scaffold();
    const record = readRecord(root);
    expect(record.source).toBe(tpl);
    expect(record.revision).toBeNull(); // a directory has no version
    expect(record.sourceDir).toBe("site");
    expect(record.owned).toEqual(["site/config.json", "site/reports/**"]);
    expect(Object.keys(record.files).sort()).toEqual(["AGENTS.md", "site/_layout.html", "site/config.json", "site/index.html", "site/reports/seed.md", "unify.yaml"]);
    for (const hash of Object.values(record.files)) expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // The manifest in the template is packaging; the file at the project root is the RECORD, not a copy.
    expect(JSON.parse(readFileSync(join(root, RECORD_FILE), "utf8")).schemaVersion).toBe(1);
  });

  test("a built-in records unify's own version as the revision, and update then has nothing to do", async () => {
    const root = tempDir();
    await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: collecting().reporter });
    const record = readRecord(root);
    expect(record.source).toBe("basic");
    expect(record.revision).toMatch(/^\d+\.\d+\.\d+/);
    const { code, text } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("nothing to do");
  });

  test("a template manifest that is not a list of patterns is a usage error", async () => {
    const tpl = tempDir();
    write(tpl, { ...V1, "unify.template.json": '{"owned": "site/config.json"}' });
    const root = tempDir();
    await expect(init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: tpl, reporter: collecting().reporter })).rejects.toThrow(/"owned" must be a list/);
  });
});

describe("update() — the three-way table (§19.10)", () => {
  test("the same version is a no-op and writes nothing", async () => {
    const { root } = await scaffold();
    const before = readFileSync(join(root, RECORD_FILE), "utf8");
    const { code, text } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("nothing to do");
    expect(readFileSync(join(root, RECORD_FILE), "utf8")).toBe(before);
  });

  test("template changed, site untouched → updated; template unchanged, site edited → left alone", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(site, "_layout.html"), "<!-- mine -->\n"); // site edit, template will not touch it
    writeFileSync(join(tpl, "site", "index.html"), "<title>Home</title><main><h1>v2</h1></main>\n");
    const { code, text } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("update site/index.html");
    expect(readFileSync(join(site, "index.html"), "utf8")).toContain("v2");
    expect(readFileSync(join(site, "_layout.html"), "utf8")).toBe("<!-- mine -->\n");
    // The baseline moved: the same update again is a no-op.
    expect((await run(root)).text).toContain("nothing to do");
  });

  test("both changed → conflict: the site's bytes stay, exit 1, and the conflict stays visible until resolved", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(site, "index.html"), "<main>my index</main>\n");
    writeFileSync(join(tpl, "site", "index.html"), "<main>their index</main>\n");
    const first = await run(root);
    expect(first.code).toBe(1);
    expect(first.text).toContain("conflict site/index.html: changed locally and in the template");
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("<main>my index</main>\n");
    // Still a conflict on the next run — the baseline hash was kept.
    const second = await run(root);
    expect(second.code).toBe(1);
    expect(second.text).toContain("conflict site/index.html");
    // Taking the template's version resolves it: recorded as current, exit 0.
    writeFileSync(join(site, "index.html"), "<main>their index</main>\n");
    const third = await run(root);
    expect(third.code).toBe(0);
    expect(third.text).toContain("nothing to do");
  });

  test("site removed a file the template changed → conflict, stays removed; template unchanged → stays removed silently", async () => {
    const { tpl, root, site } = await scaffold();
    rmSync(join(site, "index.html"));
    rmSync(join(site, "_layout.html"));
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    const { code, text } = await run(root);
    expect(code).toBe(1);
    expect(text).toContain("conflict site/index.html: removed locally, changed in the template");
    expect(text).not.toContain("_layout.html");
    expect(existsSync(join(site, "index.html"))).toBe(false);
    expect(existsSync(join(site, "_layout.html"))).toBe(false);
  });

  test("new in the template → added where absent, conflict where the site already has a file", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(tpl, "site", "new.html"), "<main>new</main>\n");
    writeFileSync(join(tpl, "site", "mine.html"), "<main>theirs</main>\n");
    writeFileSync(join(site, "mine.html"), "<main>mine</main>\n");
    const { code, text } = await run(root);
    expect(code).toBe(1);
    expect(text).toContain("add site/new.html");
    expect(text).toContain("conflict site/mine.html: exists locally and is not the template's file");
    expect(readFileSync(join(site, "new.html"), "utf8")).toBe("<main>new</main>\n");
    expect(readFileSync(join(site, "mine.html"), "utf8")).toBe("<main>mine</main>\n");
  });

  test("gone from the template → removed if untouched, kept as a conflict if edited, nothing if already gone", async () => {
    const { tpl, root, site } = await scaffold();
    rmSync(join(tpl, "AGENTS.md"));
    rmSync(join(tpl, "site", "index.html"));
    rmSync(join(tpl, "site", "_layout.html"));
    writeFileSync(join(site, "index.html"), "<main>edited</main>\n");
    rmSync(join(site, "_layout.html"));
    const { code, text } = await run(root);
    expect(code).toBe(1);
    expect(text).toContain("remove AGENTS.md");
    expect(text).toContain("conflict site/index.html: removed from the template, changed locally");
    expect(text).not.toContain("_layout.html");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("<main>edited</main>\n");
    expect(Object.keys(readRecord(root).files)).not.toContain("AGENTS.md");
  });

  test("owned files: never rewritten, removed or reported even when the upstream seed changes; added once when absent", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(site, "config.json"), '{"lab": "Mine"}\n');
    writeFileSync(join(site, "reports", "2026-01.md"), "# my report\n");
    writeFileSync(join(tpl, "site", "config.json"), '{"lab": "NEW SEED"}\n');
    rmSync(join(tpl, "site", "reports", "seed.md"));
    writeFileSync(join(tpl, "site", "reports", "another-seed.md"), "# another seed\n");
    const { code, text } = await run(root);
    expect(code).toBe(0);
    expect(text).not.toContain("config.json");
    expect(text).not.toContain("site/reports/seed.md");
    expect(text).toContain("add site/reports/another-seed.md");
    expect(readFileSync(join(site, "config.json"), "utf8")).toBe('{"lab": "Mine"}\n');
    expect(readFileSync(join(site, "reports", "seed.md"), "utf8")).toBe("# seed report\n");
    expect(readFileSync(join(site, "reports", "2026-01.md"), "utf8")).toBe("# my report\n");
  });

  test("files outside the template and the record are never visited", async () => {
    const { tpl, root, site } = await scaffold();
    write(root, { ".env": "SECRET=1\n", "state/run.json": "{}\n", "dist/index.html": "built\n" });
    write(site, { "authored.md": "# mine\n" });
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    const { code } = await run(root);
    expect(code).toBe(0);
    for (const [rel, text] of [[".env", "SECRET=1\n"], ["state/run.json", "{}\n"], ["dist/index.html", "built\n"], ["site/authored.md", "# mine\n"]]) {
      expect(readFileSync(join(root, rel), "utf8")).toBe(text);
    }
  });

  test("--dry-run prints the same change set with 'would' and writes nothing, not even the record", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    writeFileSync(join(tpl, "site", "new.html"), "<main>new</main>\n");
    const before = readFileSync(join(root, RECORD_FILE), "utf8");
    const { code, text } = await run(root, { dryRun: true });
    expect(code).toBe(0);
    expect(text).toContain("would update site/index.html");
    expect(text).toContain("would add site/new.html");
    expect(readFileSync(join(site, "index.html"), "utf8")).toContain("v1");
    expect(existsSync(join(site, "new.html"))).toBe(false);
    expect(readFileSync(join(root, RECORD_FILE), "utf8")).toBe(before);
  });

  test("a positional moves the project to another source, and the record follows", async () => {
    const { root, site } = await scaffold();
    const fork = tempDir();
    write(fork, { ...V1, "site/index.html": "<main>fork</main>\n" });
    const { code, text } = await run(root, { template: fork });
    expect(code).toBe(0);
    expect(text).toContain("update site/index.html");
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("<main>fork</main>\n");
    expect(readRecord(root).source).toBe(fork);
  });
});

describe("update() — safety and recovery (§19.10)", () => {
  test("a symlink where the template writes is a conflict: never followed, never replaced", async () => {
    const { tpl, root, site } = await scaffold();
    const elsewhere = tempDir();
    writeFileSync(join(elsewhere, "target.html"), "outside\n");
    rmSync(join(site, "index.html"));
    symlinkSync(join(elsewhere, "target.html"), join(site, "index.html"));
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    const { code, text } = await run(root);
    expect(code).toBe(1);
    expect(text).toContain("conflict site/index.html: it is a symlink");
    expect(readFileSync(join(elsewhere, "target.html"), "utf8")).toBe("outside\n");
    expect(lstatSync(join(site, "index.html")).isSymbolicLink()).toBe(true);
  });

  test("a directory that resolves outside the project is a conflict, and nothing lands there", async () => {
    const { tpl, root, site } = await scaffold();
    const elsewhere = tempDir();
    rmSync(join(site, "reports"), { recursive: true });
    symlinkSync(elsewhere, join(site, "assets"));
    mkdirSync(join(tpl, "site", "assets"));
    writeFileSync(join(tpl, "site", "assets", "style.css"), "body{}\n");
    const { code, text } = await run(root);
    expect(code).toBe(1);
    expect(text).toContain("conflict site/assets/style.css: its directory resolves outside the project");
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  test("no record → usage error naming --adopt; --adopt records the template without changing a file; update then compares against it", async () => {
    const { tpl, root, site } = await scaffold();
    rmSync(join(root, RECORD_FILE));
    writeFileSync(join(site, "index.html"), "<main>edited after a lost record</main>\n");
    const missing = await run(root).catch((e) => e);
    expect(missing).toBeInstanceOf(UsageError);
    expect(missing.message).toContain("no recorded template");
    expect(missing.fixes.join("\n")).toContain("unify update --adopt <source>");
    await expect(run(root, { adopt: true })).rejects.toThrow(/--adopt needs the template/);
    const adopted = await run(root, { template: tpl, adopt: true });
    expect(adopted.code).toBe(0);
    expect(adopted.text).toContain("no file was changed");
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("<main>edited after a lost record</main>\n");
    expect(readRecord(root).source).toBe(tpl);
    // The baseline is the adopted version: the edit shows up only when the template moves.
    expect((await run(root)).text).toContain("nothing to do");
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    const { code, text } = await run(root);
    expect(code).toBe(1);
    expect(text).toContain("conflict site/index.html: changed locally and in the template");
  });

  test("a record that is not one unify wrote is a usage error naming the file, never a guessed baseline", async () => {
    const { root } = await scaffold();
    writeFileSync(join(root, RECORD_FILE), '{"hello": "world"}\n');
    await expect(run(root)).rejects.toThrow(/not a template record unify wrote/);
    writeFileSync(join(root, RECORD_FILE), "not json");
    await expect(run(root)).rejects.toThrow(/not valid JSON/);
  });

  test("a source that cannot be fetched changes nothing", async () => {
    const { root, site } = await scaffold();
    const before = readFileSync(join(root, RECORD_FILE), "utf8");
    await expect(run(root, { template: `file://${tempDir()}/no-such-repo.git` })).rejects.toThrow(/git clone failed/);
    expect(readFileSync(join(root, RECORD_FILE), "utf8")).toBe(before);
    expect(readFileSync(join(site, "index.html"), "utf8")).toContain("v1");
  });
});
