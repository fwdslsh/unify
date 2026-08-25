/**
 * Unit tests for src/core/search-corpus.js — conformance-spec §30 (Tier 3;
 * no conformance authority, testing-strategy §2).
 *
 * §30's CLI-observable behavior is pinned by tests/conformance/catalog.test.js
 * against the real binary — that file covers both `catalog.json` and
 * `search-corpus.json` together (its own header explains why: the two share
 * activation/membership/suppression/determinism rules that would otherwise be
 * proven twice). This file follows the tests/unit/core/sitemap.test.js precedent for the pure
 * function surface, plus the folding tests moved over from the retired
 * tests/unit/core/search-index.test.js — `foldSpaceSeparators` itself is
 * unchanged, only relocated.
 *
 * Every expectation is written from §30.3/§30.4/§30.5/§30.6/§30.7's text.
 */
import { describe, expect, test } from "bun:test";
import {
  SCHEMA_VERSION,
  SEARCH_CORPUS_PATH,
  corpusDocument,
  corpusEntry,
  foldSpaceSeparators,
  generateSearchCorpus,
  serializeCorpus,
} from "../../../src/core/search-corpus.js";
import { parseBaseUrl } from "../../../src/core/urls.js";

const doc = (over = {}) => {
  const {
    sourcePath = "p.html",
    outputPath = "p.html",
    path = "/p.html",
    url = "https://example.com/p.html",
    text = "",
    canonical = null,
    robots = null,
  } = over;
  const meta = [];
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
      head: { title: null, meta, link, base: [] },
      body: { attributes: {}, headings: [] },
    },
    analysis: {
      visibleText: text,
      ids: [],
      titleTexts: [],
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

// --------------------------------------------------------------------- §30.5

describe("§30.5 foldSpaceSeparators", () => {
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
    expect(foldSpaceSeparators("New  York")).toBe("New York");
    expect(foldSpaceSeparators("New  York")).toBe("New York");
  });

  test("leading and trailing folded separators are trimmed", () => {
    expect(foldSpaceSeparators(" Hello　")).toBe("Hello");
  });

  test("codepoints just outside the closed set are left alone", () => {
    // U+200B ZERO WIDTH SPACE (format char, category Cf, not Zs) and
    // U+2028 LINE SEPARATOR (category Zl, not Zs) are real neighbors of the
    // closed set, both excluded from it by §30.5's own enumeration.
    expect(foldSpaceSeparators("a​b")).toBe("a​b");
    expect(foldSpaceSeparators("a b")).toBe("a b");
  });

  test("nothing else is folded: case, punctuation, and digits pass through", () => {
    expect(foldSpaceSeparators("New York, NY 10001")).toBe("New York, NY 10001");
  });

  test("empty and already-plain text are no-ops", () => {
    expect(foldSpaceSeparators("")).toBe("");
    expect(foldSpaceSeparators("About Who we are and what we do.")).toBe("About Who we are and what we do.");
  });
});

// ------------------------------------------------------------------- §30.3

describe("§30.3 corpusEntry", () => {
  test("exactly two keys, path and text, in that order", () => {
    expect(Object.keys(corpusEntry(doc()))).toEqual(["path", "text"]);
  });

  test("path is doc.document.path, unchanged", () => {
    expect(corpusEntry(doc({ path: "/about.html" })).path).toBe("/about.html");
  });

  test("text is analysis.visibleText, folded", () => {
    const NBSP = " ";
    expect(corpusEntry(doc({ text: `New${NBSP}York` })).text).toBe("New York");
  });

  test("an empty visibleText stays the empty string, never null", () => {
    expect(corpusEntry(doc({ text: "" })).text).toBe("");
  });

  test("no url, title, headings, or metadata leak onto the entry", () => {
    const entry = corpusEntry(doc({ url: "https://example.com/p.html", text: "hello" }));
    expect(entry).toEqual({ path: "/p.html", text: "hello" });
  });
});

// ------------------------------------------------------------------- §30.3/§30.4

