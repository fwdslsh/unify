# Eleventy inside `--generate`, htmx on top

**Role**: The advanced recipe for keeping a generator you already have — Eleventy here,
but the shape is the same for anything that reads a content tree and writes files — and
letting unify own every page's chrome, `<head>`, URLs and checks. unify needs to know
nothing about Eleventy, and Eleventy needs to know nothing about unify: the seam is one
directory. Every path, command, literal and number in this document was taken from
`examples/eleventy-htmx` by running it. Read
[`../authoring-rules.md`](../authoring-rules.md) first — every page, layout and fragment
below obeys it — and [`../integrations.md`](../integrations.md), whose five recipes cover
the other things `--generate` is used for.

This is the stack at its most elaborate. §14 is the honest counterweight: a normal unify
site is HTML, CSS and unify, and it should stay that way until something forces the issue.

Every command below is run from `examples/eleventy-htmx`, after `npm install`, and `unify`
means the installed CLI. From a checkout of this repository, substitute
`bun ../../src/cli.js` or `node ../../src/cli.js` — same flags, same output, same exit
codes.

## 1. Why combine these tools

unify has no collections, no data cascade, no pagination, and no taxonomy. That is a
decision rather than a gap — `authoring-rules.md` says it in one line ("Derived files (a
post index) come from a script you write and run yourself"), and `unify audit` will tell
you so to your face if you write a `tags:` key and wait for an index to appear:

```
$ unify audit -s src --generate _scripts/eleventy.mjs --pretty-urls
notes/2026-06-30-firmware-2-6-0.md: incomplete: the page declares <meta name="tags">, and unify built nothing from it: no index page, no archive, no feed of any term, and no route [taxonomy-inert]
  fix: write the index yourself — a script that emits the page before the build — or drop the keys if nothing reads them
audit: 0 broken, 1 incomplete
```

Eleventy has all four, plus permalinks, and it is happy to be driven from a script. unify
is the half Eleventy leaves you to assemble by hand: layout discovery, slot filling, head
merging, `--pretty-urls` rewriting, reference checking, collision detection, and a
transactional publish.

So the combination is not "two static site generators". It is one tool deciding **what
pages exist** and another deciding **what a page is**. The seam that makes it possible is
`--generate`, which is already in the CLI for reasons that have nothing to do with
Eleventy, and which needed no extension to carry it.

The worked example is a small product site — Ashgrove Instruments, who make a river-level
sensor. A front page, three documentation pages, six release notes, and a release stream
filtered by topic, where the filter is a real page you can link to *and* an htmx swap when
JavaScript is available.

## 2. Responsibilities of each layer

This table is the guidance. Everything else in this document is a consequence of it.

| Concern | Owner |
|---|---|
| Which release notes exist, and in what order | **Eleventy** — one `addCollection` over `notes/*.md` |
| Deriving a view per topic | **Eleventy** — `pagination`, `size: 1`, over a `views` list |
| Site-wide data available to every template | **Eleventy** — the data cascade, `src/_data/site.json` |
| Emitting the derived pages and fragments | **Eleventy** — three `.11ty.js` templates, nine files |
| Markdown → HTML, for every page including the release notes | **unify** |
| Page chrome: layout discovery, slots, `<include>` splicing | **unify** — there is no Eleventy layout in the tree |
| `<head>`: title join, description, charset, stylesheet, icon | **unify** |
| URL rewriting, `--pretty-urls`, reference and collision checks | **unify** |
| JSON-LD from `schema:`, `sitemap.xml`, `feed.xml` | **unify** |
| Shipping htmx and every other asset | **unify** — mirror copy, byte-for-byte |
| Whether the site works with JavaScript off | **the markup** — real `href`s, and the default view `<include>`d at build time |

Two rules keep the table true, and both are enforced by the example's configuration rather
than by discipline:

- **Eleventy writes nothing into the source tree.** Its output directory is the overlay
  unify hands it. `unify audit` therefore stays read-only, and a failed build leaves no
  debris.
- **Eleventy claims only two template formats**, `md` and `11ty.js`. Without that it also
  claims the authored `.html` pages and rewrites them.

## 3. Project structure

The whole example, as it is on disk:

```
package.json                       four scripts; @11ty/eleventy is the only dependency
package-lock.json                  committed, so npm install reproduces the tested Eleventy
node_modules/                      installed here, beside src/ — never inside it
src/
  _layout.html                     the one layout: two slots, hx-boost, the asset links
  _includes/header.fragment.html
  _includes/footer.fragment.html
  _data/site.json                  Eleventy's global data — the topic list. Holds no URL.
  _scripts/eleventy.mjs            the --generate entry point
  _11ty/eleventy.config.mjs        the two keys only a config file can set
  _11ty/lib/render.mjs             shared markup, so a page and its fragment cannot disagree
  _11ty/view-page.11ty.js          one PAGE per view     -> notes/index.html, notes/<slug>.html
  _11ty/view-fragment.11ty.js      one FRAGMENT per view -> notes/<slug>.fragment.html
  _11ty/latest.11ty.js             one fragment          -> latest.fragment.html
  index.html
  docs/index.html
  docs/quickstart.md, docs/calibration.md, docs/telemetry.md
  notes/2026-01-14-firmware-2-4-0.md   … and five more release notes
  assets/css/site.css
  assets/img/redpoll.svg
  assets/js/htmx.min.js               vendored, 51,238 bytes, htmx 2.0.10
```

