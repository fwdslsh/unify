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
 */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { UsageError } from "./diagnostics.js";
import { contains } from "./paths.js";

/** Namespaced so a real site path can never collide with it. */
export const RELOAD_PATH = "/__unify_reload__";

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
 * @returns {Promise<Response>}
 */
async function handleRequest(req, outputDir, clients) {
  const url = new URL(req.url);
  if (url.pathname === RELOAD_PATH) return sseResponse(clients);

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
 * @returns {{url: string, port: number, notifyReload(): void, stop(): void}}
 * @throws {UsageError} when the port is already in use (§14.1, exit 2)
 */
export function createDevServer({ outputDir, port }) {
  /** @type {Set<() => void>} */
  const clients = new Set();
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
      fetch: (req) => handleRequest(req, outputDir, clients),
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
    stop() {
      server.stop(true);
    },
  };
}
