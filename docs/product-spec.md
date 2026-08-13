# unify — Product Specification

**Status**: v0.7.0
**Role**: This document is the product contract: what unify is, who it serves, and the complete feature surface. The rule-by-rule mechanism — every merge rule with worked input→output examples, the algorithms, the error taxonomy — lives in `docs/conformance-spec.md`, the normative implementation reference. The two documents are written to agree; a divergence between them is a defect to be fixed, never a license to reinterpret either. `docs/authoring-rules.md` is the complete authoring surface in under sixty lines.

---

## 1. What unify is

Web pages have needed shared headers, footers, and navigation since the beginning — and HTML still has no way to express that. Every existing answer forces a trade the author didn't ask for: a JavaScript framework, a templating language, a config-heavy build system, or copy-paste.

unify is a static site generator for **front-end designers and hobbyists** — people fluent in HTML and CSS who have no interest in JavaScript frameworks, templating languages, or build tooling. It lets them define a header, footer, nav, or page layout once, in plain HTML files, and have those rendered into every page of the site. The pitch in one line: **HTML-native composition — no expression language, no client runtime**. The output is the HTML and CSS the author wrote; unify adds no JavaScript of its own. Because the source is the same language as the output, a unify site stays reviewable by the person who owns it — read the source, read the built page, and see exactly what happened, no matter who or what wrote the files. unify replaces copy-paste chrome, hand-edited HTML, and Apache SSI — it does not compete with Hugo, Eleventy, or Astro (§5).

The entire authoring surface is four things, learnable in five minutes:

| You want to… | You write… |
|---|---|
| Reuse a fragment (nav, footer, badge) | `<include src="/_includes/nav.html"></include>` |
| Wrap pages in a layout | nothing (the nearest `_layout.html` applies) — `data-layout="/path.html"` to pick one, `data-layout="none"` to opt out |
| Mark where page content lands, or let pages replace a named region | `<main>` for the default; `<slot name="footer">…</slot>` in the layout, `slot="footer"` on a page element |
| Keep a page or folder out of the built site | name it with a leading underscore: `_draft.html`, `_includes/` |

If a capability cannot be expressed with these four, it does not belong in unify.

The composition vocabulary is deliberately standard. `<main>`, `<slot>`, and the `slot` attribute mean in unify exactly what they mean on the platform and in every framework that borrowed them: a named hole with visible fallback content, filled by content marked with the hole's name. The only two unify-specific tokens in the entire model are `<include src>` (a concept HTML never standardized; Apache SSI comments are the valid-HTML alias, §3.1) and `data-layout` (a standard extension attribute carrying the universal word for the concept). Anyone who has never read unify's documentation can parse a unify source tree on sight.

**Design rules that govern every feature decision:**

