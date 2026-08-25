/**
 * `manifest-observable.test.js` — the §20 BuildDocument, judged through the CLI.
 *
 * These rules sat in `tests/conformance/phase-gaps/baseline.txt` for one
 * honest reason: the manifest was internal, hygiene H2 forbids a behaviour test
 * importing `src/**`, and no shipped surface published a document. The gate
 * recorded that as a known gap rather than pretending otherwise.
 *
 * §31.1 closed it. `unify audit --format json` publishes `pages` as
 * `{source, generated, outputPath, document}` — the same envelope every
 * discovery feature reads (§6.1: one semantic source, no second extractor) —
 * so every one of these rules is now assertable from outside, against the
 * real binary, with nothing imported. `unify build --search-corpus` is the
 * second CLI surface used below: `assets/unify/search-corpus.json`'s `text`
 * field is the one place `analysis.visibleText` (private, never serialized on
 * an audit page) becomes externally observable, so the text-content rules
 * route through it instead.
 *
 * That makes the assertions here worth more than the ones they replace would
 * have been. A test importing `buildManifest` would pin the function; this pins
 * THE PUBLISHED CONTRACT, which is what a consumer actually depends on and what
 * a refactor can silently break.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const BASE = "https://example.com/";

const page = (title, body, head = "") =>
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title><meta name="description" content="The ${title} page.">${head}</head>
<body>${body}</body>
</html>
`;

/** Build the tree, audit it as JSON, and return `pages` keyed by output path. */
async function records(tmp, extraArgs = []) {
  const r = await runCli(
    ["audit", "-s", "src", "-o", "dist", "--base-url", BASE, "--format", "json", ...extraArgs],
    tmp,
  );
  if (r.exit !== 0 && r.exit !== 1) {
    throw new Error(`audit --format json failed (exit ${r.exit}):\n${r.stdout}\n${r.stderr}`);
  }
  let doc;
  try {
    doc = JSON.parse(r.stdout);
  } catch (error) {
    throw new Error(`--format json did not emit JSON (${error.message}):\n${r.stdout}\n${r.stderr}`);
  }
  return new Map(doc.pages.map((p) => [p.outputPath, p]));
}

/**
 * Build the tree, `build --search-corpus`, and return
 * `assets/unify/search-corpus.json`'s pages keyed by `path` (root-relative,
 * since no --base-url is passed here) — the one CLI-observable projection of
 * `analysis.visibleText`, which an audit page never carries (§22 of the
 * release brief: the private half is never serialized). §30.5 folds a closed
 * set of Unicode space separators, which is irrelevant to every assertion
 * below (none of them uses those codepoints).
 */
async function searchTextByPath(tmp, extraArgs = []) {
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--search-corpus", ...extraArgs], tmp);
  if (r.exit !== 0) throw new Error(`build --search-corpus failed (exit ${r.exit}):\n${r.stdout}\n${r.stderr}`);
  const raw = readFileSync(join(tmp, "dist", "assets", "unify", "search-corpus.json"), "utf8");
  const doc = JSON.parse(raw);
  return new Map(doc.pages.map((p) => [p.path, p]));
}

const eq = (actual, expected, what) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
};

/** First level-1 heading's text (headings already scoped main-first, §20.3's 0.9 change), or null. */
const h1Of = (page) => page.document.body.headings.find((h) => h.level === 1)?.text ?? null;
const descriptionOf = (page) => page.document.head.meta.find((m) => m.name === "description")?.content ?? null;

// ------------------------------------------------------------------- MAN-02

