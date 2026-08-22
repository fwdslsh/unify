/**
 * §26 — structured data: validation (§26.3) and bounded generation (§26.4–§26.8).
 * SD-01..SD-14 and P23.
 *
 * The two halves of §26 are deliberately unequal, and so is this file. The
 * validation half adds five findings to §24.4's catalogue, and every one of
 * them is written here as a PAIR: the page that has the fault, and the
 * neighbouring page that has the shape the finding must not accuse. That is
 * the whole discipline of §26.3 — `en` beside `en-GB` is a refinement,
 * `EN-us` beside `en-US` is one tag, a headline nested in an h1 is §8 row 2
 * doing its job, and two blocks with different `@type` and no `@id` are two
 * entities. A finding that fires on any of those has accused a correct page,
 * which is the failure §24.4 has already committed against itself twice.
 *
 * The generation half is asserted from the emitted bytes: the block's key
 * ORDER, its two-space indentation, its `\u003c` escaping, its insertion
 * point, and the four values §26.6 argues for rather than asserts — `name`
 * for a `WebPage` and `headline` for an `Article`, an author that is a plain
 * string and never a `Person`, a `url` that is the FINAL canonical, and a
 * date that exists only when the author wrote a well-formed one.
 *
 * Written from docs/conformance-spec.md §26, not from src/**: nothing here
 * imports the implementation, and every assertion is a claim the spec makes
 * in words.
 *
 * Real CLI spawns only (hygiene H3); no mocks (H1); no skips (H4).
 */
import { test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { covers, mkTmp, runCli, writeTree } from "./support.mjs";

const TEST_MS = 30_000;
const BASE = "https://example.com/";

// --------------------------------------------------------------- fixtures

/**
 * A complete standalone HTML page. With no `_layout.html` in the tree and no
 * includes, §3's preservation rule means the emitted bytes ARE these bytes —
 * which is what makes the byte-identity assertion in SD-10 possible.
 */
const doc = ({ lang = "en", title = "Page", head = "", body = "<h1>Page</h1>\n<p>Words.</p>" } = {}) =>
  `<!doctype html>
<html${lang === null ? "" : ` lang="${lang}"`}>
<head>
<meta charset="utf-8">
${title === null ? "" : `<title>${title}</title>\n`}${head}</head>
<body>
${body}
</body>
</html>
`;

/** An authored `<script type="application/ld+json">`, ready to drop into a head or body. */
const ld = (value) => `<script type="application/ld+json">\n${JSON.stringify(value, null, 2)}\n</script>\n`;

const schemaMeta = (value) => `<meta name="schema" content="${value}">\n`;

// --------------------------------------------------------------- helpers

function expectExit(r, code, what) {
  if (r.exit !== code) {
    throw new Error(`${what}: expected exit ${code}, got ${r.exit}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
}

function expectIncludes(haystack, needle, what) {
  if (!haystack.includes(needle)) {
    throw new Error(`${what}: expected to find ${JSON.stringify(needle)} in:\n${haystack}`);
  }
}

function read(...parts) {
  return readFileSync(join(...parts), "utf8");
}

/** The raw text of every `<script type="application/ld+json">` block, in document order. */
function ldRaw(html) {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  return [...html.matchAll(re)].map((m) => m[1]);
}

function parseBlock(raw, what) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${what}: the block does not parse as JSON (${e.message})\n--- raw ---\n${raw}`);
  }
}

/** The one block a page carries; fails loudly when there are none or several. */
function onlyBlock(html, what) {
  const raws = ldRaw(html);
  if (raws.length !== 1) {
    throw new Error(`${what}: expected exactly one ld+json block, found ${raws.length}\n--- document ---\n${html}`);
  }
  return { raw: raws[0], data: parseBlock(raws[0], what) };
}

/** The block inside the emitted `<head>`, which is where §26.6 puts a generated one. */
function headBlock(html, what) {
  const close = html.indexOf("</head>");
  if (close < 0) throw new Error(`${what}: the document has no </head>\n${html}`);
  const head = html.slice(0, close);
  const raws = ldRaw(head);
  if (raws.length !== 1) {
    throw new Error(`${what}: expected exactly one ld+json block in the head, found ${raws.length}\n--- head ---\n${head}`);
  }
  return { raw: raws[0], data: parseBlock(raws[0], what) };
}

function expectKeys(data, keys, what) {
  const got = Object.keys(data);
  if (got.join(",") !== keys.join(",")) {
    throw new Error(
      `${what}: §26.6 fixes the property ORDER as well as the set.\n  expected: ${keys.join(", ")}\n  actual:   ${got.join(", ")}`,
    );
  }
}

function expectJsonEqual(actual, expected, what) {
  // JSON.stringify preserves insertion order, so this compares ORDER too.
  const a = JSON.stringify(actual, null, 2);
  const b = JSON.stringify(expected, null, 2);
  if (a !== b) {
    throw new Error(`${what}: the generated object differs.\n--- expected ---\n${b}\n--- actual ---\n${a}`);
  }
}

/**
 * §26.6 fixes two things about the element at once, and this asserts both as
 * one: EVERY line carries the whitespace reused from `</head>` (the last line
 * of the block's own text is that whitespace, sitting before `</script>`), and
 * what is left once that indentation is removed is exactly the fixed
 * serialization — two-space indentation, the table's order. Written this way
 * so it holds wherever `</head>` sits: a four-space head and a `</head>` that
 * abuts the last element of the head are the same claim with a different
 * indentation, not two different serializations.
 */
function expectFixedSerialization(raw, data, what) {
  const lines = raw.replaceAll("\\u003c", "<").split("\n");
  if (lines.length < 3 || lines[0] !== "") {
    throw new Error(`${what}: §26.6 serializes the object across lines, opening one after the <script> tag.\n--- raw ---\n${raw}`);
  }
  const indent = lines[lines.length - 1];
  if (!/^[ \t]*$/.test(indent)) {
    throw new Error(`${what}: §26.6 — the last line of the element is the whitespace </head> lends it.\n--- raw ---\n${raw}`);
  }
  const body = lines.slice(1, -1).map((line) => {
    if (!line.startsWith(indent)) {
      throw new Error(`${what}: §26.6 — every line of the element carries that same indentation.\nline: ${JSON.stringify(line)}`);
    }
    return line.slice(indent.length);
  }).join("\n");
  const canonical = JSON.stringify(data, null, 2);
  if (body !== canonical) {
    throw new Error(
      `${what}: §26.6 — serialization is fixed: two-space indentation, properties in the table's order.\n--- expected ---\n${canonical}\n--- actual ---\n${body}`,
    );
  }
}

function expectNoBlock(html, what) {
  const raws = ldRaw(html);
  if (raws.length !== 0) {
    throw new Error(`${what}: expected no ld+json block, found ${raws.length}\n--- document ---\n${html}`);
  }
}

/** Every finding the audit report declares, parsed out of §24.5's two-line format. */
function findings(stdout) {
  const re = /^(\S+): (broken|incomplete): (.*) \[([a-z0-9-]+)\]$/gm;
  return [...stdout.matchAll(re)].map((m) => ({ path: m[1], severity: m[2], evidence: m[3], id: m[4] }));
}

/**
 * §24.5 names a finding's `<source path>` without fixing it relative to the
 * working directory the way §14.1 fixes a diagnostic's, and the report spells
 * it source-root-relative. Both spellings are compared here with the source
 * directory stripped, so this file pins §26 rather than that open question.
 */
const bare = (p) => p.replace(/^(?:\.\/)?src\//, "");

function firesOn(stdout, id, path) {
  return findings(stdout).filter((f) => f.id === id && bare(f.path) === bare(path));
}

function expectFires(r, id, path, severity, what) {
  const hits = firesOn(r.stdout, id, path);
  if (hits.length === 0) {
    throw new Error(`${what}: expected ${id} on ${path}\nstdout:\n${r.stdout}`);
  }
  if (severity && hits[0].severity !== severity) {
    throw new Error(`${what}: ${id} on ${path} is ${severity}, got ${hits[0].severity}\nstdout:\n${r.stdout}`);
  }
  return hits;
}

function expectSilent(r, id, path, what) {
  const hits = firesOn(r.stdout, id, path);
  if (hits.length !== 0) {
    throw new Error(`${what}: ${id} must NOT fire on ${path} — it accused a correct page\nstdout:\n${r.stdout}`);
  }
}

/** A vacuity guard: silence about a page unify never emitted proves nothing. */
function expectEmitted(tmp, ...names) {
  for (const name of names) {
    if (!existsSync(join(tmp, "dist", name))) {
      throw new Error(`the fixture is vacuous: dist/${name} was never emitted (dist holds ${
        existsSync(join(tmp, "dist")) ? readdirSync(join(tmp, "dist")).join(", ") : "nothing"})`);
    }
  }
}

// ================================================================= §26.6
// Generation: what is emitted, in what order, from which sources.

test("SD-10 — a Markdown page declaring schema: Article gains one block whose properties are the table's, in order", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    // §29.1: a BlogPosting/Article declaration activates feed generation
    // under --base-url, independent of §26 — and §29.5's feed-level <id>/
    // rel=alternate is the site's own root address, which §29.7/§21.6's
    // directory-URL rule resolves to index.html. Present so this page's OWN
    // pipeline (composing under --base-url with a schema declaration) does
    // not collide with an unrelated section; irrelevant to every assertion
    // below, which reads only post.html.
    "src/index.html": doc({ title: "Home" }),
    // Every source in §26.6's table has a value here except one: the page
    // declares no canonical (frontmatter cannot, §10.2), so `url` comes from
    // record.url, which --base-url supplies.
    "src/post.md": `---
title: The Deep Field
description: A short account of the deep field.
author: Dana Reed
date: 2026-01-02
lastmod: 2026-03-04T05:06:07Z
lang: en
schema: Article
og:image: /card.png
---

# The Deep Field

Some prose about the survey.
`,
    "src/card.png": "not really a png, but a file the site emits\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "a page declaring schema: Article");
  expectEmitted(tmp, "post.html");

  const out = read(tmp, "dist", "post.html");
  const { data } = onlyBlock(out, "§26.5: exactly one block is generated");

  // The order is §26.6's table, top to bottom. A wrong implementation that
  // emits the right ten properties in JSON.stringify-of-a-record order fails
  // here, which is the point of asserting order rather than membership.
  expectJsonEqual(data, {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "The Deep Field",
    description: "A short account of the deep field.",
    url: "https://example.com/post.html",
    image: "https://example.com/card.png",
    author: "Dana Reed",
    datePublished: "2026-01-02",
    dateModified: "2026-03-04T05:06:07Z",
    inLanguage: "en",
  }, "§26.6: the generated object");

  covers("SD-10");
}, TEST_MS);

test("SD-10 — the block lands immediately before </head>, at that tag's indentation, and nothing else moves", async () => {
  const tmp = mkTmp();
  // `</head>` is indented four spaces, so §26.6's "reusing the whitespace that
  // precedes that tag" and "every line of the element carries that same
  // indentation" are both exercised rather than trivially satisfied by "".
  const declaring = `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <title>Deep Field</title>
        <meta name="schema" content="WebPage">
    </head>
    <body>
        <h1>Deep Field</h1>
    </body>
</html>
`;
  const control = declaring.replace('        <meta name="schema" content="WebPage">\n', "");
  writeTree(tmp, { "src/declaring.html": declaring, "src/control.html": control });

  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a standalone page declaring schema");
  expectEmitted(tmp, "declaring.html", "control.html");

  // §3: a page with no layout and no includes ships as written. Asserted on
  // the control first, so a failure below is unambiguously §26.6's and not a
  // pass-through bug wearing §26's clothes.
  if (read(tmp, "dist", "control.html") !== control) {
    throw new Error("§3: a page with no layout and no includes must ship byte-for-byte; the fixture's premise failed");
  }

  const out = read(tmp, "dist", "declaring.html");
  const indent = /\n([ \t]*)<\/head>/.exec(declaring)[1];
  if (indent.length === 0) throw new Error("the fixture must indent </head> or this test asserts nothing");

  const start = out.indexOf('<script type="application/ld+json">');
  if (start < 0) throw new Error(`§26.5: no block was generated\n${out}`);
  const end = out.indexOf("</script>", start) + "</script>".length;

  if (out.slice(start - indent.length, start) !== indent) {
    throw new Error(`§26.6: the element must reuse </head>'s own whitespace.\n${JSON.stringify(out.slice(start - 20, start + 40))}`);
  }
  const after = out.slice(end, end + 1 + indent.length + "</head>".length);
  if (after !== `\n${indent}</head>`) {
    throw new Error(`§26.6: the element sits immediately before </head>, with nothing between.\ngot: ${JSON.stringify(after)}`);
  }
  for (const line of out.slice(start, end).split("\n").slice(1)) {
    if (!line.startsWith(indent)) {
      throw new Error(`§26.6: every line of the element carries </head>'s indentation.\nline: ${JSON.stringify(line)}`);
    }
  }
  // Remove the inserted run and its reused whitespace: the rest of the
  // document must be byte-identical to the source (§3, §26.6).
  const stripped = out.slice(0, start - indent.length) + out.slice(end + 1);
  if (stripped !== declaring) {
    throw new Error(`§26.6: the rest of the document must be byte-identical.\n--- expected ---\n${JSON.stringify(declaring)}\n--- actual ---\n${JSON.stringify(stripped)}`);
  }
  if (headBlock(out, "§26.6").data["@type"] !== "WebPage") {
    throw new Error("§26.6: @type is the declared value");
  }

  covers("SD-10");
}, TEST_MS);

test("SD-10 — the two-space serialization survives a </head> with no whitespace to reuse", async () => {
  // The indentation §26.6 reuses can be empty, and then the OTHER half of the
  // same paragraph — "serialization is fixed: two-space indentation" — is the
  // only thing holding the block's shape. Joining the element's lines on the
  // reused whitespace alone collapses the JSON onto one line here and emits a
  // block with no indentation at all, which is a different serialization
  // rather than a different indent.
  const authored = mkTmp();
  const abut = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Abut</title><meta name="schema" content="WebPage"></head>
<body>
<h1>Abut</h1>
</body>
</html>
`;
  writeTree(authored, { "src/abut.html": abut });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], authored);
  expectExit(r, 0, "a page whose </head> abuts the last element of its head");
  expectEmitted(authored, "abut.html");

  const out = read(authored, "dist", "abut.html");
  const { raw, data } = onlyBlock(out, "the abutting page");
  expectFixedSerialization(raw, data, "§26.6: a </head> with nothing to lend");
  expectJsonEqual(data, { "@context": "https://schema.org", "@type": "WebPage", name: "Abut", inLanguage: "en" },
    "§26.6: the generated object");
  // §3 again: the insertion adds bytes and moves none.
  const start = out.indexOf('<script type="application/ld+json">');
  const end = out.indexOf("</script>", start) + "</script>".length;
  if (out.slice(0, start) + out.slice(end) !== abut) {
    throw new Error(`§26.6: the rest of the document must be byte-identical.\n--- actual ---\n${JSON.stringify(out.slice(0, start) + out.slice(end))}`);
  }

  // Not an exotic shape but the ORDINARY one: §8's head merge puts a Markdown
  // page's synthesized metas immediately before `</head>`, so a page under a
  // layout — the default authoring path — reaches exactly this case.
  const section = mkTmp();
  writeTree(section, {
    "src/_layout.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Site</title>
</head>
<body>
  <main></main>
</body>
</html>
`,
    "src/post.md": "---\ntitle: Hello\nschema: Article\n---\n\n# Hello\n\nWords.\n",
  });
  const s2 = await runCli(["build", "-s", "src", "-o", "dist"], section);
  expectExit(s2, 0, "a Markdown page under a layout");
  expectEmitted(section, "post.html");
  const merged = onlyBlock(read(section, "dist", "post.html"), "the composed Markdown page");
  expectFixedSerialization(merged.raw, merged.data, "§26.6: the default authoring path");

  covers("SD-10");
}, TEST_MS);

