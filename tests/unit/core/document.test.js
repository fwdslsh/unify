/**
 * Unit tests for src/core/document.js — the single extraction pass over a
 * final emitted HTML document (Tier 3; testing-strategy §2 gives these no
 * conformance authority of their own — the conformance spec's own rewrite of
 * §20 lands with the model swap batch).
 *
 * Every expectation below is written against the batch contract
 * (`_notes/batches/b1-contract.md`) and the ported §20.3/§20.7 discipline the
 * contract cites: decode-then-collapse order, `nonEmpty` for a raw attribute
 * slice vs `orNull` for text a helper already normalized, `findAll`'s
 * `template` skip, and `INVISIBLE` subtree omission with enter/leave
 * separators for non-`INLINE` elements.
 */
import { describe, expect, test } from "bun:test";
import { extractDocument } from "../../../src/core/document.js";

/** Wrap a head/body fragment in the smallest complete emitted document. */
const doc = (head = "", body = "", htmlAttrs = "") =>
  `<!doctype html>\n<html${htmlAttrs ? ` ${htmlAttrs}` : ""}>\n<head>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

/** Shorthand: extract and return just the `document` half. */
const snap = (html, options) => extractDocument(html, options).document;

/** Shorthand: extract and return just the `analysis` half. */
const analysis = (html, options) => extractDocument(html, options).analysis;

// -------------------------------------------------------- html/body attrs

describe("html/body attributes", () => {
  test("arbitrary and data-* attributes captured, lowercased, decoded", () => {
    const d = snap(doc("", "", 'lang="fr" data-x="a&amp;b" class="foo"'));
    expect(d.html.attributes).toEqual({ lang: "fr", "data-x": "a&b", class: "foo" });
  });

  test("body attributes captured the same way", () => {
    const d = snap(`<html><head></head><body data-y="1" id="main-body"></body></html>`);
    expect(d.body.attributes).toEqual({ "data-y": "1", id: "main-body" });
  });

  test("bare attribute (no =) maps to empty string", () => {
    const d = snap(`<html hidden><head></head><body></body></html>`);
    expect(d.html.attributes).toEqual({ hidden: "" });
  });

  test("repeated attribute: first occurrence wins", () => {
    const d = snap(`<html lang="en" lang="fr"><head></head><body></body></html>`);
    expect(d.html.attributes.lang).toBe("en");
  });

  test("attribute name comparison is case-insensitive, first wins", () => {
    const d = snap(`<html LANG="en" lang="fr"><head></head><body></body></html>`);
    expect(d.html.attributes.lang).toBe("en");
    expect(Object.keys(d.html.attributes)).toEqual(["lang"]);
  });

  test("attribute values are decoded but NOT trimmed", () => {
    const d = snap(`<html lang="  fr  "><head></head><body></body></html>`);
    expect(d.html.attributes.lang).toBe("  fr  ");
  });

  test("absent <html>/<body> element reads as {}", () => {
    const d = snap(`<div>no html or body here</div>`);
    expect(d.html.attributes).toEqual({});
    expect(d.body.attributes).toEqual({});
  });
});

// -------------------------------------------------------------- title

describe("title extraction", () => {
  test("first-wins across repeated <title> elements", () => {
    const d = snap(doc("<title>First</title><title>Second</title>"));
    expect(d.head.title).toBe("First");
  });

  test("whitespace collapse and entity decoding", () => {
    const d = snap(doc("<title>  Tea   &amp;\n  Coffee  </title>"));
    expect(d.head.title).toBe("Tea & Coffee");
  });

  test("a doubly-escaped reference decodes exactly once", () => {
    const d = snap(doc("<title>a &amp;amp; b</title>"));
    expect(d.head.title).toBe("a &amp; b");
  });

  test("empty/whitespace-only title skipped; next non-empty wins; titleTexts shows only accepted", () => {
    const d = snap(doc("<title>   </title><title></title><title>Real Title</title>"));
    const a = analysis(doc("<title>   </title><title></title><title>Real Title</title>"));
    expect(d.head.title).toBe("Real Title");
    expect(a.titleTexts).toEqual(["Real Title"]);
  });

  test("no title anywhere: head.title null, titleTexts empty", () => {
    const d = snap(doc());
    const a = analysis(doc());
    expect(d.head.title).toBeNull();
    expect(a.titleTexts).toEqual([]);
  });

  test("body-placed <title> excluded from snapshot when a head exists, reported in strayMetadata", () => {
    const d = snap(doc("", "<title>Stray</title>"));
    const a = analysis(doc("", "<title>Stray</title>"));
    expect(d.head.title).toBeNull();
    expect(a.titleTexts).toEqual([]);
    expect(a.strayMetadata).toEqual([{ tag: "title", key: null }]);
  });
});

// --------------------------------------------------------------- meta

describe("meta extraction", () => {
  test("arbitrary meta names captured as plain attribute objects", () => {
    const d = snap(doc('<meta name="theme-color" content="#fff">'));
    expect(d.head.meta).toEqual([{ name: "theme-color", content: "#fff" }]);
  });

  test("property= entries captured, no interpretation of name vs property", () => {
    const d = snap(doc('<meta property="og:title" content="Hello">'));
    expect(d.head.meta).toEqual([{ property: "og:title", content: "Hello" }]);
  });

  test("repeated metadata values preserved in document order", () => {
    const d = snap(doc('<meta name="keywords" content="a"><meta name="keywords" content="b">'));
    expect(d.head.meta).toEqual([
      { name: "keywords", content: "a" },
      { name: "keywords", content: "b" },
    ]);
  });

  test("arbitrary extra attributes on a meta element preserved", () => {
    const d = snap(doc('<meta name="x" content="y" data-extra="z" id="m1">'));
    expect(d.head.meta[0]).toEqual({ name: "x", content: "y", "data-extra": "z", id: "m1" });
  });
});

// --------------------------------------------------------------- link

describe("link extraction", () => {
  test("all attributes preserved on a single link", () => {
    const d = snap(doc('<link rel="stylesheet" href="/a.css" media="screen" data-x="1">'));
    expect(d.head.link).toEqual([{ rel: "stylesheet", href: "/a.css", media: "screen", "data-x": "1" }]);
  });

  test("repeated links preserved in order", () => {
    const d = snap(doc('<link rel="stylesheet" href="/a.css"><link rel="canonical" href="/a/">'));
    expect(d.head.link).toEqual([
      { rel: "stylesheet", href: "/a.css" },
      { rel: "canonical", href: "/a/" },
    ]);
  });
});

// --------------------------------------------------------------- base

describe("base extraction", () => {
  test("base elements captured with all attributes", () => {
    const d = snap(doc('<base href="/site/" target="_top">'));
    expect(d.head.base).toEqual([{ href: "/site/", target: "_top" }]);
  });

  test("base element outside head reported in strayMetadata, excluded from snapshot", () => {
    const d = snap(doc("", '<base href="/x/">'));
    const a = analysis(doc("", '<base href="/x/">'));
    expect(d.head.base).toEqual([]);
    expect(a.strayMetadata).toEqual([{ tag: "base", key: null }]);
  });
});

// ---------------------------------------------------- entity decoding

describe("character-reference decoding", () => {
  test("known named and numeric references decoded in attribute values", () => {
    const d = snap(doc("", "", 'data-x="Caf&eacute; &amp; Tea &#233;"'));
    expect(d.html.attributes["data-x"]).toBe("Café & Tea é");
  });

  test("unknown reference left as written", () => {
    const d = snap(doc("", "", 'data-x="a&whatsit;b"'));
    expect(d.html.attributes["data-x"]).toBe("a&whatsit;b");
  });
});

// --------------------------------------------------------------- head scope

describe("head scope", () => {
  test("metadata elements outside the head are excluded from snapshot arrays", () => {
    const html = doc("", '<meta name="description" content="stray"><link rel="stylesheet" href="/x.css">');
    const d = snap(html);
    expect(d.head.meta).toEqual([]);
    // A non-canonical link outside head is not document metadata at all —
    // it does its job in the body and is not stray either.
    expect(d.head.link).toEqual([]);
  });

  test("a document with no <head> element is read whole: body metas count, strayMetadata empty", () => {
    const html = `<html><body><meta name="description" content="whole doc"><title>T</title></body></html>`;
    const d = snap(html);
    const a = analysis(html);
    expect(d.head.meta).toEqual([{ name: "description", content: "whole doc" }]);
    expect(d.head.title).toBe("T");
    expect(a.strayMetadata).toEqual([]);
  });
});

// ---------------------------------------------------------- strayMetadata

describe("strayMetadata", () => {
  test("§24.4 closed-set meta keys are reported when body-placed; a non-closed-set name is not", () => {
    const html = doc(
      "",
      '<meta charset="utf-8">' +
        '<meta name="description" content="d">' +
        '<meta name="robots" content="noindex">' +
        '<meta name="schema" content="Article">' +
        '<meta name="twitter:card" content="summary">' +
        '<meta property="og:title" content="t">' +
        '<meta name="keywords" content="a,b">',
    );
    const a = analysis(html);
    expect(a.strayMetadata).toEqual([
      { tag: "meta", key: "charset" },
      { tag: "meta", key: "description" },
      { tag: "meta", key: "robots" },
      { tag: "meta", key: "schema" },
      { tag: "meta", key: "twitter:card" },
      { tag: "meta", key: "og:title" },
    ]);
  });

  test("body-placed <link rel=\"canonical\"> is reported; rel=\"stylesheet\" is not", () => {
    const html = doc("", '<link rel="canonical" href="/c"><link rel="stylesheet" href="/s.css">');
    const a = analysis(html);
    expect(a.strayMetadata).toEqual([{ tag: "link", key: "canonical" }]);
  });
});

// --------------------------------------------------------------- headings

describe("headings", () => {
  test("scoped to the first <main> when one exists", () => {
    const html = doc("", "<h1>Outside</h1><main><h2>Inside</h2></main>");
    const d = snap(html);
    expect(d.body.headings).toEqual([{ level: 2, id: null, text: "Inside" }]);
  });

  test("falls back to <body> scope when no <main>", () => {
    const html = doc("", "<h1>A</h1><h2>B</h2>");
    const d = snap(html);
    expect(d.body.headings).toEqual([
      { level: 1, id: null, text: "A" },
      { level: 2, id: null, text: "B" },
    ]);
  });

  test("falls back to the whole document when there is no <body> either", () => {
    const d = snap(`<article><h3>Fragment heading</h3></article>`);
    expect(d.body.headings).toEqual([{ level: 3, id: null, text: "Fragment heading" }]);
  });

  test("heading ids: decoded when present, null when absent/empty", () => {
    const html = doc("", '<h1 id="a&amp;b">One</h1><h2 id="">Two</h2><h3>Three</h3>');
    const d = snap(html);
    expect(d.body.headings).toEqual([
      { level: 1, id: "a&b", text: "One" },
      { level: 2, id: null, text: "Two" },
      { level: 3, id: null, text: "Three" },
    ]);
  });

  test("skipped heading levels preserved flat, no hierarchy manufactured", () => {
    const html = doc("", "<h1>Top</h1><h3>Skipped to three</h3>");
    const d = snap(html);
    expect(d.body.headings.map((h) => h.level)).toEqual([1, 3]);
  });

  test("heading inside <template> is ignored", () => {
    const html = doc("", "<h1>Real</h1><template><h2>Ghost</h2></template>");
    const d = snap(html);
    expect(d.body.headings).toEqual([{ level: 1, id: null, text: "Real" }]);
  });

  test("heading outside <main> is excluded when <main> exists", () => {
    const html = doc("", "<header><h1>Chrome</h1></header><main><h1>Content</h1></main><footer><h2>Foot</h2></footer>");
    const d = snap(html);
    expect(d.body.headings).toEqual([{ level: 1, id: null, text: "Content" }]);
  });

  test("heading text decodes character references exactly once", () => {
    // §20.3: textContent already resolves character references; a heading
    // whose source is double-encoded (the author literally typed "&amp;amp;")
    // must decode to a single "&amp;", not to a bare "&" — that would require
    // decoding twice.
    const html = doc("", "<h2>Tea &amp;amp; Coffee</h2>");
    const d = snap(html);
    expect(d.body.headings).toEqual([{ level: 2, id: null, text: "Tea &amp; Coffee" }]);
  });
});

// ------------------------------------------------------------- visibleText

describe("visibleText", () => {
  test("body text is absent from the snapshot", () => {
    const html = doc("", "<p>This paragraph must not leak into the snapshot.</p>");
    const d = snap(html);
    const serialized = JSON.stringify(d);
    expect(serialized).not.toContain("This paragraph must not leak");
  });

  test("body text is present in analysis.visibleText", () => {
    const html = doc("", "<p>Visible paragraph text.</p>");
    const a = analysis(html);
    expect(a.visibleText).toContain("Visible paragraph text.");
  });

  test("script/style/template/noscript excluded", () => {
    const html = doc(
      "",
      '<p>Keep</p><script>var drop = "no";</script><style>.x{color:red}</style>' +
        "<template><p>tpl-drop</p></template><noscript>noscript-drop</noscript>",
    );
    const a = analysis(html);
    expect(a.visibleText).toBe("Keep");
  });

  test("U+00A0 (non-breaking space) preserved, no Unicode folding", () => {
    const html = doc("", "<p>a b</p>");
    const a = analysis(html);
    expect(a.visibleText).toBe("a b");
    expect(a.visibleText.codePointAt(1)).toBe(0xa0);
  });

  test("block-boundary spacing: <div>a<p>b</p></div> reads as 'a b'", () => {
    const html = doc("", "<div>a<p>b</p></div>");
    const a = analysis(html);
    expect(a.visibleText).toBe("a b");
  });

  test("inline elements not separated: a<em>b</em>! reads as 'ab!'", () => {
    const html = doc("", "<p>a<em>b</em>!</p>");
    const a = analysis(html);
    expect(a.visibleText).toBe("ab!");
  });

  test("visibleText scope matches headings scope: first <main>, else <body>, else root", () => {
    const html = doc("", "<p>Outside main</p><main><p>Inside main</p></main>");
    const a = analysis(html);
    expect(a.visibleText).toBe("Inside main");
    expect(a.visibleText).not.toContain("Outside main");
  });

  test("whole-document fallback (no <main>, no <body>) excludes <head> text", () => {
    // HTML5 makes the <body> start tag omissible, so this is legal authored
    // markup, not malformed input — the root fallback must not count the
    // page's own <title> (or other head-only text) as body text.
    const html = "<html><head><title>NoBody</title></head><h1>Loose</h1><p>text</p>";
    const a = analysis(html);
    expect(a.visibleText).toBe("Loose text");
    expect(a.visibleText).not.toContain("NoBody");
  });

  test("a <head> nested inside <main>/<body> (not the fallback case) still contributes its text", () => {
    // The <head> exclusion is scoped to the §20.7 whole-document fallback
    // only. A textually-included second document can leave a <head> nested
    // inside the page's own <main>/<body> — that <head> is not the page's
    // own head (the page HAS a <body>/<main>, so `scope` never falls back
    // to root), and its text must still count as visible body text.
    const html = doc(
      "",
      "<main><p>Body text</p><head><title>Inner</title></head><p>after</p></main>",
    );
    const a = analysis(html);
    expect(a.visibleText).toBe("Body text Inner after");
  });
});

// ----------------------------------------------------------------- jsonLd

describe("jsonLd", () => {
  test("valid block parsed", () => {
    const html = doc("", '<script type="application/ld+json">{"@type":"Article","name":"x"}</script>');
    const a = analysis(html);
    expect(a.jsonLd).toEqual([
      { raw: '{"@type":"Article","name":"x"}', data: { "@type": "Article", name: "x" }, error: null },
    ]);
  });

  test("invalid block yields {data: null, error} without throwing", () => {
    const html = doc("", '<script type="application/ld+json">{not valid json</script>');
    expect(() => analysis(html)).not.toThrow();
    const a = analysis(html);
    expect(a.jsonLd).toHaveLength(1);
    expect(a.jsonLd[0].data).toBeNull();
    expect(typeof a.jsonLd[0].error).toBe("string");
  });

  test("body-placed ld+json still read; document order preserved across head and body", () => {
    const html = doc(
      '<script type="application/ld+json">{"@type":"WebSite"}</script>',
      '<script type="application/ld+json">{"@type":"Article"}</script>',
    );
    const a = analysis(html);
    expect(a.jsonLd.map((e) => e.data["@type"])).toEqual(["WebSite", "Article"]);
  });
});

// -------------------------------------------------------------------- ids

describe("ids", () => {
  test("every non-empty id, document-wide, document order, repeats kept", () => {
    const html = doc('<meta name="x" content="y" id="head-id">', '<div id="a"></div><p id="b"></p><span id="a"></span>');
    const a = analysis(html);
    expect(a.ids).toEqual(["head-id", "a", "b", "a"]);
  });

  test("empty and whitespace-only ids excluded; a decoded id is kept", () => {
    const html = doc("", '<div id=""></div><div id="   "></div><div id="a&amp;b"></div>');
    const a = analysis(html);
    expect(a.ids).toEqual(["a&b"]);
  });
});

// --------------------------------------------------------------- rawHrefs

describe("rawHrefs", () => {
  test("order preserved, values kept raw/undecoded", () => {
    const html = doc("", '<a href="/a?x=1&amp;y=2">A</a><a href="/b">B</a>');
    const a = analysis(html);
    expect(a.rawHrefs).toEqual(["/a?x=1&amp;y=2", "/b"]);
  });
});

// ---------------------------------------------------------------- refresh

describe("refresh", () => {
  test("first refresh declaration wins, document-wide", () => {
    const html = doc(
      '<meta http-equiv="refresh" content="5; url=/first.html">',
      '<meta http-equiv="refresh" content="9; url=/second.html">',
    );
    const a = analysis(html);
    expect(a.refresh.url).toBe("/first.html");
  });

  test('content="5" has hasSecondPart false, url null', () => {
    const html = doc('<meta http-equiv="refresh" content="5">');
    const a = analysis(html);
    expect(a.refresh).toEqual({ raw: "5", seconds: 5, url: null, hasSecondPart: false });
  });

  test('content="0; url=/x.html" parsed with hasSecondPart true', () => {
    const html = doc('<meta http-equiv="refresh" content="0; url=/x.html">');
    const a = analysis(html);
    expect(a.refresh).toEqual({ raw: "0; url=/x.html", seconds: 0, url: "/x.html", hasSecondPart: true });
  });

  test("no refresh meta: null", () => {
    const a = analysis(doc());
    expect(a.refresh).toBeNull();
  });

  test("raw is the content attribute exactly as emitted — verbatim, undecoded, untrimmed", () => {
    const html = doc('<meta http-equiv="refresh" content=" 5 ; url=/x">');
    const a = analysis(html);
    expect(a.refresh.raw).toBe(" 5 ; url=/x");
  });

  test("raw stays undecoded even when the content value carries a character reference", () => {
    const html = doc('<meta http-equiv="refresh" content="0;&#32;url=/a.html">');
    const a = analysis(html);
    expect(a.refresh.raw).toBe("0;&#32;url=/a.html");
    // The undecoded raw and the parsed url agree: neither reads the entity as
    // whitespace, so `url` is null rather than contradicting `raw`.
    expect(a.refresh.url).toBeNull();
  });
});

// ------------------------------------------------------------ path / url

describe("path/url passthrough", () => {
  test("both default to null when omitted", () => {
    const d = snap(doc());
    expect(d.path).toBeNull();
    expect(d.url).toBeNull();
  });

  test("both pass through untouched when provided", () => {
    const d = snap(doc(), { path: "/about/", url: "https://example.com/about/" });
    expect(d.path).toBe("/about/");
    expect(d.url).toBe("https://example.com/about/");
  });
});
