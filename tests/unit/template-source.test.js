/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2).
 * Unit tests for src/cli/template-source.js: the four template-source forms
 * (§19.9) told apart by shape, with no network and no filesystem probe except
 * the one the directory form requires; and the npm path's unpacking, run
 * against a real `npm pack` of a local folder (the one spec npm resolves
 * without a registry), so the tarball reader meets a tarball npm actually
 * wrote. git is proved end to end against the real CLI in
 * tests/conformance/scaffold.test.js.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyTemplateSource, fetchTemplate, recordSource } from "../../src/cli/template-source.js";
import { UsageError } from "../../src/core/diagnostics.js";

const BUILT_INS = ["default", "basic", "blog"];
const dirs = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "unify-template-source-test-"));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("classifyTemplateSource()", () => {
  test("recordSource spells the line init writes: the source as typed, a directory relative to unify.yaml's directory (§19.10)", () => {
    const url = "https://github.com/o/r/tree/main/templates/blog";
    expect(recordSource(classifyTemplateSource(url, BUILT_INS), url, "/p")).toBe(url);
    expect(recordSource({ kind: "npm", spec: "@acme/unify-shop-template@1.4.0" }, "@acme/unify-shop-template@1.4.0", "/p")).toBe("@acme/unify-shop-template@1.4.0");
    expect(recordSource({ kind: "builtin", name: "blog" }, "blog", "/p")).toBe("blog");
    expect(recordSource({ kind: "dir", path: "/projects/templates/shop" }, "../templates/shop", "/projects/site")).toBe("../templates/shop");
    expect(recordSource({ kind: "dir", path: "/projects/templates/shop" }, "../../templates/shop", "/projects/site")).toBe("../templates/shop");
    expect(recordSource({ kind: "dir", path: "/projects/templates/shop" }, "/projects/templates/shop", "/projects/site")).toBe("/projects/templates/shop");
    // A version suffix is npm's alone: a built-in has no versions but unify's own, so
    // `blog@0.11.2` is the npm package `blog` at that version, never the built-in.
    expect(classifyTemplateSource("blog@0.11.2", BUILT_INS, tempDir())).toEqual({ kind: "npm", spec: "blog@0.11.2" });
  });

  test("an exact built-in name is the registry's, even beside a directory of that name", () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, "blog"));
    expect(classifyTemplateSource("blog", BUILT_INS, cwd)).toEqual({ kind: "builtin", name: "blog" });
    expect(classifyTemplateSource("./blog", BUILT_INS, cwd)).toEqual({ kind: "dir", path: join(cwd, "blog") });
  });

  test("an npm package is any name as published, scoped or not, optionally @version or @tag — the unify-<name>-template convention is not required", () => {
    const cwd = tempDir();
    for (const spec of ["unify-shop-template", "@fwdslsh/unify-shop-template", "@fwdslsh/unify-shop-template@1.2.0", "unify-shop-template@next", "shop-template", "some-theme", "@acme/site", "a.b_c@1.x", "site@^2.0.0"]) {
      expect(classifyTemplateSource(spec, BUILT_INS, cwd)).toEqual({ kind: "npm", spec });
    }
    // A directory that exists wins over a package of the same name.
    mkdirSync(join(cwd, "some-theme"));
    expect(classifyTemplateSource("some-theme", BUILT_INS, cwd)).toEqual({ kind: "dir", path: join(cwd, "some-theme") });
    // Not a package name either: a usage error, never a lookup (checked below).
    for (const notIt of ["Unify-Shop-Template", "has space", "../nope", "nope/sub", "site@1.0.0;rm", "@org/"]) {
      expect(() => classifyTemplateSource(notIt, BUILT_INS, cwd)).toThrow(UsageError);
    }
  });

  test("a git repository is a URL with a scheme, a git@host: address, or a .git segment, with an optional subdirectory and #ref", () => {
    const git = (url, subdir = null, ref = null) => ({ kind: "git", url, ref, subdir });
    expect(classifyTemplateSource("https://github.com/o/r", BUILT_INS)).toEqual(git("https://github.com/o/r"));
    expect(classifyTemplateSource("https://github.com/o/r.git#v2", BUILT_INS)).toEqual(git("https://github.com/o/r.git", null, "v2"));
    expect(classifyTemplateSource("git@github.com:o/r.git", BUILT_INS)).toEqual(git("git@github.com:o/r.git"));
    expect(classifyTemplateSource("ssh://git@host/o/r", BUILT_INS)).toEqual(git("ssh://git@host/o/r"));
    expect(classifyTemplateSource("../shared/template.git", BUILT_INS)).toEqual(git("../shared/template.git"));
    expect(classifyTemplateSource("file:///srv/t.git#main", BUILT_INS)).toEqual(git("file:///srv/t.git", null, "main"));
    // A subdirectory follows the repository: after host/owner/repo on a forge …
    expect(classifyTemplateSource("https://github.com/fwdslsh/unify/templates/basic", BUILT_INS)).toEqual(git("https://github.com/fwdslsh/unify", "templates/basic"));
    expect(classifyTemplateSource("git@github.com:o/r/templates/docs#dev", BUILT_INS)).toEqual(git("git@github.com:o/r", "templates/docs", "dev"));
    // … after the .git segment where there is one (nested GitLab groups, file:// paths) …
    expect(classifyTemplateSource("https://gitlab.com/g/sub/repo.git/templates/x#v1", BUILT_INS)).toEqual(git("https://gitlab.com/g/sub/repo.git", "templates/x", "v1"));
    expect(classifyTemplateSource("file:///tmp/a/origin.git/templates/blog", BUILT_INS)).toEqual(git("file:///tmp/a/origin.git", "templates/blog"));
    expect(classifyTemplateSource("file:///tmp/a/b/c/origin", BUILT_INS)).toEqual(git("file:///tmp/a/b/c/origin"));
    // … and the browser's URL for a directory supplies the ref too.
    expect(classifyTemplateSource("https://github.com/fwdslsh/unify/tree/main/templates/blog", BUILT_INS)).toEqual(git("https://github.com/fwdslsh/unify", "templates/blog", "main"));
    expect(() => classifyTemplateSource("https://github.com/o/r#", BUILT_INS)).toThrow(UsageError);
    expect(() => classifyTemplateSource("https://github.com/o/r/tree/main/x#dev", BUILT_INS)).toThrow(/two refs/);
    expect(() => classifyTemplateSource("https://github.com/o/r/../x", BUILT_INS)).toThrow(/cannot contain/);
  });

  test("anything else is a directory that must exist, resolved against the working directory", () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, "my-template"));
    expect(classifyTemplateSource("my-template", BUILT_INS, cwd)).toEqual({ kind: "dir", path: join(cwd, "my-template") });
    expect(classifyTemplateSource(join(cwd, "my-template"), BUILT_INS, tempDir())).toEqual({ kind: "dir", path: join(cwd, "my-template") });
  });

  test("an argument that is no form at all is a usage error naming the four forms — never a lookup", () => {
    const cwd = tempDir();
    try {
      classifyTemplateSource("not a template", BUILT_INS, cwd);
      throw new Error("expected a UsageError");
    } catch (e) {
      expect(e).toBeInstanceOf(UsageError);
      expect(e.message).toBe("not a template: not a template");
      const fixes = e.fixes.join("\n");
      expect(fixes).toContain("default, basic, blog");
      expect(fixes).toContain(join(cwd, "not a template"));
      expect(fixes).toContain("npm package");
      expect(fixes).toContain("--audit");
      expect(fixes).toContain("URL");
    }
  });
});

