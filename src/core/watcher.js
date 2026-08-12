/**
 * watcher.js — the watch contract (conformance-spec §16, rules WCH-01..04),
 * independent of the CLI wiring (src/cli/commands/watch.js) and the dev
 * server (src/core/dev-server.js) that both sit on top of it.
 *
 * Three independent pieces:
 *
 *   - `createCoalescer` (WCH-01): a generic async-task runner. `trigger()`
 *     starts `task` immediately when it is idle; any `trigger()` call that
 *     lands while `task` is already running is coalesced into exactly one
 *     follow-up run once the current one finishes — never zero, never more
 *     than one, no matter how many triggers land during the run. Pure and
 *     filesystem-free, so it is testable with a controllable fake task and
 *     no timers at all.
 *
 *   - `watchSource` (WCH-01's other half, and WCH-03's "no storm of
 *     rebuilds"): wraps `fs.watch(root, {recursive: true})`, debounces the
 *     raw event stream (one editor save is often several fs events — a
 *     temp-file write plus a rename), and ignores the never-shipped list
 *     (paths.js's own `isNeverShipped` — the same list the build itself
 *     never scans) plus any caller-supplied directories. The caller-supplied
 *     ignore list matters for one concrete failure mode this module exists
 *     to prevent: `-s . -o dist` nests the output directory inside the
 *     watched tree, and every rebuild writes into it — without excluding it,
 *     the watcher would react to the build's own writes and rebuild forever.
 *
 *   - The WCH-04 error-page helpers: `computeErrorPageTargets` maps a failed
 *     rebuild's problem diagnostics to the output page(s) they implicate,
 *     `renderErrorPage` formats those diagnostics into a small static HTML
 *     document, and `writeErrorPages` lands it with the same minimal/atomic
 *     discipline as a real publish (WCH-03) by reusing publish.js's own
 *     `applyPublishPlan` rather than reimplementing it.
 */
import { watch as fsWatch } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import * as collisions from "./collisions.js";
import { Reporter } from "./diagnostics.js";
import { contains, isNeverShipped, toRelative } from "./paths.js";
import { applyPublishPlan, snapshotDirectory } from "./publish.js";

// ============================================================== WCH-01 core

/**
 * @param {() => Promise<void>} task
 * @returns {{trigger(): void, isRunning: boolean, whenIdle(): Promise<void>}}
 */
export function createCoalescer(task) {
  let running = false;
  let pending = false;
  /** @type {(() => void)[]} */
  let idleWaiters = [];

  async function loop() {
    running = true;
    do {
      pending = false;
      await task();
    } while (pending);
    running = false;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const notify of waiters) notify();
  }

  return {
    /** Run `task` now, or — if it is already running — queue exactly one follow-up run. */
    trigger() {
      if (running) {
        pending = true;
        return;
      }
      loop();
    },
    get isRunning() {
      return running;
    },
    /** Resolves the next time no run (including any coalesced follow-up) is in flight. */
    whenIdle() {
      if (!running) return Promise.resolve();
      return new Promise((res) => idleWaiters.push(res));
    },
  };
}

// ================================================== fs watching + debounce

/**
 * @param {string} root - directory to watch recursively
 * @param {object} opts
 * @param {string[]} [opts.ignoreDirs] - absolute paths; a change under any of these is dropped
 * @param {() => void} opts.onChange - called (debounced) for a change outside the ignore set
 * @param {number} [opts.debounceMs]
 * @returns {{close(): void}}
 */
export function watchSource(root, { ignoreDirs = [], onChange, debounceMs = 40 }) {
  const absRoot = resolve(root);
  const absIgnores = ignoreDirs.map((d) => resolve(d));
  let timer = null;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, debounceMs);
  };

  const watcher = fsWatch(absRoot, { recursive: true }, (_event, filename) => {
    if (!filename) {
      schedule(); // the platform gave no detail; be conservative and rebuild
      return;
    }
    const relPosix = filename.split(sep).join("/");
    if (isNeverShipped(relPosix)) return;
    const abs = join(absRoot, filename);
    if (absIgnores.some((dir) => contains(dir, abs))) return;
    schedule();
  });

  return {
    close() {
      if (timer) clearTimeout(timer);
      timer = null;
      watcher.close();
    },
  };
}

/**
 * Ties `watchSource` to a `createCoalescer`-driven rebuild loop, plus clean
 * shutdown: `rebuild` fires once immediately (the initial build), then again
 * — debounced and coalesced — for every change. Resolves once `signal`
 * aborts AND the in-flight rebuild (including any already-coalesced
 * follow-up) has finished, so a caller can safely tear down anything else
 * (e.g. stop an HTTP server) right after this resolves, never mid-write.
 * @param {object} args
 * @param {string} args.sourceRoot
 * @param {string[]} [args.ignoreDirs]
 * @param {() => Promise<void>} args.rebuild
 * @param {AbortSignal} args.signal
 * @param {number} [args.debounceMs]
 * @returns {Promise<void>}
 */
