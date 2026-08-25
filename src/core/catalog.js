/**
 * `catalog.js` — the release-0.9 catalog projection.
 *
 * `assets/unify/catalog.json` under `--catalog`: conformance-spec §30.1-§30.2,
 * §30.4, §30.6-§30.7, tracing back to brief §4.1/§8-§10. A compact, bounded
 * projection of every public page's `<html>`/`<head>`/`<body>` shape — attributes, title, meta, link,
 * base, and a flat main-scoped heading sequence — for browse/filter/TOC/
 * metadata-driven UI. No body text (that is `search-corpus.js`'s job), no
 * JSON-LD script bodies (private analysis only, brief §9.4), no source path,
 * no generated-source status, no layout path, no output path (brief §9.1 —
 * those are build facts, not public content facts).
 *
 * There is no page-reading here, and there must never be one: every value
 * this module emits already sits on a `BuildDocument`, produced once by
 * `document.js`'s single extraction pass over the final emitted HTML and
 * carried untouched. `catalogEntry` below does not re-derive `html`/`head`/
 * `body` from anything — it spreads `doc.document` (already `{path, url,
 * html, head, body}`, in that order, brief §8's schema exactly), so `doc.
 * document` IS the catalog entry, literally the same object's own fields,
 * not a hand-copied echo of it. That is deliberate: it is the same snapshot
 * `audit --format json` already serializes as `document` (report.js's
 * `serializePage`), so the two surfaces cannot drift into two readings of
 * one page — a field `document.js` adds later reaches both for free.
 *
 * Membership is imported, not restated: `isPublicDestination` is
 * `document-selectors.js`'s shared predicate (document exists, indexable,
 * not `404.html`, self-canonical) — the same one `sitemap.js` and
 * `search-corpus.js` call, so a page cannot be in one public projection and
 * silently absent from another because two implementations disagreed about
 * canonical or robots semantics (brief §10).
 *
 * Activation (brief §5.1) is the CLI flag `--catalog` alone, exactly like
 * the removed `--search-index`: nothing about a page declares "catalog me",
 * so there is no document-derived condition to check the way
 * `generateSitemap` checks `base`. `generateCatalog` below is therefore
 * unconditional — called only when wanted, gated by the caller
 * (`settings.catalog`) — and `--search-corpus` does NOT imply it (brief
 * §5.2): the two flags are independent, so a consumer that wants only
 * full-text search data is never forced to also ship the catalog.
 */

import { isPublicDestination } from "./document-selectors.js";

/** The output path of the site's catalog (brief §4.1). */
export const CATALOG_PATH = "assets/unify/catalog.json";

/**
 * `schemaVersion` — a consumer's refusal signal, not a build number.
 * Independent of `search-corpus.js`'s own `SCHEMA_VERSION`: the two are
 * separate contracts (brief §27) and a change to one's meaning never forces
 * the other to bump. Within version 1, only additive optional fields may be
 * added; a change to an existing field's meaning is what bumps it.
 */
export const SCHEMA_VERSION = 1;

/**
 * One page's catalog entry: `doc.document` itself, spread into a fresh
 * object in its own fixed key order, brief §8.1/addenda fixes:
 * `{path, url, html, head, body}` — the order `document.js`'s
 * `DocumentSnapshot` already produces, so the spread changes nothing about
 * it. This function performs no extraction, no filtering, no re-shaping,
 * and — because it is a spread rather than a hand-picked field list — no
 * future `DocumentSnapshot` field can reach `audit --format json`'s
 * `document` without also reaching this entry. The bound is already
 * enforced upstream: `document.js`'s `extractDocument` never puts `<style>`
 * contents, script bodies, or the body's text into the snapshot in the
 * first place (only `analysis.jsonLd`/`analysis.visibleText`, on the
 * private half this module never reads), so there is nothing here to strip.
 * @param {import('./manifest.js').BuildDocument} doc
 * @returns {import('./document.js').DocumentSnapshot}
 */
export function catalogEntry(doc) {
  return { ...doc.document };
}

/**
 * The whole catalog document: `{schemaVersion, baseUrl, pages}` (brief §8).
 *
 * `baseUrl` is `${base.origin}${base.pathPrefix}` — `null` when `base` is
 * `null` (no `--base-url`) — the identical construction `report.js`'s
 * `buildReport` uses for `unify audit --format json`'s own `baseUrl` field.
 * This is deliberate, not incidental: every `url` in this same document is
 * built from that same normalized `base` (§20.5), so a consumer resolving
 * `new URL(page.path, catalog.baseUrl)` gets the site's real address,
 * path prefix included, rather than a raw flag string that can omit it.
 *
 * `pages` is filtered to the shared membership predicate and left in
 * manifest order — §20.1's own output-path order, which `documents` already
 * carries; nothing here sorts.
 * @param {import('./manifest.js').BuildDocument[]} documents
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {{schemaVersion: number, baseUrl: string|null, pages: ReturnType<typeof catalogEntry>[]}}
 */
export function catalogDocument(documents, base) {
  const pages = [];
  for (const doc of documents) {
    if (!isPublicDestination(doc, base)) continue;
    pages.push(catalogEntry(doc));
  }
  return { schemaVersion: SCHEMA_VERSION, baseUrl: base ? `${base.origin}${base.pathPrefix}` : null, pages };
}

/**
 * Two-space-indented JSON, trailing newline, byte-identical across builds of
 * one tree (a pure function of `doc`, itself built from the manifest in one
 * deterministic pass with no sort, no clock, no randomness).
 * @param {{schemaVersion: number, baseUrl: string|null, pages: object[]}} doc
 * @returns {string}
 */
export function serializeCatalog(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * Generate the site's catalog, or explain why not.
 *
 * No `reporter` parameter, and that omission mirrors `search-index.js`'s own
 * argued absence (moved here rather than re-argued): P22 needs a second
 * class of path to collide on — the way `sitemap.xml`'s split parts do — and
 * `CATALOG_PATH` fixes exactly one location, unconditionally, with no size
 * cap and no split. By the time generation proceeds (the suppression check
 * below passes), `CATALOG_PATH` is provably absent from `emittedFromSource`,
 * so there is no other path left to collide on.
 *
 * @param {object} args
 * @param {import('./manifest.js').BuildDocument[]} args.documents - the §20 manifest
 * @param {import('./urls.js').BaseUrlConfig|null} args.base
 * @param {Map<string,string>} args.emittedFromSource - output path -> the
 *   source path it came from, for every file the site emits from its own
 *   tree (pages and assets alike).
 * @returns {Map<string,string>} `CATALOG_PATH` -> text, or empty when an
 *   authored `assets/unify/catalog.json` suppressed generation. Only the
 *   exact path is reserved — `assets/unify/` itself is not.
 */
export function generateCatalog({ documents, base, emittedFromSource }) {
  const generated = new Map();
  // The author's file is the site's catalog: never overwritten, never
  // merged into. Suppression happens before anything is computed, exactly
  // as an authored sitemap.xml/feed.xml suppress their own generation.
  if (emittedFromSource.has(CATALOG_PATH)) return generated;
  generated.set(CATALOG_PATH, serializeCatalog(catalogDocument(documents, base)));
  return generated;
}
