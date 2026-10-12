/**
 * §20.3 head scoping, §22.3's predicate, and §24.4's `metadata-in-body` —
 * MAN-11, CAN-03, AUD-10.
 *
 * One rule with three consequences, and the third is the one that made the
 * first two worth fixing. A page whose `<head>` holds only `<meta charset>`,
 * with its title and description written into the `<body>`, used to report
 * neither `title-missing` nor `description-missing`, though the page has no
 * title at all.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1).
 */
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const BASE = "https://example.com/";
const read = (tmp, ...parts) => readFileSync(join(tmp, ...parts), "utf8");

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

const ids = (stdout) => [...stdout.matchAll(/\[([a-z0-9-]+)\]$/gm)].map((m) => m[1]);

function expectFinding(r, id, what) {
  if (!ids(r.stdout).includes(id)) {
    throw new Error(`${what}: expected a ${id} finding\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectNoFinding(r, id, what) {
  if (ids(r.stdout).includes(id)) throw new Error(`${what}: expected NO ${id}\nstdout:\n${r.stdout}`);
}

// ------------------------------------------------------------------- §20.3

test("MAN-11: metadata in <body> is inert, so the fields it would have supplied are missing", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body>
<h1>Home</h1>
<p>Words.</p>
<title>Inert Title</title>
<meta name="description" content="Inert description.">
</body>
</html>
`,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a page whose metadata sits in the body (metadata-in-body is broken: §24.6 exits 1 without --strict)");
  expectFinding(r, "title-missing", "§20.3: nothing reads a <title> in the body, so the page has none");
  expectFinding(r, "description-missing", "§20.3: same for the description");
  covers("MAN-11");
}, TEST_MS);

test("MAN-11: the five unscoped fields still read the body", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Home</title>
<meta name="description" content="The home page."></head>
<body>
<h1>Home</h1>
<p id="intro">Words.</p>
<a href="/other.html">Other</a>
<a href="/other.html#deep">Deep</a>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>
</body>
</html>
`,
    "other.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Other</title>
<meta name="description" content="The other page."></head>
<body><h1>Other</h1><p id="deep">There.</p><a href="/">Home</a></body>
</html>
`,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a page whose body carries ld+json, ids, headings and links");
  // ld+json in the body IS read — an Article with no authored date is the proof,
  // and head-scoping it would have dropped an entity crawlers act on.
  expectFinding(r, "schema-incomplete", "§20.3: ld+json is valid and read inside <body>");
  // ids, headings, text and links all came from the body, so none of these fire.
  for (const id of ["h1-missing", "lang-missing", "page-orphan", "fragment-missing"]) {
    expectNoFinding(r, id, "§20.3: the body-scoped fields are unchanged");
  }
  covers("MAN-11");
}, TEST_MS);

test("MAN-11: a document with no <head> element is read whole", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    // `data-layout="none"` ships this document as written — no head anywhere,
    // which is exactly where a browser would synthesise one.
    "index.html": `<!doctype html>
<html lang="en">
<body data-layout="none">
<title>Bare Home</title>
<meta name="description" content="A document with no head element.">
<h1>Bare Home</h1>
<p>Words.</p>
</body>
</html>
`,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a head-less document");
  expectNoFinding(r, "title-missing", "§20.3: refusing to read these would report a page a browser reads fine");
  expectNoFinding(r, "description-missing", "§20.3");
  expectNoFinding(r, "metadata-in-body", "§24.4: there is no head for them to be outside of");
  covers("MAN-11");
  covers("AUD-10");
}, TEST_MS);

// ------------------------------------------------------------------- §22.3

test("CAN-03: a canonical in <body> declares nothing, so completion still runs", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Home</title>
<meta name="description" content="The home page."></head>
<body>
<h1>Home</h1><p>Words.</p>
<link rel="canonical" href="/somewhere-else.html">
</body>
</html>
`,
    "somewhere-else.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Elsewhere</title>
<meta name="description" content="Another page."></head>
<body><h1>Elsewhere</h1><p>Words.</p><a href="/">Home</a></body>
</html>
`,
  });
  const r = await runCli(
    ["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], tmp);
  expectExit(r, 0, "a body canonical under --canonical auto");
  const out = read(tmp, "dist", "index.html");
  const head = out.slice(0, out.indexOf("</head>"));
  if (!head.includes('<link rel="canonical" href="https://example.com/">')) {
    throw new Error(`§22.3: the head declared none, so completion supplies one:\n${out}`);
  }
  covers("CAN-03");
}, TEST_MS);

