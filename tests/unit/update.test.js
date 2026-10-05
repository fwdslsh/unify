/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2).
 * Unit tests for src/cli/commands/update.js over the record §19.10 keeps in
 * unify.yaml: the three outcomes per template file (add, nothing, overwrite),
 * the question an overwrite asks and its answers (y, n, end of input, --yes),
 * --dry-run, a named source replacing the line, the skips (symlink, a
 * directory outside the project) and the missing-record error. Every case
 * scaffolds a real directory template with init() and then changes the
 * template, the site, or both; the answer arrives down a real stream. The
 * e2e half (real CLI, a bare git host, SCF-15/UPD-01..03) lives in
 * tests/conformance/scaffold.test.js.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { init } from "../../src/cli/commands/init.js";
import { update } from "../../src/cli/commands/update.js";
import { resolveSettings } from "../../src/cli/settings.js";
import { Reporter, UsageError } from "../../src/core/diagnostics.js";

const dirs = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "unify-update-test-"));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A reporter whose stdout lines and stderr text are collected. */
function collecting() {
  const lines = [];
  const err = [];
  const reporter = new Reporter({ strict: false, stderr: { write: (s) => err.push(s) }, stdout: { write: (s) => lines.push(s.trimEnd()) } });
  return { reporter, lines, err };
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
  "AGENTS.md": "# agents v1\n",
};

/** A fresh directory template at v1, and a project scaffolded from it. */
async function scaffold() {
  const tpl = tempDir();
  write(tpl, V1);
  const root = tempDir();
  const r = await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: tpl, reporter: collecting().reporter });
  expect(r).toBe(0);
  return { tpl, root, site: join(root, "site") };
}

/** unify.yaml's record line. */
const recordOf = (root) => {
  const text = readFileSync(join(root, "unify.yaml"), "utf8");
  return text.match(/^template: (.+)$/m)?.[1] ?? text.match(/^\s+source: (.+)$/m)?.[1] ?? null;
};

/**
 * Run update() the way the CLI does: settings resolved from the project's
 * own unify.yaml, the answer read from a stream holding `answer` (nothing,
 * by default — a closed stdin).
 */
async function run(root, { template, dryRun = false, yes = false, answer = "", keep } = {}) {
  const { reporter, lines, err } = collecting();
  const flags = { command: "update", source: join(root, "site") };
  if (dryRun) flags["dry-run"] = true;
  if (yes) flags.yes = true;
  if (keep) flags.keep = keep;
  const { settings } = resolveSettings(flags, root);
  const stdin = Readable.from(answer === "" ? [] : [answer]);
  const code = await update({ projectRoot: root, sourceRoot: join(root, "site"), settings, template, reporter, stdin });
  return { code, lines, text: lines.join("\n"), asked: err.join("").includes("[y/N]") };
}

describe("the record init writes (§19.10)", () => {
  test("is one line in unify.yaml: the directory as typed (absolute here), and nothing else is written", async () => {
    const { tpl, root } = await scaffold();
    expect(recordOf(root)).toBe(tpl);
    expect(readdirSync(root).sort()).toEqual(["AGENTS.md", "site", "unify.yaml"]);
  });

  test("a relative directory is written relative to the file, and update resolves it from there", async () => {
    const parent = tempDir();
    write(join(parent, "tpl"), V1);
    const root = join(parent, "proj");
    mkdirSync(root);
    await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "../tpl", reporter: collecting().reporter });
    expect(recordOf(root)).toBe("../tpl");
    const { code, text } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("nothing to do");
  });

  test("a built-in records its name, and update then has nothing to do without touching the network", async () => {
    const root = tempDir();
    await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: "basic", reporter: collecting().reporter });
    expect(recordOf(root)).toBe("basic");
    const { code, text, asked } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("nothing to do");
    expect(asked).toBe(false);
  });
});

