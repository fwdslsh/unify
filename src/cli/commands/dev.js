/**
 * `unify dev` — build + watch + static server + reload (conformance-spec
 * §16's second paragraph, rules WCH-05/06).
 *
 * Scope is fixed and permanent (product-spec §4): static files, directory
 * indexes, a 404 page, reload. No proxying, HTTPS, middleware, or config.
 * The reload script is injected only into responses this server sends and
 * never exists in the output directory (dev-server.js owns that; this file
 * never reads or writes HTML itself).
 *
 * The server binds BEFORE the watch loop starts, so a taken port fails fast
 * (`createDevServer` rejects with `UsageError` — §14.1's fatal environment
 * fault, exit 2) with no build attempted at all — consistent with every other
 * exit-2 case in this CLI (checked up front, before real work starts). The
 * `await` is load-bearing rather than incidental: `node:http` reports
 * `EADDRINUSE` on an event rather than by throwing (issue #49), so dropping it
 * would start a build against a port that never bound.
 *
 * §27 — THE LOCAL AUDIT VIEW is wired here and only here, because `unify dev`
 * is the only command that answers a URL (§27.5: `watch` has no server,
 * `build` writes files). Three facts about the wiring:
 *
 *   - **The report follows the rebuild, not the request** (§27.4). Every
 *     rebuild hands `build()` an `onEvaluation` sink; the sink renders one
 *     complete document and swaps it into the server, and the reload stream
 *     that refreshes a page refreshes it too. Nothing is rendered on the
 *     request path, so a browser never waits on a rebuild.
 *   - **The server starts holding a real document** — §27.4's "a request that
 *     arrives before any build has completed is answered". `createDevServer`
 *     owns that first answer, so it exists from the moment the port binds and
 *     no ordering here can lose it.
 *   - **The sink rides on `settings`** because `settings` is the one value
 *     `watch()` forwards to every rebuild it runs. `dev` adds nothing to the
 *     build/rebuild contract and must not: the report describes the same build
 *     `unify build` would have run, which is what makes §27.5's "not a second
 *     audit" checkable by diffing this view against `unify audit`.
 */
import { createDevServer } from "../../core/dev-server.js";
import { renderInterrupted, renderReport } from "../../core/dev-report.js";
import { watch } from "./watch.js";

/**
 * @param {object} context
 * @returns {Promise<number>}
 */
export async function dev(context, opts = {}) {
  const { output, settings, reporter } = context;
  const devServer = await createDevServer({ outputDir: output, port: settings.port });
  opts.onReady?.(devServer);

  reporter.summary(`serving ${devServer.url} (output: ${output})`);

  // A rebuild that reached the end of `build()` reported; one that threw did
  // not (watcher.js catches it). Counting reports is the exact test, because
  // the sink below is the last thing `build()` does.
  let reports = 0;
  try {
    // Reuse the exact watch loop `unify watch` uses — dev adds nothing to
    // the build/rebuild contract, only a server layered on top of it. Every
    // rebuild (success or failure — WCH-04's error page is exactly the thing
    // a developer needs the reload to show) notifies connected reload clients.
    await watch({
      ...context,
      // §27.3 — the report's ONE source: the §20 manifest of the build that
      // just ran and §24's findings over it, handed over by `build()` itself.
      // Rendering is a pure function of that payload (`dev-report.js` opens no
      // file and parses no markup), so the view cannot re-read the site and
      // cannot disagree with `unify audit` (product-spec §6.2).
      settings: {
        ...settings,
        onEvaluation(evaluation) {
          reports++;
          devServer.setReport(renderReport(evaluation));
        },
      },
    }, {
      ...opts,
      onRebuild(result) {
        // §27.4 — the report follows the rebuild, including the rebuild that
        // produced no report at all. Keeping the previous one would leave a
        // stale document looking current, which is the mistake §27.3 (4) is
        // written against.
        if (reports === 0) devServer.setReport(renderInterrupted());
        reports = 0;
        devServer.notifyReload();
        opts.onRebuild?.(result);
      },
    });
  } finally {
    // Always releases the port, even on an unexpected rejection (watch()
    // does not normally reject — its own rebuild loop already swallows
    // build() failures into WCH-04 error pages — but a real dev server
    // should never outlive a crashed watch loop and hold the port hostage).
    devServer.stop();
  }
  return 0;
}
