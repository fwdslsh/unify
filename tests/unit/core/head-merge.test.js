/**
 * Unit tests for src/core/head-merge.js (Tier 3 — no conformance authority;
 * testing-strategy §2). These drive mergeHead() directly against the exact
 * documents from the conformance spec's own worked examples and the
 * composition-family landmines, using the SAME comparator the conformance
 * harness uses (tests/conformance/compare.mjs) rather than a hand-rolled
 * one — reusing the one comparator is the H5 discipline, even though H1-H5
 * only formally gates tests/conformance/** and tests/e2e/**.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyEdits, elementChildren, findFirst, isElement, lineOf, parse } from "../../../src/core/html.js";
import { mergeHead } from "../../../src/core/head-merge.js";
import { inlineIncludes } from "../../../src/core/includes.js";
import { spansToDiagnosticLocator } from "../../../src/core/urls.js";
import { compareHtml } from "../../../tests/conformance/compare.mjs";
import { Reporter } from "../../../src/core/diagnostics.js";

const ROOT = join(import.meta.dir, "..", "..", "..");

/** Finds <head> whether or not it's wrapped in <html> — tests use bare <head> snippets. */
function headOf(text) {
  const { root } = parse(text);
  return findFirst(root, (n) => isElement(n, "head"));
}

/** Run mergeHead and return the composed <head>...</head> fragment. */
function run(layoutText, layoutFile, pageText, pageFile, reporter = new Reporter({ stderr: { write() {} }, stdout: { write() {} } }), pageAt) {
  const layoutHead = headOf(layoutText);
  const pageHead = headOf(pageText);
  const edits = mergeHead({ layoutHead, layoutText, layoutFile, pageHead, pageText, pageFile, pageAt, reporter });
  const composed = applyEdits(layoutText, edits);
  const newHead = headOf(composed);
  return composed.slice(newHead.start, newHead.end);
}

describe("FIX-11 — the whole head-merge table at once", () => {
  const dir = join(ROOT, "tests", "conformance", "spec-fixtures", "FIX-11");
  const layoutText = readFileSync(join(dir, "src", "_layout.html"), "utf8");
  const pageText = readFileSync(join(dir, "src", "deep", "page.html"), "utf8");
  const expectedText = readFileSync(join(dir, "expected", "deep", "page.html"), "utf8");

  test("produces exactly the spec's worked-example head", () => {
    const reporter = new Reporter({ stderr: { write() {} }, stdout: { write() {} } });
    const actualHead = run(layoutText, "_layout.html", pageText, "deep/page.html", reporter);
    const expectedHead = headOf(expectedText);
    const expectedHeadText = expectedText.slice(expectedHead.start, expectedHead.end);
    const diffs = compareHtml(expectedHeadText, actualHead, "head");
    expect(diffs).toEqual([]);
    expect(reporter.diagnostics).toEqual([]); // identical charset, no advisory
  });
});