Three placements are load-bearing.

**`package.json` and `node_modules/` sit beside `src/`, never inside it.** `node_modules/`
is on the never-shipped list so it could not publish anyway, but a `package.json` at the
source root is an ordinary file and would mirror-copy straight into `dist/`.

**Everything Eleventy needs lives under an underscore.** `_data/`, `_scripts/`, `_11ty/`
and `_includes/` are read by the build and never ship — the default `--exclude _*` covers
all four with no configuration.

**The helper is `.mjs`, not `.js`.** `_11ty/` is inside Eleventy's input directory and
`.11ty.js` is a template format, so a helper module named `render.js` would be scanned as
a template. `render.mjs` is not.

The build produces 23 files: 11 authored pages, 4 generated pages, 5 fragments, 3 assets.

## 4. Running Eleventy through `--generate`

`--generate` names **one file you wrote**, and its whole interface is two positional
arguments:

```js
const [, , sourceRoot, generatedDir] = process.argv;
```

`sourceRoot` is the absolute path of your source tree, `generatedDir` an absolute path to
an empty directory that exists only for this build, and the working directory is the
source root. There is nothing to import. Everything written into `generatedDir` joins the
build as ordinary source — scanned, composed, reference-checked, collision-checked, and
published inside the same transaction as the files you wrote by hand.

The runtime is unify's own, spawned as a subprocess, so a generator runs on a machine with
no Node installation. The flag's value must resolve inside the source root:

```
$ unify build -s src --generate ../_scripts/eleventy.mjs --dry-run
--generate ../_scripts/eleventy.mjs is outside the source root
  fix: name a file inside the source tree, e.g. --generate _scripts/gen.mjs
```

`src/_scripts/eleventy.mjs` is 21 lines of code under its comments. Stripped to its
decisions:

```js
import Eleventy from "@11ty/eleventy";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [, , sourceRoot, generatedDir] = process.argv;
const site = JSON.parse(readFileSync("_data/site.json", "utf8"));

const views = [
  { slug: "all", label: "All releases", blurb: "Every Redpoll release, newest first." },
  ...site.topics,
];

const eleventy = new Eleventy(".", generatedDir, {
  configPath: join(sourceRoot, "_11ty", "eleventy.config.mjs"),
  config(cfg) {
    cfg.setUseGitIgnore(false);
    cfg.setTemplateFormats(["md", "11ty.js"]);
    cfg.addGlobalData("permalink", false);
    cfg.addGlobalData("views", views);
    cfg.addCollection("releases", (api) =>
      [...api.getFilteredByGlob("notes/*.md")].sort((a, b) => b.date - a.date));
  },
});

await eleventy.write();
```

Five of those lines are not obvious, and each is load-bearing:

1. **Input `"."`, not `sourceRoot`.** Eleventy's input directory must be relative to the
   working directory. An absolute path silently disables directory data files and
   permalinks rather than erroring.
2. **Output `generatedDir`.** This is the whole integration. Eleventy writes into unify's
   overlay and nowhere else.
3. **`setUseGitIgnore(false)`.** A `.gitignore` at the source root otherwise empties every
   collection.
4. **`setTemplateFormats(["md", "11ty.js"])`.** Without it Eleventy also claims the
   authored `.html` pages.
5. **An absolute `configPath`.** Two settings exist only in a config *file*, and Eleventy's
   auto-discovery would look in the working directory — the source root, where an
   `eleventy.config.mjs` would mirror-copy into `dist/`. The file lives under `_11ty/`
   instead, and is named explicitly.

Those two file-only settings are not hygiene:

```js
// src/_11ty/eleventy.config.mjs
export default function () {
  return {
    markdownTemplateEngine: false,
    keys: { layout: "eleventyLayout" },
  };
}
```

`markdownTemplateEngine: false` is why a release note can contain a code sample with
`{{ level_mm }}` and `{% if dry %}` in it. Leave Liquid on and that prose takes the whole
build down with a parse error — a release note is content, not a template.

`keys.layout` renames Eleventy's `layout:` frontmatter key to one nothing in the tree uses,
so `layout:` in a Markdown page means unify's key and only unify's. See §7 for what happens
when it does not.

**There is no `try`/`catch`, deliberately.** If Eleventy throws, the process exits non-zero
with Eleventy's own message on stderr, and unify reports it as a located problem, stopping
the build before the scan and leaving the previous `dist/` untouched:

```
$ unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls
src/_scripts/eleventy.mjs: problem: --generate _scripts/eleventy.mjs failed (exit 1): error: Eleventy could not resolve a template
  fix: fix the generator, or drop --generate to build without it
  fix: run it directly to see its full output: bun _scripts/eleventy.mjs
EXIT=1
```

That is the whole report — no output directory was created, and nothing else ran. Catching
the error could only make it less specific.

## 5. Collections and data

`src/_data/site.json` is Eleventy's global data, and it holds no URL:

