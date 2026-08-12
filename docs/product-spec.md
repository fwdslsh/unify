# unify — Product Specification (MVP)

**Status**: Draft v2, for review
**Role**: This document defines what unify is, who it serves, and the complete feature surface of the MVP. Where it conflicts with `app-spec.md` or `dom-spec.md`, this document wins; those documents will be rewritten or retired to match it during realignment. Until realignment lands, the released tool and this document intentionally differ — §7 maps the distance; treat mismatches as planned work, not documentation bugs.

---

## 1. What unify is

Web pages have needed shared headers, footers, and navigation since the beginning — and HTML still has no way to express that. Every existing answer forces a trade the author didn't ask for: a JavaScript framework, a templating language, a config-heavy build system, or copy-paste.

unify is a static site generator for **front-end designers and hobbyists** — people fluent in HTML and CSS who have no interest in JavaScript frameworks, templating languages, or build tooling. It lets them define a header, footer, nav, or page layout once, in plain HTML files, and have those rendered into every page of the site. The pitch in one line: **HTML-native composition — no expression language, no client runtime**. The output is the HTML and CSS the author wrote; unify adds no JavaScript of its own. unify replaces copy-paste chrome, hand-edited HTML, and Apache SSI — it does not compete with Hugo, Eleventy, or Astro (§5).

The entire authoring surface is four things, learnable in five minutes:

| You want to… | You write… |
|---|---|
| Reuse a fragment (nav, footer, badge) | `<include src="/_includes/nav.html"></include>` |
| Wrap pages in a layout | nothing (automatic `_layout.html`) — `data-unify="/path.html"` to pick one, `data-unify="none"` to opt out |
| Mark a region of a layout as replaceable, or replace it from a page | `class="unify-hero"` |
| Keep a page or folder out of the built site | name it with a leading underscore: `_draft.html`, `_includes/` |

If a capability cannot be expressed with these four, it does not belong in unify.

**Design rules that govern every feature decision:**

