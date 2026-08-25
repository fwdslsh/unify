/**
 * §30 the catalog and the search corpus — SRCH-01..07, replacing the retired
 * search-manifest coverage (SRCH-01..03 against `search-index.js`).
 *
 * Written from docs/conformance-spec.md §30 alone — nothing here imports
 * src/**, and every assertion traces to a sentence in that section (or in
 * §20, §21.2, or §21.5, which §30 explicitly reuses rather than restates).
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 *
 * Two artifacts, one file, following the sitemap.test.js/feed.test.js
 * precedent of covering a whole §-section's normative surface in one place
 * rather than splitting by output file: `catalog.json` and
 * `search-corpus.json` share activation independence, membership, the
 * suppression/collision rule, and determinism, so testing them side by side
 * is what proves the two files can never silently disagree.
 *
 * The two-sided convention, same as sitemap.test.js: every rule that fires
 * has an adjacent case where it must not, and every silence (a page absent
 * from either file, a flag not passed) sits beside a positive control in the
 * same run so it cannot pass against a feature that was never wired up.
 */
import { test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const BASE = "https://example.com/";
const CATALOG_PATH = "assets/unify/catalog.json";
const CORPUS_PATH = "assets/unify/search-corpus.json";

// --------------------------------------------------------------- fixtures

/**
 * A complete standalone HTML page. No layout anywhere in these fixtures, so
 * §3's preservation rule means the emitted bytes are exactly these bytes.
 */
function page({ title = "Page", description = null, canonical = null, robots = null, head = "", body = "<p>x</p>" } = {}) {
  const bits = [`<meta charset="utf-8">`];
  if (title !== null) bits.push(`<title>${title}</title>`);
  if (description !== null) bits.push(`<meta name="description" content="${description}">`);
  if (robots !== null) bits.push(`<meta name="robots" content="${robots}">`);
  if (canonical !== null) bits.push(`<link rel="canonical" href="${canonical}">`);
  if (head) bits.push(head);
  return `<!doctype html>\n<html lang="en">\n<head>\n${bits.join("\n")}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

// ----------------------------------------------------------------- helpers

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectBytes(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what}\n--- expected ---\n${JSON.stringify(expected)}\n--- actual ---\n${JSON.stringify(actual)}`);
  }
}

function read(...parts) {
  return readFileSync(join(...parts), "utf8");
}

function readCatalogRaw(tmp) {
  return read(tmp, "dist", ...CATALOG_PATH.split("/"));
}
function readCorpusRaw(tmp) {
  return read(tmp, "dist", ...CORPUS_PATH.split("/"));
}