```json
{
  "name": "Ashgrove Instruments",
  "latestOnHome": 3,
  "topics": [
    { "slug": "firmware",    "label": "Firmware",    "blurb": "Firmware releases for the Redpoll sensor." },
    { "slug": "hardware",    "label": "Hardware",    "blurb": "Enclosure, bracket and board revisions." },
    { "slug": "field-notes", "label": "Field notes", "blurb": "Readings and observations from the river." }
  ]
}
```

The generator reads that file directly (the working directory is the source root, so
`readFileSync("_data/site.json")` is the same file Eleventy's cascade exposes to templates
as `site`), and derives the list both paginations run over. **Adding a topic to that JSON
adds a page and a fragment with no other edit anywhere** — verified under a running watch
in §10.

The one collection is three lines, and the sort is explicit because a build must produce
the same bytes wherever it runs:

```js
cfg.addCollection("releases", (api) =>
  [...api.getFilteredByGlob("notes/*.md")].sort((a, b) => b.date - a.date));
```

`cfg.addGlobalData("permalink", false)` is what keeps the two tools out of each other's
way. The release notes are **unify's** pages: Eleventy reads all six into the collection
and writes none of them. Only the three templates opt back in with a permalink of their
own.

Grouping is an ordinary frontmatter key that unify has no opinion about:

```yaml
---
title: "Firmware 2.6.0"
description: "Calibration is stored on the board, and the serial console gains a dump command for the whole configuration."
date: 2026-06-30T09:00:00Z
topic: firmware
schema: BlogPosting
---
```

Eleventy reads `topic` as collection data. unify, which reserves no such key, emits it as
metadata on the published page — `<meta name="topic" content="firmware">` — and neither
tool is confused. `schema: BlogPosting` is unify's, and gives that page a JSON-LD block
built from what it already declares. Use `tags:` instead and you get the `taxonomy-inert`
finding from §1: correct, because unify really did build nothing from it, and unnecessary,
because Eleventy is right there.

## 6. Generating pages and fragments

Three templates, all in `_11ty/`, and all sharing one markup module so a fragment and the
page that includes it can never disagree.

**`view-page.11ty.js`** — one page per view:

```js
export const data = {
  pagination: { data: "views", size: 1, alias: "view" },
  eleventyComputed: {
    permalink: (d) => (d.view.slug === "all" ? "notes/index.html" : `notes/${d.view.slug}.html`),
  },
};
```

**`view-fragment.11ty.js`** — one fragment per view, from the same pagination, so a page
and its fragment are always emitted as a pair:

```js
export const data = {
  pagination: { data: "views", size: 1, alias: "view" },
  eleventyComputed: { permalink: (d) => `notes/${d.view.slug}.fragment.html` },
};
```

The `.fragment.html` suffix is unify's opt-out, and it means exactly one thing: **a bare
snippet, shipped byte-for-byte, never composed into a layout.** It is not an htmx concept.
`latest.11ty.js` emits `latest.fragment.html` — three list items for the front page —
which is spliced in with `<include>` at build time and never fetched by anything.

Here is a whole generated fragment, as published (1301 bytes):

```html
  <nav class="topic-tabs" hx-target="#releases" hx-swap="innerHTML">
    <a href="/notes/" hx-get="/notes/all.fragment.html">All releases</a>
    <a href="/notes/firmware/" hx-get="/notes/firmware.fragment.html" aria-current="page">Firmware</a>
    <a href="/notes/hardware/" hx-get="/notes/hardware.fragment.html">Hardware</a>
    <a href="/notes/field-notes/" hx-get="/notes/field-notes.fragment.html">Field notes</a>
  </nav>
  <ul class="release-list">
    <li>
      <a href="/notes/2026-06-30-firmware-2-6-0/">Firmware 2.6.0</a>
      <time datetime="2026-06-30">30 June 2026</time>
      <span>Calibration is stored on the board, and the serial console gains a dump command for the whole configuration.</span>
    </li>
    …
  </ul>
```

Two things about the addresses in it are covered in §9, and they are the sharpest rules in
this document.

One detail on the slugs. `hrefFor` reads `page.inputPath`, not `page.fileSlug` or
`page.filePathStem`:

```js
export const hrefFor = (entry) =>
  entry.page.inputPath.replace(/^\.\/notes\//, "/notes/").replace(/\.md$/, "/");
```

The two convenience properties strip Eleventy's date prefix — they name `firmware-2-6-0`
for a page that is really `2026-06-30-firmware-2-6-0`, because unify's address for a page
is its source path and nothing else. Swap `hrefFor` to `page.fileSlug` and every derived
link breaks at once, which at least breaks loudly:

```
$ # export const hrefFor = (entry) => `/notes/${entry.page.fileSlug}/`;
$ unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls --dry-run
src/index.html:33: problem: /notes/firmware-2-6-0/ does not resolve to any emitted file
src/latest.fragment.html:2: problem: /notes/mounting-bracket/ does not resolve to any emitted file
src/notes/all.fragment.html:7: problem: /notes/firmware-2-6-0/ does not resolve to any emitted file
…
EXIT=1
```

Note the paths in those diagnostics. `src/notes/all.fragment.html` and
`src/latest.fragment.html` are *generated* files, reported under the source root with a
line number exactly as a file you wrote would be. Generated output is not a second class of
input — it is checked, located and blamed like everything else.

## 7. Using unify layouts over generated output

