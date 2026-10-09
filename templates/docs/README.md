# Working on this site

This site was scaffolded from unify's **`docs`** template — a documentation site, with a catalog-driven directory of every page. `unify init docs` scaffolds it from the copy built into the CLI, `unify init unify-docs-template` from npm (where this file is the package's README), and `unify update` fetches it again later.

This site is built by [unify](https://github.com/fwdslsh/unify): plain HTML composed at build time.
No template language, no variables, no loops, no config — if you reach for `{{ }}`, `{% %}`, props,
or a config key, the answer here is a different shape.

Below are the rules that get guessed wrong most often. They are the same rules unify's own
documentation states — one rule set, three audiences — not a variant for agents. The
inner loop is `unify dev` (build, watch, serve on localhost, reload), which also serves
`http://localhost:3000/_unify/` — every `unify audit` finding grouped by page, with that page's
title, description, language, canonical, headings and links beside it, and the build's own
diagnostics underneath — and `/_unify/preview/`, which lists every layout, include and page and
opens any layout or include on its own, composed with a page you pick. Every page `dev` serves
carries a small corner overlay naming its source file and linking its layout and includes
(`?chrome=off` hides it). Nothing about any of this is written to `dist/`. `unify --help` lists
every command and flag there is.

## Finish by checking, and read the exit code

    unify build --audit --strict      # the whole build, every check and the audit; publishes only if all of it passes
    unify build --dry-run --strict    # the build and its checks, writing nothing
    unify audit --strict              # the findings alone, on the site the build would publish; writes nothing

Exit 0 from `unify build` means `dist/` is the complete site. Non-zero means **nothing was
published** and the previous `dist/` is untouched — never report success on a non-zero exit.

## Files

- The source root is `site/`. **Everything in it ships**, at the same path: `.html` and `.md` are
  pages, and every other file is copied byte-for-byte.
- A leading underscore keeps a file or a whole directory out of the output — `_layout.html`,
  `_includes/`, `_drafts/`. The build still reads it; `dist/` never contains it. Files inside a
  `_` directory need no prefix of their own.
- To hold a page back, prefix its name with `_`. `draft:` in frontmatter is an **error** — unify
  has no draft mechanism, so a page carrying it would publish; the build says so and stops.
- To change a page's address, rename or move the source file. `permalink:` and `slug:` are
  **errors** for the same reason: a page's address is its source path, and a key that quietly
  changed nothing would look like it worked.
- `tags:` and `categories:` are allowed and become ordinary `<meta>` tags, but they build
  nothing — there are no collections and no taxonomies, and unify reports nothing about them —
  they are inert by design, meaningful only to a consumer that chooses to interpret them.
- Link the real file: `/about.html`, never `/about/`. A directory link resolves only if you wrote
  `about/index.html`. A leading `/` means the source root, in any path you write.
- Derived files — a post index — come from a script you write, kept in `scripts/` beside the
  site and named in `unify.yaml` (`generate: scripts/gen.mjs`): unify runs it before every build,
  dev rebuild and audit, and it writes into the directory unify hands it, never into `site/`.
  A feed is the one exception: declare `schema: Article`/`BlogPosting` (below) and build with
  `--base-url`, and unify writes `feed.xml` itself — no script, unless you ship your own
  (an authored `feed.xml` always wins and generates nothing).

## Adding pages and changing the look

- `site/_examples/` holds a copy-ready version of each kind of file this template expects you to
  add — a guide page and a contact page. **Copy one into place and edit the copy.** Never edit an
  example where it is, and never link to one: the folder starts with `_`, so nothing in it ships.
- Each example says where its copy belongs (`site/contact.html`, `site/guide/<slug>.md`). Once it
  is in place, link the new page from `site/_includes/nav.html` or from another page — `unify audit`
  reports a page nothing links to.
- `site/assets/theme.css` is the look: the custom properties the stylesheet reads, each at the template's
  default. Edit the values. `unify.yaml` names it under `keep:` in its `template:` block — the files
  `unify update` never overwrites once they exist — beside `unify.yaml` itself; add any other file you
  customize, such as `site/_includes/nav.html` or `site/index.html`, to that list.
- `unify update` fetches this template again and copies its changed files over this project after
  listing them and asking. It never visits a file the template does not ship, so your copies are
  yours for good; the examples and the tooling (`_layout.html`, `_includes/`, `assets/style.css`,
  `scripts/`) take the template's new version when you say yes.

## This template: what names the site, the fonts, and importing docs

**Four small files hold everything that names the site**, and the layout includes each of them:
`site/_includes/head.html` (the title suffix, description, `og:site_name` and icon),
`site/_includes/nav.html` (the masthead: wordmark and links), `site/_includes/docnav.html` (the
sidebar) and `site/_includes/footer.html` (the byline, which a page can replace by filling the
`footer` slot). The layout, the stylesheet and the All-pages directory are the template's.

**The fonts.** `site/assets/theme.css` names Inter, JetBrains Mono and Protest Revolution, each
falling back to a system font, so a fresh site loads nothing from a third party. To load them, add
these three lines to `site/_includes/head.html`:

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;600&family=Protest+Revolution&display=swap">

A page without the sidebar puts `class="wide"` on its `<body>` for one column at the site's width,
or `class="home"` for a front page of full-bleed sections (`<section class="home-section"><div
class="inner">`); the stylesheet's `.hero`, `.cta-row`, `.card-grid`/`.card`, `.badge`, `.term` and
`.btn-primary`/`.btn-secondary` classes are there to build one.

**The theme.** This is the look every fwdslsh.dev site shares, and `site/assets/theme.css` lists every
property it reads, grouped: the palette (surfaces, text, the green `--accent` for links and titles, the
blue `--accent-2` for code and badges, the page's `--glow` and `--grid-lines`), the type (`--sans`,
`--mono`, `--display`, with `--h1-font` and `--heading-font` choosing among them, `--text-size`,
`--leading`), the layout (`--site`, `--gutter`, `--measure` for prose, `--measure-wide` for code and
tables, `--sidebar`, `--head-h`) and the shape (`--radius-sm`/`--radius`/`--radius-lg`, `--dur`).
Change a value there and every page follows; delete a line and the default comes back.

**Code blocks.** `site/assets/code.js`, which the layout loads, gives every fenced block a copy button and
syntax colours, from the vendored [speed-highlight](https://github.com/speed-highlight/core) (public domain, CC0, its two files in
`site/assets/vendor/`); the colours are the `--syn-*` properties in `theme.css`. A page reads the same
without the script, and a `<pre>` written by hand without `<code>` inside, such as a `.term-body`, is left
alone.

**Building on this template instead of copying it.** A project that should own none of these files
names the template in its own `unify.yaml` — `extends: unify-docs-template@<version>` — and keeps
only what is its own: the four files above, `assets/theme.css`, and its pages. Each of its files
replaces the template's at the same path (unify's `extends`, spec §34). A project whose generator
imports `scripts/import-docs.mjs` installs the template instead (`npm install -D unify-docs-template`)
and says `extends: node_modules/unify-docs-template`, so the build and the import read the same copy.

