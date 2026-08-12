# Authoring a unify site — the complete rules

unify composes plain HTML files at build time. No template language, no variables, no loops, no
config, no JavaScript: if you reach for `{{ }}`, `{% %}`, `<slot>`, or a config key, you are solving
it wrong. The product is four primitives — include, layout, area, underscore. Anything derived from a
set of files (a post index, a feed) is a zero-dependency script under `_scripts/` that emits real
files into the source tree, run first: `node _scripts/gen-blog.mjs && unify build`.

## Files
- Source root is `src/` if it exists, else the current directory. `.html`/`.md` are pages; every other
  file is copied byte-for-byte to the same path. Write `href`/`src`/`srcset` correct for the file you
  are editing — unify rewrites them for the composed page, so never hand-compute `../`.
- **Everything in the source root ships.** Anything that is not part of the site — notes, drafts,
  scratch, scripts — goes under a leading underscore (`_notes/`, `_draft.html`, `_scripts/`): the
  build still reads it, the output never contains it.
- Every file you write is valid standalone HTML — pages and layouts are complete `<!doctype html>`
  documents, fragments are balanced snippets. Never a partial page.

## Include — reuse a fragment
`<include src="/_includes/nav.html"></include>`, always with the closing tag; `/…` resolves from the
source root, anything else relative to the including file. Works anywhere: `.md` pages, `<head>`,
inside other fragments.

## Layout — chrome around a page
Every page is wrapped by the nearest `_layout.html` — its own folder, then each parent; the page says
nothing. Pick another with `data-unify="/path.html"` on the page's `<html>` or `<body>` (Markdown:
`layout: /path.html`); opt out with `data-unify="none"` or `layout: none`. A bare name like `default`
is not a path, and `data-unify` means nothing anywhere but `<html>`/`<body>` — never a component import.

## Merging a page into its layout
- **Area.** A layout element with a `unify-*` class is a public area; list them with
  `grep -o 'unify-[a-z0-9-]*' src/_layout.html`. A page element with the same class replaces that
  area's **children** — the layout's tag, id and attributes stay, and attributes on your element are
  discarded. Omit an area and the layout's default stays.
- **Default slot.** Everything else in your body replaces the children of the layout's `<main>`,
  except children carrying a `unify-*` class, which stay put; your content lands where the first
  replaced child was. Everything else the layout put in `<main>` is placeholder and is deleted —
  wrappers you want on every page go outside `<main>`, or carry a `unify-*` class. Your own `<main>`
  is unwrapped, so a page may be a complete semantic document. A bare `<header>`/`<footer>` does
  **not** override the layout's; only a matching `unify-*` class does.
- **Head.** The layout owns `<head>` and declares `<meta charset>` — never write one in a page. Your
  `<meta>` replaces the layout's with the same `name`/`property`; every other head element of yours is
  appended after the layout's, so page CSS wins. `<title>`: yours joins the layout's with a space and
  **the layout carries the separator**, so layout `<title>— My Site</title>` + page `<title>About</title>`
  gives `About — My Site`. Write only the page's own name.
- **Root attributes.** On `<html>`/`<body>` only, your classes are added to the layout's and any other
  attribute you set wins; attributes merge nowhere else. `<body class="home">` plus
  `body.home .nav-home {…}` is how you do active nav.

## Markdown
`title`, `layout`, `class`, `lang`, `dir` are the only keys with meaning; there are no others. `date`,
`tags`, `draft`, `permalink`, `slug` do nothing and ship as `<meta>` tags — `draft: true` publishes the
page, so hold a page back with a leading underscore instead. Any other top-level key becomes
`<meta name=…>`, a nested `og:` block becomes `property=`. Headings get slug `id`s.

## Finishing
`unify build --dry-run --strict` is the whole build and every check, writing nothing: it reports every
problem in one pass and names the layout each page resolved to. Then `unify build` — exit 0 means
`dist/` is the complete site; non-zero means nothing was published and the previous `dist/` is intact.
Never report success on a non-zero exit. `--exclude` **replaces** the `_*` default; pass `_*` too.