**The generated pages carry no layout of their own and no `data-layout`.** They are
ordinary unify pages, and unify's discovery walk finds `src/_layout.html` for them exactly
as it does for a hand-authored page — across the boundary between the overlay and the
source tree. That is the point of the example: a generator's output is source, not a
special case.

What `view-page.11ty.js` emits is a complete but minimal document:

```html
<!doctype html>
<html>
  <head>
    <title>Firmware</title>
    <meta name="description" content="Firmware releases for the Redpoll sensor.">
  </head>
  <body>
    <p slot="aside">Every change ships with a note. The <a href="/docs/index.html">documentation</a> always describes the current firmware.</p>
    <main>
      <h1>Firmware</h1>
      <div id="releases"><include src="/notes/firmware.fragment.html"></include></div>
    </main>
  </body>
</html>
```

and what unify publishes at `dist/notes/firmware/index.html` is (abridged):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Firmware — Ashgrove Instruments</title>
    <link rel="icon" href="/assets/img/redpoll.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/assets/css/site.css">
    <script src="/assets/js/htmx.min.js" defer></script>
    <meta name="description" content="Firmware releases for the Redpoll sensor."></head>
  <body hx-boost="true">
    <header class="masthead">…</header>
    <main>
      <h1>Firmware</h1>
      <div id="releases">…the fragment, spliced in…</div>
    </main>
    <aside class="page-aside"><p>Every change ships with a note. The <a href="/docs/">documentation</a> always describes the current firmware.</p></aside>
    <footer class="site-footer">…</footer>
  </body>
</html>
```

Every merge rule in `authoring-rules.md` is visible in that diff, and none of them knows
the page was generated:

- **Title join.** The layout carries `<title>— Ashgrove Instruments</title>`; the page
  writes only `Firmware`; the result is `Firmware — Ashgrove Instruments`. A generator that
  repeated the suffix would double it.
- **Head merge.** Charset, viewport, icon and stylesheet come from the layout; the page's
  `<meta name="description">` appends. A generated page should carry data in its head and
  nothing else.
- **Named slot.** `<p slot="aside">` is a direct child of `<body>`, which is where `slot=`
  counts, and it replaces the layout's `<slot name="aside">` tag and all. The layout supplies
  the surrounding `<aside>`, so the fill is the *contents*. Pages that write no fill — the
  front page, the release notes — ship the layout's fallback instead.
- **Bare slot.** The generated `<main>` is unwrapped and its children replace the layout's
  `<main><slot></slot></main>`.
- **URL rewriting.** `href="/docs/index.html"` becomes `href="/docs/"` under
  `--pretty-urls`, in the generated page and the authored one alike.

### Do not use two layout systems

Eleventy has layouts. Do not use them. The failure is not an error — that is what makes it
worth a paragraph.

Give `view-page.11ty.js` an Eleventy layout (via the renamed `eleventyLayout` key, so the
config's `keys.layout` is doing its job and this is a deliberate opt-in) and the build
**exits 0** and publishes 23 files. What it publishes is this:

```html
    <title>— Ashgrove Instruments — Ashgrove Instruments</title>
    …
    <header class="masthead">…the site masthead…</header>
    <main>
    <header class="masthead"><nav><a href="/">Home (Eleventy chrome)</a></nav></header>
    <!doctype html>
<html>
  <head>
    <title>Firmware</title>
```

Two mastheads, two footers, two `<title>` elements, a doubled suffix, and a literal
`<!doctype html>` in the middle of the body. The build is right to allow it: nothing the
author wrote was dropped, which is the only thing unify promises. Every check passed and
the page is garbage.

The reason is structural. An Eleventy layout produces a complete HTML document; unify then
composes that complete document into `_layout.html` as if it were a page. Two systems that
both wrap content produce content wrapped twice. **Pick one.** In this stack the answer is
unify's, because unify's is the one that also does slots, head merging, `<include>`, and
URL rewriting.

The example enforces the choice rather than trusting it: `keys: { layout: "eleventyLayout" }`
means the natural spelling, `layout:`, reaches unify and only unify.

## 8. htmx progressive enhancement

htmx is **vendored** — `src/assets/js/htmx.min.js`, 51,238 bytes, version 2.0.10, copied
from the npm package. The site loads nothing from another origin, and unify rewrites the
`<script src>` like any other URL. There is no bundler and no build step for it.

Two htmx features are in use, and nothing else.

**`hx-boost="true"` on the layout's `<body>`**, so every ordinary anchor becomes a
background fetch that swaps the body element — navigation keeps the stylesheet and the
script instead of reloading them. It is safe at that level *here* because every anchor on
every page of this site points at a real HTML document: nothing links to a raw
`.fragment.html`, and nothing links to a feed. With JavaScript off, all of them are just
links.

**One `hx-get` swap**, on the topic tabs, which live inside the swapped panel so the
`aria-current` marking updates with the list it describes:

```html
<nav class="topic-tabs" hx-target="#releases" hx-swap="innerHTML">
  <a href="/notes/firmware/" hx-get="/notes/firmware.fragment.html">Firmware</a>
