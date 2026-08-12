/**
 * Unit tests for src/core/compose.js (Tier 3 — no conformance authority;
 * testing-strategy §2). Drives compose() directly against the exact source
 * trees used by the conformance spec's own worked examples
 * (tests/conformance/spec-fixtures/) and the composition-family landmines
 * (tests/fixtures/landmines/), using compare.mjs's compareHtml — the same
 * comparator the conformance harness gates on — rather than a hand-rolled
 * one (H5 discipline).
 *
 * This file exists because the conformance harness itself cannot exercise
 * compose.js yet: `unify build` (src/cli/commands/build.js) is still the
 * Phase 1 NOT_IMPLEMENTED placeholder, and layout resolution (§6) and
 * Markdown conversion (§10) — both prerequisites compose() is handed
 * already-resolved input by — are other agents' modules. These tests are
 * the verification available without that wiring: they call compose()
 * exactly as its documented contract says a future build.js will.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assembleMarkdownDocument, compose } from "../../../src/core/compose.js";
import { inlineIncludes } from "../../../src/core/includes.js";
import { convert } from "../../../src/core/markdown.js";
import { Reporter } from "../../../src/core/diagnostics.js";
import { compareHtml } from "../../../tests/conformance/compare.mjs";

/** Chains the real includes.js (§5) ahead of compose() — stronger fidelity than hand-splicing. */
async function withIncludesInlined(caseDir, pageRel, reporter) {
  const sourceRoot = join(caseDir, "src");
  const file = join(sourceRoot, pageRel);
  const text = readFileSync(file, "utf8");
  return inlineIncludes({
    text, file, sourceRoot, reporter,
    convertMarkdown: async () => { throw new Error("no .md includes expected in these fixtures"); },
  });
}

const ROOT = join(import.meta.dir, "..", "..", "..");
const SPEC_FIXTURES = join(ROOT, "tests", "conformance", "spec-fixtures");
const LANDMINES = join(ROOT, "tests", "fixtures", "landmines");

function silentReporter() {
  return new Reporter({ stderr: { write() {} }, stdout: { write() {} } });
}

/**
 * @param {string} caseDir - absolute path to a fixture's directory (contains src/, optionally expected/)
 * @param {string} pageRel - page path relative to src/, e.g. "index.html" or "deep/page.html"
 * @param {string} [layoutRel] - layout path relative to src/; omit for no-layout cases
 */
function composeFixture(caseDir, pageRel, layoutRel = "_layout.html") {
  const pageText = readFileSync(join(caseDir, "src", pageRel), "utf8");
  const layoutPath = join(caseDir, "src", layoutRel);
  let layoutText;
  try {
    layoutText = readFileSync(layoutPath, "utf8");
  } catch {
    layoutText = null;
  }
  const reporter = silentReporter();
  const composed = compose({
    pageText, pageFile: pageRel,
    layoutText, layoutFile: layoutText ? layoutRel : undefined,
    reporter,
  });
  return { composed, reporter };
}

function expectTreeMatch(caseDir, pageRel, composed) {
  const expectedText = readFileSync(join(caseDir, "expected", pageRel), "utf8");
  const diffs = compareHtml(expectedText, composed, pageRel);
  expect(diffs).toEqual([]);
}

// ---------------------------------------------------------- spec-fixtures

