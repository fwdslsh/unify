# A blog list and search, from `catalog.json` and `search-corpus.json`

**Role**: The recipe for the two most common things people reach for a "collections
feature" to get — a blog index sorted newest-first with tag facets, and a search box —
built instead from `--catalog`/`--search-corpus` and a script you own. unify computes
neither list nor index at request time; both files are written once, at build time, and
everything below runs entirely in the browser against the finished JSON. Read
[`../authoring-rules.md`](../authoring-rules.md) and the catalog/search-corpus section of
[`../getting-started.md`](../getting-started.md) first. Every snippet on this page was run
against a small three-post scratch site built with `--catalog --search-corpus --base-url
https://example.com/blog/ --pretty-urls` — the paths and values below are its real output,
not invented ones.

## 1. What the two files hand you

`catalog.json`: one entry per public page, in build order — `path`, `url`, `html`
(root-element attributes), `head` (`title`, `meta`, `link`, `base`), and `body`
(attributes and a flat heading list). No body text. A post that declared:

```yaml
---
title: Full-Text Search with the Corpus
schema: BlogPosting
date: 2026-02-10T09:00:00Z
description: Joining search-corpus.json hits back to catalog entries.
tags: [unify, search]
series: fundamentals
---
```

lands in `catalog.json` as:

```json
{
  "path": "/blog/posts/second-post/",
  "url": "https://example.com/blog/posts/second-post/",
  "html": { "attributes": { "lang": "en" } },
  "head": {
    "title": "Full-Text Search with the Corpus — Scratch Blog",
    "meta": [
      { "charset": "utf-8" },
      { "name": "schema", "content": "BlogPosting" },
      { "name": "date", "content": "2026-02-10T09:00:00Z" },
      { "name": "description", "content": "Joining search-corpus.json hits back to catalog entries." },
      { "name": "tags", "content": "unify" },
      { "name": "tags", "content": "search" },
      { "name": "series", "content": "fundamentals" }
    ],
    "link": [],
    "base": []
  },
  "body": {
    "attributes": {},
    "headings": [{ "level": 1, "id": "full-text-search-with-the-corpus", "text": "Full-Text Search with the Corpus" }]
  }
}
```

Every frontmatter key that isn't `title`/`layout`/`class`/`lang`/`dir`/`schema` becomes a
`<meta name="…">` entry, in declaration order, repeated as many times as you wrote it —
`tags` above is two entries, not an array, because that is what the built page's own
`<head>` contains. `series` is not special to unify; it is exactly as unknown to the build
as `tags` is, which is the point: any frontmatter key you invent shows up here the same
way, with no unify-side registration.

`search-corpus.json` is deliberately smaller: `path` and `text`, nothing else, for the
same set of pages —

```json
{ "path": "/blog/posts/second-post/", "text": "Full-Text Search with the Corpus The search corpus holds a folded copy of every public page's visible text, keyed by path, ready for a client-side search library like MiniSearch." }
```

`path` is the join key on purpose — the one field both files share verbatim, so a search
hit's `path` looks up everything else about that page in the catalog.

## 2. Reading `meta` like a browse UI would

The catalog's `meta` array is a flat list, not an object — because a page can repeat a
name (`tags`) and because `name` and `property` are different fields that must not
collide. Two small helpers cover everything below:

```js
function metaValue(page, name) {
  const hit = page.head.meta.find((m) => m.name === name);
  return hit ? hit.content : undefined;
}
function metaValues(page, name) {
  return page.head.meta.filter((m) => m.name === name).map((m) => m.content);
}
```

`metaValue(post, "date")` reads a single-valued key; `metaValues(post, "tags")` reads a
repeated one. Nothing here is catalog-specific — `page.head.meta` has the same shape
`unify audit --format json`'s own `document.head.meta` does, because both are the same
`DocumentSnapshot`, so the same two helpers work against either.

## 3. A static blog list: kind, sort, tags

Select the posts (declaring `schema: BlogPosting` or `Article`, the "kind" facet), newest
first by their own `date`:

```js
const posts = catalog.pages
  .filter((p) => ["BlogPosting", "Article"].includes(metaValue(p, "schema")))
  .sort((a, b) => new Date(metaValue(b, "date")) - new Date(metaValue(a, "date")));
```

Sort by `new Date(...)`, not by comparing the date strings directly — two authors can
write the same instant with different UTC offsets (`...T09:00:00-05:00` sorts *before*
`...T09:00:00Z` as plain text, despite naming a later moment), and `Date` parses the
offset instead of comparing bytes.

A tag facet, and filtering by any other key exactly the same way — `series` here, though
it could be any frontmatter key at all:

```js
const byTag = (tag) => catalog.pages.filter((p) => metaValues(p, "tags").includes(tag));
const bySeries = (name) => catalog.pages.filter((p) => metaValue(p, "series") === name);

byTag("search");            // → the one post tagged "search"
bySeries("fundamentals");   // → the two posts in that series
```

Or a full tag cloud, counting every tag across the catalog:

```js
const tagCounts = new Map();
for (const page of catalog.pages) {
  for (const tag of metaValues(page, "tags")) {
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
}
```

Rendering the list is ordinary DOM code — nothing about `catalog.json` requires a
framework:

```js
const list = document.querySelector("#posts");
for (const post of posts) {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = post.path;
  a.textContent = post.head.title;
  li.append(a, ` — ${metaValues(post, "tags").join(", ")}`);
  list.append(li);
}
```

