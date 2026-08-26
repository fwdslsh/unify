/**
 * `unify watch` — the watch contract without a server (conformance-spec §16,
 * rules WCH-01..04).
 *
 * This file is thin orchestration: every rule's actual mechanism lives in
 * `src/core/watcher.js` (coalescing, fs watching, the WCH-04 error-page
 * helpers) and `src/cli/commands/build.js` (the real build — this file calls
 * it, never reimplements any part of it). What this file owns:
 *
 *   - a fresh `Reporter` for every rebuild, so one rebuild's diagnostics
 *     never leak into the next (build.js's own `Reporter` is a plain
 *     append-only list — reusing one across repeated builds would make
 *     fixed problems linger forever and would double-count exhaustive
 *     diagnostics);
 *   - forcing `--clean` off after the first rebuild (WCH-03: "--clean
 *     applies only at startup" — build.js has no opinion on repetition,
 *     `settings.clean` is simply an input it trusts);
 *   - tracking the last fully successful rebuild's page set, the input
 *     `computeErrorPageTargets` (WCH-04) needs;
 *   - turning a broken rebuild into written error pages, and clean shutdown
 *     on `SIGINT`/`SIGTERM` (or a caller-supplied `AbortSignal`, which is how
 *     `dev.js` and this module's own tests drive it deterministically).
 */
import { resolve } from "node:path";
import {
  computeErrorPageTargets, knownGoodPages, renderErrorPage, runWatchLoop, writeErrorPages,
} from "../../core/watcher.js";
import { Reporter } from "../../core/diagnostics.js";
import { build } from "./build.js";

/**
 * @param {object} context
 * @returns {Promise<number>}
 */
export async function watch(context, opts = {}) {
  const { sourceRoot, output, settings, reporter: topReporter, sourceDefaulted, command = "watch" } = context;
  const { signal, onRebuild, debounceMs, testDelayMs = 0 } = opts;

  const ownedController = signal ? null : new AbortController();
  const effectiveSignal = signal ?? ownedController.signal;
  if (ownedController) {
    const stop = () => ownedController.abort();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }

  let isFirst = true;
  /** @type {Set<string>} */
  let lastGoodPages = new Set();

  topReporter.summary(`watching ${sourceRoot} for changes (output: ${output})`);

  const rebuild = async () => {
    if (testDelayMs > 0) await sleep(testDelayMs);

    // Every rebuild is a full rebuild (WCH-02) through the exact same
    // build() this file must not duplicate; only two inputs ever change
    // across rebuilds: --clean (startup only) and the source-defaulted
    // stdout notice (also startup only — repeating it on every save would
    // just be noise about a fact that hasn't changed).
    const reporter = new Reporter({ strict: settings.strict, stdout: topReporter.stdout, stderr: topReporter.stderr });
    const runSettings = isFirst ? settings : { ...settings, clean: false };
    const runSourceDefaulted = isFirst && sourceDefaulted;

    try {
      await build({ sourceRoot, output, settings: runSettings, reporter, sourceDefaulted: runSourceDefaulted, command });
    } catch (err) {
      // An unexpected exception (as opposed to a normal diagnosed problem)
      // must still count as a failed rebuild below — recorded as a problem,
      // not just printed, so it is never mistaken for a clean build (which
      // would wrongly refresh `lastGoodPages` and skip WCH-04's error page).
      // Unattributable to one page by construction (`sourceRoot` is a
      // directory, not a page path), so `computeErrorPageTargets` correctly
      // falls back to marking every previously-good page.
      const message = `internal error during rebuild: ${err.stack ?? err.message}`;
      reporter.stderr.write(`unify watch: ${message}\n`);
      reporter.problem({ file: sourceRoot, message });
    }

    const problems = reporter.diagnostics.filter((d) => d.severity === "problem");
    if (problems.length === 0) {
      lastGoodPages = await knownGoodPages(output);
      topReporter.summary(problemSummary(0, reporter.advisoryCount));
    } else {
      topReporter.summary(problemSummary(problems.length, reporter.advisoryCount));
      // WCH-04: the one thing a broken rebuild in watch mode may write.
      // build() itself already left the previous output byte-untouched
      // (§15's transactional gate, unmodified — publish.js's own PUB-01
      // check refused to publish); this only OVERLAYS error pages on top of
      // that untouched tree, and only when the caller hasn't asked for
      // --dry-run (which promises to write nothing at all).
      if (!settings.dryRun) {
        const targets = computeErrorPageTargets({
          problems, sourceRoot: resolve(sourceRoot), cwd: process.cwd(), prettyUrls: Boolean(settings.prettyUrls), lastGoodPages,
        });
        await writeErrorPages({ outputDir: output, targets, html: renderErrorPage(problems) });
      }
    }

    isFirst = false;
    onRebuild?.({ ok: problems.length === 0, problemCount: problems.length });
  };

  await runWatchLoop({ sourceRoot, ignoreDirs: [resolve(output)], rebuild, signal: effectiveSignal, debounceMs });
  return 0;
}

function problemSummary(problemCount, advisoryCount) {
  if (problemCount > 0) return `rebuild failed: ${problemCount} problem${problemCount === 1 ? "" : "s"}`;
  if (advisoryCount > 0) return `rebuilt (${advisoryCount} advisor${advisoryCount === 1 ? "y" : "ies"})`;
  return "rebuilt";
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
