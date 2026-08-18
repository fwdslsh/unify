# unify CLI reference

**Matches unify v0.7.0.** This page lists every command, every option, and every exit code — there are no others. The behavior behind each is specified in [`product-spec.md`](product-spec.md) §4 and, rule by rule, in [`conformance-spec.md`](conformance-spec.md).

```
unify [build]              build the site (default command)
unify dev                  build, watch, serve, and reload — the inner loop
unify watch                build + rebuild on change, no server
unify init [template]      scaffold a starter site

Options:
  -s, --source <dir>       source directory (default: src/ if it exists, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --exclude <glob>     globs never emitted, still usable by the build (repeatable; default: _*)
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --canonical auto     add a canonical link to pages that author none, from the site address
      --base-url <url>     the site's whole address (https://site.example/repo/): prefix root-relative links, make og:/canonical absolute for share crawlers, and generate sitemap.xml
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

Scaffolds a starter site into `src/`. Templates: `default`, `basic`, `blog`, `docs`, `portfolio`. Every template exercises the core primitives once — an include, the automatic `_layout.html`, a named slot with a page that fills it, a `data-layout="none"` page, and the underscore convention. The `blog` template also ships the generator pattern worked: `_scripts/gen.mjs` reads `posts/*.md` and `_data/authors.json` and regenerates `blog.html` and `feed.xml` (`node _scripts/gen.mjs && unify build`); both ship pre-generated, and the generator names the fields it emits, so the authors file's private `email` never reaches a page. `init` never creates `unify.yaml`. Guaranteed: `unify init && unify build --dry-run --strict` exits `0`.

## Options

### `-s, --source <dir>` / `-o, --output <dir>`

Source root and output directory. Pages (`.html`, `.md`) are processed; **every other file mirror-copies byte-for-byte** to the same relative path. Independent of everything else, these never ship: the output directory, `.git/`/`.hg/`/`.svn/`, `node_modules/`, `.env` and `.env.*`, and `unify.yaml`. Dotfiles ship (`.htaccess`, `.nojekyll` are deploy files). When no `--source` is given and no `src/` exists — a directory `init` did not scaffold — the build summary reports how many files it is copying and points at `--dry-run`; passing `--source` yourself (even `.`) turns that notice off.

### `--clean`

Empties the output directory before building. Refuses to run (exit `2`) when the output directory is, or contains, the source root or the working directory — `-o . --clean` is an error, not a deleted project. It does not refuse when the output merely sits inside them: `-s . -o dist` is fine. Under `watch`/`dev` it applies only at startup.

### `--exclude <glob>` (repeatable)

Globs whose matches are never emitted but remain build material (includable, usable as layouts). Default: `_*`. A glob without `/` matches any path segment, so the single default covers `_layout.html`, `_includes/`, `_scripts/`, and `blog/_draft.md`; a glob with `/` matches the source-root-relative path (`drafts/**`).

Your globs **replace** the default — keep `_*` in your list if you still want it: `--exclude '_*' --exclude 'drafts/**'`. Replacing it cannot silently publish the build's working files: an emitted `_`-prefixed page, or a path containing a `_`-prefixed directory, is a problem naming the fix. Root-level non-page files like `_headers` and `_redirects` are deliberately outside that guard — to ship them on Netlify, replace the default with globs that spare them (until you do, holding a known deployment file back is an advisory naming this exact recipe, so the miss is never silent):

```bash
unify build --exclude '_*.html' --exclude '_*.md' --exclude '_includes' --exclude '_scripts'
```

### `--pretty-urls`

Moves every page `X.html` to `X/index.html` — except `index.html` files (already pretty) and the root `404.html` (hosts require that exact path) — and rewrites every internal link to match (`/about.html` → `/about/`, queries and fragments preserved; links to assets and external URLs untouched). Relative asset references inside moved pages are re-emitted root-relative so they keep working. Author pages always link the real file (`about.html`); this flag owns the pretty form.

### `--base-url <url>`

The address the site will be served from, scheme and domain included: `--base-url https://example.com/repo/`. Its path part prefixes every root-relative URL in the built HTML — `href`, `src`, `srcset`, `poster`, and `og:`/`twitter:` meta values; source files stay rooted at `/` so local preview keeps working. Its origin additionally absolutizes root-relative `og:`/`twitter:`/`rel="canonical"` values, which crawlers require to be absolute: `/assets/x.jpg` becomes `https://example.com/repo/assets/x.jpg` — origin **and** subpath, so the URL points where the file is actually served.

**Upgrading from v0.7:** a file whose name needs escaping in a URL — a space, `&`, a non-ASCII letter — is now addressed by its percent-encoded form everywhere unify names it: in the `--dry-run` report, in `sitemap.xml`, and in links unify itself rewrites. A link you wrote in the page that ships it is left exactly as you wrote it, and both spellings resolve, so ordinary sites are unaffected. Two cases do change. A link reached through an include or a layout, or on a page `--pretty-urls` moved, is re-rooted by unify and comes out canonically encoded — `../assets/my logo.png` in a shared nav emits `/assets/my%20logo.png`, a legal URL where before it was not. And a file whose name contains a literal `%` changes address: `a%20b.css` on disk is now `/a%2520b.css`, because `%20` in a URL has always meant a space rather than those three characters. If you have such a file and link to it as `/a%20b.css`, that link now correctly reports as broken — rename the file, or write the doubly-encoded form.

Knowing the address is also what lets unify write the site's `sitemap.xml`, so `--base-url` is the whole opt-in — there is no second flag. The generated file lists every page that is indexable, is not `404.html`, and is not consolidated elsewhere by its own `rel="canonical"`; URLs are the same absolute ones the `--dry-run` report shows. A `<lastmod>` appears only where the page authored a real date (`<meta property="article:modified_time">`, or `lastmod:` in Markdown frontmatter) — unify never dates a page from the build clock, the filesystem, the filename, or Git history. If your source tree already contains a `sitemap.xml`, that file is the site's sitemap: unify ships it untouched and generates nothing.

A bare path (`--base-url /repo-name/`) is a usage error naming the full form. It used to be accepted, and prefixed links correctly while leaving `og:`/`canonical` root-relative — valid-looking metadata no share crawler can fetch. Give the whole address; for a local preview of a subpath site, `http://localhost:3000/repo-name/` is one.

### `robots.txt`

If your source tree has a `robots.txt` at its root, it ships exactly as written — unify never generates one, never rewrites one, and never decides what you should block. With `--base-url` set, one thing in it is checked: a `Sitemap:` line is a promise that a crawler can fetch that URL, so a value naming a file your site does not build is reported like any other broken reference. A `Sitemap:` on another host is left alone, because verifying it would need the network and a build never uses it.

Nothing else is checked, on purpose. `Disallow: /admin/` on a site with no `/admin/` is defensive and correct. A line unify cannot parse, and a field it does not recognise, are both required to be ignored by the Robots Exclusion Protocol — failing your build over one would contradict the standard. And not declaring a sitemap is your choice, even when unify generated one.

### `--canonical auto`

Adds `<link rel="canonical" href="…">` to every page that does not author one, using that page's own final public URL — the same address the `--dry-run` report prints and the sitemap lists. `auto` is the only accepted value, and the option needs `--base-url`: a canonical has to be absolute, so without the site's address there is nothing truthful to write.

**A canonical you wrote always wins**, in every shape: one that names another page, several on one page, even one that names a file the site does not build (that last is reported as a broken reference, as it would be anywhere else). Completion fills a gap; it never overrules a value you chose.

Pages that are `noindex`, that are `404.html`, or whose own canonical points elsewhere are skipped — the same set the sitemap lists. Stamping a canonical on a page you told crawlers to drop would create a contradiction rather than resolve one.

Nothing else about the page changes: the element lands immediately before `</head>` at that tag's indentation, and every other byte is what it was.

### `--dry-run`

The entire build — composition, URL rewriting, collision detection, the reference check, every problem and advisory — with no writes. Stdout lists what would be written, copied, and deleted, each page naming what it composed from:

```
serving from https://example.com/repo/
write dist/about/index.html (/repo/about/) ← about.md + _layout.html
write dist/blog/post/index.html (/repo/blog/post/) ← blog/post.html + blog/_layout.html
write dist/404.html (/repo/404.html) ← 404.html (no layout)
copy dist/assets/style.css (/repo/assets/style.css) ← assets/style.css
delete dist/stale.html
```

The first line is the address the build assumed — `serving from / — the domain root` when no `--base-url` is set. Each write/copy carries the URL that file answers to, so a site built for the wrong address shows it here rather than after deployment.

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
