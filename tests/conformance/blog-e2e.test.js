/**
 * blog-e2e.test.js — brief §29.7's end-to-end blog fixture.
 *
 * A small blog built for real (Markdown posts with arbitrary `tags`, a
 * custom `series` field, dates, descriptions, and headings; one draft post
 * held back with `robots: noindex`; two non-post pages) with
 * `--catalog --search-corpus --base-url`, then read back through
 * `fixtures/blog-listing.mjs` — the guide's own listing/filter/sort/search
 * code, transcribed rather than reimplemented (see that file's header) — to
 * prove the two generated JSON files are, by themselves, enough to build:
 *
 *   - a "kind" facet (posts vs. ordinary pages)
 *   - a newest-first sort by the author's own `date`
 *   - a tag filter and a `series` filter (an arbitrary frontmatter key,
 *     unknown to unify, read exactly like `tags` is)
 *   - full-text search, joined from a corpus hit back to its catalog entry
 *     by `path`, reading title/description/tags off the joined record
 *
 * unify has no collections feature (product-spec's non-goals) — nothing
 * here calls into unify a second time or reads anything but the two
 * generated files, which is the point this file exists to prove.
 *
 * Real CLI spawn only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";
import { bySeries, buildByPath, byTag, metaProperty, metaValue, metaValues, search, selectPosts, tagCounts } from "./fixtures/blog-listing.mjs";

const TEST_MS = 30_000;
const BASE = "https://example.com/blog/";
const CATALOG_PATH = ["dist", "assets", "unify", "catalog.json"];
const CORPUS_PATH = ["dist", "assets", "unify", "search-corpus.json"];
const MARKER = "QUARTZBEACON"; // a body phrase distinctive enough to grep for by hand if this ever fails

// --------------------------------------------------------------- fixture

function frontPost({ title, description, schema, date = null, tags, series, heading, marker = false, ogImage = null }) {
  const tagLines = tags.map((t) => `  - ${t}`).join("\n");
  const markerLine = marker
    ? `${MARKER} marks this paragraph so the search test can find it uniquely.`
    : "An ordinary paragraph with nothing distinctive in it.";
  const ogLine = ogImage ? `\nog:\n  image: ${ogImage}` : "";
  const dateLine = date !== null ? `\ndate: ${date}` : "";
  return `---
title: ${title}
description: ${description}
schema: ${schema}${dateLine}
tags:
${tagLines}
series: ${series}${ogLine}
---

# ${heading}

${markerLine}

## A second heading

More prose, to give the corpus a body worth searching.
`;
}

function noindexPost({ title, description, schema, date, tags, series, heading }) {
  return `---
title: ${title}
description: ${description}
schema: ${schema}
date: ${date}
tags:
${tags.map((t) => `  - ${t}`).join("\n")}
series: ${series}
robots: noindex
---

# ${heading}

${MARKER} also appears in this held-back post — proving the search test's
single result is exclusion by membership, not an accident of which post
happens to contain the word.
`;
}

function htmlPage(title, description, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

function buildFixture() {
  return {
    "index.html": htmlPage(
      "Scratch Blog",
      "A small blog fixture for the catalog and search corpus.",
      `<h1>Scratch Blog</h1>
<p>Read <a href="/about.html">about this blog</a> or browse the posts:</p>
<ul>
<li><a href="/posts/alpha-post.html">Composing Pages Without a Framework</a></li>
<li><a href="/posts/beta-post.html">Full-Text Search with the Corpus</a></li>
<li><a href="/posts/gamma-post.html">Writing Posts in Markdown</a></li>
</ul>`,
    ),
    "about.html": htmlPage(
      "About",
      "About this scratch blog fixture.",
      `<h1>About</h1>\n<p>An ordinary page, not a post — it declares no schema at all.</p>`,
    ),
    "assets/gamma-card.png": "not a real PNG — the reference check only needs this path to exist",
    // alpha and gamma are deliberately near-adjacent calendar days spelled so
    // that a lexical (string) date comparator disagrees with the real
    // instant: alpha's "2026-01-05T23:00:00-08:00" names 2026-01-06T07:00:00Z
    // (a LATER instant than gamma's plain "2026-01-06T00:00:00Z"), but as
    // plain text "2026-01-05..." sorts BEFORE "2026-01-06...". A comparator
    // that compares date strings instead of parsing them would rank gamma
    // ahead of alpha; §3's `ts`/`Date.parse` comparator must not.
    "posts/alpha-post.md": frontPost({
      title: "Composing Pages Without a Framework",
      description: "Includes and layouts as the entire authoring surface.",
      schema: "BlogPosting",
      date: "2026-01-05T23:00:00-08:00",
      tags: ["unify", "htmx"],
      series: "fundamentals",
      heading: "Composing Pages Without a Framework",
    }),
    "posts/beta-post.md": frontPost({
      title: "Full-Text Search with the Corpus",
      description: "Joining search-corpus.json hits back to catalog entries.",
      schema: "BlogPosting",
      date: "2026-02-10T09:00:00Z",
      tags: ["unify", "search"],
      series: "fundamentals",
      heading: "Full-Text Search with the Corpus",
    }),
    "posts/gamma-post.md": frontPost({
      title: "Writing Posts in Markdown",
      description: "Frontmatter keys become ordinary head metadata.",
      schema: "Article",
      date: "2026-01-06T00:00:00Z",
      tags: ["markdown"],
      series: "advanced",
      heading: "Writing Posts in Markdown",
      marker: true,
      ogImage: "/assets/gamma-card.png",
    }),
    "posts/hidden-post.md": noindexPost({
      title: "Draft Post Nobody Should See",
      description: "Held back from the catalog and the corpus.",
      schema: "BlogPosting",
      date: "2026-03-01T09:00:00Z",
      tags: ["unify"],
      series: "fundamentals",
      heading: "Draft Post Nobody Should See",
    }),
    // No `date:` at all — nothing in the build requires one. Proves the
    // sort comparator is total: an undated post must sink to the end
    // rather than scrambling the dated posts around it (§3's `ts` helper).
    "posts/delta-post.md": frontPost({
      title: "Undated Post Sinks to the End",
      description: "Nothing requires a schema-declaring post to also carry a date.",
      schema: "BlogPosting",
      tags: ["unify"],
      series: "fundamentals",
      heading: "Undated Post Sinks to the End",
    }),
  };
}

// ----------------------------------------------------------------- helpers

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function readJson(tmp, parts, name) {
  const raw = readFileSync(join(tmp, ...parts), "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${name} does not parse as JSON (${e.message})\n${raw}`);
  }
}

function titlesOf(pages) {
  return pages.map((p) => p.head.title);
}

// -------------------------------------------------------------------- test

test("E2E blog fixture (§29.7): the real catalog.json and search-corpus.json are, by themselves, enough to select posts, sort newest-first, filter by tag and by series, and join a full-text hit back to its catalog entry", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), buildFixture());

  const r = await runCli(["build", "-s", "src", "-o", "dist", "--catalog", "--search-corpus", "--base-url", BASE, "--pretty-urls"], tmp);
  expectExit(r, 0, "blog fixture build");

  const catalog = readJson(tmp, CATALOG_PATH, "catalog.json");
  const corpus = readJson(tmp, CORPUS_PATH, "search-corpus.json");

  // Sanity: six public pages (index, about, and the four visible posts) —
  // the noindex draft is absent from the catalog entirely (SRCH-04, §30.4's
  // membership predicate, shared with the corpus).
  if (catalog.pages.length !== 6) {
    throw new Error(`expected 6 public pages in the catalog (the draft excluded by robots: noindex), got ${catalog.pages.length}\n${JSON.stringify(catalog.pages.map((p) => p.path))}`);
  }
  if (catalog.pages.some((p) => /hidden-post/.test(p.path))) {
    throw new Error(`§30.4: the noindex draft must not appear in catalog.json at all\n${JSON.stringify(catalog.pages.map((p) => p.path))}`);
  }
  if (corpus.pages.some((p) => /hidden-post/.test(p.path))) {
    throw new Error(`§30.4: the noindex draft must not appear in search-corpus.json at all\n${JSON.stringify(corpus.pages.map((p) => p.path))}`);
  }

  // --- kind facet + newest-first sort -------------------------------------
  const posts = selectPosts(catalog);
  if (posts.length !== 4) {
    throw new Error(`the kind facet (schema BlogPosting/Article) must select exactly the 4 visible posts, not the 2 plain pages or the excluded draft.\n  titles: ${JSON.stringify(titlesOf(posts))}`);
  }
  const expectedOrder = [
    "Full-Text Search with the Corpus", // 2026-02-10T09:00:00Z, newest
    "Composing Pages Without a Framework", // 2026-01-05T23:00:00-08:00 = 2026-01-06T07:00:00Z
    "Writing Posts in Markdown", // 2026-01-06T00:00:00Z — earlier instant, but LATER string, than the one above
    "Undated Post Sinks to the End", // no date: at all — sinks to the end rather than scrambling the rest
  ];
  if (JSON.stringify(titlesOf(posts)) !== JSON.stringify(expectedOrder)) {
    throw new Error(`posts must sort newest-first by the author's own date, parsed as an instant rather than compared as text, with an undated post sinking to the end.\n  expected: ${JSON.stringify(expectedOrder)}\n  actual:   ${JSON.stringify(titlesOf(posts))}`);
  }

  // --- tag filter, run over the WHOLE catalog (not just `posts`) so it also
  // proves the excluded draft's "unify" tag cannot leak into the result ----
  const unifyTagged = byTag(catalog, "unify");
  const expectedUnifyTagged = ["Composing Pages Without a Framework", "Full-Text Search with the Corpus", "Undated Post Sinks to the End"];
  if (JSON.stringify(titlesOf(unifyTagged).sort()) !== JSON.stringify(expectedUnifyTagged.sort())) {
    throw new Error(`byTag("unify") must return exactly alpha, beta, and delta (the draft's own "unify" tag must not leak in since it is absent from the catalog).\n  actual: ${JSON.stringify(titlesOf(unifyTagged))}`);
  }
  const markdownTagged = byTag(catalog, "markdown");
  if (markdownTagged.length !== 1 || markdownTagged[0].head.title !== "Writing Posts in Markdown") {
    throw new Error(`byTag("markdown") must return exactly gamma.\n  actual: ${JSON.stringify(titlesOf(markdownTagged))}`);
  }

  // --- tag cloud: counts every tag across the catalog, and the excluded
  // draft's own "unify" tag must not inflate the count (guide §3) ----------
  const counts = tagCounts(catalog);
  const expectedCounts = { unify: 3, htmx: 1, search: 1, markdown: 1 };
  if (JSON.stringify(Object.fromEntries(counts)) !== JSON.stringify(expectedCounts)) {
    throw new Error(`tagCounts must count each tag once per visible post, excluding the draft.\n  expected: ${JSON.stringify(expectedCounts)}\n  actual:   ${JSON.stringify(Object.fromEntries(counts))}`);
  }

  // --- series filter: an ordinary frontmatter key, unknown to unify,
  // read exactly the way byTag reads `tags` -------------------------------
  const fundamentals = bySeries(catalog, "fundamentals");
  const expectedFundamentals = ["Composing Pages Without a Framework", "Full-Text Search with the Corpus", "Undated Post Sinks to the End"];
  if (JSON.stringify(titlesOf(fundamentals).sort()) !== JSON.stringify(expectedFundamentals.sort())) {
    throw new Error(`bySeries("fundamentals") must return exactly alpha, beta, and delta.\n  actual: ${JSON.stringify(titlesOf(fundamentals))}`);
  }
  const advanced = bySeries(catalog, "advanced");
  if (advanced.length !== 1 || advanced[0].head.title !== "Writing Posts in Markdown") {
    throw new Error(`bySeries("advanced") must return exactly gamma.\n  actual: ${JSON.stringify(titlesOf(advanced))}`);
  }

  // --- full-text search, joined back to the catalog by path ---------------
  // The marker phrase is planted in BOTH gamma (visible) and the excluded
  // draft, so a single result proves the join respects membership rather
  // than happening to find only one occurrence.
  const byPath = buildByPath(catalog);
  const hits = search(corpus, byPath, MARKER);
  if (hits.length !== 1) {
    throw new Error(`searching for the marker phrase must return exactly one hit (the draft that also contains it is excluded from the corpus).\n  hit paths: ${JSON.stringify(hits.map((h) => h?.path))}`);
  }
  const [hit] = hits;
  if (hit.head.title !== "Writing Posts in Markdown") {
    throw new Error(`the search hit must join back to gamma's own catalog entry.\n  actual title: ${JSON.stringify(hit.head.title)}`);
  }
  if (metaValue(hit, "description") !== "Frontmatter keys become ordinary head metadata.") {
    throw new Error(`the joined catalog entry must carry gamma's own description.\n  actual: ${JSON.stringify(metaValue(hit, "description"))}`);
  }
  if (JSON.stringify(metaValues(hit, "tags")) !== JSON.stringify(["markdown"])) {
    throw new Error(`the joined catalog entry must carry gamma's own tags.\n  actual: ${JSON.stringify(metaValues(hit, "tags"))}`);
  }
  // og:-namespaced keys emit property=, not name= — metaValue must miss it and
  // metaProperty must find it (guide §1/§2).
  if (metaValue(hit, "og:image") !== undefined) {
    throw new Error(`metaValue must not match a property= entry.\n  actual: ${JSON.stringify(metaValue(hit, "og:image"))}`);
  }
  if (metaProperty(hit, "og:image") !== `${BASE}assets/gamma-card.png`) {
    throw new Error(`metaProperty must read gamma's own og:image (rewritten under --base-url, like any other URL-valued meta).\n  actual: ${JSON.stringify(metaProperty(hit, "og:image"))}`);
  }

  // --- base-url reflected in path/url, the flag the fixture built with
  if (catalog.baseUrl !== BASE) {
    throw new Error(`§30.2: catalog.baseUrl must reflect --base-url.\n  expected: ${JSON.stringify(BASE)}\n  actual:   ${JSON.stringify(catalog.baseUrl)}`);
  }
  if (hit.url !== `${BASE}posts/gamma-post/`) {
    throw new Error(`§20.5: a page's url must carry the --base-url prefix.\n  actual: ${JSON.stringify(hit.url)}`);
  }

  covers("SRCH-02", "SRCH-03", "SRCH-04", "MAN-05");
}, TEST_MS);