describe("head-merge: row-by-row behavior", () => {
  test("row 1: identical charset is silent, layout's stays first", () => {
    const layout = `<head><meta charset="utf-8"><title>— S</title></head>`;
    const page = `<head><meta charset="utf-8"><title>P</title></head>`;
    const reporter = new Reporter({ stderr: { write() {} }, stdout: { write() {} } });
    const head = run(layout, "_layout.html", page, "index.html", reporter);
    expect(reporter.diagnostics).toEqual([]);
    const { root } = parse(head);
    const metas = elementChildren(root.children[0]).filter((e) => isElement(e, "meta"));
    expect(metas.length).toBe(1);
  });

  test("row 1: different charset fires A08, layout's value wins", () => {
    const layout = `<head><meta charset="utf-8"><title>— S</title></head>`;
    const page = `<head><meta charset="utf-16"><title>P</title></head>`;
    const reporter = new Reporter({ stderr: { write() {} }, stdout: { write() {} } });
    const head = run(layout, "_layout.html", page, "index.html", reporter);
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].severity).toBe("advisory");
    expect(reporter.diagnostics[0].message).toContain("charset");
    expect(head).toContain('charset="utf-8"');
    expect(head).not.toContain("utf-16");
  });

  test("row 1: layout has none — page's charset moves to the first position", () => {
    const layout = `<head><title>— S</title></head>`;
    const page = `<head><meta charset="utf-8"><title>P</title></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    const { root } = parse(head);
    const kids = elementChildren(root.children[0]);
    expect(isElement(kids[0], "meta")).toBe(true);
  });

  test("row 2: layout has no title — page's appends with its own text (row 7)", () => {
    const layout = `<head><meta charset="utf-8"><link rel="stylesheet" href="/assets/style.css"></head>`;
    const page = `<head><title>Home</title></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    const { root } = parse(head);
    const kids = elementChildren(root.children[0]);
    const title = kids.find((k) => isElement(k, "title"));
    expect(title).toBeDefined();
    expect(title.children[0].data).toBe("Home"); // NOT joined — no layout text to join
    expect(kids[kids.length - 1]).toBe(title); // appended last
  });

  test("row 2: empty/whitespace page title counts as absent", () => {
    const layout = `<head><title>— S</title></head>`;
    const page = `<head><title>   </title></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    expect(head).toContain("<title>— S</title>");
  });

  test("row 3: meta name replaced in place; multiple page og:image all kept", () => {
    const layout = `<head><meta name="description" content="A site."><meta property="og:image" content="/old.png"></head>`;
    const page = `<head><meta property="og:image" content="/a.png"><meta property="og:image" content="/b.png"></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    const { root } = parse(head);
    const kids = elementChildren(root.children[0]);
    const images = kids.filter((k) => getAttrValue(k, "property") === "og:image");
    expect(images.length).toBe(2);
    expect(getAttrValue(images[0], "content")).toBe("/a.png");
    expect(getAttrValue(images[1], "content")).toBe("/b.png");
    // description had no page counterpart — stays untouched
    expect(head).toContain('name="description"');
  });

  test("row 3: key matching is ASCII case-insensitive on the name/property value", () => {
    const layout = `<head><meta name="Description" content="old"></head>`;
    const page = `<head><meta name="description" content="new"></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    const { root } = parse(head);
    const metas = elementChildren(root.children[0]);
    expect(metas.length).toBe(1);
    expect(getAttrValue(metas[0], "content")).toBe("new");
  });

  test("row 3: http-equiv is never keyed — both layout's and page's ship", () => {
    const layout = `<head><meta http-equiv="x-dns-prefetch-control" content="on"></head>`;
    const page = `<head><meta http-equiv="x-dns-prefetch-control" content="on"></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    const { root } = parse(head);
    const metas = elementChildren(root.children[0]);
    expect(metas.length).toBe(2); // both present — never deduped
  });

  test("row 4: canonical replaces in place, never two", () => {
    const layout = `<head><link rel="canonical" href="https://example.com/"></head>`;
    const page = `<head><link rel="canonical" href="https://example.com/deep/page.html"></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    const { root } = parse(head);
    const links = elementChildren(root.children[0]).filter((k) => isElement(k, "link"));
    expect(links.length).toBe(1);
    expect(getAttrValue(links[0], "href")).toBe("https://example.com/deep/page.html");
  });

  test("row 5: icon replaced when page declares one; apple-touch-icon is not keyed", () => {
    const layout = `<head><link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple.png"></head>`;
    const page = `<head><link rel="icon" href="/menu-icon.svg"></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    const { root } = parse(head);
    const links = elementChildren(root.children[0]).filter((k) => isElement(k, "link"));
    expect(links.length).toBe(2);
    const icon = links.find((l) => getAttrValue(l, "rel") === "icon");
    expect(getAttrValue(icon, "href")).toBe("/menu-icon.svg");
    const apple = links.find((l) => getAttrValue(l, "rel") === "apple-touch-icon");
    expect(getAttrValue(apple, "href")).toBe("/apple.png"); // untouched
  });

  test("row 5: shortcut icon token list still matches 'icon'", () => {
    const layout = `<head><link rel="shortcut icon" href="/favicon.ico"></head>`;
    const page = `<head><link rel="icon" href="/new.svg"></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    const { root } = parse(head);
    const links = elementChildren(root.children[0]).filter((k) => isElement(k, "link"));
    expect(links.length).toBe(1);
    expect(getAttrValue(links[0], "href")).toBe("/new.svg");
  });

  test("row 6: relative page stylesheet resolves to the same file as the layout's absolute one — page copy dropped", () => {
    const layout = `<head><link rel="stylesheet" href="/assets/style.css"></head>`;
    const page = `<head><link rel="stylesheet" href="../assets/style.css"></head>`;
    const head = run(layout, "_layout.html", page, "deep/page.html");
    const { root } = parse(head);
    const links = elementChildren(root.children[0]).filter((k) => isElement(k, "link"));
    expect(links.length).toBe(1);
    expect(getAttrValue(links[0], "href")).toBe("/assets/style.css"); // layout's own spelling stands
  });

  test("row 6: distinct stylesheet URLs both ship — layout's untouched, page's appended as written", () => {
    const layout = `<head><link rel="stylesheet" href="/assets/style.css"></head>`;
    const page = `<head><link rel="stylesheet" href="page.css"></head>`;
    const head = run(layout, "_layout.html", page, "deep/page.html");
    const { root } = parse(head);
    const links = elementChildren(root.children[0]).filter((k) => isElement(k, "link"));
    expect(links.length).toBe(2);
    expect(getAttrValue(links[1], "href")).toBe("page.css"); // emitted exactly as the page wrote it
  });

  test("row 6: byte-identical inline <style> is deduped; differing content ships both", () => {
    const layout = `<head><style>body{color:red}</style></head>`;
    const page = `<head><style>body{color:red}</style></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    const { root } = parse(head);
    expect(elementChildren(root.children[0]).filter((k) => isElement(k, "style")).length).toBe(1);
  });

  test("row 6: inline <script> (no src) dedups by exact content", () => {
    const layout = `<head><script>console.log(1)</script></head>`;
    const page = `<head><script>console.log(2)</script></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    const { root } = parse(head);
    const scripts = elementChildren(root.children[0]).filter((k) => isElement(k, "script"));
    expect(scripts.length).toBe(2); // different content — not a dup
  });

  test("row 7: unmatched elements append in page-source order, after layout content", () => {
    const layout = `<head><meta charset="utf-8"></head>`;
    const page = `<head><meta name="viewport" content="width=device-width"><link rel="manifest" href="/m.json"></head>`;
    const head = run(layout, "_layout.html", page, "index.html");
    const { root } = parse(head);
    const kids = elementChildren(root.children[0]);
    expect(kids.map((k) => k.tag)).toEqual(["meta", "meta", "link"]);
    expect(getAttrValue(kids[1], "name")).toBe("viewport");
  });
});

