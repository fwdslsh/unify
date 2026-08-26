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
means the CLI that step puts in `node_modules/.bin/` — the example lists `@fwdslsh/unify`
in `devDependencies` beside Eleventy, so the four npm scripts resolve with no global
install. To exercise *this* checkout rather than the pinned published release, substitute
`bun ../../src/cli.js` or `node ../../src/cli.js` — same flags, same output, same exit
codes.

## 1. Why combine these tools

unify has no collections, no data cascade, no pagination, and no taxonomy. That is a
decision rather than a gap — `authoring-rules.md` says it in one line ("Derived files (a
post index) come from a script you write and run yourself"). Write a `tags:` key and wait
for an index to appear, and nothing happens, silently: `tags`/`categories` synthesize to
ordinary `<meta>` tags exactly like any other frontmatter key, unify builds no index,
archive, feed, or route from them, and `unify audit` reports nothing about them either —
they are inert by design, meaningful only to a consumer that chooses to interpret them.
That consumer is Eleventy's `addCollection`, covered next.

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
- **Eleventy claims only two template formats**, `md` and `11ty.js`. Eleventy's defaults
  include `html`, so this keeps the authored `.html` pages out of its template set
  entirely — belt-and-braces on top of the global `permalink: false` that already stops
  Eleventy writing anything it was not asked to.

## 3. Project structure

The whole example, as it is on disk:

```
package.json                       four scripts; Eleventy and unify are the dependencies
package-lock.json                  committed, so npm ci reproduces both exactly
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

Two placements are load-bearing.

**`package.json` and `node_modules/` sit beside `src/`, never inside it.** `node_modules/`
is on the never-shipped list so it could not publish anyway, but a `package.json` at the
source root is an ordinary file and would mirror-copy straight into `dist/`.

**Everything Eleventy needs lives under an underscore.** `_data/`, `_scripts/`, `_11ty/`
and `_includes/` are read by the build and never ship — the default `--exclude _*` covers
all four with no configuration.

A third placement looks load-bearing and is not: the shared helper's `.mjs` extension
carries no meaning. Eleventy's `11ty.js` template format matches `.11ty.js`, `.11ty.cjs`
and `.11ty.mjs` and nothing else, so renaming the helper to `render.js` builds an identical
overlay. What a helper inside the input directory has to avoid is the `.11ty.` infix, not
the `.js` ending — the rule people reach for here is the wrong way round.

The build produces 23 files: 11 authored pages, 4 generated pages, 5 fragments, 3 assets.

## 4. Running Eleventy through `--generate`

`--generate` names **one file you wrote**, and its whole interface is three positional
arguments:

```js
const [, , sourceRoot, generatedDir, contextPath] = process.argv;
```

`sourceRoot` is the absolute path of your source tree, `generatedDir` an absolute path to
an empty directory that exists only for this build, and `contextPath` the absolute path of
`generator-context.json` — a versioned, read-only snapshot unify wrote for this one build:
`schemaVersion`, `unifyVersion`, the running `command`, the same three paths, the effective
site settings (`baseUrl`, `prettyUrls`, `canonical`), and where `--catalog`/`--search-corpus`
will land. The working directory is the source root. There is nothing to import. All three
arguments are always supplied — a generator that reads only the first two keeps working
exactly as it did before `contextPath` existed.

Everything written into `generatedDir` joins the build as ordinary source — scanned,
composed, reference-checked, collision-checked, and published inside the same transaction as
the files you wrote by hand.

The runtime is unify's own, spawned as a subprocess, so a generator runs on a machine with
no Node installation. The flag's value must resolve inside the source root:

```
$ unify build -s src --generate ../_scripts/eleventy.mjs --dry-run
--generate ../_scripts/eleventy.mjs is outside the source root
  fix: name a file inside the source tree, e.g. --generate _scripts/gen.mjs