1. **Explainable in one sentence** to someone who knows only HTML and CSS. If a rule needs a diagram, it's out.
2. **Every source file is real HTML a browser can parse as written.** Layouts and pages are complete documents (a layout's slot fallbacks are its own preview — they render natively in any browser, no script); fragments are well-formed snippets; no template holes, no unbalanced markup. A source file opens and edits anywhere — but *composed* preview is the built site: `unify dev` (§4) serves `dist/` and reloads on save. Previewing an uncomposed source tree is a post-MVP convenience (§6), not a promise this spec makes.
3. **Polyfill-able**: the **HTML** composition model must be implementable by a small (~200-line) browser script that produces the same DOM at design time as the CLI produces at build time. The polyfill is the complexity budget — any HTML rule too intricate to live in it is too intricate to ship. Markdown is explicitly outside that budget: converting `.md` requires the build, and no rule about Markdown is constrained by this test.
4. **Zero configuration.** Conventions, not config files.

---

## 2. The five-minute site (golden path)

This walkthrough is the product. Every release must keep it true, and the end-to-end test suite builds exactly this site and asserts the output.

```bash
unify init          # scaffold a starter site into src/
unify dev           # build, watch, serve, reload — one command, one terminal
# …edit, save, browser reloads…
unify build         # write the final site to dist/
# upload dist/ anywhere: GitHub Pages, Netlify, a $3 shared host
```

`unify init` produces:

```
my-site/
└── src/                  # the source root — everything here ships
    ├── _layout.html      # the site chrome — one complete HTML page
    ├── _includes/
    │   └── nav.html      # a fragment
    ├── index.html        # a page
    ├── about.md          # a Markdown page — equal citizen
    ├── contact.html      # a page that overrides a named region
    ├── 404.html          # a page that opts out of the layout
    └── assets/
        └── style.css
```

Scaffolding into `src/` is what makes zero-config safe: the source root holds only what you meant to publish, so nothing outside it — `.git/`, `.env`, notes, screenshots, the output directory — can reach the built site. A flat site with no `src/` still builds with no flags (§4). The scaffold exercises each primitive exactly once: an include, the automatic layout, a named-slot override, a layout opt-out, and the underscore.

**`_layout.html`** — a complete page you can open in a browser right now. Its slot fallbacks are its own preview (the starter stylesheet carries `slot { display: contents }` so the design-time wrapper adds no box; built pages contain no `<slot>` elements at all):

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>— My Site</title>
    <link rel="stylesheet" href="/assets/style.css">
  </head>
  <body>
    <include src="/_includes/nav.html"></include>
    <main><slot></slot></main>
    <footer class="site-footer">
      <!-- footer: the site byline, or whatever a page puts here instead -->
      <slot name="footer"><p>© My Site</p></slot>
    </footer>
  </body>
</html>
```

**`index.html`** — also a complete page, an ordinary semantic document. It doesn't mention the layout; the nearest `_layout.html` applies automatically:

```html
<!doctype html>
<html>
  <head>
    <title>Home</title>
  </head>
  <body>
    <main>
      <h1>Welcome!</h1>
      <p>This content lands in the layout's &lt;main&gt;.</p>
    </main>
  </body>
</html>
```

Built result: the layout, with its `<main>` content replaced by the page's, and the page's title prepended to the layout's: `<title>Home — My Site</title>`. The separator lives in the layout, so pages write only their own name.

**`contact.html`** — overriding a named region. The layout marked its footer contents with `<slot name="footer">`, so any page may replace them with one standard attribute:

```html
<!doctype html>
<html>
  <head>
    <title>Contact</title>
  </head>
  <body>
    <h1>Contact</h1>
    <p>Ordinary content as usual.</p>
    <p slot="footer">© My Site — <a href="mailto:hi@example.com">email us</a></p>
  </body>
</html>
```

Built `contact.html` — note that the footer contains exactly the element the author wrote, and no tool vocabulary of any kind survives into the output:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Contact — My Site</title>
    <link rel="stylesheet" href="/assets/style.css">
  </head>
  <body>
    <nav><a href="/">Home</a> <a href="/about.html">About</a> <a href="/contact.html">Contact</a></nav>
    <main>
      <h1>Contact</h1>
    <p>Ordinary content as usual.</p>
    </main>
    <footer class="site-footer">
      <p>© My Site — <a href="mailto:hi@example.com">email us</a></p>
    </footer>
  </body>
</html>
```

**`about.md`** — Markdown pages work identically; frontmatter supplies the head:

```markdown
---
title: About
description: Who we are
---

# About

Everything here is converted to HTML and dropped into the layout
exactly like an HTML page's content.
```

That is the whole product. There is nothing else to learn.

---

## 3. Composition model (normative — the composition rules; §4 carries the file, exclusion, and error rules)

### 3.1 Fragments: includes

- `<include src="/path/file.html"></include>` is replaced by the file's contents. The paired form shown here is what documentation teaches and what every example uses. The void form (`<include src="…">`) builds identically — the build inlines includes textually before any parsing — but browsers parse an unclosed `<include>` as an element that absorbs the siblings after it, so a source file using it previews wrong in a browser even though it builds right. Both forms are supported; the void form carries an advisory (§4) naming that trade.
- Paths starting with `/` resolve from the source root; all other paths resolve relative to the including file. Include targets are `.html` or `.md` files.
- **Includes are verbatim — `<include>` never takes fills.** Content between an include's tags is a problem, not a component call: the file's contents replace the element, full stop. Parameterized fragments are a declared non-goal (§5); the sanctioned answer is a generator script (§4, composing with other tools).
- Fragments may include other fragments (cycle-safe, depth-capped; a cycle or depth violation is a problem that prints the full chain — a truncated chain is content the author wrote that would not appear).
- A fragment may be Markdown; it is converted before inlining (frontmatter ignored).
- Includes work in Markdown pages too: the tags pass through conversion as raw HTML, then resolve normally — on its own line an include splices as a block, mid-sentence it splices inline, and inside a code fence or code span it stays literal text, which is what lets a Markdown page document the include syntax itself. Because resolution comes after conversion, the fragment's own markup is never run through the Markdown converter.
- Both the tag and the comment form work anywhere in a document, `<head>` included — placement never matters to the build. (In browser preview, `<head>` hoists unknown elements into the body, so the comment form is the faithful one there.)
- **Legacy alias**: Apache SSI syntax — `<!--#include virtual="/path" -->` and `<!--#include file="rel.html" -->` — is supported indefinitely for compatibility and migration from real SSI sites, and it is also the W3C-valid spelling for authors who care about validation (`<include>` is the one non-standard token in the model). Documentation teaches `<include>`.

### 3.2 Layouts: selection

**Layout selection** (first match wins):

1. `data-layout="none"` on the page's `<html>` or `<body>`, or Markdown frontmatter `layout: none` — **opt out**: the page is emitted as-is, with includes and URL rules still applied. (A layout-less Markdown page is converted and wrapped in a minimal HTML shell — doctype, a head built from its frontmatter, its converted body — because conversion alone yields a fragment, not a document a browser renders correctly.) This is how 404 pages, redirect stubs, embeddable demos, standalone landing pages, and externally supplied documents live in a site that otherwise has a layout.
2. `data-layout="/path.html"` on the page's `<html>` or `<body>` — explicit choice.
3. Markdown frontmatter `layout: /path.html` — the Markdown equivalent.
4. The nearest `_layout.html`, looking in the page's directory, then each parent up to the source root.
5. No layout found: the page is emitted as-is.

**Layouts do not chain.** A layout that itself declares `data-layout` is a problem, located, naming the layout file — layout chaining is not supported in v0.7.0, and unify says so rather than silently ignoring the attribute. A section that wants its own chrome writes a complete `_layout.html` in its directory (item 4 above already scopes discovery per directory); the accepted cost is repeating shared chrome across section layouts. Chaining is a recorded post-MVP candidate (§6). Layout references are paths to `.html` files — `/` resolves from the source root, anything else relative to the declaring file. A bare name (`layout: default`) is a problem naming the fix: layouts are paths, and unify never guesses. `data-layout` means nothing on any element other than a page's `<html>` or `<body>`; anywhere else it is a problem naming `<include src="…">` as the replacement — `data-layout` is never a component import.

**Migration from the v0.6 vocabulary**: a `data-unify` attribute anywhere, or a class beginning `unify-`, is a problem naming the v0.7.0 spelling (`data-layout`, `<slot name>`/`slot=`). One-edit diagnosis, never silent behavior drift.

### 3.3 The merge — four rules

**Rule 1 — Slots.** A layout's `<body>` may contain `<slot>` elements. A page element carrying `slot="name"` fills `<slot name="name">`: **the slot element is replaced by the filling element(s)** — the page's markup ships exactly as written, no attribute merging, no discarding (the consumed `slot` attribute itself is removed). Multiple fills with the same name land in page order. A slot nothing fills is replaced by its own children (its fallback — which is also what a browser shows when the layout is opened directly). `slot=` is honored on the page's own top level — the children of `<body>`, and the children of the `<main>` you wrote, wherever you put it. That scope is what keeps unify's hands off `slot=` inside an author's own web-component markup: the parent of a fill is always `<body>` or your `<main>`, never a component. Slots inside `<template>` elements are never touched (that is an author's declarative shadow DOM, not unify's). Slots are recognized only in layouts, and only in `<body>`; a `<slot>` anywhere else is an advisory and is replaced by its own children. A second bare `<slot>` in a layout, or a repeated slot name, is an advisory and the first wins.

The layout author controls the replacement boundary by where they put the slot, with no additional rule:

```html
<!-- Replace the whole element: the page's element ships, tag and all -->
<slot name="hero"><section class="hero">Default hero</section></slot>

<!-- Replace only the children: the styled wrapper persists -->
<footer class="site-footer"><slot name="footer"><p>© My Site</p></slot></footer>
```

**Rule 2 — Main, the zero-vocabulary default.** Page content not addressed to a named slot goes to the layout's bare `<slot>`; if the layout has no bare slot, it replaces the children of the layout's `<main>`. Before the merge, incoming body content is unwrapped once: if it contains a `<main>`, that element is replaced by its children — so a page written as a complete semantic document composes without nesting `<main>` inside `<main>`. No other element is unwrapped. If the layout has named slots but neither a bare `<slot>` nor a `<main>`, unaddressed page content would vanish: that is a problem, located, naming the fix. A layout with no slots and no `<main>` contributes its head and passes the page's body through unchanged — a head-only layout (shared stylesheet, shared metas, no body chrome) is a legitimate construct, not a mistake.

The precedence rule, in one sentence: **named fills go to named slots, everything else to the bare slot, else into `<main>`.**

A layout that wants persistent content inside `<main>` alongside page content writes it explicitly — every such case is visible in the layout's own markup, previews correctly in a browser, and needs zero additional rules:

```html
<main>
  <slot name="hero"><section class="hero">Default hero</section></slot>
  <slot></slot>
</main>
```

**Rule 3 — Head merge.** Start with the layout's `<head>`. The page's `<title>` is prepended to the layout's, joined with a space, so the separator is written once, in the layout: layout `<title>— My Site</title>` plus page `<title>Home</title>` emits `<title>Home — My Site</title>`. The site name and the separator both live in one file, pages write only their own name, and a page with no title keeps the layout's alone. The separator stays the author's choice — an em dash, a pipe, a middot, or nothing at all. A page `<meta>` replaces a layout `<meta>` with the same `name`/`property`; a page `<link rel="canonical">` or `<link rel="icon">` replaces the layout's same-`rel` element — one canonical, one icon set, never two. Every other page head element is appended after the layout's, so page CSS loads last and wins the cascade. Exact-duplicate stylesheet/script references are deduplicated, compared after §3.6 URL resolution — so a page's `assets/style.css` and a layout's `/assets/style.css` are one reference, not two downloads. A page `<meta charset>` is dropped in favor of the layout's, which stays first in the head; if the layout declares none, the page's is kept and moved first. Identical charsets are silent (every complete document has one); a page declaring a *different* charset from the layout's is an advisory.

**Rule 4 — Root attributes.** On `<html>` and `<body>`, the page's classes are added to the layout's, and any other attribute the page explicitly sets wins over the layout's — so a page can carry `class="home"` styling hooks or set its own `lang`, `dir`, or `data-theme`. Attribute merging exists nowhere else: Rule 1's replace-element semantics make elementwise attribute rules unnecessary, because the author's markup ships as written.

Edge rules, for determinism: a fill addressed to a slot the layout doesn't have is an advisory, and its content flows to the default slot instead — nothing is lost, so the build still publishes. A slot never appears inside another slot's fallback — that is a problem (the nested slot would silently vanish the moment the outer slot is filled, which the content-loss law forbids). A page top-level `<header>` or `<footer>` outside any slot is an advisory (it probably meant `slot=`). A duplicated construct of which only the first counts — a second bare `<slot>`, a repeated slot name, a second `<main>` — is an advisory naming the duplicate; the first wins.

**Content the author wrote is never dropped without failing the build.** Any case where page content or a head element would not appear in the output is a problem, located, naming the fix — and advisories never involve losing something the author wrote. That rule assigns every case above, and every case not yet enumerated.

`data-layout` attributes are removed from output, and a `<script>` carrying `data-polyfill` is removed with it (§6 — an author-signed request to strip a design-time aid, not unify deciding to touch the author's JavaScript). Built output contains no `<slot>` elements and no unify vocabulary of any kind — except inside `<template>` elements, which unify never touches.

### 3.4 Why this vocabulary

- **`<main>` is the HTML spec's own page/chrome division.** The spec defines `<main>` as content "unique to this document," explicitly excluding repeated site chrome — which is *verbatim* the division unify automates. Authors already write it for their own reasons; the default slot costs nothing to learn.
- **`slot` carries its framework semantics, intact.** Astro, Vue, Svelte, and web components all mean the same thing by it: a named hole with fallback content, replaced element-for-element by content marked with its name. unify borrows the platform's own scoping rules too — fills count only on direct children, and `<template>` interiors are off limits — which is precisely what protects an author's real web-component markup from the build.
- **Layouts preview themselves.** A slot's fallback children render in any browser with no script, so a layout opened directly shows its own defaults.
- **Tooling needs one selector**: `slot[name]` finds every named region of a layout; `grep -o '<slot[^>]*>' src/_layout.html` lists the contract. A plain HTML comment above each slot (`<!-- Above-the-fold hero -->`) is the documentation convention the scaffold demonstrates; there is no enforced documentation block.

### 3.5 Markdown

Markdown pages are equal citizens: converted to HTML, then processed by the same layout rules as any page. Frontmatter keys: `title` sets the page's `<title>` (prepended to the layout's, §3.3), `layout` picks the layout (§3.2), `class` adds classes to the page's `<body>`, `lang` and `dir` set those attributes on `<html>` (all via §3.3 rule 4), and any other key becomes a `<meta name="…" content="…">` tag (`description`, `author`, `robots`). Namespaced metadata is a nested block, plain YAML: keys under `og:` become `<meta property="og:image" …>` tags (`property=` is what Facebook's crawler reads); keys under any other block — `twitter:`, say — become `name=` tags (`twitter:card`). Synthesized tags merge with the layout's head by the §3.3 rules — page wins. A list value emits one `<meta>` per item, in order. Markdown output filenames swap `.md` for `.html`.