**Publishing a docs/ folder.** `scripts/import-docs.mjs` brings a repository's folder of Markdown
into the build at every run, so the site cannot drift from the documents: each one is copied to
`docs/<its path>`, a missing `title:` or `description:` is filled in from its first heading and
paragraph, and a link that leaves the folder goes to the same file on GitHub. Call it from your
generator, the script `unify.yaml` names under `generate:`:

    // scripts/gen.mjs
    import { importDocs } from "./import-docs.mjs";   // from "unify-docs-template/scripts/import-docs.mjs" when you extend the template
    const [, , , overlay] = process.argv;
    importDocs({
      from: new URL("../docs/", import.meta.url),      // the folder to publish
      into: overlay,
      github: "https://github.com/you/project/blob/main/docs",
    });

## Composition

- Every page is wrapped by the nearest `_layout.html` — its own folder, then each parent. Choose a
  different one with `data-layout="/path.html"` on the page's `<html>` or `<body>` (Markdown:
  `layout: /path.html`); opt out with `data-layout="none"`. Layouts are **paths ending in .html** —
  a bare name like `default` is an error — and they do not chain: `data-layout` on a layout is an
  error, because a section layout is a complete standalone page.
- `<include src="/_includes/nav.html"></include>` splices a file in verbatim, always with the
  closing tag. Empty, it splices the file in verbatim; content between the tags fills the slots of
  a `*.fragment.html` that declares them, exactly as a page fills a layout's. An include is still
  not a component: it takes no props and merges no attributes.
- The layout's bare `<slot></slot>` — usually inside its `<main>` — receives everything the page
  did not address elsewhere. A `<main>` you wrote is unwrapped and its children used, so write
  complete semantic documents.
- A named slot `<slot name="footer">fallback</slot>` is filled by `slot="footer"` on a real
  element of the page, which replaces the slot tag and all. A `<slot>` tag written in a *page*
  fills nothing. Fills count on direct children of `<body>` (or of your `<main>`, unwrapped
  first). Omit the fill and the fallback ships.
- Heads merge: the layout's is the base, your `<title>` is joined in front of the layout's
  (the separator lives in the layout — `<title>— My Site</title>`, and a page writes just
  `<title>About</title>`), your `<meta>` replaces the layout's with the same `name`/`property`,
  and everything else appends. On `<html>`/`<body>` your classes are added and any other attribute
  you set wins; attributes merge nowhere else.

## Metadata, without inventing anything

- Give every page its own `<title>` and `<meta name="description">`, different from every other
  page's, and one `<h1>`. `unify audit` reports each of
  those gaps, plus pages nothing links to, duplicate ids, and fragment links that name nothing.
- `--base-url` is the site's **whole public address** — `https://you.example/handbook/`, never a
  bare path. It prefixes root-relative links, makes `og:` and canonical URLs absolute for share
  crawlers, and generates `sitemap.xml`. See `DEPLOY.md`.
- A canonical is one page's own address, so a layout must never set one and a scaffold cannot know
  it. Build with `--base-url` (completion is on by default), or write it on that one page by hand.
- `<meta name="schema" content="WebPage">` — or `schema: Article` in Markdown frontmatter; those
  three spellings exactly, `WebPage`, `Article`, `BlogPosting` — has unify write that page's
  JSON-LD from what the page already declares: title, description, canonical, `og:image`,
  `author`, `date`, `lastmod`, `lang`. Nothing else is added and **nothing is guessed** — a date
  it cannot read as `2026-01-02` or `2026-01-02T09:30:00Z` is left out and reported, never filled
  in from the clock, the filesystem, or Git. Write your own `<script type="application/ld+json">`
  for any other type or more detail: yours wins, and unify then generates nothing.
- unify rewrites only HTML's own URL attributes (`href`, `src`). A `url()` in CSS and a
  `fetch()`/`hx-get` address ship exactly as written.
- **Never invent a fact to fill a field.** The placeholders in this scaffold — the site name, the
  `example.com` mailbox, `site/assets/share-placeholder.png` — are there to be replaced, not published.