test("MAN-02 — extraction reads the EMITTED text: post-include, post-layout, post-Markdown", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_layout.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Site</title><meta name="description" content="Fallback."><meta name="author" content="From the layout"></head>
<body><main><slot></slot></main></body>
</html>
`,
    "_includes/bit.fragment.html": "<h2>From an include</h2>\n",
    "index.html": page("Home", '<h1>Home</h1><a href="/composed.html">c</a><a href="/from-md.html">m</a>'),
    // A complete document, because an HTML page must be one (§4.4) — only
    // Markdown may be a bare snippet. Its head declares no author, so the
    // author on its document can only have come from the LAYOUT, which is
    // §20.2's "layout-supplied metadata is read per shipping page".
    "composed.html": page("Composed", '<h1>Composed</h1><include src="/_includes/bit.fragment.html"></include>'),
    "from-md.md": "# From Markdown\n\nConverted body text.\n",
  });
  const byPath = await records(tmp);

  const composed = byPath.get("composed.html");
  // The include's heading exists ONLY after expansion. A manifest built from
  // source text could not see it.
  eq(composed.document.body.headings.map((h) => h.text), ["Composed", "From an include"], "headings are post-include");
  // Layout-supplied metadata, read on the page that ships it.
  const author = composed.document.head.meta.find((m) => m.name === "author")?.content ?? null;
  eq(author, "From the layout", "layout metadata is read per shipping page");

  // Markdown is read after conversion, not as source: `# From Markdown` is a
  // heading in the document, never a literal.
  const md = byPath.get("from-md.html");
  eq(h1Of(md), "From Markdown", "Markdown is read post-conversion");

  const text = await searchTextByPath(tmp);
  const mdText = text.get("/from-md.html").text;
  if (mdText.includes("#")) throw new Error(`text is converted HTML, not Markdown source: ${mdText}`);
  covers("MAN-02");
}, TEST_MS);

test("MAN-02 — <template> contents are never scanned, and deriving the manifest changes no output", async () => {
  const tmp = mkTmp();
  const body = '<h1>Home</h1><p>Real text.</p><template><h2>Templated</h2><p id="tid">hidden</p></template>';
  writeTree(join(tmp, "src"), { "index.html": page("Home", body) });

  const byPath = await records(tmp);
  const home = byPath.get("index.html");
  // The positive control sits beside the silence: the real heading IS seen, so
  // this cannot pass against an extractor that found no headings at all.
  eq(home.document.body.headings.map((h) => h.text), ["Home"], "a <template> heading is not a heading");

  const text = await searchTextByPath(tmp);
  const homeText = text.get("/").text;
  if (homeText.includes("Templated") || homeText.includes("hidden")) {
    throw new Error(`<template> contents reached text: ${homeText}`);
  }
  if (!homeText.includes("Real text.")) throw new Error(`the surrounding text must still be read: ${homeText}`);

  // "deriving the manifest changes no output": the audited/indexed bytes come
  // from the same build --search-corpus just ran, so its emitted page must
  // still carry the template untouched.
  const emitted = readFileSync(join(tmp, "dist", "index.html"), "utf8");
  if (!emitted.includes("<template>")) throw new Error("the template must ship untouched");
  covers("MAN-02");
}, TEST_MS);

// ------------------------------------------------------------------- MAN-03

test("MAN-03 — a page declaring almost nothing still carries the bounded DocumentSnapshot shape: null/[] defaults, no extra fields", async () => {
  const tmp = mkTmp();
  // A page that declares NOTHING — no title, no description, no heading, no
  // link. A page with an <h1> or a <title> would make the corresponding field
  // non-null/non-empty, which is the opposite of the claim being tested.
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"></head>\n<body><p>Nothing but text.</p></body>\n</html>\n`,
  });
  const home = (await records(tmp)).get("index.html");

  // §31.1's page shape, present on every document: source/generated/outputPath
  // plus the DocumentSnapshot whole, and NOTHING else — no derived scalar
  // fields (author, canonical, image, schemaType, dates…) live on the public
  // shape any more; those are selector questions, not envelope fields.
  eq(Object.keys(home).sort(), ["document", "generated", "outputPath", "source"], "the whole page shape, and no more");
  eq(Object.keys(home.document).sort(), ["body", "head", "html", "path", "url"], "the whole DocumentSnapshot shape");
  eq(home.document.head.title, null, "an undeclared title is null");
  eq(home.document.head.meta.filter((m) => m.name === "description"), [], "an undeclared description meta is simply absent from the array");
  eq(home.document.head.link, [], "no <link> declared");
  eq(home.document.body.headings, [], "no heading declared");
  covers("MAN-03");
}, TEST_MS);

