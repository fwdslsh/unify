#!/usr/bin/env bun
/**
 * check-suite-hygiene.mjs — anti-rot gate for the test suite itself.
 *
 * The previous suite reached 93% coverage on a product that did not work. Each
 * ban below removes one mechanism that made that possible (evidence in
 * docs/testing-strategy.md §1):
 *
 *  H1  No mocks/spies in behavior tests. tests/conformance/** and tests/e2e/**
 *      must exercise the real CLI against a real filesystem. (`mock(`,
 *      `spyOn(`, `jest.fn` banned there; unit tests under tests/unit may mock.)
 *  H2  No warn-instead-of-fail. `console.warn` and commented-out expectations
 *      (`// expect(`) are banned in behavior tests — the exact pattern that
 *      neutered fixtures-integration.test.js line 375 in the previous suite.
 *  H3  No internal imports in behavior tests. Importing from src/** couples
 *      tests to internals and lets them pass while the CLI is broken; behavior
 *      tests spawn the CLI. (The harness itself holds the single cli.js path.)
 *  H4  No test opts itself out of running. `skip`, `skipIf`, `todo`, and
 *      `only` on `test`/`it`/`describe` all fail, in any test file, whether or
 *      not it declares coverage — a skip that keeps a declaration is a lie
 *      waiting to be believed, and a skip with no declaration is a test that
 *      silently stopped being one.
 *
 *      It used to match `skip|todo` only, and only in files that declared
 *      coverage, which left two doors open at once. `test.skipIf(cond)` — the
 *      modern spelling — passed cleanly in a file dense with `covers()` lines,
 *      and any file without a declaration could skip freely. That matters more
 *      since the mutation sweep began deleting one file from its work copy:
 *      the copy's path (`unify-mutate-…`) and that file's absence are both
 *      sniffable, so a future test could condition itself on either and never
 *      run under a sweep while its `covers()` line kept claiming the rule was
 *      pinned. A test that decides for itself when to run is not a gate.
 *
 *      The one legitimate exemption in this repository is not a skip: the
 *      sweep DELETES `mutation-inventory.test.js` from its copy, in the
 *      harness that owns the copy, where it is visible and cannot spread.
 *  H5  No ad-hoc normalization in tree comparison. All tree comparison goes
 *      through the single harness comparator (tests/conformance/compare.mjs),
 *      whose only normalization is the documented contract (testing-strategy
 *      §2): whitespace-only text nodes outside pre/textarea/script/style are
 *      dropped; everything else — structure, attributes and their order,
 *      comments, and text content — is compared exactly, and non-HTML files
 *      byte-for-byte. `normalizeHtml`, `replace(/\s+/g` and friends anywhere
 *      else in a behavior test are banned: the previous suite collapsed ALL
 *      whitespace, which blinded the one real comparison to text- and
 *      attribute-level bugs. Narrow and stated, or nothing.
 *
 *  H6  No leftover experiment markers in shipped source. `src/**` is scanned
 *      for MUTATION PROBE / DEBUG / XXX-style markers. The review protocol
 *      asks reviewers to MUTATE src/** to prove a test can fail, which makes
 *      an abandoned probe a recurring hazard rather than a one-off: one was
 *      committed and pushed when an unrelated `git add -A` ran while it was
 *      live, and the full 790-test suite passed with the deleted check gone.
 *
 *      Do not over-trust this rule. It catches a probe that LEFT A MARKER; the
 *      incident above happened to leave one, but a silent deletion leaves
 *      nothing to grep for and this gate would miss it entirely. The actual
 *      countermeasures are procedural and live in the review protocol: mutate
 *      only in a detached worktree, stage by explicit path, and require a
 *      reviewer to report which tests a mutation KILLED rather than that a
 *      mutation was run.
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
    const skip = /\b(?:test|it|describe)\.(?:skipIf|skip|todo|only)\b/.exec(src);
    if (skip) {
      console.error(`H-FAIL H4 ${relative(ROOT, p)}: a test opts itself out of running (${JSON.stringify(skip[0])})`);
      violations++;
    }
  }
}
if (violations) { console.error(`suite hygiene: ${violations} violation(s)`); process.exit(1); }
console.log("suite hygiene: OK");