test("CAN-03: a canonical in <head> still wins, whatever it names", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Home</title>
<link rel="canonical" href="https://elsewhere.example/">
<meta name="description" content="The home page."></head>
<body><h1>Home</h1><p>Words.</p></body>
</html>
`,
  });
  const r = await runCli(
    ["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], tmp);
  expectExit(r, 0, "an authored head canonical");
  const out = read(tmp, "dist", "index.html");
  if ((out.match(/rel="canonical"/g) ?? []).length !== 1) {
    throw new Error(`§22.3: completion fills a gap and never adjudicates:\n${out}`);
  }
  covers("CAN-03");
}, TEST_MS);

// ------------------------------------------------------------------- §24.4

test("AUD-10: the closed set is reported, and body-legal elements are not", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Home</title>
<meta name="description" content="The home page."></head>
<body>
<h1>Home</h1><p>Words.</p>
<meta property="og:image" content="/card.png">
<link rel="canonical" href="/">
<link rel="stylesheet" href="/late.css">
<link rel="preload" href="/card.png" as="image">
<meta itemprop="name" content="Home">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script>
<template><title>A design-time example</title></template>
</body>
</html>
`,
    "card.png": "bytes\n",
    "late.css": "body { margin: 0 }\n",
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a body full of metadata (metadata-in-body is broken: §24.6 exits 1 without --strict)");
  const lines = r.stdout.split("\n").filter((l) => l.includes("[metadata-in-body]"));
  if (lines.length !== 2) {
    throw new Error(`§24.4: exactly the og:image meta and the canonical link.\nstdout:\n${r.stdout}`);
  }
  const named = lines.join("\n");
  for (const should of ["og:image", "canonical"]) {
    if (!named.includes(should)) throw new Error(`§24.4: evidence names ${should}\n${named}`);
  }
  for (const shouldNot of ["stylesheet", "preload", "itemprop", "ld+json", "design-time"]) {
    if (named.includes(shouldNot)) {
      throw new Error(`§24.4: ${shouldNot} does its job in the body and is never reported\n${named}`);
    }
  }
  covers("AUD-10");
}, TEST_MS);

// ------------------------------------------------------- §20.3 / §24.4: SVG

// An SVG `<title>` is the graphic's accessible name (SVG 2 §5.10), a different
// element from the HTML one. The parser tracks no namespaces, so the rule is an
// ancestor question: the nearest `<svg>`/`<foreignObject>` above it decides.

const SVG_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SVG audit example</title>
  <meta name="description" content="An accessible inline SVG with its own title.">
</head>
<body>
  <main>
    <h1>SVG audit example</h1>
    <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="diagram-title" viewBox="0 0 100 100">
      <title id="diagram-title">Flow diagram</title>
      <rect x="10" y="10" width="80" height="80" />
    </svg>
  </main>
</body>
</html>
`;

test("MAN-11/AUD-10: an inline SVG's <title> is not stray metadata, and not the document's title", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), { "index.html": SVG_PAGE });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--strict", "--format", "json"], tmp);
  expectExit(r, 0, "a valid accessible SVG under --strict");
  const report = JSON.parse(r.stdout);
  if (report.summary.broken !== 0 || report.summary.incomplete !== 0) {
    throw new Error(`§24.4: the graphic's own <title> is not metadata-in-body.\nstdout:\n${r.stdout}`);
  }
  const title = report.pages[0].document.head.title;
  if (title !== "SVG audit example") {
    throw new Error(`§20.3: the document title is the head's, not the SVG's. Got ${JSON.stringify(title)}`);
  }
  covers("MAN-11");
  covers("AUD-10");
}, TEST_MS);