describe("update() — copies the template over the project, after asking (§19.10)", () => {
  test("the same template is a no-op: nothing listed, nothing asked, nothing written", async () => {
    const { root } = await scaffold();
    const before = readFileSync(join(root, "unify.yaml"), "utf8");
    const { code, text, asked } = await run(root);
    expect(code).toBe(0);
    expect(text).toBe(`update: nothing to do — ${recordOf(root)} is already applied`);
    expect(asked).toBe(false);
    expect(readFileSync(join(root, "unify.yaml"), "utf8")).toBe(before);
  });

  test("every file that differs is listed as an overwrite, a new one as an add; y writes them; a dropped file stays and the site's own files are never visited", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(site, "_layout.html"), "<!-- mine -->\n"); // the site's edit — listed, since it differs
    writeFileSync(join(site, "authored.md"), "# mine\n"); // the site's own — not the template's, never visited
    writeFileSync(join(tpl, "site", "index.html"), "<title>Home</title><main><h1>v2</h1></main>\n");
    writeFileSync(join(tpl, "site", "new.html"), "<main>new</main>\n");
    rmSync(join(tpl, "AGENTS.md"));
    const { code, text, asked } = await run(root, { answer: "y\n" });
    expect(code).toBe(0);
    expect(asked).toBe(true);
    expect(text).toContain("overwrite site/_layout.html");
    expect(text).toContain("overwrite site/index.html");
    expect(text).toContain("add site/new.html");
    expect(text).toContain("update: overwrote 2, added 1");
    expect(text).not.toMatch(/AGENTS|authored/);
    expect(readFileSync(join(site, "index.html"), "utf8")).toContain("v2");
    expect(readFileSync(join(site, "_layout.html"), "utf8")).toBe(V1["site/_layout.html"]);
    expect(readFileSync(join(site, "new.html"), "utf8")).toBe("<main>new</main>\n");
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("# agents v1\n");
    expect(readFileSync(join(site, "authored.md"), "utf8")).toBe("# mine\n");
    expect((await run(root)).text).toContain("nothing to do");
  });

  test("n, a blank line or end of input writes nothing: exit 1, and the message names --yes", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    writeFileSync(join(tpl, "site", "new.html"), "<main>new</main>\n");
    for (const answer of ["n\n", "\n", "", "yes please\n"]) {
      const { code, text, asked } = await run(root, { answer });
      expect(code).toBe(1);
      expect(asked).toBe(true);
      expect(text).toContain("overwrite site/index.html");
      expect(text).toContain("nothing written");
      expect(text).toContain("--yes");
      expect(readFileSync(join(site, "index.html"), "utf8")).toContain("v1");
      expect(existsSync(join(site, "new.html"))).toBe(false);
    }
    expect((await run(root, { answer: "YES\n" })).code).toBe(0);
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("<main>v2</main>\n");
  });

  test("--yes writes without asking", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    const { code, asked } = await run(root, { yes: true });
    expect(code).toBe(0);
    expect(asked).toBe(false);
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("<main>v2</main>\n");
  });

  test("adds alone lose nothing, so they never ask", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(tpl, "site", "new.html"), "<main>new</main>\n");
    const { code, text, asked } = await run(root);
    expect(code).toBe(0);
    expect(asked).toBe(false);
    expect(text).toContain("add site/new.html");
    expect(text).toContain("update: overwrote 0, added 1");
    expect(readFileSync(join(site, "new.html"), "utf8")).toBe("<main>new</main>\n");
  });

  test("unify.yaml is compared without its template: line, and the line is written back after the copy", async () => {
    const { tpl, root, site } = await scaffold();
    expect((await run(root)).text).toContain("nothing to do"); // init's all-commented file against a template without one: the template ships none
    writeFileSync(join(tpl, "unify.yaml"), "catalog: true\n");
    const { code, text } = await run(root, { answer: "y\n" });
    expect(code).toBe(0);
    expect(text).toContain("overwrite unify.yaml");
    expect(readFileSync(join(root, "unify.yaml"), "utf8")).toBe(`catalog: true\ntemplate: ${tpl}\n`);
    expect(existsSync(join(site, "unify.yaml"))).toBe(false);
    expect((await run(root)).text).toContain("nothing to do");
  });

  test("files outside the template are never visited", async () => {
    const { tpl, root, site } = await scaffold();
    write(root, { ".env": "SECRET=1\n", "state/run.json": "{}\n", "dist/index.html": "built\n" });
    write(site, { "authored.md": "# mine\n" });
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    const { code } = await run(root, { yes: true });
    expect(code).toBe(0);
    for (const [rel, text] of [[".env", "SECRET=1\n"], ["state/run.json", "{}\n"], ["dist/index.html", "built\n"], ["site/authored.md", "# mine\n"]]) {
      expect(readFileSync(join(root, rel), "utf8")).toBe(text);
    }
  });

  test("--dry-run prints the same list with 'would', never asks, and writes nothing — not even the line a named source would move", async () => {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    writeFileSync(join(tpl, "site", "new.html"), "<main>new</main>\n");
    const before = readFileSync(join(root, "unify.yaml"), "utf8");
    const { code, text, asked } = await run(root, { dryRun: true });
    expect(code).toBe(0);
    expect(asked).toBe(false);
    expect(text).toContain("would overwrite site/index.html");
    expect(text).toContain("would add site/new.html");
    expect(text).toContain("update: would overwrite 1, add 1");
    expect(readFileSync(join(site, "index.html"), "utf8")).toContain("v1");
    expect(existsSync(join(site, "new.html"))).toBe(false);
    expect(readFileSync(join(root, "unify.yaml"), "utf8")).toBe(before);
    const fork = tempDir();
    write(fork, { ...V1, "site/index.html": "<main>fork</main>\n" });
    expect((await run(root, { dryRun: true, template: fork })).code).toBe(0);
    expect(recordOf(root)).toBe(tpl);
  });

  test("a positional moves the project to another source, and the line follows — even when nothing differs", async () => {
    const { tpl, root, site } = await scaffold();
    const fork = tempDir();
    write(fork, { ...V1, "site/index.html": "<main>fork</main>\n" });
    const { code, text } = await run(root, { template: fork, yes: true });
    expect(code).toBe(0);
    expect(text).toContain("overwrite site/index.html");
    expect(readFileSync(join(site, "index.html"), "utf8")).toBe("<main>fork</main>\n");
    expect(recordOf(root)).toBe(fork);
    expect((await run(root, { template: tpl, dryRun: true })).text).toContain("would overwrite site/index.html");
    const twin = tempDir();
    write(twin, { ...V1, "site/index.html": "<main>fork</main>\n" });
    expect((await run(root, { template: twin })).text).toContain("nothing to do");
    expect(recordOf(root)).toBe(twin);
  });
});

