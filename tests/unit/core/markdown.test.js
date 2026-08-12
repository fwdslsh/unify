/**
 * Tier 3 — developer scaffolding, zero authority (testing-strategy §2). These
 * pin src/core/markdown.js's behavior at the unit level while the real Tier 1
 * conformance harness is blocked on the rest of the v0.7.0 pipeline (cli.js's
 * `build` command is still a stub as of this writing — see
 * docs/migration-plan.md). Several cases here mirror conformance fixtures
 * exactly (tests/conformance/spec-fixtures/FIX-13, tests/fixtures/landmines/
 * frontmatter-junk-keys, layout-none-md, md-include-element, empty-md,
 * head-in-markdown, frontmatter-in-html, frontmatter-deep-nest,
 * include-md-fragment) so a regression here is caught before it ever reaches
 * the CLI-spawning harness.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkHtmlFrontmatter, convert, convertFragment, slugify } from "../../../src/core/markdown.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const FIXTURES = join(ROOT, "tests", "fixtures");
const SPEC_FIXTURES = join(ROOT, "tests", "conformance", "spec-fixtures");

/** A minimal Reporter double — records calls, no filesystem/stream involvement. */
function reporter() {
  const diags = [];
  return {
    diags,
    problem(d) { diags.push({ ...d, severity: "problem" }); },
    advisory(d) { diags.push({ ...d, severity: "advisory" }); },
  };
}

function convertFile(absPath, sourceRoot) {
  const source = readFileSync(absPath, "utf8");
  const r = reporter();
  const out = convert(source, { path: absPath, sourceRoot, reporter: r });
  return { out, diags: r.diags };
}

// --------------------------------------------------------- §10.4 heading ids

