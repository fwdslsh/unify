/**
 * Unit tests for src/core/urls.js (Tier 3 — no conformance authority;
 * testing-strategy §2). Two layers:
 *
 *  - Hand-built cases pin every branch of each exported function precisely
 *    (the §11.2 table's eight rows, the §11.1 provenance branches, base-url's
 *    two forms) against known, small inputs.
 *  - Fixture-driven cases drive the REAL pipeline — `includes.js`'s
 *    `inlineIncludes` and `compose.js`'s `compose`, both of which now return
 *    real `{text, spans}` provenance (see either module's own doc comment) —
 *    then apply urls.js on top, using `spansToLocator` to build
 *    `provenanceOf` straight from the real spans, and diff the result
 *    against the checked-in kitchen-sink / landmine expected trees using
 *    compare.mjs's `compareHtml` (H5 discipline: one comparator, never
 *    hand-rolled), exactly as compose.test.js already does for compose.js.
 *    (An earlier version of this file hand-rolled its own span-tracking
 *    inliner and a text-anchor-search `provenanceOf`, back when
 *    includes.js/compose.js only returned bare strings; both are gone now
 *    that the real mechanism exists — testing it directly is both simpler
 *    and stronger than a parallel reimplementation that could itself drift.)
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyBaseUrl, applyPrettyLinks, isSkippedUrl, pageWillMove, parseBaseUrl,
  prettyLinkTarget, prettyOutputPath, resolveProvenanceUrl, rewriteProvenanceUrls,
  rewriteSrcsetValue, rewriteUrls, spansToLocator, splitUrl,
} from "../../../src/core/urls.js";
import { inlineIncludes } from "../../../src/core/includes.js";
import { assembleMarkdownDocument, compose } from "../../../src/core/compose.js";
import { convert } from "../../../src/core/markdown.js";
import { Reporter } from "../../../src/core/diagnostics.js";
import { compareHtml } from "../../../tests/conformance/compare.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const KITCHEN_SINK = join(ROOT, "tests", "fixtures", "kitchen-sink");
const LANDMINES = join(ROOT, "tests", "fixtures", "landmines");

function silentReporter() {
  return new Reporter({ stderr: { write() {} }, stdout: { write() {} } });
}

// ---------------------------------------------------------- real provenance

const noMarkdownIncludes = async () => { throw new Error("no .md include targets expected in these fixtures"); };

/**
 * Compose a real kitchen-sink-shaped page end to end through the REAL
 * pipeline (includes.js -> [markdown.js ->] compose.js), and build a
 * `provenanceOf` straight from the real spans compose() returns via urls.js's
 * own `spansToLocator` — no test-only reimplementation of either module.
 */
async function composeWithProvenance({ caseDir, pageRel, layoutRel, isMarkdown = false }) {
  const sourceRoot = join(caseDir, "src");
  const reporter = silentReporter();
  const pageAbs = join(sourceRoot, pageRel);

  let pageText;
  let pageSpans;
  if (isMarkdown) {
    const md = convert(readFileSync(pageAbs, "utf8"), { path: pageAbs, sourceRoot, reporter });
    const inlinedBody = await inlineIncludes({ text: md.html, file: pageAbs, sourceRoot, reporter, convertMarkdown: noMarkdownIncludes });
    ({ text: pageText, spans: pageSpans } = assembleMarkdownDocument(
      { ...md, html: inlinedBody.text, htmlSpans: inlinedBody.spans },
      { standalone: !layoutRel, pageFile: pageRel },
    ));
  } else {
    const pageInlined = await inlineIncludes({
      text: readFileSync(pageAbs, "utf8"), file: pageAbs, sourceRoot, reporter, convertMarkdown: noMarkdownIncludes,
    });
    pageText = pageInlined.text;
    pageSpans = pageInlined.spans;
  }

  let layoutText = null;
  let layoutSpans;
  if (layoutRel) {
    const layoutAbs = join(sourceRoot, layoutRel);
    const layoutInlined = await inlineIncludes({
      text: readFileSync(layoutAbs, "utf8"), file: layoutAbs, sourceRoot, reporter, convertMarkdown: noMarkdownIncludes,
    });
    layoutText = layoutInlined.text;
    layoutSpans = layoutInlined.spans;
  }

  const { text: composed, spans } = compose({
    pageText, pageFile: pageRel, pageSpans, layoutText, layoutFile: layoutRel, layoutSpans, reporter,
  });

  return { composed, provenanceOf: spansToLocator(spans, pageRel), reporter };
}

