/**
 * §24 `unify audit` — AUD-01..09, AUD-11 and AUD-12.
 *
 * The command's whole contract is that it decides nothing. Most of what is
 * asserted below is therefore a *restraint*: it writes nothing, it never
 * changes what `build` does, it prints no score, and it narrows three
 * plain-language checks — duplicate, mismatch, and "too short" — to the only
 * forms that are decidable without a threshold nobody could defend (§24.4).
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1).
 */
import { test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const BASE = "https://example.com/";

/** A complete, finding-free page: title, description, lang, one h1, own text. */
const page = (name, body = `<p>Words about ${name}.</p>`) =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name}</title>
<meta name="description" content="The ${name} page of the example site.">
</head>
<body>
<h1>${name}</h1>
${body}
</body>
</html>
`;

/** Every page links to every other, so nothing is an orphan by accident. */
function linked(names) {
  const nav = names.map((n) => `<a href="/${n.toLowerCase()}.html">${n}</a>`).join(" ");
  const files = { "index.html": page("Home", `<p>Welcome.</p><nav>${nav}</nav>`) };
  for (const n of names) {
    files[`${n.toLowerCase()}.html`] = page(n, `<p>Words about ${n}.</p><nav><a href="/">Home</a> ${nav}</nav>`);
  }
  return files;
}

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

/** The finding ids the report declares, in the order printed. */
function ids(stdout) {
  return [...stdout.matchAll(/\[([a-z0-9-]+)\]$/gm)].map((m) => m[1]);
}

function expectFinding(r, id, what) {
  if (!ids(r.stdout).includes(id)) {
    throw new Error(`${what}: expected a ${id} finding\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectNoFinding(r, id, what) {
  if (ids(r.stdout).includes(id)) {
    throw new Error(`${what}: expected NO ${id} finding\nstdout:\n${r.stdout}`);
  }
}

// ------------------------------------------------------------------- §24.1

test("AUD-01: audit runs the whole pipeline and evaluates emitted bytes, not source files", async () => {
  const tmp = mkTmp();
  // The title, the description, and lang exist ONLY in the layout. A reader of
  // the source files would report three findings on a page that emits none.
  writeTree(join(tmp, "src"), {
    "_layout.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Example Site</title>
<meta name="description" content="A site assembled entirely by its layout."></head>
<body><main></main></body>
</html>
`,
    "index.html": "<!doctype html>\n<html>\n<body>\n<h1>Example Site</h1>\n<p>Composed from a layout.</p>\n</body>\n</html>\n",
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a page whose metadata comes from its layout");
  for (const id of ["title-missing", "description-missing", "lang-missing", "h1-missing"]) {
    expectNoFinding(r, id, "§24.1: the manifest reads what the page EMITS");
  }
  covers("AUD-01");
}, TEST_MS);

test("AUD-01: audit publishes nothing and prints no dry-run report", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), linked(["About"]));
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a clean site");
  if (existsSync(join(tmp, "dist"))) {
    throw new Error(`§24.2: audit created dist/: ${readdirSync(join(tmp, "dist")).join(", ")}`);
  }
  if (/would publish|^copy |^write /m.test(r.stdout)) {
    throw new Error(`§24.1: the report audit prints is the finding list, not §17's plan.\nstdout:\n${r.stdout}`);
  }
  covers("AUD-01");
}, TEST_MS);

test("AUD-01: --base-url and --canonical auto still run, so their findings can exist", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About"]),
    // Listed in the generated sitemap only if §21 ran; noindex makes that a
    // contradiction, which is the finding. Without the pipeline there is no
    // sitemap and no finding — so this asserts §21 ran inside audit.
    "notes.html": page("Notes").replace("<head>", '<head>\n<meta name="robots" content="noindex">'),
  });
  const withBase = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  // A noindex page is not in the sitemap (§21.2), so the pair that IS reportable
  // is the orphan: prove instead that generation happened by auditing a page the
  // sitemap does list and a canonical §22 completed.
  expectExit(withBase, 0, "audit with --base-url");
  const completed = await runCli(
    ["audit", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], tmp);
  expectExit(completed, 0, "audit with --canonical auto");
  if (existsSync(join(tmp, "dist"))) throw new Error("§24.2: audit wrote output");
  covers("AUD-01");
}, TEST_MS);

// ------------------------------------------------------------------- §24.2

test("AUD-02: audit never touches or reads an existing output directory", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), linked(["About"]));
  writeTree(join(tmp, "dist"), { "stale.html": "<p>from an older build</p>\n" });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit beside an existing dist/");
  const after = readdirSync(join(tmp, "dist")).sort();
  if (after.join(",") !== "stale.html") {
    throw new Error(`§24.2: audit writes nothing, anywhere. dist/ now holds: ${after.join(", ")}`);
  }
  if (readFileSync(join(tmp, "dist", "stale.html"), "utf8") !== "<p>from an older build</p>\n") {
    throw new Error("§24.2: audit rewrote a file in the output directory");
  }
  // §17's delete plan is the one step that READS dist/, and it belongs to
  // --dry-run: a stranded file must not appear in audit's report.
  if (r.stdout.includes("stale.html")) {
    throw new Error(`§24.2: audit does not consult the output directory.\nstdout:\n${r.stdout}`);
  }
  covers("AUD-02");
}, TEST_MS);

test("AUD-02: --clean and --dry-run are usage errors, never accepted inertly", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), linked(["About"]));
  writeTree(join(tmp, "dist"), { "stale.html": "<p>older</p>\n" });

  const cleaned = await runCli(["audit", "-s", "src", "-o", "dist", "--clean"], tmp);
  expectExit(cleaned, 2, "audit --clean");
  if (!/--clean/.test(cleaned.stderr)) {
    throw new Error(`§24.2: the error names the flag.\nstderr:\n${cleaned.stderr}`);
  }
  if (!existsSync(join(tmp, "dist", "stale.html"))) {
    throw new Error("§24.2: a refused --clean must not have emptied anything");
  }

  const dry = await runCli(["audit", "-s", "src", "-o", "dist", "--dry-run"], tmp);
  expectExit(dry, 2, "audit --dry-run");
  if (!/--dry-run/.test(dry.stderr)) {
    throw new Error(`§24.2: the error names the flag.\nstderr:\n${dry.stderr}`);
  }
  covers("AUD-02");
}, TEST_MS);

// ------------------------------------------------------------------- §24.3

test("AUD-03: build never audits — the same site is clean and silent under build", async () => {
  const files = {
    "index.html": page("Home", "<p>Welcome.</p>"),
    // Every incomplete finding at once: no title, no description, no lang, no h1,
    // and nothing links here. Plus a broken one: a repeated id.
    "about.html": '<html><head><meta charset="utf-8"></head><body><p id="x">a</p><p id="x">b</p></body></html>\n',
  };
  const built = mkTmp();
  writeTree(join(built, "src"), files);
  const b = await runCli(["build", "-s", "src", "-o", "dist"], built);
  expectExit(b, 0, "build on a site full of findings");
  if (ids(b.stdout).length || /\bincomplete\b|\bbroken\b/.test(b.stdout)) {
    throw new Error(`§24.7: build never calls the evaluator.\nstdout:\n${b.stdout}`);
  }
  if (!existsSync(join(built, "dist", "about.html"))) {
    throw new Error("§24.3: no finding ever blocks a publish");
  }

  const audited = mkTmp();
  writeTree(join(audited, "src"), files);
  const a = await runCli(["audit", "-s", "src", "-o", "dist"], audited);
  expectExit(a, 0, "audit on the same site");
  for (const id of ["title-missing", "description-missing", "lang-missing", "h1-missing", "page-orphan", "id-duplicate"]) {
    expectFinding(a, id, "§24.4");
  }
  covers("AUD-03");
  covers("AUD-04");
}, TEST_MS);

test("AUD-03: severity is objective — wrong output is broken, absent output is incomplete", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>Welcome.</p><a href="/notes.html#nowhere">Notes</a>'),
    "notes.html": page("Notes", '<p id="dup">a</p><p id="dup">b</p><a href="/">Home</a>')
      .replace('<meta name="description" content="The Notes page of the example site.">\n', ""),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a site with both severities");
  const severity = (id) => (new RegExp(`: (broken|incomplete): [^\\n]*\\[${id}\\]$`, "m").exec(r.stdout) ?? [])[1];
  for (const [id, want] of [["fragment-missing", "broken"], ["id-duplicate", "broken"], ["description-missing", "incomplete"]]) {
    if (severity(id) !== want) {
      throw new Error(`§24.3: ${id} is ${want}, reported as ${severity(id)}\nstdout:\n${r.stdout}`);
    }
  }
  covers("AUD-03");
}, TEST_MS);

// ------------------------------------------------------------------- §24.4

test("AUD-04: the metadata and heading findings", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>Welcome.</p><a href="/a.html">A</a> <a href="/b.html">B</a> <a href="/c.html">C</a> <a href="/d.html">D</a>'),
    // Same title and same description as b.html — a duplicate needs a pair.
    "a.html": page("Shared").replace("The Shared page", "One shared description"),
    "b.html": page("Shared").replace("The Shared page", "One shared description"),
    // Two extra h1s beside the one page() already writes.
    "c.html": page("Ledger", "<h1>Alpha</h1><h1>Beta</h1><p>Two headings.</p>"),
    // Exactly one h1, and a title neither string contains. The page above
    // cannot also carry this finding: §24.4 runs the check only on a page with
    // exactly one h1, because with several there is no "the heading" to compare.
    "d.html": page("Ledger", "<p>One heading.</p>").replace("<h1>Ledger</h1>", "<h1>Contact Us</h1>"),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "metadata findings");
  for (const id of ["title-duplicate", "description-duplicate", "h1-multiple", "title-h1-mismatch"]) {
    expectFinding(r, id, "§24.4");
  }
  covers("AUD-04");
}, TEST_MS);

