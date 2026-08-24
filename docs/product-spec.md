# unify — Product Specification

**Status**: Shipped contract — the composition core plus the production-and-discovery layer; §6 is that layer's design record
**Role**: This document records the shipped product contract — the composition core, plus the production-and-discovery layer built on it — with §6 retained as that layer's design record: what unify is, who it serves, what exists now, and which boundaries future work must preserve. The rule-by-rule mechanism for shipped behavior — every merge rule with worked input→output examples, the algorithms, the error taxonomy — lives in `docs/conformance-spec.md`, the normative implementation reference. The two documents are written to agree about shipped behavior; a divergence between them is a defect to be fixed, never a license to reinterpret either. `docs/authoring-rules.md` is the complete core composition surface in under sixty lines.

---

## 1. What unify is

Web pages have needed shared headers, footers, and navigation since the beginning — and HTML still has no way to express that. Every existing answer forces a trade the author didn't ask for: a JavaScript framework, a templating language, a config-heavy build system, or copy-paste.

unify is a static site generator for **front-end designers and hobbyists** — people fluent in HTML and CSS who have no interest in JavaScript frameworks, templating languages, or build tooling. It lets them define a header, footer, nav, or page layout once, in plain HTML files, and have those rendered into every page of the site. The pitch in one line: **HTML-native composition — no expression language, no client runtime**. Composed HTML remains the author's markup plus visible, deterministic composition and any standard metadata the author explicitly asks unify to derive; unify adds no executable JavaScript of its own. Because the source and output use platform formats, a unify site stays reviewable by the person who owns it — read the source, read the built page and generated discovery files, and see exactly what happened, no matter who or what wrote the files. unify replaces copy-paste chrome, hand-edited HTML, and Apache SSI — it does not compete with Hugo, Eleventy, or Astro (§5).

The core composition surface is five things, learnable in five minutes:

| You want to… | You write… |
|---|---|
| Reuse a fragment (nav, footer, badge) | `<include src="/_includes/nav.html"></include>` |
| Wrap pages in a layout | nothing (the nearest `_layout.html` applies) — `data-layout="/path.html"` to pick one, `data-layout="none"` to opt out |
| Mark where page content lands, or let pages replace a named region | `<main>` for the default; `<slot name="footer">…</slot>` in the layout, `slot="footer"` on a page element |
| Keep a page or folder out of the built site | name it with a leading underscore: `_draft.html`, `_includes/` |
| Ship a bare snippet exactly as written (for `<include>`, embeds, fetch) | name it `*.fragment.html` |

Any new **HTML composition** capability must reuse these concepts or prove that the core model remains equally small. Build verification, audits, generators, and standard discovery files may add commands or saved flags, but they may not add a second way to compose a page.

The composition vocabulary is deliberately standard. `<main>`, `<slot>`, and the `slot` attribute mean in unify exactly what they mean on the platform and in every framework that borrowed them: a named hole with visible fallback content, filled by content marked with the hole's name. The only two unify-specific HTML tokens in the core composition model are `<include src>` (a concept HTML never standardized; Apache SSI comments are the valid-HTML alias, §3.1) and `data-layout` (a standard extension attribute carrying the universal word for the concept). Anyone who has never read unify's documentation can parse a unify source tree on sight.

**Design rules that govern every feature decision:**