function parseJsonFile(raw, name) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${name} does not parse as JSON (${e.message})\n${raw}`);
  }
}

/** §30.2/§30.3 fix key list AND ORDER; JSON.stringify(Object.keys(...)) checks both in one comparison. */
function expectKeyList(obj, keys, what) {
  const got = JSON.stringify(Object.keys(obj));
  const want = JSON.stringify(keys);
  if (got !== want) {
    throw new Error(`${what}\n  expected: ${want}\n  actual:   ${got}`);
  }
}

// ------------------------------------------------------------------- §30.1

test("SRCH-01: two independent flags — absent, neither file is generated or reported; each activates alone; both together give both; neither needs --base-url", async () => {
  const files = { "index.html": page({ title: "Home" }), "about.html": page({ title: "About" }) };

  // (a) No flag at all: nothing written, nothing said.
  const noFlag = mkTmp();
  writeTree(join(noFlag, "src"), files);
  const a = await runCli(["build", "-s", "src", "-o", "dist"], noFlag);
  expectExit(a, 0, "no-flag build");
  if (existsSync(join(noFlag, "dist", "assets"))) {
    throw new Error("§30.1: neither flag was passed — no assets/unify/ directory should exist at all");
  }
  if (/catalog|corpus/i.test(a.stdout) || /catalog|corpus/i.test(a.stderr)) {
    throw new Error(`§30.1: a build with neither flag must report nothing about either file.\nstdout:\n${a.stdout}\nstderr:\n${a.stderr}`);
  }

  // (b) --catalog alone: catalog written, corpus absent.
  const catOnly = mkTmp();
  writeTree(join(catOnly, "src"), files);
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--catalog"], catOnly);
  expectExit(b, 0, "catalog-only build");
  if (!existsSync(join(catOnly, "dist", CATALOG_PATH))) throw new Error("§30.1: --catalog must write catalog.json");
  if (existsSync(join(catOnly, "dist", CORPUS_PATH))) {
    throw new Error("§30.1: --catalog must NOT imply --search-corpus");
  }

  // (c) --search-corpus alone: corpus written, catalog absent.
  const corpusOnly = mkTmp();
  writeTree(join(corpusOnly, "src"), files);
  const c = await runCli(["build", "-s", "src", "-o", "dist", "--search-corpus"], corpusOnly);
  expectExit(c, 0, "corpus-only build");
  if (!existsSync(join(corpusOnly, "dist", CORPUS_PATH))) throw new Error("§30.1: --search-corpus must write search-corpus.json");
  if (existsSync(join(corpusOnly, "dist", CATALOG_PATH))) {
    throw new Error("§30.1: --search-corpus must NOT imply --catalog");
  }

  // (d) Both flags, no --base-url at all: both are written — activation is
  // ungated by a site address (§30.1's own paragraph on this).
  const both = mkTmp();
  writeTree(join(both, "src"), files);
  const d = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus"], both);
  expectExit(d, 0, "both-flags build, no base-url");
  if (!existsSync(join(both, "dist", CATALOG_PATH)) || !existsSync(join(both, "dist", CORPUS_PATH))) {
    throw new Error("§30.1: both flags together must write both files, with no --base-url required");
  }
  covers("SRCH-01");
}, TEST_MS);

test("SRCH-01: --dry-run shows each as its own write row, named by the flag that produced it, and writes nothing to disk", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page({ title: "Home" }) });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus", "--dry-run"], tmp);
  expectExit(r, 0, "dry-run");
  if (!r.stdout.includes(`write dist/${CATALOG_PATH} (/${CATALOG_PATH}) ← generated (--catalog)`)) {
    throw new Error(`§30.1: --dry-run must show the catalog as a write row naming --catalog.\nstdout:\n${r.stdout}`);
  }
  if (!r.stdout.includes(`write dist/${CORPUS_PATH} (/${CORPUS_PATH}) ← generated (--search-corpus)`)) {
    throw new Error(`§30.1: --dry-run must show the corpus as a write row naming --search-corpus.\nstdout:\n${r.stdout}`);
  }
  if (existsSync(join(tmp, "dist"))) {
    throw new Error("§17: --dry-run must write nothing at all, generated artifacts included");
  }
  covers("SRCH-01");
}, TEST_MS);

test("SRCH-01/§30.6: a build that reports a problem publishes neither file", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": page({ title: "Home", body: `<a href="/gone.html">gone</a>` }) });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus"], tmp);
  expectExit(r, 1, "broken-reference build");
  if (existsSync(join(tmp, "dist", "assets"))) {
    throw new Error("§15/§30.6: both generated artifacts must participate in transactional publish — nothing ships when a problem blocks the build");
  }
  covers("SRCH-01", "SRCH-06");
}, TEST_MS);

// ------------------------------------------------------------------- §30.2

test('SRCH-02: catalog top-level keys are exactly ["schemaVersion","baseUrl","pages"]; a page\'s keys are exactly ["path","url","html","head","body"] in that order', async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "full.html": page({
      title: "Full Page",
      description: "A description.",
      body: '<h1 id="top">Full Page</h1>\n<h2>Sub</h2>\n<p>Hello world.</p>',
    }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog"], tmp);
  expectExit(r, 0, "shape build");
  const data = parseJsonFile(readCatalogRaw(tmp), "catalog.json");

  expectKeyList(data, ["schemaVersion", "baseUrl", "pages"], "§30.2: top-level keys, in order");
  if (data.schemaVersion !== 1) throw new Error(`§30.2: schemaVersion must be the number 1.\n  actual: ${JSON.stringify(data.schemaVersion)}`);
  if (data.baseUrl !== null) throw new Error(`§30.2: baseUrl must be null with no --base-url.\n  actual: ${JSON.stringify(data.baseUrl)}`);
  if (data.pages.length !== 1) throw new Error(`§30.4: expected exactly 1 page.\n${readCatalogRaw(tmp)}`);
  expectKeyList(data.pages[0], ["path", "url", "html", "head", "body"], "§30.2: a page's keys, in order, with no others");

  const p = data.pages[0];
  if (p.path !== "/full.html") throw new Error(`§30.2: path must be document.path.\n  actual: ${JSON.stringify(p.path)}`);
  if (p.url !== null) throw new Error(`§30.2: url must be null with no --base-url.\n  actual: ${JSON.stringify(p.url)}`);
  if (p.html.attributes.lang !== "en") throw new Error(`§30.2: html.attributes must carry the emitted <html>'s attributes.\n  actual: ${JSON.stringify(p.html)}`);
  if (p.head.title !== "Full Page") throw new Error(`§30.2: head.title must be the page's title.\n  actual: ${JSON.stringify(p.head.title)}`);
  const headings = p.body.headings;
  if (headings.length !== 2 || headings[0].id !== "top" || headings[0].text !== "Full Page" || headings[1].id !== null || headings[1].text !== "Sub") {
    throw new Error(`§30.2: body.headings must be the flat heading sequence.\n  actual: ${JSON.stringify(headings)}`);
  }
  covers("SRCH-02");
}, TEST_MS);