test("SD-11 — WebPage emits name and Article/BlogPosting emit headline; author is a plain string", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    // No --base-url and no canonical: `url` has no source, so this page also
    // pins "omitted when its source is absent" for seven of the ten rows.
    // No lang either, so the key list below is the shortest a block can have.
    "src/bare.html": doc({ lang: null, title: "Bare", head: schemaMeta("WebPage"), body: "<h1>Bare</h1>\n" }),
    "src/article.html": doc({
      title: "The Roast",
      head: schemaMeta("Article") + '<meta name="author" content="Meridian Coffee Roasters">\n',
      body: "<h1>The Roast</h1>\n",
    }),
    "src/blog.html": doc({ title: "A Post", head: schemaMeta("BlogPosting"), body: "<h1>A Post</h1>\n" }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "three declared types");
  expectEmitted(tmp, "bare.html", "article.html", "blog.html");

  const bare = onlyBlock(read(tmp, "dist", "bare.html"), "the WebPage page");
  expectKeys(bare.data, ["@context", "@type", "name"], "§26.6: a WebPage with only a title");
  expectJsonEqual(bare.data, { "@context": "https://schema.org", "@type": "WebPage", name: "Bare" },
    "§26.6: WebPage emits `name`");
  if ("headline" in bare.data) throw new Error("§26.6: WebPage has no headline — emitting one names a property its type does not define");

  for (const [file, type] of [["article.html", "Article"], ["blog.html", "BlogPosting"]]) {
    const { data, raw } = onlyBlock(read(tmp, "dist", file), file);
    if (data["@type"] !== type) throw new Error(`§26.6: @type is the declared value, got ${data["@type"]} in ${file}`);
    if (!("headline" in data)) throw new Error(`§26.6: ${type} emits headline, not name (${file})`);
    if ("name" in data) throw new Error(`§26.6: ${type} emits headline INSTEAD of name — emitting name would be valid and unread (${file})`);
    if (raw.includes("Person")) {
      throw new Error(`§26.6: an author is a name, not a claim about what bears it — {"@type":"Person"} is the invented claim product-spec §6.1 forbids (${file})\n${raw}`);
    }
  }
  const article = onlyBlock(read(tmp, "dist", "article.html"), "the Article page").data;
  if (typeof article.author !== "string" || article.author !== "Meridian Coffee Roasters") {
    throw new Error(`§26.6: author is record.author, a plain string. Got ${JSON.stringify(article.author)}`);
  }

  covers("SD-11");
}, TEST_MS);

test("SD-11 — url is the page's FINAL canonical, never a second opinion about its address", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    // §29.1/§29.7 — see the identical note in SD-10 above: an Article
    // declaration activates feed generation, whose feed-level address needs
    // a root page to resolve. Irrelevant to this test's own assertion, which
    // reads only post.html's url.
    "src/index.html": doc({ title: "Home" }),
    // An authored canonical naming another page of the site. §22.3 leaves it
    // exactly as written, §11.3 absolutizes it, and §26.6 says the generated
    // `url` is record.canonical *before* record.url — so a build that reached
    // for record.url would publish two different addresses for one page.
    "src/post.html": doc({
      title: "Syndicated",
      head: schemaMeta("Article") + '<link rel="canonical" href="/canon.html">\n',
      body: "<h1>Syndicated</h1>\n",
    }),
    "src/canon.html": doc({ title: "Canonical Home", body: "<h1>Canonical Home</h1>\n" }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--base-url", BASE], tmp);
  expectExit(r, 0, "a page with an authored canonical");
  expectEmitted(tmp, "post.html");

  const { data } = onlyBlock(read(tmp, "dist", "post.html"), "the syndicated page");
  if (data.url !== "https://example.com/canon.html") {
    throw new Error(`§26.6: url is record.canonical, else record.url. Got ${JSON.stringify(data.url)}`);
  }

  covers("SD-11");
}, TEST_MS);

