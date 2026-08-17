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
 * (`createDevServer` throws `UsageError` — §14.1's fatal environment fault,
 * exit 2) with no build attempted at all — consistent with every other exit-2
 * case in this CLI (checked up front, before real work starts).
 */
import { createDevServer } from "../../core/dev-server.js";
import { watch } from "./watch.js";

/**
 * @param {object} context
 * @returns {Promise<number>}
 */
export async function dev(context, opts = {}) {
  const { output, settings, reporter } = context;
  const devServer = createDevServer({ outputDir: output, port: settings.port });
  opts.onReady?.(devServer);

  reporter.summary(`serving ${devServer.url} (output: ${output})`);

  try {
    // Reuse the exact watch loop `unify watch` uses — dev adds nothing to
    // the build/rebuild contract, only a server layered on top of it. Every
    // rebuild (success or failure — WCH-04's error page is exactly the thing
    // a developer needs the reload to show) notifies connected reload clients.
    await watch(context, {
      ...opts,
      onRebuild(result) {
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
