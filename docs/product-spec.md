# unify — Product Specification (MVP)

**Status**: Draft v1, for review
**Role**: This document defines what unify is, who it serves, and the complete feature surface of the MVP. Where it conflicts with `app-spec.md` or `dom-spec.md`, this document wins; those documents will be rewritten or retired to match it during realignment. Until realignment lands, the released tool and this document intentionally differ — §7 maps the distance; treat mismatches as planned work, not documentation bugs.

---

## 1. What unify is

Web pages have needed shared headers, footers, and navigation since the beginning — and HTML still has no way to express that. Every existing answer forces a trade the author didn't ask for: a JavaScript framework, a templating language, a config-heavy build system, or copy-paste.

unify is a static site generator for **front-end designers and hobbyists** — people fluent in HTML and CSS who have no interest in JavaScript frameworks, templating languages, or build tooling. It lets them define a header, footer, nav, or page layout once, in plain HTML files, and have those rendered into every page of the site. The output is the HTML and CSS the author wrote — unify adds no JavaScript and no runtime of its own. There is nothing to configure and nothing to learn beyond HTML itself.

The entire authoring surface is four things:

| You want to… | You write… |
|---|---|
| Reuse a fragment (nav, footer, badge) | `<include src="/_includes/nav.html">` |
| Wrap pages in a layout | nothing (automatic `_layout.html`) — or `data-unify="/path.html"` to pick one |
| Mark a region of a layout as replaceable, or replace it from a page | `class="unify-hero"` |
| Keep a page or folder out of the built site | name it with a leading underscore: `_draft.html`, `_includes/` |

If a capability cannot be expressed with these four, it does not belong in unify.

**Design rules that govern every feature decision:**

