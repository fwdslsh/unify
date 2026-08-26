# Advanced examples

Eight sites. Four were built by an agent that had never seen unify before — it was given
`docs/authoring-rules.md`, a client brief, and the compiled CLI, in a sandbox with no other
documentation. They are kept because they passed review, not because they were written to
be examples: what they show is what the 60 lines actually lead someone to build.

The first two are one brief solved two ways; the third is a later, larger brief; the fourth integrates a Svelte component (its extra steps: `npm install`, then `npm run build:calculator && npm run build:notes` — the build scripts live in `_scripts/` at the example root). The fifth, `htmx-fragments`, is hand-maintained: no sandboxed agent could download htmx, so it is written and tested by the maintainers to document the fragment + htmx pattern. The sixth, seventh, and eighth are hand-maintained too, and have sections of their own below. All build clean:

```bash
cd seed-library
node src/_scripts/gen.mjs
unify build -s src -o dist --pretty-urls --base-url https://fernhollow.pages.dev/library/
```

| | `seed-library` | `seed-library-alt` | `seed-library-ondemand` |
|---|---|---|---|
| varieties | 27 | 27 | 225 |
| pages | 41 | 42 | 232 |
| layouts | 2 | 3 | 2 |
| `<include>` | 4 | 5 | 5 |
| named slots | 1 | 0 | 1 |
| `data-layout="none"` | 1 | 1 | 0 |
| catalogue loading | in page | in page | fetched per family |

## `unify-docs` — the dogfooding site

The sixth is different in kind: it is unify's own documentation site, built by unify from the
repository's real `docs/` directory (issue #51). Nothing is copied — `_scripts/gen.mjs` reads
`../../../docs` through `--generate`, so the site cannot drift from the documentation it
renders. It exercises the production layer end to end (`--pretty-urls`, `--base-url`,
`--canonical auto`, `sitemap.xml`, `--catalog`, `--search-corpus`, `schema:`) and both gates pass:
`build --dry-run --strict` and `audit --strict` each exit 0.

It was built to be a source of friction rather than a showcase, and
[`unify-docs/FINDINGS.md`](unify-docs/FINDINGS.md) is the result: a bug in the `--generate`
contract (generated pages silently get no layout), a related gap in include resolution, one
real defect in the docs (fixed), and five things that worked better than expected.

`AUTHORS-NOTES.md` in each is the author's own write-up, unedited — including what it found
unclear. That is more useful than a tidy narration would be.

## `eleventy-htmx` — another generator's output, adopted as source

The seventh answers "can I keep the generator I already have?". Ashgrove Instruments is a
product front page, three documentation pages, six release notes, and a release stream
filtered by topic — where the filter is a real page you can link to *and* an htmx swap when
JavaScript is available. Eleventy owns the collection, the pagination and the data cascade;
unify owns every page's chrome, `<head>`, URLs and checks. `src/_scripts/eleventy.mjs` is 24
lines: it constructs Eleventy with unify's overlay directory as its output and calls
`write()`. Nothing Eleventy-shaped exists in unify core, and nothing unify-shaped exists in
the Eleventy config — the existing `--generate` seam was already enough.

```bash
cd eleventy-htmx
npm install
npm run build
```

`npm install` brings both dependencies — Eleventy, and the `unify` binary the four scripts
call — so `npm run build`, `check`, `audit` and `dev` all work with no global install.

23 files: 11 authored pages, 4 generated pages, 5 fragments, 3 assets. Both gates exit 0
(`build --dry-run --strict` and `audit --strict`), on Bun and on Node, with byte-identical
output. [`docs/guides/eleventy-htmx.md`](../docs/guides/eleventy-htmx.md) is the guide: the
division-of-responsibilities table, the measured watch behaviour edit case by edit case
(including what the watcher cannot see, because it lives outside the source root), what a
thousand-note input does to build time, and a plain account of what this stack cannot
deploy and should not attempt.

## `catalog-search-blog` — a blog list, filters, and search from two JSON files

