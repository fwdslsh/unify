# unify CLI reference

**Matches unify v0.7.0.** This page lists every command, every option, and every exit code — there are no others. The behavior behind each is specified in [`product-spec.md`](product-spec.md) §4 and, rule by rule, in [`conformance-spec.md`](conformance-spec.md).

```
unify [build]              build the site (default command)
unify dev                  build, watch, serve, and reload — the inner loop
unify watch                build + rebuild on change, no server (pair with your own)
unify init [template]      scaffold a starter site

Options:
  -s, --source <dir>       source directory (default: src/ if it exists, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --exclude <glob>     globs never emitted, still usable by the build (repeatable; default: _*)
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --base-url <url>     the deploy address (https://site.example/repo/, or just /repo/): prefix root-relative links; only the full form makes og:/canonical absolute for crawlers
      --dry-run            run the full build and every check, print the report, write nothing
      --strict             advisories count as problems for the exit code
  -p, --port <n>           port for `unify dev` (default: 3000)
  -v, --version            print version
  -h, --help               print help
```

## Commands

### `unify build` (the default — `unify` alone does the same)

Builds the site, all-or-nothing: composition and every check run into a temporary tree, and the output directory is updated only if there were **zero problems**. A build that reports problems exits `1` and leaves the previous output byte-for-byte untouched. After composing, every internal reference in the output is checked against the emitted files; a URL that resolves to nothing is a problem like any other.

### `unify dev`

Build + watch + a static server on `localhost:<port>` (default 3000) serving the output directory, with live reload on every rebuild. The server is deliberately minimal and permanently so: static files, directory indexes, a 404 page, reload. No proxying, HTTPS, middleware, or config. The reload script is injected only into pages `dev` serves — it never exists in the output directory. While watching, a page that fails to build is served as an error page carrying the located diagnostics, replaced by the next successful rebuild.

### `unify watch`

The same watch contract as `dev`, no server — for pairing with a server you already run. Saves are coalesced into one full rebuild (a save landing mid-rebuild queues exactly one follow-up); writes are atomic and minimal (unchanged files are not rewritten, deletions are precise), so external tools can consume the output directory safely.

### `unify init [template]`

Scaffolds a starter site into `src/`. Templates: `default`, `basic`, `blog`, `docs`, `portfolio`. Every template exercises each primitive once — an include, the automatic `_layout.html`, a named slot with a page that fills it, a `data-layout="none"` page, and the underscore convention. The `blog` template also ships `_scripts/gen-blog.mjs`, the ~40-line generator that writes `blog.html` and `feed.xml` into the source tree. `init` never creates `unify.yaml`. Guaranteed: `unify init && unify build --dry-run --strict` exits `0`.

## Options

### `-s, --source <dir>` / `-o, --output <dir>`

Source root and output directory. Pages (`.html`, `.md`) are processed; **every other file mirror-copies byte-for-byte** to the same relative path. Independent of everything else, these never ship: the output directory, `.git/`/`.hg/`/`.svn/`, `node_modules/`, `.env` and `.env.*`, and `unify.yaml`. Dotfiles ship (`.htaccess`, `.nojekyll` are deploy files). When no `--source` is given and no `src/` exists — a directory `init` did not scaffold — the build summary reports how many files it is copying and points at `--dry-run`; passing `--source` yourself (even `.`) turns that notice off.

### `--clean`

Empties the output directory before building. Refuses to run (exit `2`) when the output directory is, contains, or is contained by the source root or the working directory — `-o . --clean` is an error, not a deleted project. Under `watch`/`dev` it applies only at startup.

### `--exclude <glob>` (repeatable)

Globs whose matches are never emitted but remain build material (includable, usable as layouts). Default: `_*`. A glob without `/` matches any path segment, so the single default covers `_layout.html`, `_includes/`, `_scripts/`, and `blog/_draft.md`; a glob with `/` matches the source-root-relative path (`drafts/**`).

Your globs **replace** the default — keep `_*` in your list if you still want it: `--exclude '_*' --exclude 'drafts/**'`. Replacing it cannot silently publish the build's working files: an emitted `_`-prefixed page, or a path containing a `_`-prefixed directory, is a problem naming the fix. Root-level non-page files like `_headers` and `_redirects` are deliberately outside that guard — to ship them on Netlify, replace the default with globs that spare them (until you do, holding a known deployment file back is an advisory naming this exact recipe, so the miss is never silent):

```bash
unify build --exclude '_*.html' --exclude '_*.md' --exclude '_includes' --exclude '_scripts'
```

### `--pretty-urls`

Moves every page `X.html` to `X/index.html` — except `index.html` files (already pretty) and the root `404.html` (hosts require that exact path) — and rewrites every internal link to match (`/about.html` → `/about/`, queries and fragments preserved; links to assets and external URLs untouched). Relative asset references inside moved pages are re-emitted root-relative so they keep working. Author pages always link the real file (`about.html`); this flag owns the pretty form.

### `--base-url <path | url>`

For sites served from a subpath. `--base-url /repo-name/` prefixes every root-relative URL in the built HTML — `href`, `src`, `srcset`, `poster`, and `og:`/`twitter:` meta values; source files stay rooted at `/` so local preview keeps working. With a full URL (`--base-url https://example.com/repo/`), root-relative `og:`/`twitter:`/`rel="canonical"` values — which crawlers require to be absolute — are absolutized against the whole base, origin **and** subpath: `/assets/x.jpg` becomes `https://example.com/repo/assets/x.jpg`.

### `--dry-run`

The entire build — composition, URL rewriting, collision detection, the reference check, every problem and advisory — with no writes. Stdout lists what would be written, copied, and deleted, each page naming what it composed from:

```
write dist/about/index.html ← about.md + _layout.html
write dist/blog/post/index.html ← blog/post.html + blog/_layout.html
write dist/404.html ← 404.html (no layout)
copy dist/assets/style.css ← assets/style.css
delete dist/stale.html
```

### `--strict`

Advisories affect the exit code (non-zero) — never what is published. `unify build --dry-run --strict` is the one-line CI lint.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | The site was published (with `--dry-run`: would have been). |
| `1` | Problems found — nothing was published, the previous output is untouched. Under `--strict`, advisories alone also exit `1`. |
| `2` | Invalid usage or fatal environment error (unknown flag, missing source directory, the `--clean` refusal, port in use). |

## Diagnostics

Two severities exist: `problem` and `advisory` — no other words, no rule codes. Diagnostics go to stderr; the summary and `--dry-run` list go to stdout; both are ordered by path then line. Every line starts with a stable prefix:

```
src/index.html:8: problem: include not found: /_includes/navv.html
  in: <include src="/_includes/navv.html">
  fix: create src/_includes/navv.html, or point src at an existing file
  fix: check the path spelling and casing
```

Cycle and depth errors print the full chain (`_layout.html → _includes/nav.html → _layout.html`). Set `DEBUG=1` for stack traces — the only environment variable unify reads.

## `unify.yaml`

Optional, at the source root: saved flags, nothing more. Keys are the long option names (`source`, `output`, `clean`, `exclude` — a list, `pretty-urls`, `base-url`, `strict`, `port`); CLI flags win on conflict. No behavior exists that only the file can express; the file itself never ships.

```yaml
# unify.yaml — the committed invocation
output: dist
pretty-urls: true
base-url: https://example.com/
```