1. **Explainable in one sentence** to someone who knows only HTML and CSS. If a rule needs a diagram, it's out.
2. **Every source file is real HTML a browser can parse as written.** Layouts and pages are complete documents (a layout's default content is its preview); fragments are well-formed snippets; no template holes, no unbalanced markup. Authoring preview is any web server at the source root (an editor live-server, `bunx live-server`) plus the browser polyfill (§6) for composition; the built site previews the same way over `dist/`. `file://` double-click is not a supported preview.
3. **Polyfill-able**: the entire composition model must be implementable by a small (~200-line) browser script that produces the same DOM at design time as the CLI produces at build time. The polyfill is the complexity budget — any rule too intricate to live in it is too intricate to ship.
4. **Zero configuration.** Conventions, not config files.

---

## 2. The five-minute site (golden path)

This walkthrough is the product. Every release must keep it true, and the end-to-end test suite builds exactly this site and asserts the output.

```bash
unify init          # scaffold a starter site in the current directory
unify watch         # build + rebuild on every save (prints a serve hint)
# …in another terminal: bunx live-server dist — or your editor's live preview
# …edit, save, browser reloads…
unify build         # write the final site to dist/
# upload dist/ anywhere: GitHub Pages, Netlify, a $3 shared host
```

`unify init` produces:

```
my-site/
├── _layout.html          # the site chrome — one complete HTML page
├── _includes/
│   └── nav.html          # a fragment
├── index.html            # a page
├── about.md              # a Markdown page — equal citizen
└── assets/
    └── style.css
```

**`_layout.html`** — a complete page you can open in a browser right now. Its default content is its own preview:

```html
<!doctype html>
<html>
  <head>
    <title>My Site</title>
    <link rel="stylesheet" href="/assets/style.css">
  </head>
  <body>
    <include src="/_includes/nav.html">
    <main>
      <p>Page content appears here.</p>
    </main>
    <footer class="unify-footer">
      <p>© My Site</p>
    </footer>
  </body>
</html>
```

**`index.html`** — also a complete page. It doesn't mention the layout; the nearest `_layout.html` applies automatically:

```html
<!doctype html>
<html>
  <head>
    <title>Home —</title>
  </head>
  <body>
    <h1>Welcome!</h1>
    <p>This content lands in the layout's &lt;main&gt;.</p>
  </body>
</html>
```

Built result: the layout, with its `<main>` content replaced by the page's body, and the page's title prepended to the layout's: `<title>Home — My Site</title>`.

**Overriding a marked region** — the layout marked its footer with `class="unify-footer"`, so any page may replace it by using the same class:

```html
<body>
  <h1>Contact</h1>
  <p>Main content as usual.</p>
  <footer class="unify-footer">
    <p>© My Site — <a href="mailto:hi@example.com">email us</a></p>
  </footer>
</body>
```

**`about.md`** — Markdown pages work identically; frontmatter supplies the head:

```markdown
---
title: About —
description: Who we are
og:
  image: /assets/team.jpg
---

# About

Everything here is converted to HTML and dropped into the layout
exactly like an HTML page's content.
```

That is the whole product. There is nothing else to learn.

---

## 3. Composition model (normative — this section is the complete spec)

### 3.1 Fragments: includes

- `<include src="/path/file.html">` is replaced by the file's contents. Void-style (as shown) or paired (`<include src="…"></include>`) both build identically — the build inlines includes textually before any parsing. (Browsers parse an unclosed `<include>` as an element that absorbs the siblings after it, so at design time the paired form is the faithful one; the polyfill compensates for the void form by unwrapping.)
- Paths starting with `/` resolve from the source root; all other paths resolve relative to the including file.
- Fragments may include other fragments (cycle-safe, depth-capped, warning on violation).
- A fragment may be Markdown; it is converted before inlining (frontmatter ignored).
- Includes work in Markdown pages too: the tags pass through conversion as raw HTML, then resolve normally.
- Both the tag and the comment form work anywhere in a document, `<head>` included — placement never matters to the build. (In browser preview, `<head>` hoists unknown elements into the body, so the comment form is the faithful one there.)
- **Legacy alias**: Apache SSI syntax — `<!--#include virtual="/path" -->` and `<!--#include file="rel.html" -->` — is supported indefinitely for compatibility and migration from real SSI sites, but documentation teaches `<include>`.

### 3.2 Layouts: the cascade

**Layout selection** (first match wins):

1. `data-unify="/path.html"` on the page's `<html>` or `<body>` — explicit choice.
2. Markdown frontmatter `layout: /path.html` — the Markdown equivalent.
3. The nearest `_layout.html`, looking in the page's directory, then each parent up to the source root.
4. `_includes/layout.html` as the site-wide fallback.
5. No layout: the page is emitted as-is.

A layout may itself declare `data-unify` to chain into a parent layout (section layout → site layout). Chains are depth-capped.

**Merging a page into a layout** — four rules:

1. **Areas.** A layout element with a `unify-*` class is a *public area*. A page element carrying the same class replaces that area's **children** (the layout element itself, its tag and attributes, stays). If a page supplies the same area class more than once, their contents are concatenated in page order. An area class should appear once per layout; duplicates produce a warning and the first is used.
2. **Default slot.** Page body content not addressed to any area replaces the children of the layout's `<main>`. A layout that defines no `<main>` and no areas passes pages through unchanged (with a warning).
3. **Head merge.** Start with the layout's `<head>`. The page's `<title>` is prepended to the layout's, joined with a space — layout `<title>My Site</title>` plus page `<title>Home —</title>` emits `<title>Home — My Site</title>` — so the site name lives in one file; a page with no title keeps the layout's alone. A page `<meta>` replaces a layout `<meta>` with the same `name`/`property`; other page head elements are appended after the layout's, so page CSS loads last and wins the cascade. Exact-duplicate stylesheet/script URLs are deduplicated. A page `<meta charset>` is dropped in favor of the layout's (which stays first in the head), with a located warning.
4. **Root attributes.** On `<html>` and `<body>`, the page's classes are added to the layout's, and any other attribute the page explicitly sets wins over the layout's — so a page can carry `class="home"` styling hooks or set its own `lang`, `dir`, or `data-theme`. Attribute merging exists nowhere else: an area element keeps the layout's tag and attributes.

Edge rules, for determinism: layout chains compose pairwise — the page merges into its layout by these four rules, and that result merges into the parent layout the same way, so heads and body classes accumulate up the chain. A page area class that matches no layout area is a located warning, and its content flows to the default slot instead — content is never silently dropped. If the layout has areas but no `<main>`, unaddressed page content is omitted with a located warning naming the fix (add `<main>` or an area). Duplicate `<main>` elements in a layout: the first wins, with a warning.

`data-unify` attributes are removed from output. `unify-*` classes are **kept** in output — they are real CSS classes and legitimate style hooks.

### 3.3 The `unify-` namespace

All replaceable areas use the `unify-` class prefix, and the only attribute is `data-unify`. The prefix is load-bearing, not cosmetic:

- **Intent is visible**: anyone reading a layout can see exactly what pages are allowed to replace.
- **No collisions**: the mechanism can never clash with the author's own class names.
- **Tooling hook**: design-time tools — the future browser polyfill, editor extensions, a preview highlighter — can find every area with one selector (`[class*="unify-"]`) without heuristics.

### 3.4 Markdown

Markdown pages are equal citizens: converted to HTML, then processed by the same layout rules as any page. Frontmatter keys: `title` sets the page's `<title>` (prepended to the layout's, §3.2), `layout` picks the layout (§3.2), `class` adds classes to the page's `<body>`, `lang` and `dir` set those attributes on `<html>` (all via §3.2 rule 4), and any other key becomes a `<meta name="…" content="…">` tag (`description`, `author`, `robots`). Namespaced metadata is a nested block, plain YAML: keys under `og:` become `<meta property="og:image" …>` tags (`property=` is what Facebook's crawler reads); keys under any other block — `twitter:`, say — become `name=` tags (`twitter:card`). Synthesized tags merge with the layout's head by the §3.2 rules — page wins. Markdown output filenames swap `.md` for `.html`.

