/**
 * Tier 3 — the traceability gate's own `covers(...)` scanner.
 *
 * This guards the thing that guards everything else, and it earned a test the
 * hard way: three attempts to make it comment-aware each broke it differently.
 * Blanking string contents silently stopped it seeing a real call; stripping
 * `//` without string awareness ate every URL and the lines after them. Both
 * failures were invisible except as a rule count moving, which is exactly the
 * kind of thing that should not be discovered by squinting at output.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CHECKER = join(import.meta.dir, "..", "..", "tests", "conformance", "check-traceability.mjs");

/** Pull the scanner out of the gate script without executing the gate. */
function loadStripper() {
  const src = readFileSync(CHECKER, "utf8");
  const start = src.indexOf("function stripComments(");
  const end = src.indexOf("\nfunction ", start + 10);
  return new Function(`${src.slice(start, end)}; return stripComments;`)();
}

const strip = loadStripper();
const idsIn = (text) =>
  [...strip(text).matchAll(/covers\(([^)]*)\)/g)].flatMap((m) =>
    m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean),
  );

describe("covers() scanner", () => {
  test("finds a real call", () => {
    expect(idsIn('covers("MRG-01");')).toEqual(["MRG-01"]);
  });

  test("finds a multi-argument call", () => {
    expect(idsIn('covers("WCH-01", "WCH-02");')).toEqual(["WCH-01", "WCH-02"]);
  });

  test("ignores a call written inside a line comment", () => {
    expect(idsIn('// call covers("FAKE-01") at the end of the test\ncovers("MRG-01");')).toEqual(["MRG-01"]);
  });

  test("ignores a call written inside a block comment", () => {
    expect(idsIn('/**\n * e.g. covers("FAKE-01")\n */\ncovers("MRG-01");')).toEqual(["MRG-01"]);
  });

  test("a URL in a string does not start a comment — the regression that ate real calls", () => {
    const src = 'const u = "http://localhost:3000/x";\ncovers("WCH-05");';
    expect(idsIn(src)).toEqual(["WCH-05"]);
  });

  test("a URL in a template literal does not start a comment either", () => {
    const src = "const u = `http://localhost:${port}/index.html`;\ncovers(\"WCH-06\");";
    expect(idsIn(src)).toEqual(["WCH-06"]);
  });

  test("an escaped quote does not end the string early", () => {
    const src = 'const s = "he said \\"//not a comment\\" loudly";\ncovers("MRG-02");';
    expect(idsIn(src)).toEqual(["MRG-02"]);
  });

  test("offsets are preserved so line numbers stay meaningful", () => {
    const src = 'a();\n// comment\nb();\n';
    expect(strip(src).split("\n").length).toBe(src.split("\n").length);
    expect(strip(src)).toHaveLength(src.length);
  });
});
