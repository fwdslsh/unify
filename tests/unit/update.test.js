/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2).
 * Unit tests for src/cli/commands/update.js over the record §19.10 keeps in
 * unify.yaml: the three-way table row by row with the baseline FETCHED at the
 * recorded pin, `owned:`, the record advancing only on a conflict-free run,
 * --dry-run, the unpinned two-way fallback, the refusals (symlink, a directory
 * outside the project) and the missing-record error. Every case scaffolds a
 * real directory template — a git repository, so it has a commit to pin —
 * with init() and then changes the template, the site, or both. No mocks.
 * The e2e half (real CLI, a bare git host, SCF-15/UPD-01..03) lives in
 * tests/conformance/scaffold.test.js.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "../../src/cli/commands/init.js";
import { update } from "../../src/cli/commands/update.js";
import { resolveSettings } from "../../src/cli/settings.js";
import { Reporter, UsageError } from "../../src/core/diagnostics.js";
import pkg from "../../package.json" with { type: "json" };

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

/** The author's own git, as init and update run it. */
function git(cwd, ...args) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
const commit = (dir, msg) => { git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", msg); return git(dir, "rev-parse", "HEAD"); };

const V1 = {
  "site/_layout.html": '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>T</title></head><body><main></main></body></html>\n',
  "site/index.html": "<title>Home</title><main><h1>v1</h1></main>\n",
  "site/config.json": '{"lab": "CHANGE ME"}\n',
  "site/reports/seed.md": "# seed report\n",
  "AGENTS.md": "# agents v1\n",
  "unify.yaml": "owned:\n  - site/config.json\n  - site/reports/**\n",
};

/** A fresh template repository at v1, and a project scaffolded from it. */
async function scaffold({ versioned = true } = {}) {
  const tpl = tempDir();
  write(tpl, V1);
  let sha = null;
  if (versioned) { git(tpl, "init", "-q", "-b", "main"); sha = commit(tpl, "v1"); }
  const root = tempDir();
  const r = await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: tpl, reporter: collecting().reporter });
  expect(r).toBe(0);
  return { tpl, root, site: join(root, "site"), sha };
}

/** unify.yaml's record line. */
const recordOf = (root) => readFileSync(join(root, "unify.yaml"), "utf8").match(/^template: (.+)$/m)?.[1] ?? null;

/** Run update() the way the CLI does: settings resolved from the project's own unify.yaml. */
async function run(root, { template, dryRun = false, owned } = {}) {
  const { reporter, lines } = collecting();
  const flags = { command: "update", source: join(root, "site") };
  if (dryRun) flags["dry-run"] = true;
  if (owned) flags.owned = owned;
  const { settings } = resolveSettings(flags, root);
  const code = await update({ projectRoot: root, sourceRoot: join(root, "site"), settings, template, reporter });
  return { code, lines, text: lines.join("\n") };
}

describe("the record init writes (§19.10)", () => {
  test("is one line in unify.yaml: the directory as typed (absolute here; a relative one stays relative to the file), pinned to its commit; the template's owned: list arrives in the same file", async () => {
    const { tpl, root, sha } = await scaffold();
    expect(recordOf(root)).toBe(`${tpl}#${sha}`);
    const yaml = readFileSync(join(root, "unify.yaml"), "utf8");
    expect(yaml).toMatch(/^owned:\n  - site\/config\.json\n  - site\/reports\/\*\*$/m);
    expect(readdirSync(root).sort()).toEqual(["AGENTS.md", "site", "unify.yaml"]);
  });

  test("a directory that is not a clean checkout is recorded without a pin", async () => {
    const { tpl, root } = await scaffold({ versioned: false });
    expect(recordOf(root)).toBe(tpl);
    const dirty = tempDir();
    write(dirty, V1);
    git(dirty, "init", "-q", "-b", "main");
    commit(dirty, "v1");
    writeFileSync(join(dirty, "site", "index.html"), "uncommitted\n");
    const root2 = tempDir();
    await init({ projectRoot: root2, sourceRoot: root2, sourceDefaulted: true, template: dirty, reporter: collecting().reporter });
    expect(recordOf(root2)).toBe(dirty);
  });

  test("a built-in records name@<unify version>, and update then has nothing to do without touching the network", async () => {
    const root = tempDir();
    await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: collecting().reporter });
    expect(recordOf(root)).toBe(`basic@${pkg.version}`);
    const { code, text } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("nothing to do");
  });
});

