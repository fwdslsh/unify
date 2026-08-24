# unify CLI reference

This page lists every command, every option, and every exit code — there are no others. The behavior behind each is specified in [`product-spec.md`](product-spec.md) §4 and, rule by rule, in [`conformance-spec.md`](conformance-spec.md).

```
unify [build]              build the site (default command)
unify audit                evaluate the site the build would publish — writes nothing
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
      --feed-full          include each entry's full rendered content in feed.xml (needs --base-url)
      --search-index       write search-index.json for a client-side search library
      --generate <path>    run one JavaScript file from your source tree before the build
      --dry-run            run the full build and every check, print the report, write nothing
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
| `incomplete` | something is absent or inconsistent that you may have chosen: no description, no `lang`, two pages sharing a title, a page nothing links to, a `tags:` or `categories:` key that built no collection. |

```
$ unify audit
about.html: incomplete: the emitted <head> declares no <meta name="description"> [description-missing]
  fix: add a description describing this page; a layout-wide one repeats on every page
notes.html: broken: #install in guide.html names no element [fragment-missing]
  fix: add id="install" to the element it should reach, or correct the link
audit: 1 broken, 1 incomplete
```

Findings never block a build — `unify build` does not run any of these checks, so a site full of them still publishes. `unify audit --strict` exits `1` on any finding, of either severity: that is the CI gate, and it is opt-in.

Worth knowing before you wire it up: **every `init` template passes `unify audit --strict` from the moment it is scaffolded.** `unify init <template> && unify audit --strict` exits `0` for all five, with no `--base-url` and nothing edited, and the conformance suite asserts it per template — so a finding on a fresh scaffold is a regression, and the first finding you see is about something you wrote. It was not always true: each template used to ship between seven and thirteen `incomplete` findings, mostly a missing `lang` or a page without its own description. They were real gaps, and the fix was the templates rather than the gate.

**What it will not tell you.** There is no score, no grade, no percentage, and no character count anywhere in the output. A short title is not a finding and a long description is not a finding; absence is checkable, length is opinion. "Duplicate" means *identical*, never "similar" — a similarity threshold is a number nobody can defend to the author whose two pages fell either side of it. A title and a heading agree when either contains the other, which is why the layout suffix in `About — Example Site` does not conflict with an `<h1>` of `About`.

A finding is also never raised for something the build already refuses to publish. A canonical or an `og:image` naming a file the site does not emit is a *problem* — it blocks the publish outright, which is stronger than reporting it.

One finding is about a key rather than a gap. `tags:` and `categories:` are allowed and become ordinary `<meta>` tags, but unify builds nothing from them — no index page, no archive, no feed of any term, no route — so a page declaring one collects `taxonomy-inert`, naming the keys and what did not happen. Nothing about the page is wrong, which is why it is `incomplete` rather than `broken`; write the index yourself with a script that runs before the build, or drop the key. The keys that are *not* allowed do not reach this command at all: `draft`, `permalink`, and `slug` in Markdown frontmatter are build problems (`unify build --dry-run` reports them), because each one, believed, publishes or addresses the wrong page.

**`--format json` / `--format sarif`.** Replace the finding list above with one JSON document instead — `{schemaVersion, baseUrl, summary, pages, findings}`, where `pages` is the same per-page record every other feature reads and `findings` is the same list in the same order, machine-readable rather than printed. `--format sarif` is the identical findings, mapped field for field into SARIF 2.1.0 for editors and CI systems that already read it. Neither format changes what is checked or the exit code; `--format human` (the default) is unchanged. `problem`/`advisory` diagnostics still print to stderr as prose either way — a JSON consumer gets their counts in `summary`, never their text, so there is one diagnostic channel rather than two. Each finding carries a `fingerprint`: a stable hash of its id, its file, and the one detail that tells it apart from a sibling finding on the same page (which id repeated, which field conflicted) — deliberately *not* its line number or wording, so a CI suppression survives an unrelated edit above it and a reworded fix line.

**`--external`.** The one unify operation that touches the network, and the only place it can happen — plain `build`/`audit` stay offline always. Fetches every off-origin URL the site's own output declares (a share image, a canonical naming another site, a JSON-LD URL-valued property, an ordinary link) once each, `HEAD` falling back to `GET` on `405`, and reports the ones that fail, time out, or answer `4xx`/`5xx` as `external-unreachable` (`incomplete` — the fault may be the other server's, at this exact moment, and a build must never treat that as a self-contradiction). unify does not try to tell "the network is down" from "that one host is down": nothing can distinguish them without calling some third party unify would have had to choose, so every URL that does not resolve is reported as itself.

### `unify dev`

Build + watch + a static server on `localhost:<port>` (default 3000) serving the output directory, with live reload on every rebuild. The server is deliberately minimal and permanently so: static files, directory indexes, a 404 page, reload. No proxying, HTTPS, middleware, or config. The reload script is injected only into pages `dev` serves — it never exists in the output directory. While watching, a page that fails to build is served as an error page carrying the located diagnostics, replaced by the next successful rebuild.

**`/_unify/` — the local audit view.** `dev` answers one path that is not a file. `http://localhost:3000/_unify/` is a report of the build that just ran: the counts and address line, then every `unify audit` finding grouped by page, then every page's record — output path, public URL, title, description, language, canonical, heading outline, links in and out, whether it is indexable — and then the build's own problems and advisories. A page with nothing wrong is listed too, because "did my metadata land" is the other half of the question.

