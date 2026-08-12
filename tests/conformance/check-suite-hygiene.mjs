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
 *  H5  No normalization in tree comparison. `normalizeHtml`, `replace(/\s+/g`
 *      and friends are banned in behavior tests: v0.6 compared whitespace-
 *      normalized HTML, which is how byte-level splice bugs shipped. The
 *      harness compares bytes; anything needing normalization is a spec or
 *      implementation bug, not a comparison problem.
 *
 * Exit 0 clean; 1 violations.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BEHAVIOR_DIRS = ["tests/conformance", "tests/e2e"].map((d) => join(ROOT, d));
const SELF = ["check-suite-hygiene.mjs", "check-traceability.mjs"];

const RULES = [
  { id: "H1", re: /\b(?:mock|spyOn)\s*\(|jest\.fn/, why: "mock/spy in a behavior test" },
  { id: "H2", re: /console\.warn|\/\/\s*expect\s*\(/, why: "warn-instead-of-fail or commented-out expectation" },
  { id: "H3", re: /from\s+['"][^'"]*\/src\//, why: "behavior test imports from src/** (spawn the CLI instead)" },
  { id: "H5", re: /normalizeHtml|replace\s*\(\s*\/\\s\+\/g/, why: "whitespace-normalized comparison (compare bytes)" },
];

let violations = 0;
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