// ============================================================ isSkippedUrl

describe("isSkippedUrl (URL-02)", () => {
  test.each([
    ["http://example.com/x", true],
    ["https://example.com/x", true],
    ["mailto:hello@example.com", true],
    ["tel:+15551234567", true],
    ["data:image/png;base64,AAAA", true],
    ["javascript:void(0)", true],
    ["//cdn.example.com/x.js", true],
    ["#section", true],
    ["", true],
    ["/about.html", false],
    ["about.html", false],
    ["../about.html", false],
    ["about.html#frag", false],
    ["?x=1", false],
  ])("%s -> skipped=%s", (url, expected) => {
    expect(isSkippedUrl(url)).toBe(expected);
  });
});

describe("splitUrl", () => {
  test.each([
    ["/a/b.html", { path: "/a/b.html", query: "", fragment: "" }],
    ["/a/b.html?x=1", { path: "/a/b.html", query: "?x=1", fragment: "" }],
    ["/a/b.html#frag", { path: "/a/b.html", query: "", fragment: "#frag" }],
    ["/a/b.html?x=1#frag", { path: "/a/b.html", query: "?x=1", fragment: "#frag" }],
    ["", { path: "", query: "", fragment: "" }],
  ])("%s", (url, expected) => {
    expect(splitUrl(url)).toEqual(expected);
  });
});

// ==================================================== resolveProvenanceUrl

describe("resolveProvenanceUrl (§11.1 canonical resolution — mirrors head-merge.js resolveForCompare)", () => {
  test("root-relative: normalized, unchanged in spirit", () => {
    expect(resolveProvenanceUrl("/assets/x.css", "menu/_layout.html")).toBe("/assets/x.css");
  });
  test("relative, resolved against the provenance file's directory", () => {
    expect(resolveProvenanceUrl("hero.jpg", "menu/_layout.html")).toBe("/menu/hero.jpg");
    expect(resolveProvenanceUrl("logo.png", "_includes/nav.html")).toBe("/_includes/logo.png");
  });
  test("relative at the source root", () => {
    expect(resolveProvenanceUrl("style.css", "_layout.html")).toBe("/style.css");
  });
  test("../ climbs out of the provenance file's own directory", () => {
    expect(resolveProvenanceUrl("../assets/x.png", "menu/beans.md")).toBe("/assets/x.png");
  });
  test("query/fragment stripped (identity resolution only)", () => {
    expect(resolveProvenanceUrl("x.html?a=1#b", "layout.html")).toBe("/x.html");
  });
  test.each([
    [null, "layout.html"], [undefined, "layout.html"], ["", "layout.html"],
    ["#frag", "layout.html"], ["http://x/y", "layout.html"], ["//cdn/x", "layout.html"],
    ["mailto:a@b.com", "layout.html"],
  ])("out of scope -> null: %s", (url, file) => {
    expect(resolveProvenanceUrl(url, file)).toBeNull();
  });
});

describe("spansToLocator", () => {
  test("locates within spans, falls back outside them", () => {
    const locate = spansToLocator(
      [{ start: 10, end: 20, file: "a.html" }, { start: 20, end: 30, file: "b.html" }],
      "fallback.html",
    );
    expect(locate(15)).toBe("a.html");
    expect(locate(20)).toBe("b.html");
    expect(locate(5)).toBe("fallback.html");
    expect(locate(35)).toBe("fallback.html");
  });
});

// ================================================== rewriteProvenanceUrls