It is assembled in memory from the same manifest and the same finding list the command line reads, never a second reading of the site, so it cannot disagree with `unify audit`. **Nothing is written to `dist/`** and no script is added to a published page: a page fetched from `dist/` by a deploy or a `curl` is byte-identical whether or not `dev` ever ran, and `/_unify/` never appears in `--dry-run`. The reload stream that refreshes a page refreshes the report, so it follows every rebuild — including one that failed, whose diagnostics are how it tells you the site on disk is the previous build.

No flag turns it on, off, or moves it; `--port` is the only choice about the server. `/_unify` redirects to `/_unify/`, and every other path beneath it is a 404 — the reservation is a promise about who answers, not an invitation to guess sub-pages. It is HTML for a person, not an API. Only `dev` serves it: `build` writes files, and `watch` has no server. The name has a leading underscore for a reason that is already a rule — a source path with one is excluded, and an emitted `_`-prefixed page or `_`-prefixed directory is a problem — so no site can emit `dist/_unify/anything`. The one output path that guard spares is a root-level non-page file named exactly `_unify` (the same seam that lets `_headers` ship): `dev` answers the reserved path regardless of what is on disk, so that one file is shadowed here and served normally by your host.

### `unify watch`

The same watch contract as `dev`, no server — for pairing with a server you already run. Saves are coalesced into one full rebuild (a save landing mid-rebuild queues exactly one follow-up); writes are atomic and minimal (unchanged files are not rewritten, deletions are precise), so external tools can consume the output directory safely.

### `unify init [template]`

Scaffolds a starter site into `src/`. Templates: `default`, `basic`, `blog`, `docs`, `portfolio`. Every template exercises the core primitives once — an include, the automatic `_layout.html`, a named slot with a page that fills it, a `data-layout="none"` page, and the underscore convention. The `blog` template also ships the generator pattern worked: `_scripts/gen.mjs` reads `posts/*.md` and `_data/authors.json` and regenerates `blog.html` and `feed.xml` (`node src/_scripts/gen.mjs && unify build`, from the project root); both ship pre-generated, and the generator names the fields it emits, so the authors file's private `email` never reaches a page. `AGENTS.md` and `DEPLOY.md` are written to the working directory the command ran in — outside the source root, so neither publishes; `init` refuses (exit 2) rather than scaffold when that directory *is*, or is inside, the source root (`--source .`, `--source ..`), because there the two could only publish as pages. `init` never creates `unify.yaml`. Guaranteed: `unify init && unify build --dry-run --strict` and `unify init && unify audit --strict` both exit `0`.

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