A Markdown page with no frontmatter `title` uses the text of its first `<h1>` as the page title — the most common frontmatter chore, removed. A page with neither keeps the layout's title alone.

Headings converted from Markdown get an `id` derived from their text (lowercase; each run of whitespace becomes one hyphen; every remaining character that is not a letter, digit, or hyphen is dropped; leading and trailing hyphens trimmed; a repeat within the page gets `-2`, `-3`), so every heading is a deep link — the one thing documentation cannot do without. A heading that already carries an explicit `id` keeps it. HTML pages are untouched: unify never rewrites headings the author wrote.

Those keys are the only ones with behavior. unify has no `date`, `tags`, `categories`, `draft`, `permalink`, or `slug` handling — those are other generators' features, and here they become plain `<meta>` tags like any other key, so `draft: true` publishes the page. A leading underscore (`_draft.md`) is how a page is held back (§1, §4). Values ship exactly as written — `draft: true` becomes `content="true"`, `date: 2026-01-01` stays `2026-01-01`; unify never reinterprets your metadata through YAML's type system. Frontmatter flattens exactly one level of blocks: a value nested deeper (a mapping under `og:image`) has no honest `<meta>` form and is a problem, located, naming the key.

**Two hard errors close the two highest-frequency cross-generator reflexes**, both silently wrong otherwise: frontmatter atop an `.html` page is a problem (it would render as visible text — HTML pages have no frontmatter; use `<head>`), and a literal `<head>` element in a Markdown body is a problem (it would land in the body — Markdown heads come from frontmatter). The honest residue of the small frontmatter surface is stated, not papered over: a Markdown page cannot express `rel="canonical"`, `rel="preload"`, or JSON-LD. Put those in the layout, or write that page in HTML.

