/**
 * Unit tests for src/core/references.js (Tier 3 — no conformance authority;
 * testing-strategy §2). As with urls.test.js: hand-built cases pin every
 * branch precisely, and fixture-driven cases build REAL emitted-tree content
 * (real includes.js + compose.js + urls.js chained together, matching what
 * a wired build would produce) and diff the resulting diagnostics against
 * the landmines manifest's declared expectations.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReferences, resolveReference, stripBaseUrl } from "../../../src/core/references.js";
import { applyBaseUrl, parseBaseUrl, rewriteProvenanceUrls } from "../../../src/core/urls.js";
import { resolveTarget } from "../../../src/core/includes.js";
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

const INCLUDE_TAG = /<include\b([^>]*)>(?:([\s\S]*?)<\/include\s*>)?/gi;
const SSI_TAG = /<!--#include\s+(virtual|file)\s*=\s*"([^"]*)"\s*-->/gi;

function findIncludeTags(text) {
  const found = [];
  for (const m of text.matchAll(INCLUDE_TAG)) {
    const srcMatch = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[1] ?? "");
    if (srcMatch) found.push({ match: m[0], spec: srcMatch[1] ?? srcMatch[2], form: "src", index: m.index });
  }
  for (const m of text.matchAll(SSI_TAG)) found.push({ match: m[0], spec: m[2], form: m[1].toLowerCase(), index: m.index });
  return found.sort((a, b) => a.index - b.index);
}

function inlineWithProvenance(text, absFile, sourceRoot) {
  const fileRel = relative(sourceRoot, absFile).split(sep).join("/");
  let out = "";
  const spans = [];
  let cursor = 0;
  for (const inc of findIncludeTags(text)) {
    const before = text.slice(cursor, inc.index);
    if (before) { spans.push({ start: out.length, end: out.length + before.length, file: fileRel }); out += before; }
    const target = resolveTarget({ spec: inc.spec, form: inc.form, fromFile: absFile, sourceRoot });
    if ("escapes" in target) throw new Error(`test inliner: include escapes source root: ${inc.spec}`);
    const childText = readFileSync(target.path, "utf8");
    const child = inlineWithProvenance(childText, target.path, sourceRoot);
    const childBase = out.length;
    out += child.text;
    for (const s of child.spans) spans.push({ start: childBase + s.start, end: childBase + s.end, file: s.file });
    cursor = inc.index + inc.match.length;
  }
  const tail = text.slice(cursor);
  if (tail) { spans.push({ start: out.length, end: out.length + tail.length, file: fileRel }); out += tail; }
  return { text: out, spans };
}

function locateInSpans(spans, offset) {
  for (const s of spans) if (offset >= s.start && offset < s.end) return s.file;
  return null;
}

/** Compose+rewrite one page for these tests. Returns final HTML text and a real provenanceOf/locate pair. */
function buildPage({ caseDir, pageRel, layoutRel }) {
  const sourceRoot = join(caseDir, "src");
  const reporter = silentReporter();
  const pageAbs = join(sourceRoot, pageRel);
  const pageInlined = inlineWithProvenance(readFileSync(pageAbs, "utf8"), pageAbs, sourceRoot);

  let layoutText = null;
  let layoutSpans = [];
  if (layoutRel) {
    const layoutAbs = join(sourceRoot, layoutRel);
    const layoutInlined = inlineWithProvenance(readFileSync(layoutAbs, "utf8"), layoutAbs, sourceRoot);
    layoutText = layoutInlined.text;
    layoutSpans = layoutInlined.spans;
  }

  const composed = compose({ pageText: pageInlined.text, pageFile: pageRel, layoutText, layoutFile: layoutRel, reporter });

  const provenanceOf = (offset) => {
    for (const len of [40, 20, 10]) {
      const anchor = composed.slice(offset, offset + len);
      if (!anchor) continue;
      if (layoutText) {
        const idx = layoutText.indexOf(anchor);
        if (idx !== -1) return locateInSpans(layoutSpans, idx) ?? layoutRel;
      }
      const idx2 = pageInlined.text.indexOf(anchor);
      if (idx2 !== -1) return locateInSpans(pageSpansOf(pageInlined), idx2) ?? pageRel;
    }
    return pageRel;
  };
  return { composed, provenanceOf, reporter };
}
function pageSpansOf(pageInlined) { return pageInlined.spans; }

