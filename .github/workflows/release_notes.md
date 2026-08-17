## Upgrading from 0.6.x

v0.7.0 is a clean break from the 0.6 composition model. A 0.6 site must be updated before it will build: replace `data-unify` and `unify-*` area classes with `data-layout`, `<main>`, `<slot name>`, and `slot=`; replace the retired `serve` command with `dev`; and remove the retired `--minify` and `--fail-on` options. The build reports every retired composition spelling at its source location and names the v0.7 replacement—it never silently interprets 0.6 markup as something else.

## Usage

```bash
# Scaffold a starter site into src/
unify init

# Build, watch, serve, and reload — the inner loop
unify dev

# Build the site
unify build --source src --output dist

# Build with pretty URLs
unify build --source src --output dist --pretty-urls

# The one-line CI lint: the whole build and every check, writing nothing
unify build --dry-run --strict

# Rebuild on change, no server (pair with your own)
unify watch --source src --output dist
```

## Features

- **HTML-native composition**: no expression language, no client runtime — the output is the HTML and CSS you wrote
- **Includes**: `<include src="/_includes/nav.html"></include>`, plus the Apache SSI comment form for migrating SSI sites
- **Layouts**: the nearest `_layout.html` wraps every page automatically; `data-layout` to pick one or opt out
- **Slots**: `<slot name>` in layouts, `slot=` on page elements, `<main>` as the zero-vocabulary default
- **Fragments**: name a file `*.fragment.html` and it ships byte-for-byte — a bare snippet for `<include>`, embeds, or client-side fetch, never composed
- **Markdown**: equal citizen, with YAML frontmatter supplying the head and slug `id`s on every heading
- **Underscore exclusion**: `_draft.html` and `_includes/` are build material that never ships
- **Safe publishing**: builds are all-or-nothing — problems mean nothing is written and the previous output is untouched

## Documentation

For full documentation, visit the [project repository](https://github.com/fwdslsh/unify).
