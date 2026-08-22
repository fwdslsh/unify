/**
 * Unit tests for src/core/manifest.js — conformance-spec §20, the
 * final-output page manifest (Tier 3; testing-strategy §2 gives these no
 * conformance authority of their own).
 *
 * Why Tier 3 and not a conformance-tier behavior test: §20 describes an
 * *implementation boundary*. At the iteration that introduces it the
 * manifest has no CLI surface at all — product-spec §6.2 forbids exposing it
 * as an author-facing format — so there is nothing for a CLI-spawning test to
 * observe. That is not a licence to under-test it; it is why the MAN rows sat in
 * `tests/conformance/phase-gaps/baseline.txt` until each consumer (sitemap,
 * canonical completion, robots consistency, audit) made the corresponding
 * field observable through the real CLI and closed its row. That is now
 * finished: §31.1's `unify audit --format json` publishes `pages` as the whole
 * record, so every MAN rule is covered by a CLI-spawning test in
 * `tests/conformance/manifest-observable.test.js` and the baseline is empty.
 *
 * These Tier-3 tests are kept rather than deleted. They read the extractor
 * directly on emitted-document strings, which reaches cases the published
 * projection cannot pose — and §2's authority order is unchanged: where they
 * and a conformance test disagree, the conformance test wins.
 *
 * Every expectation below is written from §20's text, never from a run.
 * Inputs are emitted-document strings — exactly what §20.2 says the extractor
 * reads — so these tests exercise the real parser on real final bytes.
 */
import { describe, expect, test } from "bun:test";
import { buildManifest, isoDate } from "../../../src/core/manifest.js";
import { parseBaseUrl } from "../../../src/core/urls.js";