```

`src/_scripts/eleventy.mjs` is 26 lines of code under its comments. Stripped to its
decisions:

```js
import Eleventy from "@11ty/eleventy";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sourceRoot = process.argv[2] ?? process.cwd();
const generatedDir = process.argv[3] ?? mkdtempSync(join(tmpdir(), "eleventy-preview-"));
const context = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], "utf8")) : null;
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
    cfg.addGlobalData("baseUrl", context?.site.baseUrl ?? null);
    cfg.addCollection("releases", (api) =>
      [...api.getFilteredByGlob("notes/*.md")].sort((a, b) => b.date - a.date));
  },
});

await eleventy.write();
```

Six of those lines are not obvious. Four carry the integration; two are defensive, and
saying which is which matters, because a reader who removes one to test the claim should
get the result the guide predicted:

1. **Input `"."`, not `sourceRoot`.** Eleventy's input directory must be relative to the
   working directory. An absolute path does **not** break permalinks — every computed and
   static permalink in this example still applies — but it silently stops directory data
   files (`<dir>/<dir>.json` and friends) from resolving, with no error. That asymmetry is
   what makes the mistake hard to spot.
2. **Output `generatedDir`.** This is the whole integration. Eleventy writes into unify's
   overlay and nowhere else.
3. **`context.site.baseUrl` as Eleventy global data.** `process.argv[4]` is
   `generator-context.json` — a versioned snapshot of the same effective settings unify's
   own build is about to apply, read once, straight off disk, with no import from unify.
   `view-page.11ty.js` reads it back as `data.baseUrl` and renders an `og:url` meta tag from
   it. Under `unify build --generate _scripts/eleventy.mjs --pretty-urls` the flag is
   missing, so `context.site.baseUrl` is `null` and the `og:url` tag is omitted entirely; add
   `--base-url https://ashgrove.example/` (§11) and the same pages carry
   `<meta property="og:url" content="https://ashgrove.example/notes/…">` — the exact address
   unify itself will publish that page under, with no second `--base-url` to keep in sync by
   hand. This is not defensive: remove the line and every release-notes page loses its
   `og:url` tag whenever `--base-url` is set. The `?.` guards a standalone run with no fourth
   argument at all (see the "run it directly" fix line below) — under unify, argv[4] is
   always supplied, so the guard never fires there.
4. **An absolute `configPath`.** Two settings exist only in a config *file*, and Eleventy's
   auto-discovery would look in the working directory — the source root, where an
   `eleventy.config.mjs` would mirror-copy into `dist/`. The file lives under `_11ty/`
   instead, and is named explicitly.
5. **`setUseGitIgnore(false)`** is defensive, and a no-op in this tree: there is no
   `src/.gitignore`, so removing the line produces a byte-identical overlay. The hazard is
   real all the same — write one (`printf 'notes/\n' > src/.gitignore`) and every
   collection empties silently: no error, and an empty release list on every page.
6. **`setTemplateFormats(["md", "11ty.js"])`** is defensive too. Eleventy's default formats
   are `["liquid", "md", "njk", "html", "11ty.js"]`, so without this line the authored
   `.html` pages are entered into the template set. They are still never written, because
   of the global `permalink: false` below, and removing the line produces a byte-identical
   overlay. It is here so the separation is stated in configuration rather than left to
   one setting's side effect. Eleventy could not write "on top of the source tree" in any
   case: its output directory is `argv[3]`.

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
the build before the scan and leaving the previous `dist/` untouched. Here is a real one —
`data.collections.releases` misspelled `releasez` in `view-fragment.11ty.js`:

```
$ unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls
[11ty] Wrote 0 files in 0.16 seconds (v3.1.6)
src/_scripts/eleventy.mjs: problem: --generate _scripts/eleventy.mjs failed (exit 1): [11ty] Problem writing Eleventy templates: / [11ty] 1. Having trouble rendering 11ty.js template ./_11ty/view-fragment.11ty.js (via TemplateContentRenderError) / [11ty] 2. undefined is not an object (evaluating 'entries.map') (via TypeError)
  fix: fix the generator, or drop --generate to build without it
  fix: run it directly to see its full output: bun _scripts/eleventy.mjs
EXIT=1
```

