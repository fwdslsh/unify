---
description: "Using a component framework, Svelte here, on a unify site by compiling it to an asset, without adopting a framework for the site."
---

# Integrating compiled components: the compile-to-asset pattern

**Role**: The recipe for using a component framework — Svelte here, but the shape is the
same for anything with a compiler — on a unify site, without adopting a framework for the
site. unify needs to know nothing about the framework, and that is the design: you compile
the component to an ordinary JavaScript file *before* `unify build`, and unify ships it
like any other asset. Every literal in this document is tested; the worked example is
`examples/forge-svelte`. (That example pins Svelte 5 and uses the recipe's own
`mount()` call; the three-file shape is identical.)

## The contract, in four lines

- A compiled bundle is an **ordinary asset**: mirror-copied byte-for-byte, referenced by an
  ordinary `<script src>` that `--base-url`/`--pretty-urls` rewrite like any link.
- `node_modules/` **never ships**: at the project root it sits beside `site/`, outside the
  source tree unify scans, and even inside the source root it is on the never-shipped list
  (conformance spec §4.3) — so `npm install` is safe by design wherever `package.json` is.
- Your build script lives in `scripts/` at the project root, beside `site/` and
  `package.json`. Being outside the source root is what keeps it out of the output — no
  underscore needed — and it runs **before** unify, by you:
  `node scripts/build-components.mjs && unify build`.
- URLs *inside* your component's JavaScript ship as written — unify rewrites HTML, never
  JS — so a component that fetches must build addresses relative to the page, or read them
  back from an `href` unify rewrote (`docs/authoring-rules.md`, Styles/scripts).

## The Svelte recipe

The component — say `components/FeeCalculator.svelte` at the project root, maintained by
whoever writes your Svelte — needs three small files and two commands. Everything below
runs from the project root, the directory holding `site/`, `scripts/`, `components/` and
`package.json`. Once:

```bash
npm install svelte esbuild esbuild-svelte
```

`scripts/estimator-entry.js` — mounts the component onto the element your page provides:

```js
import { mount } from "svelte";
import FeeCalculator from "../components/FeeCalculator.svelte";

mount(FeeCalculator, { target: document.getElementById("estimator") });
```

`scripts/build-components.mjs` — compiles and bundles to one plain file under
`site/assets/js/`, inside the source tree, where unify finds it like any other asset:

```js
import esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";

await esbuild.build({
  entryPoints: ["scripts/estimator-entry.js"],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: "site/assets/js/estimator.js",
  plugins: [sveltePlugin()],
});
console.log("built site/assets/js/estimator.js");
```

On the page that hosts it — say `site/courses.html` — the script is linked **relative to
the page's own file**, so the page previews when opened straight from the folder, and
unify rewrites the address for wherever the page is published (a page one directory down
writes `../assets/js/estimator.js`):

```html
<div id="estimator"></div>
<script src="assets/js/estimator.js" defer></script>
```

And the repeatable build is one line:

```bash
node scripts/build-components.mjs && unify build
```

That is the whole integration. `bundle: true` matters: the compiler's raw output imports
Svelte's runtime from `node_modules`, which a browser cannot resolve and unify does not
ship — bundling folds the runtime into the one file. The output is a few tens of
kilobytes; it contains no `import` of anything.

## Never hand-translate the component

The one failure mode that matters is not technical, and a build that "works" hides it:
rewriting the component by hand in plain JavaScript and keeping the `.svelte` file as
decoration. The site looks identical. The next revision of the component then half-applies
or silently doesn't, because nothing actually reads it. **The component's own language is
the contract**: if it is maintained in Svelte, the real Svelte compiler must sit between
the `.svelte` file and the browser.

The test is mechanical, and worth running once after wiring anything up:

1. Change the component's **markup** — add a visible line.
2. Run your build command.
3. Look for the change in the emitted file: `grep "visible line" site/assets/js/estimator.js`.

If a value change propagates but a markup change does not, the pipeline is a counterfeit —
something is extracting numbers instead of compiling. (In the experiment that produced
this document, two of six independent builds were exactly that, one of them importing the
real compiler and never calling it.)

## The same shape for anything else