`post.path` is already root-relative (or already prefixed, once you built with
`--base-url` under a subpath — see §4) and already the page's real emitted address, so
`a.href = post.path` needs no further resolution.

## 4. The module-URL-relative fetch, so a subpath deploy doesn't break it

unify rewrites a root-relative `src`/`href` it finds *in your HTML* — a
`<script type="module" src="/assets/js/blog.js">` in a page you author becomes
`<script type="module" src="/blog/assets/js/blog.js">` once you build with `--base-url
https://example.com/blog/`. It does not, and cannot, do the same inside the JavaScript
itself: `blog.js` is a plain asset, mirrored byte-for-byte (product-spec's mirror-copy
rule), and nothing scans its text for a `fetch(...)` call to rewrite. A `fetch("/assets/unify/catalog.json")`
hardcoded in that file fetches the *root's* catalog, not the subpath's, the moment the
site moves under a prefix.

The fix costs nothing at build time: resolve both files relative to the module's own URL,
which the browser always resolves correctly regardless of where the site is hosted,
because `import.meta.url` is the address the script actually loaded from:

```js
// assets/js/blog.js — one directory below the site root, same as assets/unify/
const catalogUrl = new URL("../unify/catalog.json", import.meta.url);
const corpusUrl = new URL("../unify/search-corpus.json", import.meta.url);

const [catalog, corpus] = await Promise.all([
  fetch(catalogUrl).then((r) => r.json()),
  fetch(corpusUrl).then((r) => r.json()),
]);
```

Loaded from `https://example.com/assets/js/blog.js`, `catalogUrl` resolves to
`https://example.com/assets/unify/catalog.json`. Loaded — unmodified, same source file —
from `https://example.com/blog/assets/js/blog.js` (this site, under `--base-url
https://example.com/blog/`), it resolves to `https://example.com/blog/assets/unify/catalog.json`.
The relative path (`../unify/...`) only has to describe where `assets/js/` sits next to
`assets/unify/`; unify's own script-tag rewriting (§4.1) already put the module at the
right absolute address, so the module never has to know the site's prefix itself. Put your
own script at a different depth and adjust the number of `../` segments to match — the
pattern is "relative to the module," not this exact path.

## 5. Full-text search, joined back to the catalog

`search-corpus.json` carries no title, no description, no tags — every one of those
already lives in `catalog.json`, keyed by the same `path`. Build one lookup, filter the
corpus, and join each hit back through it:

```js
const byPath = new Map(catalog.pages.map((p) => [p.path, p]));

function search(query) {
  const q = query.toLowerCase();
  return corpus.pages
    .filter((p) => p.text.toLowerCase().includes(q))
    .map((hit) => byPath.get(hit.path));
}

const [result] = search("MiniSearch");
result.head.title;                     // "Full-Text Search with the Corpus — Scratch Blog"
metaValue(result, "description");      // "Joining search-corpus.json hits back to catalog entries."
metaValues(result, "tags");            // ["unify", "search"]
```

That plain substring search is a real, working search box with zero dependencies — fine
for a site of dozens or low hundreds of pages. `text` is already folded (every Unicode
space character, `&nbsp;` included, collapsed to an ordinary one — conformance-spec §30.5)
so a query typed with a normal space still matches a heading the author wrote with a
non-breaking one; nothing else about the text is transformed, so match ranking, stemming,
and typo tolerance are still yours to add.

## 6. A relevance-ranked search: MiniSearch, sketched

Past plain substring matching, a small indexing library reads `search-corpus.json`
exactly as written — it needs no unify-specific adapter, because the file is just
`{schemaVersion, pages: [{path, text}]}`. This sketch (tested against the same scratch
fixture, using [MiniSearch](https://github.com/lucaong/minisearch); FlexSearch's index/add/search
shape is the same idea) is illustrative — unify ships no search runtime and adds no such
dependency itself, so pick a library and pin a version the way you would for any other
client-side code:

```js
import MiniSearch from "minisearch";

const miniSearch = new MiniSearch({ idField: "path", fields: ["text"] });
miniSearch.addAll(corpus.pages);

const hits = miniSearch.search("MiniSearch");   // → [{ id: "/blog/posts/second-post/", ... }]
const results = hits.map((hit) => byPath.get(hit.id));
```

`idField: "path"` is the whole adapter: it tells MiniSearch to key its index on the same
field the catalog joins on, so a hit's `id` is a `catalog.json` `path` you can look up in
the same `byPath` map §5 built. Everything else — tokenizing, scoring, prefix and fuzzy
matching — is the library's job, unrelated to what unify wrote.

## 7. Where htmx fits alongside this

htmx swaps HTML fragments; `catalog.json`/`search-corpus.json` are JSON with no HTML
rendering of their own, so htmx has no direct role in reading them — the DOM-building
above is plain `fetch` and `document.createElement`, the same as it would be without htmx
on the page at all. Where htmx *does* fit is alongside a generator-produced set of
pre-built filtered views, the architecture [the Eleventy + htmx
guide](eleventy-htmx.md) covers end to end: a real page per tag or series (written by a
`--generate` script, each one a page that would `<include>` the identical list a filter
would have produced), boosted with `hx-boost` so navigating between them feels instant,
with `href` and `hx-get` both naming a real address. That gives every filtered view a
shareable URL and a JavaScript-off fallback that is the site itself, exactly as §8 of that
guide describes.

The search box is the one view that architecture cannot pre-build — a query is arbitrary
text, not a fixed set of tag values — which is exactly the gap `search-corpus.json` exists
to fill: no server, no generated page per possible query, one JSON file fetched once and
searched entirely in the browser.
