# Getting started with unify

unify turns a folder of plain HTML (and Markdown) into a finished site with shared navs, headers, and footers — no templating language, no JavaScript framework, no configuration. If you can write HTML and CSS, you already know almost everything unify does.

This guide takes you from nothing to a deploy-ready site. The complete rule set fits on one screen in [`authoring-rules.md`](authoring-rules.md).

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
├── AGENTS.md             # notes for whoever edits this site next — outside src/, so it never publishes
├── DEPLOY.md             # how to publish it, ending in the two commands that carry your address
└── src/                  # the source root — everything here ships
    ├── _layout.html      # the site chrome — one complete HTML page
    ├── _includes/
    │   └── nav.html      # a fragment
    ├── index.html        # a page
    ├── about.md          # a Markdown page
    ├── contact.html      # a page that overrides the footer
    ├── 404.html          # a page with no layout
    ├── robots.txt        # minimal and honest: it blocks nothing
    └── assets/
        ├── style.css
        └── share-placeholder.png   # the image social crawlers show — replace it
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
      <h1>Home</h1>
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

Frontmatter supplies the head: `title` (if you skip it, the first `# Heading` is the title), `layout`, `class`, `lang`, `dir`, `schema` (`Article`, `WebPage`, or `BlogPosting`, spelled exactly — it writes that page's JSON-LD from what the page already declares), and any other key becomes a `<meta>` tag (`description`, `author`; an `og:` block becomes `property=` metas). Headings get anchor `id`s automatically. There are no collections and no draft mechanism, and unify says so rather than letting a key look like it worked: `draft:`, `permalink:`, and `slug:` are **build errors** naming what to do instead — hold a page back by renaming it with a leading underscore (`_draft.md`), and change a page's address by renaming or moving the source file. `tags:` and `categories:` are allowed and become ordinary `<meta>` tags, but nothing is built from them — no index, no archive, no feed — and `unify audit` reports that once per page.

One more key does something: `schema: Article` (or `WebPage`, or `BlogPosting`) writes the page's JSON-LD for you, out of what the page already says — title, description, canonical, `og:image`, `author`, `date`, `lastmod`, `lang`. It invents nothing, so a `date:` it cannot read as `2026-01-02` is left out and reported rather than guessed at, and a `<script type="application/ld+json">` you write yourself wins outright. That is the escape hatch for every other type.

Two rules that save you from silent mistakes (unify makes both hard errors): HTML pages never have frontmatter — use `<head>`. Markdown pages never contain a `<head>` element — use frontmatter.

## Opting out of the layout

`src/404.html` carries `data-layout="none"` on its `<body>` — it ships as-is, with includes and URL rules still applied. Use the same attribute with a path to pick a different layout: `data-layout="/other.html"` (in Markdown: `layout: /other.html`). Layouts are always paths ending in `.html`, never bare names.

Section layouts work by placement: put a `_layout.html` in `blog/` and every page under `blog/` uses it instead of the site layout. A section layout is a complete standalone page like any other layout — write the shared chrome into it too. Layouts do not chain: a layout that itself carries `data-layout` is a build error (unify tells you rather than silently ignoring it).

## A snippet that ships as written

Sometimes you want a bare piece of HTML at its own URL — a panel another site embeds, or
something a bit of JavaScript fetches after the page loads. A page cannot do that: every
page is a complete document. Name the file `*.fragment.html` instead:

```html
<!-- src/hours.fragment.html -->
<div class="hours">
  <h3>Opening hours</h3>
  <p>Saturday 10am–4pm</p>
</div>
```

It ships byte-for-byte at `/hours.fragment.html` — no layout, no composition, nothing
added. And it is still an ordinary include target, so the same file can appear inside a
page of yours *and* be fetched by someone else:

```html
<include src="/hours.fragment.html"></include>
```

One file, one place to edit it, two consumers. (`examples/htmx-fragments` is this,
worked end to end.)

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

A separate command answers a separate question — not *is this build sound?* but *is this site complete?*:

```bash
unify audit                      # what the build would publish, evaluated; writes nothing
```

It reports the things a build has no business refusing over: a page with no description, two pages sharing a title, a heading and a `<title>` that disagree, a link to `#section` where nothing has that id, a page nothing links to. Each one prints what was seen and one thing to do about it. There is no score and nothing counts characters — a short title is not a problem, an absent one is. `unify audit --strict` exits non-zero on any finding, which is the CI gate; plain `unify build` never runs these checks at all, so none of them can hold up a release. A fresh scaffold reports nothing: `unify init && unify audit --strict` exits `0` for every starter template, so you can wire the gate up on day one and the first finding you see will be about a page you wrote.

While `unify dev` is running you can read the same findings as a page, at **`http://localhost:3000/_unify/`** — grouped by page, with each page's record beside them (title, description, language, canonical, headings, links in and out) and the build's own diagnostics underneath. It is the same information `unify audit` prints, arranged for looking at one page rather than scanning a list. Nothing about it is written to `dist/`.

Two more `audit`-only flags, for wiring it into other tools: `--format json` (or `--format sarif`) prints the same findings as one machine-readable document instead of prose — the same `pages` records every other feature reads, plus a stable `fingerprint` per finding a CI system can use to suppress one it has already triaged. `--external` fetches every off-origin URL the site's output declares (a share image, a canonical to another site, a plain link) and reports the ones that don't answer — the only thing in unify that touches the network, and only when you ask for it; plain `build`/`audit` stay offline.

Deploying under a subpath (GitHub Pages project sites)? Give `--base-url` the site's whole address: `unify build --pretty-urls --base-url https://you.github.io/repo-name/`. The path part prefixes every root-relative link; the domain absolutizes `og:` and canonical URLs, which is what Facebook, LinkedIn and Slack fetch when someone shares a page. A bare `/repo-name/` is rejected — it would prefix the links and leave the share metadata unfetchable.

## Feeds and a search index

Declare what a page *is* and unify writes its feed entry for you — no script, no `posts/` convention:

```html
<meta name="schema" content="BlogPosting">
<meta name="date" content="2026-01-02T09:00:00Z">
```

(Markdown frontmatter: `schema: BlogPosting` and `date: 2026-01-02T09:00:00Z`.) Build with `--base-url`, and every page anywhere on the site declaring `Article` or `BlogPosting` — indexable, not consolidated elsewhere by its own canonical, and dated with a real instant — becomes an entry in `feed.xml` (Atom, at the output root). **The date needs a time, not just a day**: `date: 2026-01-02` alone names a calendar day, and unify will not invent a time to fill the gap — midnight UTC is the wrong publication date for every reader west of Greenwich. It reports the page as excluded instead of guessing:

```
src/posts/hello.md: advisory: date is "2026-01-02", which names a day rather than an instant — this page is not in feed.xml
  fix: write date: 2026-01-02T09:00:00Z — a feed entry's timestamp needs a time and a time zone
```

Want each entry's full rendered content in the feed, not just a summary? Add `--feed-full`. Want to write the feed yourself instead — RSS, extra fields, a generator script — just ship your own `src/feed.xml`: an authored file always wins, and unify generates nothing (`unify init blog`'s own feed is exactly this, and it still builds and audits clean).