1. **Explainable in one sentence** to someone who knows only HTML and CSS. If a rule needs a diagram, it's out.
2. **Every source file is real HTML a browser can parse as written.** Layouts and pages are complete documents (a layout's default content is its preview); fragments are well-formed snippets; no template holes, no unbalanced markup. A source file opens and edits anywhere — but *composed* preview is the built site: `unify dev` (§4) serves `dist/` and reloads on save. Previewing an uncomposed source tree is a post-MVP convenience (§6), not a promise this spec makes.
3. **Polyfill-able**: the **HTML** composition model must be implementable by a small (~200-line) browser script that produces the same DOM at design time as the CLI produces at build time. The polyfill is the complexity budget — any HTML rule too intricate to live in it is too intricate to ship. Markdown is explicitly outside that budget: converting `.md` requires the build, and no rule about Markdown is constrained by this test.
4. **Zero configuration.** Conventions, not config files.

---

## 2. The five-minute site (golden path)

This walkthrough is the product. Every release must keep it true, and the end-to-end test suite builds exactly this site and asserts the output.

```bash
unify init          # scaffold a starter site into src/
unify dev           # build, watch, serve, reload — one command, one terminal
# …edit, save, browser reloads…
unify build         # write the final site to dist/
# upload dist/ anywhere: GitHub Pages, Netlify, a $3 shared host
```

`unify init` produces:

```
my-site/
└── src/                  # the source root — everything here ships
    ├── _layout.html      # the site chrome — one complete HTML page
    ├── _includes/
    │   └── nav.html      # a fragment
    ├── index.html        # a page
    ├── about.md          # a Markdown page — equal citizen
    └── assets/
        └── style.css
```

Scaffolding into `src/` is what makes zero-config safe: the source root holds only what you meant to publish, so nothing outside it — `.git/`, `.env`, notes, screenshots, the output directory — can reach the built site. A flat site with no `src/` still builds with no flags (§4).

**`_layout.html`** — a complete page you can open in a browser right now. Its default content is its own preview:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>— My Site</title>
    <link rel="stylesheet" href="/assets/style.css">
  </head>
  <body>
    <include src="/_includes/nav.html"></include>
    <main>
      <p>Page content appears here.</p>
    </main>
    <footer class="unify-footer">
      <p>© My Site</p>
    </footer>
  </body>
</html>
```

**`index.html`** — also a complete page. It doesn't mention the layout; the nearest `_layout.html` applies automatically:

```html
<!doctype html>
<html>
  <head>
    <title>Home</title>
  </head>
  <body>
    <h1>Welcome!</h1>
    <p>This content lands in the layout's &lt;main&gt;.</p>
  </body>
</html>
```

Built result: the layout, with its `<main>` content replaced by the page's body, and the page's title prepended to the layout's: `<title>Home — My Site</title>`. The separator lives in the layout, so pages write only their own name.

**Overriding a marked region** — the layout marked its footer with `class="unify-footer"`, so any page may replace it by using the same class:

```html
<body>
  <h1>Contact</h1>
  <p>Main content as usual.</p>
  <footer class="unify-footer">
    <p>© My Site — <a href="mailto:hi@example.com">email us</a></p>
  </footer>
</body>
```

**`about.md`** — Markdown pages work identically; frontmatter supplies the head:

```markdown
---
title: About
description: Who we are
og:
  image: /assets/team.jpg
---

# About

Everything here is converted to HTML and dropped into the layout
exactly like an HTML page's content.
```

That is the whole product. There is nothing else to learn.

---

## 3. Composition model (normative — the composition rules; §4 carries the file, exclusion, and error rules)

### 3.1 Fragments: includes

- `<include src="/path/file.html"></include>` is replaced by the file's contents. The paired form shown here is what documentation teaches and what every example uses. The void form (`<include src="…">`) builds identically — the build inlines includes textually before any parsing — but browsers parse an unclosed `<include>` as an element that absorbs the siblings after it, so a source file using it previews wrong in a browser even though it builds right. Both forms are supported; the void form carries an advisory (§4) naming that trade.
- Paths starting with `/` resolve from the source root; all other paths resolve relative to the including file.
- Fragments may include other fragments (cycle-safe, depth-capped; a cycle or depth violation is a problem — a truncated chain is content the author wrote that would not appear).
- A fragment may be Markdown; it is converted before inlining (frontmatter ignored).
- Includes work in Markdown pages too: the tags pass through conversion as raw HTML, then resolve normally.
- Both the tag and the comment form work anywhere in a document, `<head>` included — placement never matters to the build. (In browser preview, `<head>` hoists unknown elements into the body, so the comment form is the faithful one there.)
- **Legacy alias**: Apache SSI syntax — `<!--#include virtual="/path" -->` and `<!--#include file="rel.html" -->` — is supported indefinitely for compatibility and migration from real SSI sites, but documentation teaches `<include>`.

### 3.2 Layouts: the cascade

**Layout selection** (first match wins):

1. `data-unify="none"` on the page's `<html>` or `<body>`, or Markdown frontmatter `layout: none` — **opt out**: the page is emitted as-is, with includes and URL rules still applied. This is how 404 pages, redirect stubs, embeddable demos, standalone landing pages, and externally supplied documents live in a site that otherwise has a layout.
2. `data-unify="/path.html"` on the page's `<html>` or `<body>` — explicit choice.
3. Markdown frontmatter `layout: /path.html` — the Markdown equivalent.
4. The nearest `_layout.html`, looking in the page's directory, then each parent up to the source root.
5. `_includes/layout.html` as the site-wide fallback.
6. No layout found: the page is emitted as-is.

A layout may itself declare `data-unify` to chain into a parent layout (section layout → site layout). Chains are depth-capped.

**Merging a page into a layout** — four rules:

1. **Areas.** A layout element with a `unify-*` class is a *public area*. A page element carrying the same class replaces that area's **children** (the layout element itself, its tag and attributes, stays). If a page supplies the same area class more than once, their contents are concatenated in page order. An area class should appear once per layout; duplicates are an advisory and the first is used.
2. **Default slot.** Page body content not addressed to any area replaces the children of the layout's `<main>` — except that **areas inside `<main>` are pinned**: they stay exactly where the layout put them, and only `<main>`'s *unpinned* children are replaced. The page's default content lands at the position of the first unpinned child removed, so a layout can wrap an area and ordinary default content together in `<main>` and get both. Pinned areas remain replaceable by rule 1 like any other area. A layout with no `<main>` and no areas contributes its head and passes the page's body through unchanged — a head-only layout (shared stylesheet, shared metas, no body chrome) is a legitimate construct, not a mistake.

   This is what makes semantic HTML work — a hero belongs inside `<main>`, and a layout may write it there:

   ```html
   <main>
     <section class="unify-hero">Default hero</section>   <!-- pinned: survives, overridable -->
     <article>Default content</article>                    <!-- unpinned: replaced by the page -->
   </main>
   ```

   A page supplying both a `unify-hero` element and ordinary content gets its hero in the section and its content in place of the `<article>`; a page supplying only content keeps the layout's default hero; a page supplying only a hero keeps the layout's default content.

   **Incoming body content is unwrapped once**: if it contains a `<main>`, that element is replaced by its children before the merge — so a page written as a complete semantic document (which §1 rule 2 asks for), and a chained layout carrying its own `<main>`, both compose without nesting `<main>` inside `<main>`. No other element is unwrapped.
3. **Head merge.** Start with the layout's `<head>`. The page's `<title>` is prepended to the layout's, joined with a space, so the separator is written once, in the layout: layout `<title>— My Site</title>` plus page `<title>Home</title>` emits `<title>Home — My Site</title>`. The site name and the separator both live in one file, pages write only their own name, and a page with no title keeps the layout's alone. The separator stays the author's choice — an em dash, a pipe, a middot, or nothing at all. A page `<meta>` replaces a layout `<meta>` with the same `name`/`property`; other page head elements are appended after the layout's, so page CSS loads last and wins the cascade. Exact-duplicate stylesheet/script URLs are deduplicated, compared after §3.5 resolution — so a page's `assets/style.css` and a layout's `/assets/style.css` are one reference, not two downloads. A page `<meta charset>` is dropped in favor of the layout's, which stays first in the head; if the layout declares none, the page's is kept and moved first. Identical charsets are silent (every complete document has one); a page declaring a *different* charset from the layout's is an advisory.
4. **Root attributes.** On `<html>` and `<body>`, the page's classes are added to the layout's, and any other attribute the page explicitly sets wins over the layout's — so a page can carry `class="home"` styling hooks or set its own `lang`, `dir`, or `data-theme`. Attribute merging exists nowhere else: an area element keeps the layout's tag and attributes.

Every rule above has worked input→output examples in the conformance spec (split out of this document — §7 item 16), which is where implementers settle edges and where the test fixtures live.

Edge rules, for determinism: layout chains compose pairwise — the page merges into its layout by these four rules, and that result merges into the parent layout the same way, so heads and body classes accumulate up the chain. A page area class that matches no layout area is an advisory, and its content flows to the default slot instead — nothing is lost, so the build still publishes. If the layout has areas but no `<main>`, unaddressed page content would be omitted: that is a problem, located, naming the fix (add `<main>` or an area). Duplicate `<main>` elements in a layout: the first wins, an advisory.

**Content the author wrote is never dropped without failing the build.** Any case where page content or a head element would not appear in the output is a problem, located, naming the fix — and advisories never involve losing something the author wrote. That rule assigns every case above, and every case not yet enumerated.

`data-unify` attributes are removed from output, and a `<script>` carrying `data-unify-polyfill` is removed with it (§6 — an author-signed request to strip a design-time aid, not unify deciding to touch the author's JavaScript). That marker is the only one: any other `data-unify-*` attribute, and `data-unify` on any element other than an `<html>` or `<body>`, is a problem naming the element and the file — the latter naming `<include src="…">` as the replacement, since `data-unify` is never a component import. Validating unify's own closed namespace is not the same as policing the author's attributes: `data-unify` has exactly two members, so a third is unambiguously an error. `unify-*` classes are **kept** in output — they are real CSS classes and legitimate style hooks.

### 3.3 The `unify-` namespace

All replaceable areas use the `unify-` class prefix, and the only attributes are `data-unify` and the single marker `data-unify-polyfill`. The prefix is load-bearing, not cosmetic:

- **Intent is visible**: anyone reading a layout can see exactly what pages are allowed to replace.
- **No collisions**: the mechanism can never clash with the author's own class names.
- **Tooling hook**: design-time tools — the future browser polyfill, editor extensions, a preview highlighter — can find every area with one selector (`[class*="unify-"]`) without heuristics.

### 3.4 Markdown

Markdown pages are equal citizens: converted to HTML, then processed by the same layout rules as any page. Frontmatter keys: `title` sets the page's `<title>` (prepended to the layout's, §3.2), `layout` picks the layout (§3.2), `class` adds classes to the page's `<body>`, `lang` and `dir` set those attributes on `<html>` (all via §3.2 rule 4), and any other key becomes a `<meta name="…" content="…">` tag (`description`, `author`, `robots`). Namespaced metadata is a nested block, plain YAML: keys under `og:` become `<meta property="og:image" …>` tags (`property=` is what Facebook's crawler reads); keys under any other block — `twitter:`, say — become `name=` tags (`twitter:card`). Synthesized tags merge with the layout's head by the §3.2 rules — page wins. Markdown output filenames swap `.md` for `.html`.

