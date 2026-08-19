# unify

**HTML-native composition — no expression language, no client runtime.**

unify is a static site generator for front-end designers and hobbyists: people fluent in HTML and CSS who have no interest in JavaScript frameworks, templating languages, or build tooling. Define a header, footer, nav, or page layout once, in plain HTML files, and have it rendered into every page of the site. The output is the HTML and CSS you wrote — unify adds no JavaScript of its own. It replaces copy-paste chrome, hand-edited HTML, and Apache SSI; it does not compete with Hugo, Eleventy, or Astro.

The entire authoring surface is five things, learnable in five minutes:

| You want to… | You write… |
|---|---|
| Reuse a fragment (nav, footer, badge) | `<include src="/_includes/nav.html"></include>` |
| Wrap pages in a layout | nothing (the nearest `_layout.html` applies) — `data-layout="/path.html"` to pick one, `data-layout="none"` to opt out |
| Mark where page content lands, or let pages replace a named region | `<main>` for the default; `<slot name="footer">…</slot>` in the layout, `slot="footer"` on a page element |
| Keep a page or folder out of the built site | name it with a leading underscore: `_draft.html`, `_includes/` |
| Ship a bare snippet exactly as written (for `<include>`, embeds, fetch) | name it `*.fragment.html` |

If a capability cannot be expressed with these five, it does not belong in unify.

> **Status.** v0.7.0 is a clean break from 0.6.x: `data-unify`, `unify-*` area classes, `serve`, `--minify`, and `--fail-on` are gone, and a 0.6 site will not build. The composition model is standard HTML — `<main>`, `<slot>`, `slot=` — plus `<include src>` and `data-layout`. The specification set in [`docs/`](docs/) is authoritative; every normative rule in it is covered by a test that runs against the real CLI.

## Install

### Standalone binary — the headline install

```bash
curl -fsSL https://raw.githubusercontent.com/fwdslsh/unify/main/install.sh | bash
```