/** Wrap a body fragment in the smallest complete emitted document. */
const doc = (head = "", body = "", htmlAttrs = "") =>
  `<!doctype html>\n<html${htmlAttrs ? ` ${htmlAttrs}` : ""}>\n<head>\n<meta charset="utf-8">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

/** Shorthand: build a manifest from `{outputPath: html}` and return records. */
function records(pagesByPath, base = null) {
  const pages = Object.entries(pagesByPath).map(([outputPath, html]) => ({
    sourcePath: outputPath.replace(/\/index\.html$/, ".html"),
    outputPath,
    html,
  }));
  return buildManifest({ pages, base }).records;
}

/** Shorthand: the single record of a one-page manifest. */
const only = (html, base = null) => records({ "index.html": html }, base)[0];

// --------------------------------------------------------------- §20.1

describe("§20.1 membership (MAN-01)", () => {
  test("one record per page handed in, ordered by output path", () => {
    const recs = records({
      "zebra.html": doc(),
      "about.html": doc(),
      "blog/index.html": doc(),
    });
    expect(recs.map((r) => r.outputPath)).toEqual(["about.html", "blog/index.html", "zebra.html"]);
  });

  test("a page with no metadata at all still gets a complete record", () => {
    const r = only(doc());
    expect(r.sourcePath).toBe("index.html");
    expect(r.outputPath).toBe("index.html");
    expect(r.title).toBeNull();
    expect(r.description).toBeNull();
    expect(r.canonical).toBeNull();
    expect(r.h1).toBeNull();
    expect(r.headings).toEqual([]);
    expect(r.linksOut).toEqual([]);
    expect(r.linksIn).toEqual([]);
    expect(r.conflicts).toEqual([]);
  });

  test("a duplicated output path keeps the FIRST record, not the last", () => {
    // Only reachable on a build P12 already blocks, but "which record" must be
    // a function of the input rather than of iteration order.
    const { records: recs, byOutputPath } = buildManifest({
      pages: [
        { sourcePath: "a.md", outputPath: "dup.html", html: doc("<title>First</title>") },
        { sourcePath: "a.html", outputPath: "dup.html", html: doc("<title>Second</title>") },
      ],
    });
    expect(recs).toHaveLength(2);
    expect(byOutputPath.size).toBe(1);
    expect(byOutputPath.get("dup.html").title).toBe("First");
  });

  test("byOutputPath indexes every record", () => {
    const { records: recs, byOutputPath } = buildManifest({
      pages: [
        { sourcePath: "a.html", outputPath: "a.html", html: doc() },
        { sourcePath: "b.html", outputPath: "b.html", html: doc() },
      ],
    });
    expect(byOutputPath.size).toBe(2);
    expect(byOutputPath.get("a.html")).toBe(recs[0]);
    expect(byOutputPath.get("b.html")).toBe(recs[1]);
  });

  test("an empty page set yields an empty manifest, not a throw", () => {
    expect(buildManifest({ pages: [] }).records).toEqual([]);
  });
});

// --------------------------------------------------------------- §20.2

describe("§20.2 extraction source (MAN-02)", () => {
  test("layout-supplied metadata is read from each shipping page", () => {
    // Both pages emitted the layout's description; each record carries it.
    const shared = `<meta name="description" content="A shared blurb">`;
    const recs = records({ "a.html": doc(shared), "b.html": doc(shared) });
    expect(recs.map((r) => r.description)).toEqual(["A shared blurb", "A shared blurb"]);
  });

  test("<template> contents declare nothing", () => {
    const r = only(
      doc(
        "<title>Real</title>",
        `<template><h1>Templated</h1><a href="/ghost.html">ghost</a></template><h2>Visible</h2>`,
      ),
    );
    expect(r.title).toBe("Real");
    expect(r.h1).toBeNull();
    expect(r.headings).toEqual([{ level: 2, text: "Visible", id: null }]);
    expect(r.linksOut).toEqual([]);
  });

  test("a <title> inside <template> does not become the page title", () => {
    const r = only(doc("", `<template><title>Shadow</title></template>`));
    expect(r.title).toBeNull();
  });
});

// --------------------------------------------------------------- §20.3

describe("§20.3 fields (MAN-03)", () => {
  test("title, description, lang, author read from the emitted head", () => {
    const r = only(
      doc(
        `<title>Cafe Rio</title>\n<meta name="description" content="Coffee in town">\n<meta name="author" content="R. Diaz">`,
        "",
        `lang="en-GB"`,
      ),
    );
    expect(r.title).toBe("Cafe Rio");
    expect(r.description).toBe("Coffee in town");
    expect(r.author).toBe("R. Diaz");
    expect(r.lang).toBe("en-GB");
  });

  test("empty declarations are null, not empty strings", () => {
    const r = only(doc(`<title>   </title>\n<meta name="description" content="">`, "", `lang=""`));
    expect(r.title).toBeNull();
    expect(r.description).toBeNull();
    expect(r.lang).toBeNull();
  });

  test("text content collapses whitespace runs and trims", () => {
    const r = only(doc("<title>\n  Spaced\t  Out\n</title>"));
    expect(r.title).toBe("Spaced Out");
  });

  test("headings carry level, text, and id (null when unset), in document order", () => {
    const r = only(
      doc(
        "",
        `<h1 id="top">Top</h1><h3>Deep</h3><h2 id="mid">Middle <em>bit</em></h2><h6>Last</h6>`,
      ),
    );
    expect(r.headings).toEqual([
      { level: 1, text: "Top", id: "top" },
      { level: 3, text: "Deep", id: null },
      { level: 2, text: "Middle bit", id: "mid" },
      { level: 6, text: "Last", id: null },
    ]);
    expect(r.h1).toBe("Top");
  });

  test("h1 is the FIRST h1, and a later one does not replace it", () => {
    const r = only(doc("", "<h1>First</h1><h1>Second</h1>"));
    expect(r.h1).toBe("First");
  });

  test("script, style, template, and noscript subtrees contribute no text", () => {
    const r = only(
      doc(
        "",
        `<p>Kept</p><script>var hidden = "no";</script><style>.x{content:"no"}</style>` +
          `<template><p>no</p></template><noscript>no</noscript><p>Also kept</p>`,
      ),
    );
    expect(r.text).toBe("Kept Also kept");
  });

  test("comments contribute nothing to text", () => {
    const r = only(doc("", `<p>Before</p><!-- a note --><p>After</p>`));
    expect(r.text).toBe("Before After");
  });

  test("image reads og:image with integer dimensions", () => {
    const r = only(
      doc(
        `<meta property="og:image" content="/card.png">\n` +
          `<meta property="og:image:width" content="1200">\n` +
          `<meta property="og:image:height" content="630">`,
      ),
    );
    expect(r.image).toEqual({ url: "/card.png", fromOg: true, width: 1200, height: 630 });
  });

  test("image falls back to twitter:image and null dimensions", () => {
    const r = only(doc(`<meta name="twitter:image" content="/t.png">`));
    expect(r.image).toEqual({ url: "/t.png", fromOg: false, width: null, height: null });
  });

  test("og:image wins over twitter:image regardless of document order", () => {
    const r = only(
      doc(`<meta name="twitter:image" content="/t.png">\n<meta property="og:image" content="/og.png">`),
    );
    expect(r.image.url).toBe("/og.png");
  });

  test("non-integer image dimensions are null, never coerced", () => {
    const r = only(
      doc(
        `<meta property="og:image" content="/card.png">\n` +
          `<meta property="og:image:width" content="1200px">\n` +
          `<meta property="og:image:height" content="six hundred">`,
      ),
    );
    expect(r.image).toEqual({ url: "/card.png", fromOg: true, width: null, height: null });
  });

  test("dimensions attach only when og:image supplied the url", () => {
    const r = only(
      doc(
        `<meta name="twitter:image" content="/tw.png">\n` +
          `<meta property="og:image:width" content="1200">\n` +
          `<meta property="og:image:height" content="630">`,
      ),
    );
    expect(r.image).toEqual({ url: "/tw.png", fromOg: false, width: null, height: null });
  });

  test("an absurd dimension is null, not a float", () => {
    const r = only(
      doc(`<meta property="og:image" content="/c.png">\n<meta property="og:image:width" content="99999999999999999999">`),
    );
    expect(r.image).toEqual({ url: "/c.png", fromOg: true, width: null, height: null });
  });

  test("an empty first h1 is null, like an empty title", () => {
    const r = only(doc("", "<h1></h1><h1>Real</h1>"));
    expect(r.h1).toBeNull();
    expect(r.headings[0]).toEqual({ level: 1, text: "", id: null });
  });

  test("no image declaration is null, never the first <img>", () => {
    const r = only(doc("", `<img src="/photo.jpg" alt="a photo">`));
    expect(r.image).toBeNull();
  });

  test("dates read from OpenGraph article properties, raw preserved with iso", () => {
    const r = only(
      doc(
        `<meta property="article:published_time" content="2026-01-02">\n` +
          `<meta property="article:modified_time" content="2026-03-04T05:06:07Z">`,
      ),
    );
    expect(r.datePublished).toEqual({ raw: "2026-01-02", iso: "2026-01-02" });
    expect(r.dateModified).toEqual({ raw: "2026-03-04T05:06:07Z", iso: "2026-03-04T05:06:07Z" });
  });

  test("dates read from the Markdown frontmatter passthrough metas", () => {
    const r = only(
      doc(`<meta name="date" content="2026-01-02">\n<meta name="lastmod" content="2026-02-03">`),
    );
    expect(r.datePublished).toEqual({ raw: "2026-01-02", iso: "2026-01-02" });
    expect(r.dateModified).toEqual({ raw: "2026-02-03", iso: "2026-02-03" });
  });

  test("a malformed date keeps its raw text and reports iso null — never guessed", () => {
    const r = only(doc(`<meta name="date" content="last Tuesday">`));
    expect(r.datePublished).toEqual({ raw: "last Tuesday", iso: null });
  });

  test("no date declaration is null — never the build clock or a filename", () => {
    const recs = records({ "2026-01-01-post.html": doc() });
    expect(recs[0].datePublished).toBeNull();
    expect(recs[0].dateModified).toBeNull();
  });
});

describe("§20.3 character references (MAN-03)", () => {
  test("the five predefined references resolve in element text and attributes", () => {
    const r = only(
      doc(
        `<title>Tea &amp; Coffee</title>\n<meta name="description" content="Beans, brews &amp; more">\n` +
          `<meta name="author" content="O&apos;Brien">`,
        `<h1>C++ &amp; Rust!</h1><p>We serve &quot;single-origin&quot; beans &lt;3 &mdash; 5 &lt; 6.</p>`,
      ),
    );
    expect(r.title).toBe("Tea & Coffee");
    expect(r.description).toBe("Beans, brews & more");
    expect(r.author).toBe("O'Brien");
    expect(r.h1).toBe("C++ & Rust!");
    expect(r.headings).toEqual([{ level: 1, text: "C++ & Rust!", id: null }]);
    expect(r.text).toBe('C++ & Rust! We serve "single-origin" beans <3 — 5 < 6.');
  });

  test("numeric references resolve in both spellings", () => {
    const r = only(doc("<title>A &#8212; B &#x2014; C</title>"));
    expect(r.title).toBe("A — B — C");
  });

  test("HTML 4.01 named references resolve", () => {
    const r = only(doc("<title>caf&eacute; &laquo;menu&raquo;</title>", "<p>&plusmn;1 &deg;C &mdash; 50&percnt;</p>"));
    expect(r.title).toBe("café «menu»");
    // &percnt; is outside HTML 4.01's sets, so it stays as written.
    expect(r.text).toBe("±1 °C — 50&percnt;");
  });

  test("a decoded nbsp survives collapse — §20.3 collapses ASCII whitespace, not every space-like character", () => {
    // U+00A0 is a character the author chose (it forbids a line break), so
    // rewriting it to U+0020 would be an edit to their content.
    const r = only(doc("", "<p>10&nbsp;kg</p>"));
    expect(r.text).toBe("10\u00a0kg");
    expect(r.text).not.toBe("10 kg");
  });

  test("an unknown or malformed reference is left exactly as written", () => {
    const r = only(doc("<title>AT&T &notareal; &amp &#xZZ;</title>"));
    expect(r.title).toBe("AT&T &notareal; &amp &#xZZ;");
  });

  test("a reference naming an impossible codepoint is left as written", () => {
    const r = only(doc("<title>&#xD800; &#0; &#1114112;</title>"));
    expect(r.title).toBe("&#xD800; &#0; &#1114112;");
  });

  test("every text field decodes exactly once — the whole class, not one field", () => {
    // Two fields reading the same characters must produce the same string. An
    // already-decoded value routed back through the attribute reader decodes
    // twice and reports text the page does not contain; asserting field-to-
    // field agreement catches that wherever it appears, not just where it was
    // found.
    const r = only(doc("<title>&amp;amp;</title>", "<h1>&amp;amp;</h1>"));
    expect(r.headings[0].text).toBe("&amp;");
    expect(r.h1).toBe(r.headings[0].text);
    expect(r.title).toBe("&amp;");
    expect(r.text).toBe("&amp;");
  });

  test("h1 equals headings[0].text when the heading carries inline markup", () => {
    const r = only(doc("", "<h1>Write <code>&amp;amp;</code> for an ampersand</h1>"));
    expect(r.h1).toBe("Write &amp; for an ampersand");
    expect(r.h1).toBe(r.headings[0].text);
  });

  test("references resolve BEFORE whitespace collapses, in every field alike", () => {
    // Collapsing first leaves whitespace a reference introduced uncollapsed,
    // so title and text disagree about the same characters.
    const spaces = only(doc("<title>a&#32;&#32;b</title>", "<p>a&#32;&#32;b</p>"));
    expect(spaces.title).toBe("a b");
    expect(spaces.text).toBe("a b");
    const newline = only(doc("<title>a&#10;b</title>", "<p>a&#10;b</p>"));
    expect(newline.title).toBe("a b");
    expect(newline.text).toBe("a b");
    const tab = only(doc("<title>a&#9;b</title>"));
    expect(tab.title).toBe("a b");
  });

  test("named references are case-sensitive, as HTML defines them", () => {
    const r = only(doc("<title>&amp; vs &AMP; vs &LT;</title>"));
    expect(r.title).toBe("& vs &AMP; vs &LT;");
  });

  test("decoding happens once — an encoded ampersand does not decode twice", () => {
    // The page literally shows "&amp;" to a reader; it wrote &amp;amp; to do so.
    const r = only(doc("<title>&amp;amp;</title>"));
    expect(r.title).toBe("&amp;");
  });
});

describe("§20.3 element-boundary separators (MAN-03)", () => {
  test("a parent's own text is separated from a block child", () => {
    const r = only(doc("", "<div>Intro<p>Para</p></div>"));
    expect(r.text).toBe("Intro Para");
  });

  test("an inline element separates nothing", () => {
    const r = only(doc("", "<p>Hello <em>world</em>!</p>"));
    expect(r.text).toBe("Hello world!");
  });

  test("every element in the closed inline list separates nothing", () => {
    const r = only(doc("", "<p>a<b>b</b><span>c</span><code>d</code><strong>e</strong><i>f</i>g</p>"));
    expect(r.text).toBe("abcdefg");
  });

  test("br separates, because it separates lines and therefore words", () => {
    const r = only(doc("", "<p>Line one<br>Line two</p>"));
    expect(r.text).toBe("Line one Line two");
  });

  test("a non-inline element not in the list separates", () => {
    const r = only(doc("", "<ul><li>One</li><li>Two</li></ul>"));
    expect(r.text).toBe("One Two");
  });
});

// --------------------------------------------------------------- §20.4

describe("§20.4 determinism and conflicts (MAN-04)", () => {
  test("first accepted declaration in document order wins", () => {
    const r = only(doc(`<title>First</title>\n<title>Second</title>`));
    expect(r.title).toBe("First");
  });

  test("differing repeats append one conflict entry naming kept and discarded", () => {
    const r = only(doc(`<title>First</title>\n<title>Second</title>\n<title>Third</title>`));
    expect(r.conflicts).toEqual([
      { field: "title", kept: "First", discarded: ["Second", "Third"] },
    ]);
  });

  test("identical repeats lose nothing and are not conflicts", () => {
    const r = only(doc(`<title>Same</title>\n<title>Same</title>`));
    expect(r.title).toBe("Same");
    expect(r.conflicts).toEqual([]);
  });

  test("conflicts are ordered by field name", () => {
    const r = only(
      doc(
        `<title>T1</title>\n<title>T2</title>\n` +
          `<meta name="description" content="D1">\n<meta name="description" content="D2">\n` +
          `<link rel="canonical" href="/a">\n<link rel="canonical" href="/b">`,
      ),
    );
    expect(r.conflicts.map((c) => c.field)).toEqual(["canonical", "description", "title"]);
    expect(r.canonical).toBe("/a");
    expect(r.description).toBe("D1");
  });

  test("a conflict on one page does not leak onto another", () => {
    const recs = records({
      "a.html": doc(`<title>A1</title><title>A2</title>`),
      "b.html": doc(`<title>B</title>`),
    });
    expect(recs[0].conflicts).toHaveLength(1);
    expect(recs[1].conflicts).toEqual([]);
  });

  test("multi-valued fields never produce conflicts", () => {
    const r = only(
      doc(
        `<script type="application/ld+json">{"@type":"WebPage"}</script>\n` +
          `<script type="application/ld+json">{"@type":"Article"}</script>`,
        `<h1>One</h1><h1>Two</h1><a href="/a.html">x</a><a href="/a.html">y</a>`,
      ),
    );
    expect(r.conflicts.map((c) => c.field)).not.toContain("headings");
    expect(r.conflicts.map((c) => c.field)).not.toContain("jsonLd");
    expect(r.conflicts.map((c) => c.field)).not.toContain("linksOut");
  });

  test("a differing dateModified conflict names the raw values", () => {
    const r = only(
      doc(`<meta property="article:modified_time" content="2026-01-01">\n<meta name="lastmod" content="2026-02-02">`),
    );
    expect(r.dateModified.raw).toBe("2026-01-01");
    expect(r.conflicts).toEqual([
      { field: "dateModified", kept: "2026-01-01", discarded: ["2026-02-02"] },
    ]);
  });
});

// --------------------------------------------------------------- §20.5

describe("§20.5 public URLs (MAN-05)", () => {
  test("path drops a trailing index.html segment", () => {
    const recs = records({
      "index.html": doc(),
      "about.html": doc(),
      "blog/index.html": doc(),
      "blog/post.html": doc(),
    });
    const byPath = Object.fromEntries(recs.map((r) => [r.outputPath, r.path]));
    expect(byPath).toEqual({
      "index.html": "/",
      "about.html": "/about.html",
      "blog/index.html": "/blog/",
      "blog/post.html": "/blog/post.html",
    });
  });

  test("url is null without --base-url", () => {
    expect(only(doc()).url).toBeNull();
  });

  test("--base-url supplies the path prefix and the absolute url", () => {
    const base = parseBaseUrl("https://example.com/repo/");
    const recs = records({ "index.html": doc(), "about/index.html": doc() }, base);
    const byPath = Object.fromEntries(recs.map((r) => [r.outputPath, [r.path, r.url]]));
    expect(byPath).toEqual({
      "index.html": ["/repo/", "https://example.com/repo/"],
      "about/index.html": ["/repo/about/", "https://example.com/repo/about/"],
    });
  });

  test("a root-hosted --base-url still yields absolute urls", () => {
    const base = parseBaseUrl("https://example.com/");
    const r = records({ "about.html": doc() }, base)[0];
    expect(r.path).toBe("/about.html");
    expect(r.url).toBe("https://example.com/about.html");
  });
});

// --------------------------------------------------------------- §20.6

describe("§20.6 robots directives (MAN-06)", () => {
  test("no robots meta is indexable and followable with a null raw", () => {
    const r = only(doc());
    expect(r.robots).toEqual({ raw: null, directives: [], indexable: true, followable: true });
  });

  test("directives are comma-split, trimmed, and lowercased", () => {
    const r = only(doc(`<meta name="robots" content=" NoIndex , Follow ">`));
    expect(r.robots.raw).toBe("NoIndex , Follow");
    expect(r.robots.directives).toEqual(["noindex", "follow"]);
    expect(r.robots.indexable).toBe(false);
    expect(r.robots.followable).toBe(true);
  });

  test("none turns off both index and follow", () => {
    const r = only(doc(`<meta name="robots" content="none">`));
    expect(r.robots.indexable).toBe(false);
    expect(r.robots.followable).toBe(false);
  });

  test("nofollow alone leaves the page indexable", () => {
    const r = only(doc(`<meta name="robots" content="nofollow">`));
    expect(r.robots.indexable).toBe(true);
    expect(r.robots.followable).toBe(false);
  });

  test("unknown directives are preserved and change nothing", () => {
    const r = only(doc(`<meta name="robots" content="max-snippet:-1, index">`));
    expect(r.robots.directives).toEqual(["max-snippet:-1", "index"]);
    expect(r.robots.indexable).toBe(true);
    expect(r.robots.followable).toBe(true);
  });

  test("a crawler-specific meta is never read as page robots policy", () => {
    const r = only(doc(`<meta name="googlebot" content="noindex">`));
    expect(r.robots.raw).toBeNull();
    expect(r.robots.indexable).toBe(true);
  });
});

// --------------------------------------------------------------- §20.7

describe("§20.7 visible main text (MAN-07)", () => {
  test("the first <main> wins over <body>", () => {
    const r = only(doc("", `<header>Chrome</header><main>Content</main><footer>Foot</footer>`));
    expect(r.text).toBe("Content");
  });

  test("with no <main>, <body> supplies the text", () => {
    const r = only(doc("", `<header>Chrome</header><p>Content</p>`));
    expect(r.text).toBe("Chrome Content");
  });

  test("a second <main> does not contribute", () => {
    const r = only(doc("", `<main>One</main><main>Two</main>`));
    expect(r.text).toBe("One");
  });

  test("head text never leaks into the page text", () => {
    const r = only(doc("<title>Titular</title>", "<p>Body</p>"));
    expect(r.text).toBe("Body");
  });

  test("a document with neither main nor body falls back to the whole document", () => {
    const { records: recs } = buildManifest({
      pages: [{ sourcePath: "f.html", outputPath: "f.html", html: `<p>Bare fragment text</p>` }],
    });
    expect(recs[0].text).toBe("Bare fragment text");
  });
});

// --------------------------------------------------------------- §20.8

describe("§20.8 structured data (MAN-08)", () => {
  test("one jsonLd entry per ld+json script, in document order", () => {
    const r = only(
      doc(
        `<script type="application/ld+json">{"@type":"WebPage"}</script>\n` +
          `<script type="application/ld+json">{"@type":"Article"}</script>`,
      ),
    );
    expect(r.jsonLd).toHaveLength(2);
    expect(r.jsonLd[0].data).toEqual({ "@type": "WebPage" });
    expect(r.jsonLd[1].data).toEqual({ "@type": "Article" });
    expect(r.jsonLd.every((e) => e.error === null)).toBe(true);
  });

  test("invalid JSON records an error and a null data instead of throwing", () => {
    const r = only(doc(`<script type="application/ld+json">{ nope }</script>`));
    expect(r.jsonLd).toHaveLength(1);
    expect(r.jsonLd[0].data).toBeNull();
    expect(typeof r.jsonLd[0].error).toBe("string");
    expect(r.jsonLd[0].raw).toBe("{ nope }");
    expect(r.schemaType).toBeNull();
  });

  test("a plain <script> is not a JSON-LD block", () => {
    const r = only(doc(`<script>{"@type":"Article"}</script>`));
    expect(r.jsonLd).toEqual([]);
  });

  test("schemaType reads a single object's string @type", () => {
    expect(only(doc(`<script type="application/ld+json">{"@type":"BlogPosting"}</script>`)).schemaType)
      .toBe("BlogPosting");
  });

  test("schemaType reads <meta name=\"schema\">", () => {
    expect(only(doc(`<meta name="schema" content="Article">`)).schemaType).toBe("Article");
  });

  test("an array, a @graph, a missing @type, and a non-string @type declare nothing", () => {
    const cases = [
      `[{"@type":"Article"}]`,
      `{"@graph":[{"@type":"Article"}]}`,
      `{"name":"No type here"}`,
      `{"@type":["Article","BlogPosting"]}`,
    ];
    for (const body of cases) {
      expect(only(doc(`<script type="application/ld+json">${body}</script>`)).schemaType).toBeNull();
    }
  });

  test("first accepted declaration in document order wins across both spellings", () => {
    const r = only(
      doc(`<meta name="schema" content="WebPage">\n<script type="application/ld+json">{"@type":"Article"}</script>`),
    );
    expect(r.schemaType).toBe("WebPage");
    expect(r.conflicts).toEqual([
      { field: "schemaType", kept: "WebPage", discarded: ["Article"] },
    ]);
  });
});

// --------------------------------------------------------------- §20.9

describe("§20.9 the internal link graph (MAN-09)", () => {
  test("linksOut names output paths of linked pages, deduplicated and sorted", () => {
    const recs = records({
      "index.html": doc("", `<a href="/zebra.html">z</a><a href="about.html">a</a><a href="/zebra.html">z again</a>`),
      "about.html": doc(),
      "zebra.html": doc(),
    });
    const home = recs.find((r) => r.outputPath === "index.html");
    expect(home.linksOut).toEqual(["about.html", "zebra.html"]);
  });

  test("linksIn is the exact reverse relation", () => {
    const recs = records({
      "index.html": doc("", `<a href="/about.html">a</a>`),
      "about.html": doc("", `<a href="/index.html">home</a>`),
      "orphan.html": doc(),
    });
    const by = Object.fromEntries(recs.map((r) => [r.outputPath, r]));
    expect(by["about.html"].linksIn).toEqual(["index.html"]);
    expect(by["index.html"].linksIn).toEqual(["about.html"]);
    expect(by["orphan.html"].linksIn).toEqual([]);
  });

  test("a directory URL resolves to its index.html", () => {
    const recs = records({
      "index.html": doc("", `<a href="/blog/">blog</a>`),
      "blog/index.html": doc(),
    });
    expect(recs.find((r) => r.outputPath === "index.html").linksOut).toEqual(["blog/index.html"]);
  });

  test("query and fragment are discarded before matching", () => {
    const recs = records({
      "index.html": doc("", `<a href="/about.html?x=1#team">a</a>`),
      "about.html": doc(),
    });
    expect(recs.find((r) => r.outputPath === "index.html").linksOut).toEqual(["about.html"]);
  });

  test("external, mailto, tel, data, and fragment-only links never participate", () => {
    const r = only(
      doc(
        "",
        `<a href="https://example.org/">ext</a><a href="mailto:a@b.c">mail</a>` +
          `<a href="tel:+1">tel</a><a href="data:text/plain,x">data</a><a href="#top">frag</a>`,
      ),
    );
    expect(r.linksOut).toEqual([]);
  });

  test("a link to a non-page asset never participates", () => {
    const recs = records({ "index.html": doc("", `<a href="/report.pdf">pdf</a>`) });
    expect(recs[0].linksOut).toEqual([]);
  });

  test("a self-link records the page itself", () => {
    const recs = records({ "index.html": doc("", `<a href="/index.html">home</a>`) });
    expect(recs[0].linksOut).toEqual(["index.html"]);
    expect(recs[0].linksIn).toEqual(["index.html"]);
  });

  test("base-url-absolutized hrefs still resolve internally", () => {
    const base = parseBaseUrl("https://example.com/repo/");
    const recs = records(
      {
        "index.html": doc("", `<a href="https://example.com/repo/about.html">a</a>`),
        "about.html": doc(),
      },
      base,
    );
    expect(recs.find((r) => r.outputPath === "index.html").linksOut).toEqual(["about.html"]);
  });

  test("links inside <template> do not participate", () => {
    const recs = records({
      "index.html": doc("", `<template><a href="/about.html">a</a></template>`),
      "about.html": doc(),
    });
    expect(recs.find((r) => r.outputPath === "index.html").linksOut).toEqual([]);
  });

  test("a link to a page that has no record is not internal", () => {
    const recs = records({ "index.html": doc("", `<a href="/nowhere.html">n</a>`) });
    expect(recs[0].linksOut).toEqual([]);
  });
});

// --------------------------------------------------------------- helper

describe("isoDate", () => {
  test("accepts the W3C date and date-time forms product-spec §6.3.6 requires", () => {
    expect(isoDate("2026-01-02")).toBe("2026-01-02");
    expect(isoDate("2026-01-02T03:04:05Z")).toBe("2026-01-02T03:04:05Z");
    expect(isoDate("2026-01-02T03:04:05+02:00")).toBe("2026-01-02T03:04:05+02:00");
    expect(isoDate("2026-01-02T03:04:05.678Z")).toBe("2026-01-02T03:04:05.678Z");
    expect(isoDate("  2026-01-02  ")).toBe("2026-01-02");
  });

  test("rejects prose, partial dates, and impossible calendar values", () => {
    for (const bad of ["last Tuesday", "2026", "2026-01", "01/02/2026", "2026-13-01", "2026-02-30", ""]) {
      expect(isoDate(bad)).toBeNull();
    }
  });

  test("rejects a non-string", () => {
    expect(isoDate(null)).toBeNull();
    expect(isoDate(undefined)).toBeNull();
  });

  test("requires the literal T — a space separator is not W3C-DTF", () => {
    expect(isoDate("2026-01-02 03:04:05Z")).toBeNull();
    expect(isoDate("2026-01-02 03:04:05")).toBeNull();
  });

  test("requires a time-zone designator whenever a time is present", () => {
    expect(isoDate("2026-01-02T03:04")).toBeNull();
    expect(isoDate("2026-01-02T03:04:05")).toBeNull();
    expect(isoDate("2026-01-02T03:04Z")).toBe("2026-01-02T03:04Z");
  });

  test("rejects an impossible time of day", () => {
    expect(isoDate("2026-01-02T24:00:00Z")).toBeNull();
    expect(isoDate("2026-01-02T23:60:00Z")).toBeNull();
    expect(isoDate("2026-01-02T23:59:60Z")).toBeNull();
    expect(isoDate("2026-01-02T23:59:59Z")).toBe("2026-01-02T23:59:59Z");
  });

  test("rejects an offset that does not exist, and accepts the outer bound", () => {
    expect(isoDate("2026-01-02T03:04:05+99:99")).toBeNull();
    expect(isoDate("2026-01-02T03:04:05+15:00")).toBeNull();
    expect(isoDate("2026-01-02T03:04:05+14:30")).toBeNull();
    expect(isoDate("2026-01-02T03:04:05+14:00")).toBe("2026-01-02T03:04:05+14:00");
    expect(isoDate("2026-01-02T03:04:05-12:00")).toBe("2026-01-02T03:04:05-12:00");
  });

  test("accepts a real leap day and rejects a false one", () => {
    expect(isoDate("2024-02-29")).toBe("2024-02-29");
    expect(isoDate("2025-02-29")).toBeNull();
    expect(isoDate("2100-02-29")).toBeNull();
  });

  test("returns the value verbatim rather than normalizing it", () => {
    expect(isoDate("2026-01-02T03:04:05+00:00")).toBe("2026-01-02T03:04:05+00:00");
    expect(isoDate("2026-01-02T03:04:05.6Z")).toBe("2026-01-02T03:04:05.6Z");
  });
});