The eighth is the runnable companion to `docs/guides/catalog-and-search.md`: a five-post
blog, Fieldnotes, whose entire listing page — post list, tag facet, series facet, and
search box — is rendered client-side from `assets/unify/catalog.json` and
`assets/unify/search-corpus.json`, the two files `--catalog`/`--search-corpus` write once
at build time. No framework, no server, and (unlike `eleventy-htmx`) no dependency at all —
it belongs to the dependency-free half of gate G13.

```bash
cd catalog-search-blog
unify build -s src -o dist --generate _scripts/gen.mjs --pretty-urls \
  --base-url https://example.com/blog/ --catalog --search-corpus
```

12 source files, 14 built. Both gates pass — `build --dry-run --strict` and `audit`, the
latter with nothing to report, not merely nothing blocking. `_scripts/gen.mjs` is the
`--generate` seam demonstrated with no other generator in the loop: it reads
`generator-context.json` (`process.argv[4]`, new in 0.9) to decide whether a `<link
rel="canonical">` on each of its generated per-series archive pages can be made absolute,
and it writes the plain-link fallback list `assets/js/blog.js` overwrites once its fetch
resolves — the JavaScript-off path that also keeps every post reachable by a static crawl.
[`catalog-search-blog/README.md`](catalog-search-blog/README.md) has the rest, including
what each generated JSON file actually contains.

## The patterns worth copying

**Pages generated from data, by a script you run yourself.** unify has no data files and no
collections. `src/_scripts/gen.mjs` reads `varieties.json` and writes one Markdown page per
variety into the source tree; `unify build` then treats them as ordinary pages. The script
lives under `_scripts/` so it never ships, and the build step is two commands, not a plugin:

```bash
node src/_scripts/gen.mjs && unify build
```

The same shape produces the seasonal-notes index — read the entries' frontmatter, write the
index page — so nobody maintains a list by hand.

**Client-side filtering with no framework and no fetch.** The catalogue page renders every
variety at build time with its family and name on the element, and a small inline script
hides and shows them. There is no request, so nothing 404s on a subpath deploy and the page
works from `file://`. Do this whenever the data is small enough to ship in the page.

**Fetching on demand, without hardcoding the deploy address.** When the data is too large
to inline — `seed-library-ondemand` has 225 varieties across 12 families — the browse page
loads one family at a time. The problem this creates is that unify rewrites `href` and
`src` under `--base-url` but never a URL inside JavaScript, so a root-relative `fetch()`
path silently 404s at a subdirectory address while resolving fine locally.

The example's answer is to never write the URL in JavaScript at all. Each family is a real
anchor pointing at its own JSON:

```html
<a href="/catalogue/data/allium.json" data-family="Allium">Allium</a>
```

which unify rewrites to `/library/catalogue/data/allium.json` like any other link. The
script intercepts the click and reads `link.href` — already absolute, already correct —
and fetches that. The deploy address appears nowhere in the JavaScript, and the page still
works with JavaScript off, because the anchors are real links. Writing the fetch path
relative to the page (`../data/allium.json`) is also correct and simpler; hardcoding
`/library/` works until the day the site moves. That day came: `seed-library-alt`'s
client-rendered catalogue cards hardcoded `/library/catalogue/…`, and when these examples
went live on unify's own docs site under `/examples/seed-library-alt/` every card 404'd.
Its template was edited after authoring to the page-relative `${v.slug}/` — the one change
ever made to a sandbox-authored tree, recorded here because these sites are evidence.

**A section that looks different but shares chrome.** `seasonal-notes/_layout.html` (in `seed-library`) is a complete
standalone document with its own styling, and pulls the same header and footer fragments the
site layout uses — which is what `<include>` is for. One page in that section opts back out
to the site layout with `data-layout`.

**A page with no chrome at all.** The availability page is embedded in another
organisation's CMS, so it carries `data-layout="none"` and ships as bare content.

**Deploying under a subdirectory.** Every link is written root-relative and the address is
supplied once at build time. Nothing in the source hardcodes the domain, so the same tree
publishes to a different host by changing one flag.