TypeScript, JSX, Sass — identical pattern: compiler runs from `scripts/` at the project
root, output lands in `site/assets/` as an ordinary file, unify ships it untouched. unify will never run
`npm` for you, watch your components, or rewrite your bundle: one tool composes HTML, your
toolchain makes assets, and the seam between them is the filesystem.

---

## Five recipes

The pattern above runs your toolchain *beside* unify, by you. The five recipes below are
the common variations, and the first of them is the only place unify reaches out at all.

## 1. The generator context: what `--generate` hands you

`generate: scripts/gen.mjs` in `unify.yaml` — a path in the file counts from the file's
own directory, the project root, so it names the `scripts/` beside `site/` — runs one file
you wrote, before unify scans anything. The whole interface is three positional arguments:

```js
const [, , sourceRoot, generatedDir, contextPath] = process.argv;
```

`sourceRoot` is the absolute path of your source tree; `generatedDir` is an absolute path
to an empty directory that exists only for this build. Files you write into
`generatedDir` join the build as an overlay — scanned, composed, checked, and published
exactly like files in `site/`. Files you write anywhere else are your own business, and
unify neither collects them nor notices them.

`contextPath` is the absolute path of `generator-context.json`, a small versioned snapshot
unify writes fresh for this one build and deletes when the build finishes, success or
failure:

```json
{
  "schemaVersion": 1,
  "unifyVersion": "0.9.0",
  "command": "build",
  "paths": {
    "sourceRoot": "/project/site",
    "generatedRoot": "/tmp/unify-generated-abc123/overlay",
    "outputRoot": "/project/dist"
  },
  "site": {
    "baseUrl": "https://example.com/",
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

`site` and `outputs` are the flags that change what a generator would otherwise have to
duplicate: the effective `--base-url`/`--pretty-urls`/`--canonical`, and the output-relative
paths `--catalog`/`--search-corpus` will write, each `null` when its flag is off. `inputs.sourcePages` is `null` too unless you ask for the source inventory (below). There is
nothing else in it — no settings dump, no environment, no internal option names, and no
manifest, because the generator runs before unify has composed a single page. Reading it is
optional: `sourceRoot` and `generatedDir` are the same two arguments the flag has always
passed, unchanged, so a generator that never looks at `contextPath` keeps working exactly as
it did before this third argument existed.

There is nothing to import. A complete generator is this:

```js
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , sourceRoot, generatedDir, contextPath] = process.argv;
const { site } = JSON.parse(readFileSync(contextPath, "utf8"));
mkdirSync(generatedDir, { recursive: true });
writeFileSync(
  join(generatedDir, "credits.html"),
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Credits</title><meta name="description" content="Who built this."></head>
<body><h1>Credits</h1><p>Built from ${sourceRoot}, published at ${site.baseUrl ?? "no --base-url"}.</p></body>
</html>
`,
);
```

Five properties are worth knowing before you write a longer one:

- **The working directory is the source root**, not the directory the script lives in, so
  `readFileSync("_data/authors.json")` reads `site/_data/authors.json`, what you would
  expect from reading the source tree.
- **The runtime is unify's own.** The standalone binary carries it: `--generate` works
  on a machine with no Node installed, which is the point of the flag existing at all.
- **It runs on every build**, including every rebuild under `unify watch` and `unify dev`.
  That is deliberate — a generator that ran once would leave watch output stale while the
  build reported success — but it means an expensive generator makes every keystroke
  expensive. See recipe 3 for the fix. `generator-context.json` is written fresh for every
  one of those runs too, so it never reflects a stale build.
- **Its failure is a build failure.** A non-zero exit is a located problem, nothing
  publishes, and the previous `dist/` is untouched.
- **`command` names the real subcommand** — `build`, `dev`, `watch`, or `audit` — so a
  generator that only makes sense during development can check it and skip itself rather
  than guessing from a flag.

### An index of your pages, in one build

A generator runs before unify has read a single page, so by default it can only read your
files itself. `--source-inventory` hands it that reading, done: `inputs.sourcePages` in the
context names `source-pages.json`, one record per source page with the `title`,
`description` and `date` its author wrote (`null` where there is none), the page's
`source` path, and an `href` you can link to. It is the same list of pages the build
treats as pages: `_`-prefixed files, `--exclude` matches, fragments and layouts are not in
it, a `noindex` page is. Markdown pages read their frontmatter; HTML pages read their own
`<head>`, as written, with `<include>`s not resolved. It is source facts only: no layout
suffix on titles, no generated pages, no rendered headings.

This generator writes a `reports/index.html` listing every page under `reports/`, newest
first, so the index and the reports it links to come out of one `unify build`:

```js
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , , generatedDir, contextPath] = process.argv;
const context = JSON.parse(readFileSync(contextPath, "utf8"));
const { pages } = JSON.parse(readFileSync(context.inputs.sourcePages, "utf8"));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const items = pages
  .filter((p) => p.source.startsWith("reports/"))
  .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
  .map((p) => `<li><a href="${esc(p.href)}">${esc(p.title ?? p.source)}</a>${p.description ? ` — ${esc(p.description)}` : ""}</li>`);

mkdirSync(join(generatedDir, "reports"), { recursive: true });
writeFileSync(
  join(generatedDir, "reports", "index.html"),
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Reports</title><meta name="description" content="Every report, newest first."></head>
<body><h1>Reports</h1><ul>
${items.join("\n")}
</ul></body>
</html>
`,
);
```

```sh
unify build --generate ../scripts/reports.mjs --source-inventory --audit --strict
```

On the command line `--generate` counts from the **source root**, hence the `../` to reach
`scripts/` beside `site/`; in `unify.yaml` the same file is `generate: scripts/reports.mjs`,
relative to the file. The `href`s are ordinary links to your source pages, so `--pretty-urls`
and a `--base-url` path prefix rewrite them like links you typed, and the audit checks every
one. Put `generate: scripts/reports.mjs` and `source-inventory: true` in `unify.yaml` and the
command is just `unify build --audit --strict`.

Every record also carries `meta` and `links`: the `<meta>` and `<link>` elements the page
itself declares, in order, as attribute records (`{"name": "tags", "content": "homelab"}`,
`{"property": "og:image", …}`, `{"rel": "canonical", "href": …}`). A Markdown page's `meta`
is what its frontmatter emits (a list becomes one record per item; `title`, `layout`,
`class`, `lang` and `dir` are not metas), and its `links` is always empty. unify gives none
of these a meaning: your script does. This one lists articles by series, in `part` order,
keeps each page's tags, and leaves out pages marked `role: bookmark`:

```js
const metas = (p, name) => p.meta.filter((m) => m.name === name).map((m) => m.content);
const one = (p, name) => metas(p, name)[0] ?? null;

