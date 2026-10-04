# Changelog

All notable changes to unify are recorded here, written by hand for the person
upgrading across them.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`/_unify/pages.json`**, served by `unify dev` beside the audit view: a JSON map of every
  emitted page to its source file, the layout it composed with, its output path, the path the
  server answers and its absolute URL under `--base-url`, with `schemaVersion: 1`, `built` and
  the absolute `sourceRoot`. It is projected from the same manifest the report reads, swapped
  whole by every completed build, and answered with `built: false` before the first one. It is
  for editors: a live preview of the file being edited can ask which address shows it composed
  (rule DEV-06, spec §27.6).

## [0.10.0] - 2026-10-04

The default project layout, and the configuration that goes with it. Published to npm as
`latest`; the four betas on the `next` tag (beta.1 to beta.4) are folded into this entry.
A fresh `unify init` now scaffolds:

```
AGENTS.md  DEPLOY.md
unify.yaml             # every build flag, described and commented out; uncomment what differs
scripts/gen.mjs        # the blog template's generator, beside the site, run by unify
site/                  # the source root: pages, assets, _layout.html, _includes/
```

### Added

- **`unify init` writes `unify.yaml` for every template**, at the project root: every
  saveable option, each commented out under a one-line description naming its default
  (`# publish about.html as about/index.html so it is served at /about/ (default: false)`
  over `# pretty-urls: true`). The file changes nothing until a line is uncommented; the
  docs template's `catalog: true` and the blog template's `generate: scripts/gen.mjs` are the
  only lines any template ships live. It is generated from the option registry
  (`src/cli/options.js`), where every saveable option carries its description, default and
  the line to uncomment, so the scaffolded file cannot fall behind the CLI (rule CFG-09,
  spec §18/§19.8).
- **Only what differs from a default needs writing**, on the command line or in the file,
  and the suite proves it: a `unify.yaml` stating every default, or the all-commented one
  `init` writes, builds byte-identically to no file at all (CFG-09).
- **`--canonical none`**, the second accepted value, switches canonical completion off now
  that it is on by default (below).

### Changed

- **The default source root is `site/`**, then `src/` (the pre-0.10 default, kept so no
  existing site changes), then the working directory (rule EXC-13). `unify init` scaffolds
  into `site/`. The defaulted-source notice reads "no site/ or src/ here".
- **A relative path in `unify.yaml` resolves against the file's own directory** (rule
  CFG-08): a project-root file says `source: site` and `generate: scripts/gen.mjs`. For a file
  inside the source root the two readings coincide, so nothing written before 0.10 changes.
  CLI flags keep their rules (`--source` from the working directory, `--generate` from the
  source root). **Breaking for a 0.9.5 project-root file only:** rewrite
  `generate: ../scripts/gen.mjs` as `generate: scripts/gen.mjs`.
- **Two defaults flipped.** With `--base-url` set, canonical completion is on (`--canonical
  auto` is the default; `--canonical none`, or `canonical: none` in `unify.yaml`, switches it
  off). With a generator named, the source inventory is on (`source-inventory: false` in
  `unify.yaml` switches it off). Both were opt-in flags that every site with an address or a
  generator ended up passing; a site that wants neither now says so once (rules CAN-01,
  GEN-13, GEN-16; spec §22.1, §33.7). **Breaking only in output:** a site built with
  `--base-url` and no `--canonical` now gets a canonical link on every page that authors
  none, and a generator's `inputs.sourcePages` is a path rather than `null`.
- **`--save-config`** creates a new `unify.yaml` at the project root (not in the source
  root), writes `generate` relative to the file, writes `source` when the file sits outside
  the source root, and uncomments a key's commented line in place rather than appending a
  second copy.
- **Design-time preview.** The scaffolded layout, the 404 and every HTML page link the
  stylesheet relative to their own file (`assets/style.css`, `../assets/style.css` a
  directory down), so any of them opened straight from the folder shows styled; unify
  rewrites the link for every page at every depth, and the head merge keeps one copy per
  built page.
- **The blog template's generator runs through `--generate`.** It moves from
  `src/_scripts/gen.mjs` to `scripts/gen.mjs` at the project root, the template's
  `unify.yaml` names it, and it writes `blog.html` and `feed.xml` into the build's overlay
  instead of into `site/`, so no derived file is checked in and none can go stale; the only
  command the scaffold shows is `unify build`. The feed's absolute links take the build's
  `--base-url` from the generator context, falling back to the `https://you.example`
  placeholder without one (SCF-03, FEED-06, spec §19.6).
- **The examples use the 0.10 layout.** All eight sites under `examples/` build from
  `site/`, keep their build scripts in `scripts/` beside it, and save their documented
  flags in a `unify.yaml` at the example root, so each builds with a bare `unify build`
  from its own directory. The three seed-library generators and the catalog-search-blog
  generator run through `--generate` and write into unify's overlay instead of into the
  source tree (the generated pages are no longer checked in); layouts, fragments and HTML
  pages link their assets relative to their own file; seed-library-alt's three layouts share
  one stylesheet. Both workflows build each example from its directory, the way its README
  documents it. The sandbox-authored `AUTHORS-NOTES.md` files are kept as written and still
  describe the pre-0.10 trees they were built in.
