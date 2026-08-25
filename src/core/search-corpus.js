/**
 * `search-corpus.js` — the release-0.9 full-text search projection.
 *
 * `assets/unify/search-corpus.json` under `--search-corpus` (brief §4.2,
 * §5.2, §11). Intentionally minimal: each page contributes only the public
 * path that joins it back to `catalog.json`, plus its normalized visible
 * text. No url, no title, no headings, no metadata, no description, no
 * tags, no canonical — every one of those already lives in the catalog
 * (brief §11), and duplicating them here would give a consumer two answers
 * to the same question about one page.
 *
 * Membership is imported, not restated: the same `isPublicDestination`
 * predicate `catalog.js`/`sitemap.js` call, so the corpus and the catalog
 * always describe the identical page set (brief §10) — a client can zip
 * `catalog.pages` and `corpus.pages` by `path` without first reconciling
 * two membership answers.
 *
 * Text folding is this module's one piece of real work, and it is the
 * §20.3 obligation that module states and defers to "any projection of this
 * field that is searched or compared": collapse every Unicode space
 * separator (U+00A0, the general punctuation space block, U+202F, U+205F,
 * U+3000) to U+0020 and collapse the runs that creates. `analysis.visibleText`
 * has already had ASCII whitespace runs collapsed by `document.js`'s
 * `textContent`; this function is the only place left that folds the
 * remaining Unicode space shapes for a consumer that will compare a typed
 * query against `pages[].text`. Nothing else is folded: no case folding, no
 * stemming, no stop-word removal, no truncation, no character count — those
 * are a search engine's decisions, and unify ships no search runtime
 * (product-spec §6.5.2).
 *
 * Activation (brief §5.2) is the CLI flag `--search-corpus` alone, and it
 * does NOT imply `--catalog` — the two are independent opt-ins, exactly as
 * `catalog.js`'s own module comment states from the other side.
 */

import { isPublicDestination } from "./document-selectors.js";

/** The output path of the site's search corpus (brief §4.2). */
export const SEARCH_CORPUS_PATH = "assets/unify/search-corpus.json";

/**
 * `schemaVersion` — independent of `catalog.js`'s own `SCHEMA_VERSION`
 * (brief §27): a change to one file's meaning never forces the other to
 * bump. Within version 1, only additive optional fields may be added.
 */
export const SCHEMA_VERSION = 1;

/**
 * The closed codepoint set folded to U+0020: U+00A0 (NO-BREAK SPACE),
 * U+2000–U+200A (the EN QUAD .. HAIR SPACE block), U+202F (NARROW NO-BREAK
 * SPACE), U+205F (MEDIUM MATHEMATICAL SPACE), U+3000 (IDEOGRAPHIC SPACE).
 *
 * `analysis.visibleText` has already had every run of ASCII whitespace
 * collapsed to one space, deliberately not touching these codepoints — the
 * obligation this module discharges. So the only whitespace shapes left to
 * fold are a lone separator from this set, and a separator sitting beside an
 * ASCII space that survived untouched (`"New  York"`, an NBSP the author
 * wrote next to a literal space) — the second run-collapse below exists for
 * exactly that seam.
 */
const SPACE_SEPARATORS = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Fold every Unicode space separator in `text` to U+0020, collapse the runs
 * that folding can create, and trim. Fold NOTHING else.
 *
 * The second `replace` only ever collapses spaces the first one produced or
 * exposed — it is not a second, broader whitespace rule sneaking in a `\s+`
 * collapse of tabs or newlines. Those cannot occur in `analysis.visibleText`
 * to begin with (ASCII whitespace runs are already collapsed), so a plain
 * `/ +/g` is the whole of what "runs collapse" requires here.
 * @param {string} text
 * @returns {string}
 */
export function foldSpaceSeparators(text) {
  return text.replace(SPACE_SEPARATORS, " ").replace(/ +/g, " ").trim();
}

/**
 * One page's corpus entry: `{path, text}`, nothing else.
 * @param {import('./manifest.js').BuildDocument} doc
 * @returns {{path: string|null, text: string}}
 */
export function corpusEntry(doc) {
  return {
    path: doc.document.path,
    text: foldSpaceSeparators(doc.analysis.visibleText),
  };
}

/**
 * The whole corpus document: `{schemaVersion, pages}` (brief §11), `pages`
 * filtered to the shared membership predicate and left in manifest order —
 * nothing here sorts.
 * @param {import('./manifest.js').BuildDocument[]} documents
 * @param {import('./urls.js').BaseUrlConfig|null} base
 * @returns {{schemaVersion: number, pages: ReturnType<typeof corpusEntry>[]}}
 */
export function corpusDocument(documents, base) {
  const pages = [];
  for (const doc of documents) {
    if (!isPublicDestination(doc, base)) continue;
    pages.push(corpusEntry(doc));
  }
  return { schemaVersion: SCHEMA_VERSION, pages };
}

/**
 * Two-space-indented JSON, trailing newline, byte-identical across builds of
 * one tree.
 * @param {{schemaVersion: number, pages: object[]}} doc
 * @returns {string}
 */
export function serializeCorpus(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * Generate the site's search corpus, or explain why not.
 *
 * No `reporter` parameter, for the same reason `catalog.js`'s
 * `generateCatalog` carries none: `SEARCH_CORPUS_PATH` fixes exactly one
 * location, unconditionally, with no size cap and no split, so by the time
 * generation proceeds there is no second path left to collide on.
 *
 * @param {object} args
 * @param {import('./manifest.js').BuildDocument[]} args.documents - the §20 manifest
 * @param {import('./urls.js').BaseUrlConfig|null} args.base
 * @param {Map<string,string>} args.emittedFromSource - output path -> the
 *   source path it came from, for every file the site emits from its own
 *   tree (pages and assets alike).
 * @returns {Map<string,string>} `SEARCH_CORPUS_PATH` -> text, or empty when
 *   an authored `assets/unify/search-corpus.json` suppressed generation.
 *   Only the exact path is reserved — `assets/unify/` itself is not.
 */
export function generateSearchCorpus({ documents, base, emittedFromSource }) {
  const generated = new Map();
  // The author's file is the site's search corpus: never overwritten, never
  // merged into. Suppression happens before anything is computed, exactly
  // as an authored sitemap.xml/feed.xml suppress their own generation.
  if (emittedFromSource.has(SEARCH_CORPUS_PATH)) return generated;
  generated.set(SEARCH_CORPUS_PATH, serializeCorpus(corpusDocument(documents, base)));
  return generated;
}
