# eleventy-htmx: Eleventy inside `--generate`, htmx on top

Ashgrove Instruments makes the Redpoll river-level sensor. The site is a product front
page, three documentation pages, and a release-notes stream filtered by topic — where the
filter is a real page you can link to and an htmx swap when JavaScript is available.

**The point of the example is that unify needed no Eleventy support to do this.**
`--generate` names one file, runs it before the scan, and adopts whatever it wrote into an
overlay directory as ordinary source. Eleventy runs inside that seam, reads the release
notes as a collection, and writes four pages and five fragments. unify then composes those
generated pages into `src/_layout.html` by the same discovery walk it uses for hand-written
ones, and reference-checks, collision-checks and publishes them in the same transaction.
Neither tool knows the other exists.

```bash
cd examples/eleventy-htmx
npm install
unify build -s src -o dist \
  --generate _scripts/eleventy.mjs \
  --pretty-urls
```

From a checkout of this repository, substitute `bun ../../src/cli.js` (or
`node ../../src/cli.js`) for `unify`.

Both gates pass:

```bash
unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls --dry-run --strict  # exit 0
unify audit -s src --generate _scripts/eleventy.mjs --pretty-urls --strict                    # exit 0
```

23 files: 11 authored pages, 4 generated pages, 5 fragments, and 3 assets.

`package.json` wraps these as `npm run check`, `npm run audit`, `npm run publish` and
`npm run dev` — the same flags in every one, so the gate checks what actually ships.

## Who decides what

| Concern | Owner |
|---|---|
| Which release notes exist, and in what order | **Eleventy** — one `addCollection` over `notes/*.md` |
| Deriving a view per topic | **Eleventy** — `pagination`, `size: 1`, over the `views` list |
| Site-wide data | **Eleventy** — the data cascade, `src/_data/site.json` |
| Emitting the derived pages and fragments | **Eleventy** — three `.11ty.js` templates, nine files |
| Markdown → HTML, for every page including the release notes | **unify** |
| Page chrome: layout discovery, slots, `<include>` splicing | **unify** — Eleventy has no layouts here |
| `<head>`: title join, description, charset, stylesheet, icon | **unify** |
| URL rewriting, `--pretty-urls`, reference and collision checks | **unify** |
| JSON-LD from `schema:` | **unify** |
| Shipping htmx and every other asset | **unify** — mirror copy, byte-for-byte |
| Working without JavaScript | **the markup** — real `href`s, and the default view `<include>`d at build time |

The one-sentence version: **Eleventy decides what pages exist; unify decides what a page is.**

## What each primitive is doing here

| Primitive | Where |
|---|---|
| `<include src>` | the masthead and footer in `src/_includes/`; and, in every generated page, the release-list fragment that page also serves to htmx |
| Layout | one `src/_layout.html` wraps every page, generated ones included — no page names it, and there is no Eleventy layout anywhere in the tree |
| Named slot | `<slot name="aside">`, filled by `src/docs/index.html` and by the four generated pages, showing its fallback on everything else |
| Underscore | `_data/`, `_scripts/`, `_11ty/` and `_includes/` are read by the build and never ship |
| `.fragment.html` | the five generated snippets: spliced in at build time *and* served byte-for-byte to `hx-get` |

Plus `--pretty-urls` and `schema: BlogPosting` on the six release notes, which gives each
one a JSON-LD block.

## The generator

`--generate` names one file and hands it two arguments — the source root and an empty
overlay directory — with the working directory set to the source root. It runs as a
subprocess of unify's own runtime, so there is no second runtime to install, and a non-zero
exit is a located build failure (P29) that leaves the previous `dist/` untouched.

`src/_scripts/eleventy.mjs` is 21 lines of code under its comments. It:

1. **Reads `_data/site.json` directly** — cwd is the source root, so this is the same file
   Eleventy's data cascade exposes to templates as `site`.
2. **Constructs Eleventy with input `"."` and output `generatedDir`.** The input must be
   relative to cwd; an absolute path silently disables directory data files and permalinks.
   Nothing is ever written into the source tree, which is why `unify audit` stays read-only.
3. **Restricts the template formats to `md` and `11ty.js`.** Without this Eleventy also
   claims the authored `.html` pages and writes them on top of the source tree.
4. **Sets `permalink: false` globally.** The release notes are unify's pages; Eleventy reads
   them into a collection and writes none of them. Only the three templates opt back in.
5. **Names an absolute `configPath`.** Two settings — `markdownTemplateEngine` and
   `keys.layout` — exist only in a config *file*, and the file lives under `_11ty/` so it
   never ships; Eleventy's auto-discovery would otherwise look in the source root.

Those last two config keys are load-bearing, not hygiene. `markdownTemplateEngine: false`
is why `src/notes/2026-06-30-firmware-2-6-0.md` can contain a code sample with
`{{ level_mm }}` and `{% if dry %}` in it: leave Liquid on and that prose takes the whole
build down with a parse error. `keys.layout` renames Eleventy's `layout:` frontmatter key
to one nothing uses, so `layout:` in this tree means unify's key and only unify's.

