# htmx-fragments

One fragment, used twice: spliced into a page at build time with `<include>`, and fetched at
runtime by htmx with `hx-get`.

`site/months/this.fragment.html` is both. `index.html` includes it, so the default month is
in the HTML before htmx loads (JavaScript off, crawlers). The "This month" and "Next month"
buttons then `hx-get` `months/this.fragment.html` and `months/next.fragment.html` and swap
them in. A `*.fragment.html` file is never composed; it ships byte-for-byte, which is what
htmx fetches. `hours.fragment.html` is the same idea: included into Visit, fetchable by anyone.

## Page-relative `hx-get`

unify rewrites `href` and `src`, never `hx-get`. A root-relative `hx-get` would miss any
`--base-url` subpath, so the values are relative to the page that holds them
(`months/this.fragment.html`). That only works while the pages that fetch them sit at the
same depth as their fragments' paths imply, so keep fetching pages flat (here: the root).

## Why no `--pretty-urls`

`--pretty-urls` moves `visit.html` to `visit/index.html`, one directory deeper, and a
page-relative `hx-get` would then resolve against the wrong directory. This example builds
with no flags at all, so there is no `unify.yaml`.

## Layout

`site/` is unify's default source root. The layout and the fragments link their assets
relative to their own file, so each previews on its own and unify rewrites the URLs per page.

```bash
cd examples/htmx-fragments
unify build            # or: bun ../../src/cli.js build
```