describe("rewriteProvenanceUrls (§11.1) — hand-built", () => {
  test("root-relative URLs are never touched (URL-04)", () => {
    const html = `<a href="/about.html">x</a>`;
    const out = rewriteProvenanceUrls(html, { provenanceOf: () => "index.html", pageFile: "index.html", pageMoved: false });
    expect(out).toBe(html);
  });

  test("page-self, unmoved: left exactly as written (URL-06)", () => {
    const html = `<img src="assets/beans.jpg">`;
    const out = rewriteProvenanceUrls(html, { provenanceOf: () => "index.html", pageFile: "index.html", pageMoved: false });
    expect(out).toBe(html);
  });

  test("page-self, MOVED: resolved and emitted root-relative (URL-06)", () => {
    const html = `<img src="assets/beans.jpg">`;
    const out = rewriteProvenanceUrls(html, { provenanceOf: () => "menu/beans.html", pageFile: "menu/beans.html", pageMoved: true });
    expect(out).toBe(`<img src="/menu/assets/beans.jpg">`);
  });

  test("layout/include provenance: always resolved regardless of pageMoved (URL-05)", () => {
    const html = `<img src="hero.jpg">`;
    const out = rewriteProvenanceUrls(html, { provenanceOf: () => "menu/_layout.html", pageFile: "menu/index.html", pageMoved: false });
    expect(out).toBe(`<img src="/menu/hero.jpg">`);
  });

  test("skipped URLs (scheme, mailto, fragment-only) never rewritten", () => {
    const html = `<a href="mailto:hi@x.com">m</a><a href="#top">t</a><a href="https://x.com/y">e</a>`;
    const out = rewriteProvenanceUrls(html, { provenanceOf: () => "_includes/nav.html", pageFile: "index.html", pageMoved: false });
    expect(out).toBe(html);
  });

  test("query and fragment survive resolution", () => {
    const html = `<a href="x.html?a=1#frag">x</a>`;
    const out = rewriteProvenanceUrls(html, { provenanceOf: () => "_includes/nav.html", pageFile: "index.html", pageMoved: false });
    expect(out).toBe(`<a href="/_includes/x.html?a=1#frag">x</a>`);
  });

  test("poster and srcset are in scope; srcset descriptors survive untouched", () => {
    const html = `<video poster="cover.png" src="clip.mp4"></video><img srcset="pic.png 1x, pic-2x.png 2x" src="pic.png">`;
    const out = rewriteProvenanceUrls(html, { provenanceOf: () => "gallery/_layout.html", pageFile: "gallery/index.html", pageMoved: false });
    expect(out).toBe(
      `<video poster="/gallery/cover.png" src="/gallery/clip.mp4"></video>` +
      `<img srcset="/gallery/pic.png 1x, /gallery/pic-2x.png 2x" src="/gallery/pic.png">`,
    );
  });

  test("different elements can have different provenance (mixed page/layout content)", () => {
    const html = `<a href="from-page.html">p</a><a href="from-layout.html">l</a>`;
    const pIdx = html.indexOf("<a href=\"from-page");
    const lIdx = html.indexOf("<a href=\"from-layout");
    const out = rewriteProvenanceUrls(html, {
      provenanceOf: (offset) => (offset === pIdx ? "index.html" : "_layout.html"),
      pageFile: "index.html",
      pageMoved: false,
    });
    // page-self unmoved -> untouched; layout -> resolved root-relative
    expect(out).toBe(`<a href="from-page.html">p</a><a href="/from-layout.html">l</a>`);
  });
});

describe("rewriteSrcsetValue", () => {
  test("preserves original whitespace/commas exactly, replaces only URL tokens", () => {
    const out = rewriteSrcsetValue("pic.png 1x, pic-2x.png 2x", (u) => `/gallery/${u}`);
    expect(out).toBe("/gallery/pic.png 1x, /gallery/pic-2x.png 2x");
  });
  test("null from rewriteOne leaves that candidate untouched", () => {
    const out = rewriteSrcsetValue("/already-root.png 1x,rel.png 2x", (u) => (u.startsWith("/") ? null : `/x/${u}`));
    expect(out).toBe("/already-root.png 1x,/x/rel.png 2x");
  });
});

// -------------------------------------------------- fixture: stranded-underscore-asset

describe("rewriteProvenanceUrls — fixture: stranded-underscore-asset (the spec's own §11.1 worked example)", () => {
  test("nav.html's relative logo resolves against ITS OWN directory, not the layout's or page's", async () => {
    const dir = join(LANDMINES, "stranded-underscore-asset");
    const { composed, provenanceOf } = await composeWithProvenance({
      caseDir: dir, pageRel: "index.html", layoutRel: "_layout.html",
    });
    expect(composed).toContain('<img src="logo.png" alt="logo">'); // pre-rewrite sanity: still relative in composed text
    const out = rewriteProvenanceUrls(composed, { provenanceOf, pageFile: "index.html", pageMoved: false });
    expect(out).toContain('<img src="/_includes/logo.png" alt="logo">');
  });
});