Headings converted from Markdown get an `id` derived from their text (lowercase; each run of whitespace becomes one hyphen; every remaining character that is not a letter, digit, or hyphen is dropped; leading and trailing hyphens trimmed; a repeat within the page gets `-2`, `-3`), so every heading is a deep link — the one thing documentation cannot do without. A heading that already carries an explicit `id` keeps it. HTML pages are untouched: unify never rewrites headings the author wrote.

Those keys are the only ones with behavior. unify has no `date`, `tags`, `categories`, `draft`, `permalink`, or `slug` handling — those are other generators' features, and here they become plain `<meta>` tags like any other key, so `draft: true` publishes the page. A leading underscore (`_draft.md`) is how a page is held back (§1, §4). A list value emits one `<meta>` per item, in order.

### 3.5 URLs

Write paths that are correct for the file you're editing — relative (`hero.jpg`) or root-relative (`/assets/style.css`); both work anywhere. URLs inside layouts and fragments are resolved against the file that wrote them and emitted root-relative, so composed markup is correct at every page depth: authors never compensate for where an include will land, and editor click-through keeps working. Rewriting applies to `href`, `src`, `srcset`, and `poster`, on the final composed page — after includes and layouts, before `--pretty-urls` and `--base-url`. It does not reach inside `<style>` blocks or `style` attributes: a `url()` written in a layout or fragment must be root-relative, or live in a stylesheet file. Stylesheets never need rewriting: mirror-copy ships every CSS file at its source-relative location, so `url()` references inside them keep working untouched.

