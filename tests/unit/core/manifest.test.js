/**
 * Unit tests for src/core/manifest.js — conformance-spec §20, the
 * final-output document manifest (Tier 3; testing-strategy §2 gives these no
 * conformance authority of their own).
 *
 * `manifest.js` is a THIN ENVELOPE over `document.js`'s extraction (§20.3's
 * `DocumentSnapshot`/`DocumentAnalysis`, exhaustively unit-tested in
 * `document.test.js`) and `document-selectors.js`'s interpretation layer
 * (`document-selectors.test.js`). This file's own job is narrower: it pins
 * what `buildManifest` itself does that neither of those modules can —
 * membership/ordering over a whole page set (§20.1), the provenance fields
 * that do not exist in HTML at all (`source.path`/`generated`/`layout`,
 * §20.3), the public URL computation delegated to `publish.js` (§20.5), and
 * the second pass that needs every document to exist first: the link graph
 * (§20.9) and the resolved redirect target (§20.11).
 *
 * §20's CLI-observable behavior lives in
 * tests/conformance/manifest-observable.test.js (the MAN rows), which is
 * where the rule's real authority sits — §31.1's `unify audit --format json`
 * publishes each document, so every MAN rule is covered by a CLI-spawning
 * test there. These Tier-3 tests are kept because they reach the extractor
 * directly on emitted-document strings, a case a published-projection fixture
 * cannot pose as cheaply — and §2's authority order is unchanged: where they
 * and a conformance test disagree, the conformance test wins.
 *
 * Every expectation below is written from §20's text, never from a run.
 * Inputs are emitted-document strings — exactly what §20.2 says the extractor
 * reads — so these tests exercise the real parser on real final bytes.
 */
import { describe, expect, test } from "bun:test";
import { buildManifest } from "../../../src/core/manifest.js";
import { parseBaseUrl } from "../../../src/core/urls.js";

