---
description: "The unify tutorial: install, scaffold a site, compose pages with includes, layouts and slots, and publish."
---

# Getting started with unify

unify turns a folder of plain HTML (and Markdown) into a finished site with shared navs, headers, and footers — no templating language or JavaScript framework. Most sites need no configuration file: use conventions and CLI options, or save settings in `unify.yaml` when useful. If you can write HTML and CSS, you already know almost everything unify does.

This guide takes you from nothing to a deploy-ready site. The complete rule set fits on one screen in [`authoring-rules.md`](authoring-rules.md).

Coming back to do one thing? Each task below is one section of this guide:

| To… | Read |
|---|---|
| add a page | [Pages](#pages), or [Markdown pages](#markdown-pages) |
| add a folder of Markdown pages with its own chrome | [A section of Markdown pages](#a-section-of-markdown-pages) |
| change the nav, the footer, or any part every page shares | the file in `site/_includes/` that the layout includes — [The layout](#the-layout) |
| reuse one block with different words in each place | [A snippet that ships as written](#a-snippet-that-ships-as-written) |
| link a page or an asset | [Links and assets](#links-and-assets) |
| list pages on an index page | [Anything else derived from other files](#anything-else-derived-from-other-files) |
| see a layout or an include on its own, or what the build made of a page | [Seeing what the build did](#seeing-what-the-build-did) |
| check the site before publishing | [Checking and publishing](#checking-and-publishing) |

## Install

Download the standalone binary for Linux or macOS from the releases page and put it on your `PATH` — no runtime, no package manager. (No Windows binary yet — Windows users, or developers who already use Bun, can `bun add -g @fwdslsh/unify` instead.)

## Two commands

```bash
unify init          # scaffold a starter site into site/
unify dev           # build, watch, serve, and reload — one terminal
```

Open `http://localhost:3000`, edit a file under `site/`, save — the browser reloads. When you're happy:

```bash
unify build         # write the final site to dist/
```

Upload `dist/` anywhere: GitHub Pages, Netlify, any static host.

## What `init` gave you

(`unify init blog`, `docs` or `portfolio` start from a different built-in; `unify init <directory>`, a git URL such as `https://github.com/fwdslsh/unify/templates/blog`, or any npm package start from a template somebody published — add `--audit` to keep it only if it audits clean. Later, `unify update` fetches the template again and copies its changed files over the site, listing the files it would overwrite and asking first. [`templates.md`](templates.md) walks through the whole workflow.)

```
my-site/
├── README.md             # notes for whoever edits this site next — outside site/, so it never publishes
├── DEPLOY.md             # how to publish it, ending in the two commands that carry your address
├── unify.yaml            # every build flag, described and commented out — uncomment what differs from the default; live: template:, where this came from for `unify update` and, under it, keep:, the files it never overwrites
└── site/                 # the source root — everything here ships
    ├── _layout.html      # the site chrome — one complete HTML page
    ├── _includes/
    │   └── nav.html      # a fragment
    ├── _examples/        # to copy into place and edit — about.md, contact.html — never published
    ├── index.html        # a page — it also overrides the footer
    ├── 404.html          # a page with no layout
    ├── robots.txt        # minimal and honest: it blocks nothing
    └── assets/
        ├── style.css
        ├── theme.css     # the look: custom properties you edit — unify update never overwrites it
        └── share-placeholder.png   # the image social crawlers show — replace it
```

Everything in `site/` ships to the site **except** files and folders whose name starts with `_` — those are the build's working material (layouts, fragments, notes, scripts). Files *inside* an underscore folder don't need their own prefix: `_includes/nav.html` is already held back.

That is also why the examples live where they do. `site/_examples/` holds a copy-ready version of each kind of page the template expects you to add: copy one into `site/`, edit the copy, and link it from `site/_includes/nav.html`. The example itself never publishes, and `unify update` — which refreshes the template's own files — never touches a file you copied. The look is `site/assets/theme.css`: the custom properties the stylesheet reads, yours to edit, and `unify.yaml` names it under `keep:` in its `template:` block, so `unify update` never overwrites it. Every built-in template works this way.

## The layout

`site/_layout.html` is a complete HTML page — open it directly in a browser and you'll see the site chrome with its default content:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>— My Site</title>
    <link rel="stylesheet" href="assets/style.css">
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

1. **`<include src="…">`** pulls in a fragment. Paths starting with `/` resolve from the source root (`site/`); anything else is relative to the file doing the including. Always write the closing `</include>` tag — it's what makes the source file preview correctly in a browser.
2. **`<main>`** is where page content lands. That's not a unify invention — the HTML spec already defines `<main>` as the content unique to each page, as opposed to repeated chrome.
3. **`<slot name="footer">`** marks a region a page may replace. What's inside the slot is the default (and what a browser shows when you open the layout directly). The starter stylesheet includes `slot { display: contents }` so the design-time wrapper adds no box; built pages contain no `<slot>` elements at all. Name slots for what they hold (`footer`, `hero`, `cta`), not where they sit (`top`, `col2`) — content names outlive redesigns. A plain comment above each slot, like the scaffold's, is all the documentation a layout needs.

## Pages

`site/index.html` is also a complete page. It never mentions the layout — the nearest `_layout.html` (in its own folder, or any parent) applies automatically:

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

Built result: the layout's `<main>` content is replaced by the page's, and the page's title is joined onto the layout's — `<title>Home — My Site</title>`. The layout carries the separator, so pages write only their own name. Write that separator with **no leading space** — `<title>— My Site</title>`, not `<title> — My Site</title>` — because the join supplies the space itself. The difference only shows on a page that has no title of its own: nothing is joined, so the layout's title ships exactly as written, leading space and all. (`unify audit` reports such a page, since every page sharing one title is a page a search result cannot tell apart.)

Two details worth knowing:

- Your first default-content `<main>` wrapper is unwrapped during composition, including inside a styling wrapper. This avoids adding another main around an ordinary page main; it does not repair already-nested mains.
- A page's `<body class="home">` is merged onto the built page's `<body>` — which is how you do active-nav highlighting: `body.home .nav-home { font-weight: bold; }` in your stylesheet. No feature needed. It is styling only: the shared nav's markup is the same on every page, so nothing marks the current link with `aria-current`.

**Unreleased (not 0.11.16): main attributes follow the content.** When non-empty default content enters a layout main, its classes and the page main's classes combine; other page attributes win. For example:

```html
<!-- Layout body -->
<body><main id="layout-content" class="shell" tabindex="-1"></main></body>
<!-- Page body -->
<body><main id="guide" class="article" aria-label="Guide"><h1>Guide</h1></main></body>
<!-- Built body -->
<body><main id="guide" class="shell article" tabindex="-1" aria-label="Guide"><h1>Guide</h1></main></body>
```

This also works with `<main><slot></slot></main>`; markup outside the slot stays. An unrelated main or fallback-only main keeps its own attributes. Named fills do not merge. Version 0.11.16 discards page-main attributes, so this can change existing IDs, selectors and accessibility hooks when upgrading. A bare slot outside a main still unwraps the page main, and unaddressed page siblings still enter the default destination.

## Overriding a region

`site/index.html` replaces the footer by using the slot's name — one standard HTML attribute on a top-level element:

```html
<!doctype html>
<html>
  <head>
    <title>Home</title>
  </head>
  <body>
    <h1>Home</h1>
    <p>Ordinary content as usual.</p>
    <p slot="footer">© My Site — <a href="mailto:hi@example.com">email us</a></p>
  </body>
</html>
```

**Unreleased (not 0.11.16):** a named fill also preserves any main in its subtree. For example, `<main slot="content" id="guide">…</main>` fills `<slot name="content"></slot>` as a complete main, with only `slot="content"` removed. Its nested slot attributes are left alone.

The built footer contains exactly the `<p>` you wrote — tag, attributes, and all. Pages that don't mention the footer keep the layout's default. Note what does *not* override anything: a plain `<header>` or `<footer>` element in your page is just content. Only `slot=` fills a region, on direct children of `<body>` or of the selected default-content main; arbitrary nested `slot` attributes stay untouched.

## What ends up in `<head>`

The layout's `<head>` is the base. The page's `<title>` joins the layout's **where the layout's stands**; a page `<meta>` with the same `name` or `property` as one of the layout's **replaces it where it stands**; everything else the page's head holds is **appended** after the layout's last element. A stylesheet or script the layout already loads is not loaded twice. With this layout head:

```html
<head>
  <meta charset="utf-8">
  <title>— My Site</title>
  <meta name="description" content="A site about things.">
  <script src="/assets/analytics.js"></script>
</head>
```

and this page head:

```html
<head>
  <title>About</title>
  <meta name="description" content="Who we are.">
  <meta property="og:title" content="About us">
  <link rel="stylesheet" href="/assets/about.css">
  <script src="/assets/analytics.js"></script>
</head>
```

the built page's head is (the added `og:description` default is unreleased; 0.11.16 leaves it out):

```html
<head>
  <meta charset="utf-8">
  <title>About — My Site</title>
  <meta name="description" content="Who we are.">
  <script src="/assets/analytics.js"></script>
  <meta property="og:title" content="About us">
  <link rel="stylesheet" href="/assets/about.css">
  <meta property="og:description" content="Who we are.">
</head>
```

So the analytics script, which runs where it stands, sees the page's title and description: both took the places the layout gave them, above it. It does not see `og:title`, which the layout had no place for and so arrives after it — and if the layout had no `<title>`, the page's would arrive after it too. A script that reads the page's metadata either stands after the layout elements whose places the page fills, or carries `defer`, which runs it once the whole document has been read.

These things in a built head can come from unify rather than from you:

- **`<link rel="canonical">`**, under `--base-url`, on an indexable page that has none (`--canonical none` turns it off). One you write always wins.
- **JSON-LD**, on a page that declares `schema: WebPage`, `Article` or `BlogPosting` (`<meta name="schema" content="Article">` in HTML), built only from what the page already declares. A `<script type="application/ld+json">` you write wins and unify generates none — that is where any other type, or richer data, goes.
- **Open Graph defaults**: `og:title` from the final title, `og:description` from the final description, and `og:url` from the resolved canonical. Page-authored OG tags win, including empty values and page-head includes. Derived values replace layout fallbacks; absent values leave those fallbacks unchanged. No Twitter tags are generated. This OG completion is **unreleased; 0.11.16 requires authored tags**.
- **Absolute URLs** in URL-valued `og:`/`twitter:` metadata and the canonical, under `--base-url`.

The details are in the CLI reference: [structured data](cli-reference.md#structured-data-schema), and `--canonical` just above it. The [social metadata recipe](guides/social-metadata.md) shows shared defaults and page overrides for HTML and Markdown.

## Markdown pages

`site/_examples/about.md`, once copied to `site/about.md`:

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

Frontmatter supplies the head: `title` (if you skip it, the first `# Heading` is the title), `layout`, `class`, `lang`, `dir`, `schema` (`Article`, `WebPage`, or `BlogPosting`, spelled exactly — it writes that page's JSON-LD from what the page already declares), and any other key becomes a `<meta>` tag (`description`, `author`; an `og:` block becomes `property=` metas). Headings get anchor `id`s automatically. There are no collections and no draft mechanism, and unify says so rather than letting a key look like it worked: `draft:`, `permalink:`, and `slug:` are **build errors** naming what to do instead — hold a page back by renaming it with a leading underscore (`_draft.md`), and change a page's address by renaming or moving the source file. `tags:` and `categories:` are allowed and become ordinary `<meta>` tags, but nothing is built from them — no index, no archive, no feed — they're inert by design, meaningful only to a consumer that chooses to interpret them (a catalog consumer included).

One more key does something: `schema: Article` (or `WebPage`, or `BlogPosting`) writes the page's JSON-LD for you, out of what the page already says — title, description, canonical, `og:image`, `author`, `date`, `lastmod`, `lang`. It invents nothing, so a `date:` it cannot read as `2026-01-02` is left out and reported rather than guessed at, and a `<script type="application/ld+json">` you write yourself wins outright. That is the escape hatch for every other type.

Two rules that save you from silent mistakes (unify makes both hard errors): HTML pages never have frontmatter — use `<head>`. Markdown pages never contain a `<head>` element — use frontmatter.

## Opting out of the layout

`site/404.html` carries `data-layout="none"` on its `<body>` — it ships as-is, with includes and URL rules still applied. Use the same attribute with a path to pick a different layout: `data-layout="/other.html"` (in Markdown: `layout: /other.html`). Layouts are always paths ending in `.html`, never bare names.

## A section of Markdown pages

A folder of articles needs no layout field in any of them. Put a `_layout.html` in the folder, and every page under it uses that layout instead of the site's:

```
site/
├── _layout.html          # the site's chrome
├── _includes/nav.html
└── notes/
    ├── _layout.html      # the notes section's chrome — a complete page, like any layout
    ├── first.md
    └── second.md
```

`site/notes/_layout.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>— Notes — My Site</title>
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body class="notes">
  <include src="/_includes/nav.html"></include>
  <main><article><slot></slot></article></main>
</body>
</html>
```

`site/notes/first.md`:

```markdown
---
description: The first note.
---

# First steps

The lead paragraph, written here like the heading above it.
```

Neither Markdown file names a layout: the nearest `_layout.html`, in their own folder, wraps both. `first.md` has no `title:`, so its `# First steps` supplies the title, and the page ships `<title>First steps — Notes — My Site</title>` with `<h1 id="first-steps">First steps</h1>` inside the layout's `<article>`.

**Frontmatter describes the page; it never writes its content.** `title` sets the `<title>`, `class`, `lang` and `dir` set attributes on `<body>` and `<html>`, and every other key becomes a `<meta>`. Nothing in frontmatter appears as text on the page, and a layout cannot read it into its own markup, because there are no variables. The visible heading, the lead and a date line are text you write in the Markdown, as above. A page header computed from metadata — a date badge, a reading time, a table of contents built ahead of time — is something a script writes ([below](#anything-else-derived-from-other-files)), and most sites need none.

- `layout: /path.html` in frontmatter is for the exception: one page under `notes/` that should use another layout. A whole folder needs only its `_layout.html`.
- Layouts do not chain, so `notes/_layout.html` is a complete page that repeats the site's chrome. Keep that chrome in includes — `_includes/nav.html` above — and the repetition is one line per layout. A layout that itself carries `data-layout` is a build error rather than a silently ignored attribute.
- A layout with no `<main>` and no slots is valid too: it contributes its `<head>` (a stylesheet, shared metas) and passes each page's body through as written.
- The first-heading title is applied while the page is composed. A generator's source inventory reads what you wrote, before that, so it reports `title: null` for `first.md` — [which file answers which question](integrations.md#source-facts-or-final-facts).

## A snippet that ships as written

Sometimes you want a bare piece of HTML at its own URL — a panel another site embeds, or
something a bit of JavaScript fetches after the page loads. A page cannot do that: every
page is a complete document. Name the file `*.fragment.html` instead:

```html
<!-- site/hours.fragment.html -->
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

An include can also carry content, when its target is a fragment that declares slots. The
content fills them exactly as a page fills a layout's: `slot="name"` on an element for a
named slot, everything else to the bare one, and an unfilled slot shows its own content.

```html
<!-- site/_includes/callout.fragment.html -->
<aside class="callout">
  <h3><slot name="title">Note</slot></h3>
  <slot></slot>
</aside>
```

```html
<include src="/_includes/callout.fragment.html">
  <span slot="title">Opening hours</span>
  <p>Saturday 10am–4pm</p>
</include>
```

builds to

```html
<aside class="callout">
  <h3><span>Opening hours</span></h3>
  <p>Saturday 10am–4pm</p>
</aside>
```

The callout's markup lives in one file and every use supplies its own words. The rules
stay small. Only a `*.fragment.html` with a `<slot>` can take content, and any other
non-empty include is a build error naming the fix; an empty include, like every one above,
has no such requirement. What fills the slots is markup you wrote: no attributes are passed,
there are no variables or expressions, and a fill reaches only the fragment it is written
inside, never one that fragment includes in turn. The complete rule is
[`conformance-spec.md`](conformance-spec.md) §32.

## Links and assets

- Write paths that are correct for the file you're editing — relative or root-relative, both work. unify resolves URLs written in layouts and fragments against the file that wrote them, so composed pages are correct at every depth.
- **Link the real file**: `href="about.html"` — for a Markdown page, its `.md` name or the `.html` it becomes — rather than a hand-written `/about/`. That link is right in every build: `--pretty-urls` moves pages to `about/index.html` and rewrites it, and `--base-url` prefixes it.
- Every non-page file in `site/` is copied through byte-for-byte to the same path. What you see in the folder is what ships — compress images before adding them.
- **Reference stylesheets and scripts directly**: `<link rel="stylesheet" href="/assets/style.css">` is all unify needs, and the file ships as written. Whether a browser fetches it again after you change it is decided by the cache headers your host sends, not by unify; if you want a version in the address anyway, [the cache-busting recipe](guides/generator-recipes.md#cache-busting-urls) adds one with a small generator.
- unify does not scope styles. If a fragment's CSS should not leak, use the platform: `@scope`, `@layer`, nesting, or a class prefix.

What a link written in `site/index.html` becomes in the built page:

| Source file | You write | Plain build | `--pretty-urls` | `--pretty-urls --base-url https://example.com/sub/` |
|---|---|---|---|---|
| `about.html` | `about.html` | `about.html` | `/about/` | `/sub/about/` |
| `guide.md` | `guide.md` or `guide.html` | `guide.html` | `/guide/` | `/sub/guide/` |
| `about.html` | `about.html?form=1#top` | `about.html?form=1#top` | `/about/?form=1#top` | `/sub/about/?form=1#top` |
| `guides/index.html` | `/guides/` | `/guides/` | `/guides/` | `/sub/guides/` |
| `guide.md` | `/guide/` | a broken link: the build fails | `/guide/` | `/sub/guide/` |
| `404.html` | `/404.html` | `/404.html` | `/404.html` | `/sub/404.html` |

The pages land at `dist/about.html` and `dist/guide.html` in a plain build, and at `dist/about/index.html` and `dist/guide/index.html` under `--pretty-urls` — except `404.html`, which never moves, because hosts look for it at exactly that path. A query and a fragment ride along unchanged. A directory link you write yourself, like the `/guide/` row, names an address rather than a file: it builds when the output has a `guide/index.html` — one you wrote, or one `--pretty-urls` made from `guide.md` — and stops any other build with an error naming the link. That is why the source filename is the advice: it is the one spelling that is right in both builds.

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

It reports the things a build has no business refusing over: a page with no description, two pages sharing a title, a heading and a `<title>` that disagree, a link to `#section` where nothing has that id, a page nothing links to. Each one prints what was seen and one thing to do about it. There is no score and nothing counts characters — a short title is not a problem, an absent one is. `unify audit` exits non-zero on a finding that is wrong whatever you meant (a link to an id nothing has, a duplicated id), and `unify audit --strict` on any finding, which is the CI gate; plain `unify build` never runs these checks at all, so none of them can hold up a release. A fresh scaffold reports nothing: `unify init && unify audit --strict` exits `0` for every starter template, so you can wire the gate up on day one and the first finding you see will be about a page you wrote.

Two more `audit`-only flags, for wiring it into other tools: `--format json` (or `--format sarif`) prints the same findings as one machine-readable document instead of prose — the same `pages` records every other feature reads, plus a stable `fingerprint` per finding a CI system can use to suppress one it has already triaged. `--external` fetches every off-origin URL the site's output declares (a share image, a canonical to another site, a plain link) and reports the ones that don't answer — the only thing in unify that touches the network, and only when you ask for it; plain `build`/`audit` stay offline.

Deploying under a subpath (GitHub Pages project sites)? Give `--base-url` the site's whole address: `unify build --pretty-urls --base-url https://you.github.io/repo-name/`. The path part prefixes every root-relative link; the domain absolutizes `og:` and canonical URLs, which is what Facebook, LinkedIn and Slack fetch when someone shares a page. A bare `/repo-name/` is rejected — it would prefix the links and leave the share metadata unfetchable.

### Seeing what the build did

Each of these answers a different question, and none of them writes anything to `dist/`:

- **`unify build --dry-run`** — what would be written, copied and deleted, each page with the layout it composed from and the address it answers to. No server needed.
- **`http://localhost:3000/_unify/`**, while `unify dev` runs — the findings `unify audit` prints, as a page, grouped by page, with each page's record beside them (title, description, language, canonical, headings, links in and out) and the build's own diagnostics underneath: the place to check that a page's metadata landed.
- **`/_unify/preview/`** (the second address `unify dev` prints) — every layout, include and page. Open a layout or an include on its own, rendered with the site's styles and its own default content, with a corner selector to compose it with a page of your choice.
- **`/_unify/pages.json`** — the same build as data, for an editor or a script: every page's source file, layout, includes and address.

## Feeds, a catalog, and a search corpus

Declare what a page *is* and unify writes its feed entry for you — no script, no `posts/` convention:

```html
<meta name="schema" content="BlogPosting">
<meta name="date" content="2026-01-02T09:00:00Z">
```

(Markdown frontmatter: `schema: BlogPosting` and `date: 2026-01-02T09:00:00Z`.) Build with `--base-url`, and every page anywhere on the site declaring `Article` or `BlogPosting` — indexable, not consolidated elsewhere by its own canonical, and dated with a real instant — becomes an entry in `feed.xml` (Atom, at the output root). **The date needs a time, not just a day**: `date: 2026-01-02` alone names a calendar day, and unify will not invent a time to fill the gap — midnight UTC is the wrong publication date for every reader west of Greenwich. It reports the page as excluded instead of guessing:

```
site/posts/hello.md: advisory: date is "2026-01-02", which names a day rather than an instant — this page is not in feed.xml
  fix: write date: 2026-01-02T09:00:00Z — a feed entry's timestamp needs a time and a time zone
```

Want each entry's full rendered content in the feed, not just a summary? Add `--feed-full`. Want to write the feed yourself instead — RSS, extra fields, a generator script — just ship your own `site/feed.xml`: an authored file always wins, and unify generates nothing (`unify init blog`'s own feed is exactly this, and it still builds and audits clean).

`--catalog` writes `assets/unify/catalog.json`: a compact, HTML-shaped record of every public page — its head data, root attributes, and heading outline, no body text — for a blog list, a tag facet, or a page chooser to read instead of re-parsing your site. `--search-corpus` writes `assets/unify/search-corpus.json`: just each page's `path` and its normalized visible text, for a client-side search library to index however it likes. The two are independent flags — pass one, the other, or both for a full search UI — and each works with or without `--base-url` (`path` root-relative locally, `url` absolute once you give it an address). A search hit only carries `path` and `text`; look the rest up by joining it against the catalog's own `path`. An authored `src/assets/unify/catalog.json` or `src/assets/unify/search-corpus.json` overrides the matching file the same way a feed does. See [`guides/catalog-and-search.md`](guides/catalog-and-search.md) for a worked blog listing and search UI built on both files.

## Anything else derived from other files

A blog index, a gallery page — anything else computed from a set of files — is a script you own, which unify runs before every build once `unify.yaml` names it:

```yaml
# unify.yaml
generate: scripts/gen.mjs
```

The script lives in `scripts/` beside the site and writes real pages into a directory unify hands it for that one build (never into `site/`), where they get layouts, head merging, and reference checking like everything else (`unify init blog` ships a working example: `scripts/gen.mjs` at the project root, the line in `unify.yaml`, and the data file in the site). The script does not have to read your pages itself: unify hands it the source inventory, every page's authored title, description, date and `<meta>` records, and [the integrations guide](integrations.md#an-index-of-your-pages-in-one-build) builds an index from it in one build. One habit matters the day the script reads a data file: **name the fields you emit — never spread the whole record**. The underscore keeps `_data/` itself out of `dist/`, but no build check can catch a private field once your script copies it into a page. unify itself has no collections, no data files, and no template language — that's the point.

## Where to go next

- [`authoring-rules.md`](authoring-rules.md) — every authoring rule on one screen
- [`templates.md`](templates.md) — starting from a template, taking its later versions with `unify update`, and publishing one
- [`cli-reference.md`](cli-reference.md) — every command and flag
- [`product-spec.md`](product-spec.md) — the product contract, including what unify refuses to do and why
- [`conformance-spec.md`](conformance-spec.md) — the exact composition rules, for implementers and the curious
- [`integrations.md`](integrations.md) — putting a Svelte component (or anything else with a compiler) on one page
- [`../examples/README.md`](../examples/README.md) — eight complete sites, and the pattern each one shows