Three details in that report. The first line is Eleventy's own stdout, passed straight
through — a generator's output is its business. The ` / ` separators are unify collapsing a
multi-line stderr into one located line. And the runtime named in the last `fix:` line is
whichever one is running unify: `bun` or `node` when unify was started by one of those, and
`BUN_BE_BUN=1 /path/to/unify` when it is the compiled single-file binary, because that is
the command that actually reproduces the subprocess.

That is the whole report — no output directory was created, and nothing else ran. Catching
the error could only make it less specific. Following the `fix:` line works: the generator
defaults both arguments, so running it with none writes a preview overlay into a temporary
directory (never into `src/`) and shows Eleventy's full unabridged output.

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
built from what it already declares. Use `tags:` instead and unify builds nothing from it
and reports nothing either (§1): correct, because tags are inert metadata by design, and
unnecessary, because Eleventy is right there.

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

Here is a whole generated fragment as published — `dist/notes/firmware.fragment.html`, all
1301 bytes of it, nothing elided:

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
    <li>
      <a href="/notes/2026-03-11-firmware-2-5-0/">Firmware 2.5.0</a>
      <time datetime="2026-03-11">11 March 2026</time>
      <span>Tilt is reported on every uplink, join backoff is fixed at fifteen minutes, and the console gains a read command.</span>
    </li>
    <li>
      <a href="/notes/2026-01-14-firmware-2-4-0/">Firmware 2.4.0</a>
      <time datetime="2026-01-14">14 January 2026</time>
      <span>The median window grows from 16 samples to 40, and a no-echo reading is now reported as a flag instead of a plausible number.</span>
    </li>
  </ul>
```

No `<html>`, no `<head>`, no layout: a `.fragment.html` is exactly what the generator
wrote. The `all` view is the same markup with all six notes (2161 bytes).

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
src/index.html:30: problem: /notes/firmware-2-6-0/ does not resolve to any emitted file
src/latest.fragment.html:2: problem: /notes/mounting-bracket/ does not resolve to any emitted file
src/latest.fragment.html:3: problem: /notes/weir-pool-trial/ does not resolve to any emitted file
src/notes/all.fragment.html:7: problem: /notes/firmware-2-6-0/ does not resolve to any emitted file
…                                                        (11 more, one per broken link)
would publish nothing — 15 problems; dist/ would be left untouched
EXIT=1
```

Note the **paths** in those diagnostics. `src/notes/all.fragment.html` and
`src/latest.fragment.html` are *generated* files, reported under the source root exactly as
a file you wrote would be. Generated output is not a second class of input — it is checked,
blamed and refused like everything else, and the fifteen problems are fifteen real broken
links.

**Do not trust the line numbers in that particular block.** This is worth knowing before
you go looking at the line the build named, and it is not specific to generated files.
unify resolves a reference's provenance through span tables recorded *before* §11's URL
rewriting, and `--pretty-urls` is a length-*changing* rewrite (`/notes/index.html` → `/notes/`
loses ten bytes). Any reference that follows an earlier rewritten link inside the same
output page is therefore reported a few lines early, and the drift can cross a file
boundary: the first line above blames `src/index.html:30`, which is `<h2>Latest
releases</h2>` in a file that contains no such link at all. The link really lives at
`src/latest.fragment.html:2`, which `<include>` splices into that page. Re-run the same
build without `--pretty-urls` and every location is exact:

```
$ unify build -s src -o dist --generate _scripts/eleventy.mjs --dry-run
src/latest.fragment.html:2: problem: /notes/firmware-2-6-0/ does not resolve to any emitted file
src/latest.fragment.html:3: problem: /notes/mounting-bracket/ does not resolve to any emitted file
src/latest.fragment.html:4: problem: /notes/weir-pool-trial/ does not resolve to any emitted file
…
```

