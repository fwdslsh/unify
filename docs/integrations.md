# Integrating compiled components: the compile-to-asset pattern

**Status**: v0.7.0
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
