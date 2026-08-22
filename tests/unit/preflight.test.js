/**
 * Tier 3 — the suite's own two guards, exercised the way a person meets them:
 * a real `bun test` process in a throwaway project that carries real copies of
 * this repository's `tests/watchdog.mjs`, `tests/module-graph.mjs` and
 * `tests/preflight.mjs`.
 *
 * A subprocess and not an import, for the same reason behaviour tests spawn the
 * CLI: what is under test is what happens to the RUNNER, and a function that
 * returns the right answer while the runner still hangs is precisely the defect
 * being closed (testing-strategy §8). Copying the guard files rather than
 * re-implementing them is the other half — a guard edited in the repo is the
 * guard tested here.
 *
 * Every spawn is hard-killed at `capMs`, and every bound sits far below the
 * assertion it supports, so a regression shows up as a failed assertion in
 * seconds. This file must never be the thing that hangs.
 */
import { afterAll, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS = join(HERE, "..");
const GUARD_FILES = ["watchdog.mjs", "module-graph.mjs", "preflight.mjs"];

const made = [];
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

/**
 * A throwaway project wired exactly like this repository: the same two preload
 * entries in the same order, and the guard files byte-for-byte.
 * @param {Record<string,string>} files
 */
function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "unify-preflight-"));
  made.push(dir);
  mkdirSync(join(dir, "tests"), { recursive: true });
  for (const f of GUARD_FILES) copyFileSync(join(TESTS, f), join(dir, "tests", f));
  writeFileSync(join(dir, "bunfig.toml"), '[test]\npreload = ["./tests/watchdog.mjs", "./tests/preflight.mjs"]\n');
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, ...rel.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return dir;
}

/**
 * Run `bun test` in `dir`, killed at `capMs`: a hang here is a failed assertion
 * (`killed === false`), never a stuck suite. Every caller's own test timeout is
 * set above its cap on purpose — otherwise a regressed guard is reported as
 * bun's generic per-test timeout, which names neither the guard nor the hang.
 */
async function runSuite(dir, { capMs = 8_000, env = {} } = {}) {
  const proc = Bun.spawn({
    cmd: [process.execPath, "test"],
    cwd: dir,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1", ...env },
  });
  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    try {
      proc.kill(9);
    } catch {
      /* already gone */
    }
  }, capMs);
  const started = Date.now();
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exit = await proc.exited;
  clearTimeout(timer);
  return { exit, stdout, stderr, killed, ms: Date.now() - started };
}

const BROKEN = "export const ok = 1;\nthis is not valid javascript (((\n";
const importer = (spec) =>
  `import { test, expect } from "bun:test";\nimport { ok } from "${spec}";\ntest("t", () => { expect(ok).toBe(1); });\n`;

test("an unparseable src module stops the runner before it loads a test file, located and fast", async () => {
  // Two importers, because one is not enough to reproduce: bun 1.3.11 exits 1
  // cleanly when a single test file fails to load, and spins forever from two.
  const dir = project({
    "src/core/urls.js": BROKEN,
    "tests/a.test.js": importer("../src/core/urls.js"),
    "tests/b.test.js": importer("../src/core/urls.js"),
  });
  const r = await runSuite(dir);
  expect(r.killed).toBe(false);
  expect(r.exit).toBe(2);
  expect(r.stderr).toContain("src/core/urls.js:2:6");
  expect(r.stderr).toContain("does not parse");
  // Nothing ran: the refusal happens before the runner reaches a test.
  expect(r.stdout).not.toContain("1 pass");
}, 30_000);

test("a malformed .js under tests/fixtures is site content, not a module — the suite still runs", async () => {
  // The false positive that would get the guard switched off: unify must ship
  // a broken script byte-for-byte, so a fixture holding one is a case to test,
  // never a reason to refuse to start.
  const dir = project({
    "src/core/urls.js": "export const ok = 1;\n",
    "tests/fixtures/site/assets/broken.js": BROKEN,
    "tests/a.test.js": importer("../src/core/urls.js"),
    "tests/b.test.js": importer("../src/core/urls.js"),
  });
  const r = await runSuite(dir);
  expect(r.killed).toBe(false);
  expect(r.exit).toBe(0);
  expect(r.stderr).not.toContain("does not parse");
}, 30_000);

test("a fixture module a test actually imports is checked — the closure follows imports back in", async () => {
  // tests/fixtures/landmines/runtime-cases.mjs is this shape in the real tree:
  // swept out as fixture content, re-entered because a test imports it.
  const dir = project({
    "src/core/urls.js": "export const ok = 1;\n",
    "tests/fixtures/cases.mjs": BROKEN,
    "tests/a.test.js": importer("./fixtures/cases.mjs"),
    "tests/b.test.js": importer("./fixtures/cases.mjs"),
  });
  const r = await runSuite(dir);
  expect(r.killed).toBe(false);
  expect(r.exit).toBe(2);
  expect(r.stderr).toContain("tests/fixtures/cases.mjs:2:6");
}, 30_000);

