/**
 * Unit tests for src/core/search-index.js — conformance-spec §30 (Tier 3; no
 * conformance authority, testing-strategy §2).
 *
 * §30's CLI-observable behavior belongs in a real-CLI conformance test once
 * `unify build --search-index` is wired into src/cli/commands/build.js (out
 * of this module's ownership — see the module's own header comment). Until
 * that wiring lands there is no way to reach this module through the real
 * binary, so this file is the only verification available, exactly the
 * tests/unit/core/sitemap.test.js precedent: unit-tested here, declared
 * honestly as the tier it is rather than dressed up as a behavior test.
 *
 * Every expectation is written from §30's text, mirroring
 * tests/unit/core/sitemap.test.js's `doc()` pattern — a minimal BuildDocument
 * shape with §20's defaults for everything §30 does not read.
 */
import { describe, expect, test } from "bun:test";
import {
  SCHEMA_VERSION,
  SEARCH_INDEX_PATH,
  foldSpaceSeparators,
  generateSearchIndex,
  searchIndexDocument,
  searchIndexEntry,
  serializeSearchIndex,
} from "../../../src/core/search-index.js";
import { parseBaseUrl } from "../../../src/core/urls.js";

/**
 * The BuildDocument shape §30 consumes, with §20's defaults for everything
 * unstated. `description` and `robots` are the meta CONTENT string a page
 * would declare (or null for "declared nothing"); `canonical` is the
 * `rel=canonical` href.
 */