test("SD-12 — every < is \\u003c, so a description carrying </script> still parses, and two builds agree byte for byte", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    // Character references, because §20.3 resolves them: the record's
    // description really does contain the four characters `</sc…` that would
    // end the element early if they reached the document unescaped.
    "src/danger.html": doc({
      title: "Danger &lt;3",
      head: schemaMeta("Article")
        + '<meta name="description" content="Closing tags &lt;/script&gt; and 1 &lt; 2 &amp; more.">\n',
      body: "<h1>Danger</h1>\n",
    }),
  });
  const first = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(first, 0, "a description containing </script>");
  expectEmitted(tmp, "danger.html");
  const out = read(tmp, "dist", "danger.html");

  // The document is still one script element: an unescaped `</script>` would
  // close it early and spill the rest of the JSON into the page as text.
  const opens = out.split("<script").length - 1;
  const closes = out.split("</script>").length - 1;
  if (opens !== 1 || closes !== 1) {
    throw new Error(`§26.6: the escape exists so the element does not end early — found ${opens} <script and ${closes} </script>\n${out}`);
  }

  const { raw, data } = onlyBlock(out, "the escaped block");
  if (raw.includes("<")) {
    throw new Error(`§26.6: every < in the serialized JSON is written as the six characters \\u003c.\n--- raw ---\n${raw}`);
  }
  expectIncludes(raw, "\\u003c/script>", "§26.6: the </script> in the description is escaped");
  expectIncludes(raw, "1 \\u003c 2", "§26.6: EVERY <, not only the ones that start a tag");
  if (data.description !== "Closing tags </script> and 1 < 2 & more.") {
    throw new Error(`§26.6: \\u003c is a JSON string escape, so the parsed block is unchanged. Got ${JSON.stringify(data.description)}`);
  }
  if (data.headline !== "Danger <3") {
    throw new Error(`§20.3: character references are resolved before the record is read. Got ${JSON.stringify(data.headline)}`);
  }
  // Two-space indentation and the table's order, asserted as one fact: the
  // block, with its escapes undone, IS the canonical two-space serialization.
  const canonical = JSON.stringify(data, null, 2);
  if (raw.replaceAll("\\u003c", "<").trim() !== canonical) {
    throw new Error(`§26.6: serialization is fixed — two-space indentation, properties in the table's order.\n--- expected ---\n${canonical}\n--- actual ---\n${raw.trim()}`);
  }

  const second = await runCli(["build", "-s", "src", "-o", "dist2"], tmp);
  expectExit(second, 0, "the second build of the same tree");
  if (read(tmp, "dist2", "danger.html") !== out) {
    throw new Error("§26.6: two builds of one tree produce identical bytes");
  }

  covers("SD-12");
}, TEST_MS);

// ================================================================= §26.5
// Activation: three conditions, and no flag.

test("SD-09 — authored JSON-LD always wins, in the head or the body; a <template> is not a declaration", async () => {
  const authored = { "@context": "https://schema.org", "@type": "Product", name: "Written by hand" };
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/head-block.html": doc({
      title: "Head Block",
      head: schemaMeta("Article") + ld(authored),
      body: "<h1>Head Block</h1>\n",
    }),
    // §26.5 condition 2 is deliberately NOT head-scoped: §24.4's
    // metadata-in-body says outright that ld+json does its job in the body.
    "src/body-block.html": doc({
      title: "Body Block",
      head: schemaMeta("Article"),
      body: `<h1>Body Block</h1>\n${ld(authored)}`,
    }),
    // A template's contents declare nothing, here as everywhere (§7, §20.2),
    // so this page's jsonLd is empty and generation happens.
    "src/tpl.html": doc({
      title: "Template Block",
      head: schemaMeta("Article"),
      body: `<h1>Template Block</h1>\n<template>\n${ld(authored)}</template>\n`,
    }),
    // No meta at all: §20.8 reads the block's own @type, so schemaType is
    // Article and condition 1 holds — condition 2 is what declines.
    "src/jsonld-only.html": doc({
      title: "Own Block",
      head: ld({ "@context": "https://schema.org", "@type": "Article", name: "Written by hand" }),
      body: "<h1>Own Block</h1>\n",
    }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "four pages whose blocks the author wrote");
  expectEmitted(tmp, "head-block.html", "body-block.html", "tpl.html", "jsonld-only.html");

  for (const file of ["head-block.html", "body-block.html", "jsonld-only.html"]) {
    const out = read(tmp, "dist", file);
    const { data } = onlyBlock(out, `${file}: generation fills a gap and never adjudicates a value the author chose`);
    if (data.name !== "Written by hand") {
      throw new Error(`§26.5: ${file} kept a block unify wrote instead of the author's\n${out}`);
    }
  }
  const body = read(tmp, "dist", "body-block.html");
  if (body.indexOf('<script type="application/ld+json">') < body.indexOf("</head>")) {
    throw new Error("the fixture must keep its authored block in the BODY or condition 2's scope is not exercised");
  }

  const tpl = read(tmp, "dist", "tpl.html");
  if (ldRaw(tpl).length !== 2) {
    throw new Error(`§26.5: a <template> is not a declaration, so this page gains a generated block beside the inert one\n${tpl}`);
  }
  if (headBlock(tpl, "the generated block").data["@type"] !== "Article") {
    throw new Error("§26.5: the generated block is the declared Article, at the end of the head");
  }

  covers("SD-09");
}, TEST_MS);

test("SD-09 — a head with no closing tag is no insertion point, and there is no flag to switch generation on", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    // No `</head>`: §26.5 condition 3, which is §22.2's rule — synthesizing
    // one would be a structural change this section does not make.
    "src/ragged.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Ragged</title>
<meta name="schema" content="WebPage">
<body>
<h1>Ragged</h1>
</body>
</html>
`,
    // The control: identical declaration, closed head. Without it a build that
    // generated nothing at all would pass the assertion above.
    "src/whole.html": doc({ title: "Whole", head: schemaMeta("WebPage"), body: "<h1>Whole</h1>\n" }),
  });
  // No flags: the declaration is the whole opt-in (§26.5).
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a page whose head is never closed");
  expectEmitted(tmp, "ragged.html", "whole.html");

  expectNoBlock(read(tmp, "dist", "ragged.html"), "§26.5 condition 3: there is no insertion point");
  onlyBlock(read(tmp, "dist", "whole.html"), "§26.5: the same declaration with a closed head DOES generate");

  covers("SD-09");
}, TEST_MS);

// ================================================================= §26.4
// The declaration: one key, two spellings, one generator.

test("SD-08 — the HTML meta and the frontmatter key are one declaration, and a layout carries it for a section", async () => {
  const equal = mkTmp();
  const meta = '<meta name="description" content="Twin pages, one generator.">\n'
    + '<meta name="author" content="Dana Reed">\n'
    + '<meta name="date" content="2026-01-02">\n'
    + '<meta property="og:image" content="/card.png">\n';
  writeTree(equal, {
    "src/twin.md": `---
title: Twin
description: Twin pages, one generator.
author: Dana Reed
date: 2026-01-02
og:image: /card.png
lang: en
schema: Article
---

# Twin

Prose.
`,
    "src/twin-html.html": doc({ title: "Twin", head: schemaMeta("Article") + meta, body: "<h1>Twin</h1>\n<p>Prose.</p>\n" }),
    // §20.8's schemaType also reads a JSON-LD @type, which is unrestricted:
    // a page declaring Product in a block it wrote itself is not P23.
    "src/product.html": doc({
      title: "Widget",
      head: ld({ "@context": "https://schema.org", "@type": "Product", name: "Widget" }),
      body: "<h1>Widget</h1>\n",
    }),
    "src/card.png": "a file the site emits\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], equal);
  expectExit(r, 0, "a Markdown page and its HTML twin");
  expectEmitted(equal, "twin.html", "twin-html.html", "product.html");

  const fromMd = onlyBlock(read(equal, "dist", "twin.html"), "the Markdown twin").data;
  const fromHtml = onlyBlock(read(equal, "dist", "twin-html.html"), "the HTML twin").data;
  expectJsonEqual(fromHtml, fromMd, "§26.4: the two spellings are the same declaration and produce identical output");
  if (fromMd.headline !== "Twin" || fromMd.author !== "Dana Reed" || fromMd.datePublished !== "2026-01-02") {
    throw new Error(`the twins agree but on the wrong values: ${JSON.stringify(fromMd)}`);
  }
  onlyBlock(read(equal, "dist", "product.html"), "an authored Product block is not a schema declaration");

  // A layout carries the declaration for a whole section.
  const section = mkTmp();
  writeTree(section, {
    "src/_layout.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="schema" content="WebPage">
</head>
<body>
<main></main>
</body>
</html>
`,
    "src/a.md": "---\ntitle: Alpha\n---\n\n# Alpha\n\nText.\n",
    "src/b.md": "---\ntitle: Beta\n---\n\n# Beta\n\nText.\n",
  });
  const s = await runCli(["build", "-s", "src", "-o", "dist"], section);
  expectExit(s, 0, "two pages under a declaring layout");
  expectEmitted(section, "a.html", "b.html");
  for (const [file, name] of [["a.html", "Alpha"], ["b.html", "Beta"]]) {
    const { data } = onlyBlock(read(section, "dist", file), `${file} under a declaring layout`);
    expectJsonEqual(data, { "@context": "https://schema.org", "@type": "WebPage", name, inLanguage: "en" },
      "§26.4: a layout may carry the declaration for a whole section");
  }

  covers("SD-08");
}, TEST_MS);

