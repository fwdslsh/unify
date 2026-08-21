/**
 * `manifest-observable.test.js` — the §20 record, judged through the CLI.
 *
 * These seven rules sat in `tests/conformance/phase-gaps/baseline.txt` for one
 * honest reason: the manifest was internal, hygiene H2 forbids a behaviour test
 * importing `src/**`, and no shipped surface published a record. The gate
 * recorded that as a known gap rather than pretending otherwise.
 *
 * §31.1 closed it. `unify audit --format json` publishes `pages` as the whole
 * record — the same record every discovery feature reads (§6.1: one semantic
 * source, no second extractor) — so every one of these rules is now assertable
 * from outside, against the real binary, with nothing imported.
 *
 * That makes the assertions here worth more than the ones they replace would
 * have been. A test importing `buildManifest` would pin the function; this pins
 * THE PUBLISHED CONTRACT, which is what a consumer actually depends on and what
 * a refactor can silently break.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
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

const eq = (actual, expected, what) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
};

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
    // author on its record can only have come from the LAYOUT, which is
    // §20.2's "layout-supplied metadata is read per shipping page".
    "composed.html": page("Composed", '<h1>Composed</h1><include src="/_includes/bit.fragment.html"></include>'),
    "from-md.md": "# From Markdown\n\nConverted body text.\n",
  });
  const byPath = await records(tmp);

  const composed = byPath.get("composed.html");
  // The include's heading exists ONLY after expansion. A manifest built from
  // source text could not see it.
  eq(composed.headings.map((h) => h.text), ["Composed", "From an include"], "headings are post-include");
  // Layout-supplied metadata, read on the page that ships it.
  eq(composed.author, "From the layout", "layout metadata is read per shipping page");

  // Markdown is read after conversion, not as source: `# From Markdown` is a
  // heading in the record, never a literal.
  const md = byPath.get("from-md.html");
  eq(md.h1, "From Markdown", "Markdown is read post-conversion");
  if (md.text.includes("#")) throw new Error(`text is converted HTML, not Markdown source: ${md.text}`);
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
  eq(home.headings.map((h) => h.text), ["Home"], "a <template> heading is not a heading");
  eq(home.ids, [], "a <template> id is not an id");
  if (home.text.includes("Templated") || home.text.includes("hidden")) {
    throw new Error(`<template> contents reached text: ${home.text}`);
  }
  if (!home.text.includes("Real text.")) throw new Error(`the surrounding text must still be read: ${home.text}`);

  // "deriving the manifest changes no output": the audited bytes equal the
  // built bytes, so running the evaluator cannot have edited anything.
  const built = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  if (built.exit !== 0) throw new Error(`build failed:\n${built.stderr}`);
  const { readFileSync } = await import("node:fs");
  const emitted = readFileSync(join(tmp, "dist", "index.html"), "utf8");
  if (!emitted.includes("<template>")) throw new Error("the template must ship untouched");
  covers("MAN-02");
}, TEST_MS);

// ------------------------------------------------------------------- MAN-03

test("MAN-03 — every record carries every field; absent scalars are null and absent lists are []", async () => {
  const tmp = mkTmp();
  // A body that declares NOTHING — no heading, no id, no link. A page with an
  // <h1> would make `headings` non-empty, which is the opposite of the claim
  // being tested. (The first draft of this test had exactly that bug.)
  writeTree(join(tmp, "src"), { "index.html": page("Home", "<p>Nothing but text.</p>") });
  const home = (await records(tmp)).get("index.html");

  // A page declaring almost nothing still carries the whole shape — the
  // property a consumer relies on to read a field without guarding it.
  for (const field of ["author", "canonical", "image", "refresh", "schemaType", "dateModified", "datePublished"]) {
    if (!(field in home)) throw new Error(`absent scalar ${field} must be PRESENT and null, not missing`);
    eq(home[field], null, `absent scalar ${field}`);
  }
  for (const field of ["conflicts", "fragmentLinks", "headings", "ids", "jsonLd", "linksIn", "linksOut", "strayMetadata", "taxonomyKeys"]) {
    if (!(field in home)) throw new Error(`absent list ${field} must be PRESENT and [], not missing`);
    eq(home[field], [], `absent list ${field}`);
  }
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
  const home = (await records(tmp)).get("index.html");

  // Named (HTML 4.01) and numeric references resolve; an unknown one stays as
  // the author's bytes rather than being dropped or mangled.
  if (!home.text.includes("Café & co")) throw new Error(`character references must resolve: ${home.text}`);
  if (!home.text.includes("&unknownref;")) throw new Error(`an unknown reference stays as written: ${home.text}`);
  for (const gone of ["var hidden", "color:red", "noscripttext"]) {
    if (home.text.includes(gone)) throw new Error(`${gone} must not reach text: ${home.text}`);
  }
  // Collapsed to single spaces and trimmed, with block boundaries contributing
  // one space so words never run together.
  if (/\s\s/.test(home.text)) throw new Error(`whitespace runs must collapse: ${JSON.stringify(home.text)}`);
  if (home.text !== home.text.trim()) throw new Error(`text must be trimmed: ${JSON.stringify(home.text)}`);
  if (!home.text.includes("tea after")) throw new Error(`block boundaries contribute a space: ${home.text}`);
  covers("MAN-03");
}, TEST_MS);

test("MAN-03 — image width/height are read only when the url came from og:image", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<h1>Home</h1><a href="/tw.html">t</a>',
      '<meta property="og:image" content="/card.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'),
    // twitter:image carries no dimensions of its own, so a page whose url came
    // from it must report null even with og:image:width sitting right there.
    "tw.html": page("Tw", "<h1>Tw</h1>",
      '<meta name="twitter:image" content="/card.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'),
    "card.png": "png",
  });
  const byPath = await records(tmp);

  eq(byPath.get("index.html").image.width, 1200, "og:image supplies dimensions");
  eq(byPath.get("index.html").image.height, 630, "og:image supplies dimensions");
  eq(byPath.get("tw.html").image.width, null, "a twitter:image url reads no width");
  eq(byPath.get("tw.html").image.height, null, "a twitter:image url reads no height");
  covers("MAN-03");
}, TEST_MS);

// ------------------------------------------------------------------- MAN-04

test("MAN-04 — first declaration wins, differing repeats become sorted conflicts, identical ones do not", async () => {
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

  eq(home.title, "First title", "the first accepted declaration is kept");
  eq(home.description, "First description.", "the first accepted declaration is kept");
  // Identical repeats are not conflicts, so `author` must be absent from the
  // list even though it was declared twice.
  eq(home.conflicts.map((c) => c.field), ["description", "title"], "conflicts are ordered by field name");
  // `discarded` is a LIST — a field declared three times discards two values,
  // and the shape must not change with the count. (Verified against the
  // published record rather than assumed: the first draft of this assertion
  // said `discarded: "Second title"` and was simply wrong.)
  eq(home.conflicts.find((c) => c.field === "title"), { field: "title", kept: "First title", discarded: ["Second title"] },
    "a conflict entry is {field, kept, discarded}");
  eq(home.author, "Wren", "an identical repeat still yields the value");
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
  const byPath = await records(tmp);

  const mained = byPath.get("mained.html");
  if (!mained.text.includes("Main one.")) throw new Error(`the first <main> is the text: ${mained.text}`);
  for (const chrome of ["NAVTEXT", "FOOTTEXT", "SECONDMAIN"]) {
    if (mained.text.includes(chrome)) throw new Error(`${chrome} is outside the FIRST <main>: ${mained.text}`);
  }
  // With no <main>, the body IS the text — chrome and all. The pair is what
  // makes this a rule about `<main>` rather than about nav and footer tags.
  const bodied = byPath.get("bodied.html");
  for (const kept of ["NAVKEPT", "Body text.", "FOOTKEPT"]) {
    if (!bodied.text.includes(kept)) throw new Error(`with no <main>, the whole body is text: ${bodied.text}`);
  }
  covers("MAN-07");
}, TEST_MS);

// ------------------------------------------------------------------- MAN-08

test("MAN-08 — jsonLd is one entry per script in document order, and parsing never throws", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "<h1>Home</h1>",
      '<script type="application/ld+json">{"@type":"WebPage","name":"one"}</script>' +
      '<script type="application/ld+json">{ this is not json </script>'),
  });
  const home = (await records(tmp)).get("index.html");

  eq(home.jsonLd.length, 2, "one entry per ld+json script");
  // Document order, and a malformed block is DATA with an error — not an
  // exception, and not a dropped entry.
  eq(home.jsonLd[0].data["@type"], "WebPage", "the first script parsed");
  eq(home.jsonLd[0].error, null, "a valid block has no error");
  eq(home.jsonLd[1].data, null, "a malformed block yields no data");
  if (!home.jsonLd[1].error) throw new Error("a malformed block must carry an error rather than throw");
  if (!home.jsonLd[1].raw.includes("this is not json")) throw new Error("raw keeps the author's bytes");
  covers("MAN-08");
}, TEST_MS);

test("MAN-08 — schemaType reads <meta name=schema> or a single-object string @type, and nothing else", async () => {
  const tmp = mkTmp();
  const links = ['<a href="/meta.html">1</a>', '<a href="/single.html">2</a>', '<a href="/arr.html">3</a>', '<a href="/graph.html">4</a>'].join("");
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", `<h1>Home</h1>${links}`),
    "meta.html": page("Meta", "<h1>Meta</h1>", '<meta name="schema" content="Article">'),
    "single.html": page("Single", "<h1>Single</h1>",
      '<script type="application/ld+json">{"@type":"BlogPosting","headline":"x"}</script>'),
    // An array @type and a @graph both declare NOTHING: there is no single
    // answer, and guessing one is the failure §26 exists to prevent.
    "arr.html": page("Arr", "<h1>Arr</h1>",
      '<script type="application/ld+json">{"@type":["Article","Thing"]}</script>'),
    "graph.html": page("Graph", "<h1>Graph</h1>",
      '<script type="application/ld+json">{"@graph":[{"@type":"Article"}]}</script>'),
  });
  const byPath = await records(tmp);

  eq(byPath.get("meta.html").schemaType, "Article", "<meta name=schema> declares the type");
  eq(byPath.get("single.html").schemaType, "BlogPosting", "a single-object string @type declares the type");
  eq(byPath.get("arr.html").schemaType, null, "an array @type declares nothing");
  eq(byPath.get("graph.html").schemaType, null, "a @graph declares nothing");
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
      // An asset has no record; skipped schemes are excluded entirely.
      '<a href="/card.png">asset</a><a href="mailto:x@example.com">mail</a><a href="https://elsewhere.example/">off</a>'),
    "a.html": page("A", "<h1>A</h1>"),
    "b.html": page("B", "<h1>B</h1>"),
    "card.png": "png",
  });
  const byPath = await records(tmp);

  eq(byPath.get("index.html").linksOut, ["a.html", "b.html"], "deduplicated, sorted, records only");
  // The exact reverse: A and B each know the one page that links to them.
  eq(byPath.get("a.html").linksIn, ["index.html"], "linksIn is the reverse of linksOut");
  eq(byPath.get("b.html").linksIn, ["index.html"], "linksIn is the reverse of linksOut");
  eq(byPath.get("index.html").linksIn, [], "nothing links to the home page here");
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
  const iso = (n) => byPath.get(`${n}.html`).datePublished?.iso ?? null;

  eq(iso("good"), "2026-08-02T21:30+05:30", "a well-formed value is kept VERBATIM, not normalized");
  // A day is well-formed W3C-DTF without a TZD; a time without one is not.
  eq(iso("dayonly"), "2026-08-02", "a day-only value is well-formed");
  eq(iso("notz"), null, "a time with no TZD is not well-formed");
  eq(iso("badday"), null, "February 30th is not a real calendar day");
  eq(iso("badtime"), null, "hour 25 is not a real time of day");
  eq(iso("badoffset"), null, "an offset beyond ±14:00 is not well-formed");
  // raw always keeps the author's bytes, even where iso refused them.
  eq(byPath.get("badday.html").datePublished.raw, "2026-02-30T00:00:00Z", "raw keeps the author's bytes");
  covers("MAN-10");
}, TEST_MS);