// -------------------------------------------------- fixture: srcset-poster-rewrite

describe("rewriteProvenanceUrls — fixture: srcset-poster-rewrite", () => {
  test("byte-exact against the checked-in expected tree", async () => {
    const dir = join(LANDMINES, "srcset-poster-rewrite");
    const { composed, provenanceOf } = await composeWithProvenance({
      caseDir: dir, pageRel: "gallery/index.html", layoutRel: "gallery/_layout.html",
    });
    const out = rewriteProvenanceUrls(composed, { provenanceOf, pageFile: "gallery/index.html", pageMoved: false });
    const expected = readFileSync(join(dir, "expected", "gallery", "index.html"), "utf8");
    expect(compareHtml(expected, out, "gallery/index.html")).toEqual([]);
  });
});

// ============================================================ §11.2 pretty

describe("prettyOutputPath (§11.2 files)", () => {
  test.each([
    ["index.html", "index.html"],
    ["sub/index.html", "sub/index.html"],
    ["404.html", "404.html"],
    ["sub/404.html", "sub/404/index.html"], // only the ROOT 404.html is exempt
    ["about.html", "about/index.html"],
    ["blog/post.html", "blog/post/index.html"],
  ])("%s -> %s", (input, expected) => {
    expect(prettyOutputPath(input)).toBe(expected);
  });
});

describe("pageWillMove", () => {
  test("false when prettyUrls is off", () => expect(pageWillMove("about.html", false)).toBe(false));
  test("false for an already-pretty index.html", () => expect(pageWillMove("menu/index.html", true)).toBe(false));
  test("false for the root 404.html", () => expect(pageWillMove("404.html", true)).toBe(false));
  test("true for an ordinary page under --pretty-urls", () => expect(pageWillMove("about.html", true)).toBe(true));
});

describe("prettyLinkTarget — the §11.2 table's link column", () => {
  test.each([
    ["about.html", "/about/"],
    ["blog.html", "/blog/"],
    ["index.html", "/"],
    ["docs/guide.html", "/docs/guide/"],
    ["sub/index.html", "/sub/"],
    ["404.html", "/404.html"],
  ])("%s -> %s", (input, expected) => {
    expect(prettyLinkTarget(input)).toBe(expected);
  });
});

describe("applyPrettyLinks (§11.2) — the exact worked table, one page", () => {
  test("every row of the §11.1/§11.2 table, in one composed root-level page", () => {
    const html =
      `<a href="./about.html">a</a>` +
      `<a href="/blog.html">b</a>` +
      `<a href="index.html">c</a>` +
      `<a href="docs/guide.html">d</a>` +
      `<a href="./contact.html?form=1">e</a>` +
      `<a href="/blog.html#latest">f</a>` +
      `<a href="sub/index.html">g</a>` +
      `<a href="/404.html">h</a>` +
      `<a href="/assets/doc.pdf">i</a>` + // non-page: untouched
      `<a href="https://x.com/y">j</a>`; // external: untouched
    const emittedHtmlPaths = new Set(["about.html", "blog.html", "index.html", "docs/guide.html", "contact.html", "sub/index.html", "404.html"]);
    const out = applyPrettyLinks(html, { pageOutputPath: "index.html", emittedHtmlPaths });
    expect(out).toBe(
      `<a href="/about/">a</a>` +
      `<a href="/blog/">b</a>` +
      `<a href="/">c</a>` +
      `<a href="/docs/guide/">d</a>` +
      `<a href="/contact/?form=1">e</a>` +
      `<a href="/blog/#latest">f</a>` +
      `<a href="/sub/">g</a>` +
      `<a href="/404.html">h</a>` +
      `<a href="/assets/doc.pdf">i</a>` +
      `<a href="https://x.com/y">j</a>`,
    );
  });

  test("a page-self relative URL to a NON-page target stays untouched even though it 'resolves' (only page targets transform)", () => {
    const html = `<img src="assets/beans.jpg">`;
    const out = applyPrettyLinks(html, { pageOutputPath: "index.html", emittedHtmlPaths: new Set(["about.html"]) });
    expect(out).toBe(html);
  });

  test("resolves a still-relative URL against the CURRENT page's own directory before checking page-target membership", () => {
    const html = `<a href="beans.html">our beans</a>`;
    const out = applyPrettyLinks(html, { pageOutputPath: "menu/index.html", emittedHtmlPaths: new Set(["menu/beans.html"]) });
    expect(out).toBe(`<a href="/menu/beans/">our beans</a>`);
  });
});