test('SRCH-03: search-corpus top-level keys are exactly ["schemaVersion","pages"]; a page\'s keys are EXACTLY ["path","text"] — no url, title, description, or headings', async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "full.html": page({
      title: "Full Page",
      description: "A description.",
      body: '<h1 id="top">Full Page</h1>\n<p>Hello world.</p>',
    }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--search-corpus"], tmp);
  expectExit(r, 0, "corpus shape build");
  const data = parseJsonFile(readCorpusRaw(tmp), "search-corpus.json");

  expectKeyList(data, ["schemaVersion", "pages"], "§30.3: top-level keys, in order");
  if (data.schemaVersion !== 1) throw new Error(`§30.3: schemaVersion must be 1.\n  actual: ${JSON.stringify(data.schemaVersion)}`);
  if (data.pages.length !== 1) throw new Error(`§30.4: expected exactly 1 page.`);
  expectKeyList(data.pages[0], ["path", "text"], "§30.3: a page's keys are EXACTLY path and text, nothing else");
  if (data.pages[0].path !== "/full.html") throw new Error(`§30.3: path must be document.path.\n  actual: ${JSON.stringify(data.pages[0].path)}`);
  if (data.pages[0].text !== "Full Page Hello world.") {
    throw new Error(`§30.3: text must be analysis.visibleText.\n  actual: ${JSON.stringify(data.pages[0].text)}`);
  }
  covers("SRCH-03");
}, TEST_MS);

test("SRCH-02: arbitrary repeated metadata — tags written twice, a custom key, and an og: property entry — all survive in the catalog with order and every attribute intact", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "post.md": `---
title: Unify and HTMX
description: A practical static-site architecture.
tags:
  - unify
  - htmx
series: architecture-notes
og:
  title: Unify and HTMX
  image: /card.png
---

# Unify and HTMX

Body text nobody should see in the catalog.
`,
    "card.png": "not a real image, just a resolvable reference target",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog"], tmp);
  expectExit(r, 0, "repeated-metadata build");
  const data = parseJsonFile(readCatalogRaw(tmp), "catalog.json");
  const meta = data.pages[0].head.meta.filter((m) => m.charset === undefined);
  const expected = [
    { name: "description", content: "A practical static-site architecture." },
    { name: "tags", content: "unify" },
    { name: "tags", content: "htmx" },
    { name: "series", content: "architecture-notes" },
    { property: "og:title", content: "Unify and HTMX" },
    { property: "og:image", content: "/card.png" },
  ];
  if (JSON.stringify(meta) !== JSON.stringify(expected)) {
    throw new Error(`§30.2: repeated tags, a custom key, and og: entries must all survive in declaration order with every attribute.\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(meta)}`);
  }
  covers("SRCH-02");
}, TEST_MS);