describe("update() — keep: the files it never overwrites (§19.10)", () => {
  /** The template moves config.json on, and the site has edited its own copy. */
  async function diverged() {
    const { tpl, root, site } = await scaffold();
    writeFileSync(join(site, "config.json"), '{"lab": "Mine"}\n');
    writeFileSync(join(tpl, "site", "config.json"), '{"lab": "NEW SEED"}\n');
    return { tpl, root, site };
  }
  /** The record, respelled as the block with a keep: list under it. */
  const keepLine = (root) => {
    const path = join(root, "unify.yaml");
    writeFileSync(path, readFileSync(path, "utf8").replace(/^template: (.+)$/m, "template:\n  source: $1\n  keep:\n    - site/config.json"));
  };

  test("a template that ships unify.yaml with a keep: list under template: gets its source written into that block, and update keeps the listed file", async () => {
    const tpl = tempDir();
    write(tpl, { ...V1, "unify.yaml": "template:\n  keep:\n    - site/config.json\n" });
    const root = tempDir();
    expect(await init({ projectRoot: root, sourceRoot: root, sourceDefaulted: true, template: tpl, reporter: collecting().reporter })).toBe(0);
    expect(readFileSync(join(root, "unify.yaml"), "utf8")).toContain(`template:\n  source: ${tpl}\n  keep:\n    - site/config.json\n`);
    writeFileSync(join(root, "site", "config.json"), '{"lab": "Mine"}\n');
    writeFileSync(join(tpl, "site", "config.json"), '{"lab": "NEW SEED"}\n');
    const { code, text, asked } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("keep site/config.json");
    expect(asked).toBe(false);
    expect(readFileSync(join(root, "site", "config.json"), "utf8")).toBe('{"lab": "Mine"}\n');
    // The record stays in the block, and the block keeps its list, when update writes it back.
    writeFileSync(join(tpl, "site", "index.html"), "<title>Home</title><main><h1>v2</h1></main>\n");
    expect((await run(root, { yes: true })).code).toBe(0);
    expect(readFileSync(join(root, "unify.yaml"), "utf8")).toContain(`template:\n  source: ${tpl}\n  keep:\n    - site/config.json\n`);
  });

  test("a listed file that exists is never overwritten: reported as keep, counted as kept, never asked about", async () => {
    const { root, site } = await diverged();
    keepLine(root);
    const { code, text, asked } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("keep site/config.json");
    expect(text).toContain(`update: nothing to do — ${recordOf(root)} is already applied, 1 kept`);
    expect(asked).toBe(false);
    expect(readFileSync(join(site, "config.json"), "utf8")).toBe('{"lab": "Mine"}\n');
  });

  test("--keep is the same list for one run, relative to the working directory, and replaces the file's", async () => {
    const { root, site } = await diverged();
    const { code, text, asked } = await run(root, { keep: ["site/config.json"] });
    expect(code).toBe(0);
    expect(text).toContain("keep site/config.json");
    expect(asked).toBe(false);
    expect(readFileSync(join(site, "config.json"), "utf8")).toBe('{"lab": "Mine"}\n');
    // The file's list names the file; the flag's list, naming another, is the one that counts.
    keepLine(root);
    const replaced = await run(root, { keep: ["site/_layout.html"], dryRun: true });
    expect(replaced.text).toContain("would overwrite site/config.json");
  });

  test("a listed file the site does not have is added, and a kept file never counts as a change", async () => {
    const { tpl, root, site } = await diverged();
    keepLine(root);
    writeFileSync(join(tpl, "site", "index.html"), "<title>Home</title><main><h1>v2</h1></main>\n");
    const { code, text } = await run(root, { answer: "y\n" });
    expect(code).toBe(0);
    expect(text).toContain(`update: overwrote 1, added 0, 1 kept — ${recordOf(root)}`);
    expect(readFileSync(join(site, "config.json"), "utf8")).toBe('{"lab": "Mine"}\n');
    rmSync(join(site, "config.json"));
    const added = await run(root);
    expect(added.code).toBe(0);
    expect(added.text).toContain("add site/config.json");
    expect(readFileSync(join(site, "config.json"), "utf8")).toBe('{"lab": "NEW SEED"}\n');
  });
});