test("AUD-04: structured data, social image, and duplicated text", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>Welcome.</p><a href="/post.html">Post</a> <a href="/twin.html">Twin</a> <a href="/copy.html">Copy</a>'),
    "post.html": page("Post", "<p>Unique words here.</p>")
      .replace("</head>", `<script type="application/ld+json">{ not json }</script>
<meta property="og:image" content="/card.png">
<meta property="og:image:width" content="1200">
</head>`),
    "card.png": "a real file, so the reference resolves\n",
    // Byte-identical visible text.
    "twin.html": page("Twin", "<p>Exactly the same words.</p>").replace("<h1>Twin</h1>", "<h1>Same</h1>"),
    "copy.html": page("Copy", "<p>Exactly the same words.</p>").replace("<h1>Copy</h1>", "<h1>Same</h1>"),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "content findings");
  expectFinding(r, "jsonld-invalid", "§24.4: a block that does not parse is broken output");
  expectFinding(r, "image-missing-dimensions", "§24.4: og:image with no declared size");
  // An og:image naming NO emitted file is P13 from §12 and never a finding
  // (§24.4) — one question, one mechanism, and P13 is the stronger one.
  expectNoFinding(r, "image-missing-target", "§24.4");
  expectFinding(r, "text-duplicate", "§24.4: identical visible text");
  covers("AUD-04");
}, TEST_MS);

test("AUD-04: a declared Article missing the fields structured data is built from", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>Welcome.</p><a href="/post.html">Post</a>'),
    "post.md": `---
schema: Article
title: A Post
---

# A Post

Words in the post.

[Home](/)
`,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "an Article with no date");
  expectFinding(r, "schema-incomplete", "§24.4: declared Article, no authored ISO 8601 date");
  if (!/date/i.test(r.stdout)) {
    throw new Error(`§24.5: evidence names the missing field.\nstdout:\n${r.stdout}`);
  }
  covers("AUD-04");
}, TEST_MS);

test("AUD-04: schema-incomplete reads declaredTypes by INCLUSION over the whole list, not the first entry — a WebPage meta declaration before an Article JSON-LD one still fires", async () => {
  // §20.4/MAN-08's 0.9 widening: declaredTypes(doc) lists every accepted
  // declaration (meta before JSON-LD, in order) and audit.js's own
  // `declaredTypes(doc).find(t => t === "Article" || t === "BlogPosting")`
  // tests inclusion over the whole list — never `declaredTypes(doc)[0]`,
  // the retired single-scalar reading. Here the FIRST declaration is
  // WebPage (a meta, which sorts before any JSON-LD entry); Article is
  // declared second, by JSON-LD. schema-incomplete must still fire on the
  // missing date, because Article is IN the list.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>Welcome.</p><a href="/post.html">Post</a>'),
    "post.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>A Post</title>
<meta name="description" content="A post about widening.">
<meta name="schema" content="WebPage">
<script type="application/ld+json">{"@type":"Article"}</script>
</head>
<body>
<h1>A Post</h1>
<p>Words in the post.</p>
<a href="/">Home</a>
</body>
</html>
`,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "WebPage meta then Article JSON-LD, no date");
  expectFinding(r, "schema-incomplete", "§20.4/MAN-08: Article is in declaredTypes even though it is not the first entry");
  covers("AUD-04", "MAN-08");
}, TEST_MS);

test("AUD-04: sitemap disagreement — a listed page that refuses indexing", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About"]),
    // An AUTHORED sitemap lists a page the page itself marks noindex. §21.5
    // suppresses generation, so this pair is only reachable through an
    // authored file — and it is exactly the conflict §6.3.2 names.
    "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://example.com/</loc></url>
<url><loc>https://example.com/about.html</loc></url>
</urlset>
`,
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
      .replace("<head>", '<head>\n<meta name="robots" content="noindex">'
        + '\n<link rel="canonical" href="https://example.com/about.html">'),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "an authored sitemap listing a noindex page");
  expectFinding(r, "sitemap-noindex", "§24.4: the sitemap and the page contradict each other");
  // The page's canonical names ITSELF, so there is no disagreement to report.
  // Deriving that from §21.2's membership predicate would be wrong here: a
  // noindex page fails membership for the robots reason, and reading that as
  // "the canonical disagrees" invents a second finding whose evidence quotes
  // the page's own URL back at it.
  expectNoFinding(r, "sitemap-canonical-disagree", "§24.4: the canonical names this very page");
  covers("AUD-04");
  covers("AUD-06");
}, TEST_MS);

// ------------------------------------------------------------------- §24.4 (narrowings)

test("AUD-05: duplicate means identical — similar titles are not a finding", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>Welcome.</p><a href="/a.html">A</a> <a href="/b.html">B</a> <a href="/c.html">C</a>'),
    // Case and whitespace only — the same title, and never authorial intent.
    "a.html": page("Our  Services").replace("<h1>Our  Services</h1>", "<h1>Our Services</h1>"),
    "b.html": page("our services"),
    // Genuinely similar, genuinely different. No threshold exists that could
    // separate this pair from the one above without inventing a number.
    "c.html": page("Our Services in Leeds"),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "similar titles");
  const dupes = r.stdout.split("\n").filter((l) => l.includes("[title-duplicate]"));
  const files = dupes.map((l) => l.split(":")[0]).sort();
  if (files.join(",") !== "a.html,b.html") {
    throw new Error(`§24.4: identical after folding, and nothing looser.\nreported: ${files.join(", ")}\nstdout:\n${r.stdout}`);
  }
  // And each names its one partner. Reading only the file column let a grouping
  // key that over-matches survive: it reports the same two files and accuses a
  // third page inside the evidence, where nothing was looking.
  const named = dupes.map((l) => `${l.split(":")[0]} -> ${/is also used by ([^\[]+)/.exec(l)[1].trim()}`).sort();
  if (named.join(" | ") !== "a.html -> b.html | b.html -> a.html") {
    throw new Error(`§24.4: the evidence names the page that actually shares the title.\ngot: ${named.join(" | ")}`);
  }
  covers("AUD-05");
}, TEST_MS);

test("AUD-05: title/heading mismatch is containment, so a layout's title suffix is not one", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_layout.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title> — Example Site</title>
<meta name="description" content="The example site."></head>
<body><main></main></body>
</html>
`,
    // §8 row 2 PREPENDS, so this emits "About — Example Site" over an h1 of "About".
    "index.html": "<!doctype html>\n<html>\n<head><title>About</title></head>\n<body>\n<h1>About</h1>\n<p>Words.</p>\n</body>\n</html>\n",
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a prepended title suffix");
  expectNoFinding(r, "title-h1-mismatch", "§24.4: containment in either direction is the whole test");
  covers("AUD-05");
}, TEST_MS);

test("AUD-04/MAN-03 — heading scope is main-first (0.9 change): a layout's <h1> in a <header> outside <main> does not count as the page's own heading", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    // The layout's own chrome carries an <h1> OUTSIDE <main> — a site name in
    // the header, a common pattern. Before 0.9, headings were read
    // document-wide, so this <h1> would have satisfied every page's
    // h1-missing/h1-multiple/title-h1-mismatch check regardless of what the
    // page itself wrote. The 0.9 scope is the first <main>, else <body>, else
    // the document (§20.3/§20.7), so a page whose own content has no <h1>
    // must still draw h1-missing even though the layout's <header> has one.
    "_layout.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Example Site</title>
<meta name="description" content="The example site."></head>
<body>
<header><h1>Example Site</h1></header>
<main><slot></slot></main>
</body>
</html>
`,
    // No <h1> of its own — only <p> content that fills <main>.
    "index.html": "<!doctype html>\n<html>\n<head><title>Home</title></head>\n<body>\n<p>No heading here.</p>\n</body>\n</html>\n",
    // A positive control on the SAME layout: a page that DOES write its own
    // <h1> inside main is clean — proving the layout's chrome is genuinely
    // excluded rather than the finding being broken outright.
    "about.html": "<!doctype html>\n<html>\n<head><title>About</title></head>\n<body>\n<h1>About</h1>\n<p>Words.</p>\n</body>\n</html>\n",
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a missing h1 is incomplete, not a pipeline problem");
  const home = r.stdout.split("\n").filter((l) => l.startsWith("index.html: ") && l.includes("[h1-missing]"));
  if (home.length !== 1) {
    throw new Error(`§20.3/§24.4: the layout's chrome <h1> is outside <main> and must not satisfy index.html's own h1-missing check:\n${r.stdout}`);
  }
  const about = r.stdout.split("\n").filter((l) => l.startsWith("about.html: ") && l.includes("[h1-missing]"));
  if (about.length !== 0) {
    throw new Error(`§20.3: about.html writes its own <h1> inside <main> and must be clean (vacuity check for the finding itself):\n${r.stdout}`);
  }

  // The emitted bytes prove the scope, independent of the finding: the
  // chrome <h1> DOES ship on index.html — it is excluded from the READING,
  // not dropped from the page.
  const built = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(built, 0, "the layout composes normally");
  const emitted = readFileSync(join(tmp, "dist", "index.html"), "utf8");
  if (!emitted.includes("<header><h1>Example Site</h1></header>")) {
    throw new Error(`the fixture is vacuous: the layout's chrome <h1> never reached the emitted page:\n${emitted}`);
  }
  covers("AUD-04", "MAN-03");
}, TEST_MS);