// -------------------------------------------------- fixture: kitchen-sink pretty-base

describe("full §11.1+§11.2+§11.3 chain — fixture: kitchen-sink (pretty-base profile)", () => {
  const emittedHtmlPaths = new Set([
    "404.html", "about.html", "contact.html", "index.html",
    "legal/privacy.html", "menu/beans.html", "menu/index.html",
  ]);
  const base = parseBaseUrl("https://meridian.coffee/coffee/");

  test("index.html", async () => {
    const { composed, provenanceOf } = await composeWithProvenance({ caseDir: KITCHEN_SINK, pageRel: "index.html", layoutRel: "_layout.html" });
    const out = rewriteUrls(composed, {
      provenanceOf, pageFile: "index.html", pageOutputPath: "index.html",
      prettyUrls: true, emittedHtmlPaths, base,
    });
    const expected = readFileSync(join(KITCHEN_SINK, "expected-pretty-base", "index.html"), "utf8");
    expect(compareHtml(expected, out, "index.html")).toEqual([]);
  });

  test("menu/index.html (layout-provenance relative img; page-self relative link to a moved page)", async () => {
    const { composed, provenanceOf } = await composeWithProvenance({ caseDir: KITCHEN_SINK, pageRel: "menu/index.html", layoutRel: "menu/_layout.html" });
    const out = rewriteUrls(composed, {
      provenanceOf, pageFile: "menu/index.html", pageOutputPath: "menu/index.html",
      prettyUrls: true, emittedHtmlPaths, base,
    });
    const expected = readFileSync(join(KITCHEN_SINK, "expected-pretty-base", "menu", "index.html"), "utf8");
    expect(compareHtml(expected, out, "menu/index.html")).toEqual([]);
  });
});

// ============================================================== §11.3 base

describe("parseBaseUrl", () => {
  test("one form only: a bare path is not a base URL — cli.js rejects it before this is reached (URL-10)", () => {
    expect(() => parseBaseUrl("/coffee/")).toThrow();
    expect(() => parseBaseUrl("coffee")).toThrow();
  });
  test("path is normalized to lead/trail slashes", () => {
    expect(parseBaseUrl("https://x.example/coffee")).toEqual({ origin: "https://x.example", pathPrefix: "/coffee/" });
  });
  test("full URL form: origin split from path", () => {
    expect(parseBaseUrl("https://meridian.coffee/")).toEqual({ origin: "https://meridian.coffee", pathPrefix: "/" });
    expect(parseBaseUrl("https://example.com/repo/")).toEqual({ origin: "https://example.com", pathPrefix: "/repo/" });
  });
});

describe("applyBaseUrl (§11.3)", () => {
  test("the path part prefixes every root-relative href/src/srcset/poster and og/twitter content (URL-10)", () => {
    const base = parseBaseUrl("https://meridian.coffee/coffee/");
    const html =
      `<link rel="stylesheet" href="/assets/style.css">` +
      `<img src="/assets/beans.jpg">` +
      `<meta property="og:image" content="/assets/beans.jpg">` +
      `<meta name="twitter:card" content="summary">` + // not root-relative -- untouched
      `<link rel="canonical" href="/index.html">`;
    const out = applyBaseUrl(html, base);
    expect(out).toBe(
      `<link rel="stylesheet" href="/coffee/assets/style.css">` +
      `<img src="/coffee/assets/beans.jpg">` +
      `<meta property="og:image" content="https://meridian.coffee/coffee/assets/beans.jpg">` +
      `<meta name="twitter:card" content="summary">` +
      `<link rel="canonical" href="https://meridian.coffee/coffee/index.html">`,
    );
  });

  test("full-URL form: origin ONLY added to canonical href and og/twitter content, never to plain href/src (URL-11)", () => {
    const base = parseBaseUrl("https://example.com/repo/");
    const html =
      `<link rel="stylesheet" href="/assets/style.css">` +
      `<meta property="og:image" content="/assets/hero.jpg">` +
      `<link rel="canonical" href="/index.html">` +
      `<meta property="og:url" content="https://elsewhere.example/kept">`; // absolute -- untouched
    const out = applyBaseUrl(html, base);
    expect(out).toBe(
      `<link rel="stylesheet" href="/repo/assets/style.css">` +
      `<meta property="og:image" content="https://example.com/repo/assets/hero.jpg">` +
      `<link rel="canonical" href="https://example.com/repo/index.html">` +
      `<meta property="og:url" content="https://elsewhere.example/kept">`,
    );
  });

  test("non-root-relative values are never touched (URL-12)", () => {
    const base = parseBaseUrl("https://meridian.coffee/coffee/");
    const html = `<a href="mailto:x@y.com">m</a><a href="relative.html">r</a><a href="https://x.com/y">e</a>`;
    expect(applyBaseUrl(html, base)).toBe(html);
  });
});

