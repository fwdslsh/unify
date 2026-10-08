---
description: "Every unify command, option and exit code, and the unify.yaml keys that save them."
---

# unify CLI reference

This page lists every command, every option, and every exit code — there are no others. The behavior behind each is specified in [`product-spec.md`](product-spec.md) §4 and, rule by rule, in [`conformance-spec.md`](conformance-spec.md).

Everything below is the same under all three ways of running unify — the standalone binary, `node` (>= 22.12.0), and `bun` (>= 1.2.0). Same flags, same diagnostics, same exit codes, byte-identical output; nothing on this page is conditional on the runtime. Deno is not supported.

```
unify [build]              build the site (default command)
unify audit                evaluate the site the build would publish — writes nothing
unify dev                  build, watch, serve, and reload — the inner loop
unify watch                build + rebuild on change, no server
unify init [template]      scaffold a starter site from a built-in template, a directory, a git repository or an npm package
unify update [template]    fetch the recorded template again and copy its changed files over the project, after asking

Options:
  -s, --source <dir>       source directory (default: site/ if it exists, else src/, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --exclude <glob>     globs never emitted, still usable by the build (repeatable; default: _*)
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --canonical <mode>   auto (the default with --base-url) adds a canonical link to pages that author none; none switches it off
      --base-url <url>     the site's whole address (https://site.example/repo/): prefix root-relative links, make og:/canonical absolute for share crawlers, and generate sitemap.xml
      --feed-full          include each entry's full rendered content in feed.xml (needs --base-url)
      --catalog            write assets/unify/catalog.json — a browse/filter/TOC projection of every public page
      --search-corpus      write assets/unify/search-corpus.json — normalized page text for client-side search
      --include-noindex    list noindex pages in the catalog and search corpus (needs one of them)
      --generate <path>    run one JavaScript file before the build (relative to the source root, or absolute)
      --source-inventory   give that file source-pages.json: every source page's authored title, description, date, meta and links (on by default with --generate; source-inventory: false in unify.yaml turns it off)
      --extends <source>   build on a template without copying it (any form init takes): its layouts, includes, assets and pages sit beneath yours, and a file of yours at the same path or output path wins
      --dry-run            run the full build and every check, print the report, write nothing
      --audit              `build` only: audit the composed site before publishing; publish only if `unify audit` would exit 0
      --save-config        `build` only: write the saveable options given here into unify.yaml (after a good build)
      --strict             advisories count as problems for the exit code (with `audit`, findings too)
      --format <kind>      `audit` report shape: human (default), json, or sarif
      --external           `audit` only: fetch every off-origin URL the site emits and report the ones that don't resolve
  -p, --port <n>           port for `unify dev` (default: 3000)
  -v, --version            print version
  -h, --help               print help
```

## Commands

### `unify build` (the default — `unify` alone does the same)

Builds the site, all-or-nothing: composition and every check run into a temporary tree, and the output directory is updated only if there were **zero problems**. A build that reports problems exits `1` and leaves the previous output byte-for-byte untouched. After composing, every internal reference in the output is checked against the emitted files; a URL that resolves to nothing is a problem like any other.

### `unify audit`

Runs the whole build — the same one, not a cheaper approximation — and then reports on the site that build **would** publish. It writes nothing: no output directory is created, cleaned, or read, which is why `--clean` and `--dry-run` are refused rather than quietly ignored.

A finding is not a problem or an advisory. It answers a different question — *is this site complete?* rather than *is this build sound?* — and it has its own two words:

| | means |
|---|---|
| `broken` | the output contradicts itself, or the standard it claims to follow: a link to `#section` where no element has that id, an id declared twice, JSON-LD that does not parse, a page in the sitemap that tells crawlers not to index it. Wrong whatever was intended. |
| `incomplete` | something is absent or inconsistent that you may have chosen: no description, no `lang`, two pages sharing a title, a page nothing links to. |

```
$ unify audit
about.html: incomplete: the emitted <head> declares no <meta name="description"> [description-missing]
  fix: add a description describing this page; a layout-wide one repeats on every page
notes.html: broken: #install in guide.html names no element [fragment-missing]
  fix: add id="install" to the element it should reach, or correct the link
audit: 1 broken, 1 incomplete
```

Findings never block a build — `unify build` does not run any of these checks (unless you pass `--audit`), so a site full of them still publishes. `unify audit --strict` exits `1` on any finding, of either severity: that is the CI gate, and it is opt-in.

Worth knowing before you wire it up: **every `init` template passes `unify audit --strict` from the moment it is scaffolded.** `unify init <template> && unify audit --strict` exits `0` for all five, with no `--base-url` and nothing edited, and the conformance suite asserts it per template — so a finding on a fresh scaffold is a regression, and the first finding you see is about something you wrote. It was not always true: each template used to ship between seven and thirteen `incomplete` findings, mostly a missing `lang` or a page without its own description. They were real gaps, and the fix was the templates rather than the gate.

**What it will not tell you.** There is no score, no grade, no percentage, and no character count anywhere in the output. A short title is not a finding and a long description is not a finding; absence is checkable, length is opinion. "Duplicate" means *identical*, never "similar" — a similarity threshold is a number nobody can defend to the author whose two pages fell either side of it. A title and a heading agree when either contains the other, which is why the layout suffix in `About — Example Site` does not conflict with an `<h1>` of `About`.

A finding is also never raised for something the build already refuses to publish. A canonical or an `og:image` naming a file the site does not emit is a *problem* — it blocks the publish outright, which is stronger than reporting it.