test("MAN-11/AUD-10: a nested <svg> is the graphic's own too, even inside <foreignObject>'s HTML", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "index.html": SVG_PAGE.replace("</svg>", `  <g><svg><title>Inner</title><circle r="1" /></svg></g>
      <foreignObject><div><svg><title>Inside HTML inside SVG</title></svg></div></foreignObject>
    </svg>`),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--strict"], tmp);
  expectExit(r, 0, "SVG nested in SVG, and in HTML in a <foreignObject>");
  covers("MAN-11");
  covers("AUD-10");
}, TEST_MS);

test("AUD-10: an HTML <title> in the body, or in a <foreignObject>, is still reported", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    // The graphic's own title sits beside the stray one and adds nothing to it.
    "stray.html": SVG_PAGE.replace("</main>", "<title>Stray</title>\n  </main>"),
    // HTML inside <foreignObject> is HTML again, so its <title> is as inert as any.
    "foreign.html": SVG_PAGE.replace("</svg>",
      "  <foreignObject><title>Not SVG</title></foreignObject>\n    </svg>"),
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit reports, it does not fail");
  const lines = r.stdout.split("\n").filter((l) => l.includes("[metadata-in-body]"));
  const files = lines.map((l) => l.split(":")[0]).sort();
  if (files.join() !== "foreign.html,stray.html") {
    throw new Error(`§24.4: exactly one <title> finding on each page.\nstdout:\n${r.stdout}`);
  }
  covers("AUD-10");
}, TEST_MS);

test("MAN-11: a head-less document does not take an SVG <title> for its own", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    // No <head> element, so the whole document is read (§20.3) — which is how
    // an SVG title would reach the page's title, or conflict with the real one.
    "bare.html": `<!doctype html>
<html lang="en">
<body data-layout="none">
<svg role="img"><title>Logo</title></svg>
<title>Bare Title</title>
<meta name="description" content="A document with no head element.">
<h1>Bare</h1>
<p>Words.</p>
</body>
</html>
`,
    "logo-only.html": `<!doctype html>
<html lang="en">
<body data-layout="none">
<svg role="img"><title>Logo</title></svg>
<meta name="description" content="Only the graphic is titled.">
<h1>Logo only</h1>
<p>Words.</p>
</body>
</html>
`,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--format", "json"], tmp);
  expectExit(r, 0, "head-less documents with an SVG title");
  const findings = JSON.parse(r.stdout).findings.map((f) => `${f.file} ${f.id}`).sort();
  if (!findings.includes("logo-only.html title-missing")) {
    throw new Error(`§20.3: the graphic's title is not the page's.\n${findings.join("\n")}`);
  }
  for (const id of ["title-missing", "metadata-conflict", "metadata-in-body"]) {
    if (findings.includes(`bare.html ${id}`)) {
      throw new Error(`§20.4: one title and one graphic is not a title conflict.\n${findings.join("\n")}`);
    }
  }
  covers("MAN-11");
}, TEST_MS);

test("MAN-11/AUD-10: the reading is on emitted output — a Markdown page's raw SVG, under a layout", async () => {
  const tmp = mkTmp();
  writeTree(join(tmp, "src"), {
    "_layout.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>— Site</title>
</head>
<body><main>Layout default</main></body>
</html>
`,
    "index.md": `---
title: Diagrams
description: A Markdown page carrying an accessible SVG.
---

# Diagrams

<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="flow">
<title id="flow">Flow diagram</title>
<rect x="10" y="10" width="80" height="80" />
</svg>
`,
  });
  const r = await runCli(["audit", "-s", "src", "-o", "dist", "--strict", "--format", "json"], tmp);
  expectExit(r, 0, "Markdown with raw SVG under a layout");
  const page = JSON.parse(r.stdout).pages.find((p) => p.outputPath === "index.html");
  if (page.document.head.title !== "Diagrams — Site") {
    throw new Error(`§20.3: composed title.\n${JSON.stringify(page.document.head, null, 2)}`);
  }
  const build = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(build, 0, "the same site, built");
  if (!read(tmp, "dist", "index.html").includes('<title id="flow">Flow diagram</title>')) {
    throw new Error(`the graphic's title ships where it was written:\n${read(tmp, "dist", "index.html")}`);
  }
  covers("MAN-11");
  covers("AUD-10");
}, TEST_MS);