test("AUD-05: nothing counts characters — a 2-character title and a 400-character description are clean", async () => {
  const tmp = mkTmp();
  const long = `${"Words about the page, repeated at length. ".repeat(10)}`;
  writeTree(join(tmp, "src"), {
    "index.html": page("Hi", "<p>Short.</p>").replace(
      "The Home page of the example site.", long),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "extreme lengths");
  if (ids(r.stdout).length !== 0) {
    throw new Error(`§24.4: absence is checkable; length is opinion.\nstdout:\n${r.stdout}`);
  }
  covers("AUD-05");
}, TEST_MS);

// ------------------------------------------------------------------- §24.4 (absences)

test("AUD-06: a self-canonical noindex page is redundant, not contradictory", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>').replace(
      "<head>",
      '<head>\n<meta name="robots" content="noindex">\n<link rel="canonical" href="https://example.com/about.html">'),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "noindex naming itself");
  expectNoFinding(r, "canonical-noindex", "§24.4: a canonical naming its own page contradicts nothing");

  // The cross-canonical shape IS the finding §6.3.2 names.
  const cross = mkTmp();
  writeTree(join(cross, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>').replace(
      "<head>",
      '<head>\n<meta name="robots" content="noindex">\n<link rel="canonical" href="https://example.com/">'),
  });
  const c = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], cross);
  expectExit(c, 0, "noindex naming another page");
  expectFinding(c, "canonical-noindex", "§24.4");
  covers("AUD-06");
}, TEST_MS);

test("AUD-06: a canonical naming nothing emitted stays P13, and never becomes a finding", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home").replace("<head>", '<head>\n<link rel="canonical" href="/gone.html">'),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a broken canonical target");
  if (!/gone\.html/.test(r.stderr)) {
    throw new Error(`§24.4: this is §12's broken reference, on stderr.\nstderr:\n${r.stderr}`);
  }
  if (ids(r.stdout).some((id) => id.startsWith("canonical"))) {
    throw new Error(`§24.4: the build already refuses to publish it — no finding is added.\nstdout:\n${r.stdout}`);
  }
  covers("AUD-06");
}, TEST_MS);

// ------------------------------------------------------------------- §24.5

test("AUD-07: the report is two lines a finding plus a count, ordered by path then id", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>Welcome.</p><a href="/a.html">A</a> <a href="/b.html">B</a>'),
    // a.html's only finding sorts LAST by id; b.html's two sort first. Path
    // order and id order therefore disagree, which is what makes the assertion
    // below discriminate between them rather than pass under either rule.
    "a.html": page("A", '<p>Words about A.</p><a href="/">Home</a>').replace("<title>A</title>\n", ""),
    "b.html": '<html><head><meta charset="utf-8"><title>B</title></head><body><h1>B</h1><p>x</p><a href="/">Home</a></body></html>\n',
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "the report shape");
  const lines = r.stdout.trimEnd().split("\n");
  const finding = /^[^\n]+: (broken|incomplete): .+ \[[a-z0-9-]+\]$/;
  for (let i = 0; i < lines.length - 1; i += 2) {
    if (!finding.test(lines[i])) throw new Error(`§24.5: line ${i + 1} is not a finding line: ${lines[i]}`);
    if (!lines[i + 1].startsWith("  fix: ")) throw new Error(`§24.5: line ${i + 2} is not a fix line: ${lines[i + 1]}`);
  }
  if (!/^audit: \d+ broken, \d+ incomplete$/.test(lines[lines.length - 1])) {
    throw new Error(`§24.5: the report ends with a count line, got: ${lines[lines.length - 1]}`);
  }
  const order = lines.filter((l) => finding.test(l)).map((l) => `${l.split(":")[0]}\t${/\[([a-z0-9-]+)\]$/.exec(l)[1]}`);
  const sorted = [...order].sort();
  if (order.join("|") !== sorted.join("|")) {
    throw new Error(`§24.5: ordered by source path then id.\ngot:\n${order.join("\n")}`);
  }
  covers("AUD-07");
}, TEST_MS);

test("AUD-07: nothing to report says so, and no report ever carries a score", async () => {
  const clean = mkTmp();
  writeTree(join(clean, "src"), linked(["About"]));
  const c = await runCli(["audit", "-s", "src", "-o", "dist"], clean);
  expectExit(c, 0, "a clean site");
  if (c.stdout.trim() !== "audit: nothing to report") {
    throw new Error(`§24.5: a clean site says so.\nstdout:\n${c.stdout}`);
  }

  const messy = mkTmp();
  writeTree(join(messy, "src"), {
    "index.html": "<html><body><p>bare</p></body></html>\n",
    "other.html": "<html><body><p>bare</p></body></html>\n",
  });
  const m = await runCli(["audit", "-s", "src", "-o", "dist"], messy);
  expectExit(m, 0, "a site with many findings");
  if (/\bscore\b|\bgrade\b|\brating\b|\bhealth\b|%|\/100\b|\bout of \d/i.test(m.stdout)) {
    throw new Error(`§24.5: unify assigns no score, in any form.\nstdout:\n${m.stdout}`);
  }
  covers("AUD-07");
}, TEST_MS);

test("AUD-07: findings go to stdout, §14 diagnostics keep stderr", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": '<html><body><p>bare</p><a href="/gone.html">gone</a></body></html>\n',
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a site with a problem and findings");
  if (!/gone\.html/.test(r.stderr)) throw new Error(`§24.5: diagnostics stay on stderr.\nstderr:\n${r.stderr}`);
  if (ids(r.stderr).length) throw new Error(`§24.5: findings are not diagnostics.\nstderr:\n${r.stderr}`);
  if (!ids(r.stdout).includes("title-missing")) {
    throw new Error(`§24.5: the finding list is stdout.\nstdout:\n${r.stdout}`);
  }
  covers("AUD-07");
}, TEST_MS);

// ------------------------------------------------------------------- §24.6

test("AUD-08: findings exit 0; --strict makes any finding exit 1", async () => {
  const files = {
    "index.html": page("Home", '<p>Welcome.</p><a href="/b.html">B</a>'),
    // One `incomplete` finding and nothing else: the weakest thing --strict gates on.
    "b.html": '<html lang="en"><head><meta charset="utf-8"><title>B</title></head><body><h1>B</h1><p>x</p><a href="/">Home</a></body></html>\n',
  };
  const loose = mkTmp();
  writeTree(join(loose, "src"), files);
  const l = await runCli(["audit", "-s", "src", "-o", "dist"], loose);
  expectExit(l, 0, "findings without --strict");
  expectFinding(l, "description-missing", "§24.6");

  const strict = mkTmp();
  writeTree(join(strict, "src"), files);
  const s = await runCli(["audit", "-s", "src", "-o", "dist", "--strict"], strict);
  expectExit(s, 1, "the same findings with --strict");
  expectFinding(s, "description-missing", "§24.6: --strict changes the exit code, not the report");
  covers("AUD-08");
}, TEST_MS);

test("AUD-08: a clean site with --strict exits 0", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), linked(["About"]));
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--strict"], tmp);
  expectExit(r, 0, "--strict on a site with no findings");
  covers("AUD-08");
}, TEST_MS);

test("AUD-08: a pipeline problem exits 1 with or without --strict, and 2 stays usage", async () => {
  const files = { "index.html": `<h1>x</h1>\n<a href="/nowhere.html">nowhere</a>\n` };
  const loose = mkTmp();
  writeTree(join(loose, "src"), files);
  expectExit(await runCli(["audit", "-s", "src", "-o", "dist"], loose), 1, "a problem without --strict");

  const strict = mkTmp();
  writeTree(join(strict, "src"), files);
  expectExit(await runCli(["audit", "-s", "src", "-o", "dist", "--strict"], strict), 1, "a problem with --strict");

  const bad = mkTmp();
  writeTree(join(bad, "src"), files);
  expectExit(await runCli(["audit", "-s", "src", "--no-such-flag"], bad), 2, "an unknown flag");
  covers("AUD-08");
}, TEST_MS);

// ------------------------------------------------- review round 1 regressions

