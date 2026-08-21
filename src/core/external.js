/**
 * external.js — conformance-spec §31.3, the network half of `unify audit --external`.
 *
 * The only unify operation that touches the network, and it exists as a flag
 * for exactly the reason product-spec §6.1 states: "unify builds are offline
 * and deterministic" has to stay true without qualification, so anything that
 * reaches the network is opt-in and never runs during `build`.
 *
 * Two halves, kept apart on purpose:
 *
 *   - `collectExternalReferences` is a PURE function over the §20 manifest
 *     and each page's already-emitted HTML text — no I/O of its own, easy to
 *     reason about and to test without a server. It answers "what would
 *     `--external` fetch", which is §31.3's closed scope.
 *   - `probeUrls` is the network layer: HEAD, GET on 405, bounded
 *     concurrency, a redirect cap, a timeout. It takes a plain list of
 *     strings, so it has no dependency on the manifest shape and points at a
 *     local test server exactly as it points at the real world.
 *
 * §31.3's scope is stated as "the closed set of off-origin references the
 * manifest already holds": `href` and `src` values §12 skipped for being on
 * another origin, the og:/twitter: image URLs, JSON-LD URL-valued properties
 * (§12's list), and a `<link rel="canonical">` naming another site. Read as a
 * PageRecord-only scope, that sentence contradicts its own first clause: §20.9
 * defines `linksOut` as internal links only ("External... URLs never
 * participate"), so no §20 field holds an ordinary off-origin `<a href>` at
 * all, and "href and src values §12 skipped for being on another origin"
 * would then name a set no PageRecord field carries. "The manifest" is read
 * here as this build's already-computed pipeline state, not literally §20's
 * PageRecord shape: the four items named are exactly §12's own reference
 * surface (`references.js`'s `collectHtmlReferences`, the one function that
 * already reads href/src/poster/srcset, og:/twitter: content, and a
 * `<link>`'s href of any rel — canonical included), COMPLEMENTED — kept
 * off-origin rather than checked internal — rather than re-derived a second
 * way. Reusing that one reader, rather than writing a second walk over the
 * same markup, is what keeps this module from becoming the "second
 * interpretation" product-spec §6.1 forbids: an off-origin URL and an
 * internal one can never disagree about where §12 found them, because both
 * answers come out of the same pass.
 *
 * JSON-LD is the one piece `collectHtmlReferences` cannot supply, and for a
 * reason internal to §12 itself rather than to this module: its JSON-LD
 * branch (`jsonLdReferences`) accepts ONLY root-relative values (§12's own
 * words: an absolute one "is skipped... its own decision, not a detail of
 * this repair"), so it structurally never yields an off-origin URL.
 * `jsonLdOffOriginUrls` below is the complementary half of that same closed
 * 5-property list (`url`, `logo`, `image`, `thumbnailUrl`, `contentUrl`),
 * walking `record.jsonLd` directly — already-parsed JSON on the manifest
 * record, so reading it here is not a second parse of the page, only a
 * second FILTER over data §20.8 already extracted.
 */
import { collectHtmlReferences, stripBaseUrl } from "./references.js";
import { decodeEntities } from "./entities.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const DEFAULT_CONCURRENCY = 8;

/**
 * §12's own closed list of URL-valued JSON-LD properties (references.js's
 * `URL_VALUED_JSONLD_PROPERTIES`), duplicated rather than imported: that name
 * is not exported, references.js is not this task's file to widen, and the
 * two lists answer different questions from the same vocabulary — §12 keeps
 * only the ROOT-RELATIVE values (checkable against the output tree), this
 * module keeps only the OFF-ORIGIN ones (checkable only over the network).
 * See references.js's own comment for why the list is closed, short, and
 * biased toward omission; that reasoning is not repeated here.
 */
const URL_VALUED_JSONLD_PROPERTIES = new Set(["url", "logo", "image", "thumbnailUrl", "contentUrl"]);

const ABSOLUTE_RE = /^([a-z][a-z0-9+.-]*:)?\/\//i;

/**
 * Is `value` off-origin once `--base-url`'s own prefix (when set) is
 * stripped? Reuses `stripBaseUrl` — the same parse §12 and §21.2's
 * `classifyCanonical` use to answer "is this URL on this site?" — so this
 * module cannot disagree with them about what counts as "elsewhere".
 * @param {string|null|undefined} value
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {boolean}
 */