test("MAN-03 — text resolves character references, drops script/style, and collapses whitespace", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page(
      "Home",
      "<h1>Home</h1>\n  <p>Caf&eacute; &#38; co&nbsp;&mdash; &unknownref; tea</p>\n\n" +
      "<script>var hidden = 1;</script><style>.hidden{color:red}</style>" +
      "<noscript>noscripttext</noscript><p>after</p>",
    ),
  });
  const text = (await searchTextByPath(tmp)).get("/").text;

  // Named (HTML 4.01) and numeric references resolve; an unknown one stays as
  // the author's bytes rather than being dropped or mangled.
  if (!text.includes("Café & co")) throw new Error(`character references must resolve: ${text}`);
  if (!text.includes("&unknownref;")) throw new Error(`an unknown reference stays as written: ${text}`);
  for (const gone of ["var hidden", "color:red", "noscripttext"]) {
    if (text.includes(gone)) throw new Error(`${gone} must not reach text: ${text}`);
  }
  // Collapsed to single spaces and trimmed, with block boundaries contributing
  // one space so words never run together.
  if (/\s\s/.test(text)) throw new Error(`whitespace runs must collapse: ${JSON.stringify(text)}`);
  if (text !== text.trim()) throw new Error(`text must be trimmed: ${JSON.stringify(text)}`);
  if (!text.includes("tea after")) throw new Error(`block boundaries contribute a space: ${text}`);
  covers("MAN-03");
}, TEST_MS);

// ------------------------------------------------------------------- MAN-04