`tags:` and `categories:` are allowed and become ordinary `<meta>` tags, but unify builds nothing from them — no index page, no archive, no feed of any term, no route — and `audit` reports nothing about them either: they are inert by design, meaningful only to a consumer that chooses to interpret them (a catalog consumer included), and unify never reserves an ordinary metadata name without cause. The keys that are *not* allowed do not reach this command at all: `draft`, `permalink`, and `slug` in Markdown frontmatter are build problems (`unify build --dry-run` reports them), because each one, believed, publishes or addresses the wrong page.

**`--format json` / `--format sarif`.** Replace the finding list above with one JSON document instead — `{schemaVersion, baseUrl, summary, pages, findings}`, where `pages` is the same per-page record every other feature reads and `findings` is the same list in the same order, machine-readable rather than printed. `--format sarif` is the identical findings, mapped field for field into SARIF 2.1.0 for editors and CI systems that already read it. Neither format changes what is checked or the exit code; `--format human` (the default) is unchanged. `problem`/`advisory` diagnostics still print to stderr as prose either way — a JSON consumer gets their counts in `summary`, never their text, so there is one diagnostic channel rather than two. Each finding carries a `fingerprint`: a stable hash of its id, its file, and the one detail that tells it apart from a sibling finding on the same page (which id repeated, which field conflicted) — deliberately *not* its line number or wording, so a CI suppression survives an unrelated edit above it and a reworded fix line.

**`--external`.** The one unify operation that touches the network, and the only place it can happen — plain `build`/`audit` stay offline always. Fetches every off-origin URL the site's own output declares (a share image, a canonical naming another site, a JSON-LD URL-valued property, an ordinary link) once each, `HEAD` falling back to `GET` on `405`, and reports the ones that fail, time out, or answer `4xx`/`5xx` as `external-unreachable` (`incomplete` — the fault may be the other server's, at this exact moment, and a build must never treat that as a self-contradiction). unify does not try to tell "the network is down" from "that one host is down": nothing can distinguish them without calling some third party unify would have had to choose, so every URL that does not resolve is reported as itself.

### `unify dev`

Build + watch + a static server on `localhost:<port>` (default 3000) serving the output directory, with live reload on every rebuild. The server is deliberately minimal and permanently so: static files, directory indexes, a 404 page, reload. No proxying, HTTPS, middleware, or config. The reload script is injected only into pages `dev` serves — it never exists in the output directory. While watching, a page that fails to build is served as an error page carrying the located diagnostics, replaced by the next successful rebuild.

**`/_unify/` — the local audit view.** `dev` answers one path that is not a file. `http://localhost:3000/_unify/` is a report of the build that just ran: the counts and address line, then every `unify audit` finding grouped by page, then every page's record — output path, public URL, title, description, language, canonical, heading outline, links in and out, whether it is indexable — and then the build's own problems and advisories. A page with nothing wrong is listed too, because "did my metadata land" is the other half of the question.

It is assembled in memory from the same manifest and the same finding list the command line reads, never a second reading of the site, so it cannot disagree with `unify audit`. **Nothing is written to `dist/`** and no script is added to a published page: a page fetched from `dist/` by a deploy or a `curl` is byte-identical whether or not `dev` ever ran, and `/_unify/` never appears in `--dry-run`. The reload stream that refreshes a page refreshes the report, so it follows every rebuild — including one that failed, whose diagnostics are how it tells you the site on disk is the previous build.

No flag turns it on, off, or moves it; `--port` is the only choice about the server. `/_unify` redirects to `/_unify/`, and every other path beneath it is a 404 — the reservation is a promise about who answers, not an invitation to guess sub-pages. It is HTML for a person, not an API.