/** §11.1-only final text (these landmines don't use --pretty-urls/--base-url unless noted). */
function finalHtmlFor(caseDir, pageRel, layoutRel) {
  const { composed, provenanceOf } = buildPage({ caseDir, pageRel, layoutRel });
  return rewriteProvenanceUrls(composed, { provenanceOf, pageFile: pageRel, pageMoved: false });
}

function firstProblem(reporter) {
  return reporter.diagnostics.find((d) => d.severity === "problem");
}

// ============================================================ hand-built

describe("stripBaseUrl (REF-02)", () => {
  test("path-only base strips the prefix", () => {
    const base = parseBaseUrl("/coffee/");
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
  test("escaping above the tree root resolves to null", () => {
    expect(resolveReference("../../../etc/passwd", "index.html")).toBeNull();
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
  test("broken-link: relative href to a renamed page fires P13", () => {
    const html = finalHtmlFor(join(LANDMINES, "broken-link"), "index.html");
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

  test("case-mismatch-link: right file, wrong case fires P13 (REF-05)", () => {
    const html = finalHtmlFor(join(LANDMINES, "case-mismatch-link"), "index.html");
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", html], ["about.html", finalHtmlFor(join(LANDMINES, "case-mismatch-link"), "about.html")]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html", "about.html"]),
      reporter,
    });
    const p = firstProblem(reporter);
    expect(p.message).toContain("About.html");
  });

  test("css-url-broken: url() in a mirror-copied CSS file fires P13", () => {
    const dir = join(LANDMINES, "css-url-broken");
    const css = readFileSync(join(dir, "src", "assets", "style.css"), "utf8");
    const html = finalHtmlFor(dir, "index.html");
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

  test("style-attr-url-broken: url() in a style= attribute fires P13 (B5)", () => {
    const html = finalHtmlFor(join(LANDMINES, "style-attr-url-broken"), "index.html");
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", html]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html"]),
      reporter,
    });
    expect(firstProblem(reporter).message).toContain("gone.png");
  });

  test("style-url-not-rewritten: both <style> and style= url()s resolve cleanly (dot.png exists)", () => {
    const dir = join(LANDMINES, "style-url-not-rewritten");
    const html = finalHtmlFor(dir, "index.html", "_layout.html");
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

  test("fragment-links-ok: fragment-only and page+fragment links build clean (REF-06)", () => {
    const dir = join(LANDMINES, "fragment-links-ok");
    const indexHtml = finalHtmlFor(dir, "index.html");
    const aboutHtml = finalHtmlFor(dir, "about.html");
    const reporter = silentReporter();
    checkReferences({
      htmlFiles: new Map([["index.html", indexHtml], ["about.html", aboutHtml]]),
      cssFiles: new Map(),
      emittedPaths: new Set(["index.html", "about.html"]),
      reporter,
    });
    expect(reporter.diagnostics).toEqual([]);
  });

  test("handwritten-pretty-url: a hand-authored pretty href fires P13 in a NON-pretty build", () => {
    const dir = join(LANDMINES, "handwritten-pretty-url");
    const indexHtml = finalHtmlFor(dir, "index.html");
    const aboutHtml = finalHtmlFor(dir, "about.html");
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

  test("stranded-underscore-asset: broken reference attributes to the TRUE provenance file when locate is supplied", () => {
    const dir = join(LANDMINES, "stranded-underscore-asset");
    const { composed, provenanceOf } = buildPage({ caseDir: dir, pageRel: "index.html", layoutRel: "_layout.html" });
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

  test("base-url-subpath: the reference check strips the full base and stays clean (REF-02)", () => {
    const dir = join(LANDMINES, "base-url-subpath");
    const { composed, provenanceOf } = buildPage({ caseDir: dir, pageRel: "index.html", layoutRel: "_layout.html" });
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