test("SRCH-02: no body text and no JSON-LD script bodies ever reach the catalog, even when a distinctive phrase and a JSON-LD block are both present on the page", async () => {
  const tmp = mkTmp();
  const marker = "ZZZ-CATALOG-MUST-NEVER-CARRY-THIS-BODY-PHRASE-ZZZ";
  writeTree(join(tmp, "src"), {
    "index.html": page({
      title: "Article",
      body: `<h1>Article</h1><p>${marker} and more prose that only belongs in the corpus.</p>` +
        `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Article body carried inside JSON-LD, ${marker}-LD"}</script>`,
    }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus"], tmp);
  expectExit(r, 0, "no-body-text build");
  const catalogRaw = readCatalogRaw(tmp);
  const corpusRaw = readCorpusRaw(tmp);
  if (catalogRaw.includes(marker)) {
    throw new Error(`§30.2: no body text may ever reach catalog.json — the marker phrase was found in it.\n${catalogRaw}`);
  }
  if (catalogRaw.includes("headline")) {
    throw new Error(`§30.2: no JSON-LD script body may ever reach catalog.json.\n${catalogRaw}`);
  }
  if (!corpusRaw.includes(marker)) {
    throw new Error(`§30.3: the same marker phrase must appear in search-corpus.json's text — that is where body text belongs.\n${corpusRaw}`);
  }
  covers("SRCH-02", "SRCH-03");
}, TEST_MS);

test("SRCH-02/SRCH-03: a long article grows the corpus, not the catalog, beyond its own head data and headings", async () => {
  const tmp = mkTmp();
  const filler = Array.from({ length: 200 }, (_, i) => `<p>Paragraph number ${i} of a long article body.</p>`).join("\n");
  writeTree(join(tmp, "src"), {
    "short.html": page({ title: "Short", body: "<h1>Short</h1><p>One short paragraph.</p>" }),
    "long.html": page({ title: "Long", body: `<h1>Long</h1>\n${filler}` }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus"], tmp);
  expectExit(r, 0, "long-article build");
  const catalog = parseJsonFile(readCatalogRaw(tmp), "catalog.json");
  const corpus = parseJsonFile(readCorpusRaw(tmp), "search-corpus.json");
  const catShort = catalog.pages.find((p) => p.path === "/short.html");
  const catLong = catalog.pages.find((p) => p.path === "/long.html");
  const corpShort = corpus.pages.find((p) => p.path === "/short.html");
  const corpLong = corpus.pages.find((p) => p.path === "/long.html");

  // The catalog entries differ only by title/heading text, not by article
  // length — a 200-paragraph body must not inflate the catalog's own bytes.
  const catShortSize = JSON.stringify(catShort).length;
  const catLongSize = JSON.stringify(catLong).length;
  if (catLongSize - catShortSize > 200) {
    throw new Error(`§30.2: the catalog entry for a long article must not grow with its body length (only head/headings can differ).\n  short: ${catShortSize} bytes, long: ${catLongSize} bytes`);
  }
  // The corpus, by contrast, must reflect the real difference in body length.
  if (corpLong.text.length - corpShort.text.length < 2000) {
    throw new Error(`§30.3: the corpus text for the long article must be substantially longer than the short one's.\n  short: ${corpShort.text.length} chars, long: ${corpLong.text.length} chars`);
  }
  covers("SRCH-02", "SRCH-03");
}, TEST_MS);

// ------------------------------------------------------------------- §30.4

test("SRCH-04: membership is shared — noindex, none, 404.html, and a canonical elsewhere (on-site or off) are absent from BOTH files, with a positive control and a nofollow-only control proving the absence is not vacuous", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page({ title: "Home" }), // positive control: must be present
    "hidden.html": page({ title: "Hidden", robots: "noindex" }), // excluded: noindex
    "nofollow.html": page({ title: "Nofollow", robots: "nofollow" }), // control: kept
    "none.html": page({ title: "None", robots: "none" }), // excluded: none implies noindex
    "404.html": page({ title: "Not found" }), // excluded: not a destination
    "dupe.html": page({ title: "Dupe", canonical: "/index.html" }), // excluded: consolidated
    "self.html": page({ title: "Self", canonical: "/self.html" }), // control: self-canonical
    "away.html": page({ title: "Away", canonical: "https://elsewhere.example/x" }), // excluded: off-site
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus", "--base-url", BASE], tmp);
  expectExit(r, 0, "membership build");
  const catalog = parseJsonFile(readCatalogRaw(tmp), "catalog.json");
  const corpus = parseJsonFile(readCorpusRaw(tmp), "search-corpus.json");
  const expected = ["https://example.com/", "https://example.com/nofollow.html", "https://example.com/self.html"];
  const catalogUrls = catalog.pages.map((p) => p.url);
  const corpusPaths = corpus.pages.map((p) => p.path);
  const catalogPaths = catalog.pages.map((p) => p.path);
  if (JSON.stringify(catalogUrls) !== JSON.stringify(expected)) {
    throw new Error(`§30.4: catalog membership must be exactly §21.2's predicate.\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(catalogUrls)}`);
  }
  // The same page set in both files, proven by comparing path (the shared
  // join key) rather than url — catalog.json has both, search-corpus.json
  // only path, so path is the one field both sides can compare.
  if (JSON.stringify(catalogPaths) !== JSON.stringify(corpusPaths)) {
    throw new Error(`§30.4: catalog.json and search-corpus.json must describe the IDENTICAL page set, in the identical order.\n  catalog paths: ${JSON.stringify(catalogPaths)}\n  corpus paths:  ${JSON.stringify(corpusPaths)}`);
  }
  covers("SRCH-04");
}, TEST_MS);

// ------------------------------------------------------------------- §30.5

test("SRCH-05: an authored NON-BREAKING SPACE (U+00A0) survives in the emitted page but is folded to an ordinary space in search-corpus.json's text", async () => {
  const tmp = mkTmp();
  const NBSP = "\u00A0"; // explicit escape — never a literal byte pasted into this source
  const body = `<p>New${NBSP}York${NBSP}office${NBSP}hours</p>`;
  writeTree(join(tmp, "src"), { "index.html": page({ body }) });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus"], tmp);
  expectExit(r, 0, "nbsp build");

  // §20.3's own rule: the emitted page keeps the author's NBSP verbatim.
  const emitted = read(tmp, "dist", "index.html");
  if (!emitted.includes(NBSP)) {
    throw new Error(`§20.3: the emitted page must keep the author's U+00A0 — this build must never touch source content.\n${emitted}`);
  }

  // §30.5: the corpus is where the fold happens, and the only place.
  const corpus = parseJsonFile(readCorpusRaw(tmp), "search-corpus.json");
  const text = corpus.pages[0].text;
  if (text !== "New York office hours") {
    throw new Error(`§30.5: an NBSP-joined phrase must fold to ordinary spaces in the corpus.\n  expected: "New York office hours"\n  actual:   ${JSON.stringify(text)}`);
  }
  if (text.includes(NBSP)) {
    throw new Error(`§30.5: U+00A0 must not survive into search-corpus.json's text.\n  text: ${JSON.stringify(text)}`);
  }
  covers("SRCH-05");
}, TEST_MS);

test("SRCH-05: every Unicode space separator in the closed list folds to U+0020 in the corpus, a run of separators collapses to ONE space, and the result is trimmed", async () => {
  const tmp = mkTmp();
  const SEPARATORS = [
    "\u00A0", "\u2000", "\u2001", "\u2002", "\u2003", "\u2004", "\u2005",
    "\u2006", "\u2007", "\u2008", "\u2009", "\u200A", "\u202F", "\u205F", "\u3000",
  ];
  const words = SEPARATORS.map((_, i) => `Word${i}`);
  words.push(`Word${SEPARATORS.length}`);
  let inner = words[0];
  for (let i = 0; i < SEPARATORS.length; i++) inner += SEPARATORS[i] + words[i + 1];
  const lead = SEPARATORS[0] + SEPARATORS[1];
  const trail = SEPARATORS[2] + SEPARATORS[3];
  const body = `<p>${lead}${inner}${trail}</p>`;
  writeTree(join(tmp, "src"), { "index.html": page({ body }) });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--search-corpus"], tmp);
  expectExit(r, 0, "separator build");
  const corpus = parseJsonFile(readCorpusRaw(tmp), "search-corpus.json");
  const text = corpus.pages[0].text;
  const expectedText = words.join(" ");
  if (text !== expectedText) {
    throw new Error(`§30.5: the full separator set must each fold to one ordinary space, adjacent runs must collapse, and the ends must trim.\n  expected: ${JSON.stringify(expectedText)}\n  actual:   ${JSON.stringify(text)}`);
  }
  covers("SRCH-05");
}, TEST_MS);

// ------------------------------------------------------------------- §30.6

test("SRCH-06: an authored file at exactly the catalog's or the corpus's own path suppresses generation of THAT file entirely and ships byte-for-byte, independently of the other flag", async () => {
  const authoredCatalog = '{"custom":true,"notASchemaVersion":"nope"}\n';
  const authoredCorpus = '{"also":"authored"}\n';
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page({ title: "Home" }),
    [CATALOG_PATH]: authoredCatalog,
    [CORPUS_PATH]: authoredCorpus,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus"], tmp);
  expectExit(r, 0, "authored-files build");
  expectBytes(readCatalogRaw(tmp), authoredCatalog, "§30.6: an authored catalog.json suppresses generation entirely and ships byte-for-byte, even with --catalog on");
  expectBytes(readCorpusRaw(tmp), authoredCorpus, "§30.6: an authored search-corpus.json suppresses generation entirely and ships byte-for-byte, even with --search-corpus on");
  covers("SRCH-06");
}, TEST_MS);

test("SRCH-06: --dry-run shows an authored file as an ordinary copy from source, with NO generated row for the path it occupies", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page({ title: "Home" }),
    [CATALOG_PATH]: '{"custom":true}\n',
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--dry-run"], tmp);
  expectExit(r, 0, "authored dry-run");
  if (!r.stdout.includes(`copy dist/${CATALOG_PATH} (/${CATALOG_PATH}) ← ${CATALOG_PATH}`)) {
    throw new Error(`§30.6: --dry-run must show the authored catalog as an ordinary copy row.\nstdout:\n${r.stdout}`);
  }
  if (r.stdout.includes(`← generated (--catalog)`)) {
    throw new Error(`§30.6: no generated row may appear for a path an authored file already occupies.\nstdout:\n${r.stdout}`);
  }
  covers("SRCH-06");
}, TEST_MS);

test("REF-04 — /assets/unify/catalog.json and /assets/unify/search-corpus.json linked without their flags name the flag; with it, resolve", async () => {
  // Round 27's §12 second-fix-line rule, the catalog/corpus spelling.
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Home</title><meta name="description" content="Home."></head>
<body><h1>Home</h1><a href="/${CATALOG_PATH}">catalog</a><a href="/${CORPUS_PATH}">corpus</a></body>
</html>
`,
  });
  const bare = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  if (bare.exit !== 1) throw new Error(`expected the broken links to block: exit ${bare.exit}\n${bare.stderr}`);
  if (!bare.stderr.includes(`${CATALOG_PATH} is generated, not authored`) || !bare.stderr.includes("--catalog")) {
    throw new Error(`§12: the second fix line must name --catalog:\n${bare.stderr}`);
  }
  if (!bare.stderr.includes(`${CORPUS_PATH} is generated, not authored`) || !bare.stderr.includes("--search-corpus")) {
    throw new Error(`§12: the second fix line must name --search-corpus:\n${bare.stderr}`);
  }
  const withFlags = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus"], tmp);
  if (withFlags.exit !== 0) throw new Error(`generated files satisfy their own links:\n${withFlags.stderr}`);
  covers("REF-04", "SRCH-06");
}, TEST_MS);

// ------------------------------------------------------------------- §30.7

test("SRCH-07: base-url path prefix is reflected in path/url; baseUrl is null without the flag and the exact string with it, and pages stay in manifest order in both files", async () => {
  const files = {
    "index.html": page({ title: "Home" }),
    "z.html": page({ title: "Z" }),
    "a.html": page({ title: "A" }),
    "m/deep.html": page({ title: "Deep" }),
  };

  const noBase = mkTmp();
  writeTree(join(noBase, "src"), files);
  const a = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus"], noBase);
  expectExit(a, 0, "no-base build");
  const catalogA = parseJsonFile(readCatalogRaw(noBase), "catalog.json");
  if (catalogA.baseUrl !== null) throw new Error(`§30.2: baseUrl must be null with no --base-url.\n  actual: ${JSON.stringify(catalogA.baseUrl)}`);
  if (catalogA.pages.some((p) => p.url !== null)) throw new Error(`§30.2: url must be null on every page with no --base-url.`);

  const withBase = mkTmp();
  writeTree(join(withBase, "src"), files);
  const RAW = "https://example.com/repo"; // no trailing slash, deliberately
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus", "--base-url", RAW], withBase);
  expectExit(b, 0, "with-base build");
  const catalogB = parseJsonFile(readCatalogRaw(withBase), "catalog.json");
  if (catalogB.baseUrl !== RAW) {
    throw new Error(`§30.2: baseUrl must be the --base-url value EXACTLY AS GIVEN, never reconstructed.\n  expected: ${JSON.stringify(RAW)}\n  actual:   ${JSON.stringify(catalogB.baseUrl)}`);
  }
  const expectedOrder = [
    "https://example.com/repo/a.html",
    "https://example.com/repo/",
    "https://example.com/repo/m/deep.html",
    "https://example.com/repo/z.html",
  ];
  const urls = catalogB.pages.map((p) => p.url);
  if (JSON.stringify(urls) !== JSON.stringify(expectedOrder)) {
    throw new Error(`§30.2/§20.1: catalog pages must be in manifest order (output path) and carry the base-url path prefix.\n  expected: ${JSON.stringify(expectedOrder)}\n  actual:   ${JSON.stringify(urls)}`);
  }
  if (catalogB.pages.some((p) => !p.path.startsWith("/repo/"))) {
    throw new Error(`§30.2: every page's path must carry the base-url path prefix.\n  actual: ${JSON.stringify(catalogB.pages.map((p) => p.path))}`);
  }
  const corpusB = parseJsonFile(readCorpusRaw(withBase), "search-corpus.json");
  const corpusPaths = corpusB.pages.map((p) => p.path);
  const catalogPaths = catalogB.pages.map((p) => p.path);
  if (JSON.stringify(corpusPaths) !== JSON.stringify(catalogPaths)) {
    throw new Error(`§30.7/§20.1: search-corpus.json must be in the identical manifest order as catalog.json.\n  catalog: ${JSON.stringify(catalogPaths)}\n  corpus:  ${JSON.stringify(corpusPaths)}`);
  }
  covers("SRCH-07");
}, TEST_MS);

test("SRCH-07: two builds of one tree with the same settings produce byte-identical catalog.json and search-corpus.json", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": page({ title: "Home" }),
    "about.html": page({ title: "About", description: "Who we are." }),
    "post.md": `---\ntitle: Post\ndescription: A post.\ntags:\n  - a\n  - b\n---\n\n# Post\n\nBody text with several words to fold.\n`,
  });
  const first = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus", "--base-url", BASE], tmp);
  expectExit(first, 0, "first build");
  const catalog1 = readCatalogRaw(tmp);
  const corpus1 = readCorpusRaw(tmp);

  const second = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus", "--base-url", BASE], tmp);
  expectExit(second, 0, "second build");
  expectBytes(readCatalogRaw(tmp), catalog1, "§30.7: catalog.json must be byte-identical across repeated builds of one tree");
  expectBytes(readCorpusRaw(tmp), corpus1, "§30.7: search-corpus.json must be byte-identical across repeated builds of one tree");
  covers("SRCH-07");
}, TEST_MS);