**`/_unify/pages.json` — the page map.** The one machine-readable thing `dev` answers, for editors: one record per emitted page with its `source` file (relative to the source root; relative to the generator's overlay when `generated` is true), the `layout` it composed with (or `null`), the `includes` it reaches (every fragment that authored a byte of it, through the layout too), its `outputPath`, the `path` the server answers (`/about/` under `--pretty-urls`) and its absolute `url` under `--base-url`, plus `schemaVersion: 1`, `built` and the absolute `sourceRoot`. It comes from the same manifest the report and `--dry-run` read, so an editor previewing a file can ask which address shows it composed and get the build's own answer. Before the first build completes it answers with `built: false` and no pages; after a failed rebuild it keeps describing the previous build, which is what `dist/` still holds.

**`/_unify/preview/` — the preview index, and `/_unify/preview/<source path>` — the source preview.** `unify dev` prints the index's address at startup: it lists every layout, include and page in the site, each a link, with the number of built pages that use each layout and include. From there, or by typing the path, open a layout or an include the way you would open a page: `http://localhost:3000/_unify/preview/_layout.html` shows the layout as itself — includes inlined, slot fallbacks rendered, every stylesheet, script and image resolved from the file that linked it — and `…/preview/_includes/nav.html` shows the fragment on its own, inside the default layout's `<head>` and `<body>` start tag (so it has the site's styles and body class) but with none of the layout's body. A small overlay in the corner, the chrome, picks a page to compose the layout with, or to fill the include's slots from; for an include it also picks which layout supplies the head. It lists only the pages the file reaches. The choice is the URL (`?page=about.md`, `?layout=blog/_layout.html`), so it survives the reload that follows every save. The chrome is on every page `dev` serves too, naming the page's source file and linking to its layout and includes. `?chrome=off` removes it everywhere until `?chrome=on`; `?chrome=partials` keeps it collapsed on pages and open on layouts and includes; `?collapsed=true` tucks it away for a load; the show and collapse buttons remember your choice. Each of these is remembered by the browser once given, so links between pages keep it. A page path redirects to the page's own address. The preview is composed from the source tree on each request by the same inliner and composer the build uses, is served with the reload script, and is written nowhere. Only `dev` serves it: `build` writes files, and `watch` has no server. The name has a leading underscore for a reason that is already a rule — a source path with one is excluded, and an emitted `_`-prefixed page or `_`-prefixed directory is a problem — so no site can emit `dist/_unify/anything`. The one output path that guard spares is a root-level non-page file named exactly `_unify` (the same seam that lets `_headers` ship): `dev` answers the reserved path regardless of what is on disk, so that one file is shadowed here and served normally by your host.

### `unify watch`

The same watch contract as `dev`, no server — for pairing with a server you already run. Saves are coalesced into one full rebuild (a save landing mid-rebuild queues exactly one follow-up); writes are atomic and minimal (unchanged files are not rewritten, deletions are precise), so external tools can consume the output directory safely.

### `unify init [template]`

Scaffolds a starter site into `site/`, with `README.md`, `DEPLOY.md` and a `unify.yaml` beside it at the project root. The `unify.yaml` lists every saveable option commented out, each under a one-line description naming its default, so the whole surface is in front of you and nothing changes until you uncomment a line. Templates: `default`, `basic`, `blog`, `docs`, `portfolio`. Every template exercises the core primitives once — an include, the automatic `_layout.html`, a named slot with a page that fills it, a `data-layout="none"` page, and the underscore convention — and ships its tooling in place with the pages a site fills in only as examples under `site/_examples/`, which never publish: copy one into place and edit the copy, and `unify update` never touches it. `assets/theme.css` is the look as the stylesheet's custom properties, imported into a layer that wins over the stylesheet's own: yours to edit, and the scaffolded `unify.yaml` names it under `keep:` in its `template:` block, so `unify update` never overwrites it ([`templates.md`](templates.md) §3). The `docs` template is a documentation site in the fwdslsh family's look — a masthead, a sidebar and a footer, each in its own include (`_includes/head.html`, `nav.html`, `docnav.html`, `footer.html`), so a site that builds on it with `--extends` replaces those four files and nothing else — and it ships `scripts/import-docs.mjs`, a library a generator calls to publish a repository's `docs/` folder at every build ([`templates.md`](templates.md) §4). The `docs` template also ships an "All pages" starter (`all-pages.html` and `assets/all-pages.js`): a filterable directory of the site read from `catalog.json`, and its `unify.yaml` has the one line `catalog: true` uncommented so a plain `unify build` fills it. The `blog` template also ships the generator pattern worked: `scripts/gen.mjs`, at the project root beside `site/`, is named by its `unify.yaml` (`generate: scripts/gen.mjs`), so every `unify build` runs it; it reads `posts/*.md` and `_data/authors.json` and writes `blog.html` and `feed.xml` into the build's overlay, never into `site/`, and names the fields it emits, so the authors file's private `email` never reaches a page. `README.md` and `DEPLOY.md` are written to the working directory the command ran in — outside the source root, so neither publishes; a `README.md` that already exists there is kept as it is, and every other existing file refuses the scaffold; `init` refuses (exit 2) rather than scaffold when that directory *is*, or is inside, the source root (`--source .`, `--source ..`), because there the two could only publish as pages. Guaranteed: `unify init && unify build --dry-run --strict` and `unify init && unify audit --strict` both exit `0`.

**Where a template comes from.** The positional names one of four things, told apart by shape:

- a **built-in**, by name — each is a directory of the unify repository, `templates/<name>/`, embedded in the CLI, so the name needs no network and no git;
- a **git repository** — a URL, a `git@host:owner/repo.git` address, or any path ending in `.git`, with an optional `#ref` (a branch, a tag, or a commit), fetched with your own `git clone` (your SSH keys and credential helper apply, and nothing prompts). A **subdirectory may follow the repository**, so one repository can host many templates: `unify init https://github.com/fwdslsh/unify/templates/blog` scaffolds that directory; the URL your browser shows for a directory (`…/tree/main/templates/blog`) works too;
- a **directory** on disk — a path that exists (it wins over a package of the same name);
- an **npm package** — anything else that is a package name as published (`name` or `@scope/name`, optionally `@version` or `@tag`), fetched with your own `npm pack`, so your `.npmrc`, registry and tokens apply. Any package can be a template; one meant to be found carries `unify-template` in its `keywords`, and `--audit` is what keeps only a package that really is one. A misspelled directory name therefore reaches npm and fails there, with npm's message.

A template is a project laid out as `init` lays one out: `site/` (or `src/`) beside `README.md`, `DEPLOY.md`, `unify.yaml` and whatever else belongs at the project root; the source tree lands in the target source root and the rest beside it. A directory with neither is a bare source tree, and all of it is content. `.git/`, `node_modules/`, `package.json` and lockfiles are never copied. An argument that is no form at all (a space in it, a path that does not exist) exits `2` naming the four forms. Every refusal above applies to every source: nothing is written if any file would collide.

**`--audit`** keeps the scaffold only if it is a proper unify site: after writing, `unify audit --strict` runs over the new project (with its own `unify.yaml`, so the blog's generator and the docs template's `catalog: true` are honored) and prints its report; a finding removes everything `init` wrote and exits `1`. Every built-in passes it.

`init` also writes one line into `unify.yaml`: `template: <source>`, the template as you typed it (a directory relative to the file). That line is the whole record — no version, no file list — and it is what `unify update` reads. `--template <source>` is the positional spelled as an option.

### `unify update [template]`

Fetches the project's template again — the source `unify.yaml` records, or the one you name, which then replaces the line (`unify update https://github.com/o/r/templates/blog#v2`, `unify update unify-shop-template@2.0.0`) — with the same resolver and the same git and npm credentials `init` uses, and compares every file it ships with your copy at the same place: the template's `site/` against your source root, the rest against the project root.

- A file you do not have is **added**.
- A file with the same bytes is left alone.
- A file that differs is **overwritten** — after you say so.

The command prints every file it would overwrite and add, and when at least one file would be overwritten asks `overwrite N file(s)? [y/N]` before writing anything. `y` writes, and one summary line counts what was written; anything else — `n`, a blank line, a closed stdin — writes nothing, exits `1` and names `--yes`. **`--yes`** (`-y`) answers for a script. **`--dry-run`** prints the same list with `would`, never asks and writes nothing, not even the record. Nothing is ever removed: a file the template dropped stays, and files you added are never visited. Your `unify.yaml` is compared with its `template:` line left out, and the line is written back after the copy. When nothing differs the command says `nothing to do` and exits `0`.

The list is the protection for your edits: a file you changed that the template also ships is in it like any other difference, and the answer is yours. Nothing merges and no flag merges. **`keep`** is the one exception, declared in `unify.yaml` (`keep:` under `template:` — a list of paths relative to the file, beside `source:`) or on the command line (`--keep <path>`, repeatable, relative to the working directory, replacing the file's list): a listed file that exists is never overwritten — printed as `keep <path>` when the template's copy differs, counted as kept in the summary, never asked about — and a listed file you do not have yet is added. The built-ins list `unify.yaml` itself and `site/assets/theme.css`; add what you customize, such as `site/_includes/nav.html`. A template built as [`templates.md`](templates.md) §3 recommends ships the files you fill in only as examples under `_examples/`, so its list is tooling and little else. Writes are temp-then-rename beside their target; a symlink, a path that resolves outside the project, or a `..` in a template path is skipped and reported, never written; the fetch happens before any write, so an unreachable source changes nothing; and nothing a template ships is ever executed.

The workflow around these two commands, and how to publish a template, is in [`templates.md`](templates.md).

A project with no `template:` line (scaffolded before 0.11.5, or the line was lost) has no record: `unify update` exits `2` and names the line to add — or run `unify update <source>` once, which records the source it was given. Where a `unify.template.json` from 0.11.2 to 0.11.4 is still present, the error composes the exact line from it.

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

Moves every page `X.html` to `X/index.html` — except `index.html` files (already pretty) and the root `404.html` (hosts require that exact path) — and rewrites every internal link to match (`/about.html` → `/about/`, queries and fragments preserved; links to assets and external URLs untouched), including a page-targeting `og:`/`twitter:` meta value and a `<meta http-equiv="refresh">` URL, exactly like the matching `href`. Relative asset references inside moved pages are re-emitted root-relative so they keep working. Author pages always link the real file (`about.html`); this flag owns the pretty form. A link to a Markdown page by its source path (`guide/start.md`) is the same link: unify swaps in `.html` first ([`conformance-spec.md`](conformance-spec.md) §11.1b), so a repository whose Markdown already links itself that way builds, with or without this flag; a `.md` link naming no emitted Markdown page still fails the reference check.

### `--base-url <url>`

The address the site will be served from, scheme and domain included: `--base-url https://example.com/repo/`. Its path part prefixes every root-relative URL in the built HTML — `href`, `src`, `srcset`, `poster`, and `og:`/`twitter:` meta values; source files stay rooted at `/` so local preview keeps working. Its origin additionally absolutizes root-relative `og:`/`twitter:`/`rel="canonical"` values, which crawlers require to be absolute: `/assets/x.jpg` becomes `https://example.com/repo/assets/x.jpg` — origin **and** subpath, so the URL points where the file is actually served.

**Names that need escaping.** A file whose name needs escaping in a URL — a space, `&`, a non-ASCII letter — is addressed by its percent-encoded form everywhere unify names it: in the `--dry-run` report, in `sitemap.xml`, and in links unify itself rewrites. A link you wrote in the page that ships it is left exactly as you wrote it, and both spellings resolve, so ordinary sites are unaffected. Two cases are worth knowing. A link reached through an include or a layout, or on a page `--pretty-urls` moved, is re-rooted by unify and comes out canonically encoded — `../assets/my logo.png` in a shared nav emits `/assets/my%20logo.png`, a legal URL. And a file whose name contains a literal `%` is addressed doubly-encoded: `a%20b.css` on disk is `/a%2520b.css`, because `%20` in a URL means a space rather than those three characters. If you have such a file and link to it as `/a%20b.css`, that link correctly reports as broken — rename the file, or write the doubly-encoded form.

Knowing the address is also what lets unify write the site's `sitemap.xml`, so `--base-url` is the whole opt-in — there is no second flag. The generated file lists every page that is indexable, is not `404.html`, and is not consolidated elsewhere by its own `rel="canonical"`; URLs are the same absolute ones the `--dry-run` report shows. A `<lastmod>` appears only where the page authored a real date (`<meta property="article:modified_time">`, or `lastmod:` in Markdown frontmatter) — unify never dates a page from the build clock, the filesystem, the filename, or Git history. If your source tree already contains a `sitemap.xml`, that file is the site's sitemap: unify ships it untouched and generates nothing.

A bare path (`--base-url /repo-name/`) is a usage error naming the full form. It used to be accepted, and prefixed links correctly while leaving `og:`/`canonical` root-relative — valid-looking metadata no share crawler can fetch. Give the whole address; for a local preview of a subpath site, `http://localhost:3000/repo-name/` is one.

### `--canonical auto` / `--canonical none`

With `--base-url` set, unify adds `<link rel="canonical" href="…">` to every page that does not author one, using that page's own final public URL — the same address the `--dry-run` report prints and the sitemap lists. That is the default (`auto`); `--canonical none`, or `canonical: none` in `unify.yaml`, switches it off. Those are the two accepted values. Completion needs `--base-url`: a canonical has to be absolute, so without the site's address there is nothing truthful to write, and `--canonical auto` without it is a usage error.

**A canonical you wrote always wins**, in every shape: one that names another page, several on one page, even one that names a file the site does not build (that last is reported as a broken reference, as it would be anywhere else). Completion fills a gap; it never overrules a value you chose.

Pages that are `noindex`, that are `404.html`, or whose own canonical points elsewhere are skipped — the same set the sitemap lists. Stamping a canonical on a page you told crawlers to drop would create a contradiction rather than resolve one.

Nothing else about the page changes: the element lands immediately before `</head>` at that tag's indentation, and every other byte is what it was.

## Structured data (`schema:`)

There is no flag for this one: a page asks for JSON-LD by declaring a type, in Markdown frontmatter or in HTML, and a site that declares none behaves exactly as it always has.

```
---
title: Shipping in public
description: Why we write the changelog first.
schema: BlogPosting
author: Robin Vale
date: 2026-01-02
og:image: /card.png
---
```

```html
<meta name="schema" content="Article">
```

`WebPage`, `Article`, `BlogPosting` — those three, spelled exactly; `article` is a build error rather than a silent no-op, and so is any other type. unify then writes one `<script type="application/ld+json">` before `</head>`, built only from what the page already declares: the title, the description, the final canonical, the `og:image`, `author`, `date`, `lastmod`, and the document's `lang`. Nothing else, and nothing invented — no publisher, no keywords, no word count, and no date from the build clock, the filesystem, the filename, or Git. A `date` that is not `2026-01-02` or `2026-01-02T09:30:00Z` is left out and reported rather than reformatted or guessed at.

Two things follow from "only what the page declares", and both surprise people once:

- **The headline is the title you see in the browser tab**, layout suffix included — `Shipping in public — Example`. The separator lives in your layout, so unify cannot tell which half is the site's name, and cutting at the first dash would mangle the first headline that contains one.
- **Anything you write yourself wins.** A page carrying its own `<script type="application/ld+json">`, anywhere in the document, gets nothing generated. That is the escape hatch for every other vocabulary — `Product`, `Recipe`, `LocalBusiness`, a `@graph` — and for more detail than the eight fields above.

`unify audit` then reads structured data as bytes, whoever wrote them: a `headline` that does not match the page's `<h1>`, an `inLanguage` that disagrees with `<html lang>`, a `url` naming a different page than the canonical, one `@id` given two types, and a date nothing can use.

## Feeds (`feed.xml`)

No flag either: a page opts itself into the site's feed the same way it opts into structured data — by declaring `schema: Article` or `schema: BlogPosting`, or by an authored `<script type="application/ld+json">` whose `@type` is `Article`/`BlogPosting` (any declared type counts, not just the first) — and the feed exists once **both** a qualifying declaration and `--base-url` are present. There is no `posts/` convention, no collection query, and no way to scope a feed to some pages: one declaration, one site feed.

The document is [Atom](https://www.rfc-editor.org/rfc/rfc4287) at `feed.xml`, never RSS — RSS's date is a different calendar vocabulary, and Atom's is the one an ISO instant already conforms to without reformatting. An entry needs `datePublished` on the page (`date:` in frontmatter, or `<meta name="date">`/`article:published_time`), it must be `indexable` and self-canonical — the identical membership the sitemap uses — and, crucially, it needs a **time**, not just a day:

```
src/posts/hello.md: advisory: date is "2026-01-02", which names a day rather than an instant — this page is not in feed.xml
  fix: write date: 2026-01-02T09:00:00Z — a feed entry's timestamp needs a time and a time zone
```

`2026-01-02` names a calendar day; inventing a time for it (midnight UTC, the build clock) would tell a reader west of Greenwich the wrong publication date, so unify reports the page as absent from the feed rather than guess. The advisory never blocks a publish — it says what the build did, and how to fix it.

Each entry's `<id>` and `<link>` are the page's own canonical (authored, or completed by `--canonical auto`), never a second address; `<updated>` prefers `dateModified` over `datePublished` when it carries a time. `--feed-full` additionally puts each entry's rendered `<main>` into `<content type="html">` — without it, every entry carries a plain-text `<summary>`. Every internal URL the feed emits is checked exactly as a broken link would be, so a target the site does not emit blocks the publish rather than shipping a feed reader will 404 on.

If your source tree already contains a `feed.xml`, that file **is** the site's feed: unify ships it untouched and generates nothing, exactly as it treats an authored `sitemap.xml`. The `blog` template's own generator writes one for this reason.

## Catalog (`catalog.json`)

`--catalog` writes `assets/unify/catalog.json` — a compact, HTML-shaped projection of every public page, meant for browse/filter/TOC/metadata-driven UI: blog listings, tag facets, a command palette, a page chooser. It is a plain flag, independent of `--search-corpus` and of the sitemap and the feed: it runs with or without `--base-url` (`path` is root-relative without one, `url` is absolute with).

```json
{
  "schemaVersion": 1,
  "baseUrl": "https://example.com/",
  "pages": [
    {
      "path": "/posts/unify-and-htmx/",
      "url": "https://example.com/posts/unify-and-htmx/",
      "html": { "attributes": { "lang": "en" } },
      "head": {
        "title": "Unify and HTMX",
        "meta": [
          { "name": "description", "content": "A practical static-site architecture." },
          { "name": "tags", "content": "unify" },
          { "name": "tags", "content": "htmx" }
        ],
        "link": [{ "rel": "canonical", "href": "https://example.com/posts/unify-and-htmx/" }],
        "base": []
      },
      "body": {
        "attributes": { "class": "post" },
        "headings": [{ "level": 1, "id": "unify-and-htmx", "text": "Unify and HTMX" }]
      }
    }
  ]
}
```

`head.meta`/`head.link`/`head.base` are every element of that kind, in document order, attributes preserved whole — arbitrary `tags:`/`series:`/`audience:` frontmatter shows up here exactly as the equivalent hand-written `<meta>` would, repeats and all. There is no body text and no JSON-LD in this file: a long article grows the corpus below, not this one, and a JSON-LD block can itself be as large as an article, so neither belongs in a record meant to stay bounded per page.

Membership is the sitemap's own rule: `noindex`/`none` pages, `404.html`, and pages consolidated elsewhere by their own canonical are left out — the identical set `search-corpus.json` uses, so the two files always describe the same pages.

A private site that marks every page `noindex` would get empty files. `--include-noindex` (also `include-noindex: true` in `unify.yaml`) lists pages that are excluded *only* because they are `noindex` in both files, so the site's own "All pages" directory or search box can use them. It changes nothing else: the pages keep their `noindex` robots meta, stay out of `sitemap.xml` and the feed, and `404.html` and pages whose canonical points elsewhere stay out. Crawler indexing and in-site navigation are separate questions, and `noindex` is not access control — anything in these files is a public file. The flag needs `--catalog` or `--search-corpus`; alone it is a usage error.

If your source tree already contains `assets/unify/catalog.json`, that file is the site's catalog: unify ships it untouched and generates nothing.

## Search corpus (`search-corpus.json`)

`--search-corpus` writes `assets/unify/search-corpus.json` — the normalized text a client-side search implementation indexes however it likes. It does **not** imply `--catalog`; pass both for a full search UI:

```bash
unify dev --catalog --search-corpus
```

```json
{
  "schemaVersion": 1,
  "pages": [
    { "path": "/posts/unify-and-htmx/", "text": "Unify and HTMX A practical static-site architecture…" }
  ]
}
```

Deliberately minimal: no `url`, `title`, `headings`, or metadata — those already live in `catalog.json`, keyed by the same `path`, so a result joins back with `catalogByPath.get(hit.path)`. `text` is the page's visible main content, with every Unicode space character (`&nbsp;` included) folded to an ordinary space so a search box comparing a typed query against it can actually match — nothing else is touched: no case folding, no stemming, no stop-word removal, no truncation, no character count.

Same membership as the catalog, same author-wins rule: a `src/assets/unify/search-corpus.json` you wrote ships untouched.

### `--generate <path>`

Runs one JavaScript file from your source tree before the build scans anything. `build`, `watch`, `dev`, and `audit` all take it, because all four scan the source tree.

It names a **file**, never a command. There is no shell, no argument list, and no way to say "and then run this other thing" — a path is something you wrote and can read. A relative path resolves against the source root and an absolute path is taken as written; the file can live anywhere — `_scripts/gen.mjs` inside `src/`, `../scripts/gen.mjs` beside it at the project root, or an absolute path — and is never published, because only the source tree and the generated directory are scanned. (One thing to know: `unify dev` watches the source tree, so editing a generator that lives outside it does not trigger a rebuild on its own.) There is one generator per build: giving `--generate` twice on the command line is a usage error (exit 2), so put several tasks inside the one file and have it import and call the others. A `generate:` saved in `unify.yaml` plus one `--generate` is fine; the command line wins.

The whole interface is three positional arguments:

```js
const [, , sourceRoot, generatedDir, contextPath] = process.argv;
```

`sourceRoot` is your source tree; `generatedDir` is an empty directory that exists only for this build. Files written into `generatedDir` join the build as an overlay — scanned, composed, checked, published, and colliding with a same-named source file exactly like any other page. Files written anywhere else are your own business. There is no unify module to import, no object passed in, and no return value read.

`contextPath` is new in 0.9 and additive: a generator written before it existed, reading only `sourceRoot`/`generatedDir`, keeps working exactly as it did. It names a JSON file — read-only, yours to consult or ignore — that tells you the handful of build facts unify is willing to promise as a stable contract:

```json
{
  "schemaVersion": 1,
  "unifyVersion": "0.9.0",
  "command": "build",
  "paths": {
    "sourceRoot": "/project/src",
    "generatedRoot": "/tmp/unify-generated-abc123/overlay",
    "outputRoot": "/project/dist"
  },
  "site": {
    "baseUrl": "https://example.com/docs/",
    "prettyUrls": true,
    "canonical": "auto"
  },
  "outputs": {
    "catalog": "assets/unify/catalog.json",
    "searchCorpus": null
  },
  "inputs": {
    "sourcePages": null
  }
}
```

```js
const context = JSON.parse(readFileSync(process.argv[4], "utf8"));
if (context.site.baseUrl) {
  // build absolute URLs the same way the rest of the site does
}
```

`schemaVersion` starts at `1` and only bumps when a field's meaning changes in a way an existing reader would misread — a new field showing up is not a bump, so pinning to `schemaVersion === 1` is safe across 0.9 releases. `command` is the subcommand actually running (`build`/`dev`/`watch`/`audit` — `audit` runs generators too). `site.baseUrl` is `--base-url`'s effective, fully-resolved value (or `null` without the flag) — never the raw string you passed. `outputs.catalog`/`outputs.searchCorpus` are the paths those files will land at, output-root-relative, or `null` when the matching flag is off — the paths only, since neither file's *content* exists yet at this point in the build. `inputs.sourcePages` is `null` unless you passed `--source-inventory` (below), and was added in 0.9.3 without a version bump, being a new field. There's nothing else in it: no settings dump, no environment, no manifest (the build hasn't scanned anything yet, so there's nothing to report). The file is temporary — gone by the time the build finishes, success or failure — so read it during the generator's own run and don't expect it to still be there afterward.

#### `--source-inventory`

On by default whenever a generator is named, saveable (`source-inventory: false` switches it off), and inert without a generator. It gives the generator one more file, `source-pages.json`, whose path is `context.inputs.sourcePages`: one record for every **source page**, with the metadata its author wrote, so a script can write a directory page (a reports index, an archive) in the same build that publishes it.

```json
{
  "schemaVersion": 1,
  "pages": [
    { "source": "reports/q1.md", "href": "/reports/q1.html", "title": "Q1: the numbers", "description": null, "date": "2026-04-02T09:00:00Z",
      "meta": [{ "name": "tags", "content": "finance" }], "links": [] }
  ]
}
```

Every record has those seven keys. `meta` and `links` are the `<meta>` and `<link>` elements the page itself declares, in order, as attribute records (a Markdown page's `meta` is what its frontmatter emits, one record per list item, and its `links` is empty); unify gives them no meaning, so tags, series, roles and ordering are your script's to interpret. `source` is the path relative to the source root. `href` is `/` plus `source` with a trailing `.md` turned into `.html`, a link you can write straight into generated HTML: `--pretty-urls` and `--base-url` rewrite it like any link you typed. `title`, `description` and `date` are strings or `null`. The list is sorted by `source`.

The pages are exactly the ones the build would treat as pages in your source tree: `_`-prefixed files, `--exclude` matches, `*.fragment.html` and layouts are not in it, and nor is anything a generator writes. A `noindex` page is in it. Markdown pages give their frontmatter `title`, `description` and `date` as written (no first-heading fallback). HTML pages give their own `<title>` and `<meta name="description">`/`<meta name="date">`, as written in that file's `<head>`: includes are not resolved, so a title an `<include>` supplies is not seen. It is source facts only, not the catalog: no layout title suffix, no generated pages, no rendered headings. Broken frontmatter is reported the way a build reports it and stops the build before your generator runs. A worked generator is in [the integrations guide](integrations.md#an-index-of-your-pages-in-one-build).

**Your generated files and your source files share one set of paths.** A file is known by its path inside whichever directory it was written to, so `docs/api.md` means the same page whether you typed it into `src/docs/` or your script wrote it into `generatedDir`. Everything follows from that:

- A generated page finds a layout by the ordinary walk. `docs/api.md` looks for `docs/_layout.html`, then `_layout.html` — in either tree — with no `layout:` line of its own. Writing one is still allowed and still means what it says.
- `<include src="/_includes/nav.html">` in a hand-written layout finds the fragment your generator wrote, and `<include src="./sibling.html">` in a generated page finds the file you wrote. Relative paths count from the page's own place in the tree, which is where you put it in `generatedDir`.
- Where the same path exists in both, **your file wins** — a generator cannot quietly replace something you wrote. That only comes up for files that never publish, like a fragment under `_includes/`: when a *page* exists in both trees, the build stops and names both (neither one silently wins). Nearest still beats everything in the layout walk, so a `docs/_layout.html` your generator wrote is the layout for `docs/`, including for pages you hand-wrote there.

The working directory is the source root, so `readFileSync("_data/authors.json")` means what you would expect.

**Layouts and includes can live beside `package.json` too.** The directory you run `unify` from (the project root) is the last place a written path or the layout walk looks, after the source tree and the generated directory: `<include src="/includes/nav.html">` finds `includes/nav.html` at the project root when `src/` has none, and a `_layout.html` there is the site's root layout. Nothing at the project root is scanned or published; it only answers paths. So a repository can look like `site/` (the content, with its `_layout.html` and `_includes/`, which preview in a browser with file-relative asset links), `scripts/` and `unify.yaml` at the top — the layout `unify init` scaffolds. The runtime is unify's own — whichever one unify is itself running under, and for the standalone binary that is the binary. So `--generate` works on a machine with no Node and no Bun installed, which is why the flag exists rather than `--run "node gen.mjs"`.

It runs on **every** build, including every rebuild under `watch` and `dev` — a generator that ran once would leave watch output stale while the build reported success. A non-zero exit is a located problem: nothing publishes, and the previous `dist/` is untouched.

unify runs the file you named. It does not sandbox it, restrict what it reads or writes, or check its output for anything an ordinary build would not. What it does guarantee is that nothing the generator produces skips a check, and that a generator's failure is a build failure. `docs/integrations.md` works the common shapes — a data-driven index, image derivatives, a CMS pulled to disk.

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

Work that edits pages rather than adding files is named above the list, one line each, so it is never invisible:

```
canonical completion: 5 pages would gain a canonical link
structured data: 3 pages would gain a JSON-LD block
```

### `--extends <source>`

Build on a template without copying it into the project ([`conformance-spec.md`](conformance-spec.md) §34). `build`, `audit`, `dev` and `watch` read it; the source is any form `unify init` takes — a built-in name, a directory, a git repository (`URL[/subdirectory][#ref]`), or an npm package (`name`, `@scope/name`, optionally `@version` or `@tag`). Saved as `extends:` in `unify.yaml`, where a relative directory is relative to the file.

The template's source tree (its `site/`, else `src/`, else the whole directory) sits beneath yours. Its layouts and includes resolve when you have none at that path, and its pages and assets publish when you have nothing at the same path or output path. **Your file always wins**: write `index.md` and the template's `index.html` is left out; write `assets/theme.css` and yours is the theme; write `_includes/nav.html` and every layout includes yours. To leave out a template page you don't want, use `--exclude` (`exclude:` listing `_*` and the page). Nothing else in the template is read: not its `unify.yaml` (your own settings decide everything), not its generator, and nothing it ships executes. `--dry-run` marks every row that comes from the template `(template)`, and a diagnostic in a template file names it where it is (`unify-docs-template@0.1.1/_layout.html`).

The template is fetched before anything else runs. A source that cannot be reached exits `2` and writes nothing. A **pinned** source (an npm package at an exact version, a git commit, a built-in) is fetched once into `unify/templates/` in your cache directory (`$XDG_CACHE_HOME`, else `%LOCALAPPDATA%` on Windows, else `~/.cache`), and every later build reads it from there, offline. Anything else (a bare name, a tag, a branch) is fetched once per run. A directory is read where it is, every build.

```yaml
# unify.yaml — a repository whose Markdown lives in docs/
source: docs
extends: unify-docs-template@0.1.1
catalog: true
pretty-urls: true
base-url: https://owner.github.io/repo/
```

`extends:` and `template:` are independent: `template:` is the record `unify update` fetches into a scaffolded project, and no build reads it; `extends:` is read by the build, and `update` never reads it.

### `--template <source>` (init and update)

The template, the same as the positional. Saved in `unify.yaml` by `init` as typed — `template: <source>`, or `source:` under `template:` when the file carries a `keep:` list; `unify update` fetches the saved source — or the flag or positional, which then replaces it.

### `-y, --yes` (update)

Overwrite the listed files without asking. Without it, `update` waits for `y` on standard input whenever a file would be overwritten, and writes nothing on any other answer.

### `--keep <path>` (update, repeatable)

A file `update` never overwrites once it exists — one you customized. Relative to the working directory; `keep:` under `template:` in `unify.yaml` is the same list, relative to the file, and the flag replaces it for one run, as `--exclude` replaces `exclude:`. A kept file whose template copy differs is printed as `keep <path>` and counted as kept; a listed file you do not have yet is added.

### `--audit` (build and init)

With `init`: scaffold, audit the result with `unify audit --strict`, keep it only if that passes (see `unify init` above). With `build`: compose once, audit that result, publish only if it passes. The generator (`--generate`) runs once, the site is composed once, and the same findings `unify audit` would print are evaluated over that exact composition, then printed (human format) after the build's diagnostics. The build publishes iff `unify audit` with the same flags would exit `0`: no problems, and with `--strict` also no advisories and no findings. Without `--strict`, findings are reported but block nothing. A blocked gate exits `1` and leaves the previous output untouched. With `--dry-run` it reports and writes nothing, exiting as the gate would. `--external` and `--format` remain `audit`-only. `audit: true` is saveable in `unify.yaml`.

`unify build --audit --strict` replaces the three-step `build --dry-run --strict && build && audit --strict`.

### `--save-config`

`build` only. Writes the saveable options you passed on this command line into the `unify.yaml` unify read (source root, else project root), creating one at the project root if there is none: `unify build --pretty-urls --base-url https://example.com/ --save-config`. It is an upsert. Keys you did not pass are left alone, and the file is edited line by line, so your comments, ordering and other keys survive untouched; a key you passed replaces its old line (an `exclude` list replaces its old items), and new keys go at the end. It never writes `save-config` itself or `--dry-run`. Paths are written relative to the file: `--generate ../scripts/gen.mjs` becomes `generate: scripts/gen.mjs` in a project-root file, and `--source` is saved only when the file sits outside the source root, where the next bare `unify build` needs it. A flag like `--pretty-urls` writes `pretty-urls: true`; there is no way to write `false`, so to remove a key, edit the file.

The file is written only if the build exits `0`, so it records settings that produced a good build. With `--dry-run` it saves after a dry run that exits `0` ("check the flags, then keep them"); `dist/` is still untouched. On any command but `build` it is a usage error (exit `2`) and writes nothing.

### `--strict`

Advisories affect the exit code (non-zero) — never what is published. `unify build --dry-run --strict` is the one-line CI lint.

## `robots.txt`

If your source tree has a `robots.txt` at its root, it ships exactly as written — unify never generates one, never rewrites one, and never decides what you should block. One thing in it is checked: a `Sitemap:` line is a promise that a crawler can fetch that URL, so a value naming a file your site does not build is reported like any other broken reference — the same check, and the same message, your `<a href>` links get. A `Sitemap:` on another host is left alone, because verifying it would need the network and a build never uses it.

Nothing else is checked, on purpose. `Disallow: /admin/` on a site with no `/admin/` is defensive and correct. A line unify cannot parse is one the Robots Exclusion Protocol tells crawlers to skip while still using the rules around it, and a field unify does not recognise is one the protocol explicitly leaves room for — failing your build over either would contradict the standard. And not declaring a sitemap is your choice, even when unify generated one.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | The site was published (with `--dry-run`: would have been). |
| `1` | Problems found — nothing was published, the previous output is untouched. Under `--strict`, advisories alone also exit `1`, and for `audit` so does any finding. |
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

Optional: saved flags, nothing more. It lives beside `package.json` at the project root (the directory you run `unify` from), or in the source root; the source root's copy wins if both exist. A relative path in the file resolves against the file's own directory, so a project-root file says `source: site` and `generate: scripts/gen.mjs`, naming the directories beside it; a repository can keep its content in `site/`, `pages/` or whatever you like, with the config at the top. Keys are the long option names (`source`, `output`, `clean`, `exclude` — a list, `pretty-urls`, `base-url`, `canonical`, `feed-full`, `catalog`, `search-corpus`, `include-noindex`, `strict`, `audit`, `port`, `generate`, `source-inventory`, `extends` — the template the site builds on, and `template` — the one key that takes a block: the template's source as its value, or `source:` and `keep:` under it, the files `unify update` never overwrites); CLI flags win on conflict. No behavior exists that only the file can express; the file itself never ships. **Write only what differs from the defaults**: a file that spells out `output: dist` or `exclude: [_*]` builds exactly as no file would. `unify init` writes one with every key listed, described and commented out, so you uncomment what you need; `unify build ... --save-config` writes or updates it for you, taking a commented line's place when there is one.

```yaml
# unify.yaml — the committed invocation
output: dist
pretty-urls: true
base-url: https://example.com/
template:
  source: https://github.com/acme/templates/shop
  keep:
    - unify.yaml
    - site/assets/theme.css
```