Installs to `~/.local/bin` by default. The script accepts `--global` (system-wide, needs write access to `/usr/local/bin`), `--dir PATH`, `--version vX.Y.Z`, `--force`, and `--dry-run`. Prebuilt binaries for Linux and macOS (x86_64 and arm64) are attached to releases from v0.7.0 onward ([GitHub releases](https://github.com/fwdslsh/unify/releases)) — nothing else to install. No Windows binary yet — use the Bun or npm install below.

### Bun or npm — the developer path

```bash
bun add -g @fwdslsh/unify
# or
npm install -g @fwdslsh/unify
```

Bun (>= 1.2.0) is the only supported runtime: the installed `unify` script runs under `bun`, and there are no Node or Deno builds. If you have never heard of Bun, use the binary above.

## The five-minute site

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
├── AGENTS.md             # outside src/, so it cannot publish
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

Templates: `default`, `basic`, `blog`, `docs`, `portfolio`. Each exercises every primitive exactly once, and both `unify init && unify build --dry-run --strict` and `unify init && unify audit --strict` exit `0` — a scaffold arrives with a language, a share image whose declared dimensions are the file's real ones, a `robots.txt`, and a title, description and heading on every page.

Two files land beside `src/` rather than in it, so neither can publish: `AGENTS.md`, the repository-local guidance for whoever — or whatever — edits the site next, and `DEPLOY.md`, the recipe ending in the two commands that carry the site's address.

## How composition works

**`_layout.html`** — a complete page you can open in a browser right now. Its slot fallbacks are its own preview:

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

The built page is the layout with its `<main>` content replaced by the page's, and the page's title prepended to the layout's: `<title>Home — My Site</title>`. The separator lives in the layout, so pages write only their own name.

**`contact.html`** — overriding a named region. The layout marked its footer contents with `<slot name="footer">`, so any page may replace them with one standard attribute:

```html
<body>
  <h1>Contact</h1>
  <p>Ordinary content as usual.</p>
  <p slot="footer">© My Site — <a href="mailto:hi@example.com">email us</a></p>
</body>
```

The footer then contains exactly the element you wrote. Built pages contain no `<slot>` elements, no `data-layout` attributes, and no injected script. The one unify token a built page may carry is `<meta name="schema">`, and only on a page that asked for a generated JSON-LD block — nothing else survives into the output.

The precedence rule, in one sentence: **named fills go to named slots, everything else to the bare slot, else into `<main>`.**

**`about.md`** — Markdown pages work identically; frontmatter supplies the head:

```markdown
---
title: About
description: Who we are
og:
  image: /assets/team.jpg
---

# About

Everything here is converted to HTML and dropped into the layout
exactly like an HTML page's content.
```

`title`, `layout`, `class`, `lang`, `dir`, and `schema` are the frontmatter keys with behavior; every other key becomes a `<meta>` tag. Headings get slug `id`s so every heading is a deep link.

That is the whole product. There is nothing else to learn.

## Worked examples

[`examples/`](examples/) holds five complete sites, each building clean under
`unify build --dry-run --strict`. Four were authored by an agent given nothing but the
sixty lines of authoring rules and a client brief, and kept because they passed review —
so they show what the rules actually lead someone to build, not what a maintainer wishes
they would. Between them they cover pages generated from a data file, client-side
filtering with and without fetch, a section with its own look sharing the site's chrome,
a page with no chrome for embedding elsewhere, deploying under a subdirectory, htmx
swapping `.fragment.html` panels, and a Svelte component compiled to an ordinary asset.
[`examples/README.md`](examples/README.md) names the pattern in each — including the one
thing they get wrong, which no build check can catch.

## CLI

```
unify [build]              build the site (default command)
unify audit                evaluate the site the build would publish — writes nothing
unify dev                  build, watch, serve, and reload — the inner loop
unify watch                build + rebuild on change, no server
unify init [template]      scaffold a starter site

Options:
  -s, --source <dir>       source directory (default: src/ if it exists, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --exclude <glob>     globs never emitted, still usable by the build (repeatable; default: _*)
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --canonical auto     add a canonical link to pages that author none, from the site address
      --base-url <url>     the site's whole address (https://site.example/repo/): prefix root-relative links, make og:/canonical absolute for share crawlers, and generate sitemap.xml
      --dry-run            run the full build and every check, print the report, write nothing
      --strict             advisories count as problems for the exit code (with `audit`, findings too)
  -p, --port <n>           port for `unify dev` (default: 3000)
  -v, --version            print version
  -h, --help               print help
```

That is the entire CLI — there are no other commands or flags. See [`docs/cli-reference.md`](docs/cli-reference.md) for what each one does.

`unify build` publishes all-or-nothing: composition and every check — including a reference check of every internal URL in the output — run into a temporary tree, and `dist/` is updated only if there were **zero problems**. Exit `0` means `dist/` is the complete site; `1` means problems were found and the previous output is byte-for-byte untouched; `2` means invalid usage or a fatal environment error. Diagnostics come in two severities, `problem` and `advisory`, in plain language with no rule codes:

```
src/index.html:8: problem: include not found: /_includes/navv.html
  in: <include src="/_includes/navv.html">
  fix: create src/_includes/navv.html, or point src at an existing file
  fix: check the path spelling and casing
```

`unify build --dry-run --strict` is the whole build and every check, writing nothing — the one-line CI lint.

`unify audit` answers a different question: not *is this build sound?* but *is this site complete?* It runs the same whole build, publishes nothing, and reports what it observed — a page with no description, two pages sharing a title, a heading and a `<title>` that disagree, a link to `#section` where nothing has that id, an `id` used twice on one page, a page nothing links to, structured data that contradicts the page carrying it. Each finding prints the evidence and one thing to do. **There is no score, no grade, and nothing counts characters** — a short title is not a finding, an absent one is; "duplicate" means identical, never similar. `unify build` never runs any of it, so no finding can hold up a release; `unify audit --strict` exits non-zero on any finding, and that is the opt-in CI gate. A fresh `unify init` passes it, so the first finding you see is about a page you wrote.

An optional `unify.yaml` at the source root holds saved flags and nothing more (keys are the long option names; CLI flags win; the file never ships). No behavior exists that only the config file can express.

## What unify will never do

- **Ship JavaScript.** Your scripts pass through untouched; unify injects, generates, and rewrites none of its own. `unify dev` injects live reload only into the pages it serves, never into `dist/`.
- **Grow a templating language.** No variables, loops, conditionals, or expressions — no `{{ }}`, no `{% %}`, no props. Anything derived from a set of files (a post index, a feed) comes from a script you own, run before the build: `node _scripts/gen.mjs && unify build`.
- **Become a component framework.** Slots fill layouts; `<include>` is verbatim and never takes fills.
- **Need configuration.** Conventions, not config files.
- **Scope your CSS.** Use `@scope`, `@layer`, nesting, or a class prefix — the platform already answers this.
- **Be a real web server.** `unify dev` serves static files and reloads. No proxying, HTTPS, middleware, or plugins; pair `unify watch` with a real server instead.

The full list, with the reasoning and the accepted costs, is [`docs/product-spec.md`](docs/product-spec.md) §5. Sitemaps, minification, layout chaining, and a browser preview polyfill are post-MVP candidates (§6), not current features.

## The complete authoring rules

Every rule an author needs, in under sixty lines. This section is [`docs/authoring-rules.md`](docs/authoring-rules.md) embedded verbatim: the bytes between the two markers below are byte-identical to that file, which release gate G10 asserts ([`docs/testing-strategy.md`](docs/testing-strategy.md) §6). Edit the file, never this copy.

<!-- BEGIN docs/authoring-rules.md -->

# Authoring a unify site — the complete rules

unify composes plain HTML at build time. No template language, variables, loops, or config: if you reach for
`{{ }}`, `{% %}`, props, or a config key, you are solving it wrong. The vocabulary is standard HTML — `<main>`,
`<slot>`, `slot=` — plus `<include>` and `data-layout`. Derived files (a post index, a feed) come from a script you write and run yourself: `node _scripts/gen.mjs && unify build`.

## Files
- Source root is `src/` if it exists, else the current directory. `.html`/`.md` are pages — except a name
  ending `.fragment.html`, a bare snippet shipped as written, for `<include>`, embeds, or `fetch`/`hx-get` — and every other file copies byte-for-byte to the same path. A leading `/` means the source root, in any path you write. Always
  link the real filename — `/about.html`, never `/about/`; a directory link (`/guides/`) resolves only if you
  wrote a `guides/index.html`. `--pretty-urls` rewrites links; `--base-url https://you.example/handbook/` — the site's whole address, never a bare path — prefixes them and makes `og:`/`canonical` absolute for share crawlers.
- **Everything in the source root ships.** Anything that is not part of the site — notes, drafts,
  scratch, scripts — goes under a leading underscore (`_draft.html`, `_notes/`, `_scripts/`): the
  build still reads it, the output never contains it. Files inside a `_` directory need no prefix.
- Every file is valid standalone HTML: pages and layouts are complete `<!doctype html>` documents,
  fragments are balanced snippets. HTML pages never have frontmatter (use `<head>`); Markdown pages
  never contain `<head>` (use frontmatter). Both are build errors.

## Include — reuse a fragment
`<include src="/_includes/nav.html"></include>`, always with the closing tag; `/…` resolves from the source
root, anything else relative to the including file. Works in any file — layouts, pages, `<head>`, fragments,
and `.md`. **Never put content between the tags** — includes are verbatim, not components.

## Layout — chrome around a page
Every page is wrapped by the nearest `_layout.html` — its own folder, then each parent; the page says
nothing. Pick one with `data-layout="/path.html"` on the page's `<html>` or `<body>` (Markdown:
`layout: /path.html`); opt out with `data-layout="none"` / `layout: none`. Layouts are paths ending in
`.html` — a bare name like `default` is an error. `data-layout` belongs on pages only: anywhere else it is
an error — on a layout too, because layouts don't chain (a section layout is a complete standalone page).

## Merging a page into its layout
- **Named slots.** The layout writes `<slot name="footer">fallback…</slot>`; the page fills it with `slot=`
  on a real element — `<footer slot="footer">…</footer>`, never a `<slot>` tag, which in a page fills nothing
  — and that element replaces the slot, tag and all, shipping exactly as written. Omit the fill and the
  fallback ships; `slot=` counts on direct children of `<body>` — or of your `<main>`, unwrapped first — and silently does nothing deeper. `grep -o '<slot[^>]*>' src/_layout.html` lists a layout's slots.
- **Everything else** replaces the layout's bare `<slot></slot>` if it has one — `<main><slot></slot></main>`
  is the usual shape — otherwise the children of its `<main>`. A `<main>` you wrote is dropped and its children used, so write complete semantic
  documents. A bare `<header>`/`<footer>` does **not** replace the layout's — only `slot=` fills, and it fills the *contents*: where the layout wraps its slot in its own `<footer>`, write `<p slot="footer">`, or you ship a footer inside a footer.
- **Head.** A page has its own complete `<head>`; the layout's is the base, and where both declare
  `<meta charset>` the layout's wins. **Write the separator into the layout's title** —
  `<title>— My Site</title>`, no leading space — and a page writes only its own name
  (`<title>About</title>`); the join adds the space, giving `About — My Site`. Your `<meta>` replaces the layout's same-`name`/`property`, your `canonical`/`icon`
  links replace the layout's, everything else appends after — page CSS wins.
- **Root attributes.** On `<html>`/`<body>` only, your classes are added and any other attribute you
  set wins; attributes merge nowhere else. Active nav is `<body class="home">` plus CSS
  (`body.home .nav-home {…}`), not a feature.

## Markdown
Frontmatter is YAML: quote any value containing a colon — `title: "Finish: the last quarter"`. `title`,
`layout`, `class` (on `<body>`), `lang`, `dir`, and `schema` are the only keys with meaning; every other becomes
`<meta name=…>` with the value as written, so `tags`/`permalink`/`slug` do nothing and `draft: true`
publishes (hold pages back with a leading underscore instead). A key named `og:…` emits `property=` instead
(`og:image: /card.png`; two levels deep is an error). No `title:` → first `# Heading`; headings get slug `id`s. `schema: Article` (or `WebPage`, or `BlogPosting` — those three, spelled exactly; in HTML, `<meta name="schema" content="Article">` in the head, which a layout may carry for a whole section) writes the page's JSON-LD for you, from what the page already declares: its title, description, canonical, `og:image`, `author`, `date`, `lastmod`, and `lang`. Nothing else is added and nothing is guessed — a `date` unify cannot read as `2026-01-02` or `2026-01-02T09:30:00Z` is left out and reported, never filled in from the clock or the file. Write your own `<script type="application/ld+json">` for any other type, or for more detail: yours wins and unify then generates nothing. A canonical still has no frontmatter key — it is one page's own address, which a layout must never set (that stamps every page with the same URL), so write that page in HTML, use `--canonical auto`, or leave it off.

## Styles, scripts, finishing
unify never scopes, rewrites, or injects CSS/JS, and rewrites only HTML's own URL attributes (`href`, `src`) — a `url()` in CSS and a `fetch()`/`hx-get` address ship as written, so a root-relative one misses the `--base-url` prefix and 404s:
keep every `url()` in a stylesheet file and every fetched address relative to the page — or read it back from an `href` unify rewrote. Scope fragment styles yourself (`@scope`, `@layer`, a class prefix).
`unify build --dry-run --strict` is the whole build and every check, writing nothing: every problem in one pass,
and a list naming each page with the layout it resolved to. Then `unify build` — exit 0 means `dist/` is the complete
site; non-zero means nothing was published and `dist/` is untouched, so never report success on a non-zero exit. `--exclude` **replaces** the `_*` default; keep `_*` in your list.

<!-- END docs/authoring-rules.md -->

## Documentation

**Using unify**

- **[Getting Started](docs/getting-started.md)** — the tutorial.
- **[Authoring Rules](docs/authoring-rules.md)** — the complete authoring surface (embedded above).
- **[CLI Reference](docs/cli-reference.md)** — every command, option, and exit code.
- **[Integrations](docs/integrations.md)** — the compile-to-asset pattern: Svelte, TypeScript, or anything else with a compiler, without adopting a framework for the site.
- **[Docker Usage](docs/docker-usage.md)** — running the CLI in a container.
- **[Examples](examples/README.md)** — five complete sites and the patterns they demonstrate.

**How unify is defined**

- **[Product Specification](docs/product-spec.md)** — what unify is, the composition model, the non-goals.
- **[Conformance Specification](docs/conformance-spec.md)** — the normative implementer reference: exact algorithms, the head-merge table, the closed problem and advisory catalogues.
- **[Testing Strategy](docs/testing-strategy.md)** — the testing contract and the release gates.
- **[CI/CD Workflows](docs/cicd-workflows.md)** — what each job runs and what it is allowed to mean.

**How the documentation was validated**

- **[Ratification](docs/ratification.md)** — the evidence: agents authoring from the sixty lines in isolation, what each round found, and what it changed in the docs, the spec, and the engine.
- **[Ratification Protocol](docs/ratification-protocol.md)** — the procedure, for running another round.
- **[Migration Plan](docs/migration-plan.md)** — how the v0.6 tree became this one. History, not current work.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Development setup:

```bash
git clone https://github.com/fwdslsh/unify
cd unify
bun install
bun test
```

## License

CC-BY-4.0. See [LICENSE](LICENSE).