describe("update() — safety and the record (§19.10)", () => {
  test("a symlink where the template writes is skipped: never followed, never replaced, reported", async () => {
    const { tpl, root, site } = await scaffold();
    const elsewhere = tempDir();
    writeFileSync(join(elsewhere, "target.html"), "outside\n");
    rmSync(join(site, "index.html"));
    symlinkSync(join(elsewhere, "target.html"), join(site, "index.html"));
    writeFileSync(join(tpl, "site", "index.html"), "<main>v2</main>\n");
    const { code, text, asked } = await run(root);
    expect(code).toBe(0);
    expect(asked).toBe(false);
    expect(text).toContain("skip site/index.html: it is a symlink");
    expect(text).toContain("1 skipped");
    expect(readFileSync(join(elsewhere, "target.html"), "utf8")).toBe("outside\n");
    expect(lstatSync(join(site, "index.html")).isSymbolicLink()).toBe(true);
  });

  test("a directory that resolves outside the project is skipped, and nothing lands there", async () => {
    const { tpl, root, site } = await scaffold();
    const elsewhere = tempDir();
    symlinkSync(elsewhere, join(site, "assets"));
    mkdirSync(join(tpl, "site", "assets"));
    writeFileSync(join(tpl, "site", "assets", "style.css"), "body{}\n");
    const { code, text } = await run(root);
    expect(code).toBe(0);
    expect(text).toContain("skip site/assets/style.css: its directory resolves outside the project");
    expect(readdirSync(elsewhere)).toEqual([]);
  });

  test("no template: line → usage error naming the line to add, with the exact line when a 0.11.2 record file is present", async () => {
    const { tpl, root } = await scaffold();
    const yaml = readFileSync(join(root, "unify.yaml"), "utf8").split("\n").filter((l) => !/^template:/.test(l)).join("\n");
    writeFileSync(join(root, "unify.yaml"), yaml);
    const missing = await run(root).catch((e) => e);
    expect(missing).toBeInstanceOf(UsageError);
    expect(missing.message).toContain("no template recorded");
    expect(missing.fixes.join("\n")).toContain("template: <source>");
    writeFileSync(join(root, "unify.template.json"), JSON.stringify({ schemaVersion: 1, source: tpl, revision: "abc", files: {} }));
    const legacy = await run(root).catch((e) => e);
    expect(legacy.fixes[0]).toContain(`template: ${tpl}`);
    rmSync(join(root, "unify.template.json"));
    // Adding the line by hand — or naming the source once — is the whole recovery.
    writeFileSync(join(root, "unify.yaml"), `${yaml}\ntemplate: ${tpl}\n`);
    expect((await run(root)).text).toContain("nothing to do");
    writeFileSync(join(root, "unify.yaml"), yaml);
    expect((await run(root, { template: tpl })).code).toBe(0);
    expect(recordOf(root)).toBe(tpl);
  });

  test("a source that cannot be fetched changes nothing", async () => {
    const { root, site } = await scaffold();
    const before = readFileSync(join(root, "unify.yaml"), "utf8");
    await expect(run(root, { template: `file://${tempDir()}/no-such-repo.git` })).rejects.toThrow(/git clone failed/);
    expect(readFileSync(join(root, "unify.yaml"), "utf8")).toBe(before);
    expect(readFileSync(join(site, "index.html"), "utf8")).toContain("v1");
  });
});