describe("update() — the three-way table (§19.10)", () => {
  test("the same version is a no-op and writes nothing", async () => {
    const { root } = await scaffold();
    const before = readFileSync(join(root, "unify.yaml"), "utf8");
    const { code, text } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("nothing to do");
    expect(readFileSync(join(root, "unify.yaml"), "utf8")).toBe(before);
  });

  test("template changed, site untouched → updated; template unchanged, site edited → left alone; the record advances", async () => {
    const { tpl, root, site, sha } = await scaffold();
    writeFileSync(join(site, "_layout.html"), "<!-- mine -->\n"); // site edit, template will not touch it
    writeFileSync(join(tpl, "site", "index.html"), "<title>Home</title><main><h1>v2</h1></main>\n");
    const sha2 = commit(tpl, "v2");
    const { code, text } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("update site/index.html");
    expect(readFileSync(join(site, "index.html"), "utf8")).toContain("v2");
    expect(readFileSync(join(site, "_layout.html"), "utf8")).toBe("<!-- mine -->\n");
    expect(recordOf(root)).toBe(`${tpl}#${sha2}`);
    expect(sha2).not.toBe(sha);
    expect((await run(root)).text).toContain("nothing to do");
  });

  test("both changed → conflict: the site's bytes stay, exit 1, the record stays, and the conflict is reported again until resolved", async () => {
    const { tpl, root, site, sha } = await scaffold();
    writeFileSync(join(site, "index.html"), "<main>my index</main>\n");
    writeFileSync(join(tpl, "site", "index.html"), "<main>their index</main>\n");
    const sha2 = commit(tpl, "v2");
    const first = await run(root);
    expect(first.code).toBe(1);
    expect(first.text).toContain("conflict site/index.html: changed locally and in the template");
    expect(first.text).toContain(`unify.yaml stays at template: ${tpl}#${sha}`);
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("<main>my index</main>\n");
    expect(recordOf(root)).toBe(`${tpl}#${sha}`);
    const second = await run(root);
    expect(second.code).toBe(1);
    expect(second.text).toContain("conflict site/index.html");
    // Taking the template's version resolves it: the next run is clean and the record moves.
    writeFileSync(join(site, "index.html"), "<main>their index</main>\n");
    const third = await run(root);
    expect(third.code).toBe(0);
    expect(third.text).toContain("nothing to do");
    expect(recordOf(root)).toBe(`${tpl}#${sha2}`);
  });

  test("keeping your own version for good: list the file under owned:, and the conflict is gone", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(site, "index.html"), "<main>my index</main>\n");
    writeFileSync(join(tpl, "site", "index.html"), "<main>their index</main>\n");
    const sha2 = commit(tpl, "v2");
    expect((await run(root)).code).toBe(1);
    const yaml = readFileSync(join(root, "unify.yaml"), "utf8").replace("owned:\n", "owned:\n  - site/index.html\n");
    writeFileSync(join(root, "unify.yaml"), yaml);
    const { code, text } = await run(root);
    expect(code).toBe(0);
    expect(text).not.toContain("conflict");
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("<main>my index</main>\n");
    expect(recordOf(root)).toBe(`${tpl}#${sha2}`);
  });

  test("site removed a file the template changed → conflict, stays removed; template unchanged → stays removed silently", async () => {
    const { tpl, root, site } = await scaffold();
    rmSync(join(site, "index.html"));
    rmSync(join(site, "_layout.html"));
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    commit(tpl, "v2");
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
    commit(tpl, "v2");
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
    commit(tpl, "v2");
    writeFileSync(join(site, "index.html"), "<main>edited</main>\n");
    rmSync(join(site, "_layout.html"));
    const { code, text } = await run(root);
    expect(code).toBe(1);
    expect(text).toContain("remove AGENTS.md");
    expect(text).toContain("conflict site/index.html: removed from the template, changed locally");
    expect(text).not.toContain("_layout.html");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("<main>edited</main>\n");
  });

  test("owned files: never rewritten, removed or reported even when the upstream seed changes; added once when absent; --owned replaces the saved list, as --exclude does", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(site, "config.json"), '{"lab": "Mine"}\n');
    writeFileSync(join(site, "reports", "2026-01.md"), "# my report\n");
    writeFileSync(join(site, "_layout.html"), "<!-- mine -->\n");
    writeFileSync(join(tpl, "site", "config.json"), '{"lab": "NEW SEED"}\n');
    rmSync(join(tpl, "site", "reports", "seed.md"));
    writeFileSync(join(tpl, "site", "reports", "another-seed.md"), "# another seed\n");
    writeFileSync(join(tpl, "site", "_layout.html"), "<!-- theirs -->\n");
    commit(tpl, "v2");
    const { code, text } = await run(root, { owned: ["site/config.json", "site/reports/**", "site/_layout.html"] });
    expect(code).toBe(0);
    expect(text).not.toContain("config.json");
    expect(text).not.toContain("site/reports/seed.md");
    expect(text).not.toContain("_layout.html");
    expect(text).toContain("add site/reports/another-seed.md");
    expect(readFileSync(join(site, "config.json"), "utf8")).toBe('{"lab": "Mine"}\n');
    expect(readFileSync(join(site, "reports", "seed.md"), "utf8")).toBe("# seed report\n");
    expect(readFileSync(join(site, "reports", "2026-01.md"), "utf8")).toBe("# my report\n");
    expect(readFileSync(join(site, "_layout.html"), "utf8")).toBe("<!-- mine -->\n");
  });

  test("unify.yaml is compared and written without its template: line, which stays unify's", async () => {
    const { tpl, root, site, sha } = await scaffold();
    writeFileSync(join(tpl, "unify.yaml"), `${V1["unify.yaml"]}catalog: true\n`);
    const sha2 = commit(tpl, "v2");
    const { code, text } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("update unify.yaml");
    const yaml = readFileSync(join(root, "unify.yaml"), "utf8");
    expect(yaml).toMatch(/^catalog: true$/m);
    expect(recordOf(root)).toBe(`${tpl}#${sha2}`);
    expect(sha2).not.toBe(sha);
    expect(existsSync(join(site, "unify.yaml"))).toBe(false);
  });

  test("files outside the template are never visited", async () => {
    const { tpl, root, site } = await scaffold();
    write(root, { ".env": "SECRET=1\n", "state/run.json": "{}\n", "dist/index.html": "built\n" });
    write(site, { "authored.md": "# mine\n" });
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    commit(tpl, "v2");
    const { code } = await run(root);
    expect(code).toBe(0);
    for (const [rel, text] of [[".env", "SECRET=1\n"], ["state/run.json", "{}\n"], ["dist/index.html", "built\n"], ["site/authored.md", "# mine\n"]]) {
      expect(readFileSync(join(root, rel), "utf8")).toBe(text);
    }
  });

  test("--dry-run prints the same change set with 'would' and writes nothing, not even the record", async () => {
    const { tpl, root, site, sha } = await scaffold();
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    writeFileSync(join(tpl, "site", "new.html"), "<main>new</main>\n");
    commit(tpl, "v2");
    const before = readFileSync(join(root, "unify.yaml"), "utf8");
    const { code, text } = await run(root, { dryRun: true });
    expect(code).toBe(0);
    expect(text).toContain("would update site/index.html");
    expect(text).toContain("would add site/new.html");
    expect(readFileSync(join(site, "index.html"), "utf8")).toContain("v1");
    expect(existsSync(join(site, "new.html"))).toBe(false);
    expect(readFileSync(join(root, "unify.yaml"), "utf8")).toBe(before);
    expect(recordOf(root)).toBe(`${tpl}#${sha}`);
  });

  test("a positional moves the project to another source, and the record follows, pinned", async () => {
    const { root, site } = await scaffold();
    const fork = tempDir();
    write(fork, { ...V1, "site/index.html": "<main>fork</main>\n" });
    git(fork, "init", "-q", "-b", "main");
    const forkSha = commit(fork, "fork");
    const { code, text } = await run(root, { template: fork });
    expect(code).toBe(0);
    expect(text).toContain("update site/index.html");
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("<main>fork</main>\n");
    expect(recordOf(root)).toBe(`${fork}#${forkSha}`);
  });
});