**Names that need escaping.** A file whose name needs escaping in a URL — a space, `&`, a non-ASCII letter — is addressed by its percent-encoded form everywhere unify names it: in the `--dry-run` report, in `sitemap.xml`, and in links unify itself rewrites. A link you wrote in the page that ships it is left exactly as you wrote it, and both spellings resolve, so ordinary sites are unaffected. Two cases are worth knowing. A link reached through an include or a layout, or on a page `--pretty-urls` moved, is re-rooted by unify and comes out canonically encoded — `../assets/my logo.png` in a shared nav emits `/assets/my%20logo.png`, a legal URL. And a file whose name contains a literal `%` is addressed doubly-encoded: `a%20b.css` on disk is `/a%2520b.css`, because `%20` in a URL means a space rather than those three characters. If you have such a file and link to it as `/a%20b.css`, that link correctly reports as broken — rename the file, or write the doubly-encoded form.

Knowing the address is also what lets unify write the site's `sitemap.xml`, so `--base-url` is the whole opt-in — there is no second flag. The generated file lists every page that is indexable, is not `404.html`, and is not consolidated elsewhere by its own `rel="canonical"`; URLs are the same absolute ones the `--dry-run` report shows. A `<lastmod>` appears only where the page authored a real date (`<meta property="article:modified_time">`, or `lastmod:` in Markdown frontmatter) — unify never dates a page from the build clock, the filesystem, the filename, or Git history. If your source tree already contains a `sitemap.xml`, that file is the site's sitemap: unify ships it untouched and generates nothing.

A bare path (`--base-url /repo-name/`) is a usage error naming the full form. It used to be accepted, and prefixed links correctly while leaving `og:`/`canonical` root-relative — valid-looking metadata no share crawler can fetch. Give the whole address; for a local preview of a subpath site, `http://localhost:3000/repo-name/` is one.

### `--canonical auto`

Adds `<link rel="canonical" href="…">` to every page that does not author one, using that page's own final public URL — the same address the `--dry-run` report prints and the sitemap lists. `auto` is the only accepted value, and the option needs `--base-url`: a canonical has to be absolute, so without the site's address there is nothing truthful to write.

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

No flag either: a page opts itself into the site's feed the same way it opts into structured data — by declaring `schema: Article` or `schema: BlogPosting` — and the feed exists once **both** that declaration and `--base-url` are present. There is no `posts/` convention, no collection query, and no way to scope a feed to some pages: one declaration, one site feed.