describe("§30.3/§30.4 corpusDocument — membership is §21.2's predicate, shared", () => {
  const base = parseBaseUrl("https://example.com/");

  test("top-level shape is exactly schemaVersion, pages", () => {
    const d = corpusDocument([], base);
    expect(Object.keys(d)).toEqual(["schemaVersion", "pages"]);
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(1);
  });

  test("noindex and none are excluded; nofollow is not", () => {
    expect(corpusDocument([doc({ robots: "noindex" })], base).pages).toEqual([]);
    expect(corpusDocument([doc({ robots: "none" })], base).pages).toEqual([]);
    expect(corpusDocument([doc({ robots: "nofollow" })], base).pages).toHaveLength(1);
  });

  test("404.html is excluded", () => {
    expect(corpusDocument([doc({ outputPath: "404.html", url: "https://example.com/404.html" })], base).pages)
      .toEqual([]);
  });

  test("a canonical resolving elsewhere excludes; self-canonical keeps", () => {
    expect(corpusDocument([doc({ canonical: "https://example.com/other.html" })], base).pages).toEqual([]);
    expect(corpusDocument([doc({ canonical: "https://example.com/p.html" })], base).pages).toHaveLength(1);
  });

  test("manifest order is preserved — filtering never reorders", () => {
    const documents = [
      doc({ outputPath: "a.html", path: "/a.html" }),
      doc({ outputPath: "b.html", path: "/b.html", robots: "noindex" }),
      doc({ outputPath: "c.html", path: "/c.html" }),
    ];
    expect(corpusDocument(documents, base).pages.map((p) => p.path)).toEqual(["/a.html", "/c.html"]);
  });

  test("an empty manifest is a well-formed empty document", () => {
    expect(corpusDocument([], base)).toEqual({ schemaVersion: 1, pages: [] });
  });
});

// ------------------------------------------------------------------------- §30.7

describe("§30.7 serializeCorpus — exact bytes", () => {
  test("two-space JSON, trailing newline", () => {
    const document = { schemaVersion: 1, pages: [{ path: "/about.html", text: "About Who we are." }] };
    expect(serializeCorpus(document)).toBe(`${JSON.stringify(document, null, 2)}\n`);
  });

  test("an empty page list serializes to a well-formed empty array", () => {
    expect(serializeCorpus({ schemaVersion: 1, pages: [] })).toBe('{\n  "schemaVersion": 1,\n  "pages": []\n}\n');
  });

  test("two calls over equal input produce byte-identical output", () => {
    const document = { schemaVersion: 1, pages: [{ path: "/a.html", text: "" }] };
    expect(serializeCorpus(document)).toBe(serializeCorpus(JSON.parse(JSON.stringify(document))));
  });

  test("the file ends in exactly one trailing newline", () => {
    const out = serializeCorpus({ schemaVersion: 1, pages: [] });
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});

// ------------------------------------------------------------------------- §30.1/§30.6

describe("§30.1/§30.6 generateSearchCorpus — activation is the caller's, suppression is this module's", () => {
  const base = parseBaseUrl("https://example.com/");

  test("SEARCH_CORPUS_PATH is the fixed assets/unify/ location", () => {
    expect(SEARCH_CORPUS_PATH).toBe("assets/unify/search-corpus.json");
  });

  test("with no authored file, generation produces one entry at SEARCH_CORPUS_PATH", () => {
    const generated = generateSearchCorpus({ documents: [doc()], base, emittedFromSource: new Map() });
    expect([...generated.keys()]).toEqual([SEARCH_CORPUS_PATH]);
    expect(generated.get(SEARCH_CORPUS_PATH)).toBe(serializeCorpus(corpusDocument([doc()], base)));
  });

  test("an authored assets/unify/search-corpus.json suppresses generation entirely", () => {
    const generated = generateSearchCorpus({
      documents: [doc()],
      base,
      emittedFromSource: new Map([[SEARCH_CORPUS_PATH, SEARCH_CORPUS_PATH]]),
    });
    expect(generated.size).toBe(0);
  });

  test("an unrelated occupied path does not suppress generation", () => {
    const generated = generateSearchCorpus({
      documents: [doc()],
      base,
      emittedFromSource: new Map([["sitemap.xml", "sitemap.xml"]]),
    });
    expect(generated.size).toBe(1);
  });

  test("works with no --base-url at all", () => {
    const generated = generateSearchCorpus({
      documents: [doc({ url: null, path: "/p.html" })],
      base: null,
      emittedFromSource: new Map(),
    });
    const parsed = JSON.parse(generated.get(SEARCH_CORPUS_PATH));
    expect(parsed.pages[0].path).toBe("/p.html");
  });

  test("an empty manifest still generates a well-formed, empty corpus", () => {
    const generated = generateSearchCorpus({ documents: [], base, emittedFromSource: new Map() });
    expect(generated.get(SEARCH_CORPUS_PATH)).toBe('{\n  "schemaVersion": 1,\n  "pages": []\n}\n');
  });
});
