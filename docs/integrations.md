# Integrating compiled components: the compile-to-asset pattern

**Role**: The recipe for using a component framework — Svelte here, but the shape is the
same for anything with a compiler — on a unify site, without adopting a framework for the
site. unify needs to know nothing about the framework, and that is the design: you compile
the component to an ordinary JavaScript file *before* `unify build`, and unify ships it
like any other asset. Every literal in this document is tested; the worked example is
`examples/forge-svelte`. (That example pins Svelte 4 and uses its component API —
`new Component({ target })` — while the recipe below targets Svelte 5's `mount()`;
the three-file shape is identical in both.)

## The contract, in four lines

- A compiled bundle is an **ordinary asset**: mirror-copied byte-for-byte, referenced by an
  ordinary `<script src>` that `--base-url`/`--pretty-urls` rewrite like any link.
- `node_modules/` in the source root **never ships** — it is on the never-shipped list
  (conformance spec §4.3) — so `npm install` beside your pages is safe by design.
- Your build script lives under `_scripts/` (the underscore keeps it out of the output) and
  runs **before** unify, by you: `node _scripts/build-components.mjs && unify build`.
- URLs *inside* your component's JavaScript ship as written — unify rewrites HTML, never
  JS — so a component that fetches must build addresses relative to the page, or read them
  back from an `href` unify rewrote (`docs/authoring-rules.md`, Styles/scripts).

## The Svelte recipe

The component — say `components/FeeCalculator.svelte`, maintained by whoever writes your
Svelte — needs three small files and two commands. Once:

```bash
npm install svelte esbuild esbuild-svelte
```

`_scripts/estimator-entry.js` — mounts the component onto the element your page provides:

```js
import { mount } from "svelte";
import FeeCalculator from "../components/FeeCalculator.svelte";

mount(FeeCalculator, { target: document.getElementById("estimator") });
```

`_scripts/build-components.mjs` — compiles and bundles to one plain file in the source
tree:

```js
import esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";

await esbuild.build({
  entryPoints: ["_scripts/estimator-entry.js"],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: "src/assets/estimator.js",
  plugins: [sveltePlugin()],
});
console.log("built src/assets/estimator.js");
```

On the page that hosts it:

```html
<div id="estimator"></div>
<script src="/assets/estimator.js"></script>
```

And the repeatable build is one line:

```bash
node _scripts/build-components.mjs && unify build
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
3. Look for the change in the emitted file: `grep "visible line" src/assets/estimator.js`.

If a value change propagates but a markup change does not, the pipeline is a counterfeit —
something is extracting numbers instead of compiling. (In the experiment that produced
this document, two of six independent builds were exactly that, one of them importing the
real compiler and never calling it.)

## The same shape for anything else

TypeScript, JSX, Sass — identical pattern: compiler runs under `_scripts/`, output lands
in the source tree as an ordinary file, unify ships it untouched. unify will never run
`npm` for you, watch your components, or rewrite your bundle: one tool composes HTML, your
toolchain makes assets, and the seam between them is the filesystem.

---

## Four recipes

The pattern above runs your toolchain *beside* unify, by you. The four recipes below are
the common variations, and the first of them is the only place unify reaches out at all.

## 1. The generator context: what `--generate` hands you

`unify build --generate _scripts/gen.mjs` runs one file you wrote, before it scans
anything. The whole interface is two positional arguments:

```js
const [, , sourceRoot, generatedDir] = process.argv;
```

`sourceRoot` is the absolute path of your source tree; `generatedDir` is an absolute path
to an empty directory that exists only for this build. Files you write into
`generatedDir` join the build as an overlay — scanned, composed, checked, and published
exactly like files in `src/`. Files you write anywhere else are your own business, and
unify neither collects them nor notices them.

There is nothing to import. A complete generator is this:

```js
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , sourceRoot, generatedDir] = process.argv;
mkdirSync(generatedDir, { recursive: true });
writeFileSync(
  join(generatedDir, "credits.html"),
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Credits</title><meta name="description" content="Who built this."></head>
<body><h1>Credits</h1><p>Built from ${sourceRoot}.</p></body>
</html>
`,
);
```

Four properties are worth knowing before you write a longer one:

- **The working directory is the source root**, so `readFileSync("_data/authors.json")`
  means what you would expect from reading the source tree.
- **The runtime is unify's own.** The standalone binary carries it: `--generate` works
  on a machine with no Node installed, which is the point of the flag existing at all.
- **It runs on every build**, including every rebuild under `unify watch` and `unify dev`.
  That is deliberate — a generator that ran once would leave watch output stale while the
  build reported success — but it means an expensive generator makes every keystroke
  expensive. See recipe 3 for the fix.
- **Its failure is a build failure.** A non-zero exit is a located problem, nothing
  publishes, and the previous `dist/` is untouched.

The `blog` template ships this worked: `unify init blog` writes a `_scripts/gen.mjs` that
reads `posts/*.md` and `_data/authors.json` and regenerates the index and the feed.

## 2. Image optimization

unify copies every non-page file byte-for-byte, so a 4 MB photograph in your source tree
is a 4 MB photograph on your site. unify will not resize it, re-encode it, or generate
derivatives — that is a job with real decisions in it (which sizes, which formats, what
quality), and a tool that guessed would guess wrong quietly.

Run a real image tool, and run it where its output is cached. The shape that works:
originals live outside the published tree under an underscore, derivatives land in it.

```js
// _scripts/images.mjs — run by --generate, or by hand before unify build
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

`_originals/` is excluded by the default `_*` glob, so the masters never publish; the
derivatives sit in `assets/img/` and ship like any other file. Reference them with an
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
// _scripts/pull-cms.mjs — run by hand: node _scripts/pull-cms.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const res = await fetch("https://cms.example/api/posts");
if (!res.ok) throw new Error(`CMS returned ${res.status}`);
mkdirSync("_cms", { recursive: true });
writeFileSync("_cms/posts.json", JSON.stringify(await res.json(), null, 2));
```

The generator only reads what the fetch left on disk, so it is offline, fast, and
deterministic:

```js
// _scripts/gen.mjs — run by --generate on every build
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

Commit `_cms/posts.json`. It is excluded from the output by the default `_*` glob, it
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
