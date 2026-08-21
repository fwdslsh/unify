/**
 * `tmp-reaper.mjs` — remove the temp directories the suite creates.
 *
 * Nothing removed them for a long time, and nothing failed as a result: a
 * leftover directory breaks no assertion, so the only symptom was that the
 * suite got slower on every machine, forever. The backlog had reached 114,174
 * directories when it was finally measured.
 *
 * The cost is not disk. Bun's resolver walks the working directory's chain
 * looking for `node_modules`/`package.json`/`bunfig.toml` on every process
 * start, so each of the suite's ~780 CLI spawns paid to read that directory.
 * Measured on the machine where it was found: `cli.js --version` took 127ms
 * with the backlog present and 45ms once it was cleared, against a 41ms
 * clean-directory control. Roughly 64 seconds of a 171-second run, and rising.
 *
 * WHY A PRELOAD AND NOT `process.on("exit")`. That was the first attempt and it
 * silently did nothing: Bun's test runner does not run process exit handlers,
 * so the hook registered, the suite passed, and every directory stayed. A
 * preload registering `afterAll` does fire — once per process, after the last
 * file — which is verified by `tests/unit/tmp-reaper.test.js` rather than
 * assumed, because a cleanup that quietly stops working is exactly the failure
 * being fixed.
 *
 * WHY A REGISTRY AND NOT A PREFIX SWEEP. Reaping every `unify-*` directory in
 * `tmpdir()` would be simpler and would be wrong: the mutation sweep runs whole
 * suites in parallel copies against the same `/tmp`, so one run would delete
 * another run's directories out from under it. Trading a slow suite for a flaky
 * one is not a trade. Each process removes only what it created.
 *
 * `UNIFY_KEEP_TMP=1` keeps everything. A failing test's tree is often the
 * fastest way to see what happened, and a cleanup with no escape hatch just
 * teaches people to comment it out.
 */
import { afterAll } from "bun:test";
import { rmSync } from "node:fs";

/** @type {string[]} */
const registered = [];

/**
 * Record a temp directory for removal at the end of the run.
 * @param {string} dir
 * @returns {string} the same directory, so call sites can wrap `mkdtempSync`
 */
export function registerTmp(dir) {
  registered.push(dir);
  return dir;
}

/** Remove every registered directory. Best effort: a leak costs speed, a throw costs the run. */
export function reapRegistered() {
  if (process.env.UNIFY_KEEP_TMP === "1") return 0;
  let removed = 0;
  for (const dir of registered.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
      removed++;
    } catch { /* best effort */ }
  }
  return removed;
}

/** How many directories are waiting to be reaped (read by the test that pins this). */
export const pendingCount = () => registered.length;

afterAll(reapRegistered);