(That run reports more problems, because without `--pretty-urls` the tabs' `/notes/firmware/`
hrefs do not resolve either — which is §9's rule seen from the other side.) The message and
the refusal are right in both runs; only the file-and-line attribution drifts, and only
under a rewrite that changes a URL's length.

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
src/notes/field-notes.html:11: problem: include not found: /notes/field-notes.fragmnt.html
  in: <include src="/notes/field-notes.fragmnt.html"></include>
  fix: create it, or point src at an existing .html or .md file
  fix: check the path spelling and casing
src/notes/firmware.html:11: problem: include not found: /notes/firmware.fragmnt.html
  in: <include src="/notes/firmware.fragmnt.html"></include>
  fix: create it, or point src at an existing .html or .md file
  fix: check the path spelling and casing
…                                       (src/notes/hardware.html:11 and src/notes/index.html:11, the same)
serving from / — the domain root (no --base-url)
structured data: 6 pages would gain a JSON-LD block
…                                       (the full copy/write listing)
would publish nothing — 4 problems; dist/ would be left untouched
EXIT=1
```

Diagnostics are ordered by path and then by line (§14.1), which is why `field-notes` comes
before `firmware` and not in generation order.

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
"build": "unify build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls --clean"
```

They call a bare `unify`, and what resolves it is `npm install`: the example lists
`@fwdslsh/unify` beside `@11ty/eleventy` in `devDependencies`, so the binary lands in
`node_modules/.bin/`. That is also the reason `npm install` is not optional here, and the
reason a Bun user can be fooled into thinking it is — Bun's default `--install=auto`
network-installs `@11ty/eleventy` when no `node_modules/` exists, so `bun …/cli.js build`
exits 0 in a tree that was never installed, against whatever `^3.1.6` resolves to today and
ignoring `package-lock.json`. Node fails loudly in the same tree, inside P29:

```
$ node ../../src/cli.js build -s src -o dist --generate _scripts/eleventy.mjs --pretty-urls
src/_scripts/eleventy.mjs: problem: --generate _scripts/eleventy.mjs failed (exit 1): Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@11ty/eleventy' imported from /…/src/_scripts/eleventy.mjs /   code: 'ERR_MODULE_NOT_FOUND' / }
  fix: fix the generator, or drop --generate to build without it
  fix: run it directly to see its full output: node _scripts/eleventy.mjs
EXIT=1
```

So a green Bun build is not evidence that the tested Eleventy ran. Use `npm ci`, or run the
Node build, when you want the lockfile to be what proves it. (`BUN_CONFIG_NO_INSTALL=1` does
not help: the generator is a fresh subprocess, and the auto-install happens there.)

`npm run build` is the one to deploy from, because it is the only script carrying
`--clean`. A rebuild without `--clean` prunes a deleted page's content correctly — every
derived list loses it in the same rebuild — but leaves the now-empty directory behind at
the retired URL, and they accumulate across a watch session:

```
$ mv src/notes/2026-06-30-firmware-2-6-0.md /tmp/     # then rebuild, no --clean
$ grep -c 2026-06-30-firmware-2-6-0 dist/notes/index.html dist/latest.fragment.html
dist/notes/index.html:0
dist/latest.fragment.html:0                           ← content correctly gone
$ find dist -type d -empty
dist/notes/2026-06-30-firmware-2-6-0                  ← directory left behind
```

Do not add `--clean` to `dev` or `watch` to fix that: it applies at startup only, so all it
would do is delete the output from under a running server every time you restart it.

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
| **(a)** an Eleventy Markdown post (`src/notes/2026-06-30-firmware-2-6-0.md`) | yes | yes | seven files: the composed post page, the two views that contain it (`all` and its own topic `firmware`) as fragment *and* page, `latest.fragment.html`, and the front page. The other two views come back byte-identical — a firmware note cannot appear in the hardware or field-notes list |
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

**Watch is not transactional, and this is the one place that matters.** `unify build`
really does leave the previous `dist/` byte-for-byte untouched when the generator fails
(§4). `unify dev` and `unify watch` deliberately do the opposite: a failed rebuild replaces
every page in the output directory with the WCH-04 "Build error" placeholder carrying the
problem, so the browser tab in front of you shows the failure instead of quietly serving a
site that no longer matches the source.

Break the generator while `unify dev` is running:

```
src/_scripts/eleventy.mjs: problem: --generate _scripts/eleventy.mjs failed (exit 1): error: the river gauge is dry
  fix: fix the generator, or drop --generate to build without it
  fix: run it directly to see its full output: bun _scripts/eleventy.mjs
rebuild failed: 1 problem
```

`dist/` still holds 23 files and `GET /` still answers `200` — but what it answers with is
the placeholder. Measured against the running server:

```
files in dist:                         23
GET / HTTP status:                     200
GET / contains "Redpoll":               0     ← the site is not being served
GET / contains "Build error":           2
pages replaced by the placeholder:  15 of 15
fragments replaced:                   5 of 5
```

That last line deserves its own sentence, because it is the one exception to the
`.fragment.html` byte-for-byte contract anywhere in unify: a fetched fragment is a bare
snippet in every build, and a *failed watch rebuild* writes a whole 661-byte HTML document
into it. An `hx-get` swap during a broken dev session therefore injects `<!doctype html>`
into `#releases`. Nothing about that reaches a deploy — the placeholder is dev-only and
`unify build` never writes one — but it will confuse you for a minute if a swap misbehaves
right after a failed save.

Fix the generator and the next save logs `rebuilt`; the restored `dist/` is byte-identical
to a fresh `unify build` (verified with `diff -r`). The rule to carry away: **transactional
is a `unify build` guarantee. Under watch, a failure is written into the output on
purpose.**

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

<!-- the stylesheet link is prefixed -->
<link rel="stylesheet" href="/redpoll/assets/css/site.css">
```

Exit 0, 25 files, and `unify audit --strict` at that same base URL reports `audit: nothing
to report`. Every tab still navigates correctly and every tab's swap 404s.

The stylesheet has the same shape of problem, one layer down. The `<link>` above is
prefixed; a `url()` *inside* the file it names is not, so this — an illustration, not
output from this example — would keep pointing at an address the subpath deploy does not
serve:

```css
/* what a url() would do under --base-url https://example.com/redpoll/ */
body { background-image: url(/assets/img/redpoll.svg); }   /* not rewritten */
```

The example's stylesheet therefore contains **no `url()` at all, on purpose** — the only
`url(` in `src/assets/css/site.css` is inside a comment saying so — and the example's
documented deploy target is a domain root.

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

And an authored `feed.xml`, `sitemap.xml`, `assets/unify/catalog.json`,
`assets/unify/search-corpus.json` or `robots.txt` always suppresses generation and ships
byte-for-byte.

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
the answer, and your generator is the twenty-four lines that hand its output to unify.

The mirror-image mistake is reimplementing them inside *unify* — waiting for `tags:` to build
an archive, or asking for a collections feature. unify will not grow one, and stays silent
about it on purpose: `tags:`/`categories:` are ordinary, inert metadata (§1), not a hook
waiting for a feature to arrive.

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

**Forgetting that `npm install` is outside the watcher.** Restart `unify dev` after it. See §10.

## 13. When this architecture is appropriate

Four conditions, and you want most of them:

- **The content is genuinely a collection**, with an order, groupings and derived index pages
  — releases, posts, a changelog, a catalogue. If you have a dozen pages and no lists, none of
  this pays for itself.
- **You already have Eleventy**, or a comparable generator, and something is written against it
  — an existing content tree, a team that knows it, a config you do not want to re-derive. The
  point of `--generate` is that keeping it costs 26 lines.
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
  a short generator that emits it: `integrations.md` recipe 1 is a complete generator in
  fourteen lines, and the one that reads post frontmatter to build an index and a feed ships
  as `_scripts/gen.mjs` in the `blog` template (`unify init blog`). Installing Eleventy to
  produce a single index page buys you a dependency, a lockfile, a config file and a
  per-save subprocess in exchange for a loop.
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