### 3.6 URLs

Write paths that are correct for the file you're editing — relative (`hero.jpg`) or root-relative (`/assets/style.css`); both work anywhere. URLs inside layouts and fragments are resolved against the file that wrote them and emitted root-relative, so composed markup is correct at every page depth: authors never compensate for where an include will land, and editor click-through keeps working. Rewriting applies to `href`, `src`, `srcset`, and `poster`, on the final composed page — after includes and layouts, before `--pretty-urls` and `--base-url`. It does not reach inside `<style>` blocks or `style` attributes: a `url()` written in a layout or fragment must be root-relative, or live in a stylesheet file. (Unreachable is not unchecked — the post-build reference check audits those `url()`s like every other URL, so one that points at nothing fails the build instead of 404ing quietly.) Stylesheets never need rewriting: mirror-copy ships every CSS file at its source-relative location, so `url()` references inside them keep working untouched.

**Always link the real file.** Write `href="about.html"`, never a hand-written pretty URL like `/about/` — the real file previews correctly, works without any flags, and `--pretty-urls` (§4) rewrites every internal link to the pretty form at build time. A hand-written pretty URL is a link to a file that does not exist in the source tree, and the reference check treats it as exactly that.

---

## 4. CLI (complete surface)

```
unify [build]              build the site (default command)
unify dev                  build, watch, serve, and reload — the inner loop
unify watch                build + rebuild on change, no server (pair with your own)
unify init [template]      scaffold a starter site (default, basic, blog, docs, portfolio)

Options:
  -s, --source <dir>       source directory (default: src/ if it exists, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --exclude <glob>     globs never emitted, still usable by the build (repeatable; default: _*)
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --base-url <url>     the site's whole address (https://site.example/repo/): prefix root-relative links, and make og:/canonical absolute for share crawlers
      --dry-run            run the full build and every check, print the report, write nothing
      --strict             advisories count as problems for the exit code
  -p, --port <n>           port for `unify dev` (default: 3000)
  -v, --version            print version
  -h, --help               print help
```