1. **Explainable in one sentence** to someone who knows only HTML and CSS. If a rule needs a diagram, it's out.
2. **Every source file is real HTML a browser can parse as written.** Layouts and pages are complete documents (a layout's slot fallbacks are its own preview — they render natively in any browser, no script); fragments are well-formed snippets; no template holes, no unbalanced markup. A source file opens and edits anywhere — but *composed* preview is the built site: `unify dev` (§4) serves `dist/` and reloads on save. Direct preview of an uncomposed source tree is a possible convenience, not a product dependency or a current priority (§6.6).
3. **Polyfill-able**: the **HTML** composition model must be implementable by a small (~200-line) browser script that produces the same DOM at design time as the CLI produces at build time. This is a complexity test, not a promise that the browser polyfill will ship. Any HTML rule too intricate to survive that test is too intricate to ship. Markdown, audits, generators, and discovery artifacts are outside that budget because none changes how HTML pages compose.
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
├── AGENTS.md             # outside src/, so it cannot publish (§6.7)
├── DEPLOY.md             # the deployment recipe
└── src/                  # the source root — everything here ships
    ├── _layout.html      # the site chrome — one complete HTML page
    ├── _includes/
    │   └── nav.html      # a fragment
    ├── index.html        # a page
    ├── about.md          # a Markdown page — equal citizen
    ├── contact.html      # a page that overrides a named region
    ├── 404.html          # a page that opts out of the layout
    ├── robots.txt        # minimal and honest: it blocks nothing
    └── assets/
        ├── style.css
        └── share-placeholder.png   # the og:image, at its declared size
```

Scaffolding into `src/` is what makes zero-config safe: the source root holds only what you meant to publish, so nothing outside it — `.git/`, `.env`, notes, screenshots, the output directory — can reach the built site. A flat site with no `src/` still builds with no flags (§4). The scaffold exercises the composition primitives once each: an include, the automatic layout, a named-slot override, a layout opt-out, and the underscore. (The `.fragment.html` opt-out is the one primitive it leaves out — §4 documents it.)

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
      <h1>Home</h1>
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

Built `contact.html` — note that the footer contains exactly the element the author wrote, and that no `<slot>`, no `data-layout` and no injected script survives into the output (the one unify token a built page may carry is `<meta name="schema">`, on a page that asked for a generated JSON-LD block — §6.3.6):

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

That is the whole core authoring model. Production options and audits may improve what unify verifies or generates, but they do not add another way to compose the page.

---

## 3. Composition model (normative — the composition rules; §4 carries the file, exclusion, and error rules)

### 3.1 Fragments: includes

- `<include src="/path/file.html"></include>` is replaced by the file's contents. The paired form shown here is what documentation teaches and what every example uses. The void form (`<include src="…">`) builds identically — unify inlines includes textually before any parsing — but browsers parse an unclosed `<include>` as an element that absorbs the siblings after it, so a source file using it previews wrong in a browser even though it builds right. Both forms are supported; the void form carries an advisory (§4) naming that trade.
- Paths starting with `/` resolve from the source root; all other paths resolve relative to the including file. Include targets are `.html` or `.md` files.
- **Includes are verbatim.** Content between an include's tags is a problem in the shipped contract: the file's contents replace the element, full stop. Parameter values, expressions, and implicit data remain non-goals (§5). Section 6.4 records a constrained experiment in filling explicit fragment slots with authored markup; until that experiment graduates into the normative sections and tests, non-empty includes remain invalid.
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

**Layouts do not chain.** A layout that itself declares `data-layout` is a problem, located, naming the layout file — layout chaining is not supported, and unify says so rather than silently ignoring the attribute. A section that wants its own chrome writes a complete `_layout.html` in its directory (item 4 above already scopes discovery per directory); the accepted cost is repeating shared chrome across section layouts. Chaining remains explicitly deferred (§6.6). Layout references are paths to `.html` files — `/` resolves from the source root, anything else relative to the declaring file. A bare name (`layout: default`) is a problem naming the fix: layouts are paths, and unify never guesses. `data-layout` means nothing on any element other than a page's `<html>` or `<body>`; anywhere else it is a problem naming `<include src="…">` as the replacement — `data-layout` is never a component import.

**Migration from the retired vocabulary**: a `data-unify` attribute anywhere, or a class beginning `unify-`, is a problem naming the supported spelling (`data-layout`, `<slot name>`/`slot=`). One-edit diagnosis, never silent behavior drift.

### 3.3 The merge — four rules

**Rule 1 — Slots.** A layout's `<body>` may contain `<slot>` elements. A page element carrying `slot="name"` fills `<slot name="name">`: **the slot element is replaced by the filling element(s)** — the page's markup ships exactly as written, no attribute merging, no discarding (the consumed `slot` attribute itself is removed). Multiple fills with the same name land in page order. A slot nothing fills is replaced by its own children (its fallback — which is also what a browser shows when the layout is opened directly). `slot=` is honored on the page's own top level — the children of `<body>`, and the children of the `<main>` you wrote, wherever you put it. That scope is what keeps unify's hands off `slot=` inside an author's own web-component markup: the parent of a fill is always `<body>` or your `<main>`, never a component. Slots inside `<template>` elements are never touched (that is an author's declarative shadow DOM, not unify's). Slots are recognized only in layouts and only in `<body>`; a `<slot>` anywhere else is an advisory and is replaced by its own children. The slotted-include experiment may add `*.fragment.html` as one deliberately bounded second host (§6.4), without changing page-to-layout scope. A second bare `<slot>` in a layout, or a repeated slot name, is an advisory and the first wins.

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

`data-layout` attributes are removed from output, and a `<script>` carrying `data-polyfill` is removed with it — an author-signed request to strip a design-time aid, not unify deciding to touch the author's JavaScript. That stripping behavior is part of the shipped contract even though shipping a browser polyfill is not a current priority (§6.6). Built output contains no `<slot>` elements and no unify vocabulary of any kind — except inside `<template>` elements, which unify never touches.

### 3.4 Why this vocabulary

- **`<main>` is the HTML spec's own page/chrome division.** The spec defines `<main>` as content "unique to this document," explicitly excluding repeated site chrome — which is *verbatim* the division unify automates. Authors already write it for their own reasons; the default slot costs nothing to learn.
- **`slot` carries its framework semantics, intact.** Astro, Vue, Svelte, and web components all mean the same thing by it: a named hole with fallback content, replaced element-for-element by content marked with its name. unify borrows the platform's own scoping rules too — fills count only on direct children, and `<template>` interiors are off limits — which is precisely what protects an author's real web-component markup from the build.
- **Layouts preview themselves.** A slot's fallback children render in any browser with no script, so a layout opened directly shows its own defaults.
- **Tooling needs one selector**: `slot[name]` finds every named region of a layout; `grep -o '<slot[^>]*>' src/_layout.html` lists the contract. A plain HTML comment above each slot (`<!-- Above-the-fold hero -->`) is the documentation convention the scaffold demonstrates; there is no enforced documentation block.

### 3.5 Markdown

Markdown pages are equal citizens: converted to HTML, then processed by the same layout rules as any page. Frontmatter keys work as follows: `title` sets the page's `<title>` (prepended to the layout's, §3.3), `layout` picks the layout (§3.2), `class` adds classes to the page's `<body>`, `lang` and `dir` set those attributes on `<html>` (all via §3.3 rule 4), and any other key becomes a `<meta name="…" content="…">` tag (`description`, `author`, `robots`). Namespaced metadata is a nested block, plain YAML: keys under `og:` become `<meta property="og:image" …>` tags (`property=` is what Facebook's crawler reads); keys under any other block — `twitter:`, say — become `name=` tags (`twitter:card`). Synthesized tags merge with the layout's head by the §3.3 rules — page wins. A list value emits one `<meta>` per item, in order. Markdown output filenames swap `.md` for `.html`.

A Markdown page with no frontmatter `title` uses the text of its first `<h1>` as the page title — the most common frontmatter chore, removed. A page with neither keeps the layout's title alone.

Headings converted from Markdown get an `id` derived from their text (lowercase; each run of whitespace becomes one hyphen; every remaining character that is not a letter, digit, or hyphen is dropped; leading and trailing hyphens trimmed; a repeat within the page gets `-2`, `-3`), so every heading is a deep link — the one thing documentation cannot do without. A heading that already carries an explicit `id` keeps it. HTML pages are untouched: unify never rewrites headings the author wrote.

Those keys are the only ones with special behavior. `date`, `tags`, `categories`, `draft`, `permalink`, and `slug` create no collections, taxonomies, or draft state. A leading underscore (`_draft.md`) is how a page is held back (§1, §4). **That last sentence is enforced rather than explained**: §6.3.9 shipped, so `draft`, `permalink`, and `slug` are located problems naming the mechanism the author was reaching for, `tags` and `categories` still build nothing and `unify audit` says so once per page, and only `date` (with `lastmod`) went the other way — §6.3.6 reads it. Values ship exactly as written — `featured: true` becomes `content="true"`, `date: 2026-01-01` stays `2026-01-01`; unify never reinterprets your metadata through YAML's type system. Frontmatter flattens exactly one level of blocks: a value nested deeper (a mapping under `og:image`) has no honest `<meta>` form and is a problem, located, naming the key. The roadmap may additionally consume a bounded `schema` declaration and explicit author/image/date metadata for JSON-LD and feeds (§6.3, §6.5); it does not turn drafts, tags, permalinks, or arbitrary keys into collection controls.

**Two hard errors close the two highest-frequency cross-generator reflexes**, both silently wrong otherwise: frontmatter atop an `.html` page is a problem (it would render as visible text — HTML pages have no frontmatter; use `<head>`), and a literal `<head>` element in a Markdown body is a problem (it would land in the body — Markdown heads come from frontmatter). A Markdown page cannot express arbitrary head markup (`rel="preload"` and kin) directly; put that in the layout or write the page in HTML. unify closes the two commonest cases without opening that door: `--canonical auto` completes a canonical from the page's final public URL, and `schema:` writes bounded JSON-LD from what the page already declares (§6.3) — nothing else is inferred.

### 3.6 URLs

Write paths that are correct for the file you're editing — relative (`hero.jpg`) or root-relative (`/assets/style.css`); both work anywhere. URLs inside layouts and fragments are resolved against the file that wrote them and emitted root-relative, so composed markup is correct at every page depth: authors never compensate for where an include will land, and editor click-through keeps working. Rewriting applies to `href`, `src`, `srcset`, and `poster`, on the final composed page — after includes and layouts, before `--pretty-urls` and `--base-url`. It does not reach inside `<style>` blocks or `style` attributes: a `url()` written in a layout or fragment must be root-relative, or live in a stylesheet file. (Unreachable is not unchecked — the post-build reference check audits those `url()`s like every other URL, so one that points at nothing fails the build instead of 404ing quietly.) Stylesheets never need rewriting: mirror-copy ships every CSS file at its source-relative location, so `url()` references inside them keep working untouched.

**Always link the real file.** Write `href="about.html"`, never a hand-written pretty URL like `/about/` — the real file previews correctly, works without any flags, and `--pretty-urls` (§4) rewrites every internal link to the pretty form at build time. A hand-written pretty URL is a link to a file that does not exist in the source tree, and the reference check — which validates the *emitted* tree — reports it as exactly that, unless `--pretty-urls` happened to move a page to that address. That exception is the argument rather than a loophole: the link the flag writes for you is correct in both modes, and the one you hand-write is correct in one.

---

## 4. CLI (the complete surface)

```
unify [build]              build the site (default command)
unify audit                evaluate the site the build would publish — writes nothing
unify dev                  build, watch, serve, and reload — the inner loop
unify watch                build + rebuild on change, no server (pair with your own)
unify init [template]      scaffold a starter site (default, basic, blog, docs, portfolio)

Options:
  -s, --source <dir>       source directory (default: src/ if it exists, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --exclude <glob>     globs never emitted, still usable by the build (repeatable; default: _*)
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --base-url <url>     the site's whole address (https://site.example/repo/): prefix root-relative links, make og:/canonical absolute for share crawlers, and generate sitemap.xml and feed.xml
      --canonical auto     add a canonical link to pages that author none, from the site address
      --feed-full          include each entry's full rendered content in feed.xml (needs --base-url)
      --search-index       write search-index.json for a client-side search library
      --generate <path>    run one JavaScript file from your source tree before the build
      --dry-run            run the full build and every check, print the report, write nothing
      --strict             advisories count as problems for the exit code (with `audit`, findings too)
      --format <kind>      `audit` report shape: human (default), json, or sarif
      --external           `audit` only: fetch every off-origin URL the site emits and report the ones that don't resolve
  -p, --port <n>           port for `unify dev` (default: 3000)
  -v, --version            print version
  -h, --help               print help
```

That is the entire shipped CLI — there are no other commands or flags, and `docs/cli-reference.md` documents every one. Section 6 is the design record the production-and-discovery additions shipped from. Behavior notes:

- **File handling**: `.html`/`.md` files are pages (processed) — except a name ending `.fragment.html`, which opts out: it ships as written, a bare snippet published for `<include>` consumers, embeds, or client-side `fetch`/`hx-get`, since a page must be a complete document and a fragment deliberately is not. **Every other source file is copied through as-is**, mirroring the source tree — source assets ship byte-for-byte, so compress images before adding them. This source-handling rule does not prohibit the bounded output-root sitemap, feed, or manifest files unify generates; every generated artifact must be named by `--dry-run` and obey the same collision and transaction rules (§6). One option holds source files back: `--exclude`, a set of globs whose matches are never emitted but remain build material — includable, usable as layouts. Its default is `_*` — the same naming convention layout discovery uses (§3.2), so the files the build consumes are the files the output omits, and `init && build` is correct with zero configuration (an empty default would ship `dist/_layout.html` as a junk page). A glob without a `/` matches any path segment, so the single default covers `_layout.html`, `_includes/`, `_scripts/`, `_notes/`, and `blog/_draft.md`. Set your own globs and they replace the default, like any option; keep `_*` in your list if you still want it. Replacing it cannot silently publish the build's own working files: an emitted file that is a `_`-prefixed page, or whose path contains a `_`-prefixed directory segment, is a problem naming the file and the `--exclude` line that fixes it (`--exclude '_*' --exclude 'drafts/**'`). The guard deliberately does not cover root-level non-page files like `_headers` and `_redirects` — Netlify sites need to ship them, for the same reason dotfiles ship, and replacing the default with globs that spare them is exactly how (the conformance spec carries the worked recipe). Nor is holding one back silent: nothing links to these files, so their absence is invisible to the reference check — a known deployment file (`_headers`, `_redirects`, and kin; a short list maintained in the code) kept out of the output by the exclude set is an advisory naming the file and the `--exclude` line that ships it. Everything in the source root ships unless a glob holds it back, so anything that is not part of the site — notes, drafts, scratch files, scripts — belongs under a leading underscore. Links to anything not emitted are caught by the reference check like any other broken reference.
- **Never-shipped files (safe by default).** Independent of `--exclude`, and never replaceable by it: the output directory, VCS metadata (`.git/`, `.hg/`, `.svn/`), `node_modules/`, `.env` and `.env.*`, and `unify.yaml`. `--exclude` is an authoring option; this is a footgun guard, in the same family as writing output atomically. It stays deliberately short and literal — no scanning, no heuristics, no "looks secret" guessing (§5's no-security-theater rule). Note what is *not* on it: dotfiles ship. `.htaccess` and `.nojekyll` are exactly the files this audience needs to deploy. Running unify with no `--source` in a directory that has no `src/` — a directory you didn't scaffold — prints the count of files about to be copied and points at `--dry-run`: an honest report, not a guess about your intent (naming a source directory yourself, even `.`, turns the notice off — that *is* the intent).
- **Output safety.** `--clean` refuses to run when the output directory is, or contains, the source root or the working directory — `-o . --clean` is an error, not a deleted project. Sitting *inside* them is fine and ordinary: `src/` beside `dist/` is what `init` scaffolds. Two sources that would write the same output file (`about.md` and `about.html`; a `--pretty-urls` move landing on an existing `about/index.html`) are a problem naming both sources — never a silent last-write-wins. Outputs differing only by letter case are an advisory (they collide on case-insensitive filesystems and hosts). Symlinks are followed only while they resolve inside the source root; one pointing outside is treated as absent, with an advisory.
- **`unify.yaml` is saved flags, nothing more.** Every option above may live in an optional `unify.yaml` at the source root — same names, same meanings, CLI wins on conflict — so local runs and CI share one committed invocation instead of retyping flags. No behavior exists that only the file can express; delete it and pass flags instead, and nothing changes. `init` does not create one, and the file itself never ships to output.
- **Subpath hosting.** GitHub Pages project sites serve from `username.github.io/repo-name/`, where root-relative links would break. `--base-url` takes the site's whole address (`https://username.github.io/repo-name/`) and does two things with it: the path part prefixes every root-relative URL in the built HTML — `href`, `src`, `srcset`, `poster`, and the URL values in `og:`/`twitter:` metas — and the origin absolutizes og:/twitter:/canonical, which crawlers require to be absolute, against the whole base (origin **and** subpath), so an og:image lands at `https://example.com/repo/assets/x.jpg`, exactly where the file is served. Source files stay rooted at `/`, so local preview keeps working. A bare path is a usage error: it prefixed links correctly while leaving social metadata root-relative and unfetchable, which authoring trials showed was both the obvious-looking choice and a silent one. The roadmap deliberately reuses this same public address for sitemap, canonical, feed, and report URLs instead of adding another site-address concept (§6.3–§6.5).
- **Pretty URLs move pages, never assets.** Every reference in a moved page — `href`, `src`, `srcset`, `poster` — is rewritten to keep pointing at the same target, so `![diagram](diagram.png)` beside a Markdown page keeps working. A root `404.html` is never moved: hosts look for it at that exact path.
- **`unify dev` is the inner loop: one command, one terminal.** It builds, watches, serves `dist/` on `localhost:3000`, and reloads the browser on every rebuild. The audience installs a single binary and has never heard of Bun, npm, or `npx` — telling them to run a second tool in a second terminal before they can see their own site is the wrong first five minutes. Its permanent boundary is local static preview and build diagnostics: it serves static files, directory indexes, a 404 page, and reload, and may add the dev-only static audit report described in §6.3. No proxying, HTTPS, middleware, plugins, application endpoints, or server config — if a request needs any of that, it needs a real server, and `unify watch` (no server, same watch contract) exists precisely so any external tool can own serving. Reload and diagnostic views exist only in responses from `unify dev`, never in `unify build` output, which keeps §5's no-runtime rule true for everything that ships.
- **The watch contract** (`dev` and `watch` alike). Saves are coalesced into one rebuild; a save landing mid-rebuild queues exactly one follow-up — no change is ever dropped. Every rebuild is a full rebuild (no cache, no incremental machinery — plain HTML is fast enough, and it guarantees watch output is always identical to a fresh `unify build`). Writes are minimal and atomic: a file whose content didn't change is not rewritten (external watchers see exactly what changed — no reload storms), outputs land via temp-then-rename (a server never reads a half-written file), deletions are precise, and `--clean` applies only at startup.
- **Broken builds show in the browser.** While watching, a page that fails to build is emitted as a default error page carrying the located error and details — the reload puts the diagnosis in front of you, and the next successful rebuild replaces it. `unify build` never emits error pages.
- **`build` publishes all-or-nothing.** Composition into a temporary tree is best-effort — every problem in the site is found and reported in one pass, so authors never fix errors one run at a time — but the output directory is only updated if there were zero problems. A build that reports errors leaves the previous `dist/` untouched and exits non-zero: a half-composed page with a missing header can never be uploaded by someone who didn't read the terminal. Iterating on a broken site is what `dev`/`watch` are for; publishing is what `build` is for, and it does not publish broken sites.
- **One error contract, loud and located.** Every problem — a missing include or layout, a page that fails to compose, a broken internal reference, an output collision — is reported once, naming the file, the reference, and the line where known, with a short fix list that always includes checking the path spelling and casing (a case-mismatched path builds on macOS and 404s on the Linux host). Cycle and depth errors print the full chain (`_layout.html → _includes/nav.html → _layout.html`). After every build, internal references are checked against the emitted files — every URL the output contains, not only the ones rewriting touches, so anything the rewriter does not reach fails loudly instead of 404ing quietly. A link, image, or asset that resolves to nothing — a renamed page, an image stranded in an underscore folder, a path whose case doesn't match — is a problem like any other. Silent failure is a bug by definition. **Exit codes: `0` — the site was published (with `--dry-run`, would have been); `1` — problems were found, nothing was published, the previous `dist/` is untouched (under `--strict`, advisories alone also exit `1` without changing what was published); `2` — invalid usage or a fatal environment error (bad flag, missing source directory), so a caller can tell "I mistyped a flag" from "my site has errors".** Diagnostics go to stderr, the build summary and `--dry-run` list to stdout, both ordered by path then line, so two runs over the same tree print the same bytes. Every line begins with its location and severity (`src/about.html:12: problem: …`); that prefix is stable, the message after it is prose and is not a contract. Set `DEBUG=1` for stack traces.
- **Advisories (the lint layer).** Beside problems sit *advisories* — hygiene findings that break nothing: an unclosed `<include>` (builds fine, previews wrong — §3.1), a working-format file headed for the output (`.psd`, `.fig`, a multi-megabyte original), a file used as a layout or include that also ships as its own page, a deployment file (`_headers`, `_redirects`) held out of the output by the exclude set. Advisories print but never affect what is published; with `--strict` they affect the exit code too, so a stray `.psd` can never cost you a publish. Plain language, no rule codes.
  The list is closed and fits on one screen (the complete catalogue is in the conformance spec). An advisory that fires on a correct site is a bug in the advisory: `unify init && unify build --dry-run --strict` exits zero, and the end-to-end suite asserts it. Because §5 refuses rule codes there is no way to silence one you have chosen to accept, so every advisory unify ships is permanent and the catalogue is capped at twelve — at the cap, adding one means removing one. Advisories report what the build observed and what it did; they never instruct the author to restructure markup that composed correctly. Audit findings are a separate, uncapped evaluation surface and do not silently become build advisories (§6.3).
- **`--dry-run` is the whole build minus the writes.** Composition, URL rewriting, the reference check, every problem and advisory — reported exactly as a real build would report them, plus the address the build assumed (`serving from https://example.com/repo/`, or the domain root when no `--base-url` is set) and a list of what would be written, copied, and deleted, each row naming the URL it answers to and what it composed from — `write dist/about.html (/repo/about.html) ← about.md + _layout.html`, or `← 404.html (no layout)` for an opt-out. Layout resolution is the one fact in §3 that cannot be read from a single file, and this is the mode whose whole purpose is telling you what the build would do. `unify build --dry-run --strict` is the one-line structural CI check; content and discovery evaluation is the separate `unify audit` command (§6.3).
- **Composing with other tools: the filesystem is the primary interface; a minimal public API is the secondary one.** unify reads one directory and writes another, and that seam is primary and always sufficient. Generators run before (`node _scripts/gen.mjs && unify build`) and write pages into the source tree, where they are indistinguishable from hand-authored ones: layouts apply, heads merge, URLs resolve, and the reference check audits their output — rename a post and the build reports the stale index link. The `--generate <path>` flag (§6.4) is the bounded, single-binary way to run one author-owned JavaScript generator through that same filesystem seam; it does not grant hooks into composition or create a plugin lifecycle. External generators in any language remain valid. Post-processors run after and read `dist/`, which the watch contract makes safe to consume (atomic writes, unchanged files untouched, precise deletions). The default `_*` exclusion gives tooling a home inside the source tree — `_scripts/` never ships.

  Beside that seam, unify publishes a **minimal public API** so that a build or an audit can be driven from inside another program — a task runner, a CI script, a host build platform — rather than only by shelling out. It exposes the work the CLI already does and returns what the CLI would have printed: the same options under the same names, the same diagnostics, the same versioned report. It is deliberately small, and it is deliberately **not a plugin API**: nothing hooks into composition. There is no lifecycle, no transform, no callback that can alter a page, a path, or the manifest, and no access to unify's intermediate state — a caller supplies inputs and receives results, exactly as the command line does. Anything an embedder can do, a person with a shell could already do. The core build stays deterministic whichever interface asked for it: same input tree in, same output tree out.
- **Install story leads with the binary.** The headline install is the standalone single-file executable (Linux/macOS/Windows) — the audience has never heard of Bun and shouldn't need to. Bun/npm installs are the secondary, developer path. Two runtimes are supported and no more: **Bun >= 1.2.0 and Node >= 22.12.0**, which must produce byte-identical output from the same input — supporting a runtime means the output tree, the diagnostics, and the exit codes do not depend on which one ran, not merely that the CLI starts. No Deno claim. The Node floor is the version where import attributes and JSON modules stop being experimental; below it the runtime writes a warning to stderr, and unify's stderr is contract.

---

## 5. Non-goals

Things unify deliberately does not do, even if asked:

- **unify ships no executable JavaScript of its own.** Authors may write and ship whatever scripts they like — script files copy through byte-for-byte and `<script>` tags survive composition untouched (§3.3 head merge dedupes only exact-duplicate references). What never happens: unify injecting, generating, or rewriting executable JS in built output. No runtime, no hydration, no helper snippets — `unify build` emits exactly the executable JavaScript the author wrote and not one byte more. Two bounded exceptions, both author-visible: `unify dev` injects a reload script into the pages it serves (never into `dist/`), and a script tag the author marks `data-polyfill` is removed by the build because the marker asks for it (§3.3). Generated JSON-LD and static search manifests are data, not a client runtime.
- **No templating language.** No variables, loops, conditionals, or expressions in HTML — no `{{ }}`, no `{% %}`, no props. The moment unify grows a DSL it has become the thing it exists to escape. The visible costs, accepted with eyes open: the footer year is edited once a year, in one include; every HTML page carries the standard document skeleton, while Markdown pages don't; and arbitrary derived pages such as a post index are maintained by hand or generated by a script the author owns before the build (§4, composing with other tools). Bounded, standards-defined artifacts derived from the final page manifest — sitemap, canonical, feed, structured data, and static search input — are allowed because they neither change source composition nor introduce a query language (§6). A readable author-owned generator remains the sanctioned answer for site-specific aggregation. Active nav state is *not* on that list: the page sets `<body class="home">` (§3.3 rule 4) and the stylesheet does the rest — `body.home .nav-home { … }`. Styling only, no `aria-current`; that is the trade.
- **No component framework.** No props, implicit data, attribute-merge semantics, scoped component imports, or override contracts. Includes stay verbatim (§3.1). The slotted-include experiment may let authored child markup fill explicit slots in a `*.fragment.html`, but that bounded reuse does not permit values, expressions, loops, conditionals, or component lifecycle behavior (§6.4). Crossing any of those lines would turn includes into a component framework and remains a non-goal.
- **No configuration language.** `unify.yaml` is optional and is nothing but saved CLI flags (§4). No behavior may exist that only a config file can express — if a feature needs real configuration to explain itself, the feature is wrong.
- **No style scoping.** unify never rewrites, scopes, or isolates the author's CSS. "How do I stop this fragment's styles leaking?" has a platform answer — `@scope`, `@layer`, CSS nesting, or a class prefix — and unify's answer is to stay out of the way.
- **No general-purpose web server.** `unify dev` owns local static preview, reload, error pages, and bounded diagnostic views such as the `/_unify/` audit report (§4, §6.3). It does not grow proxying, HTTPS, middleware, plugins, application endpoints, or server configuration. Anything beyond its preview-and-diagnostics boundary is delegated to a real server, which `unify watch` exists to pair with.
- **No migration path from other site generators.** unify's audience is people hand-maintaining HTML, copy-pasting headers, or running Apache SSI (whose syntax §3.1 supports indefinitely for exactly this reason). Moving a Hugo, Eleventy, Jekyll, or Astro site here means giving up their built-in collections, template languages, and data-binding semantics — features those tools exist to provide. Author-owned generators may still read ordinary data files through the filesystem seam. unify competes with copy-paste, not with those generators. (The one migration unify does owe its own users — the retired `data-unify`/`unify-*` vocabulary of the previous implementation — is handled loudly: §3.2 diagnoses every occurrence by name.)
- **No user-facing governance machinery.** Checks speak plain language — no rule codes to memorize, suppression annotations, or policy blocks embedded in content. The machine-readable audit report (`audit --format json`/`sarif`) has a documented schema and stable identifiers so CI can consume it (§6.5); that interoperability contract is not a plugin or selector API and does not leak into ordinary terminal guidance.
- **No security theater.** Path traversal safety in include resolution is internal engineering, always on, invisible. unify does not scan the author's own HTML for "vulnerabilities" or gate builds on it.
- **No build-cache/incremental system** until real users have real sites that are actually slow.
- **No collection/query system, pagination, or taxonomies.** unify does not acquire a content database or a DSL for selecting, sorting, grouping, or paginating pages. Site-specific indexes remain an author-owned generator concern. A bounded RSS/Atom file generated from pages explicitly declaring `Article` or `BlogPosting` is a standard discovery artifact over the shared page manifest, not the beginning of a collections API (§6.5).
- **unify is not advertised primarily for blogs or documentation sites.** Both work — the blog template plus its generator is a real workflow, and Markdown pages get heading anchors (§3.5) — but publication sites want feeds and documentation sites want generated navigation or search. Launch positioning remains where unify is unambiguously strongest: brochure, portfolio, campaign, and project sites; existing hand-written HTML adopting shared chrome; SSI migration. That positioning broadens only after the feed, search-manifest, audit, and generator workflows are proven without turning composition into a template or component system (§6).

---

## 6. Beyond the composition core — design record

This layer should make the site **production-ready, inspectable, and discoverable** while keeping page-and-layout composition stable. The sole composition experiment reuses the existing slot model inside explicit fragments (§6.4); the rest of the roadmap operates on the final output rather than adding authoring syntax. Its one-sentence mental model is: **write complete HTML or Markdown pages, reuse fragments with includes, fill holes with slots, and give unify the site's public address; unify composes the pages, verifies the final site, and generates the standard files search engines and feed readers need.** This section was written as a roadmap and is retained, in substance, as the design record: every item in §6.2–§6.5 has shipped, and the agreement condition it set — conformance spec, authoring rules, CLI reference, implementation, and tests agreeing — is exactly what the release gates verify. Read "proposes"/"should" below as the record of what was decided, not as open questions.

### 6.1 Design constraints

- The golden path remains the default. A brochure site needs no metadata schema, generator, SEO vocabulary, or extra config to build and publish.
- Composition, generation, and evaluation stay separate: `build` produces and verifies the site, an explicit generator may supply a temporary source overlay before that build, and `audit` evaluates the prospective final output without publishing it.
- Generated discovery data comes from the final public pages, after composition and URL rewriting. There is one shared interpretation of a page's URL and metadata, not separate sitemap, feed, and audit implementations that can disagree.
- Automation never invents claims. Authored canonical tags and JSON-LD win; generated structured data uses only explicit metadata and visible page content; missing facts produce findings rather than guesses.
- unify-owned build behavior remains offline and deterministic. Network checks are explicit audit operations, never a hidden dependency of `build` or `dev`; an explicitly selected author-owned generator is responsible for its own inputs and side effects.
- SEO guidance reports concrete, fixable facts. unify does not assign an SEO score, measure keyword density, rewrite prose, promise rankings, or fail content on arbitrary character-count rules.
- New behavior must still be explainable in one sentence and keep the core authoring rules on one screen. Anything that would write published output must preserve transactional publishing and appear in `--dry-run`; evaluation commands remain read-only.

### 6.2 Foundation: one final-output page manifest

After composition and URL rewriting, unify should derive one internal record for every public page. At minimum it carries the source path, output path, public URL, canonical URL, title, description, language, robots directives, first `h1`, heading outline, visible main text, representative image, author, published/modified dates, declared schema type, and incoming/outgoing internal links. The manifest is an implementation boundary, not a new file format authors must learn. Sitemap, canonical generation, feeds, structured-data checks, search output, orphan detection, and machine-readable reports must all consume it.

The extractor must inspect the emitted DOM rather than frontmatter alone, so HTML and Markdown remain equal citizens and layout-provided metadata is represented exactly as it ships. A page with conflicting declarations produces one located finding and one deterministic manifest value; downstream features never each choose their own winner.

### 6.3 Production and discovery layer

1. **Sitemap from `--base-url`.** When the site's public address is known, generate an output-root `sitemap.xml` from final pretty URLs. Include only internal, indexable, canonical pages; exclude assets, fragments, `404.html`, `noindex` pages, and pages canonically pointing elsewhere. URLs are absolute, an authored `lastmod` is preserved only when a real value exists, and large sites split at protocol limits. If the source tree already contains a sitemap, preserve and validate it instead of overwriting it; a generated-path collision is a problem.
2. **Optional canonical completion.** `--canonical auto` (and the identical saved flag in `unify.yaml`) adds a canonical only when a page does not already author one, using that page's final public URL. Authored canonicals always win. Missing internal canonical targets, multiple canonicals, canonical/noindex conflicts, and disagreement with the sitemap are reported.
3. **Robots consistency, not invented policy.** Validate an authored `robots.txt`, its sitemap declaration, page-level robots directives, and whether referenced paths exist. Templates may scaffold a minimal robots file, but unify never decides what an author should block.
4. **`unify audit`.** Add an explicit evaluation of the prospective final output, separate from build problems and the capped advisory list. It runs the full pipeline without publishing to `dist/`. Initial findings cover missing or duplicate titles/descriptions, missing or multiple primary headings, title/heading mismatch, orphan pages, broken fragment links, duplicate IDs, canonical/sitemap/robots conflicts, absent document language, invalid JSON-LD, incomplete declared schema, missing social-image targets or dimensions, and substantially duplicated page text. It prints evidence and a fix, never a score. `unify audit --strict` is the opt-in CI gate; ordinary `build` does not reject subjective content quality findings.
5. **Final-output verification.** Extend the existing reference check to fragment identifiers, duplicate IDs, normalized public-URL collisions, metadata placement, redirects, and URLs emitted into sitemap or JSON-LD. All generated artifacts participate in transactional publishing and are visible in `--dry-run`.
6. **Structured-data validation and bounded generation.** Always parse and validate authored JSON-LD, verify local URL references, report contradictory entities, and compare factual fields with visible content where the relationship is unambiguous. For Markdown, `schema` accepts exactly one of `WebPage`, `Article`, or `BlogPosting` (case-sensitive) and may generate JSON-LD from `title`, `description`, final canonical, `image`, `author`, `date`, `lastmod`, and `lang`; no other key is inferred. `date` maps to `datePublished`, `lastmod` maps to `dateModified`, both must be authored ISO 8601 values, and neither falls back to the build clock, filesystem time, filename, or Git history. No field is guessed and authored JSON-LD wins. HTML authors continue to write ordinary `<script type="application/ld+json">` when they need any other vocabulary.
7. **SEO-complete offline templates.** Add focused `init` templates for a local service, product, publication, portfolio, event, and catalogue. Every template includes semantic visible content, unique titles and descriptions, canonical/social metadata, representative-image dimensions, appropriate authored or bounded JSON-LD, `robots.txt`, a clean audit, and deployment recipes. Templates teach the platform artifacts; they do not introduce a unify-only content schema.
8. **Local audit view.** `unify dev` may expose a reserved `/_unify/` report assembled from the manifest and audit findings. It is served only by the development server, writes nothing to `dist/`, and adds no script to published pages.
9. **Counter-prior diagnostics.** Frontmatter that authors and coding agents routinely expect other generators to interpret must not silently imply behavior unify does not have. `draft`, `permalink`, and `slug` are located problems naming the unify mechanism: prefix the source name with `_` to hold a page back; rename or move the source file to choose its output path; and use `--pretty-urls` only to apply unify's site-wide `.html`-to-directory rewrite. `tags` and `categories` carry an audit finding stating that they create neither collections nor taxonomies. Existing diagnostics for bare layout names, path-only `--base-url` values, hand-written pretty URLs, and non-empty includes remain mandatory. These findings exist to prevent confident cross-generator assumptions from publishing or addressing the wrong page, not to reserve ordinary metadata names without cause.

### 6.4 Constrained reuse and a one-process generator seam

1. **Slotted includes, experimental.** Recover the useful part of the earlier codebase's customizable fragments without reviving area matching or a component DSL: content inside `<include>` may fill `<slot>` elements in a `*.fragment.html` target using the same `slot="name"` and fallback model authors already learned for layouts. An empty include remains verbatim. A non-empty include is valid only when its fragment declares slots; fragments may not contribute a document head or root attributes; unmatched or content-losing fills are located findings; include cycles remain errors; and fill scope is lexical. There are no props, expressions, loops, conditionals, attribute merging, style scoping, or implicit data. This ships only if authoring trials show that the complete rule still fits comfortably on the authoring-rules page.
2. **`--generate <path>` instead of `--run <cmd>`.** Let `build`, `watch`, `dev`, and `audit` run one author-owned JavaScript generator from the source tree before scanning pages. The path is explicit and saved like any other flag; it is not an arbitrary shell command. The standalone binary supplies the runtime, sets the working directory to the source root, and invokes the script with the absolute source path and a temporary generated-source directory as its two positional arguments (`process.argv[2]` and `[3]`); a generator needs no imported unify API. Only files written to the generated directory join the scan as an overlay, so the supported workflow does not mutate `src/`, audit remains read-only, generated paths participate in collision checks, and watch mode cannot trigger on its own temporary outputs. Generator failures use unify's located diagnostics, and generated pages then follow the ordinary build contract. The filesystem remains the extension interface—this only removes the second runtime and second watcher from the common workflow.
3. **Recipes remain first-class documentation.** Ship deployment workflows plus short, readable examples for the generator context, image optimization, an external CMS over the source tree, and interoperability with post-build tools. State plainly that per-page expressions, i18n policy, application bundling, and arbitrary pipelines remain outside unify.

### 6.5 Publication outputs

1. **RSS/Atom from explicit articles.** Generate a feed only from pages explicitly declaring `Article` or `BlogPosting`, using the shared manifest rather than a new collection or query language. Feed URLs and stable IDs use canonicals, dates are emitted only when authored, referenced assets are checked, and full-content inclusion is an explicit option. Start with one site feed; scoped feeds wait for demonstrated demand.
2. **Optional search manifest.** Emit a documented, static JSON search input from final public pages so a small client-side search library or external indexer can consume titles, URLs, headings, and text without reparsing the site. It is a versioned projection of §6.2—not a second extractor or vocabulary—with top-level `schemaVersion` and `pages`, and page fields named `url`, `title`, `description`, `headings`, and `text`. unify does not ship a search runtime.
3. **Opt-in network audit and reports.** `unify audit --external` checks external links without making normal builds network-dependent. `unify audit --format json` exposes the page manifest and findings for CI and other tools without creating a plugin API. The report has a `schemaVersion`; each finding has a stable machine identifier, severity, source/output locations where available, public URL, evidence, suggested fix, and stable fingerprint. Human output remains plain language and never requires memorizing those identifiers. A SARIF serializer is optional only if it is a mechanical view of the same findings rather than another analysis path.

### 6.6 Explicitly deferred or rejected

Do not restore DOM Cascade area matching, component props, expressions, loops, conditionals, a collections/query DSL, keyword rewriting, built-in generative prose, numeric SEO scores, guessed structured data, network access during `build`, or a plugin API — §5's minimal public API is not one: it exposes the CLI's own work to callers and grants no hooks into composition. Layout chaining remains deferred: it adds recursive merge semantics to every page for a reuse problem slotted includes may solve more locally. The browser preview polyfill, HTML minification, and Markdown include shorthand remain possible later conveniences, but they do not close the production, self-containment, or authoring gaps that define this layer and are not roadmap priorities.

### 6.7 AI-agent authoring and implementation guidance

The team cannot measure the contents of a proprietary model's training corpus, so “training-data density” is an engineering proxy, never a model-specific claim. Treat a surface as dense when it uses a mature standard, appears across common web tools, and has a name whose ordinary meaning predicts the right result. Treat it as sparse when unify combines familiar tokens in a novel way, hides important precedence, or deliberately disagrees with conventions learned from other generators. High density reduces explanation cost; it does not remove the need for validation, and high-volume SEO advice in particular may be confidently wrong.

| Surface | Expected density and prior | Implementation consequence |
|---|---|---|
| Standard HTML metadata, `sitemap.xml`, canonical links, JSON-LD syntax, RSS/Atom, broken links/fragments, duplicate IDs | **High; mostly aligned.** Agents usually know the artifact and its basic shape. | Keep the standard name and format, generate conservative values, validate the final output, and spend documentation on unify's trigger and precedence rather than reteaching the standard. |
| SEO guidance, robots/indexing, canonical/sitemap interaction, JSON-LD facts, `lastmod` | **High but noisy.** Agents often produce plausible myths: fixed title lengths, keyword density, robots as `noindex`, build-time dates, or rich-result promises. | State negative rules explicitly and enforce factual consistency. Never convert a common answer into a product rule merely because models repeat it. |
| Page manifest, `--base-url`-driven generation, `unify audit`, `--strict`, feed membership, `/_unify/` | **Medium; concept aligned, policy custom.** Agents infer the goal but not exact activation, inclusion, or failure rules. | Give each feature one canonical command/example, show it in `--help` or `--dry-run`, and emit a located correction when the inferred policy is wrong. |
| Slotted includes, `*.fragment.html`, the generated-source overlay, search/report schemas, unify's underscore and real-file-link conventions | **Low or counter-prior.** Familiar syntax points agents toward component props, source mutation, pretty source URLs, or other-generator frontmatter behavior. | Make the rule local and unavoidable: scaffold example, agent guide, conformance fixture, and hard diagnostic. Do not rely on the feature name being self-explanatory. |

**Repository-local guidance is part of the feature, not optional marketing.** Every `init` template should place a concise `AGENTS.md` at the project root, outside `src/` so it cannot publish. It repeats only the high-conflict rules: layouts are paths; source links name real `.html` files; `--base-url` is a complete public URL; a leading underscore excludes source; `draft`, `permalink`, and `slug` are not silently honored; an empty `<include>` performs verbatim inclusion; slotted includes, when enabled, accept markup fills but no props or attribute merging; structured data uses visible explicit facts; generated source goes to the supplied overlay directory; and `unify audit` plus `--dry-run` are the pre-publish checks. The README and CLI help must lead humans and agents that do not discover `AGENTS.md` to the same rules — the README links `docs/authoring-rules.md` rather than duplicating it; no behavior may be documented only in the agent guide, and there is one rule set rather than tool-specific variants.

**Diagnostics carry the instruction at the moment it matters.** For every sparse or counter-prior rule, identify the source location, state what unify actually did or refused to do, and show the smallest valid replacement. “Unsupported” alone is not sufficient. The diagnostic tests must cover at least: `draft: true`; bare layout names; path-only `--base-url`; hand-written pretty URLs; non-empty includes with no target slots; fragment fills at the wrong depth; fragment head/root content; generated-source collisions; unknown `schema` values; inferred or malformed dates; and canonical/noindex/sitemap disagreement. An author-owned generator remains responsible for side effects outside the supplied overlay (§6.1); unify documents that boundary rather than claiming to sandbox arbitrary JavaScript.

**Examples are executable few-shot material.** Each author-facing feature ships with one smallest correct example and one high-probability counterexample whose diagnostic is asserted. Templates use conspicuous placeholders for business identity, author, dates, images, prices, ratings, and other factual claims; a template must never make an invented placeholder look publishable. The examples, help text, diagnostics, and conformance fixtures use identical vocabulary and field names.

**Machine surfaces are self-describing and shared.** The page manifest is the only semantic record. Sitemap, feed, search, the local report, JSON audit output, and optional SARIF serialization are projections of it. Every unify-defined JSON document carries `schemaVersion`; authored or generated JSON-LD follows its own standard vocabulary and does not. Every audit finding carries a stable identifier and fingerprint; public field names do not depend on terminal prose. Within a major schema version, fields may be added but existing meanings and types do not change; a breaking machine-contract change increments the version. Adding a second extractor, renaming the same fact between outputs, or asking an agent to scrape human diagnostics is a design defect.

**Agent authoring trials are a release gate for sparse features.** Before a candidate graduates, run representative current coding agents with only the scaffold, repository-local guide, and CLI help—no hidden unify explanation. The fixed trial set asks them to build and audit: a subpath-hosted brochure page, an article with truthful JSON-LD and feed membership, a fragment link, a reusable card/callout using any proposed slotted-include syntax, and a generator that emits one page into the supplied overlay. Store the prompts, source trees, expected outputs, and expected diagnostics as versioned fixtures. A candidate passes when correct work needs no undocumented assumption, common mistakes receive a one-edit diagnosis, no authored content is silently lost or published against the stated intent, and the core composition rules still fit on the authoring-rules page. An agent's successful guess is evidence about usability, never a substitute for a written rule or deterministic test.

Implementation should follow the primary standards rather than secondary SEO folklore: the [HTML slot model](https://html.spec.whatwg.org/dev/scripting.html#the-slot-element), [Sitemaps protocol](https://www.sitemaps.org/protocol.html), [Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html), [JSON-LD 1.1](https://www.w3.org/TR/json-ld/), [Schema.org](https://schema.org/), [Atom](https://www.rfc-editor.org/rfc/rfc4287.html), and [RSS 2.0](https://www.rssboard.org/rss-specification). Search-specific checks follow current primary crawler guidance, including Google's [canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) and [structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), and must be reverified when implemented; no search-engine behavior is frozen into the HTML composition model.

---

## 7. What the contract requires

Sections 1–5 describe the contract the implementation is held to; §6 is explicitly excluded until individual candidates graduate. `src/` implements the shipped contract, and the suite holds the two in lockstep. What the document set demands, without hedging:

1. **The composition model of §3, exactly** — slots, the `<main>` default, the unwrap, the four merge rules, layout discovery — with `docs/conformance-spec.md` as the normative mechanism reference. Its worked examples are the test fixtures; an implementation conforms when it reproduces them exactly in structure, attributes, and text content (whitespace between block-level elements is not normative — conformance spec §3).
2. **The retired vocabulary is diagnosed, never honored.** `data-unify` and `unify-*` classes produce located problems naming the supported spelling. No code path composes by area classes, landmarks (beyond `<main>`), ordered fill, or component imports.
3. **The engine contract of §4, in full**: transactional all-or-nothing publish, the post-build reference check, output collision detection, mirror copy, URL provenance rewriting, the `--exclude` default and its guard, the never-shipped list, the watch contract, `unify dev`, `--dry-run` composition reporting, exit codes 0/1/2, and the two-severity error contract with the advisory discipline.
4. **The golden path is executable and tested**: `unify init && unify dev` works end to end, the E2E suite builds the §2 site and asserts its output, and `unify init && unify build --dry-run --strict` exits zero.
5. **The documents stay in lockstep**: `docs/authoring-rules.md` states every authoring rule in under sixty lines and the README links it rather than duplicating it (both asserted by tests); no shipped behavior may contradict any document in this set.

---

## 8. Success criteria

- A newcomer goes from nothing to a built, deployed-ready site in **under five minutes** using only the README, with two commands (`unify init`, `unify dev`) and one terminal.
- **The core composition rules fit on one screen.** `docs/authoring-rules.md` states every HTML/Markdown composition rule and nothing else, in under sixty lines, and the end-to-end suite builds the §2 site driven only by it. That file is the complete page-composition surface in a form anyone — a newcomer, a reviewer, or a coding agent — can hold at once; optional audit, generation, and discovery commands belong in task-focused CLI documentation. If a composition rule cannot survive the trip into the authoring-rules page, the rule is too complicated.
- The README teaches **100% of the golden path and core composition model** and is read in one sitting; optional production capabilities may link to concise task guides and the CLI reference. The HTML composition model stays small enough to pass the polyfill complexity test (§1), whether or not a browser polyfill ships. The measure of smallness is the core authoring surface — the five concepts of §1 — not this document's length or the number of final-output checks. This spec grows when honesty requires it; implementation minutiae belong in `docs/conformance-spec.md`.
- **Nothing you didn't mean to publish ever reaches `dist/`, and a build that reports errors never publishes at all.** Deploy safety is a success criterion, not an implementation detail.
- Given the same source tree and the same generated-source overlay, the same unify version produces identical output. Composition semantics remain stable across upgrades; any newly generated standard artifact is additive, explicit in release notes and `--dry-run`, and never silently changes authored content. No framework migrations or config-language churn.
- At least one external open-source project adopts unify for its website — the first proof of the "more peaceful internet" ambition. Publication and documentation sites become headline use cases only after the feed, search-manifest, audit, and generator workflows make them comparably boring to maintain.