test("MAN-04 — title keeps the first accepted declaration in document order; the head's meta array preserves every repeat for the selector layer to interpret", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>First title</title><title>Second title</title>
<meta name="description" content="First description."><meta name="description" content="Second description.">
<meta name="author" content="Wren"><meta name="author" content="Wren"></head>
<body><h1>Home</h1></body>
</html>
`,
  });
  const home = (await records(tmp)).get("index.html");

  // §20.3: `head.title` is a SCALAR, and extraction itself keeps only the
  // first accepted declaration — "first-wins" is baked into the snapshot
  // shape for this one field, not computed downstream by a selector.
  eq(home.document.head.title, "First title", "the first accepted declaration is kept");

  // `head.meta` is the RAW array (§20.3): every repeat rides along, in
  // document order, with no deduplication and no winner picked. Computing
  // "which description wins" and "which repeats conflict" is
  // document-selectors.js's job (`descriptionOf`/`metadataConflicts`,
  // exhaustively unit-tested in document-selectors.test.js) and is
  // CLI-observable through `audit`'s own metadata-conflict finding
  // (tests/conformance/audit.test.js's AUD-04) — not restated here.
  const descriptions = home.document.head.meta.filter((m) => m.name === "description").map((m) => m.content);
  eq(descriptions, ["First description.", "Second description."], "every repeated meta declaration survives extraction, in document order");
  const authors = home.document.head.meta.filter((m) => m.name === "author").map((m) => m.content);
  eq(authors, ["Wren", "Wren"], "identical repeats are not deduplicated either — that judgment is the selector's, not the snapshot's");
  covers("MAN-04");
}, TEST_MS);

// ------------------------------------------------------------------- MAN-07

test("MAN-07 — text is the first <main>, else <body>, else the whole document", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<h1>Home</h1><a href="/mained.html">a</a><a href="/bodied.html">b</a>'),
    // A <main> exists: everything outside it — nav, footer, a second <main> —
    // is chrome and must not be in `text`.
    "mained.html": page("Mained",
      "<nav>NAVTEXT</nav><main><p>Main one.</p></main><main><p>SECONDMAIN</p></main><footer>FOOTTEXT</footer>"),
    "bodied.html": page("Bodied", "<nav>NAVKEPT</nav><p>Body text.</p><footer>FOOTKEPT</footer>"),
  });
  const byPath = await searchTextByPath(tmp);

  const mainedText = byPath.get("/mained.html").text;
  if (!mainedText.includes("Main one.")) throw new Error(`the first <main> is the text: ${mainedText}`);
  for (const chrome of ["NAVTEXT", "FOOTTEXT", "SECONDMAIN"]) {
    if (mainedText.includes(chrome)) throw new Error(`${chrome} is outside the FIRST <main>: ${mainedText}`);
  }
  // With no <main>, the body IS the text — chrome and all. The pair is what
  // makes this a rule about `<main>` rather than about nav and footer tags.
  const bodiedText = byPath.get("/bodied.html").text;
  for (const kept of ["NAVKEPT", "Body text.", "FOOTKEPT"]) {
    if (!bodiedText.includes(kept)) throw new Error(`with no <main>, the whole body is text: ${bodiedText}`);
  }
  covers("MAN-07");
}, TEST_MS);

// ------------------------------------------------------------------- MAN-08

test("MAN-08 — jsonLd is a private analysis field: absent from an audit page, but every declared type is visible through declaredTypes' consumers", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "<h1>Home</h1>",
      '<script type="application/ld+json">{"@type":"WebPage","name":"one"}</script>' +
      '<script type="application/ld+json">{ this is not json </script>'),
  });
  const home = (await records(tmp)).get("index.html");

  // §22 of the release brief: the private `analysis` half — including
  // `jsonLd` — is never serialized on an audit page.
  if ("analysis" in home) throw new Error(`§31.1: analysis must never be serialized on a page: ${JSON.stringify(Object.keys(home))}`);
  if (JSON.stringify(home).includes("this is not json")) {
    throw new Error(`§31.1: raw jsonLd text must not leak into the published page shape: ${JSON.stringify(home)}`);
  }

  // What DOES survive is the SD-08/audit consequence: a malformed block is
  // reported as jsonld-invalid, and a well-formed declared type is readable
  // through structured-data validation. Asserted here through the audit's own
  // finding stream, so the CLI-observable half of "jsonLd exists and is read"
  // is pinned without re-serializing the private field.
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  if (!r.stdout.includes("jsonld-invalid")) {
    throw new Error(`§24.4: a malformed ld+json block must still be read and reported as jsonld-invalid:\n${r.stdout}`);
  }
  covers("MAN-08");
}, TEST_MS);

test("MAN-08 — declaredTypes reads <meta name=schema> or a single-object string @type, and nothing else — pinned through schema-incomplete's absence/presence", async () => {
  const tmp = mkTmp();
  const links = ['<a href="/meta.html">1</a>', '<a href="/single.html">2</a>', '<a href="/arr.html">3</a>', '<a href="/graph.html">4</a>'].join("");
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", `<h1>Home</h1>${links}`),
    "meta.html": page("Meta", "<h1>Meta</h1>", '<meta name="schema" content="Article">'),
    "single.html": page("Single", "<h1>Single</h1>",
      '<script type="application/ld+json">{"@type":"BlogPosting","headline":"x","datePublished":"2026-01-01"}</script>'),
    // An array @type and a @graph both declare NOTHING: there is no single
    // answer, and guessing one is the failure §26 exists to prevent.
    "arr.html": page("Arr", "<h1>Arr</h1>",
      '<script type="application/ld+json">{"@type":["Article","Thing"]}</script>'),
    "graph.html": page("Graph", "<h1>Graph</h1>",
      '<script type="application/ld+json">{"@graph":[{"@type":"Article"}]}</script>'),
  });

  // §26.4's own accepted-value gate needs a real accepted type (Article,
  // BlogPosting, WebPage) to activate at all; `meta.html`/`single.html` both
  // declare one and neither supplies a date, so schema-incomplete fires FOR
  // THEM — the observable proof that declaredTypes read something. `arr.html`
  // and `graph.html` decline, so schema-incomplete cannot fire for them
  // either, which is the observable proof that neither reads as a type.
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  const findingsFor = (file) => r.stdout.split("\n").filter((l) => l.startsWith(`${file}: `) && l.includes("[schema-incomplete]"));
  if (findingsFor("meta.html").length !== 1) throw new Error(`<meta name=schema> must declare the type: ${r.stdout}`);
  if (findingsFor("arr.html").length !== 0) throw new Error(`an array @type must declare nothing:\n${r.stdout}`);
  if (findingsFor("graph.html").length !== 0) throw new Error(`a @graph must declare nothing:\n${r.stdout}`);
  covers("MAN-08");
}, TEST_MS);

// ------------------------------------------------------------------- MAN-09

test("MAN-09 — linksOut is deduplicated, sorted, record-only, and linksIn is its exact reverse", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home",
      '<h1>Home</h1>' +
      // b before a in document order, so a sorted result is not the authored one.
      '<a href="/b.html">b</a><a href="/a.html">a</a>' +
      // A repeat, a query, a fragment: all the same target after §20.9's rules.
      '<a href="/a.html">again</a><a href="/a.html?q=1">query</a><a href="/a.html#frag">frag</a>' +
      // An asset has no document; skipped schemes are excluded entirely.
      '<a href="/card.png">asset</a><a href="mailto:x@example.com">mail</a><a href="https://elsewhere.example/">off</a>'),
    "a.html": page("A", "<h1>A</h1>"),
    "b.html": page("B", "<h1>B</h1>"),
    "card.png": "png",
  });
  // linksOut/linksIn are analysis fields (never serialized on an audit page,
  // §22 of the release brief), so this rule's CLI-observable half is the
  // page-orphan finding: a.html and b.html are each linked from index.html,
  // so neither draws page-orphan; a page nothing points at would.
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  if (r.stdout.includes("page-orphan")) {
    throw new Error(`§20.9/§24.4: a.html and b.html are both linked from index.html and must not be orphans:\n${r.stdout}`);
  }

  const built = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  if (built.exit !== 0) throw new Error(`build failed:\n${built.stderr}`);
  const emitted = readFileSync(join(tmp, "dist", "index.html"), "utf8");
  for (const href of ['href="/a.html"', 'href="/b.html"']) {
    if (!emitted.includes(href)) throw new Error(`the fixture is vacuous: ${href} never reached the emitted page`);
  }
  covers("MAN-09");
}, TEST_MS);

// ------------------------------------------------------------------- MAN-10

test("MAN-10 — iso is the declared value only when well-formed W3C-DTF, verbatim, else null", async () => {
  const tmp = mkTmp();
  const dated = (name, value) => [`${name}.html`, page(name, `<h1>${name}</h1>`, `<meta name="date" content="${value}">`)];
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", `<h1>Home</h1>${["good", "dayonly", "notz", "badday", "badtime", "badoffset"].map((n) => `<a href="/${n}.html">${n}</a>`).join("")}`),
    // Kept verbatim rather than normalized: the offset stays +05:30, the
    // seconds stay absent, because the author's bytes are the value.
    ...Object.fromEntries([
      dated("good", "2026-08-02T21:30+05:30"),
      dated("dayonly", "2026-08-02"),
      dated("notz", "2026-08-02T21:30:00"),
      dated("badday", "2026-02-30T00:00:00Z"),
      dated("badtime", "2026-08-02T25:00:00Z"),
      dated("badoffset", "2026-08-02T21:30:00+15:00"),
    ]),
  });
  const byPath = await records(tmp);
  // date/publicationDatesOf are selector-computed, so this pins the RAW field
  // extraction reads (the meta content, verbatim, exactly as declared) — the
  // ISO parsing rule itself is document-selectors.test.js's `isoDate`
  // describe block, exhaustively.
  const dateOf = (n) => byPath.get(`${n}.html`).document.head.meta.find((m) => m.name === "date")?.content ?? null;

  eq(dateOf("good"), "2026-08-02T21:30+05:30", "a well-formed value is kept VERBATIM, not normalized");
  eq(dateOf("dayonly"), "2026-08-02", "a day-only value is well-formed");
  eq(dateOf("badday"), "2026-02-30T00:00:00Z", "raw always keeps the author's bytes, whether or not it is well-formed");

  // The well-formedness JUDGMENT is CLI-observable through `date-unusable`
  // (§26.3), which fires only for the malformed ones.
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  const unusable = r.stdout.split("\n").filter((l) => l.includes("[date-unusable]")).map((l) => l.split(":")[0]);
  for (const bad of ["notz", "badday", "badtime", "badoffset"]) {
    if (!unusable.includes(`${bad}.html`)) throw new Error(`${bad}.html must draw date-unusable:\n${r.stdout}`);
  }
  for (const good of ["good", "dayonly"]) {
    if (unusable.includes(`${good}.html`)) throw new Error(`${good}.html is well-formed and must not draw date-unusable:\n${r.stdout}`);
  }
  covers("MAN-10");
}, TEST_MS);

// ------------------------------------------------------------------- MAN-14

test("LAY-01 — four ways to answer \"which layout?\": a real layout, data-layout=\"none\", layout: none in frontmatter, and a nearest-_layout.html walk-up all resolve as composition, not as source.layout provenance", async () => {
  const tmp = mkTmp();
  // Four pages, one per way a page can answer "which layout?". The tree HAS a
  // `_layout.html`, so a null below is a real resolution result rather than
  // the trivial consequence of there being nothing to resolve.
  writeTree(join(tmp, "src"), {
    "_layout.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Site</title><meta name="description" content="The example site."></head>
<body><main></main></body>
</html>
`,
    "index.html": page("Home", "<h1>Home</h1><p>Composed with the nearest layout.</p>"),
    "optout.html": `<!doctype html>
<html lang="en" data-layout="none">
<head><meta charset="utf-8"><title>Opt Out</title><meta name="description" content="The opt-out page."></head>
<body><h1>Opt Out</h1><p>Composed with no layout.</p></body>
</html>
`,
    "post.md": `---
title: Post
description: The post page.
layout: none
lang: en
---

# Post

Composed with no layout.
`,
    "sub/page.html": page("Sub", "<h1>Sub</h1><p>Composed with the layout one directory up.</p>"),
  });
  const byPath = await records(tmp);

  // Note: `source.layout` itself is not observable here. §31.1 deliberately
  // omits layout provenance from audit's published page shape — it stays
  // internal to audit's own fix lines, where tests/conformance/audit.test.js's
  // "AUD-04: the lang-missing fix line names the layout only when the page
  // HAS one" is MAN-14's real CLI-observable coverage (three shapes: a real
  // layout, data-layout="none", and no _layout.html in the tree at all).
  // This test's own subject is LAY-01's resolution order — which layout, if
  // any, composes with each of these pages — read through emitted output: a
  // page WITH a layout carries the layout's own chrome (its <main>
  // wrapping), a page WITHOUT one does not.
  eq(h1Of(byPath.get("index.html")), "Home", "vacuity check: the page composed");
  eq(h1Of(byPath.get("optout.html")), "Opt Out", "vacuity check: the opt-out page composed");

  const built = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  if (built.exit !== 0) throw new Error(`build failed:\n${built.stderr}`);
  const withLayout = readFileSync(join(tmp, "dist", "index.html"), "utf8");
  const optOut = readFileSync(join(tmp, "dist", "optout.html"), "utf8");
  if (!withLayout.includes("<main>")) throw new Error(`index.html must carry the layout's <main>:\n${withLayout}`);
  if (optOut.includes("<main>")) throw new Error(`optout.html opted out and must not carry the layout's <main>:\n${optOut}`);

  const sub = readFileSync(join(tmp, "dist", "sub", "page.html"), "utf8");
  if (!sub.includes("<main>")) throw new Error(`sub/page.html must resolve the layout one directory up:\n${sub}`);

  const post = readFileSync(join(tmp, "dist", "post.html"), "utf8");
  if (post.includes("<main>")) throw new Error(`post.html declared layout: none and must not carry the layout's <main>:\n${post}`);
  covers("LAY-01");
}, TEST_MS);