test("P23 — a type unify does not generate is a located problem, case-sensitively, and nothing publishes", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/post.md": "---\ntitle: Post\nschema: article\n---\n\n# Post\n\nText.\n",
    "src/thing.html": doc({ title: "Thing", head: schemaMeta("Product"), body: "<h1>Thing</h1>\n" }),
    "dist/sentinel.txt": "the previous build\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "two unacceptable schema values");

  // Located at the declaration, in each file, with a line only where §14.1 can
  // name one (a Markdown page's frontmatter offset may have none).
  const md = /^src\/post\.md(?::(\d+))?: problem: (.*)$/m.exec(r.stderr);
  if (!md) throw new Error(`P23: expected a located problem on src/post.md\nstderr:\n${r.stderr}`);
  const html = /^src\/thing\.html(?::(\d+))?: problem: (.*)$/m.exec(r.stderr);
  if (!html) throw new Error(`P23: expected a located problem on src/thing.html\nstderr:\n${r.stderr}`);
  if (html[1] && Number(html[1]) !== 6) {
    throw new Error(`P23: the meta is on line 6 of src/thing.html, the diagnostic says line ${html[1]}`);
  }
  if (r.stderr.indexOf("src/post.md") > r.stderr.indexOf("src/thing.html")) {
    throw new Error(`§14.1: diagnostics print ordered by path\nstderr:\n${r.stderr}`);
  }
  // The message names the value it refused and the three spellings it accepts;
  // the fix names the escape hatch for any other vocabulary.
  for (const needle of ["article", "WebPage", "Article", "BlogPosting"]) {
    expectIncludes(md[2], needle, "P23: the message names the value and the three accepted spellings");
  }
  expectIncludes(html[2], "Product", "P23: the message names the value it refused");
  expectIncludes(r.stderr, "application/ld+json", "P23: the fix names the block that carries any other vocabulary");

  // §15: a problem leaves the previous output byte-for-byte untouched.
  if (read(tmp, "dist", "sentinel.txt") !== "the previous build\n") {
    throw new Error("§15: a problem must leave the previous dist/ untouched");
  }
  const after = readdirSync(join(tmp, "dist")).sort().join(",");
  if (after !== "sentinel.txt") throw new Error(`§15: nothing publishes on a problem; dist/ holds ${after}`);

  // Case is the whole difference: the same declarations, spelled exactly, build.
  const ok = mkTmp();
  writeTree(ok, {
    "src/post.md": "---\ntitle: Post\nschema: Article\n---\n\n# Post\n\nText.\n",
    "src/thing.html": doc({ title: "Thing", head: schemaMeta("BlogPosting"), body: "<h1>Thing</h1>\n" }),
  });
  const good = await runCli(["build", "-s", "src", "-o", "dist"], ok);
  expectExit(good, 0, "the same declarations spelled exactly");
  onlyBlock(read(ok, "dist", "post.html"), "schema: Article");
  onlyBlock(read(ok, "dist", "thing.html"), 'content="BlogPosting"');

  covers("P23");
}, TEST_MS);

// ================================================================= §26.7
// Ordering, the dry-run line, and audit.

test("SD-13 — generation runs after §22's completion, so the block names the canonical the build just wrote", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/index.html": doc({ title: "Home", body: '<h1>Home</h1>\n<p><a href="/post.html">Post</a></p>\n' }),
    "src/post.html": doc({ title: "Post", head: schemaMeta("Article"), body: "<h1>Post</h1>\n" }),
  });
  const r = await runCli(
    ["build", "-s", "src", "-o", "dist", "--base-url", BASE, "--canonical", "auto"], tmp);
  expectExit(r, 0, "--canonical auto beside a schema declaration");
  expectEmitted(tmp, "post.html");

  const out = read(tmp, "dist", "post.html");
  const canonical = '<link rel="canonical" href="https://example.com/post.html">';
  expectIncludes(out, canonical, "§22.2: the completed canonical");
  if (out.split(canonical).length - 1 !== 1) throw new Error("§22: never two canonicals");

  const iCanon = out.indexOf(canonical);
  const iBlock = out.indexOf('<script type="application/ld+json">');
  const iHeadEnd = out.indexOf("</head>");
  if (iBlock < 0) throw new Error(`§26.5: no block was generated\n${out}`);
  if (!(iCanon < iBlock && iBlock < iHeadEnd)) {
    throw new Error(`§26.7: completion writes first, generation second — both at the end of the head, in that order.\ncanonical@${iCanon} block@${iBlock} </head>@${iHeadEnd}\n${out}`);
  }
  const { data } = headBlock(out, "the generated block");
  if (data.url !== "https://example.com/post.html") {
    throw new Error(`§26.6: url is the COMPLETED canonical, not a second opinion. Got ${JSON.stringify(data.url)}`);
  }

  covers("SD-13");
}, TEST_MS);