### 3.5 URLs

Write paths that are correct for the file you're editing — relative (`hero.jpg`) or root-relative (`/assets/style.css`); both work anywhere. URLs inside layouts and fragments are resolved against the file that wrote them and emitted root-relative, so composed markup is correct at every page depth: authors never compensate for where an include will land, and editor click-through keeps working. Rewriting applies to `href`, `src`, and `srcset`, on the final composed page — after includes and layouts, before `--pretty-urls` and `--base-url`. Stylesheets never need rewriting: mirror-copy ships every CSS file at its source-relative location, so `url()` references inside them keep working untouched.

---

## 4. CLI (complete surface)

```
unify [build]              build the site (default command)
unify watch                build + rebuild on change; pair with any static file server (see notes)
unify init [template]      scaffold a starter site (default, basic, blog, docs, portfolio)

Options:
  -s, --source <dir>       source directory (default: src/ if it exists, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --exclude <glob>     add to the exclude set: never emitted, still usable by the build (repeatable)
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --base-url <path>    site is served from a subpath (e.g. /repo-name/): prefix root-relative links in the output
      --dry-run            run the full build and every check, print the report, write nothing
      --strict             advisories count as problems for the exit code
  -v, --version            print version
  -h, --help               print help
```

That is the entire CLI. Behavior notes:

- **File handling**: `.html`/`.md` files are pages (processed). **Everything else is copied through as-is**, mirroring the source tree — what you see in your folder is what ships, bytes untouched — compress images before adding them. One mechanism holds files back: the **exclude set**. Excluded files are never emitted but remain build material — includable, usable as layouts. Built in and always on: pages and directories starting with `_`, which is what keeps layouts, fragments, and drafts out of the site (any other `_`-named file — Netlify's `_redirects`, say — is ordinary and ships). `--exclude <glob>` adds patterns to the same set, for names you can't underscore (`--exclude "*.psd"`, a synced `design/` folder). Links to anything not emitted are caught by the reference check like any other broken reference. The output directory is always excluded from scanning.
- **`unify.yaml` is saved flags, nothing more.** Every option above may live in an optional `unify.yaml` at the source root — same names, same meanings, CLI wins on conflict — so local runs and CI share one committed invocation instead of retyping flags. No behavior exists that only the file can express; delete it and pass flags instead, and nothing changes. `init` does not create one, and the file itself never ships to output.
- **Subpath hosting.** GitHub Pages project sites serve from `username.github.io/repo-name/`, where root-relative links would break. `--base-url /repo-name/` prefixes root-relative URLs (`href`, `src`, `srcset`) in the built HTML; source files stay rooted at `/`, so local preview keeps working. `--base-url` also accepts a full URL (`https://example.com/`): the origin absolutizes URL values in `og:`/`twitter:` metas and `rel="canonical"`, which crawlers require to be absolute.
- **Pretty URLs move pages, never assets.** Every reference in a moved page — `href`, `src`, `srcset` — is rewritten to keep pointing at the same target, so `![diagram](diagram.png)` beside a Markdown page keeps working.
- **No dev server — the inner loop is `watch` plus any static server.** Serving files with live reload is a solved problem (VS Code Live Preview, `bunx live-server dist`, Vite, caddy); unify's job is to make every such tool work flawlessly by keeping the output directory watcher-friendly. On startup, `watch` prints a copy-paste serve suggestion.
- **The watch contract.** Saves are coalesced into one rebuild; a save landing mid-rebuild queues exactly one follow-up — no change is ever dropped. Every rebuild is a full rebuild (no cache, no incremental machinery — plain HTML is fast enough, and it guarantees watch output is always identical to a fresh `unify build`). Writes are minimal and atomic: a file whose content didn't change is not rewritten (external watchers see exactly what changed — no reload storms), outputs land via temp-then-rename (a server never reads a half-written file), deletions are precise, and `--clean` applies only at startup.
- **Broken builds show in the browser.** In watch mode, a page that fails to build is emitted as a default error page carrying the located error and details — the serving tool's reload puts the diagnosis in front of you, and the next successful rebuild replaces it. `unify build` never emits error pages: errors warn and fail the exit code (below).
- **One error contract, loud and located.** Every problem — a missing include or layout, a page that fails to compose, a broken internal reference — is reported once, naming the file, the reference, and the line where known. `build` always completes best-effort (a missing include leaves a gap rather than killing the page) and exits non-zero if any problem occurred — authors see everything in one pass, CI still gates. `watch` reports the same problems in the terminal and, for a page that fails outright, emits the error page described above. After every build, internal references are checked against the emitted files: a link, image, or asset that resolves to nothing — a renamed page, an image stranded in an underscore folder, a path whose case doesn't match — is a problem like any other. Silent failure is a bug by definition. Set `DEBUG=1` for stack traces.
- **Advisories (the lint layer).** Beside problems sit *advisories* — hygiene findings that break nothing: a `unify-*` area no page ever overrides, a page `<header>`/`<footer>` outside any area (probably meant to override one), an unclosed `<include>` (builds fine, previews wrong — §3.1), a working-format file headed for the output (`.psd`, `.fig`, a multi-megabyte original). Advisories print but never affect the exit code; `--strict` promotes them to problems for CI. Plain language, no rule codes.
- **`--dry-run` is the whole build minus the writes.** Composition, URL rewriting, the reference check, every problem and advisory — reported exactly as a real build would report them, plus a list of what would be written, copied, and deleted. `unify build --dry-run --strict` is the one-line CI lint.
- **Install story leads with the binary.** The headline install is the standalone single-file executable (Linux/macOS/Windows) — the audience has never heard of Bun and shouldn't need to. Bun/npm installs are the secondary, developer path. Bun is the only supported runtime; no Node/Deno claims.

---

## 5. Non-goals

Things unify deliberately does not do, even if asked:

- **unify adds no JavaScript, ever.** Authors may write and ship whatever scripts they like — script files copy through byte-for-byte and `<script>` tags survive composition untouched (§3.2 head merge dedupes only exact-duplicate tags). What never happens: unify injecting, generating, or rewriting JS. No runtime, no hydration, no helper snippets — the output contains exactly the JavaScript the author wrote and not one byte more.
- **No templating language.** No variables, loops, conditionals, or expressions in HTML. The moment unify grows a DSL it has become the thing it exists to escape. The visible costs, accepted with eyes open: the footer year is edited once a year, in one include; list pages are maintained by hand (the blog template models it — publishing a post is adding one line to `index.html`); and every HTML page carries the standard document skeleton, while Markdown pages don't. If one of these costs becomes unbearable at real scale, that is the demonstrated demand the collections bullet below waits for.
- **No configuration language.** `unify.yaml` is optional and is nothing but saved CLI flags (§4). No behavior may exist that only a config file can express — if a feature needs real configuration to explain itself, the feature is wrong.
- **No dev server.** Serving static files with live reload is a solved problem; unify refuses to re-solve it. `unify watch` plus the author's server of choice is the inner loop (§4).
- **No component framework.** No props, no attribute-merge semantics, no scoped component imports with override contracts. Fragments (includes) plus layout areas cover the audience's need.
- **No governance machinery.** Checks speak plain language — no rule codes to memorize, no contract/documentation blocks, no semver-guarded selector APIs.
- **No security theater.** Path traversal safety in include resolution is internal engineering, always on, invisible. unify does not scan the author's own HTML for "vulnerabilities" or gate builds on it.
- **No build-cache/incremental system** until real users have real sites that are actually slow.
- **No collections, pagination, RSS, or taxonomies** for now. This is the "every blog eventually wants it" trap; it gets revisited only on demonstrated demand, and only if it survives the one-sentence and polyfill rules.

---

## 6. Post-MVP candidates (rough priority order)

1. **GitHub Pages / Netlify recipes and an Actions workflow** in the starter templates — directly serves the adoption ambition (OSS projects using unify for their sites).
2. **Browser preview polyfill**: the ~200-line script implementing §3 at runtime, so a source tree is viewable without building. Also serves as the spec's conformance check — build and polyfill must agree.
3. **Sitemap generation** — uses `--base-url`'s origin (§4); cheap, expected for SEO.
4. **HTML minification** (`--minify`).
5. More and better `init` templates.
6. **Markdown include shorthand** — a Markdown-native spelling of `<include>`, considered if real authoring demand appears.
7. **A built-in dev server** — only if real users find pairing `watch` with an external server to be genuine friction; the watch contract (§4) is designed to make this unnecessary.

---

## 7. Realignment yardstick: keep / cut / fix

How the current repository maps to this spec. This is the work plan's table of contents, not the work plan itself — a snapshot of the repository at the time of writing, deleted from this document once realignment lands.

### Keep (trimmed to §3/§4)

- The cascade engine core (`UnifyProcessor`): area matching, head merge, layout chaining — reduced to the four rules in §3.2.
- `<include>` inlining and the SSI processor (legacy alias).
- Markdown pipeline (`markdown-it`, `gray-matter`) trimmed to §3.4 frontmatter.
- The file watcher, rebuilt around the §4 watch contract.
- The dry-run reporter, rewired to the single pipeline (§4 `--dry-run`).
- Config-file loading, reduced to the §4 flags mirror (`unify.yaml`).
- `init` command (repaired: positional template argument, genuinely distinct templates).
- Path-traversal validation as invisible internal safety.
- Standalone binary builds — promoted to the headline install.
- The `linkedom` dependency, accepted openly (drop "zero-dependency" and "HTMLRewriter-powered" claims from all docs).

### Cut

- All slot/`<template>`/`data-slot` documentation and claims (the feature does not exist).
- The `serve` command, dev server, and SSE live-reload layer — serving is delegated to external tooling (§4/§5).
- Component mode, the attribute-merge matrix, ID-stability/ARIA rewriting.
- The linter's rule-code machinery (U001–U008, `--fail-on`, `--fail-level`) — the useful checks survive as §4's plain-language advisories; implementations may be harvested.
- Security scanner and `[SECURITY]` build gates.
- The glob pipeline: `--copy`, `--ignore`, `--ignore-render`, `--ignore-copy`, `--render`, `--auto-ignore`, `--default-layout`, and the classification-tier system behind them.
- Asset *reference tracking* (copy-only-what's-referenced) — replaced by mirror-copy (§4), which is simpler and matches user expectation.
- Incremental builder, build cache, duplicate dependency graphs; one build pipeline remains.
- Short-name layout resolution (`blog` → `_blog.layout.html`) and every path-guessing heuristic beyond §3.1/§3.2's two path forms.
- Dead modules (commented-out resolvers, orphaned minifier/normalizer/clean command, unused cascade modules) and the tests that exercise them. The orphaned link-normalizer and minifier may be harvested when implementing pretty-URL links and post-MVP minify.
- Mock scaffolding and fixture-driven behavior in production paths; the output re-formatter (output preserves source formatting instead of re-indenting the world).

### Fix (the MVP gap — small, and all on the zero-config spine)

1. Automatic `_layout.html` discovery (§3.2 items 3–4): currently non-functional; it is the single most important convention in the product.
2. `--pretty-urls` link rewriting (files currently move but links break).
3. Head merge correctness (duplicate `<title>` from Markdown; unrequested synthesized tags).
4. `unify init blog` positional argument; per-template scaffolds.
5. Default-slot behavior exactly per §3.2 rule 2.
6. Honest packaging: version string, working `package.json` scripts, Bun floor stated once, README rewritten to teach only this spec.
7. An end-to-end test suite that builds the §2 quickstart site (plus a small fixture site per §3 rule) and asserts the output — the suite that makes the golden path unbreakable.
8. The `watch` contract (§4): coalesced full rebuilds, skip-unchanged atomic writes, precise deletions, watch-mode error pages, and the startup serve hint. Verified by an equivalence test (watch output after any edit sequence ≡ fresh build) and a byte-stability test (a no-op rebuild writes nothing).
9. The checks surface (§4): advisories, `--strict`, and `--dry-run` on the single pipeline; `--exclude` and the `unify.yaml` flags mirror.

---

## 8. Success criteria

- A newcomer goes from nothing to a built, deployed-ready site in **under five minutes** using only the README.
- The README teaches **100% of the product**; this spec stays ≤ 3 pages; the composition model stays small enough that the browser polyfill remains feasible.
- A site built today builds identically in five years. No toolchain churn, no framework migrations, no config updates.
- At least one external open-source project adopts unify for its website or docs — the first proof of the "more peaceful internet" ambition.