```

Each tab carries a real `href` to a real page **and** an `hx-get` for the fragment. The two
are deliberately different addresses: the `href` names the page, the `hx-get` names the
fragment. htmx processes explicit verbs before it boosts anything — in the vendored source,
the node processor calls the verb handler first and only reaches the boost branch when it
returned nothing — so an anchor with its own `hx-get` is never boosted, and the tabs keep
their own smaller swap under a boosted body.

What makes this *progressive* rather than merely enhanced is that the tab's `href` points at
a page which already contains exactly the markup the swap would have produced, because that
page `<include>`s the same fragment at build time. There is no JavaScript-off fallback to
maintain: the fallback is the site.

### Do not use htmx as a component system

The temptation, once htmx is on the page, is to stop writing `<include>` and start fetching
the masthead, the footer and the nav on load. Do not.

The chrome in this example is spliced in at build time and is in the emitted bytes —
`dist/index.html` contains one `<header class="masthead">`, written there by unify. Fetch it
instead and you get: a page whose header is absent for every crawler and every reader with
JavaScript off, a visible layout shift on every navigation, and one HTTP request per chrome
element per page load, none of which the build can check because unify checks an
`<include src>` and never an `hx-get`.

`<include>` costs nothing at runtime and is verified at build time. Use htmx for the thing
that is genuinely dynamic — here, one list out of a page — and use the build for everything
that was decided before the page was served.

### Do not treat the result as an SPA

The address bar does not change on a tab swap, and nothing tries to make it. The tabs carry
no `hx-push-url`, and in htmx a request that is neither boosted nor carrying an explicit
push/replace attribute pushes nothing. The shareable address of a filtered view is the tab's
own `href`, which is a real page.

That is the whole history story, and it is the correct amount of it. As soon as a swap starts
managing history, you own back/forward, scroll restoration, focus management and the
consistency of the address bar with what is on screen — and you own them in a site whose
build system has, by design, no client runtime to help. If a project needs that, it needs an
application framework, and unify is not one.

## 9. Static versus dynamic htmx requests

This is the rule to copy, and the rule to get wrong.

**A `.fragment.html` lives two lives.** unify splices it into a page with `<include>` and
rewrites the links **in that copy**; unify also ships the file itself byte-for-byte for htmx
to fetch, rewriting **nothing**. So a link inside a fetched fragment has to be a string that
is already correct before any rewriting — and under `--pretty-urls`, the source spelling is
not that string:

```
source spelling   href="/notes/firmware.html"
  composed  ->    href="/notes/firmware/"          rewritten, correct
  fetched   ->    href="/notes/firmware.html"      never written by this build. 404.
```

So `_11ty/lib/render.mjs` emits addresses **in their published spelling** —
`/notes/firmware/`, `/notes/2026-06-30-firmware-2-6-0/` — which inverts the usual advice in
`authoring-rules.md` ("always link the real filename"). unify resolves the pretty spelling
against the emitted page, finds it, and leaves it exactly as written, so one identical
string is correct in both copies:

```
dist/notes/firmware/index.html      (composed)  <a href="/notes/2026-06-30-firmware-2-6-0/">Firmware 2.6.0</a>
dist/notes/firmware.fragment.html   (fetched)   <a href="/notes/2026-06-30-firmware-2-6-0/">Firmware 2.6.0</a>
```

Authored *pages* keep the ordinary source spelling. Only the generated fragments do this,
and only because only they are fetched.

The same logic makes every `hx-get` root-absolute. A fragment is spliced into four different
pages and fetched from four different addresses, so it cannot be relative to anything, and a
`.fragment.html` is never moved by `--pretty-urls` — its path is the same before and after.

**The pairing is the only tripwire an `hx-get` path has.** unify checks an `<include src>`
and never an `hx-get`. Introduce a typo into the `hx-get` alone and the build is perfectly
happy:

```
$ # hx-get="/notes/${v.slug}.fragmnt.html"
$ unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls --dry-run --strict
would publish 23 files to dist/
EXIT=0
```

Introduce the same typo into the `<include src>` and the build refuses to publish:

```
$ # <include src="/notes/${slug}.fragmnt.html">
$ unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls --dry-run --strict
src/notes/firmware.html:11: problem: include not found: /notes/firmware.fragmnt.html
  in: <include src="/notes/firmware.fragmnt.html"></include>
src/notes/field-notes.html:11: problem: include not found: /notes/field-notes.fragmnt.html
  in: <include src="/notes/field-notes.fragmnt.html"></include>
