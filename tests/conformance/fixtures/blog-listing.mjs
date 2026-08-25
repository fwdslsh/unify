/**
 * blog-listing.mjs — the "browser-side listing script" the brief's §29.7
 * calls for, and a literal transcription of docs/guides/catalog-and-search.md
 * §2/§3/§5's own code blocks (metaValue/metaValues, the posts filter+sort,
 * byTag/bySeries, byPath+search). It is plain data manipulation over parsed
 * JSON — no DOM, no unify import, nothing that couples it to src/** — so it
 * runs unchanged under bun (the test runner) or a real browser (the guide's
 * own claim). blog-e2e.test.js imports this module rather than reimplementing
 * the logic inline, so a divergence between the guide's prose and this file
 * is a diff a human can see, and running it against the real CLI's output is
 * what proves the guide's snippets still work, not just that they parse.
 *
 * Deliberately NOT a unify feature: there is no "collections" primitive
 * anywhere in unify (product-spec's non-goals), and nothing here reaches back
 * into unify to get an answer — every function takes the already-parsed
 * catalog.json / search-corpus.json as plain arguments and returns plain
 * arrays. That is the brief's point: the two JSON files alone are enough.
 */

// ---- docs/guides/catalog-and-search.md §2 ---------------------------------

export function metaValue(page, name) {
  const hit = page.head.meta.find((m) => m.name === name);
  return hit ? hit.content : undefined;
}

export function metaValues(page, name) {
  return page.head.meta.filter((m) => m.name === name).map((m) => m.content);
}

// ---- §3: kind facet, newest-first sort, tag/series filters -----------------

export function selectPosts(catalog) {
  return catalog.pages
    .filter((p) => ["BlogPosting", "Article"].includes(metaValue(p, "schema")))
    .sort((a, b) => new Date(metaValue(b, "date")) - new Date(metaValue(a, "date")));
}

export function byTag(catalog, tag) {
  return catalog.pages.filter((p) => metaValues(p, "tags").includes(tag));
}

export function bySeries(catalog, name) {
  return catalog.pages.filter((p) => metaValue(p, "series") === name);
}

export function tagCounts(catalog) {
  const counts = new Map();
  for (const page of catalog.pages) {
    for (const tag of metaValues(page, "tags")) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

// ---- §5: full-text search, joined back to the catalog by path -------------

export function buildByPath(catalog) {
  return new Map(catalog.pages.map((p) => [p.path, p]));
}

export function search(corpus, byPath, query) {
  const q = query.toLowerCase();
  return corpus.pages
    .filter((p) => p.text.toLowerCase().includes(q))
    .map((hit) => byPath.get(hit.path));
}