describe("fetchTemplate() — the npm path", () => {
  test("npm pack's tarball is unpacked whole: its package/ prefix dropped, its own package.json left behind, long paths read from pax headers", async () => {
    // A folder is the one spec `npm pack` resolves with no registry, so this
    // runs the real tool and reads a real npm tarball, offline.
    const pkg = tempDir();
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "unify-probe-template", version: "0.0.1" }));
    mkdirSync(join(pkg, "site", "_includes"), { recursive: true });
    writeFileSync(join(pkg, "site", "index.html"), "<!doctype html>\n<title>P</title>\n");
    writeFileSync(join(pkg, "site", "_includes", "nav.html"), "<nav></nav>\n");
    writeFileSync(join(pkg, "AGENTS.md"), "# agents\n");
    // Over 100 bytes, so the ustar name field cannot hold it and npm writes a pax header.
    const long = `${"deeply-".repeat(12)}nested`;
    mkdirSync(join(pkg, "site", long), { recursive: true });
    writeFileSync(join(pkg, "site", long, "página.md"), "---\ntitle: ñ\n---\n# ñ\n");
    const { files, rootFiles, sourceDir } = await fetchTemplate({ kind: "npm", spec: pkg }, pkg);
    expect(sourceDir).toBe("site");
    expect(Object.keys(files).sort()).toEqual(["_includes/nav.html", `${long}/página.md`, "index.html"].sort());
    expect(Buffer.from(files["index.html"]).toString()).toBe("<!doctype html>\n<title>P</title>\n");
    expect(Buffer.from(files[`${long}/página.md`]).toString()).toBe("---\ntitle: ñ\n---\n# ñ\n");
    expect(Object.keys(rootFiles)).toEqual(["AGENTS.md"]);
  }, 60_000);
});
