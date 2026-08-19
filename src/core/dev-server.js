/**
 * dev-server.js — conformance-spec §16's second paragraph (WCH-05/06): the
 * static file server + reload stream `unify dev` layers on top of the watch
 * contract (watcher.js). Permanently minimal (product-spec §4): static
 * files, directory indexes, a 404 page, reload — no proxying, HTTPS,
 * middleware, or config, and no CLI flag here changes that.
 *
 * WCH-06 in one sentence: the reload script is bytes inserted into an HTTP
 * response after the file is read from `outputDir` — it never touches
 * `outputDir` itself, so it can never leak into what `unify build` (or a
 * plain `unify watch`, which imports none of this file) ships.
 *
 * `createDevServer` throws `UsageError` (exit 2, §14.1's fatal environment
 * fault) when the port is already bound, before anything else about `dev`
 * has started.
 *
 * ---
 *
 * §27.2 — THE ONE PATH THAT IS NOT A FILE, and why it needs no collision
 * check. `/_unify/` and everything beneath it belong to this server. The
 * reservation is enforced by a rule that already exists rather than a new one:
 * §4.2 excludes a source path with a leading underscore, and an emitted
 * `_`-prefixed page or `_`-prefixed directory segment is P14, which blocks the
 * publish. A site therefore *cannot* emit `dist/_unify/anything` — every path
 * under it carries such a segment — so nothing this report shadows below its
 * own path is a file the site was able to publish. That is the whole reason
 * the name has an underscore, and a reserved path that could shadow an
 * author's file would have been a new rule to learn instead of the underscore
 * convention read from the URL side.
 *
 * ONE output path is not held back, and §27.2 names it rather than repairing
 * it: §4.2 deliberately spares root-level `_`-prefixed NON-PAGE files (the
 * Netlify seam that ships `_headers` and `_redirects`), so a site built with
 * an exclude set that spares them can emit a file named exactly `dist/_unify`.
 * The redirect below answers `/_unify` regardless of what is on disk, so that
 * one file is unreachable through this server and served by every static host.
 *
 * The defect the missing check prevents is a check that cannot fire: an "is
 * there a real file at this path?" test here would read as a live safeguard,
 * would take its other branch only for a file named `_unify`, and would invite
 * a future reader to make the reservation configurable — while making who
 * answers depend on the output directory's contents, which is the second rule
 * the underscore convention exists to avoid. Do not add one. If
 * `dist/_unify/` ever exists, the fault is upstream in §4.2's guard, and the
 * repair belongs there.
 *
 * Exactly one path serves the report: `/_unify/`. `/_unify` redirects to it as
 * any directory would, and any other path beneath it is a 404 from this server
 * itself — the reservation is a promise about who answers, not an invitation
 * to guess sub-pages.
 */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { UsageError } from "./diagnostics.js";
import { renderPending } from "./dev-report.js";
import { contains } from "./paths.js";

/** Namespaced so a real site path can never collide with it. */
export const RELOAD_PATH = "/__unify_reload__";

/** §27.2 — the local audit view. The trailing slash is part of the path. */
export const REPORT_PATH = "/_unify/";

const RELOAD_SCRIPT =
  `<script>new EventSource(${JSON.stringify(RELOAD_PATH)}).onmessage=function(){location.reload();};</script>`;

/**
 * Insert the reload script into an HTML document: right before `</body>`
 * when present, otherwise appended at the end. Byte insertion, not
 * re-serialization — consistent with the rest of unify never reformatting
 * markup it did not itself compose.
 * @param {string} html
 * @returns {string}
 */