The document is [Atom](https://www.rfc-editor.org/rfc/rfc4287) at `feed.xml`, never RSS — RSS's date is a different calendar vocabulary, and Atom's is the one an ISO instant already conforms to without reformatting. An entry needs `datePublished` on the page (`date:` in frontmatter, or `<meta name="date">`/`article:published_time`), it must be `indexable` and self-canonical — the identical membership the sitemap uses — and, crucially, it needs a **time**, not just a day:

```
src/posts/hello.md: advisory: date is "2026-01-02", which names a day rather than an instant — this page is not in feed.xml
  fix: write date: 2026-01-02T09:00:00Z — a feed entry's timestamp needs a time and a time zone
```

`2026-01-02` names a calendar day; inventing a time for it (midnight UTC, the build clock) would tell a reader west of Greenwich the wrong publication date, so unify reports the page as absent from the feed rather than guess. The advisory never blocks a publish — it says what the build did, and how to fix it.

Each entry's `<id>` and `<link>` are the page's own canonical (authored, or completed by `--canonical auto`), never a second address; `<updated>` prefers `dateModified` over `datePublished` when it carries a time. `--feed-full` additionally puts each entry's rendered `<main>` into `<content type="html">` — without it, every entry carries a plain-text `<summary>`. Every internal URL the feed emits is checked exactly as a broken link would be, so a target the site does not emit blocks the publish rather than shipping a feed reader will 404 on.

If your source tree already contains a `feed.xml`, that file **is** the site's feed: unify ships it untouched and generates nothing, exactly as it treats an authored `sitemap.xml`. The `blog` template's own generator writes one for this reason.

## Search manifest (`search-index.json`)

`--search-index` writes `search-index.json` at the output root — a flat, standard document a client-side search library (or an external indexer) can read instead of re-parsing your site. Unlike the sitemap or the feed, this is a plain flag: nothing about a page declares "index me", so it runs with or without `--base-url` (URLs are root-relative without one, absolute with).

```json
{
  "schemaVersion": 1,
  "pages": [
    { "url": "/about.html", "title": "About — Example", "description": "Who we are.", "headings": [{ "level": 1, "text": "About", "id": "about" }], "text": "About Who we are and what we do." }
  ]
}
```

Membership is the same rule as the sitemap and `--canonical auto`: `noindex`/`none` pages, `404.html`, and pages consolidated elsewhere by their own canonical are left out. `text` is the page's visible main content, with every Unicode space character (`&nbsp;` included) folded to an ordinary space so a search box comparing a typed query against it can actually match — nothing else is touched: no case folding, no stemming, no stop-word removal, no truncation, no character count. An authored `search-index.json` in your source tree ships untouched, the same rule feeds and sitemaps follow.

### `--generate <path>`

Runs one JavaScript file from your source tree before the build scans anything. `build`, `watch`, `dev`, and `audit` all take it, because all four scan the source tree.

It names a **file**, never a command. There is no shell, no argument list, and no way to say "and then run this other thing" — a path is something you wrote and can read. The path resolves against the source root and must stay inside it.

The whole interface is two positional arguments:

```js
const [, , sourceRoot, generatedDir] = process.argv;
```

`sourceRoot` is your source tree; `generatedDir` is an empty directory that exists only for this build. Files written into `generatedDir` join the build as an overlay — scanned, composed, checked, published, and colliding with a same-named source file exactly like any other page. Files written anywhere else are your own business. There is no unify module to import, no object passed in, and no return value read.

**Your generated files and your source files share one set of paths.** A file is known by its path inside whichever directory it was written to, so `docs/api.md` means the same page whether you typed it into `src/docs/` or your script wrote it into `generatedDir`. Everything follows from that:

- A generated page finds a layout by the ordinary walk. `docs/api.md` looks for `docs/_layout.html`, then `_layout.html` — in either tree — with no `layout:` line of its own. Writing one is still allowed and still means what it says.
- `<include src="/_includes/nav.html">` in a hand-written layout finds the fragment your generator wrote, and `<include src="./sibling.html">` in a generated page finds the file you wrote. Relative paths count from the page's own place in the tree, which is where you put it in `generatedDir`.
- Where the same path exists in both, **your file wins** — a generator cannot quietly replace something you wrote. That only comes up for files that never publish, like a fragment under `_includes/`: when a *page* exists in both trees, the build stops and names both (neither one silently wins). Nearest still beats everything in the layout walk, so a `docs/_layout.html` your generator wrote is the layout for `docs/`, including for pages you hand-wrote there.

The working directory is the source root, so `readFileSync("_data/authors.json")` means what you would expect. The runtime is unify's own: `--generate` works on a machine with no Node installed, which is why the flag exists rather than `--run "node gen.mjs"`.

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

Optional, at the source root: saved flags, nothing more. Keys are the long option names (`source`, `output`, `clean`, `exclude` — a list, `pretty-urls`, `base-url`, `strict`, `port`); CLI flags win on conflict. No behavior exists that only the file can express; the file itself never ships.

```yaml
# unify.yaml — the committed invocation
output: dist
pretty-urls: true
base-url: https://example.com/
```