const articles = pages.filter((p) => p.source.startsWith("articles/") && one(p, "role") !== "bookmark");
const bySeries = Map.groupBy(articles, (p) => one(p, "series") ?? "Other");
const sections = [...bySeries].map(([series, list]) => {
  list.sort((a, b) => Number(one(a, "part")) - Number(one(b, "part")));
  const items = list.map((p) => `<li><a href="${esc(p.href)}">${esc(p.title ?? p.source)}</a> ${esc(metas(p, "tags").join(", "))}</li>`);
  return `<h2>${esc(series)}</h2><ol>\n${items.join("\n")}\n</ol>`;
});
```

It slots into the generator above in place of `items`; write `sections.join("\n")` into the
page instead.

The `blog` template ships this worked: `unify init blog` writes a `scripts/gen.mjs` beside `site/`, named
by its `unify.yaml`, that reads `posts/*.md` and `_data/authors.json` and writes the index and the feed into
the overlay on every build.

### Source facts or final facts

Five things describe your pages, and they answer different questions because they exist at
different moments of the build:

| What | When it exists | What it holds | Read it for |
|---|---|---|---|
| The source inventory, `source-pages.json` | before your generator runs, in every build that names one (unless `source-inventory: false`) | each source page's `source` and `href`, and the `title`, `description`, `date`, `<meta>` and `<link>` its author wrote | an index, an archive or a nav your generator writes in the same build |
| `assets/unify/catalog.json` (`--catalog`) | after composition, published with the site | each public page's final address, its merged head (the title with the layout's suffix, every meta and link) and its headings with their ids | browse, filter and table-of-contents UI in the browser |
| `assets/unify/search-corpus.json` (`--search-corpus`) | after composition, published with the site | each public page's `path` and visible text | client-side search, joined to the catalog on `path` |
| `unify audit --format json` | a separate run that publishes nothing | each page's `source`, `outputPath` and final document (the catalog's record shape), plus the findings | a tool outside unify that needs source → output → address ([recipe 4](#4-interoperating-with-post-build-tools)) |
| `/_unify/pages.json` | only while `unify dev` serves | each page's source, layout, includes and address | an editor; it is never a published file |

The first is what you wrote; the other four are what the build made of it. This page,
with the section layout from [Getting Started](getting-started.md#a-section-of-markdown-pages)
around it:

```markdown
---
description: The first note.
tags: [setup, intro]
---

# First steps

### Setup

### Setup
```

is this record in the source inventory:

```json
{
  "source": "notes/first.md",
  "href": "/notes/first.html",
  "title": null,
  "description": "The first note.",
  "date": null,
  "meta": [
    { "name": "description", "content": "The first note." },
    { "name": "tags", "content": "setup" },
    { "name": "tags", "content": "intro" }
  ],
  "links": []
}
```

and, built with `--pretty-urls --base-url https://example.com/sub/ --catalog`, has these
fields in `catalog.json`:

```json
{
  "path": "/sub/notes/first/",
  "url": "https://example.com/sub/notes/first/",
  "head": { "title": "First steps — Notes — My Site" },
  "body": {
    "attributes": { "class": "notes" },
    "headings": [
      { "level": 1, "id": "first-steps", "text": "First steps" },
      { "level": 3, "id": "setup", "text": "Setup" },
      { "level": 3, "id": "setup-1", "text": "Setup" }
    ]
  }
}
```

- **A title from the first heading is a final fact.** The page wrote no `title:`, so the
  inventory says `null`; the heading becomes the title while the page is composed, and the
  catalog has it. Fall back to the source path, as the reports index above does, or write a
  `title:`.
- **Repeated metadata is already parsed.** Every `tags` item is its own `meta` record, so
  the generator filters `meta` (the series example above) and never parses YAML itself.
- **`href` is a link for HTML you generate, not a public address.** It is `/` plus the
  source path with `.md` turned into `.html`. Written into a generated HTML page, unify
  rewrites it for `--pretty-urls` and `--base-url` like a link you typed. Written into JSON,
  XML, or anything else that is not HTML, it ships exactly as written, so a generator
  writing a feed or a data file computes the address itself ([the RSS recipe's
  `address()`](guides/generator-recipes.md#an-rss-feed) does).
- **The lists are not the same pages.** The inventory is every source page, a `noindex` one
  included, and no generated page, since none exists yet. The catalog and the search corpus
  are the published pages a crawler may index — no `noindex` page (unless
  `--include-noindex`), no `404.html`, no page whose canonical names another — generated
  pages included. The feed is narrower still: only pages declaring `Article` or
  `BlogPosting`, with a date that carries a time of day.
- **A table of contents comes from the composed page.** Heading ids exist only once a page
  is composed, so this build's generator cannot read them. Read them in the browser — from
  the page's own DOM, or from the catalog's `headings` — or, to ship the table in the HTML,
  have your generator read the Markdown and apply the id rule itself (lowercase, hyphens for
  spaces, punctuation dropped, `-1`, `-2` on a repeat; conformance spec §10.4).
- **A previous build's catalog describes the previous build.** A generator reading
  `dist/assets/unify/catalog.json` writes pages one edit behind, and finds nothing in a
  fresh checkout. Build what needs the current pages from the inventory, or in the browser.

### Navigation: the docs template's helper, or your own

The docs template ships one navigation generator, `scripts/docs-nav.mjs` ([templates
§4](templates.md#4-build-on-a-template-without-copying-it) shows the call). It takes the
pages its importer returns (`source`, `path`, `title`, `description` each) and one ordered
list of groups, and is called once, after `importDocs`, with the same output directory. It
writes the sidebar `_includes/docnav.html`, an index of every document at `docs/index.md`,
and, when there is more than one document, appends a `<nav class="pager">` of previous/next
links to each imported page. A document
no group lists joins a trailing "More" group; one listed twice, or listed but never
imported, stops the build with an error naming it. Its markup is fixed, and the docs
template's stylesheet styles it.

Use it as it comes on a site built from the docs template. A site whose navigation must keep
its own markup is better served by a few lines of its own generator over the source
inventory, like the reports index above. Either way the division of work is the same:
**HTML fragments own reusable structure, and the generator owns what is computed from the
set of pages** — the order, the list, the groups. A card's markup is a fragment (a slotted
include, when each use needs its own words); which cards appear, and in what order, is what
the generator writes.

One thing neither does for you: mark the current page's link. `<body class="home">` and a
CSS rule style it ([Getting Started](getting-started.md#pages)), but a nav shared through
an include is the same markup on every page, so nothing sets `aria-current`. Markup that
differs per page is written per page — by you, or by the generator writing those pages.
unify has no collections, repetition, or data binding, so this boundary stays where it is.

## 2. Image optimization

unify copies every non-page file byte-for-byte, so a 4 MB photograph in your source tree
is a 4 MB photograph on your site. unify will not resize it, re-encode it, or generate
derivatives — that is a job with real decisions in it (which sizes, which formats, what
quality), and a tool that guessed would guess wrong quietly.

Run a real image tool, and run it where its output is cached. The shape that works:
originals live in the source tree under an underscore (`site/_originals/`), so they are
build material that never publishes; derivatives land beside the pages that use them.

```js
// scripts/images.mjs — generate: scripts/images.mjs in unify.yaml, or by hand before
// unify build: node scripts/images.mjs site
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [, , sourceRoot] = process.argv;
const from = join(sourceRoot, "_originals");
const to = join(sourceRoot, "assets/img");
mkdirSync(to, { recursive: true });

for (const name of readdirSync(from)) {
  if (!/\.(jpe?g|png)$/i.test(name)) continue;
  for (const width of [480, 960, 1920]) {
    const out = join(to, `${name.replace(/\.[^.]+$/, "")}-${width}.webp`);
    const src = join(from, name);
    // Skip work already done: this runs on every rebuild.
    try {
      if (statSync(out).mtimeMs >= statSync(src).mtimeMs) continue;
    } catch { /* not built yet */ }
    await sharp(src).resize({ width }).webp({ quality: 80 }).toFile(out);
  }
}
```

`site/_originals/` is excluded by the default `_*` glob, so the masters never publish; the
derivatives sit in `site/assets/img/` and ship like any other file. Reference them with an
ordinary `srcset`, which unify rewrites like any other URL:

```html
<img src="/assets/img/anvil-960.webp"
     srcset="/assets/img/anvil-480.webp 480w, /assets/img/anvil-960.webp 960w"
     width="960" height="540" alt="A blacksmith's anvil">
