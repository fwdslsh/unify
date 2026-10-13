/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2).
 * `docs/guides/template-versions.md` opens by claiming that every source
 * literal in it is classified by unify's own classifier. As in
 * tests/conformance/recipes.test.js the literals are READ FROM THE DOCUMENT
 * (its §1 table and its code blocks), not retyped here, so editing the guide
 * edits the test, and a source the guide gets wrong fails with its own text
 * in the message.
 *
 * What is checked is what can be checked with no network: that each source
 * in the §1 table is the form the row says (built-in, npm, git, directory),
 * that `extends:` caches it (src/cli/template-source.js `isPinned`, §34.3)
 * exactly when the row says so, that every `unify init`/`unify update`
 * argument and every `extends:`/`source:` value in the guide's code blocks is
 * a source at all, and the rules the prose states about refs and the cache
 * directory. The fetches themselves (an npm pack, a clone) are proved with
 * the real CLI against a local git repository in
 * tests/conformance/template-versions.test.js.
 *
 * The classifier is the real one and the built-in registry is the real one
 * (src/templates/index.js): nothing is mocked.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cacheRoot, classifyTemplateSource, isPinned } from "../../src/cli/template-source.js";
import { TEMPLATES } from "../../src/templates/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOC = readFileSync(join(ROOT, "docs", "guides", "template-versions.md"), "utf8");
const BUILT_INS = Object.keys(TEMPLATES);

const dirs = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "unify-template-versions-test-"));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** The body of the `## ` section whose heading starts with `prefix`. */
function section(prefix) {
  const start = DOC.indexOf(`\n## ${prefix}`);
  if (start < 0) throw new Error(`template-versions.md has no section "## ${prefix}…"`);
  const end = DOC.indexOf("\n## ", start + 1);
  return DOC.slice(start, end < 0 ? DOC.length : end);
}

/** Every fenced block of a language in the whole guide, verbatim. */
function blocks(lang) {
  return [...DOC.matchAll(new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g"))].map((m) => m[1]);
}

/** §1's table: `| \`source\` | form | same bytes? | cached? |`, one object per row. */
function tableRows() {
  const rows = section("1. ")
    .split("\n")
    .filter((line) => /^\| `/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      return { source: cells[0].replace(/^`|`$/g, ""), form: cells[1], same: cells[2], cached: cells[3] };
    });
  return rows;
}

const KIND_OF_FORM = { "built-in": "builtin", npm: "npm", git: "git", directory: "dir" };

describe("template-versions.md §1 — the table of sources", () => {
  // The directory row names a sibling of the working directory; make it exist
  // the way a reader's would, then resolve everything from the project beside it.
  const parent = tempDir();
  mkdirSync(join(parent, "our-template"));
  mkdirSync(join(parent, "project"));
  const cwd = join(parent, "project");

  test("the extractor found the table: every form is there, and each row has four cells", () => {
    const rows = tableRows();
    expect(rows.length).toBeGreaterThanOrEqual(9);
    expect(new Set(rows.map((r) => r.form))).toEqual(new Set(Object.keys(KIND_OF_FORM)));
    for (const r of rows) {
      expect(r.source, "a table row with no source").not.toBe("");
      expect(r.cached, `${r.source}: the last cell answers yes or no`).toMatch(/^(yes|no)\b/);
    }
  });

  test("each source is classified as the form its row says", () => {
    for (const r of tableRows()) {
      const source = classifyTemplateSource(r.source, BUILT_INS, cwd);
      expect(source.kind, `${r.source} is a ${r.form}`).toBe(KIND_OF_FORM[r.form]);
    }
  });

  test("`extends:` caches a source exactly when its row says so, and a cached source is one that always has the same bytes", () => {
    for (const r of tableRows()) {
      const pinned = isPinned(classifyTemplateSource(r.source, BUILT_INS, cwd));
      expect(pinned, `${r.source}: cached by extends? says "${r.cached}"`).toBe(r.cached.startsWith("yes"));
      if (pinned) expect(r.same, `${r.source} is cached, so it must be the same bytes every time`).toMatch(/^yes\b/);
    }
  });

  test("a ref of 7 to 40 hex digits is a commit and anything else is a branch or tag", () => {
    const git = (ref) => classifyTemplateSource(`https://github.com/o/r#${ref}`, BUILT_INS);
    expect(isPinned(git("3f2a9c1"))).toBe(true); // the guide's own example, 7 digits
    expect(isPinned(git("3f2a9c1".repeat(5) + "a"))).toBe(true); // 36
    expect(isPinned(git("0123456789abcdef0123456789abcdef01234567"))).toBe(true); // 40
    expect(isPinned(git("3f2a9c"))).toBe(false); // 6
    expect(isPinned(git("0123456789abcdef0123456789abcdef012345678"))).toBe(false); // 41
    expect(isPinned(git("v0.11.14"))).toBe(false); // a tag
    expect(isPinned(git("main"))).toBe(false);
    expect(DOC).toContain("A `#ref` of 7 to 40 hex digits is read as a commit");
  });
});

