/**
 * Unit tests for src/core/references.js (Tier 3 — no conformance authority;
 * testing-strategy §2). As with urls.test.js: hand-built cases pin every
 * branch precisely, and fixture-driven cases build REAL emitted-tree content
 * (real includes.js + compose.js + urls.js chained together, matching what
 * a wired build would produce) and diff the resulting diagnostics against
 * the landmines manifest's declared expectations. Provenance (`provenanceOf`
 * below) comes straight from `includes.js`/`compose.js`'s own real
 * `{text, spans}` return via `urls.js`'s `spansToLocator` — no hand-rolled
 * reimplementation (an earlier version of this file had one, back when
 * neither module returned real spans).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReferences, resolveReference, stripBaseUrl } from "../../../src/core/references.js";
import { applyBaseUrl, parseBaseUrl, rewriteProvenanceUrls, spansToLocator } from "../../../src/core/urls.js";
import { inlineIncludes } from "../../../src/core/includes.js";
import { compose } from "../../../src/core/compose.js";
import { Reporter } from "../../../src/core/diagnostics.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const LANDMINES = join(ROOT, "tests", "fixtures", "landmines");

function silentReporter() {
  const r = new Reporter({ stderr: { write() {} }, stdout: { write() {} } });
  return r;
}

// -------------------------------------------- shared fixture-composition rig
// (deliberately a local, self-contained copy rather than a cross-test-file
// import — this codebase's existing unit tests, e.g. compose.test.js, keep
// their fixture helpers local rather than sharing a test-support module.)

const noMarkdownIncludes = async () => { throw new Error("no .md include targets expected in these fixtures"); };

/** Compose+rewrite one page for these tests. Returns final HTML text and a real provenanceOf/locate pair. */
async function buildPage({ caseDir, pageRel, layoutRel }) {
  const sourceRoot = join(caseDir, "src");
  const reporter = silentReporter();
  const pageAbs = join(sourceRoot, pageRel);
  const pageInlined = await inlineIncludes({
    text: readFileSync(pageAbs, "utf8"), file: pageAbs, sourceRoot, reporter, convertMarkdown: noMarkdownIncludes,
  });

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
    pageText: pageInlined.text, pageFile: pageRel, pageSpans: pageInlined.spans,
    layoutText, layoutFile: layoutRel, layoutSpans, reporter,
  });

  return { composed, provenanceOf: spansToLocator(spans, pageRel), reporter };
}

/** §11.1-only final text (these landmines don't use --pretty-urls/--base-url unless noted). */
async function finalHtmlFor(caseDir, pageRel, layoutRel) {
  const { composed, provenanceOf } = await buildPage({ caseDir, pageRel, layoutRel });
  return rewriteProvenanceUrls(composed, { provenanceOf, pageFile: pageRel, pageMoved: false });
}

function firstProblem(reporter) {
  return reporter.diagnostics.find((d) => d.severity === "problem");
}

// ============================================================ hand-built

describe("stripBaseUrl (REF-02)", () => {
  test("the path prefix is stripped from href/src values, which never carry the origin", () => {
    const base = parseBaseUrl("https://meridian.coffee/coffee/");
    expect(stripBaseUrl("/coffee/menu/", base)).toBe("/menu/");
    expect(stripBaseUrl("/other/x", base)).toBe("/other/x"); // no match -> unchanged
  });
  test("full-URL base strips origin+path together, keeping absolutized values checkable", () => {
    const base = parseBaseUrl("https://example.com/repo/");
    expect(stripBaseUrl("https://example.com/repo/assets/hero.jpg", base)).toBe("/assets/hero.jpg");
    // genuinely external, even though same-looking scheme -- untouched, later skipped as external
    expect(stripBaseUrl("https://elsewhere.example/kept", base)).toBe("https://elsewhere.example/kept");
  });
});