```

Write `width` and `height` on every `<img>`. Nothing in unify requires it; every browser
uses it to reserve space before the image loads, and `unify audit` will tell you when a
page's own share image is missing dimensions.

## 3. An external CMS over the source tree

Content in a CMS reaches a unify site the same way everything else does: as files in the
source tree, written before the build. A generator can fetch and write them, but read the
warning first — this is the one recipe where the obvious version is wrong.

**A generator runs on every rebuild, and `unify dev` rebuilds on every save.** A generator
that calls a CMS API directly makes your editor loop network-dependent, rate-limited, and
slow, and it makes your build non-reproducible: the same source tree publishes different
sites on different days. Split it in two.

The fetch is a separate command you run when content changes:

```js
// scripts/pull-cms.mjs — run by hand from the project root: node scripts/pull-cms.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const res = await fetch("https://cms.example/api/posts");
if (!res.ok) throw new Error(`CMS returned ${res.status}`);
mkdirSync("site/_cms", { recursive: true });
writeFileSync("site/_cms/posts.json", JSON.stringify(await res.json(), null, 2));
```

The generator only reads what the fetch left on disk, so it is offline, fast, and
deterministic:

```js
// scripts/gen.mjs — generate: scripts/gen.mjs in unify.yaml; runs on every build
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , sourceRoot, generatedDir] = process.argv;
const posts = JSON.parse(readFileSync(join(sourceRoot, "_cms/posts.json"), "utf8"));
mkdirSync(join(generatedDir, "posts"), { recursive: true });