function isOffOrigin(value, base) {
  if (typeof value !== "string" || value === "") return false;
  const stripped = base ? stripBaseUrl(value, base) : value;
  return ABSOLUTE_RE.test(stripped);
}

/**
 * A protocol-relative `//host/path` borrows the page's own scheme (§11.1);
 * `fetch` needs a real one. `scheme` already carries its trailing `:`
 * (`urls.js`'s `parseBaseUrl` stores `u.protocol`), so `https:` + `//h/p` is
 * `https://h/p`. Falls back to `https:` with no `--base-url` to read a page
 * scheme from — the ordinary case for an author testing locally.
 * @param {string} url
 * @param {string} scheme
 * @returns {string}
 */
function withScheme(url, scheme) {
  return url.startsWith("//") ? `${scheme}${url}` : url;
}

/**
 * Every off-origin string under one of §12's URL-valued JSON-LD properties,
 * at any depth, mirroring `references.js`'s `jsonLdReferences` walk exactly
 * (arrays inherit the naming property, `@context` is skipped whole because
 * its value is a term definition rather than data) but keeping the opposite
 * half of the value space: OFF-ORIGIN rather than root-relative.
 * @param {any} data - a parsed JSON-LD value (`entry.data`)
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {string[]}
 */
function jsonLdOffOriginUrls(data, base) {
  const out = [];
  const visit = (node, property) => {
    if (typeof node === "string") {
      if (property !== null && URL_VALUED_JSONLD_PROPERTIES.has(property) && isOffOrigin(node, base)) {
        out.push(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const v of node) visit(v, property);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k === "@context") continue; // a term definition, not data — see references.js
        visit(v, k);
      }
    }
  };
  visit(data, null);
  return out;
}

/**
 * §31.3 — the closed set of off-origin references the manifest holds, one
 * distinct URL to the FIRST page (manifest order — §20.1's own order) that
 * references it. "First" is what makes `external-unreachable`'s location
 * deterministic across runs of one tree, matching every other located finding
 * in this catalogue.
 *
 * Two sources, kept apart because only one of them can be read from a page's
 * EMITTED TEXT and the other structurally cannot:
 *   - Every href/src/poster/srcset, og:/twitter: URL-valued content, and
 *     `<link href>` of any rel (canonical included) — §12's own
 *     `collectHtmlReferences`, the SAME reader `checkReferences` scans each
 *     page with, kept here when off-origin instead of resolved internal. This
 *     is where an ordinary `<a href="https://elsewhere.example/">` is found:
 *     no §20 field holds one (§20.9 defines `linksOut` as internal-only), so
 *     the only place left to read it is the text itself — reusing §12's own
 *     walk rather than a second one keeps the two answers from ever
 *     disagreeing about what a page references.
 *   - `jsonLd`'s URL-valued properties, off-origin half. `collectHtmlReferences`
 *     cannot supply these: its own JSON-LD branch (`jsonLdReferences`) accepts
 *     ONLY root-relative values, by §12's own design, so it can never yield an
 *     off-origin URL. `jsonLdOffOriginUrls` below is the complementary filter
 *     over the same closed 5-property list, read from `record.jsonLd` — a
 *     manifest field, not a re-parse.
 * @param {import('./manifest.js').PageRecord[]} records
 * @param {Map<string, string>} htmlByOutputPath - output path -> the page's
 *   final emitted HTML text (the same text §12 checked and §20 was derived
 *   from); a record with no entry is skipped (defensive — every composed
 *   page's output path is a key in practice)
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {Map<string, import('./manifest.js').PageRecord>}
 */
export function collectExternalReferences(records, htmlByOutputPath, base) {
  const owner = new Map();
  const scheme = base ? base.scheme : "https:";
  // First in manifest order wins (`!owner.has`) — records are visited in
  // §20.1's own order, so this needs no separate sort.
  const note = (value, record) => {
    if (!isOffOrigin(value, base)) return;
    const url = withScheme(value, scheme);
    if (!owner.has(url)) owner.set(url, record);
  };

  for (const record of records) {
    // §12 reads an attribute's VALUE, not its bytes: character references
    // resolve first (`href="/a&amp;b.html"` names the file `a&b.html`), and
    // the obligation runs the same way here — an off-origin URL emitted with
    // an entity in it must fetch the DECODED address. `record.jsonLd`'s
    // strings need no such step; they are already-parsed JSON, never HTML.
    const text = htmlByOutputPath.get(record.outputPath);
    if (text !== undefined) {
      for (const ref of collectHtmlReferences(text)) note(decodeEntities(ref.raw), record);
    }
    for (const entry of record.jsonLd) {
      if (entry.error !== null) continue; // §24.4's jsonld-invalid owns that page
      for (const url of jsonLdOffOriginUrls(entry.data, base)) note(url, record);
    }
  }
  return owner;
}

