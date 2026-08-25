/**
 * Unit tests for src/core/catalog.js — conformance-spec §30 (Tier 3; no
 * conformance authority, testing-strategy §2).
 *
 * §30's CLI-observable behavior is pinned by tests/conformance/catalog.test.js
 * against the real binary, following the tests/unit/core/sitemap.test.js
 * precedent: this file exists to exercise the module's pure functions
 * directly with a minimal synthetic BuildDocument, declared honestly as the
 * tier it is rather than dressed up as a behavior test.
 *
 * Every expectation is written from §30.2/§30.4/§30.6/§30.7's text.
 */
import { describe, expect, test } from "bun:test";
import {
  CATALOG_PATH,
  SCHEMA_VERSION,
  catalogDocument,
  catalogEntry,
  generateCatalog,
  serializeCatalog,
} from "../../../src/core/catalog.js";
import { parseBaseUrl } from "../../../src/core/urls.js";

/**
 * The BuildDocument shape §30 consumes, with §20's defaults for everything
 * unstated — same `doc()` pattern as tests/unit/core/sitemap.test.js and the
 * retired search-index.test.js.
 */
const doc = (over = {}) => {
  const {
    sourcePath = "p.html",
    outputPath = "p.html",
    path = "/p.html",
    url = "https://example.com/p.html",
    htmlAttributes = {},
    title = "P",
    meta = [],
    link = [],
    base = [],
    bodyAttributes = {},
    headings = [],
    text = "",
    canonical = null,
    robots = null,
  } = over;
  const metaAll = [...meta];
  if (robots !== null) metaAll.push({ name: "robots", content: robots });
  const linkAll = [...link];
  if (canonical !== null) linkAll.push({ rel: "canonical", href: canonical });
  return {
    source: { path: sourcePath, generated: false, layout: null },
    outputPath,
    document: {
      path,
      url,
      html: { attributes: htmlAttributes },
      head: { title, meta: metaAll, link: linkAll, base },
      body: { attributes: bodyAttributes, headings },
    },
    analysis: {
      visibleText: text,
      ids: [],
      titleTexts: title !== null ? [title] : [],
      langTexts: [],
      jsonLd: [],
      strayMetadata: [],
      linksOut: [],
      linksIn: [],
      fragmentLinks: [],
      refresh: null,
    },
  };
};

// ------------------------------------------------------------------- §30.2

