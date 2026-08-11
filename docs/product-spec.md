# unify — Product Specification (MVP)

**Status**: Draft v1, for review
**Role**: This document defines what unify is, who it serves, and the complete feature surface of the MVP. Where it conflicts with `app-spec.md` or `dom-spec.md`, this document wins; those documents will be rewritten or retired to match it during realignment.

---

## 1. What unify is

Web pages have needed shared headers, footers, and navigation since the beginning — and HTML still has no way to express that. Every existing answer forces a trade the author didn't ask for: a JavaScript framework, a templating language, a config-heavy build system, or copy-paste.

unify is a static site generator for **front-end designers and hobbyists** — people fluent in HTML and CSS who have no interest in JavaScript frameworks, templating languages, or build tooling. It lets them define a header, footer, nav, or page layout once, in plain HTML files, and have those rendered into every page of the site. The output is plain HTML and CSS. There is nothing to configure and nothing to learn beyond HTML itself.

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
2. **Every source file is valid HTML** that opens in a browser as-is. Layouts are complete pages (their default content is their preview). Pages are complete pages. No template holes, no unbalanced fragments.
3. **Polyfill-able**: the entire composition model must be implementable by a small (~200-line) browser script that produces the same DOM at design time as the CLI produces at build time. The polyfill is the complexity budget — any rule too intricate to live in it is too intricate to ship.
4. **Zero configuration.** Conventions, not config files.

---

## 2. The five-minute site (golden path)

This walkthrough is the product. Every release must keep it true, and the end-to-end test suite builds exactly this site and asserts the output.

```bash
unify init          # scaffold a starter site in the current directory
unify serve         # build + local server + live reload
# …edit files, browser refreshes…
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
    <title>Home — My Site</title>
  </head>
  <body>
    <h1>Welcome!</h1>
    <p>This content lands in the layout's &lt;main&gt;.</p>
  </body>
</html>
```

Built result: the layout, with its `<main>` content replaced by the page's body, and the page's `<title>` winning.

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
title: About — My Site
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

- `<include src="/path/file.html">` is replaced by the file's contents. Self-closing or paired forms both work.
- Paths starting with `/` resolve from the source root; all other paths resolve relative to the including file.
- Fragments may include other fragments (cycle-safe, depth-capped, warning on violation).
- A fragment may be Markdown; it is converted before inlining (frontmatter ignored).
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
3. **Head merge.** Start with the layout's `<head>`. The page's `<title>` replaces the layout's. A page `<meta>` replaces a layout `<meta>` with the same `name`/`property`; other page head elements are appended after the layout's, so page CSS loads last and wins the cascade. Exact-duplicate stylesheet/script URLs are deduplicated.
4. **Body classes.** Classes on the page's `<body>` are added to the layout's `<body>` (so pages can hook per-page CSS like `class="home"`). No other attribute merging exists.

`data-unify` attributes are removed from output. `unify-*` classes are **kept** in output — they are real CSS classes and legitimate style hooks.

### 3.3 The `unify-` namespace

All replaceable areas use the `unify-` class prefix, and the only attribute is `data-unify`. The prefix is load-bearing, not cosmetic:

- **Intent is visible**: anyone reading a layout can see exactly what pages are allowed to replace.
- **No collisions**: the mechanism can never clash with the author's own class names.
- **Tooling hook**: design-time tools — the future browser polyfill, editor extensions, a preview highlighter — can find every area with one selector (`[class*="unify-"]`) without heuristics.

### 3.4 Markdown

