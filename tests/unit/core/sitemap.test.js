/**
 * Unit tests for src/core/sitemap.js — conformance-spec §21 (Tier 3; no
 * conformance authority, testing-strategy §2).
 *
 * §21's CLI-observable behavior is pinned by tests/conformance/sitemap.test.js
 * against the real binary. This file exists for the one branch that cannot
 * reach the CLI inside the suite's hard timeout: §21.4's protocol split needs
 * **50,001 pages**, and composing that many through a real build takes minutes.
 * `splitEntries`/`serializeIndex` are pure, so the boundary is exercised here
 * on synthetic entries in milliseconds — real verification of the split rule,
 * declared honestly as the tier it is rather than dressed up as a behavior
 * test. The gap it leaves is narrow and named: nothing here proves the build
 * *wires* a split correctly, only that the split itself is right.
 *
 * Every expectation is written from §21.4's text.
 */
import { describe, expect, test } from "bun:test";
import {
  MAX_BYTES_PER_FILE,
  MAX_URLS_PER_FILE,
  entriesFor,
  serializeIndex,
  serializeUrlset,
  splitEntries,
} from "../../../src/core/sitemap.js";
import { parseBaseUrl } from "../../../src/core/urls.js";

/** N synthetic entries, distinct so a mis-split is visible in the boundary values. */
const synth = (n, pad = "") =>
  Array.from({ length: n }, (_, i) => ({ loc: `https://example.com/p${i}${pad}.html`, lastmod: null }));

/** The record shape §21 consumes, with §20's defaults for everything unstated. */
const rec = (over = {}) => ({
  sourcePath: "p.html",
  outputPath: "p.html",
  path: "/p.html",
  url: "https://example.com/p.html",
  canonical: null,
  robots: { raw: null, directives: [], indexable: true, followable: true },
  dateModified: null,
  ...over,
});

describe("§21.4 protocol limits", () => {
  test("the caps are the Sitemaps protocol's own", () => {
    expect(MAX_URLS_PER_FILE).toBe(50_000);
    expect(MAX_BYTES_PER_FILE).toBe(50 * 1024 * 1024);
  });

  test("exactly the cap stays one part; one more splits into two", () => {
    expect(splitEntries(synth(MAX_URLS_PER_FILE))).toHaveLength(1);
    const parts = splitEntries(synth(MAX_URLS_PER_FILE + 1));
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(MAX_URLS_PER_FILE);
    expect(parts[1]).toHaveLength(1);
  });

  test("parts are filled in input order, so split points are a function of the input alone", () => {
    const parts = splitEntries(synth(MAX_URLS_PER_FILE + 2));
    expect(parts[0][0].loc).toBe("https://example.com/p0.html");
    expect(parts[0].at(-1).loc).toBe(`https://example.com/p${MAX_URLS_PER_FILE - 1}.html`);
    expect(parts[1][0].loc).toBe(`https://example.com/p${MAX_URLS_PER_FILE}.html`);
    expect(splitEntries(synth(MAX_URLS_PER_FILE + 2))).toEqual(parts);
  });

  test("an empty entry set is one empty part, not zero parts", () => {
    expect(splitEntries([])).toEqual([[]]);
  });

  test("every part serializes under both caps", () => {
    for (const part of splitEntries(synth(MAX_URLS_PER_FILE * 2 + 3))) {
      expect(part.length).toBeLessThanOrEqual(MAX_URLS_PER_FILE);
      expect(Buffer.byteLength(serializeUrlset(part), "utf8")).toBeLessThanOrEqual(MAX_BYTES_PER_FILE);
    }
  });

  test("the byte cap splits before the URL cap when entries are long enough", () => {
    // ~1.1 KiB per <loc> puts 50 MiB well below 50,000 URLs, so the byte cap
    // has to be the binding one. Deliberately a different failure mode from
    // the count cap: an implementation that only counted would return 1 part.
    const long = Array.from({ length: 60_000 }, (_, i) => ({
      loc: `https://example.com/${"x".repeat(1100)}-${i}.html`,
      lastmod: null,
    }));
    const parts = splitEntries(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].length).toBeLessThan(MAX_URLS_PER_FILE);
    for (const part of parts) {
      expect(Buffer.byteLength(serializeUrlset(part), "utf8")).toBeLessThanOrEqual(MAX_BYTES_PER_FILE);
    }
    expect(parts.flat()).toHaveLength(long.length); // nothing dropped at a boundary
  });

  test("the index names parts in order and carries no lastmod", () => {
    const xml = serializeIndex([
      "https://example.com/sitemap-1.xml",
      "https://example.com/sitemap-2.xml",
    ]);
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "<sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>\n" +
        "<sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>\n" +
        "</sitemapindex>\n",
    );
  });
});

describe("§21.2 membership predicates", () => {
  const base = parseBaseUrl("https://example.com/");

  test("a page with no canonical and no robots meta is included", () => {
    expect(entriesFor([rec()], base)).toEqual([{ loc: "https://example.com/p.html", lastmod: null }]);
  });

  test("noindex and none exclude; nofollow does not", () => {
    const robots = (directives) => ({
      raw: directives.join(","),
      directives,
      indexable: !directives.includes("noindex") && !directives.includes("none"),
      followable: !directives.includes("nofollow") && !directives.includes("none"),
    });
    expect(entriesFor([rec({ robots: robots(["noindex"]) })], base)).toEqual([]);
    expect(entriesFor([rec({ robots: robots(["none"]) })], base)).toEqual([]);
    expect(entriesFor([rec({ robots: robots(["nofollow"]) })], base)).toHaveLength(1);
  });

  test("404.html is excluded by output path, not by title or content", () => {
    expect(entriesFor([rec({ outputPath: "404.html", url: "https://example.com/404.html" })], base)).toEqual([]);
    // A page merely *named* like one elsewhere in the tree is not the error document.
    expect(entriesFor([rec({ outputPath: "docs/404.html", url: "https://example.com/docs/404.html" })], base))
      .toHaveLength(1);
  });

  test("a canonical resolving to another page consolidates this one away", () => {
    expect(entriesFor([rec({ canonical: "https://example.com/other.html" })], base)).toEqual([]);
  });

  test("a canonical on another origin is not this page", () => {
    expect(entriesFor([rec({ canonical: "https://elsewhere.example/p.html" })], base)).toEqual([]);
  });

  test("a self-canonical written in any equivalent spelling is still self", () => {
    for (const canonical of ["https://example.com/p.html", "/p.html", "p.html"]) {
      expect(entriesFor([rec({ canonical })], base)).toHaveLength(1);
    }
  });

  test("lastmod is emitted only from a well-formed authored date", () => {
    expect(entriesFor([rec({ dateModified: { raw: "2026-01-02", iso: "2026-01-02" } })], base)[0].lastmod)
      .toBe("2026-01-02");
    expect(entriesFor([rec({ dateModified: { raw: "soon", iso: null } })], base)[0].lastmod).toBeNull();
    expect(entriesFor([rec({ dateModified: null })], base)[0].lastmod).toBeNull();
  });
});
