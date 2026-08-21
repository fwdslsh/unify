# Authoring a unify site — the complete rules

unify composes plain HTML at build time. No template language, variables, loops, or config: if you reach for
`{{ }}`, `{% %}`, props, or a config key, you are solving it wrong. The vocabulary is standard HTML — `<main>`,
`<slot>`, `slot=` — plus `<include>` and `data-layout`. Derived files (a post index) come from a script you write and run yourself: `node _scripts/gen.mjs && unify build`. A feed at `/feed.xml` needs no script: declare `schema: Article` or `BlogPosting` (below) on any page and build with `--base-url`, and unify writes it — Atom, from your title/description/canonical/dates; a `date:` with no time is reported and left out rather than guessed at.

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
`<meta name=…>` with the value as written — except `draft`, `permalink` and `slug`, which are **errors** naming what unify does instead: a leading underscore holds a page back (`_post.md`), and a page's address is its source path, so rename or move the file. `tags`/`categories` are allowed but build nothing — no index, no archive, no feed, no route — and `unify audit` says so.
A key named `og:…` emits `property=` instead
(`og:image: /card.png`; two levels deep is an error). No `title:` → first `# Heading`; headings get slug `id`s. `schema: Article` (or `WebPage`, or `BlogPosting` — those three, spelled exactly; in HTML, `<meta name="schema" content="Article">` in the head, which a layout may carry for a whole section) writes the page's JSON-LD for you, from what the page already declares: its title, description, canonical, `og:image`, `author`, `date`, `lastmod`, and `lang`. Nothing else is added and nothing is guessed — a `date` unify cannot read as `2026-01-02` or `2026-01-02T09:30:00Z` is left out and reported, never filled in from the clock or the file. Write your own `<script type="application/ld+json">` for any other type, or for more detail: yours wins and unify then generates nothing. A canonical still has no frontmatter key — it is one page's own address, which a layout must never set (that stamps every page with the same URL), so write that page in HTML, use `--canonical auto`, or leave it off.

## Styles, scripts, finishing
unify never scopes, rewrites, or injects CSS/JS, and rewrites only HTML's own URL attributes (`href`, `src`) — a `url()` in CSS and a `fetch()`/`hx-get` address ship as written, so a root-relative one misses the `--base-url` prefix and 404s:
keep every `url()` in a stylesheet file and every fetched address relative to the page — or read it back from an `href` unify rewrote. Scope fragment styles yourself (`@scope`, `@layer`, a class prefix).
`unify build --dry-run --strict` is the whole build and every check, writing nothing: every problem in one pass,
and a list naming each page with the layout it resolved to. Then `unify build` — exit 0 means `dist/` is the complete
site; non-zero means nothing was published and `dist/` is untouched, so never report success on a non-zero exit. `--exclude` **replaces** the `_*` default; keep `_*` in your list.