// -------------------------------------------------------------- CLI wiring

test("unify.yaml: catalog and search-corpus are saved flags with real effect, and --search-index/search-index no longer exist", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "unify.yaml": "catalog: true\nsearch-corpus: true\n",
    "index.html": page({ title: "Home" }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "unify.yaml build");
  if (!existsSync(join(tmp, "dist", CATALOG_PATH))) throw new Error("§18/§30.1: catalog: true in unify.yaml must write catalog.json");
  if (!existsSync(join(tmp, "dist", CORPUS_PATH))) throw new Error("§18/§30.1: search-corpus: true in unify.yaml must write search-corpus.json");

  const flagRejected = mkTmp();
  writeTree(join(flagRejected, "src"), { "index.html": page({ title: "Home" }) });
  const b = await runCli(["build", "-s", "src", "-o", "dist", "--search-index"], flagRejected);
  if (b.exit !== 2) throw new Error(`--search-index must be the ordinary unknown-flag usage error (exit 2).\n  actual exit: ${b.exit}\nstderr:\n${b.stderr}`);
  if (!/unknown option/i.test(b.stderr) || !b.stderr.includes("--search-index")) {
    throw new Error(`§30: --search-index must be reported as an unknown option, naming it.\nstderr:\n${b.stderr}`);
  }

  const keyRejected = mkTmp();
  writeTree(join(keyRejected, "src"), {
    "unify.yaml": "search-index: true\n",
    "index.html": page({ title: "Home" }),
  });
  const c = await runCli(["build", "-s", "src", "-o", "dist"], keyRejected);
  if (c.exit !== 2) throw new Error(`a search-index key in unify.yaml must be the ordinary unknown-key usage error (exit 2).\n  actual exit: ${c.exit}\nstderr:\n${c.stderr}`);
  if (!c.stderr.includes("unknown key") || !c.stderr.includes("search-index")) {
    throw new Error(`§18: an unknown unify.yaml key must be reported, naming it.\nstderr:\n${c.stderr}`);
  }
  covers("SRCH-01", "CFG-01");
}, TEST_MS);