describe("template-versions.md — every source in a code block is a source", () => {
  const cwd = tempDir();

  /**
   * [literal, where] for every argument of `unify init|update` anywhere in the
   * guide (a code block or a backticked command in prose or a table), every
   * `extends:` and every recorded `source:`. A placeholder (`<version>`) is
   * not a literal.
   */
  function literals() {
    const found = [];
    for (const m of DOC.matchAll(/(?:npx @fwdslsh\/unify@[^\s`]+|unify) (?:init|update) (?!-)([^\s`]+)/g)) {
      if (!m[1].includes("<")) found.push([m[1], m[0]]);
    }
    for (const block of blocks("yaml")) {
      for (const line of block.split("\n")) {
        const m = line.match(/^extends: (\S+)/) ?? line.match(/^\s{2,}source: (\S+)/);
        if (m) found.push([m[1], line.trim()]);
      }
    }
    return found;
  }

  test("the extractor found the guide's commands (a positive control, so the checks below cannot pass over nothing)", () => {
    const all = literals().map(([s]) => s);
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect(all).toContain("unify-docs-template@0.4.0");
    expect(all).toContain("docs");
    expect(all).toContain("https://github.com/acme/templates/shop#v1");
    expect(all).toContain("https://github.com/acme/templates/shop#v2");
  });

  test("each classifies without a usage error, and none is a directory (the guide never names one in a command)", () => {
    for (const [literal, where] of literals()) {
      const source = classifyTemplateSource(literal, BUILT_INS, cwd);
      expect(["builtin", "npm", "git"], `${where}`).toContain(source.kind);
    }
  });

  test("a source that is also in the §1 table is the form the table says", () => {
    const table = new Map(tableRows().map((r) => [r.source, KIND_OF_FORM[r.form]]));
    let compared = 0;
    for (const [literal] of literals()) {
      if (!table.has(literal)) continue;
      compared += 1;
      expect(classifyTemplateSource(literal, BUILT_INS, cwd).kind).toBe(table.get(literal));
    }
    expect(compared).toBeGreaterThanOrEqual(3);
  });

  test("the unify the guide runs through npx is itself a package at a version or a tag", () => {
    const specs = [...DOC.matchAll(/npx (@fwdslsh\/unify@[^\s`]+)/g)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThanOrEqual(3);
    for (const spec of specs) {
      expect(classifyTemplateSource(spec, BUILT_INS, cwd), spec).toEqual({ kind: "npm", spec });
    }
    // Pinned means an exact version: `@next` and `@latest` are tags that move.
    expect(isPinned({ kind: "npm", spec: "@fwdslsh/unify@0.11.14" })).toBe(true);
    expect(isPinned({ kind: "npm", spec: "@fwdslsh/unify@0.11.15-alpha.1" })).toBe(true);
    expect(isPinned({ kind: "npm", spec: "@fwdslsh/unify@next" })).toBe(false);
  });
});

describe("template-versions.md — the rules its prose states", () => {
  test("a built-in name is a built-in at the version of the unify that ran: pinned for `extends:`, and the registry names the five", () => {
    expect([...BUILT_INS].sort()).toEqual(["basic", "blog", "default", "docs", "portfolio"]);
    expect(isPinned({ kind: "builtin", name: "docs" })).toBe(true);
    // The built-ins publish as `unify-<name>-template`, which the guide says; the package is an npm source.
    for (const name of BUILT_INS) {
      expect(classifyTemplateSource(`unify-${name}-template@0.1.0`, BUILT_INS, tempDir())).toEqual({ kind: "npm", spec: `unify-${name}-template@0.1.0` });
    }
  });

  test("the browser's /tree/<ref>/<dir> URL reads one segment as the ref, so a branch with a slash needs #", () => {
    expect(classifyTemplateSource("https://github.com/fwdslsh/unify/tree/release/0.11.15/templates/docs", BUILT_INS)).toEqual({
      kind: "git", url: "https://github.com/fwdslsh/unify", ref: "release", subdir: "0.11.15/templates/docs",
    });
    expect(classifyTemplateSource("https://github.com/fwdslsh/unify/templates/docs#release/0.11.15", BUILT_INS)).toEqual({
      kind: "git", url: "https://github.com/fwdslsh/unify", ref: "release/0.11.15", subdir: "templates/docs",
    });
    expect(DOC).toContain("is read as the ref `release` and the directory `0.11.15/templates/docs`");
  });

  test("the cache is `unify/templates/` under $XDG_CACHE_HOME when that is set, else under ~/.cache", () => {
    const saved = process.env.XDG_CACHE_HOME;
    try {
      process.env.XDG_CACHE_HOME = "/somewhere/cache";
      expect(cacheRoot()).toBe(join("/somewhere/cache", "unify", "templates"));
      delete process.env.XDG_CACHE_HOME;
      if (process.platform !== "win32") expect(cacheRoot().endsWith(join(".cache", "unify", "templates"))).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = saved;
    }
    expect(DOC).toContain("`~/.cache/unify/templates` (under `$XDG_CACHE_HOME` when that is set)");
  });
});

describe("template-versions.md is reachable", () => {
  const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");

  test("README, the templates guide, the CLI reference and the docs site's sidebar all point at it", () => {
    expect(read("README.md")).toContain("docs/guides/template-versions.md");
    expect(read("docs", "templates.md")).toContain("guides/template-versions.md");
    const reference = read("docs", "cli-reference.md");
    expect(reference).toContain("guides/template-versions.md");
    expect(read("examples", "unify-docs", "scripts", "gen.mjs")).toContain('["guides/template-versions.md", "Template versions"]');
  });

  test("it opens the way the other guides do: a description in the front matter, then a title and a Role paragraph", () => {
    expect(DOC).toMatch(/^---\ndescription: "[^"]+"\n---\n\n# [^\n]+\n\n\*\*Role\*\*: /);
  });
});
