# catalog-search-blog: a browse/filter/search UI, built from two JSON files

The runnable companion to `docs/guides/catalog-and-search.md`. Fieldnotes is a five-post
blog whose entire listing page — the post list, the tag facet, the series facet, and the
search box — is rendered client-side from `assets/unify/catalog.json` and
`assets/unify/search-corpus.json`, the two files `--catalog`/`--search-corpus` write once
at build time. Nothing here is queried on a server; there isn't one.

```bash
cd examples/catalog-search-blog
unify build -s src -o dist \
  --generate _scripts/gen.mjs \
  --pretty-urls \
  --base-url https://example.com/blog/ \
  --catalog --search-corpus
```

Both gates pass, dependency-free (no `npm install` anywhere in this example):

```bash
unify build -s src -o dist --generate _scripts/gen.mjs --pretty-urls \
  --base-url https://example.com/blog/ --catalog --search-corpus --dry-run --strict   # exit 0
unify audit -s src --generate _scripts/gen.mjs --pretty-urls \
  --base-url https://example.com/blog/ --catalog --search-corpus                      # exit 0, nothing to report
```

14 files: an index, five posts, two generated series pages, the stylesheet, the client
script, `assets/unify/catalog.json`, `assets/unify/search-corpus.json`, `sitemap.xml`, and
`feed.xml` — the last two aren't this example's subject, but `--base-url` plus five posts
declaring `schema: BlogPosting` activate them the same way they would on any site, so they
ship too.

## What to open

`dist/index.html` is the whole demonstration, but `fetch` needs an HTTP origin — opening
the file directly (`file://`) leaves the list on its static fallback (see below) with the
search box and facets inert. `unify dev` serves and rebuilds on change:

```bash
unify dev -s src -o dist --generate _scripts/gen.mjs --catalog --search-corpus
```

then open <http://localhost:3000/>. (`--pretty-urls`/`--base-url` are left off here because
`--base-url` changes every emitted path to start with its subpath while `dev` always serves
the built output at the root, so the two only combine usefully when the base URL has no
path segment — this example's `https://example.com/blog/` does, so it is a `build`-only
flag here.)

## What each generated file contains

`assets/unify/catalog.json` carries one entry per public page — `path`, `url`, and the
built page's own head/body facts (title, every `<meta>`, the heading outline). The listing
page (`assets/js/blog.js`) filters this to pages declaring `schema: BlogPosting`, sorts
newest-first by each page's own `date`, and builds the tag and series facets from whatever
`<meta name="tags">`/`<meta name="series">` values the posts happen to have — neither facet
is hardcoded, because neither key is unify vocabulary. `writing-posts-in-markdown.md`
deliberately declares no `series`, to show that a facet built from real metadata just
doesn't offer a value nothing declared.

`assets/unify/search-corpus.json` carries `path` and folded visible text, nothing else,
for the same pages. The search box lowercases the query, filters the corpus for a
substring match, and joins each hit back to its full catalog entry by `path` — the field
both files share.

## The subpath-safe fetch

`assets/js/blog.js` resolves both files relative to its own URL —

```js
const catalogUrl = new URL("../unify/catalog.json", import.meta.url);
const corpusUrl = new URL("../unify/search-corpus.json", import.meta.url);
```

— rather than as root-relative paths. unify rewrites `href`/`src` it finds in HTML under
`--base-url`, but it mirror-copies `blog.js` byte-for-byte and never rewrites a URL inside
JavaScript; a hardcoded `/assets/unify/catalog.json` would fetch the *root's* catalog the
moment this site moved under a subpath. `import.meta.url` is the address the script
actually loaded from, so the relative path resolves correctly at any deploy address with
no edit — see §4 of the guide.

## The generator, and what it reads from `generator-context.json`

`_scripts/gen.mjs` is the `--generate` script (`docs/cli-reference.md`'s `--generate`
section, conformance-spec §33.2). Reading `posts/*.md` itself (unify hasn't scanned
anything yet at this point in the build), it writes three things into the overlay:

1. **One archive page per `series:` value** (`series/fundamentals.html`,
   `series/recipes.html`) — a real, crawlable page listing that series' posts, newest
   first.
2. **A nav fragment** (`_includes/series-nav.html`) linking to each series page, included
   from `_includes/header.html` on every page. Nothing hand-maintains this list; a new
   `series:` value in a post adds a page and a nav entry with no other edit.
3. **A plain link list of every post** (`_includes/post-list.html`), included into
   `index.html`'s `<ul id="posts">`. `assets/js/blog.js` replaces this the moment its
   fetch resolves, but until then — and for a crawler, or a browser with JavaScript off —
   it's a real, working list of links. It's also what keeps every post reachable by a
   static crawl with no hand-written nav: `unify audit` reports a `page-orphan` finding
   for a page nothing links to, and without this list `writing-posts-in-markdown.md`
   (the one post with no `series`, so it's in no generated series page either) would be
   exactly that.

`_scripts/gen.mjs` reads `generator-context.json` (`process.argv[4]`) for one decision:
whether to write a `<link rel="canonical">` on each series page. `context.site.baseUrl` is
the effective `--base-url` this build is about to apply, or `null` without the flag — a
canonical only means something once it can be made absolute, so it's added only once a
base address is actually known, the same call `examples/eleventy-htmx`'s generator makes
for `og:url`.

## What each primitive is doing here

| Primitive | Where |
|---|---|
| `<include src>` | the header/footer, hand-authored in `src/_includes/`; the series nav and the post-list fallback, generated into the overlay's `_includes/` |
| Layout | one `src/_layout.html` wraps every page, generated ones included |
| Named slot | the footer, with fallback content no page overrides |
| Underscore | `_includes/` and `_scripts/` are read by the build and never ship |
| Markdown + frontmatter | five posts; `tags`/`series`/`description`/`date`/`schema` all become `<meta>` tags, with no schema unify registers anywhere |

Plus the production layer: `--pretty-urls`, `--base-url`, `--catalog`, `--search-corpus`,
`schema: BlogPosting`, and the `feed.xml`/`sitemap.xml` that combination activates for
free.