describe("resolveReference (§12 resolution — against the CONTAINING OUTPUT FILE, never provenance)", () => {
  test("root-relative resolves from the tree root", () => {
    expect(resolveReference("/about.html", "index.html")).toBe("about.html");
    expect(resolveReference("/assets/x.css", "menu/index.html")).toBe("assets/x.css");
  });
  test("relative resolves against the containing file's own directory", () => {
    expect(resolveReference("beans.html", "menu/index.html")).toBe("menu/beans.html");
    expect(resolveReference("../about.html", "menu/beans.html")).toBe("about.html");
  });
  test("directory URL (trailing slash or empty) resolves to index.html within it (REF-03)", () => {
    expect(resolveReference("/menu/", "index.html")).toBe("menu/index.html");
    expect(resolveReference("/", "index.html")).toBe("index.html");
  });
  test("query/fragment stripped before resolution; fragment-only is out of scope", () => {
    expect(resolveReference("/about.html?x=1", "index.html")).toBe("about.html");
    expect(resolveReference("about.html#frag", "menu/index.html")).toBe("menu/about.html");
    expect(resolveReference("#frag", "index.html")).toBeNull();
  });
  test("external/mailto/tel/data URLs are out of scope", () => {
    expect(resolveReference("mailto:x@y.com", "index.html")).toBeNull();
    expect(resolveReference("https://x.com/y", "index.html")).toBeNull();
  });
  test("escaping above the tree root is NOT out-of-scope — it resolves (to a path no real output ever has), so the caller's emittedPaths check reports it as broken, loudly, rather than silently skipping it", () => {
    const resolved = resolveReference("../../../etc/passwd", "index.html");
    expect(resolved).not.toBeNull();
    expect(resolved.startsWith("..")).toBe(true);
  });
});

