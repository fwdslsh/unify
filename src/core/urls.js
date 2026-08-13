/**
 * urls.js — conformance-spec §11 (URLs): provenance rewriting (§11.1),
 * `--pretty-urls` (§11.2), and `--base-url` (§11.3).
 *
 * Pure, text-in/text-out, splice-model functions (§3), consistent with the
 * rest of `src/core`: every rewrite is computed as a list of
 * `{start, end, replacement}` edits scoped to attribute VALUES only (never
 * the surrounding quotes or tag) and applied with `html.js`'s `applyEdits`.
 * Nothing here touches the filesystem.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE (read before wiring this module in)
 * ---------------------------------------------------------------------------
 * §11.1 is defined per §1's "provenance": *the source file whose text
 * contained an element's start tag*. `resolveProvenanceUrls` therefore needs,
 * for every element in the already-composed document, an answer to "which
 * file (page, layout, or include) wrote this element" — NOT just the page's
 * and layout's own filenames.
 *
 * This module does not attempt to compute that mapping itself (that would
 * mean re-deriving `includes.js`/`compose.js`'s own splice decisions a
 * second time, in a different file, with every attendant drift risk) and
 * does not read the filesystem. Instead `rewriteProvenanceUrls` takes a
 * `provenanceOf(offset) => sourceFile` callback as an explicit, required
 * parameter — the caller supplies the mapping however it can. `spansToLocator`
 * below builds one cheaply from a sorted span list.
 *
 * `includes.js`'s `inlineIncludes` and `compose.js`'s `compose` now return
 * `{text, spans}` (spans: a sorted, contiguous `{start,end,file,fileOffset}[]`
 * covering the whole text — see either module's own doc comment for the
 * exact contract), so the caller (`src/cli/commands/build.js`) has a REAL
 * mapping to hand in via `spansToLocator(spans, pageFile)` — not the
 * same-file approximation `() => pageFile` an earlier version of this
 * comment described as the only thing available. That approximation is
 * gone; every element inherited from a layout or an include is now
 * attributed correctly, not just page-authored ones.
 *
 * `applyPrettyLinks` and `applyBaseUrl` (§11.2/§11.3) do NOT need provenance
 * — they operate on already-§11.1-rewritten (mostly root-relative) URLs and
 * the site's own output-path manifest, so they are unaffected by any of the
 * above.
 */
import { posix } from "node:path";
import { applyEdits, findAll, getAttr, getAttrNode, parse, tokens } from "./html.js";

// --------------------------------------------------------------- URL basics

/** A URL with a scheme (`http:`, `mailto:`, `tel:`, `data:`, `javascript:`, …). */
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * True for every URL §11.1/§11.2 skip entirely: a scheme, a `//`-prefixed
 * (protocol-relative) URL, a fragment-only URL, or an empty value. This is
 * also exactly head-merge.js's `resolveForCompare` skip set (both need "is
 * this a same-site path at all", just for different purposes), and §12's
 * "external/mailto/tel/data/fragment-only URLs are skipped".
 * @param {string} url
 * @returns {boolean}
 */
export function isSkippedUrl(url) {
  return url === "" || url.startsWith("#") || url.startsWith("//") || SCHEME_RE.test(url);
}

/**
 * Split a URL into its path, query (including `?`), and fragment (including
 * `#`) parts. None of §11's rules ever inspect query/fragment content — they
 * only need to survive resolution untouched (§11.2: "query and fragment
 * always survive transformation").
 * @param {string} url
 * @returns {{path: string, query: string, fragment: string}}
 */
export function splitUrl(url) {
  const m = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(url);
  return { path: m[1], query: m[2] ?? "", fragment: m[3] ?? "" };
}

