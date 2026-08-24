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
 * `createDevServer` rejects with `UsageError` (exit 2, §14.1's fatal
 * environment fault) when the port is already bound, before anything else
 * about `dev` has started.
 *
 * ---
 *
 * THE SERVER IS `node:http`, UNDER BOTH RUNTIMES (issue #49). unify runs on
 * bun and on node, and this file is one of the two that used to be able to
 * tell: it called `Bun.serve` and handed `Bun.file` to `Response`. Both are
 * gone, and nothing branches on the runtime in their place — a `typeof Bun`
 * fork here would mean the dev server a contributor tests is not the dev
 * server a user runs, which is the whole class of bug the parity gate
 * (testing-strategy.md G12) exists to keep out. `node:http` is native on node
 * and Bun-implemented on bun, so one code path serves both.
 *
 * The two places where that swap could have changed observable behaviour, and
 * what holds them still:
 *
 *   - **`content-type`** was Bun's to decide when the body was a `Bun.file`.
 *     `CONTENT_TYPES` below is its answer table, transcribed, so a `.css` is
 *     still `text/css;charset=utf-8` rather than a download.
 *   - **binding is asynchronous** in `node:http` — `listen()` reports
 *     `EADDRINUSE` on an event, where `Bun.serve` threw. So `createDevServer`
 *     is `async` and its caller awaits it. The CONTRACT is unmoved: the port
 *     is bound (or the `UsageError` raised) before `dev` starts a build.
 *
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
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
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
 * What `Bun.file(path).type` answered for each extension under bun 1.3.11,
 * dumped once and transcribed here.
 *
 * This is a TRANSCRIPTION, not a design. The old code handed a `Bun.file` to
 * `Response` and let Bun label it; `node:http` has no such table, so matching
 * Bun's is what keeps the port a no-op. It is not cosmetic: a browser in
 * standards mode refuses a stylesheet served as `application/octet-stream`,
 * so getting this wrong would have broken every `unify dev` preview under
 * node while every test stayed green — no test reads a `content-type` for a
 * non-HTML asset, and none should have to.
 *
 * Two properties of Bun's lookup are preserved deliberately rather than
 * improved on. It is CASE-SENSITIVE (`photo.JPG` was `application/octet-stream`
 * before this change and still is), and an unlisted extension falls back to
 * `application/octet-stream`. Both are worth fixing; neither is fixable here,
 * because a port that also changes behaviour is a port nobody can review.
 * That is a separate commit, with a test, changing both runtimes at once.
 *
 * The one header deliberately NOT reproduced is Bun's `content-disposition:
 * filename="…"`, which it derived from the `Bun.file` blob's name. It has no
 * disposition-type, so it is malformed under RFC 6266 §4.1, it carried no
 * decision this server was making, and re-emitting it by hand would have
 * written a bug down as an intention.
 */
const CONTENT_TYPES = new Map();
for (const [type, exts] of Object.entries({
  "application/atom+xml": "atom",
  "application/epub+zip": "epub",
  "application/gzip": "gz",
  "application/json;charset=utf-8": "json map",
  "application/ld+json": "jsonld",
  "application/manifest+json": "webmanifest",
  "application/msword": "doc",
  "application/pdf": "pdf",
  "application/postscript": "ps eps ai",
  "application/rls-services+xml": "rs",
  "application/rss+xml": "rss",
  "application/toml": "toml",
  "application/ttml+xml": "ttml",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-fontobject": "eot",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/wasm": "wasm",
  "application/x-7z-compressed": "7z",
  "application/x-bzip2": "bz2",
  "application/x-httpd-php": "php",
  "application/x-mobipocket-ebook": "mobi",
  "application/x-perl": "pl",
  "application/x-rar-compressed": "rar",
  "application/x-sh": "sh",
  "application/x-sql": "sql",
  "application/x-subrip": "srt",
  "application/x-tar": "tar",
  "application/xhtml+xml": "xhtml",
  "application/xml": "xml",
  "application/zip": "zip",
  "audio/midi": "mid midi",
  "audio/mpeg": "mp3",
  "audio/ogg": "oga ogg opus",
  "audio/webm": "weba",
  "audio/x-aac": "aac",
  "audio/x-flac": "flac",
  "audio/x-m4a": "m4a",
  "audio/x-wav": "wav",
  "font/otf": "otf",
  "font/ttf": "ttf",
  "font/woff": "woff",
  "font/woff2": "woff2",
  "image/apng": "apng",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg jpeg jpe",
  "image/png": "png",
  "image/svg+xml": "svg svgz",
  "image/tiff": "tif tiff",
  "image/vnd.adobe.photoshop": "psd",
  "image/webp": "webp",
  "image/x-icon": "ico",
  "image/x-ms-bmp": "bmp",
  "model/gltf-binary": "glb",
  "model/gltf+json": "gltf",
  "model/mtl": "mtl",
  "model/obj": "obj",
  "model/stl": "stl",
  "text/cache-manifest": "manifest appcache",
  "text/calendar": "ics",
  "text/css;charset=utf-8": "css",
  "text/csv": "csv",
  "text/html;charset=utf-8": "html htm",
  "text/javascript;charset=utf-8": "js mjs cjs ts tsx jsx",
  "text/markdown": "md markdown",
  "text/plain;charset=utf-8": "txt text log ini conf",
  "text/rtf": "rtf",
  "text/tab-separated-values": "tsv",
  "text/vtt": "vtt",
  "text/x-c": "c h cpp",
  "text/x-java-source": "java",
  "text/x-vcard": "vcf",
  "text/yaml": "yaml yml",
  "video/3gpp": "3gp",
  "video/mp4": "mp4",
  "video/mpeg": "mpg mpeg",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
})) {
  for (const ext of exts.split(" ")) CONTENT_TYPES.set(`.${ext}`, type);
}

/** Bun's own fallback for an unknown extension, and for no extension at all. */
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * @param {string} filePath
 * @returns {string}
 */
function contentTypeFor(filePath) {
  return CONTENT_TYPES.get(extname(filePath)) ?? DEFAULT_CONTENT_TYPE;
}

/**
 * One complete string body, with the explicit `content-length` Bun set for a
 * string `Response` — without it `node:http` falls back to chunked encoding,
 * which is a different set of bytes on the wire for the same document.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} contentType
 * @param {string} body
 */
function respond(res, status, contentType, body) {
  const bytes = Buffer.from(body, "utf8");
  res.writeHead(status, { "content-type": contentType, "content-length": bytes.length });
  res.end(bytes);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} outputDir
 */
function sendNotFound(res, outputDir) {
  const notFoundPath = resolve(outputDir, "404.html");
  if (isFile(notFoundPath)) {
    const text = readFileSync(notFoundPath, "utf8");
    respond(res, 404, "text/html; charset=utf-8", injectReloadScript(text));
    return;
  }
  respond(res, 404, "text/plain; charset=utf-8", "404 not found\n");
}

/**
 * Hold one SSE connection open and register its send function.
 *
 * No `content-length`: this response never ends until the client leaves, so
 * chunked encoding is the point here rather than the accident it would be
 * above.
 * @param {import('node:http').ServerResponse} res
 * @param {Set<() => void>} clients
 */
function openReloadStream(res, clients) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  res.write(": connected\n\n");
  const send = () => {
    try {
      res.write("data: reload\n\n");
    } catch {
      /* the client is gone; the close handler below removes it */
    }
  };
  clients.add(send);
  const drop = () => clients.delete(send);
  res.on("close", drop);
  res.on("error", drop);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} outputDir
 * @param {Set<() => void>} clients
 * @param {() => string} report - the current §27 report, read at request time
 *   so a request always gets the latest FINISHED one (§27.4)
 */
function handleRequest(req, res, outputDir, clients, report) {
  // `req.url` is a path under `node:http` and was an absolute URL under
  // `Bun.serve`; a base makes both parse, and an absolute-form request line
  // (what a proxy sends) still wins over the base, as it did before.
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === RELOAD_PATH) return openReloadStream(res, clients);

  // §27.2, above. Answered before any filesystem lookup because the path is
  // this server's, not the site's — and `report()` is a value already in
  // memory, so the answer never waits on a rebuild (§27.4). The report carries
  // the reload script like every other HTML response this server sends, which
  // is what makes the same stream that refreshes a page refresh the report.
  if (url.pathname === REPORT_PATH) {
    return respond(res, 200, "text/html; charset=utf-8", injectReloadScript(report()));
  }
  // §27.2's directory redirect — "as any directory would" is the web's
  // convention, not a symmetry with the static half below, which does not
  // redirect at all: `resolveStaticFile` answers `/guides` and `/guides/`
  // alike with `guides/index.html`. §27.2 mandates the redirect here anyway,
  // because exactly one path serves the report. 302 rather than 301: a
  // permanent redirect for a development-only path would outlive the process
  // in the browser's cache.
  if (url.pathname === REPORT_PATH.slice(0, -1)) {
    res.writeHead(302, { location: REPORT_PATH, "content-length": 0 });
    return res.end();
  }
  // The same 404 every other missing path gets — this server has one 404
  // behaviour, and a reserved path is not a reason to invent a second one.
  if (url.pathname.startsWith(REPORT_PATH)) return sendNotFound(res, outputDir);

  const filePath = resolveStaticFile(outputDir, decodeURIComponent(url.pathname));
  if (!filePath) return sendNotFound(res, outputDir);

  if (filePath.endsWith(".html")) {
    const text = readFileSync(filePath, "utf8");
    return respond(res, 200, "text/html; charset=utf-8", injectReloadScript(text));
  }
  // Streamed, not buffered — `Bun.file` streamed too, and a site's largest
  // mirror-copied asset has no business being read whole into memory to be
  // previewed.
  res.writeHead(200, {
    "content-type": contentTypeFor(filePath),
    "content-length": statSync(filePath).size,
  });
  const body = createReadStream(filePath);
  body.on("error", () => res.destroy());
  res.on("error", () => body.destroy());
  body.pipe(res);
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
 * @returns {Promise<{url: string, port: number, notifyReload(): void, setReport(html: string): void, stop(): void}>}
 * @throws {UsageError} when the port is already in use (§14.1, exit 2)
 */
export async function createDevServer({ outputDir, port, report = renderPending() }) {
  /** @type {Set<() => void>} */
  const clients = new Set();
  let currentReport = report;

  const server = createServer((req, res) => {
    try {
      handleRequest(req, res, outputDir, clients, () => currentReport);
    } catch {
      // A throw on the request path (a malformed percent-escape reaching
      // `decodeURIComponent` is the realistic one) used to become Bun's own
      // 500 page. `node:http` would take the whole process down with it
      // instead, and a dev server that dies on a stray URL is worse than one
      // that says 500 — so the status is preserved and the body is plain.
      if (res.headersSent) res.destroy();
      else respond(res, 500, "text/plain; charset=utf-8", "500 internal server error\n");
    }
  });

  try {
    await new Promise((listening, failed) => {
      server.once("error", failed);
      // The literal loopback address, not the name "localhost": confirmed
      // empirically (see the report) that a runtime resolves the HOSTNAME
      // STRING "localhost" to either ::1 or 127.0.0.1 independently on each
      // bind, so two separate `unify dev` processes on the same port do not
      // reliably conflict — the second can silently succeed by landing on the
      // other address family, which breaks the §14.1 "a port already in use
      // is a fatal environment error" contract. Binding the literal address
      // makes the conflict — and therefore this catch below — deterministic.
      // The URL a user types is unaffected: a browser resolves "localhost" to
      // 127.0.0.1 the same way, and `url` below still reads that way.
      server.listen({ port, host: "127.0.0.1" }, () => {
        server.removeListener("error", failed);
        listening();
      });
    });
  } catch (err) {
    if (err && err.code === "EADDRINUSE") {
      throw new UsageError(`unify dev: port ${port} is already in use`, [
        "pass a different --port, or stop whatever else is using it",
      ]);
    }
    throw err;
  }

  // `port: 0` asks the OS to choose; this is what it chose.
  const boundPort = server.address().port;

  return {
    url: `http://localhost:${boundPort}`,
    port: boundPort,
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
      // `closeAllConnections()` is what `Bun.serve`'s `stop(true)` meant here:
      // an open reload stream never ends on its own, so `close()` alone would
      // wait on it forever and `unify dev` would hang on ctrl-c with a browser
      // tab still connected.
      server.closeAllConnections();
      server.close();
    },
  };
}
