# Working on this site

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

## Adding pages and a theme: copy an example

- `site/_examples/` holds a copy-ready version of each kind of file this template expects you to
  add — a page, a post, a data file. **Copy one into place and edit the copy.** Never edit an
  example where it is, and never link to one: the folder starts with `_`, so nothing in it ships.
- Each example says where its copy belongs (`site/contact.html`, `site/posts/<slug>.md`). Once it
  is in place, link the new page from `site/_includes/nav.html` or from another page — `unify audit`
  reports a page nothing links to.
- `site/_examples/theme.html` is the template's look: the custom properties its stylesheet reads, in
  a `<style>` block. Copy it to `site/_includes/theme.html` and change the values: the layout and the
  404 page include that path, and the site's file is found ahead of the template's `_includes/theme.html`
  beside this one, so nothing in the template's stylesheet or layout is edited.
- `unify update` fetches this template again and copies its changed files over this project after
  listing them and asking. It never visits a file the template does not ship, so your copies are
  yours for good; the examples and the tooling (`_layout.html`, `_includes/`, `assets/style.css`,
  `scripts/`) take the template's new version when you say yes.

## Composition

- Every page is wrapped by the nearest `_layout.html` — its own folder, then each parent. Choose a
  different one with `data-layout="/path.html"` on the page's `<html>` or `<body>` (Markdown:
  `layout: /path.html`); opt out with `data-layout="none"`. Layouts are **paths ending in .html** —
  a bare name like `default` is an error — and they do not chain: `data-layout` on a layout is an
  error, because a section layout is a complete standalone page.
- `<include src="/_includes/nav.html"></include>` splices a file in verbatim, always with the
  closing tag. **Never put content between the tags**: an include is not a component, takes no
  props, and merges no attributes.
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