describe("§30.2 catalogEntry — the DocumentSnapshot, verbatim", () => {
  test("the five keys, in the fixed order, and no others", () => {
    const entry = catalogEntry(doc());
    expect(Object.keys(entry)).toEqual(["path", "url", "html", "head", "body"]);
  });

  test("path and url are doc.document's own fields, unchanged", () => {
    const entry = catalogEntry(doc({ path: "/about.html", url: "https://example.com/about.html" }));
    expect(entry.path).toBe("/about.html");
    expect(entry.url).toBe("https://example.com/about.html");
  });

  test("url is null with no --base-url, rather than refusing the page", () => {
    expect(catalogEntry(doc({ url: null, path: "/p.html" })).url).toBeNull();
  });

  test("html/head/body are doc.document's own objects, read verbatim — no re-derivation", () => {
    const d = doc({
      htmlAttributes: { lang: "en", "data-theme": "dark" },
      meta: [
        { name: "tags", content: "unify" },
        { name: "tags", content: "htmx" },
        { property: "article:published_time", content: "2026-08-25T09:00:00-05:00" },
      ],
      bodyAttributes: { class: "post" },
      headings: [{ level: 1, id: "top", text: "Top" }],
    });
    const entry = catalogEntry(d);
    expect(entry.html).toEqual(d.document.html);
    expect(entry.head).toEqual(d.document.head);
    expect(entry.body).toEqual(d.document.body);
    expect(entry.html).toBe(d.document.html); // the SAME object, not a copy
  });

  test("no body text: analysis.visibleText never appears anywhere on the entry", () => {
    const entry = catalogEntry(doc({ text: "This body text must never reach the catalog." }));
    expect(JSON.stringify(entry)).not.toContain("must never reach the catalog");
  });

  test("no JSON-LD: analysis is never read at all", () => {
    const d = doc();
    d.analysis.jsonLd = [{ "@type": "Article", body: "a whole article, privately carried" }];
    const entry = catalogEntry(d);
    expect(JSON.stringify(entry)).not.toContain("whole article");
  });

  test("repeated metadata (same name, different content) survives in order, all entries", () => {
    const entry = catalogEntry(doc({
      meta: [{ name: "tags", content: "a" }, { name: "tags", content: "b" }, { name: "tags", content: "c" }],
    }));
    expect(entry.head.meta.filter((m) => m.name === "tags")).toEqual([
      { name: "tags", content: "a" },
      { name: "tags", content: "b" },
      { name: "tags", content: "c" },
    ]);
  });

  test("name vs property distinction survives untouched", () => {
    const entry = catalogEntry(doc({ meta: [{ property: "og:title", content: "X" }] }));
    expect(entry.head.meta).toEqual([{ property: "og:title", content: "X" }]);
    expect("name" in entry.head.meta[0]).toBe(false);
  });

  test("headings are the flat main-scoped sequence, unmodified", () => {
    const headings = [{ level: 1, text: "About", id: "about" }, { level: 2, text: "Team", id: null }];
    expect(catalogEntry(doc({ headings })).body.headings).toEqual(headings);
  });
});

// ------------------------------------------------------------------- §30.2/§30.4