- **Documentation** — the CLI reference, getting started, the authoring rules, the examples
  README, the Eleventy and integrations guides, the CI and Docker notes — names `site/`,
  `scripts/` and `unify.yaml` at the project root throughout, and `unify --help` states the
  `site/` default and that a relative `--generate` is measured from the source root.

## [0.9.5] - 2026-10-03

### Added

- **The project root joins the resolution namespace** (spec §4.5, rules INC-14, LAY-17, WCH-09).
  The directory you run `unify` from is now the last place an include path or the layout walk
  looks, after the source tree and the generated overlay, so layouts and includes can live beside
  `package.json`: `<include src="/includes/nav.html">` finds `includes/nav.html` at the project
  root, and a `_layout.html` there is the site's root layout when `src/` has none. Nothing at the
  project root is scanned or published; the source tree wins a tie. `watch` and `dev` observe it
  (non-recursively, plus each top-level directory except the source root, the output directory,
  dot-directories and never-shipped names).
- **`unify.yaml` may live at the project root** (rule CFG-06). The source root's copy is read when
  both exist; otherwise the one beside `package.json`. A project-root file can name the source
  directory itself (`source: site`), so content can live in `site/`, `pages/` or whatever you
  like with the config at the top. `--save-config` upserts whichever file was read.

### Changed