describe("checkReferences — hand-built", () => {
  test("a broken href is a problem naming the reference", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", '<a href="/missing.html">x</a>']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]),
      reporter,
    });
    const p = firstProblem(reporter);
    expect(p).toBeDefined();
    expect(p.message).toContain("/missing.html");
    expect(p.file).toBe("index.html");
  });

  test("under --base-url, the diagnostic quotes the source spelling, not the prefixed output form", () => {
    const reporter = silentReporter();
    checkReferences({
      // The output tree the author never wrote: §11.3 already prefixed the link.
      htmlFiles: new Map([["index.html", '<a href="/handbook/missing.html">x</a>']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]),
      base: parseBaseUrl("https://site.example/handbook/"),
      reporter,
    });
    const p = firstProblem(reporter);
    expect(p).toBeDefined();
    // The author's file says /missing.html; "check the spelling" of
    // /handbook/missing.html points at a string their source doesn't contain.
    expect(p.message).toContain("/missing.html");
    expect(p.message).not.toContain("/handbook/");
    expect(p.context).toBe("/missing.html");
  });

  test("REF-02: a BROKEN og:image absolutized by a full-URL base still fails the reference check", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["post.html", '<meta property="og:image" content="https://example.com/repo/missing.png">']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["post.html"]),
      base: parseBaseUrl("https://example.com/repo/"),
      reporter,
    });
    // §12: absolutized values "stay checkable instead of masquerading as
    // external" — collecting only "/"-prefixed og: content made this 404
    // silently.
    const p = firstProblem(reporter);
    expect(p).toBeDefined();
    expect(p.message).toContain("/missing.png");
  });

  test("REF-02: og: content on a FOREIGN origin stays external and unchecked", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["post.html", '<meta property="og:url" content="https://elsewhere.example/kept">']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["post.html"]),
      base: parseBaseUrl("https://example.com/repo/"),
      reporter,
    });
    expect(reporter.diagnostics).toEqual([]);
  });

  test("non-URL og:/twitter: content (site names, card types) is never collected", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", '<meta property="og:site_name" content="Meridian Coffee"><meta name="twitter:card" content="summary">']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]),
      base: parseBaseUrl("https://meridian.coffee/coffee/"),
      reporter,
    });
    expect(reporter.diagnostics).toEqual([]);
  });

  test("a resolvable href is silent", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", '<a href="/about.html">x</a>']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html", "about.html"]),
      reporter,
    });
    expect(reporter.diagnostics).toEqual([]);
  });

  test("a relative href climbing above the tree root fires a problem, not a silent skip", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", '<a href="../../../etc/passwd">x</a>']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]),
      reporter,
    });
    const p = firstProblem(reporter);
    expect(p).toBeDefined();
    expect(p.message).toContain("etc/passwd");
  });

  test("case-sensitive: an otherwise-matching path in the wrong case still fails (REF-05)", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", '<a href="/About.html">x</a>']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html", "about.html"]),
      reporter,
    });
    expect(firstProblem(reporter)).toBeDefined();
  });

  test("a directory URL resolves against index.html within it", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", '<a href="/menu/">x</a>']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html", "menu/index.html"]),
      reporter,
    });
    expect(reporter.diagnostics).toEqual([]);
  });

  test("#fragment targets are never validated against ids (REF-06)", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", '<a href="#no-such-id">x</a><a href="about.html#also-missing">y</a>']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html", "about.html"]),
      reporter,
    });
    expect(reporter.diagnostics).toEqual([]);
  });

  test("url() in a CSS file is checked (REF-01)", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map(),
      cssFiles: new Map([["assets/style.css", "body { background: url(missing.png); }"]]),
      emittedPaths: new Set(["assets/style.css"]),
      reporter,
    });
    const p = firstProblem(reporter);
    expect(p.file).toBe("assets/style.css");
    expect(p.message).toContain("missing.png");
  });

  test("url() in a <style> block and in a style= attribute are both checked (B5)", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([[
        "index.html",
        '<html><head><style>.h{background:url(/gone-block.png)}</style></head>' +
        '<body><div style="background: url(/gone-attr.png)">x</div></body></html>',
      ]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]),
      reporter,
    });
    const messages = reporter.diagnostics.map((d) => d.message).join(" | ");
    expect(messages).toContain("gone-block.png");
    expect(messages).toContain("gone-attr.png");
    expect(reporter.problemCount).toBe(2);
  });

  test("root-relative og:/twitter: meta content is checked", () => {
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", '<meta property="og:image" content="/missing.jpg">']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]),
      reporter,
    });
    expect(firstProblem(reporter).message).toContain("/missing.jpg");
  });

  test("--base-url prefix is stripped before resolving, so an absolutized value stays checkable (REF-02)", () => {
    const reporter = silentReporter();
    const base = parseBaseUrl("https://example.com/repo/");
    checkReferences({
      htmlFiles: new Map([["index.html", '<link rel="canonical" href="https://example.com/repo/index.html">']]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]),
      base,
      reporter,
    });
    expect(reporter.diagnostics).toEqual([]);
  });

  test("custom `locate` attributes the diagnostic to true provenance, not the output file", () => {
    const reporter = silentReporter();
    const html = '<nav><img src="/missing-logo.png"></nav>';
    const offset = html.indexOf("/missing-logo.png");
    checkReferences({
      htmlFiles: new Map([["index.html", html]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]),
      locate: (file, off) => (off === offset ? { file: "_includes/nav.html", line: 2 } : { file, line: 1 }),
      reporter,
    });
    const p = firstProblem(reporter);
    expect(p.file).toBe("_includes/nav.html");
    expect(p.line).toBe(2);
  });
});

// ==================================================== fixture-driven cases