export function runWatchLoop({ sourceRoot, ignoreDirs = [], rebuild, signal, debounceMs = 40 }) {
  const coalescer = createCoalescer(rebuild);
  const fsWatcher = watchSource(sourceRoot, { ignoreDirs, debounceMs, onChange: () => coalescer.trigger() });
  coalescer.trigger(); // the initial build

  return new Promise((res) => {
    const shutdown = async () => {
      fsWatcher.close();
      await coalescer.whenIdle();
      res();
    };
    if (signal.aborted) shutdown();
    else signal.addEventListener("abort", shutdown, { once: true });
  });
}

// ============================================================ WCH-04 errors

/**
 * Map a failed rebuild's problem diagnostics to the output page(s) they
 * implicate. `diagnostics.js`'s Reporter locates every diagnostic at a
 * SOURCE file, not an output path, and nothing in build.js's public surface
 * (deliberately not duplicated here — see the report) exposes a
 * page-depends-on-file graph: a layout shared by forty pages reports its own
 * P15 once, not forty times. This function does the best that is honestly
 * possible without one:
 *
 *   - A problem located at a real page file (an .html/.md path with no
 *     `_`-prefixed segment — the convention every default-excluded layout or
 *     include fragment follows) maps directly to that page's own output path
 *     (`collisions.computeOutputPath`, honoring --pretty-urls).
 *   - A problem that cannot be mapped this way (a layout, an include
 *     fragment, a CSS file, or anything with no file at all) might affect ANY
 *     page that depends on it — unknowable here — so every previously-known-
 *     good page is treated as affected too: the safe over-approximation
 *     (never hide a broken build behind stale-good-looking content).
 *
 * When the diagnostics are a mix of both kinds, the result is their union.
 * @param {object} args
 * @param {import('./diagnostics.js').Diagnostic[]} args.problems
 * @param {string} args.sourceRoot
 * @param {string} args.cwd
 * @param {boolean} args.prettyUrls
 * @param {Set<string>} args.lastGoodPages - output paths from the last fully
 *   successful rebuild (see `knownGoodPages`)
 * @returns {Set<string>}
 */
export function computeErrorPageTargets({ problems, sourceRoot, cwd, prettyUrls, lastGoodPages }) {
  const direct = new Set();
  let hasUnattributed = false;

  for (const d of problems) {
    const target = d.file && attributedOutputPath(d.file, { sourceRoot, cwd, prettyUrls });
    if (target) direct.add(target);
    else hasUnattributed = true;
  }

  if (!hasUnattributed) return direct;
  return new Set([...direct, ...lastGoodPages]);
}

/** @returns {string|null} */
function attributedOutputPath(diagnosticFile, { sourceRoot, cwd, prettyUrls }) {
  const root = resolve(sourceRoot);
  const abs = resolve(cwd, diagnosticFile);
  if (!contains(root, abs)) return null;
  const rel = toRelative(root, abs);
  const ext = extname(rel).toLowerCase();
  if (ext !== ".html" && ext !== ".md") return null;
  if (rel.split("/").some((seg) => seg.startsWith("_"))) return null; // layout/include-shaped, not a standalone page
  return collisions.computeOutputPath({ path: rel, kind: "page" }, { prettyUrls });
}

/**
 * @param {import('./diagnostics.js').Diagnostic[]} problems
 * @returns {string}
 */
export function renderErrorPage(problems) {
  const items = problems.map((d) => `<pre>${escapeHtml(Reporter.format(d))}</pre>`).join("\n    ");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Build error — unify watch</title>
  </head>
  <body id="unify-watch-error-page">
    <h1>Build error</h1>
    <p>unify could not build this page. This placeholder is written only while watching — never by <code>unify build</code> — and is replaced automatically by the next successful rebuild.</p>
    ${items}
  </body>
</html>
`;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Land `html` at every path in `targets`, minimally (WCH-03: a file whose
 * content already matches is left untouched — no spurious event for an
 * external watcher) and atomically (temp-then-rename, via publish.js's own
 * `applyPublishPlan` — "publish.js already implements the sync algorithm,
 * use it, do not reimplement").
 * @param {object} args
 * @param {string} args.outputDir
 * @param {Set<string>} args.targets
 * @param {string} args.html
 * @returns {Promise<string[]>} the paths actually written (empty when every target already matched)
 */
export async function writeErrorPages({ outputDir, targets, html }) {
  const wanted = Buffer.from(html, "utf8");
  const write = [];
  const tempFiles = new Map();
  for (const rel of targets) {
    let current = null;
    try {
      current = await readFile(join(outputDir, rel));
    } catch {
      /* not present yet — a write */
    }
    if (current && current.equals(wanted)) continue;
    tempFiles.set(rel, html);
    write.push(rel);
  }
  if (write.length === 0) return [];
  await mkdir(outputDir, { recursive: true });
  await applyPublishPlan({ outputDir, tempFiles, plan: { write, delete: [] } });
  return write;
}

/**
 * Snapshot the output directory's current HTML page paths — the "last known
 * good" set `computeErrorPageTargets`'s fallback uses. Intended to be called
 * only right after a fully successful rebuild, so it never itself observes
 * an error page.
 * @param {string} outputDir
 * @returns {Promise<Set<string>>}
 */
export async function knownGoodPages(outputDir) {
  const snap = await snapshotDirectory(outputDir);
  return new Set([...snap.keys()].filter((p) => p.endsWith(".html")));
}