would publish nothing — 4 problems; dist/ would be left untouched
EXIT=1
```

Which is why every page in this example includes the fragment it also serves, with the same
string. `<include src>` and `hx-get` in a generated page are character-identical:

```html
<div id="releases"><include src="/notes/firmware.fragment.html"></include></div>
…
<a href="/notes/firmware/" hx-get="/notes/firmware.fragment.html">Firmware</a>
```

Write them that way and a fetch address that does not exist becomes a build failure. Write
them differently and it becomes a 404 your reader finds.

## 10. Development and watch workflow

Four npm scripts, carrying identical flags so the gate checks what actually ships:

```json
"dev": "unify dev -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls",
"check": "unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls --dry-run --strict",
"audit": "unify audit -s src --generate _scripts/eleventy.mjs --pretty-urls --strict",
"publish": "unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls --clean"
```

### What re-runs, measured

There is no incremental machinery anywhere in this stack. **Every save triggers one full
rebuild, and every full rebuild re-runs the generator in a new subprocess with a new,
empty overlay directory.** That is structural rather than a policy: a fresh process has no
module cache, and the overlay is a fresh temporary directory each time.

The table below was produced by running `unify watch -s src -o dist --generate
_scripts/eleventy.mjs --pretty-urls` against the example and making each edit while it ran.
23 edits produced 23 rebuilds, 23 distinct overlay directories, and 23 Eleventy runs.

| You edit | Rebuild | Eleventy re-runs | Verified in the output |
|---|---|---|---|
| **(a)** an Eleventy Markdown post (`src/notes/2026-06-30-firmware-2-6-0.md`) | yes | yes | the composed post page's `<title>`, **and** all four view fragments, all four view pages, `latest.fragment.html`, and the front page |
| **(a2)** adding a new post; deleting one | yes | yes | new page appears and enters every derived list; on delete the page is removed and the lists lose it |
| **(b)** `src/_data/site.json` (`latestOnHome: 3 → 1`) | yes | yes | `latest.fragment.html` drops to one `<li>`, and so does the front page's Latest section |
| **(b2)** `src/_data/site.json` (adding a topic) | yes | yes | a new `notes/<slug>/index.html` **and** `notes/<slug>.fragment.html` appear, and a new tab appears in every fragment; reverting removes both |
| **(c)** the unify layout (`src/_layout.html`) | yes | yes | 15 of 15 pages, 0 of 5 fragments — fragments never get a layout |
| **(d)** an include (`src/_includes/footer.fragment.html`) | yes | yes | authored pages and generated pages alike |
| **(e)** an authored page (`src/index.html`) | yes | yes | that page |
| **(f)** a fragment — see below (`_11ty/lib/render.mjs`, `_11ty/view-fragment.11ty.js`) | yes | yes | the fragment **and** the page that includes it, in the same rebuild |
| **(g)** the generator itself (`src/_scripts/eleventy.mjs`) | yes | yes | everything it emits |
| **(h)** an asset (`src/assets/css/site.css`) | yes | yes | mirror-copied |

**Case (f) needs a caveat, because it is the one case where the obvious file does not
exist.** In this example the five `.fragment.html` files in `dist/` are build *output*.
There is nothing to edit but the template that emits them, and both levels work: a change
to the shared markup module (`_11ty/lib/render.mjs`) and a change to the fragment template
(`_11ty/view-fragment.11ty.js`) each appeared in the fragment and in the page that includes
it, in one rebuild. The two authored fragments in the tree — the masthead and footer under
`_includes/` — are case (d), and behave identically. Editing a file in `dist/` does what
you would expect: the next rebuild overwrites it.

**What does not update.** The watcher watches the **source root**, recursively. Files outside
it are invisible to it, and in this example those are exactly the files npm owns:

| Edited while watching | Rebuilds |
|---|---|
| `package.json` (beside `src/`) | **none** |
| `node_modules/@11ty/eleventy/package.json` | **none** |
| `src/index.html`, for contrast | one, immediately |

So `npm install`, an Eleventy upgrade, or a change to a script's flags requires restarting
`unify dev` — nothing tells you, and the running session keeps building against the Eleventy
it started with. This is the only "does not update" case found, and it is a consequence of
`--generate` naming a file inside the source root while its dependencies live outside it.

One smaller platform detail: an `mtime`-only touch (`touch src/index.html`) did not fire a
rebuild in testing on Linux, while every actual content write did. Do not script `touch` to
force one.

### A failing generator mid-session

Break the generator while `unify dev` is running and the previous site stays served:

```
src/_scripts/eleventy.mjs: problem: --generate _scripts/eleventy.mjs failed (exit 1): error: Eleventy could not resolve a template
  fix: fix the generator, or drop --generate to build without it
  fix: run it directly to see its full output: bun _scripts/eleventy.mjs
rebuild failed: 1 problem
```

`dist/` still holds its 23 files, and all 15 published pages still answered `200` over HTTP
while the generator was broken. Fix it and the next save logs `rebuilt` as usual. The build
is transactional under watch for the same reason it is on the command line.

### The dev server's reload script reaches fetched fragments

This one is dev-only and worth knowing before it confuses you. `unify dev` injects a live-
reload script into the pages it serves, and it injects it into served `.fragment.html` files
too:

```
dist/notes/firmware.fragment.html    on disk:  1301 bytes, 0 <script> tags
GET /notes/firmware.fragment.html    served:   1396 bytes, 1 <script> tag
      <script>new EventSource("/__unify_reload__").onmessage=function(){location.reload();};</script>
```

htmx executes scripts in swapped content, so under `unify dev` every tab swap adds another
`EventSource` to the page. It is harmless for a development session and it is not in your
site: the file on disk has no script, `--dry-run` never mentions it, and a page fetched from
`dist/` by a deploy is byte-identical whether or not `dev` ever ran. If a swap behaves
oddly only under `dev`, this is why — check against `unify build && python3 -m http.server`
before debugging further.

`http://localhost:3000/_unify/` is the local audit view, and it works here like anywhere
else — the four generated pages appear in it with their own records, alongside the eleven
authored ones.

### What a full rebuild costs

The generator is not free, and you pay for it on every keystroke. Measured on the example by
adding synthetic release notes to `src/notes/` and running
`unify build --dry-run --generate _scripts/eleventy.mjs --pretty-urls`, best of three:

| Release notes | Files published | Eleventy's own time | Whole build |
|---|---|---|---|
| 6 (the example) | 23 | 0.19 s | **0.72 s** |
| 50 | 67 | 0.25 s | **0.84 s** |
| 200 | 217 | 0.38 s | **1.33 s** |
| 500 | 517 | 0.63 s | **2.03 s** |
| 1000 | 1017 | 1.04 s | **3.20 s** |

The generator subprocess measured on its own — process start, `import`, collection read,
nine files written — costs 0.49 s at six notes and 1.64 s at a thousand. At the top of that
table, roughly half the wall clock is Eleventy reading a thousand Markdown files it then
declines to write, and the other half is unify composing a thousand pages.

Absolute numbers are machine-dependent; the shape is not. Both halves scale with the
content tree, both re-run in full on every save, and **there is no cache to make the second
build cheaper than the first.** That is a deliberate part of unify's contract — watch output
must equal a fresh build, and a cache that survives a rebuild is exactly the failure mode
that makes a watch session report success over a stale site — but it means a thousand-page
content tree gives you a three-second editor loop.

If you get there, the fix is not a cache. It is `integrations.md` recipe 3: keep the
expensive work in a separate command you run when the content changes, and let the
`--generate` step read only what that command left on disk.

## 11. Deployment

`dist/` is an ordinary directory of ordinary files. The build is transactional, so
`unify build && deploy` never deploys a half-built site.

**At a domain root, everything works.** Adding `--base-url` and `--canonical auto` to the
same command:

```
$ unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls \
      --base-url https://ashgrove.example/ --canonical auto --dry-run --strict
serving from https://ashgrove.example/
canonical completion: 15 pages would gain a canonical link
structured data: 6 pages would gain a JSON-LD block
write dist/feed.xml (/feed.xml) ← generated (--base-url)
write dist/sitemap.xml (/sitemap.xml) ← generated (--base-url)
would publish 25 files to dist/
EXIT=0
```

25 files: `sitemap.xml` with 15 URLs, `feed.xml` with 6 entries (the six notes that declare
`schema: BlogPosting`), and a canonical on every page. Every `hx-get` still reads
`/notes/all.fragment.html`, which is still correct, because the base URL's path part is `/`.

**At a subpath, the site exits 0 and is quietly broken.** This is the real limit of mixing
runtime fetching with build-time URL rewriting, and it is worth stating flatly because
nothing reports it. unify rewrites HTML's own URL attributes — `href`, `src`, `srcset`,
`poster`, `og:` values. It does not rewrite `hx-get`, and it does not rewrite `url()` inside
a stylesheet. From a real build with `--base-url https://example.com/redpoll/`:

```html
<!-- the composed page: href prefixed, hx-get untouched -->
<a href="/redpoll/notes/firmware/" hx-get="/notes/firmware.fragment.html" aria-current="page">Firmware</a>

<!-- the stylesheet link is prefixed … -->
<link rel="stylesheet" href="/redpoll/assets/css/site.css">
<!-- … and a url() inside that stylesheet is not -->
body { background-image: url(/assets/img/redpoll.svg); }
```

Exit 0, 25 files, and `unify audit --strict` at that same base URL reports `audit: nothing
to report`. Every tab still navigates correctly and every tab's swap 404s. The example's stylesheet therefore contains **no `url()` at all, on purpose**, and
the example's documented deploy target is a domain root.

If you must deploy under a subpath, you have three options and they are all real work: write
every fetched address relative to the page (which `--pretty-urls` complicates, because it
moves pages one directory deeper), read the address back from an `href` unify rewrote — the
`seed-library-ondemand` pattern, where a real anchor carries the URL and script reads
`link.href` — or drop `--pretty-urls`. `authoring-rules.md` states the underlying rule in one
sentence: keep every `url()` in a stylesheet file and every fetched address relative to the
page, or read it back from an `href` unify rewrote.

Two smaller notes. `--canonical auto` needs a base URL and refuses without one, so the two
flags travel together:

```
$ unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls --canonical auto --dry-run
--canonical auto needs the site's address: --base-url is not set
  fix: add it: --base-url https://your-domain.example/
  fix: a canonical must be absolute — a root-relative one is ignored by the crawlers it exists for
EXIT=2
```

And an authored `feed.xml`, `sitemap.xml`, `search-index.json` or `robots.txt` always
suppresses generation and ships byte-for-byte, exactly like an authored `robots.txt`.

For CI, `unify audit --strict` is the gate — it runs the whole pipeline, publishes nothing,
and never creates the output directory. Both gates pass on Bun and on Node with
byte-identical output:

```
$ unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls --dry-run --strict
would publish 23 files to dist/                                                       EXIT=0
$ unify audit -s src --generate _scripts/eleventy.mjs --pretty-urls --strict
audit: nothing to report                                                              EXIT=0
```

## 12. Common mistakes

**Reimplementing Eleventy's features inside unify.** The failure looks like a
`--generate` script that walks `notes/`, parses frontmatter by hand, sorts, groups by a key,
and templates an index — in a project that already has Eleventy installed. Every one of
those is a solved problem with edge cases you have not met yet: date parsing, draft handling,
stable sorting, escaping. If Eleventy is in the tree, `addCollection` and `pagination` are
the answer, and your generator is the twenty-one lines that hand its output to unify.