describe("checkReferences — landmine fixtures", () => {
  test("broken-link: relative href to a renamed page fires P13", async () => {
    const html = await finalHtmlFor(join(LANDMINES, "broken-link"), "index.html");
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", html]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]),
      reporter,
    });
    const p = firstProblem(reporter);
    expect(p).toBeDefined();
    expect(p.message).toContain("old-name.html");
  });

  test("case-mismatch-link: right file, wrong case fires P13 (REF-05)", async () => {
    const html = await finalHtmlFor(join(LANDMINES, "case-mismatch-link"), "index.html");
    const aboutHtml = await finalHtmlFor(join(LANDMINES, "case-mismatch-link"), "about.html");
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", html], ["about.html", aboutHtml]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html", "about.html"]),
      reporter,
    });
    const p = firstProblem(reporter);
    expect(p.message).toContain("About.html");
  });

  test("css-url-broken: url() in a mirror-copied CSS file fires P13", async () => {
    const dir = join(LANDMINES, "css-url-broken");
    const css = readFileSync(join(dir, "src", "assets", "style.css"), "utf8");
    const html = await finalHtmlFor(dir, "index.html");
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", html]]),
      cssFiles: new Map([["assets/style.css", css]]),
      emittedPaths: new Set(["index.html", "assets/style.css"]),
      reporter,
    });
    const p = firstProblem(reporter);
    expect(p.file).toBe("assets/style.css");
    expect(p.message).toContain("missing.png");
  });

  test("style-attr-url-broken: url() in a style= attribute fires P13 (B5)", async () => {
    const html = await finalHtmlFor(join(LANDMINES, "style-attr-url-broken"), "index.html");
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", html]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]),
      reporter,
    });
    expect(firstProblem(reporter).message).toContain("gone.png");
  });

  test("style-url-not-rewritten: both <style> and style= url()s resolve cleanly (dot.png exists)", async () => {
    const dir = join(LANDMINES, "style-url-not-rewritten");
    const html = await finalHtmlFor(dir, "index.html", "_layout.html");
    const dot = readFileSync(join(dir, "src", "assets", "dot.png"));
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", html]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html", "assets/dot.png"]),
      reporter,
    });
    expect(reporter.diagnostics).toEqual([]);
    // and rewriting truly never touched either url() (URL-03 / S1):
    expect(html).toContain("url(/assets/dot.png)");
  });

  test("fragment-links-ok: fragment-only and page+fragment links build clean (REF-06)", async () => {
    const dir = join(LANDMINES, "fragment-links-ok");
    const indexHtml = await finalHtmlFor(dir, "index.html");
    const aboutHtml = await finalHtmlFor(dir, "about.html");
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", indexHtml], ["about.html", aboutHtml]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html", "about.html"]),
      reporter,
    });
    expect(reporter.diagnostics).toEqual([]);
  });

  test("handwritten-pretty-url: a hand-authored pretty href fires P13 in a NON-pretty build", async () => {
    const dir = join(LANDMINES, "handwritten-pretty-url");
    const indexHtml = await finalHtmlFor(dir, "index.html");
    const aboutHtml = await finalHtmlFor(dir, "about.html");
    const reporter = silentReporter();
    checkReferences({
      // note: about/index.html is NOT emitted in a non-pretty build -- only about.html is
      htmlFiles: new Map([["index.html", indexHtml], ["about.html", aboutHtml]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html", "about.html"]),
      reporter,
    });
    const p = firstProblem(reporter);
    expect(p).toBeDefined();
    expect(p.message).toContain("/about/");
  });

  test("stranded-underscore-asset: broken reference attributes to the TRUE provenance file when locate is supplied", async () => {
    const dir = join(LANDMINES, "stranded-underscore-asset");
    const { composed, provenanceOf } = await buildPage({ caseDir: dir, pageRel: "index.html", layoutRel: "_layout.html" });
    const html = rewriteProvenanceUrls(composed, { provenanceOf, pageFile: "index.html", pageMoved: false });
    // logo.png resolves (§11.1) to /_includes/logo.png, which the default
    // exclude (_*) keeps out of the emitted tree -- broken, by design (this
    // IS the spec's own worked example for why the check exists).
    expect(html).toContain('src="/_includes/logo.png"');
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", html]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]), // _includes/* excluded by default -- not in the emitted set
      locate: (file, offset) => ({ file: provenanceOf(offset), line: 1 }),
      reporter,
    });
    const p = firstProblem(reporter);
    expect(p).toBeDefined();
    expect(p.file).toBe("_includes/nav.html");
    expect(p.message).toContain("logo.png");
  });

  test("base-url-subpath: the reference check strips the full base and stays clean (REF-02)", async () => {
    const dir = join(LANDMINES, "base-url-subpath");
    const { composed, provenanceOf } = await buildPage({ caseDir: dir, pageRel: "index.html", layoutRel: "_layout.html" });
    const base = parseBaseUrl("https://example.com/repo/");
    const rewritten = rewriteProvenanceUrls(composed, { provenanceOf, pageFile: "index.html", pageMoved: false });
    // Apply §11.3 too, matching what the real pipeline would emit, so the
    // absolutized og/canonical values are exactly what the check must accept.
    const html = applyBaseUrl(rewritten, base);
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", html]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html", "assets/hero.jpg", "assets/style.css"]),
      base,
      reporter,
    });
    expect(reporter.diagnostics).toEqual([]);
  });
});