for (const post of posts) {
  writeFileSync(
    join(generatedDir, "posts", `${post.slug}.md`),
    `---\ntitle: ${JSON.stringify(post.title)}\ndescription: ${JSON.stringify(post.summary)}\ndate: ${post.publishedAt}\nschema: BlogPosting\n---\n\n${post.body}\n`,
  );
}
```

Commit `site/_cms/posts.json`. It is excluded from the output by the default `_*` glob, it
makes every build reproducible from the checkout alone, and it turns "the CMS was down"
into a problem you have at `pull-cms` time rather than at deploy time.

Two details that bite. **Quote every value you interpolate into frontmatter** —
`JSON.stringify` above is doing that job, and a title containing a colon is exactly the
value that breaks an unquoted one. And **name the fields you emit**, one at a time, rather
than spreading the CMS record: a `{...post}` spread is how an author's private email
address ends up on a public page.

## 4. Interoperating with post-build tools

`dist/` is an ordinary directory of ordinary files. Anything that reads a directory of
HTML works on it with no integration at all — a minifier, an image pipeline, a link
checker, `rsync`, a deploy CLI:

```bash
unify build --base-url https://example.com/ && npx some-minifier dist/
```

Two things make this safer than it looks:

- **The build is transactional.** A failed build leaves the previous `dist/` untouched, so
  `unify build && deploy` never deploys a half-built site — the `&&` is load-bearing and
  sufficient.
- **`unify audit` never writes.** It runs the whole pipeline, reports on the site the
  build *would* publish, and publishes nothing, so it is safe to run against a working
  tree in CI.

For CI, `--format json` and `--format sarif` are mechanical views of the same findings the
human report shows:

```bash
unify audit --base-url https://example.com/ --format json > findings.json
unify audit --base-url https://example.com/ --format sarif > findings.sarif
```

Every finding carries a stable identifier and a stable fingerprint, so a CI job can
suppress a known one without pattern-matching English. `--strict` turns findings into a
non-zero exit when you want the job to fail on them.

The one flag that touches the network is `unify audit --external`, which fetches the
off-origin URLs your site emits and reports the ones that do not resolve. It is opt-in for
a reason: it makes the command's result depend on somebody else's uptime. Ordinary builds
and ordinary audits never open a socket.

**From a source file to its public address.** unify rewrites links in the HTML pages it
composes, and nothing else. A JSON, XML or Markdown file a generator writes ships as
written, and Markdown that another tool sends somewhere else — a script cross-posting an
article, a newsletter — never passes through unify at all. A tool like that needs each
page's address, and the audit report already maps every one:

```bash
unify audit --pretty-urls --base-url https://example.com/ --format json > audit.json
```

```js
import { readFileSync } from "node:fs";