**Fragments fetched by htmx, with a no-JS fallback.** `htmx-fragments` is the
`.fragment.html` feature working end to end: the month lists are bare fragments a button
swaps in with `hx-get`, htmx itself is **vendored** (`src/assets/js/htmx.min.js`, copied
from the npm package — the site loads nothing from another origin, and unify rewrites the
script tag like any URL), and the opening-hours panel is one file consumed twice — spliced
into the Visit page by `<include>` at build time, fetched raw by anyone else at runtime.
Two details carry the pattern. The `hx-get` values are **page-relative** on purpose:
unify rewrites `href`/`src` but never `hx-get`, so a root-relative value would silently
miss the `--base-url` prefix — relative to the page, they resolve at any deploy address.
And the default month is *included* into the page at build time, so the content is there
before htmx loads, with JavaScript off, and for every crawler; the buttons only swap it.

**A whole second generator, adopted through one flag.** `eleventy-htmx` runs Eleventy
inside `--generate` and hands unify its output. The seam is one directory: Eleventy's
output directory is the overlay unify created for that build, so everything it writes is
scanned, composed into `src/_layout.html` by the ordinary discovery walk,
reference-checked, collision-checked and published in the same transaction as the files
you wrote by hand. Three settings do the real work — Eleventy's input is `"."` (relative to
the working directory, which is the source root), its template formats are narrowed to
`md` and `11ty.js` so it does not claim the authored `.html` pages, and a global
`permalink: false` means it reads the release notes into a collection and writes none of
them. Two hazards are worth taking from it. An Eleventy layout on top of a unify layout
exits 0 and publishes two mastheads, two footers and a `<!doctype html>` in the middle of
the body, so the example renames Eleventy's `layout:` key out of existence rather than
trusting nobody to use it. And a generator is a subprocess on **every** rebuild — which is
what keeps watch output honest, and what makes a thousand-note content tree a three-second
editor loop.

It also answers the `hx-get` addressing question the opposite way to `htmx-fragments`
above, and both answers are right. Page-relative values resolve at any deploy address but
need a flat directory layout; `eleventy-htmx` uses `--pretty-urls`, which moves pages a
directory deeper, so it writes every fetched address root-absolute in the *published*
spelling — the one string that is correct both in the copy unify splices into a page and in
the byte-for-byte copy htmx fetches. The price is stated rather than hidden: that site
deploys at a domain root only, because a subpath `--base-url` prefixes the `href` beside
each `hx-get` and leaves the `hx-get` alone.

**A Svelte component on one page, without adopting a framework for the site.**
`forge-svelte` integrates a fee estimator maintained as a `.svelte` file by someone
else. The shape: `npm i svelte esbuild esbuild-svelte`, a ~20-line `_scripts/` build
that compiles and bundles the component to one plain JS file under `assets/`, and a
`<script src="/assets/js/fee-calculator.js">` that unify rewrites like any other URL.
unify needs to know nothing about Svelte: the bundle is an ordinary asset, mirror-copied;
`node_modules/` at the source root never ships (it is on the never-shipped list); and
the repeatable pipeline is two npm scripts plus `unify build`. The one hazard is not
unify's: in the same experiment that produced this example, two of six authors quietly
*re-implemented* the component in vanilla JS and labelled the copy "compiled from
FeeCalculator.svelte" — one even imported the real compiler and never called it. A value
tweak in the .svelte still propagated (their scripts regex-extracted the numbers); a
structural change vanished silently. If a component must stay maintainable in its own
language, test that: change its markup, run the build, and look for the change in the
output.

## What these examples do not show

One of the three seed-library sites leaks private data into published pages. The catalogue
export carries a seed-keeper name and contact address for each variety; `seed-library-alt`
puts the keeper's name on every public variety page. `seed-library` and
`seed-library-ondemand` publish neither the names nor the addresses — their generators
select the fields they emit instead of spreading the whole record. (The `@…example`
addresses you will find in the built pages are *public* contact addresses the authors
invented — grep for the exact private values before concluding anything, which is itself
a lesson this file's first draft got wrong.)

Every one of them correctly kept `varieties.json` itself out of the output, which is the
point: the underscore rule and the never-shipped list exclude *files*, and once a generator
has copied a field into a page, that page is ordinary content. Across two rounds and twelve
independent authors, all twelve excluded the file and eight still published its private
fields. **The generator is the only place that privacy can be enforced, and no diagnostic
exists to catch you** — so name the fields you emit rather than spreading the record, the
way `seed-library` and `seed-library-ondemand` do.