That is the entire CLI. Behavior notes:

- **File handling**: `.html`/`.md` files are pages (processed) — except a name ending `.fragment.html`, which opts out: it ships as written, a bare snippet published for `<include>` consumers, embeds, or client-side `fetch`/`hx-get`, since a page must be a complete document and a fragment deliberately is not. **Everything else is copied through as-is**, mirroring the source tree — what you see in your folder is what ships, bytes untouched — compress images before adding them. One option holds files back: `--exclude`, a set of globs whose matches are never emitted but remain build material — includable, usable as layouts. Its default is `_*` — the same naming convention layout discovery uses (§3.2), so the files the build consumes are the files the output omits, and `init && build` is correct with zero configuration (an empty default would ship `dist/_layout.html` as a junk page). A glob without a `/` matches any path segment, so the single default covers `_layout.html`, `_includes/`, `_scripts/`, `_notes/`, and `blog/_draft.md`. Set your own globs and they replace the default, like any option; keep `_*` in your list if you still want it. Replacing it cannot silently publish the build's own working files: an emitted file that is a `_`-prefixed page, or whose path contains a `_`-prefixed directory segment, is a problem naming the file and the `--exclude` line that fixes it (`--exclude '_*' --exclude 'drafts/**'`). The guard deliberately does not cover root-level non-page files like `_headers` and `_redirects` — Netlify sites need to ship them, for the same reason dotfiles ship, and replacing the default with globs that spare them is exactly how (the conformance spec carries the worked recipe). Nor is holding one back silent: nothing links to these files, so their absence is invisible to the reference check — a known deployment file (`_headers`, `_redirects`, and kin; a short list maintained in the code) kept out of the output by the exclude set is an advisory naming the file and the `--exclude` line that ships it. Everything in the source root ships unless a glob holds it back, so anything that is not part of the site — notes, drafts, scratch files, scripts — belongs under a leading underscore. Links to anything not emitted are caught by the reference check like any other broken reference.
- **Never-shipped files (safe by default).** Independent of `--exclude`, and never replaceable by it: the output directory, VCS metadata (`.git/`, `.hg/`, `.svn/`), `node_modules/`, `.env` and `.env.*`, and `unify.yaml`. `--exclude` is an authoring option; this is a footgun guard, in the same family as writing output atomically. It stays deliberately short and literal — no scanning, no heuristics, no "looks secret" guessing (§5's no-security-theater rule). Note what is *not* on it: dotfiles ship. `.htaccess` and `.nojekyll` are exactly the files this audience needs to deploy. Running unify with no `--source` in a directory that has no `src/` — a directory you didn't scaffold — prints the count of files about to be copied and points at `--dry-run`: an honest report, not a guess about your intent (naming a source directory yourself, even `.`, turns the notice off — that *is* the intent).
- **Output safety.** `--clean` refuses to run when the output directory is, or contains, the source root or the working directory — `-o . --clean` is an error, not a deleted project. Sitting *inside* them is fine and ordinary: `src/` beside `dist/` is what `init` scaffolds. Two sources that would write the same output file (`about.md` and `about.html`; a `--pretty-urls` move landing on an existing `about/index.html`) are a problem naming both sources — never a silent last-write-wins. Outputs differing only by letter case are an advisory (they collide on case-insensitive filesystems and hosts). Symlinks are followed only while they resolve inside the source root; one pointing outside is treated as absent, with an advisory.
- **`unify.yaml` is saved flags, nothing more.** Every option above may live in an optional `unify.yaml` at the source root — same names, same meanings, CLI wins on conflict — so local runs and CI share one committed invocation instead of retyping flags. No behavior exists that only the file can express; delete it and pass flags instead, and nothing changes. `init` does not create one, and the file itself never ships to output.
- **Subpath hosting.** GitHub Pages project sites serve from `username.github.io/repo-name/`, where root-relative links would break. `--base-url` takes the site's whole address (`https://username.github.io/repo-name/`) and does two things with it: the path part prefixes every root-relative URL in the built HTML — `href`, `src`, `srcset`, `poster`, and the URL values in `og:`/`twitter:` metas — and the origin absolutizes og:/twitter:/canonical, which crawlers require to be absolute, against the whole base (origin **and** subpath), so an og:image lands at `https://example.com/repo/assets/x.jpg`, exactly where the file is served. Source files stay rooted at `/`, so local preview keeps working. A bare path is a usage error: it prefixed links correctly while leaving social metadata root-relative and unfetchable, which authoring trials showed was both the obvious-looking choice and a silent one.
- **Pretty URLs move pages, never assets.** Every reference in a moved page — `href`, `src`, `srcset`, `poster` — is rewritten to keep pointing at the same target, so `![diagram](diagram.png)` beside a Markdown page keeps working. A root `404.html` is never moved: hosts look for it at that exact path.
- **`unify dev` is the inner loop: one command, one terminal.** It builds, watches, serves `dist/` on `localhost:3000`, and reloads the browser on every rebuild. The audience installs a single binary and has never heard of Bun, npm, or `npx` — telling them to run a second tool in a second terminal before they can see their own site is the wrong first five minutes. Scope is deliberately minimal and fixed: static files, directory indexes, a 404 page, and reload. No proxying, no HTTPS, no middleware, no plugins, no config — if a request needs any of that, it needs a real server, and `unify watch` (no server, same watch contract) exists precisely so any external tool can own serving. Reload is injected only into pages served by `unify dev` and exists nowhere in `unify build` output, which keeps §5's no-JavaScript rule exactly true for everything that ships.
- **The watch contract** (`dev` and `watch` alike). Saves are coalesced into one rebuild; a save landing mid-rebuild queues exactly one follow-up — no change is ever dropped. Every rebuild is a full rebuild (no cache, no incremental machinery — plain HTML is fast enough, and it guarantees watch output is always identical to a fresh `unify build`). Writes are minimal and atomic: a file whose content didn't change is not rewritten (external watchers see exactly what changed — no reload storms), outputs land via temp-then-rename (a server never reads a half-written file), deletions are precise, and `--clean` applies only at startup.
- **Broken builds show in the browser.** While watching, a page that fails to build is emitted as a default error page carrying the located error and details — the reload puts the diagnosis in front of you, and the next successful rebuild replaces it. `unify build` never emits error pages.
- **`build` publishes all-or-nothing.** Composition into a temporary tree is best-effort — every problem in the site is found and reported in one pass, so authors never fix errors one run at a time — but the output directory is only updated if there were zero problems. A build that reports errors leaves the previous `dist/` untouched and exits non-zero: a half-composed page with a missing header can never be uploaded by someone who didn't read the terminal. Iterating on a broken site is what `dev`/`watch` are for; publishing is what `build` is for, and it does not publish broken sites.
- **One error contract, loud and located.** Every problem — a missing include or layout, a page that fails to compose, a broken internal reference, an output collision — is reported once, naming the file, the reference, and the line where known, with a short fix list that always includes checking the path spelling and casing (a case-mismatched path builds on macOS and 404s on the Linux host). Cycle and depth errors print the full chain (`_layout.html → _includes/nav.html → _layout.html`). After every build, internal references are checked against the emitted files — every URL the output contains, not only the ones rewriting touches, so anything the rewriter does not reach fails loudly instead of 404ing quietly. A link, image, or asset that resolves to nothing — a renamed page, an image stranded in an underscore folder, a path whose case doesn't match — is a problem like any other. Silent failure is a bug by definition. **Exit codes: `0` — the site was published (with `--dry-run`, would have been); `1` — problems were found, nothing was published, the previous `dist/` is untouched (under `--strict`, advisories alone also exit `1` without changing what was published); `2` — invalid usage or a fatal environment error (bad flag, missing source directory), so a caller can tell "I mistyped a flag" from "my site has errors".** Diagnostics go to stderr, the build summary and `--dry-run` list to stdout, both ordered by path then line, so two runs over the same tree print the same bytes. Every line begins with its location and severity (`src/about.html:12: problem: …`); that prefix is stable, the message after it is prose and is not a contract. Set `DEBUG=1` for stack traces.
- **Advisories (the lint layer).** Beside problems sit *advisories* — hygiene findings that break nothing: a page `<header>`/`<footer>` outside any slot (probably meant `slot=`), an unclosed `<include>` (builds fine, previews wrong — §3.1), a working-format file headed for the output (`.psd`, `.fig`, a multi-megabyte original), a file used as a layout or include that also ships as its own page, a deployment file (`_headers`, `_redirects`) held out of the output by the exclude set. Advisories print but never affect what is published; with `--strict` they affect the exit code too, so a stray `.psd` can never cost you a publish. Plain language, no rule codes.
  The list is closed and fits on one screen (the complete catalogue is in the conformance spec). An advisory that fires on a correct site is a bug in the advisory: `unify init && unify build --dry-run --strict` exits zero, and the end-to-end suite asserts it. Because §5 refuses rule codes there is no way to silence one you have chosen to accept, so every advisory unify ships is permanent and the catalogue is capped at twelve — at the cap, adding one means removing one. Advisories report what the build observed and what it did; they never instruct the author to restructure markup that composed correctly.
- **`--dry-run` is the whole build minus the writes.** Composition, URL rewriting, the reference check, every problem and advisory — reported exactly as a real build would report them, plus the address the build assumed (`serving from https://example.com/repo/`, or the domain root when no `--base-url` is set) and a list of what would be written, copied, and deleted, each row naming the URL it answers to and what it composed from — `write dist/about.html (/repo/about.html) ← about.md + _layout.html`, or `← 404.html (no layout)` for an opt-out. Layout resolution is the one fact in §3 that cannot be read from a single file, and this is the mode whose whole purpose is telling you what the build would do. `unify build --dry-run --strict` is the one-line CI lint.
- **Composing with other tools: the plugin interface is the filesystem.** unify reads one directory and writes another, and that is the whole extension story — there is no plugin API, and none is planned. Generators run before (`node _scripts/gen-blog.mjs && unify build`) and write pages *into the source tree*, where they are indistinguishable from hand-authored ones: layouts apply, heads merge, URLs resolve, and the reference check audits their output — rename a post and the build reports the stale index link. Post-processors run after and read `dist/`, which the watch contract makes safe to consume (atomic writes, unchanged files untouched, precise deletions). The default `_*` exclusion gives that tooling a home inside the source tree — `_scripts/` never ships. Builds are deterministic: same tree in, same tree out. Anything unify declines to do (§5) can be done on either side of it by a tool the author owns, in whatever language they like.
- **Install story leads with the binary.** The headline install is the standalone single-file executable (Linux/macOS/Windows) — the audience has never heard of Bun and shouldn't need to. Bun/npm installs are the secondary, developer path. Bun is the only supported runtime; no Node/Deno claims.

---

## 5. Non-goals

Things unify deliberately does not do, even if asked:

- **unify ships no JavaScript, ever.** Authors may write and ship whatever scripts they like — script files copy through byte-for-byte and `<script>` tags survive composition untouched (§3.3 head merge dedupes only exact-duplicate references). What never happens: unify injecting, generating, or rewriting JS in built output. No runtime, no hydration, no helper snippets — `unify build` emits exactly the JavaScript the author wrote and not one byte more. Two bounded exceptions, both author-visible: `unify dev` injects a reload script into the pages *it serves* (never into `dist/`), and a script tag the author marks `data-polyfill` is removed by the build because the marker asks for it (§3.3, §6).
- **No templating language.** No variables, loops, conditionals, or expressions in HTML — no `{{ }}`, no `{% %}`, no props. The moment unify grows a DSL it has become the thing it exists to escape. The visible costs, accepted with eyes open: the footer year is edited once a year, in one include; every HTML page carries the standard document skeleton, while Markdown pages don't; and anything derived from a set of files — a post index, a feed — is either maintained by hand or generated by a script the author owns, before the build (§4, composing with other tools). That seam is the sanctioned answer, not a workaround: the blog template ships a ~40-line, zero-dependency `_scripts/gen-blog.mjs` that writes `blog.html` and `feed.xml` from a folder of posts, and the build then treats both as ordinary source. A tool the author reads in one sitting beats a DSL the tool owns. Active nav state is *not* on that list: the page sets `<body class="home">` (§3.3 rule 4) and the stylesheet does the rest — `body.home .nav-home { … }`. Styling only, no `aria-current`; that is the trade.
- **No component framework.** No props, no attribute-merge semantics, no scoped component imports with override contracts. Slots fill layouts; includes stay verbatim — **`<include>` never takes fills** (§3.1), which is the line that keeps slots from becoming a component framework. Fragments plus layout slots cover the audience's need.
- **No configuration language.** `unify.yaml` is optional and is nothing but saved CLI flags (§4). No behavior may exist that only a config file can express — if a feature needs real configuration to explain itself, the feature is wrong.
- **No style scoping.** unify never rewrites, scopes, or isolates the author's CSS. "How do I stop this fragment's styles leaking?" has a platform answer — `@scope`, `@layer`, CSS nesting, or a class prefix — and unify's answer is to stay out of the way.
- **No general-purpose web server.** `unify dev` serves static files and reloads, and that is its permanent scope (§4): no proxying, HTTPS, middleware, plugins, or config. Anything beyond it is delegated to a real server, which `unify watch` exists to pair with.
- **No migration path from other site generators.** unify's audience is people hand-maintaining HTML, copy-pasting headers, or running Apache SSI (whose syntax §3.1 supports indefinitely for exactly this reason). Moving a Hugo, Eleventy, Jekyll, or Astro site here means giving up collections, templating, and data files — features those tools exist to provide. unify competes with copy-paste, not with them. (The one migration unify does owe its own users — v0.6's `data-unify`/`unify-*` vocabulary — is handled loudly: §3.2 diagnoses every occurrence by name.)
- **No governance machinery.** Checks speak plain language — no rule codes to memorize, no contract/documentation blocks, no semver-guarded selector APIs.
- **No security theater.** Path traversal safety in include resolution is internal engineering, always on, invisible. unify does not scan the author's own HTML for "vulnerabilities" or gate builds on it.
- **No build-cache/incremental system** until real users have real sites that are actually slow.
- **No collections, pagination, RSS, or taxonomies** built into the tool. This is the "every blog eventually wants it" trap. The answer is the composition seam above — a generator the author owns, run before the build — and that answer is deliberately better than a feature: it is inspectable, it costs the tool nothing, and its output is checked by the reference check. Building it in gets revisited only on demonstrated demand from authors who have used the seam and found it wanting, and only if it survives the one-sentence and polyfill rules.
- **Not advertised for blogs or documentation sites at launch.** Both work — the blog template plus its generator is a real workflow, and Markdown pages get heading anchors (§3.5) — but a docs site wants generated navigation and search, which live outside the tool. Launch positioning is where unify is unambiguously strongest: brochure, portfolio, campaign, and project sites; existing hand-written HTML adopting shared chrome; SSI migration. Advertising blogs and docs as headline use cases waits until the recipes (§6) make them boring.

---

## 6. Post-MVP candidates (rough priority order)

1. **Recipes: deploy and compose** — GitHub Pages / Netlify walkthroughs and an Actions workflow in the starter templates, plus a short cookbook for the §4 seam: post-build search with Pagefind, a git-based editing UI (Decap/Sveltia) over the source tree, external link checking, image compression, and the blog generator explained line by line. Non-normative, and the cheapest way to raise the product's ceiling without growing the tool. Includes the honest list of what does *not* fit: per-page parameterization, i18n, and bundler pipelines.
2. **Sitemap generation** — uses `--base-url`'s origin (§4); cheap, expected for SEO, and currently the most-missed omission for any real site.
3. **Browser preview polyfill**: the ~200-line script implementing §3's **HTML** rules at runtime, so an HTML source tree is viewable without building (Markdown is out of scope — §1 rule 3). Loading is author-controlled: a `<script src="…" data-polyfill></script>` tag in the layout, which the build strips exactly as it strips `data-layout` attributes — so the preview aid never reaches `dist/`. The slot model shrinks it: unfilled slots already render their fallbacks natively, so the polyfill only performs includes, the merge, and fills. Doubles as the conformance check for the HTML rules: build and polyfill must agree.
4. **HTML minification** (`--minify`).
5. More and better `init` templates.
6. **Markdown include shorthand** — a Markdown-native spelling of `<include>`, considered if real authoring demand appears.
7. **`--run <cmd>`, a pre-build hook** — sugar for the §4 seam, so `unify dev` can re-run a generator when sources change instead of the author running a second watcher. Only if the two-process inner loop proves to be genuine friction; `&&` already covers `build`.
8. **Layout chaining** (a layout declaring `data-layout` to compose into a parent) — deliberately not in v0.7.0, where it is a located problem (§3.2). It returns only on demonstrated demand from real sites that outgrow standalone section layouts, and whoever revisits it should price it with eyes open: it costs pairwise merge semantics, head and title accumulation up the chain, and defined interactions with the unwrap and with slot filling — a whole extra dimension of the composition model for a pattern the launch audience's small sites have not asked for. Until then, the sanctioned answer is a complete `_layout.html` per section, repeating shared chrome.

---

## 7. What v0.7.0 requires

This spec is not a description of the current implementation — the composition core is being rewritten against it. What the document set demands of that implementation, without hedging:

1. **The composition model of §3, exactly** — slots, the `<main>` default, the unwrap, the four merge rules, layout discovery — with `docs/conformance-spec.md` as the normative mechanism reference. Its worked examples are the test fixtures; an implementation conforms when it reproduces them exactly in structure, attributes, and text content (whitespace between block-level elements is not normative — conformance spec §3).
2. **The old vocabulary is diagnosed, never honored.** `data-unify` and `unify-*` classes produce located problems naming the v0.7.0 spelling. No code path composes by area classes, landmarks (beyond `<main>`), ordered fill, or component imports.
3. **The engine contract of §4, in full**: transactional all-or-nothing publish, the post-build reference check, output collision detection, mirror copy, URL provenance rewriting, the `--exclude` default and its guard, the never-shipped list, the watch contract, `unify dev`, `--dry-run` composition reporting, exit codes 0/1/2, and the two-severity error contract with the advisory discipline.
4. **The golden path is executable and tested**: `unify init && unify dev` works end to end, the E2E suite builds the §2 site and asserts its output, and `unify init && unify build --dry-run --strict` exits zero.
5. **The documents stay in lockstep**: `docs/authoring-rules.md` states every authoring rule in under sixty lines and is embedded verbatim in the README (asserted by a byte-identity test); no shipped behavior may contradict any document in this set.

---

## 8. Success criteria

- A newcomer goes from nothing to a built, deployed-ready site in **under five minutes** using only the README, with two commands (`unify init`, `unify dev`) and one terminal.
- **The rules an author needs fit on one screen.** `docs/authoring-rules.md` states every authoring rule and nothing else, in under sixty lines, and the end-to-end suite builds the §2 site driven only by it. That file is the whole product surface in a form anyone — a newcomer, a reviewer, or a coding agent — can hold at once; if a rule cannot survive the trip into it, the rule is too complicated.
- The README teaches **100% of the product** and is read in one sitting; the HTML composition model stays small enough that the browser polyfill remains feasible. The measure of smallness is the **authoring surface** — the four primitives of §1 — not this document's length. This spec is the product contract and grows when honesty requires it; implementation minutiae belong in `docs/conformance-spec.md`.
- **Nothing you didn't mean to publish ever reaches `dist/`, and a build that reports errors never publishes at all.** Deploy safety is a success criterion, not an implementation detail.
- A site built today builds identically in five years. No toolchain churn, no framework migrations, no config updates.
- At least one external open-source project adopts unify for its website — the first proof of the "more peaceful internet" ambition. (Docs sites follow once §6's recipes land; they are not the launch bet.)
