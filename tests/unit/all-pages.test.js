/**
 * The "All pages" starter in the `docs` template (issue #91). Tier 3 —
 * scaffolding, zero conformance authority: SCF-04/SCF-08 (scaffold.test.js)
 * already hold the no-flags guarantees for every template. This file adds
 * what is specific to this page:
 *
 *  - the grouping/filtering/message logic, run as the author would ship it
 *    (the scaffolded bytes, imported under Bun — the DOM half is guarded
 *    behind `typeof document`), against the catalog a real build wrote;
 *  - the starter builds clean with `--catalog` at the domain root and under
 *    a --base-url path prefix, with the script address rewritten and the
 *    catalog's own paths carrying the prefix the script must strip.
 *
 * The repo has no browser runner; the DOM wiring is deliberately thin.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runCli } from "../conformance/support.mjs";

const made = [];
function tmp() {
  const dir = mkdtempSync(join(tmpdir(), "unify-all-pages-"));
  made.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** Scaffold the docs template into a fresh project and import its script. */
async function scaffold() {
  const root = tmp();
  const init = await runCli(["init", "docs"], root);
  expect(init.exit, init.stderr).toBe(0);
  const mod = await import(`${pathToFileURL(join(root, "site", "assets", "all-pages.js")).href}?${Math.random()}`);
  return { root, mod };
}

const page = (path, { h1, title } = {}) => ({
  path,
  head: { title: title ?? null },
  body: { headings: h1 ? [{ level: 1, id: "x", text: h1 }] : [] },
});

describe("pure functions in the scaffolded assets/all-pages.js", () => {
  test("importing it without a document has no side effects", async () => {
    const { mod } = await scaffold();
    expect(Object.keys(mod).sort()).toEqual(["addressOf", "countMessage", "entriesOf", "filterEntries", "groupEntries", "labelOf", "prefixOf", "sectionOf"]);
  });

  test("groups by first path segment, top level first, titles sorted within a group", async () => {
    const { mod } = await scaffold();
    const catalog = {
      baseUrl: null,
      pages: [
        page("/guide/zebra.html", { h1: "Zebra" }),
        page("/about.html", { h1: "About" }),
        page("/guide/alpha.html", { h1: "alpha" }),
        page("/api/index.html", { title: "API" }),
        page("/", { h1: "Home" }),
        page("/guide/", { h1: "Guide" }),
        page("/blog/post/", { h1: "Post" }),
      ],
    };
    const groups = mod.groupEntries(mod.entriesOf(catalog));
    expect(groups.map((g) => g.section)).toEqual(["", "api", "blog", "guide"]);
    expect(groups[0].entries.map((e) => e.label)).toEqual(["About", "Guide", "Home"]);
    expect(groups[3].entries.map((e) => e.label)).toEqual(["alpha", "Zebra"]);
  });

  test("a label is the first <h1>, else the <title>, else the address", async () => {
    const { mod } = await scaffold();
    expect(mod.labelOf(page("/a.html", { h1: "H", title: "T" }))).toBe("H");
    expect(mod.labelOf(page("/a.html", { title: "T" }))).toBe("T");
    expect(mod.labelOf(page("/a.html"))).toBe("/a.html");
    expect(mod.labelOf({ path: "/b.html" })).toBe("/b.html");
  });

  test("a --base-url path prefix is not a section, and is not searched as an address", async () => {
    const { mod } = await scaffold();
    const entries = mod.entriesOf({ baseUrl: "https://example.com/docs/", pages: [page("/docs/", { h1: "Home" }), page("/docs/guide/intro/", { h1: "Intro" })] });
    expect(entries.map((e) => [e.path, e.address, e.section])).toEqual([["/docs/", "/", ""], ["/docs/guide/intro/", "/guide/intro/", "guide"]]);
    expect(mod.filterEntries(entries, "docs")).toEqual([]);
    expect(mod.filterEntries(entries, "GUIDE").length).toBe(1);
  });

  test("filtering matches every word against title and address, case-insensitively; blank returns everything", async () => {
    const { mod } = await scaffold();
    const entries = mod.entriesOf({ baseUrl: null, pages: [page("/guide/install.html", { h1: "Installation" }), page("/guide/run.html", { h1: "Running" }), page("/about.html", { h1: "About" })] });
    expect(mod.filterEntries(entries, "  ").length).toBe(3);
    expect(mod.filterEntries(entries, "install").map((e) => e.label)).toEqual(["Installation"]);
    expect(mod.filterEntries(entries, "guide run").map((e) => e.label)).toEqual(["Running"]);
    expect(mod.filterEntries(entries, "nothing")).toEqual([]);
  });

  test("the live-region message covers the unfiltered, filtered, singular and empty cases", async () => {
    const { mod } = await scaffold();
    expect(mod.countMessage(5, 5, "")).toBe("5 pages.");
    expect(mod.countMessage(1, 1, "")).toBe("1 page.");
    expect(mod.countMessage(2, 5, "gu")).toBe("Showing 2 of 5 pages.");
    expect(mod.countMessage(0, 5, " zz ")).toBe('No pages match "zz".');
  });

  test("a file that is not a catalog is refused, which the page shows as its error state", async () => {
    const { mod } = await scaffold();
    expect(() => mod.entriesOf({})).toThrow();
    expect(() => mod.entriesOf(null)).toThrow();
  });
});