test("SD-13 — --dry-run names the work and writes nothing; audit runs §26 because §26 has no flag", async () => {
  const dry = mkTmp();
  writeTree(dry, {
    "src/gain-one.html": doc({ title: "One", head: schemaMeta("Article"), body: "<h1>One</h1>\n" }),
    "src/gain-two.md": "---\ntitle: Two\nschema: WebPage\n---\n\n# Two\n\nText.\n",
    // Declares a type AND writes its own block: authored JSON-LD wins, so this
    // page would gain nothing and must not be counted.
    "src/authored.html": doc({
      title: "Authored",
      head: schemaMeta("Article") + ld({ "@context": "https://schema.org", "@type": "Product", name: "Widget" }),
      body: "<h1>Authored</h1>\n",
    }),
    "src/plain.html": doc({ title: "Plain", body: "<h1>Plain</h1>\n" }),
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run"], dry);
  expectExit(r, 0, "--dry-run over a site with two gaining pages");
  expectIncludes(r.stdout, "structured data: 2 pages would gain a JSON-LD block",
    "§26.7: --dry-run names the work beside §22's own line");
  if (existsSync(join(dry, "dist"))) throw new Error("§15/§17: --dry-run writes nothing");

  const real = await runCli(["build", "-s", "src", "-o", "dist"], dry);
  expectExit(real, 0, "the real build of the same tree");
  onlyBlock(read(dry, "dist", "gain-one.html"), "gain-one");
  onlyBlock(read(dry, "dist", "gain-two.html"), "gain-two");
  if (onlyBlock(read(dry, "dist", "authored.html"), "authored").data.name !== "Widget") {
    throw new Error("§26.5: the counted pages are exactly the ones that gain a block");
  }
  expectNoBlock(read(dry, "dist", "plain.html"), "a page declaring nothing");

  // audit runs the whole pipeline, §26 included — so §26.4's refusal is a
  // pipeline problem there exactly as it is in build (§24.6).
  const bad = mkTmp();
  writeTree(bad, { "src/post.md": "---\ntitle: Post\nschema: Product\n---\n\n# Post\n\nText.\n" });
  const a = await runCli(["audit", "-s", "src", "-o", "dist"], bad);
  expectExit(a, 1, "audit over a site whose schema value §26.4 refuses");
  expectIncludes(a.stderr, "src/post.md", "§24.5: diagnostics keep their own stream during an audit");
  if (existsSync(join(bad, "dist"))) throw new Error("§24.2: audit writes nothing, anywhere");

  const good = mkTmp();
  writeTree(good, { "src/post.html": doc({ title: "Post", head: schemaMeta("Article"), body: "<h1>Post</h1>\n" }) });
  const ok = await runCli(["audit", "-s", "src", "-o", "dist"], good);
  expectExit(ok, 0, "audit over a site that generates a block");
  if (existsSync(join(good, "dist"))) throw new Error("§24.2: audit never creates the output directory");

  covers("SD-13");
}, TEST_MS);

test("SD-13 — a reference §12 finds inside a generated block is located at the page, without a line", async () => {
  const tmp = mkTmp();
  // §26.7 has §12 check the generated block like any other. Its `image` is the
  // `og:image` value, so a page whose share image names nothing puts a P13
  // inside bytes NO source file contains — §1's provenance is "the source file
  // whose text contained the element's start tag" and a generated element has
  // none. §14.1 decides the rest: a line is omitted rather than guessed, and a
  // plausible-looking number is worse than none because it is checkable and
  // wrong. The description is long deliberately: the block's length is what
  // decides how far a naive mapping walks back past the insertion point.
  writeTree(tmp, {
    "src/_layout.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Site</title>
</head>
<body>
<main></main>
</body>
</html>
`,
    "src/page.md": `---
title: Long Description Page
schema: Article
description: ${"prose ".repeat(60).trim()}
og:image: /missing.png
---

# Page

Words.
`,
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a share image naming a file the site does not emit");

  const reports = [...r.stderr.matchAll(/^(\S+?)(?::(\d+))?: problem: \/missing\.png does not resolve/gm)];
  if (reports.length === 0) {
    throw new Error(`§12: the og:image names nothing and must be a problem\nstderr:\n${r.stderr}`);
  }
  // The author's own declaration, at its provenance (§14.1) — the .md file,
  // line-less because §10.1 converts before it inlines.
  if (!reports.some((m) => m[1] === "src/page.md")) {
    throw new Error(`§14.1: the og:image is located at the page that declared it\nstderr:\n${r.stderr}`);
  }
  // §26.7 — the generated block's copy is located at THE PAGE THE BLOCK WAS
  // GENERATED FOR, never at whichever file contributed the `</head>` it was
  // spliced before: here that is `_layout.html`, which contains no such
  // reference and which the author can grep to no effect. And no line, since
  // §1's provenance has none for an element no file wrote.
  for (const m of reports) {
    if (m[1] !== "src/page.md") {
      throw new Error(
        `§26.7: a reference inside a generated block is located at the page it was generated for, `
        + `not at ${m[1]}, which holds no such reference\nstderr:\n${r.stderr}`,
      );
    }
    if (m[2] !== undefined) {
      throw new Error(
        `§14.1/DIA-06: this reference lives in bytes unify generated, so no line of ${m[1]} holds it — `
        + `the FILE: SEVERITY: form is required, not ${m[1]}:${m[2]}\nstderr:\n${r.stderr}`,
      );
    }
  }
  // Both diagnostics are now one file, one (absent) line, one message — which
  // is §14.1's deduplication rule, and the reason one authored fault prints
  // once rather than twice on the default authoring path.
  if (reports.length !== 1) {
    throw new Error(
      `§14.1: one fault, one diagnostic — the generated copy and the authored declaration `
      + `print identically here and deduplicate\nstderr:\n${r.stderr}`,
    );
  }

  covers("SD-13", "DIA-06");
}, TEST_MS);

test("SD-13 — the residual never names the layout or the fragment that wrote </head>", async () => {
  // The same fault one shape further out: the failing `og:image` is written in
  // a FRAGMENT the layout includes, so the insertion point's provenance is
  // neither the page nor the file that declared the value. §26.7 fixes the
  // answer at the page the block was generated for; §14.1's dedup does not
  // apply here, because the authored declaration has a line of its own.
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/parts/meta.fragment.html": '<meta property="og:image" content="/share.png">\n',
    "src/_layout.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title> — Site</title>
<include src="/parts/meta.fragment.html"></include>
</head>
<body>
<main></main>
</body>
</html>
`,
    "src/index.md": "---\ntitle: Post\nschema: Article\ndate: 2026-01-02\n---\n\n# Post\n\nWords.\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 1, "a share image, written in a fragment, naming nothing");

  const reports = [...r.stderr.matchAll(/^(\S+?)(?::(\d+))?: problem: \/share\.png does not resolve/gm)];
  const at = reports.map((m) => (m[2] === undefined ? m[1] : `${m[1]}:${m[2]}`));
  // The author's own declaration, where they wrote it.
  if (!at.includes("src/parts/meta.fragment.html:1")) {
    throw new Error(`§14.1: the authored og:image is located in the fragment that wrote it\nstderr:\n${r.stderr}`);
  }
  // The generated block's copy, at the page — and nothing at the layout.
  if (!at.includes("src/index.md")) {
    throw new Error(`§26.7: the generated block's reference is located at the page it was generated for\nstderr:\n${r.stderr}`);
  }
  if (at.some((where) => where.startsWith("src/_layout.html"))) {
    throw new Error(
      `§26.7: the layout contributed the </head> and contains no such reference — naming it is `
      + `§1's provenance guessed one field over\nstderr:\n${r.stderr}`,
    );
  }

  covers("SD-13", "DIA-06");
}, TEST_MS);

test("SD-13/DIA-06 — a generated block never moves a §12 diagnostic, and never prints a line the file cannot hold", async () => {
  // §26.6: the block is inserted and "the rest of the document is byte-identical".
  // A diagnostic that indexes those bytes has to be told the same thing: a
  // reference AFTER the insertion point kept its own line, or the height of the
  // block was silently added to the printed number. The two trees below differ
  // in exactly six letters — `schema` against `scheme`, a key that declares
  // nothing — so they have identical line structure and identical references,
  // and the only difference between the builds is that one generates a block.
  const page = (metaName) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>T</title>
  <link rel="stylesheet" href="/missing-a.css">
  <meta name="${metaName}" content="WebPage">
</head>
<body>
  <main>
    <h1>T</h1>
    <a href="/missing-b.html">b</a>
    <img src="/missing-c.png" alt="">
  </main>
</body>
</html>
`;
  const lineCount = page("schema").split("\n").length;
  const run = async (metaName) => {
    const tmp = mkTmp();
    writeTree(tmp, { "src/index.html": page(metaName) });
    // A long path prefix, deliberately: §11.3 rewrites every root-relative
    // value to an absolute URL, which is what pushes a later reference past
    // the span table and into the locator's last-resort numbering.
    const r = await runCli(
      ["build", "-s", "src", "-o", "dist", "--base-url", "https://example.com/my-project-documentation/"], tmp);
    expectExit(r, 1, `three references naming nothing (${metaName})`);
    return [...r.stderr.matchAll(/^src\/index\.html(?::(\d+))?: problem: (\S+) does not resolve/gm)]
      .map((m) => ({ line: m[1] === undefined ? null : Number(m[1]), target: m[2], text: r.stderr }));
  };

  const generating = await run("schema");
  const inert = await run("scheme");
  if (generating.length !== 3) {
    throw new Error(`the fixture is vacuous: expected three §12 problems, got ${generating.length}\n${generating[0]?.text ?? ""}`);
  }
  for (const d of generating) {
    if (d.line !== null && d.line > lineCount) {
      throw new Error(
        `§14.1/DIA-06: ${d.target} is reported at line ${d.line} of a ${lineCount}-line file — a number the `
        + `file cannot hold is DIA-06's "checkable-looking and wrong" reached by arithmetic\n${d.text}`,
      );
    }
  }
  const shape = (ds) => ds.map((d) => `${d.target}@${d.line}`).join(", ");
  if (shape(generating) !== shape(inert)) {
    throw new Error(
      `§26.6: generating a block leaves the rest of the document byte-identical, so it moves no diagnostic.\n`
      + `  with a block:    ${shape(generating)}\n  without a block: ${shape(inert)}`,
    );
  }

  covers("SD-13", "DIA-06");
}, TEST_MS);

// ================================================================= §26.8
// What is never generated.

test("SD-14 — the never-generated list is closed, and no date comes from the clock, the filesystem, or the filename", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/full.html": doc({
      title: "The Roast",
      head: schemaMeta("Article")
        + '<meta name="description" content="Everything a record can hold.">\n'
        + '<meta name="author" content="Dana Reed">\n'
        + '<meta name="date" content="2026-01-02">\n'
        + '<meta name="lastmod" content="2026-03-04">\n'
        + '<link rel="canonical" href="/full.html">\n'
        + '<meta property="og:image" content="/card.png">\n'
        + '<meta property="og:image:width" content="1200">\n'
        + '<meta property="og:image:height" content="630">\n',
      body: '<h1>The Roast</h1>\n<p>Words worth counting, if anything counted them.</p>\n<p><a href="/2026-01-05-hello.html">Hello</a></p>\n',
    }),
    // A date in the FILENAME and an mtime of right now — neither is a source.
    "src/2026-01-05-hello.md": "---\ntitle: Hello\nschema: BlogPosting\n---\n\n# Hello\n\nText.\n",
    "src/card.png": "a file the site emits\n",
  });
  const r = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "a page with every source present");
  expectEmitted(tmp, "full.html", "2026-01-05-hello.html");

  const { data } = onlyBlock(read(tmp, "dist", "full.html"), "the fully-sourced page");
  const allowed = ["@context", "@type", "headline", "name", "description", "url", "image", "author",
    "datePublished", "dateModified", "inLanguage"];
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) throw new Error(`§26.8: the list of generated properties is closed — ${key} is not on it`);
  }
  for (const banned of ["publisher", "mainEntityOfPage", "@id", "articleBody", "wordCount", "keywords",
    "isPartOf", "breadcrumb", "speakable"]) {
    if (banned in data) throw new Error(`§26.8: no ${banned} — it names something the page did not declare`);
  }
  // record.image carries width and height here; the block still gets the URL
  // alone, because the dimensions belong to the og:image declaration.
  if (typeof data.image !== "string" || data.image !== "/card.png") {
    throw new Error(`§26.8: image is record.image.url, a string, with no width/height inside the block. Got ${JSON.stringify(data.image)}`);
  }

  const dateless = onlyBlock(read(tmp, "dist", "2026-01-05-hello.html"), "the page with a date in its name").data;
  if ("datePublished" in dateless || "dateModified" in dateless) {
    throw new Error(`§26.8/§20.10: no date is ever derived — not the build clock, the filesystem, the filename, or Git. Got ${JSON.stringify(dateless)}`);
  }
  expectJsonEqual(dateless, { "@context": "https://schema.org", "@type": "BlogPosting", headline: "Hello" },
    "§26.6: only the properties whose sources exist");

  covers("SD-14");
}, TEST_MS);

// ================================================================= §26.3
// Validation findings. Each is a PAIR: the fault, and the neighbour that is
// the correct shape the finding must never accuse.

test("SD-02 — jsonld-headline-mismatch: exactly one h1, containment either way, Article and BlogPosting only", async () => {
  const article = (headline) => ld({ "@context": "https://schema.org", "@type": "Article", headline });
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/mismatch.html": doc({ title: "Mismatch", head: article("Quarterly Results"), body: "<h1>Deep Field Survey</h1>\n" }),
    "src/blogposting.html": doc({
      title: "Blog",
      head: ld({ "@context": "https://schema.org", "@type": "BlogPosting", headline: "Quarterly Results" }),
      body: "<h1>Deep Field Survey</h1>\n",
    }),
    // §8 row 2 PREPENDS, so a correct page routinely nests its two strings.
    // Case folds and whitespace collapses before the containment test.
    "src/headline-wider.html": doc({ title: "Wider", head: article("Deep Field - Example Site"), body: "<h1>deep   field</h1>\n" }),
    // Containment runs in EITHER direction.
    "src/h1-wider.html": doc({ title: "Narrow", head: article("Deep Field"), body: "<h1>Deep Field, the full survey</h1>\n" }),
    // Nothing visible to compare.
    "src/no-h1.html": doc({ title: "No Heading", head: article("Quarterly Results"), body: "<p>No heading here.</p>\n" }),
    // No answer to WHICH one, only a choice.
    "src/two-h1.html": doc({ title: "Two", head: article("Quarterly Results"), body: "<h1>Alpha</h1>\n<h1>Beta</h1>\n" }),
    // A WebPage has no headline to compare, whatever string it carries.
    "src/webpage.html": doc({
      title: "Page",
      head: ld({ "@context": "https://schema.org", "@type": "WebPage", headline: "Quarterly Results" }),
      body: "<h1>Deep Field Survey</h1>\n",
    }),
    "src/no-headline.html": doc({
      title: "Silent",
      head: ld({ "@context": "https://schema.org", "@type": "Article", name: "Quarterly Results" }),
      body: "<h1>Deep Field Survey</h1>\n",
    }),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "eight authored blocks");
  expectEmitted(tmp, "mismatch.html", "blogposting.html", "headline-wider.html", "h1-wider.html",
    "no-h1.html", "two-h1.html", "webpage.html", "no-headline.html");

  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit over the headline fixtures");
  const ID = "jsonld-headline-mismatch";
  expectFires(r, ID, "src/mismatch.html", "incomplete", "§26.3: neither string contains the other");
  expectFires(r, ID, "src/blogposting.html", "incomplete", "§26.3: BlogPosting is in scope too");
  expectSilent(r, ID, "src/headline-wider.html", "§26.3: containment after case folding and whitespace collapse");
  expectSilent(r, ID, "src/h1-wider.html", "§26.3: containment in EITHER direction");
  expectSilent(r, ID, "src/no-h1.html", "§26.3: with no h1 there is nothing visible to compare");
  expectSilent(r, ID, "src/two-h1.html", "§26.3: with several h1s there is no answer to which");
  expectSilent(r, ID, "src/webpage.html", "§26.3: the @type must be Article or BlogPosting");
  expectSilent(r, ID, "src/no-headline.html", "§26.3: the subject object must declare a string headline");

  covers("SD-02");
}, TEST_MS);