/**
 * @typedef {object} ProbeResult
 * @property {boolean} ok
 * @property {number|null} status - the final HTTP status, or null when the
 *   request never got one (a connection error or a timeout)
 * @property {string|null} error - a short, human-readable reason; null iff `ok`
 * @property {'http'|'timeout'|'connection'|null} reason - null iff `ok`;
 *   `'connection'` is the ONLY reason `probeUrls` treats as evidence that this
 *   run cannot reach the network at all (see `probeUrls`'s own comment) —
 *   a timeout and an HTTP error both mean a request actually went somewhere
 */

/**
 * One URL, HEAD then GET-on-405, redirects followed up to `maxRedirects`,
 * each individual request bounded by `timeoutMs`.
 * @param {string} url
 * @param {{timeoutMs: number, maxRedirects: number, fetchImpl: typeof fetch}} opts
 * @returns {Promise<ProbeResult>}
 */
async function probeOne(url, { timeoutMs, maxRedirects, fetchImpl }) {
  const attempt = async (method) => {
    let current = url;
    for (let hop = 0; ; hop++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(current, { method, redirect: "manual", signal: controller.signal });
      } catch (err) {
        clearTimeout(timer);
        if (err?.name === "AbortError" || err?.name === "TimeoutError") {
          return { ok: false, status: null, error: "timed out", reason: "timeout" };
        }
        const cause = err?.cause?.code ?? err?.code;
        const detail = cause ? `${err.message} (${cause})` : String(err?.message ?? err);
        return { ok: false, status: null, error: `failed: ${detail}`, reason: "connection" };
      }
      clearTimeout(timer);
      const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (location) {
        if (hop >= maxRedirects) {
          return { ok: false, status: res.status, error: "failed: too many redirects", reason: "http" };
        }
        current = new URL(location, current).href;
        continue;
      }
      return {
        ok: res.status < 400,
        status: res.status,
        error: res.status >= 400 ? `answered ${res.status}` : null,
        reason: res.status >= 400 ? "http" : null,
      };
    }
  };

  const head = await attempt("HEAD");
  if (head.status === 405) return attempt("GET");
  return head;
}

/**
 * Run `limit` workers over `items`, each repeatedly claiming the next index —
 * simplest bounded-concurrency shape that needs no dependency and preserves
 * `results[i]` order regardless of which worker finished it.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapBounded(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/**
 * §31.3 — fetch every distinct URL once, bounded concurrency.
 *
 * `networkUnreachable` is the signal behind "a run that cannot reach the
 * network at all reports that once, as a usage error, rather than reporting
 * every URL as unreachable": true only when there was at least one URL to
 * check AND every single one failed at the CONNECTION level (DNS, refused,
 * no route — `reason === "connection"`). A genuine per-host outage still
 * gets a `reason` of `"http"` (a real response, just an error one) or
 * `"timeout"` (a real attempt that ran the full clock) for the hosts that
 * answer at all; only "nothing this run tried could even open a socket"
 * collapses to the usage error, because reporting N broken links when NONE
 * of them were actually tested would be the wrong claim, not a smaller one.
 * @param {string[]} urls - distinct URLs (duplicates wastefully re-fetched;
 *   callers pass `[...collectExternalReferences(...).keys()]`)
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRedirects]
 * @param {number} [options.concurrency]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{results: Map<string, ProbeResult>, networkUnreachable: boolean}>}
 */
export async function probeUrls(urls, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = MAX_REDIRECTS,
    concurrency = DEFAULT_CONCURRENCY,
    fetchImpl = globalThis.fetch,
  } = options;

  const results = new Map();
  await mapBounded(urls, concurrency, async (url) => {
    results.set(url, await probeOne(url, { timeoutMs, maxRedirects, fetchImpl }));
  });

  const entries = [...results.values()];
  const networkUnreachable = entries.length > 0 && entries.every((r) => r.reason === "connection");

  return { results, networkUnreachable };
}