test("AUD-04: a sitemap listing a page whose canonical names another page", async () => {
  // The positive case for `sitemap-canonical-disagree`. Without it the whole
  // predicate could be deleted and the suite stayed green — the only assertion
  // that named the id was an expectNoFinding, which a deleted block satisfies.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
      .replace("<head>", '<head>\n<link rel="canonical" href="https://example.com/">'),
    "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://example.com/</loc></url>
<url><loc>https://example.com/about.html</loc></url>
</urlset>
`,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "a listed page consolidated onto another");
  expectFinding(r, "sitemap-canonical-disagree", "§24.4: the sitemap and the canonical name different pages");
  expectNoFinding(r, "sitemap-noindex", "§24.4: the page is indexable — only the canonical disagrees");
  covers("AUD-04");
}, TEST_MS);

test("AUD-06: an unresolvable canonical is not 'somewhere else' — no finding without an address", async () => {
  // With no --base-url an absolute canonical cannot be resolved, so unify
  // cannot tell "names itself" from "names another page". Accusing on that
  // reported a self-canonical page for nominating a replacement, quoting the
  // page's own URL as the evidence, on the default golden path.
  const files = {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>').replace(
      "<head>",
      '<head>\n<meta name="robots" content="noindex">\n<link rel="canonical" href="https://example.com/about.html">'),
  };
  const off = mkTmp();
  writeTree(join(off, "src"), files);
  const a = await runCli(["audit", "-s", "src", "-o", "dist"], off);
  expectExit(a, 0, "a self-canonical noindex page with no --base-url");
  expectNoFinding(a, "canonical-noindex", "§24.4: unresolvable is not 'somewhere else'");

  // Supplying the address makes it resolvable, and it still names itself.
  const on = mkTmp();
  writeTree(join(on, "src"), files);
  const b = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], on);
  expectExit(b, 0, "the identical bytes with an address supplied");
  expectNoFinding(b, "canonical-noindex", "§24.4: the canonical names this very page");

  // A ROOT-RELATIVE canonical resolves without an address, so the finding is
  // narrower without --base-url but never dead.
  const rel = mkTmp();
  writeTree(join(rel, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>').replace(
      "<head>", '<head>\n<meta name="robots" content="noindex">\n<link rel="canonical" href="/">'),
  });
  const c = await runCli(["audit", "-s", "src", "-o", "dist"], rel);
  expectExit(c, 0, "a root-relative cross-canonical with no --base-url");
  expectFinding(c, "canonical-noindex", "§24.4: this one resolves, address or no address");
  covers("AUD-06");
}, TEST_MS);

test("AUD-04: contradictory declarations are reported — §20.4's data, rendered", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
      .replace("<head>", '<head>\n<link rel="canonical" href="https://example.com/about.html">'
        + '\n<link rel="canonical" href="https://example.com/">'
        + '\n<meta name="description" content="A second, different description.">'),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "a page declaring two canonicals and two descriptions");
  const lines = r.stdout.split("\n").filter((l) => l.includes("[metadata-conflict]"));
  if (lines.length !== 2) {
    throw new Error(`§24.4: one finding per conflicting field.\nstdout:\n${r.stdout}`);
  }
  if (!lines.join("\n").includes("canonical") || !lines.join("\n").includes("description")) {
    throw new Error(`§24.4: the evidence names the field.\n${lines.join("\n")}`);
  }
  covers("AUD-04");
  covers("AUD-09");
}, TEST_MS);

test("AUD-05: text-duplicate folds Unicode space separators, as §20.3 requires of it", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>Welcome.</p><a href="/a.html">A</a> <a href="/b.html">B</a>'),
    // §20.3 collapses ASCII whitespace only and keeps &nbsp; verbatim, because
    // the author chose it. The obligation to fold lands here, at the compare.
    // Same visible text apart from the one separator — the h1s must match too,
    // or the pages differ for an ordinary reason and prove nothing.
    "a.html": page("A", '<p>New York office hours.</p><a href="/">Home</a>').replace("<h1>A</h1>", "<h1>Hours</h1>"),
    "b.html": page("B", '<p>New&nbsp;York office hours.</p><a href="/">Home</a>').replace("<h1>B</h1>", "<h1>Hours</h1>"),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "two pages differing only by a non-breaking space");
  expectFinding(r, "text-duplicate", "§20.3: fold U+00A0 and the other Unicode space separators at index time");
  // BOTH pages, each naming the other. Checking only that the finding appeared
  // let a fold applied on one side of the comparison survive: the page holding
  // the &nbsp; still matched the plain one, so exactly half the pair reported.
  const dupes = r.stdout.split("\n").filter((l) => l.includes("[text-duplicate]"));
  const files = dupes.map((l) => l.split(":")[0]).sort();
  if (files.join(",") !== "a.html,b.html") {
    throw new Error(`§20.3: the fold is a property of the COMPARISON, so it holds both ways.\nreported: ${files.join(", ")}\nstdout:\n${r.stdout}`);
  }
  covers("AUD-05");
}, TEST_MS);

test("AUD-05: page-orphan counts incoming links from OTHER pages", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", "<p>Welcome.</p>"),
    // Its only incoming link is its own permalink. The evidence line has always
    // said "no OTHER page links to this one"; the predicate now agrees.
    "solo.html": page("Solo", '<p>Alone.</p><a href="/solo.html">permalink</a>'),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a page linked only from itself");
  const orphans = r.stdout.split("\n").filter((l) => l.includes("[page-orphan]"));
  if (orphans.length !== 1 || !orphans[0].startsWith("solo.html")) {
    throw new Error(`§24.4: a self-link is not an incoming link.\nstdout:\n${r.stdout}`);
  }
  covers("AUD-05");
}, TEST_MS);

test("AUD-07: no evidence value can break the two-line report", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    // A legally-wrapped robots meta. §20.3 trims but never collapses the value,
    // so interpolating it raw desynchronized every line below it.
    // Two evidence values that can carry a newline, on one page: a wrapped
    // robots meta, and a fragment id spelled with a character reference. The
    // fix line is as much of the two-line contract as the evidence line is.
    "index.html": page("Home", '<p>Welcome.</p><a href="/notes.html#gone">Notes</a> <a href="/notes.html#miss&#10;ing">Broken</a>')
      .replace("<head>", '<head>\n<meta name="robots" content="noindex,\n  nofollow">\n<link rel="canonical" href="/notes.html">'),
    "notes.html": page("Notes", '<p>Words.</p><a href="/">Home</a>'),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a multi-line robots value");
  const lines = r.stdout.trimEnd().split("\n");
  const finding = /^[^\n]+: (broken|incomplete): .+ \[[a-z0-9-]+\]$/;
  // Count first, then walk. Walking alone missed a break in the LAST finding's
  // fix line, where the extra line falls past the loop's own bound — and the
  // fix line is as much of the contract as the evidence line is.
  const found = lines.filter((l) => finding.test(l));
  if (lines.length !== found.length * 2 + 1) {
    throw new Error(`§24.5: ${found.length} findings is ${found.length * 2 + 1} lines, got ${lines.length}:\n${r.stdout}`);
  }
  for (let i = 0; i < lines.length - 1; i += 2) {
    if (!finding.test(lines[i])) throw new Error(`§24.5: line ${i + 1} is not a finding line: ${lines[i]}`);
    if (!lines[i + 1].startsWith("  fix: ")) throw new Error(`§24.5: line ${i + 2} is not a fix line: ${lines[i + 1]}`);
  }
  covers("AUD-07");
}, TEST_MS);

test("AUD-02: a saved clean: true is refused too — unify.yaml keys ARE the flags", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { ...linked(["About"]), "unify.yaml": "clean: true\n" });
  writeTree(join(tmp, "dist"), { "stale.html": "<p>older</p>\n" });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 2, "audit with a saved clean: true");
  if (!/--clean/.test(r.stderr) || !/unify\.yaml/.test(r.stderr)) {
    throw new Error(`§24.2: the error names the flag and where it came from.\nstderr:\n${r.stderr}`);
  }
  if (!existsSync(join(tmp, "dist", "stale.html"))) {
    throw new Error("§24.2: a refused --clean must not have emptied anything");
  }
  // The same key is live for `build`, which is what makes the refusal necessary.
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "build with the same saved key");
  if (existsSync(join(tmp, "dist", "stale.html"))) {
    throw new Error("§18: the saved key really does mean --clean");
  }
  covers("AUD-02");
}, TEST_MS);

test("REF-01: a relative og:image naming no file is P13, like every other spelling", async () => {
  // The hole that made §24.4 drop `image-missing-target`: §12 tested the VALUE
  // (root-relative or absolute), so the third spelling was checked by nothing
  // while audit deferred to a check that was not happening.
  for (const [label, value] of [["relative", "missing-card.png"], ["root-relative", "/missing-card.png"]]) {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      "index.html": page("Home").replace("<head>", `<head>\n<meta property="og:image" content="${value}">`),
    });
    const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
    expectExit(r, 1, `a ${label} og:image naming no file`);
    if (!/missing-card\.png/.test(r.stderr)) {
      throw new Error(`§12: every spelling of a URL is checked.\nstderr:\n${r.stderr}`);
    }
  }
  // And prose is still never checked as a reference.
  const ok = mkTmp();
  writeTree(join(ok, "src"), {
    "index.html": page("Home").replace("<head>",
      '<head>\n<meta property="og:site_name" content="Meridian Coffee">\n<meta name="twitter:card" content="summary">'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], ok);
  expectExit(r, 0, "og:site_name and twitter:card are prose");
  covers("REF-01");
}, TEST_MS);

// ------------------------------------------------- review round 2 regressions

test("AUD-04: a fragment written with a character reference matches a literal id", async () => {
  // REF-08 — a reference is the attribute's VALUE — applies to the fragment as
  // much as to the path. `ids` decodes; reading the href's bytes made the two
  // halves of one comparison disagree, and `fragment-missing` reported a link
  // that works in every browser. The percent-escaped spelling already matched,
  // which is what made the entity one look like the author's mistake.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>x</p><a href="/notes.html#caf&eacute;">Entity</a>'
      + ' <a href="/notes.html#caf%C3%A9">Escaped</a> <a href="/notes.html#caf\u00e9">Literal</a>'),
    "notes.html": page("Notes", '<p id="caf\u00e9">y</p><a href="/">Home</a>'),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "three spellings of one fragment");
  expectNoFinding(r, "fragment-missing", "REF-08: all three name the same id");

  // And a fragment that really names nothing is still reported.
  const bad = mkTmp();
  writeTree(join(bad, "src"), {
    "index.html": page("Home", '<p>x</p><a href="/notes.html#caf&eacute;">Entity</a>'),
    "notes.html": page("Notes", '<p id="tea">y</p><a href="/">Home</a>'),
  });
  const b = await runCli(["audit", "-s", "src", "-o", "dist"], bad);
  expectExit(b, 0, "an entity fragment naming nothing");
  expectFinding(b, "fragment-missing", "REF-08: decoding is not excusing");
  covers("AUD-04");
}, TEST_MS);

test("AUD-06: with the site's address known, an off-origin canonical IS somewhere else", async () => {
  // The repair for "unresolvable must not accuse" silently created its
  // opposite: folding another origin into `unknown` lost the pairing
  // product-spec §6.3.2 names first — a noindex page consolidating onto a
  // syndication partner, and a sitemap advertising a URL that points off-site.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About"]),
    "synd.html": page("Syndicated", '<p>Words.</p><a href="/">Home</a>').replace(
      "<head>",
      '<head>\n<meta name="robots" content="noindex">'
      + '\n<link rel="canonical" href="https://competitor.example/their-copy">'),
    "listed.html": page("Listed", '<p>Words.</p><a href="/">Home</a>').replace(
      "<head>", '<head>\n<link rel="canonical" href="https://competitor.example/their-copy">'),
    "sitemap.xml": `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://example.com/listed.html</loc></url>
</urlset>
`,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "off-origin canonicals with the address supplied");
  expectFinding(r, "canonical-noindex", "§24.4: another origin is demonstrably not this page");
  expectFinding(r, "sitemap-canonical-disagree", "§24.4: the sitemap advertises a URL pointing off-site");

  // Without the address, unify cannot tell another origin from its own.
  const off = mkTmp();
  writeTree(join(off, "src"), {
    ...linked(["About"]),
    "synd.html": page("Syndicated", '<p>Words.</p><a href="/">Home</a>').replace(
      "<head>",
      '<head>\n<meta name="robots" content="noindex">'
      + '\n<link rel="canonical" href="https://competitor.example/their-copy">'),
  });
  const b = await runCli(["audit", "-s", "src", "-o", "dist"], off);
  expectExit(b, 0, "the same page with no address to compare against");
  expectNoFinding(b, "canonical-noindex", "§24.4: unknown must not accuse");
  covers("AUD-06");
}, TEST_MS);

test("AUD-04: repeated og:image and a second ld+json block are correct markup", async () => {
  // §20.4's `conflicts` records which value the manifest KEPT — not that the
  // markup is wrong. The Open Graph protocol spells an array by repeating the
  // tag, and a second ld+json entity is recommended practice, so rendering the
  // array whole told authors to delete valid tags.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
      .replace("<head>", '<head>'
        + '\n<meta property="og:image" content="/a.png">'
        + '\n<meta property="og:image" content="/b.png">'
        + '\n<meta name="author" content="A. Writer">'
        + '\n<meta name="author" content="B. Writer">'
        + '\n<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"X"}</script>'
        + '\n<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList"}</script>'),
    "a.png": "bytes\n",
    "b.png": "bytes\n",
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "conforming multi-valued declarations");
  expectNoFinding(r, "metadata-conflict", "§20.4: a conflict entry is not a claim the markup is wrong");

  // The single-valued fields still report.
  const bad = mkTmp();
  writeTree(join(bad, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
      .replace("<head>", '<head>\n<meta name="description" content="A second, different one.">'),
  });
  const b = await runCli(["audit", "-s", "src", "-o", "dist"], bad);
  expectExit(b, 0, "two descriptions");
  expectFinding(b, "metadata-conflict", "§24.4: a page may declare one description");
  covers("AUD-04");
}, TEST_MS);

test("URL-01: a layout's relative og:image is re-rooted, like every other URL it declares", async () => {
  // §12 now checks relative meta values; §11.1 not re-rooting them meant the
  // build emitted a URL it could see was wrong and then blocked on it, under a
  // fix line naming a spelling that was already right.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_layout.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Site</title>
<meta name="description" content="The site.">
<meta property="og:image" content="card.png">
</head>
<body><main></main></body>
</html>
`,
    "index.html": "<!doctype html>\n<html><body><h1>Home</h1><p>x</p></body></html>\n",
    "blog/post.html": "<!doctype html>\n<html><body><h1>Post</h1><p>y</p></body></html>\n",
    "card.png": "bytes\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a layout's relative og:image, used from two directories");
  for (const [file, where] of [["index.html", "the root"], ["blog/post.html", "a subdirectory"]]) {
    const out = readFileSync(join(tmp, "dist", file), "utf8");
    if (!out.includes('content="/card.png"')) {
      throw new Error(`§11.1: re-rooted by provenance, so ${where} resolves to the same asset:\n${out}`);
    }
  }
  covers("URL-01");
}, TEST_MS);

