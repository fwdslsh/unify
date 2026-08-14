# Getting started with unify

unify turns a folder of plain HTML (and Markdown) into a finished site with shared navs, headers, and footers — no templating language, no JavaScript framework, no configuration. If you can write HTML and CSS, you already know almost everything unify does.

This guide takes you from nothing to a deployed-ready site. It matches unify v0.7.0 exactly; the complete rule set fits on one screen in [`authoring-rules.md`](authoring-rules.md).

## Install

Download the standalone binary for Linux or macOS from the releases page and put it on your `PATH` — no runtime, no package manager. (No Windows binary yet — Windows users, or developers who already use Bun, can `bun add -g @fwdslsh/unify` instead.)

## Two commands

```bash
unify init          # scaffold a starter site into src/
unify dev           # build, watch, serve, and reload — one terminal
```

Open `http://localhost:3000`, edit a file under `src/`, save — the browser reloads. When you're happy:

```bash
unify build         # write the final site to dist/
```

Upload `dist/` anywhere: GitHub Pages, Netlify, any static host.

## What `init` gave you

```
my-site/
└── src/                  # the source root — everything here ships
    ├── _layout.html      # the site chrome — one complete HTML page
    ├── _includes/
    │   └── nav.html      # a fragment
    ├── index.html        # a page
    ├── about.md          # a Markdown page
    ├── contact.html      # a page that overrides the footer
    ├── 404.html          # a page with no layout
    └── assets/
        └── style.css
```

Everything in `src/` ships to the site **except** files and folders whose name starts with `_` — those are the build's working material (layouts, fragments, notes, scripts). Files *inside* an underscore folder don't need their own prefix: `_includes/nav.html` is already held back.

## The layout

`src/_layout.html` is a complete HTML page — open it directly in a browser and you'll see the site chrome with its default content:

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

Three things are happening:

1. **`<include src="…">`** pulls in a fragment. Paths starting with `/` resolve from `src/`; anything else is relative to the file doing the including. Always write the closing `</include>` tag — it's what makes the source file preview correctly in a browser.
2. **`<main>`** is where page content lands. That's not a unify invention — the HTML spec already defines `<main>` as the content unique to each page, as opposed to repeated chrome.
3. **`<slot name="footer">`** marks a region a page may replace. What's inside the slot is the default (and what a browser shows when you open the layout directly). The starter stylesheet includes `slot { display: contents }` so the design-time wrapper adds no box; built pages contain no `<slot>` elements at all. Name slots for what they hold (`footer`, `hero`, `cta`), not where they sit (`top`, `col2`) — content names outlive redesigns. A plain comment above each slot, like the scaffold's, is all the documentation a layout needs.

## Pages

`src/index.html` is also a complete page. It never mentions the layout — the nearest `_layout.html` (in its own folder, or any parent) applies automatically:

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

Built result: the layout's `<main>` content is replaced by the page's, and the page's title is joined onto the layout's — `<title>Home — My Site</title>`. The layout carries the separator, so pages write only their own name.

Two details worth knowing:

- Your page's own `<main>` wrapper is unwrapped during composition, so nothing ends up nested. Writing complete, semantic documents is exactly right.
- A page's `<body class="home">` is merged onto the built page's `<body>` — which is how you do active-nav highlighting: `body.home .nav-home { font-weight: bold; }` in your stylesheet. No feature needed.

## Overriding a region

`src/contact.html` replaces the footer by using the slot's name — one standard HTML attribute on a top-level element:

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

The built footer contains exactly the `<p>` you wrote — tag, attributes, and all. Pages that don't mention the footer keep the layout's default. Note what does *not* override anything: a plain `<header>` or `<footer>` element in your page is just content. Only `slot=` fills a region, and only on top-level elements (direct children of `<body>`).

## Markdown pages

`src/about.md`:

```markdown
---
description: Who we are
og:
  image: /assets/team.jpg
---

# About

Everything here is converted to HTML and dropped into the layout
exactly like an HTML page's content.
```

Frontmatter supplies the head: `title` (if you skip it, the first `# Heading` is the title), `layout`, `class`, `lang`, `dir`, and any other key becomes a `<meta>` tag (`description`, `author`; an `og:` block becomes `property=` metas). Headings get anchor `id`s automatically. There is no `draft:`, `date:`, or `tags:` behavior — `draft: true` would just publish a page with a meta tag; hold pages back by renaming them with a leading underscore (`_draft.md`).

Two rules that save you from silent mistakes (unify makes both hard errors): HTML pages never have frontmatter — use `<head>`. Markdown pages never contain a `<head>` element — use frontmatter.

## Opting out of the layout

`src/404.html` carries `data-layout="none"` on its `<body>` — it ships as-is, with includes and URL rules still applied. Use the same attribute with a path to pick a different layout: `data-layout="/other.html"` (in Markdown: `layout: /other.html`). Layouts are always paths ending in `.html`, never bare names.

Section layouts work by placement: put a `_layout.html` in `blog/` and every page under `blog/` uses it instead of the site layout. A section layout is a complete standalone page like any other layout — write the shared chrome into it too. Layouts do not chain: a layout that itself carries `data-layout` is a build error (unify tells you rather than silently ignoring it).

## Links and assets

- Write paths that are correct for the file you're editing — relative or root-relative, both work. unify resolves URLs written in layouts and fragments against the file that wrote them, so composed pages are correct at every depth.
- **Always link the real file**: `href="about.html"`, never a hand-written `/about/`. If you want pretty URLs, build with `--pretty-urls` — pages move to `about/index.html` and every internal link is rewritten for you.
- Every non-page file in `src/` is copied through byte-for-byte to the same path. What you see in the folder is what ships — compress images before adding them.
- unify does not scope styles. If a fragment's CSS should not leak, use the platform: `@scope`, `@layer`, nesting, or a class prefix.

## Checking and publishing

```bash
unify build --dry-run --strict   # the whole build and every check, writing nothing
unify build                      # publish to dist/ — all-or-nothing
```

`--dry-run` prints what would be written and which layout each page composed from. The build checks every internal reference against the emitted files — a renamed page, a typo'd image path, or a case mismatch is a located error, not a quiet 404. If anything is wrong, **nothing is published**: exit 0 means `dist/` is the complete site, non-zero means the previous `dist/` is untouched.

Deploying under a subpath (GitHub Pages project sites)? Give `--base-url` the site's whole address: `unify build --pretty-urls --base-url https://you.github.io/repo-name/`. The path part prefixes every root-relative link; the domain absolutizes `og:` and canonical URLs, which is what Facebook, LinkedIn and Slack fetch when someone shares a page. A bare `/repo-name/` is rejected — it would prefix the links and leave the share metadata unfetchable.

## Anything derived from other files

A blog index, a feed, a gallery page — anything computed from a set of files — is a script you own, run before the build:

```bash
node _scripts/gen.mjs && unify build
```

The script writes real pages into `src/`, where they get layouts, head merging, and reference checking like everything else (`unify init blog` ships a working example, generator and data file included). One habit matters the day the script reads a data file: **name the fields you emit — never spread the whole record**. The underscore keeps `_data/` itself out of `dist/`, but no build check can catch a private field once your script copies it into a page. unify itself has no collections, no data files, and no template language — that's the point.

## Where to go next

- [`authoring-rules.md`](authoring-rules.md) — every authoring rule on one screen
- [`cli-reference.md`](cli-reference.md) — every command and flag
- [`product-spec.md`](product-spec.md) — the product contract, including what unify refuses to do and why
- [`conformance-spec.md`](conformance-spec.md) — the exact composition rules, for implementers and the curious