describe("the starter page in a built site", () => {
  for (const [name, flags, prefix] of [
    ["at the domain root", ["--base-url", "https://example.com/"], "/"],
    ["under a path prefix", ["--base-url", "https://example.com/docs/"], "/docs/"],
    ["with no --base-url", [], "/"],
  ]) {
    test(`builds clean with --catalog ${name}, and its script reads the catalog it was built beside`, async () => {
      const { root, mod } = await scaffold();
      const args = ["--catalog", "--search-corpus", "--pretty-urls", ...flags];
      const built = await runCli(["build", "--strict", ...args], root);
      expect(built.exit, built.stderr).toBe(0);
      const audited = await runCli(["audit", "--strict", ...args], root);
      expect(audited.exit, audited.stdout + audited.stderr).toBe(0);

      const html = readFileSync(join(root, "dist", "all-pages", "index.html"), "utf8");
      expect(html).toContain(`<script type="module" src="${prefix}assets/all-pages.js">`);
      // Shipped byte for byte, and the catalog sits where the module's relative URL points.
      const shipped = readFileSync(join(root, "dist", "assets", "all-pages.js"), "utf8");
      expect(shipped).toBe(readFileSync(join(root, "site", "assets", "all-pages.js"), "utf8"));
      expect(shipped).toContain('new URL("unify/catalog.json", import.meta.url)');
      const catalog = JSON.parse(readFileSync(join(root, "dist", "assets", "unify", "catalog.json"), "utf8"));

      const entries = mod.entriesOf(catalog);
      const all = entries.find((e) => e.address === "/all-pages/");
      expect(all.path).toBe(`${prefix}all-pages/`);
      expect(all.label).toBe("All pages");
      const sections = mod.groupEntries(entries).map((g) => g.section);
      expect(sections).toEqual(["", "guide"]);
      expect(sections).not.toContain("docs");
    });
  }

  test("with no flags the saved catalog: true fills the page; without it the preload reference stops the build", async () => {
    const { root } = await scaffold();
    const built = await runCli(["build", "--strict"], root);
    expect(built.exit, built.stderr).toBe(0);
    expect(existsSync(join(root, "dist", "assets", "unify", "catalog.json"))).toBe(true);
    const html = readFileSync(join(root, "dist", "all-pages.html"), "utf8");
    expect(html).toContain("<noscript>");
    expect(html).toContain('id="all-pages-error"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('<label for="all-pages-query">');
    expect(html).toContain('rel="preload" href="/assets/unify/catalog.json" as="fetch"');

    rmSync(join(root, "unify.yaml"));
    const bare = await runCli(["build", "--dry-run"], root);
    expect(bare.exit).toBe(1);
    expect(bare.stderr).toContain("catalog.json");
  });
});