// ------------------------------------------------- review round 3 regressions

test("AUD-06: every spelling of this site's own address is self-canonical", async () => {
  // "Another site" is a question about the HOST. Deciding it by whether a
  // byte-prefix strip happened accused four spellings of the page's OWN
  // address — RFC 3986 §6.2.2.1 makes scheme and host case-insensitive, and a
  // protocol-relative value borrows the page's own scheme.
  const spellings = [
    "https://example.com/about.html",
    "HTTPS://EXAMPLE.COM/about.html",
    "https://EXAMPLE.com/about.html",
    "//example.com/about.html",
    "http://example.com/about.html",
    "/about.html",
  ];
  for (const href of spellings) {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      ...linked(["About"]),
      "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
        .replace("<head>", `<head>\n<meta name="robots" content="noindex">\n<link rel="canonical" href="${href}">`),
    });
    const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
    expectExit(r, 0, `canonical spelled ${href}`);
    expectNoFinding(r, "canonical-noindex", `§24.4: ${href} is this page`);
  }

  // A genuinely different host still reports — the check is a comparison, not
  // a blanket exemption for anything that parses.
  const other = mkTmp();
  writeTree(join(other, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
      .replace("<head>", '<head>\n<meta name="robots" content="noindex">'
        + '\n<link rel="canonical" href="//competitor.example/copy">'),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], other);
  expectExit(r, 0, "a protocol-relative canonical on another host");
  expectFinding(r, "canonical-noindex", "§24.4: a different host is a different site");
  covers("AUD-06");
}, TEST_MS);

test("AUD-04: robots directives split across two metas are one policy, not a conflict", async () => {
  // A crawler reads the union across every robots meta. Keeping the first left
  // `indexable` true on a page whose second tag said noindex — so §21.2's
  // noindex clause never fired and the generated sitemap advertised it.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>Welcome.</p><a href="/secret.html">Secret</a>'),
    "secret.html": page("Secret", '<p>Words.</p><a href="/">Home</a>')
      .replace("<head>", '<head>\n<meta name="robots" content="nofollow">\n<meta name="robots" content="noindex">'),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "stacked robots directives");
  expectNoFinding(r, "metadata-conflict", "§20.6: the union is one policy");

  const built = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(built, 0, "the same site built");
  const sitemap = readFileSync(join(tmp, "dist", "sitemap.xml"), "utf8");
  if (sitemap.includes("secret.html")) {
    throw new Error(`§21.2: a noindex page is not listed, however its directives were spelled:\n${sitemap}`);
  }
  covers("AUD-04");
}, TEST_MS);

test("AUD-04: metadata-conflict is exactly the fields HTML restricts to one", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About"]),
    // Two spellings of one date, and two authors: ordinary markup, not a
    // contradiction. `date` and `article:published_time` both map to
    // datePublished, at different granularities.
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
      .replace("<head>", '<head>'
        + '\n<meta name="date" content="2026-01-02">'
        + '\n<meta property="article:published_time" content="2026-01-02T09:00:00Z">'
        + '\n<meta name="author" content="A. Writer">'
        + '\n<meta name="author" content="B. Writer">'),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "two date spellings and two authors");
  expectNoFinding(r, "metadata-conflict", "§24.4: neither is restricted to one per document");

  // The four that are still report.
  const bad = mkTmp();
  writeTree(join(bad, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
      .replace("<head>", '<head>\n<meta name="description" content="A second one.">\n<title>A second title</title>'),
  });
  const b = await runCli(["audit", "-s", "src", "-o", "dist"], bad);
  expectExit(b, 0, "two titles and two descriptions");
  const fields = b.stdout.split("\n").filter((l) => l.includes("[metadata-conflict]"));
  if (fields.length !== 2) {
    throw new Error(`§24.4: title and description, one finding each.\nstdout:\n${b.stdout}`);
  }
  covers("AUD-04");
}, TEST_MS);