test("SD-03 — jsonld-url-mismatch needs both to resolve; a location the site does not emit is P13 instead", async () => {
  const withUrl = (url) => ld({ "@context": "https://schema.org", "@type": "WebPage", url });
  const canon = (href) => `<link rel="canonical" href="${href}">\n`;
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/a.html": doc({ title: "A", head: canon("/a.html") + withUrl("/b.html"), body: "<h1>A</h1>\n" }),
    "src/b.html": doc({ title: "B", head: canon("/b.html") + withUrl("/b.html"), body: "<h1>B</h1>\n" }),
    // Another origin is that site's business; with no --base-url it does not
    // resolve here either.
    "src/c.html": doc({ title: "C", head: canon("/c.html") + withUrl("https://elsewhere.example/x"), body: "<h1>C</h1>\n" }),
    // The page declares no canonical: there is no second address to disagree with.
    "src/d.html": doc({ title: "D", head: withUrl("/b.html"), body: "<h1>D</h1>\n" }),
    // One resolver, so a directory URL and its index.html are one answer (§12).
    "src/dir/index.html": doc({ title: "Dir", head: canon("/dir/") + withUrl("/dir/index.html"), body: "<h1>Dir</h1>\n" }),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "five pages whose JSON-LD urls all resolve");
  expectEmitted(tmp, "a.html", "b.html", "c.html", "d.html", "dir/index.html");

  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit over the url fixtures");
  const ID = "jsonld-url-mismatch";
  expectFires(r, ID, "src/a.html", "broken", "§26.3: two addresses for one page");
  expectSilent(r, ID, "src/b.html", "§26.3: the two resolve to one output path");
  expectSilent(r, ID, "src/c.html", "§26.3: a url on another origin is that site's business");
  expectSilent(r, ID, "src/d.html", "§26.3: the page must declare a canonical");
  expectSilent(r, ID, "src/dir/index.html", "§26.3: one resolver — /dir/ and /dir/index.html are one path");

  // A url naming a location the site does not emit is already P13 — the
  // stronger answer, and the one mechanism.
  const broken = mkTmp();
  writeTree(broken, {
    "src/x.html": doc({ title: "X", head: canon("/x.html") + withUrl("/gone.html"), body: "<h1>X</h1>\n" }),
  });
  const p13 = await runCli(["audit", "-s", "src", "-o", "dist"], broken);
  expectExit(p13, 1, "a JSON-LD url naming nothing this site emits");
  expectIncludes(p13.stderr, "problem", "§12: the closed property list makes it publish-blocking");
  expectSilent(p13, ID, "src/x.html", "§26.3: it fires only when BOTH resolve — P13 has already answered");

  covers("SD-03");
}, TEST_MS);

test("SD-04 — jsonld-lang-mismatch compares primary subtags, case-insensitively", async () => {
  const inLanguage = (v) => ld({ "@context": "https://schema.org", "@type": "WebPage", inLanguage: v });
  const tmp = mkTmp();
  writeTree(tmp, {
    // One document answering one question twice with two answers.
    "src/fr.html": doc({ lang: "fr", title: "Fr", head: inLanguage("en"), body: "<h1>Fr</h1>\n" }),
    // BCP 47 §2.1.1: tags are case-insensitive, so these are one tag.
    "src/case.html": doc({ lang: "en-US", title: "Case", head: inLanguage("EN-us"), body: "<h1>Case</h1>\n" }),
    // A refinement, not a contradiction — one says English, the other says which.
    "src/refine.html": doc({ lang: "en-GB", title: "Refine", head: inLanguage("en"), body: "<h1>Refine</h1>\n" }),
    "src/refine-rev.html": doc({ lang: "en", title: "Reverse", head: inLanguage("en-GB"), body: "<h1>Reverse</h1>\n" }),
    // The page declares no lang: nothing to compare against.
    "src/nolang.html": doc({ lang: null, title: "None", head: inLanguage("en"), body: "<h1>None</h1>\n" }),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "five language pairings");
  expectEmitted(tmp, "fr.html", "case.html", "refine.html", "refine-rev.html", "nolang.html");

  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit over the language fixtures");
  const ID = "jsonld-lang-mismatch";
  expectFires(r, ID, "src/fr.html", "broken", "§26.3: en against fr is two answers");
  expectSilent(r, ID, "src/case.html", "§26.3: EN-us and en-US are one tag");
  expectSilent(r, ID, "src/refine.html", "§26.3: en beside en-GB is a refinement");
  expectSilent(r, ID, "src/refine-rev.html", "§26.3: the refinement reads the same either way round");
  expectSilent(r, ID, "src/nolang.html", "§26.3: the page must declare a lang");

  covers("SD-04");
}, TEST_MS);

test("SD-05 — jsonld-entity-conflict needs one @id and two types; one finding per @id, in sorted order", async () => {
  const node = (obj) => ld({ "@context": "https://schema.org", ...obj });
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/conflict.html": doc({
      title: "Conflict",
      head: node({ "@type": "WebPage", "@id": "#alpha", name: "One" }) + node({ "@type": "Article", "@id": "#alpha", name: "Two" }),
      body: "<h1>Conflict</h1>\n",
    }),
    // §24.4 already records this shape as recommended practice: a WebPage
    // beside an Organization is TWO entities, and the missing @id is what
    // separates the two cases.
    "src/two-entities.html": doc({
      title: "Two Entities",
      head: node({ "@type": "WebPage", name: "One" }) + node({ "@type": "Organization", name: "Two" }),
      body: "<h1>Two Entities</h1>\n",
    }),
    // Same @id, same @type: one entity, said twice.
    "src/same-type.html": doc({
      title: "Same",
      head: node({ "@type": "WebPage", "@id": "#zeta", name: "One" }) + node({ "@type": "WebPage", "@id": "#zeta", name: "Two" }),
      body: "<h1>Same</h1>\n",
    }),
    "src/pair.html": doc({
      title: "Pair",
      head: node({ "@type": "WebPage", "@id": "#omega" }) + node({ "@type": "Organization", "@id": "#omega" })
        + node({ "@type": "Person", "@id": "#alpha" }) + node({ "@type": "Article", "@id": "#alpha" }),
      body: "<h1>Pair</h1>\n",
    }),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "four pages of authored entities");
  expectEmitted(tmp, "conflict.html", "two-entities.html", "same-type.html", "pair.html");

  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit over the entity fixtures");
  const ID = "jsonld-entity-conflict";
  const one = expectFires(r, ID, "src/conflict.html", "broken", "§26.3: one entity classed two ways");
  if (one.length !== 1) throw new Error(`§26.3: one finding per @id, got ${one.length} on src/conflict.html`);
  expectSilent(r, ID, "src/two-entities.html", "§26.3: it fires on nothing that lacks an @id");
  expectSilent(r, ID, "src/same-type.html", "§26.3: the @type values must DIFFER");

  const pair = expectFires(r, ID, "src/pair.html", "broken", "§26.3: one finding per @id");
  if (pair.length !== 2) throw new Error(`§26.3: two conflicting @ids, two findings — got ${pair.length}\nstdout:\n${r.stdout}`);
  // "in sorted order" — the evidence quotes the output (§24.5), so the @id it
  // names is what the reader greps for.
  const first = pair[0].evidence.includes("#alpha");
  const second = pair[1].evidence.includes("#omega");
  if (!first || !second) {
    throw new Error(`§26.3/§24.5: one finding per @id, in sorted order, each quoting its own @id.\n${pair.map((f) => f.evidence).join("\n")}`);
  }

  covers("SD-05");
}, TEST_MS);