describe("spec-fixtures: composition family", () => {
  test("FIX-01: data-layout=none page, no layout — emitted from its own text (data-layout stripped)", async () => {
    const dir = join(SPEC_FIXTURES, "FIX-01");
    // compose.js never sees <include> — includes.js (§5) resolves those first
    // in the real pipeline. Chain the REAL includes.js module here (owned by
    // this same task's neighboring boundary, safe to import) rather than
    // hand-splicing, for end-to-end fidelity through two of the three pieces.
    const reporter = silentReporter();
    const pageText = await withIncludesInlined(dir, "index.html", reporter);
    const composed = compose({ pageText, pageFile: "index.html", layoutText: null, reporter });
    expect(reporter.diagnostics).toEqual([]);
    const diffs = compareHtml(readFileSync(join(dir, "expected", "index.html"), "utf8"), composed, "index.html");
    expect(diffs).toEqual([]);
  });

  test("FIX-02/C1: golden path — <main> default content with unwrap, title join", () => {
    const dir = join(SPEC_FIXTURES, "FIX-02");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics).toEqual([]);
    expectTreeMatch(dir, "index.html", composed);
  });

  test("FIX-03/C2: named slot replaces the element, wrapper footer persists", () => {
    const dir = join(SPEC_FIXTURES, "FIX-03");
    const { composed, reporter } = composeFixture(dir, "contact.html");
    expect(reporter.diagnostics).toEqual([]);
    expectTreeMatch(dir, "contact.html", composed);
  });

  test("FIX-04/C3: unfilled slot renders its fallback", () => {
    const dir = join(SPEC_FIXTURES, "FIX-04");
    const { composed, reporter } = composeFixture(dir, "about.html");
    expect(reporter.diagnostics).toEqual([]);
    expectTreeMatch(dir, "about.html", composed);
  });

  test("FIX-05/C4: multiple fills, one name, page order", () => {
    const dir = join(SPEC_FIXTURES, "FIX-05");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics).toEqual([]);
    expectTreeMatch(dir, "index.html", composed);
  });

  test("FIX-07/C6: bare slot inside <main> — pinning without a rule (launch and plain)", () => {
    const dir = join(SPEC_FIXTURES, "FIX-07");
    for (const page of ["launch.html", "plain.html"]) {
      const { composed, reporter } = composeFixture(dir, page);
      expect(reporter.diagnostics).toEqual([]);
      expectTreeMatch(dir, page, composed);
    }
  });

  test("FIX-09/C8: sink-less layout — head-only passthrough, page's own <main> ships verbatim", () => {
    const dir = join(SPEC_FIXTURES, "FIX-09");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics).toEqual([]);
    expectTreeMatch(dir, "index.html", composed);
  });

  test("FIX-12: root-attribute merge — class union, new attribute appended", () => {
    const dir = join(SPEC_FIXTURES, "FIX-12");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics).toEqual([]);
    expectTreeMatch(dir, "index.html", composed);
  });

  test("FIX-13: real markdown.js output, assembled and composed exactly as an HTML page would be", () => {
    // Chains the REAL markdown.js (owned by another agent on this same task)
    // through this module's assembleMarkdownDocument() seam and into
    // compose() — genuine cross-module integration, not a hand-reproduction.
    const dir = join(SPEC_FIXTURES, "FIX-13");
    const source = readFileSync(join(dir, "src", "about.md"), "utf8");
    const reporter = silentReporter();
    const md = convert(source, { path: join(dir, "src", "about.md"), sourceRoot: join(dir, "src"), reporter });
    expect(reporter.diagnostics).toEqual([]); // no P17/P11 in this fixture
    const pageText = assembleMarkdownDocument(md, { standalone: false });
    const layoutText = readFileSync(join(dir, "src", "_layout.html"), "utf8");
    const composed = compose({ pageText, pageFile: "about.md", layoutText, layoutFile: "_layout.html", reporter });
    expect(reporter.diagnostics).toEqual([]);
    const diffs = compareHtml(readFileSync(join(dir, "expected", "about.html"), "utf8"), composed, "about.html");
    expect(diffs).toEqual([]);
  });
});

// ------------------------------ assembleMarkdownDocument (§10.7 / SHL-01) --

describe("assembleMarkdownDocument: the markdown.js <-> compose() seam", () => {
  test("layout-none-md: real markdown.js output assembled into the exact §10.7 shell (standalone)", () => {
    const dir = join(LANDMINES, "layout-none-md");
    const source = readFileSync(join(dir, "src", "standalone.md"), "utf8");
    const reporter = silentReporter();
    const md = convert(source, { path: join(dir, "src", "standalone.md"), sourceRoot: join(dir, "src"), reporter });
    expect(reporter.diagnostics).toEqual([]);
    const composed = assembleMarkdownDocument(md, { standalone: true });
    const diffs = compareHtml(readFileSync(join(dir, "expected", "standalone.html"), "utf8"), composed, "standalone.html");
    expect(diffs).toEqual([]);
  });

  test("md-include-element: markdown.js -> includes.js -> assembleMarkdownDocument, block/inline/code-fence placement", async () => {
    const dir = join(LANDMINES, "md-include-element");
    const sourceRoot = join(dir, "src");
    const file = join(sourceRoot, "page.md");
    const source = readFileSync(file, "utf8");
    const reporter = silentReporter();
    // §10.1: conversion first — includes resolve on the CONVERTED body.
    const md = convert(source, { path: file, sourceRoot, reporter });
    const includedHtml = await inlineIncludes({
      text: md.html, file, sourceRoot, reporter,
      convertMarkdown: async () => { throw new Error("no .md include targets in this fixture"); },
    });
    expect(reporter.diagnostics).toEqual([]);
    const composed = assembleMarkdownDocument({ ...md, html: includedHtml }, { standalone: true });
    const diffs = compareHtml(readFileSync(join(dir, "expected", "page.html"), "utf8"), composed, "page.html");
    expect(diffs).toEqual([]);
  });
});

// ------------------------------------------------------------- landmines