// -------------------------------------------------- fixture: base-url-subpath landmine

describe("applyBaseUrl — fixture: base-url-subpath (B3's pinned trap)", () => {
  test("full base with a non-root path: og/twitter/canonical get origin+path, everything else gets path only", async () => {
    const dir = join(LANDMINES, "base-url-subpath");
    const { composed, provenanceOf } = await composeWithProvenance({ caseDir: dir, pageRel: "index.html", layoutRel: "_layout.html" });
    const base = parseBaseUrl("https://example.com/repo/");
    const rewritten = rewriteProvenanceUrls(composed, { provenanceOf, pageFile: "index.html", pageMoved: false });
    const out = applyBaseUrl(rewritten, base);
    const expected = readFileSync(join(dir, "expected", "index.html"), "utf8");
    expect(compareHtml(expected, out, "index.html")).toEqual([]);
  });
});

// -------------------------------------------------- fixture: kitchen-sink origin profile

describe("full chain — fixture: kitchen-sink (origin profile, no pretty-urls)", () => {
  test("index.html: root-relative canonical gains the full origin, regular hrefs do not", async () => {
    const { composed, provenanceOf } = await composeWithProvenance({ caseDir: KITCHEN_SINK, pageRel: "index.html", layoutRel: "_layout.html" });
    const base = parseBaseUrl("https://meridian.coffee/");
    const out = rewriteUrls(composed, {
      provenanceOf, pageFile: "index.html", pageOutputPath: "index.html",
      prettyUrls: false, base,
    });
    const expected = readFileSync(join(KITCHEN_SINK, "expected-origin", "index.html"), "utf8");
    expect(compareHtml(expected, out, "index.html")).toEqual([]);
  });
});

// -------------------------------------------------- fixture: kitchen-sink default profile

describe("full chain — fixture: kitchen-sink (default profile: §11.1 only, no flags)", () => {
  test.each([
    ["index.html", "_layout.html", "index.html"],
    ["contact.html", "_layout.html", "contact.html"],
    ["menu/index.html", "menu/_layout.html", "menu/index.html"],
  ])("%s", async (pageRel, layoutRel, expectedRel) => {
    const { composed, provenanceOf } = await composeWithProvenance({ caseDir: KITCHEN_SINK, pageRel, layoutRel });
    const out = rewriteProvenanceUrls(composed, { provenanceOf, pageFile: pageRel, pageMoved: false });
    const expected = readFileSync(join(KITCHEN_SINK, "expected", expectedRel), "utf8");
    expect(compareHtml(expected, out, expectedRel)).toEqual([]);
  });

  test("about.md (Markdown page): page-self relative links/images stay exactly as written, unmoved", async () => {
    const { composed, provenanceOf } = await composeWithProvenance({
      caseDir: KITCHEN_SINK, pageRel: "about.md", layoutRel: "_layout.html", isMarkdown: true,
    });
    const out = rewriteProvenanceUrls(composed, { provenanceOf, pageFile: "about.md", pageMoved: false });
    // about.md has no page-authored relative hrefs/srcs of its own (the SSI
    // include's content is include-provenance, already asserted structurally
    // by md-include-element elsewhere) — the meaningful assertion here is
    // that rewriting a Markdown-sourced composed page doesn't throw and
    // leaves already-correct root-relative URLs alone.
    expect(out).toContain('<link rel="stylesheet" href="/assets/style.css">');
  });
});
