/**
 * `search-index.js` — conformance-spec §30, the search manifest.
 *
 * The third projection of the §20 manifest, after §21's sitemap and the
 * canonical/structured-data writers — and the smallest of the three, because
 * it is nothing but a projection. Every value in `search-index.json` is
 * already sitting on a page record: `url`/`path` (§20.5), `title`,
 * `description`, `headings`, `text` (§20.7). There is no page-reading
 * anywhere in this file — if a value this module needs is not already a
 * field of `PageRecord`, the defect is that §20's manifest lacks the field,
 * and the fix belongs in `manifest.js`, not here (§30.2: "it is a
 * projection, not an extractor").
 *
 * Two things this module owns and nothing else does:
 *
 *  1. **The fixed shape** (§30.1) — top-level `schemaVersion`/`pages`, a
 *     page's five keys in the one order the spec fixes, two-space JSON with
 *     a trailing newline. `JSON.stringify`'s own key-insertion-order
 *     behaviour is what keeps `searchIndexEntry` honest: the object literal
 *     below writes the five keys in spec order once, and every serialization
 *     reproduces that order without this module re-asserting it per call.
 *  2. **Folding** (§30.3) — collapsing every Unicode space separator in
 *     `text` to U+0020. §20.3 states the obligation and *defers* it here in
 *     these words: "any projection of this field that is searched or
 *     compared must fold U+00A0 and the other Unicode space separators at
 *     index time, and say so where it is specified." A search manifest is
 *     read by exactly that kind of consumer — a client-side search library
 *     comparing a typed query against indexed text — so this is the place.
 *     Nothing else is folded: no case folding, no stemming, no stop-word
 *     removal, no truncation, no character count (§30.3's own closing
 *     sentence; those are a search engine's decisions and unify ships no
 *     search runtime, product-spec §6.5.2).
 *
 * Membership is imported, not restated: `isCompletablePage` is §21.2's own
 * predicate (record exists, `indexable`, not `404.html`, self-canonical),
 * exported by `sitemap.js` for exactly this reason (§22.4 is its other
 * caller). A lookalike here would be the second-interpretation defect
 * product-spec §6.2 exists to forbid — sitemap membership and search
 * membership answer the same question ("is this page a destination the site
 * presents in its own right, that a `noindex` author did not ask to hide?")
 * and a page must not be able to differ between them.
 *
 * Activation (§30.1) is the CLI flag `--search-index` alone — unlike the
 * sitemap or the feed, nothing about a page declares "index me", so there is
 * no record-derived condition this module could check the way
 * `generateSitemap` checks `base`. That means activation is entirely the
 * caller's business (gate the call on `settings.searchIndex`, exactly as
 * `build.js` already gates canonical completion on `settings.canonical ===
 * "auto"`), and `generateSearchIndex` below is unconditional — called only
 * when wanted, exactly like `completeCanonical`/`generateStructuredData`.
 */

import { isCompletablePage } from "./sitemap.js";

/** The output path of the site's search manifest (§30.1). */
export const SEARCH_INDEX_PATH = "search-index.json";

/**
 * `schemaVersion` — a consumer's refusal signal, not a build number. §30.1:
 * "it changes only when a field's MEANING changes; adding a field does not."
 * Bumping it is therefore a spec decision, never a per-build computation, so
 * it is a literal rather than anything derived.
 */
export const SCHEMA_VERSION = 1;

/**
 * §30.3's closed codepoint set, exactly as stated: U+00A0 (NO-BREAK SPACE),
 * U+2000–U+200A (the EN QUAD .. HAIR SPACE block), U+202F (NARROW NO-BREAK
 * SPACE), U+205F (MEDIUM MATHEMATICAL SPACE), U+3000 (IDEOGRAPHIC SPACE).
 *
 * `record.text` has already had every run of ASCII whitespace collapsed to
 * one space by §20.3's `textContent` — deliberately not touching these
 * codepoints, which is the obligation this module discharges. So the only
 * whitespace shapes left to fold are: a lone separator from this set, and a
 * separator sitting beside an ASCII space that survived §20.3 untouched
 * (`"New  York"`, an NBSP the author wrote next to a literal space).
 * The second run-collapse below exists for exactly that seam.
 */
const SPACE_SEPARATORS = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * §30.3 — fold every Unicode space separator in `text` to U+0020, collapse
 * the runs that folding can create, and trim. Fold NOTHING else: no case
 * folding, no stemming, no stop-word removal, no truncation, no character
 * count.
 *
 * The second `replace` only ever collapses *spaces the first one produced or
 * exposed* — it is not a second, broader whitespace rule sneaking in a `\s+`
 * collapse of tabs or newlines. Those cannot occur in `record.text` to begin
 * with (§20.3 already collapsed them), so a plain `/ +/g` is the whole of
 * what "runs collapse" requires here.
 * @param {string} text
 * @returns {string}
 */
export function foldSpaceSeparators(text) {
  return text.replace(SPACE_SEPARATORS, " ").replace(/ +/g, " ").trim();
}