const doc = (over = {}) => {
  const {
    sourcePath = "p.html",
    outputPath = "p.html",
    path = "/p.html",
    url = "https://example.com/p.html",
    title = "P",
    description = null,
    headings = [],
    text = "",
    canonical = null,
    robots = null,
  } = over;
  const meta = [];
  if (description !== null) meta.push({ name: "description", content: description });
  if (robots !== null) meta.push({ name: "robots", content: robots });
  const link = [];
  if (canonical !== null) link.push({ rel: "canonical", href: canonical });
  return {
    source: { path: sourcePath, generated: false, layout: null },
    outputPath,
    document: {
      path,
      url,
      html: { attributes: {} },
      head: { title, meta, link, base: [] },
      body: { attributes: {}, headings },
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

// --------------------------------------------------------------------- §30.3

describe("§30.3 foldSpaceSeparators", () => {
  test("each codepoint in the closed set folds to U+0020", () => {
    const codepoints = [0x00a0, 0x2000, 0x2001, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000];
    for (const cp of codepoints) {
      const ch = String.fromCodePoint(cp);
      expect(foldSpaceSeparators(`a${ch}b`)).toBe("a b");
    }
  });

  test("the full U+2000..U+200A block folds, boundary to boundary", () => {
    for (let cp = 0x2000; cp <= 0x200a; cp++) {
      expect(foldSpaceSeparators(`x${String.fromCodePoint(cp)}y`)).toBe("x y");
    }
  });

  test("adjacent separators collapse to one space, not one per separator", () => {
    expect(foldSpaceSeparators(`a${" ".repeat(3)}b`)).toBe("a b");
    expect(foldSpaceSeparators("a  　b")).toBe("a b");
  });

  test("a separator beside a surviving ASCII space collapses too", () => {
    // §20.3 collapses ASCII whitespace but never touches these codepoints, so
    // "New  York" (an authored NBSP next to a literal space) is exactly
    // the shape record.text can carry into this module.
    expect(foldSpaceSeparators("New  York")).toBe("New York"); // NBSP, then ASCII space
    expect(foldSpaceSeparators("New  York")).toBe("New York"); // ASCII space, then NBSP
  });

  test("leading and trailing folded separators are trimmed", () => {
    expect(foldSpaceSeparators(" Hello　")).toBe("Hello");
  });

  test("codepoints just outside the closed set are left alone", () => {
    // U+200B ZERO WIDTH SPACE (format char, category Cf, not Zs) and
    // U+2028 LINE SEPARATOR (category Zl, not Zs) are both real neighbors of
    // the closed set and both excluded from it by §30.3's own enumeration.
    expect(foldSpaceSeparators("a​b")).toBe("a​b");
    expect(foldSpaceSeparators("a b")).toBe("a b");
  });

  test("nothing else is folded: case, punctuation, and digits pass through", () => {
    expect(foldSpaceSeparators("New York, NY 10001")).toBe("New York, NY 10001");
  });

  test("empty and already-plain text are no-ops", () => {
    expect(foldSpaceSeparators("")).toBe("");
    expect(foldSpaceSeparators("About Who we are and what we do.")).toBe("About Who we are and what we do.");
  });
});

// ------------------------------------------------------------------ §30.1/.2

describe("§30.1/§30.2 searchIndexEntry", () => {
  test("the five keys, in the fixed order, and no others", () => {
    const entry = searchIndexEntry(doc());
    expect(Object.keys(entry)).toEqual(["url", "title", "description", "headings", "text"]);
  });

  test("url is doc.document.url when --base-url was supplied", () => {
    expect(searchIndexEntry(doc({ url: "https://example.com/p.html", path: "/p.html" })).url)
      .toBe("https://example.com/p.html");
  });

  test("url falls back to doc.document.path with no --base-url, rather than refusing the page", () => {
    expect(searchIndexEntry(doc({ url: null, path: "/p.html" })).url).toBe("/p.html");
  });

  test("title and description pass through unchanged, null included", () => {
    expect(searchIndexEntry(doc({ title: "About — Example", description: "Who we are." }))).toMatchObject({
      title: "About — Example",
      description: "Who we are.",
    });
    expect(searchIndexEntry(doc({ title: null, description: null }))).toMatchObject({
      title: null,
      description: null,
    });
  });

  test("headings pass through verbatim — the document's own shape, not re-derived", () => {
    const headings = [{ level: 1, text: "About", id: "about" }, { level: 2, text: "Team", id: null }];
    expect(searchIndexEntry(doc({ headings })).headings).toEqual(headings);
  });

  test("a heading's own text is not folded — only the page-level text field is", () => {
    const headings = [{ level: 1, text: "New York", id: null }];
    expect(searchIndexEntry(doc({ headings })).headings[0].text).toBe("New York");
  });

  test("text is folded through foldSpaceSeparators", () => {
    expect(searchIndexEntry(doc({ text: "About Who we are." })).text).toBe("About Who we are.");
  });

  test("an empty visibleText stays the empty string, never null", () => {
    expect(searchIndexEntry(doc({ text: "" })).text).toBe("");
  });
});

// ----------------------------------------------------------------------- §30.2

describe("§30.2 searchIndexDocument — membership is §21.2's predicate, shared", () => {
  const base = parseBaseUrl("https://example.com/");

  test("a page with no canonical and no robots meta is included", () => {
    const d = searchIndexDocument([doc()], base);
    expect(d.pages).toHaveLength(1);
    expect(d.pages[0].url).toBe("https://example.com/p.html");
  });

  test("noindex and none are excluded — a site search IS search results", () => {
    expect(searchIndexDocument([doc({ robots: "noindex" })], base).pages).toEqual([]);
    expect(searchIndexDocument([doc({ robots: "none" })], base).pages).toEqual([]);
  });

  test("nofollow does not exclude — it is not noindex", () => {
    expect(searchIndexDocument([doc({ robots: "nofollow" })], base).pages).toHaveLength(1);
  });

  test("404.html is excluded", () => {
    expect(searchIndexDocument([doc({ outputPath: "404.html", url: "https://example.com/404.html" })], base).pages)
      .toEqual([]);
  });

  test("a canonical resolving to another page consolidates this one out of the index", () => {
    expect(searchIndexDocument([doc({ canonical: "https://example.com/other.html" })], base).pages).toEqual([]);
  });

  test("a self-canonical page is kept", () => {
    expect(searchIndexDocument([doc({ canonical: "https://example.com/p.html" })], base).pages).toHaveLength(1);
  });

  test("manifest order is preserved — filtering never reorders", () => {
    const documents = [
      doc({ outputPath: "a.html", url: "https://example.com/a.html", title: "A" }),
      doc({ outputPath: "b.html", url: "https://example.com/b.html", title: "B", robots: "noindex" }),
      doc({ outputPath: "c.html", url: "https://example.com/c.html", title: "C" }),
    ];
    expect(searchIndexDocument(documents, base).pages.map((p) => p.title)).toEqual(["A", "C"]);
  });

  test("schemaVersion is always 1, and the top-level shape is exactly schemaVersion/pages", () => {
    const d = searchIndexDocument([], base);
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(1);
    expect(Object.keys(d)).toEqual(["schemaVersion", "pages"]);
  });

  test("an empty manifest is a well-formed empty document, not a refusal", () => {
    expect(searchIndexDocument([], base)).toEqual({ schemaVersion: 1, pages: [] });
  });
});

// ------------------------------------------------------------------------ §30.1

describe("§30.1 serializeSearchIndex — exact bytes", () => {
  test("two-space JSON, trailing newline, matching the spec's own worked example", () => {
    const document = {
      schemaVersion: 1,
      pages: [
        {
          url: "https://example.com/about.html",
          title: "About — Example",
          description: "Who we are.",
          headings: [{ level: 1, text: "About", id: "about" }],
          text: "About Who we are and what we do.",
        },
      ],
    };
    expect(serializeSearchIndex(document)).toBe(
      "{\n" +
      '  "schemaVersion": 1,\n' +
      '  "pages": [\n' +
      "    {\n" +
      '      "url": "https://example.com/about.html",\n' +
      '      "title": "About — Example",\n' +
      '      "description": "Who we are.",\n' +
      '      "headings": [\n' +
      "        {\n" +
      '          "level": 1,\n' +
      '          "text": "About",\n' +
      '          "id": "about"\n' +
      "        }\n" +
      "      ],\n" +
      '      "text": "About Who we are and what we do."\n' +
      "    }\n" +
      "  ]\n" +
      "}\n",
    );
  });

  test("an empty page list serializes to a well-formed empty array", () => {
    expect(serializeSearchIndex({ schemaVersion: 1, pages: [] })).toBe(
      '{\n  "schemaVersion": 1,\n  "pages": []\n}\n',
    );
  });

  test("two calls over equal input produce byte-identical output", () => {
    const document = { schemaVersion: 1, pages: [{ url: "/a.html", title: null, description: null, headings: [], text: "" }] };
    expect(serializeSearchIndex(document)).toBe(serializeSearchIndex(JSON.parse(JSON.stringify(document))));
  });

  test("the file ends in exactly one trailing newline", () => {
    const out = serializeSearchIndex({ schemaVersion: 1, pages: [] });
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});

// -------------------------------------------------------------------- §30.4

describe("§30.4 generateSearchIndex — activation is the caller's, suppression is this module's", () => {
  const base = parseBaseUrl("https://example.com/");

  test("SEARCH_INDEX_PATH is the fixed output-root name", () => {
    expect(SEARCH_INDEX_PATH).toBe("search-index.json");
  });

  test("with no authored file, generation produces one entry at SEARCH_INDEX_PATH", () => {
    const generated = generateSearchIndex({ documents: [doc()], base, emittedFromSource: new Map() });
    expect([...generated.keys()]).toEqual([SEARCH_INDEX_PATH]);
    expect(generated.get(SEARCH_INDEX_PATH)).toBe(serializeSearchIndex(searchIndexDocument([doc()], base)));
  });

  test("an authored search-index.json suppresses generation entirely (§21.5's rule)", () => {
    const generated = generateSearchIndex({
      documents: [doc()],
      base,
      emittedFromSource: new Map([["search-index.json", "search-index.json"]]),
    });
    expect(generated.size).toBe(0);
  });

  test("an unrelated occupied path does not suppress generation", () => {
    const generated = generateSearchIndex({
      documents: [doc()],
      base,
      emittedFromSource: new Map([["sitemap.xml", "sitemap.xml"]]),
    });
    expect(generated.size).toBe(1);
  });

  test("works with no --base-url at all — url falls back to path (§30.2)", () => {
    const generated = generateSearchIndex({
      documents: [doc({ url: null, path: "/p.html" })],
      base: null,
      emittedFromSource: new Map(),
    });
    const parsed = JSON.parse(generated.get(SEARCH_INDEX_PATH));
    expect(parsed.pages[0].url).toBe("/p.html");
  });

  test("an empty manifest still generates a well-formed, empty search-index.json", () => {
    const generated = generateSearchIndex({ documents: [], base, emittedFromSource: new Map() });
    expect(generated.get(SEARCH_INDEX_PATH)).toBe('{\n  "schemaVersion": 1,\n  "pages": []\n}\n');
  });
});