/** Wrap a body fragment in the smallest complete emitted document. */
const doc = (head = "", body = "", htmlAttrs = "") =>
  `<!doctype html>\n<html${htmlAttrs ? ` ${htmlAttrs}` : ""}>\n<head>\n<meta charset="utf-8">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

/** Shorthand: build a manifest from `{outputPath: html}` and return documents. */
function documents(pagesByPath, base = null) {
  const pages = Object.entries(pagesByPath).map(([outputPath, html]) => ({
    sourcePath: outputPath.replace(/\/index\.html$/, ".html"),
    outputPath,
    html,
  }));
  return buildManifest({ pages, base }).documents;
}

/** Shorthand: the single document of a one-page manifest. */
const only = (html, base = null) => documents({ "index.html": html }, base)[0];

// --------------------------------------------------------------- §20.1

describe("§20.1 membership (MAN-01)", () => {
  test("one document per page handed in, ordered by output path", () => {
    const docs = documents({
      "zebra.html": doc(),
      "about.html": doc(),
      "blog/index.html": doc(),
    });
    expect(docs.map((d) => d.outputPath)).toEqual(["about.html", "blog/index.html", "zebra.html"]);
  });

  test("a page with no metadata at all still gets a complete envelope", () => {
    const d = only(doc());
    expect(d.source.path).toBe("index.html");
    expect(d.outputPath).toBe("index.html");
    expect(d.document.head.title).toBeNull();
    expect(d.document.body.headings).toEqual([]);
    expect(d.analysis.linksOut).toEqual([]);
    expect(d.analysis.linksIn).toEqual([]);
  });

  test("a duplicated output path keeps the FIRST document, not the last", () => {
    // Only reachable on a build P12 already blocks, but "which document" must
    // be a function of the input rather than of iteration order.
    const { documents: docs, byOutputPath } = buildManifest({
      pages: [
        { sourcePath: "a.md", outputPath: "dup.html", html: doc("<title>First</title>") },
        { sourcePath: "a.html", outputPath: "dup.html", html: doc("<title>Second</title>") },
      ],
    });
    expect(docs).toHaveLength(2);
    expect(byOutputPath.size).toBe(1);
    expect(byOutputPath.get("dup.html").document.head.title).toBe("First");
  });

  test("byOutputPath and byPublicPath each index every document", () => {
    const { documents: docs, byOutputPath, byPublicPath } = buildManifest({
      pages: [
        { sourcePath: "a.html", outputPath: "a.html", html: doc() },
        { sourcePath: "b.html", outputPath: "b.html", html: doc() },
      ],
    });
    expect(byOutputPath.size).toBe(2);
    expect(byOutputPath.get("a.html")).toBe(docs[0]);
    expect(byOutputPath.get("b.html")).toBe(docs[1]);
    expect(byPublicPath.size).toBe(2);
    expect(byPublicPath.get(docs[0].document.path)).toBe(docs[0]);
  });

  test("an empty page set yields an empty manifest, not a throw", () => {
    expect(buildManifest({ pages: [] }).documents).toEqual([]);
  });
});

// --------------------------------------------------------------- §20.2

describe("§20.2 extraction source (MAN-02)", () => {
  test("layout-supplied metadata is read from each shipping page", () => {
    // Both pages emitted the layout's description; each document carries it.
    const shared = `<meta name="description" content="A shared blurb">`;
    const docs = documents({ "a.html": doc(shared), "b.html": doc(shared) });
    const descOf = (d) => d.document.head.meta.find((m) => m.name === "description")?.content ?? null;
    expect(docs.map(descOf)).toEqual(["A shared blurb", "A shared blurb"]);
  });

  test("<template> contents declare nothing", () => {
    const d = only(
      doc(
        "<title>Real</title>",
        `<template><h1>Templated</h1><a href="/ghost.html">ghost</a></template><h2>Visible</h2>`,
      ),
    );
    expect(d.document.head.title).toBe("Real");
    expect(d.document.body.headings).toEqual([{ level: 2, id: null, text: "Visible" }]);
    expect(d.analysis.linksOut).toEqual([]);
  });

  test("a <title> inside <template> does not become the page title", () => {
    const d = only(doc("", `<template><title>Shadow</title></template>`));
    expect(d.document.head.title).toBeNull();
  });
});

// --------------------------------------------------------------- §20.3 provenance

describe("§20.3 provenance fields (MAN-14)", () => {
  test("source.generated is true only when the caller says so; false by default", () => {
    const { documents: docs } = buildManifest({
      pages: [{ sourcePath: "a.html", outputPath: "a.html", html: doc() }],
    });
    expect(docs[0].source.generated).toBe(false);

    const { documents: gen } = buildManifest({
      pages: [{ sourcePath: "a.html", outputPath: "a.html", html: doc(), generated: true }],
    });
    expect(gen[0].source.generated).toBe(true);
  });

  test("source.layout is the caller's own value, verbatim, or null when omitted", () => {
    const { documents: docs } = buildManifest({
      pages: [{ sourcePath: "a.html", outputPath: "a.html", html: doc(), layout: "_layout.html" }],
    });
    expect(docs[0].source.layout).toBe("_layout.html");

    const { documents: none } = buildManifest({
      pages: [{ sourcePath: "a.html", outputPath: "a.html", html: doc() }],
    });
    expect(none[0].source.layout).toBeNull();
  });
});

// --------------------------------------------------------------- §20.5

describe("§20.5 public URLs (MAN-05)", () => {
  test("path drops a trailing index.html segment", () => {
    const docs = documents({
      "index.html": doc(),
      "about.html": doc(),
      "blog/index.html": doc(),
      "blog/post.html": doc(),
    });
    const byPath = Object.fromEntries(docs.map((d) => [d.outputPath, d.document.path]));
    expect(byPath).toEqual({
      "index.html": "/",
      "about.html": "/about.html",
      "blog/index.html": "/blog/",
      "blog/post.html": "/blog/post.html",
    });
  });

  test("url is null without --base-url", () => {
    expect(only(doc()).document.url).toBeNull();
  });

  test("--base-url supplies the path prefix and the absolute url", () => {
    const base = parseBaseUrl("https://example.com/repo/");
    const docs = documents({ "index.html": doc(), "about/index.html": doc() }, base);
    const byPath = Object.fromEntries(docs.map((d) => [d.outputPath, [d.document.path, d.document.url]]));
    expect(byPath).toEqual({
      "index.html": ["/repo/", "https://example.com/repo/"],
      "about/index.html": ["/repo/about/", "https://example.com/repo/about/"],
    });
  });

  test("a root-hosted --base-url still yields absolute urls", () => {
    const base = parseBaseUrl("https://example.com/");
    const d = documents({ "about.html": doc() }, base)[0];
    expect(d.document.path).toBe("/about.html");
    expect(d.document.url).toBe("https://example.com/about.html");
  });
});

// --------------------------------------------------------------- §20.9

describe("§20.9 the internal link graph (MAN-09)", () => {
  test("linksOut names output paths of linked pages, deduplicated and sorted", () => {
    const docs = documents({
      "index.html": doc("", `<a href="/zebra.html">z</a><a href="about.html">a</a><a href="/zebra.html">z again</a>`),
      "about.html": doc(),
      "zebra.html": doc(),
    });
    const home = docs.find((d) => d.outputPath === "index.html");
    expect(home.analysis.linksOut).toEqual(["about.html", "zebra.html"]);
  });

  test("linksIn is the exact reverse relation", () => {
    const docs = documents({
      "index.html": doc("", `<a href="/about.html">a</a>`),
      "about.html": doc("", `<a href="/index.html">home</a>`),
      "orphan.html": doc(),
    });
    const by = Object.fromEntries(docs.map((d) => [d.outputPath, d]));
    expect(by["about.html"].analysis.linksIn).toEqual(["index.html"]);
    expect(by["index.html"].analysis.linksIn).toEqual(["about.html"]);
    expect(by["orphan.html"].analysis.linksIn).toEqual([]);
  });

  test("a directory URL resolves to its index.html", () => {
    const docs = documents({
      "index.html": doc("", `<a href="/blog/">blog</a>`),
      "blog/index.html": doc(),
    });
    expect(docs.find((d) => d.outputPath === "index.html").analysis.linksOut).toEqual(["blog/index.html"]);
  });

  test("query and fragment are discarded before matching", () => {
    const docs = documents({
      "index.html": doc("", `<a href="/about.html?x=1#team">a</a>`),
      "about.html": doc(),
    });
    expect(docs.find((d) => d.outputPath === "index.html").analysis.linksOut).toEqual(["about.html"]);
  });

  test("external, mailto, tel, data, and fragment-only links never participate", () => {
    const d = only(
      doc(
        "",
        `<a href="https://example.org/">ext</a><a href="mailto:a@b.c">mail</a>` +
          `<a href="tel:+1">tel</a><a href="data:text/plain,x">data</a><a href="#top">frag</a>`,
      ),
    );
    expect(d.analysis.linksOut).toEqual([]);
  });

  test("a link to a non-page asset never participates", () => {
    const docs = documents({ "index.html": doc("", `<a href="/report.pdf">pdf</a>`) });
    expect(docs[0].analysis.linksOut).toEqual([]);
  });

  test("a self-link records the page itself", () => {
    const docs = documents({ "index.html": doc("", `<a href="/index.html">home</a>`) });
    expect(docs[0].analysis.linksOut).toEqual(["index.html"]);
    expect(docs[0].analysis.linksIn).toEqual(["index.html"]);
  });

  test("base-url-absolutized hrefs still resolve internally", () => {
    const base = parseBaseUrl("https://example.com/repo/");
    const docs = documents(
      {
        "index.html": doc("", `<a href="https://example.com/repo/about.html">a</a>`),
        "about.html": doc(),
      },
      base,
    );
    expect(docs.find((d) => d.outputPath === "index.html").analysis.linksOut).toEqual(["about.html"]);
  });

  test("links inside <template> do not participate", () => {
    const docs = documents({
      "index.html": doc("", `<template><a href="/about.html">a</a></template>`),
      "about.html": doc(),
    });
    expect(docs.find((d) => d.outputPath === "index.html").analysis.linksOut).toEqual([]);
  });

  test("a link to a page that has no document is not internal", () => {
    const docs = documents({ "index.html": doc("", `<a href="/nowhere.html">n</a>`) });
    expect(docs[0].analysis.linksOut).toEqual([]);
  });

  test("a fragment-only link to an id on this page becomes a fragmentLinks entry, not a linksOut entry", () => {
    const d = only(doc("", `<h2 id="team">Team</h2><a href="#team">jump</a>`));
    expect(d.analysis.linksOut).toEqual([]);
    expect(d.analysis.fragmentLinks).toEqual([{ target: "index.html", id: "team" }]);
  });
});

// --------------------------------------------------------------- §20.11

describe("§20.11 the resolved refresh target (MAN-12)", () => {
  test("no refresh meta is null", () => {
    expect(only(doc()).analysis.refresh).toBeNull();
  });

  test("a bare interval (no second part) targets the page itself", () => {
    const d = only(doc(`<meta http-equiv="refresh" content="5">`));
    expect(d.analysis.refresh).toEqual({ raw: "5", seconds: 5, url: null, target: "index.html" });
  });

  test("a second part naming a page WITH a document resolves to it", () => {
    const docs = documents({
      "index.html": doc(`<meta http-equiv="refresh" content="0; url=/about.html">`),
      "about.html": doc(),
    });
    const home = docs.find((d) => d.outputPath === "index.html");
    expect(home.analysis.refresh.target).toBe("about.html");
  });

  test("a second part naming a page with NO document resolves to null, not a guess", () => {
    const d = only(doc(`<meta http-equiv="refresh" content="0; url=/nowhere.html">`));
    expect(d.analysis.refresh.target).toBeNull();
  });

  test("the raw fields ride along unresolved: raw text and the still-encoded url", () => {
    const d = only(doc(`<meta http-equiv="refresh" content="3;url=/a&amp;b.html">`));
    expect(d.analysis.refresh.raw).toBe("3;url=/a&amp;b.html");
    expect(d.analysis.refresh.seconds).toBe(3);
    expect(d.analysis.refresh.url).toBe("/a&amp;b.html"); // still-encoded, per §20.11
  });
});
