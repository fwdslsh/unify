/**
 * Unit tests for src/core/layout.js (Tier 3 — no conformance authority;
 * testing-strategy §2). Scoped to §14.1 diagnostic LOCATION, the one thing
 * about this module that the landmine fixtures can only assert end to end:
 * layout.js is handed an include-inlined document, so an offset in the text
 * it holds is not a position in the file it names, and every fault below is
 * one an inlined fragment shifted.
 *
 * §6's selection behavior itself (which layout a page resolves to, P04/P05/
 * P15/P07/P08 firing at all) is covered by the landmines family — these
 * tests deliberately do not restate it.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkLayoutDocument, resolveHtmlLayout } from "../../../src/core/layout.js";
import { inlineIncludes } from "../../../src/core/includes.js";
import { lineOf, parse } from "../../../src/core/html.js";
import { Reporter } from "../../../src/core/diagnostics.js";

const ROOT = join(import.meta.dir, "..", "..", "..");
const LANDMINES = join(ROOT, "tests", "fixtures", "landmines");

const silent = () => new Reporter({ stderr: { write() {} }, stdout: { write() {} } });

/**
 * layout.js's injected `resolveLine` (§14.1), the same thing
 * src/cli/commands/build.js builds for a real build: a provenance position
 * `{file, fileOffset}` turned into a line by reading that file. layout.js
 * cannot number a fragment's line itself — it is handed one document, not the
 * tree — which is why the parameter exists.
 */
function sourceLineResolver(sourceRoot) {
  return (file, fileOffset) => lineOf(readFileSync(join(sourceRoot, file), "utf8"), fileOffset);
}

/** Inline a source file's includes exactly as the build does before §6 runs. */
async function inlined(sourceRoot, rel, reporter) {
  return inlineIncludes({
    text: readFileSync(join(sourceRoot, rel), "utf8"),
    file: join(sourceRoot, rel),
    sourceRoot,
    reporter,
    convertMarkdown: async () => "",
  });
}

describe("§14.1 — P07 locates in the file that wrote the data-layout", () => {
  const sourceRoot = join(LANDMINES, "data-layout-after-include", "src");

  test("a fault below an inlined fragment keeps its line in the page, not in the inlined text", async () => {
    const reporter = silent();
    const { text, spans } = await inlined(sourceRoot, "index.html", reporter);
    const { root } = parse(text);
    resolveHtmlLayout({
      root, text, spans, resolveLine: sourceLineResolver(sourceRoot),
      pageAbsPath: join(sourceRoot, "index.html"), sourceRoot, reporter,
    });

    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].severity).toBe("problem");
    expect(reporter.diagnostics[0].file).toBe("index.html");
    expect(reporter.diagnostics[0].line).toBe(6);

    // The reported line must be a line the named file HAS: measured in the
    // inlined text the same <div> sits on line 11 of an 8-line file, which is
    // exactly what the engine printed before this fix.
    expect(lineOf(text, text.indexOf("data-layout"))).toBe(11);
    expect(readFileSync(join(sourceRoot, "index.html"), "utf8").trimEnd().split("\n").length).toBe(8);
  });

  test("with no resolveLine injected, the line is omitted — never guessed", async () => {
    const reporter = silent();
    const { text, spans } = await inlined(sourceRoot, "index.html", reporter);
    const { root } = parse(text);
    resolveHtmlLayout({
      root, text, spans, pageAbsPath: join(sourceRoot, "index.html"), sourceRoot, reporter,
    });
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].file).toBe("index.html");
    expect(reporter.diagnostics[0].line).toBeUndefined();
  });

  test("with neither spans nor resolveLine, `text` is the page's own source and the line is exact", () => {
    const reporter = silent();
    const text = `<!doctype html>\n<html>\n<body>\n<div data-layout="/card.html">x</div>\n</body>\n</html>\n`;
    const { root } = parse(text);
    resolveHtmlLayout({ root, text, pageAbsPath: join(sourceRoot, "index.html"), sourceRoot, reporter });
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].line).toBe(4);
  });
});

describe("§14.1 — a fragment-contributed fault is reported IN the fragment", () => {
  test("P15 names the fragment that wrote the data-layout, at its own line there", () => {
    // A layout whose <body> tag arrives from an include: the declaration is
    // the fragment's authored text, so that is the file and the line the
    // author can open. Hand-built spans rather than a fixture — a layout that
    // outsources its <body> tag is not a shape the landmine set should teach,
    // but the CONVENTION under test is the one slot-inside-include pins for §7.
    const reporter = silent();
    const shell = `<!doctype html>\n<html>\n<head><title>— S</title></head>\n`;
    const fragment = `<body data-layout="/other.html">\n<main></main>\n</body>\n`;
    const text = shell + fragment + `</html>\n`;
    const spans = [
      { start: 0, end: shell.length, file: "_layout.html", fileOffset: 0 },
      { start: shell.length, end: shell.length + fragment.length, file: "_includes/shell.html", fileOffset: 0 },
      { start: shell.length + fragment.length, end: text.length, file: "_layout.html", fileOffset: shell.length },
    ];

    const { root } = parse(text);
    const { broken } = checkLayoutDocument({
      root, text, spans, file: "_layout.html", reporter,
      resolveLine: (file, fileOffset) => (file === "_includes/shell.html" ? lineOf(fragment, fileOffset) : undefined),
    });

    expect(broken).toBe(true);
    expect(reporter.diagnostics.length).toBe(1);
    expect(reporter.diagnostics[0].file).toBe("_includes/shell.html");
    expect(reporter.diagnostics[0].line).toBe(1);
    // The fix still names the LAYOUT — the file whose role is wrong — even
    // though the markup was written elsewhere.
    expect(reporter.diagnostics[0].fixes[0]).toContain("_layout.html");
  });
});