describe("landmines: composition family", () => {
  test("misaddressed-fill: MRG-10/A02 — content stays in place, advisory fires", () => {
    const dir = join(LANDMINES, "misaddressed-fill");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].severity).toBe("advisory");
    expect(reporter.diagnostics[0].file).toBe("index.html");
    expect(reporter.diagnostics[0].line).toBe(6);
    expect(reporter.diagnostics[0].message).toContain("footer");
    expectTreeMatch(dir, "index.html", composed);
  });

  test("duplicate-slot-name: MRG-03/A13 — first wins, second renders fallback", () => {
    const dir = join(LANDMINES, "duplicate-slot-name");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].file).toBe("_layout.html");
    expect(reporter.diagnostics[0].line).toBe(9);
    expect(reporter.diagnostics[0].message).toContain("x");
    expectTreeMatch(dir, "index.html", composed);
  });

  test("second-bare-slot: MRG-02/A13", () => {
    const dir = join(LANDMINES, "second-bare-slot");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].line).toBe(6);
    expect(reporter.diagnostics[0].message).toContain("slot");
    expectTreeMatch(dir, "index.html", composed);
  });

  test("dup-main: MRG-05/A13", () => {
    const dir = join(LANDMINES, "dup-main");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].line).toBe(8);
    expect(reporter.diagnostics[0].message).toContain("main");
    expectTreeMatch(dir, "index.html", composed);
  });

  test("slot-in-page: MRG-04/A04 — page's own stray slot neutralized before composition", () => {
    const dir = join(LANDMINES, "slot-in-page");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].file).toBe("index.html");
    expect(reporter.diagnostics[0].line).toBe(5);
    expect(reporter.diagnostics[0].message).toContain("slot");
    expectTreeMatch(dir, "index.html", composed);
  });

  test("slot-in-layout-head: MRG-04/A04 — layout head's stray slot becomes ordinary head content", () => {
    const dir = join(LANDMINES, "slot-in-layout-head");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].file).toBe("_layout.html");
    expect(reporter.diagnostics[0].line).toBe(5);
    expectTreeMatch(dir, "index.html", composed);
  });

  test("slot-in-template: MRG-01/MRG-11 — template's slot is invisible, fill misaddressed", () => {
    const dir = join(LANDMINES, "slot-in-template");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].line).toBe(6);
    expect(reporter.diagnostics[0].message).toContain("x");
    expectTreeMatch(dir, "index.html", composed);
    expect(composed).toContain('<template shadowrootmode="open"><slot name="x"><p>shadow default</p></slot></template>');
  });

  test("slot-attr-edge: nested slot= and slot=\"\" are never fills — zero diagnostics", () => {
    const dir = join(LANDMINES, "slot-attr-edge");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics).toEqual([]);
    expectTreeMatch(dir, "index.html", composed);
  });

  test("nested-main-in-div: R4 — unwraps at any depth, wrapper survives", () => {
    const dir = join(LANDMINES, "nested-main-in-div");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics).toEqual([]);
    expectTreeMatch(dir, "index.html", composed);
  });

  test("main-in-main: unwrap happens exactly once", () => {
    const dir = join(LANDMINES, "main-in-main");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics).toEqual([]);
    expectTreeMatch(dir, "index.html", composed);
  });

  test("empty-default-main: empty default content leaves main's children untouched", () => {
    const dir = join(LANDMINES, "empty-default-main");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics).toEqual([]);
    expectTreeMatch(dir, "index.html", composed);
  });

  test("empty-default-slot: empty default content renders the default slot's fallback", () => {
    const dir = join(LANDMINES, "empty-default-slot");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics).toEqual([]);
    expectTreeMatch(dir, "index.html", composed);
  });

  test("stray-header-footer: MRG-17/A03 fires for both, content still ships in place", () => {
    const dir = join(LANDMINES, "stray-header-footer");
    const { composed, reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics.length).toBe(2);
    expect(reporter.diagnostics[0].line).toBe(5);
    expect(reporter.diagnostics[0].message).toContain("header");
    expect(reporter.diagnostics[1].line).toBe(7);
    expect(reporter.diagnostics[1].message).toContain("footer");
    expectTreeMatch(dir, "index.html", composed);
  });

  test("content-nowhere: MRG-14/P09 — content would vanish, located at the page, names the layout", () => {
    const dir = join(LANDMINES, "content-nowhere");
    const { reporter } = composeFixture(dir, "about.html");
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].severity).toBe("problem");
    expect(reporter.diagnostics[0].file).toBe("about.html");
    expect(reporter.diagnostics[0].line).toBe(1);
    expect(reporter.diagnostics[0].message).toContain("_layout.html");
  });

  test("slot-in-filled-fallback: MRG-19/P16 — nested slot is a problem regardless of fills", () => {
    const dir = join(LANDMINES, "slot-in-filled-fallback");
    const { reporter } = composeFixture(dir, "index.html");
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].severity).toBe("problem");
    expect(reporter.diagnostics[0].file).toBe("_layout.html");
    expect(reporter.diagnostics[0].line).toBe(8);
    expect(reporter.diagnostics[0].message).toContain("slot");
    expect(reporter.diagnostics[0].message).toContain("nest");
  });

  test("dollar-patterns: $&, $1, $', $`, $$ survive byte-for-byte through slot fills", async () => {
    const dir = join(LANDMINES, "dollar-patterns");
    const reporter = silentReporter();
    const pageText = await withIncludesInlined(dir, "index.html", reporter);
    const layoutText = readFileSync(join(dir, "src", "_layout.html"), "utf8");
    const composed = compose({ pageText, pageFile: "index.html", layoutText, layoutFile: "_layout.html", reporter });
    expect(reporter.diagnostics).toEqual([]);
    const diffs = compareHtml(readFileSync(join(dir, "expected", "index.html"), "utf8"), composed, "index.html");
    expect(diffs).toEqual([]);
  });
});