## The one sharp rule: a fragment is two files

This is the thing to copy, and the thing to get wrong.

A `.fragment.html` lives two lives. unify splices it into a page with `<include>` and
rewrites the links **in that copy**; unify also ships the file itself byte-for-byte for
htmx to fetch, rewriting **nothing**. So a link inside a fetched fragment has to be a string
that is already correct before any rewriting — and under `--pretty-urls`, the source
spelling is not that string:

```
source spelling   href="/notes/firmware.html"
  composed  ->    href="/notes/firmware/"          rewritten, correct
  fetched   ->    href="/notes/firmware.html"      never written by this build. 404.
```

So `_11ty/lib/render.mjs` emits addresses **in their published spelling** —
`/notes/firmware/`, `/notes/2026-06-30-firmware-2-6-0/` — which inverts the usual advice in
`docs/authoring-rules.md` ("always link the real filename"). unify resolves the pretty
spelling against the emitted page, finds it, and leaves it exactly as written, so both
copies carry one identical string. Authored *pages* keep the ordinary source spelling; only
the generated fragments do this, and the reason is that only they are fetched.

The same logic makes `hx-get` root-absolute. `<include>` and `hx-get` in a generated page
name the same file with the same string:

```html
<div id="releases"><include src="/notes/firmware.fragment.html"></include></div>
...
<a href="/notes/firmware/" hx-get="/notes/firmware.fragment.html">Firmware</a>
```

That pairing is also the only tripwire an `hx-get` path has. unify checks an `<include src>`
and never an `hx-get`, so a misspelled fetch address is a 404 the reader finds — but because
every page includes the fragment it also serves, a name that does not exist fails the build.

## htmx: `hx-boost`, and one swap

`hx-boost="true"` sits on the layout's body element, so every ordinary anchor becomes a
background fetch that swaps the body. It is safe at that level *here* because every anchor
on every page points at a real HTML document — nothing links to a raw `.fragment.html` and
nothing links to a feed. With JavaScript off, all of them are just links.

The topic tabs are the one place something smaller happens. They live inside the swapped
panel, so the `aria-current` marking updates with the list, and each tab carries both a
real `href` to a real page and an `hx-get` for the fragment. htmx processes explicit verbs
before it boosts anything, so an anchor with its own `hx-get` is never boosted. With
JavaScript off the tab is a link to a page that already contains exactly the markup the
swap would have produced, because that page includes the same fragment at build time.

The address bar does not change on a swap and nothing tries to make it: the shareable
address of a filtered view is the tab's own `href`.

## What this does not do

- **No `--base-url`, and the site deploys at a domain root.** `--pretty-urls` moves a
  non-index page one directory deeper and unify rewrites `href` but never `hx-get`, so
  every fetched address here is root-absolute. Add `--base-url https://example.com/` (a
  domain root) and the build still passes, gaining `sitemap.xml`, `feed.xml` with six
  entries, and `--canonical auto`. Add a **subpath** base URL and the build still exits 0
  while every `hx-get` silently 404s, because the `href` beside it gets the prefix and the
  `hx-get` does not:

  ```
  <a href="/redpoll/notes/firmware/" hx-get="/notes/firmware.fragment.html">Firmware</a>
  ```

  That is a real limit of mixing runtime fetching with build-time URL rewriting, not an
  oversight. A subpath deploy needs relative `hx-get`s and a flat directory, which
  `--pretty-urls` then rules out in turn.
- **No feed link in the chrome.** `feed.xml` exists only under `--base-url`, so linking it
  would make the documented build fail on its own site. The notes still declare
  `schema: BlogPosting`, so the feed appears the moment a base URL does.
- **No Eleventy layouts, filters, shortcodes or `.njk`.** Eleventy is used for exactly what
  unify has no opinion about — collections, pagination and a data cascade.
- **No incremental build.** The generator re-runs on every rebuild, including every
  `unify dev` rebuild, which is what keeps the derived pages from going stale mid-session.

## Files

```
package.json                       four scripts; @11ty/eleventy is the only dependency
package-lock.json                  committed, so npm install reproduces the tested Eleventy
src/
  _layout.html                     the one layout: two slots, hx-boost, the asset links
  _includes/{header,footer}.fragment.html
  _data/site.json                  Eleventy's global data — the topic list. Holds no URL.
  _scripts/eleventy.mjs            the --generate entry point
  _11ty/eleventy.config.mjs        the two keys only a config file can set
  _11ty/lib/render.mjs             shared markup, so a page and its fragment cannot disagree
  _11ty/view-page.11ty.js          one PAGE per view     -> notes/index.html, notes/<slug>.html
  _11ty/view-fragment.11ty.js      one FRAGMENT per view -> notes/<slug>.fragment.html
  _11ty/latest.11ty.js             one fragment          -> latest.fragment.html
  index.html, docs/*, notes/*.md   the authored site: 11 pages
  assets/                          one stylesheet, htmx, a favicon. No build step.
```

`node_modules/` and `package.json` sit at the example root, beside `src/`, never inside it:
a `package.json` at the source root would ship into `dist/`.
