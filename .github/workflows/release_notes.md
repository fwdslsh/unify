## What v0.8.0 adds

The v0.7 composition model — `<include>`, layouts, slots, the underscore, `.fragment.html` — is unchanged. v0.8.0 adds the production layer on top of it: once unify knows your site's address, it verifies and generates the standard artifacts around your pages.

- **`unify audit`** — evaluates the site the build would publish and writes nothing: missing descriptions, duplicate titles, broken fragment links, orphan pages, invalid JSON-LD, share images without dimensions. Findings never block `build`; `audit --strict` is the CI gate. `--format json` / `--format sarif` emit the same findings machine-readably, each with a stable fingerprint CI can suppress; `--external` (the only network operation in the product, opt-in) checks off-origin URLs.
- **Discovery files from `--base-url`** — `sitemap.xml` and an Atom `feed.xml` (pages declaring `schema: Article`/`BlogPosting` with a full timestamp become entries; `--feed-full` includes rendered content). `--search-index` writes `search-index.json` for client-side search. An authored file always wins: ship your own `feed.xml`/`sitemap.xml`/`search-index.json`/`robots.txt` and unify generates nothing.
- **`--canonical auto`** — completes a canonical link, from the final public URL, only on pages that author none.
- **`schema:` frontmatter** (`WebPage` | `Article` | `BlogPosting`) — writes bounded JSON-LD from what the page already declares. Nothing is guessed: no date ever comes from the build clock, the filesystem, or Git. Authored `<script type="application/ld+json">` always wins.
- **Slotted includes** — content inside `<include>` fills `<slot>` elements in a `*.fragment.html` target, the same `slot="name"`/fallback model layouts already use. No props, no expressions.
- **`--generate <path>`** — one author-owned JavaScript file runs before the scan; whatever it writes into the supplied directory joins the build as an overlay, checked and published like any source file. The standalone binary supplies the runtime — no Node required. There is no `--run "<shell>"`.
- **`/_unify/`** — `unify dev` serves the audit findings and each page's record as a local page. Never written to `dist/`.

Every option is saveable in `unify.yaml` except the per-run ones (`--dry-run`, `--format`, `--external`); CLI wins on conflict.

## Upgrading from 0.7.x

One breaking change, deliberate: **`draft:`, `permalink:`, and `slug:` frontmatter are now build errors** naming the unify mechanism — these keys silently imply other generators' behavior unify does not have. Hold a page back by renaming it with a leading underscore; change its address by moving the file. `tags:`/`categories:` still build, and `audit` notes that nothing is built from them.

Everything else is additive: a 0.7 site builds unchanged, and with no `--base-url` no new file is generated.

## Upgrading from 0.6.x

v0.7.0 was a clean break: `data-unify` and `unify-*` area classes became `data-layout`, `<main>`, `<slot name>`, and `slot=`; `serve` became `dev`; `--minify` and `--fail-on` were retired. The build reports every retired spelling at its source location and names the replacement.

## Usage

```bash
unify init                     # scaffold a starter site into src/
unify dev                      # build, watch, serve, reload — the inner loop
unify build --base-url https://your-site.example/   # + sitemap.xml, feed.xml
unify build --dry-run --strict # the one-line structural CI check
unify audit --strict           # the content/discovery CI gate; writes nothing
```

Binaries below are single-file executables — no runtime to install. Also on npm: `npm i -g @fwdslsh/unify`.
