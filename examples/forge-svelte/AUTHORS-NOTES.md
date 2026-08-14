# Report — Thistleknap Forge site

## 1. Files created

- `package.json` — npm manifest; declares the Svelte→browser-JS toolchain (`esbuild`,
  `esbuild-svelte`, `svelte`) and the `build:calculator` / `build:notes` / `publish`
  scripts that make republishing repeatable.
- `package-lock.json` — lockfile from `npm install`, so the toolchain installs identically
  next time.
- `_scripts/build-fee-calculator.mjs` — compiles `components/FeeCalculator.svelte` (the
  volunteer developer's source of truth, left untouched) into a self-contained browser
  bundle. Rerun whenever the `.svelte` file changes.
- `_scripts/fee-calculator-entry.js` — the esbuild entry point: imports the `.svelte`
  component and mounts it at `#fee-calculator`. This is the only file that "wraps" the
  component; the component itself is never edited.
- `_scripts/gen-notes-index.mjs` — a derived-file generator, exactly the shape rules.md
  describes ("a script you write and run yourself"). Reads the frontmatter of every file
  in `src/notes/*.md` and writes `src/notes/index.html`, newest first, so instructors never
  have to hand-maintain the index.
- `src/_layout.html` — the one root layout: doctype, `<head>`, stylesheet, favicon, the
  included header/footer, and the page slot. Every page in the site resolves to this
  layout (no subfolder overrides it).
- `src/_includes/header.html` — header fragment: anvil mark + site nav. Included by the
  layout so it's identical on every page.
- `src/_includes/footer.html` — footer fragment, included by the layout.
- `src/assets/css/site.css` — the site's only stylesheet, hand-written; also styles the
  Svelte component's rendered markup (see §4).
- `src/assets/img/anvil.svg` — placeholder anvil-mark SVG, used as both the header logo
  and the favicon, since no image files were supplied.
- `src/assets/js/fee-calculator.js` — build **output** of `build-fee-calculator.mjs`
  (checked in so the repo always has a working site even before anyone reruns the build);
  the actual file a visitor's browser downloads and runs.
- `src/index.html` — the home page.
- `src/courses.html` — the Courses page: what's taught, the fee-estimator mount point and
  its `<script>` tag, and a link into the notes.
- `src/visit.html` — the Visit page: location, open days, safety rules.
- `src/notes/2026-05-12-forge-basics-recap.md` — course note 1 (plain Markdown, as
  instructors write).
- `src/notes/2026-06-30-tool-care-sharpening.md` — course note 2.
- `src/notes/2026-08-02-heat-treatment-intro.md` — course note 3.
- `src/notes/index.html` — build **output** of `gen-notes-index.mjs`: the generated,
  newest-first notes index.
- `REPORT.md` — this file.

`drafts/rota.md` was left exactly where it was, outside `src/` — the source root — so it
is structurally unreachable by the build, not merely excluded by a naming convention.

## 2. Publish command and verification

Estimator build command (run once per `.svelte` revision):

```
node _scripts/build-fee-calculator.mjs
```

Site publish command (the address is a subdirectory, so pretty URLs and a base URL are
both required):

```
node _scripts/gen-notes-index.mjs && ./unify build --clean --pretty-urls --base-url https://thistleknap.pages.dev/forge/
```

Both are wired into one command for the collective to run on every revision —
`npm run publish` — which runs the calculator build, the notes-index build, and
`unify build` in that order.

Verification performed (no browser was available, so all of this was done by reading the
actual bytes in `dist/`):

1. `./unify build --dry-run --strict` and again with
   `--pretty-urls --base-url https://thistleknap.pages.dev/forge/` — both report zero
   problems and list every page with the layout it resolved to.
2. Ran the real build, then inspected `dist/` directly: every `href`/`src` that unify
   rewrites — nav links, the anvil `<img>`, the favicon `<link>`, the stylesheet, the
   `<script src>` for the calculator, and every internal page link — carries the
   `/forge/` prefix, and every internal page link is the pretty (no `.html`, trailing
   slash) form. Confirmed with `grep` across the whole `dist/` tree, not just spot checks.
3. `diff`'d `src/assets/js/fee-calculator.js` against `dist/assets/js/fee-calculator.js`:
   byte-identical. unify copies JS/CSS byte-for-byte (rules.md says so), so this confirms
   the exact file compiled from the `.svelte` source is what ships to `/forge/assets/js/fee-calculator.js`.
4. `grep -r` for the draft file's private text ("NOT FOR THE WEBSITE", "Aldercott opens
   Saturdays") across `dist/`: no matches.
5. Since there is no browser, I simulated one: temporarily installed `jsdom`, loaded the
   real `dist/courses/index.html`, `eval`'d the real `dist/assets/js/fee-calculator.js`
   in that DOM exactly as a `<script defer>` would, then changed the People/Hours inputs
   and dispatched `input` events. The rendered total recalculated to
   `people × hours × hourlyRate + people × materialsFee` with no navigation — confirming
   the estimator updates live in a real DOM, not just that the bundle is syntactically
   valid. (`node --check` also passed on the bundle.) The `jsdom` dependency and the
   one-off script were removed afterwards; they're not part of the site or the publish
   pipeline.
6. `grep -rn "Thistleknap keeps" dist/` — one match per page, seven pages, seven distinct
   sentences.

## 3. Rules re-read, and what they didn't answer

I re-read **Merging a page into its layout** several times to decide I didn't need a
named `slot="footer"` — the brief only asks for one shared footer, no per-page override,
so the layout's own static `<footer>` (via `<include>`) is enough and nothing needed to
fill a slot.

I re-read **Files** trying to decide whether `_includes/header.html` and `footer.html`
needed the `.fragment.html` suffix. The unclear sentence:

> Every file is valid standalone HTML: pages and layouts are complete `<!doctype html>`
> documents, fragments are balanced snippets.

This states what pages vs. fragments must look like, but not how a `.html` file used only
as an `<include>` target, sitting inside an already-excluded `_` directory, gets
classified in the first place — is it a "page" that must be doctype-complete, or a
fragment because it's never emitted? Rules.md doesn't say. I resolved it empirically
rather than guessing: I ran `./unify init` in a scratch directory to see the tool's own
reference scaffold, which ships `_includes/nav.html` as a bare `<nav>…</nav>` snippet with
no `.fragment.html` suffix, and it builds cleanly. So a file under a `_` directory is
never treated as a standalone page needing a doctype — only files that would otherwise be
built as pages need the `.fragment.html` marker. I followed that precedent for both
includes.

Nothing else required a decision the rules left silent on on a second read — the Markdown,
`--base-url`/`--pretty-urls`, and layout-merge sections were unambiguous once tested
against a real build.

## 4. Things I was unsure were legal

- **Reusing the Svelte component's own CSS class for site-wide styling.** Rules.md says
  "unify never scopes, rewrites, or injects CSS/JS" and "scope fragment styles yourself."
  I wasn't sure whether targeting `.fee-calc` (a class baked into the component's own
  markup) from `site.css` counted as the kind of unscoped collision that sentence warns
  against. I checked the compiled bundle directly: `FeeCalculator.svelte` has no `<style>`
  block, so Svelte's compiler adds no scoping hash to `.fee-calc` — it ships as a plain,
  stable class. Styling it globally is no different from styling any other class unify
  ships untouched, so I kept it, and confirmed by reading the actual compiled output
  rather than assuming.
