/**
 * Shared scaffolding for the Phase 4 (watch/dev) unit tests
 * (tests/unit/core/watcher.test.js, tests/unit/core/dev-server.test.js,
 * tests/unit/cli/commands/{watch,dev}.test.js). Tier 3 — no conformance
 * authority (testing-strategy §2); this file is not itself a test.
 *
 * Real filesystem, real timers throughout (no mocking) — the task's own
 * discipline for verifying operational/timing behavior that a mock would
 * falsify, matching this suite's H1 hygiene rule in spirit even though
 * tests/unit/ is not gated by it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Reporter } from "../../../src/core/diagnostics.js";

/**
 * A per-test temp-directory factory with one-call cleanup, the same
 * `mkdtempSync(os.tmpdir())` convention `tests/conformance/harness.test.js`
 * and `tests/unit/core/publish.test.js` already use.
 */
export function createTempDirTracker() {
  const dirs = [];
  return {
    /** @param {string} prefix @returns {string} */
    tempDir(prefix) {
      const d = mkdtempSync(join(tmpdir(), `unify-${prefix}-`));
      dirs.push(d);
      return d;
    },
    cleanupAll() {
      for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    },
  };
}

/**
 * Write a small source tree in one call: `{"about.html": "...", "assets/x.css": "..."}`.
 * @param {string} root
 * @param {Record<string, string>} files
 */
export function writeSite(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

/** @param {number} ms @returns {Promise<void>} */
export function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * The `context` shape `build()`/`watch()`/`dev()` all take, with every
 * setting `src/cli.js`'s `resolveSettings` would have produced, and a
 * reporter that discards output by default (tests that need to inspect it
 * pass their own `reporter` override).
 * @param {string} sourceRoot
 * @param {string} output
 * @param {Record<string, any>} [overrides] - merged into `settings`
 * @returns {object}
 */
export function baseContext(sourceRoot, output, overrides = {}) {
  return {
    sourceRoot,
    output,
    settings: {
      output: "dist",
      clean: false,
      exclude: ["_*"],
      prettyUrls: false,
      baseUrl: undefined,
      dryRun: false,
      strict: false,
      port: 0, // ephemeral — only dev-server.js reads this, and 0 asks the OS for a free port
      ...overrides,
    },
    reporter: new Reporter({ stdout: { write() {} }, stderr: { write() {} } }),
    sourceDefaulted: false,
  };
}

/**
 * A small async queue for `watch()`/`dev()`'s `onRebuild` hook: `next()`
 * resolves with each rebuild's `{ok, problemCount}` result in order,
 * awaiting one if it hasn't landed yet — the coalescing/equivalence tests'
 * way of synchronizing on "the next rebuild finished" without arbitrary
 * sleeps. `.all` is every result ever recorded, for a final total-count
 * assertion after shutdown.
 */
export function rebuildTracker() {
  const all = [];
  let waiters = [];
  let buffered = [];
  return {
    onRebuild(result) {
      all.push(result);
      if (waiters.length) waiters.shift()(result);
      else buffered.push(result);
    },
    next() {
      if (buffered.length) return Promise.resolve(buffered.shift());
      return new Promise((res) => waiters.push(res));
    },
    get all() {
      return all;
    },
  };
}
