/**
 * `sitemap.js` — conformance-spec §21, sitemap generation.
 *
 * The first projection of the §20 manifest, and the shape every later one
 * follows: this module reads page records and never re-reads a page. There is
 * no metadata parsing here, no second opinion about what a page's URL is, and
 * no place for one to appear — `entriesFor` takes records and returns
 * `{loc, lastmod}` pairs, which is the whole extraction surface.
 *
 * Three refusals are contract, not oversight (§21.3):
 *
 *   - No `<lastmod>` unless the page authored a well-formed one. The build
 *     clock, the filesystem's mtime, the filename, and Git history are the
 *     four fabrications every other generator reaches for, and a fabricated
 *     `lastmod` is a claim about the world that current crawler guidance
 *     specifically punishes. `datePublished` is not a fallback either: the
 *     element is named for the last modification and reads the value authored
 *     under that name.
 *   - No `<changefreq>` and no `<priority>`. Neither is derivable from a page,
 *     and a constant emitted for every URL is noise shaped like information.
 *   - Nothing is ever overwritten. An authored `sitemap.xml` suppresses
 *     generation outright (§21.5); a collision on a split path is P22 and
 *     suppresses it too. The author's file always wins.
 */

import { decodeXmlEntities } from "./entities.js";
import { findAll, innerText, parse } from "./html.js";
import { isSkippedUrl, splitUrl } from "./urls.js";
import { stripBaseUrl, resolveReference } from "./references.js";
import { CHECK_SPELLING } from "./diagnostics.js";

/** Sitemaps protocol caps for one file (§21.4). */
export const MAX_URLS_PER_FILE = 50_000;
export const MAX_BYTES_PER_FILE = 50 * 1024 * 1024;

const XMLNS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';

function byteLength(s) {
  return Buffer.byteLength(s, "utf8");
}

/** The output path of the site's sitemap, and the stem its split parts use. */
export const SITEMAP_PATH = "sitemap.xml";
const partPath = (n) => `sitemap-${n}.xml`;