`--search-index` writes `search-index.json` at the output root: every indexable page's URL, title, description, heading outline, and visible text, ready for a client-side search library to read instead of re-parsing your site. It works with or without `--base-url` (root-relative locally, absolute once you give it an address), and an authored `src/search-index.json` overrides it the same way a feed does.

## Anything else derived from other files

A blog index, a gallery page — anything else computed from a set of files — is a script you own, run before the build:

```bash
node _scripts/gen.mjs && unify build
```

The script writes real pages into `src/`, where they get layouts, head merging, and reference checking like everything else (`unify init blog` ships a working example, generator and data file included). One habit matters the day the script reads a data file: **name the fields you emit — never spread the whole record**. The underscore keeps `_data/` itself out of `dist/`, but no build check can catch a private field once your script copies it into a page. unify itself has no collections, no data files, and no template language — that's the point.

## Where to go next

- [`authoring-rules.md`](authoring-rules.md) — every authoring rule on one screen
- [`cli-reference.md`](cli-reference.md) — every command and flag
- [`product-spec.md`](product-spec.md) — the product contract, including what unify refuses to do and why
- [`conformance-spec.md`](conformance-spec.md) — the exact composition rules, for implementers and the curious
- [`integrations.md`](integrations.md) — putting a Svelte component (or anything else with a compiler) on one page
- [`../examples/README.md`](../examples/README.md) — five complete sites, and the pattern each one shows