// -------------------------------------------------------------- MD/HTML equality

test("§30.2 HTML/Markdown catalog equality — equivalent pages produce identical catalog entries beyond path/url", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "from-md.md": `---
title: About Us
description: Who we are.
tags:
  - alpha
  - beta
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
</head>
<body class="page-about">
<h1 id="about-us">About Us</h1>
<p>Some body text.</p>
</body>
</html>
`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog"], tmp);
  expectExit(r, 0, "md/html equality build");
  const data = parseJsonFile(readCatalogRaw(tmp), "catalog.json");
  const fromMd = data.pages.find((p) => p.path === "/from-md.html");
  const fromHtml = data.pages.find((p) => p.path === "/from-html.html");
  if (!fromMd || !fromHtml) throw new Error(`§30.4: both pages must appear in the catalog.\n  actual paths: ${JSON.stringify(data.pages.map((p) => p.path))}`);

  if (JSON.stringify(fromMd.html) !== JSON.stringify(fromHtml.html)) {
    throw new Error(`§30.2/MD-08: html must match between equivalent Markdown and HTML pages.\n  md:   ${JSON.stringify(fromMd.html)}\n  html: ${JSON.stringify(fromHtml.html)}`);
  }
  if (JSON.stringify(fromMd.head) !== JSON.stringify(fromHtml.head)) {
    throw new Error(`§30.2/MD-05/MD-09/MD-12: head must match between equivalent Markdown and HTML pages.\n  md:   ${JSON.stringify(fromMd.head)}\n  html: ${JSON.stringify(fromHtml.head)}`);
  }
  if (JSON.stringify(fromMd.body) !== JSON.stringify(fromHtml.body)) {
    throw new Error(`§30.2/MD-07: body must match between equivalent Markdown and HTML pages.\n  md:   ${JSON.stringify(fromMd.body)}\n  html: ${JSON.stringify(fromHtml.body)}`);
  }
  covers("SRCH-02", "MD-14");
}, TEST_MS);