Markdown pages are equal citizens: converted to HTML, then processed by the same layout rules as any page. Frontmatter keys: `title` sets the `<title>`, `layout` picks the layout (§3.2), and any other key becomes a `<meta name="…" content="…">` tag (`description`, `author`, `robots`). Namespaced metadata is a nested block, plain YAML: keys under `og:` become `<meta property="og:image" …>` tags (`property=` is what Facebook's crawler reads); keys under any other block — `twitter:`, say — become `name=` tags (`twitter:card`). Synthesized tags merge with the layout's head by the §3.2 rules — page wins. Markdown output filenames swap `.md` for `.html`.

---

## 4. CLI (complete surface)

```
unify [build]              build the site (default command)
unify serve                build + dev server + live reload
unify watch                build + rebuild on change (no server)
unify init [template]      scaffold a starter site (default, basic, blog, docs, portfolio)

Options:
  -s, --source <dir>       source directory (default: src/ if it exists, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --base-url <path>    site is served from a subpath (e.g. /repo-name/): prefix root-relative links in the output
  -p, --port <n>           dev server port (default: 3000)
      --host <host>        dev server host (default: localhost)
  -v, --version            print version
  -h, --help               print help
```

That is the entire CLI. Behavior notes:

- **File handling**: `.html`/`.md` files are pages (processed). Pages and directories starting with `_` are never emitted — that is what keeps layouts, fragments, and drafts out of the site. Any other `_`-named file (Netlify's `_redirects`, for example) is an ordinary file. **Everything else is copied through as-is**, mirroring the source tree — what you see in your folder is what ships. The output directory is always excluded from scanning.
- **Subpath hosting.** GitHub Pages project sites serve from `username.github.io/repo-name/`, where root-relative links would break. `--base-url /repo-name/` prefixes root-relative URLs (`href`, `src`, `srcset`) in the built HTML; source files stay rooted at `/`, so local preview keeps working.
- **Full rebuilds everywhere.** `serve` and `watch` rebuild the whole site on every change. No cache, no incremental machinery — plain HTML processing is fast enough for this audience, and identical behavior across commands is worth more than milliseconds.
- **Errors are loud and located.** A missing include or layout produces a warning naming the file and the reference; the page still builds (dev-friendly); the process exits non-zero if any errors occurred (CI-friendly). Silent failure is a bug by definition.
- **Install story leads with the binary.** The headline install is the standalone single-file executable (Linux/macOS/Windows) — the audience has never heard of Bun and shouldn't need to. Bun/npm installs are the secondary, developer path. Bun is the only supported runtime; no Node/Deno claims.

---

## 5. Non-goals

Things unify deliberately does not do, even if asked:

- **No JavaScript in the output, ever.** The built site is HTML and CSS.
- **No templating language.** No variables, loops, conditionals, or expressions in HTML. The moment unify grows a DSL it has become the thing it exists to escape.
- **No configuration files.** If a behavior needs a config file to explain itself, the behavior is wrong.
- **No component framework.** No props, no attribute-merge semantics, no scoped component imports with override contracts. Fragments (includes) plus layout areas cover the audience's need.
- **No governance machinery.** No linter rule codes, no contract/documentation blocks, no semver-guarded selector APIs.
- **No security theater.** Path traversal safety in include resolution is internal engineering, always on, invisible. unify does not scan the author's own HTML for "vulnerabilities" or gate builds on it.
- **No build-cache/incremental system** until real users have real sites that are actually slow.
- **No collections, pagination, RSS, or taxonomies** for now. This is the "every blog eventually wants it" trap; it gets revisited only on demonstrated demand, and only if it survives the one-sentence and polyfill rules.

---

## 6. Post-MVP candidates (rough priority order)

1. **GitHub Pages / Netlify recipes and an Actions workflow** in the starter templates — directly serves the adoption ambition (OSS projects using unify for their sites).
2. **Browser preview polyfill**: the ~200-line script implementing §3 at runtime, so a source tree is viewable without building. Also serves as the spec's conformance check — build and polyfill must agree.
3. **Sitemap generation** — builds on `--base-url` (§4) gaining a full-origin form; cheap, expected for SEO.
4. **HTML minification** (`--minify`).
5. More and better `init` templates.

---

## 7. Realignment yardstick: keep / cut / fix

How the current repository maps to this spec. This is the work plan's table of contents, not the work plan itself.

### Keep (trimmed to §3/§4)

- The cascade engine core (`UnifyProcessor`): area matching, head merge, layout chaining — reduced to the four rules in §3.2.
- `<include>` inlining and the SSI processor (legacy alias).
- Markdown pipeline (`markdown-it`, `gray-matter`) trimmed to §3.4 frontmatter.
- Dev server with SSE live reload; file watcher.
- `init` command (repaired: positional template argument, genuinely distinct templates).
- Path-traversal validation as invisible internal safety.
- Standalone binary builds — promoted to the headline install.
- The `linkedom` dependency, accepted openly (drop "zero-dependency" and "HTMLRewriter-powered" claims from all docs).

### Cut

- All slot/`<template>`/`data-slot` documentation and claims (the feature does not exist).
- Component mode, the attribute-merge matrix, ID-stability/ARIA rewriting.
- DOM Cascade linter, rules U001–U008, `--fail-on`, `--fail-level`.
- Security scanner and `[SECURITY]` build gates.
- The glob pipeline: `--copy`, `--ignore`, `--ignore-render`, `--ignore-copy`, `--render`, `--auto-ignore`, `--default-layout`, `--dry-run`, and the classification-tier system behind them.
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

---

## 8. Success criteria

- A newcomer goes from nothing to a built, deployed-ready site in **under five minutes** using only the README.
- The README teaches **100% of the product**; this spec stays ≤ 3 pages; the composition model stays small enough that the browser polyfill remains feasible.
- A site built today builds identically in five years. No toolchain churn, no framework migrations, no config updates.
- At least one external open-source project adopts unify for its website or docs — the first proof of the "more peaceful internet" ambition.