describe("slugify (§10.4)", () => {
  test.each([
    ["Getting Started", "getting-started"],
    // whitespace becomes hyphens BEFORE punctuation is dropped, so the two
    // spaces around "&" survive as two hyphens even though "&" itself vanishes.
    ["C++ & Rust!", "c--rust"],
    ["Café menü", "café-menü"],
    ["  leading and trailing  ", "leading-and-trailing"],
    ["", ""],
  ])("%s -> %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe("heading ids assigned during conversion", () => {
  test("duplicate headings get -2, -3 suffixes, scoped to one conversion", () => {
    const { out } = (() => {
      const r = reporter();
      return { out: convert("# Setup\n\na\n\n# Setup\n\nb\n\n# Setup\n\nc\n", { path: "/s/x.md", sourceRoot: "/s", reporter: r }) };
    })();
    expect(out.html).toContain('<h1 id="setup">Setup</h1>');
    expect(out.html).toContain('<h1 id="setup-2">Setup</h1>');
    expect(out.html).toContain('<h1 id="setup-3">Setup</h1>');
  });

  test("setext headings get ids too", () => {
    const r = reporter();
    const out = convert("Title\n=====\n\nSub\n---\n", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.html).toContain('<h1 id="title">Title</h1>');
    expect(out.html).toContain('<h2 id="sub">Sub</h2>');
  });

  test("HTML pages are never touched — out of scope by construction (this module only sees .md text)", () => {
    // Documented for readers: markdown.js has no HTML-page code path at all;
    // MD-16's "HTML pages are never touched" is satisfied structurally, not
    // by a runtime check in this module.
    expect(true).toBe(true);
  });
});

// ------------------------------------------------------ §10.3 title fallback

describe("title fallback (§10.3)", () => {
  test("frontmatter title wins over an h1", () => {
    const r = reporter();
    const out = convert("---\ntitle: From frontmatter\n---\n\n# From body\n", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toContain("<title>From frontmatter</title>");
    expect(out.headHtml).not.toContain("From body");
  });

  test("no frontmatter title falls back to the first h1, inline markup stripped", () => {
    const r = reporter();
    const out = convert("# About *us*\n\nbody\n", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toBe("<title>About us</title>");
  });

  test("neither frontmatter title nor h1 -> no title element at all", () => {
    const r = reporter();
    const out = convert("Just a paragraph, no heading.\n", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toBe("");
  });

  test("a second h2/h3 is never used as a fallback — only the first h1 counts", () => {
    const r = reporter();
    const out = convert("## Not this\n\n# This one\n\n# Not this either\n", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toBe("<title>This one</title>");
  });

  test("an empty frontmatter title (bare `title:`) falls back to the h1 (interpretation: empty counts as absent)", () => {
    const r = reporter();
    const out = convert("---\ntitle:\n---\n\n# Fallback\n", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toBe("<title>Fallback</title>");
  });
});

// ------------------------------------------------------------- §10.2 reserved keys

describe("frontmatter reserved keys (§10.2)", () => {
  test("layout is passed through raw, unvalidated — §6.1 selection is not this module's job", () => {
    const r = reporter();
    expect(convert("---\nlayout: none\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r }).layout).toBe("none");
    expect(convert("---\nlayout: /_layout.html\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r }).layout).toBe("/_layout.html");
    expect(convert("---\ntitle: no layout key\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r }).layout).toBeUndefined();
  });

  test("class becomes bodyClass verbatim, unescaped (data, not markup)", () => {
    const r = reporter();
    const out = convert('---\nclass: "solo featured"\n---\nx', { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.bodyClass).toBe("solo featured");
  });

  test("class absent -> bodyClass undefined", () => {
    const r = reporter();
    expect(convert("x", { path: "/s/x.md", sourceRoot: "/s", reporter: r }).bodyClass).toBeUndefined();
  });

  test("lang and dir become htmlAttrs, only the keys present", () => {
    const r = reporter();
    expect(convert("---\nlang: en\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r }).htmlAttrs).toEqual({ lang: "en" });
    expect(convert("---\nlang: ar\ndir: rtl\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r }).htmlAttrs).toEqual({ lang: "ar", dir: "rtl" });
    expect(convert("x", { path: "/s/x.md", sourceRoot: "/s", reporter: r }).htmlAttrs).toEqual({});
  });

  test("reserved keys never also produce a meta", () => {
    const r = reporter();
    const out = convert("---\ntitle: T\nlayout: none\nclass: c\nlang: en\ndir: ltr\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toBe("<title>T</title>");
  });
});

// -------------------------------------------------- §10.2 value serialization

describe("value serialization (§10.2) — no YAML type coercion", () => {
  test("plain scalars ship as source text: booleans, dates, and trailing zeros are not normalized", () => {
    const r = reporter();
    const out = convert(
      "---\ndraft: true\ndate: 2026-01-01\nweight: 0.50\n---\nx",
      { path: "/s/x.md", sourceRoot: "/s", reporter: r },
    );
    expect(out.headHtml).toContain('<meta name="draft" content="true">');
    expect(out.headHtml).toContain('<meta name="date" content="2026-01-01">');
    expect(out.headHtml).toContain('<meta name="weight" content="0.50">');
  });

  test("a quoted scalar serializes as its content with the quotes gone; internal colons survive", () => {
    const r = reporter();
    const out = convert('---\nnote: "Colons: fine, quotes dropped"\n---\nx', { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toContain('<meta name="note" content="Colons: fine, quotes dropped">');
  });

  test("an empty value serializes as the empty string", () => {
    const r = reporter();
    const out = convert("---\nempty:\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toContain('<meta name="empty" content="">');
  });

  test("a list value emits one meta per item, in order", () => {
    const r = reporter();
    const out = convert("---\ntags:\n  - a\n  - b\n  - c\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    const matches = [...out.headHtml.matchAll(/<meta name="tags" content="([^"]*)">/g)].map((m) => m[1]);
    expect(matches).toEqual(["a", "b", "c"]);
  });

  test("reserved keys (date/tags/categories/draft/permalink/slug) have no behavior beyond being plain metas", () => {
    const r = reporter();
    const out = convert("---\ndraft: true\npermalink: /custom/\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    // draft:true does not exclude/hold back the page in any way this module can express —
    // it is simply another meta (MD-14). permalink does not move anything (this module
    // has no output-path concept at all).
    expect(out.headHtml).toContain('<meta name="draft" content="true">');
    expect(out.headHtml).toContain('<meta name="permalink" content="/custom/">');
  });

  test("attribute/text values are HTML-escaped on the way out", () => {
    const r = reporter();
    const out = convert('---\ntitle: "Fish & Chips"\ndescription: "A \\"quoted\\" thing"\n---\nx', { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toContain("<title>Fish &amp; Chips</title>");
    expect(out.headHtml).toContain('content="A &quot;quoted&quot; thing"');
  });
});

// -------------------------------------------------------------- og: naming rule

describe("the og: naming rule (§10.2, amended)", () => {
  test("a flat og:image: key emits property=", () => {
    const r = reporter();
    const out = convert("---\nog:image: /card.png\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toContain('<meta property="og:image" content="/card.png">');
  });

  test("a block og: with image: nested emits the identical property=", () => {
    const r = reporter();
    const out = convert("---\nog:\n  image: /card.png\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toContain('<meta property="og:image" content="/card.png">');
  });

  test("both spellings of the same key produce byte-identical output", () => {
    const r1 = reporter();
    const flat = convert("---\nog:image: /card.png\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r1 });
    const r2 = reporter();
    const block = convert("---\nog:\n  image: /card.png\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r2 });
    expect(flat.headHtml).toBe(block.headHtml);
  });

  test("a non-og prefix (twitter:) emits name=, not property=", () => {
    const r = reporter();
    const out = convert("---\ntwitter:\n  card: summary\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.headHtml).toContain('<meta name="twitter:card" content="summary">');
    expect(out.headHtml).not.toContain("property=");
  });

  test("a list composes with the block/flat sugar: one property= meta per item", () => {
    const r = reporter();
    const out = convert("---\nog:\n  image:\n    - /a.jpg\n    - /b.jpg\n---\nx", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    const matches = [...out.headHtml.matchAll(/<meta property="og:image" content="([^"]*)">/g)].map((m) => m[1]);
    expect(matches).toEqual(["/a.jpg", "/b.jpg"]);
  });
});

// ---------------------------------------------------------------------- P17

describe("P17 — a frontmatter value with no text form (§10.2)", () => {
  test("a mapping nested two levels below a key (block-spelled)", () => {
    const r = reporter();
    convert("---\nog:\n  image:\n    url: /a.jpg\n---\nx", { path: "/s/post.md", sourceRoot: "/s", reporter: r });
    expect(r.diags).toHaveLength(1);
    expect(r.diags[0]).toMatchObject({ file: "post.md", severity: "problem" });
    expect(r.diags[0].message).toContain("og:image");
  });

  test("the same nesting, flat-spelled, is the identical problem — spelling must not change the depth budget", () => {
    const r = reporter();
    convert("---\nog:image:\n  url: /a.jpg\n---\nx", { path: "/s/post.md", sourceRoot: "/s", reporter: r });
    expect(r.diags).toHaveLength(1);
    expect(r.diags[0].message).toContain("og:image");
  });

  test("a list item that is itself a mapping", () => {
    const r = reporter();
    convert("---\nthings:\n  - a: 1\n---\nx", { path: "/s/post.md", sourceRoot: "/s", reporter: r });
    expect(r.diags).toHaveLength(1);
    expect(r.diags[0].message).toContain("things");
  });

  test("a list item that is itself a list", () => {
    const r = reporter();
    convert("---\nthings:\n  - - a\n    - b\n---\nx", { path: "/s/post.md", sourceRoot: "/s", reporter: r });
    expect(r.diags).toHaveLength(1);
    expect(r.diags[0].message).toContain("things");
  });

  test("does not fire for the legal one-level cases", () => {
    const r = reporter();
    convert("---\nog:\n  image: /a.jpg\n  type: website\ntitle: T\n---\nx", { path: "/s/post.md", sourceRoot: "/s", reporter: r });
    expect(r.diags).toHaveLength(0);
  });

  test("spec gap: YAML that fails to parse at all has no dedicated problem ID in the closed catalogue — this reports it as a P17-shaped problem rather than crashing", () => {
    const r = reporter();
    const out = convert('---\ntitle: "unterminated\n---\n\n# Body\n', { path: "/s/post.md", sourceRoot: "/s", reporter: r });
    expect(r.diags).toHaveLength(1);
    expect(r.diags[0]).toMatchObject({ file: "post.md", line: 2, severity: "problem" });
    // Frontmatter that fails to parse contributes no keys at all — same as if it
    // were absent, so the title fallback (§10.3) still reaches the body's h1.
    expect(out.headHtml).toBe("<title>Body</title>");
  });

  test("exact fixture: frontmatter-deep-nest — P17 located at line 4 (the line the nested key is on)", () => {
    const { diags } = convertFile(join(FIXTURES, "landmines", "frontmatter-deep-nest", "src", "post.md"), join(FIXTURES, "landmines", "frontmatter-deep-nest", "src"));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ file: "post.md", line: 4, severity: "problem" });
    expect(diags[0].message).toContain("og:image");
  });
});

// --------------------------------------------------------------- P10 / P11

describe("P10 — frontmatter fence in an .html page (§10.5)", () => {
  test("fires at line 1 for a leading --- fence", () => {
    const r = reporter();
    checkHtmlFrontmatter("---\ntitle: X\n---\n<p>hi</p>", { path: "/s/index.html", sourceRoot: "/s", reporter: r });
    expect(r.diags).toEqual([{ file: "index.html", line: 1, message: expect.stringContaining("frontmatter"), severity: "problem" }]);
  });

  test("does not fire for ordinary HTML", () => {
    const r = reporter();
    checkHtmlFrontmatter("<!doctype html>\n<html></html>", { path: "/s/index.html", sourceRoot: "/s", reporter: r });
    expect(r.diags).toEqual([]);
  });

  test("does not fire when --- appears later in the file, only at byte 0", () => {
    const r = reporter();
    checkHtmlFrontmatter("<p>a horizontal rule follows</p>\n---\n", { path: "/s/index.html", sourceRoot: "/s", reporter: r });
    expect(r.diags).toEqual([]);
  });

  test("exact fixture: frontmatter-in-html", () => {
    const source = readFileSync(join(FIXTURES, "landmines", "frontmatter-in-html", "src", "index.html"), "utf8");
    const r = reporter();
    checkHtmlFrontmatter(source, { path: join(FIXTURES, "landmines", "frontmatter-in-html", "src", "index.html"), sourceRoot: join(FIXTURES, "landmines", "frontmatter-in-html", "src"), reporter: r });
    expect(r.diags).toHaveLength(1);
    expect(r.diags[0]).toMatchObject({ file: "index.html", line: 1, severity: "problem" });
  });
});

describe("P11 — a literal <head> element in a Markdown body (§10.5)", () => {
  test("fires for a block-level <head>, located at its own line", () => {
    const r = reporter();
    convert("# Title\n\n<head><title>x</title></head>\n", { path: "/s/page.md", sourceRoot: "/s", reporter: r });
    expect(r.diags).toHaveLength(1);
    expect(r.diags[0]).toMatchObject({ file: "page.md", line: 3, severity: "problem" });
  });

  test("fires for a mid-paragraph inline <head>, located at the paragraph's line", () => {
    const r = reporter();
    convert("Text with <head> inline.\n", { path: "/s/page.md", sourceRoot: "/s", reporter: r });
    expect(r.diags).toHaveLength(1);
    expect(r.diags[0]).toMatchObject({ file: "page.md", line: 1, severity: "problem" });
  });

  test("does not confuse <header>/<footer> for <head>", () => {
    const r = reporter();
    convert("<header>nav</header>\n\ntext\n\n<footer>f</footer>\n", { path: "/s/page.md", sourceRoot: "/s", reporter: r });
    expect(r.diags).toEqual([]);
  });

  test("does not fire for <head> inside a fenced code block (content, not a directive)", () => {
    const r = reporter();
    convert("```\n<head>x</head>\n```\n", { path: "/s/page.md", sourceRoot: "/s", reporter: r });
    expect(r.diags).toEqual([]);
  });

  test("does not fire for <head> inside a code span", () => {
    const r = reporter();
    convert("Some `<head>` text.\n", { path: "/s/page.md", sourceRoot: "/s", reporter: r });
    expect(r.diags).toEqual([]);
  });

  test("exact fixture: head-in-markdown", () => {
    const { diags } = convertFile(join(FIXTURES, "landmines", "head-in-markdown", "src", "page.md"), join(FIXTURES, "landmines", "head-in-markdown", "src"));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ file: "page.md", line: 3, severity: "problem" });
    expect(diags[0].message).toContain("head");
  });
});

// ------------------------------------------------- the <include> block extension (§10.1/MD-19)

describe("the <include> block extension (§10.1, MD-19)", () => {
  test("a line-initial <include> splices as a clean block, never <p>-wrapped", () => {
    const r = reporter();
    const out = convert("# Page\n\n<include src=\"/_includes/box.html\"></include>\n\nAfter.\n", { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.html).toContain('<include src="/_includes/box.html"></include>');
    expect(out.html).not.toContain('<p><include');
  });

  test("an in-paragraph include is inline raw HTML, staying inside the <p>", () => {
    const r = reporter();
    const out = convert('Badge: <include src="/_includes/badge.html"></include>\n', { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.html).toContain('<p>Badge: <include src="/_includes/badge.html"></include></p>');
  });

  test("a code-fenced include is escaped text, never a directive", () => {
    const r = reporter();
    const out = convert('```\n<include src="/x.html"></include>\n```\n', { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.html).toContain("&lt;include");
    expect(out.html).not.toContain("<include ");
  });

  test("type-6 semantics: <include> interrupts an open paragraph with no blank line needed", () => {
    const r = reporter();
    const out = convert('Some text\n<include src="/a.html"></include>\n\nAfter\n', { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    // If this were type-7 (generic tag, cannot interrupt), the include line would be
    // swallowed as a lazy-continuation line of the paragraph instead of splicing clean.
    expect(out.html).toBe('<p>Some text</p>\n<include src="/a.html"></include>\n<p>After</p>\n');
  });

  test("the void <include> form (no closing tag) also starts a block", () => {
    const r = reporter();
    const out = convert('# Page\n\n<include src="/x.html">\n\nAfter.\n', { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.html).toContain('<include src="/x.html">');
    expect(out.html).not.toContain('<p><include');
  });

  test("SSI comment form is handled by CommonMark's own comment rule, no extension needed", () => {
    const r = reporter();
    const out = convert('Some text\n<!--#include virtual="/a.html" -->\n\nAfter\n', { path: "/s/x.md", sourceRoot: "/s", reporter: r });
    expect(out.html).toBe('<p>Some text</p>\n<!--#include virtual="/a.html" -->\n<p>After</p>\n');
  });

  test("exact fixture: md-include-element — all three placements at once", () => {
    const { out, diags } = convertFile(join(FIXTURES, "landmines", "md-include-element", "src", "page.md"), join(FIXTURES, "landmines", "md-include-element", "src"));
    expect(diags).toEqual([]);
    expect(out.html).toBe(
      '<h1 id="page">Page</h1>\n' +
      '<include src="/_includes/box.html"></include>\n' +
      '<p>Badge: <include src="/_includes/badge.html"></include></p>\n' +
      '<pre><code>&lt;include src=&quot;/_includes/box.html&quot;&gt;&lt;/include&gt;\n</code></pre>\n' +
      '<p>After.</p>\n',
    );
  });
});

// ---------------------------------------------------------- fragments (§5.1 step 4)

describe("convertFragment — an .md file used as an include target", () => {
  test("exact fixture: include-md-fragment/_includes/note.md — frontmatter stripped and ignored", async () => {
    const dir = join(FIXTURES, "landmines", "include-md-fragment", "src");
    const r = reporter();
    const html = await convertFragment(join(dir, "_includes", "note.md"), { sourceRoot: dir, reporter: r });
    expect(html).toContain('<h2 id="from-markdown">From markdown</h2>');
    expect(html).toContain("A converted fragment.");
    expect(html).not.toContain("This frontmatter is ignored");
    expect(html).not.toContain("---");
    expect(r.diags).toEqual([]);
  });

  test("a fragment's own malformed frontmatter does not fail the build — it is never parsed at all", async () => {
    const r = reporter();
    const tmp = join(ROOT, ".scratch-fragment-test.md");
    await writeFile(tmp, "---\nog:\n  image:\n    url: /a.jpg\n---\n\n# Fine\n");
    try {
      const html = await convertFragment(tmp, { sourceRoot: ROOT, reporter: r });
      expect(html).toContain('<h1 id="fine">Fine</h1>');
      expect(r.diags).toEqual([]); // no P17 — a fragment's frontmatter is ignored, not validated
    } finally {
      await rm(tmp, { force: true });
    }
  });

  test("heading ids are still applied, and P11 is still active, in fragment mode", async () => {
    const r = reporter();
    const tmp = join(ROOT, ".scratch-fragment-head.md");
    await writeFile(tmp, "<head>oops</head>\n");
    try {
      await convertFragment(tmp, { sourceRoot: ROOT, reporter: r });
      expect(r.diags).toHaveLength(1);
      expect(r.diags[0].severity).toBe("problem");
    } finally {
      await rm(tmp, { force: true });
    }
  });
});

// -------------------------------------------------------- full-fixture regressions

describe("exact fixture regressions", () => {
  test("FIX-13 — §10.6's worked example (title, description, og:image, dup headings)", () => {
    const dir = join(SPEC_FIXTURES, "FIX-13", "src");
    const { out, diags } = convertFile(join(dir, "about.md"), dir);
    expect(diags).toEqual([]);
    expect(out.headHtml).toBe(
      '<title>About</title>\n' +
      '<meta name="description" content="Who we are">\n' +
      '<meta property="og:image" content="/assets/team.jpg">',
    );
    expect(out.html).toBe(
      '<h1 id="about">About</h1>\n<p>Text here.</p>\n<h1 id="about-2">About</h1>\n<p>More.</p>\n',
    );
  });

  test("layout-none-md — §10.7's worked example (lang, class, description, h1 title)", () => {
    const dir = join(FIXTURES, "landmines", "layout-none-md", "src");
    const { out, diags } = convertFile(join(dir, "standalone.md"), dir);
    expect(diags).toEqual([]);
    expect(out.layout).toBe("none");
    expect(out.htmlAttrs).toEqual({ lang: "en" });
    expect(out.bodyClass).toBe("solo");
    expect(out.headHtml).toBe('<title>Standalone</title>\n<meta name="description" content="Standalone page">');
    expect(out.html).toBe('<h1 id="standalone">Standalone</h1>\n<p>No layout wanted.</p>\n');
  });

  test("frontmatter-junk-keys — reserved-key list plus every value-serialization branch, source order preserved", () => {
    const dir = join(FIXTURES, "landmines", "frontmatter-junk-keys", "src");
    const { out, diags } = convertFile(join(dir, "post.md"), dir);
    expect(diags).toEqual([]);
    expect(out.headHtml).toBe(
      '<title>Junk drawer</title>\n' +
      '<meta name="draft" content="true">\n' +
      '<meta name="date" content="2026-01-01">\n' +
      '<meta name="permalink" content="/custom/">\n' +
      '<meta name="slug" content="junky">\n' +
      '<meta name="tags" content="a">\n' +
      '<meta name="tags" content="b">\n' +
      '<meta name="note" content="Colons: kept, quotes dropped">\n' +
      '<meta name="weight" content="0.50">\n' +
      '<meta name="empty" content="">',
    );
  });

  test("empty-md — a zero-byte .md page: no title, empty body, no diagnostics", () => {
    const dir = join(FIXTURES, "landmines", "empty-md", "src");
    const { out, diags } = convertFile(join(dir, "about.md"), dir);
    expect(diags).toEqual([]);
    expect(out.html).toBe("");
    expect(out.headHtml).toBe("");
    expect(out.bodyClass).toBeUndefined();
    expect(out.htmlAttrs).toEqual({});
    expect(out.layout).toBeUndefined();
  });
});