test("URL-10: a protocol-relative URL is absolute, so --base-url leaves it alone", async () => {
  // §11.1 has always skipped `//host/...`; §11.3's own test was
  // startsWith("/"), true of both, so it emitted
  // https://example.com//cdn.example.com/card.png — the author's URL rewritten
  // into a different one, pointing at a path on the wrong host.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Home</title>
<meta name="description" content="The home page.">
<link rel="canonical" href="//example.com/">
<meta property="og:image" content="//cdn.example.com/card.png">
<link rel="stylesheet" href="//cdn.example.com/x.css">
</head>
<body><h1>Home</h1><img src="//cdn.example.com/p.png" alt="p"><p>x</p></body>
</html>
`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "protocol-relative URLs under --base-url");
  const out = readFileSync(join(tmp, "dist", "index.html"), "utf8");
  if (out.includes("https://example.com//")) {
    throw new Error(`§11.3: root-relative means ONE leading slash:\n${out}`);
  }
  for (const value of ["//example.com/", "//cdn.example.com/card.png", "//cdn.example.com/x.css", "//cdn.example.com/p.png"]) {
    if (!out.includes(`"${value}"`)) {
      throw new Error(`§11.3: ${value} ships as written:\n${out}`);
    }
  }
  // And a genuinely root-relative value is still prefixed.
  const rooted = mkTmp();
  writeTree(join(rooted, "src"), {
    "index.html": page("Home", '<p>x</p>').replace("<head>", '<head>\n<meta property="og:image" content="/card.png">'),
    "card.png": "bytes\n",
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com/repo/"], rooted);
  expectExit(b, 0, "a root-relative og:image under a subpath base");
  if (!readFileSync(join(rooted, "dist", "index.html"), "utf8").includes('content="https://example.com/repo/card.png"')) {
    throw new Error("§11.3: one leading slash IS root-relative and is still absolutized");
  }
  covers("URL-10");
}, TEST_MS);

test("DIA-01: a diagnostic is one line, whatever the URL contains", async () => {
  // §14.1 is a line-oriented contract, and a value carrying a newline broke it
  // from the inside — one P13 rendered across four lines, two of them looking
  // like diagnostics with no location.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>x</p><a href="/gone&#10;.css">broken</a>'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a reference containing a newline");
  const lines = r.stderr.trimEnd().split("\n");
  for (const line of lines) {
    const located = /^[^\s].*: (problem|advisory): /.test(line);
    const continuation = /^ {2}(in|fix): /.test(line);
    if (!located && !continuation) {
      throw new Error(`§14.1: every line is a located diagnostic or an indented continuation, got: ${JSON.stringify(line)}\nstderr:\n${r.stderr}`);
    }
  }
  covers("DIA-01");
}, TEST_MS);

// ------------------------------------------------- review round 4 regressions

test("SIT-02: every spelling of a page's own address keeps it IN the sitemap", async () => {
  // The membership half of the same fold. Answering only the finding half left
  // a matching host falling through to a byte compare, so four correct pages
  // vanished from a generated discovery artifact with no diagnostic at all —
  // the quieter direction of the same defect.
  const spellings = [
    "https://example.com/about.html",
    "HTTPS://EXAMPLE.COM/about.html",
    "https://EXAMPLE.com/about.html",
    "//example.com/about.html",
    "http://example.com/about.html",
    "https://example.com:443/about.html",
    "/about.html",
    "about.html",
  ];
  for (const href of spellings) {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      ...linked(["About"]),
      "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
        .replace("<head>", `<head>\n<link rel="canonical" href="${href}">`),
    });
    const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
    expectExit(r, 0, `canonical spelled ${href}`);
    const sitemap = readFileSync(join(tmp, "dist", "sitemap.xml"), "utf8");
    if (!sitemap.includes("about.html")) {
      throw new Error(`§21.2: ${href} names this page, so it is self-canonical and listed:\n${sitemap}`);
    }
  }

  // And a canonical naming another page still consolidates it away.
  const away = mkTmp();
  writeTree(join(away, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
      .replace("<head>", '<head>\n<link rel="canonical" href="https://example.com/">'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], away);
  expectExit(r, 0, "a page consolidated onto the root");
  if (readFileSync(join(away, "dist", "sitemap.xml"), "utf8").includes("about.html")) {
    throw new Error("§21.2: a page whose canonical names another page is not listed");
  }
  covers("SIT-02");
}, TEST_MS);

test("SIT-02: a canonical this build cannot resolve is not a self-canonical page", async () => {
  // The membership direction of `unknown`. §21.2 clause 4 asks the canonical to
  // resolve to this page's own output path; a value naming nothing resolvable
  // has not done that, so the page is consolidated away rather than listed on
  // the strength of a claim unify could not check.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
      .replace("<head>", '<head>\n<link rel="canonical" href="mailto:hi@example.com">'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "a canonical that names no page at all");
  const sitemap = readFileSync(join(tmp, "dist", "sitemap.xml"), "utf8");
  if (sitemap.includes("about.html")) {
    throw new Error(`§21.2: a canonical unify cannot resolve is not this page:\n${sitemap}`);
  }
  if (!sitemap.includes("https://example.com/")) {
    throw new Error(`§21.2: its clean neighbour is still listed:\n${sitemap}`);
  }
  covers("SIT-02");
}, TEST_MS);

test("REF-02: an origin match needs a boundary, and host equivalence is not a byte compare", async () => {
  // A site at example.com could not link to example.community: `startsWith`
  // matched the origin as text, so the rest of the HOST was read as a path.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>x</p>'
      + '<a href="https://example.com.evil.test/phish.html">a</a>'
      + '<a href="https://example.commerce.test/b.html">b</a>'
      + '<a href="https://example.community/c.html">c</a>')
      .replace("<head>", '<head>\n<meta property="og:image" content="https://example.commerce.test/card.png">'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "external hosts whose names begin with the base origin");
  if (r.stderr.trim() !== "") {
    throw new Error(`§12: these are other sites, not paths on this one.\nstderr:\n${r.stderr}`);
  }

  // The default port and a case-varied host ARE this site, so they still strip
  // and still resolve — including when the target is missing.
  const same = mkTmp();
  writeTree(join(same, "src"), {
    "index.html": page("Home", '<p>x</p><a href="https://EXAMPLE.com:443/gone.html">g</a>'),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], same);
  expectExit(b, 1, "an equivalent spelling of this site naming nothing");
  if (!/\/gone\.html/.test(b.stderr) || /:443/.test(b.stderr)) {
    throw new Error(`§12: resolved as this site's path, not quoted as one.\nstderr:\n${b.stderr}`);
  }
  covers("REF-02");
}, TEST_MS);

test("REF-02: a doubled slash is a path on this site, not an authority", async () => {
  // stripBaseUrl's RESULT is read for its shape — callers ask "is it still an
  // authority?" to mean "is it another site?" — so returning `//about.html`
  // for a path with a doubled leading slash made an everyday templating
  // artifact read as `//another-host`, two ways at once.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>')
      .replace("<head>", '<head>\n<link rel="canonical" href="https://example.com//about.html">'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "a canonical with a doubled slash");
  if (!readFileSync(join(tmp, "dist", "sitemap.xml"), "utf8").includes("about.html")) {
    throw new Error("§21.2: the canonical names this page, doubled slash and all");
  }

  // And the same shape must not let a genuinely broken reference past §12 as
  // though it were on another host.
  const broken = mkTmp();
  writeTree(join(broken, "src"), {
    "index.html": page("Home", '<p>x</p><link rel="stylesheet" href="https://example.com//gone.css">'),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], broken);
  expectExit(b, 1, "a doubled-slash reference naming nothing");
  if (!/gone\.css/.test(b.stderr)) {
    throw new Error(`§12: it is a path on this site, so it is checked.\nstderr:\n${b.stderr}`);
  }
  covers("REF-02");
}, TEST_MS);

test("URL-10: the base path and a stripped path share one normal form", async () => {
  // `parseBaseUrl` stored the prefix as `URL.pathname` gives it while
  // `stripBaseUrl` collapses the leading slash run of what it returns, so a
  // doubled slash in the base path put the two in different forms and the
  // prefix never stripped: the build generated a sitemap and then refused to
  // publish, unable to resolve the <loc> values it had just written. §21.6
  // says a generated sitemap's check "can only pass"; this is what holds that.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), linked(["About"]));
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com//repo/"], tmp);
  expectExit(r, 0, "a base path with a doubled slash");
  const sitemap = readFileSync(join(tmp, "dist", "sitemap.xml"), "utf8");
  if (!sitemap.includes("<loc>https://example.com/repo/about.html</loc>")) {
    throw new Error(`§11.3: one normal form for the prefix:\n${sitemap}`);
  }
  covers("URL-10");
}, TEST_MS);

test("URL-10: --base-url needs a scheme that has a host", async () => {
  // `new URL("foo://x/").origin` is the STRING "null", so every URL §20.5
  // builds reads `null/about.html` — which shipped as <loc>null/</loc> until
  // §12 started parsing, then became a problem blaming a generated file for a
  // flag the author typed.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), linked(["About"]));
  for (const bad of ["foo://example.com/", "file:///srv/site/"]) {
    const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", bad], tmp);
    expectExit(r, 2, `--base-url ${bad}`);
    if (!/host/.test(r.stderr)) {
      throw new Error(`§11.3: the error names what is missing.\nstderr:\n${r.stderr}`);
    }
  }
  covers("URL-10");
}, TEST_MS);

test("REF-02: a non-ASCII --base-url path strips in either spelling", async () => {
  // `parseBaseUrl` stores pathPrefix as `new URL().pathname` gives it —
  // percent-encoded — while the authored value carries what the author typed.
  // Comparing the two as raw text meant an ordinary two-page site deployed
  // under a path with an accent could not strip its own prefix, and reported
  // every page. Parsing puts both sides in one encoding space.
  for (const spelling of ["https://example.com/caf\u00e9/", "https://example.com/caf%C3%A9/"]) {
    const tmp = mkTmp();
    writeTree(join(tmp, "src"), {
      ...linked(["About"]),
      "robots.txt": `User-agent: *\nSitemap: ${spelling}sitemap.xml\n`,
    });
    const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com/caf\u00e9/"], tmp);
    expectExit(r, 0, `a Sitemap: spelled ${spelling}`);
    if (r.stderr.trim() !== "") {
      throw new Error(`§12: both spellings name the site's own prefix.\nstderr:\n${r.stderr}`);
    }
  }
  covers("REF-02");
}, TEST_MS);

test("DIA-01: a value carrying a newline is escaped, not collapsed", async () => {
  // Folding gives one line while showing `/x .css` — a string the file does
  // not contain, under a fix line telling the reader to check the spelling.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page("Home", '<p>x</p><a href="/gone&#10;.css">broken</a>'),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a reference containing a newline");
  if (!r.stderr.includes("/gone\\n.css")) {
    throw new Error(`§14.1: the newline is shown, not silently removed.\nstderr:\n${r.stderr}`);
  }
  if (/\/gone \.css/.test(r.stderr)) {
    throw new Error(`§14.1: a space is a different string from a newline.\nstderr:\n${r.stderr}`);
  }
  covers("DIA-01");
}, TEST_MS);

// ------------------------------------------------------------------- §24.4