const { pages } = JSON.parse(readFileSync("audit.json", "utf8"));
const addressOf = new Map(pages.map((p) => [p.source, p.document.url]));
console.log(addressOf.get("news/launch.md")); // https://example.com/news/launch/
```

Each page carries its `source` (relative to the source root), its `outputPath` (relative to
the output directory) and its `document.url`, which is `null` without `--base-url`; then
`document.path` is the root-relative address. That is each page's own address and no more:
rewriting the links inside a document you export, keeping their queries and fragments, and
choosing a canonical for a copy published elsewhere stay the exporter's job.

## 5. A prebuilt package's browser files

Some packages need no toolchain at all: they ship a bundle a browser can load, and all you
need is that file in your output. `node_modules/` is on the never-shipped list, so it
cannot get there by being where it is — and there is no copy flag to name it with. A
generator copies it, which keeps the dependency tracked by your package manager instead of
by whoever last dragged files into `site/`.

Anchor on the package's own `package.json` and join paths from its directory:

```js
// scripts/vendor.mjs — generate: scripts/vendor.mjs in unify.yaml; runs on every build
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const generatedDir = process.argv[3];
const require = createRequire(import.meta.url);

// `<pkg>/package.json` is the one subpath an `exports` map almost always keeps, so this
// reaches files the package does not export — which is most of them — and resolves the
// same under both runtimes unify supports.
const packageRoot = (pkg) => dirname(require.resolve(`${pkg}/package.json`));