- **Custom Markdown frontmatter keys (`date`, `instructor`).** Rules.md says only
  `title`/`layout`/`class`/`lang`/`dir` have meaning and "every other becomes
  `<meta name=…>`" — legal, but I didn't want the notes index to *depend* on unify's
  interpretation of an unofficial key. So `gen-notes-index.mjs` parses the raw
  frontmatter itself, straight from the source `.md` files, and only incidentally lets
  unify emit the same values as harmless `<meta>` tags in the built page.
- **Home link as `/` rather than a filename.** The rule "always link the real filename —
  `/about.html`, never `/about/`" doesn't mention the index page's own case. I followed
  the tool's own scaffold, which links home as `href="/"`, and confirmed in a dry run that
  `/` does resolve to `index.html`/(`/forge/` under pretty-urls).

## 5. Things I wanted the tool to tell me and it didn't

- `--dry-run --strict` prints "would publish N files" but never says "0 advisories" or
  otherwise confirms a clean bill of health beyond the absence of any listed problem —
  I never triggered an advisory, so I still don't know what one looks like or how it's
  distinguished from a hard error in the output.
- No confirmation that every `<include>` target resolved or that a `slot=` fill actually
  matched a named slot in the layout (I have no named slots, so this never came up, but a
  positive "N includes resolved, N slots filled" line would have been reassuring rather
  than inferring correctness from the absence of an error).
- No indication of whether two pages could collide on the same pretty URL — never
  happened here, so I don't know if it's caught at build time or would silently overwrite.

## 6. Outside documentation

NO