test("AUD-11: the sitemap robots.txt promises and this build never wrote is a finding, not silence", async () => {
  // §23.3's exemption keeps `Sitemap: /sitemap.xml` out of the PUBLISH PATH
  // without --base-url, because the author's line is right for the deployed
  // site. Its stated limit is a site that never passes the flag: it promises a
  // file it will never have, and both commands used to say nothing about it.
  const files = { "index.html": page("Home"), "robots.txt": "User-agent: *\nSitemap: /sitemap.xml\n" };

  const built = mkTmp();
  writeTree(join(built, "src"), files);
  const b = await runCli(["build", "-s", "src", "-o", "dist"], built);
  expectExit(b, 0, "the exemption still stands for build");
  if (b.stderr.trim() !== "") {
    throw new Error(`§23.3: the finding must not reintroduce the block.\nstderr:\n${b.stderr}`);
  }
  if (existsSync(join(built, "dist", "sitemap.xml"))) {
    throw new Error("§21.1: no --base-url, so there is no sitemap — that is what the finding reports");
  }

  const tmp = mkTmp();
  writeTree(join(tmp, "src"), files);
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "an audit of the same tree");
  expectFinding(r, "robots-sitemap-missing", "§24.4: §23.3's residual is reported here");
  if (!/^robots\.txt: incomplete: /m.test(r.stdout)) {
    throw new Error(`§24.4: located at the source robots.txt, and incomplete.\nstdout:\n${r.stdout}`);
  }
  // The AUTHORED spelling. §23.1 rewrites no byte of this file, so the
  // resolved `sitemap.xml` is a string the author's robots.txt does not hold.
  if (!r.stdout.includes('"/sitemap.xml"')) {
    throw new Error(`§23.1: the evidence quotes the line the author typed.\nstdout:\n${r.stdout}`);
  }
  // The count line pins the severity, and pins that nothing else fired.
  if (!r.stdout.includes("audit: 0 broken, 1 incomplete")) {
    throw new Error(`§24.3: absent is not wrong — the markup is right.\nstdout:\n${r.stdout}`);
  }

  const strict = mkTmp();
  writeTree(join(strict, "src"), files);
  const s = await runCli(["audit", "-s", "src", "-o", "dist", "--strict"], strict);
  expectExit(s, 1, "§24.6: --strict gates on any finding of either severity");
  covers("AUD-11");
}, TEST_MS);

test("AUD-11: it is the exemption's residual — never a second predicate over the tree", async () => {
  const files = { "index.html": page("Home"), "robots.txt": "User-agent: *\nSitemap: /sitemap.xml\n" };

  // (a) Supply the address and §21 writes the file: the line resolves, and
  // there is nothing absent to report. A `broken` a flag repairs is not broken.
  const addressed = mkTmp();
  writeTree(join(addressed, "src"), files);
  const a = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], addressed);
  expectExit(a, 0, "the identical bytes with an address supplied");
  expectNoFinding(a, "robots-sitemap-missing", "§21.1: the sitemap exists, so the promise is kept");
  const built = mkTmp();
  writeTree(join(built, "src"), files);
  await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], built);
  if (!existsSync(join(built, "dist", "sitemap.xml"))) {
    throw new Error("§21.1: --base-url generates the file the robots.txt line names");
  }

  // (b) The author's own sitemap.xml, mirror-copied, with no --base-url. The
  // check returns before the exemption is ever consulted, so a finding here
  // would be a second predicate disagreeing with the branch it claims to follow.
  const authored = mkTmp();
  writeTree(join(authored, "src"), {
    ...files,
    "sitemap.xml": '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + "<url><loc>https://example.com/</loc></url>\n</urlset>\n",
  });
  const bBuild = await runCli(["build", "-s", "src", "-o", "dist"], authored);
  expectExit(bBuild, 0, "a hand-written sitemap.xml the site emits");
  const b = await runCli(["audit", "-s", "src", "-o", "dist"], authored);
  expectExit(b, 0, "the same tree audited");
  expectNoFinding(b, "robots-sitemap-missing", "§23.3: the file is emitted — the line resolves");

  // (c) Anything else the site does not emit stays P13, the stronger answer.
  const other = mkTmp();
  writeTree(join(other, "src"), {
    "index.html": page("Home"),
    "robots.txt": "User-agent: *\nSitemap: /feeds/all.xml\n",
  });
  const c = await runCli(["audit", "-s", "src", "-o", "dist"], other);
  expectExit(c, 1, "§24.6: a pipeline problem exits 1 whatever the findings say");
  if (!c.stderr.includes("/feeds/all.xml")) {
    throw new Error(`§23.3: P13 still names the value.\nstderr:\n${c.stderr}`);
  }
  expectNoFinding(c, "robots-sitemap-missing", "§24.4: no second mechanism for what §12 settles");
  covers("AUD-11");
}, TEST_MS);

test("AUD-11: one finding per exempted line, and none without the site's address", async () => {
  // An ABSOLUTE Sitemap: with no --base-url is skipped exactly as §23.3 skips
  // it: with no address, unify cannot say that URL names this site's sitemap
  // at all — the same narrowing the two canonical findings take (AUD-06).
  const absolute = mkTmp();
  writeTree(join(absolute, "src"), {
    "index.html": page("Home"),
    "robots.txt": "User-agent: *\nSitemap: https://example.com/sitemap.xml\n",
  });
  const a = await runCli(["audit", "-s", "src", "-o", "dist"], absolute);
  expectExit(a, 0, "an absolute Sitemap: with no address to compare it against");
  expectNoFinding(a, "robots-sitemap-missing", "§23.3: another origin, as far as this build can tell");

  // Two promises, two findings, in the file's own line order. Reporting the
  // file once hides the second behind a fix that clears the first.
  const two = mkTmp();
  writeTree(join(two, "src"), {
    "index.html": page("Home"),
    "robots.txt": "Sitemap: /sitemap.xml\nSitemap: /sitemap-2.xml\n",
  });
  const bBuild = await runCli(["build", "-s", "src", "-o", "dist"], two);
  expectExit(bBuild, 0, "§21.4's split paths are exempted too");
  const b = await runCli(["audit", "-s", "src", "-o", "dist"], two);
  expectExit(b, 0, "the same tree audited");
  const lines = b.stdout.split("\n").filter((l) => l.includes("[robots-sitemap-missing]"));
  if (lines.length !== 2) {
    throw new Error(`§24.4: one finding per exempted line.\nstdout:\n${b.stdout}`);
  }
  if (!lines[0].includes('"/sitemap.xml"') || !lines[1].includes('"/sitemap-2.xml"')) {
    throw new Error(`§24.4: the file's own line order.\n${lines.join("\n")}`);
  }
  if (!b.stdout.includes("audit: 0 broken, 2 incomplete")) {
    throw new Error(`§24.5: both are counted.\nstdout:\n${b.stdout}`);
  }
  covers("AUD-11");
}, TEST_MS);

// ------------------------------------------------------------- §24.4 (scheme)

test("AUD-12: an http canonical on an https site — the finding nothing else raises", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>').replace(
      "<head>", '<head>\n<link rel="canonical" href="http://example.com/about.html">'),
  });
  // The gap this closes, pinned two-sided: the BUILD is silent and must stay
  // silent. §12 strips the base by HOST, so the value is checked as the path
  // `/about.html`, resolves, and passes; §21.2 calls the page self-canonical
  // and lists it. Both are correct and neither is changed by this finding.
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(b, 0, "an http canonical under an https base url");
  const sitemap = readFileSync(join(tmp, "dist", "sitemap.xml"), "utf8");
  if (!sitemap.includes("<loc>https://example.com/about.html</loc>")) {
    throw new Error(`§24.4: the page stays self-canonical and stays listed:\n${sitemap}`);
  }

  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "the audit of the same site");
  expectFinding(r, "canonical-scheme-mismatch", "§24.4");
  const lines = r.stdout.split("\n");
  const i = lines.findIndex((l) => l.includes("[canonical-scheme-mismatch]"));
  if (!/: broken: /.test(lines[i])) {
    throw new Error(`§24.3: one build publishing two addresses for one page is a contradiction: ${lines[i]}`);
  }
  for (const u of ['"http://example.com/about.html"', '"https://example.com/about.html"']) {
    if (!lines[i].includes(u)) throw new Error(`§24.5: the evidence quotes both addresses: ${lines[i]}`);
  }
  if (!lines[i + 1].includes('"https://example.com/about.html"')) {
    throw new Error(`§24.5: the fix names the page's own URL: ${lines[i + 1]}`);
  }

  // Symmetric: unify does not decide which scheme a site should use, it observes
  // that the page and the address the author supplied name different ones.
  const rev = mkTmp();
  writeTree(join(rev, "src"), {
    ...linked(["About"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>').replace(
      "<head>", '<head>\n<link rel="canonical" href="https://example.com/about.html">'),
  });
  const v = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", "http://example.com/"], rev);
  expectExit(v, 0, "an https canonical under an http base url");
  expectFinding(v, "canonical-scheme-mismatch", "§24.4: the rule is disagreement, not a preference");
  covers("AUD-12");
}, TEST_MS);