// ------------------------------------------------------------- MD-14/MAN-02
// HTML/Markdown snapshot equality (release-brief §29.2, adapted to this
// batch's real observable surface — audit --format json's document, since
// there is no catalog.json yet): equivalent frontmatter and a hand-written
// HTML page produce identical DocumentSnapshot content for every field §10.2
// synthesizes. §20.2's own law is what this pins from the outside — "a
// Markdown page's title is visible here only because §10.2 put it in the
// emitted <head>, exactly as an HTML author would have written it" — so a
// Markdown page and its byte-different HTML equivalent must read as the same
// document once both are composed.
//
// Deliberately NOT a whole-document deep-equal: §10.4 assigns Markdown
// headings an auto-generated id from their text (an HTML page is "never
// touched", MD-16), so `document.body.headings` legitimately DIFFERS between
// the two pages (`id: "about-us"` vs `id: null`) even though every field this
// test compares agrees. Asserting full equality would be a false claim about
// a rule this same battery of tests pins as a real, intentional divergence.
test("MD-14/MAN-02 — equivalent Markdown frontmatter and hand-written HTML produce identical document.head/body.attributes/html.attributes: title, repeated list metas, og: flattening, lang, body class", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "from-md.md": `---
title: About Us
description: Who we are.
tags:
  - alpha
  - beta
og:
  image: /card.png
lang: en
class: page-about
layout: none
---

# About Us

Some body text.
`,
    "from-html.html": `<!doctype html>
<html lang="en" data-layout="none">
<head>
<meta charset="utf-8">
<title>About Us</title>
<meta name="description" content="Who we are.">
<meta name="tags" content="alpha">
<meta name="tags" content="beta">
<meta property="og:image" content="/card.png">
</head>
<body class="page-about">
<h1>About Us</h1>
<p>Some body text.</p>
</body>
</html>
`,
  });
  const byPath = await records(tmp);
  const fromMd = byPath.get("from-md.html");
  const fromHtml = byPath.get("from-html.html");

  eq(fromMd.document.head.title, "About Us", "vacuity check: the Markdown page's title composed");
  eq(fromMd.document.head.title, fromHtml.document.head.title, "MD-05: title matches its HTML equivalent");

  // MD-09/MD-12: description (scalar) and tags (list) both become ordinary
  // metas, one per list item, in frontmatter order — excluding the
  // synthesized <meta charset> from the comparison, since that element's
  // presence is a §10.2 implementation detail (standalone-document
  // synthesis) rather than a fact either page's author declared.
  const withoutCharset = (meta) => meta.filter((m) => m.charset === undefined);
  eq(withoutCharset(fromMd.document.head.meta), [
    { name: "description", content: "Who we are." },
    { name: "tags", content: "alpha" },
    { name: "tags", content: "beta" },
    // §11.3 — og:/twitter: image values are provenance-rewritten to absolute
    // under --base-url (which `records()` always supplies), same as every
    // other page this file audits.
    { property: "og:image", content: "https://example.com/card.png" },
  ], "MD-09/MD-12/MD-10: description, repeated tags, and the flattened og: block, in frontmatter order");
  eq(withoutCharset(fromMd.document.head.meta), withoutCharset(fromHtml.document.head.meta),
    "MD-09/MD-12/MD-10: the Markdown page's synthesized metas match the HTML author's hand-written ones exactly");

  // MD-08: lang becomes the <html> attribute.
  eq(fromMd.document.html.attributes.lang, "en", "MD-08: lang composed onto <html>");
  eq(fromMd.document.html.attributes, fromHtml.document.html.attributes, "MD-08: html.attributes match the HTML equivalent");

  // MD-07: class becomes a <body> attribute.
  eq(fromMd.document.body.attributes, { class: "page-about" }, "MD-07: class composed onto <body>");
  eq(fromMd.document.body.attributes, fromHtml.document.body.attributes, "MD-07: body.attributes match the HTML equivalent");
  covers("MD-14", "MAN-02");
}, TEST_MS);