- `--generate` (and `generate:` in `unify.yaml`) may name a file outside the source root
  ([#104](https://github.com/fwdslsh/unify/issues/104)). A relative path still resolves against
  the source root, so `generate: ../scripts/gen.mjs` keeps build tooling at the project root
  while content stays in `src/`; an absolute path is taken as written. Nothing else about the
  seam changes: same working directory, argv contract, overlay, inventory, diagnostics and
  transactional publish, and the script is never published. The previous "outside the source
  root" usage error is gone (spec §33.1, rule GEN-01).
- `--source-inventory` without a generator is inert instead of a usage error (rule GEN-16), so a
  saved `source-inventory: true` can stay in `unify.yaml` while a generator is added or dropped
  per command.
- `--save-config` may be combined with `--dry-run` (rule CFG-07): after a dry run that exits 0
  the flags are saved, and `dist/` is still untouched.

## [0.9.4] - 2026-10-03

### Added

- **`meta` and `links` in the source inventory** (#102). Every `source-pages.json` record
  now also carries the page's own `<meta>` and `<link>` elements as attribute records, in
  source order, the same projection `catalog.json` uses. A Markdown page's `meta` is what
  its frontmatter emits: one record per list item, `og:…` keys as `property`, and never
  `title`, `layout`, `class`, `lang` or `dir`. Its `links` is always empty. unify gives
  these no meaning, so a generator can group by its own `series`, order by `part`, list
  `tags` or skip `role: bookmark` pages without parsing frontmatter or HTML itself. Values
  are kept as written: nothing is split, coerced, resolved or deduplicated, and layouts,
  includes and script bodies never contribute. The five 0.9.3 fields are unchanged, and
  `schemaVersion` stays 1. The recipe in `docs/integrations.md` gains a tested example.

## [0.9.3] - 2026-10-03

One addition, for sites whose generator builds index pages from their own content.

### Added

- **`--source-inventory`** (#100, saveable as `source-inventory: true`): before the
  `--generate` script runs, unify writes `source-pages.json`, one record per source page
  (`source`, `href`, and the authored `title`, `description` and `date`, or `null`), and
  passes its path as `inputs.sourcePages` in `generator-context.json` (`schemaVersion`
  stays 1; old generators are unaffected). A generator can now write a static index of
  the site's pages in a single `build --audit --strict`, without a preliminary
  `audit --format json` pass. Pages are the build's own scan (underscore, `--exclude`,
  never-shipped, `.fragment.html`); Markdown fields come from frontmatter, HTML fields from
  the page's own `<title>`/`<meta>`, with no rendering, layouts or includes. It is not the
  catalog: no generated pages, no layout title suffix, and `noindex` pages are listed.
  Without a generator it is a usage error. Spec §33.7; a tested recipe is in
  `docs/integrations.md`.

## [0.9.2] - 2026-10-02

Fixes and small additions from building real sites with unify, and one finding
removed. A site that built clean on 0.9.1 can now stop on the first Fixed item below;
when it does, that build was losing content without saying so.

### Added

- **`unify build --audit`** (#92): compose once, evaluate the same findings
  `unify audit` reports over that exact result, and publish only if `unify audit`
  with the same flags would exit 0 (previous `dist/` untouched otherwise). The
  generator runs once. `unify build --audit --strict` replaces
  `build --dry-run --strict && build && audit --strict`. Saveable as `audit: true`.
- **`unify build --save-config`**: writes the saveable options given on the command
  line into the source root's `unify.yaml`, creating it if needed. Only the keys you
  pass change; comments, order and other keys are kept. It writes only after a build
  that exits 0, and is a usage error with `--dry-run` or on other commands.
- **`--include-noindex`** (#97): with `--catalog`/`--search-corpus`, pages left out
  only for being `noindex` are listed too, so a private site gets a usable page
  directory. Robots meta, sitemap, feed, `404.html` and canonical handling are
  unchanged. Without `--catalog` or `--search-corpus` it is a usage error.
- **An "All pages" starter in `unify init docs`** (#91): `all-pages.html` and
  `assets/all-pages.js`, an accessible, filterable directory grouped by section and
  read from `assets/unify/catalog.json`. It works under a `--base-url` path prefix.
  The template also ships a one-line `unify.yaml` (`catalog: true`) so a plain
  `unify build` fills the page; it is the only template that writes one.

### Fixed

- **Content outside a page's `<head>` and `<body>` is no longer dropped silently**
  (#88). When a layout applied, an element or text beside them (a `<script>` after
  `</html>`, or a `<title>` in a page that omits the optional `<head>` tag) was left
  out of the output at exit 0. It is now a located P21 problem telling you to move it
  inside `<body>` or `<head>`. Whitespace and comments are not reported. A page with
  no layout still ships byte-for-byte.
- **An `<include>` inside a slotted include's content no longer ends the outer
  include early** (#90). Open and close tags now pair by nesting, so
  `<span slot="icon"><include src="/icon.html"></include></span>` inside a card
  include resolves, in HTML and Markdown pages alike.
- **The generated feed's `<title>` prefers the site's declared name** (#95): the root
  page's `og:site_name` when it has one, else its `<title>` (as before), else the
  host. Sites without `og:site_name` get the same feed as before.
- **A repeated `--generate` says what to do instead** (#94). It was already a usage
  error (exit 2); the message now says unify runs one generator and to call the
  other tasks from that file, and the integrations guide no longer claims a second
  `--generate` silently replaces the first.

### Removed

- **The `title-h1-mismatch` audit finding** (#96). A brand-name `<title>` over a
  tagline `<h1>` is a correct page, the pairing isn't required by search engines or
  accessibility guidance, and `audit --strict` made it a hard gate. `h1-missing`,
  `h1-multiple` and `jsonld-headline-mismatch` are unchanged. The scaffolds' comments
  and sample prose no longer teach the pairing; no scaffold output changed beyond
  that prose.

## [0.9.1] - 2026-08-26

A dependency-security release. unify itself is unchanged — no command, flag,
or composition rule differs from 0.9.0, and unify's own two runtime
dependencies (`js-yaml`, `markdown-it`) carry no advisories. What changes is
the one manifest in this repository that did: the `examples/forge-svelte`
worked example pinned Svelte 4, and the GitHub Advisory Database flags every
Svelte release up to 5.55.6 (GHSA-crpf-4hrx-3jrp, GHSA-m56q-vw4c-c2cp,
GHSA-f7gr-6p89-r883, GHSA-phwv-c562-gvmh, GHSA-rcqx-6q8c-2c42,
GHSA-pr6f-5x2q-rwfp), so Dependabot and `npm audit` reported the example's
committed lockfile. If you install `@fwdslsh/unify` from npm, none of this
ever reached you: the published package ships `src/` only, examples excluded.

### Security

- **`examples/forge-svelte` moves to Svelte 5** — `svelte` `^4.2.20` →
  `^5.56.10`, the first advisory-free release. The flagged code paths (SSR
  rendering, spread attributes, `<svelte:element>`, `contenteditable`
  bindings) never appear in the example's one component, but the repository's
  answer to a flagged lockfile is to clear it, not to argue scope. `npm audit`
  now reports zero vulnerabilities across all three manifests in the
  repository — the root and both examples.

### Changed

- The example's entry file mounts with Svelte 5's
  `mount(Component, { target })` in place of Svelte 4's
  `new Component({ target })` — the call `docs/integrations.md`'s recipe
  already showed — and the recipe's note that the worked example lagged on
  Svelte 4 is gone, because it no longer does. The component itself,
  `FeeCalculator.svelte`, is untouched: its classic syntax (`export let`,
  `$:`) compiles unchanged under Svelte 5.
- The example's committed browser bundle
  (`src/assets/js/fee-calculator.js`) is rebuilt with the Svelte 5 compiler
  and its build script now passes `minify: true`, matching the recipe's own
  build flags — 54 kB minified, where Svelte 4's unminified bundle was 23 kB,
  Svelte 5's runtime being simply larger.

## [0.9.0] - 2026-08-26

The five primitives — `<include>`, layouts, slots, the underscore exclusion,
the `.fragment.html` opt-out — are unchanged, and composition itself is
byte-for-byte what 0.8 produced. What changes is the model behind production
and discovery (§20–§31): the per-page record every built-in consumer read
from, and the machine-readable artifacts built on top of it, plus one fix to
`--pretty-urls` reached through that same model. That change has five
visible edges — a site built with `--base-url` can gain `feed.xml` entries it
should have had all along (**Changed**); `unify audit`, including under
`--strict`, reads headings from a narrower scope and can report differently
on the same tree (**Changed**); `audit --format json`'s `pages` shape is a
breaking rewrite (**Changed**); `--search-index` is gone, replaced by
`--catalog`/`--search-corpus` (**Removed**); and `--pretty-urls` now rewrites
a page-targeting `og:`/`twitter:` meta the way it already rewrote the
matching `href`, so a page authoring `<meta property="og:url"
content="/index.html">` under `--pretty-urls` now emits `content="/"` where
0.8 (and 0.9 before this fix) emitted the unrewritten `.html` spelling
(**Fixed**). If you only author HTML/Markdown pages, never build with
`--base-url`, never run `audit`, never parse `audit --format json`'s page
shape, never passed `--search-index`, and never author a URL-valued
`og:`/`twitter:` meta under `--pretty-urls`, this release changes nothing you
will notice. If you do any of those, read **Changed**, **Fixed**, and
**Removed** below before upgrading.

### Added

- **`--catalog`**, which writes `assets/unify/catalog.json`: one entry per
  public page — its path, URL, root attributes, and the same head/body
  snapshot `audit --format json` serializes (title, meta, links, headings) —
  for a browse/filter/TOC/metadata-driven UI. No body text.
- **`--search-corpus`**, which writes `assets/unify/search-corpus.json`: one
  `{path, text}` entry per public page, `text` being the page's visible main
  content with Unicode space separators folded to an ordinary space. Nothing
  else is touched — no stemming, no stop-word removal, no truncation.
  `--catalog` and `--search-corpus` are independent flags; pass both for a
  full client-side search UI, and each carries its own `unify.yaml` key. Both
  join the temp tree before the reference check, appear in `--dry-run`, and
  an authored file at either exact path suppresses generation, exactly like
  an authored `sitemap.xml`/`feed.xml`.
- **`generator-context.json`**, written once per generator run and passed as
  `process.argv[4]`: `{schemaVersion, unifyVersion, command, paths:
  {sourceRoot, generatedRoot, outputRoot}, site: {baseUrl, prettyUrls,
  canonical}, outputs: {catalog, searchCorpus}}`. It sits beside (never
  inside) the generated directory `argv[3]` already names, is deleted with
  the rest of the build's generator state, and is never published.
  `argv[2]`/`argv[3]` are unchanged, so an 0.8 generator keeps working
  unmodified — it simply never reads the fourth argument; one that wants the
  new facts reads a fourth argument that was not there before.

### Changed

- **Breaking: the per-page record is `BuildDocument`, not `PageRecord`**
  (§20). Every built-in consumer — sitemap, `--canonical auto`, the feed,
  structured-data generation, `audit`, the dev report — now reads through
  `{source: {path, generated, layout}, outputPath, document, analysis}`,
  where `document` is a small, bounded `DocumentSnapshot` (root attributes,
  head title/meta/link/base, body attributes and headings) and `analysis` is
  private build data. This is an internal model change with one public
  face: **`unify audit --format json`'s page shape is now `{source,
  generated, outputPath, document}`**, `document` being the snapshot above,
  serialized whole. The 0.8 shape — a flat object with `title`,
  `description`, `canonical`, `headings`, `text`, `linksOut`, `conflicts`,
  `taxonomyKeys`, and the rest as top-level page fields — is gone outright.
  `schemaVersion` stays `1`: 0.9 is a declared, incompatible break with the
  0.8 machine schema rather than a migration, so there is no `2` to reach
  for. **If you parse `audit --format json`, rewrite the reader against the
  new `pages[].document` shape.** The 0.8 page had 28 top-level fields
  (`sourcePath, generated, layout, outputPath, path, url, title,
  description, lang, canonical, robots, h1, headings, text, image, author,
  datePublished, dateModified, schemaType, taxonomyKeys, jsonLd, ids,
  strayMetadata, linksOut, linksIn, fragmentLinks, conflicts, refresh`); the
  0.9 page has four (`source, generated, outputPath, document`). One is a
  silent rename: `sourcePath` is now `source` — a reader of `page.sourcePath`
  gets `undefined`, not an error. Some are still there, recomputed from the
  snapshot rather than stored: `title`/`description`/`canonical` read from
  `document.head`, `lang` from `document.html.attributes`, `headings` from
  `document.body.headings`, and `robots`/`image`/`author`/`datePublished`/
  `dateModified`/`h1` are each one small reduction over
  `document.head.meta`/`document.body.headings` away (`h1` is
  `document.body.headings.find(h => h.level === 1)?.text ?? null`). One moved to
  a different artifact: `text` is gone from this shape entirely — only
  `--search-corpus`'s `search-corpus.json` carries page text now, joined by
  `path`. The rest have no replacement anywhere: `layout` (deliberately kept
  out of this object; it stays internal to audit's own fix lines),
  `schemaType` (superseded by `declaredTypes`, which nothing serializes),
  `taxonomyKeys` (the feature is removed, see below), `jsonLd`, `ids`,
  `strayMetadata`, `linksOut`, `linksIn`, `fragmentLinks`, and `refresh` are
  all private build data with no public field. `conflicts` is the one
  exception worth naming on its own: it was never a stored field even in
  0.9's model — `metadataConflicts(doc)` computes it on demand — but it does
  still reach this JSON, as the `metadata-conflict` finding for each
  contradiction found; only the standalone `page.conflicts` array is gone.
  Findings, `summary`, and `fingerprint` are unchanged.
- **Breaking: heading scope is now the first `<main>`, else `<body>`, else
  the document — no longer document-wide.** A layout's own chrome routinely
  carries an `<h1>` (a site name in the header, a "skip to content" link),
  and reading headings document-wide made that chrome's heading
  indistinguishable from the page's own. `h1-missing`, `h1-multiple`, and
  `title-h1-mismatch` inherit the new scope without a rule of their own,
  because they read the snapshot's `body.headings` as extracted. **If a
  layout's chrome carries its own `<h1>` outside `<main>`, a page that
  previously satisfied `h1-missing` via that chrome heading now needs an
  `<h1>` of its own inside `<main>`** — this can turn a clean `audit
  --strict` run into one reporting `h1-missing` on such pages; add the
  heading where the content actually is.
- **Feed membership now tests inclusion, not the first declaration.**
  `declaredTypes(doc)` (below) replaces the single scalar `schemaType`, and
  a page joins the feed if `declaredTypes(doc)` **includes** `Article` or
  `BlogPosting` anywhere in the list, not only when it was the first
  declaration. A page carrying `Organization` JSON-LD before separate
  `Article` JSON-LD — routine, since a page is often both a piece of content
  and part of a publisher's graph — was silently excluded from its own feed
  under 0.8 and is a candidate under 0.9. `schema-incomplete` (§24.4) uses
  the same inclusion test. This is a widening: a 0.8 site's feed gains
  entries it should have had; nothing already in a feed is removed.
- `declaredTypes(doc)` (§20.8) replaces the retired `schemaType` field.
  Where `schemaType` interleaved meta and JSON-LD declarations by document
  position and kept only the first, `declaredTypes` lists every accepted
  `<meta name="schema">` value before every JSON-LD `@type`, and returns the
  whole list. Nothing built-in reads a single "the" type anymore except
  §26.5's generation activation, which only ever sees a meta-only list by
  construction.

### Removed

- **Breaking: `--search-index` is removed outright**, along with
  `search-index.json` and the `unify.yaml` `search-index` key. There is no
  alias and no deprecation shim: passing `--search-index` is now an unknown-
  flag usage error (exit 2), and a saved `search-index: true` in
  `unify.yaml` is an unknown-key usage error. **Replace `--search-index`
  with `--catalog` and/or `--search-corpus`** (§30): a client that indexed
  `search-index.json`'s url-keyed `{url, title, text, ...}` entries directly
  now reads `search-corpus.json`'s `{path, text}` entries and, for anything
  beyond raw text — title, headings, canonical, metadata — joins against
  `catalog.json` by `path` (`new Map(catalog.pages.map(p => [p.path, p]))`).
  `path`, not `url`, is the deliberate join key between the two new files.
- **Breaking: `tags`/`categories` taxonomy tracking is removed** — the
  `taxonomyKeys` field, its extraction, and the `taxonomy-inert` audit
  finding are gone. `tags:`/`categories:` frontmatter still synthesizes
  `<meta name="tags">`/`<meta name="categories">` exactly as before and
  still builds nothing on their own; `unify audit` simply reports nothing
  about them now, in either the head or the body, rather than pointing out
  that they build nothing. **If your CI parsed or suppressed the
  `taxonomy-inert` finding (in the human report, `--format json`, or
  `--format sarif`), remove that handling — the finding no longer exists to
  suppress.** No frontmatter or markup change is needed.

### Fixed

- **`--pretty-urls` (§11.2/URL-08) now rewrites the URL-valued `og:`/
  `twitter:` meta `content`** — `og:url`, `og:image`, `og:audio`, `og:video`,
  `twitter:image`, `twitter:player`, and their `:url`/`:secure_url`/`:src`/
  `:stream` forms (the same closed list §11.1 and §12 read) — the same way it
  already rewrote the matching `<a href>`. Previously only §11.1 (provenance)
  and §11.3 (`--base-url`) touched these metas; `--pretty-urls` left them in
  the plain `.html` spelling, so a page authoring `<meta property="og:url"
  content="/about.html">` beside `<a href="/about.html">` had its anchor
  rewritten to `/about/` while the meta, naming the identical target, failed
  the reference check. A page whose target does not move under
  `--pretty-urls` (an already-pretty `index.html`) built clean either way but
  changes what it emits: `content="/index.html"` now comes out as
  `content="/"`, matching the `href` beside it. Asset-targeting values (a
  real image file, not a page) are left byte-unchanged, exactly like an
  asset `href`.

## [0.8.3] - 2026-08-25

A patch release with no authoring-surface change: the five primitives are
untouched and a 0.8.2 site builds identically. Two diagnostics get more
honest, and the examples gain a gate.

### Fixed

- **A fragment is never replaced by the error page** (#73, WCH-08). While
  `watch`/`dev` was running, a failing rebuild replaced every emitted `.html`
  file with the error placeholder — and `*.fragment.html` matched that filter,
  so a bare snippet became a complete `<!doctype html>` document. It was the
  one place the byte-for-byte fragment guarantee lapsed, and it failed
  invisibly: a blanked page announces itself on reload, while a blanked
  fragment is fetched by `hx-get` or `fetch()` and swapped into a page that
  still looks fine, so a whole document lands inside an element and what you
  see is mangled markup pointing nowhere near the cause. Fragments now keep
  their last good bytes. Blanking *pages* on a failure unify cannot attribute
  is unchanged.
- **A retired spelling inside code is a sample, not a declaration** (#71,
  LAY-16). P08 parses raw source as HTML, so a page *documenting* the retired
  vocabulary was reported as a page *using* it — a well-formed sample is
  indistinguishable from authored markup to a parser that was never told the
  difference. unify's own documentation site went red the day the conformance
  spec gained a sentence about `data-slot`, and the spec had to name the
  attribute without showing it on an element; it now spells the tag out. The
  check is inert inside `<pre>`/`<code>` — the same regions §5.1 item 8
  already makes inert for `<include>` — and, in Markdown, inside fenced
  blocks, indented blocks and inline spans. Deliberately the CommonMark
  reading rather than a looser one, because every inert byte is a byte P08
  stops protecting: an indented run counts only after a blank line, so an
  indented *continuation* of a paragraph is still markup and a retired
  spelling in it is still reported.
- **A diagnostic's line survives `--pretty-urls`** (#72, URL-15). §11 replaces
  attribute values in place but not at equal length — `/notes/index.html`
  becomes `/notes/`, ten bytes shorter — so every reference after one of those
  sat earlier in the final text than in the composed text the span table
  describes, and the located line drifted backwards by however many rewrites
  preceded it. A broken link on line 18 was reported at line 15, naming a line
  whose content had nothing to do with the diagnostic; with enough drift the
  position could cross a file boundary and name a file containing no such link
  at all. Each rewrite stage now reports the shifts it imposed, and the
  reference locator unwinds them before querying the spans, exactly as §22 and
  §26's insertions were already unwound. This affected every `--pretty-urls`
  user; the diagnostic itself was always correct, only its position was wrong.
- **P29 stops printing the runtime's error object** (#76, GEN-10). A generator
  that could not read a file — the commonest failure there is — reported
  `… open '/x.json' /     path: "/x.json", /  syscall: "open",`: the path
  restated, then a comma terminating nothing. Both runtimes print a thrown
  `Error`'s fields under the message, and neither the code-frame nor the
  stack-frame shape recognised them. They are dropped now, along with node's
  internal location header (`node:fs:560`), which carried no slash and so
  escaped the existing file-location shape. A generator's own words are
  untouched: an unindented line survives whatever it says, a generator listing
  `  first-post.md: no date` survives because a bare filename is not a JS
  identifier, and multi-line messages still arrive whole.

- **The generator subprocess never network-installs** (#75, GEN-11). Bun
  auto-installs an import it cannot resolve, so a generator whose dependency
  was missing fetched it from npm and the build exited 0 — while node failed
  the same tree inside P29. The two runtimes disagreed about whether there was
  a build at all, and it failed in the direction that hides the problem: bun
  resolves through its global cache and leaves no `node_modules`, so the tree
  that built looked identical to the tree that could not. The compiled binary
  did it too, quietly reaching the network on the path whose whole promise is
  a machine with neither runtime installed. The spawn now carries
  `--no-install` wherever it is valid. This is the one place unify asks which
  runtime it is, guarded on `process.versions.bun` rather than the
  executable's name — which is `unify-linux` on the binary — and the
  `--generate` contract is unchanged: `argv[2]` is still the source root and
  `argv[3]` the generated directory.

### Added

- **Markdown converts with markdown-it's standard feature set** (§10.1,
  MD-22) — its default preset, rather than the narrowed `commonmark` one. Over
  that preset this adds exactly two grammars, measured rather than assumed:
  **GFM pipe tables** and **strikethrough**. Tables are why it was found: a
  pipe table converted to a paragraph of literal `| Flag | Meaning |` text, and
  unify's own documentation site shipped **247 such rows across eight pages
  with not one `<table>` element** — the conformance spec's head-merge table
  and collision matrix among them. A file that renders correctly in a
  repository should not look broken once unify publishes it. `linkify` and
  `typographer` are markdown-it *options* rather than rules and remain off, so
  no address or quotation mark is rewritten unless asked for; those options
  and markdown-it's plugin interface are where per-site Markdown configuration
  would go if it is wanted. If you write documentation in Markdown, your
  tables start rendering; nothing else about your pages changes.
- **Gate G13: every example builds in CI** (#77). `examples/` holds seven
  sites and CI built one, so an example could stop working unnoticed — which
  had already happened twice, once with a deploy workflow carrying a flag cut
  three releases earlier. All seven now run `build --dry-run --strict`; the
  two that are audit-clean also run `audit --strict`. The four
  sandbox-authored sites are deliberately not audit-gated, because they carry
  41 `incomplete` findings and always have, and demanding cleanliness there
  would be a new requirement rather than a regression check. The two examples
  that need `npm install` run on **node**, because bun auto-installs a missing
  import and would let an undeclared dependency pass a gate an `npx` user
  fails (#75).

## [0.8.2] - 2026-08-24

A patch release with no new authoring surface: the five primitives are
untouched. Everything here was found by building two real sites with unify —
this project's own documentation site, and fwdslsh.dev — and then asking what
each of them had to work around.

### Fixed

- **An extensionless link is resolved under `--pretty-urls`** (#68). The flag
  publishes `about.html` at `/about/`, so `/about` is the URL it exists to
  produce — and it was the one spelling the rewrite ignored, reaching the
  reference check unrewritten and failing there as unresolvable. `/about.html`
  and `/about/` both worked; the clean form did not. It is now resolved and
  rewritten like the others, tried as `about.html` and then as
  `about/index.html`. A link naming no page is still a problem, and without
  `--pretty-urls` nothing changes. Measured on fwdslsh.dev: 198 problems across
  39 files, every one a link written the way the flag advertises, to zero.
- **A bare `@import` is a reference** (REF-11). `@import url("/x.css")` was
  already checked because it is a `url()`; `@import "/x.css"` — the commoner
  spelling in hand-written CSS — was not, so a stylesheet importing a
  stylesheet that does not exist published green while the identical mistake
  one line down blocked the build.
- **A repeated single-value option is a usage error** (CFG-04). `-o dist -o
  other` published to `other` and said nothing; two `--generate` paths ran the
  second instead of the first. Both at exit 0, both an instruction discarded in
  silence. Repeating `--exclude` still accumulates, and repeating a boolean
  flag is still fine.
- **`unify audit`'s summary names the problems the same run reported**
  (AUD-16). A run that hit a build problem and found no findings printed the
  problem, said `audit: nothing to report`, and exited 1 — three lines that
  read as a tool bug. The two severity axes stay separate; the summary line
  simply stops omitting one of them.
- **A generated asset's `--dry-run` row says `← generated`** (GEN-04). Pages
  already did. An asset named its overlay-relative path instead, pointing the
  reader at a file that does not exist in the source tree — the exact
  unexplainable row the rule exists to prevent.
- **`--generate`'s failure names the runtime that ran it.** The fix line said
  `bun <script>` unconditionally: wrong under `npx @fwdslsh/unify`, where node
  hosts the build, and impossible on the standalone binary, whose whole promise
  is a machine with neither runtime installed.

### Changed

- **`data-slot` is diagnosed as retired vocabulary** (§6.3, P08). `data-unify`
  and the `unify-*` area classes were already located problems naming their
  replacement. `data-slot`, from the same generation and with the same
  content-loss failure mode, produced no diagnostic at all: it is inert, so a
  page carrying it composed at exit 0 with the fill silently dropped. The cost
  was measured on a production site, where a shared layout's `<title>` carried
  it and every page emitted the layout's default title with nothing reported.
- The documentation site at <https://unify.fwdslsh.dev/> now carries the same
  design as [fwdslsh.dev](https://fwdslsh.dev/): dark surfaces, the fwdslsh
  green, and one hand-written stylesheet with no client JavaScript. It is still
  built by unify from this repository's own `docs/` directory, so it cannot
  drift from the documentation it renders.

### Added

- **A recipe for a prebuilt package's browser files**, in
  `docs/integrations.md`. `node_modules/` never ships and there is no copy
  flag, so a package that already ships a browser-ready bundle had no
  documented path into a build — which is why syntax highlighting was dead on
  fwdslsh.dev. The recipe resolves `<pkg>/package.json` and joins from its
  directory, which reaches files a package does not export and behaves the same
  under both runtimes, and it is explicit about what the build does not check.
- The head-merge title convention now appears in `docs/getting-started.md` with
  the detail it was missing: write the layout's separator with no leading
  space, because the join supplies it, and a page with no title of its own
  ships the layout's title exactly as written.

## [0.8.1] - 2026-08-24

The composition model is unchanged. Nothing in the five primitives moves.

### Added

- **Node.js support, alongside Bun** (#49). `npx @fwdslsh/unify build`,
  `npm install -g @fwdslsh/unify` and `bun add -g @fwdslsh/unify` all work: the
  same code runs on Node 22.12.0 or newer and Bun 1.2.0 or newer, and produces
  byte-identical output either way. A test gate checks that equivalence on every
  change from here on.
- `examples/unify-docs`, this project's own documentation site, built by unify
  from the real `docs/` tree and deployed to <https://unify.fwdslsh.dev/>.
  Building it is how three of the fixes below were found.

### Changed

- **The `--generate` overlay joins the resolution namespace** (#54, #55).
  Generated pages now discover the nearest `_layout.html` exactly as
  hand-written pages do, and `<include>` resolves fragments in both directions
  across the boundary: a source layout can include a fragment the generator
  wrote, and a generated page can include a source fragment. The overlay and the
  source root are one namespace; the source tree wins a tie and nearest still
  wins the walk. If you worked around this with an explicit `layout:` key in
  generated frontmatter, you can delete it.
- **Includes are inert inside `<pre>` and `<code>`** (#56). A code sample
  showing `<include src>`, or the SSI comment form, is content rather than a
  directive: it ships byte-for-byte, is never spliced, produces no diagnostics
  even when its sample target does not exist, and is neither rewritten by
  `--base-url` and `--pretty-urls` nor read by the reference check. This applies
  to exactly `pre` and `code`. If you relied on includes expanding inside a code
  element, move the include outside it. Markdown fences were always safe.
- Bun is now an optional peer dependency rather than a required one, so a
  Node-only install no longer pulls it down.
- js-yaml moved from 3 to 5 (#58), dropping the unmaintained `esprima` and the
  `argparse` 1.x and `sprintf-js` transitive dependencies. Frontmatter behaviour
  is unchanged: values still parse under the failsafe schema, so nothing changes
  type.

### Fixed

- The CLI silently did nothing on most Node installations. The entrypoint guard
  used `import.meta.main`, a property Bun has always had but Node did not gain
  until 22.18.0, so below that version every command exited 0 having performed no
  work. Replaced with a portable check. The standalone binaries were never
  affected.
- The `lang-missing` advisory now gives actionable advice on pages composed with
  `data-layout="none"`, `layout: none`, or no layout at all (#57): it tells you
  to set `lang` on the page itself instead of pointing at a layout that is
  already correct or does not exist. The message for pages that do have a layout
  is unchanged.

## [0.8.0] - 2026-08-22

The v0.7 composition model is unchanged. This release adds the production layer
on top of it: once unify knows your site's address, it verifies and generates the
standard artifacts around your pages.

### Added

- **`unify audit`**, which evaluates the site the build would publish and writes
  nothing: missing descriptions, duplicate titles, broken fragment links, orphan
  pages, invalid JSON-LD, and share images without dimensions. Findings never
  block `build`; `audit --strict` is the CI gate. `--format json` and
  `--format sarif` emit the same findings machine-readably, each with a stable
  fingerprint CI can suppress. `--external` checks off-origin URLs and is the
  only network operation in the product.
- **Discovery files from `--base-url`**: `sitemap.xml` and an Atom `feed.xml`,
  the latter built from pages declaring `schema: Article` or `BlogPosting` with a
  full timestamp. `--feed-full` includes rendered content. An authored file
  always wins, so shipping your own `feed.xml`, `sitemap.xml`,
  `search-index.json` or `robots.txt` means unify generates nothing.
- `--search-index`, which writes `search-index.json` for client-side search.
- `--canonical auto`, which completes a canonical link from the final public URL,
  and only on pages that author none.
- `schema:` frontmatter (`WebPage`, `Article` or `BlogPosting`), which writes
  bounded JSON-LD from what the page already declares. Nothing is guessed: no
  date ever comes from the build clock, the filesystem, or Git. An authored
  `<script type="application/ld+json">` always wins.
- **Slotted includes**: content inside `<include>` fills `<slot>` elements in a
  `*.fragment.html` target, using the same `slot="name"` and fallback model that
  layouts already use. No props and no expressions.
- **`--generate <path>`**: one JavaScript file you own runs before the scan, and
  whatever it writes into the supplied directory joins the build as an overlay,
  checked and published like any source file. The standalone binary supplies the
  runtime, so no Node installation is required.
- `/_unify/`, where `unify dev` serves the audit findings and each page's record
  as a local page. It is never written to `dist/`.
- `unify.yaml` can save every option except the per-run ones (`--dry-run`,
  `--format`, `--external`). The CLI wins on conflict.

### Changed

- **Breaking**: `draft:`, `permalink:` and `slug:` frontmatter are now build
  errors that name the unify mechanism instead. These keys silently implied
  behaviour from other generators that unify does not have. Hold a page back by
  renaming it with a leading underscore, and change its address by moving the
  file. `tags:` and `categories:` still build, and `audit` notes that nothing is
  built from them.

Everything else is additive: a 0.7 site builds unchanged, and with no
`--base-url` no new file is generated.

## [0.7.0] - 2026-08-17

A clean break from the 0.6 composition model, and the release that defined the
authoring surface unify has today.

### Added

- **HTML-native composition**, with no expression language and no client
  runtime. The output is the HTML and CSS you wrote.
- **Includes**: `<include src>`, plus the Apache SSI comment form so an existing
  SSI site can migrate.
- **Layouts**: the nearest `_layout.html` wraps every page automatically, and
  `data-layout` picks one explicitly or opts out.
- **Slots**: `<slot name>` in layouts, `slot=` on page elements, and `<main>` as
  the zero-vocabulary default.
- **Fragments**: a file named `*.fragment.html` ships byte-for-byte as a bare
  snippet for `<include>`, embeds, or client-side fetch, and is never composed.
- **Markdown** as an equal citizen, with YAML frontmatter supplying the head and
  slug ids on every heading.
- **Underscore exclusion**: `_draft.html` and `_includes/` are build material
  that never ships.
- **Transactional publishing**: builds are all or nothing, so problems mean
  nothing is written and the previous output is left untouched.

### Removed

A 0.6 site must be updated before it will build. The build reports every retired
spelling at its source location and names the replacement, so it never silently
reinterprets 0.6 markup as something else.

- `data-unify`, replaced by `data-layout`.
- `unify-*` area classes, replaced by `<slot name="x">` in the layout with
  `slot="x"` on the page element, or by `<main>` for the default region.
- The `serve` command, replaced by `dev`.
- `--minify`.
- `--fail-on`.

## [0.6.6] - 2026-01-14

Releases up to and including 0.6.6 predate the v0.7 rewrite and were published
with generated compare-link notes only. Their diffs are on the
[releases page](https://github.com/fwdslsh/unify/releases). Nothing here
retroactively reconstructs detail those notes never carried.

[Unreleased]: https://github.com/fwdslsh/unify/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/fwdslsh/unify/compare/v0.9.5...v0.10.0
[0.9.5]: https://github.com/fwdslsh/unify/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/fwdslsh/unify/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/fwdslsh/unify/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/fwdslsh/unify/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/fwdslsh/unify/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/fwdslsh/unify/compare/v0.8.3...v0.9.0
[0.8.3]: https://github.com/fwdslsh/unify/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/fwdslsh/unify/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/fwdslsh/unify/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/fwdslsh/unify/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/fwdslsh/unify/compare/v0.6.6...v0.7.0
[0.6.6]: https://github.com/fwdslsh/unify/compare/v0.6.5...v0.6.6