test("declared-but-uninstalled dependencies stop the runner before it half-runs on auto-install", async () => {
  // The state this closes: no `bun install`, so bun's auto-install serves
  // in-process imports from a cache while `bun build --compile` and bare-env
  // spawns fail resolution — a suite that is mostly green and still lying.
  // The dependency is never imported, so nothing here touches the network.
  const dir = project({
    "package.json": '{ "name": "scratch", "dependencies": { "some-missing-dep": "1.0.0" } }\n',
    "src/core/urls.js": "export const ok = 1;\n",
    "tests/a.test.js": importer("../src/core/urls.js"),
  });
  const r = await runSuite(dir);
  expect(r.killed).toBe(false);
  expect(r.exit).toBe(2);
  expect(r.stderr).toContain("some-missing-dep");
  expect(r.stderr).toContain("bun install");
  // Nothing ran: the refusal happens before the runner reaches a test.
  expect(r.stdout).not.toContain("1 pass");
}, 30_000);

test("a tree that declares no dependencies is not the dependency guard's business", async () => {
  // The false positive that would get the guard switched off: every scratch
  // project in this file, and any consumer testing without a package.json,
  // must run exactly as before.
  const dir = project({
    "package.json": '{ "name": "scratch" }\n',
    "src/core/urls.js": "export const ok = 1;\n",
    "tests/a.test.js": importer("../src/core/urls.js"),
  });
  const r = await runSuite(dir);
  expect(r.killed).toBe(false);
  expect(r.exit).toBe(0);
  expect(r.stderr).not.toContain("bun install");
}, 30_000);

test("the watchdog kills a run that hangs between per-test timeouts, and says so", async () => {
  // A never-settling test whose own timeout is longer than the budget: bun
  // would wait, and the budget is what refuses to.
  const dir = project({
    "tests/a.test.js":
      'import { test } from "bun:test";\ntest("never", async () => { await new Promise(() => {}); }, 60_000);\n',
  });
  const r = await runSuite(dir, { capMs: 12_000, env: { UNIFY_TEST_BUDGET_MS: "3000" } });
  expect(r.killed).toBe(false);
  expect(r.exit).toBe(3);
  expect(r.stderr).toContain("3000 ms budget");
  expect(r.ms).toBeLessThan(15_000);
}, 30_000);

test("the watchdog is invisible to a healthy run: it neither fires nor lengthens it", async () => {
  // The watchdog must not print on, or delay, a green run. (The unref() is
  // defensive: bun 1.3.11's runner exits without waiting on pending timers, so
  // no test here can currently distinguish its presence from its absence.)
  const dir = project({
    "src/core/urls.js": "export const ok = 1;\n",
    "tests/a.test.js": importer("../src/core/urls.js"),
  });
  const r = await runSuite(dir, { capMs: 15_000, env: { UNIFY_TEST_BUDGET_MS: "8000" } });
  expect(r.killed).toBe(false);
  expect(r.exit).toBe(0);
  expect(r.stderr).not.toContain("budget");
  expect(r.ms).toBeLessThan(8000);
}, 30_000);

test("a malformed budget falls back to the default rather than firing instantly", async () => {
  // Number("") is 0 and Number("later") is NaN; setTimeout treats both as
  // "now", so the naive read of the environment turns a typo into a suite that
  // dies at startup on every machine that has the variable set.
  const dir = project({
    "src/core/urls.js": "export const ok = 1;\n",
    "tests/a.test.js": importer("../src/core/urls.js"),
  });
  const r = await runSuite(dir, { env: { UNIFY_TEST_BUDGET_MS: "" } });
  expect(r.killed).toBe(false);
  expect(r.exit).toBe(0);
  expect(r.stderr).not.toContain("budget");
}, 30_000);

test("this very run is guarded: both preloads executed, and the parse gate saw the real tree", () => {
  // The subject of every test above is a scratch project that carries copies of
  // the guard files, which proves the guards work but says nothing about
  // whether THIS suite is wired to them. A deleted `preload` line in
  // bunfig.toml would leave all of them green and the real run unguarded, so
  // the wiring is asserted from inside the run it protects.
  expect(globalThis.__unifyTestWatchdog?.budgetMs).toBeGreaterThan(0);
  const checked = globalThis.__unifyTestPreflight?.checked ?? [];
  // Named files, not a count: the closure and the sweep each have a mutation
  // that leaves the other's files in place, and a count cannot tell them apart.
  expect(checked).toContain("src/core/urls.js"); // the sweep of src/**
  expect(checked).toContain("tests/conformance/support.mjs"); // the sweep of tests/**
  expect(checked).toContain("tests/fixtures/landmines/runtime-cases.mjs"); // re-entered by the import closure
  // Site content under tests/fixtures is shipped byte-for-byte and may be
  // malformed on purpose; only a fixture some test imports is a module.
  expect(checked).not.toContain("tests/fixtures/kitchen-sink/src/assets/unify-polyfill.js");
  // The dependency gate saw the real package.json: named packages, not a
  // count, so a renamed field or an emptied read fails here instead of
  // leaving the guard running over nothing.
  const deps = globalThis.__unifyTestPreflight?.depsChecked ?? [];
  expect(deps).toContain("js-yaml");
  expect(deps).toContain("markdown-it");
});