describe("§30.2/§30.4 catalogDocument", () => {
  const base = parseBaseUrl("https://example.com/");

  test("top-level shape is exactly schemaVersion, baseUrl, pages, in that order", () => {
    const d = catalogDocument([], base, "https://example.com/");
    expect(Object.keys(d)).toEqual(["schemaVersion", "baseUrl", "pages"]);
  });

  test("schemaVersion is always 1", () => {
    expect(catalogDocument([], base, null).schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(1);
  });

  test("baseUrl is the raw string exactly as given, not reconstructed from BaseUrlConfig", () => {
    // A trailing-slash-free author string that parseBaseUrl would normalize
    // differently if this module reconstructed it instead of keeping the raw
    // string verbatim.
    const raw = "https://example.com";
    const d = catalogDocument([], parseBaseUrl(raw), raw);
    expect(d.baseUrl).toBe("https://example.com");
  });

  test("baseUrl is null when the argument is omitted or explicitly null", () => {
    expect(catalogDocument([], null, null).baseUrl).toBeNull();
    expect(catalogDocument([], base).baseUrl).toBeNull();
  });

  test("membership is §21.2's shared predicate: noindex, none, 404.html, and off-page canonical excluded", () => {
    expect(catalogDocument([doc({ robots: "noindex" })], base, null).pages).toEqual([]);
    expect(catalogDocument([doc({ robots: "none" })], base, null).pages).toEqual([]);
    expect(catalogDocument([doc({ robots: "nofollow" })], base, null).pages).toHaveLength(1);
    expect(catalogDocument([doc({ outputPath: "404.html", url: "https://example.com/404.html" })], base, null).pages)
      .toEqual([]);
    expect(catalogDocument([doc({ canonical: "https://example.com/other.html" })], base, null).pages).toEqual([]);
    expect(catalogDocument([doc({ canonical: "https://example.com/p.html" })], base, null).pages).toHaveLength(1);
  });

  test("manifest order is preserved — filtering never reorders", () => {
    const documents = [
      doc({ outputPath: "a.html", url: "https://example.com/a.html", path: "/a.html" }),
      doc({ outputPath: "b.html", url: "https://example.com/b.html", path: "/b.html", robots: "noindex" }),
      doc({ outputPath: "c.html", url: "https://example.com/c.html", path: "/c.html" }),
    ];
    expect(catalogDocument(documents, base, null).pages.map((p) => p.path)).toEqual(["/a.html", "/c.html"]);
  });

  test("an empty manifest is a well-formed empty document, not a refusal", () => {
    expect(catalogDocument([], base, null)).toEqual({ schemaVersion: 1, baseUrl: null, pages: [] });
  });
});

// ------------------------------------------------------------------------- §30.7

describe("§30.7 serializeCatalog — exact bytes", () => {
  test("two-space JSON, trailing newline", () => {
    const document = {
      schemaVersion: 1,
      baseUrl: "https://example.com/",
      pages: [{ path: "/p.html", url: "https://example.com/p.html", html: { attributes: {} }, head: { title: null, meta: [], link: [], base: [] }, body: { attributes: {}, headings: [] } }],
    };
    expect(serializeCatalog(document)).toBe(`${JSON.stringify(document, null, 2)}\n`);
  });

  test("an empty page list serializes to a well-formed empty array", () => {
    expect(serializeCatalog({ schemaVersion: 1, baseUrl: null, pages: [] })).toBe(
      '{\n  "schemaVersion": 1,\n  "baseUrl": null,\n  "pages": []\n}\n',
    );
  });

  test("two calls over equal input produce byte-identical output", () => {
    const document = { schemaVersion: 1, baseUrl: null, pages: [] };
    expect(serializeCatalog(document)).toBe(serializeCatalog(JSON.parse(JSON.stringify(document))));
  });

  test("the file ends in exactly one trailing newline", () => {
    const out = serializeCatalog({ schemaVersion: 1, baseUrl: null, pages: [] });
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});

// ------------------------------------------------------------------------- §30.1/§30.6

describe("§30.1/§30.6 generateCatalog — activation is the caller's, suppression is this module's", () => {
  const base = parseBaseUrl("https://example.com/");

  test("CATALOG_PATH is the fixed assets/unify/ location", () => {
    expect(CATALOG_PATH).toBe("assets/unify/catalog.json");
  });

  test("with no authored file, generation produces one entry at CATALOG_PATH", () => {
    const generated = generateCatalog({ documents: [doc()], base, baseUrl: null, emittedFromSource: new Map() });
    expect([...generated.keys()]).toEqual([CATALOG_PATH]);
    expect(generated.get(CATALOG_PATH)).toBe(serializeCatalog(catalogDocument([doc()], base, null)));
  });

  test("an authored assets/unify/catalog.json suppresses generation entirely", () => {
    const generated = generateCatalog({
      documents: [doc()],
      base,
      baseUrl: null,
      emittedFromSource: new Map([[CATALOG_PATH, CATALOG_PATH]]),
    });
    expect(generated.size).toBe(0);
  });

  test("an unrelated occupied path does not suppress generation", () => {
    const generated = generateCatalog({
      documents: [doc()],
      base,
      baseUrl: null,
      emittedFromSource: new Map([["sitemap.xml", "sitemap.xml"]]),
    });
    expect(generated.size).toBe(1);
  });

  test("works with no --base-url at all", () => {
    const generated = generateCatalog({
      documents: [doc({ url: null, path: "/p.html" })],
      base: null,
      baseUrl: null,
      emittedFromSource: new Map(),
    });
    const parsed = JSON.parse(generated.get(CATALOG_PATH));
    expect(parsed.pages[0].url).toBeNull();
    expect(parsed.pages[0].path).toBe("/p.html");
    expect(parsed.baseUrl).toBeNull();
  });

  test("an empty manifest still generates a well-formed, empty catalog", () => {
    const generated = generateCatalog({ documents: [], base, baseUrl: null, emittedFromSource: new Map() });
    expect(generated.get(CATALOG_PATH)).toBe('{\n  "schemaVersion": 1,\n  "baseUrl": null,\n  "pages": []\n}\n');
  });
});