/**
 * The canonical §11.1 path-resolution formula: given a URL as written and
 * the source-root-relative path of the file whose text contains it, return
 * the normalized, root-relative, query/fragment-stripped path it names — or
 * `null` when the URL is out of scope (skipped, or has no path part at all,
 * e.g. `"?x=1"` alone).
 *
 * This is byte-for-byte the same algorithm as head-merge.js's local
 * `resolveForCompare` (§8 row 6 needs it to decide stylesheet/script
 * identity before §11 has run). It is exported here as the single source of
 * truth so that duplicate can be retired in favor of importing this function
 * — see the report's note on this. Query/fragment are deliberately dropped:
 * this is an IDENTITY resolution ("is this the same file"), used both for
 * head-merge dedup and as the path-only half of `rewriteProvenanceUrls`
 * below (which reattaches query/fragment itself for the actual rewrite).
 *
 * @param {string|null|undefined} url
 * @param {string} provenanceFile - source-root-relative path of the file
 *   whose text contained `url`
 * @returns {string|null} a root-relative, normalized path (e.g. "/a/b.png"),
 *   or null when not resolvable/comparable
 */
export function resolveProvenanceUrl(url, provenanceFile) {
  if (!url) return null;
  if (isSkippedUrl(url)) return null;
  const [pathPart] = url.split(/[?#]/);
  if (pathPart === "") return null;
  if (pathPart.startsWith("/")) return posix.normalize(pathPart);
  const dir = posix.dirname("/" + provenanceFile);
  return posix.normalize(posix.join(dir, pathPart));
}

/**
 * Build a `provenanceOf` lookup (see the module-level PROVENANCE note) from
 * a sorted, non-overlapping list of spans (`includes.js`/`compose.js`'s
 * `{start, end, file, fileOffset}` shape — only `start`/`end`/`file` matter
 * here) that together cover every offset of interest in a composed
 * document. Spans do not need to cover the *whole* document — only offsets a
 * caller actually queries — but any gap queried falls back to `fallbackFile`.
 * @param {{start:number, end:number, file:string}[]} spans
 * @param {string} fallbackFile
 * @returns {(offset:number) => string}
 */
export function spansToLocator(spans, fallbackFile) {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  return (offset) => {
    // Linear scan is fine here: documents are small (product-spec's own
    // non-goals rule out perf gates) and this runs once per URL occurrence.
    for (const span of sorted) {
      if (offset >= span.start && offset < span.end) return span.file;
    }
    return fallbackFile;
  };
}

// ---------------------------------------------------------- §11.1 rewriting

const SINGLE_URL_ATTRS = ["href", "src", "poster"];

/**
 * Rewrite every `href`/`src`/`srcset`/`poster` URL in `composedHtml`
 * (already include-inlined and layout-composed) per §11.1's per-URL
 * branching. `url()` in `<style>`/`style=` is deliberately never reached
 * (URL-03) — mirror copy keeps stylesheet-internal references working
 * untouched.
 *
 * @param {string} composedHtml
 * @param {object} args
 * @param {(offset: number) => string} args.provenanceOf - see the
 *   module-level PROVENANCE GAP note; called once per URL-bearing attribute
 *   with that attribute's owning element's start offset
 * @param {string} args.pageFile - the composed page's own source-root-relative
 *   path (the .md path for a Markdown page — see §1: provenance is a SOURCE
 *   file, and markdown.js's conversion is part of "loading" the page, not a
 *   second provenance owner)
 * @param {boolean} args.pageMoved - true when `--pretty-urls` relocates this
 *   page's own output (§11.2/`pageWillMove`) — decides whether "the page
 *   itself" branch resolves or is left exactly as written
 * @returns {string}
 */
export function rewriteProvenanceUrls(composedHtml, { provenanceOf, pageFile, pageMoved = false }) {
  const { root } = parse(composedHtml);
  const edits = [];

  const rewriteOne = (url, elementStart) => {
    if (isSkippedUrl(url) || url.startsWith("/")) return null; // unchanged either way (URL-02/URL-04)
    const file = provenanceOf(elementStart);
    if (file === pageFile && !pageMoved) return null; // URL-06: left exactly as written
    const resolvedPath = resolveProvenanceUrl(url, file);
    if (resolvedPath === null) return null; // out of scope after all (defensive; isSkippedUrl already caught this)
    const { query, fragment } = splitUrl(url);
    return resolvedPath + query + fragment;
  };

  for (const el of findAll(root, (n) => n.type === "element")) {
    for (const attrName of SINGLE_URL_ATTRS) {
      const attr = getAttrNode(el, attrName);
      if (!attr || !attr.value) continue;
      const next = rewriteOne(attr.value, el.start);
      if (next !== null) edits.push({ start: attr.valueStart, end: attr.valueEnd, replacement: next });
    }
    const srcset = getAttrNode(el, "srcset");
    if (srcset && srcset.value) {
      const rewritten = rewriteSrcsetValue(srcset.value, (u) => rewriteOne(u, el.start));
      if (rewritten !== srcset.value) edits.push({ start: srcset.valueStart, end: srcset.valueEnd, replacement: rewritten });
    }
  }
  return applyEdits(composedHtml, edits);
}

/**
 * Rewrite each URL candidate in a `srcset` value, leaving descriptors
 * (`1x`, `2x`, `100w`, …), commas, and all original whitespace untouched —
 * only the URL token itself is replaced (URL-01: "each URL, descriptors
 * untouched"). `rewriteOne(url) => string|null` returns the replacement, or
 * null to leave that candidate exactly as written.
 * @param {string} value
 * @param {(url: string) => string|null} rewriteOne
 * @returns {string}
 */
export function rewriteSrcsetValue(value, rewriteOne) {
  const CANDIDATE_RE = /(^|,)(\s*)([^\s,]+)/g;
  let out = "";
  let cursor = 0;
  for (const m of value.matchAll(CANDIDATE_RE)) {
    const urlStart = m.index + m[1].length + m[2].length;
    const urlEnd = urlStart + m[3].length;
    const next = rewriteOne(m[3]);
    out += value.slice(cursor, urlStart) + (next ?? m[3]);
    cursor = urlEnd;
  }
  return out + value.slice(cursor);
}

// -------------------------------------------------------------- §11.2 files

/**
 * §11.2 file rule: where a page's HTML output lands under `--pretty-urls`.
 * Unchanged for any output already named `index.html` (any depth) and for
 * the root `404.html` specifically (only the root one — hosts require that
 * exact path; a nested `blog/404.html` is an ordinary page and moves like
 * any other). Otherwise `X.html` -> `X/index.html`.
 * @param {string} htmlOutputPath - source-root-relative, posix, already
 *   mapped from `.md` to `.html` if applicable
 * @returns {string}
 */
export function prettyOutputPath(htmlOutputPath) {
  if (posix.basename(htmlOutputPath) === "index.html") return htmlOutputPath;
  if (htmlOutputPath === "404.html") return htmlOutputPath;
  return `${htmlOutputPath.slice(0, -".html".length)}/index.html`;
}

/** True when `--pretty-urls` actually relocates this page's own output. */
export function pageWillMove(htmlOutputPath, prettyUrls) {
  return Boolean(prettyUrls) && prettyOutputPath(htmlOutputPath) !== htmlOutputPath;
}

/**
 * The public-facing pretty URL a *link* to `htmlOutputPath` should use
 * (distinct from `prettyOutputPath`, which is where the FILE lands: an
 * already-pretty `sub/index.html` doesn't move, but a link to it still
 * becomes the directory form `/sub/`, per the §11.2 table's `sub/index.html
 * -> /sub/` row). The root `404.html` is the one output that is neither
 * moved nor ever expressed as a directory URL.
 * @param {string} htmlOutputPath
 * @returns {string} root-relative, always ending in `/` (except `/404.html`)
 */
export function prettyLinkTarget(htmlOutputPath) {
  if (htmlOutputPath === "404.html") return "/404.html";
  const pretty = prettyOutputPath(htmlOutputPath); // always ends in "index.html" past this point
  return `/${pretty.slice(0, pretty.length - "index.html".length)}`;
}

/**
 * §11.2 links: rewrite every internal `href`/`src`/`srcset`/`poster` URL in
 * `html` (already §11.1-rewritten) that resolves to an emitted page's plain
 * `.html` output to that page's pretty URL instead. "Resolve first (against
 * provenance), then transform" (§11.2) — for a URL §11.1 left relative
 * (only possible for page-self content on an unmoved page), resolution here
 * uses the CURRENT page's own directory, exactly like §11.1's layout/include
 * branch would.
 *
 * @param {string} html
 * @param {object} args
 * @param {string} args.pageOutputPath - this page's own (pre-move) `.html`
 *   output path — the resolution base for any URL still relative at this point
 * @param {Set<string>} args.emittedHtmlPaths - every emitted page's plain
 *   (pre-move) `.html` output path, e.g. {"about.html","menu/index.html",...}
 * @returns {string}
 */
export function applyPrettyLinks(html, { pageOutputPath, emittedHtmlPaths }) {
  const pageDir = posix.dirname(pageOutputPath);
  const { root } = parse(html);
  const edits = [];

  const rewriteOne = (url) => {
    if (isSkippedUrl(url)) return null;
    const { path, query, fragment } = splitUrl(url);
    if (path === "") return null;
    const resolved = path.startsWith("/")
      ? posix.normalize(path).slice(1)
      : posix.normalize(posix.join(pageDir, path));
    if (!emittedHtmlPaths.has(resolved)) return null; // URL-09: not a page — preserved untouched
    return prettyLinkTarget(resolved) + query + fragment;
  };

  for (const el of findAll(root, (n) => n.type === "element")) {
    for (const attrName of SINGLE_URL_ATTRS) {
      const attr = getAttrNode(el, attrName);
      if (!attr || !attr.value) continue;
      const next = rewriteOne(attr.value);
      if (next !== null) edits.push({ start: attr.valueStart, end: attr.valueEnd, replacement: next });
    }
    const srcset = getAttrNode(el, "srcset");
    if (srcset && srcset.value) {
      const rewritten = rewriteSrcsetValue(srcset.value, rewriteOne);
      if (rewritten !== srcset.value) edits.push({ start: srcset.valueStart, end: srcset.valueEnd, replacement: rewritten });
    }
  }
  return applyEdits(html, edits);
}

// ----------------------------------------------------------- §11.3 base-url

/**
 * @typedef {object} BaseUrlConfig
 * @property {string} pathPrefix - always starts and ends with "/"
 * @property {string} origin - scheme+authority (e.g. "https://example.com")
 */

/**
 * Parse a `--base-url` value — the site's whole address — into its origin and
 * path prefix. The path prefix goes on every root-relative URL in scope
 * (URL-10); the origin is additionally prepended to canonical/og/twitter
 * values (URL-11), which crawlers require to be absolute.
 *
 * One form only. A bare path parsed here until 2026-08-13: it prefixed links
 * correctly and left og:/twitter:/canonical root-relative, silently — see
 * cli.js's usage error for the ratification evidence that retired it.
 * `origin` is therefore never null, and callers no longer branch on it.
 * @param {string} raw - must carry a scheme; cli.js rejects anything else
 * @returns {BaseUrlConfig}
 */
export function parseBaseUrl(raw) {
  const u = new URL(raw);
  let path = u.pathname;
  if (!path.startsWith("/")) path = `/${path}`;
  if (!path.endsWith("/")) path += "/";
  return { origin: u.origin, pathPrefix: path };
}

function isOgOrTwitterMeta(el) {
  const property = getAttr(el, "property");
  if (property && /^og:/i.test(property)) return true;
  const name = getAttr(el, "name");
  return Boolean(name && /^twitter:/i.test(name));
}

function isCanonicalLink(el) {
  return tokens(getAttr(el, "rel"))
    .map((t) => t.toLowerCase())
    .includes("canonical");
}

/**
 * Apply the path prefix (and, when `includeOrigin`, the origin) to one
 * already-root-relative value. Query/fragment are preserved untouched.
 * @param {string} value - must start with "/"
 * @param {BaseUrlConfig} base
 * @param {boolean} includeOrigin
 * @returns {string}
 */
function prefixRootRelative(value, base, includeOrigin) {
  const { path, query, fragment } = splitUrl(value);
  let out = base.pathPrefix + path.slice(1);
  if (includeOrigin && base.origin) out = base.origin + out;
  return out + query + fragment;
}

/**
 * §11.3: apply `--base-url` to `html` (already §11.1/§11.2-rewritten).
 * Scope (URL-10, one list for both forms): every root-relative URL in
 * `href`/`src`/`srcset`/`poster` of any element, plus root-relative
 * `content` of `<meta property="og:*">` / `<meta name="twitter:*">`. A full
 * URL form (`base.origin` set) additionally prepends the origin to
 * `<link rel="canonical">` `href` and to in-scope og/twitter `content`
 * (URL-11) — the elements crawlers require to be absolute — and nothing
 * else. Values that are not root-relative are untouched (URL-12).
 * @param {string} html
 * @param {BaseUrlConfig} base
 * @returns {string}
 */
export function applyBaseUrl(html, base) {
  const { root } = parse(html);
  const edits = [];

  for (const el of findAll(root, (n) => n.type === "element")) {
    const originEligible = isCanonicalLink(el);
    for (const attrName of SINGLE_URL_ATTRS) {
      const attr = getAttrNode(el, attrName);
      if (!attr || !attr.value || !attr.value.startsWith("/")) continue;
      const next = prefixRootRelative(attr.value, base, originEligible);
      if (next !== attr.value) edits.push({ start: attr.valueStart, end: attr.valueEnd, replacement: next });
    }
    const srcset = getAttrNode(el, "srcset");
    if (srcset && srcset.value) {
      const rewritten = rewriteSrcsetValue(srcset.value, (u) => (u.startsWith("/") ? prefixRootRelative(u, base, false) : null));
      if (rewritten !== srcset.value) edits.push({ start: srcset.valueStart, end: srcset.valueEnd, replacement: rewritten });
    }
    if (isOgOrTwitterMeta(el)) {
      const content = getAttrNode(el, "content");
      if (content && content.value && content.value.startsWith("/")) {
        const next = prefixRootRelative(content.value, base, true);
        if (next !== content.value) edits.push({ start: content.valueStart, end: content.valueEnd, replacement: next });
      }
    }
  }
  return applyEdits(html, edits);
}

// -------------------------------------------------------------- orchestrator

/**
 * Convenience wrapper applying §11.1 -> §11.2 -> §11.3 in the mandated order
 * (PIP-01). Each step is also exported individually above; a caller that
 * only needs one piece (e.g. collisions.js only ever needs `prettyOutputPath`)
 * should call that piece directly rather than this wrapper.
 *
 * @param {string} composedHtml
 * @param {object} args
 * @param {(offset:number) => string} args.provenanceOf - see PROVENANCE GAP
 * @param {string} args.pageFile
 * @param {string} args.pageOutputPath
 * @param {boolean} [args.prettyUrls]
 * @param {Set<string>} [args.emittedHtmlPaths] - required when prettyUrls is true
 * @param {BaseUrlConfig|null} [args.base]
 * @returns {string}
 */
export function rewriteUrls(composedHtml, { provenanceOf, pageFile, pageOutputPath, prettyUrls = false, emittedHtmlPaths, base = null }) {
  let out = rewriteProvenanceUrls(composedHtml, {
    provenanceOf,
    pageFile,
    pageMoved: pageWillMove(pageOutputPath, prettyUrls),
  });
  if (prettyUrls) out = applyPrettyLinks(out, { pageOutputPath, emittedHtmlPaths });
  if (base) out = applyBaseUrl(out, base);
  return out;
}