The mirror-image mistake is reimplementing them inside *unify* — waiting for `tags:` to build
an archive, or asking for a collections feature. unify will not grow one; the `taxonomy-inert`
finding exists to say so at the moment you would otherwise wonder.

**Using two layout systems.** Covered in §7 with the emitted evidence: the build exits 0 and
publishes two mastheads, two footers, two `<title>` elements and a `<!doctype html>` inside
the body. Rename Eleventy's `layout:` key out of the way, as the example does, so the mistake
is impossible to make by accident.

**Using htmx as a component system.** Covered in §8. Chrome belongs in `<include>`, which is
free at runtime and checked at build time. `hx-get` belongs on the one thing that is really
dynamic.

**Treating the result as an SPA.** Covered in §8. No history management, no client-side
routing, no state that outlives a swap. The shareable address of every view in this site is a
real page that renders without JavaScript.

**Assuming this stack is normal.** It is not, and §14 is about that.

**Writing source spellings into a fetched fragment.** Covered in §9. Under `--pretty-urls` a
`.fragment.html` must carry published spellings, because nothing rewrites the copy htmx
fetches.

**Letting `<include src>` and `hx-get` drift apart.** Also §9. Keep them character-identical
and the reference check covers both; let them differ and only one of them is checked.

**Letting Eleventy write into the source tree.** Its output directory must be `argv[3]`. Point
it at `src/` and `unify audit` stops being read-only, a failed build leaves debris, and — under
watch — the generator's own writes trigger the rebuild that runs the generator.

**Naming a helper module `.js` inside the Eleventy input directory.** `.11ty.js` is a template
format, so `render.js` is scanned as a template and fails in a confusing way. Use `.mjs`.

**Forgetting that `npm install` is outside the watcher.** Restart `unify dev` after it. See §10.

## 13. When this architecture is appropriate

Four conditions, and you want most of them:

- **The content is genuinely a collection**, with an order, groupings and derived index pages
  — releases, posts, a changelog, a catalogue. If you have a dozen pages and no lists, none of
  this pays for itself.
- **You already have Eleventy**, or a comparable generator, and something is written against it
  — an existing content tree, a team that knows it, a config you do not want to re-derive. The
  point of `--generate` is that keeping it costs 21 lines.
- **You want unify's composition and checks on top**: one layout with slots, one head-merge
  rule, `--pretty-urls`, a reference check that refuses to publish a broken link, and a
  transactional publish. If you do not want those, use Eleventy on its own; it is a complete
  tool.
- **There is exactly one genuinely dynamic interaction**, and it degrades to a real page. The
  topic tabs here are the whole of it. Two or three such interactions are fine. A dozen is a
  different kind of application.

The stack also earns its keep when the content pipeline is somebody else's — a CMS export, a
docs tree in another repository, a data file a script maintains. `--generate` is the same seam
for all of them, and `integrations.md` recipe 3 has the important warning about running network
calls inside it.

## 14. When to use plain unify instead

**Most of the time.** A normal unify site is HTML, CSS, and unify. No `package.json`, no
`node_modules/`, no generator, no `--generate`, and no JavaScript at all beyond what a page
genuinely needs. That is the product, and this guide describes the far end of what it can
accommodate — not a recommended starting point.

Use plain unify when:

- **Your pages are pages.** A marketing site, a documentation set, a portfolio, a handbook.
  `<include>` for shared chrome, `_layout.html` for the wrapper, `slot=` for the one section
  that differs. `unify init docs` scaffolds exactly that, and `build --dry-run --strict` and
  `audit --strict` both exit 0 on it before you have edited a line.
- **You have one derived page** — an index, a list of five things. Write it by hand, or write
  a short generator that reads the frontmatter and emits it — `integrations.md` recipe 1 is a
  complete one in fourteen lines. Installing Eleventy to produce a single index page buys you
  a dependency, a lockfile, a config file and a per-save subprocess in exchange for a loop.
- **The data is small enough to ship in the page.** The `seed-library` example renders all 27
  varieties at build time and filters them with a small inline script: no request, so nothing
  can 404 at a subpath address and the page works from `file://`. That beats an htmx swap on
  every axis until the data genuinely does not fit.
- **You want a subpath deploy without thinking about it.** Every root-relative `href` and
  `src` is rewritten by `--base-url`, and a site with no fetched addresses has nothing that can
  be left behind. The moment you add `hx-get`, that stops being free (§11).
- **Your build must stay fast as the site grows.** No generator means no subprocess and no
  second content read on every save.

And a fair warning about the direction of travel: adding this stack later is easy, because
`--generate` adopts an overlay and changes nothing about the pages you already wrote. Removing
it is harder, because by then the pages exist only inside templates. Start plain.

---

The example is [`examples/eleventy-htmx`](../../examples/eleventy-htmx), and its own README
covers the same ground from the code's side. The composition rules every generated page obeys
are in [`../authoring-rules.md`](../authoring-rules.md); the exact flag surface is in
[`../cli-reference.md`](../cli-reference.md); the other uses of `--generate` — image
derivatives, a CMS pull, vendoring a package's browser files — are in
[`../integrations.md`](../integrations.md).