test("SD-06 — date-unusable quotes the author's own bytes, and the generated block then carries no date", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/bad.md": "---\ntitle: Bad\nschema: Article\ndate: January 3, 2026\n---\n\n# Bad\n\nText.\n",
    "src/good.md": "---\ntitle: Good\nschema: Article\ndate: 2026-01-03\n---\n\n# Good\n\nText.\n",
    // W3C-DTF requires the literal T and a zone whenever a time is present.
    "src/both.md": "---\ntitle: Both\nschema: Article\ndate: 2026-01-03 09:30:00\nlastmod: yesterday\n---\n\n# Both\n\nText.\n",
    // No date at all: nothing declared, nothing to call unusable.
    "src/none.md": "---\ntitle: None\nschema: Article\n---\n\n# None\n\nText.\n",
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "a malformed date never blocks a publish");
  expectEmitted(tmp, "bad.html", "good.html", "both.html", "none.html");

  // §26.6: a date is emitted only from `iso`, so an unusable one produces no
  // property rather than a value that is invalid where it lands.
  const bad = onlyBlock(read(tmp, "dist", "bad.html"), "the malformed-date page").data;
  if ("datePublished" in bad) {
    throw new Error(`§26.6: raw is never emitted anywhere. Got ${JSON.stringify(bad.datePublished)}`);
  }
  if (read(tmp, "dist", "bad.html").includes("January 3, 2026") === false) {
    throw new Error("the fixture must still SHIP the author's meta, or the raw value was silently dropped");
  }
  const good = onlyBlock(read(tmp, "dist", "good.html"), "the well-formed page").data;
  if (good.datePublished !== "2026-01-03") {
    throw new Error(`§26.6: a well-formed date is emitted verbatim from iso. Got ${JSON.stringify(good.datePublished)}`);
  }

  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit over the date fixtures");
  const ID = "date-unusable";
  const bads = expectFires(r, ID, "src/bad.md", "broken", "§26.3: a date no consumer can use");
  if (bads.length !== 1) throw new Error(`§26.3: one finding per field, got ${bads.length} on src/bad.md`);
  expectIncludes(bads[0].evidence, "January 3, 2026", "§26.3: the evidence quotes raw — the only string the author can grep for");
  expectSilent(r, ID, "src/good.md", "§26.3: a well-formed W3C-DTF value is not a fault");
  expectSilent(r, ID, "src/none.md", "§26.3: raw must be non-null");

  const both = expectFires(r, ID, "src/both.md", "broken", "§26.3: both fields are unusable");
  if (both.length !== 2) throw new Error(`§26.3: one finding per field — got ${both.length}\nstdout:\n${r.stdout}`);
  if (!both[0].evidence.includes("2026-01-03 09:30:00") || !both[1].evidence.includes("yesterday")) {
    throw new Error(`§26.3: datePublished first, then dateModified.\n${both.map((f) => f.evidence).join("\n")}`);
  }

  covers("SD-06");
}, TEST_MS);

test("SD-07 — the comparisons §26.3 declines to make: dates at two granularities, two share images, two descriptions, name against title", async () => {
  // A test of DELIBERATE SILENCE needs a positive control on the same run, or
  // it passes just as happily against a §26 that was never wired up at all.
  // `flag.html` is that control: one comparison §26.3 DOES make, on a page in
  // the same tree, audited by the same command. Its finding is what proves the
  // silence below is a decision rather than an absence.
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/contact.html": doc({
      title: "Contact",
      head: '<meta name="description" content="Reach the team.">\n'
        + '<link rel="canonical" href="/contact.html">\n'
        + '<meta property="og:image" content="/card.png">\n'
        // BOTH date spellings, at two granularities. This is §24.4's own
        // stated exclusion from metadata-conflict, and without both metas the
        // silence assertion below would be vacuous: one meta declares no
        // conflict to decline reporting in the first place.
        + '<meta property="article:published_time" content="2026-01-02T09:30:00Z">\n'
        + '<meta name="date" content="2026-01-02">\n'
        + ld({
          "@context": "https://schema.org",
          "@type": "WebPage",
          // name against <title>: title-h1-mismatch's question with a third string.
          name: "Get in touch",
          // a description written for a rich result, beside one for a snippet.
          description: "A different description, written for a rich result.",
          url: "/contact.html",
          // a share image for the crawler, beside one for the social scraper.
          image: "/other-card.png",
          // one instant at two granularities, a third time.
          datePublished: "2026-01-02T09:30:00Z",
          inLanguage: "en",
        }),
      body: "<h1>Contact</h1>\n<p>Words.</p>\n",
    }),
    // The control. One fault, of a kind §26.3 does compare.
    "src/flag.html": doc({
      lang: "en",
      title: "Flag",
      head: '<meta name="description" content="The control page.">\n'
        + ld({ "@context": "https://schema.org", "@type": "WebPage", inLanguage: "fr" }),
      body: "<h1>Flag</h1>\n<p>Words.</p>\n",
    }),
    "src/card.png": "a file the site emits\n",
    "src/other-card.png": "another file the site emits\n",
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "a page carrying four deliberately-uncompared pairs, beside a control");
  expectEmitted(tmp, "contact.html", "flag.html");

  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit over the uncompared pairs");

  // The control fires. Everything below is now a claim about §26.3's choices
  // rather than about whether §26.3 ran.
  expectFires(r, "jsonld-lang-mismatch", "src/flag.html", "broken",
    "the positive control: §26.3 IS comparing blocks in this run, so the silence below is a decision");

  for (const id of ["jsonld-headline-mismatch", "jsonld-url-mismatch",
    "jsonld-entity-conflict", "date-unusable", "metadata-conflict"]) {
    expectSilent(r, id, "src/contact.html",
      "§26.3: each of these pairs needs a judgement — about time zones, about which consumer, about a third string");
  }
  // Named apart from the loop above, because it is silent for a DIFFERENT
  // reason and lumping it in would misdescribe the rule: `inLanguage: "en"`
  // beside `lang="en"` is a comparison §26.3 makes and that the page passes.
  // The declined list is about comparisons never attempted; this one was.
  expectSilent(r, "jsonld-lang-mismatch", "src/contact.html",
    "§26.3: this comparison is made and agrees — not declined, which is a different sentence");

  covers("SD-07");
}, TEST_MS);

test("SD-01 — a @graph or an array is several entities, so every §26.3 comparison is silent on it", async () => {
  // The four faults, written once and then re-shaped three ways. On a single
  // object they are all findings; inside a @graph or an array they are all
  // silence, because deciding WHICH node is this page is a judgement.
  const faulty = { "@type": "Article", "@id": "#node", headline: "Nothing Like The Heading", url: "/other.html", inLanguage: "en" };
  const clash = { "@type": "WebPage", "@id": "#node" };
  const head = (payload) => '<link rel="canonical" href="/PAGE.html">\n'
    + '<meta name="date" content="2026-05-06">\n'
    + payload;
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/single.html": doc({
      lang: "fr",
      title: "Single",
      head: head(ld({ "@context": "https://schema.org", ...faulty }) + ld({ "@context": "https://schema.org", ...clash }))
        .replace("/PAGE.html", "/single.html"),
      body: "<h1>Deep Field Survey</h1>\n",
    }),
    "src/graph.html": doc({
      lang: "fr",
      title: "Graph",
      head: head(ld({ "@context": "https://schema.org", "@graph": [faulty, clash] })).replace("/PAGE.html", "/graph.html"),
      body: "<h1>Deep Field Survey</h1>\n",
    }),
    "src/array.html": doc({
      lang: "fr",
      title: "Array",
      head: head(ld([{ "@context": "https://schema.org", ...faulty }, { "@context": "https://schema.org", ...clash }]))
        .replace("/PAGE.html", "/array.html"),
      body: "<h1>Deep Field Survey</h1>\n",
    }),
    "src/other.html": doc({ title: "Other", body: "<h1>Other</h1>\n" }),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "three shapes of one payload");
  expectEmitted(tmp, "single.html", "graph.html", "array.html", "other.html");

  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit over the three shapes");

  // The positive control: as a single object, the payload is a subject object
  // and three of the findings fire. Without this the silence below is vacuous.
  expectFires(r, "jsonld-headline-mismatch", "src/single.html", "incomplete", "§26.2: a single object IS the subject object");
  expectFires(r, "jsonld-url-mismatch", "src/single.html", "broken", "§26.2: a single object IS the subject object");
  expectFires(r, "jsonld-lang-mismatch", "src/single.html", "broken", "§26.2: a single object IS the subject object");
  expectFires(r, "jsonld-entity-conflict", "src/single.html", "broken", "§26.2: two subject objects, one @id, two types");

  // §26.2's RECORDED LIMITATION, asserted deliberately: `@graph` is how several
  // widely-deployed CMS plugins emit structured data, and on those pages every
  // §26.3 COMPARISON says nothing — the four findings that read a block. That is the documented cost of the bounded
  // reading — a claim about the wrong node of a graph is worse than no claim.
  // A later revision that teaches §26.2 to read a graph must first say WHICH
  // node is the page, in the spec; when it does, this test fails, and it is
  // meant to, so the change is read rather than absorbed.
  for (const page of ["src/graph.html", "src/array.html"]) {
    for (const id of ["jsonld-headline-mismatch", "jsonld-url-mismatch", "jsonld-lang-mismatch", "jsonld-entity-conflict"]) {
      expectSilent(r, id, page, "§26.2: an array and a @graph are several entities — the finding says nothing");
    }
    // date-unusable is silent here for its own reason: it reads no JSON-LD at
    // all, and these pages declare a well-formed date. Asserted so the row is
    // complete rather than assumed — and separated from "silent because
    // @graph" by the test below, which is the only input that can tell the two
    // reasons apart.
    expectSilent(r, "date-unusable", page, "§26.3: date-unusable reads the record's dates, not the block");
  }

  covers("SD-01");
}, TEST_MS);

test("SD-01 — date-unusable reads no block, so a @graph page with a malformed date is reported like any other", async () => {
  // The separating input. §26.2's cost is that every §26.3 COMPARISON is
  // silent on a `@graph` page; `date-unusable` is not a comparison — it reads
  // the record's own dates (§20.10) and no JSON-LD at all, which is what
  // §26.3's own row says. A fixture whose @graph pages all carry well-formed
  // dates cannot tell "silent because @graph" from "silent because the date is
  // fine", so this one carries a malformed date beside the graph.
  const graph = { "@context": "https://schema.org", "@graph": [{ "@type": "Article", headline: "Nothing Like The Heading" }] };
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/graph.html": doc({
      title: "Graph",
      head: '<meta name="date" content="Jan 2, 2026">\n' + ld(graph),
      body: '<h1>Deep Field Survey</h1>\n<p><a href="/plain.html">Plain</a></p>\n',
    }),
    // The control: the same malformed date with no structured data at all.
    "src/plain.html": doc({
      title: "Plain",
      head: '<meta name="date" content="Jan 2, 2026">\n',
      body: '<h1>Plain</h1>\n<p><a href="/graph.html">Graph</a></p>\n',
    }),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "a @graph page whose date is not W3C-DTF");
  expectEmitted(tmp, "graph.html", "plain.html");

  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit over a @graph page with a malformed date");
  for (const page of ["src/graph.html", "src/plain.html"]) {
    expectFires(r, "date-unusable", page, "broken",
      "§26.3: date-unusable is the one finding here that reads no JSON-LD — a @graph does not silence it");
  }
  // And the comparisons stay silent on the graph, which is what §26.2 costs:
  // the headline in that graph contradicts the h1 and says nothing.
  expectSilent(r, "jsonld-headline-mismatch", "src/graph.html",
    "§26.2: a @graph is several entities — the comparison says nothing");

  covers("SD-01", "SD-06");
}, TEST_MS);