export function injectReloadScript(html) {
  const idx = html.lastIndexOf("</body>");
  if (idx === -1) return html + RELOAD_SCRIPT;
  return html.slice(0, idx) + RELOAD_SCRIPT + html.slice(idx);
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve a request pathname to a file inside `outputDir`, or `null` for a
 * 404. A path resolving to a directory (the root included) serves its
 * `index.html`; anything else must be an exact file (WCH-05: "directory
 * indexes"). Traversal-safe: the resolved path must stay inside `outputDir`
 * (the same containment discipline `paths.js` uses for the build's own
 * reads), so a request like `/../../etc/passwd` is never served.
 * @param {string} outputDir
 * @param {string} pathname - already-decoded request path, e.g. "/blog/"
 * @returns {string|null}
 */
export function resolveStaticFile(outputDir, pathname) {
  const root = resolve(outputDir);
  const cleaned = pathname.replace(/^\/+/, "");
  const direct = resolve(root, cleaned);
  if (!contains(root, direct)) return null;
  if (isFile(direct)) return direct;

  const indexCandidate = resolve(direct, "index.html");
  if (!contains(root, indexCandidate)) return null;
  return isFile(indexCandidate) ? indexCandidate : null;
}

/**
 * @param {string} outputDir
 * @returns {Response}
 */
function notFoundResponse(outputDir) {
  const notFoundPath = resolve(outputDir, "404.html");
  if (isFile(notFoundPath)) {
    const text = readFileSync(notFoundPath, "utf8");
    return new Response(injectReloadScript(text), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return new Response("404 not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

/** One open SSE connection's send function. */
function sseResponse(clients) {
  const encoder = new TextEncoder();
  let send;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));
      send = () => {
        try {
          controller.enqueue(encoder.encode("data: reload\n\n"));
        } catch {
          /* the client is gone; cancel() below removes it */
        }
      };
      clients.add(send);
    },
    cancel() {
      clients.delete(send);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}

/**
 * @param {Request} req
 * @param {string} outputDir
 * @param {Set<() => void>} clients
 * @param {() => string} report - the current §27 report, read at request time
 *   so a request always gets the latest FINISHED one (§27.4)
 * @returns {Promise<Response>}
 */
async function handleRequest(req, outputDir, clients, report) {
  const url = new URL(req.url);
  if (url.pathname === RELOAD_PATH) return sseResponse(clients);

  // §27.2, above. Answered before any filesystem lookup because the path is
  // this server's, not the site's — and `report()` is a value already in
  // memory, so the answer never waits on a rebuild (§27.4). The report carries
  // the reload script like every other HTML response this server sends, which
  // is what makes the same stream that refreshes a page refresh the report.
  if (url.pathname === REPORT_PATH) {
    return new Response(injectReloadScript(report()), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  // §27.2's directory redirect — "as any directory would" is the web's
  // convention, not a symmetry with the static half below, which does not
  // redirect at all: `resolveStaticFile` answers `/guides` and `/guides/`
  // alike with `guides/index.html`. §27.2 mandates the redirect here anyway,
  // because exactly one path serves the report. 302 rather than 301: a
  // permanent redirect for a development-only path would outlive the process
  // in the browser's cache.
  if (url.pathname === REPORT_PATH.slice(0, -1)) {
    return new Response(null, { status: 302, headers: { location: REPORT_PATH } });
  }
  // The same 404 every other missing path gets — this server has one 404
  // behaviour, and a reserved path is not a reason to invent a second one.
  if (url.pathname.startsWith(REPORT_PATH)) return notFoundResponse(outputDir);

  const filePath = resolveStaticFile(outputDir, decodeURIComponent(url.pathname));
  if (!filePath) return notFoundResponse(outputDir);

  if (filePath.endsWith(".html")) {
    const text = readFileSync(filePath, "utf8");
    return new Response(injectReloadScript(text), { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return new Response(Bun.file(filePath));
}

/**
 * @param {object} args
 * @param {string} args.outputDir
 * @param {number} args.port
 * @param {string} [args.report] - the §27 report served at `/_unify/`, replaced
 *   by `setReport` after every rebuild. §27.4 requires a request arriving
 *   before any build has completed to be *answered*, and requires that no
 *   half-assembled report is ever served, so this server holds one finished
 *   document from the moment it binds and swaps it whole. The default IS that
 *   first answer — kept here rather than at the call site so the guarantee is
 *   the server's own and cannot be lost by a caller that forgets it.
 * @returns {{url: string, port: number, notifyReload(): void, setReport(html: string): void, stop(): void}}
 * @throws {UsageError} when the port is already in use (§14.1, exit 2)
 */
export function createDevServer({ outputDir, port, report = renderPending() }) {
  /** @type {Set<() => void>} */
  const clients = new Set();
  let currentReport = report;
  let server;
  try {
    server = Bun.serve({
      port,
      // The literal loopback address, not the name "localhost": confirmed
      // empirically (see the report) that Bun resolves the HOSTNAME STRING
      // "localhost" to either ::1 or 127.0.0.1 independently on each
      // Bun.serve() call, so two separate `unify dev` processes on the same
      // port do not reliably conflict — the second can silently succeed by
      // landing on the other address family, which breaks the §14.1 "a port
      // already in use is a fatal environment error" contract. Binding the
      // literal address makes the conflict — and therefore this catch below
      // — deterministic. The URL a user types is unaffected: a browser
      // resolves "localhost" to 127.0.0.1 the same way, and `url` below
      // still reads that way.
      hostname: "127.0.0.1",
      fetch: (req) => handleRequest(req, outputDir, clients, () => currentReport),
    });
  } catch (err) {
    if (err && err.code === "EADDRINUSE") {
      throw new UsageError(`unify dev: port ${port} is already in use`, [
        "pass a different --port, or stop whatever else is using it",
      ]);
    }
    throw err;
  }

  return {
    url: `http://localhost:${server.port}`,
    port: server.port,
    /** Tell every open reload connection to refresh. Called after every rebuild, success or failure. */
    notifyReload() {
      for (const send of clients) send();
    },
    /**
     * §27.4 — the rebuild hands over a finished report. One assignment of one
     * complete string: a request either gets the previous build's report or
     * this one, never a document assembled halfway between them.
     * @param {string} html
     */
    setReport(html) {
      currentReport = html;
    },
    stop() {
      server.stop(true);
    },
  };
}