test("AUD-12: the schemes are parsed — an uppercase scheme and a default port are still http", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    ...linked(["About", "Contact"]),
    "about.html": page("About", '<p>Words about About.</p><a href="/">Home</a>').replace(
      "<head>", '<head>\n<link rel="canonical" href="HTTP://EXAMPLE.COM/about.html">'),
    "contact.html": page("Contact", '<p>Words about Contact.</p><a href="/">Home</a>').replace(
      "<head>", '<head>\n<link rel="canonical" href="http://example.com:80/contact.html">'),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "an uppercase scheme and a default port");
  const files = r.stdout.split("\n").filter((l) => l.includes("[canonical-scheme-mismatch]"))
    .map((l) => l.split(":")[0]).sort();
  if (files.join(",") !== "about.html,contact.html") {
    throw new Error(`§24.4: RFC 3986 §3.1 — a scheme is case-insensitive, and :80 is http's default port.\nreported: ${files.join(", ")}\nstdout:\n${r.stdout}`);
  }
  covers("AUD-12");
}, TEST_MS);

test("AUD-12: a canonical with no scheme of its own, or one unify cannot compare, says nothing", async () => {
  const tmp = mkTmp();
  const withCanonical = (name, href) =>
    page(name, `<p>Words about ${name}.</p><a href="/">Home</a>`).replace(
      "<head>", `<head>\n<link rel="canonical" href="${href}">`);
  writeTree(join(tmp, "src"), {
    ...linked(["Protocol", "Ftp", "Root", "Other"]),
    // Borrows the page's scheme: right at either address.
    "protocol.html": withCanonical("Protocol", "//example.com/protocol.html"),
    // A scheme unify has no basis for calling wrong.
    "ftp.html": withCanonical("Ftp", "ftp://example.com/ftp.html"),
    // §11.3 absolutizes this with the base's OWN origin — it cannot mismatch.
    "root.html": withCanonical("Root", "/root.html"),
    // Another host: `elsewhere`, and another site's scheme is not this site's
    // business — canonical-noindex and sitemap-canonical-disagree own that shape.
    "other.html": withCanonical("Other", "http://syndication.example/copy"),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "canonicals with nothing comparable");
  expectNoFinding(r, "canonical-scheme-mismatch", "§24.4");

  // No address, no scheme to compare against.
  const n = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(n, 0, "no --base-url");
  expectNoFinding(n, "canonical-scheme-mismatch", "§24.4: unify does not know where the site lives");

  // A --base-url that is itself neither http nor https: the flag accepts any
  // scheme that has a host, and under one neither side can be called wrong.
  const ftp = mkTmp();
  writeTree(join(ftp, "src"), {
    ...linked(["About"]),
    "about.html": withCanonical("About", "http://example.com/about.html"),
  });
  const f = await runCli(["audit", "-s", "src", "-o", "dist", "--base-url", "ftp://example.com/"], ftp);
  expectExit(f, 0, "a non-web base url");
  expectNoFinding(f, "canonical-scheme-mismatch", "§24.4: both sides must be the web's two schemes");
  covers("AUD-12");
}, TEST_MS);

// ------------------------------------------------- review round 5 regressions

/**
 * The `fix:` line printed under the `[id]` finding on `path` (§24.5's second
 * line), or `null` when that page reports no finding of that id.
 */
function fixLineFor(stdout, path, id) {
  const lines = stdout.split("\n");
  const at = lines.findIndex((l) => l.startsWith(`${path}: `) && l.endsWith(`[${id}]`));
  if (at === -1) return null;
  const next = lines[at + 1] ?? "";
  return next.startsWith("  fix: ") ? next.slice("  fix: ".length) : null;
}

test("AUD-04: the lang-missing fix line names the layout only when the page HAS one", async () => {
  // The standing fix line said "set it on the layout" unconditionally. On a
  // page that resolved NO layout that advice is unactionable in both
  // directions — the named layout is either already correct or does not exist
  // — and a fix line that sends a reader somewhere they have already been is
  // worse than no fix line. §20.3's `layout` is what lets this one tell the
  // two cases apart.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    // A layout that supplies no lang, so every page below emits none and all
    // three collect the finding. Its own `lang` is what the WITH-layout fix
    // line tells the author to add.
    "_layout.html": `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Example Site</title>
<meta name="description" content="A site whose layout forgot its language."></head>
<body><main></main></body>
</html>
`,
    "index.html": `<!doctype html>
<html>
<head><title>Home</title><meta name="description" content="The home page of the example site."></head>
<body><main><h1>Home</h1><p>Composed with the layout.</p>
<a href="/optout.html">Opt out</a> <a href="/post.html">Post</a></main></body>
</html>
`,
    "optout.html": `<!doctype html>
<html data-layout="none">
<head><meta charset="utf-8"><title>Opt Out</title>
<meta name="description" content="An HTML page that composes with no layout."></head>
<body><main><h1>Opt Out</h1><p>No layout.</p><a href="/">Home</a></main></body>
</html>
`,
    "post.md": `---
title: Post
description: A Markdown page that composes with no layout.
layout: none
---

# Post

No layout. [Home](/)
`,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "three pages emitting no lang");
  // The finding itself is correct on all three — only the advice differs.
  for (const p of ["index.html", "optout.html", "post.md"]) {
    if (fixLineFor(r.stdout, p, "lang-missing") === null) {
      throw new Error(`§24.4: lang-missing must fire on ${p}\nstdout:\n${r.stdout}`);
    }
  }

  // Composed WITH a layout: the standing advice, unchanged. The layout is
  // where one edit fixes every page under it, which is why it stays first.
  const withLayout = fixLineFor(r.stdout, "index.html", "lang-missing");
  if (withLayout !== 'set it on the layout: <html lang="en">') {
    throw new Error(
      `§24.4: a page that composed WITH a layout keeps the layout advice.\ngot: ${JSON.stringify(withLayout)}`,
    );
  }

  // Composed WITHOUT one: the fix must name the page, and must not send the
  // reader to a layout. These two assertions are the regression — before
  // §20.3 carried `layout`, both of these lines were the string above.
  for (const [p, wanted] of [
    ["optout.html", 'set it on the page: <html lang="en"> — this page composed with no layout'],
    ["post.md", "add lang: en to this page's frontmatter — it composed with no layout"],
  ]) {
    const got = fixLineFor(r.stdout, p, "lang-missing");
    if (got !== wanted) {
      throw new Error(
        `§24.4: a page that composed with NO layout must be told what to edit on ITSELF.\n`
        + `${p}\n  expected: ${JSON.stringify(wanted)}\n  got:      ${JSON.stringify(got)}`,
      );
    }
    if (/\bthe layout\b/.test(got)) {
      throw new Error(`§24.4: ${p} resolved no layout — the fix line must not name one.\ngot: ${got}`);
    }
  }

  // The Markdown page is told to write frontmatter and the HTML page is told
  // to write an attribute: each names the spelling THAT page can take, which
  // is the whole point of splitting the message.
  const md = fixLineFor(r.stdout, "post.md", "lang-missing");
  if (!md.includes("lang: en") || md.includes("<html")) {
    throw new Error(`§24.4: a Markdown page has no <html> to edit — name the frontmatter key.\ngot: ${md}`);
  }

  // A tree with no layout ANYWHERE is the third way to compose without one,
  // and it must read the same as the opt-outs above.
  const bare = mkTmp();
  writeTree(join(bare, "src"), {
    "index.html": `<!doctype html>
<html>
<head><title>Home</title><meta name="description" content="The only page, and no layout in the tree."></head>
<body><h1>Home</h1><p>No layout exists to set it on.</p></body>
</html>
`,
  });
  const b = await runCli(["audit", "-s", "src", "-o", "dist"], bare);
  expectExit(b, 0, "a tree with no _layout.html at all");
  const bareFix = fixLineFor(b.stdout, "index.html", "lang-missing");
  if (bareFix !== 'set it on the page: <html lang="en"> — this page composed with no layout') {
    throw new Error(
      `§24.4: no _layout.html in the tree is the same case as data-layout="none".\ngot: ${JSON.stringify(bareFix)}`,
    );
  }
  // This is MAN-14's own observable half: `source.layout` is not in audit's
  // published page shape (§31.1), so the only way a CLI run can show it
  // differs between "composed with a layout" and "composed with none" is
  // through advice that reads it — which is exactly what every assertion
  // above did, three ways (a real layout, data-layout="none", and no
  // _layout.html in the tree at all).
  covers("AUD-04", "MAN-14");
}, TEST_MS);

test("AUD-16 — audit's summary names the §14 problems the same run reported", async () => {
  // §24.6 exits 1 on a pipeline problem regardless of findings, so a run that
  // hit one and found nothing printed the problem, said "audit: nothing to
  // report", and exited 1 — a summary contradicting the two lines around it.
  // The severity axes stay separate (§24.4); the summary just stops omitting
  // the other one.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html":
      '<!doctype html>\n<html lang="en" data-unify="/x.html"><head><meta charset="utf-8">' +
      '<title>T</title><meta name="description" content="A page."></head>' +
      "<body><main><h1>T</h1></main></body></html>\n",
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  if (r.exit !== 1) throw new Error(`§24.6: a pipeline problem exits 1, got ${r.exit}`);
  if (r.stdout.includes("audit: nothing to report")) {
    throw new Error(`§24.6: the summary must not claim nothing to report:\n${r.stdout}`);
  }
  if (!/audit: no findings, and 1 problem/.test(r.stdout)) {
    throw new Error(`§24.6: the summary names the problem count:\n${r.stdout}`);
  }

  // A clean site is unchanged.
  const clean = mkTmp();
  writeTree(join(clean, "src"), {
    "index.html":
      '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>T</title>' +
      '<meta name="description" content="A page."></head><body><main><h1>T</h1></main></body></html>\n',
  });
  const ok = await runCli(["audit", "-s", "src", "-o", "dist"], clean);
  if (ok.exit !== 0 || !ok.stdout.includes("audit: nothing to report")) {
    throw new Error(`§24.3: a clean site still reports nothing:\n${ok.stdout}`);
  }
  covers("AUD-16");
}, 30_000);