describe("update() — without a pin there is no baseline (§19.10)", () => {
  test("an unpinned record compares two ways: a differing file is a conflict, an equal one nothing, a new one added, nothing removed", async () => {
    const { tpl, root, site } = await scaffold({ versioned: false });
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    writeFileSync(join(tpl, "site", "new.html"), "<main>new</main>\n");
    rmSync(join(tpl, "AGENTS.md"));
    const { code, text } = await run(root);
    expect(code).toBe(1);
    expect(text).toContain("conflict site/index.html: differs from the template, which has no earlier version to compare against");
    expect(text).toContain("add site/new.html");
    expect(text).not.toContain("_layout.html");
    expect(text).not.toMatch(/^remove /m);
    expect(text).toContain("has no recorded version to compare against");
    expect(readFileSync(join(site, "index.html"), "utf8")).toContain("v1");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
  });
});

describe("update() — safety and the record (§19.10)", () => {
  test("a symlink where the template writes is a conflict: never followed, never replaced", async () => {
    const { tpl, root, site } = await scaffold();
    const elsewhere = tempDir();
    writeFileSync(join(elsewhere, "target.html"), "outside\n");
    rmSync(join(site, "index.html"));
    symlinkSync(join(elsewhere, "target.html"), join(site, "index.html"));
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    commit(tpl, "v2");
    const { code, text } = await run(root);
    expect(code).toBe(1);
    expect(text).toContain("conflict site/index.html: it is a symlink");
    expect(readFileSync(join(elsewhere, "target.html"), "utf8")).toBe("outside\n");
    expect(lstatSync(join(site, "index.html")).isSymbolicLink()).toBe(true);
  });

  test("a directory that resolves outside the project is a conflict, and nothing lands there", async () => {
    const { tpl, root, site } = await scaffold();
    const elsewhere = tempDir();
    symlinkSync(elsewhere, join(site, "assets"));
    mkdirSync(join(tpl, "site", "assets"));
    writeFileSync(join(tpl, "site", "assets", "style.css"), "body{}\n");
    commit(tpl, "v2");
    const { code, text } = await run(root);
    expect(code).toBe(1);
    expect(text).toContain("conflict site/assets/style.css: its directory resolves outside the project");
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  test("no template: line → usage error naming the line to add, with the exact line when a 0.11.2 record file is present", async () => {
    const { tpl, root, sha } = await scaffold();
    const yaml = readFileSync(join(root, "unify.yaml"), "utf8").split("\n").filter((l) => !/^template:/.test(l)).join("\n");
    writeFileSync(join(root, "unify.yaml"), yaml);
    const missing = await run(root).catch((e) => e);
    expect(missing).toBeInstanceOf(UsageError);
    expect(missing.message).toContain("no template recorded");
    expect(missing.fixes.join("\n")).toContain("template: <git url>#<commit>");
    writeFileSync(join(root, "unify.template.json"), JSON.stringify({ schemaVersion: 1, source: tpl, revision: sha, files: {} }));
    const legacy = await run(root).catch((e) => e);
    expect(legacy.fixes[0]).toContain(`template: ${tpl}#${sha}`);
    // Adding the line by hand is the whole recovery.
    rmSync(join(root, "unify.template.json"));
    writeFileSync(join(root, "unify.yaml"), `${yaml}\ntemplate: ${tpl}#${sha}\n`);
    expect((await run(root)).text).toContain("nothing to do");
  });

  test("a source that cannot be fetched changes nothing", async () => {
    const { root, site } = await scaffold();
    const before = readFileSync(join(root, "unify.yaml"), "utf8");
    await expect(run(root, { template: `file://${tempDir()}/no-such-repo.git` })).rejects.toThrow(/git clone failed/);
    expect(readFileSync(join(root, "unify.yaml"), "utf8")).toBe(before);
    expect(readFileSync(join(site, "index.html"), "utf8")).toContain("v1");
  });
});