---

## 4. CLI (complete surface)

```
unify [build]              build the site (default command)
unify dev                  build, watch, serve, and reload — the inner loop
unify watch                build + rebuild on change, no server (pair with your own)
unify init [template]      scaffold a starter site (default, basic, blog, docs, portfolio)

Options:
  -s, --source <dir>       source directory (default: src/ if it exists, else .)
  -o, --output <dir>       output directory (default: dist)
      --clean              empty the output directory first
      --exclude <glob>     globs never emitted, still usable by the build (repeatable; default: _*)
      --pretty-urls        about.html → about/index.html, and rewrite internal links to match
      --base-url <path>    site is served from a subpath (e.g. /repo-name/): prefix root-relative links in the output
      --dry-run            run the full build and every check, print the report, write nothing
      --strict             advisories count as problems for the exit code
  -p, --port <n>           port for `unify dev` (default: 3000)
  -v, --version            print version
  -h, --help               print help
```

That is the entire CLI. Behavior notes:

- **File handling**: `.html`/`.md` files are pages (processed). **Everything else is copied through as-is**, mirroring the source tree — what you see in your folder is what ships, bytes untouched — compress images before adding them. One option holds files back: `--exclude`, a set of globs whose matches are never emitted but remain build material — includable, usable as layouts. Its default is `_*` — the same naming convention layout discovery uses (§3.2), so the files the build consumes are the files the output omits, and `init && build` is correct with zero configuration (an empty default would ship `dist/_layout.html` as a junk page). Set your own globs and they replace the default, like any option; keep `_*` in your list if you still want it. Replacing it cannot silently publish the build's own working files: an emitted file that is a `_`-prefixed page, or whose path contains a `_`-prefixed directory segment, is a problem naming the file and the `--exclude` line that fixes it (`--exclude '_*' --exclude 'drafts/**'`). That covers `_layout.html`, `_includes/`, `_scripts/`, `_notes/`, and `blog/_draft.md`, while root-level non-page files like `_headers` and `_redirects` still ship — Netlify sites need them, for the same reason dotfiles ship. Everything in the source root ships unless a glob holds it back, so anything that is not part of the site — notes, drafts, scratch files, scripts — belongs under a leading underscore. Links to anything not emitted are caught by the reference check like any other broken reference.
- **Never-shipped files (safe by default).** Independent of `--exclude`, and never replaceable by it: the output directory, VCS metadata (`.git/`, `.hg/`, `.svn/`), `node_modules/`, `.env` and `.env.*`, and `unify.yaml`. `--exclude` is an authoring option; this is a footgun guard, in the same family as writing output atomically. It stays deliberately short and literal — no scanning, no heuristics, no "looks secret" guessing (§5's no-security-theater rule). Note what is *not* on it: dotfiles ship. `.htaccess` and `.nojekyll` are exactly the files this audience needs to deploy. Building from a directory you didn't scaffold (`-s .` in an existing project) prints the file count copied and points at `--dry-run` — an honest report, not a guess about your intent.
- **Output safety.** `--clean` refuses to run when the output directory is, contains, or is contained by the source root or the working directory — `-o . --clean` is an error, not a deleted project. Two sources that would write the same output file (`about.md` and `about.html`; a `--pretty-urls` move landing on an existing `about/index.html`) are a problem naming both sources — never a silent last-write-wins. Outputs differing only by letter case are an advisory (they collide on case-insensitive filesystems and hosts). Symlinks are followed only while they resolve inside the source root; one pointing outside is treated as absent, with an advisory.
- **`unify.yaml` is saved flags, nothing more.** Every option above may live in an optional `unify.yaml` at the source root — same names, same meanings, CLI wins on conflict — so local runs and CI share one committed invocation instead of retyping flags. No behavior exists that only the file can express; delete it and pass flags instead, and nothing changes. `init` does not create one, and the file itself never ships to output.
- **Subpath hosting.** GitHub Pages project sites serve from `username.github.io/repo-name/`, where root-relative links would break. `--base-url /repo-name/` prefixes root-relative URLs (`href`, `src`, `srcset`) in the built HTML; source files stay rooted at `/`, so local preview keeps working. `--base-url` also accepts a full URL (`https://example.com/`): the origin absolutizes URL values in `og:`/`twitter:` metas and `rel="canonical"`, which crawlers require to be absolute.
- **Pretty URLs move pages, never assets.** Every reference in a moved page — `href`, `src`, `srcset` — is rewritten to keep pointing at the same target, so `![diagram](diagram.png)` beside a Markdown page keeps working.
- **`unify dev` is the inner loop: one command, one terminal.** It builds, watches, serves `dist/` on `localhost:3000`, and reloads the browser on every rebuild. The audience installs a single binary and has never heard of Bun, npm, or `npx` — telling them to run a second tool in a second terminal before they can see their own site is the wrong first five minutes, and it is the one place where "delegate it" cost more than it saved. Scope is deliberately minimal and fixed: static files, directory indexes, a 404 page, and reload. No proxying, no HTTPS, no middleware, no plugins, no config — if a request needs any of that, it needs a real server, and `unify watch` (no server, same watch contract) exists precisely so any external tool can own serving. Reload is injected only into pages served by `unify dev` and exists nowhere in `unify build` output, which keeps §5's no-JavaScript rule exactly true for everything that ships.
- **The watch contract** (`dev` and `watch` alike). Saves are coalesced into one rebuild; a save landing mid-rebuild queues exactly one follow-up — no change is ever dropped. Every rebuild is a full rebuild (no cache, no incremental machinery — plain HTML is fast enough, and it guarantees watch output is always identical to a fresh `unify build`). Writes are minimal and atomic: a file whose content didn't change is not rewritten (external watchers see exactly what changed — no reload storms), outputs land via temp-then-rename (a server never reads a half-written file), deletions are precise, and `--clean` applies only at startup.
- **Broken builds show in the browser.** While watching, a page that fails to build is emitted as a default error page carrying the located error and details — the reload puts the diagnosis in front of you, and the next successful rebuild replaces it. `unify build` never emits error pages.
- **`build` publishes all-or-nothing.** Composition into a temporary tree is best-effort — every problem in the site is found and reported in one pass, so authors never fix errors one run at a time — but the output directory is only updated if there were zero problems. A build that reports errors leaves the previous `dist/` untouched and exits non-zero: a half-composed page with a missing header can never be uploaded by someone who didn't read the terminal. Iterating on a broken site is what `dev`/`watch` are for; publishing is what `build` is for, and it does not publish broken sites.
- **One error contract, loud and located.** Every problem — a missing include or layout, a page that fails to compose, a broken internal reference, an output collision — is reported once, naming the file, the reference, and the line where known. After every build, internal references are checked against the emitted files — every URL the output contains, not only the ones rewriting touches, so anything the rewriter does not reach fails loudly instead of 404ing quietly. A link, image, or asset that resolves to nothing — a renamed page, an image stranded in an underscore folder, a path whose case doesn't match — is a problem like any other. Silent failure is a bug by definition. Exit 0 means the site was published (with `--dry-run`, would have been); non-zero means nothing was published and the previous `dist/` is untouched — except under `--strict`, where advisories alone also exit non-zero without changing what was published. Diagnostics go to stderr, the build summary and `--dry-run` list to stdout, both ordered by path then line, so two runs over the same tree print the same bytes. Every line begins with its location and severity (`src/about.html:12: problem: …`); that prefix is stable, the message after it is prose and is not a contract. Set `DEBUG=1` for stack traces.
- **Advisories (the lint layer).** Beside problems sit *advisories* — hygiene findings that break nothing: a page `<header>`/`<footer>` outside any area (probably meant to override one), an unclosed `<include>` (builds fine, previews wrong — §3.1), a working-format file headed for the output (`.psd`, `.fig`, a multi-megabyte original), a file used as a layout or include that also ships as its own page. Advisories print but never affect what is published; with `--strict` they affect the exit code too, so a stray `.psd` can never cost you a publish. Plain language, no rule codes.
  An advisory that fires on a correct site is a bug in the advisory: `unify init && unify build --dry-run --strict` exits zero, and the end-to-end suite (§7 item 15) asserts it. Because §5 refuses rule codes there is no way to silence one you have chosen to accept, so every advisory unify ships is permanent and the list stays short enough to read at a glance. Advisories report what the build observed and what it did; they never instruct the author to restructure markup that composed correctly.
- **`--dry-run` is the whole build minus the writes.** Composition, URL rewriting, the reference check, every problem and advisory — reported exactly as a real build would report them, plus a list of what would be written, copied, and deleted, each page naming what it composed from — `write dist/about.html ← about.md + _layout.html`, or `← 404.html (no layout)` for an opt-out. Layout resolution is the one fact in §3 that cannot be read from a single file, and this is the mode whose whole purpose is telling you what the build would do. `unify build --dry-run --strict` is the one-line CI lint.
- **Composing with other tools: the plugin interface is the filesystem.** unify reads one directory and writes another, and that is the whole extension story — there is no plugin API, and none is planned. Generators run before (`node _scripts/gen-blog.mjs && unify build`) and write pages *into the source tree*, where they are indistinguishable from hand-authored ones: layouts apply, heads merge, URLs resolve, and the reference check audits their output — rename a post and the build reports the stale index link. Post-processors run after and read `dist/`, which the watch contract makes safe to consume (atomic writes, unchanged files untouched, precise deletions). The default `_*` exclusion gives that tooling a home inside the source tree — `_scripts/` never ships. Builds are deterministic: same tree in, same tree out. Anything unify declines to do (§5) can be done on either side of it by a tool the author owns, in whatever language they like.
- **Install story leads with the binary.** The headline install is the standalone single-file executable (Linux/macOS/Windows) — the audience has never heard of Bun and shouldn't need to. Bun/npm installs are the secondary, developer path. Bun is the only supported runtime; no Node/Deno claims.

---

## 5. Non-goals

Things unify deliberately does not do, even if asked:

- **unify ships no JavaScript, ever.** Authors may write and ship whatever scripts they like — script files copy through byte-for-byte and `<script>` tags survive composition untouched (§3.2 head merge dedupes only exact-duplicate tags). What never happens: unify injecting, generating, or rewriting JS in built output. No runtime, no hydration, no helper snippets — `unify build` emits exactly the JavaScript the author wrote and not one byte more. Two bounded exceptions, both author-visible: `unify dev` injects a reload script into the pages *it serves* (never into `dist/`), and a script tag the author marks `data-unify-polyfill` is removed by the build because the marker asks for it (§3.2).
- **No templating language.** No variables, loops, conditionals, or expressions in HTML. The moment unify grows a DSL it has become the thing it exists to escape. The visible costs, accepted with eyes open: the footer year is edited once a year, in one include; every HTML page carries the standard document skeleton, while Markdown pages don't; and anything derived from a set of files — a post index, a feed — is either maintained by hand or generated by a script the author owns, before the build (§4, composing with other tools). That seam is the sanctioned answer, not a workaround: the blog template ships a ~40-line, zero-dependency `_scripts/gen-blog.mjs` that writes `blog.html` and `feed.xml` from a folder of posts, and the build then treats both as ordinary source. A tool the author reads in one sitting beats a DSL the tool owns. Active nav state is *not* on that list: the page sets `<body class="home">` (§3.2 rule 4) and the stylesheet does the rest — `body.home .nav-home { … }`. Styling only, no `aria-current`; that is the trade.
- **No configuration language.** `unify.yaml` is optional and is nothing but saved CLI flags (§4). No behavior may exist that only a config file can express — if a feature needs real configuration to explain itself, the feature is wrong.
- **No general-purpose web server.** `unify dev` serves static files and reloads, and that is its permanent scope (§4): no proxying, HTTPS, middleware, plugins, or config. Anything beyond it is delegated to a real server, which `unify watch` exists to pair with.
- **No migration path from other site generators.** unify's audience is people hand-maintaining HTML, copy-pasting headers, or running Apache SSI (whose syntax §3.1 supports indefinitely for exactly this reason). Moving a Hugo, Eleventy, Jekyll, or Astro site here means giving up collections, templating, and data files — features those tools exist to provide. unify competes with copy-paste, not with them.
- **No component framework.** No props, no attribute-merge semantics, no scoped component imports with override contracts. Fragments (includes) plus layout areas cover the audience's need.
- **No governance machinery.** Checks speak plain language — no rule codes to memorize, no contract/documentation blocks, no semver-guarded selector APIs.
- **No security theater.** Path traversal safety in include resolution is internal engineering, always on, invisible. unify does not scan the author's own HTML for "vulnerabilities" or gate builds on it.
- **No build-cache/incremental system** until real users have real sites that are actually slow.
- **No collections, pagination, RSS, or taxonomies** built into the tool. This is the "every blog eventually wants it" trap. The answer is the composition seam above — a generator the author owns, run before the build — and that answer is deliberately better than a feature: it is inspectable, it costs the tool nothing, and its output is checked by the reference check. Building it in gets revisited only on demonstrated demand from authors who have used the seam and found it wanting, and only if it survives the one-sentence and polyfill rules.
- **Not advertised for blogs or documentation sites at launch.** Both work — the blog template plus its generator is a real workflow, and Markdown pages get heading anchors (§3.4) — but a docs site wants generated navigation and search, which live outside the tool. Launch positioning is where unify is unambiguously strongest: brochure, portfolio, campaign, and project sites; existing hand-written HTML adopting shared chrome; SSI migration. Advertising blogs and docs as headline use cases waits until the recipes (§6) make them boring.

---

## 6. Post-MVP candidates (rough priority order)

1. **Recipes: deploy and compose** — GitHub Pages / Netlify walkthroughs and an Actions workflow in the starter templates, plus a short cookbook for the §4 seam: post-build search with Pagefind, a git-based editing UI (Decap/Sveltia) over the source tree, external link checking, image compression, and the blog generator explained line by line. Non-normative, and the cheapest way to raise the product's ceiling without growing the tool. Includes the honest list of what does *not* fit: per-page parameterization, i18n, and bundler pipelines.
2. **Sitemap generation** — uses `--base-url`'s origin (§4); cheap, expected for SEO, and currently the most-missed omission for any real site.
3. **Browser preview polyfill**: the ~200-line script implementing §3's **HTML** rules at runtime, so an HTML source tree is viewable without building (Markdown is out of scope — §1 rule 3). Loading is author-controlled: a `<script src="…" data-unify-polyfill></script>` tag in the layout, which the build strips exactly as it strips `data-unify` attributes — so the preview aid never reaches `dist/`. Doubles as the conformance check for the HTML rules: build and polyfill must agree.
4. **HTML minification** (`--minify`).
5. More and better `init` templates.
6. **Markdown include shorthand** — a Markdown-native spelling of `<include>`, considered if real authoring demand appears.
7. **`--run <cmd>`, a pre-build hook** — sugar for the §4 seam, so `unify dev` can re-run a generator when sources change instead of the author running a second watcher. Only if the two-process inner loop proves to be genuine friction; `&&` already covers `build`.

---

## 7. Realignment yardstick: keep / cut / fix

How the current repository maps to this spec. This is the work plan's table of contents, not the work plan itself — a snapshot of the repository at the time of writing, deleted from this document once realignment lands.

### Keep (trimmed to §3/§4)

- The cascade engine core (`UnifyProcessor`): area matching, head merge, layout chaining — reduced to the four rules in §3.2.
- `<include>` inlining and the SSI processor (legacy alias).
- Markdown pipeline (`markdown-it`, `gray-matter`) trimmed to §3.4 frontmatter.
- The file watcher, rebuilt around the §4 watch contract.
- The dry-run reporter, rewired to the single pipeline (§4 `--dry-run`).
- Config-file loading, reduced to the §4 flags mirror (`unify.yaml`).
- `init` command (repaired: positional template argument, genuinely distinct templates).
- Path-traversal validation as invisible internal safety.
- Standalone binary builds — promoted to the headline install.
- The `linkedom` dependency, accepted openly (drop "zero-dependency" and "HTMLRewriter-powered" claims from all docs).

### Cut

- All slot/`<template>`/`data-slot` documentation and claims (the feature does not exist).
- `<style data-unify-docs>` contract blocks and their build-removal behavior — currently taught in `dom-spec.md`, `app-spec.md`, `getting-started.md`, `include-syntax.md`, and `CLAUDE.md`. §3.3's class prefix is the only area-discovery mechanism the product ships, and §5 already refuses contract/documentation blocks.
- The `serve` command's surface area — but **not** the serving code itself: the static-file server and live-reload transport are harvested into `unify dev` (§4), stripped to static files plus reload. What is cut is everything around them (proxying, options, configurability) and the pretense that `serve` is a separate product concept.
- Component mode, the attribute-merge matrix, ID-stability/ARIA rewriting.
- The linter's rule-code machinery (U001–U008, `--fail-on`, `--fail-level`) — the useful checks survive as §4's plain-language advisories; implementations may be harvested.
- Security scanner and `[SECURITY]` build gates.
- The glob pipeline: `--copy`, `--ignore`, `--ignore-render`, `--ignore-copy`, `--render`, `--auto-ignore`, `--default-layout`, and the classification-tier system behind them.
- Asset *reference tracking* (copy-only-what's-referenced) — replaced by mirror-copy (§4), which is simpler and matches user expectation.
- Incremental builder, build cache, duplicate dependency graphs; one build pipeline remains.
- Short-name layout resolution (`blog` → `_blog.layout.html`) and every path-guessing heuristic beyond §3.1/§3.2's two path forms.
- Dead modules (commented-out resolvers, orphaned minifier/normalizer/clean command, unused cascade modules) and the tests that exercise them. The orphaned link-normalizer and minifier may be harvested when implementing pretty-URL links and post-MVP minify.
- Mock scaffolding and fixture-driven behavior in production paths; the output re-formatter (output preserves source formatting instead of re-indenting the world).

### Fix (the MVP gap)

Not small. The authoring *model* is small — four primitives, and the concept count did not grow in this revision — but the engine underneath is a real build tool: URL provenance and rewriting, pretty-URL link fixup, output collision detection, the reference check, cross-platform atomic watching, transactional publishing, and (post-MVP) polyfill parity. Sequenced roughly by dependency:

**Do first — the repository is teaching the wrong product**

0. Retire `dom-spec.md` and rewrite `CLAUDE.md`. `dom-spec.md` still teaches component mode, `<style data-unify-docs>` contract blocks, and the U001–U008 rule codes, and `CLAUDE.md` names it the normative reference — so the repository is currently the largest source of wrong unify priors in existence, for human readers and for every coding agent that reads it. Until the conformance spec (item 16) replaces it, mark it superseded in-document. Costs nothing, blocks nothing, and every day it waits it teaches someone a feature that does not exist.

**Composition spine**

1. Automatic `_layout.html` discovery (§3.2 items 4–5): currently non-functional; it is the single most important convention in the product.
2. Default-slot behavior exactly per §3.2 rule 2: the `<main>` unwrap, and **pinned areas inside `<main>`** — the case that made the original four rules ambiguous. Pinning *depth* (whether a wrapper containing an area is itself pinned) is deliberately unsettled here and is decided in the conformance spec (item 16) with worked examples; until it lands, layouts should carry areas as direct children of `<main>`.
3. Layout opt-out: `data-unify="none"` / `layout: none` (§3.2 item 1).
4. Head merge correctness (duplicate `<title>` from Markdown; unrequested synthesized tags).
5. Markdown heading `id`s (§3.4).

**URLs and output**

6. `--pretty-urls` link rewriting (files currently move but links break).
7. Output collision detection (same-output sources, pretty-URL landing collisions, case-only twins) per §4.
8. Transactional `build`: compose into a temp tree, publish only on zero problems, leave the previous `dist/` intact otherwise.

**Safety**

9. The never-shipped list (`.git/`, `node_modules/`, `.env*`, output dir, `unify.yaml`) as a layer beneath `--exclude`; the `--clean` guard; symlink containment. Path-traversal validation stays as invisible internal safety.
10. `init` scaffolds into `src/`; positional template argument; genuinely distinct templates, with the blog template shipping `_scripts/gen-blog.mjs`.

**Loop and checks**

11. The watch contract (§4): coalesced full rebuilds, skip-unchanged atomic writes, precise deletions, error pages. Verified by an equivalence test (watch output after any edit sequence ≡ fresh build) and a byte-stability test (a no-op rebuild writes nothing).
12. `unify dev`: watch plus a static server plus reload injection, harvested from the existing serve code and stripped to that scope.
13. The checks surface (§4): advisories, `--strict`, `--dry-run` on the single pipeline; `--exclude` and the `unify.yaml` flags mirror.

**Documentation**

14. Honest packaging: version string, working `package.json` scripts, Bun floor stated once, README rewritten to teach only this spec.
15. An end-to-end suite that builds the §2 quickstart site and asserts the output — the suite that makes the golden path unbreakable.
16. **Split the conformance spec out of this document.** This spec is the product contract: what unify is, who it serves, what it refuses. The normative rule-by-rule reference — every §3 merge rule with worked input→output examples, the collision matrix, URL rewriting order, the watch contract, the error/advisory taxonomy — moves into a conformance document (the rewrite `dom-spec.md` was already slated for), with each example doubling as a test fixture. The one-sentence rule (§1) governs which authoring rules may exist, not how precisely they are specified for implementers: a rule the author learns in one sentence may still need a page of edge cases to implement identically twice, and pretending otherwise is what left rule 2 ambiguous.

---

## 8. Success criteria

- A newcomer goes from nothing to a built, deployed-ready site in **under five minutes** using only the README, with two commands (`unify init`, `unify dev`) and one terminal.
- **The rules an author needs fit on one screen.** `docs/authoring-rules.md` states every authoring rule and nothing else, in under sixty lines, and the end-to-end suite (§7 item 15) builds the §2 site driven only by it. That file is the whole product surface in a form anyone — a newcomer, a reviewer, or a coding agent — can hold at once; if a rule cannot survive the trip into it, the rule is too complicated.
- The README teaches **100% of the product** and is read in one sitting; the HTML composition model stays small enough that the browser polyfill remains feasible. The measure of smallness is the **authoring surface** — the four primitives of §1, unchanged since v1 — not this document's length. This spec is the product contract and grows when honesty requires it; implementation minutiae belong in the conformance spec (§7 item 16), and §7 itself is deleted when realignment lands.
- **Nothing you didn't mean to publish ever reaches `dist/`, and a build that reports errors never publishes at all.** Deploy safety is a success criterion, not an implementation detail.
- A site built today builds identically in five years. No toolchain churn, no framework migrations, no config updates.
- At least one external open-source project adopts unify for its website — the first proof of the "more peaceful internet" ambition. (Docs sites follow once §6's recipes land; they are not the launch bet.)
