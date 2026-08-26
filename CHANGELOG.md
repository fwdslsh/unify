# Changelog

All notable changes to unify are recorded here, written by hand for the person
upgrading across them.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - 2026-08-26

The five primitives — `<include>`, layouts, slots, the underscore exclusion,
the `.fragment.html` opt-out — are unchanged, and a 0.8 site's *output* is
unchanged: no built page looks different. What changes is the model behind
production and discovery (§20–§31): the per-page record every built-in
consumer read from, and the two machine-readable artifacts (`unify audit
--format json`, and the removal of `search-index.json` in favor of two
narrower files) built on top of it. If you only author HTML/Markdown pages
and never touch `--search-index`, a generator, or `audit --format json`'s
`pages` shape, this release changes nothing you will notice. If you do any of
those three, read **Removed** below before upgrading.

### Added

- **`--catalog`**, which writes `assets/unify/catalog.json`: one entry per
  public page — its path, URL, and the same head/body snapshot `audit
  --format json` already serializes (title, meta, links, headings) — for a
  browse/filter/TOC/metadata-driven UI. No body text.
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
  `argv[2]`/`argv[3]` are unchanged, so an 0.8 generator that reads neither
  keeps working unmodified; one that wants the new facts reads a fourth
  argument that was not there before.

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
  new `pages[].document` shape** — `title`/`description`/`canonical` now
  read from `document.head`, `headings` from `document.body.headings`, and
  `linksOut`/`conflicts`/`taxonomyKeys` have no replacement field (the first
  two are private build data now, never serialized; the third is removed,
  see below). Findings, `summary`, and `fingerprint` are unchanged.
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

[Unreleased]: https://github.com/fwdslsh/unify/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/fwdslsh/unify/compare/v0.8.3...v0.9.0
[0.8.3]: https://github.com/fwdslsh/unify/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/fwdslsh/unify/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/fwdslsh/unify/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/fwdslsh/unify/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/fwdslsh/unify/compare/v0.6.6...v0.7.0
[0.6.6]: https://github.com/fwdslsh/unify/compare/v0.6.5...v0.6.6