describe("§14.1 — where A08 lands (the module's only located diagnostic)", () => {
  const dir = join(ROOT, "tests", "fixtures", "landmines", "charset-after-include");
  const silent = () => new Reporter({ stderr: { write() {} }, stdout: { write() {} } });
  const layoutText = () => readFileSync(join(dir, "src", "_layout.html"), "utf8");

  /** The page with its head fragment inlined — what compose.js hands mergeHead in a real build. */
  async function inlinedPage(reporter) {
    return inlineIncludes({
      text: readFileSync(join(dir, "src", "index.html"), "utf8"),
      file: join(dir, "src", "index.html"),
      sourceRoot: join(dir, "src"),
      reporter,
      convertMarkdown: async () => "",
    });
  }

  test("a charset below an inlined fragment reports its line in the page, not in the inlined text", async () => {
    const reporter = silent();
    const { text: pageText, spans } = await inlinedPage(reporter);
    const pageAt = spansToDiagnosticLocator(spans, "index.html", (file, fileOffset) =>
      lineOf(readFileSync(join(dir, "src", file), "utf8"), fileOffset));

    run(layoutText(), "_layout.html", pageText, "index.html", reporter, pageAt);
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].file).toBe("index.html");
    expect(reporter.diagnostics[0].line).toBe(5);

    // What the pre-fix measurement said, and why it was worse than an
    // out-of-range number: line 8 of index.html exists (it is `<body>`), so a
    // reader who opened it found a real line with no charset on it.
    expect(lineOf(pageText, pageText.indexOf('charset="utf-16"'))).toBe(8);
    expect(readFileSync(join(dir, "src", "index.html"), "utf8").trimEnd().split("\n").length).toBe(11);
  });

  test("with no pageAt, `pageText` is taken to be the page's own raw source — exact for a page with no includes", () => {
    const reporter = silent();
    const page = `<!doctype html>\n<html>\n<head>\n<meta charset="utf-16">\n</head>\n<body></body>\n</html>\n`;
    run(layoutText(), "_layout.html", page, "index.html", reporter);
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].file).toBe("index.html");
    expect(reporter.diagnostics[0].line).toBe(4);
  });
});

function getAttrValue(el, name) {
  const a = el.attrs.find((a) => a.name.toLowerCase() === name.toLowerCase());
  return a ? a.value : null;
}