/**
 * §30.1/§30.2 — one page's entry, in the fixed key order and with no others.
 * The order is written once, here, as the object literal's own key order:
 * `JSON.stringify` preserves string-key insertion order, so every
 * serialization downstream reproduces §30.1's `url, title, description,
 * headings, text` without re-asserting it.
 *
 * `url` is `record.url`, falling back to `record.path` with no `--base-url`
 * (§30.2) — a root-relative address is still one a page on this site can
 * link a search result to, and refusing to emit the file without a public
 * address would make the flag useless for the local case it is used for
 * most. `record.url` is `null` exactly when `--base-url` was not supplied
 * (§20.5), so the fallback is an ordinary nullish default, not a second
 * activation test.
 *
 * `title`/`description`/`headings` are the record's own, unchanged —
 * already `null`/`[]` on a page that declares neither (§20.3). `headings` is
 * passed through as `record.headings` itself: its own shape,
 * `{level, text, id}` in document order, is already exactly §30.1's example.
 *
 * Only `text` is transformed, and by exactly one function (§30.3). A
 * heading's own `text` is a *different* field — §20.3's per-element text
 * content, not §20.7's page-level `text` this section is folding — and nothing
 * in §30 asks it to fold too; a client comparing a typed query against
 * `pages[].text` is the consumer §20.3's obligation names, and a heading
 * label in a results list is not that comparison.
 * @param {import('./manifest.js').PageRecord} record
 * @returns {{url: string, title: string|null, description: string|null, headings: {level:number,text:string,id:string|null}[], text: string}}
 */
export function searchIndexEntry(record) {
  return {
    url: record.url ?? record.path,
    title: record.title,
    description: record.description,
    headings: record.headings,
    text: foldSpaceSeparators(record.text),
  };
}

/**
 * §30.1 — the whole document: `{schemaVersion, pages}`, `pages` filtered to
 * §21.2's membership predicate and left in manifest order (§20.1's own
 * output-path order, which `records` already carries — nothing here sorts).
 * @param {import('./manifest.js').PageRecord[]} records
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {{schemaVersion: number, pages: ReturnType<typeof searchIndexEntry>[]}}
 */
export function searchIndexDocument(records, base) {
  const pages = [];
  for (const record of records) {
    // §30.2 — §21.2's predicate, imported rather than restated (isCompletablePage,
    // exported by sitemap.js for exactly this sharing). "noindex means do not
    // show this page in search results, and a site search IS search results."
    if (!isCompletablePage(record, base)) continue;
    pages.push(searchIndexEntry(record));
  }
  return { schemaVersion: SCHEMA_VERSION, pages };
}

/**
 * §30.1 — two-space-indented JSON, trailing newline, byte-identical across
 * builds of one tree (a pure function of `doc`, itself built from the
 * manifest in one deterministic pass with no sort, no clock, no randomness).
 * @param {{schemaVersion: number, pages: object[]}} doc
 * @returns {string}
 */
export function serializeSearchIndex(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * §30 — generate the site's search manifest, or explain why not.
 *
 * Unlike `generateSitemap`, this function takes no `reporter` and never
 * raises P22, and that omission is argued rather than an oversight. P22
 * (§14.2/§21.5) is "a generated artifact's output path is already occupied";
 * for `sitemap.xml` that is reachable because a *second* class of path
 * exists — the split parts, claimed only once the entry set exceeds the
 * protocol cap — and it is exactly those §21.5 names when it says the
 * problem "in practice reaches only the split parts, since an authored
 * `sitemap.xml` suppresses generation before any path is claimed." A search
 * manifest has no such second path: §30.1 fixes exactly one location,
 * unconditionally, with no size cap and no split. So the one path this
 * function could ever write is the one path the suppression check below
 * already tests — by the time "generation proceeds" (the check passes),
 * `SEARCH_INDEX_PATH` is provably not in `emittedFromSource`, and there is no
 * other path left to collide on. P22 is therefore not merely rare here, the
 * way it is for a two-page sitemap; it is structurally unreachable, and
 * carrying an unused `reporter` parameter to guard a call that can never
 * fire would be dead code with a signature, not defensiveness.
 *
 * @param {object} args
 * @param {import('./manifest.js').PageRecord[]} args.records - the §20 manifest
 * @param {import('./urls.js').BaseUrlConfig|null} args.base
 * @param {Map<string,string>} args.emittedFromSource - output path -> the
 *   source path it came from, for every file the site emits from its own
 *   tree (pages and assets alike) — the same map `generateSitemap` reads,
 *   passed by the same caller.
 * @returns {Map<string,string>} `SEARCH_INDEX_PATH` -> text, or empty when an
 *   authored `search-index.json` suppressed generation (§21.5's rule,
 *   §30.4)
 */
export function generateSearchIndex({ records, base, emittedFromSource }) {
  const generated = new Map();
  // §21.5/§30.4 — the author's file is the site's search manifest: never
  // overwritten, never merged into. Suppression happens before anything is
  // computed, exactly as §21.5 suppresses sitemap generation on an authored
  // sitemap.xml.
  if (emittedFromSource.has(SEARCH_INDEX_PATH)) return generated;
  generated.set(SEARCH_INDEX_PATH, serializeSearchIndex(searchIndexDocument(records, base)));
  return generated;
}
