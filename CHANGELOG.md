# Changelog

All notable changes to unify are recorded here, written by hand for the person
upgrading across them.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Added

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

[Unreleased]: https://github.com/fwdslsh/unify/compare/v0.8.3...HEAD
[0.8.3]: https://github.com/fwdslsh/unify/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/fwdslsh/unify/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/fwdslsh/unify/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/fwdslsh/unify/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/fwdslsh/unify/compare/v0.6.6...v0.7.0
[0.6.6]: https://github.com/fwdslsh/unify/compare/v0.6.5...v0.6.6