test("SD-13 — a generated block audits as bytes: url and inLanguage silent by construction, headline reported beside title-h1-mismatch", async () => {
  // §26.7's claim about what `audit` sees, pinned in both directions. Two of
  // the three comparisons a generated block can reach compare a record field
  // against the same record field §26.6 copied, so they are silent whatever
  // the page says. `headline` is not one of them: §26.6 takes it from
  // `record.title` and §26.3 compares it against the `h1`, so a page whose
  // title and heading disagree collects the finding beside `title-h1-mismatch`
  // — one disagreement, two vocabularies, one repair. Excluding a block "this
  // build generated" is refused in the spec: a finding is a predicate over the
  // §20 manifest, and emitted bytes carry no record of who wrote them.
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/index.html": doc({
      title: "Quarterly Results",
      head: '<meta name="description" content="The numbers for the quarter.">\n'
        + '<link rel="canonical" href="/index.html">\n'
        + schemaMeta("Article")
        + '<meta name="date" content="2026-01-02">\n',
      body: '<h1>Deep Field Survey</h1>\n<p>Words.</p>\n',
    }),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "a page whose title and h1 disagree, declaring schema: Article");
  expectEmitted(tmp, "index.html");

  // The block exists and is unify's own: its headline is the TITLE, which is
  // what makes the finding below a statement about generated bytes.
  const { data } = onlyBlock(read(tmp, "dist", "index.html"), "the generated block");
  if (data.headline !== "Quarterly Results" || data.url !== "/index.html" || data.inLanguage !== "en") {
    throw new Error(`§26.6: the block is built from record fields\n${JSON.stringify(data, null, 2)}`);
  }

  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit over a page carrying a generated block");
  expectFires(r, "jsonld-headline-mismatch", "src/index.html", "incomplete",
    "§26.7: a generated headline is the record's TITLE, and §26.3 compares it against the h1");
  expectFires(r, "title-h1-mismatch", "src/index.html", "incomplete",
    "§24.4: the same disagreement in the other vocabulary — both are true, and the repair is one");
  for (const id of ["jsonld-url-mismatch", "jsonld-lang-mismatch", "jsonld-entity-conflict"]) {
    expectSilent(r, id, "src/index.html",
      "§26.7: these compare the block against the record fields §26.6 copied — silent by construction");
  }

  covers("SD-13", "SD-02");
}, TEST_MS);

test("SD-11 — headline carries the MERGED title, and the suffix alone never draws a finding", async () => {
  // §26.6's clause that exists because the output reads as a defect and is
  // not one. §8 row 2 PREPENDS a page's own <title> to the layout's, so a
  // record's title is "Shipping in public — Example" and that is what the
  // block declares. Cutting the suffix off would mean guessing which bytes
  // are the site's name: the separator lives in the layout (§8), unify never
  // learns it, and splitting at the first dash or pipe is wrong the first
  // time a headline contains one.
  //
  // The claim this test exists for is the SECOND half — that the choice is
  // harmless, because a merged title contains its own h1 by construction and
  // §26.3's containment test is chosen for exactly that. A distance score,
  // or an equality test, would have made every generated block on every
  // layout-using site report a mismatch against its own page: the single
  // highest-volume false accusation §26 could have shipped.
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/_layout.html": `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>— Example</title>
</head>
<body>
<main><slot></slot></main>
</body>
</html>
`,
    "src/post.md": `---
title: Shipping in public
description: Why we write the changelog first.
schema: BlogPosting
---

# Shipping in public

Words about the thing.
`,
    // The control: an em dash inside the page's OWN title. A build that split
    // on the separator would cut here and emit "Shipping" — a headline the
    // author never wrote, and one the h1 no longer contains.
    "src/split.md": `---
title: "Shipping — and telling people"
description: A second page.
schema: BlogPosting
---

# Shipping — and telling people

Words.
`,
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "two Markdown pages under a layout that supplies a title suffix");
  expectEmitted(tmp, "post.html", "split.html");

  const post = headBlock(read(tmp, "dist", "post.html"), "the merged-title block");
  if (post.data.headline !== "Shipping in public — Example") {
    throw new Error(`§26.6: headline is record.title, suffix and all — got ${JSON.stringify(post.data.headline)}`);
  }
  const split = headBlock(read(tmp, "dist", "split.html"), "the block whose own title holds an em dash");
  if (split.data.headline !== "Shipping — and telling people — Example") {
    throw new Error(
      `§26.6: nothing is cut at a separator — got ${JSON.stringify(split.data.headline)}.\n` +
      `A build that split here invented a headline its author never wrote.`,
    );
  }

  // The whole point: neither page is accused, by §26.3 or by §24.4.
  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit over two pages carrying generated blocks");
  for (const page of ["src/post.md", "src/split.md"]) {
    expectSilent(r, "jsonld-headline-mismatch", page,
      "§26.6: a merged title contains its own h1, which is why §26.3 tests containment");
    expectSilent(r, "title-h1-mismatch", page,
      "§24.4's own containment rule, on the same two strings — the two must agree");
  }

  covers("SD-11", "SD-02");
}, TEST_MS);

test("SD-08 — a schema declaration in the body generates nothing, is not P23, and is reported as metadata-in-body", async () => {
  // §26.4: the declaration is read WITH THE HEAD (§20.3), so a body-placed one
  // reaches neither a consumer nor the generator. P23 keeps §20.8's scope —
  // diagnosing a declaration the manifest never accepted would be a problem
  // raised against markup that changes nothing — and §24.4's closed set is
  // what reports the misplacement instead, for BOTH the accepted spelling and
  // the misspelling. Without that row this key, whose only purpose is to switch
  // generation on, would be the one head-only meta whose misplacement nothing
  // reports: no block, no problem, no finding.
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/accepted.html": doc({
      title: "Accepted",
      head: '<meta name="description" content="A declaration in the wrong half of the document.">\n',
      body: schemaMeta("Article") + '<h1>Accepted</h1>\n<p><a href="/misspelled.html">Next</a></p>\n',
    }),
    "src/misspelled.html": doc({
      title: "Misspelled",
      head: '<meta name="description" content="A misspelling in the wrong half of the document.">\n',
      body: schemaMeta("article") + '<h1>Misspelled</h1>\n<p><a href="/accepted.html">Back</a></p>\n',
    }),
  });
  const b = await runCli(["build", "-s", "src", "-o", "dist"], tmp);
  expectExit(b, 0, "two schema declarations, both in the body");
  expectEmitted(tmp, "accepted.html", "misspelled.html");
  if (b.stderr.includes("schema is")) {
    throw new Error(`§26.4: P23 keeps §20.8's head scope — a body declaration is not diagnosed\nstderr:\n${b.stderr}`);
  }
  for (const file of ["accepted.html", "misspelled.html"]) {
    expectNoBlock(read(tmp, "dist", file), "§26.5: generation reads the head, so a body declaration generates nothing");
  }

  const r = await runCli(["audit", "-s", "src", "-o", "dist"], tmp);
  expectExit(r, 0, "audit over two body-placed declarations");
  for (const page of ["src/accepted.html", "src/misspelled.html"]) {
    const hits = expectFires(r, "metadata-in-body", page, "broken",
      "§24.4: `schema` is in the closed set — unify's own key, read with the head");
    if (!hits.some((f) => f.evidence.includes('<meta name="schema">'))) {
      throw new Error(`§24.5: the evidence names the element it found\n${hits.map((f) => f.evidence).join("\n")}`);
    }
    if (hits.some((f) => f.evidence.includes("browser or crawler"))) {
      throw new Error(
        "§24.4: `schema` is unify's own key — no browser or crawler reads it in the head either, "
        + `so the evidence must not say they would\n${hits.map((f) => f.evidence).join("\n")}`,
      );
    }
  }

  covers("SD-08", "AUD-10");
}, TEST_MS);

// ================================================================= the golden path

test("SD-09 — a site declaring no schema emits no ld+json, and --dry-run --strict still exits 0", async () => {
  const tmp = mkTmp();
  writeTree(tmp, {
    "src/index.html": doc({
      title: "Home",
      head: '<meta name="description" content="The home page of the example site.">\n',
      body: '<h1>Home</h1>\n<p>Welcome.</p>\n<p><a href="/about.html">About</a></p>\n',
    }),
    "src/about.html": doc({
      title: "About",
      head: '<meta name="description" content="The about page of the example site.">\n',
      body: '<h1>About</h1>\n<p>Words.</p>\n<p><a href="/">Home</a></p>\n',
    }),
  });
  const dry = await runCli(["build", "-s", "src", "-o", "dist", "--dry-run", "--strict"], tmp);
  expectExit(dry, 0, "the golden path under --dry-run --strict");
  if (dry.stdout.includes("structured data:")) {
    throw new Error(`§26.7: a site that declares nothing gains nothing, and the report says nothing.\nstdout:\n${dry.stdout}`);
  }

  const r = await runCli(["build", "-s", "src", "-o", "dist", "--strict"], tmp);
  expectExit(r, 0, "the golden path");
  expectEmitted(tmp, "index.html", "about.html");
  for (const file of ["index.html", "about.html"]) {
    expectNoBlock(read(tmp, "dist", file), "§26.5: the declaration is the whole opt-in");
  }

  covers("SD-09");
}, TEST_MS);