const md = packageRoot("markdown-it");

const FILES = [[join(md, "dist/markdown-it.min.js"), "vendor/markdown-it.js"]];

// A whole directory, filtered — a language pack or an icon set is usually this shape.
// Name the extension you want: a published `dist/` is mostly things you do not.
for (const name of readdirSync(join(md, "dist")).sort()) {
  if (!name.endsWith(".min.js")) continue;
  FILES.push([join(md, "dist", name), `vendor/min/${name}`]);
}

for (const [from, target] of FILES) {
  const to = join(generatedDir, target);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
```

Your pages then reference the target paths as ordinary site URLs, because that is what they
now are:

```html
<script src="/vendor/markdown-it.js"></script>
```

**Do not resolve the subpath directly.** `require.resolve("markdown-it/dist/browser/x.js")`
looks simpler and is the trap: a package's `exports` map decides which subpaths are
nameable, most of the files you want are not on it, and the two runtimes disagree about
what to do when they are not — Node raises `ERR_PACKAGE_PATH_NOT_EXPORTED` while Bun
resolves it anyway. A generator written that way builds under the standalone binary and
fails under `npx @fwdslsh/unify`. Resolving `package.json` and joining sidesteps the map
entirely.

**Pick a file the browser can actually execute, and check it yourself.** Packages ship
several builds side by side: a CommonJS one ending in `module.exports = …`, an ESM entry
whose whole body is `import x from "../lib/core.js"`, and somewhere a self-contained
bundle. Only the last one works. unify copies bytes and checks references — it cannot tell
you that a file you vendored throws `module is not defined`, or that it imports a sibling
you did not copy. Open the file and look for a bundle that names no siblings.

**What the build does and does not check.** A `<link href>`, `<script src>` or other URL
attribute naming a file the generator did not write is an unresolved reference and the
build refuses to publish, and so is a `url(...)` inside a vendored stylesheet — which means
a CSS file referencing fonts blocks the build until you vendor those too. Nothing inside a
`.js` file is checked, static `import` and dynamic `import()` alike, and neither is a bare
`@import "…"` in CSS. So one HTML-referenced file is a tripwire for the whole set, and
everything reached from JavaScript is on you.

Four things worth knowing before you run it. **There is one generator per build** —
a second `--generate` is a usage error, so this code goes inside whatever generator you
already have (import it and call it from there). **Delete any hand-vendored copies first**,
or the same output path from both trees is a collision that stops the build. **Install
before you build**: on Node a missing `node_modules` fails the build with a resolution
error, while Bun quietly downloads the package mid-build, so a CI job that skips
`npm ci` either breaks or publishes something nobody pinned. And in `--dry-run` every
vendored file reports its origin as `← generated`, which is how you tell a copied
dependency from a file you wrote.

## What stays outside unify

Plainly, so you can plan around it rather than discover it:

- **Per-page expressions.** There is no expression language, no `{{ }}`, no loops, and no
  conditionals in HTML. Content that varies is content a generator writes, or content you
  write.
- **Internationalization policy.** unify has no locale routing, no translation catalogue,
  and no `hreflang` automation. A multilingual site is directories of pages with an
  ordinary `<link rel="alternate" hreflang>` you author.
- **Application bundling.** unify does not compile, bundle, transpile, minify, tree-shake,
  or fingerprint. Your toolchain does that and unify ships the result.
- **Arbitrary pipelines.** There is no plugin API, no hook system, no task graph, and no
  `--run "<shell command>"`. `--generate` names one file you wrote; everything else is a
  command you type, in the order you typed it. unify's public API (product-spec §5) drives a
  whole build or audit from another program; it does not hook into one.

Each of these is a decision rather than a gap. The seam is the filesystem, in both
directions, and it stays narrow enough to hold in your head.

For the case where the other tool is a whole static-site generator — Eleventy owning
collections, pagination and a data cascade while unify owns every page's composition — see
[the Eleventy + htmx guide](guides/eleventy-htmx.md), worked end to end in
[`examples/eleventy-htmx`](../examples/eleventy-htmx).
