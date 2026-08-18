#!/usr/bin/env bun
/**
 * check-suite-hygiene.mjs — anti-rot gate for the test suite itself.
 *
 * The v0.6 suite reached 93% coverage on a product that did not work. Each
 * ban below removes one mechanism that made that possible (evidence in
 * docs/testing-strategy.md §1):
 *
 *  H1  No mocks/spies in behavior tests. tests/conformance/** and tests/e2e/**
 *      must exercise the real CLI against a real filesystem. (`mock(`,
 *      `spyOn(`, `jest.fn` banned there; unit tests under tests/unit may mock.)
 *  H2  No warn-instead-of-fail. `console.warn` and commented-out expectations
 *      (`// expect(`) are banned in behavior tests — the exact pattern that
 *      neutered fixtures-integration.test.js line 375 in v0.6.
 *  H3  No internal imports in behavior tests. Importing from src/** couples
 *      tests to internals and lets them pass while the CLI is broken; behavior
 *      tests spawn the CLI. (The harness itself holds the single cli.js path.)
 *  H4  No skipped tests carrying rule declarations. `test.skip`/`it.skip`/
 *      `test.todo` in a file that declares `covers(`/`@covers` fails — skipped
 *      coverage is the runtime ledger's job to expose, and a skip that keeps a
 *      declaration is a lie waiting to be believed.
 *  H5  No ad-hoc normalization in tree comparison. All tree comparison goes
 *      through the single harness comparator (tests/conformance/compare.mjs),
 *      whose only normalization is the documented contract (testing-strategy
 *      §2): whitespace-only text nodes outside pre/textarea/script/style are
 *      dropped; everything else — structure, attributes and their order,
 *      comments, and text content — is compared exactly, and non-HTML files
 *      byte-for-byte. `normalizeHtml`, `replace(/\s+/g` and friends anywhere
 *      else in a behavior test are banned: v0.6 collapsed ALL whitespace,
 *      which blinded the one real comparison to text- and attribute-level
 *      bugs. Narrow and stated, or nothing.
 *
 *  H6  No leftover experiment markers in shipped source. `src/**` is scanned
 *      for MUTATION PROBE / DEBUG / XXX-style markers. This rule exists
 *      because the review protocol asks reviewers to MUTATE src/** to prove a
 *      test can fail, and one such probe — P22 detection deleted outright —
 *      was committed and pushed when an unrelated `git add -A` ran while it
 *      was live. The full 790-test suite passed with the check gone, so
 *      nothing else in this repository would have caught it.
 *
 * H1-H5 police tests/conformance and tests/e2e; H6 polices src/**.
 *
 * Exit 0 clean; 1 violations.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BEHAVIOR_DIRS = ["tests/conformance", "tests/e2e"].map((d) => join(ROOT, d));
// compare.mjs is the ONE sanctioned comparator (H5): its normalization is the
// documented testing-strategy §2 contract, so the H5 grep exempts it.
const SELF = ["check-suite-hygiene.mjs", "check-traceability.mjs", "compare.mjs"];

const RULES = [
  { id: "H1", re: /\b(?:mock|spyOn)\s*\(|jest\.fn/, why: "mock/spy in a behavior test" },
  { id: "H2", re: /console\.warn|\/\/\s*expect\s*\(/, why: "warn-instead-of-fail or commented-out expectation" },
  { id: "H3", re: /from\s+['"][^'"]*\/src\//, why: "behavior test imports from src/** (spawn the CLI instead)" },
  { id: "H5", re: /normalizeHtml|replace\s*\(\s*\/\\s\+\/g/, why: "whitespace-normalized comparison (compare bytes)" },
];

let violations = 0;

// ---- H6: shipped source carries no experiment markers -----------------------
const SRC = join(ROOT, "src");
// Spelled in pieces so this file's own docstring, which names the marker, is
// not itself a match — the same trick check-traceability.mjs uses for covers().
const MARKER = new RegExp(["MUTATION", "\\s+PROBE"].join("") + "|\\bDEBUG\\s+PROBE|\\bXXX\\b|\\bFIXME\\b|\\bHACK\\b", "i");
function srcFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...srcFiles(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}
for (const f of srcFiles(SRC)) {
  const src = readFileSync(f, "utf8");
  for (const [i, line] of src.split("\n").entries()) {
    const m = line.match(MARKER);
    if (m) {
      console.error(`H-FAIL H6 ${relative(ROOT, f)}:${i + 1}: experiment marker left in shipped source (${JSON.stringify(m[0])})`);
      violations++;
    }
  }
}

for (const dir of BEHAVIOR_DIRS) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir, { recursive: true })) {
    const p = join(dir, String(f));
    if (!statSync(p).isFile() || !/\.(m?js|ts)$/.test(p)) continue;
    if (SELF.some((s) => p.endsWith(s))) continue;
    const src = readFileSync(p, "utf8");
    for (const { id, re, why } of RULES) {
      const m = src.match(re);
      if (m) {
        console.error(`H-FAIL ${id} ${relative(ROOT, p)}: ${why} (${JSON.stringify(m[0])})`);
        violations++;
      }
    }
    const declares = /covers\s*\(|@covers\s/.test(src);
    const skips = /\b(?:test|it|describe)\.(?:skip|todo)\s*\(/.test(src);
    if (declares && skips) {
      console.error(`H-FAIL H4 ${relative(ROOT, p)}: file both skips tests and declares rule coverage`);
      violations++;
    }
  }
}
if (violations) { console.error(`suite hygiene: ${violations} violation(s)`); process.exit(1); }
console.log("suite hygiene: OK");