/** XML text escaping — every one of the five, because a URL may carry any of them. */
function xmlEscape(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * The inverse, for reading `<loc>` values back out of an emitted sitemap.
 *
 * XML's own five predefined entities plus numeric references, and nothing
 * else — NOT the HTML 4.01 table the manifest reads pages with. `&nbsp;` in a
 * `<loc>` is not well-formed XML, and quietly resolving it would let this
 * check understand a document no XML parser would accept. An earlier local
 * version had the opposite flaw: it decoded `&#39;` and no other numeric
 * reference.
 */
const xmlUnescape = decodeXmlEntities;

/**
 * §21.2 — is this record's canonical (if any) its own address?
 *
 * Resolution reuses §12's rule rather than comparing URL strings, so
 * `/about/`, `/about/index.html`, and the `--base-url`-absolutized spelling of
 * either all answer the same question the reference check would answer. A
 * canonical resolving to nothing internal (another origin, or a path the site
 * does not emit) is not this page, so the page is consolidated away.
 * @param {import('./manifest.js').PageRecord} record
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {boolean}
 */
/**
 * "Does this page's canonical name this page?" — §21.2's second clause, and
 * §24.4's own test for two findings that are *about* that question rather than
 * about membership.
 *
 * Exported for the same reason `isCompletablePage` is: a lookalike drifts. The
 * evaluator first asked it by way of `!isCompletablePage(...)`, which is a
 * different question with the same answer on most pages and the wrong answer on
 * a `noindex` page that names itself — membership fails there for the robots
 * reason, and reading that as "the canonical disagrees" produced a finding
 * whose evidence quoted the page's own URL back at it.
 *
 * A canonical unify cannot resolve — another origin, `mailto:`, empty — is not
 * self-canonical. It names something this build cannot confirm is this page,
 * and the conservative reading is the one that does not claim agreement.
 *
 * @param {import('./manifest.js').PageRecord} record
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {boolean}
 */
export function isSelfCanonical(record, base) {
  if (record.canonical === null) return true;
  const stripped = base ? stripBaseUrl(record.canonical, base) : record.canonical;
  if (isSkippedUrl(stripped)) return false;
  return resolveReference(stripped, record.outputPath) === record.outputPath;
}

/**
 * §21.2/§21.3 — the sitemap entries for a manifest, in manifest order.
 * @param {import('./manifest.js').PageRecord[]} records
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {{loc: string, lastmod: string|null}[]}
 */
export function entriesFor(records, base) {
  const out = [];
  for (const record of records) {
    if (!isCompletablePage(record, base)) continue;
    if (record.url === null) continue; // unreachable while §21.1 gates on --base-url; stated, not assumed
    out.push({ loc: record.url, lastmod: record.dateModified?.iso ?? null });
  }
  return out;
}

/**
 * §21.2's membership predicate, exported because §22.4 uses it **unchanged**
 * rather than a lookalike.
 *
 * Sharing it is not tidiness. §22 stamps a canonical onto the pages this
 * returns true for, and the two exclusions carry their weight in that direction
 * too: a `noindex` page must not be stamped, because a canonical on a page the
 * author told crawlers to drop manufactures the exact contradiction
 * product-spec §6.3.2 asks unify to report; and a page consolidated onto
 * another already has the canonical it wants, which is why it left the sitemap.
 *
 * The name says "completable" rather than "indexable" because that is the
 * question both callers ask: is this page one the site presents as a
 * destination in its own right?
 * @param {import('./manifest.js').PageRecord} record
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {boolean}
 */
export function isCompletablePage(record, base) {
  if (!record.robots.indexable) return false;
  if (record.outputPath === "404.html") return false;
  return isSelfCanonical(record, base);
}

/** One `<url>` line, newline included. The single place an entry becomes bytes. */
function urlLine({ loc, lastmod }) {
  return `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : ""}</url>\n`;
}

const URLSET_OPEN = `${DECLARATION}<urlset xmlns="${XMLNS}">\n`;
const URLSET_CLOSE = "</urlset>\n";
/** Bytes a `urlset` costs before any entry — the constant half of the §21.4 byte cap. */
const URLSET_OVERHEAD = byteLength(URLSET_OPEN + URLSET_CLOSE);

/** §21.4 — one `urlset` document. */
export function serializeUrlset(entries) {
  return URLSET_OPEN + entries.map(urlLine).join("") + URLSET_CLOSE;
}

/** §21.4 — the index that names split parts. No `<lastmod>`, for §21.3's reason. */
export function serializeIndex(locs) {
  const lines = locs.map((loc) => `<sitemap><loc>${xmlEscape(loc)}</loc></sitemap>\n`);
  return `${DECLARATION}<sitemapindex xmlns="${XMLNS}">\n${lines.join("")}</sitemapindex>\n`;
}

/**
 * §21.4 — split entries into parts at the first protocol cap reached.
 *
 * Filling is greedy in manifest order and the byte cap is measured on the
 * document a part would actually serialize to, so the split points are a pure
 * function of the input: no clock, no hashing, no partitioning by anything the
 * next build could compute differently.
 * @param {{loc: string, lastmod: string|null}[]} entries
 * @returns {{loc: string, lastmod: string|null}[][]}
 */
export function splitEntries(entries) {
  const parts = [];
  let current = [];
  let bytes = URLSET_OVERHEAD;
  for (const entry of entries) {
    // Each entry's cost is measured once and carried, never recomputed over
    // the whole part: re-serializing the candidate per entry is quadratic, and
    // at the scale this function exists for (50,000+ URLs) that is the
    // difference between milliseconds and minutes.
    const cost = byteLength(urlLine(entry));
    if (current.length > 0 && (current.length + 1 > MAX_URLS_PER_FILE || bytes + cost > MAX_BYTES_PER_FILE)) {
      parts.push(current);
      current = [];
      bytes = URLSET_OVERHEAD;
    }
    current.push(entry);
    bytes += cost;
  }
  // A single entry larger than the whole byte cap is emitted anyway rather
  // than refused. Not an oversight: a 50 MiB <loc> needs a 50 MiB output path,
  // and every filesystem unify runs on caps a path component near 255 bytes
  // and a full path near 4096. A refusal here would be a diagnostic that can
  // never fire, which is worse than the behaviour it guards. The sitemap index
  // is uncapped for the same reason — exceeding it needs 2.5 billion pages.
  //
  // An empty site still has one (empty) part, so callers never special-case
  // "no entries" into "no sitemap" — §21.1 already decided whether to generate.
  if (current.length || parts.length === 0) parts.push(current);
  return parts;
}

/**
 * §21 — generate the site's sitemap, or explain why it did not.
 *
 * @param {object} args
 * @param {import('./manifest.js').PageRecord[]} args.records - the §20 manifest
 * @param {import('./urls.js').BaseUrlConfig|null} args.base - null suppresses generation (§21.1)
 * @param {Map<string,string>} args.emittedFromSource - output path -> the
 *   source path it came from, for every file the site emits from its own tree.
 *   Both halves matter: membership decides suppression, and the source path is
 *   where P22 is located.
 * @param {import('./diagnostics.js').Reporter} args.reporter
 * @returns {Map<string,string>} generated output path -> text; empty when
 *   generation was suppressed for any reason
 */
export function generateSitemap({ records, base, emittedFromSource, reporter }) {
  const generated = new Map();
  if (!base) return generated; // §21.1 — no public address, no sitemap, no report

  // §21.5 — an authored sitemap is the site's sitemap. Suppression happens
  // before any path is claimed, so this is not a collision and raises nothing.
  if (emittedFromSource.has(SITEMAP_PATH)) return generated;

  const parts = splitEntries(entriesFor(records, base));

  if (parts.length === 1) {
    generated.set(SITEMAP_PATH, serializeUrlset(parts[0]));
    return generated;
  }

  // §21.4 — a split claims the part paths as well as the index path.
  const claimed = parts.map((_, i) => partPath(i + 1));
  const occupied = claimed.filter((p) => emittedFromSource.has(p));
  if (occupied.length) {
    // §21.5/P22 — suppress rather than overwrite. Reported per occupied path,
    // located at the source file that occupies it, in path order so the
    // message set is deterministic.
    for (const path of occupied.sort()) {
      reporter.problem({
        file: emittedFromSource.get(path),
        message: `${path} is where unify would write part of this site's generated sitemap`,
        fixes: [
          `rename ${emittedFromSource.get(path)} — unify claims sitemap-N.xml for every part when a site exceeds ${MAX_URLS_PER_FILE.toLocaleString("en-US")} URLs`,
          "or write the whole sitemap yourself: a sitemap.xml in your source tree suppresses generation entirely",
        ],
      });
    }
    return new Map();
  }

  for (const [i, part] of parts.entries()) generated.set(claimed[i], serializeUrlset(part));
  generated.set(SITEMAP_PATH, serializeIndex(claimed.map((p) => base.origin + base.pathPrefix + p)));
  return generated;
}

/**
 * §21.6 — every internal `<loc>` in an emitted sitemap must name a file the
 * site emits.
 *
 * For generated sitemaps this can only pass; it runs anyway, because it is the
 * executable form of the claim that the sitemap and the published tree agree.
 * A future change that lets the two drift fails here rather than at a crawler.
 *
 * Values on another origin are skipped: verifying them needs the network, and
 * network access is an explicit audit operation, never a build dependency.
 *
 * @param {object} args
 * @param {Map<string,{text: string, file: string}>} args.sitemaps - output path
 *   -> the text to scan and the path to attribute a problem to
 * @param {Set<string>} args.emittedPaths
 * @param {import('./urls.js').BaseUrlConfig|null} args.base
 * @param {import('./diagnostics.js').Reporter} args.reporter
 */
export function checkSitemapLocs({ sitemaps, emittedPaths, base, reporter }) {
  for (const { file, stripped, resolved } of internalLocs({ sitemaps, base })) {
    if (resolved !== null && emittedPaths.has(resolved)) continue;
    reporter.problem({
      file,
      message: `${stripped} does not resolve to any emitted file`,
      context: stripped,
      fixes: [CHECK_SPELLING],
    });
  }
}

/**
 * §24.4 — which pages a sitemap emitted by this build actually lists.
 *
 * The evaluation command needs the same question §21.6 asks — "what output
 * path does this `<loc>` name?" — for a different purpose: comparing a listing
 * against the page's own robots and canonical. Both callers go through
 * `internalLocs` so there is exactly one answer, which is the one-interpretation
 * law product-spec §6.1 states for URLs. A second resolver here would be the
 * defect that law exists to forbid, and it would be invisible: the two would
 * agree on every ASCII path and diverge on the first escaped one.
 *
 * @param {object} args
 * @param {Map<string, {text: string, file: string}>} args.sitemaps
 * @param {import('./urls.js').BaseUrlConfig|null} args.base
 * @returns {Map<string, string>} output path -> the file that lists it (first wins)
 */
export function sitemapListings({ sitemaps, base }) {
  const out = new Map();
  for (const { file, resolved } of internalLocs({ sitemaps, base })) {
    if (resolved !== null && !out.has(resolved)) out.set(resolved, file);
  }
  return out;
}

/**
 * Every internal `<loc>` across the emitted sitemaps, resolved once.
 *
 * @param {object} args
 * @param {Map<string, {text: string, file: string}>} args.sitemaps
 * @param {import('./urls.js').BaseUrlConfig|null} args.base
 * @returns {{file: string, raw: string, stripped: string, resolved: string|null}[]}
 */
function internalLocs({ sitemaps, base }) {
  const out = [];
  for (const [outputPath, { text, file }] of [...sitemaps].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    for (const raw of locValues(text)) {
      // EXACTLY §12's order — strip the base from the RAW value, then let
      // `resolveReference` split query/fragment and decode, once. Decoding the
      // whole loc first was wrong three ways at once, and every one of them
      // blocked the publish of a site whose own generated sitemap was correct:
      //
      //   - `--base-url https://example.com/café/` makes `parseBaseUrl` store
      //     the pathPrefix as `new URL().pathname` gives it, `/caf%C3%A9/`. The
      //     loc is built correctly with that prefix; pre-decoding turned it
      //     back into `/café/`, so `stripBaseUrl` no longer recognised its own
      //     prefix and EVERY page in an ordinary two-page site raised a false
      //     P13. No unusual filename needed — just a deployment under a path
      //     with a space or a non-ASCII character.
      //   - An output path containing `#` or `?` decoded to a literal one, and
      //     `splitUrl` then ate the rest of the name as a fragment or query.
      //   - A filename containing a literal escape decoded twice: once here and
      //     once inside `resolveReference`.
      //
      // §21.6 says a generated sitemap's check "can only pass". It could not,
      // and it reported a string present in no file with "check the path
      // spelling" against a spelling that was right.
      const stripped = base ? stripBaseUrl(raw, base) : raw;
      if (isSkippedUrl(stripped)) continue; // another origin, or nothing to check
      if (splitUrl(stripped).path === "") continue;
      out.push({ file, raw, stripped, resolved: resolveReference(stripped, outputPath) });
    }
  }
  return out;
}

/**
 * §21.6 — the `<loc>` values a sitemap document actually declares.
 *
 * Parsed, never pattern-matched. The three forms that make the difference are
 * all real and all wrong under a regex: a `<loc>` inside a comment is not an
 * entry (matching it turns a valid site into a blocked publish), a CDATA
 * wrapper is not part of the URL, and `<sm:loc>` under a namespace prefix IS a
 * loc — missing it lets a broken URL ship silently, which is the worse of the
 * two directions.
 * @param {string} text
 * @returns {string[]}
 */
function locValues(text) {
  const { root } = parse(text);
  // `findAll` never descends into comments (they are not elements), so a
  // commented-out entry is excluded by construction rather than by a rule.
  const elements = findAll(root, (n) => n.type === "element" && /(^|:)loc$/i.test(n.tag));
  const out = [];
  for (const el of elements) {
    const inner = innerText(text, el);
    const cdata = unwrapCdata(inner);
    // Entity resolution applies to the ordinary branch only. CDATA suspends
    // markup interpretation — that is the entire reason to write it — so
    // decoding its payload would read a value the document does not contain.
    const value = cdata === null ? xmlUnescape(inner).trim() : cdata.trim();
    if (value) out.push(value);
  }
  return out;
}

/**
 * `<![CDATA[value]]>` carries `value`; anything else returns `null` so the
 * caller can tell the two branches apart. CDATA suspends markup
 * interpretation, so its payload is taken verbatim — no entity resolution,
 * which is the whole point of writing it that way.
 */
function unwrapCdata(inner) {
  const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(inner);
  return m ? m[1] : null;
}
